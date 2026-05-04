const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeToIsoDate = value => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = value.toString().trim();
  if (!raw) return '';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
};

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

const shiftIsoDate = (iso, dayOffset) => {
  const match = toText(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  next.setDate(next.getDate() + dayOffset);
  return normalizeToIsoDate(next) || iso;
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
    this.inventoryReservationRepository = options.inventoryReservationRepository;
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
    const fromStatuses = Array.isArray(rule && rule.fromStatuses)
      ? rule.fromStatuses.map(value => toText(value).toLowerCase()).filter(Boolean)
      : [];
    const status = this.resolveCurrentStatus(form, rule, record).toLowerCase();
    if (fromStatuses.length && !fromStatuses.includes(status)) return false;
    const dateIso = normalizeToIsoDate(this.readRecordField(record, rule && rule.dateFieldId));
    if (!dateIso) return false;
    const offsetDays = Number.isFinite(Number(rule && rule.dayOffset || 0)) ? Math.trunc(Number(rule && rule.dayOffset || 0)) : 0;
    const compareIso = offsetDays ? shiftIsoDate(currentTodayIso, offsetDays) : currentTodayIso;
    if ((rule && rule.compare) === 'onOrBeforeToday') return dateIso <= compareIso;
    return dateIso < compareIso;
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

  async releaseReservationsForSource(formKey, sourceRecordId, ledgerFormKey) {
    if (!this.inventoryReservationRepository || typeof this.inventoryReservationRepository.reconcile !== 'function') {
      throw new Error('Inventory reservation repository is not configured for lifecycle recompute.');
    }
    const result = await this.inventoryReservationRepository.reconcile({
      sourceFormKey: formKey,
      sourceRecordId,
      ledgerFormKey,
      mode: 'release'
    });
    if (!result || !result.success) throw new Error(result && result.message ? result.message : 'Failed to release inventory reservations.');
    return Number(result.reconciledReservations || 0) || 0;
  }

  async activeReservationsForForm(formKey, ledgerFormKey) {
    if (!this.inventoryReservationRepository || typeof this.inventoryReservationRepository.activeReservations !== 'function') {
      throw new Error('Inventory reservation repository is not configured for lifecycle recompute.');
    }
    return this.inventoryReservationRepository.activeReservations(ledgerFormKey, { SOURCE_FORM_KEY: formKey });
  }

  async runReservationReleaseRule(entry, rule, recordsById, currentTodayIso) {
    const ledgerFormKey = toText(rule.ledgerFormKey) || toText(entry.form.reservationLifecycle && entry.form.reservationLifecycle.ledgerFormKey) || DEFAULT_LEDGER_FORM_KEY;
    const activeReservations = await this.activeReservationsForForm(entry.formKey, ledgerFormKey);
    const sourceRecordIds = Array.from(new Set(activeReservations.map(record => this.readRecordField(record, 'SOURCE_RECORD_ID')).map(toText).filter(Boolean)));
    let updatedRecords = 0;
    for (const sourceRecordId of sourceRecordIds) {
      const sourceRecord = recordsById.get(sourceRecordId);
      if (rule.type === 'releaseActiveReservations') {
        updatedRecords += await this.releaseReservationsForSource(entry.formKey, sourceRecordId, ledgerFormKey);
        continue;
      }
      if (!sourceRecord) {
        if (rule.releaseWhenSourceMissing === false) continue;
        updatedRecords += await this.releaseReservationsForSource(entry.formKey, sourceRecordId, ledgerFormKey);
        continue;
      }
      if (this.shouldApplyRule(entry.form, rule, sourceRecord, currentTodayIso)) {
        updatedRecords += await this.releaseReservationsForSource(entry.formKey, sourceRecordId, ledgerFormKey);
      }
    }
    return updatedRecords;
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
        const recordsById = new Map((records || []).map(record => [toText(record && record.id), record]).filter(([id]) => id));
        let formUpdates = 0;
        for (const rule of rules) {
          if (!rule || !rule.type) continue;
          if (rule.type === 'releaseActiveReservations' || rule.type === 'releaseStaleReservations') {
            formUpdates += await this.runReservationReleaseRule(entry, rule, recordsById, currentTodayIso);
            continue;
          }
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
