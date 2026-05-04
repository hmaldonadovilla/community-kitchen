#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');

const normalizeEnvName = raw => {
  const value = (raw || '').toString().trim().toLowerCase();
  return value === 'production' ? 'prod' : value;
};

const loadEnvFile = path => {
  if (!fs.existsSync(path)) return false;
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) return;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
  return true;
};

const detectSingleEnvName = prefix => {
  const files = fs
    .readdirSync(process.cwd())
    .filter(name => name.startsWith(prefix) && name !== `${prefix}example`);
  return files.length === 1 ? normalizeEnvName(files[0].slice(prefix.length)) : '';
};

loadEnvFile('.env.gcp');
let envName = normalizeEnvName(process.env.DEPLOY_ENV || process.env.CK_ENV || '');
if (!envName) envName = detectSingleEnvName('.env.gcp.');
if (envName) loadEnvFile(`.env.gcp.${envName}`);
envName = normalizeEnvName(process.env.DEPLOY_ENV || process.env.CK_ENV || envName);

const args = process.argv.slice(2);
const readFlag = name => {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index >= 0) return args[index + 1] || '';
  const prefix = `${long}=`;
  const match = args.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
};

const requireValue = (name, value) => {
  if (!value) {
    console.error(`[seed-firestore-data-source] Missing required value: ${name}`);
    process.exit(1);
  }
};

const encodePathSegment = value => encodeURIComponent((value || '').toString().trim()).replace(/%2F/gi, '_');

const encodeFirestoreValue = value => {
  if (value === undefined || value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Number.isSafeInteger(value)) return { integerValue: value.toString() };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach(key => {
      fields[key] = encodeFirestoreValue(value[key]);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: value.toString() };
};

const toFirestoreFields = obj => {
  const fields = {};
  Object.keys(obj || {}).forEach(key => {
    fields[key] = encodeFirestoreValue(obj[key]);
  });
  return fields;
};

const getAccessToken = () => {
  const explicit = (process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.GCP_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
};

const firestoreBaseUrl = () => {
  const projectId = (process.env.GCP_PROJECT_ID || '').trim();
  const database = (process.env.GCP_FIRESTORE_DATABASE || '(default)').trim() || '(default)';
  requireValue('GCP_PROJECT_ID', projectId);
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(
    database
  )}/documents`;
};

const writeDocument = async (documentPath, fields, token) => {
  const url = `${firestoreBaseUrl()}/${documentPath}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }
};

const main = async () => {
  const file = readFlag('file') || readFlag('input');
  requireValue('--file', file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const sourceId = (readFlag('id') || source.id || raw.id || '').toString().trim();
  requireValue('source.id', sourceId);
  const formKey = (readFlag('form-key') || source.formKey || raw.formKey || '').toString().trim();
  const items = Array.isArray(raw.items) ? raw.items : [];
  const token = getAccessToken();
  const sourcePath = formKey
    ? `forms/${encodePathSegment(formKey)}/dataSources/${encodePathSegment(sourceId)}`
    : `dataSources/${encodePathSegment(sourceId)}`;

  await writeDocument(
    sourcePath,
    toFirestoreFields({
      id: sourceId,
      formKey: formKey || null,
      itemCount: items.length,
      seededAt: new Date().toISOString()
    }),
    token
  );

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {};
    const itemKey = (item.itemKey || item.id || item.ID || item.key || `item-${String(i + 1).padStart(4, '0')}`)
      .toString()
      .trim();
    await writeDocument(
      `${sourcePath}/items/${encodePathSegment(itemKey)}`,
      toFirestoreFields({
        dataSourceId: sourceId,
        itemKey,
        sortKey: item.sortKey || itemKey,
        values: item
      }),
      token
    );
  }

  console.log(
    `[seed-firestore-data-source] Seeded ${items.length} item(s) into ${sourcePath} (${process.env.GCP_PROJECT_ID})`
  );
};

main().catch(err => {
  console.error(`[seed-firestore-data-source] ${err && err.message ? err.message : err}`);
  process.exit(1);
});
