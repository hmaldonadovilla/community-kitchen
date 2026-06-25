const crypto = require('crypto');

const { columnName, createGoogleSheetsClient, escapeSheetName } = require('../googleSheetsClient');
const { normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } = require('./dataSourceUtils');

const MAX_LIST_ROWS = 200;
const MAX_PAGE_SIZE = 50;
const MAX_SORTED_PAGE_SIZE = 200;

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const encodePageToken = offset => Buffer.from(String(Math.max(0, Number(offset) || 0)), 'utf8').toString('base64');

const decodePageToken = token => {
  if (!token) return 0;
  try {
    const decoded = Buffer.from(token.toString(), 'base64').toString('utf8');
    const n = Number(decoded);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
};

const normalizeDateString = value => {
  const raw = (value === undefined || value === null ? '' : value.toString()).trim();
  if (!raw) return '';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : raw;
};

const normalizeSortable = value => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return value;
  const raw = value.toString().trim();
  const number = Number(raw);
  if (raw && Number.isFinite(number)) return number;
  const timestamp = Date.parse(raw);
  if (Number.isFinite(timestamp)) return timestamp;
  return raw.toLowerCase();
};

const pageSize = (value, max = MAX_PAGE_SIZE) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : MAX_PAGE_SIZE;
};

const toNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeLanguage = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] || value[0] : value;
  const lang = (raw || 'EN').toString().trim().toUpperCase();
  return ['EN', 'FR', 'NL'].includes(lang) ? lang : 'EN';
};

const isTruthyFlag = value => value === true || value === 'true' || value === '1' || value === 1;

const isNoopIfUnchangedRequested = payload => isTruthyFlag(payload && payload.__ckNoopIfUnchanged);

const resolveLocalizedText = (value, language, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return resolveLocalizedText(JSON.parse(trimmed), language, fallback);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return value.toString();
  const key = (language || 'EN').toString().trim().toLowerCase();
  return (
    value[key] ||
    value[key.toUpperCase()] ||
    value.en ||
    value.EN ||
    value.fr ||
    value.FR ||
    value.nl ||
    value.NL ||
    fallback
  );
};

const resolveStatusTransitionValue = (transitions, transitionKey, language) => {
  if (!transitions || typeof transitions !== 'object') return '';
  return resolveLocalizedText(transitions[transitionKey], language, '').toString().trim();
};

const normalizeDedupValue = (value, mode) => {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return normalizeDateString(value);
  const base = Array.isArray(value)
    ? value
        .map(entry => {
          if (entry === undefined || entry === null) return '';
          if (entry instanceof Date) return normalizeDateString(entry);
          return entry.toString().trim();
        })
        .join('|')
    : value.toString().trim();
  return mode === 'caseInsensitive' ? base.toLowerCase() : base;
};

const computeDedupSignature = (rule, values) => {
  if (!rule) return null;
  const keys = Array.isArray(rule.keys) ? rule.keys.map(key => (key || '').toString().trim()).filter(Boolean) : [];
  if (!keys.length) return null;
  const mode = rule.matchMode || 'exact';
  const parts = keys.map(key => normalizeDedupValue((values || {})[key], mode));
  if (parts.some(part => !part || !part.toString().trim())) return null;
  return parts.join('||');
};

const findDedupConflict = (rules, candidate, existing, language) => {
  const effectiveRules = (Array.isArray(rules) ? rules : []).filter(
    rule => rule && (rule.scope || 'form') === 'form' && (rule.onConflict || 'reject') !== 'ignore'
  );
  for (const rule of effectiveRules) {
    const keys = Array.isArray(rule.keys) ? rule.keys.map(key => (key || '').toString().trim()).filter(Boolean) : [];
    if (!keys.length) continue;
    const mode = rule.matchMode || 'exact';
    const incomingParts = keys.map(key => normalizeDedupValue(candidate.values[key], mode));
    if (incomingParts.some(part => !part)) continue;
    const incomingKey = incomingParts.join('||');
    for (const record of existing) {
      if (candidate.id && record.id && candidate.id === record.id) continue;
      const existingParts = keys.map(key => normalizeDedupValue(record.values[key], mode));
      if (existingParts.some(part => !part)) continue;
      if (incomingKey !== existingParts.join('||')) continue;
      return {
        ruleId: rule.id || 'dedup',
        message: resolveLocalizedText(rule.message, language, 'Duplicate record.'),
        existingRecordId: record.id,
        existingRowNumber: record.rowNumber
      };
    }
  }
  return undefined;
};

const normalizeCellComparable = value => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return value.toString();
    }
  }
  return value.toString();
};

const normalizeRowValues = (rowValues, width) => {
  const normalized = Array.isArray(rowValues) ? rowValues.slice() : [];
  if (normalized.length < width) return normalized.concat(new Array(width - normalized.length).fill(''));
  if (normalized.length > width) return normalized.slice(0, width);
  return normalized;
};

const serializeAuditValue = value => {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  try {
    return JSON.stringify(normalizeAuditValue(value));
  } catch {
    try {
      return value.toString();
    } catch {
      return '';
    }
  }
};

const isPlainAuditObject = value =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date));

const normalizeAuditValue = value => {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(entry => normalizeAuditValue(entry));
  if (!isPlainAuditObject(value)) return value;
  const out = {};
  Object.keys(value)
    .filter(key => key && !key.startsWith('__ck'))
    .sort()
    .forEach(key => {
      out[key] = normalizeAuditValue(value[key]);
    });
  return out;
};

const auditValuesEqual = (left, right) => serializeAuditValue(normalizeAuditValue(left)) === serializeAuditValue(normalizeAuditValue(right));

const parseAuditJson = value => {
  if (typeof value !== 'string') return { parsed: false, value };
  const text = value.toString().trim();
  if (!text || !(text.startsWith('[') || text.startsWith('{'))) return { parsed: false, value };
  try {
    return { parsed: true, value: JSON.parse(text) };
  } catch {
    return { parsed: false, value };
  }
};

const normalizeDeviceInfo = raw => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string') return raw.toString().trim();
  return serializeAuditValue(raw);
};

const createRecordId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

const normalizeSheetNamePart = raw =>
  (raw || '')
    .toString()
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getRecordIndexSheetName = destinationTab => {
  const base = normalizeSheetNamePart(destinationTab || 'Responses') || 'Responses';
  const digest = crypto.createHash('md5').update(destinationTab || base).digest('base64').replace(/=+$/, '').slice(0, 10);
  const head = base.length > 40 ? base.slice(0, 40).trim() : base;
  return `__CK_INDEX__${head}__${digest}`;
};

const normalizeRuleId = raw =>
  (raw || '')
    .toString()
    .trim()
    .replace(/\s+/g, '_');

const recordIndexDedupRules = rules =>
  (Array.isArray(rules) ? rules : []).filter(
    rule => rule && (rule.onConflict || 'reject') === 'reject' && (rule.scope || 'form') === 'form'
  );

const recordIndexHeadersForRules = rules => {
  const baseHeaders = ['Record ID', 'Row', 'Data Version', 'Updated At (ISO)', 'Created At (ISO)'];
  const dedupHeaders = recordIndexDedupRules(rules)
    .map(rule => normalizeRuleId(rule.id))
    .filter(Boolean)
    .map(ruleId => `DEDUP:${ruleId}`);
  return [...baseHeaders, ...Array.from(new Set(dedupHeaders))];
};

const parseRecordIndexColumns = headers => {
  const dedupByRuleId = {};
  (Array.isArray(headers) ? headers : []).forEach((header, idx) => {
    const match = /^DEDUP:([^\s]+)\s*$/.exec((header || '').toString().trim());
    if (match && match[1]) dedupByRuleId[match[1]] = idx + 1;
  });
  return {
    recordId: 1,
    rowNumber: 2,
    dataVersion: 3,
    updatedAtIso: 4,
    createdAtIso: 5,
    dedupByRuleId,
    headerWidth: Math.max(5, (headers || []).length)
  };
};

const isMissingSheetError = err => {
  const message = err && err.message ? err.message.toString() : '';
  return /Unable to parse range|not found|No grid with id|does not exist/i.test(message);
};

class GoogleSheetsSubmissionRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.configRepository = options.configRepository;
    this.sheetsClient = options.sheetsClient || createGoogleSheetsClient(options);
    this.fileRepository = options.fileRepository || null;
    this.sheetCache = options.sheetCache || null;
    this.timing = options.timing || null;
    this.autoIncrementState = new Map();
  }

  createRequestScope(options = {}) {
    return new GoogleSheetsSubmissionRepository({
      env: this.env,
      configRepository: this.configRepository,
      sheetsClient: this.sheetsClient,
      fileRepository: this.fileRepository,
      sheetCache: new Map(),
      timing: options.timing || this.timing || null
    });
  }

  async measure(label, fn) {
    if (!this.timing || typeof this.timing.measure !== 'function') return fn();
    return this.timing.measure(label, fn);
  }

  getSpreadsheetId() {
    return (
      this.env.CK_DEFAULT_SPREADSHEET_ID ||
      this.env.CK_GOOGLE_SHEETS_SPREADSHEET_ID ||
      this.env.CK_SPREADSHEET_ID ||
      ''
    )
      .toString()
      .trim();
  }

  getFormConfig(formKey) {
    if (!this.configRepository || typeof this.configRepository.fetchFormConfig !== 'function') {
      throw new Error('Form config repository is not configured.');
    }
    return this.configRepository.fetchFormConfig(formKey);
  }

  getFormContext(formKey) {
    const config = this.getFormConfig(formKey);
    const form = config.form || {};
    const definition = config.definition || {};
    const configQuestions = Array.isArray(config.questions) ? config.questions.filter(q => q && q.status !== 'Disabled') : [];
    const definitionQuestions = Array.isArray(definition.questions) ? definition.questions : [];
    const questions = configQuestions.length ? configQuestions : definitionQuestions;
    const resolvedKey = (config.formKey || form.configSheet || form.title || formKey || '').toString().trim();
    const destinationTab = (form.destinationTab || `${form.title || resolvedKey} Responses`).toString().trim();
    if (!destinationTab) throw new Error(`Destination tab not configured for ${resolvedKey}.`);
    return { config, form, definition, questions, formKey: resolvedKey, destinationTab };
  }

  async loadSheet(formKey) {
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for submission reads and writes.');
    const context = this.getFormContext(formKey);
    const cacheKey = `${spreadsheetId}::${context.destinationTab}`;
    if (this.sheetCache && this.sheetCache.has(cacheKey)) {
      if (this.timing && typeof this.timing.increment === 'function') this.timing.increment('sheetCacheHits');
      return this.sheetCache.get(cacheKey);
    }
    const loadPromise = this.measure(`sheets.load.${context.destinationTab}`, async () => {
      const rows = await this.sheetsClient.getSheetValues(spreadsheetId, context.destinationTab);
      const headers = (rows[0] || []).map(value => sanitizeHeaderCellText(value));
      const dataRows = rows.slice(1);
      const columns = this.buildColumns(headers, context.questions);
      return { ...context, spreadsheetId, headers, dataRows, columns };
    });
    if (this.sheetCache) this.sheetCache.set(cacheKey, loadPromise);
    const sheet = await loadPromise;
    if (this.sheetCache) this.sheetCache.set(cacheKey, sheet);
    return sheet;
  }

  buildColumns(headers, questions) {
    const findHeader = aliases => {
      const wanted = aliases.map(normalizeHeaderToken).filter(Boolean);
      const idx = headers.findIndex(header => {
        const parsed = parseHeaderKey(header);
        return wanted.includes(normalizeHeaderToken(parsed.raw)) || wanted.includes(normalizeHeaderToken(parsed.key));
      });
      return idx >= 0 ? idx : undefined;
    };
    const columns = {
      timestamp: findHeader(['Timestamp']),
      language: findHeader(['Language']),
      recordId: findHeader(['Record ID', 'id']),
      dataVersion: findHeader(['Data Version', 'dataVersion']),
      createdAt: findHeader(['Created At', 'createdAt']),
      updatedAt: findHeader(['Updated At', 'updatedAt']),
      status: findHeader(['Status', 'status']),
      pdfUrl: findHeader(['PDF URL', 'pdfUrl']),
      fields: {}
    };
    (questions || [])
      .filter(q => q && q.type !== 'BUTTON')
      .forEach(q => {
        const id = (q.id || '').toString().trim();
        if (!id) return;
        const label = (q.qEn || q.label || '').toString().trim();
        const idx = headers.findIndex(header => {
          const parsed = parseHeaderKey(header);
          return (
            normalizeHeaderToken(parsed.key) === normalizeHeaderToken(id) ||
            normalizeHeaderToken(parsed.raw) === normalizeHeaderToken(id) ||
            (label && normalizeHeaderToken(parsed.raw) === normalizeHeaderToken(label))
          );
        });
        if (idx >= 0) columns.fields[id] = idx;
      });
    return columns;
  }

  getDedupRules(formKey) {
    const config = this.getFormConfig(formKey);
    const rules = Array.isArray(config.dedupRules)
      ? config.dedupRules
      : Array.isArray(config.definition && config.definition.dedupRules)
        ? config.definition.dedupRules
        : [];
    return rules.filter(rule => rule && (rule.scope || 'form') === 'form' && (rule.onConflict || 'reject') === 'reject');
  }

  supportsRecordIndexWrites() {
    return Boolean(
      this.sheetsClient &&
        typeof this.sheetsClient.getSheetValues === 'function' &&
        typeof this.sheetsClient.updateRowValues === 'function' &&
        typeof this.sheetsClient.addSheet === 'function'
    );
  }

  async ensureRecordIndexSheet(sheet, dedupRules) {
    if (!this.supportsRecordIndexWrites()) return null;
    const sheetName = getRecordIndexSheetName(sheet.destinationTab);
    const desiredHeaders = recordIndexHeadersForRules(dedupRules);
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(sheet.spreadsheetId, sheetName);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      try {
        await this.sheetsClient.addSheet(sheet.spreadsheetId, sheetName, { hidden: true });
      } catch (addErr) {
        const message = addErr && addErr.message ? addErr.message.toString() : '';
        if (!/already exists|duplicate/i.test(message)) throw addErr;
      }
      rows = [];
    }

    const currentHeaders = (rows[0] || []).map(value => (value || '').toString().trim());
    const needsHeader =
      desiredHeaders.length !== currentHeaders.length ||
      desiredHeaders.some((header, idx) => header !== (currentHeaders[idx] || ''));
    if (needsHeader) {
      await this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheetName, 1, desiredHeaders);
    }

    return {
      sheetName,
      columns: parseRecordIndexColumns(desiredHeaders)
    };
  }

  async writeRecordIndexRow(sheet, args) {
    const idx = await this.ensureRecordIndexSheet(sheet, args.dedupRules);
    if (!idx) return;
    const rowNumber = Number(args.rowNumber);
    if (!Number.isFinite(rowNumber) || rowNumber < 2) return;
    const rowValues = this.buildRecordIndexRowValues(idx.columns, args, rowNumber);
    await this.sheetsClient.updateRowValues(sheet.spreadsheetId, idx.sheetName, rowNumber, rowValues);
  }

  buildRecordIndexRowValues(columns, args, rowNumber) {
    const rowValues = new Array(columns.headerWidth).fill('');
    rowValues[columns.recordId - 1] = (args.recordId || '').toString();
    rowValues[columns.rowNumber - 1] = rowNumber;
    rowValues[columns.dataVersion - 1] = Number.isFinite(Number(args.dataVersion)) ? Number(args.dataVersion) : '';
    rowValues[columns.updatedAtIso - 1] = (args.updatedAtIso || '').toString();
    rowValues[columns.createdAtIso - 1] = (args.createdAtIso || '').toString();
    Object.entries(args.dedupSignatures || {}).forEach(([ruleIdRaw, signature]) => {
      const ruleId = normalizeRuleId(ruleIdRaw);
      const col = columns.dedupByRuleId[ruleId];
      if (!col) return;
      rowValues[col - 1] = (signature || '').toString();
    });
    return rowValues;
  }

  async writeRecordIndexRows(sheet, entries) {
    const items = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!items.length) return;
    const idx = await this.ensureRecordIndexSheet(sheet, items[0].dedupRules || []);
    if (!idx) return;
    const data = items
      .map(args => {
        const rowNumber = Number(args.rowNumber);
        if (!Number.isFinite(rowNumber) || rowNumber < 2) return null;
        const rowValues = this.buildRecordIndexRowValues(idx.columns, args, rowNumber);
        return {
          range: `${escapeSheetName(idx.sheetName)}!A${rowNumber}:${columnName(rowValues.length)}${rowNumber}`,
          values: [rowValues]
        };
      })
      .filter(Boolean);
    if (!data.length) return;
    if (typeof this.sheetsClient.batchUpdateValues === 'function') {
      await this.sheetsClient.batchUpdateValues(sheet.spreadsheetId, data);
      return;
    }
    for (const entry of data) {
      const rowMatch = /!(?:[A-Z]+)(\d+):/.exec(entry.range);
      const rowNumber = rowMatch ? Number(rowMatch[1]) : Number.NaN;
      if (!Number.isFinite(rowNumber)) continue;
      await this.sheetsClient.updateRowValues(sheet.spreadsheetId, idx.sheetName, rowNumber, entry.values[0]);
    }
  }

  resolveAuditLoggingConfig(value) {
    if (!value || value.enabled === false) return undefined;
    const out = {};
    if (value.enabled !== undefined) out.enabled = Boolean(value.enabled);
    if (value.sheetName && value.sheetName.toString().trim()) out.sheetName = value.sheetName.toString().trim();
    if (Array.isArray(value.statuses) && value.statuses.length) {
      const statuses = Array.from(
        new Set(
          value.statuses
            .map(status => (status === undefined || status === null ? '' : status.toString().trim()))
            .filter(Boolean)
        )
      );
      if (statuses.length) out.statuses = statuses;
    }
    if (Array.isArray(value.snapshotButtons) && value.snapshotButtons.length) {
      const snapshotButtons = Array.from(
        new Set(
          value.snapshotButtons
            .map(buttonId => (buttonId === undefined || buttonId === null ? '' : buttonId.toString().trim()))
            .filter(Boolean)
        )
      );
      if (snapshotButtons.length) out.snapshotButtons = snapshotButtons;
    }
    return Object.keys(out).length ? out : { enabled: true };
  }

  readStatusValue(form, columns, rowValues) {
    if (!Array.isArray(rowValues) || !rowValues.length) return '';
    const statusFieldId = form && form.followupConfig && form.followupConfig.statusFieldId;
    const statusFieldIdx = statusFieldId ? columns.fields[statusFieldId] : undefined;
    const fieldValue = statusFieldIdx !== undefined ? rowValues[statusFieldIdx] : undefined;
    const metaValue = columns.status !== undefined ? rowValues[columns.status] : undefined;
    const resolved = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue : metaValue;
    return resolved === undefined || resolved === null ? '' : resolved.toString().trim();
  }

  shouldWriteChangeAuditRows(cfg, form, columns, beforeRowValues, afterRowValues) {
    const statuses = (cfg.statuses || [])
      .map(status => (status === undefined || status === null ? '' : status.toString().trim().toLowerCase()))
      .filter(Boolean);
    if (!statuses.length) return true;
    const allowed = new Set(statuses);
    const before = this.readStatusValue(form, columns, beforeRowValues).toLowerCase();
    const after = this.readStatusValue(form, columns, afterRowValues).toLowerCase();
    return Boolean((before && allowed.has(before)) || (after && allowed.has(after)));
  }

  collectDeepAuditDiffs(path, beforeValue, afterValue, out) {
    if (auditValuesEqual(beforeValue, afterValue)) return;
    const beforeIsArray = Array.isArray(beforeValue);
    const afterIsArray = Array.isArray(afterValue);
    if (beforeIsArray || afterIsArray) {
      const beforeArray = beforeIsArray ? beforeValue : [];
      const afterArray = afterIsArray ? afterValue : [];
      const max = Math.max(beforeArray.length, afterArray.length);
      for (let i = 0; i < max; i += 1) {
        this.collectDeepAuditDiffs(`${path}[${i}]`, beforeArray[i], afterArray[i], out);
      }
      return;
    }
    const beforeObj = isPlainAuditObject(beforeValue) ? beforeValue : null;
    const afterObj = isPlainAuditObject(afterValue) ? afterValue : null;
    if (beforeObj || afterObj) {
      const keys = Array.from(new Set([...Object.keys(beforeObj || {}), ...Object.keys(afterObj || {})])).filter(
        key => key && !key.startsWith('__ck')
      );
      keys.forEach(key => {
        this.collectDeepAuditDiffs(path ? `${path}.${key}` : key, beforeObj ? beforeObj[key] : undefined, afterObj ? afterObj[key] : undefined, out);
      });
      return;
    }
    out.push({ fieldPath: path, beforeValue, afterValue });
  }

  collectAuditChanges(questions, columns, beforeRowValues, afterRowValues) {
    const width = Math.max(
      Array.isArray(beforeRowValues) ? beforeRowValues.length : 0,
      Array.isArray(afterRowValues) ? afterRowValues.length : 0
    );
    const before = beforeRowValues ? normalizeRowValues(beforeRowValues, width) : [];
    const after = afterRowValues ? normalizeRowValues(afterRowValues, width) : [];
    const changes = [];
    (questions || [])
      .filter(question => question && question.type !== 'BUTTON')
      .forEach(question => {
        const colIdx = columns.fields[question.id];
        if (colIdx === undefined) return;
        const previous = before[colIdx];
        const next = after[colIdx];
        if (question.type === 'LINE_ITEM_GROUP') {
          const previousParsed = parseAuditJson(previous);
          const nextParsed = parseAuditJson(next);
          if ((previousParsed.parsed || nextParsed.parsed) && !auditValuesEqual(previousParsed.value, nextParsed.value)) {
            this.collectDeepAuditDiffs(question.id, previousParsed.value, nextParsed.value, changes);
            return;
          }
        }
        if (normalizeCellComparable(previous) !== normalizeCellComparable(next)) {
          changes.push({ fieldPath: question.id, beforeValue: previous, afterValue: next });
        }
      });
    return changes;
  }

  async ensureAuditSheet(sheet, configuredName) {
    if (
      !this.sheetsClient ||
      typeof this.sheetsClient.getSheetValues !== 'function' ||
      typeof this.sheetsClient.updateRowValues !== 'function'
    ) {
      return null;
    }
    const sheetName = (configuredName || `${sheet.destinationTab} Audit`).toString().trim() || `${sheet.destinationTab} Audit`;
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(sheet.spreadsheetId, sheetName);
    } catch (err) {
      if (!isMissingSheetError(err) || typeof this.sheetsClient.addSheet !== 'function') throw err;
      try {
        await this.sheetsClient.addSheet(sheet.spreadsheetId, sheetName);
      } catch (addErr) {
        const message = addErr && addErr.message ? addErr.message.toString() : '';
        if (!/already exists|duplicate/i.test(message)) throw addErr;
      }
      rows = [];
    }
    const headers = ['date_time', 'recordId', 'auditType', 'fieldPath', 'beforeValue', 'afterValue', 'snapshot', 'deviceInfo'];
    const current = normalizeRowValues(rows[0] || [], headers.length).map(value =>
      value === undefined || value === null ? '' : value.toString()
    );
    const needsHeader = headers.some((header, idx) => current[idx] !== header);
    if (needsHeader) {
      await this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheetName, 1, headers);
    }
    return { sheetName, nextRowNumber: Math.max(2, rows.length + 1), width: headers.length };
  }

  async writeAuditRows(sheet, args) {
    const cfg = this.resolveAuditLoggingConfig(sheet.form && sheet.form.auditLogging);
    if (!cfg) return;
    const afterRowValues = normalizeRowValues(args.afterRowValues, Math.max(args.afterRowValues.length, sheet.headers.length));
    const beforeRowValues = args.beforeRowValues
      ? normalizeRowValues(args.beforeRowValues, Math.max(args.beforeRowValues.length, afterRowValues.length))
      : undefined;
    const auditRows = [];
    const deviceInfo = normalizeDeviceInfo(args.deviceInfo);
    if (this.shouldWriteChangeAuditRows(cfg, sheet.form, sheet.columns, beforeRowValues, afterRowValues)) {
      this.collectAuditChanges(sheet.questions, sheet.columns, beforeRowValues, afterRowValues).forEach(change => {
        auditRows.push([
          args.changedAtIso,
          args.recordId,
          'change',
          change.fieldPath,
          serializeAuditValue(change.beforeValue),
          serializeAuditValue(change.afterValue),
          '',
          deviceInfo
        ]);
      });
    }

    const actionId = args.auditAction === undefined || args.auditAction === null ? '' : args.auditAction.toString().trim();
    const snapshotButtonSet = new Set((cfg.snapshotButtons || []).map(buttonId => buttonId.toLowerCase()));
    if (actionId && snapshotButtonSet.has(actionId.toLowerCase())) {
      const snapshotRecord = this.buildRecord(sheet, afterRowValues, args.rowNumber) || { id: args.recordId };
      auditRows.push([
        args.changedAtIso,
        args.recordId,
        'snapshot',
        '',
        '',
        '',
        serializeAuditValue(snapshotRecord),
        deviceInfo
      ]);
    }

    if (!auditRows.length) return;
    const auditSheet = await this.ensureAuditSheet(sheet, cfg.sheetName);
    if (!auditSheet) return;
    if (typeof this.sheetsClient.appendRows === 'function') {
      await this.sheetsClient.appendRows(sheet.spreadsheetId, auditSheet.sheetName, auditRows);
      return;
    }
    for (let index = 0; index < auditRows.length; index += 1) {
      await this.sheetsClient.updateRowValues(
        sheet.spreadsheetId,
        auditSheet.sheetName,
        auditSheet.nextRowNumber + index,
        auditRows[index]
      );
    }
  }

  value(row, idx) {
    return idx === undefined ? undefined : row[idx];
  }

  buildRecord(sheet, row, rowNumber) {
    const id = (this.value(row, sheet.columns.recordId) || '').toString().trim();
    if (!id) return null;
    const values = {};
    sheet.questions
      .filter(q => q && q.type !== 'BUTTON')
      .forEach(q => {
        const idx = sheet.columns.fields[q.id];
        if (idx === undefined) return;
        let value = row[idx];
        if (q.type === 'LINE_ITEM_GROUP' && typeof value === 'string' && value.trim()) {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep the stored value when it is not valid JSON.
          }
        }
        if (q.type === 'DATE' && value) value = normalizeDateString(value);
        values[q.id] = value;
      });
    return {
      formKey: sheet.formKey,
      language: (this.value(row, sheet.columns.language) || 'EN').toString().trim() || 'EN',
      values,
      id,
      rowNumber,
      createdAt: this.value(row, sheet.columns.createdAt),
      updatedAt: this.value(row, sheet.columns.updatedAt),
      dataVersion: toNumber(this.value(row, sheet.columns.dataVersion)),
      status: this.value(row, sheet.columns.status),
      pdfUrl: this.value(row, sheet.columns.pdfUrl)
    };
  }

  readPayloadValue(formObject, fieldId) {
    if (!formObject || typeof formObject !== 'object') return undefined;
    const values = formObject.values && typeof formObject.values === 'object' ? formObject.values : {};
    if (Object.prototype.hasOwnProperty.call(values, fieldId)) return values[fieldId];
    if (Object.prototype.hasOwnProperty.call(formObject, fieldId)) return formObject[fieldId];
    return undefined;
  }

  writePayloadValue(formObject, fieldId, value) {
    const key = (fieldId || '').toString().trim();
    if (!formObject || typeof formObject !== 'object' || !key) return;
    if (formObject.values && typeof formObject.values === 'object') {
      formObject.values[key] = value;
    }
    formObject[key] = value;
  }

  readLineItemPayloadValue(formObject, fieldId) {
    const jsonKey = `${fieldId}_json`;
    const jsonValue = this.readPayloadValue(formObject, jsonKey);
    if (jsonValue !== undefined) return jsonValue;
    return this.readPayloadValue(formObject, fieldId);
  }

  resolveAutoIncrementPrefix(config, formObject) {
    const fallbackPrefix = config && config.prefix !== undefined && config.prefix !== null ? config.prefix.toString() : '';
    const prefixByValue = config && config.prefixByValue;
    if (!prefixByValue || !prefixByValue.fieldId || !prefixByValue.map || !formObject) {
      return { prefix: fallbackPrefix };
    }
    const rawValue = this.readPayloadValue(formObject, prefixByValue.fieldId);
    const normalizedValue = toText(rawValue);
    const mappedPrefix =
      (normalizedValue && Object.prototype.hasOwnProperty.call(prefixByValue.map, normalizedValue)
        ? prefixByValue.map[normalizedValue]
        : undefined) ?? prefixByValue.defaultPrefix;
    if (mappedPrefix === undefined || mappedPrefix === null || mappedPrefix.toString() === '') {
      return { prefix: fallbackPrefix };
    }
    return { prefix: mappedPrefix.toString(), propertyKeySuffix: mappedPrefix.toString() };
  }

  autoIncrementStateKey(sheet, question, config, resolvedPrefix) {
    const formKey = (sheet.form && sheet.form.configSheet) || sheet.formKey || '';
    const base = toText(config && config.propertyKey) || `${formKey}::${question.id}`;
    const suffix = toText(resolvedPrefix && resolvedPrefix.propertyKeySuffix);
    return suffix ? `${base}::${suffix}` : base;
  }

  autoIncrementPadLength(config) {
    const raw = config && config.padLength;
    if (raw === undefined || raw === null) return 6;
    const number = Number(raw);
    return Math.max(0, Math.min(20, Number.isFinite(number) ? number : 6));
  }

  autoIncrementNumberFromValue(value, prefix) {
    const raw = toText(value);
    if (!raw) return 0;
    const normalizedPrefix = prefix === undefined || prefix === null ? '' : prefix.toString();
    if (normalizedPrefix && !raw.startsWith(normalizedPrefix)) return 0;
    const suffix = normalizedPrefix ? raw.slice(normalizedPrefix.length) : raw;
    if (!/^\d+$/.test(suffix)) return 0;
    const parsed = Number(suffix);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  maxAutoIncrementNumber(sheet, question, prefix) {
    const colIdx = sheet.columns.fields[question.id];
    if (colIdx === undefined) return 0;
    return (sheet.dataRows || []).reduce((max, row) => {
      const parsed = this.autoIncrementNumberFromValue(this.value(row || [], colIdx), prefix);
      return parsed > max ? parsed : max;
    }, 0);
  }

  generateAutoIncrementValue(sheet, question, formObject) {
    const config = question && question.autoIncrement;
    if (!config) return '';
    const resolvedPrefix = this.resolveAutoIncrementPrefix(config, formObject);
    const stateKey = this.autoIncrementStateKey(sheet, question, config, resolvedPrefix);
    const current = Math.max(
      Number(this.autoIncrementState.get(stateKey)) || 0,
      this.maxAutoIncrementNumber(sheet, question, resolvedPrefix.prefix)
    );
    const next = current + 1;
    const padLength = this.autoIncrementPadLength(config);
    const formatted = `${resolvedPrefix.prefix || ''}${padLength > 0 ? next.toString().padStart(padLength, '0') : next.toString()}`;
    this.autoIncrementState.set(stateKey, next);
    return formatted;
  }

  applyAutoIncrementFields(sheet, formObject, existingRow) {
    const autoIncrementValues = {};
    (sheet.questions || [])
      .filter(question => question && question.type === 'TEXT' && question.autoIncrement)
      .forEach(question => {
        const currentValue = this.readPayloadValue(formObject, question.id);
        if (!toText(currentValue)) {
          const existingValue = (() => {
            if (!existingRow) return '';
            const colIdx = sheet.columns.fields[question.id];
            if (colIdx === undefined) return '';
            return toText(this.value(existingRow, colIdx));
          })();
          this.writePayloadValue(
            formObject,
            question.id,
            existingValue || this.generateAutoIncrementValue(sheet, question, formObject)
          );
        }
        const resolved = toText(this.readPayloadValue(formObject, question.id));
        if (resolved) autoIncrementValues[question.id] = resolved;
      });
    return autoIncrementValues;
  }

  fallbackSaveFileUrls(value, uploadConfig) {
    const linkCapture = uploadConfig && uploadConfig.linkCapture;
    const validation = linkCapture && linkCapture.validation;
    if (validation && validation.requireServerValidation === true) {
      throw new Error(
        'CK_UPLOAD_LINK_VALIDATION:repositoryRequired: Receipt link validation requires a configured Drive file repository.'
      );
    }
    if (value === undefined || value === null || value === '') return '';
    const collect = raw => {
      if (raw === undefined || raw === null) return [];
      if (typeof raw === 'string') {
        return raw
          .split(',')
          .map(part => part.trim())
          .filter(Boolean);
      }
      if (Array.isArray(raw)) return raw.flatMap(collect);
      if (typeof raw === 'object') {
        if (typeof raw.url === 'string') return collect(raw.url);
        if (raw.dataUrl || raw.data || raw.base64 || Array.isArray(raw.bytes)) {
          throw new Error('Drive file repository is not configured for Cloud Run uploads.');
        }
      }
      return [];
    };
    return Array.from(new Set(collect(value))).join(', ');
  }

  async saveFileUploadValue(value, uploadConfig, context = {}) {
    if (this.fileRepository && typeof this.fileRepository.saveFiles === 'function') {
      return this.fileRepository.saveFiles(value, uploadConfig, context);
    }
    return this.fallbackSaveFileUrls(value, uploadConfig);
  }

  async applyUploadsToLineItemRows(rows, cfg, context = {}) {
    if (!rows || !Array.isArray(rows) || !cfg) return rows;
    const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    const fileFields = fields.filter(field => field && field.type === 'FILE_UPLOAD');
    const subGroups = Array.isArray(cfg.subGroups) ? cfg.subGroups : [];

    const processed = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        processed.push(row);
        continue;
      }
      const next = { ...row };
      for (const field of fileFields) {
        const fieldId = (field.id || '').toString();
        if (!fieldId) continue;
        next[fieldId] = await this.saveFileUploadValue(next[fieldId], field.uploadConfig, context);
      }
      for (const sub of subGroups) {
        const key = this.resolveSubgroupKey(sub);
        if (!key || !Array.isArray(next[key])) continue;
        next[key] = await this.applyUploadsToLineItemRows(next[key], sub, context);
      }
      processed.push(next);
    }
    return processed;
  }

  resolveSubgroupKey(sub) {
    if (!sub) return '';
    return (sub.id || '').toString().trim();
  }

  serializeQuestionValue(formObject, question) {
    const value =
      question.type === 'LINE_ITEM_GROUP'
        ? this.readLineItemPayloadValue(formObject, question.id)
        : this.readPayloadValue(formObject, question.id);
    if (question.type === 'LINE_ITEM_GROUP') {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null || value === '') return '';
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    if (question.type === 'DATE') return normalizeDateString(value);
    if (Array.isArray(value)) return value.join(', ');
    return value === undefined || value === null ? '' : value;
  }

  async serializeQuestionValueForSave(formObject, question, context = {}) {
    const value =
      question.type === 'LINE_ITEM_GROUP'
        ? this.readLineItemPayloadValue(formObject, question.id)
        : this.readPayloadValue(formObject, question.id);
    if (question.type === 'LINE_ITEM_GROUP') {
      let parsed = null;
      if (typeof value === 'string' && value.trim()) {
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = null;
        }
      } else if (Array.isArray(value)) {
        parsed = value;
      }
      if (parsed && question.lineItemConfig) {
        const processed = await this.applyUploadsToLineItemRows(parsed, question.lineItemConfig, context);
        try {
          return JSON.stringify(processed);
        } catch {
          return '';
        }
      }
      if (typeof value === 'string') return value;
      if (value === undefined || value === null || value === '') return '';
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    if (question.type === 'FILE_UPLOAD') {
      return this.saveFileUploadValue(value, question.uploadConfig, context);
    }
    if (question.type === 'DATE') return normalizeDateString(value);
    if (Array.isArray(value)) return value.join(', ');
    return value === undefined || value === null ? '' : value;
  }

  buildCandidateValues(formObject, questions) {
    const values = {};
    (questions || [])
      .filter(q => q && q.type !== 'BUTTON')
      .forEach(q => {
        values[q.id] = this.serializeQuestionValue(formObject, q);
      });
    return values;
  }

  async buildCandidateValuesForSave(formObject, questions, context = {}) {
    const values = {};
    for (const q of (questions || []).filter(question => question && question.type !== 'BUTTON')) {
      values[q.id] = await this.serializeQuestionValueForSave(formObject, q, context);
    }
    return values;
  }

  shouldReturnUploadValues(formObject) {
    const raw = formObject && formObject.__ckReturnUploadValues;
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }

  normalizeUploadValueForMeta(raw) {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) {
      return raw
        .map(item => this.normalizeUploadValueForMeta(item))
        .map(part => part.trim())
        .filter(Boolean)
        .join(', ');
    }
    if (typeof raw === 'object' && typeof raw.url === 'string') return raw.url.trim();
    return raw.toString().trim();
  }

  buildUploadValuesMeta(questions, candidateValues) {
    const top = {};
    const line = [];
    const collectRows = (groupKey, groupCfg, rows) => {
      const fields = Array.isArray(groupCfg && groupCfg.fields) ? groupCfg.fields : [];
      const fileFields = fields.filter(field => field && field.type === 'FILE_UPLOAD' && field.id);
      const subGroups = Array.isArray(groupCfg && groupCfg.subGroups) ? groupCfg.subGroups : [];
      (Array.isArray(rows) ? rows : []).forEach(row => {
        if (!row || typeof row !== 'object') return;
        const rowId = (row.__ckRowId || row.id || '').toString().trim();
        if (rowId) {
          fileFields.forEach(field => {
            line.push({
              groupId: groupKey,
              rowId,
              fieldId: field.id.toString(),
              value: this.normalizeUploadValueForMeta(row[field.id])
            });
          });
        }
        subGroups.forEach(sub => {
          const subId = this.resolveSubgroupKey(sub);
          if (!subId || !Array.isArray(row[subId])) return;
          collectRows(`${groupKey}::${rowId}::${subId}`, sub, row[subId]);
        });
      });
    };

    (questions || []).filter(q => q && q.type !== 'BUTTON').forEach(q => {
      if (q.type === 'FILE_UPLOAD') {
        top[q.id] = this.normalizeUploadValueForMeta(candidateValues[q.id]);
        return;
      }
      if (q.type !== 'LINE_ITEM_GROUP' || !q.lineItemConfig) return;
      const rawRows = candidateValues[q.id];
      const rows = (() => {
        if (Array.isArray(rawRows)) return rawRows;
        if (typeof rawRows === 'string' && rawRows.trim()) {
          try {
            const parsed = JSON.parse(rawRows);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      })();
      collectRows(q.id, q.lineItemConfig, rows);
    });

    return { top, line };
  }

  findRecordDataRowIndex(sheet, recordId) {
    const target = (recordId || '').toString().trim();
    if (!target || sheet.columns.recordId === undefined) return -1;
    return sheet.dataRows.findIndex(row => (this.value(row, sheet.columns.recordId) || '').toString().trim() === target);
  }

  hasMeaningfulChanges(existingRow, nextRow, columns) {
    const ignored = new Set(
      [columns.timestamp, columns.dataVersion, columns.createdAt, columns.updatedAt]
        .filter(idx => idx !== undefined)
        .map(idx => Number(idx))
    );
    const width = Math.max(existingRow.length, nextRow.length);
    for (let idx = 0; idx < width; idx += 1) {
      if (ignored.has(idx)) continue;
      if (normalizeCellComparable(existingRow[idx]) !== normalizeCellComparable(nextRow[idx])) return true;
    }
    return false;
  }

  rowMetadata(sheet, row, rowNumber, recordId, operation) {
    const meta = {
      id: recordId,
      createdAt: this.value(row, sheet.columns.createdAt),
      updatedAt: this.value(row, sheet.columns.updatedAt) || this.value(row, sheet.columns.createdAt),
      dataVersion: toNumber(this.value(row, sheet.columns.dataVersion)),
      rowNumber,
      operation
    };
    if ((operation || '').toString().trim().toLowerCase() === 'noop') {
      meta.noop = true;
      meta.noopReason = 'unchanged';
    }
    return meta;
  }

  async deleteRecordById(sheet, recordId) {
    const target = (recordId || '').toString().trim();
    if (!target) return { deleted: false };
    const rowIndex = this.findRecordDataRowIndex(sheet, target);
    if (rowIndex < 0) return { deleted: false };
    const rowNumber = rowIndex + 2;
    if (!this.sheetsClient || typeof this.sheetsClient.deleteRow !== 'function') {
      throw new Error('Google Sheets deleteRow support is not configured.');
    }
    await this.sheetsClient.deleteRow(sheet.spreadsheetId, sheet.destinationTab, rowNumber);
    const indexSheetName = getRecordIndexSheetName(sheet.destinationTab);
    try {
      await this.sheetsClient.deleteRow(sheet.spreadsheetId, indexSheetName, rowNumber);
    } catch {
      // Index sheets are best-effort in the Cloud Run adapter.
    }
    return { deleted: true, rowNumber };
  }

  async checkDedupConflict(formObject) {
    const formKey = (formObject && (formObject.formKey || formObject.form) ? formObject.formKey || formObject.form : '').toString();
    const sheet = await this.loadSheet(formKey);
    const language = normalizeLanguage(formObject && formObject.language);
    const candidateValues = this.buildCandidateValues(formObject || {}, sheet.questions);
    const candidateId = (formObject && formObject.id ? formObject.id : '').toString().trim();
    const rules = this.getDedupRules(sheet.formKey);
    if (!rules.length) return { success: true };
    const existing = sheet.dataRows
      .map((row, index) => this.buildRecord(sheet, row, index + 2))
      .filter(Boolean)
      .map(record => ({
        id: record.id,
        rowNumber: record.rowNumber,
        values: record.values || {}
      }));
    const conflict = findDedupConflict(rules, { id: candidateId, values: candidateValues }, existing, language);
    return conflict ? { success: true, conflict } : { success: true };
  }

  async saveStatusOnlyWithId(formObject) {
    const payload = formObject && typeof formObject === 'object' ? formObject : {};
    const formKey = (payload.formKey || payload.form || '').toString();
    const recordId = (payload.id || '').toString().trim();
    const explicitStatus = (payload.__ckStatus || payload.status || '').toString().trim();
    if (!recordId) {
      return { success: false, message: 'Record ID is required.', meta: {} };
    }
    if (!explicitStatus) {
      return { success: false, message: 'Status is required.', meta: { id: recordId } };
    }

    const sheet = await this.loadSheet(formKey);
    if (sheet.columns.recordId === undefined) {
      throw new Error(`Destination tab ${sheet.destinationTab} is missing the Record ID header.`);
    }
    const existingIndex = this.findRecordDataRowIndex(sheet, recordId);
    if (existingIndex < 0) {
      return { success: false, message: 'Record not found.', meta: { id: recordId } };
    }

    const existingRow = sheet.dataRows[existingIndex] || [];
    const destinationRowNumber = existingIndex + 2;
    const previousVersion = toNumber(this.value(existingRow, sheet.columns.dataVersion)) || 0;
    const clientVersion = payload.__ckClientDataVersion === undefined || payload.__ckClientDataVersion === null
      ? Number.NaN
      : Number(payload.__ckClientDataVersion);
    if (
      previousVersion > 0 &&
      Number.isFinite(clientVersion) &&
      clientVersion > 0 &&
      clientVersion < previousVersion
    ) {
      return {
        success: false,
        message: 'This record was modified by another user. Please refresh.',
        meta: {
          id: recordId,
          dataVersion: previousVersion,
          updatedAt: this.value(existingRow, sheet.columns.updatedAt),
          rowNumber: destinationRowNumber
        }
      };
    }

    const nextRow = normalizeRowValues(existingRow, sheet.headers.length);
    const setIf = (idx, value) => {
      if (idx === undefined) return;
      nextRow[idx] = value === undefined || value === null ? '' : value;
    };
    const statusFieldId = sheet.form.followupConfig && sheet.form.followupConfig.statusFieldId;
    const statusFieldIdx = statusFieldId ? sheet.columns.fields[statusFieldId] : undefined;
    const statusIdx = statusFieldIdx !== undefined ? statusFieldIdx : sheet.columns.status;
    setIf(statusIdx, explicitStatus);

    const now = new Date().toISOString();
    const createdAt = this.value(existingRow, sheet.columns.createdAt) || now;
    setIf(sheet.columns.timestamp, now);
    setIf(sheet.columns.updatedAt, now);
    setIf(sheet.columns.dataVersion, previousVersion + 1);

    await this.measure(`sheets.updateRow.${sheet.destinationTab}`, () =>
      this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheet.destinationTab, destinationRowNumber, nextRow)
    );
    sheet.dataRows[existingIndex] = nextRow.slice();

    const meta = {
      id: recordId,
      createdAt,
      updatedAt: now,
      dataVersion: previousVersion + 1,
      rowNumber: destinationRowNumber,
      operation: 'update',
      statusOnlyClose: true
    };
    try {
      const candidateRecord = this.buildRecord(sheet, nextRow, destinationRowNumber);
      const candidateValues = (candidateRecord && candidateRecord.values) || {};
      const dedupRules = this.getDedupRules(sheet.formKey);
      const dedupSignatures = {};
      recordIndexDedupRules(dedupRules).forEach(rule => {
        const signature = computeDedupSignature(rule, candidateValues);
        if (!signature) return;
        dedupSignatures[(rule.id || '').toString()] = signature;
      });
      await this.writeRecordIndexRow(sheet, {
        rowNumber: destinationRowNumber,
        recordId,
        dataVersion: previousVersion + 1,
        updatedAtIso: now,
        createdAtIso: createdAt,
        dedupRules,
        dedupSignatures
      });
    } catch {
      // The destination row is authoritative; index maintenance is best-effort in the Cloud Run adapter.
    }

    return {
      success: true,
      message: 'Record closed.',
      meta
    };
  }

  async saveSubmissionBatch(formObjects) {
    const records = (Array.isArray(formObjects) ? formObjects : []).filter(record => record && typeof record === 'object');
    if (!records.length) {
      return { success: true, message: 'No records to save.', metaById: {} };
    }
    const groups = new Map();
    records.forEach(record => {
      const formKey = (record.formKey || record.form || '').toString();
      if (!groups.has(formKey)) groups.set(formKey, []);
      groups.get(formKey).push(record);
    });

    const metaById = {};
    for (const [formKey, group] of groups.entries()) {
      const result = await this.saveSubmissionBatchForForm(formKey, group);
      if (!result.success) return result;
      Object.assign(metaById, result.metaById || {});
    }
    return {
      success: true,
      message: Object.keys(metaById).length ? 'Saved to sheet' : 'No changes to save.',
      metaById
    };
  }

  async saveSubmissionBatchForForm(formKey, records) {
    const payloads = (Array.isArray(records) ? records : []).filter(record => record && typeof record === 'object');
    if (!payloads.length) {
      return { success: true, message: 'No records to save.', metaById: {} };
    }
    const invalidPayload = payloads.find(payload => !isTruthyFlag(payload.__ckSkipSubmitEffects));
    if (invalidPayload) {
      return {
        success: false,
        message: 'Cloud Run Sheets writes require __ckSkipSubmitEffects=true until submit effects are migrated.',
        metaById: {}
      };
    }
    if (payloads.some(payload => (payload.__ckDeleteRecordId || '').toString().trim())) {
      const metaById = {};
      for (const payload of payloads) {
        const result = await this.saveSubmissionWithId(payload);
        if (!result.success) return { success: false, message: result.message, metaById };
        if (result.meta && result.meta.id) metaById[result.meta.id] = result.meta;
      }
      return { success: true, message: 'Saved to sheet', metaById };
    }

    const sheet = await this.loadSheet(formKey);
    if (sheet.columns.recordId === undefined) {
      throw new Error(`Destination tab ${sheet.destinationTab} is missing the Record ID header.`);
    }

    const dedupRules = this.getDedupRules(sheet.formKey);
    const existingRecords = () =>
      sheet.dataRows
        .map((row, index) => this.buildRecord(sheet, row, index + 2))
        .filter(Boolean)
        .map(record => ({
          id: record.id,
          rowNumber: record.rowNumber,
          values: record.values || {}
        }));
    const changedRowsByNumber = new Map();
    const appendRows = [];
    const metaById = {};
    const indexEntries = [];
    const auditEntries = [];
    const appendBaseRowNumber = sheet.dataRows.length + 2;

    for (const payload of payloads) {
      const language = normalizeLanguage(payload.language);
      const recordId = (payload.id || '').toString().trim() || createRecordId();
      const existingIndex = this.findRecordDataRowIndex(sheet, recordId);
      const existingRow = existingIndex >= 0 ? sheet.dataRows[existingIndex] || [] : null;
      const destinationRowNumber = existingIndex >= 0 ? existingIndex + 2 : appendBaseRowNumber + appendRows.length;
      const nextRow = existingRow ? existingRow.slice() : new Array(sheet.headers.length).fill('');
      while (nextRow.length < sheet.headers.length) nextRow.push('');

      const autoIncrementValues = this.applyAutoIncrementFields(sheet, payload, existingRow);
      const candidateValues = await this.buildCandidateValuesForSave(payload, sheet.questions, {
        spreadsheetId: sheet.spreadsheetId
      });
      const setIf = (idx, value) => {
        if (idx === undefined) return;
        nextRow[idx] = value === undefined || value === null ? '' : value;
      };

      setIf(sheet.columns.language, language);
      setIf(sheet.columns.recordId, recordId);
      Object.entries(candidateValues).forEach(([fieldId, value]) => {
        const idx = sheet.columns.fields[fieldId];
        if (idx === undefined) return;
        setIf(idx, value);
      });

      const transitions = sheet.form.followupConfig && sheet.form.followupConfig.statusTransitions;
      const statusFieldId = sheet.form.followupConfig && sheet.form.followupConfig.statusFieldId;
      const statusFieldIdx = statusFieldId ? sheet.columns.fields[statusFieldId] : undefined;
      const statusIdx = statusFieldIdx !== undefined ? statusFieldIdx : sheet.columns.status;
      const explicitStatus = (payload.__ckStatus || payload.status || '').toString().trim();
      const saveMode = (payload.__ckSaveMode || '').toString().trim().toLowerCase();
      if (saveMode === 'draft' || explicitStatus) {
        const inProgressStatus =
          resolveStatusTransitionValue(transitions, 'inProgress', language) ||
          (sheet.form.autoSave && sheet.form.autoSave.status ? sheet.form.autoSave.status.toString() : '') ||
          'In progress';
        setIf(statusIdx, explicitStatus || inProgressStatus);
      }
      if (payload.pdfUrl !== undefined) setIf(sheet.columns.pdfUrl, payload.pdfUrl);

      const previousVersion = existingRow ? toNumber(this.value(existingRow, sheet.columns.dataVersion)) || 0 : 0;
      const clientVersion = payload.__ckClientDataVersion === undefined || payload.__ckClientDataVersion === null
        ? Number.NaN
        : Number(payload.__ckClientDataVersion);
      if (
        existingRow &&
        previousVersion > 0 &&
        Number.isFinite(clientVersion) &&
        clientVersion > 0 &&
        clientVersion < previousVersion
      ) {
        return {
          success: false,
          message: 'This record was modified by another user. Please refresh.',
          metaById
        };
      }

      if (existingRow && isNoopIfUnchangedRequested(payload) && !this.hasMeaningfulChanges(existingRow, nextRow, sheet.columns)) {
        metaById[recordId] = this.rowMetadata(sheet, existingRow, destinationRowNumber, recordId, 'noop');
        continue;
      }

      const conflict = findDedupConflict(dedupRules, { id: recordId, values: candidateValues }, existingRecords(), language);
      if (conflict) {
        return {
          success: false,
          message: conflict.message || 'Duplicate record.',
          metaById
        };
      }

      const now = new Date().toISOString();
      const createdAt = existingRow ? this.value(existingRow, sheet.columns.createdAt) || now : now;
      setIf(sheet.columns.timestamp, now);
      setIf(sheet.columns.createdAt, createdAt);
      setIf(sheet.columns.updatedAt, now);
      setIf(sheet.columns.dataVersion, previousVersion + 1);

      if (existingRow) {
        changedRowsByNumber.set(destinationRowNumber, nextRow);
        sheet.dataRows[existingIndex] = nextRow.slice();
      } else {
        appendRows.push({ rowNumber: destinationRowNumber, values: nextRow });
        sheet.dataRows.push(nextRow.slice());
      }

      const meta = {
        id: recordId,
        createdAt,
        updatedAt: now,
        dataVersion: previousVersion + 1,
        rowNumber: destinationRowNumber,
        operation: existingRow ? 'update' : 'create'
      };
      if (Object.keys(autoIncrementValues).length) {
        meta.autoIncrementValues = autoIncrementValues;
      }
      metaById[recordId] = meta;

      const dedupSignatures = {};
      recordIndexDedupRules(dedupRules).forEach(rule => {
        const signature = computeDedupSignature(rule, candidateValues);
        if (!signature) return;
        dedupSignatures[(rule.id || '').toString()] = signature;
      });
      indexEntries.push({
        rowNumber: destinationRowNumber,
        recordId,
        dataVersion: previousVersion + 1,
        updatedAtIso: now,
        createdAtIso: createdAt,
        dedupRules,
        dedupSignatures
      });
      auditEntries.push({
        beforeRowValues: existingRow || undefined,
        afterRowValues: nextRow,
        changedAtIso: now,
        recordId,
        rowNumber: destinationRowNumber,
        auditAction: payload.__ckAuditAction,
        deviceInfo: payload.__ckDeviceInfo
      });
    }

    const updateRanges = Array.from(changedRowsByNumber.entries()).map(([rowNumber, row]) => ({
      range: `${escapeSheetName(sheet.destinationTab)}!A${rowNumber}:${columnName(row.length)}${rowNumber}`,
      values: [row]
    }));
    if (updateRanges.length && typeof this.sheetsClient.batchUpdateValues === 'function') {
      await this.measure(`sheets.batchUpdateValues.${sheet.destinationTab}`, () =>
        this.sheetsClient.batchUpdateValues(sheet.spreadsheetId, updateRanges)
      );
    } else {
      for (const [rowNumber, row] of changedRowsByNumber.entries()) {
        await this.measure(`sheets.updateRow.${sheet.destinationTab}`, () =>
          this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheet.destinationTab, rowNumber, row)
        );
      }
    }

    if (appendRows.length) {
      const rows = appendRows.map(entry => entry.values);
      if (typeof this.sheetsClient.appendRows === 'function') {
        await this.measure(`sheets.appendRows.${sheet.destinationTab}`, () =>
          this.sheetsClient.appendRows(sheet.spreadsheetId, sheet.destinationTab, rows)
        );
      } else if (typeof this.sheetsClient.batchUpdateValues === 'function') {
        const data = appendRows.map(entry => ({
          range: `${escapeSheetName(sheet.destinationTab)}!A${entry.rowNumber}:${columnName(entry.values.length)}${entry.rowNumber}`,
          values: [entry.values]
        }));
        await this.measure(`sheets.batchAppendFallback.${sheet.destinationTab}`, () =>
          this.sheetsClient.batchUpdateValues(sheet.spreadsheetId, data)
        );
      } else {
        for (const entry of appendRows) {
          await this.measure(`sheets.appendFallbackRow.${sheet.destinationTab}`, () =>
            this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheet.destinationTab, entry.rowNumber, entry.values)
          );
        }
      }
    }

    try {
      await this.writeRecordIndexRows(sheet, indexEntries);
    } catch {
      // The response row is authoritative; index maintenance is best-effort in the Cloud Run adapter.
    }
    for (const entry of auditEntries) {
      try {
        await this.writeAuditRows(sheet, entry);
      } catch {
        // Audit logging must not block the primary guarded save path.
      }
    }
    if (this.timing && typeof this.timing.increment === 'function') {
      this.timing.increment('batchedRecordsSaved', Object.keys(metaById).length);
    }
    return {
      success: true,
      message: Object.keys(metaById).length ? 'Saved to sheet' : 'No changes to save.',
      metaById
    };
  }

  async saveSubmissionWithId(formObject) {
    const payload = formObject && typeof formObject === 'object' ? formObject : {};
    const formKey = (payload.formKey || payload.form || '').toString();
    if (!isTruthyFlag(payload.__ckSkipSubmitEffects)) {
      return {
        success: false,
        message: 'Cloud Run Sheets writes require __ckSkipSubmitEffects=true until submit effects are migrated.',
        meta: { id: (payload.id || '').toString().trim() || undefined }
      };
    }

    const sheet = await this.loadSheet(formKey);
    if (sheet.columns.recordId === undefined) {
      throw new Error(`Destination tab ${sheet.destinationTab} is missing the Record ID header.`);
    }
    const rawDeleteRecordId = (payload.__ckDeleteRecordId || '').toString().trim();
    const deleteOnKeyChangeEnabled =
      sheet.form.dedupDeleteOnKeyChange === true || sheet.form.dedupRecreateOnKeyChange === true;
    if (rawDeleteRecordId && deleteOnKeyChangeEnabled) {
      const deleted = await this.deleteRecordById(sheet, rawDeleteRecordId);
      if (!deleted.deleted) {
        return {
          success: false,
          message: 'Failed to delete previous record.',
          meta: { id: rawDeleteRecordId }
        };
      }
      return {
        success: true,
        message: 'Deleted previous record.',
        meta: {
          id: rawDeleteRecordId,
          rowNumber: deleted.rowNumber,
          updatedAt: new Date().toISOString()
        }
      };
    }
    const language = normalizeLanguage(payload.language);
    const recordId = (payload.id || '').toString().trim() || createRecordId();
    const existingIndex = this.findRecordDataRowIndex(sheet, recordId);
    const existingRow = existingIndex >= 0 ? sheet.dataRows[existingIndex] || [] : null;
    const destinationRowNumber = existingIndex >= 0 ? existingIndex + 2 : sheet.dataRows.length + 2;
    const nextRow = existingRow ? existingRow.slice() : new Array(sheet.headers.length).fill('');
    while (nextRow.length < sheet.headers.length) nextRow.push('');

    const autoIncrementValues = this.applyAutoIncrementFields(sheet, payload, existingRow);
    const candidateValues = await this.buildCandidateValuesForSave(payload, sheet.questions, {
      spreadsheetId: sheet.spreadsheetId
    });
    const dedupRules = this.getDedupRules(sheet.formKey);

    const setIf = (idx, value) => {
      if (idx === undefined) return;
      nextRow[idx] = value === undefined || value === null ? '' : value;
    };

    setIf(sheet.columns.language, language);
    setIf(sheet.columns.recordId, recordId);
    Object.entries(candidateValues).forEach(([fieldId, value]) => {
      const idx = sheet.columns.fields[fieldId];
      if (idx === undefined) return;
      setIf(idx, value);
    });

    const transitions = sheet.form.followupConfig && sheet.form.followupConfig.statusTransitions;
    const statusFieldId = sheet.form.followupConfig && sheet.form.followupConfig.statusFieldId;
    const statusFieldIdx = statusFieldId ? sheet.columns.fields[statusFieldId] : undefined;
    const statusIdx = statusFieldIdx !== undefined ? statusFieldIdx : sheet.columns.status;
    const explicitStatus = (payload.__ckStatus || payload.status || '').toString().trim();
    const saveMode = (payload.__ckSaveMode || '').toString().trim().toLowerCase();
    if (saveMode === 'draft' || explicitStatus) {
      const inProgressStatus =
        resolveStatusTransitionValue(transitions, 'inProgress', language) ||
        (sheet.form.autoSave && sheet.form.autoSave.status ? sheet.form.autoSave.status.toString() : '') ||
        'In progress';
      setIf(statusIdx, explicitStatus || inProgressStatus);
    }
    if (payload.pdfUrl !== undefined) setIf(sheet.columns.pdfUrl, payload.pdfUrl);

    const previousVersion = existingRow ? toNumber(this.value(existingRow, sheet.columns.dataVersion)) || 0 : 0;
    const clientVersion = payload.__ckClientDataVersion === undefined || payload.__ckClientDataVersion === null
      ? Number.NaN
      : Number(payload.__ckClientDataVersion);
    if (
      existingRow &&
      previousVersion > 0 &&
      Number.isFinite(clientVersion) &&
      clientVersion > 0 &&
      clientVersion < previousVersion
    ) {
      return {
        success: false,
        message: 'This record was modified by another user. Please refresh.',
        meta: {
          id: recordId,
          dataVersion: previousVersion,
          updatedAt: this.value(existingRow, sheet.columns.updatedAt),
          rowNumber: destinationRowNumber
        }
      };
    }

    if (existingRow && isNoopIfUnchangedRequested(payload) && !this.hasMeaningfulChanges(existingRow, nextRow, sheet.columns)) {
      const meta = this.rowMetadata(sheet, existingRow, destinationRowNumber, recordId, 'noop');
      if (this.shouldReturnUploadValues(payload)) {
        meta.uploadValues = this.buildUploadValuesMeta(sheet.questions, candidateValues);
      }
      return {
        success: true,
        message: 'No changes to save.',
        meta
      };
    }

    const existingRecords = sheet.dataRows
      .map((row, index) => this.buildRecord(sheet, row, index + 2))
      .filter(Boolean)
      .map(record => ({
        id: record.id,
        rowNumber: record.rowNumber,
        values: record.values || {}
      }));
    const conflict = findDedupConflict(dedupRules, { id: recordId, values: candidateValues }, existingRecords, language);
    if (conflict) {
      return {
        success: false,
        message: conflict.message || 'Duplicate record.',
        meta: { id: recordId }
      };
    }

    const now = new Date().toISOString();
    const createdAt = existingRow ? this.value(existingRow, sheet.columns.createdAt) || now : now;
    setIf(sheet.columns.timestamp, now);
    setIf(sheet.columns.createdAt, createdAt);
    setIf(sheet.columns.updatedAt, now);
    setIf(sheet.columns.dataVersion, previousVersion + 1);

    await this.measure(`sheets.updateRow.${sheet.destinationTab}`, () =>
      this.sheetsClient.updateRowValues(sheet.spreadsheetId, sheet.destinationTab, destinationRowNumber, nextRow)
    );
    if (existingIndex >= 0) sheet.dataRows[existingIndex] = nextRow.slice();
    else sheet.dataRows.push(nextRow.slice());

    const meta = {
      id: recordId,
      createdAt,
      updatedAt: now,
      dataVersion: previousVersion + 1,
      rowNumber: destinationRowNumber,
      operation: existingRow ? 'update' : 'create'
    };
    if (Object.keys(autoIncrementValues).length) {
      meta.autoIncrementValues = autoIncrementValues;
    }
    try {
      const dedupSignatures = {};
      recordIndexDedupRules(dedupRules).forEach(rule => {
        const signature = computeDedupSignature(rule, candidateValues);
        if (!signature) return;
        dedupSignatures[(rule.id || '').toString()] = signature;
      });
      await this.writeRecordIndexRow(sheet, {
        rowNumber: destinationRowNumber,
        recordId,
        dataVersion: previousVersion + 1,
        updatedAtIso: now,
        createdAtIso: createdAt,
        dedupRules,
        dedupSignatures
      });
    } catch {
      // The response row is authoritative; index maintenance is best-effort in the Cloud Run adapter.
    }
    try {
      await this.writeAuditRows(sheet, {
        beforeRowValues: existingRow || undefined,
        afterRowValues: nextRow,
        changedAtIso: now,
        recordId,
        rowNumber: destinationRowNumber,
        auditAction: payload.__ckAuditAction,
        deviceInfo: payload.__ckDeviceInfo
      });
    } catch {
      // Audit logging must not block the primary guarded save path.
    }
    if (this.shouldReturnUploadValues(payload)) {
      meta.uploadValues = this.buildUploadValuesMeta(sheet.questions, candidateValues);
    }

    return {
      success: true,
      message: 'Saved to sheet',
      meta
    };
  }

  itemFromRecord(record, projection) {
    const item = {
      id: record.id,
      __rowNumber: record.rowNumber,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      dataVersion: record.dataVersion,
      status: record.status,
      pdfUrl: record.pdfUrl
    };
    (Array.isArray(projection) ? projection : []).forEach(fieldId => {
      const key = (fieldId || '').toString();
      if (!key) return;
      if (record.values && Object.prototype.hasOwnProperty.call(record.values, key)) item[key] = record.values[key];
    });
    return item;
  }

  async records(formKey) {
    const sheet = await this.loadSheet(formKey);
    return sheet.dataRows
      .map((row, index) => this.buildRecord(sheet, row, index + 2))
      .filter(Boolean);
  }

  etag(records) {
    const hash = crypto.createHash('sha1');
    records.forEach(record => {
      hash.update(record.id || '');
      hash.update('|');
      hash.update(record.updatedAt ? record.updatedAt.toString() : '');
      hash.update('|');
      hash.update(record.dataVersion !== undefined ? record.dataVersion.toString() : '');
      hash.update('\n');
    });
    return hash.digest('hex');
  }

  async fetchSubmissions(formKey, projection, requestedPageSize = 10, pageToken) {
    const records = (await this.records(formKey)).slice(0, MAX_LIST_ROWS);
    const offset = decodePageToken(pageToken);
    const size = pageSize(requestedPageSize);
    const page = records.slice(offset, offset + size);
    const nextOffset = offset + page.length;
    return {
      items: page.map(record => this.itemFromRecord(record, projection)),
      nextPageToken: nextOffset < records.length ? encodePageToken(nextOffset) : undefined,
      totalCount: records.length,
      etag: this.etag(records)
    };
  }

  applyDateFilter(records, sort) {
    const fieldId = (sort && sort.__dateFieldId ? sort.__dateFieldId : '').toString().trim();
    if (!fieldId) return records;
    const equals = (sort.__dateEquals || '').toString().trim();
    const from = (sort.__dateFrom || '').toString().trim();
    const to = (sort.__dateTo || '').toString().trim();
    if (!equals && !from && !to) return records;
    return records.filter(record => {
      const value = normalizeDateString(record.values ? record.values[fieldId] : '');
      if (!value) return false;
      if (equals) return value === normalizeDateString(equals);
      if (from && value < normalizeDateString(from)) return false;
      if (to && value > normalizeDateString(to)) return false;
      return true;
    });
  }

  sortRecords(records, sort) {
    const fieldId = (sort && sort.fieldId ? sort.fieldId : '').toString().trim();
    if (!fieldId) return records;
    const direction = ((sort.direction || '').toString().trim().toLowerCase() === 'desc' ? 'desc' : 'asc');
    return records.slice().sort((a, b) => {
      const aValue = normalizeSortable(a[fieldId] !== undefined ? a[fieldId] : a.values && a.values[fieldId]);
      const bValue = normalizeSortable(b[fieldId] !== undefined ? b[fieldId] : b.values && b.values[fieldId]);
      if (aValue < bValue) return direction === 'desc' ? 1 : -1;
      if (aValue > bValue) return direction === 'desc' ? -1 : 1;
      const aUpdated = normalizeSortable(a.updatedAt);
      const bUpdated = normalizeSortable(b.updatedAt);
      if (aUpdated < bUpdated) return 1;
      if (aUpdated > bUpdated) return -1;
      return (a.id || '').localeCompare(b.id || '');
    });
  }

  async fetchSubmissionsBatch(formKey, projection, requestedPageSize = 10, pageToken, includePageRecords = true, recordIds) {
    const list = await this.fetchSubmissions(formKey, projection, requestedPageSize, pageToken);
    const records = {};
    if (includePageRecords) {
      const all = await this.records(formKey);
      const byId = new Map(all.map(record => [record.id, record]));
      list.items.forEach(item => {
        const record = byId.get(item.id);
        if (record) records[record.id] = record;
      });
      (Array.isArray(recordIds) ? recordIds : []).forEach(id => {
        const record = byId.get((id || '').toString());
        if (record) records[record.id] = record;
      });
    }
    return { list, records };
  }

  async fetchSubmissionsSortedBatch(
    formKey,
    projection,
    requestedPageSize = 10,
    pageToken,
    includePageRecords = true,
    recordIds,
    sort
  ) {
    let records = await this.records(formKey);
    records = this.applyDateFilter(records, sort);
    records = this.sortRecords(records, sort).slice(0, MAX_LIST_ROWS);
    const etag = this.etag(records);
    const offset = decodePageToken(pageToken);
    const ifNoneMatch = sort && (sort.__ifNoneMatch === true || sort.ifNoneMatch === true);
    const clientEtag = (sort && (sort.__clientEtag || sort.clientEtag) ? sort.__clientEtag || sort.clientEtag : '').toString();
    if (ifNoneMatch && clientEtag && clientEtag === etag && offset <= 0) {
      return { list: { items: [], totalCount: records.length, etag, notModified: true }, records: {} };
    }
    const size = pageSize(requestedPageSize, MAX_SORTED_PAGE_SIZE);
    const page = records.slice(offset, offset + size);
    const nextOffset = offset + page.length;
    const list = {
      items: page.map(record => this.itemFromRecord(record, projection)),
      nextPageToken: nextOffset < records.length ? encodePageToken(nextOffset) : undefined,
      totalCount: records.length,
      etag
    };
    const recordMap = {};
    if (includePageRecords) {
      const byId = new Map(records.map(record => [record.id, record]));
      page.forEach(record => {
        recordMap[record.id] = record;
      });
      (Array.isArray(recordIds) ? recordIds : []).forEach(id => {
        const record = byId.get((id || '').toString());
        if (record) recordMap[record.id] = record;
      });
    }
    return { list, records: recordMap };
  }

  async fetchSubmissionById(formKey, id) {
    const target = (id || '').toString().trim();
    if (!target) return null;
    return (await this.records(formKey)).find(record => record.id === target) || null;
  }

  async fetchSubmissionByRowNumber(formKey, rowNumber) {
    const target = Number(rowNumber);
    if (!Number.isFinite(target) || target < 2) return null;
    return (await this.records(formKey)).find(record => record.rowNumber === target) || null;
  }

  async fetchSubmissionsByRowNumbers(formKey, rowNumbers) {
    const requested = new Set(
      (Array.isArray(rowNumbers) ? rowNumbers : [])
        .map(Number)
        .filter(value => Number.isFinite(value) && value >= 2)
    );
    const out = {};
    (await this.records(formKey)).forEach(record => {
      if (requested.has(record.rowNumber)) out[record.id] = record;
    });
    return out;
  }

  async getRecordVersion(formKey, recordId, rowNumberHint) {
    const record =
      (recordId ? await this.fetchSubmissionById(formKey, recordId) : null) ||
      (rowNumberHint ? await this.fetchSubmissionByRowNumber(formKey, rowNumberHint) : null);
    if (!record) return { success: false, message: 'Record not found.' };
    return {
      success: true,
      id: record.id,
      rowNumber: record.rowNumber,
      dataVersion: record.dataVersion,
      updatedAt: record.updatedAt
    };
  }
}

const createSubmissionRepository = deps =>
  deps && deps.submissionRepository ? deps.submissionRepository : new GoogleSheetsSubmissionRepository(deps || {});

module.exports = {
  GoogleSheetsSubmissionRepository,
  createSubmissionRepository,
  decodePageToken,
  encodePageToken
};
