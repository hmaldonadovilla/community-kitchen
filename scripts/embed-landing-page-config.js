const fs = require('fs');
const path = require('path');
const { resolveConfigEnv } = require('./embed-form-configs');

const root = path.resolve(__dirname, '..');
const fileName = 'landing_page.json';
const outPath = path.join(root, 'src', 'config', 'bundledLandingPageConfig.ts');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const resolveLandingPageConfigPath = configEnv => {
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
    console.error('[embed-landing-page-config] Failed parsing JSON', filePath, err && err.message ? err.message : err);
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
  const match = candidates.find(candidate => fs.existsSync(candidate));
  return match || '';
};

const toDataUrl = filePath => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    console.error('[embed-landing-page-config] Unsupported landing image type:', filePath);
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
    .filter(file => file.toLowerCase() !== fileName);

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
    console.error('[embed-landing-page-config] Failed fetching remote landing image:', rawUrl, err && err.message ? err.message : err);
    process.exit(1);
  }

  if (!response.ok) {
    console.error('[embed-landing-page-config] Remote landing image request failed:', rawUrl, 'status', response.status);
    process.exit(1);
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim() || inferMimeTypeFromUrl(rawUrl);
  if (!contentType) {
    console.error('[embed-landing-page-config] Unable to determine remote landing image type:', rawUrl);
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
    console.error('[embed-landing-page-config] Missing landing image asset:', normalized);
    process.exit(1);
  }
  return toDataUrl(resolvedImagePath);
};

const inlineLandingImages = async (parsedConfig, configPath, configEnv) => {
  const config = parsedConfig && typeof parsedConfig === 'object' ? parsedConfig : {};
  const apps = Array.isArray(config.apps) ? config.apps : [];

  if (config.appHeader && typeof config.appHeader === 'object' && !((config.appHeader.logoUrl || '').toString().trim())) {
    const logoFormKey = (config.appHeader.logoFormKey || '').toString().trim();
    if (logoFormKey) {
      const formExport = resolveFormConfigExport(configEnv, logoFormKey);
      const referencedLogoUrl = (formExport?.form?.appHeader?.logoUrl || '').toString().trim();
      if (!referencedLogoUrl) {
        console.error('[embed-landing-page-config] Missing appHeader.logoUrl on referenced landing logo form:', logoFormKey);
        process.exit(1);
      }
      config.appHeader.logoUrl = await resolveImageUrl(referencedLogoUrl, configPath);
    }
  }

  apps.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    if ((entry.imageUrl || '').toString().trim()) return;
    const imagePath = (entry.imagePath || '').toString().trim();
    if (!imagePath) return;
    entry.imageUrl = `__PENDING__${index}`;
  });

  for (let index = 0; index < apps.length; index += 1) {
    const entry = apps[index];
    if (!entry || typeof entry !== 'object') continue;
    if ((entry.imageUrl || '').toString().trim() !== `__PENDING__${index}`) continue;
    entry.imageUrl = await resolveImageUrl(entry.imagePath, configPath);
  }

  return config;
};

const main = async () => {
  const configEnv = resolveConfigEnv();
  const configPath = resolveLandingPageConfigPath(configEnv);
  const relativeConfigPath = path.relative(path.join(root, 'docs', 'config', 'exports'), configPath);
  const effectiveConfigEnv = configEnv || (relativeConfigPath.startsWith(`staging${path.sep}`) ? 'staging' : '');

  if (!fs.existsSync(configPath)) {
    console.error('[embed-landing-page-config] Missing landing page export:', configPath);
    process.exit(1);
  }

  let parsed = readJsonFile(configPath);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[embed-landing-page-config] Invalid landing page config object in', configPath);
    process.exit(1);
  }

  parsed = await inlineLandingImages(parsed, configPath, effectiveConfigEnv);

  const banner =
    '// Auto-generated by scripts/embed-landing-page-config.js. Do not edit by hand.\n' +
    `// Contains the landing page export embedded from ${path.relative(root, configPath)}.\n`;

  const output = `${banner}\nimport type { LandingPageConfig } from './landingPageTypes';\n\nexport const BUNDLED_LANDING_PAGE_CONFIG_ENV = ${JSON.stringify(
    effectiveConfigEnv
  )} as const;\nexport const BUNDLED_LANDING_PAGE_CONFIG = ${JSON.stringify(parsed, null, 2)} as LandingPageConfig;\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.info('[embed-landing-page-config] Embedded landing page config from', configPath, 'into', outPath);
};

if (require.main === module) {
  main().catch(err => {
    console.error('[embed-landing-page-config] Failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  resolveLandingPageConfigPath,
  main
};
