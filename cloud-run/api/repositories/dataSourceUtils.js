const DATA_SOURCE_MAX_PAGE_SIZE = 500;

const normalizeStringList = value => {
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined || item === null ? '' : item.toString().trim())).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeHeaderToken = value =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase();

const parseHeaderKey = header => {
  const text = (header || '').toString().trim();
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(text);
  if (!match) return { label: text, key: text };
  return { label: match[1].trim(), key: match[2].trim() };
};

const sanitizeHeaderCellText = value => (value || '').toString().replace(/\s+/g, ' ').trim();

const resolveMappingAliases = (mapping, sourceKey) => {
  if (!mapping || typeof mapping !== 'object') return [];
  const raw = (sourceKey || '').toString();
  if (!raw) return [];
  const normalized = normalizeHeaderToken(raw);
  const aliases = new Set();
  Object.entries(mapping).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const keyNorm = normalizeHeaderToken(key);
    const valueNorm = normalizeHeaderToken(value);
    if (keyNorm === normalized) aliases.add(value.toString());
    if (valueNorm === normalized) aliases.add(key.toString());
  });
  return Array.from(aliases).filter(alias => normalizeHeaderToken(alias) !== normalized);
};

const findItemValue = (item, key) => {
  if (!item || typeof item !== 'object') return undefined;
  const rawKey = (key || '').toString();
  if (!rawKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(item, rawKey)) return item[rawKey];
  const normalized = normalizeHeaderToken(rawKey);
  const match = Object.keys(item).find(candidate => normalizeHeaderToken(candidate) === normalized);
  return match ? item[match] : undefined;
};

const SYSTEM_FIELD_ALIASES = [
  ['id', ['id', 'Record ID', 'recordId', '__id']],
  ['status', ['status', 'Status', '__status']],
  ['createdAt', ['createdAt', 'Created At', 'Created At (ISO)', '__createdAt']],
  ['updatedAt', ['updatedAt', 'Updated At', 'Updated At (ISO)', '__updatedAt']],
  ['pdfUrl', ['pdfUrl', 'PDF URL', '__pdfUrl']],
  ['dataVersion', ['dataVersion', 'Data Version']]
];

const withSystemFieldAliases = item => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const next = { ...item };
  SYSTEM_FIELD_ALIASES.forEach(([canonical, aliases]) => {
    if (next[canonical] !== undefined && next[canonical] !== null && next[canonical] !== '') return;
    const value = aliases.map(alias => findItemValue(item, alias)).find(candidate => candidate !== undefined && candidate !== null);
    if (value !== undefined && value !== null) next[canonical] = value;
  });
  return next;
};

const passesLocaleFilter = (item, source, locale) => {
  const localeKey = (source && source.localeKey ? source.localeKey : '').toString().trim();
  if (!localeKey || !locale) return true;
  const actual = findItemValue(item, localeKey);
  if (actual === undefined || actual === null) return true;
  return actual.toString().trim().toLowerCase() === locale.toString().trim().toLowerCase();
};

const passesStatusFilter = (item, source) => {
  const allowed = normalizeStringList(source && source.statusAllowList).map(value => value.toLowerCase());
  if (!allowed.length) return true;
  const statusKey = (source && source.statusFieldId ? source.statusFieldId : 'status').toString().trim() || 'status';
  const actual = findItemValue(item, statusKey);
  if (actual === undefined || actual === null) return false;
  return allowed.includes(actual.toString().trim().toLowerCase());
};

const projectDataSourceItem = (item, source, projection) => {
  const effectiveProjection = normalizeStringList(source && source.projection).length
    ? normalizeStringList(source.projection)
    : normalizeStringList(projection);
  const mapping = source && source.mapping && typeof source.mapping === 'object' ? source.mapping : null;
  if (!effectiveProjection.length) return item;
  if (effectiveProjection.length === 1 && !mapping && !(source && source.formKey)) {
    const key = effectiveProjection[0];
    const value = findItemValue(item, key);
    return value === undefined ? '' : value;
  }
  const out = {};
  effectiveProjection.forEach(key => {
    if (!key) return;
    const value = findItemValue(item, key);
    if (value === undefined) return;
    out[key] = value;
    resolveMappingAliases(mapping, key).forEach(alias => {
      if (alias && out[alias] === undefined) out[alias] = value;
    });
  });
  if (source && source.formKey) {
    SYSTEM_FIELD_ALIASES.forEach(([canonical]) => {
      const value = findItemValue(item, canonical);
      if (value !== undefined && value !== null && out[canonical] === undefined) out[canonical] = value;
    });
  }
  return out;
};

const resolvePageSize = limit => {
  const requested = Number(limit);
  return Number.isFinite(requested) && requested > 0 ? Math.min(requested, DATA_SOURCE_MAX_PAGE_SIZE) : 50;
};

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

const buildHeaderIndex = headers => {
  const index = {};
  headers.forEach((header, idx) => {
    const cleaned = sanitizeHeaderCellText(header);
    const rawKey = normalizeHeaderToken(cleaned);
    if (rawKey) index[rawKey] = idx;
    const parsed = parseHeaderKey(cleaned);
    const bracketKey = normalizeHeaderToken(parsed.key);
    if (bracketKey) index[bracketKey] = idx;
  });
  return index;
};

module.exports = {
  DATA_SOURCE_MAX_PAGE_SIZE,
  buildHeaderIndex,
  decodePageToken,
  encodePageToken,
  normalizeHeaderToken,
  normalizeStringList,
  parseHeaderKey,
  passesLocaleFilter,
  passesStatusFilter,
  projectDataSourceItem,
  findItemValue,
  resolveMappingAliases,
  resolvePageSize,
  sanitizeHeaderCellText,
  withSystemFieldAliases
};
