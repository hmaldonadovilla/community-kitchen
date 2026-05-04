const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { createGoogleSheetsClient } = require('../googleSheetsClient');

const DEFAULT_ANALYTICS_PAGE_BUNDLE_PATH = path.join(__dirname, '..', 'generated', 'analyticsPageConfig.json');
const DEFAULT_ANALYTICS_EVALUATOR_PATH = path.join(__dirname, '..', 'generated', 'analyticsEvaluator.cjs');
const ANALYTICS_SHEET_PREFIX = '__CK_ANALYTICS__';
const ANALYTICS_SHEET_HEADERS = [
  'Metric ID',
  'Label JSON',
  'Value JSON',
  'Value Number',
  'Value Text',
  'Placements JSON',
  'Updated At (ISO)',
  'Revision',
  'Metadata JSON'
];

const DEFAULT_DATE_LABEL = 'Date';
const DEFAULT_SUBMIT_LABEL = 'Send report';
const DEFAULT_PENDING_LABEL = 'Sending...';
const DEFAULT_QUEUED_NOTICE = "Report request sent. We'll email it to the Operations Manager.";

const DEFAULT_ANALYTICS_PAGE_CONFIG = {
  pageTitle: 'Reports',
  pageDescription: 'Send operational reports to the Operations Manager.',
  copy: {
    loadingLabel: 'Loading reports...',
    emptyLabel: 'No reports are available.',
    backToLandingLabel: 'Apps',
    pendingNavigationTitle: 'Please wait',
    pendingNavigationMessage: 'Opening forms...'
  },
  landingTile: {
    title: 'Reports',
    description: 'Send operational reports by email.',
    section: 'admin',
    order: 999
  },
  sections: []
};

const clone = value => JSON.parse(JSON.stringify(value));

const normalizeKey = value => (value || '').toString().trim().toLowerCase();

const normalizeOptionalText = value => {
  if (value === undefined || value === null) return undefined;
  const raw = value.toString().trim();
  return raw || undefined;
};

const normalizeRequiredText = (value, fallback) => normalizeOptionalText(value) || fallback;

const normalizeSection = value => {
  const raw = normalizeOptionalText(value);
  return raw === 'primary' ? 'primary' : 'admin';
};

const normalizeHeader = value => {
  if (!value || typeof value !== 'object') return undefined;
  const logoUrl = normalizeOptionalText(value.logoUrl);
  const logoFormKey = normalizeOptionalText(value.logoFormKey);
  if (!logoUrl && !logoFormKey) return undefined;
  return { logoUrl, logoFormKey };
};

const normalizeCopy = value => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    loadingLabel: normalizeRequiredText(source.loadingLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.loadingLabel),
    emptyLabel: normalizeRequiredText(source.emptyLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.emptyLabel),
    backToLandingLabel: normalizeRequiredText(source.backToLandingLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.backToLandingLabel),
    pendingNavigationTitle: normalizeRequiredText(
      source.pendingNavigationTitle,
      DEFAULT_ANALYTICS_PAGE_CONFIG.copy.pendingNavigationTitle
    ),
    pendingNavigationMessage: normalizeRequiredText(
      source.pendingNavigationMessage,
      DEFAULT_ANALYTICS_PAGE_CONFIG.copy.pendingNavigationMessage
    )
  };
};

const normalizeLandingTile = value => {
  const source = value && typeof value === 'object' ? value : {};
  const parsedOrder = Number(source.order);
  return {
    title: normalizeRequiredText(source.title, DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.title),
    description: normalizeOptionalText(source.description) || DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.description,
    section: normalizeSection(source.section),
    order: Number.isFinite(parsedOrder) ? parsedOrder : DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.order,
    imagePath: normalizeOptionalText(source.imagePath),
    imageUrl: normalizeOptionalText(source.imageUrl)
  };
};

const normalizeWidget = value => {
  const source = value && typeof value === 'object' ? value : {};
  const id = normalizeOptionalText(source.id);
  const sourceFormKey = normalizeOptionalText(source.sourceFormKey);
  const sourceWidgetId = normalizeOptionalText(source.sourceWidgetId);
  if (!id || !sourceFormKey || !sourceWidgetId) return null;
  return {
    id,
    sourceFormKey,
    sourceWidgetId,
    title: normalizeOptionalText(source.title),
    description: normalizeOptionalText(source.description)
  };
};

const normalizeSections = value => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const id = normalizeOptionalText(source.id) || `section_${index + 1}`;
      const title = normalizeOptionalText(source.title);
      const widgets = (Array.isArray(source.widgets) ? source.widgets : []).map(normalizeWidget).filter(Boolean);
      if (!title || !widgets.length) return null;
      return {
        id,
        title,
        description: normalizeOptionalText(source.description),
        widgets
      };
    })
    .filter(Boolean);
};

const normalizeAnalyticsPageConfig = value => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    pageTitle: normalizeRequiredText(source.pageTitle, DEFAULT_ANALYTICS_PAGE_CONFIG.pageTitle),
    pageDescription: normalizeOptionalText(source.pageDescription) || DEFAULT_ANALYTICS_PAGE_CONFIG.pageDescription,
    appHeader: normalizeHeader(source.appHeader),
    landingTile: normalizeLandingTile(source.landingTile),
    copy: normalizeCopy(source.copy),
    sections: normalizeSections(source.sections)
  };
};

const resolveDisplayText = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value !== 'object') return `${value ?? ''}`.trim() || fallback;
  const preferred = [value.en, value.EN, value.fr, value.FR, value.nl, value.NL]
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .find(Boolean);
  return preferred || fallback;
};

const normalizeSheetNamePart = raw =>
  (raw || '')
    .toString()
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const digestShort = raw =>
  crypto
    .createHash('md5')
    .update(raw || '')
    .digest('base64')
    .replace(/=+$/, '')
    .slice(0, 10);

const getAnalyticsSheetName = form => {
  const destination = (form.destinationTab || `${form.title} Responses`).toString();
  const base = normalizeSheetNamePart(destination || form.configSheet || form.title || 'Responses') || 'Responses';
  const suffix = digestShort(`${form.configSheet || ''}|${destination}|${form.title || ''}`);
  const head = base.length > 34 ? base.slice(0, 34).trim() : base;
  return `${ANALYTICS_SHEET_PREFIX}${head}__${suffix}`;
};

const parseJsonCell = raw => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object') return raw;
  const text = raw.toString();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const parseAnalyticsSnapshotRows = (rows, formKey) => {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return {
      formKey,
      revision: 0,
      updatedAt: '',
      items: []
    };
  }

  const items = [];
  let revision = 0;
  let updatedAt = '';
  rows.slice(1).forEach(row => {
    const cells = Array.isArray(row) ? row : [];
    const id = (cells[0] || '').toString().trim();
    if (!id) return;
    const label = parseJsonCell(cells[1]);
    const value = parseJsonCell(cells[2]);
    const valueNumberRaw = Number(cells[3]);
    const valueNumber = Number.isFinite(valueNumberRaw) ? valueNumberRaw : undefined;
    const valueText = cells[4] !== undefined && cells[4] !== null ? cells[4].toString() : '';
    const placementsParsed = parseJsonCell(cells[5]);
    const placements = Array.isArray(placementsParsed)
      ? placementsParsed
          .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
          .filter(Boolean)
      : [];
    const itemUpdatedAt = (cells[6] || '').toString().trim();
    const itemRevisionRaw = Number(cells[7]);
    const itemRevision = Number.isFinite(itemRevisionRaw) && itemRevisionRaw > 0 ? itemRevisionRaw : 0;
    const metadata = parseJsonCell(cells[8]);
    if (itemRevision > revision) revision = itemRevision;
    if (itemUpdatedAt && itemUpdatedAt > updatedAt) updatedAt = itemUpdatedAt;
    items.push({
      id,
      label,
      value,
      valueNumber,
      valueText,
      valueType: undefined,
      placements: placements.length ? placements : ['analyticsPage'],
      updatedAt: itemUpdatedAt,
      revision: itemRevision,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined
    });
  });

  return {
    formKey,
    revision,
    updatedAt,
    items
  };
};

const resolveAnalyticsPageUpdatedAt = sections => {
  let best = '';
  (Array.isArray(sections) ? sections : []).forEach(section => {
    (Array.isArray(section && section.widgets) ? section.widgets : []).forEach(widget => {
      const updatedAt = (widget && widget.updatedAt ? widget.updatedAt : '').toString().trim();
      if (updatedAt > best) best = updatedAt;
    });
  });
  return best;
};

const resolveDefaultSpreadsheetId = env =>
  (
    env.CK_DEFAULT_SPREADSHEET_ID ||
    env.CK_GOOGLE_SHEETS_SPREADSHEET_ID ||
    env.CK_SPREADSHEET_ID ||
    ''
  )
    .toString()
    .trim();

const hasAnalyticsPagePlacement = pipeline => {
  const placements = Array.isArray(pipeline && pipeline.placements) ? pipeline.placements : ['analyticsPage'];
  return placements.includes('analyticsPage');
};

const sheetMissingError = err => {
  const message = (err && err.message ? err.message : '').toString();
  return /Unable to parse range|Google Sheets tab not found/i.test(message);
};

const loadAnalyticsEvaluator = evaluatorPath => {
  try {
    return require(evaluatorPath || DEFAULT_ANALYTICS_EVALUATOR_PATH);
  } catch (err) {
    const message = err && err.message ? err.message : err && err.toString ? err.toString() : 'unknown error';
    throw new Error(`Cloud Run analytics evaluator bundle is not available. Run scripts/build-cloud-run-generated-assets.js. ${message}`);
  }
};

const buildAnalyticsRow = record => ({
  id: record && record.id,
  createdAt: record && record.createdAt,
  updatedAt: record && record.updatedAt,
  status: record && record.status,
  pdfUrl: record && record.pdfUrl,
  ...((record && record.values) || {})
});

/** Reads persisted analytics snapshots and dashboard metadata for the Cloud Run RPC layer. */
class AnalyticsRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.configRepository = options.configRepository;
    this.submissionRepository = options.submissionRepository;
    this.sheetsClient = options.sheetsClient || createGoogleSheetsClient(options);
    this.analyticsPageConfig = options.analyticsPageConfig || null;
    this.analyticsPageBundlePath =
      options.analyticsPageBundlePath || this.env.CK_ANALYTICS_PAGE_BUNDLE_PATH || DEFAULT_ANALYTICS_PAGE_BUNDLE_PATH;
    this.analyticsEvaluator = options.analyticsEvaluator || null;
    this.analyticsEvaluatorPath = options.analyticsEvaluatorPath || DEFAULT_ANALYTICS_EVALUATOR_PATH;
  }

  loadAnalyticsPageConfig() {
    if (this.analyticsPageConfig) return normalizeAnalyticsPageConfig(this.analyticsPageConfig);
    try {
      const bundle = JSON.parse(fs.readFileSync(this.analyticsPageBundlePath, 'utf8'));
      this.analyticsPageConfig = bundle && typeof bundle === 'object' && bundle.config ? bundle.config : {};
    } catch {
      this.analyticsPageConfig = {};
    }
    return normalizeAnalyticsPageConfig(this.analyticsPageConfig);
  }

  listFormEntries() {
    if (!this.configRepository || typeof this.configRepository.listConfigs !== 'function') return [];
    return this.configRepository
      .listConfigs()
      .map(config => {
        const form = config && config.form ? config.form : {};
        const definition = config && config.definition ? config.definition : {};
        const formKey = (config.formKey || form.configSheet || form.title || '').toString().trim();
        if (!formKey) return null;
        return { config, form, definition, formKey };
      })
      .filter(Boolean);
  }

  findFormEntry(formKey) {
    const requested = normalizeKey(formKey);
    if (!requested) return null;
    return (
      this.listFormEntries().find(entry => {
        const keys = [entry.formKey, entry.form.configSheet, entry.form.title, entry.config && entry.config.title]
          .map(normalizeKey)
          .filter(Boolean);
        return keys.includes(requested);
      }) || null
    );
  }

  hasAnalyticsWidgets(entry) {
    const formWidgets = entry && entry.form && entry.form.analytics && entry.form.analytics.widgets;
    const definitionWidgets = entry && entry.definition && entry.definition.analytics && entry.definition.analytics.widgets;
    return (
      (Array.isArray(formWidgets) && formWidgets.length > 0) ||
      (Array.isArray(definitionWidgets) && definitionWidgets.length > 0)
    );
  }

  getSpreadsheetId() {
    return resolveDefaultSpreadsheetId(this.env);
  }

  async readSnapshotForEntry(entry) {
    if (!entry) {
      return {
        formKey: '',
        revision: 0,
        updatedAt: '',
        items: []
      };
    }
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for analytics snapshot reads.');
    const sheetName = getAnalyticsSheetName(entry.form);
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(spreadsheetId, sheetName);
    } catch (err) {
      if (!sheetMissingError(err)) throw err;
      rows = [ANALYTICS_SHEET_HEADERS];
    }
    return parseAnalyticsSnapshotRows(rows, entry.formKey);
  }

  async fetchFormSnapshot(formKey) {
    const entry = this.findFormEntry(formKey);
    if (!entry) throw new Error(`Form config not found: ${formKey || '__DEFAULT__'}.`);
    return this.readSnapshotForEntry(entry);
  }

  async fetchHomeAnalytics(formKey) {
    const entry = this.findFormEntry(formKey);
    if (!entry || !this.hasAnalyticsWidgets(entry)) return undefined;
    return this.readSnapshotForEntry(entry);
  }

  buildDashboardPipelines(entries) {
    const byFormKey = new Map();
    entries.forEach(entry => {
      if (entry.formKey) byFormKey.set(entry.formKey, entry);
    });

    return entries
      .flatMap(entry => {
        const ownerFormKey = entry.formKey;
        const ownerFormTitle = (entry.form.title || ownerFormKey).toString().trim() || ownerFormKey;
        const analytics = entry.form.analytics || entry.definition.analytics || {};
        return (Array.isArray(analytics.pipelines) ? analytics.pipelines : [])
          .filter(hasAnalyticsPagePlacement)
          .map((pipeline, index) => {
            const sourceFormKey = (pipeline.sourceFormKey || ownerFormKey).toString().trim() || ownerFormKey;
            const sourceEntry = byFormKey.get(sourceFormKey);
            const sourceFormTitle =
              ((sourceEntry && sourceEntry.form && sourceEntry.form.title) || sourceFormKey).toString().trim() || sourceFormKey;
            const title = resolveDisplayText(pipeline.title) || ownerFormTitle;
            const order = Number(pipeline.order);
            return {
              dashboardPipelineId: `${ownerFormKey}::${pipeline.id}`,
              pipelineId: pipeline.id,
              order: Number.isFinite(order) ? order : 1000 + index,
              title,
              description: resolveDisplayText(pipeline.description) || undefined,
              ownerFormKey,
              sourceFormKey,
              sourceFormTitle,
              dateLabel: resolveDisplayText(pipeline.ui && pipeline.ui.dateLabel) || DEFAULT_DATE_LABEL,
              dateHelperText: resolveDisplayText(pipeline.ui && pipeline.ui.dateHelperText) || undefined,
              submitLabel: resolveDisplayText(pipeline.ui && pipeline.ui.submitLabel) || DEFAULT_SUBMIT_LABEL,
              pendingLabel: resolveDisplayText(pipeline.ui && pipeline.ui.pendingLabel) || DEFAULT_PENDING_LABEL,
              queuedNotice: resolveDisplayText(pipeline.ui && pipeline.ui.queuedNotice) || DEFAULT_QUEUED_NOTICE
            };
          });
      })
      .sort((left, right) => {
        const orderCompare = (left.order ?? 1000) - (right.order ?? 1000);
        if (orderCompare !== 0) return orderCompare;
        const titleCompare = left.title.localeCompare(right.title);
        if (titleCompare !== 0) return titleCompare;
        return left.sourceFormTitle.localeCompare(right.sourceFormTitle);
      });
  }

  async fetchAnalyticsDashboard() {
    const pageConfig = this.loadAnalyticsPageConfig();
    const entries = this.listFormEntries();
    const errors = [];
    const snapshotByFormKey = new Map();

    const loadSnapshot = async rawFormKey => {
      const requestedKey = (rawFormKey || '').toString().trim();
      if (!requestedKey) return null;
      if (snapshotByFormKey.has(requestedKey)) return snapshotByFormKey.get(requestedKey);

      const entry = this.findFormEntry(requestedKey);
      if (!entry) {
        errors.push(`Unknown analytics source form: ${requestedKey}`);
        return null;
      }

      const snapshot = await this.readSnapshotForEntry(entry);
      const resolved = {
        title: (entry.form.title || entry.form.configSheet || requestedKey).toString().trim() || requestedKey,
        snapshot
      };
      snapshotByFormKey.set(requestedKey, resolved);
      return resolved;
    };

    const sections = [];
    for (const section of Array.isArray(pageConfig.sections) ? pageConfig.sections : []) {
      const widgets = [];
      for (const widget of Array.isArray(section.widgets) ? section.widgets : []) {
        const source = await loadSnapshot(widget.sourceFormKey);
        if (!source) continue;
        const item = (Array.isArray(source.snapshot.items) ? source.snapshot.items : []).find(
          entry => (entry && entry.id ? entry.id : '').toString().trim() === widget.sourceWidgetId
        );
        if (!item) {
          errors.push(`Missing analytics widget "${widget.sourceWidgetId}" on ${widget.sourceFormKey}`);
          continue;
        }
        widgets.push({
          ...clone(item),
          dashboardWidgetId: widget.id,
          title: resolveDisplayText(widget.title, resolveDisplayText(item.label, item.id)),
          description: resolveDisplayText(widget.description) || undefined,
          sourceFormKey: widget.sourceFormKey,
          sourceFormTitle: source.title,
          sourceWidgetId: widget.sourceWidgetId
        });
      }
      if (widgets.length) {
        sections.push({
          id: section.id,
          title: section.title,
          description: section.description,
          widgets
        });
      }
    }

    return {
      pageTitle: pageConfig.pageTitle,
      pageDescription: pageConfig.pageDescription,
      sections,
      pipelines: this.buildDashboardPipelines(entries),
      updatedAt: resolveAnalyticsPageUpdatedAt(sections),
      errors,
      envTag: (this.env.CK_ENV_TAG || this.env.CK_ENV || '').toString().trim() || undefined
    };
  }

  getAnalyticsEvaluator() {
    if (!this.analyticsEvaluator) this.analyticsEvaluator = loadAnalyticsEvaluator(this.analyticsEvaluatorPath);
    return this.analyticsEvaluator;
  }

  async ensureAnalyticsSheet(entry) {
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for analytics snapshot writes.');
    const sheetName = getAnalyticsSheetName(entry.form);
    let rows = [];
    try {
      rows = await this.sheetsClient.getSheetValues(spreadsheetId, sheetName);
    } catch (err) {
      if (!sheetMissingError(err)) throw err;
      if (typeof this.sheetsClient.addSheet !== 'function') throw err;
      await this.sheetsClient.addSheet(spreadsheetId, sheetName, { hidden: true });
      rows = [];
    }
    const currentHeaders = (rows[0] || []).map(value => (value || '').toString().trim());
    const needsHeader =
      currentHeaders.length < ANALYTICS_SHEET_HEADERS.length ||
      ANALYTICS_SHEET_HEADERS.some((header, index) => currentHeaders[index] !== header);
    if (needsHeader) {
      await this.sheetsClient.updateRowValues(spreadsheetId, sheetName, 1, ANALYTICS_SHEET_HEADERS);
      rows[0] = ANALYTICS_SHEET_HEADERS;
    }
    return { spreadsheetId, sheetName, rows };
  }

  async writeSnapshotForEntry(entry, items) {
    const { spreadsheetId, sheetName, rows } = await this.ensureAnalyticsSheet(entry);
    const current = parseAnalyticsSnapshotRows(rows, entry.formKey);
    const nextRevision = Number(current.revision || 0) + 1;
    const updatedAt = new Date().toISOString();
    const nextItems = (Array.isArray(items) ? items : []).map(item => ({
      ...clone(item),
      updatedAt,
      revision: nextRevision
    }));
    const existingDataRows = Math.max(0, rows.length - 1);
    const rowCount = Math.max(existingDataRows, nextItems.length);
    for (let index = 0; index < rowCount; index += 1) {
      const item = nextItems[index];
      const row = item
        ? [
            item.id || '',
            JSON.stringify(item.label ?? null),
            JSON.stringify(item.value ?? null),
            item.valueNumber !== undefined ? item.valueNumber : '',
            item.valueText || '',
            JSON.stringify(item.placements || []),
            item.updatedAt || '',
            item.revision || nextRevision,
            JSON.stringify(item.metadata || {})
          ]
        : new Array(ANALYTICS_SHEET_HEADERS.length).fill('');
      await this.sheetsClient.updateRowValues(spreadsheetId, sheetName, index + 2, row);
    }
    return {
      formKey: entry.formKey,
      revision: nextRevision,
      updatedAt,
      items: nextItems
    };
  }

  async recomputeForm(entry) {
    if (!this.submissionRepository || typeof this.submissionRepository.records !== 'function') {
      throw new Error('Submission repository is not configured for analytics recompute.');
    }
    const evaluator = this.getAnalyticsEvaluator();
    if (!evaluator || typeof evaluator.evaluateAnalyticsWidgets !== 'function') {
      throw new Error('Analytics evaluator bundle is missing evaluateAnalyticsWidgets.');
    }
    const records = await this.submissionRepository.records(entry.formKey);
    const definition = {
      ...(entry.definition || {}),
      analytics: (entry.definition && entry.definition.analytics) || (entry.form && entry.form.analytics) || {}
    };
    const widgets = (definition.analytics && definition.analytics.widgets) || [];
    const evaluated = evaluator.evaluateAnalyticsWidgets(widgets, {
      form: entry.form,
      definition,
      records,
      rows: (records || []).map(buildAnalyticsRow)
    });
    return this.writeSnapshotForEntry(entry, evaluated);
  }

  async runDailyAnalyticsRecompute() {
    const errors = [];
    let updatedForms = 0;
    const entries = this.listFormEntries();
    for (const entry of entries) {
      if (!this.hasAnalyticsWidgets(entry)) continue;
      try {
        await this.recomputeForm(entry);
        updatedForms += 1;
      } catch (err) {
        errors.push(`${entry.formKey}: ${(err && err.message) || (err && err.toString && err.toString()) || 'Unknown analytics recompute error'}`);
      }
    }
    return {
      success: errors.length === 0,
      updatedForms,
      errors
    };
  }
}

const createAnalyticsRepository = deps =>
  deps && deps.analyticsRepository ? deps.analyticsRepository : new AnalyticsRepository(deps || {});

module.exports = {
  ANALYTICS_SHEET_HEADERS,
  AnalyticsRepository,
  createAnalyticsRepository,
  getAnalyticsSheetName,
  parseAnalyticsSnapshotRows
};
