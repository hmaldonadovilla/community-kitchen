const http = require('http');

const serviceName = 'community-kitchen-cloud-run-api';
const port = Number(process.env.PORT || 8080);

const respondJson = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const baseBody = {
    ok: true,
    service: serviceName,
    env: (process.env.CK_ENV || '').toString() || null,
    projectId: (process.env.GCP_PROJECT_ID || '').toString() || null,
    firestoreDatabase: (process.env.GCP_FIRESTORE_DATABASE || '').toString() || null,
    revision: (process.env.K_REVISION || '').toString() || null,
    timestamp: new Date().toISOString()
  };

  if (url.pathname === '/' || url.pathname === '/statusz') {
    respondJson(res, 200, baseBody);
    return;
  }

  respondJson(res, 404, {
    ...baseBody,
    ok: false,
    message: 'Not found.'
  });
});

server.listen(port, () => {
  process.stdout.write(`[cloud-run-api] listening on ${port}\n`);
});
