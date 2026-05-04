const http = require('http');
const { createRpcHandlers } = require('./rpcHandlers');
const { schedulerSecretMatches, isScheduledJobAllowed } = require('./domain/scheduledJobs');
const { decodeFirestoreValue } = require('./firestoreClient');
const {
  FirestoreDataSourceRepository,
  GoogleSheetsDataSourceRepository,
  projectDataSourceItem,
  resolveDataSourceCollectionPath
} = require('./repositories/dataSourceRepository');
const { GoogleDriveFileRepository } = require('./repositories/fileRepository');

const serviceName = 'community-kitchen-cloud-run-api';
const port = Number(process.env.PORT || 8080);

const corsHeaders = () => ({
  'access-control-allow-origin': (process.env.CK_API_CORS_ORIGIN || '*').toString(),
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-client,x-requested-with,x-ck-scheduler-secret'
});

const respondJson = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...corsHeaders()
  });
  res.end(payload);
};

const respondNoContent = (res, statusCode) => {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    ...corsHeaders()
  });
  res.end();
};

const resolveMaxBodyBytes = () => {
  const configuredMb = Number(process.env.CK_API_RPC_MAX_BODY_MB || 25);
  const mb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 25;
  return Math.floor(mb * 1024 * 1024);
};

const readRequestBody = req =>
  new Promise((resolve, reject) => {
    let body = '';
    const maxBodyBytes = resolveMaxBodyBytes();
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
        const err = new Error('Request body is too large.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const readJsonBody = async req => {
  const raw = await readRequestBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Request body must be valid JSON.');
    err.statusCode = 400;
    throw err;
  }
};

const createBaseBody = () => ({
  ok: true,
  service: serviceName,
  env: (process.env.CK_ENV || '').toString() || null,
  projectId: (process.env.GCP_PROJECT_ID || '').toString() || null,
  firestoreDatabase: (process.env.GCP_FIRESTORE_DATABASE || '').toString() || null,
  dataBackend: (process.env.CK_DATA_BACKEND || '').toString() || null,
  fileBackend: (process.env.CK_FILE_BACKEND || '').toString() || null,
  revision: (process.env.K_REVISION || '').toString() || null,
  timestamp: new Date().toISOString()
});

const respondServiceStatus = (res, baseBody, endpoint, message, extra) => {
  respondJson(res, 200, {
    ...baseBody,
    endpoint,
    message,
    ...(extra || {})
  });
};

const handleRpc = async (req, res, baseBody, rpcHandlers) => {
  if (req.method === 'OPTIONS') {
    respondNoContent(res, 204);
    return;
  }
  if (req.method !== 'POST') {
    respondJson(res, 405, {
      ...baseBody,
      ok: false,
      error: { message: 'Use POST /api/rpc.' }
    });
    return;
  }

  const body = await readJsonBody(req);
  const fnName = (body && body.fnName !== undefined ? body.fnName : '').toString().trim();
  const args = Array.isArray(body && body.args) ? body.args : [];
  if (!fnName) {
    respondJson(res, 400, {
      ...baseBody,
      ok: false,
      error: { message: 'fnName is required.' }
    });
    return;
  }

  const handler = rpcHandlers[fnName];
  if (typeof handler !== 'function') {
    respondJson(res, 501, {
      ...baseBody,
      ok: false,
      rpc: { fnName, argCount: args.length },
      error: { message: `Function "${fnName}" is not implemented in this API yet.` }
    });
    return;
  }

  const result = await handler(...args);
  respondJson(res, 200, {
    ...baseBody,
    ok: true,
    rpc: { fnName, argCount: args.length },
    result
  });
};

const handleScheduledJob = async (req, res, baseBody, rpcHandlers, jobName) => {
  if (req.method === 'OPTIONS') {
    respondNoContent(res, 204);
    return;
  }
  if (req.method !== 'POST') {
    respondJson(res, 405, {
      ...baseBody,
      ok: false,
      error: { message: 'Use POST /api/jobs/<jobName>.' }
    });
    return;
  }
  if (!schedulerSecretMatches(req.headers, process.env)) {
    respondJson(res, 401, {
      ...baseBody,
      ok: false,
      error: { message: 'Scheduled job authentication failed. Set CK_SCHEDULER_SECRET and send it as a bearer token or x-ck-scheduler-secret.' }
    });
    return;
  }
  if (!isScheduledJobAllowed(jobName, rpcHandlers)) {
    respondJson(res, 404, {
      ...baseBody,
      ok: false,
      error: { message: `Scheduled job "${jobName}" is not implemented.` }
    });
    return;
  }
  const body = await readJsonBody(req);
  const result = await rpcHandlers[jobName](body || {});
  respondJson(res, 200, {
    ...baseBody,
    ok: true,
    job: { name: jobName },
    result
  });
};

const createServer = (deps = {}) => {
  const rpcHandlers = deps.rpcHandlers || createRpcHandlers(deps);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const baseBody = createBaseBody();

    if (url.pathname === '/') {
      respondServiceStatus(res, baseBody, '/', 'Community Kitchen API is running.', {
        status: 'ok'
      });
      return;
    }

    if (url.pathname === '/status' || url.pathname === '/statusz') {
      respondServiceStatus(res, baseBody, url.pathname, 'Community Kitchen API status is available.', {
        status: 'ok'
      });
      return;
    }

    if (url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/heatlh') {
      respondServiceStatus(res, baseBody, url.pathname, 'Community Kitchen API health check passed.', {
        health: 'healthy',
        aliasOf: url.pathname === '/heatlh' ? '/health' : undefined
      });
      return;
    }

    if (url.pathname === '/api/rpc') {
      try {
        await handleRpc(req, res, baseBody, rpcHandlers);
      } catch (err) {
        respondJson(res, Number(err && err.statusCode) || 500, {
          ...baseBody,
          ok: false,
          error: { message: err && err.message ? err.message : 'Request failed.' }
        });
      }
      return;
    }

    if (url.pathname.startsWith('/api/jobs/')) {
      const jobName = decodeURIComponent(url.pathname.replace(/^\/api\/jobs\//, '')).trim();
      try {
        await handleScheduledJob(req, res, baseBody, rpcHandlers, jobName);
      } catch (err) {
        respondJson(res, Number(err && err.statusCode) || 500, {
          ...baseBody,
          ok: false,
          error: { message: err && err.message ? err.message : 'Scheduled job failed.' }
        });
      }
      return;
    }

    respondJson(res, 404, {
      ...baseBody,
      ok: false,
      message: 'Not found.'
    });
  });
};

const fetchDataSourceFromFirestore = (source, locale, projection, limit, pageToken, deps = {}) =>
  new FirestoreDataSourceRepository(deps.firestoreClient).fetchDataSource(source, locale, projection, limit, pageToken);

if (require.main === module) {
  createServer().listen(port, () => {
    process.stdout.write(`[cloud-run-api] listening on ${port}\n`);
  });
}

module.exports = {
  createBaseBody,
  createRpcHandlers,
  createServer,
  decodeFirestoreValue,
  fetchDataSourceFromFirestore,
  GoogleDriveFileRepository,
  GoogleSheetsDataSourceRepository,
  projectDataSourceItem,
  resolveDataSourceCollectionPath
};
