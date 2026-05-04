const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_BUNDLE_PATH = path.join(__dirname, '..', 'generated', 'formConfigs.json');

const normalizeKey = value => (value || '').toString().trim().toLowerCase();

const clone = value => JSON.parse(JSON.stringify(value));

const createTargetUrl = (form, env) => {
  const appUrl = (form && form.appUrl ? form.appUrl : '').toString().trim();
  if (appUrl) return appUrl;
  const baseUrl = (env.CK_APP_URL || env.CLASP_TARGET_WEB_APP_URL || env.CK_WEB_APP_URL || '').toString().trim();
  const formKey = (form && (form.configSheet || form.title) ? form.configSheet || form.title : '').toString().trim();
  if (!baseUrl || !formKey) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}form=${encodeURIComponent(formKey)}`;
};

class FormConfigRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.bundlePath = options.bundlePath || this.env.CK_FORM_CONFIG_BUNDLE_PATH || DEFAULT_CONFIG_BUNDLE_PATH;
    this.bundle = options.bundle || null;
  }

  loadBundle() {
    if (this.bundle) return this.bundle;
    try {
      const raw = fs.readFileSync(this.bundlePath, 'utf8');
      this.bundle = JSON.parse(raw);
    } catch (err) {
      const message = err && err.message ? err.message : 'unknown';
      throw new Error(`Cloud Run form config bundle is not available: ${message}`);
    }
    return this.bundle;
  }

  listConfigs() {
    const bundle = this.loadBundle();
    return Array.isArray(bundle.forms) ? bundle.forms : [];
  }

  getConfigEnv() {
    const bundle = this.loadBundle();
    return (bundle.env || this.env.CK_CONFIG_ENV || this.env.CK_ENV || '').toString().trim() || undefined;
  }

  findConfig(formKey) {
    const requested = normalizeKey(formKey);
    const configs = this.listConfigs();
    if (!requested) return configs[0] || null;
    return (
      configs.find(config => {
        const form = config && config.form ? config.form : {};
        const keys = [config.formKey, form.configSheet, form.title, config.title].map(normalizeKey).filter(Boolean);
        return keys.includes(requested);
      }) || null
    );
  }

  fetchFormConfig(formKey) {
    const config = this.findConfig(formKey);
    if (!config) throw new Error(`Form config not found: ${formKey || '__DEFAULT__'}.`);
    return clone(config);
  }

  fetchFormCatalog() {
    return this.listConfigs()
      .map(config => {
        const form = config && config.form ? config.form : {};
        const formKey = (config.formKey || form.configSheet || form.title || '').toString().trim();
        if (!formKey) return null;
        const title = (form.title || formKey).toString().trim() || formKey;
        return {
          formKey,
          title,
          description: (form.description || '').toString().trim() || undefined,
          targetUrl: createTargetUrl(form, this.env),
          logoUrl: (form.appHeader && form.appHeader.logoUrl ? form.appHeader.logoUrl : '').toString().trim() || undefined
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title));
  }
}

const createFormConfigRepository = deps =>
  deps && deps.formConfigRepository ? deps.formConfigRepository : new FormConfigRepository(deps || {});

module.exports = {
  DEFAULT_CONFIG_BUNDLE_PATH,
  FormConfigRepository,
  createFormConfigRepository
};
