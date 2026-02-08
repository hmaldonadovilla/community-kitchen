export type SystemRecordMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
  pdfUrl?: string;
};

export type SystemFieldId = keyof SystemRecordMeta;
export const REQUEST_PARAM_FIELD_PREFIX = '__ckRequestParam_';
let requestParamFieldLogged = false;

const logRequestParamFieldOnce = (paramKey: string, source: string): void => {
  if (requestParamFieldLogged) return;
  requestParamFieldLogged = true;
  try {
    if (!(globalThis as any)?.__WEB_FORM_DEBUG__) return;
    if (typeof console === 'undefined' || typeof console.info !== 'function') return;
    console.info('[ReactForm][SystemFields]', 'requestParamField.enabled', {
      prefix: REQUEST_PARAM_FIELD_PREFIX,
      sampleParam: paramKey || null,
      source
    });
  } catch (_) {
    // ignore logging failures
  }
};

const normalizeText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const normalizeRequestParamKey = (raw: string): string => normalizeText(raw).toLowerCase();

const parseParamFromSearch = (searchRaw: string, normalizedKey: string): string | undefined => {
  const raw = normalizeText(searchRaw);
  if (!raw) return undefined;
  try {
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    for (const [key, value] of params.entries()) {
      if (normalizeRequestParamKey(key) !== normalizedKey) continue;
      const normalizedValue = normalizeText(value);
      if (normalizedValue) return normalizedValue;
    }
  } catch (_) {
    return undefined;
  }
  return undefined;
};

const parseParamFromHash = (hashRaw: string, normalizedKey: string): string | undefined => {
  const hash = normalizeText(hashRaw);
  if (!hash) return undefined;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIdx = body.indexOf('?');
  if (queryIdx >= 0) {
    const value = parseParamFromSearch(body.slice(queryIdx + 1), normalizedKey);
    if (value !== undefined) return value;
  }
  if (body.includes('=')) {
    const value = parseParamFromSearch(body, normalizedKey);
    if (value !== undefined) return value;
  }
  return undefined;
};

const parseParamFromObject = (source: unknown, normalizedKey: string): string | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  const entry = Object.entries(source as Record<string, unknown>).find(([rawKey]) => normalizeRequestParamKey(rawKey) === normalizedKey);
  if (!entry) return undefined;
  const normalizedValue = normalizeText(entry[1]);
  return normalizedValue || undefined;
};

const resolveRequestParamValue = (paramKeyRaw: string): string | undefined => {
  const normalizedKey = normalizeRequestParamKey(paramKeyRaw);
  if (!normalizedKey) return undefined;

  const globalAny = globalThis as any;
  const fromDirect = parseParamFromObject(globalAny?.__WEB_FORM_REQUEST_PARAMS__, normalizedKey);
  if (fromDirect !== undefined) {
    logRequestParamFieldOnce(paramKeyRaw, 'requestParams');
    return fromDirect;
  }

  const fromBootstrap = parseParamFromObject(globalAny?.__WEB_FORM_BOOTSTRAP__?.requestParams, normalizedKey);
  if (fromBootstrap !== undefined) {
    logRequestParamFieldOnce(paramKeyRaw, 'bootstrapRequestParams');
    return fromBootstrap;
  }

  try {
    const fromSearch = parseParamFromSearch(globalAny?.location?.search || '', normalizedKey);
    if (fromSearch !== undefined) {
      logRequestParamFieldOnce(paramKeyRaw, 'search');
      return fromSearch;
    }
  } catch (_) {
    // ignore location access failures
  }

  try {
    const fromHash = parseParamFromHash(globalAny?.location?.hash || '', normalizedKey);
    if (fromHash !== undefined) {
      logRequestParamFieldOnce(paramKeyRaw, 'hash');
      return fromHash;
    }
  } catch (_) {
    // ignore location access failures
  }

  return undefined;
};

const normalizeRequestParamFieldId = (rawFieldId: string): string | null => {
  const raw = normalizeText(rawFieldId);
  if (!raw) return null;
  const prefixLength = REQUEST_PARAM_FIELD_PREFIX.length;
  if (raw.length <= prefixLength) return null;
  if (raw.slice(0, prefixLength).toLowerCase() !== REQUEST_PARAM_FIELD_PREFIX.toLowerCase()) return null;
  const key = raw.slice(prefixLength).trim();
  return key || null;
};

/**
 * Normalize user-provided field ids to system/meta field keys.
 *
 * This exists because config authors commonly reference system fields using sheet-like names
 * (e.g. "STATUS", "PDF_URL"), while the web app stores them under canonical keys
 * (e.g. "status", "pdfUrl").
 */
export const normalizeSystemFieldId = (rawFieldId: string): SystemFieldId | null => {
  const raw = (rawFieldId || '').toString().trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === 'status') return 'status';
  if (key === 'pdfurl' || key === 'pdf_url' || key === 'pdf') return 'pdfUrl';
  if (key === 'id' || key === 'recordid' || key === 'record_id' || key === 'record id') return 'id';
  if (key === 'createdat' || key === 'created_at' || key === 'created') return 'createdAt';
  if (key === 'updatedat' || key === 'updated_at' || key === 'updated') return 'updatedAt';
  return null;
};

export const getSystemFieldValue = (fieldId: string, meta?: SystemRecordMeta | null): unknown => {
  const requestParamKey = normalizeRequestParamFieldId(fieldId);
  if (requestParamKey) return resolveRequestParamValue(requestParamKey);

  const key = normalizeSystemFieldId(fieldId);
  if (!key) return undefined;
  return (meta as any)?.[key];
};
