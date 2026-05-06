const crypto = require('crypto');

const { createGoogleGmailClient } = require('../googleGmailClient');
const { createGoogleSheetsClient } = require('../googleSheetsClient');
const {
  normalizeFollowupAction: normalizeAction,
  normalizeFollowupActions,
  buildFollowupBatchFailureResult,
  buildSkippedFollowupActionResults,
  isFollowupBatchSuccess,
  resolveParallelReconcileFollowupPlan
} = require('../domain/followupActionPlan');
const { findItemValue } = require('./dataSourceUtils');

const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';
const PDF_MIME_TYPE = 'application/pdf';
const EMAIL_OUTBOX_SHEET_NAME = '__CK_FOLLOWUP_EMAIL_OUTBOX';
const EMAIL_OUTBOX_HEADERS = [
  'Job ID',
  'Form Key',
  'Record ID',
  'PDF Artifact JSON',
  'Queued At (ISO)',
  'Status',
  'Attempts',
  'Next Attempt At (ISO)',
  'Processed At (ISO)',
  'Message',
  'Result JSON'
];
const EMAIL_OUTBOX_MAX_ATTEMPTS = 3;

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const isMissingSheetError = err => /Unable to parse range|Google Sheets tab not found|not found|does not exist/i.test(toText(err && err.message));

const buildSubgroupKey = (parentGroupId, parentRowId, subGroupId) =>
  `${toText(parentGroupId)}::${toText(parentRowId)}::${toText(subGroupId)}`;

const toFiniteNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLanguage = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] || value[0] : value;
  const language = toText(raw || 'EN').toUpperCase();
  return ['EN', 'FR', 'NL'].includes(language) ? language : 'EN';
};

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
  const key = normalizeLanguage(language).toLowerCase();
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

class FollowupRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.submissionRepository = options.submissionRepository;
    this.submitEffectsRepository = options.submitEffectsRepository;
    this.inventoryReservationRepository = options.inventoryReservationRepository || null;
    this.templateRepository = options.templateRepository || null;
    this.dataSourceRepository = options.dataSourceRepository || null;
    this.sheetsClient = options.sheetsClient || createGoogleSheetsClient(options);
    this.gmailClient = options.gmailClient || options.emailClient || createGoogleGmailClient(options);
  }

  ensureRepositories() {
    if (!this.submissionRepository) throw new Error('Submission repository is not configured.');
    if (!this.submitEffectsRepository) throw new Error('Submit effects repository is not configured.');
  }

  getFormContext(formKey) {
    this.ensureRepositories();
    return this.submissionRepository.getFormContext(formKey);
  }

  buildBatchFailure(actions, message) {
    return buildFollowupBatchFailureResult(actions, message);
  }

  isGmailConfigured() {
    if (!this.gmailClient || typeof this.gmailClient.sendEmail !== 'function') return false;
    if (typeof this.gmailClient.isConfigured === 'function') return this.gmailClient.isConfigured();
    return true;
  }

  getSpreadsheetId() {
    return toText(this.env.CK_DEFAULT_SPREADSHEET_ID || this.env.CK_GOOGLE_SHEETS_SPREADSHEET_ID || this.env.CK_SPREADSHEET_ID);
  }

  normalizePdfArtifact(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const fileId = toText(raw.fileId);
    const url = toText(raw.url || raw.pdfUrl);
    const buffer = raw.buffer && Buffer.isBuffer(raw.buffer) ? raw.buffer : null;
    const pdfBase64 = toText(raw.pdfBase64);
    if (!fileId && !url && !buffer && !pdfBase64) return null;
    return {
      success: raw.success !== false,
      message: raw.message,
      fileId: fileId || undefined,
      url: url || undefined,
      pdfUrl: url || undefined,
      buffer: buffer || undefined,
      pdfBase64: pdfBase64 || undefined
    };
  }

  async ensureEmailOutboxSheet() {
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for follow-up email outbox writes.');
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      if (typeof this.sheetsClient.addSheet !== 'function') throw err;
      await this.sheetsClient.addSheet(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME, { hidden: true });
      rows = [];
    }
    const headers = (rows[0] || []).map(toText);
    const needsHeader =
      headers.length < EMAIL_OUTBOX_HEADERS.length ||
      EMAIL_OUTBOX_HEADERS.some((header, index) => headers[index] !== header);
    if (needsHeader) {
      await this.sheetsClient.updateRowValues(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME, 1, EMAIL_OUTBOX_HEADERS);
      rows[0] = EMAIL_OUTBOX_HEADERS;
    }
    return { spreadsheetId, rows };
  }

  emailOutboxRowToJob(row, index) {
    const artifactJson = toText(row[3]);
    let pdfArtifact = null;
    if (artifactJson) {
      try {
        pdfArtifact = this.normalizePdfArtifact(JSON.parse(artifactJson));
      } catch {
        pdfArtifact = null;
      }
    }
    return {
      rowNumber: index + 1,
      id: toText(row[0]),
      formKey: toText(row[1]),
      recordId: toText(row[2]),
      pdfArtifact,
      queuedAt: toText(row[4]),
      status: toText(row[5]).toLowerCase(),
      attempts: Math.max(0, Number(row[6] || 0) || 0),
      nextAttemptAt: toText(row[7])
    };
  }

  async updateEmailOutboxRow(spreadsheetId, rowNumber, updates) {
    const currentRows = await this.sheetsClient.getSheetValues(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME);
    const next = (currentRows[rowNumber - 1] || []).slice();
    while (next.length < EMAIL_OUTBOX_HEADERS.length) next.push('');
    Object.entries(updates || {}).forEach(([key, value]) => {
      const index = Number(key);
      if (!Number.isFinite(index)) return;
      next[index] = value === undefined || value === null ? '' : value;
    });
    await this.sheetsClient.updateRowValues(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME, rowNumber, next);
  }

  async enqueueFollowupEmail(formKey, recordId, options = {}) {
    const normalizedFormKey = toText(formKey);
    const normalizedRecordId = toText(recordId);
    if (!normalizedFormKey || !normalizedRecordId) return { success: false, message: 'formKey and recordId are required.' };
    const { spreadsheetId, rows } = await this.ensureEmailOutboxSheet();
    const pdfArtifact = this.normalizePdfArtifact(options && options.pdfArtifact);
    const artifactKey = toText(pdfArtifact && (pdfArtifact.fileId || pdfArtifact.url || pdfArtifact.pdfUrl));
    const duplicate = rows
      .slice(1)
      .map((row, index) => this.emailOutboxRowToJob(row, index + 1))
      .find(job => {
        if (!job.id || !['', 'pending', 'retry', 'running'].includes(job.status)) return false;
        const existingArtifactKey = toText(job.pdfArtifact && (job.pdfArtifact.fileId || job.pdfArtifact.url || job.pdfArtifact.pdfUrl));
        return job.formKey === normalizedFormKey && job.recordId === normalizedRecordId && existingArtifactKey === artifactKey;
      });
    if (duplicate) {
      return {
        success: true,
        queued: true,
        jobId: duplicate.id,
        message: 'Final report email already queued.',
        pdfUrl: pdfArtifact && (pdfArtifact.url || pdfArtifact.pdfUrl),
        fileId: pdfArtifact && pdfArtifact.fileId
      };
    }

    const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    await this.sheetsClient.appendRows(spreadsheetId, EMAIL_OUTBOX_SHEET_NAME, [
      [
        jobId,
        normalizedFormKey,
        normalizedRecordId,
        pdfArtifact ? JSON.stringify(pdfArtifact) : '',
        new Date().toISOString(),
        'pending',
        0,
        '',
        '',
        '',
        ''
      ]
    ]);
    return {
      success: true,
      queued: true,
      jobId,
      message: 'Final report email queued.',
      pdfUrl: pdfArtifact && (pdfArtifact.url || pdfArtifact.pdfUrl),
      fileId: pdfArtifact && pdfArtifact.fileId
    };
  }

  async runQueuedFollowupEmailJobs(options = {}) {
    const { spreadsheetId, rows } = await this.ensureEmailOutboxSheet();
    const nowIso = new Date().toISOString();
    const limit = Math.max(1, Math.min(Number(options.limit || 10) || 10, 50));
    const pending = rows
      .slice(1)
      .map((row, index) => this.emailOutboxRowToJob(row, index + 1))
      .filter(job => {
        if (!job.id || !job.formKey || !job.recordId) return false;
        if (!['', 'pending', 'retry'].includes(job.status)) return false;
        return !job.nextAttemptAt || job.nextAttemptAt <= nowIso;
      })
      .slice(0, limit);

    const errors = [];
    let processed = 0;
    let retried = 0;
    let failed = 0;
    for (const job of pending) {
      const attempts = Number(job.attempts || 0) + 1;
      await this.updateEmailOutboxRow(spreadsheetId, job.rowNumber, {
        5: 'running',
        6: attempts,
        8: new Date().toISOString(),
        9: ''
      });
      try {
        const result = await this.triggerFollowupAction(job.formKey, job.recordId, 'SEND_EMAIL', {
          pdfArtifact: job.pdfArtifact || undefined
        });
        if (!result || !result.success) throw new Error((result && result.message) || 'Failed to send queued follow-up email.');
        await this.updateEmailOutboxRow(spreadsheetId, job.rowNumber, {
          5: 'done',
          8: new Date().toISOString(),
          9: result.message || 'Sent.',
          10: JSON.stringify(result)
        });
        processed += 1;
      } catch (err) {
        const message = toText(err && err.message) || 'Failed to send queued follow-up email.';
        errors.push(`${job.formKey}/${job.recordId}: ${message}`);
        if (attempts < EMAIL_OUTBOX_MAX_ATTEMPTS) {
          const nextAttemptAt = new Date(Date.now() + attempts * 60_000).toISOString();
          await this.updateEmailOutboxRow(spreadsheetId, job.rowNumber, {
            5: 'retry',
            6: attempts,
            7: nextAttemptAt,
            8: new Date().toISOString(),
            9: message
          });
          retried += 1;
        } else {
          await this.updateEmailOutboxRow(spreadsheetId, job.rowNumber, {
            5: 'error',
            6: attempts,
            8: new Date().toISOString(),
            9: message
          });
          failed += 1;
        }
      }
    }

    return {
      success: errors.length === 0,
      processed,
      retried,
      failed,
      errors
    };
  }

  resolveReservationReconciliationConfig(form) {
    const raw = form && form.reservationLifecycle && form.reservationLifecycle.reconcileOnFinalSubmit;
    const enabled = raw === true || (raw && typeof raw === 'object' && raw.enabled !== false);
    if (!enabled) return { enabled: false, ledgerFormKey: '', refreshMode: 'full' };
    const ledgerFormKey =
      (raw && typeof raw === 'object' ? raw.ledgerFormKey : '') ||
      (form.reservationLifecycle && form.reservationLifecycle.ledgerFormKey) ||
      DEFAULT_LEDGER_FORM_KEY;
    const refreshMode =
      raw && typeof raw === 'object' && ['full', 'revisionOnly', 'none'].includes(raw.refreshMode)
        ? raw.refreshMode
        : 'full';
    return {
      enabled: true,
      ledgerFormKey: toText(ledgerFormKey) || DEFAULT_LEDGER_FORM_KEY,
      refreshMode
    };
  }

  inferReservationFieldId(outputKeyFieldId, suffix) {
    const key = toText(outputKeyFieldId);
    const base = key.endsWith('_ID') ? key.slice(0, -3) : key;
    return base ? `${base}_${suffix}` : '';
  }

  collectStepReservationConfigs(form) {
    const steps =
      form && form.steps && form.steps.mode === 'guided' && Array.isArray(form.steps.items) ? form.steps.items : [];
    const configs = [];
    steps.forEach(step => {
      const include = Array.isArray(step && step.include) ? step.include : [];
      include.forEach(target => {
        if (!target || target.kind !== 'lineGroup') return;
        const parentGroupId = toText(target.id);
        if (!parentGroupId) return;
        const dataSourceRows = Array.isArray(target.dataSourceRows) ? target.dataSourceRows : [];
        dataSourceRows.forEach(config => {
          const reservation = config && config.reservation && typeof config.reservation === 'object' ? config.reservation : null;
          if (!reservation || reservation.enabled === false) return;
          if (toText(reservation.commitMode).toLowerCase() !== 'step') return;
          const outputGroupId = toText(config.outputGroupId);
          const outputKeyFieldId = toText(config.outputKeyFieldId || config.rowKeyFieldId);
          const quantityFieldId = toText(config.quantityFieldId);
          const resourceRecordIdFieldId =
            toText(reservation.resourceRecordIdFieldId) || this.inferReservationFieldId(outputKeyFieldId, 'RECORD_ID');
          if (!outputGroupId || !outputKeyFieldId || !quantityFieldId || !resourceRecordIdFieldId) return;
          configs.push({
            parentGroupId,
            outputGroupId,
            outputKeyFieldId,
            quantityFieldId,
            resourceRecordIdFieldId
          });
        });
      });
    });
    return configs;
  }

  parseRows(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  readRecordValue(record, fieldId) {
    const key = toText(fieldId);
    if (!record || !key) return undefined;
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, key)) return record.values[key];
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, `${key}_json`)) return record.values[`${key}_json`];
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
    return record[`${key}_json`];
  }

  readRowValue(row, fieldId) {
    const key = toText(fieldId);
    if (!row || !key) return undefined;
    if (row.values && Object.prototype.hasOwnProperty.call(row.values, key)) return row.values[key];
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    return row[`${key}_json`];
  }

  rowId(row) {
    return toText((row && (row.__ckRowId || row.id)) || '');
  }

  recordHasReservationSelections(form, record) {
    const configs = this.collectStepReservationConfigs(form);
    if (!configs.length) return true;
    if (!record) return false;
    return configs.some(config => {
      const parentRows = this.parseRows(this.readRecordValue(record, config.parentGroupId));
      return parentRows.some(parentRow => {
        const parentRowId = this.rowId(parentRow);
        const nestedRows = this.parseRows(this.readRowValue(parentRow, config.outputGroupId));
        const flattenedRows = parentRowId
          ? this.parseRows(this.readRecordValue(record, buildSubgroupKey(config.parentGroupId, parentRowId, config.outputGroupId)))
          : [];
        return [...nestedRows, ...flattenedRows].some(row => {
          const resourceRecordId = toText(this.readRowValue(row, config.resourceRecordIdFieldId));
          const resourceItemId = toText(this.readRowValue(row, config.outputKeyFieldId));
          const quantity = toFiniteNumber(this.readRowValue(row, config.quantityFieldId));
          return Boolean(resourceRecordId && resourceItemId && quantity > 0);
        });
      });
    });
  }

  buildSkippedReservationReconciliationResult(recordId) {
    return {
      success: true,
      message: 'No reservation selections found on the record.',
      reservationReconciliation: {
        success: true,
        sourceRecordId: recordId,
        reconciledReservations: 0,
        consumedReservations: 0,
        releasedReservations: 0,
        touchedInventoryRecords: 0
      }
    };
  }

  resolveCloseStatus(form, record) {
    const followup = (form && form.followupConfig) || {};
    const transitions = followup.statusTransitions || {};
    return toText(resolveLocalizedText(transitions.onClose, record && record.language, '')) || 'Closed';
  }

  buildClosePayload(context, record, closeStatus) {
    const values = cloneJson((record && record.values) || {});
    const statusFieldId = toText(context.form && context.form.followupConfig && context.form.followupConfig.statusFieldId);
    if (statusFieldId) values[statusFieldId] = closeStatus;
    const payload = {
      formKey: context.formKey,
      language: normalizeLanguage(record && record.language),
      id: toText(record && record.id),
      values,
      status: closeStatus,
      __ckStatus: closeStatus,
      __ckSaveMode: 'draft',
      __ckAllowClosedUpdate: '1'
    };
    Object.keys(values || {}).forEach(fieldId => {
      payload[fieldId] = values[fieldId];
    });
    if (record && record.pdfUrl !== undefined) payload.pdfUrl = record.pdfUrl;
    const dataVersion = Number(record && record.dataVersion);
    if (Number.isFinite(dataVersion) && dataVersion > 0) payload.__ckClientDataVersion = dataVersion;
    return payload;
  }

  buildFollowupMutationPayload(context, record, values, status, pdfUrl, auditAction) {
    const payload = {
      formKey: context.formKey,
      language: normalizeLanguage(record && record.language),
      id: toText(record && record.id),
      values,
      status: status || toText(record && record.status),
      __ckStatus: status || toText(record && record.status),
      __ckSaveMode: 'draft',
      __ckAllowClosedUpdate: '1',
      __ckSkipSubmitEffects: '1',
      __ckNoopIfUnchanged: '1',
      __ckAuditAction: auditAction
    };
    Object.keys(values || {}).forEach(fieldId => {
      payload[fieldId] = values[fieldId];
    });
    payload.pdfUrl = pdfUrl !== undefined ? pdfUrl : record && record.pdfUrl;
    const dataVersion = Number(record && record.dataVersion);
    if (Number.isFinite(dataVersion) && dataVersion > 0) {
      payload.__ckClientDataVersion = dataVersion;
    }
    return payload;
  }

  resolveSafeStatusTransition(followup, currentStatus, record, transition) {
    const next = toText(resolveLocalizedText(followup && followup.statusTransitions && followup.statusTransitions[transition], record && record.language, ''));
    if (transition === 'onClose') return next || 'Closed';
    const closeValue =
      toText(resolveLocalizedText(followup && followup.statusTransitions && followup.statusTransitions.onClose, record && record.language, '')) ||
      'Closed';
    if (closeValue && toText(currentStatus).toLowerCase() === closeValue.toLowerCase()) return '';
    return next;
  }

  applyPlaceholders(template, placeholders) {
    const renderers = this.templateRepository && this.templateRepository.renderers;
    if (renderers && typeof renderers.applyPlaceholders === 'function') {
      return renderers.applyPlaceholders(template || '', placeholders || {});
    }
    return (template || '').toString().replace(/{{[^}]+}}/g, token => {
      if (Object.prototype.hasOwnProperty.call(placeholders || {}, token)) return placeholders[token];
      return token;
    });
  }

  buildEmailPlaceholders(renderContext) {
    const renderers = this.templateRepository && this.templateRepository.renderers;
    if (
      !renderers ||
      typeof renderers.collectLineItemRows !== 'function' ||
      typeof renderers.buildPlaceholderMap !== 'function'
    ) {
      return {};
    }
    const lineItemRows = renderers.collectLineItemRows(renderContext.record, renderContext.questions);
    const placeholders = renderers.buildPlaceholderMap({
      record: renderContext.record,
      questions: renderContext.questions,
      lineItemRows,
      dataSources: renderContext.dataSources
    });
    if (typeof renderers.addLabelPlaceholders === 'function') {
      renderers.addLabelPlaceholders(placeholders, renderContext.questions, renderContext.record.language);
    }
    if (
      typeof renderers.collectValidationWarnings === 'function' &&
      typeof renderers.addPlaceholderVariants === 'function'
    ) {
      const warnings = renderers.collectValidationWarnings(renderContext.questions, renderContext.record);
      renderers.addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', warnings.join('\n'));
    }
    return placeholders;
  }

  async lookupRecipientFromDataSource(entry, lookupValue, language) {
    if (!lookupValue || !this.dataSourceRepository || typeof this.dataSourceRepository.fetchDataSource !== 'function') {
      return '';
    }
    const dataSource = entry && entry.dataSource && typeof entry.dataSource === 'object' ? entry.dataSource : {};
    const lookupField = toText(entry && entry.lookupField);
    const valueField = toText(entry && entry.valueField);
    if (!lookupField || !valueField) return '';
    const projection = Array.from(
      new Set(
        [
          ...(Array.isArray(dataSource.projection) ? dataSource.projection : []),
          lookupField,
          valueField
        ]
          .map(toText)
          .filter(Boolean)
      )
    );
    const response = await this.dataSourceRepository.fetchDataSource(
      { ...dataSource, projection },
      language,
      projection,
      Number(dataSource.limit || 200) || 200,
      undefined
    );
    const items = Array.isArray(response && response.items) ? response.items : [];
    const normalizedLookup = toText(lookupValue).toLowerCase();
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const matchValue = findItemValue(item, lookupField);
      if (toText(matchValue).toLowerCase() !== normalizedLookup) continue;
      const emailValue = findItemValue(item, valueField);
      if (emailValue && toText(emailValue)) return toText(emailValue);
    }
    return toText(entry && entry.fallbackEmail);
  }

  async resolveEmailRecipients(entries, placeholders, record) {
    if (!Array.isArray(entries) || !entries.length) return [];
    const resolved = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        const expanded = this.applyPlaceholders(entry, placeholders).trim();
        if (expanded) resolved.push(expanded);
        continue;
      }
      if (entry && entry.type === 'dataSource') {
        const lookupValue = record && record.values ? record.values[entry.recordFieldId] : '';
        const address = await this.lookupRecipientFromDataSource(entry, lookupValue, record && record.language);
        if (address) resolved.push(address);
      }
    }
    return resolved.filter(Boolean);
  }

  resolveTemplateId(templateIdMap, record) {
    const renderers = this.templateRepository && this.templateRepository.renderers;
    if (renderers && typeof renderers.resolveTemplateId === 'function') {
      return toText(renderers.resolveTemplateId(templateIdMap, record));
    }
    if (typeof templateIdMap === 'string') return toText(templateIdMap);
    if (!templateIdMap || typeof templateIdMap !== 'object') return '';
    const language = normalizeLanguage(record && record.language);
    return toText(templateIdMap[language] || templateIdMap[language.toLowerCase()] || templateIdMap.EN || templateIdMap.en);
  }

  async readEmailTemplateBody(followup, record) {
    const templateId = this.resolveTemplateId(followup && followup.emailTemplateId, record);
    if (!templateId) return { success: false, message: 'No email template matched the record values/language.' };
    if (!this.templateRepository || !this.templateRepository.fileRepository) {
      return { success: false, message: 'Drive file repository is not configured for email template reads.' };
    }
    if (typeof this.templateRepository.getTextTemplateBody === 'function') {
      const body = await this.templateRepository.getTextTemplateBody(templateId, ['text/plain']);
      return { success: true, templateId, body };
    }
    const fileRepository = this.templateRepository.fileRepository;
    if (typeof fileRepository.readTextFile !== 'function') {
      return { success: false, message: 'Drive file repository does not support email template reads.' };
    }
    const loaded = await fileRepository.readTextFile(templateId, ['text/plain']);
    return { success: true, templateId, body: loaded && loaded.raw ? loaded.raw : '' };
  }

  async renderEmailPdfArtifact(context, record, followup, runtime) {
    if (
      runtime &&
      runtime.pdfArtifact &&
      runtime.pdfArtifact.success &&
      (runtime.pdfArtifact.buffer || runtime.pdfArtifact.pdfBase64)
    ) {
      return runtime.pdfArtifact;
    }
    if (runtime && runtime.pdfArtifact && runtime.pdfArtifact.success && runtime.pdfArtifact.fileId) {
      const fileRepository = this.templateRepository && this.templateRepository.fileRepository;
      if (fileRepository && typeof fileRepository.downloadFileBuffer === 'function') {
        const downloaded = await fileRepository.downloadFileBuffer(runtime.pdfArtifact.fileId);
        return {
          ...runtime.pdfArtifact,
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType || PDF_MIME_TYPE,
          fileName: downloaded.name || runtime.pdfArtifact.fileName
        };
      }
    }
    if (!followup.pdfTemplateId) return null;
    if (!this.templateRepository || typeof this.templateRepository.renderPdfArtifactFromTemplate !== 'function') {
      return { success: false, message: 'Template repository is not configured for Cloud Run PDF generation.' };
    }
    const artifact = await this.templateRepository.renderPdfArtifactFromTemplate(
      context.formKey,
      { ...record, formKey: context.formKey },
      followup.pdfTemplateId,
      {
        folderId: followup.pdfFolderId,
        namePrefix: context.form.title || 'Form'
      }
    );
    if (runtime && artifact && artifact.success) runtime.pdfArtifact = artifact;
    return artifact;
  }

  async runReconcileReservations(formKey, form, recordId, sourceRecord) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    if (!this.inventoryReservationRepository) {
      return { success: false, message: 'Inventory reservation repository is not configured.' };
    }
    const config = this.resolveReservationReconciliationConfig(form);
    if (!config.enabled) {
      return { success: false, message: 'Reservation reconciliation is not configured for this form.' };
    }
    if (this.collectStepReservationConfigs(form).length) {
      const record =
        sourceRecord !== undefined ? sourceRecord : await this.submissionRepository.fetchSubmissionById(formKey, recordId);
      if (!this.recordHasReservationSelections(form, record)) {
        return this.buildSkippedReservationReconciliationResult(recordId);
      }
    }
    const result = await this.inventoryReservationRepository.reconcile({
      sourceFormKey: formKey,
      sourceRecordId: recordId,
      ledgerFormKey: config.ledgerFormKey,
      refreshMode: config.refreshMode
    });
    if (!result || !result.success) {
      return { success: false, message: (result && result.message) || 'Failed to reconcile active reservations.' };
    }
    return {
      success: true,
      reservationReconciliation: {
        success: true,
        sourceRecordId: recordId,
        reconciledReservations: Number(result.reconciledReservations || 0) || 0,
        consumedReservations: Number(result.consumedReservations || 0) || 0,
        releasedReservations: Number(result.releasedReservations || 0) || 0,
        touchedInventoryRecords: Number(result.touchedInventoryRecords || 0) || 0
      }
    };
  }

  async runCloseRecord(context, recordId) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    const record = await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
    if (!record) return { success: false, message: 'Record not found.' };
    const closeStatus = this.resolveCloseStatus(context.form, record);
    const result = await this.submitEffectsRepository.saveSubmissionWithId(this.buildClosePayload(context, record, closeStatus));
    if (!result || !result.success) {
      return { success: false, message: (result && result.message) || 'Failed to close record.' };
    }
    const meta = result.meta || {};
    const out = {
      success: true,
      status: closeStatus,
      updatedAt: meta.updatedAt,
      dataVersion: meta.dataVersion,
      rowNumber: meta.rowNumber
    };
    if (meta.submitEffects) out.submitEffects = meta.submitEffects;
    if (meta.reservationReconciliation) out.reservationReconciliation = meta.reservationReconciliation;
    return out;
  }

  async runCreatePdf(context, recordId, runtime, sourceRecord) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    if (!this.templateRepository || typeof this.templateRepository.renderPdfArtifactFromTemplate !== 'function') {
      return { success: false, message: 'Template repository is not configured for Cloud Run PDF generation.' };
    }
    const followup = (context.form && context.form.followupConfig) || {};
    if (!followup.pdfTemplateId) return { success: false, message: 'PDF template ID missing in follow-up config.' };
    const record = sourceRecord || await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
    if (!record) return { success: false, message: 'Record not found.' };
    const artifact = await this.templateRepository.renderPdfArtifactFromTemplate(
      context.formKey,
      { ...record, formKey: context.formKey },
      followup.pdfTemplateId,
      {
        folderId: followup.pdfFolderId,
        namePrefix: context.form.title || 'Form'
      }
    );
    if (!artifact || !artifact.success) {
      return { success: false, message: (artifact && artifact.message) || 'Failed to generate PDF.' };
    }
    if (runtime) runtime.pdfArtifact = artifact;
    const nextValues = cloneJson(record.values || {});
    const currentStatus = toText(record.status);
    const status = this.resolveSafeStatusTransition(followup, currentStatus, record, 'onPdf');
    const statusFieldId = toText(followup.statusFieldId);
    if (status && statusFieldId) nextValues[statusFieldId] = status;
    const result = await this.submitEffectsRepository.saveSubmissionWithId(
      this.buildFollowupMutationPayload(context, record, nextValues, status || currentStatus, artifact.url, 'followup.createPdf')
    );
    if (!result || !result.success) {
      return { success: false, message: (result && result.message) || 'Failed to save generated PDF metadata.' };
    }
    const meta = result.meta || {};
    return {
      success: true,
      status: status || currentStatus,
      pdfUrl: artifact.url,
      fileId: artifact.fileId,
      updatedAt: meta.updatedAt,
      dataVersion: meta.dataVersion,
      rowNumber: meta.rowNumber
    };
  }

  async runSendEmail(context, recordId, runtime) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    const followup = (context.form && context.form.followupConfig) || {};
    if (!followup.emailTemplateId) return { success: false, message: 'Email template ID missing in follow-up config.' };
    if (!Array.isArray(followup.emailRecipients) || !followup.emailRecipients.length) {
      return { success: false, message: 'Email recipients not configured.' };
    }
    if (!this.templateRepository || typeof this.templateRepository.createRenderContext !== 'function') {
      return { success: false, message: 'Template repository is not configured for Cloud Run email rendering.' };
    }
    if (!this.gmailClient || typeof this.gmailClient.sendEmail !== 'function') {
      return { success: false, message: 'Gmail client is not configured for Cloud Run email sending.' };
    }
    const record = await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
    if (!record) return { success: false, message: 'Record not found.' };

    const renderContext = await this.templateRepository.createRenderContext(context.formKey, {
      ...record,
      formKey: context.formKey
    }, { attachRelatedRecords: true });
    const placeholders = this.buildEmailPlaceholders(renderContext);
    const template = await this.readEmailTemplateBody(followup, renderContext.record);
    if (!template.success) return { success: false, message: template.message || 'Failed to read follow-up email template.' };

    const pdfArtifact = await this.renderEmailPdfArtifact(context, record, followup, runtime);
    if (pdfArtifact && !pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }

    const toRecipients = await this.resolveEmailRecipients(followup.emailRecipients, placeholders, renderContext.record);
    if (!toRecipients.length) return { success: false, message: 'Resolved email recipients are empty.' };
    const ccRecipients = await this.resolveEmailRecipients(followup.emailCc, placeholders, renderContext.record);
    const bccRecipients = await this.resolveEmailRecipients(followup.emailBcc, placeholders, renderContext.record);
    const body = this.applyPlaceholders(template.body || '', placeholders);
    const htmlBody = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br/>');
    const subject =
      toText(resolveLocalizedText(followup.emailSubject, renderContext.record.language, '')) ||
      `${context.form.title || 'Form'} submission ${record.id}`;
    const from = followup.emailFrom ? this.applyPlaceholders(followup.emailFrom, placeholders).trim() : '';
    const fromName = followup.emailFromName ? this.applyPlaceholders(followup.emailFromName, placeholders).trim() : '';
    const attachments = [];
    const pdfBuffer =
      pdfArtifact && pdfArtifact.buffer
        ? pdfArtifact.buffer
        : pdfArtifact && pdfArtifact.pdfBase64
          ? Buffer.from(pdfArtifact.pdfBase64, 'base64')
          : null;
    if (pdfBuffer) {
      attachments.push({
        fileName: pdfArtifact.fileName || `${context.form.title || 'Form'} - ${record.id}.pdf`,
        mimeType: pdfArtifact.mimeType || PDF_MIME_TYPE,
        buffer: pdfBuffer
      });
    }

    let emailResult;
    try {
      emailResult = await this.gmailClient.sendEmail({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        textBody: body || 'See attached PDF.',
        htmlBody: htmlBody || 'See attached PDF.',
        from,
        fromName,
        attachments
      });
    } catch (err) {
      return { success: false, message: err && err.message ? err.message : 'Failed to send follow-up email.' };
    }

    const nextValues = cloneJson(record.values || {});
    const currentStatus = toText(record.status);
    const status = this.resolveSafeStatusTransition(followup, currentStatus, record, 'onEmail');
    const statusFieldId = toText(followup.statusFieldId);
    if (status && statusFieldId) nextValues[statusFieldId] = status;
    const result = await this.submitEffectsRepository.saveSubmissionWithId(
      this.buildFollowupMutationPayload(
        context,
        record,
        nextValues,
        status || currentStatus,
        pdfArtifact && pdfArtifact.url !== undefined ? pdfArtifact.url : record.pdfUrl,
        'followup.sendEmail'
      )
    );
    if (!result || !result.success) {
      return { success: false, message: (result && result.message) || 'Failed to save email follow-up metadata.' };
    }
    const meta = result.meta || {};
    return {
      success: true,
      status: status || currentStatus,
      pdfUrl: pdfArtifact && pdfArtifact.url !== undefined ? pdfArtifact.url : record.pdfUrl,
      fileId: pdfArtifact && pdfArtifact.fileId,
      emailMessageId: emailResult && emailResult.id,
      emailThreadId: emailResult && emailResult.threadId,
      updatedAt: meta.updatedAt,
      dataVersion: meta.dataVersion,
      rowNumber: meta.rowNumber
    };
  }

  async runFollowupAction(context, recordId, action, runtime) {
    const normalizedAction = normalizeAction(action);
    if (normalizedAction === 'RECONCILE_RESERVATIONS') {
      return this.runReconcileReservations(context.formKey, context.form, recordId);
    }
    if (normalizedAction === 'CLOSE_RECORD') {
      return this.runCloseRecord(context, recordId);
    }
    if (normalizedAction === 'CREATE_PDF') {
      return this.runCreatePdf(context, recordId, runtime);
    }
    if (normalizedAction === 'SEND_EMAIL') {
      return this.runSendEmail(context, recordId, runtime);
    }
    return {
      success: false,
      message: `Follow-up action "${action}" is not implemented in Cloud Run yet.`
    };
  }

  async runTimedFollowupAction(action, task) {
    const startedAt = Date.now();
    const result = await task();
    if (result && typeof result === 'object') {
      result.durationMs = Date.now() - startedAt;
    }
    return { action, result };
  }

  buildEmailQueuePdfArtifact(pdfResult) {
    if (!pdfResult || !pdfResult.success) return undefined;
    const fileId = toText(pdfResult.fileId);
    const pdfUrl = toText(pdfResult.pdfUrl || pdfResult.url);
    if (!fileId && !pdfUrl) return undefined;
    return {
      pdfArtifact: {
        success: true,
        fileId: fileId || undefined,
        url: pdfUrl || undefined,
        pdfUrl: pdfUrl || undefined
      }
    };
  }

  async runParallelReconcilePdfFollowupActions(context, recordId, actions, options) {
    const plan = resolveParallelReconcileFollowupPlan(actions);
    if (!plan) return null;
    const runtime = {
      pdfArtifact: this.normalizePdfArtifact(options && options.pdfArtifact)
    };
    const sourceRecord = await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
    const reconcilePromise = this.runTimedFollowupAction(plan.reconcileAction, () =>
      this.runReconcileReservations(context.formKey, context.form, recordId, sourceRecord)
    );
    const pdfPromise = this.runTimedFollowupAction(plan.createPdfAction, () =>
      this.runCreatePdf(context, recordId, runtime, sourceRecord)
    );
    const [reconcileEntry, pdfEntry] = await Promise.all([reconcilePromise, pdfPromise]);
    const resultsByAction = new Map([
      [normalizeAction(plan.reconcileAction), reconcileEntry],
      [normalizeAction(plan.createPdfAction), pdfEntry]
    ]);

    if (plan.sendEmailAction) {
      const emailStartedAt = Date.now();
      if (reconcileEntry.result && reconcileEntry.result.success && pdfEntry.result && pdfEntry.result.success) {
        const emailResult = await this.enqueueFollowupEmail(
          context.formKey,
          recordId,
          this.buildEmailQueuePdfArtifact(pdfEntry.result)
        );
        if (emailResult && typeof emailResult === 'object') {
          emailResult.durationMs = Date.now() - emailStartedAt;
        }
        resultsByAction.set(normalizeAction(plan.sendEmailAction), {
          action: plan.sendEmailAction,
          result: emailResult
        });
      } else {
        resultsByAction.set(normalizeAction(plan.sendEmailAction), {
          action: plan.sendEmailAction,
          result: {
            success: false,
            message: 'Skipped because reconciliation or PDF creation did not complete successfully.',
            durationMs: Date.now() - emailStartedAt
          }
        });
      }
    }

    const results = plan.actions.map(action => resultsByAction.get(normalizeAction(action))).filter(Boolean);
    return {
      success: isFollowupBatchSuccess(results),
      results
    };
  }

  async triggerFollowupAction(formKey, recordId, action, options) {
    const batch = await this.triggerFollowupActions(formKey, recordId, [action], options);
    return (batch.results && batch.results[0] && batch.results[0].result) || {
      success: false,
      message: 'Failed to run follow-up action.'
    };
  }

  async triggerFollowupActions(formKey, recordId, actions, options) {
    const normalizedActions = normalizeFollowupActions(actions);
    if (!normalizedActions.length) return this.buildBatchFailure([], 'No follow-up actions provided.');
    const normalizedRecordId = toText(recordId);
    if (!normalizedRecordId) return this.buildBatchFailure(normalizedActions, 'Record ID is required.');

    const context = this.getFormContext(formKey);
    const parallelResult = await this.runParallelReconcilePdfFollowupActions(context, normalizedRecordId, normalizedActions, options);
    if (parallelResult) return parallelResult;

    const results = [];
    const runtime = {
      pdfArtifact: this.normalizePdfArtifact(options && options.pdfArtifact)
    };
    if (normalizedActions.map(normalizeAction).includes('SEND_EMAIL') && !this.isGmailConfigured()) {
      throw new Error(
        'Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'
      );
    }
    for (let index = 0; index < normalizedActions.length; index += 1) {
      const action = normalizedActions[index];
      const startedAt = Date.now();
      const result = await this.runFollowupAction(context, normalizedRecordId, action, runtime);
      if (result && typeof result === 'object') {
        result.durationMs = Date.now() - startedAt;
      }
      results.push({ action, result });
      if (!result || !result.success) {
        results.push(...buildSkippedFollowupActionResults(normalizedActions, index, action));
        break;
      }
    }
    return {
      success: isFollowupBatchSuccess(results),
      results
    };
  }
}

const createFollowupRepository = deps => new FollowupRepository(deps || {});

module.exports = {
  FollowupRepository,
  createFollowupRepository
};
