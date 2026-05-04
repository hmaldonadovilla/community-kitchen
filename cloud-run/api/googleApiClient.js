const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

const getAccessToken = async (fetchImpl, env) => {
  const explicit = (env.GOOGLE_OAUTH_ACCESS_TOKEN || env.GCP_ACCESS_TOKEN || '').toString().trim();
  if (explicit) return explicit;

  const res = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) {
    throw new Error(`Metadata token request failed (${res.status}).`);
  }
  const body = await res.json();
  const token = (body && body.access_token ? body.access_token : '').toString().trim();
  if (!token) throw new Error('Metadata token response did not include access_token.');
  return token;
};

const parseResponseBody = async (res, responseType) => {
  if (responseType === 'buffer') {
    return Buffer.from(await res.arrayBuffer());
  }
  if (responseType === 'text') {
    return res.text();
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const createGoogleApiClient = (deps = {}) => {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');

  const request = async (url, options = {}) => {
    const token = options.accessToken || (await getAccessToken(fetchImpl, env));
    const hasRawBody = Object.prototype.hasOwnProperty.call(options, 'rawBody');
    const hasJsonBody = Object.prototype.hasOwnProperty.call(options, 'body') && options.body !== undefined;
    const res = await fetchImpl(url, {
      method: options.method || 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(hasJsonBody && !hasRawBody ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: hasRawBody ? options.rawBody : hasJsonBody ? JSON.stringify(options.body) : undefined
    });
    const payload = await parseResponseBody(res, res.ok ? options.responseType : undefined);
    if (!res.ok) {
      const message =
        (payload && payload.error && payload.error.message) ||
        (payload && payload.message) ||
        `Google API request failed (${res.status}).`;
      throw new Error(message);
    }
    return payload || {};
  };

  return { request };
};

module.exports = {
  createGoogleApiClient,
  getAccessToken
};
