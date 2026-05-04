const path = require('path');
const crypto = require('crypto');

const { createGoogleDocsClient } = require('../googleDocsClient');

const GENERATED_RENDERER_PATH = path.join(__dirname, '..', 'generated', 'templateRenderers.cjs');
const templateFileCache = new Map();

const toText = value => (value === undefined || value === null ? '' : value.toString());

const normalizeLanguage = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] || value[0] : value;
  const language = (raw || 'EN').toString().trim().toUpperCase();
  return ['EN', 'FR', 'NL'].includes(language) ? language : 'EN';
};

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const isBundleTemplateId = templateId => /^bundle:\s*.+/i.test((templateId || '').toString().trim());

const isBundledHtmlPdfTemplate = templateId => {
  const normalized = (templateId || '').toString().trim().toLowerCase();
  return normalized.startsWith('bundle:') && normalized.endsWith('.pdf.html');
};

const sanitizeFileLabel = value =>
  (value || '')
    .toString()
    .replace(/[\\/]+/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeFileLabel = value => {
  if (value === undefined || value === null) return '';
  const text = sanitizeFileLabel(value.toString());
  const lowered = text.toLowerCase();
  if (!text || lowered === 'null' || lowered === 'undefined') return '';
  return text;
};

const resolveRecordFileLabel = (form, record) => {
  const fieldId = toText(form && form.followupConfig && form.followupConfig.pdfFileNameFieldId).trim();
  if (fieldId) {
    const lower = fieldId.toLowerCase();
    if (lower === 'id') return normalizeFileLabel(record && record.id);
    if (lower === 'createdat') return normalizeFileLabel(record && record.createdAt);
    if (lower === 'updatedat') return normalizeFileLabel(record && record.updatedAt);
    if (lower === 'status') return normalizeFileLabel(record && record.status);
    if (lower === 'pdfurl') return normalizeFileLabel(record && record.pdfUrl);
    const value = record && record.values ? record.values[fieldId] : undefined;
    const label = normalizeFileLabel(value);
    if (label) return label;
  }
  return normalizeFileLabel(record && record.id);
};

const wrapHtmlForPdf = rawHtml => {
  const input = (rawHtml || '').toString().trim();
  if (!input) return '<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>';
  const supportStyle =
    '<style>' +
    'html,body{margin:0;padding:0;}' +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    '</style>';
  if (/<html[\s>]/i.test(input)) {
    if (/<head[\s>]/i.test(input)) return input.replace(/<\/head>/i, `${supportStyle}</head>`);
    return input.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="UTF-8">${supportStyle}</head>`);
  }
  const leadingStyles = [];
  const bodyHtml = input.replace(/^\s*(<style[\s\S]*?<\/style>\s*)+/i, styles => {
    leadingStyles.push(styles);
    return '';
  });
  return (
    '<!doctype html><html><head><meta charset="UTF-8">' +
    supportStyle +
    leadingStyles.join('') +
    '</head><body>' +
    bodyHtml +
    '</body></html>'
  );
};

const base64UrlEncode = value => Buffer.from(value, 'utf8').toString('base64url');

const base64UrlDecode = value => Buffer.from((value || '').toString(), 'base64url').toString('utf8');

const signCleanupPayload = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const DEFAULT_PLACEHOLDER_RE = /{{\s*DEFAULT\s*\(\s*[\s\S]*?\s*\)\s*}}/gi;

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const loadTemplateRenderers = () => {
  try {
    return require(GENERATED_RENDERER_PATH);
  } catch (err) {
    const message = err && err.message ? err.message : err && err.toString ? err.toString() : 'unknown error';
    throw new Error(`Cloud Run template renderer bundle is not available. Run scripts/build-cloud-run-generated-assets.js. ${message}`);
  }
};

const makeBlob = entry => ({
  getDataAsString: () => entry.raw || '',
  getContentType: () => entry.mimeType || 'text/plain',
  getName: () => entry.name || entry.id || 'template'
});

const makeDriveFile = entry => ({
  getMimeType: () => entry.mimeType || 'text/plain',
  getName: () => entry.name || entry.id || 'template',
  getBlob: () => makeBlob(entry),
  getAs: mimeType => makeBlob({ ...entry, mimeType: mimeType || entry.mimeType })
});

const installDriveAppShim = () => {
  const globalAny = globalThis;
  if (globalAny.DriveApp && globalAny.DriveApp.__ckCloudRunTemplateShim) return;
  const previous = globalAny.DriveApp;
  globalAny.DriveApp = {
    __ckCloudRunTemplateShim: true,
    getFileById(fileId) {
      const id = toText(fileId).trim();
      const entry = templateFileCache.get(id);
      if (entry) return makeDriveFile(entry);
      if (previous && typeof previous.getFileById === 'function') return previous.getFileById(fileId);
      throw new Error(`Template file ${id} has not been loaded into the Cloud Run template cache.`);
    }
  };
};

const parseButtonRef = ref => {
  const raw = toText(ref);
  const token = '__ckQIdx=';
  const pos = raw.lastIndexOf(token);
  if (pos < 0) return { id: raw };
  const id = raw.slice(0, pos);
  const qIdx = Number.parseInt(raw.slice(pos + token.length), 10);
  if (!Number.isFinite(qIdx)) return { id: raw };
  return { id, qIdx };
};

const resolveButtonQuestion = (questions, parsed) => {
  const id = toText(parsed && parsed.id).trim();
  if (!id) return undefined;
  if (parsed.qIdx !== undefined && parsed.qIdx !== null && Number.isFinite(parsed.qIdx)) {
    const candidate = questions[parsed.qIdx];
    if (candidate && candidate.type === 'BUTTON' && candidate.id === id) return candidate;
  }
  return (questions || []).find(question => question && question.type === 'BUTTON' && question.id === id);
};

const collectTemplateIdsFromBase = base => {
  if (!base) return [];
  if (typeof base === 'string') return [base];
  if (typeof base === 'object') return Object.values(base).filter(Boolean);
  return [];
};

const collectTemplateIdsFromMap = map => {
  if (!map) return [];
  if (typeof map === 'string' || (typeof map === 'object' && !Array.isArray(map.cases))) {
    return collectTemplateIdsFromBase(map);
  }
  const out = [];
  (Array.isArray(map.cases) ? map.cases : []).forEach(entry => {
    out.push(...collectTemplateIdsFromBase(entry && entry.templateId));
  });
  out.push(...collectTemplateIdsFromBase(map.default));
  return Array.from(new Set(out.map(toText).map(item => item.trim()).filter(Boolean)));
};

const normalizeTemplateRenderRecord = (formObject, questions, formKey) => {
  const payload = formObject && typeof formObject === 'object' ? formObject : {};
  const values = payload.values && typeof payload.values === 'object' ? cloneJson(payload.values) : {};
  (questions || [])
    .filter(question => question && question.type !== 'BUTTON')
    .forEach(question => {
      if (Object.prototype.hasOwnProperty.call(values, question.id)) return;
      if (Object.prototype.hasOwnProperty.call(payload, question.id)) {
        values[question.id] = cloneJson(payload[question.id]);
        return;
      }
      if (question.type === 'LINE_ITEM_GROUP') {
        const jsonKey = `${question.id}_json`;
        if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) values[question.id] = payload[jsonKey];
      }
    });
  (questions || [])
    .filter(question => question && question.type === 'LINE_ITEM_GROUP')
    .forEach(question => {
      const raw = values[question.id];
      if (typeof raw === 'string' && raw.trim()) {
        try {
          values[question.id] = JSON.parse(raw);
        } catch {
          // Keep the original value when it is not JSON.
        }
      }
    });

  return {
    formKey,
    language: normalizeLanguage(payload.language),
    values,
    id: payload.id ? toText(payload.id) : undefined,
    createdAt: payload.createdAt ? toText(payload.createdAt) : undefined,
    updatedAt: payload.updatedAt ? toText(payload.updatedAt) : undefined,
    status: payload.status ? toText(payload.status) : undefined,
    pdfUrl: payload.pdfUrl ? toText(payload.pdfUrl) : undefined
  };
};

const collectDataSourceQuestions = questions => {
  const out = [];
  const visitLineItemConfig = cfg => {
    (Array.isArray(cfg && cfg.fields) ? cfg.fields : []).forEach(field => {
      if (field && field.dataSource) out.push(field);
    });
    (Array.isArray(cfg && cfg.subGroups) ? cfg.subGroups : []).forEach(visitLineItemConfig);
  };
  (questions || []).forEach(question => {
    if (!question) return;
    if (question.dataSource) out.push(question);
    if (question.type === 'LINE_ITEM_GROUP') visitLineItemConfig(question.lineItemConfig || {});
  });
  return out;
};

const dataSourceCacheKey = ds =>
  JSON.stringify({
    id: toText(ds && ds.id).trim(),
    sheetId: toText(ds && ds.sheetId).trim(),
    tabName: toText(ds && ds.tabName).trim()
  });

const buildLookupFields = ds => {
  const fields = [];
  if (ds && ds.mapping && typeof ds.mapping === 'object') {
    Object.entries(ds.mapping).forEach(([source, target]) => {
      if (target === 'value' || target === 'id') fields.push(source);
    });
  }
  if (Array.isArray(ds && ds.projection) && ds.projection.length) fields.push(ds.projection[0]);
  fields.push('value');
  return Array.from(new Set(fields.map(toText).map(item => item.trim()).filter(Boolean)));
};

const stringifyCell = value => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

class TemplateDataSources {
  constructor(dataSourceRepository) {
    this.dataSourceRepository = dataSourceRepository;
    this.cache = new Map();
  }

  async preload(questions, language) {
    const dataSourceQuestions = collectDataSourceQuestions(questions);
    for (const question of dataSourceQuestions) {
      const ds = question && question.dataSource;
      const key = dataSourceCacheKey(ds);
      if (!key || this.cache.has(key)) continue;
      const items = [];
      let pageToken;
      let pageCount = 0;
      do {
        const detailsConfig = { ...(ds || {}), projection: undefined, mapping: undefined };
        const limit = Math.max(1, Math.min(Number(ds && ds.limit) || 500, 500));
        const page = await this.dataSourceRepository.fetchDataSource(detailsConfig, language, undefined, limit, pageToken);
        const pageItems = Array.isArray(page && page.items) ? page.items.filter(item => item && typeof item === 'object') : [];
        items.push(...pageItems);
        pageToken = page && page.nextPageToken;
        pageCount += 1;
      } while (pageToken && pageCount < 20 && items.length < 10000);
      this.cache.set(key, items);
    }
  }

  lookupDataSourceDetails(question, selectedValue, _language) {
    if (!selectedValue || !question || !question.dataSource) return null;
    const normalized = toText(selectedValue).trim().toLowerCase();
    if (!normalized) return null;
    const items = this.cache.get(dataSourceCacheKey(question.dataSource)) || [];
    const lookupFields = buildLookupFields(question.dataSource);
    const matchesSelected = val => {
      if (val === undefined || val === null) return false;
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return false;
      return toText(val).trim().toLowerCase() === normalized;
    };
    const toDetails = item => {
      const result = {};
      Object.entries(item || {}).forEach(([key, val]) => {
        if (val === undefined || val === null) return;
        const sanitizedKey = key.split(/\s+/).join('_').toUpperCase();
        result[sanitizedKey] = stringifyCell(val);
      });
      return result;
    };

    let fallback = null;
    for (const item of items) {
      const matchField = lookupFields.find(field => item[field] !== undefined && item[field] !== null);
      if (matchField && matchesSelected(item[matchField])) return toDetails(item);
      if (!fallback && Object.values(item).some(matchesSelected)) fallback = item;
    }
    return fallback ? toDetails(fallback) : null;
  }

  fetchDataSource() {
    return { items: [], totalCount: 0 };
  }
}

class TemplateRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fileRepository = options.fileRepository;
    this.configRepository = options.configRepository;
    this.submissionRepository = options.submissionRepository;
    this.dataSourceRepository = options.dataSourceRepository;
    this.docsClient = options.docsClient || createGoogleDocsClient(options);
    this.renderers = options.templateRenderers || loadTemplateRenderers();
    this.previewCleanupTokens = options.previewCleanupTokens || new Map();
    installDriveAppShim();
  }

  resolveOutputFolderId(form, explicitFolderId) {
    const explicit = toText(explicitFolderId).trim();
    if (explicit) return explicit;
    const followupId = toText(form && form.followupConfig && form.followupConfig.pdfFolderId).trim();
    if (followupId) return followupId;
    const envFolder = toText(this.env.CK_PDF_FOLDER_ID || this.env.CK_OUTPUT_FOLDER_ID || this.env.CK_UPLOAD_FOLDER_ID).trim();
    if (envFolder) return envFolder;
    throw new Error('PDF output folder is not configured.');
  }

  issuePreviewCleanupToken(fileId) {
    const id = toText(fileId).trim();
    if (!id) return undefined;
    const secret = toText(this.env.CK_PREVIEW_CLEANUP_SECRET).trim();
    if (secret) {
      const payload = base64UrlEncode(JSON.stringify({ fileId: id, exp: Date.now() + 60 * 60 * 1000 }));
      return `v1.${payload}.${signCleanupPayload(payload, secret)}`;
    }
    const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(24).toString('hex');
    this.previewCleanupTokens.set(token, { fileId: id, expiresAt: Date.now() + 60 * 60 * 1000 });
    return token;
  }

  async trashPreviewArtifact(cleanupToken) {
    const token = toText(cleanupToken).trim();
    if (!token) return { success: false, message: 'cleanupToken is required.' };
    const secret = toText(this.env.CK_PREVIEW_CLEANUP_SECRET).trim();
    if (secret && token.startsWith('v1.')) {
      const parts = token.split('.');
      if (parts.length !== 3) return { success: false, message: 'Invalid cleanupToken.' };
      const expected = signCleanupPayload(parts[1], secret);
      const expectedBuffer = Buffer.from(expected);
      const actualBuffer = Buffer.from(parts[2]);
      if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return { success: false, message: 'Invalid cleanupToken.' };
      }
      let payload;
      try {
        payload = JSON.parse(base64UrlDecode(parts[1]));
      } catch {
        return { success: false, message: 'Invalid cleanupToken.' };
      }
      if (!payload || !payload.fileId || Date.now() > Number(payload.exp || 0)) return { success: true, message: 'Expired.' };
      if (!this.fileRepository || typeof this.fileRepository.trashFile !== 'function') {
        return { success: false, message: 'Drive file repository is not configured.' };
      }
      await this.fileRepository.trashFile(payload.fileId);
      return { success: true };
    }
    const entry = this.previewCleanupTokens.get(token);
    if (!entry || !entry.fileId || Date.now() > entry.expiresAt) {
      this.previewCleanupTokens.delete(token);
      return { success: true, message: 'Expired.' };
    }
    if (!this.fileRepository || typeof this.fileRepository.trashFile !== 'function') {
      return { success: false, message: 'Drive file repository is not configured.' };
    }
    await this.fileRepository.trashFile(entry.fileId);
    this.previewCleanupTokens.delete(token);
    return { success: true };
  }

  async loadDriveTemplate(templateId, preferredExportMimeTypes) {
    const id = toText(templateId).trim();
    if (!id || isBundleTemplateId(id) || templateFileCache.has(id)) return;
    if (!this.fileRepository || typeof this.fileRepository.readTextFile !== 'function') {
      throw new Error('Drive file repository is not configured for template reads.');
    }
    const loaded = await this.fileRepository.readTextFile(id, preferredExportMimeTypes);
    templateFileCache.set(id, {
      id,
      name: loaded.name || id,
      mimeType: loaded.mimeType || preferredExportMimeTypes[0] || 'text/plain',
      raw: loaded.raw || ''
    });
  }

  async loadSelectedTemplate(templateIdMap, record, preferredExportMimeTypes) {
    const templateId = this.renderers.resolveTemplateId(templateIdMap, record);
    if (!templateId) return '';
    await this.loadDriveTemplate(templateId, preferredExportMimeTypes);
    return templateId;
  }

  async createRenderContext(formKey, formObject, options = {}) {
    if (!this.configRepository || typeof this.configRepository.fetchFormConfig !== 'function') {
      throw new Error('Form config repository is not configured.');
    }
    if (!this.dataSourceRepository || typeof this.dataSourceRepository.fetchDataSource !== 'function') {
      throw new Error('Data source repository is not configured.');
    }
    const config = this.configRepository.fetchFormConfig(formKey);
    const form = config.form || {};
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const record = normalizeTemplateRenderRecord(formObject, questions, formKey);
    if (options.attachRelatedRecords) {
      await this.attachRelatedSubmitEffectRecords(record, form, formKey);
    }
    const dataSources = new TemplateDataSources(this.dataSourceRepository);
    await dataSources.preload(questions, record.language);
    return { form, questions, record, dataSources };
  }

  async attachRelatedSubmitEffectRecords(record, form, formKey) {
    const sourceRecordId = toText(record && record.id).trim();
    if (!sourceRecordId || !this.submissionRepository || typeof this.submissionRepository.records !== 'function') return;
    const effects = Array.isArray(form && form.followupConfig && form.followupConfig.submitEffects)
      ? form.followupConfig.submitEffects
      : [];
    if (!effects.length) return;
    const byTargetFormKey = {};
    for (const effect of effects) {
      const targetFormKey = toText(effect && effect.targetFormKey).trim();
      const sourceLink = effect && effect.sourceLink;
      const sourceRecordIdFieldId = toText(sourceLink && sourceLink.sourceRecordIdFieldId).trim();
      const sourceFormKeyFieldId = toText(sourceLink && sourceLink.sourceFormKeyFieldId).trim();
      if (!targetFormKey || !sourceRecordIdFieldId) continue;
      const records = await this.submissionRepository.records(targetFormKey);
      const related = (Array.isArray(records) ? records : [])
        .filter(targetRecord => {
          const values = (targetRecord && targetRecord.values) || {};
          const recordMatches = toText(values[sourceRecordIdFieldId]).trim() === sourceRecordId;
          const formMatches = !sourceFormKeyFieldId || toText(values[sourceFormKeyFieldId]).trim() === toText(formKey).trim();
          return recordMatches && formMatches;
        })
        .map(targetRecord => ({
          targetFormKey,
          recordId: targetRecord.id,
          values: cloneJson(targetRecord.values || {})
        }));
      if (related.length) byTargetFormKey[targetFormKey] = [...(byTargetFormKey[targetFormKey] || []), ...related];
    }
    if (!Object.keys(byTargetFormKey).length) return;
    const payload = { byTargetFormKey };
    record.__ckGeneratedSubmitEffectRecords = payload;
    record.values.__CK_GENERATED_SUBMIT_EFFECT_RECORDS_JSON = JSON.stringify(payload);
  }

  async renderHtmlTemplate(formObject, buttonId) {
    const formKey = toText((formObject && (formObject.formKey || formObject.form)) || '').trim();
    if (!formKey) return { success: false, message: 'Form key is required.' };
    const context = await this.createRenderContext(formKey, formObject);
    const parsed = parseButtonRef(buttonId);
    const button = resolveButtonQuestion(context.questions, parsed);
    const cfg = button && button.button;
    if (!button || !cfg || cfg.action !== 'renderHtmlTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }
    await this.loadSelectedTemplate(cfg.templateId, context.record, ['text/html', 'text/plain']);
    return this.renderers.renderHtmlFromHtmlTemplate({
      ...context,
      templateIdMap: cfg.templateId,
      namePrefix: `${context.form.title || 'Form'} - ${button.qEn || button.id}`
    });
  }

  async renderMarkdownTemplate(formObject, buttonId) {
    const formKey = toText((formObject && (formObject.formKey || formObject.form)) || '').trim();
    if (!formKey) return { success: false, message: 'Form key is required.' };
    const context = await this.createRenderContext(formKey, formObject);
    const parsed = parseButtonRef(buttonId);
    const button = resolveButtonQuestion(context.questions, parsed);
    const cfg = button && button.button;
    if (!button || !cfg || cfg.action !== 'renderMarkdownTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }
    await this.loadSelectedTemplate(cfg.templateId, context.record, ['text/plain']);
    return this.renderers.renderMarkdownFromTemplate({
      ...context,
      templateIdMap: cfg.templateId,
      namePrefix: `${context.form.title || 'Form'} - ${button.qEn || button.id}`
    });
  }

  async renderSummaryHtmlTemplate(formObject) {
    const formKey = toText((formObject && (formObject.formKey || formObject.form)) || '').trim();
    if (!formKey) return { success: false, message: 'Form key is required.' };
    const context = await this.createRenderContext(formKey, formObject, { attachRelatedRecords: true });
    const templateId = context.form.summaryHtmlTemplateId;
    if (!templateId) return { success: false, message: 'No summary HTML template configured for this form.' };
    await this.loadSelectedTemplate(templateId, context.record, ['text/html', 'text/plain']);
    return this.renderers.renderHtmlFromHtmlTemplate({
      ...context,
      templateIdMap: templateId,
      namePrefix: `${context.form.title || 'Form'} - Summary`
    });
  }

  async renderInlineHtmlTemplate(formObject, templateIdMap) {
    const formKey = toText((formObject && (formObject.formKey || formObject.form)) || '').trim();
    if (!formKey) return { success: false, message: 'Form key is required.' };
    if (!templateIdMap) return { success: false, message: 'templateIdMap is required.' };
    const context = await this.createRenderContext(formKey, formObject, { attachRelatedRecords: true });
    await this.loadSelectedTemplate(templateIdMap, context.record, ['text/html', 'text/plain']);
    return this.renderers.renderHtmlFromHtmlTemplate({
      ...context,
      templateIdMap,
      namePrefix: `${context.form.title || 'Form'} - Inline`
    });
  }

  async renderHtmlPdfTemplate(context, templateIdMap, options = {}) {
    const templateId = this.renderers.resolveTemplateId(templateIdMap, context.record);
    if (!templateId) return { success: false, message: 'No template matched the record values/language.' };
    if (!this.fileRepository) return { success: false, message: 'Drive file repository is not configured.' };
    const folderId = this.resolveOutputFolderId(context.form, options.folderId);
    const recordLabel = resolveRecordFileLabel(context.form, context.record);
    const baseName = `${options.namePrefix || context.form.title || 'Form'} - ${recordLabel || crypto.randomUUID()}`;
    if (!isBundledHtmlPdfTemplate(templateId)) {
      return {
        success: true,
        kind: 'googleDoc',
        context,
        templateId,
        folderId,
        baseName
      };
    }
    const rendered = this.renderers.renderHtmlFromHtmlTemplate({
      ...context,
      templateIdMap,
      namePrefix: options.namePrefix
    });
    if (!rendered || !rendered.success || !rendered.html) {
      return { success: false, message: (rendered && rendered.message) || 'Failed to render template.' };
    }
    return {
      success: true,
      kind: 'htmlPdf',
      html: wrapHtmlForPdf(rendered.html),
      folderId,
      baseName
    };
  }

  buildGoogleDocPlaceholderMap(context) {
    const lineItemRows = this.renderers.collectLineItemRows(context.record, context.questions);
    const placeholders = this.renderers.buildPlaceholderMap({
      record: context.record,
      questions: context.questions,
      lineItemRows,
      dataSources: context.dataSources
    });
    this.renderers.addLabelPlaceholders(placeholders, context.questions, context.record.language);
    if (typeof this.renderers.addConsolidatedPlaceholders === 'function') {
      this.renderers.addConsolidatedPlaceholders(placeholders, context.questions, lineItemRows);
    }
    const validationWarnings = this.renderers.collectValidationWarnings(context.questions, context.record);
    this.renderers.addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));
    return placeholders;
  }

  async loadGoogleDocTemplateText(templateId) {
    try {
      const loaded = await this.fileRepository.readTextFile(templateId, ['text/plain']);
      return (loaded && loaded.raw ? loaded.raw : '').toString();
    } catch {
      return '';
    }
  }

  async applyGoogleDocPlaceholders(copyId, context, templateId) {
    if (!this.docsClient || typeof this.docsClient.batchUpdate !== 'function') {
      throw new Error('Google Docs API client is not configured.');
    }
    const placeholders = this.buildGoogleDocPlaceholderMap(context);
    const templateText = await this.loadGoogleDocTemplateText(templateId);
    const requests = [];
    const defaultTokens = templateText.includes('DEFAULT')
      ? Array.from(new Set((templateText.match(DEFAULT_PLACEHOLDER_RE) || []).map(token => token.toString()).filter(Boolean)))
      : [];
    defaultTokens.forEach(token => {
      requests.push({
        replaceAllText: {
          containsText: { text: token, matchCase: true },
          replaceText: this.renderers.applyPlaceholders(token, placeholders) || ''
        }
      });
    });
    Object.entries(placeholders || {}).forEach(([token, value]) => {
      if (!token) return;
      requests.push({
        replaceAllText: {
          containsText: { text: token, matchCase: true },
          replaceText: value === undefined || value === null ? '' : value.toString()
        }
      });
    });
    for (const chunk of chunkArray(requests, 100)) {
      await this.docsClient.batchUpdate(copyId, chunk);
    }
  }

  async createRenderedGoogleDoc(prepared, options = {}) {
    if (!this.fileRepository || typeof this.fileRepository.copyFile !== 'function') {
      return { success: false, message: 'Drive file repository does not support Google Doc template copies.' };
    }
    const copyName = (options.name || prepared.baseName || 'document').toString().trim() || 'document';
    const copied = await this.fileRepository.copyFile(prepared.templateId, {
      name: copyName,
      folderId: prepared.folderId
    });
    const copyId = copied && (copied.fileId || copied.id) ? (copied.fileId || copied.id).toString() : '';
    if (!copyId) return { success: false, message: 'Failed to copy Google Doc template.' };
    try {
      await this.applyGoogleDocPlaceholders(copyId, prepared.context, prepared.templateId);
      return {
        success: true,
        fileId: copyId,
        url: copied.url || `https://docs.google.com/document/d/${copyId}/edit`,
        previewUrl: `https://docs.google.com/document/d/${copyId}/preview`,
        fileName: copyName
      };
    } catch (err) {
      try {
        await this.fileRepository.trashFile(copyId);
      } catch {
        // Best-effort cleanup.
      }
      throw err;
    }
  }

  async renderPdfArtifactFromTemplate(formKey, formObject, templateIdMap, options = {}) {
    const context = await this.createRenderContext(formKey, formObject, { attachRelatedRecords: true });
    const prepared = await this.renderHtmlPdfTemplate(context, templateIdMap, options);
    if (!prepared.success) return prepared;
    if (
      prepared.kind === 'googleDoc' &&
      (!this.fileRepository ||
        typeof this.fileRepository.exportGoogleDocToPdfBuffer !== 'function' ||
        typeof this.fileRepository.createFile !== 'function')
    ) {
      return { success: false, message: 'Drive file repository does not support Google Doc PDF creation.' };
    }
    if (prepared.kind !== 'googleDoc' && (!this.fileRepository || typeof this.fileRepository.createPdfFromHtml !== 'function')) {
      return { success: false, message: 'Drive file repository does not support PDF creation.' };
    }
    const created = prepared.kind === 'googleDoc'
      ? await (async () => {
          const doc = await this.createRenderedGoogleDoc(prepared);
          if (!doc.success) return doc;
          try {
            const pdfBuffer = await this.fileRepository.exportGoogleDocToPdfBuffer(doc.fileId);
            const pdfName = /\.pdf$/i.test(prepared.baseName) ? prepared.baseName : `${prepared.baseName}.pdf`;
            const pdfFile = await this.fileRepository.createFile(
              { name: pdfName, mimeType: 'application/pdf', buffer: pdfBuffer },
              { folderId: prepared.folderId }
            );
            return {
              success: true,
              url: (pdfFile && (pdfFile.webViewLink || pdfFile.webContentLink)) || (pdfFile && pdfFile.id ? `https://drive.google.com/open?id=${pdfFile.id}` : ''),
              fileId: pdfFile && pdfFile.id,
              buffer: pdfBuffer,
              mimeType: 'application/pdf',
              fileName: pdfName
            };
          } finally {
            try {
              await this.fileRepository.trashFile(doc.fileId);
            } catch {
              // Best-effort cleanup.
            }
          }
        })()
      : await this.fileRepository.createPdfFromHtml({
          html: prepared.html,
          name: prepared.baseName,
          folderId: prepared.folderId
        });
    if (created && created.success === false) return created;
    return {
      success: true,
      url: created.url,
      fileId: created.fileId,
      pdfBase64: created.buffer ? Buffer.from(created.buffer).toString('base64') : undefined,
      mimeType: created.mimeType || 'application/pdf',
      fileName: created.fileName || `${prepared.baseName}.pdf`
    };
  }

  async renderPdfPreviewFromTemplate(formKey, formObject, templateIdMap, options = {}) {
    const context = await this.createRenderContext(formKey, formObject, { attachRelatedRecords: true });
    const prepared = await this.renderHtmlPdfTemplate(context, templateIdMap, options);
    if (!prepared.success) return prepared;
    if (
      prepared.kind === 'googleDoc' &&
      (!this.fileRepository || typeof this.fileRepository.exportGoogleDocToPdfBuffer !== 'function')
    ) {
      return { success: false, message: 'Drive file repository does not support Google Doc PDF preview rendering.' };
    }
    if (prepared.kind !== 'googleDoc' && (!this.fileRepository || typeof this.fileRepository.renderPdfBufferFromHtml !== 'function')) {
      return { success: false, message: 'Drive file repository does not support PDF preview rendering.' };
    }
    const buffer = prepared.kind === 'googleDoc'
      ? await (async () => {
          const doc = await this.createRenderedGoogleDoc(prepared, { name: `${prepared.baseName} - Preview` });
          if (!doc.success) throw new Error(doc.message || 'Failed to render Google Doc preview.');
          try {
            return await this.fileRepository.exportGoogleDocToPdfBuffer(doc.fileId);
          } finally {
            try {
              await this.fileRepository.trashFile(doc.fileId);
            } catch {
              // Best-effort cleanup.
            }
          }
        })()
      : await this.fileRepository.renderPdfBufferFromHtml({
          html: prepared.html,
          name: `${prepared.baseName} - Preview`,
          folderId: prepared.folderId
        });
    return {
      success: true,
      pdfBase64: Buffer.from(buffer || '').toString('base64'),
      mimeType: 'application/pdf',
      fileName: `${prepared.baseName}.pdf`
    };
  }

  async renderDocPreviewFromTemplate(formKey, formObject, templateIdMap, options = {}) {
    const context = await this.createRenderContext(formKey, formObject, { attachRelatedRecords: true });
    const prepared = await this.renderHtmlPdfTemplate(context, templateIdMap, options);
    if (!prepared.success) return prepared;
    if (prepared.kind === 'googleDoc' && (!this.fileRepository || typeof this.fileRepository.copyFile !== 'function')) {
      return { success: false, message: 'Drive file repository does not support Google Doc template previews.' };
    }
    if (prepared.kind !== 'googleDoc' && (!this.fileRepository || typeof this.fileRepository.createGoogleDocFromHtml !== 'function')) {
      return { success: false, message: 'Drive file repository does not support preview document creation.' };
    }
    const doc = prepared.kind === 'googleDoc'
      ? await this.createRenderedGoogleDoc(prepared, { name: `${prepared.baseName} - Preview` })
      : await this.fileRepository.createGoogleDocFromHtml({
          html: prepared.html,
          name: `${prepared.baseName} - Preview`,
          folderId: prepared.folderId
        });
    if (doc && doc.success === false) return doc;
    const cleanupToken = this.issuePreviewCleanupToken(doc.fileId);
    return {
      success: true,
      previewFileId: doc.fileId,
      previewUrl: doc.previewUrl,
      cleanupToken
    };
  }

  resolveDocTemplateButtonContext(formObject, buttonId) {
    const formKey = toText(formObject && (formObject.formKey || formObject.form)).trim();
    if (!formKey) return { error: 'Form key is required.' };
    const config = this.configRepository.fetchFormConfig(formKey);
    const form = config.form || {};
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const parsed = parseButtonRef(buttonId);
    const button = resolveButtonQuestion(questions, parsed);
    const cfg = button && button.button;
    if (!button || !cfg || cfg.action !== 'renderDocTemplate' || !cfg.templateId) {
      return { error: `Unknown or misconfigured button "${buttonId}".` };
    }
    return {
      formKey,
      button,
      cfg,
      namePrefix: `${form.title || 'Form'} - ${button.qEn || button.id}`
    };
  }

  async renderDocTemplate(formObject, buttonId) {
    const resolved = this.resolveDocTemplateButtonContext(formObject, buttonId);
    if (resolved.error) return { success: false, message: resolved.error };
    const result = await this.renderPdfArtifactFromTemplate(resolved.formKey, formObject, resolved.cfg.templateId, {
      folderId: resolved.cfg.folderId,
      namePrefix: resolved.namePrefix
    });
    return result && result.success
      ? { success: true, pdfUrl: result.url, fileId: result.fileId }
      : { success: false, message: (result && result.message) || 'Failed to render template.' };
  }

  async renderDocTemplatePdfPreview(formObject, buttonId) {
    const resolved = this.resolveDocTemplateButtonContext(formObject, buttonId);
    if (resolved.error) return { success: false, message: resolved.error };
    const result = await this.renderPdfPreviewFromTemplate(resolved.formKey, formObject, resolved.cfg.templateId, {
      folderId: resolved.cfg.folderId,
      namePrefix: resolved.namePrefix
    });
    return result && result.success
      ? {
          success: true,
          pdfBase64: result.pdfBase64,
          mimeType: result.mimeType || 'application/pdf',
          fileName: result.fileName
        }
      : { success: false, message: (result && result.message) || 'Failed to generate PDF preview.' };
  }

  async renderDocTemplateHtml(formObject, buttonId) {
    const resolved = this.resolveDocTemplateButtonContext(formObject, buttonId);
    if (resolved.error) return { success: false, message: resolved.error };
    return this.renderDocPreviewFromTemplate(resolved.formKey, formObject, resolved.cfg.templateId, {
      folderId: resolved.cfg.folderId,
      namePrefix: resolved.namePrefix
    });
  }

  async renderSubmissionReportHtml(formObject) {
    const formKey = toText(formObject && (formObject.formKey || formObject.form)).trim();
    if (!formKey) return { success: false, message: 'Form key is required.' };
    const config = this.configRepository.fetchFormConfig(formKey);
    const form = config.form || {};
    const templateId = form.followupConfig && form.followupConfig.pdfTemplateId;
    if (!templateId) return { success: false, message: 'No follow-up PDF template configured for this form.' };
    return this.renderDocPreviewFromTemplate(formKey, formObject, templateId, {
      folderId: form.followupConfig && form.followupConfig.pdfFolderId,
      namePrefix: `${form.title || 'Form'} - Summary`
    });
  }

  async fetchSummaryRecord(formKey, language, id, rowNumber) {
    const requestedId = toText(id).trim();
    const requestedRow = Number(rowNumber);
    if (!requestedId && (!Number.isFinite(requestedRow) || requestedRow < 2)) {
      return { success: false, message: 'Record id or row number is required.' };
    }
    const config = this.configRepository.fetchFormConfig(formKey);
    const form = config.form || {};
    if (!form.summaryHtmlTemplateId) return { success: false, message: 'No summary HTML template configured for this form.' };
    let record = null;
    if (Number.isFinite(requestedRow) && requestedRow >= 2 && typeof this.submissionRepository.fetchSubmissionByRowNumber === 'function') {
      record = await this.submissionRepository.fetchSubmissionByRowNumber(formKey, requestedRow);
      if (requestedId && record && record.id && record.id !== requestedId) record = null;
    }
    if (!record && requestedId && typeof this.submissionRepository.fetchSubmissionById === 'function') {
      record = await this.submissionRepository.fetchSubmissionById(formKey, requestedId);
    }
    if (!record) return { success: false, message: 'Record not found.' };
    const renderRecord = { ...record, language: normalizeLanguage(language || record.language || 'EN') };
    const rendered = await this.renderSummaryHtmlTemplate({ ...renderRecord, formKey });
    if (!rendered || !rendered.success) {
      return { success: false, record, message: (rendered && rendered.message) || 'Failed to render summary.' };
    }
    return { success: true, record, html: rendered.html, fileName: rendered.fileName };
  }

  async prefetchTemplates(formKey) {
    const key = toText(formKey).trim();
    if (!key) return { success: false, message: 'formKey is required.' };
    const config = this.configRepository.fetchFormConfig(key);
    const form = config.form || {};
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const htmlIds = [];
    const markdownIds = [];
    const docIds = [];
    if (form.summaryHtmlTemplateId) htmlIds.push(...collectTemplateIdsFromMap(form.summaryHtmlTemplateId));
    if (form.followupConfig && form.followupConfig.pdfTemplateId) docIds.push(...collectTemplateIdsFromMap(form.followupConfig.pdfTemplateId));
    if (form.followupConfig && form.followupConfig.emailTemplateId) docIds.push(...collectTemplateIdsFromMap(form.followupConfig.emailTemplateId));
    questions
      .filter(question => question && question.type === 'BUTTON' && question.button && question.button.templateId)
      .forEach(question => {
        if (question.button.action === 'renderMarkdownTemplate') markdownIds.push(...collectTemplateIdsFromMap(question.button.templateId));
        if (question.button.action === 'renderHtmlTemplate') htmlIds.push(...collectTemplateIdsFromMap(question.button.templateId));
        if (question.button.action === 'renderDocTemplate') docIds.push(...collectTemplateIdsFromMap(question.button.templateId));
      });

    const loadMany = async (ids, preferred) => {
      let cacheHit = 0;
      let loaded = 0;
      let failed = 0;
      let skipped = 0;
      const unique = Array.from(new Set(ids.map(toText).map(item => item.trim()).filter(Boolean)));
      for (const id of unique) {
        if (isBundleTemplateId(id)) {
          cacheHit += 1;
          continue;
        }
        if (templateFileCache.has(id)) {
          cacheHit += 1;
          continue;
        }
        try {
          await this.loadDriveTemplate(id, preferred);
          loaded += 1;
        } catch {
          failed += 1;
        }
      }
      return { requested: unique.length, cacheHit, loaded, skipped, failed };
    };

    const html = await loadMany(htmlIds, ['text/html', 'text/plain']);
    const markdown = await loadMany(markdownIds, ['text/plain']);
    return {
      success: true,
      message: 'Prefetch complete.',
      counts: {
        markdownRequested: markdown.requested,
        markdownCacheHit: markdown.cacheHit,
        markdownLoaded: markdown.loaded,
        markdownSkippedCache: markdown.skipped,
        markdownFailed: markdown.failed,
        htmlRequested: html.requested,
        htmlCacheHit: html.cacheHit,
        htmlLoaded: html.loaded,
        htmlSkippedCache: html.skipped,
        htmlFailed: html.failed,
        docTextRequested: 0,
        docTextCacheHit: 0,
        docTextLoaded: 0,
        docTextSkippedCache: 0,
        docTextFailed: 0,
        docOk: docIds.length,
        docFailed: 0
      }
    };
  }
}

const createTemplateRepository = deps => (deps && deps.templateRepository ? deps.templateRepository : new TemplateRepository(deps || {}));

module.exports = {
  TemplateRepository,
  createTemplateRepository
};
