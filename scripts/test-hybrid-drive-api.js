#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');

const normalizeEnvName = raw => {
  const value = (raw || '').toString().trim().toLowerCase();
  return value === 'production' ? 'prod' : value;
};

const loadEnvFile = path => {
  if (!fs.existsSync(path)) return false;
  fs.readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) return;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

const args = process.argv.slice(2);
const readFlag = name => {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index >= 0) return args[index + 1] || '';
  const prefix = `${long}=`;
  const match = args.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
};

const normalizeStringList = value =>
  (value || '')
    .toString()
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const resolveServiceUrlFromGcloud = () => {
  const service = (process.env.GCP_CLOUD_RUN_SERVICE || '').trim();
  const region = (process.env.GCP_REGION || '').trim();
  if (!service || !region) return '';
  try {
    return execFileSync(
      'gcloud',
      ['run', 'services', 'describe', service, `--region=${region}`, "--format=value(status.url)"],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    return '';
  }
};

const fetchJson = async url => {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { res, body };
};

const postRpc = async (serviceUrl, fnName, rpcArgs) => {
  const res = await fetch(`${serviceUrl.replace(/\/+$/, '')}/api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fnName, args: rpcArgs })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    const message = body && body.error && body.error.message ? body.error.message : `HTTP ${res.status}`;
    throw new Error(`${fnName} failed: ${message}`);
  }
  return body.result;
};

const timeAsync = async (label, fn) => {
  const start = Date.now();
  const result = await fn();
  return {
    label,
    elapsedMs: Date.now() - start,
    result
  };
};

const main = async () => {
  loadEnvFile('.env.gcp');
  let envName = normalizeEnvName(process.env.DEPLOY_ENV || process.env.CK_ENV || '');
  if (!envName) envName = detectSingleEnvName('.env.gcp.');
  if (envName) loadEnvFile(`.env.gcp.${envName}`);
  envName = normalizeEnvName(process.env.DEPLOY_ENV || process.env.CK_ENV || envName);

  const serviceUrl =
    readFlag('url') ||
    process.env.CK_API_BASE_URL ||
    process.env.CLOUD_RUN_SERVICE_URL ||
    resolveServiceUrlFromGcloud();
  if (!serviceUrl) throw new Error('Cloud Run service URL could not be resolved.');

  const baseUrl = serviceUrl.replace(/\/+$/, '');
  const statusChecks = [`${baseUrl}/status`, `${baseUrl}/statusz`, `${baseUrl}/`];
  const timings = [];
  let statusBody = null;
  let statusCode = 0;
  for (const url of statusChecks) {
    const checkedTiming = await timeAsync(`GET ${new URL(url).pathname}`, () => fetchJson(url));
    timings.push({ label: checkedTiming.label, elapsedMs: checkedTiming.elapsedMs });
    const checked = checkedTiming.result;
    statusCode = checked.res.status;
    if (checked.res.ok && checked.body && checked.body.ok === true) {
      statusBody = checked.body;
      break;
    }
  }
  if (!statusBody) {
    throw new Error(`Cloud Run status check failed (${statusCode}).`);
  }

  const dataSourceId = readFlag('data-source-id') || process.env.CK_TEST_DATA_SOURCE_ID || 'Distributor Data';
  const projection = normalizeStringList(readFlag('projection') || process.env.CK_TEST_DATA_SOURCE_PROJECTION);
  const locale = readFlag('locale') || process.env.CK_TEST_DATA_SOURCE_LOCALE || 'EN';
  const limit = Number(readFlag('limit') || process.env.CK_TEST_DATA_SOURCE_LIMIT || 5);
  const source = { id: dataSourceId };
  const dataSourceTiming = await timeAsync('rpc.fetchDataSource', () =>
    postRpc(serviceUrl, 'fetchDataSource', [
      source,
      locale,
      projection.length ? projection : undefined,
      Number.isFinite(limit) && limit > 0 ? limit : 5,
      undefined
    ])
  );
  timings.push({ label: dataSourceTiming.label, elapsedMs: dataSourceTiming.elapsedMs });
  const dataSourceResult = dataSourceTiming.result;
  if (!dataSourceResult || !Array.isArray(dataSourceResult.items)) {
    throw new Error('fetchDataSource did not return an items array.');
  }

  const driveFileId = readFlag('drive-file-id') || process.env.CK_TEST_DRIVE_FILE_ID || '';
  let driveFile = null;
  if (driveFileId) {
    const driveFileTiming = await timeAsync('rpc.fetchDriveFileMetadata', () =>
      postRpc(serviceUrl, 'fetchDriveFileMetadata', [driveFileId])
    );
    timings.push({ label: driveFileTiming.label, elapsedMs: driveFileTiming.elapsedMs });
    driveFile = driveFileTiming.result;
    if (!driveFile || !driveFile.id) {
      throw new Error('fetchDriveFileMetadata did not return file metadata.');
    }
  }

  const formKey = readFlag('form-key') || process.env.CK_TEST_FORM_KEY || 'Config: Meal Production';
  const formConfigTiming = await timeAsync('rpc.fetchFormConfig', () => postRpc(serviceUrl, 'fetchFormConfig', [formKey]));
  timings.push({ label: formConfigTiming.label, elapsedMs: formConfigTiming.elapsedMs });
  const formConfig = formConfigTiming.result || {};
  const homeTiming = await timeAsync('rpc.fetchHomeBootstrap', () => postRpc(serviceUrl, 'fetchHomeBootstrap', [formKey, 0]));
  timings.push({ label: homeTiming.label, elapsedMs: homeTiming.elapsedMs });
  const analyticsTiming = await timeAsync('rpc.fetchAnalyticsDashboard', () => postRpc(serviceUrl, 'fetchAnalyticsDashboard', []));
  timings.push({ label: analyticsTiming.label, elapsedMs: analyticsTiming.elapsedMs });
  const prefetchTiming = await timeAsync('rpc.prefetchTemplates', () => postRpc(serviceUrl, 'prefetchTemplates', [formKey]));
  timings.push({ label: prefetchTiming.label, elapsedMs: prefetchTiming.elapsedMs });

  const recordId = readFlag('record-id') || process.env.CK_TEST_RECORD_ID || '';
  let record = null;
  let recordVersion = null;
  if (recordId) {
    const recordTiming = await timeAsync('rpc.fetchSubmissionById', () => postRpc(serviceUrl, 'fetchSubmissionById', [formKey, recordId]));
    timings.push({ label: recordTiming.label, elapsedMs: recordTiming.elapsedMs });
    record = recordTiming.result;
    const versionTiming = await timeAsync('rpc.getRecordVersion', () => postRpc(serviceUrl, 'getRecordVersion', [formKey, recordId]));
    timings.push({ label: versionTiming.label, elapsedMs: versionTiming.elapsedMs });
    recordVersion = versionTiming.result;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        env: envName || null,
        serviceUrl,
        status: {
          dataBackend: statusBody.dataBackend || null,
          fileBackend: statusBody.fileBackend || null,
          revision: statusBody.revision || null
        },
        dataSource: {
          id: dataSourceId,
          itemCount: dataSourceResult.items.length,
          hasNextPage: Boolean(dataSourceResult.nextPageToken)
        },
        driveFile: driveFile ? { id: driveFile.id, name: driveFile.name || '', mimeType: driveFile.mimeType || '' } : null,
        form: {
          formKey,
          title: (formConfig.definition && formConfig.definition.title) || (formConfig.form && formConfig.form.title) || '',
          questionCount: Array.isArray(formConfig.questions) ? formConfig.questions.length : 0,
          homeItemCount:
            homeTiming.result && homeTiming.result.listResponse && Array.isArray(homeTiming.result.listResponse.items)
              ? homeTiming.result.listResponse.items.length
              : 0,
          analyticsSections:
            analyticsTiming.result && Array.isArray(analyticsTiming.result.sections) ? analyticsTiming.result.sections.length : 0,
          prefetchCounts: prefetchTiming.result && prefetchTiming.result.counts ? prefetchTiming.result.counts : null
        },
        record: recordId
          ? {
              id: recordId,
              found: Boolean(record && record.id),
              dataVersion: recordVersion && recordVersion.dataVersion
            }
          : null,
        timingsMs: timings
      },
      null,
      2
    )
  );
};

main().catch(err => {
  console.error(`[test-hybrid-drive-api] ${err && err.message ? err.message : err}`);
  process.exit(1);
});
