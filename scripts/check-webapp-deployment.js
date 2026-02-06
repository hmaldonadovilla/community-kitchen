const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);

const readFlag = name => {
  const key = `--${name}`;
  const direct = args.find(arg => arg.startsWith(`${key}=`));
  if (direct) return direct.slice(key.length + 1);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return '';
};

const scriptId = readFlag('script-id');
const deploymentId = readFlag('deployment-id');

if (!scriptId || !deploymentId) {
  console.error('[check-webapp-deployment] Missing --script-id or --deployment-id');
  process.exit(1);
}

const clasprcPath = path.join(os.homedir(), '.clasprc.json');
if (!fs.existsSync(clasprcPath)) {
  console.error('[check-webapp-deployment] Missing ~/.clasprc.json');
  process.exit(1);
}

const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
const tokenBundle = (clasprc.tokens && clasprc.tokens.default) || clasprc.token || null;

if (!tokenBundle) {
  console.error('[check-webapp-deployment] Missing auth token in ~/.clasprc.json');
  process.exit(1);
}

const refreshAccessToken = async () => {
  const clientId = tokenBundle.client_id;
  const clientSecret = tokenBundle.client_secret;
  const refreshToken = tokenBundle.refresh_token;
  if (!clientId || !clientSecret || !refreshToken) return '';

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return '';
  const json = await res.json();
  if (!json || !json.access_token) return '';

  tokenBundle.access_token = json.access_token;
  if (clasprc.tokens && clasprc.tokens.default) {
    clasprc.tokens.default.access_token = json.access_token;
  } else if (clasprc.token) {
    clasprc.token.access_token = json.access_token;
  }
  fs.writeFileSync(clasprcPath, `${JSON.stringify(clasprc, null, 2)}\n`, 'utf8');
  return json.access_token;
};

const fetchDeployment = async accessToken => {
  const url = `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(
    deploymentId
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
};

const run = async () => {
  let accessToken = tokenBundle.access_token || '';
  if (!accessToken) {
    accessToken = await refreshAccessToken();
  }
  if (!accessToken) {
    console.error('[check-webapp-deployment] Missing/invalid access token. Run clasp login again.');
    process.exit(1);
  }

  let result = await fetchDeployment(accessToken);
  if (!result.ok && (result.status === 401 || result.status === 403)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      result = await fetchDeployment(refreshed);
    }
  }

  if (!result.ok) {
    console.error(
      `[check-webapp-deployment] Failed to read deployment (${result.status}): ${JSON.stringify(result.data)}`
    );
    process.exit(1);
  }

  const entryPoints = Array.isArray(result.data.entryPoints) ? result.data.entryPoints : [];
  const webAppEntry = entryPoints.find(entryPoint => entryPoint && entryPoint.entryPointType === 'WEB_APP');
  if (!webAppEntry) {
    console.error(
      `[check-webapp-deployment] Deployment ${deploymentId} is not a WEB_APP entry point (current: library-like/version deployment).`
    );
    console.error(
      '[check-webapp-deployment] Repair in Apps Script UI: Deploy > Manage deployments > edit this same deployment id as Web app (do not create a new deployment).'
    );
    process.exit(1);
  }

  console.info(`[check-webapp-deployment] Deployment ${deploymentId} is WEB_APP.`);
};

run().catch(error => {
  console.error(
    `[check-webapp-deployment] Unexpected error: ${error && error.message ? error.message : String(error)}`
  );
  process.exit(1);
});
