const { createGoogleGmailClient } = require('../googleGmailClient');
const { findItemValue } = require('./dataSourceUtils');

const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';
const PDF_MIME_TYPE = 'application/pdf';

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeAction = value => toText(value).toUpperCase();

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
    this.submissionRepository = options.submissionRepository;
    this.submitEffectsRepository = options.submitEffectsRepository;
    this.inventoryReservationRepository = options.inventoryReservationRepository || null;
    this.templateRepository = options.templateRepository || null;
    this.dataSourceRepository = options.dataSourceRepository || null;
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
    const normalizedMessage = toText(message) || 'Failed to run follow-up actions.';
    const effectiveActions = Array.isArray(actions) && actions.length ? actions : [''];
    return {
      success: false,
      results: effectiveActions.map(action => ({
        action,
        result: {
          success: false,
          message: normalizedMessage
        }
      }))
    };
  }

  isGmailConfigured() {
    if (!this.gmailClient || typeof this.gmailClient.sendEmail !== 'function') return false;
    if (typeof this.gmailClient.isConfigured === 'function') return this.gmailClient.isConfigured();
    return true;
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

  async runReconcileReservations(formKey, form, recordId) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    if (!this.inventoryReservationRepository) {
      return { success: false, message: 'Inventory reservation repository is not configured.' };
    }
    const config = this.resolveReservationReconciliationConfig(form);
    if (!config.enabled) {
      return { success: false, message: 'Reservation reconciliation is not configured for this form.' };
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

  async runCreatePdf(context, recordId, runtime) {
    if (!recordId) return { success: false, message: 'Record ID is required.' };
    if (!this.templateRepository || typeof this.templateRepository.renderPdfArtifactFromTemplate !== 'function') {
      return { success: false, message: 'Template repository is not configured for Cloud Run PDF generation.' };
    }
    const followup = (context.form && context.form.followupConfig) || {};
    if (!followup.pdfTemplateId) return { success: false, message: 'PDF template ID missing in follow-up config.' };
    const record = await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
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
    const status = toText(resolveLocalizedText(followup.statusTransitions && followup.statusTransitions.onPdf, record.language, ''));
    const statusFieldId = toText(followup.statusFieldId);
    if (status && statusFieldId) nextValues[statusFieldId] = status;
    const result = await this.submitEffectsRepository.saveSubmissionWithId(
      this.buildFollowupMutationPayload(context, record, nextValues, status || toText(record.status), artifact.url, 'followup.createPdf')
    );
    if (!result || !result.success) {
      return { success: false, message: (result && result.message) || 'Failed to save generated PDF metadata.' };
    }
    const meta = result.meta || {};
    return {
      success: true,
      status: status || record.status,
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

  async triggerFollowupAction(formKey, recordId, action) {
    const batch = await this.triggerFollowupActions(formKey, recordId, [action]);
    return (batch.results && batch.results[0] && batch.results[0].result) || {
      success: false,
      message: 'Failed to run follow-up action.'
    };
  }

  async triggerFollowupActions(formKey, recordId, actions) {
    const normalizedActions = Array.isArray(actions)
      ? actions.map(entry => toText(entry)).filter(Boolean)
      : [];
    if (!normalizedActions.length) return this.buildBatchFailure([], 'No follow-up actions provided.');
    const normalizedRecordId = toText(recordId);
    if (!normalizedRecordId) return this.buildBatchFailure(normalizedActions, 'Record ID is required.');

    const context = this.getFormContext(formKey);
    const results = [];
    const runtime = {};
    if (normalizedActions.map(normalizeAction).includes('SEND_EMAIL') && !this.isGmailConfigured()) {
      throw new Error(
        'Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'
      );
    }
    for (let index = 0; index < normalizedActions.length; index += 1) {
      const action = normalizedActions[index];
      const result = await this.runFollowupAction(context, normalizedRecordId, action, runtime);
      results.push({ action, result });
      if (!result || !result.success) {
        for (let remainingIndex = index + 1; remainingIndex < normalizedActions.length; remainingIndex += 1) {
          results.push({
            action: normalizedActions[remainingIndex],
            result: {
              success: false,
              message: `Skipped because ${action} failed.`
            }
          });
        }
        break;
      }
    }
    return {
      success: results.every(entry => !!entry.result && !!entry.result.success),
      results
    };
  }
}

const createFollowupRepository = deps => new FollowupRepository(deps || {});

module.exports = {
  FollowupRepository,
  createFollowupRepository
};
