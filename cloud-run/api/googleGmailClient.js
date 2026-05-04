const crypto = require('crypto');

const { createGoogleApiClient } = require('./googleApiClient');

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const IAM_CREDENTIALS_BASE_URL = 'https://iamcredentials.googleapis.com/v1';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const chunkBase64 = value => (value || '').toString().replace(/(.{76})/g, '$1\r\n');

const encodeHeader = value => {
  const text = toText(value).replace(/[\r\n]+/g, ' ');
  if (!text) return '';
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
};

const quoteMailboxName = value => {
  const text = toText(value).replace(/[\r\n]+/g, ' ');
  if (!text) return '';
  if (/^[\x20-\x7e]*$/.test(text) && !/[",<>]/.test(text)) return text;
  return encodeHeader(text);
};

const formatMailbox = (email, name) => {
  const address = toText(email);
  if (!address) return '';
  const displayName = quoteMailboxName(name);
  return displayName ? `${displayName} <${address}>` : address;
};

const normalizeAddressList = value => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap(entry => toText(entry).split(','))
    .map(entry => entry.trim())
    .filter(Boolean);
};

const normalizePrivateKey = value => {
  const key = toText(value);
  return key ? key.replace(/\\n/g, '\n') : '';
};

const resolveRuntimeServiceAccountEmail = env => {
  const explicit =
    toText(env.CK_GMAIL_SERVICE_ACCOUNT_EMAIL) ||
    toText(env.GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL) ||
    toText(env.GOOGLE_CLIENT_EMAIL);
  if (explicit) return explicit;
  const id = toText(env.GCP_RUNTIME_SERVICE_ACCOUNT_ID);
  const projectId = toText(env.GCP_PROJECT_ID);
  return id && projectId ? `${id}@${projectId}.iam.gserviceaccount.com` : '';
};

const resolveDelegatedUser = env =>
  toText(env.CK_GMAIL_DELEGATED_USER || env.CK_GMAIL_USER || env.GMAIL_DELEGATED_USER || env.GMAIL_USER);

const buildClaims = (env, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const delegatedUser = resolveDelegatedUser(env);
  if (!delegatedUser) {
    throw new Error(
      'Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'
    );
  }
  const serviceAccountEmail = resolveRuntimeServiceAccountEmail(env);
  if (!serviceAccountEmail) {
    throw new Error('Cloud Run SEND_EMAIL requires a runtime service account email for Gmail delegation.');
  }
  return {
    iss: serviceAccountEmail,
    sub: delegatedUser,
    scope: GMAIL_SEND_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
};

const signJwtWithPrivateKey = (claims, env) => {
  const privateKey = normalizePrivateKey(env.CK_GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY);
  if (!privateKey) return '';
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(env.CK_GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY_ID || env.GOOGLE_PRIVATE_KEY_ID
      ? { kid: toText(env.CK_GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY_ID || env.GOOGLE_PRIVATE_KEY_ID) }
      : {})
  };
  const unsigned = [
    Buffer.from(JSON.stringify(header), 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  ].join('.');
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
};

const signJwtWithIamCredentials = async (fetchImpl, env, claims, googleApiClient) => {
  const serviceAccountEmail = resolveRuntimeServiceAccountEmail(env);
  if (!serviceAccountEmail) {
    throw new Error('Cloud Run SEND_EMAIL requires a runtime service account email for Gmail delegation.');
  }
  const client = googleApiClient || createGoogleApiClient({ env, fetchImpl });
  const url = `${IAM_CREDENTIALS_BASE_URL}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`;
  const result = await client.request(url, {
    method: 'POST',
    body: { payload: JSON.stringify(claims) }
  });
  const signedJwt = toText(result && result.signedJwt);
  if (!signedJwt) throw new Error('IAM Credentials signJwt did not return a signedJwt.');
  return signedJwt;
};

const exchangeJwtForAccessToken = async (fetchImpl, assertion) => {
  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  body.set('assertion', assertion);
  const res = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (payload && payload.error_description) ||
      (payload && payload.error) ||
      `Gmail delegated token exchange failed (${res.status}).`;
    throw new Error(message);
  }
  const token = toText(payload && payload.access_token);
  if (!token) throw new Error('Gmail delegated token exchange did not return access_token.');
  return {
    accessToken: token,
    expiresAtMs: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000
  };
};

const buildMimeMessage = message => {
  const to = normalizeAddressList(message.to);
  const cc = normalizeAddressList(message.cc);
  const bcc = normalizeAddressList(message.bcc);
  if (!to.length) throw new Error('Email recipients are empty.');

  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(Boolean) : [];
  const mixedBoundary = `ck_mixed_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const alternativeBoundary = `ck_alt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const textBody = toText(message.textBody || message.body || 'See attached PDF.');
  const htmlBody = toText(message.htmlBody || textBody.replace(/\r?\n/g, '<br/>'));
  const from = formatMailbox(message.from || message.sender, message.fromName || message.senderName);
  const headers = [
    from ? `From: ${from}` : '',
    `To: ${to.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : '',
    bcc.length ? `Bcc: ${bcc.join(', ')}` : '',
    `Subject: ${encodeHeader(message.subject || 'Form submission')}`,
    'MIME-Version: 1.0'
  ].filter(Boolean);

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(textBody, 'utf8').toString('base64')),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(htmlBody, 'utf8').toString('base64')),
    `--${alternativeBoundary}--`
  ].join('\r\n');

  if (!attachments.length) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '',
      `--${alternativeBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      chunkBase64(Buffer.from(textBody, 'utf8').toString('base64')),
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      chunkBase64(Buffer.from(htmlBody, 'utf8').toString('base64')),
      `--${alternativeBoundary}--`,
      ''
    ].join('\r\n');
  }

  const attachmentParts = attachments.map(attachment => {
    const fileName = encodeHeader(attachment.fileName || attachment.name || 'attachment');
    const mimeType = toText(attachment.mimeType || attachment.contentType || 'application/octet-stream');
    const buffer = Buffer.isBuffer(attachment.buffer)
      ? attachment.buffer
      : Buffer.from(attachment.buffer || attachment.base64 || '', attachment.base64 ? 'base64' : undefined);
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${mimeType}; name="${fileName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fileName}"`,
      '',
      chunkBase64(buffer.toString('base64'))
    ].join('\r\n');
  });

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    alternativePart,
    ...attachmentParts,
    `--${mixedBoundary}--`,
    ''
  ].join('\r\n');
};

const createGoogleGmailClient = (deps = {}) => {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const googleApiClient = deps.googleApiClient || createGoogleApiClient(deps);
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
  let cachedDelegatedToken = null;

  const getGmailAccessToken = async () => {
    const explicit = toText(env.CK_GMAIL_OAUTH_ACCESS_TOKEN || env.GMAIL_OAUTH_ACCESS_TOKEN);
    if (explicit) return explicit;
    if (cachedDelegatedToken && cachedDelegatedToken.expiresAtMs > Date.now() + 30000) {
      return cachedDelegatedToken.accessToken;
    }
    const claims = buildClaims(env);
    const privateKeyAssertion = signJwtWithPrivateKey(claims, env);
    const assertion =
      privateKeyAssertion || (await signJwtWithIamCredentials(fetchImpl, env, claims, googleApiClient));
    cachedDelegatedToken = await exchangeJwtForAccessToken(fetchImpl, assertion);
    return cachedDelegatedToken.accessToken;
  };

  return {
    isConfigured() {
      if (toText(env.CK_GMAIL_OAUTH_ACCESS_TOKEN || env.GMAIL_OAUTH_ACCESS_TOKEN)) return true;
      return Boolean(resolveDelegatedUser(env) && resolveRuntimeServiceAccountEmail(env));
    },

    async sendEmail(message) {
      const accessToken = message.accessToken || (await getGmailAccessToken());
      const userId = encodeURIComponent(toText(message.userId || env.CK_GMAIL_USER_ID || 'me') || 'me');
      const raw = Buffer.from(buildMimeMessage(message), 'utf8').toString('base64url');
      return googleApiClient.request(`${GMAIL_API_BASE_URL}/users/${userId}/messages/send`, {
        method: 'POST',
        accessToken,
        body: { raw }
      });
    }
  };
};

module.exports = {
  GMAIL_SEND_SCOPE,
  buildClaims,
  buildMimeMessage,
  createGoogleGmailClient,
  exchangeJwtForAccessToken,
  resolveDelegatedUser,
  resolveRuntimeServiceAccountEmail,
  signJwtWithPrivateKey
};
