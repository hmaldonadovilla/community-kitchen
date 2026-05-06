const {
  buildRecordVisibilityContext,
  matchesWhenClause,
  resolveTemplateValue
} = require('./updateRecordDependencies');

const ROW_ID_KEY = '__ckRowId';
const FOLLOWUP_LINE_ITEM_META_KEYS = new Set(['__ckRowId', '__ckParentRowId', '__ckParentGroupId']);
const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isTruthyFlag = value => value === true || value === 'true' || value === '1' || value === 1;

const resolveLocalizedTextValue = (value, language, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value !== 'object' || Array.isArray(value)) return value.toString();
  const key = (language || 'EN').toString().trim().toLowerCase();
  return (
    value[key] ||
    value[key.toUpperCase()] ||
    value.en ||
    value.EN ||
    value.fr ||
    value.FR ||
    value.nl ||
    value.NL ||
    fallback
  );
};

const normalizeLanguage = raw => {
  const value = Array.isArray(raw) ? raw[raw.length - 1] || raw[0] : raw;
  const language = (value || 'EN').toString().trim().toUpperCase();
  return ['EN', 'FR', 'NL'].includes(language) ? language : 'EN';
};

const parseRows = raw => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildReservationSubgroupKey = (parentGroupId, parentRowId, subGroupId) =>
  `${toText(parentGroupId)}::${toText(parentRowId)}::${toText(subGroupId)}`;

const toFiniteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const readPathValue = (root, pathRaw) => {
  const path = toText(pathRaw);
  if (!path) return '';
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    if (typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
      continue;
    }
    if (
      typeof current === 'object' &&
      current.values &&
      typeof current.values === 'object' &&
      Object.prototype.hasOwnProperty.call(current.values, part)
    ) {
      current = current.values[part];
      continue;
    }
    return '';
  }
  return current === undefined ? '' : current;
};

const hasResolvedValue = value => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const normalizeLookupCollection = value => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const splitDelimitedValues = (value, delimiterRaw) => {
  const raw = `${value === undefined || value === null ? '' : value}`.trim();
  if (!raw) return [];
  const delimiter = delimiterRaw === undefined || delimiterRaw === null ? ',' : delimiterRaw.toString();
  return raw.split(delimiter).map(token => token.trim()).filter(Boolean);
};

const buildTemplateVars = args => ({
  count: args.impactedCount || 0,
  targetFormKey: args.targetFormKey,
  targetFormTitle: args.targetFormTitle || args.targetFormKey,
  source: {
    id: (args.sourceRecord && args.sourceRecord.id) || '',
    createdAt: (args.sourceRecord && args.sourceRecord.createdAt) || '',
    updatedAt: (args.sourceRecord && args.sourceRecord.updatedAt) || '',
    status: (args.sourceRecord && args.sourceRecord.status) || '',
    ...((args.sourceRecord && args.sourceRecord.values) || {})
  },
  row: cloneJson(args.row || {}),
  parent: cloneJson(args.parent || {}),
  lineItem: {
    groupId: args.lineItem && args.lineItem.groupId ? args.lineItem.groupId : '',
    subGroupPath: args.lineItem && Array.isArray(args.lineItem.subGroupPath) ? args.lineItem.subGroupPath.slice() : [],
    index: Number.isFinite(Number(args.lineItem && args.lineItem.index)) ? Number(args.lineItem.index) : 0,
    rowId: args.lineItem && args.lineItem.rowId ? args.lineItem.rowId : ''
  }
});

const buildRowContext = ({ row, groupKey, parentValues, topCtx }) => {
  const rowValues = row && row.values ? row.values : row || {};
  const scopedPrefix = groupKey ? `${groupKey}__` : '';
  const getValue = fieldIdRaw => {
    const fieldId = toText(fieldIdRaw);
    const localId = scopedPrefix && fieldId.startsWith(scopedPrefix) ? fieldId.slice(scopedPrefix.length) : fieldId;
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, localId)) return rowValues[localId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, localId)) return parentValues[localId];
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return rowValues[fieldId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return parentValues[fieldId];
    return topCtx && typeof topCtx.getValue === 'function' ? topCtx.getValue(fieldId) : undefined;
  };
  return {
    getValue,
    getLineValue: (_rowId, fieldId) => getValue(fieldId),
    getLineItems: topCtx && typeof topCtx.getLineItems === 'function' ? topCtx.getLineItems : () => [],
    getLineItemKeys: topCtx && typeof topCtx.getLineItemKeys === 'function' ? topCtx.getLineItemKeys : () => []
  };
};

class SubmitEffectsRepository {
  constructor(options = {}) {
    this.submissionRepository = options.submissionRepository;
    this.inventoryReservationRepository = options.inventoryReservationRepository || null;
    this.lookupCache = new Map();
  }

  ensureRepository() {
    if (!this.submissionRepository) throw new Error('Submission repository is not configured.');
  }

  getFormContext(formKey) {
    this.ensureRepository();
    return this.submissionRepository.getFormContext(formKey);
  }

  normalizeSourceRecord(formObject, questions, formKey, saveMeta) {
    const values = formObject && formObject.values && typeof formObject.values === 'object' ? cloneJson(formObject.values) : {};
    (questions || [])
      .filter(question => question && question.type !== 'BUTTON')
      .forEach(question => {
        const id = toText(question.id);
        if (!id || Object.prototype.hasOwnProperty.call(values, id)) return;
        if (Object.prototype.hasOwnProperty.call(formObject || {}, id)) {
          values[id] = formObject[id];
          return;
        }
        if (question.type === 'LINE_ITEM_GROUP') {
          const jsonKey = `${id}_json`;
          if (Object.prototype.hasOwnProperty.call(formObject || {}, jsonKey)) values[id] = formObject[jsonKey];
        }
      });
    (questions || [])
      .filter(question => question && question.type === 'LINE_ITEM_GROUP')
      .forEach(question => {
        const id = toText(question.id);
        const raw = values[id];
        if (typeof raw === 'string' && raw.trim()) {
          try {
            values[id] = JSON.parse(raw);
          } catch {
            // Keep the raw value when it is not JSON.
          }
        }
      });
    const status =
      formObject && formObject.__ckStatus !== undefined && formObject.__ckStatus !== null
        ? formObject.__ckStatus
        : formObject && formObject.status !== undefined && formObject.status !== null
          ? formObject.status
          : '';
    return {
      formKey,
      language: normalizeLanguage(formObject && formObject.language),
      values,
      id: toText(saveMeta && saveMeta.id) || toText(formObject && formObject.id) || undefined,
      createdAt: toText(saveMeta && saveMeta.createdAt) || toText(formObject && formObject.createdAt) || undefined,
      updatedAt: toText(saveMeta && saveMeta.updatedAt) || toText(formObject && formObject.updatedAt) || undefined,
      status: toText(status) || undefined,
      pdfUrl: toText(formObject && formObject.pdfUrl) || undefined
    };
  }

  shouldRunEffect(effect, operation) {
    const runOn = toText(effect && effect.runOn).toLowerCase() || 'both';
    if (runOn === 'both') return true;
    if (runOn === 'create') return operation === 'create';
    if (runOn === 'update') return operation === 'update';
    return true;
  }

  collectLineItemRowsAtPath(rows, path, parent) {
    if (!Array.isArray(rows) || !rows.length) return [];
    if (!path.length) return rows.map(row => ({ row: row || {}, parent }));
    const [nextGroupId, ...restPath] = path;
    return rows.flatMap(rawRow => {
      const row = rawRow || {};
      const childRows = parseRows(row[nextGroupId] || row[`${nextGroupId}_json`]);
      return this.collectLineItemRowsAtPath(childRows, restPath, row);
    });
  }

  sanitizeTemplateRow(value) {
    if (Array.isArray(value)) return value.map(entry => this.sanitizeTemplateRow(entry));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).forEach(key => {
      if (FOLLOWUP_LINE_ITEM_META_KEYS.has(key)) return;
      out[key] = this.sanitizeTemplateRow(value[key]);
    });
    return out;
  }

  rowId(value) {
    if (!value || typeof value !== 'object') return '';
    return toText(value[ROW_ID_KEY]);
  }

  resolveScopes(effect, sourceRecord, sourceQuestions) {
    const iterator = effect && effect.forEachLineItem;
    if (!iterator || !iterator.groupId) {
      return [{ lineItem: { groupId: '', subGroupPath: [], index: 1, rowId: '' } }];
    }
    const groupId = toText(iterator.groupId);
    const subGroupPath = Array.isArray(iterator.subGroupPath)
      ? iterator.subGroupPath.map(toText).filter(Boolean)
      : toText(iterator.subGroupPath).split('.').map(toText).filter(Boolean);
    const rootRows = parseRows((sourceRecord.values || {})[groupId] || (sourceRecord.values || {})[`${groupId}_json`]);
    const candidates = this.collectLineItemRowsAtPath(rootRows, subGroupPath, undefined);
    const top = buildRecordVisibilityContext(sourceRecord, sourceQuestions || {});
    return candidates
      .filter(match => {
        if (!iterator.when) return true;
        const rowCtx = buildRowContext({
          row: match.row,
          groupKey: groupId,
          parentValues: match.parent,
          topCtx: top.ctx
        });
        return matchesWhenClause(iterator.when, rowCtx, { now: new Date() });
      })
      .map((match, index) => ({
        row: this.sanitizeTemplateRow(match.row),
        parent: match.parent ? this.sanitizeTemplateRow(match.parent) : undefined,
        lineItem: {
          groupId,
          subGroupPath,
          index: index + 1,
          rowId: this.rowId(match.row) || `${(subGroupPath[subGroupPath.length - 1] || groupId || 'row').toString()}_${index}`
        }
      }));
  }

  async resolveFirstNonEmpty(value, vars) {
    const candidates = Array.isArray(value.values) ? value.values : [];
    for (const candidate of candidates) {
      const resolved = await this.resolveComputedValue(resolveTemplateValue(candidate, vars), vars);
      if (hasResolvedValue(resolved)) return resolved;
    }
    return '';
  }

  async resolveComputedCollection(value, vars) {
    if (Object.prototype.hasOwnProperty.call(value, 'collection')) {
      const resolved = await this.resolveComputedValue(resolveTemplateValue(value.collection, vars), vars);
      if (Array.isArray(resolved)) return resolved;
      const normalized = normalizeLookupCollection(resolved);
      if (normalized.length) return normalized;
    }
    const paths = [
      toText(value.collectionPath),
      ...(Array.isArray(value.collectionPathAlternatives)
        ? value.collectionPathAlternatives.map(toText).filter(Boolean)
        : [])
    ].filter(Boolean);
    for (const path of paths) {
      const resolved = normalizeLookupCollection(readPathValue(vars, path));
      if (resolved.length) return resolved;
    }
    return [];
  }

  async filterCollectionEntries(value, vars) {
    const collection = await this.resolveComputedCollection(value, vars);
    if (!collection.length) return [];
    const topCtx = {
      getValue: fieldId => readPathValue(vars, fieldId),
      getLineItems: () => [],
      getLineItemKeys: () => []
    };
    const when = value.when ? resolveTemplateValue(value.when, vars) : undefined;
    const rowFilter =
      value.rowFilter && isPlainObject(value.rowFilter) ? resolveTemplateValue(value.rowFilter, vars) : undefined;
    return collection.filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const rowCtx = buildRowContext({
        row: entry,
        groupKey: toText(value.groupId || value.collectionGroupId) || 'collection',
        parentValues: undefined,
        topCtx
      });
      if (rowFilter && rowFilter.includeWhen && !matchesWhenClause(rowFilter.includeWhen, rowCtx, { now: new Date() })) return false;
      if (rowFilter && rowFilter.excludeWhen && matchesWhenClause(rowFilter.excludeWhen, rowCtx, { now: new Date() })) return false;
      if (when && !matchesWhenClause(when, rowCtx, { now: new Date() })) return false;
      return true;
    });
  }

  async filterCollection(value, vars) {
    const pickFields = Array.isArray(value.pickFields) ? value.pickFields.map(toText).filter(Boolean) : [];
    const entries = await this.filterCollectionEntries(value, vars);
    return entries.map(entry => {
      if (!pickFields.length || !entry || typeof entry !== 'object') return entry;
      const out = {};
      pickFields.forEach(fieldId => {
        out[fieldId] = entry[fieldId];
      });
      return out;
    });
  }

  async flattenCollection(value, vars) {
    const parentRows = await this.filterCollectionEntries(value, vars);
    const nestedCollectionPath = toText(value.nestedCollectionPath);
    if (!parentRows.length || !nestedCollectionPath) return [];
    const pickFields = Array.isArray(value.pickFields) ? value.pickFields.map(toText).filter(Boolean) : [];
    return parentRows.flatMap(entry => {
      const nestedRows = normalizeLookupCollection(readPathValue(entry, nestedCollectionPath));
      if (!pickFields.length) return nestedRows;
      return nestedRows.map(nestedEntry => {
        if (!nestedEntry || typeof nestedEntry !== 'object') return nestedEntry;
        const out = {};
        pickFields.forEach(fieldId => {
          out[fieldId] = nestedEntry[fieldId];
        });
        return out;
      });
    });
  }

  async resolveIfPresent(value, vars) {
    const resolved = toText(value.path) ? readPathValue(vars, value.path) : '';
    return hasResolvedValue(resolved)
      ? this.resolveComputedValue(resolveTemplateValue(value.then, vars), vars)
      : this.resolveComputedValue(resolveTemplateValue(value.else, vars), vars);
  }

  async getLookupMap(args) {
    const cacheKey = JSON.stringify(args);
    if (this.lookupCache.has(cacheKey)) return this.lookupCache.get(cacheKey);
    const map = new Map();
    const records = await this.submissionRepository.records(args.formKey);
    records.forEach(record => {
      const key = toText(record && record.values && record.values[args.keyFieldId]);
      const value = toText(record && record.values && record.values[args.valueFieldId]);
      if (!key || !value || map.has(key)) return;
      map.set(key, value);
    });
    this.lookupCache.set(cacheKey, map);
    return map;
  }

  async resolveLookupSetIntersection(value, vars) {
    const collection = await this.resolveComputedCollection(value, vars);
    const itemFieldId = toText(value.itemFieldId);
    const itemValues = collection
      .map(entry => {
        if (!itemFieldId) return toText(entry);
        if (!entry || typeof entry !== 'object') return '';
        return toText(entry[itemFieldId]);
      })
      .filter(Boolean);
    const fallbackValue = async () => {
      const fallback = await this.resolveComputedValue(resolveTemplateValue(value.fallback, vars), vars);
      return typeof fallback === 'string' ? fallback.trim() : toText(fallback);
    };
    if (!itemValues.length) return fallbackValue();
    const lookupFormKey = toText(value.lookupFormKey);
    const lookupKeyFieldId = toText(value.lookupKeyFieldId);
    const lookupValueFieldId = toText(value.lookupValueFieldId);
    if (!lookupFormKey || !lookupKeyFieldId || !lookupValueFieldId) return '';
    const lookupMap = await this.getLookupMap({
      formKey: lookupFormKey,
      keyFieldId: lookupKeyFieldId,
      valueFieldId: lookupValueFieldId
    });
    const fallback = await fallbackValue();
    let intersection = null;
    const seen = new Set();
    for (const itemValue of itemValues) {
      if (seen.has(itemValue)) continue;
      seen.add(itemValue);
      const lookupValue =
        lookupMap.get(itemValue) ||
        lookupMap.get(itemValue.toLowerCase()) ||
        Array.from(lookupMap.entries()).find(([key]) => key.toLowerCase() === itemValue.toLowerCase())?.[1] ||
        '';
      const tokens = splitDelimitedValues(lookupValue, value.splitOn || ',');
      if (!tokens.length) return fallback;
      if (!intersection) {
        intersection = tokens;
        continue;
      }
      const tokenSet = new Set(tokens.map(token => token.toLowerCase()));
      intersection = intersection.filter(token => tokenSet.has(token.toLowerCase()));
      if (!intersection.length) break;
    }
    const joinWith = value.joinWith === undefined || value.joinWith === null ? ', ' : value.joinWith.toString();
    const joined = (intersection || []).join(joinWith).trim();
    return joined || fallback;
  }

  async resolveComputedValue(value, vars) {
    if (Array.isArray(value)) {
      const out = [];
      for (const entry of value) out.push(await this.resolveComputedValue(entry, vars));
      return out;
    }
    if (!value || typeof value !== 'object') return value;
    const op = toText(value.op);
    if (op === 'lookupSetIntersection') return this.resolveLookupSetIntersection(value, vars);
    if (op === 'firstNonEmpty') return this.resolveFirstNonEmpty(value, vars);
    if (op === 'filterCollection') return this.filterCollection(value, vars);
    if (op === 'flattenCollection') return this.flattenCollection(value, vars);
    if (op === 'ifPresent') return this.resolveIfPresent(value, vars);
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = await this.resolveComputedValue(value[key], vars);
    }
    return out;
  }

  async buildPayloads(effect, sourceRecord, sourceQuestions, targetContext) {
    const scopes = this.resolveScopes(effect, sourceRecord, sourceQuestions);
    const payloads = [];
    for (const scope of scopes) {
      const vars = buildTemplateVars({
        sourceRecord,
        targetFormKey: effect.targetFormKey,
        targetFormTitle: targetContext && targetContext.form && targetContext.form.title,
        row: scope.row,
        parent: scope.parent,
        lineItem: scope.lineItem
      });
      const templated = resolveTemplateValue(effect, vars);
      const resolved = await this.resolveComputedValue(templated, vars);
      const payloadValues = cloneJson(resolved.values || {});
      const payload = {
        formKey: resolved.targetFormKey,
        language: sourceRecord.language || 'EN',
        values: payloadValues,
        __ckSkipSubmitEffects: '1',
        __ckNoopIfUnchanged: '1',
        __ckAuditAction: resolved.auditAction || `submitEffect:${resolved.type}:${sourceRecord.id || 'source'}`
      };
      const recordId = toText(resolved.recordId);
      if (recordId) payload.id = recordId;
      Object.keys(payloadValues).forEach(fieldId => {
        payload[fieldId] = payloadValues[fieldId];
      });
      if (Object.prototype.hasOwnProperty.call(resolved, 'status')) {
        payload.__ckSaveMode = 'draft';
        payload.__ckStatus = resolved.status === undefined || resolved.status === null ? '' : resolved.status.toString();
        if (resolved.status !== undefined && resolved.status !== null) payload.status = resolved.status.toString();
      }
      payloads.push(payload);
    }
    return payloads;
  }

  readPayloadField(payload, fieldId) {
    if (payload && payload.values && Object.prototype.hasOwnProperty.call(payload.values, fieldId)) return payload.values[fieldId];
    if (Object.prototype.hasOwnProperty.call(payload || {}, fieldId)) return payload[fieldId];
    return undefined;
  }

  generatedRecordValues(payload, questions) {
    const out = {};
    (questions || []).forEach(question => {
      const fieldId = toText(question && question.id);
      if (!fieldId || question.type === 'BUTTON') return;
      const raw = this.readPayloadField(payload, fieldId);
      if (raw === undefined) return;
      if (question.type === 'LINE_ITEM_GROUP' && typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
          out[fieldId] = '';
          return;
        }
        try {
          out[fieldId] = cloneJson(JSON.parse(trimmed));
          return;
        } catch {
          out[fieldId] = raw;
          return;
        }
      }
      out[fieldId] = cloneJson(raw);
    });
    return out;
  }

  resolveFinalSubmitStatuses(form) {
    const raw = form && form.reservationLifecycle && form.reservationLifecycle.reconcileOnFinalSubmit;
    if (raw && typeof raw === 'object' && Array.isArray(raw.statuses) && raw.statuses.length) {
      return raw.statuses.map(value => toText(value).toLowerCase()).filter(Boolean);
    }
    const closeStatus = toText(form && form.followupConfig && form.followupConfig.statusTransitions && form.followupConfig.statusTransitions.onClose);
    return closeStatus ? [closeStatus.toLowerCase()] : ['closed'];
  }

  shouldReconcileReservations(form, nextStatus) {
    const raw = form && form.reservationLifecycle && form.reservationLifecycle.reconcileOnFinalSubmit;
    const enabled = raw === true || (raw && typeof raw === 'object' && raw.enabled !== false);
    if (!enabled) return { enabled: false };
    const normalizedStatus = toText(nextStatus).toLowerCase();
    if (!normalizedStatus || !this.resolveFinalSubmitStatuses(form).includes(normalizedStatus)) return { enabled: false };
    const ledgerFormKey =
      (raw && typeof raw === 'object' ? raw.ledgerFormKey : '') ||
      (form.reservationLifecycle && form.reservationLifecycle.ledgerFormKey) ||
      DEFAULT_LEDGER_FORM_KEY;
    const refreshMode =
      raw && typeof raw === 'object' && ['full', 'revisionOnly', 'none'].includes(raw.refreshMode)
        ? raw.refreshMode
        : 'full';
    return { enabled: true, ledgerFormKey: toText(ledgerFormKey) || DEFAULT_LEDGER_FORM_KEY, refreshMode };
  }

  isStatusOnlyClosePayload(form, payload) {
    if (!isTruthyFlag(payload && payload.__ckStatusOnlyClose)) return false;
    if (!toText(payload && payload.id)) return false;
    const requestedStatus = toText((payload && payload.__ckStatus) || (payload && payload.status));
    if (!requestedStatus) return false;
    const closeStatus =
      toText(resolveLocalizedTextValue(
        form && form.followupConfig && form.followupConfig.statusTransitions && form.followupConfig.statusTransitions.onClose,
        payload && payload.language,
        ''
      )) ||
      'Closed';
    return requestedStatus.toLowerCase() === closeStatus.toLowerCase();
  }

  inferReservationFieldId(outputKeyFieldId, suffix) {
    const key = toText(outputKeyFieldId);
    const base = key.endsWith('_ID') ? key.slice(0, -3) : key;
    return base ? `${base}_${suffix}` : '';
  }

  collectStepReservationConfigs(form) {
    const steps = form && form.steps && form.steps.mode === 'guided' && Array.isArray(form.steps.items)
      ? form.steps.items
      : [];
    const configs = [];
    steps.forEach(step => {
      (Array.isArray(step && step.include) ? step.include : []).forEach(target => {
        if (!target || target.kind !== 'lineGroup') return;
        const parentGroupId = toText(target.id);
        if (!parentGroupId) return;
        (Array.isArray(target.dataSourceRows) ? target.dataSourceRows : []).forEach(config => {
          const reservation = config && config.reservation && typeof config.reservation === 'object' ? config.reservation : null;
          if (!reservation || reservation.enabled === false) return;
          if (toText(reservation.commitMode).toLowerCase() !== 'step') return;
          const outputGroupId = toText(config.outputGroupId);
          const outputKeyFieldId = toText(config.outputKeyFieldId || config.rowKeyFieldId);
          const quantityFieldId = toText(config.quantityFieldId);
          const resourceRecordIdFieldId =
            toText(reservation.resourceRecordIdFieldId) || this.inferReservationFieldId(outputKeyFieldId, 'RECORD_ID');
          if (!outputGroupId || !outputKeyFieldId || !quantityFieldId || !resourceRecordIdFieldId) return;
          configs.push({
            parentGroupId,
            outputGroupId,
            outputKeyFieldId,
            quantityFieldId,
            resourceRecordIdFieldId
          });
        });
      });
    });
    return configs;
  }

  readRecordValue(record, fieldId) {
    const key = toText(fieldId);
    if (!record || !key) return undefined;
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, key)) return record.values[key];
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, `${key}_json`)) {
      return record.values[`${key}_json`];
    }
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
    return record[`${key}_json`];
  }

  readReservationRowValue(row, fieldId) {
    const key = toText(fieldId);
    if (!row || !key) return undefined;
    if (row.values && Object.prototype.hasOwnProperty.call(row.values, key)) return row.values[key];
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    return row[`${key}_json`];
  }

  reservationRowId(row) {
    return toText(row && (row[ROW_ID_KEY] || row.id));
  }

  recordHasReservationSelections(form, record) {
    const configs = this.collectStepReservationConfigs(form);
    if (!configs.length) return true;
    if (!record) return false;
    return configs.some(config => {
      const parentRows = parseRows(this.readRecordValue(record, config.parentGroupId));
      return parentRows.some(parentRow => {
        const parentRowId = this.reservationRowId(parentRow);
        const nestedRows = parseRows(this.readReservationRowValue(parentRow, config.outputGroupId));
        const flattenedRows = parentRowId
          ? parseRows(this.readRecordValue(record, buildReservationSubgroupKey(config.parentGroupId, parentRowId, config.outputGroupId)))
          : [];
        return [...nestedRows, ...flattenedRows].some(row => {
          const resourceRecordId = toText(this.readReservationRowValue(row, config.resourceRecordIdFieldId));
          const resourceItemId = toText(this.readReservationRowValue(row, config.outputKeyFieldId));
          const quantity = toFiniteNumber(this.readReservationRowValue(row, config.quantityFieldId));
          return Boolean(resourceRecordId && resourceItemId && quantity > 0);
        });
      });
    });
  }

  buildSkippedReservationReconciliationMeta(recordId) {
    return {
      success: true,
      sourceRecordId: recordId,
      reconciledReservations: 0,
      consumedReservations: 0,
      releasedReservations: 0,
      touchedInventoryRecords: 0
    };
  }

  async applyReservationLifecycle(form, formKey, formObject, result) {
    if (!this.inventoryReservationRepository || !result || !result.success) return result;
    const savedRecordId = toText(result.meta && result.meta.id) || toText(formObject && formObject.id);
    const deleteRecordId = toText(formObject && formObject.__ckDeleteRecordId);
    const releaseOnDeleteConfig = form && form.reservationLifecycle && form.reservationLifecycle.releaseOnDelete;
    const releaseOnDeleteEnabled =
      releaseOnDeleteConfig === true ||
      (releaseOnDeleteConfig && typeof releaseOnDeleteConfig === 'object' && releaseOnDeleteConfig.enabled !== false);
    if (deleteRecordId && releaseOnDeleteEnabled) {
      const ledgerFormKey =
        (typeof releaseOnDeleteConfig === 'object' ? releaseOnDeleteConfig.ledgerFormKey : '') ||
        (form.reservationLifecycle && form.reservationLifecycle.ledgerFormKey) ||
        DEFAULT_LEDGER_FORM_KEY;
      const releaseResult = await this.inventoryReservationRepository.reconcile({
        sourceFormKey: formKey,
        sourceRecordId: deleteRecordId,
        ledgerFormKey,
        mode: 'release',
        refreshMode: 'revisionOnly'
      });
      if (!releaseResult.success) {
        return {
          success: false,
          message: releaseResult.message || 'Record deleted but failed to release active reservations.',
          meta: {
            ...(result.meta || {}),
            reservationRelease: { success: false, sourceRecordId: deleteRecordId }
          }
        };
      }
      result.meta = {
        ...(result.meta || {}),
        reservationRelease: {
          success: true,
          sourceRecordId: deleteRecordId,
          releasedReservations: Number(releaseResult.reconciledReservations || 0) || 0,
          touchedInventoryRecords: Number(releaseResult.touchedInventoryRecords || 0) || 0
        }
      };
    }

    const nextStatus =
      formObject && formObject.__ckStatus !== undefined && formObject.__ckStatus !== null
        ? formObject.__ckStatus
        : formObject && formObject.status !== undefined && formObject.status !== null
          ? formObject.status
          : '';
    const reconcileConfig = this.shouldReconcileReservations(form, nextStatus);
    if (savedRecordId && !deleteRecordId && reconcileConfig.enabled) {
      if (isTruthyFlag(formObject && formObject.__ckSkipReservationReconciliation)) {
        result.meta = {
          ...(result.meta || {}),
          reservationReconciliation: this.buildSkippedReservationReconciliationMeta(savedRecordId)
        };
        return result;
      }
      if (!this.recordHasReservationSelections(form, formObject)) {
        result.meta = {
          ...(result.meta || {}),
          reservationReconciliation: this.buildSkippedReservationReconciliationMeta(savedRecordId)
        };
        return result;
      }
      const reconcileResult = await this.inventoryReservationRepository.reconcile({
        sourceFormKey: formKey,
        sourceRecordId: savedRecordId,
        ledgerFormKey: reconcileConfig.ledgerFormKey,
        refreshMode: reconcileConfig.refreshMode
      });
      if (!reconcileResult.success) {
        return {
          success: false,
          message: reconcileResult.message || 'Record saved but failed to reconcile active reservations.',
          meta: {
            ...(result.meta || {}),
            reservationReconciliation: { success: false, sourceRecordId: savedRecordId },
            sourceSaved: true
          }
        };
      }
      result.meta = {
        ...(result.meta || {}),
        reservationReconciliation: {
          success: true,
          sourceRecordId: savedRecordId,
          reconciledReservations: Number(reconcileResult.reconciledReservations || 0) || 0,
          consumedReservations: Number(reconcileResult.consumedReservations || 0) || 0,
          releasedReservations: Number(reconcileResult.releasedReservations || 0) || 0,
          touchedInventoryRecords: Number(reconcileResult.touchedInventoryRecords || 0) || 0
        }
      };
    }
    return result;
  }

  async saveStatusOnlyCloseWithId(payload, context) {
    const recordId = toText(payload && payload.id);
    const closeStatus = toText((payload && payload.__ckStatus) || (payload && payload.status)) || 'Closed';
    const sourceRecord = await this.submissionRepository.fetchSubmissionById(context.formKey, recordId);
    if (!sourceRecord) {
      return { success: false, message: 'Record not found.', meta: { id: recordId } };
    }
    const sourcePayload = {
      ...sourceRecord,
      formKey: context.formKey,
      language: normalizeLanguage(sourceRecord.language),
      id: recordId,
      values: cloneJson(sourceRecord.values || {}),
      status: closeStatus,
      __ckStatus: closeStatus,
      __ckStatusOnlyClose: '1',
      __ckSkipSubmitEffects: '1',
      __ckClientDataVersion: payload && payload.__ckClientDataVersion
    };
    if (isTruthyFlag(payload && payload.__ckSkipReservationReconciliation)) {
      sourcePayload.__ckSkipReservationReconciliation = '1';
    }
    const statusResult = await this.submissionRepository.saveStatusOnlyWithId(sourcePayload);
    if (!statusResult || !statusResult.success) return statusResult;

    const lifecycleResult = await this.applyReservationLifecycle(
      context.form,
      context.formKey,
      sourcePayload,
      statusResult
    );
    if (!lifecycleResult || !lifecycleResult.success) return lifecycleResult;

    const submitEffectsResult = await this.applySubmitEffects({
      form: context.form,
      questions: context.questions,
      formKey: context.formKey,
      formObject: sourcePayload,
      saveResult: lifecycleResult
    });
    if (!submitEffectsResult.success) {
      return {
        success: false,
        message: submitEffectsResult.message || lifecycleResult.message,
        meta: {
          ...(lifecycleResult.meta || {}),
          submitEffects: submitEffectsResult.meta || undefined,
          sourceSaved: true,
          statusOnlyClose: true
        }
      };
    }
    lifecycleResult.meta = {
      ...(lifecycleResult.meta || {}),
      submitEffects: submitEffectsResult.meta || undefined,
      status: closeStatus,
      statusOnlyClose: true
    };
    return lifecycleResult;
  }

  async applySubmitEffects(args) {
    const effects = Array.isArray(args.form && args.form.followupConfig && args.form.followupConfig.submitEffects)
      ? args.form.followupConfig.submitEffects
      : [];
    if (!effects.length) return { success: true, meta: { configured: 0, executed: 0, created: 0, updated: 0 } };

    const sourceRecord = this.normalizeSourceRecord(args.formObject, args.questions, args.formKey, args.saveResult.meta || {});
    const { ctx } = buildRecordVisibilityContext(sourceRecord, args.questions || []);
    const operation = toText(args.saveResult && args.saveResult.meta && args.saveResult.meta.operation).toLowerCase() || 'update';
    let executed = 0;
    let created = 0;
    let updated = 0;
    const generatedRecords = [];

    try {
      for (let index = 0; index < effects.length; index += 1) {
        const effect = effects[index];
        if (!this.shouldRunEffect(effect, operation)) continue;
        const vars = buildTemplateVars({ sourceRecord, targetFormKey: effect.targetFormKey });
        const resolvedWhen = effect.when ? resolveTemplateValue(effect.when, vars) : undefined;
        if (resolvedWhen && !matchesWhenClause(resolvedWhen, ctx, { now: new Date() })) continue;
        if (effect.type !== 'createRecord' && effect.type !== 'updateRecord') continue;

        const targetContext = this.getFormContext(effect.targetFormKey);
        const payloads = await this.buildPayloads(effect, sourceRecord, args.questions || [], targetContext);
        if (!payloads.length) continue;
        executed += 1;

        for (const payload of payloads) {
          if (effect.type === 'updateRecord' && !toText(payload.id)) {
            throw new Error('Follow-up submit effect updateRecord requires a target recordId.');
          }
          const saveResult = await this.submissionRepository.saveSubmissionWithId(payload);
          if (!saveResult || !saveResult.success) {
            throw new Error(
              toText(saveResult && saveResult.message) ||
                (effect.type === 'updateRecord' ? 'Failed to update downstream record.' : 'Failed to create downstream record.')
            );
          }
          const saveOperation = toText(saveResult.meta && saveResult.meta.operation).toLowerCase();
          if (effect.type === 'updateRecord') {
            if (saveOperation !== 'noop') updated += 1;
          } else {
            created += 1;
            const savedRecordId = toText(saveResult.meta && saveResult.meta.id);
            if (savedRecordId) {
              generatedRecords.push({
                effectId: effect.id ? effect.id.toString() : undefined,
                targetFormKey: effect.targetFormKey,
                recordId: savedRecordId,
                values: this.generatedRecordValues(payload, targetContext.questions)
              });
            }
          }
        }
      }
    } catch (err) {
      const message = toText(err && err.message ? err.message : err) || 'Submit effects failed.';
      return {
        success: false,
        message: `Record saved, but follow-up submit effects failed: ${message}`,
        meta: {
          configured: effects.length,
          executed,
          created,
          updated,
          operation,
          generatedRecords
        }
      };
    }

    return {
      success: true,
      meta: {
        configured: effects.length,
        executed,
        created,
        updated,
        operation,
        generatedRecords
      }
    };
  }

  async saveSubmissionWithId(formObject) {
    const payload = formObject && typeof formObject === 'object' ? formObject : {};
    if (isTruthyFlag(payload.__ckSkipSubmitEffects)) {
      return this.submissionRepository.saveSubmissionWithId(payload);
    }
    const formKey = toText(payload.formKey || payload.form);
    const context = this.getFormContext(formKey);
    if (this.isStatusOnlyClosePayload(context.form, payload)) {
      return this.saveStatusOnlyCloseWithId(payload, context);
    }
    const sourcePayload = { ...payload, __ckSkipSubmitEffects: true };
    const result = await this.submissionRepository.saveSubmissionWithId(sourcePayload);
    if (!result || !result.success) return result;

    const operation = toText(result.meta && result.meta.operation).toLowerCase();
    if (operation === 'noop') return result;

    const lifecycleResult = await this.applyReservationLifecycle(context.form, context.formKey || formKey, payload, result);
    if (!lifecycleResult || !lifecycleResult.success) return lifecycleResult;

    const submitEffectsResult = await this.applySubmitEffects({
      form: context.form,
      questions: context.questions,
      formKey: context.formKey || formKey,
      formObject: payload,
      saveResult: lifecycleResult
    });
    if (!submitEffectsResult.success) {
      return {
        success: false,
        message: submitEffectsResult.message || lifecycleResult.message,
        meta: {
          ...(lifecycleResult.meta || {}),
          submitEffects: submitEffectsResult.meta || undefined,
          sourceSaved: true
        }
      };
    }
    if (submitEffectsResult.meta) {
      lifecycleResult.meta = {
        ...(lifecycleResult.meta || {}),
        submitEffects: submitEffectsResult.meta
      };
    }
    return lifecycleResult;
  }
}

const createSubmitEffectsRepository = deps => new SubmitEffectsRepository(deps || {});

module.exports = {
  SubmitEffectsRepository,
  createSubmitEffectsRepository
};
