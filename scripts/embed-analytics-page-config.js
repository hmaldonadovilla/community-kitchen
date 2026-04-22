const fs = require('fs');
const path = require('path');
const { resolveConfigEnv } = require('./embed-form-configs');

const root = path.resolve(__dirname, '..');
const fileName = 'analytics_page.json';
const outPath = path.join(root, 'src', 'config', 'bundledAnalyticsPageConfig.ts');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const resolveAnalyticsPageConfigPath = configEnv => {
  const candidates = [];
  if (configEnv) candidates.push(path.join(root, 'docs', 'config', 'exports', configEnv, fileName));
  if (!configEnv) candidates.push(path.join(root, 'docs', 'config', 'exports', 'staging', fileName));
  candidates.push(path.join(root, 'docs', 'config', 'exports', fileName));
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
};

const readJsonFile = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('[embed-analytics-page-config] Failed parsing JSON', filePath, err && err.message ? err.message : err);
    process.exit(1);
  }
};

const resolveRepoFilePath = (rawPath, configPath) => {
  const normalized = (rawPath || '').toString().trim();
  if (!normalized) return '';
  const candidates = [
    path.isAbsolute(normalized) ? normalized : path.resolve(root, normalized),
    path.isAbsolute(normalized) ? normalized : path.resolve(path.dirname(configPath), normalized)
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || '';
};

const toDataUrl = filePath => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    console.error('[embed-analytics-page-config] Unsupported analytics image type:', filePath);
    process.exit(1);
  }
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mimeType};base64,${base64}`;
};

const resolveFormConfigExport = (configEnv, formKey) => {
  const matchKey = (formKey || '').toString().trim();
  if (!matchKey) return null;
  const candidateDir = configEnv ? path.join(root, 'docs', 'config', 'exports', configEnv) : path.join(root, 'docs', 'config', 'exports');
  if (!fs.existsSync(candidateDir)) return null;

  const files = fs
    .readdirSync(candidateDir)
    .filter(file => file.toLowerCase().endsWith('.json'))
    .filter(file => file.toLowerCase() !== fileName)
    .filter(file => file.toLowerCase() !== 'landing_page.json');

  for (const file of files) {
    const fullPath = path.join(candidateDir, file);
    const parsed = readJsonFile(fullPath);
    if ((parsed?.formKey || '').toString().trim() === matchKey) {
      return parsed;
    }
  }

  return null;
};

const inferMimeTypeFromUrl = rawUrl => {
  try {
    const parsed = new URL(rawUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return MIME_BY_EXT[ext] || '';
  } catch {
    return '';
  }
};

const fetchRemoteDataUrl = async rawUrl => {
  let response;
  try {
    response = await fetch(rawUrl, { redirect: 'follow' });
  } catch (err) {
    console.error('[embed-analytics-page-config] Failed fetching remote analytics image:', rawUrl, err && err.message ? err.message : err);
    process.exit(1);
  }

  if (!response.ok) {
    console.error('[embed-analytics-page-config] Remote analytics image request failed:', rawUrl, 'status', response.status);
    process.exit(1);
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim() || inferMimeTypeFromUrl(rawUrl);
  if (!contentType) {
    console.error('[embed-analytics-page-config] Unable to determine remote analytics image type:', rawUrl);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
};

const resolveImageUrl = async (rawValue, configPath) => {
  const normalized = (rawValue || '').toString().trim();
  if (!normalized) return '';
  if (normalized.startsWith('data:')) return normalized;
  if (/^https?:\/\//i.test(normalized)) {
    return fetchRemoteDataUrl(normalized);
  }
  const resolvedImagePath = resolveRepoFilePath(normalized, configPath);
  if (!resolvedImagePath) {
    console.error('[embed-analytics-page-config] Missing analytics image asset:', normalized);
    process.exit(1);
  }
  return toDataUrl(resolvedImagePath);
};

const inlineAnalyticsImages = async (parsedConfig, configPath, configEnv) => {
  const config = parsedConfig && typeof parsedConfig === 'object' ? parsedConfig : {};

  if (config.appHeader && typeof config.appHeader === 'object' && !((config.appHeader.logoUrl || '').toString().trim())) {
    const logoFormKey = (config.appHeader.logoFormKey || '').toString().trim();
    if (logoFormKey) {
      const formExport = resolveFormConfigExport(configEnv, logoFormKey);
      const referencedLogoUrl = (formExport?.form?.appHeader?.logoUrl || '').toString().trim();
      if (!referencedLogoUrl) {
        console.error('[embed-analytics-page-config] Missing appHeader.logoUrl on referenced analytics logo form:', logoFormKey);
        process.exit(1);
      }
      config.appHeader.logoUrl = await resolveImageUrl(referencedLogoUrl, configPath);
    }
  }

  if (config.landingTile && typeof config.landingTile === 'object' && !((config.landingTile.imageUrl || '').toString().trim())) {
    const imagePath = (config.landingTile.imagePath || '').toString().trim();
    if (imagePath) {
      config.landingTile.imageUrl = await resolveImageUrl(imagePath, configPath);
    }
  }

  return config;
};

const main = async () => {
  const configEnv = resolveConfigEnv();
  const configPath = resolveAnalyticsPageConfigPath(configEnv);
  const relativeConfigPath = path.relative(path.join(root, 'docs', 'config', 'exports'), configPath);
  const effectiveConfigEnv = configEnv || (relativeConfigPath.startsWith(`staging${path.sep}`) ? 'staging' : '');

  if (!fs.existsSync(configPath)) {
    console.error('[embed-analytics-page-config] Missing analytics page export:', configPath);
    process.exit(1);
  }

  let parsed = readJsonFile(configPath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[embed-analytics-page-config] Invalid analytics page config object in', configPath);
    process.exit(1);
  }

  parsed = await inlineAnalyticsImages(parsed, configPath, effectiveConfigEnv);

  const banner =
    '// Auto-generated by scripts/embed-analytics-page-config.js. Do not edit by hand.\n' +
    `// Contains the analytics page export embedded from ${path.relative(root, configPath)}.\n`;

  const output = `${banner}\nimport type { AnalyticsPageConfig } from './analyticsPageTypes';\n\nexport const BUNDLED_ANALYTICS_PAGE_CONFIG_ENV = ${JSON.stringify(
    effectiveConfigEnv
  )} as const;\nexport const BUNDLED_ANALYTICS_PAGE_CONFIG = ${JSON.stringify(parsed, null, 2)} as AnalyticsPageConfig;\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.info('[embed-analytics-page-config] Embedded analytics page config from', configPath, 'into', outPath);
};

if (require.main === module) {
  main().catch(err => {
    console.error('[embed-analytics-page-config] Failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  resolveAnalyticsPageConfigPath,
  main
};
