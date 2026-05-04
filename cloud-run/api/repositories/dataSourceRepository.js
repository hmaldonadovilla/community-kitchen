const { createFirestoreClient, decodeFirestoreDocument, encodePathSegment } = require('../firestoreClient');
const { createGoogleSheetsClient } = require('../googleSheetsClient');
const {
  DATA_SOURCE_MAX_PAGE_SIZE,
  buildHeaderIndex,
  decodePageToken,
  encodePageToken,
  normalizeStringList,
  parseHeaderKey,
  passesLocaleFilter,
  passesStatusFilter,
  projectDataSourceItem,
  resolvePageSize,
  sanitizeHeaderCellText,
  withSystemFieldAliases
} = require('./dataSourceUtils');

const resolveDataSourceCollectionPath = source => {
  const sourceId = (source && source.id ? source.id : '').toString().trim();
  if (!sourceId) throw new Error('Data source id is required.');
  const formKey = (source && source.formKey ? source.formKey : '').toString().trim();
  if (formKey) {
    return `/forms/${encodePathSegment(formKey)}/dataSources/${encodePathSegment(sourceId)}/items`;
  }
  return `/dataSources/${encodePathSegment(sourceId)}/items`;
};

const normalizeDataSourceItem = doc => {
  const decoded = decodeFirestoreDocument(doc);
  const values =
    decoded.values && typeof decoded.values === 'object' && !Array.isArray(decoded.values) ? decoded.values : decoded;
  return {
    ...values,
    id: values.id || decoded.id || (doc.name ? doc.name.split('/').pop() : undefined)
  };
};

class FirestoreDataSourceRepository {
  constructor(firestoreClient) {
    this.firestoreClient = firestoreClient || createFirestoreClient();
  }

  async fetchDataSource(source, locale, projection, limit, pageToken) {
    const config = typeof source === 'string' ? { id: source, projection } : source || {};
    const collectionPath = resolveDataSourceCollectionPath(config);
    const page = await this.firestoreClient.listDocuments(collectionPath, {
      pageSize: resolvePageSize(limit || config.limit),
      orderBy: 'sortKey',
      pageToken
    });
    const rawItems = page.documents.map(normalizeDataSourceItem);
    const items = rawItems
      .filter(item => passesLocaleFilter(item, config, locale))
      .filter(item => passesStatusFilter(item, config))
      .map(item => projectDataSourceItem(item, config, projection));

    return {
      items,
      nextPageToken: page.nextPageToken,
      totalCount: undefined
    };
  }
}

const resolveDefaultSpreadsheetId = env =>
  (
    env.CK_DEFAULT_SPREADSHEET_ID ||
    env.CK_GOOGLE_SHEETS_SPREADSHEET_ID ||
    env.CK_SPREADSHEET_ID ||
    ''
  )
    .toString()
    .trim();

const parseSheetsDataSourceTarget = (source, env) => {
  const sourceId = (source && source.id ? source.id : '').toString().trim();
  const explicitSheetId = (source && source.sheetId ? source.sheetId : '').toString().trim();
  const explicitTabName = (source && source.tabName ? source.tabName : '').toString().trim();
  if (explicitSheetId || explicitTabName) {
    return {
      spreadsheetId: explicitSheetId || resolveDefaultSpreadsheetId(env),
      tabName: explicitTabName || sourceId
    };
  }
  const delimiter = sourceId.includes('::') ? '::' : sourceId.includes('|') ? '|' : '';
  if (delimiter) {
    const parts = sourceId.split(delimiter);
    return {
      spreadsheetId: (parts[0] || '').toString().trim(),
      tabName: (parts.slice(1).join(delimiter) || '').toString().trim()
    };
  }
  return {
    spreadsheetId: resolveDefaultSpreadsheetId(env),
    tabName: sourceId
  };
};

class GoogleSheetsDataSourceRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.sheetsClient = options.sheetsClient || createGoogleSheetsClient(options);
  }

  async fetchDataSource(source, locale, projection, limit, pageToken) {
    const config = typeof source === 'string' ? { id: source, projection } : source || {};
    const target = parseSheetsDataSourceTarget(config, this.env);
    if (!target.spreadsheetId) {
      throw new Error('CK_DEFAULT_SPREADSHEET_ID is required for same-spreadsheet data sources.');
    }
    if (!target.tabName) throw new Error('Data source tab name is required.');

    const rows = await this.sheetsClient.getSheetValues(target.spreadsheetId, target.tabName);
    if (!rows.length) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const headers = (rows[0] || []).map(value => sanitizeHeaderCellText(value));
    const columns = buildHeaderIndex(headers);
    const headerKeys = headers.map(header => {
      const parsed = parseHeaderKey(header);
      return (parsed.key || header || '').toString();
    });
    const effectiveProjection = normalizeStringList(config.projection).length
      ? normalizeStringList(config.projection)
      : normalizeStringList(projection).length
        ? normalizeStringList(projection)
        : headerKeys;
    const offset = decodePageToken(pageToken);
    const pageSize = resolvePageSize(limit || config.limit || (config.mode === 'options' ? 250 : 50));
    const dataRows = rows.slice(1);
    const totalCount = dataRows.length;
    const pageRows = dataRows.slice(offset, offset + pageSize);

    const rawItems = pageRows.map(row => {
      const item = {};
      headerKeys.forEach(fieldId => {
        const key = (fieldId || '').toString();
        const idx = columns[key.toLowerCase()];
        if (idx === undefined) return;
        item[key] = row[idx] !== undefined ? row[idx] : '';
      });
      return withSystemFieldAliases(item);
    });
    const items = rawItems
      .filter(item => passesLocaleFilter(item, config, locale))
      .filter(item => passesStatusFilter(item, config))
      .map(item => projectDataSourceItem(item, { ...config, projection: effectiveProjection }, projection));

    const nextOffset = offset + pageRows.length;
    return {
      items,
      nextPageToken: nextOffset < totalCount ? encodePageToken(nextOffset) : undefined,
      totalCount
    };
  }
}

const normalizeBackendName = value => (value || '').toString().trim().toLowerCase();

const createDataSourceRepository = deps =>
  deps && deps.dataSourceRepository
    ? deps.dataSourceRepository
    : (() => {
        const env = (deps && deps.env) || process.env;
        const backend = normalizeBackendName((deps && deps.dataBackend) || env.CK_DATA_BACKEND || 'firestore');
        if (backend === 'drive' || backend === 'sheets' || backend === 'google-drive' || backend === 'google-sheets') {
          return new GoogleSheetsDataSourceRepository(deps || {});
        }
        return new FirestoreDataSourceRepository(deps && deps.firestoreClient ? deps.firestoreClient : createFirestoreClient(deps));
      })();

module.exports = {
  DATA_SOURCE_MAX_PAGE_SIZE,
  FirestoreDataSourceRepository,
  GoogleSheetsDataSourceRepository,
  createDataSourceRepository,
  parseSheetsDataSourceTarget,
  projectDataSourceItem,
  resolveDataSourceCollectionPath
};
