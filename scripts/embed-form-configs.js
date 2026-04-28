const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const readFlag = name => {
  const direct = args.find(arg => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return null;
};

const resolveBundleMode = () => {
  const raw = (
    readFlag('bundle-mode') ||
    readFlag('config-bundle-mode') ||
    process.env.CK_CONFIG_BUNDLE_MODE ||
    'full'
  )
    .toString()
    .trim()
    .toLowerCase();
  return raw === 'full' ? 'full' : 'slim';
};

const resolveLanguageMode = () => {
  const raw = (readFlag('languages') || readFlag('config-languages') || process.env.CK_CONFIG_LANGUAGES || 'en')
    .toString()
    .trim()
    .toLowerCase();
  return raw === 'full' || raw === 'all' || raw === '*' ? 'full' : 'en';
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

const loadEnvFile = (envPath, override = false) => {
  if (!envPath || !fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvContent(raw);
    Object.entries(parsed).forEach(([key, value]) => {
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error('[embed-form-configs] Failed reading .env file:', err && err.message ? err.message : err);
    process.exit(1);
  }
};

const normalizeEnvName = value => {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'production') return 'prod';
  return raw;
};

const resolveConfigEnv = () =>
  normalizeEnvName(
    readFlag('env') || readFlag('config-env') || process.env.CK_CONFIG_ENV || process.env.CK_ENV || process.env.DEPLOY_ENV
  );

const resolveConfigsDir = configEnv =>
  configEnv ? path.join(root, 'docs', 'config', 'exports', configEnv) : path.join(root, 'docs', 'config', 'exports');

const outPath = path.join(root, 'src', 'config', 'bundledFormConfigs.ts');

const isNonEnglishLocalizedKey = key => {
  const normalized = (key || '').toString().trim();
  if (!normalized) return false;
  if (normalized === 'fr' || normalized === 'nl' || normalized === 'FR' || normalized === 'NL') return true;
  if (/(?:Fr|Nl)$/.test(normalized)) return true;
  if (/(^|[\s(_-])(FR|NL)(\)|$)/.test(normalized)) return true;
  return false;
};

const pruneEnglishOnly = value => {
  if (Array.isArray(value)) {
    return value.map(item => pruneEnglishOnly(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const out = {};

  Object.entries(value).forEach(([key, entryValue]) => {
    if (isNonEnglishLocalizedKey(key)) {
      return;
    }

    if (key === 'languages' && Array.isArray(entryValue)) {
      out[key] = entryValue.filter(item => (item || '').toString().trim().toUpperCase() === 'EN');
      if (!out[key].length) out[key] = ['EN'];
      return;
    }

    if (key === 'defaultLanguage') {
      out[key] = 'EN';
      return;
    }

    if (key === 'languageSelectorEnabled') {
      out[key] = false;
      return;
    }

    out[key] = pruneEnglishOnly(entryValue);
  });

  return out;
};

const listConfigFiles = configsDir => {
  if (!fs.existsSync(configsDir)) return [];
  return fs
    .readdirSync(configsDir)
    .filter(fileName => fileName && fileName.toLowerCase().endsWith('.json'))
    .filter(fileName => fileName.toLowerCase() !== 'landing_page.json')
    .filter(fileName => fileName.toLowerCase() !== 'analytics_page.json')
    .sort();
};

const parseConfigFile = (configsDir, fileName, bundleMode = 'full', languageMode = 'en') => {
  const fullPath = path.join(configsDir, fileName);
  let raw = '';
  try {
    raw = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.error('[embed-form-configs] Failed reading', fullPath, err && err.message ? err.message : err);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[embed-form-configs] Failed parsing JSON', fullPath, err && err.message ? err.message : err);
    process.exit(1);
  }

  if (!parsed || typeof parsed !== 'object') {
    console.error('[embed-form-configs] Invalid config object in', fullPath);
    process.exit(1);
  }

  if (!parsed.formKey || !parsed.formKey.toString().trim()) {
    parsed.formKey = fileName.replace(/\.json$/i, '');
  }

  if (languageMode === 'en') {
    parsed = pruneEnglishOnly(parsed);
  }

  const cacheFingerprint = crypto
    .createHash('md5')
    .update(
      JSON.stringify({
        form: parsed.form || {},
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        dedupRules: Array.isArray(parsed.dedupRules) ? parsed.dedupRules : [],
        definition: parsed.definition || null
      })
    )
    .digest('hex');
  parsed.cacheFingerprint = cacheFingerprint;

  if (bundleMode !== 'full') {
    const form = parsed.form && typeof parsed.form === 'object' ? parsed.form : {};
    const slimForm = {
      title: form.title,
      configSheet: form.configSheet,
      destinationTab: form.destinationTab,
      description: form.description,
      appUrl: form.appUrl,
      formId: form.formId,
      rowIndex: form.rowIndex,
      appHeader: form.appHeader
    };
    Object.keys(slimForm).forEach(key => {
      if (slimForm[key] === undefined || slimForm[key] === null || slimForm[key] === '') {
        delete slimForm[key];
      }
    });
    return {
      formKey: parsed.formKey,
      generatedAt: parsed.generatedAt,
      form: slimForm,
      cacheFingerprint,
      validationErrors: Array.isArray(parsed.validationErrors) ? parsed.validationErrors : []
    };
  }

  return parsed;
};

const main = () => {
  loadEnvFile(path.join(root, '.env'));
  const configEnv = resolveConfigEnv();
  if (configEnv) {
    loadEnvFile(path.join(root, `.env.${configEnv}`), true);
  }
  const configsDir = resolveConfigsDir(configEnv);

  if (configEnv && !fs.existsSync(configsDir)) {
    console.error('[embed-form-configs] Missing config export dir for env:', configEnv, '->', configsDir);
    process.exit(1);
  }

  const bundleMode = resolveBundleMode();
  const languageMode = resolveLanguageMode();
  const files = listConfigFiles(configsDir);
  const configs = files.map(fileName => parseConfigFile(configsDir, fileName, bundleMode, languageMode));

  const banner =
    '// Auto-generated by scripts/embed-form-configs.js. Do not edit by hand.\n' +
    `// Contains ${bundleMode} exported form configuration metadata embedded from /docs/config/exports${configEnv ? `/${configEnv}` : ''} (${languageMode === 'en' ? 'English only' : 'all languages'}).\n`;

  const output = `${banner}\nimport type { FormConfigExport } from '../types';\n\nexport const BUNDLED_CONFIG_ENV = ${JSON.stringify(
    configEnv || ''
  )} as const;\nexport const BUNDLED_FORM_CONFIGS = ${JSON.stringify(configs, null, 2)} as unknown as FormConfigExport[];\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.info('[embed-form-configs] Embedded', configs.length, 'config(s) in', bundleMode, 'mode into', outPath);
};

if (require.main === module) {
  main();
}

module.exports = {
  normalizeEnvName,
  resolveBundleMode,
  resolveLanguageMode,
  resolveConfigEnv,
  resolveConfigsDir,
  main
};
