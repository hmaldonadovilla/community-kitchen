const { getAccessToken } = require('./googleApiClient');

const DEFAULT_FIRESTORE_DATABASE = '(default)';

const encodePathSegment = value => encodeURIComponent((value || '').toString().trim()).replace(/%2F/gi, '_');

const decodeFirestoreValue = value => {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const values = value.arrayValue && Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
    return values.map(decodeFirestoreValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    const fields = (value.mapValue && value.mapValue.fields) || {};
    return Object.keys(fields).reduce((out, key) => {
      out[key] = decodeFirestoreValue(fields[key]);
      return out;
    }, {});
  }
  return undefined;
};

const decodeFirestoreDocument = doc => {
  const fields = (doc && doc.fields) || {};
  return Object.keys(fields).reduce((out, key) => {
    out[key] = decodeFirestoreValue(fields[key]);
    return out;
  }, {});
};

const getFirestoreBaseUrl = env => {
  const projectId = (env.GCP_PROJECT_ID || '').toString().trim();
  const database = (env.GCP_FIRESTORE_DATABASE || DEFAULT_FIRESTORE_DATABASE).toString().trim() || DEFAULT_FIRESTORE_DATABASE;
  if (!projectId) throw new Error('GCP_PROJECT_ID is not configured.');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(
    database
  )}/documents`;
};

const parseResponseBody = async res => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const createFirestoreClient = (deps = {}) => {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');

  const request = async (path, options = {}) => {
    const token = options.accessToken || (await getAccessToken(fetchImpl, env));
    const url = `${getFirestoreBaseUrl(env)}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetchImpl(url, {
      method: options.method || 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await parseResponseBody(res);
    if (!res.ok) {
      const message =
        (payload && payload.error && payload.error.message) ||
        (payload && payload.message) ||
        `Firestore request failed (${res.status}).`;
      throw new Error(message);
    }
    return payload || {};
  };

  return {
    request,
    async listDocuments(collectionPath, args = {}) {
      const params = new URLSearchParams();
      if (args.pageSize) params.set('pageSize', args.pageSize.toString());
      if (args.orderBy) params.set('orderBy', args.orderBy.toString());
      if (args.pageToken) params.set('pageToken', args.pageToken.toString());

      const query = params.toString();
      const payload = await request(`${collectionPath}${query ? `?${query}` : ''}`);
      return {
        documents: Array.isArray(payload.documents) ? payload.documents : [],
        nextPageToken: payload.nextPageToken || undefined
      };
    }
  };
};

module.exports = {
  createFirestoreClient,
  decodeFirestoreDocument,
  decodeFirestoreValue,
  encodePathSegment,
  getFirestoreBaseUrl
};
