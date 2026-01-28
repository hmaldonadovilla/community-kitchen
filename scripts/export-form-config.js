const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

const readFlag = name => {
  const direct = args.find(arg => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return null;
};

const parseEnvContent = content => {
  if (!content) return {};
  const out = {};
  content
    .split(/\r?\n/)
    .map(line => line.trim())
    .forEach(line => {
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq < 0) return;
      const key = line.slice(0, eq).trim();
      if (!key) return;
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    });
  return out;
};

const loadEnvFile = envPath => {
  if (!envPath || !fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvContent(raw);
    Object.entries(parsed).forEach(([key, value]) => {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error('[export-form-config] Failed reading .env file:', err && err.message ? err.message : err);
    process.exit(1);
  }
};

loadEnvFile(path.join(root, '.env'));

const slugify = value =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'form_config';

const buildRequestUrl = (appUrlValue, formKeyValue) => {
  const target = new URL(appUrlValue);
  target.searchParams.set('config', '1');
  if (formKeyValue && formKeyValue.toString().trim()) {
    target.searchParams.set('form', formKeyValue.toString().trim());
  }
  return target;
};

const resolveOutputPath = (formKeyValue, outPathArg) => {
  const defaultDir = path.join(root, 'docs', 'config', 'exports');
  if (outPathArg) {
    const outPathAbs = path.isAbsolute(outPathArg) ? outPathArg : path.join(root, outPathArg);
    if (outPathAbs.toLowerCase().endsWith('.json')) {
      return outPathAbs;
    }
    return path.join(outPathAbs, `${slugify(formKeyValue)}.json`);
  }
  return path.join(defaultDir, `${slugify(formKeyValue)}.json`);
};

const requestJson = (url, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects.'));
      return;
    }
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, res => {
      const status = res.statusCode || 0;
      const location = res.headers && res.headers.location;
      if (status >= 300 && status < 400 && location) {
        try {
          const nextUrl = new URL(location, url);
          resolve(requestJson(nextUrl, redirectCount + 1));
        } catch (err) {
          reject(err);
        }
        return;
      }
      if (status >= 400) {
        reject(new Error(`Request failed with status ${status}.`));
        return;
      }
      let body = '';
      res.on('data', chunk => {
        body += chunk.toString();
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('Response was not valid JSON.'));
        }
      });
    });
    req.on('error', reject);
  });

const main = async () => {
  const appUrl = readFlag('url') || process.env.CK_APP_URL || process.env.APP_SCRIPT_URL;
  const formKey = readFlag('form') || process.env.CK_FORM_KEY || '';
  const outArg = readFlag('out') || process.env.CK_EXPORT_OUT || '';

  if (!appUrl) {
    console.error('[export-form-config] Missing --url (or CK_APP_URL env var).');
    console.error(
      'Usage: node scripts/export-form-config.js --url <appUrl> [--form "Config: My Form"] [--out docs/config/exports/my_form.json]'
    );
    process.exit(1);
  }

  try {
    const targetUrl = buildRequestUrl(appUrl, formKey);
    console.info('[export-form-config] Fetching', targetUrl.toString());
    const json = await requestJson(targetUrl);
    const resolvedFormKey = (json && json.formKey) || formKey || 'form_config';
    const outPath = resolveOutputPath(resolvedFormKey, outArg);
    const pretty = JSON.stringify(json, null, 2);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pretty, 'utf8');
    console.info('[export-form-config] Saved', pretty.length, 'bytes to', outPath);
  } catch (err) {
    console.error('[export-form-config] Failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { parseEnvContent, loadEnvFile, main };
