const crypto = require('crypto');

const { createGoogleDriveClient } = require('../googleDriveClient');
const { createGoogleGmailClient } = require('../googleGmailClient');
const { columnName, createGoogleSheetsClient, escapeSheetName } = require('../googleSheetsClient');
const { buildRecordVisibilityContext, matchesWhenClause } = require('./updateRecordDependencies');

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const QUEUE_SHEET_NAME = '__CK_ANALYTICS_PIPELINE_QUEUE';
const QUEUE_HEADERS = [
  'Job ID',
  'Owner Form Key',
  'Pipeline ID',
  'Start Date',
  'Queued At (ISO)',
  'Status',
  'Processed At (ISO)',
  'Message',
  'Summary JSON'
];
const DEFAULT_QUEUED_NOTICE = "Report request sent. We'll email it to the Operations Manager.";
const REPORT_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REPORT_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeToIsoDate = value => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = value.toString().trim();
  if (!raw) return '';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
};

const todayIso = env => {
  const timeZone = toText(env.CK_TIMEZONE || env.TZ) || 'Europe/Brussels';
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    // Fall through to UTC.
  }
  return new Date().toISOString().slice(0, 10);
};

const resolveDisplayText = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value !== 'object') return `${value ?? ''}`.trim() || fallback;
  return (
    toText(value.en) ||
    toText(value.EN) ||
    toText(value.fr) ||
    toText(value.FR) ||
    toText(value.nl) ||
    toText(value.NL) ||
    Object.values(value).map(toText).find(Boolean) ||
    fallback
  );
};

const normalizeStatusToken = value => toText(value).toLowerCase();

const normalizeStringList = value =>
  (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value])
    .map(toText)
    .filter(Boolean);

const normalizePathList = value =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split('.') : [])
    .map(toText)
    .filter(Boolean);

const parseLineItemRows = raw => {
  if (Array.isArray(raw)) return raw.filter(entry => entry && typeof entry === 'object');
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
};

const toNumber = raw => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const text = raw.toString().trim();
  if (!text) return null;
  const direct = Number(text.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(direct) ? direct : null;
};

const replaceTemplateTokens = (template, placeholders) =>
  (template || '').toString().replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, token) => placeholders[`{{${token}}}`] ?? '');

const parseIsoDateParts = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toText(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, monthIndex: month - 1, day };
};

const formatReportDateToken = value => {
  const text = toText(value);
  const parts = parseIsoDateParts(text);
  if (!parts) return text;
  const date = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  return `${REPORT_WEEKDAY_LABELS[date.getUTCDay()]},${`${parts.day}`.padStart(2, '0')}-${REPORT_MONTH_LABELS[parts.monthIndex]}-${parts.year}`;
};

const buildReportPlaceholders = args => ({
  '{{PIPELINE_TITLE}}': args.title,
  '{{START_DATE}}': formatReportDateToken(args.startDate),
  '{{END_DATE}}': formatReportDateToken(args.endDate),
  '{{START_DATE_ISO}}': args.startDate,
  '{{END_DATE_ISO}}': args.endDate,
  '{{RECORD_COUNT}}': `${args.recordCount}`,
  '{{ROW_COUNT}}': `${args.rowCount}`,
  '{{ATTACHMENT_NAME}}': args.attachmentName || '',
  '{{SOURCE_FORM}}': args.sourceForm || ''
});

const isTablespoonUnit = unit => {
  const normalized = toText(unit).toLowerCase();
  return normalized === 'tbsp' || normalized === 'tablespoon' || normalized === 'tablespoons';
};

const isGramUnit = unit => {
  const normalized = toText(unit).toLowerCase();
  return normalized === 'gr' || normalized === 'g' || normalized === 'gram' || normalized === 'grams';
};

const normalizeIngredientUsageQuantity = args => {
  let quantity = args.quantity;
  let unit = toText(args.unit);
  if (isTablespoonUnit(unit)) {
    const gramsPerTablespoon = args.tablespoonGrams;
    if (typeof gramsPerTablespoon === 'number' && Number.isFinite(gramsPerTablespoon) && gramsPerTablespoon > 0) {
      quantity *= gramsPerTablespoon;
      unit = 'gr';
    }
  }
  if (isGramUnit(unit) && quantity > 1000) {
    quantity /= 1000;
    unit = 'kg';
  }
  return {
    quantity: Math.round(quantity * 1000000) / 1000000,
    unit
  };
};

const isMissingSheetError = err => /Unable to parse range|Google Sheets tab not found|not found|does not exist/i.test(toText(err && err.message));

const buildRowContext = ({ row, groupKey, parentValues, topCtx }) => {
  const rowValues = row && row.values ? row.values : row || {};
  const scopedPrefix = groupKey ? `${groupKey}__` : '';
  const getValue = fieldIdRaw => {
    const fieldId = (fieldIdRaw || '').toString();
    const localId = scopedPrefix && fieldId.startsWith(scopedPrefix) ? fieldId.slice(scopedPrefix.length) : fieldId;
    if (Object.prototype.hasOwnProperty.call(rowValues, localId)) return rowValues[localId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, localId)) return parentValues[localId];
    if (Object.prototype.hasOwnProperty.call(rowValues, fieldId)) return rowValues[fieldId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return parentValues[fieldId];
    return topCtx.getValue(fieldId);
  };
  return {
    getValue,
    getLineValue: (_rowId, fieldId) => getValue(fieldId),
    getLineItems: topCtx.getLineItems,
    getLineItemKeys: topCtx.getLineItemKeys
  };
};

class AnalyticsPipelineRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.configRepository = options.configRepository;
    this.submissionRepository = options.submissionRepository;
    this.dataSourceRepository = options.dataSourceRepository;
    this.fileRepository = options.fileRepository;
    this.sheetsClient = options.sheetsClient || createGoogleSheetsClient(options);
    this.driveClient = options.driveClient || createGoogleDriveClient(options);
    this.gmailClient = options.gmailClient || createGoogleGmailClient(options);
    this.dataSourceDetailsCache = new Map();
  }

  getSpreadsheetId() {
    return toText(this.env.CK_DEFAULT_SPREADSHEET_ID || this.env.CK_GOOGLE_SHEETS_SPREADSHEET_ID || this.env.CK_SPREADSHEET_ID);
  }

  listEntries() {
    if (!this.configRepository || typeof this.configRepository.listConfigs !== 'function') return [];
    return this.configRepository
      .listConfigs()
      .map(config => {
        const form = (config && config.form) || {};
        const definition = (config && config.definition) || {};
        const formKey = toText((config && config.formKey) || form.configSheet || form.title);
        return formKey ? { config, form, definition, formKey } : null;
      })
      .filter(Boolean);
  }

  findEntry(formKey) {
    const requested = toText(formKey).toLowerCase();
    if (!requested) return null;
    return (
      this.listEntries().find(entry =>
        [entry.formKey, entry.form.configSheet, entry.form.title, entry.config && entry.config.title]
          .map(value => toText(value).toLowerCase())
          .filter(Boolean)
          .includes(requested)
      ) || null
    );
  }

  getPipelineContext(ownerFormKey, pipelineId) {
    const ownerEntry = this.findEntry(ownerFormKey);
    if (!ownerEntry) return null;
    const analytics = ownerEntry.form.analytics || ownerEntry.definition.analytics || {};
    const pipeline = (Array.isArray(analytics.pipelines) ? analytics.pipelines : []).find(item => toText(item && item.id) === toText(pipelineId));
    if (!pipeline) return null;
    const sourceFormKey = toText(pipeline.sourceFormKey) || ownerEntry.formKey;
    const sourceEntry = this.findEntry(sourceFormKey);
    if (!sourceEntry) return null;
    const questions = Array.isArray(sourceEntry.config.questions) && sourceEntry.config.questions.length
      ? sourceEntry.config.questions
      : Array.isArray(sourceEntry.definition.questions)
        ? sourceEntry.definition.questions
        : [];
    return {
      ownerEntry,
      sourceEntry,
      ownerForm: ownerEntry.form,
      sourceForm: sourceEntry.form,
      sourceQuestions: questions,
      pipeline
    };
  }

  queuedNotice(pipeline) {
    return resolveDisplayText(pipeline && pipeline.ui && pipeline.ui.queuedNotice, DEFAULT_QUEUED_NOTICE);
  }

  ensureGmailConfigured() {
    if (this.gmailClient && typeof this.gmailClient.isConfigured === 'function' && this.gmailClient.isConfigured()) return;
    throw new Error('Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.');
  }

  async ensureQueueSheet() {
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for analytics pipeline queue writes.');
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(spreadsheetId, QUEUE_SHEET_NAME);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      if (typeof this.sheetsClient.addSheet !== 'function') throw err;
      await this.sheetsClient.addSheet(spreadsheetId, QUEUE_SHEET_NAME, { hidden: true });
      rows = [];
    }
    const headers = (rows[0] || []).map(toText);
    const needsHeader = headers.length < QUEUE_HEADERS.length || QUEUE_HEADERS.some((header, index) => headers[index] !== header);
    if (needsHeader) {
      await this.sheetsClient.updateRowValues(spreadsheetId, QUEUE_SHEET_NAME, 1, QUEUE_HEADERS);
      rows[0] = QUEUE_HEADERS;
    }
    return { spreadsheetId, rows };
  }

  async queueAnalyticsPipelineRun(request) {
    const ownerFormKey = toText(request && request.ownerFormKey);
    const pipelineId = toText(request && request.pipelineId);
    const startDate = normalizeToIsoDate(request && request.startDate);
    if (!ownerFormKey || !pipelineId || !startDate) return { success: false, message: 'Invalid analytics pipeline request.' };
    if (startDate > todayIso(this.env)) return { success: false, message: 'The selected date must be today or earlier.' };
    const context = this.getPipelineContext(ownerFormKey, pipelineId);
    if (!context) return { success: false, message: `Unknown analytics pipeline: ${ownerFormKey} / ${pipelineId}` };
    this.ensureGmailConfigured();

    const { spreadsheetId } = await this.ensureQueueSheet();
    const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    await this.sheetsClient.appendRows(spreadsheetId, QUEUE_SHEET_NAME, [
      [jobId, ownerFormKey, pipelineId, startDate, new Date().toISOString(), 'pending', '', '', '']
    ]);
    return { success: true, message: this.queuedNotice(context.pipeline), jobId };
  }

  queueRowToJob(row, index) {
    return {
      rowNumber: index + 1,
      id: toText(row[0]),
      ownerFormKey: toText(row[1]),
      pipelineId: toText(row[2]),
      startDate: normalizeToIsoDate(row[3]),
      queuedAt: toText(row[4]),
      status: toText(row[5]).toLowerCase()
    };
  }

  async updateQueueRow(spreadsheetId, rowNumber, status, message, summary) {
    const row = new Array(QUEUE_HEADERS.length).fill('');
    row[5] = status;
    row[6] = new Date().toISOString();
    row[7] = toText(message);
    row[8] = summary ? JSON.stringify(summary) : '';
    const currentRows = await this.sheetsClient.getSheetValues(spreadsheetId, QUEUE_SHEET_NAME);
    const existing = currentRows[rowNumber - 1] || [];
    const next = existing.slice();
    while (next.length < QUEUE_HEADERS.length) next.push('');
    [5, 6, 7, 8].forEach(index => {
      next[index] = row[index];
    });
    await this.sheetsClient.updateRowValues(spreadsheetId, QUEUE_SHEET_NAME, rowNumber, next);
  }

  async runQueuedAnalyticsPipelineJobs(options = {}) {
    this.ensureGmailConfigured();
    const { spreadsheetId, rows } = await this.ensureQueueSheet();
    const limit = Math.max(1, Math.min(Number(options.limit || this.env.CK_ANALYTICS_QUEUE_BATCH_SIZE || 10) || 10, 50));
    const pending = rows
      .slice(1)
      .map((row, index) => this.queueRowToJob(row, index + 1))
      .filter(job => job.id && job.ownerFormKey && job.pipelineId && job.startDate && (!job.status || job.status === 'pending'))
      .slice(0, limit);

    const errors = [];
    let processed = 0;
    for (const job of pending) {
      await this.updateQueueRow(spreadsheetId, job.rowNumber, 'running', '', null);
      try {
        const result = await this.runPipelineById(job.ownerFormKey, job.pipelineId, job.startDate);
        if (!result.success) throw new Error(result.message || 'Analytics pipeline execution failed.');
        await this.updateQueueRow(spreadsheetId, job.rowNumber, 'done', result.message || 'Sent.', result.summary || null);
        processed += 1;
      } catch (err) {
        const message = toText(err && err.message) || 'Unknown analytics pipeline error.';
        errors.push(`${job.ownerFormKey}/${job.pipelineId}: ${message}`);
        await this.updateQueueRow(spreadsheetId, job.rowNumber, 'error', message, null);
      }
    }

    return {
      success: errors.length === 0,
      processed,
      errors
    };
  }

  async runPipelineById(ownerFormKey, pipelineId, startDateRaw) {
    const context = this.getPipelineContext(ownerFormKey, pipelineId);
    if (!context) return { success: false, message: `Unknown analytics pipeline: ${ownerFormKey} / ${pipelineId}` };
    return this.runPipeline({
      ownerForm: context.ownerForm,
      sourceForm: context.sourceForm,
      sourceQuestions: context.sourceQuestions,
      pipeline: context.pipeline,
      startDate: startDateRaw
    });
  }

  async runPipeline(args) {
    const startDate = normalizeToIsoDate(args.startDate);
    const endDate = todayIso(this.env);
    if (!startDate || !endDate) return { success: false, message: 'Invalid date range.' };
    if (startDate > endDate) return { success: false, message: 'Start date must be today or earlier.' };

    const built = await (async () => {
      if (args.pipeline.type === 'ingredientUsageReport') {
        const aggregation = await this.aggregateIngredientUsage({
          form: args.sourceForm,
          questions: args.sourceQuestions,
          pipeline: args.pipeline,
          startDate,
          endDate
        });
        return {
          recordCount: aggregation.recordCount,
          rowCount: aggregation.rows.length,
          values: [
            ['Ingredients', 'Quantity', 'Unit', 'Category'],
            ...aggregation.rows.map(row => [row.ingredient, row.quantity, row.unit, row.category])
          ],
          defaultSheetName: 'Ingredients'
        };
      }
      if (args.pipeline.type === 'recordTableReport') {
        const records = await this.loadAllRecords(args.sourceForm);
        const aggregation = this.aggregateRecordTable({
          form: args.sourceForm,
          questions: args.sourceQuestions,
          pipeline: args.pipeline,
          startDate,
          endDate,
          records
        });
        return {
          recordCount: aggregation.recordCount,
          rowCount: aggregation.rows.length,
          values: [aggregation.headers, ...aggregation.rows],
          defaultSheetName: 'Report'
        };
      }
      return null;
    })();

    if (!built) return { success: false, message: `Unsupported report pipeline type: ${args.pipeline.type}` };
    const artifact = await this.buildSpreadsheetArtifact({
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      values: built.values,
      startDate,
      endDate,
      recordCount: built.recordCount,
      rowCount: built.rowCount,
      defaultSheetName: built.defaultSheetName
    });
    await this.sendPipelineEmail({
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      artifact,
      startDate,
      endDate,
      recordCount: built.recordCount,
      rowCount: built.rowCount
    });
    return {
      success: true,
      message: 'Report sent.',
      summary: {
        startDate,
        endDate,
        recordCount: built.recordCount,
        rowCount: built.rowCount,
        attachmentName: artifact.fileName,
        attachmentFileId: artifact.fileId,
        attachmentUrl: artifact.url
      }
    };
  }

  async loadAllRecords(form) {
    if (!this.submissionRepository || typeof this.submissionRepository.records !== 'function') {
      throw new Error('Submission repository is not configured.');
    }
    return this.submissionRepository.records(toText(form.configSheet || form.title));
  }

  resolveRecordStatus(record, statusFieldIdRaw) {
    const statusFieldId = toText(statusFieldIdRaw);
    if (statusFieldId) {
      const fromValues = (record.values || {})[statusFieldId];
      if (fromValues !== undefined && fromValues !== null && fromValues !== '') return toText(fromValues);
      if (statusFieldId.toLowerCase() === 'status') return toText(record.status);
    }
    return toText(record.status);
  }

  resolveClosedStatuses(form, pipeline) {
    const explicit = Array.isArray(pipeline.report && pipeline.report.closedStatuses) ? pipeline.report.closedStatuses : [];
    const normalized = explicit.map(normalizeStatusToken).filter(Boolean);
    if (normalized.length) return Array.from(new Set(normalized));
    const followupClosed = normalizeStatusToken(form.followupConfig && form.followupConfig.statusTransitions && form.followupConfig.statusTransitions.onClose);
    return [followupClosed || 'closed'];
  }

  findNestedFieldConfig(questions, rootGroupId, subGroupPath, fieldId) {
    const root = (questions || []).find(question => question && question.id === rootGroupId && question.type === 'LINE_ITEM_GROUP');
    if (!root) return null;
    let current = root.lineItemConfig;
    for (const subGroupId of subGroupPath || []) {
      const next = (current && current.subGroups || []).find(entry => entry && entry.id === subGroupId);
      if (!next) return null;
      current = next;
    }
    return (current && current.fields || []).find(field => field && field.id === fieldId) || null;
  }

  async lookupDataSourceDetails(question, selectedValue, language) {
    if (!question || !question.dataSource || !selectedValue || !this.dataSourceRepository) return null;
    const ds = question.dataSource;
    const cacheKey = JSON.stringify({ id: toText(ds.id), sheetId: toText(ds.sheetId), tabName: toText(ds.tabName), language: toText(language) || 'EN' });
    if (!this.dataSourceDetailsCache.has(cacheKey)) {
      const items = [];
      let pageToken;
      let pageCount = 0;
      do {
        const detailsConfig = { ...ds, projection: undefined, mapping: undefined };
        const page = await this.dataSourceRepository.fetchDataSource(detailsConfig, language || 'EN', undefined, Math.max(1, Math.min(Number(ds.limit) || 500, 500)), pageToken);
        items.push(...(Array.isArray(page && page.items) ? page.items.filter(item => item && typeof item === 'object') : []));
        pageToken = page && page.nextPageToken;
        pageCount += 1;
      } while (pageToken && pageCount < 20 && items.length < 10000);
      this.dataSourceDetailsCache.set(cacheKey, items);
    }
    const normalized = toText(selectedValue).toLowerCase();
    const items = this.dataSourceDetailsCache.get(cacheKey) || [];
    const lookupFields = Array.from(
      new Set([
        ...Object.entries(ds.mapping || {}).filter(([, target]) => target === 'value' || target === 'id').map(([source]) => source),
        ...(Array.isArray(ds.projection) && ds.projection.length ? [ds.projection[0]] : []),
        'value'
      ].map(toText).filter(Boolean))
    );
    const matched = items.find(item => {
      const field = lookupFields.find(name => item[name] !== undefined && item[name] !== null);
      if (field && toText(item[field]).toLowerCase() === normalized) return true;
      return Object.values(item).some(value => toText(value).toLowerCase() === normalized);
    });
    if (!matched) return null;
    const details = {};
    Object.entries(matched).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      details[key.split(/\s+/).join('_').toUpperCase()] = toText(value);
    });
    return details;
  }

  async aggregateIngredientUsage(args) {
    const records = await this.loadAllRecords(args.form);
    const includedPrepTypes = new Set(
      (Array.isArray(args.pipeline.report.prepTypeValues) && args.pipeline.report.prepTypeValues.length ? args.pipeline.report.prepTypeValues : ['Cook'])
        .map(value => toText(value).toLowerCase())
        .filter(Boolean)
    );
    const closedStatuses = new Set(this.resolveClosedStatuses(args.form, args.pipeline));
    const ingredientFieldConfig = this.findNestedFieldConfig(
      args.questions,
      args.pipeline.report.mealGroupId,
      [args.pipeline.report.prepGroupId, args.pipeline.report.ingredientGroupId],
      args.pipeline.report.ingredientFieldId
    );
    const grouped = new Map();
    let recordCount = 0;

    for (const record of records) {
      const status = normalizeStatusToken(this.resolveRecordStatus(record, args.pipeline.report.statusFieldId));
      if (!closedStatuses.has(status)) continue;
      const recordDate = normalizeToIsoDate((record.values || {})[args.pipeline.report.dateFieldId]);
      if (!recordDate || recordDate < args.startDate || recordDate > args.endDate) continue;
      recordCount += 1;
      for (const mealRow of parseLineItemRows((record.values || {})[args.pipeline.report.mealGroupId])) {
        for (const prepRow of parseLineItemRows(mealRow[args.pipeline.report.prepGroupId])) {
          const prepType = toText(prepRow[args.pipeline.report.prepTypeFieldId]).toLowerCase();
          if (!includedPrepTypes.has(prepType)) continue;
          for (const ingredientRow of parseLineItemRows(prepRow[args.pipeline.report.ingredientGroupId])) {
            const ingredient = toText(ingredientRow[args.pipeline.report.ingredientFieldId]);
            const unit = toText(ingredientRow[args.pipeline.report.unitFieldId]);
            const quantity = toNumber(ingredientRow[args.pipeline.report.quantityFieldId]);
            if (!ingredient || !unit || quantity === null) continue;
            const details = ingredientFieldConfig && ingredientFieldConfig.dataSource
              ? await this.lookupDataSourceDetails(ingredientFieldConfig, ingredient, record.language || 'EN')
              : null;
            const category =
              (args.pipeline.report.categoryFieldId ? ingredientRow[args.pipeline.report.categoryFieldId] : undefined) ||
              (args.pipeline.report.categoryLookupColumn && details ? details[args.pipeline.report.categoryLookupColumn.toUpperCase()] : undefined) ||
              '';
            const tablespoonGrams =
              (args.pipeline.report.tablespoonGramsFieldId ? toNumber(ingredientRow[args.pipeline.report.tablespoonGramsFieldId]) : null) ??
              (args.pipeline.report.tablespoonGramsLookupColumn && details
                ? toNumber(details[args.pipeline.report.tablespoonGramsLookupColumn.toUpperCase()])
                : null);
            const normalized = normalizeIngredientUsageQuantity({ quantity, unit, tablespoonGrams });
            const key = `${ingredient.toLowerCase()}::${normalized.unit.toLowerCase()}`;
            const current = grouped.get(key) || { ingredient, unit: normalized.unit, quantity: 0, category: '' };
            current.quantity += normalized.quantity;
            if (!current.category && category) current.category = toText(category);
            grouped.set(key, current);
          }
        }
      }
    }

    return {
      rows: Array.from(grouped.values()).sort((left, right) => left.ingredient.localeCompare(right.ingredient) || left.unit.localeCompare(right.unit)),
      recordCount
    };
  }

  collectLineItemRowsFromContainer(container, groupId, subGroupPath = []) {
    const rootRows = parseLineItemRows((container || {})[groupId] || (container || {})[`${groupId}_json`]);
    if (!subGroupPath.length) return rootRows.map(row => ({ row, groupKey: groupId }));
    const collect = (rows, path, parentValues, groupKey) => {
      if (!path.length) return rows.map(row => ({ row, parentValues, groupKey }));
      const [nextGroupId, ...rest] = path;
      return rows.flatMap(row => collect(parseLineItemRows(row[nextGroupId] || row[`${nextGroupId}_json`]), rest, row, nextGroupId));
    };
    return collect(rootRows, subGroupPath, undefined, groupId);
  }

  aggregateRecordTable(args) {
    const report = args.pipeline.report || {};
    const columns = Array.isArray(report.columns) ? report.columns : [];
    const headers = columns.map(column => this.resolveRecordTableColumnHeader({ report, questions: args.questions, column }));
    const includeStatuses = new Set(normalizeStringList(report.includeStatuses).map(normalizeStatusToken));
    const excludeStatuses = new Set(normalizeStringList(report.excludeStatuses).map(normalizeStatusToken));
    const contexts = [];
    const expectedKeys = new Set();
    let recordCount = 0;
    const records = Array.isArray(args.records) ? args.records : [];
    records.forEach(record => {
      const recordDate = normalizeToIsoDate((record.values || {})[report.dateFieldId]);
      if (!recordDate || recordDate < args.startDate || recordDate > args.endDate) return;
      const status = normalizeStatusToken(this.resolveRecordStatus(record, report.statusFieldId));
      if (includeStatuses.size && !includeStatuses.has(status)) return;
      if (excludeStatuses.size && excludeStatuses.has(status)) return;
      const { ctx: topCtx } = buildRecordVisibilityContext(record, args.questions);
      if (report.when && !matchesWhenClause(report.when, topCtx, { now: new Date() })) return;
      const collected = this.collectRecordTableContexts({ record, questions: args.questions, report, topCtx });
      if (!collected.length) return;
      recordCount += 1;
      collected.forEach(context => {
        contexts.push(context);
        const expectedKey = this.resolveExpectedRecordKey(report, context.record);
        if (expectedKey) expectedKeys.add(expectedKey);
      });
    });
    this.appendExpectedRecordTableRows({
      contexts,
      expectedKeys,
      report,
      questions: args.questions,
      sourceFormKey: toText(args.form.configSheet || args.form.title),
      startDate: args.startDate,
      endDate: args.endDate
    });
    contexts.sort((left, right) => this.compareRecordTableContexts(report, left, right));
    return {
      headers: headers.length ? headers : ['Report'],
      rows: contexts.map(context => columns.map(column => this.resolveRecordTableColumnValue(report, context, column))),
      recordCount
    };
  }

  collectRecordTableContexts(args) {
    const lineItem = args.report.lineItem;
    if (!lineItem || !lineItem.groupId) return [{ record: args.record, questions: args.questions, topCtx: args.topCtx }];
    return this.collectLineItemRowsFromContainer(args.record.values || {}, lineItem.groupId, normalizePathList(lineItem.subGroupPath))
      .filter(entry => this.matchesRecordTableLineItemFilter({ entry, lineItem, topCtx: args.topCtx }))
      .map(entry => ({ record: args.record, questions: args.questions, topCtx: args.topCtx, row: entry.row, parentValues: entry.parentValues, groupKey: entry.groupKey }));
  }

  matchesRecordTableLineItemFilter(args) {
    const rowCtx = buildRowContext({ row: args.entry.row, groupKey: args.entry.groupKey, parentValues: args.entry.parentValues, topCtx: args.topCtx });
    if (args.lineItem.includeWhen && !matchesWhenClause(args.lineItem.includeWhen, rowCtx, { now: new Date() })) return false;
    if (args.lineItem.excludeWhen && matchesWhenClause(args.lineItem.excludeWhen, rowCtx, { now: new Date() })) return false;
    return true;
  }

  resolveExpectedRecordKey(report, record) {
    const keyFields = normalizeStringList(report.expectedRows && report.expectedRows.keyFields);
    return keyFields.length ? keyFields.map(fieldId => this.stringifyRecordTableCell(this.resolveRecordFieldValue(record, fieldId))).join('::') : '';
  }

  appendExpectedRecordTableRows(args) {
    const expected = args.report.expectedRows;
    const dailyRows = Array.isArray(expected && expected.daily) ? expected.daily : [];
    const keyFields = normalizeStringList(expected && expected.keyFields);
    if (!dailyRows.length || !keyFields.length) return;
    const maxDays = Math.max(1, Math.min(750, Number(expected && expected.maxDays || 370) || 370));
    const cursor = new Date(`${args.startDate}T00:00:00Z`);
    const end = new Date(`${args.endDate}T00:00:00Z`);
    let dayCount = 0;
    while (cursor <= end && dayCount < maxDays) {
      const dateIso = cursor.toISOString().slice(0, 10);
      dailyRows.forEach(template => {
        const values = { ...(template || {}), [args.report.dateFieldId]: dateIso };
        const key = keyFields.map(fieldId => this.stringifyRecordTableCell(values[fieldId])).join('::');
        if (!key || args.expectedKeys.has(key)) return;
        args.expectedKeys.add(key);
        const record = { formKey: args.sourceFormKey, language: 'EN', status: '', values };
        const { ctx: topCtx } = buildRecordVisibilityContext(record, args.questions);
        args.contexts.push({ record, questions: args.questions, topCtx, syntheticMissing: true });
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      dayCount += 1;
    }
  }

  compareRecordTableContexts(report, left, right) {
    const leftDate = normalizeToIsoDate((left.record.values || {})[report.dateFieldId]) || '';
    const rightDate = normalizeToIsoDate((right.record.values || {})[report.dateFieldId]) || '';
    return leftDate.localeCompare(rightDate) || this.resolveExpectedRecordKey(report, left.record).localeCompare(this.resolveExpectedRecordKey(report, right.record));
  }

  resolveRecordFieldValue(record, fieldId) {
    const id = toText(fieldId);
    if (!id) return '';
    if (Object.prototype.hasOwnProperty.call(record.values || {}, id)) return (record.values || {})[id];
    const lower = id.toLowerCase();
    if (lower === 'status') return record.status || '';
    if (lower === 'id') return record.id || '';
    if (lower === 'createdat') return record.createdAt || '';
    if (lower === 'updatedat') return record.updatedAt || '';
    if (lower === 'pdfurl') return record.pdfUrl || '';
    return '';
  }

  resolveRecordTableColumnHeader(args) {
    const configured = toText(args.column && args.column.header);
    if (configured) return configured;
    const fieldId = toText(args.column && args.column.fieldId);
    const source = toText(args.column && args.column.source) || (fieldId ? 'recordField' : '');
    if (source === 'recordField' && fieldId) {
      const question = (args.questions || []).find(entry => entry && entry.id === fieldId);
      return resolveDisplayText(question && (question.qEn || question.labelEn || question.label), fieldId);
    }
    if (source === 'lineItemField' && fieldId) {
      const lineItem = args.report && args.report.lineItem;
      const field = lineItem && lineItem.groupId
        ? this.findNestedFieldConfig(args.questions, lineItem.groupId, normalizePathList(lineItem.subGroupPath), fieldId)
        : null;
      return resolveDisplayText(field && (field.qEn || field.labelEn || field.label), fieldId);
    }
    if (source === 'recordStatus' || source === 'completionStatus') return 'Status';
    if (source === 'firstMissingStep') return 'First missing step';
    if (source === 'missingSteps') return 'Missing steps';
    return fieldId || 'Column';
  }

  collectColumnLineItemRows(context, column) {
    const groupId = toText(column.groupId);
    if (!groupId) return [];
    const source = context.row && (Object.prototype.hasOwnProperty.call(context.row, groupId) || Object.prototype.hasOwnProperty.call(context.row, `${groupId}_json`))
      ? context.row
      : context.record.values || {};
    return this.collectLineItemRowsFromContainer(source, groupId, normalizePathList(column.subGroupPath));
  }

  matchesColumnLineItemWhen(context, column, entry) {
    if (!column.when) return true;
    const rowCtx = buildRowContext({ row: entry.row, groupKey: entry.groupKey, parentValues: entry.parentValues || context.row, topCtx: context.topCtx });
    return matchesWhenClause(column.when, rowCtx, { now: new Date() });
  }

  resolveMissingStepLabels(report, context) {
    return (Array.isArray(report.steps) ? report.steps : [])
      .filter(step => step && step.completeWhen && !matchesWhenClause(step.completeWhen, context.topCtx, { now: new Date() }))
      .map(step => toText(step.label))
      .filter(Boolean);
  }

  resolveRecordTableColumnValue(report, context, column) {
    const source = column.source || (context.row && column.fieldId ? 'lineItemField' : 'recordField');
    let rawValue = '';
    if (source === 'recordField') rawValue = this.resolveRecordFieldValue(context.record, column.fieldId);
    else if (source === 'recordStatus') rawValue = this.resolveRecordStatus(context.record, report.statusFieldId);
    else if (source === 'lineItemField') rawValue = context.row && column.fieldId ? context.row[column.fieldId] : '';
    else if (source === 'hasLineItem') rawValue = this.collectColumnLineItemRows(context, column).some(entry => this.matchesColumnLineItemWhen(context, column, entry)) ? column.trueLabel || 'Yes' : column.falseLabel || 'No';
    else if (source === 'lineItemAggregate') {
      const rows = this.collectColumnLineItemRows(context, column).filter(entry => this.matchesColumnLineItemWhen(context, column, entry));
      if (column.aggregate === 'count') rawValue = rows.length;
      else if (column.aggregate === 'listUnique') rawValue = Array.from(new Set(rows.map(entry => this.stringifyRecordTableCell(entry.row && entry.row[column.fieldId])).filter(Boolean))).join(column.separator || ', ');
      else rawValue = rows.reduce((sum, entry) => sum + (toNumber(entry.row && entry.row[column.fieldId]) || 0), 0);
    } else if (source === 'completionStatus') {
      if (context.syntheticMissing) rawValue = column.missingLabel || 'Missing';
      else {
        const completed = new Set(normalizeStringList(report.completedStatuses).map(normalizeStatusToken));
        const status = normalizeStatusToken(this.resolveRecordStatus(context.record, report.statusFieldId));
        rawValue = (completed.size ? completed.has(status) : status === 'closed') ? column.completeLabel || 'Complete' : column.incompleteLabel || 'Incomplete';
      }
    } else if (source === 'firstMissingStep') rawValue = this.resolveMissingStepLabels(report, context)[0] || column.fallback || '';
    else if (source === 'missingSteps') rawValue = this.resolveMissingStepLabels(report, context).join(column.separator || ', ');
    else if (source === 'constant') rawValue = column.value;

    if (column.valueMap && typeof column.valueMap === 'object') {
      const text = this.stringifyRecordTableCell(rawValue);
      if (Object.prototype.hasOwnProperty.call(column.valueMap, text)) rawValue = column.valueMap[text];
      else if (Object.prototype.hasOwnProperty.call(column.valueMap, text.toLowerCase())) rawValue = column.valueMap[text.toLowerCase()];
    }
    return this.stringifyRecordTableCell(rawValue);
  }

  stringifyRecordTableCell(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(entry => this.stringifyRecordTableCell(entry)).filter(Boolean).join(', ');
    try {
      return JSON.stringify(value);
    } catch {
      return `${value}`;
    }
  }

  resolveAttachmentFileName(args) {
    const template = toText(args.attachmentConfig && args.attachmentConfig.fileNameTemplate) || '{{PIPELINE_TITLE}} {{START_DATE}} to {{END_DATE}}.xlsx';
    const text = replaceTemplateTokens(
      template,
      buildReportPlaceholders({
        title: args.title,
        startDate: args.startDate,
        endDate: args.endDate,
        recordCount: args.recordCount,
        rowCount: args.rowCount
      })
    )
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return /\.xlsx$/i.test(text) ? text : `${text || 'report'}.xlsx`;
  }

  async buildSpreadsheetArtifact(args) {
    const title = resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Report';
    const fileName = this.resolveAttachmentFileName({
      title,
      attachmentConfig: args.pipeline.attachment,
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rowCount
    });
    const sheetName = toText(args.pipeline.attachment && args.pipeline.attachment.sheetName) || args.defaultSheetName || 'Report';
    const values = args.values && args.values.length ? args.values : [['No data']];
    const width = Math.max(1, ...values.map(row => (Array.isArray(row) ? row.length : 0)));
    const normalizedValues = values.map(row => {
      const next = Array.isArray(row) ? row.slice() : [];
      while (next.length < width) next.push('');
      return next;
    });
    const created = await this.sheetsClient.createSpreadsheet(fileName.replace(/\.xlsx$/i, ''), { sheetName });
    const tempId = toText(created && created.spreadsheetId);
    if (!tempId) throw new Error('Google Sheets create did not return spreadsheetId.');
    try {
      await this.sheetsClient.updateValuesRange(tempId, `${escapeSheetName(sheetName)}!A1:${columnName(width)}${normalizedValues.length}`, normalizedValues);
      const sheetId = created && created.sheets && created.sheets[0] && created.sheets[0].properties && created.sheets[0].properties.sheetId;
      if (sheetId !== undefined && typeof this.sheetsClient.batchUpdate === 'function') {
        await this.sheetsClient.batchUpdate(tempId, [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: width },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold'
            }
          }
        ]);
      }
      const buffer = await this.driveClient.exportFile(tempId, XLSX_MIME_TYPE);
      const folderId =
        toText(args.pipeline.attachment && args.pipeline.attachment.folderId) ||
        toText(this.env.CK_ANALYTICS_EXPORT_FOLDER_ID || this.env.CK_OUTPUT_FOLDER_ID || this.env.CK_UPLOAD_FOLDER_ID);
      if (!folderId) throw new Error('Analytics export folder is not configured.');
      const saved = await this.fileRepository.createFile({ name: fileName, mimeType: XLSX_MIME_TYPE, buffer }, { folderId });
      const fileId = saved && saved.id ? saved.id.toString() : '';
      return {
        buffer,
        fileName,
        fileId,
        url: (saved && (saved.webViewLink || saved.webContentLink)) || (fileId ? `https://drive.google.com/open?id=${fileId}` : '')
      };
    } finally {
      try {
        await this.fileRepository.trashFile(tempId);
      } catch {
        // Best-effort cleanup for temporary spreadsheet.
      }
    }
  }

  resolveRecipients(value, placeholders) {
    return normalizeStringList(value)
      .flatMap(entry => replaceTemplateTokens(entry, placeholders).split(','))
      .map(toText)
      .filter(Boolean);
  }

  async sendPipelineEmail(args) {
    const placeholders = buildReportPlaceholders({
      title: resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Report',
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rowCount,
      attachmentName: args.artifact.fileName,
      sourceForm: toText(args.sourceForm.title || args.sourceForm.configSheet)
    });
    const email = args.pipeline.email || {};
    const to = this.resolveRecipients(email.recipients, placeholders);
    if (!to.length) throw new Error('Resolved report recipients are empty.');
    const subjectTemplate = resolveDisplayText(email.subject, '{{PIPELINE_TITLE}} | {{START_DATE}} to {{END_DATE}}');
    const bodyTemplate =
      resolveDisplayText(email.message, 'The requested report is attached.\n\nRange: {{START_DATE}} to {{END_DATE}}\nRecords included: {{RECORD_COUNT}}\nRows: {{ROW_COUNT}}');
    const textBody = replaceTemplateTokens(bodyTemplate, placeholders).trim() || 'See attached report.';
    await this.gmailClient.sendEmail({
      to,
      cc: this.resolveRecipients(email.cc, placeholders),
      bcc: this.resolveRecipients(email.bcc, placeholders),
      from: replaceTemplateTokens(toText(email.from), placeholders),
      fromName: replaceTemplateTokens(toText(email.fromName), placeholders),
      subject: replaceTemplateTokens(subjectTemplate, placeholders).trim() || 'Report',
      textBody,
      htmlBody: textBody.replace(/\n/g, '<br/>'),
      attachments: [
        {
          fileName: args.artifact.fileName,
          mimeType: XLSX_MIME_TYPE,
          buffer: args.artifact.buffer
        }
      ]
    });
  }
}

const createAnalyticsPipelineRepository = deps =>
  deps && deps.analyticsPipelineRepository ? deps.analyticsPipelineRepository : new AnalyticsPipelineRepository(deps || {});

module.exports = {
  AnalyticsPipelineRepository,
  QUEUE_HEADERS,
  QUEUE_SHEET_NAME,
  createAnalyticsPipelineRepository
};
