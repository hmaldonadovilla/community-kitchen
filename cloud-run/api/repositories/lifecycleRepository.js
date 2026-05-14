const { shouldApplyLifecycleStatusDateRule } = require('../domain/lifecycleRules');

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const todayIso = env => {
  const timeZone = toText(env.CK_TIMEZONE || env.TZ) || 'Europe/Brussels';
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    // Fall through to UTC.
  }
  return new Date().toISOString().slice(0, 10);
};

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

class LifecycleRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.configRepository = options.configRepository;
    this.submissionRepository = options.submissionRepository;
    this.bankUtilisationRepository = options.bankUtilisationRepository;
  }

  listEntries() {
    if (!this.configRepository || typeof this.configRepository.listConfigs !== 'function') return [];
    return this.configRepository
      .listConfigs()
      .map(config => {
        const form = (config && config.form) || {};
        const definition = (config && config.definition) || {};
        const formKey = toText((config && config.formKey) || form.configSheet || form.title);
        return formKey ? { config, form, definition, formKey } : null;
      })
      .filter(Boolean);
  }

  resolveStatusFieldId(form, rule) {
    return toText(rule && rule.statusFieldId) || toText(form && form.followupConfig && form.followupConfig.statusFieldId);
  }

  readRecordField(record, fieldId) {
    const id = toText(fieldId);
    if (!record || !id) return undefined;
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, id)) return record.values[id];
    const lower = id.toLowerCase();
    if (lower === 'status') return record.status;
    if (lower === 'id') return record.id;
    if (lower === 'createdat') return record.createdAt;
    if (lower === 'updatedat') return record.updatedAt;
    if (lower === 'pdfurl') return record.pdfUrl;
    return undefined;
  }

  resolveCurrentStatus(form, rule, record) {
    const statusFieldId = this.resolveStatusFieldId(form, rule);
    const fieldValue = statusFieldId ? this.readRecordField(record, statusFieldId) : undefined;
    return toText(fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue : record && record.status);
  }

  shouldApplyRule(form, rule, record, currentTodayIso) {
    return shouldApplyLifecycleStatusDateRule({
      rule,
      currentStatus: this.resolveCurrentStatus(form, rule, record),
      rawDateValue: this.readRecordField(record, rule && rule.dateFieldId),
      todayIso: currentTodayIso
    });
  }

  async records(formKey) {
    if (!this.submissionRepository || typeof this.submissionRepository.records !== 'function') {
      throw new Error('Submission repository is not configured for lifecycle recompute.');
    }
    return this.submissionRepository.records(formKey);
  }

  async saveRecordStatus(entry, rule, record) {
    const statusFieldId = this.resolveStatusFieldId(entry.form, rule);
    const values = cloneJson((record && record.values) || {});
    if (statusFieldId) values[statusFieldId] = rule.toStatus;
    const payload = {
      formKey: entry.formKey,
      language: toText(record.language) || 'EN',
      id: toText(record.id),
      values,
      status: rule.toStatus,
      __ckSkipSubmitEffects: true,
      __ckAllowClosedUpdate: '1',
      __ckSaveMode: 'draft',
      __ckNoopIfUnchanged: '1',
      __ckAuditAction: `lifecycle:${toText(rule.id || rule.type) || 'statusTransition'}`
    };
    Object.keys(values).forEach(fieldId => {
      payload[fieldId] = values[fieldId];
    });
    if (Number.isFinite(Number(record.dataVersion)) && Number(record.dataVersion) > 0) {
      payload.__ckClientDataVersion = Number(record.dataVersion);
    }
    const result = await this.submissionRepository.saveSubmissionWithId(payload);
    if (!result || !result.success) throw new Error(result && result.message ? result.message : 'Failed to save lifecycle status update.');
  }

  async runDailyLifecycleRecompute() {
    const currentTodayIso = todayIso(this.env);
    const errors = [];
    let updatedForms = 0;
    let updatedRecords = 0;
    for (const entry of this.listEntries()) {
      const rules = Array.isArray(entry.form && entry.form.lifecycle && entry.form.lifecycle.rules) ? entry.form.lifecycle.rules : [];
      if (!rules.length) continue;
      try {
        const records = await this.records(entry.formKey);
        let formUpdates = 0;
        for (const rule of rules) {
          if (!rule || !rule.type) continue;
          if (rule.type !== 'dateStatusTransition') continue;
          for (const record of records || []) {
            if (!record || !record.id || !this.shouldApplyRule(entry.form, rule, record, currentTodayIso)) continue;
            const targetStatus = toText(rule.toStatus);
            if (!targetStatus || this.resolveCurrentStatus(entry.form, rule, record).toLowerCase() === targetStatus.toLowerCase()) continue;
            await this.saveRecordStatus(entry, rule, record);
            formUpdates += 1;
          }
        }
        if (formUpdates > 0) {
          updatedForms += 1;
          updatedRecords += formUpdates;
        }
      } catch (err) {
        errors.push(`${entry.formKey}: ${(err && err.message) || (err && err.toString && err.toString()) || 'Unknown lifecycle recompute error'}`);
      }
    }
    return {
      success: errors.length === 0,
      updatedForms,
      updatedRecords,
      errors,
      todayIso: currentTodayIso
    };
  }
}

const createLifecycleRepository = deps =>
  deps && deps.lifecycleRepository ? deps.lifecycleRepository : new LifecycleRepository(deps || {});

module.exports = {
  LifecycleRepository,
  createLifecycleRepository
};
