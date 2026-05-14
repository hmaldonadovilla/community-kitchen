const crypto = require('crypto');

const DEFAULT_UTILISATION_FORM_KEY = 'Config: Leftover Utilisation';

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeQuantity = value => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatQuantity = value => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? rounded : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};

const isSingleIngredientLeftoverKind = raw => {
  const value = toText(raw).toLowerCase();
  return value === 'single-ingredient' || value === 'single ingredient' || value === 'mono-ingrédient' || value === 'enkel ingrediënt';
};

const md5Base64 = raw => crypto.createHash('md5').update(raw).digest('base64').replace(/=+$/, '');

class BankUtilisationRepository {
  constructor(options = {}) {
    this.submissionRepository = options.submissionRepository;
    this.timing = options.timing || null;
  }

  async measure(label, fn) {
    if (!this.timing || typeof this.timing.measure !== 'function') return fn();
    return this.timing.measure(label, fn);
  }

  ensureRepository() {
    if (!this.submissionRepository) throw new Error('Submission repository is not configured.');
  }

  readField(record, fieldId) {
    const key = toText(fieldId);
    if (!record || !key) return undefined;
    if (record.values && Object.prototype.hasOwnProperty.call(record.values, key)) return record.values[key];
    return record[key];
  }

  readString(record, fieldId) {
    return toText(this.readField(record, fieldId));
  }

  readNumber(record, fieldId) {
    const parsed = Number(this.readField(record, fieldId));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  isActiveUtilisation(record) {
    return this.readString(record, 'STATUS').toLowerCase() === 'active';
  }

  resourceKey(resourceFormKey, resourceRecordId) {
    return `${toText(resourceFormKey)}::${toText(resourceRecordId)}`;
  }

  buildUtilisationId(args) {
    const raw = [
      args.resourceFormKey,
      args.resourceRecordId,
      args.resourceItemId || '',
      args.sourceFormKey,
      args.sourceRecordId,
      args.sourceParentGroupId || '',
      args.sourceParentRowId || '',
      args.sourceOutputRowId || ''
    ]
      .map(toText)
      .join('::');
    return `utilisation::${md5Base64(raw).replace(/[^a-zA-Z0-9:_-]/g, '_')}`;
  }

  resolveFieldIds(args = {}) {
    const isSingleIngredient = isSingleIngredientLeftoverKind(args.resourceKind);
    const quantityFieldId = toText(args.quantityFieldId) || (isSingleIngredient ? 'LEFTOVER_QTY' : 'LEFTOVER_PORTIONS');
    const statusFieldId = toText(args.statusFieldId) || 'LEFTOVER_STATUS';
    const unitFieldId = toText(args.unitFieldId) || (isSingleIngredient ? 'LEFTOVER_UNIT' : '');
    return { quantityFieldId, statusFieldId, unitFieldId };
  }

  availability(args) {
    const remainingQuantity = this.readNumber(args.bankRecord, args.fieldIds.quantityFieldId);
    return {
      resourceFormKey: args.resourceFormKey,
      resourceRecordId: args.resourceRecordId,
      resourceItemId: args.resourceItemId,
      resourceKind: args.resourceKind,
      quantityFieldId: args.fieldIds.quantityFieldId,
      statusFieldId: args.fieldIds.statusFieldId,
      unitFieldId: args.fieldIds.unitFieldId,
      remainingQuantity,
      freeQuantity: Math.max(0, remainingQuantity),
      currentUtilisationQuantity: Math.max(0, args.currentUtilisationQuantity),
      currentRecordUtilisedQuantity: Math.max(0, args.currentRecordUtilisedQuantity),
      unit: this.readString(args.bankRecord, args.fieldIds.unitFieldId),
      status: this.readString(args.bankRecord, args.fieldIds.statusFieldId)
    };
  }

  async records(formKey) {
    this.ensureRepository();
    return this.measure(`utilisations.records.${toText(formKey)}`, () => this.submissionRepository.records(formKey));
  }

  async fetchById(formKey, recordId) {
    this.ensureRepository();
    return this.measure(`utilisations.fetchById.${toText(formKey)}`, () => this.submissionRepository.fetchSubmissionById(formKey, recordId));
  }

  async activeUtilisations(utilisationFormKey, criteria = {}) {
    const records = await this.measure(`utilisations.activeUtilisationScan.${toText(utilisationFormKey)}`, () => this.records(utilisationFormKey));
    return records.filter(record => {
      if (!this.isActiveUtilisation(record)) return false;
      return Object.entries(criteria).every(([fieldId, expected]) => this.readString(record, fieldId) === toText(expected));
    });
  }

  buildInternalPayload(formKey, recordId, language, status, values, auditAction, options = {}) {
    const payload = {
      formKey,
      language: toText(language) || 'EN',
      id: recordId,
      values: cloneJson(values || {}),
      __ckSkipSubmitEffects: true,
      __ckAllowClosedUpdate: '1',
      __ckSaveMode: 'draft',
      __ckNoopIfUnchanged: '1',
      __ckAuditAction: auditAction
    };
    Object.keys(payload.values || {}).forEach(fieldId => {
      payload[fieldId] = payload.values[fieldId];
    });
    if (status !== undefined) {
      payload.status = status;
      payload.__ckStatus = status;
    }
    const clientDataVersion = Number(options.clientDataVersion);
    if (Number.isFinite(clientDataVersion) && clientDataVersion > 0) {
      payload.__ckClientDataVersion = clientDataVersion;
    }
    return payload;
  }

  enqueueInternalSave(queue, payload) {
    const formKey = toText(payload && (payload.formKey || payload.form));
    const recordId = toText(payload && payload.id);
    if (!queue || !formKey || !recordId) return;
    if (!queue.has(formKey)) queue.set(formKey, new Map());
    queue.get(formKey).set(recordId, payload);
  }

  createInternalSaveQueue() {
    return new Map();
  }

  async flushInternalSaves(queue) {
    const entries = Array.from((queue || new Map()).entries());
    if (!entries.length) return { success: true, message: 'No internal saves queued.', metaById: {} };
    const metaById = {};
    for (const [, payloadsById] of entries) {
      const payloads = Array.from(payloadsById.values());
      const result = typeof this.submissionRepository.saveSubmissionBatch === 'function'
        ? await this.submissionRepository.saveSubmissionBatch(payloads)
        : await this.saveInternalPayloadsIndividually(payloads);
      if (!result || !result.success) {
        return {
          success: false,
          message: (result && result.message) || 'Failed to save bank utilisation updates.',
          metaById
        };
      }
      Object.assign(metaById, result.metaById || {});
    }
    if (this.timing && typeof this.timing.increment === 'function') {
      this.timing.increment('utilisationInternalSaveBatches', entries.length);
      this.timing.increment('utilisationInternalRecordsQueued', Object.keys(metaById).length);
    }
    return { success: true, message: 'Saved to sheet', metaById };
  }

  async saveInternalPayloadsIndividually(payloads) {
    const metaById = {};
    for (const payload of payloads) {
      const result = await this.submissionRepository.saveSubmissionWithId(payload);
      if (!result || !result.success) {
        return { success: false, message: (result && result.message) || 'Failed to save internal record.', metaById };
      }
      if (result.meta && result.meta.id) metaById[result.meta.id] = result.meta;
    }
    return { success: true, message: 'Saved to sheet', metaById };
  }

  saveInternal(formKey, recordId, language, status, values, auditAction, options = {}) {
    const payload = this.buildInternalPayload(formKey, recordId, language, status, values, auditAction, options);
    if (options.queue) {
      this.enqueueInternalSave(options.queue, payload);
      return Promise.resolve({
        success: true,
        message: 'Queued internal record save.',
        meta: { id: recordId }
      });
    }
    return this.submissionRepository.saveSubmissionWithId(payload);
  }

  normalizeScopes(raw) {
    const seen = new Set();
    return (Array.isArray(raw) ? raw : [])
      .map(scope => ({
        sourceParentGroupId: toText(scope && scope.sourceParentGroupId) || undefined,
        sourceParentRowId: toText(scope && scope.sourceParentRowId) || undefined,
        sourceOutputGroupId: toText(scope && scope.sourceOutputGroupId) || undefined
      }))
      .filter(scope => scope.sourceParentGroupId || scope.sourceParentRowId || scope.sourceOutputGroupId)
      .filter(scope => {
        const key = [scope.sourceParentGroupId || '', scope.sourceParentRowId || '', scope.sourceOutputGroupId || ''].join('::');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  normalizeOutputGroupId(rawOutputGroupId, rawOutputRowId) {
    const outputGroupId = toText(rawOutputGroupId);
    if (!outputGroupId) return '';
    const outputRowId = toText(rawOutputRowId);
    if (outputRowId && outputGroupId === outputRowId) {
      const suffixIndex = outputGroupId.lastIndexOf('_');
      if (suffixIndex > 0) return outputGroupId.slice(0, suffixIndex).trim() || outputGroupId;
    }
    return outputGroupId;
  }

  matchesScope(record, scopes) {
    return scopes.some(scope => {
      if (scope.sourceParentGroupId && this.readString(record, 'SOURCE_PARENT_GROUP_ID') !== scope.sourceParentGroupId) return false;
      if (scope.sourceParentRowId && this.readString(record, 'SOURCE_PARENT_ROW_ID') !== scope.sourceParentRowId) return false;
      if (scope.sourceOutputGroupId) {
        const value = this.normalizeOutputGroupId(
          this.readString(record, 'SOURCE_OUTPUT_GROUP_ID'),
          this.readString(record, 'SOURCE_OUTPUT_ROW_ID')
        );
        if (value !== scope.sourceOutputGroupId) return false;
      }
      return true;
    });
  }

  normalizePlanEntries(request) {
    const sourceFormKey = toText(request && request.sourceFormKey);
    const sourceRecordId = toText(request && request.sourceRecordId);
    return (Array.isArray(request && request.utilisations) ? request.utilisations : [])
      .map(entry => {
        const resourceFormKey = toText(entry && entry.resourceFormKey);
        const resourceRecordId = toText(entry && entry.resourceRecordId);
        if (!resourceFormKey || !resourceRecordId) return null;
        return {
          resourceFormKey,
          resourceRecordId,
          resourceItemId: toText(entry.resourceItemId) || undefined,
          resourceKind: toText(entry.resourceKind) || undefined,
          quantity: entry.quantity === undefined ? 0 : entry.quantity,
          unit: toText(entry.unit) || undefined,
          sourceFormKey,
          sourceRecordId,
          sourceParentGroupId: toText(entry.sourceParentGroupId) || undefined,
          sourceParentRowId: toText(entry.sourceParentRowId) || undefined,
          sourceOutputGroupId: toText(entry.sourceOutputGroupId) || undefined,
          sourceOutputRowId: toText(entry.sourceOutputRowId) || undefined,
          sourceOutputKeyFieldId: toText(entry.sourceOutputKeyFieldId) || undefined,
          utilisationFormKey: toText(request.utilisationFormKey) || undefined,
          quantityFieldId: toText(entry.quantityFieldId) || undefined,
          statusFieldId: toText(entry.statusFieldId) || undefined,
          unitFieldId: toText(entry.unitFieldId) || undefined,
          allowedStatuses: Array.isArray(entry.allowedStatuses) ? entry.allowedStatuses : undefined
        };
      })
      .filter(Boolean);
  }

  async sourceRecordMeta(formKey, recordId) {
    if (!formKey || !recordId || typeof this.submissionRepository.getRecordVersion !== 'function') return undefined;
    const version = await this.submissionRepository.getRecordVersion(formKey, recordId);
    if (!version || !version.success) return undefined;
    return {
      id: toText(version.id || recordId) || undefined,
      updatedAt: toText(version.updatedAt) || undefined,
      dataVersion: Number.isFinite(Number(version.dataVersion)) ? Number(version.dataVersion) : undefined,
      rowNumber: Number.isFinite(Number(version.rowNumber)) ? Number(version.rowNumber) : undefined
    };
  }

  async upsert(request, options = {}) {
    const resourceFormKey = toText(request && request.resourceFormKey);
    const resourceRecordId = toText(request && request.resourceRecordId);
    const sourceFormKey = toText(request && request.sourceFormKey);
    const sourceRecordId = toText(request && request.sourceRecordId);
    if (!resourceFormKey || !resourceRecordId || !sourceFormKey || !sourceRecordId) {
      return {
        success: false,
        message: 'resourceFormKey, resourceRecordId, sourceFormKey, and sourceRecordId are required.'
      };
    }

    const utilisationFormKey = toText(request.utilisationFormKey) || DEFAULT_UTILISATION_FORM_KEY;
    const resourceKey = this.resourceKey(resourceFormKey, resourceRecordId);
    const cache = options.batchCache;
    let bankRecord = cache && cache.bankRecordsByResource.get(resourceKey);
    if (!bankRecord) {
      bankRecord = await this.fetchById(resourceFormKey, resourceRecordId);
      if (bankRecord && cache) cache.bankRecordsByResource.set(resourceKey, bankRecord);
    }
    if (!bankRecord) {
      return { success: false, message: `Bank record not found: ${resourceFormKey} / ${resourceRecordId}.` };
    }

    const fieldIds = this.resolveFieldIds({
      resourceKind: request.resourceKind || this.readString(bankRecord, 'LEFTOVER_KIND'),
      quantityFieldId: request.quantityFieldId,
      statusFieldId: request.statusFieldId,
      unitFieldId: request.unitFieldId
    });
    const requestedQty = normalizeQuantity(request.quantity);
    if (requestedQty === null) return { success: false, message: 'Utilisation quantity must be numeric.' };

    const activeUtilisations = (cache
      ? cache.activeUtilisationsByResource.get(resourceKey) || []
      : await this.activeUtilisations(utilisationFormKey, {
          RESOURCE_FORM_KEY: resourceFormKey,
          RESOURCE_RECORD_ID: resourceRecordId
        })
    ).slice();
    const resourceItemId = request.resourceItemId || this.readString(bankRecord, 'LEFTOVER_ID');
    const resourceKind = request.resourceKind || this.readString(bankRecord, 'LEFTOVER_KIND');
    const utilisationId = this.buildUtilisationId({
      resourceFormKey,
      resourceRecordId,
      resourceItemId,
      sourceFormKey,
      sourceRecordId,
      sourceParentGroupId: request.sourceParentGroupId,
      sourceParentRowId: request.sourceParentRowId,
      sourceOutputRowId: request.sourceOutputRowId
    });
    const currentUtilisation = activeUtilisations.find(record => toText(record.id) === utilisationId) || null;
    const currentUtilisationQty = currentUtilisation ? this.readNumber(currentUtilisation, 'UTILISED_QTY') : 0;
    const currentRecordUtilisedQty = activeUtilisations
      .filter(record => this.readString(record, 'RESOURCE_FORM_KEY') === resourceFormKey)
      .filter(record => this.readString(record, 'RESOURCE_RECORD_ID') === resourceRecordId)
      .filter(record => this.readString(record, 'SOURCE_FORM_KEY') === sourceFormKey)
      .filter(record => this.readString(record, 'SOURCE_RECORD_ID') === sourceRecordId)
      .reduce((sum, record) => sum + this.readNumber(record, 'UTILISED_QTY'), 0);

    const remainingQuantity = this.readNumber(bankRecord, fieldIds.quantityFieldId);
    const bankStatus = fieldIds.statusFieldId ? this.readString(bankRecord, fieldIds.statusFieldId) : '';
    const allowedStatuses = (Array.isArray(request.allowedStatuses) && request.allowedStatuses.length ? request.allowedStatuses : ['available'])
      .map(value => toText(value).toLowerCase())
      .filter(Boolean);
    if (requestedQty > currentUtilisationQty && allowedStatuses.length) {
      const normalizedStatus = bankStatus.toLowerCase();
      if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
        return {
          success: false,
          conflict: true,
          message: `This bank item is not available for utilisation (${bankStatus || 'unknown status'}).`,
          utilisationId,
          availability: this.availability({
            bankRecord,
            fieldIds,
            resourceFormKey,
            resourceRecordId,
            resourceItemId,
            resourceKind,
            currentUtilisationQuantity: currentUtilisationQty,
            currentRecordUtilisedQuantity: currentRecordUtilisedQty
          })
        };
      }
    }

    const maxAllowedQuantity = Math.max(0, remainingQuantity + currentUtilisationQty);
    if (requestedQty > 0 && requestedQty > maxAllowedQuantity + 1e-9) {
      return {
        success: false,
        conflict: true,
        message: `Only ${formatQuantity(maxAllowedQuantity)} ${this.readString(bankRecord, fieldIds.unitFieldId) || ''}`.trim(),
        utilisationId,
        availability: this.availability({
          bankRecord,
          fieldIds,
          resourceFormKey,
          resourceRecordId,
          resourceItemId,
          resourceKind,
          currentUtilisationQuantity: currentUtilisationQty,
          currentRecordUtilisedQuantity: currentRecordUtilisedQty
        })
      };
    }

    const utilisationValues = {
      UTILISATION_ID: utilisationId,
      RESOURCE_FORM_KEY: resourceFormKey,
      RESOURCE_RECORD_ID: resourceRecordId,
      RESOURCE_ITEM_ID: resourceItemId,
      RESOURCE_KIND: resourceKind,
      RESOURCE_QTY_FIELD_ID: fieldIds.quantityFieldId,
      RESOURCE_STATUS_FIELD_ID: fieldIds.statusFieldId || '',
      RESOURCE_UNIT_FIELD_ID: fieldIds.unitFieldId || '',
      UTILISED_QTY: requestedQty > 0 ? formatQuantity(requestedQty) : 0,
      UTILISED_UNIT: request.unit || this.readString(bankRecord, fieldIds.unitFieldId),
      STATUS: requestedQty > 0 ? 'active' : 'released',
      SOURCE_FORM_KEY: sourceFormKey,
      SOURCE_RECORD_ID: sourceRecordId,
      SOURCE_PARENT_GROUP_ID: toText(request.sourceParentGroupId),
      SOURCE_PARENT_ROW_ID: toText(request.sourceParentRowId),
      SOURCE_OUTPUT_GROUP_ID: toText(request.sourceOutputGroupId),
      SOURCE_OUTPUT_ROW_ID: toText(request.sourceOutputRowId),
      SOURCE_OUTPUT_KEY_FIELD_ID: toText(request.sourceOutputKeyFieldId)
    };

    let utilisationResult = null;
    if (requestedQty > 0 || currentUtilisation) {
      utilisationResult = await this.saveInternal(
        utilisationFormKey,
        utilisationId,
        (currentUtilisation && currentUtilisation.language) || 'EN',
        requestedQty > 0 ? 'active' : 'released',
        utilisationValues,
        requestedQty > 0 ? 'bankUtilisation:upsert' : 'bankUtilisation:release',
        { clientDataVersion: currentUtilisation && currentUtilisation.dataVersion, queue: options.pendingSaves }
      );
      if (!utilisationResult || !utilisationResult.success) return { success: false, message: (utilisationResult && utilisationResult.message) || 'Failed to save utilisation row.' };
    }

    const quantityDelta = Math.max(0, requestedQty) - currentUtilisationQty;
    const nextRemainingQuantity = Math.max(0, remainingQuantity - quantityDelta);
    const nextBankValues = cloneJson(bankRecord.values || {});
    nextBankValues[fieldIds.quantityFieldId] = formatQuantity(nextRemainingQuantity);
    if (fieldIds.statusFieldId) nextBankValues[fieldIds.statusFieldId] = nextRemainingQuantity > 0 ? 'available' : 'used';
    const bankResult = await this.saveInternal(
      resourceFormKey,
      resourceRecordId,
      bankRecord.language || 'EN',
      fieldIds.statusFieldId ? toText(nextBankValues[fieldIds.statusFieldId] || bankRecord.status) : bankRecord.status,
      nextBankValues,
      'bankUtilisation:updateBankAvailability',
      { clientDataVersion: bankRecord.dataVersion, queue: options.pendingSaves }
    );
    if (!bankResult || !bankResult.success) {
      return { success: false, message: (bankResult && bankResult.message) || 'Failed to update bank availability.' };
    }

    const refreshedBank = {
      ...bankRecord,
      values: nextBankValues,
      dataVersion: bankResult && bankResult.meta ? bankResult.meta.dataVersion : bankRecord.dataVersion,
      status: fieldIds.statusFieldId ? toText(nextBankValues[fieldIds.statusFieldId] || bankRecord.status) : bankRecord.status
    };
    if (cache) {
      cache.bankRecordsByResource.set(resourceKey, refreshedBank);
      const nextActiveUtilisations = activeUtilisations.filter(record => toText(record.id) !== utilisationId);
      if (requestedQty > 0) {
        nextActiveUtilisations.push({
          ...(currentUtilisation || {}),
          formKey: utilisationFormKey,
          language: (currentUtilisation && currentUtilisation.language) || 'EN',
          id: utilisationId,
          dataVersion: utilisationResult && utilisationResult.meta ? utilisationResult.meta.dataVersion : currentUtilisation && currentUtilisation.dataVersion,
          status: 'active',
          values: cloneJson(utilisationValues)
        });
      }
      cache.activeUtilisationsByResource.set(resourceKey, nextActiveUtilisations);
    }

    const currentRecordUtilisedNext = currentRecordUtilisedQty - currentUtilisationQty + Math.max(0, requestedQty);
    return {
      success: true,
      message: requestedQty > 0 ? 'Utilisation updated.' : 'Utilisation released.',
      utilisationId,
      released: requestedQty <= 0,
      availability: this.availability({
        bankRecord: refreshedBank,
        fieldIds,
        resourceFormKey,
        resourceRecordId,
        resourceItemId,
        resourceKind,
        currentUtilisationQuantity: Math.max(0, requestedQty),
        currentRecordUtilisedQuantity: Math.max(0, currentRecordUtilisedNext)
      })
    };
  }

  buildReleaseRequest(record, utilisationFormKey) {
    return {
      resourceFormKey: this.readString(record, 'RESOURCE_FORM_KEY'),
      resourceRecordId: this.readString(record, 'RESOURCE_RECORD_ID'),
      resourceItemId: this.readString(record, 'RESOURCE_ITEM_ID') || undefined,
      resourceKind: this.readString(record, 'RESOURCE_KIND') || undefined,
      quantity: 0,
      unit: this.readString(record, 'UTILISED_UNIT') || undefined,
      sourceFormKey: this.readString(record, 'SOURCE_FORM_KEY'),
      sourceRecordId: this.readString(record, 'SOURCE_RECORD_ID'),
      sourceParentGroupId: this.readString(record, 'SOURCE_PARENT_GROUP_ID') || undefined,
      sourceParentRowId: this.readString(record, 'SOURCE_PARENT_ROW_ID') || undefined,
      sourceOutputGroupId: this.readString(record, 'SOURCE_OUTPUT_GROUP_ID') || undefined,
      sourceOutputRowId: this.readString(record, 'SOURCE_OUTPUT_ROW_ID') || undefined,
      sourceOutputKeyFieldId: this.readString(record, 'SOURCE_OUTPUT_KEY_FIELD_ID') || undefined,
      utilisationFormKey,
      quantityFieldId: this.readString(record, 'RESOURCE_QTY_FIELD_ID') || undefined,
      statusFieldId: this.readString(record, 'RESOURCE_STATUS_FIELD_ID') || undefined,
      unitFieldId: this.readString(record, 'RESOURCE_UNIT_FIELD_ID') || undefined
    };
  }

  async validatePlan(desiredEntries, releaseCandidates, batchCache) {
    if (!desiredEntries.length) return null;
    const releaseUtilisationIds = new Set(releaseCandidates.map(record => toText(record.id)).filter(Boolean));
    const entriesByResource = new Map();
    for (const request of desiredEntries) {
      const requestedQty = normalizeQuantity(request.quantity);
      if (requestedQty === null) return { success: false, message: 'Utilisation quantity must be numeric.' };
      const resourceKey = this.resourceKey(request.resourceFormKey, request.resourceRecordId);
      let entry = entriesByResource.get(resourceKey);
      if (!entry) {
        let bankRecord = batchCache.bankRecordsByResource.get(resourceKey);
        if (!bankRecord) {
          bankRecord = await this.fetchById(request.resourceFormKey, request.resourceRecordId);
          if (bankRecord) batchCache.bankRecordsByResource.set(resourceKey, bankRecord);
        }
        if (!bankRecord) return { success: false, message: `Bank record not found: ${request.resourceFormKey} / ${request.resourceRecordId}.` };
        const fieldIds = this.resolveFieldIds({
          resourceKind: request.resourceKind || this.readString(bankRecord, 'LEFTOVER_KIND'),
          quantityFieldId: request.quantityFieldId,
          statusFieldId: request.statusFieldId,
          unitFieldId: request.unitFieldId
        });
        entry = {
          bankRecord,
          fieldIds,
          requests: [],
          activeUtilisations: (batchCache.activeUtilisationsByResource.get(resourceKey) || []).slice()
        };
        entriesByResource.set(resourceKey, entry);
      }
      entry.requests.push({
        request,
        utilisationId: this.buildUtilisationId(request),
        requestedQty
      });
    }

    for (const entry of entriesByResource.values()) {
      const positiveRequests = entry.requests.filter(item => item.requestedQty > 0);
      const bankStatus = entry.fieldIds.statusFieldId ? this.readString(entry.bankRecord, entry.fieldIds.statusFieldId) : '';
      const activeQtyById = new Map(
        entry.activeUtilisations
          .map(record => [toText(record.id), this.readNumber(record, 'UTILISED_QTY')])
          .filter(([id]) => Boolean(id))
      );
      const requestedAdditionalQuantity = positiveRequests.reduce(
        (sum, item) => sum + Math.max(0, item.requestedQty - (activeQtyById.get(item.utilisationId) || 0)),
        0
      );
      const allowedStatuses = Array.from(
        new Set(
          positiveRequests.flatMap(item =>
            (Array.isArray(item.request.allowedStatuses) && item.request.allowedStatuses.length ? item.request.allowedStatuses : ['available'])
              .map(value => toText(value).toLowerCase())
              .filter(Boolean)
          )
        )
      );
      if (requestedAdditionalQuantity > 0 && allowedStatuses.length) {
        const normalizedStatus = bankStatus.toLowerCase();
        if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
          const first = positiveRequests[0];
          return {
            success: false,
            conflict: true,
            message: `This bank item is not available for utilisation (${bankStatus || 'unknown status'}).`,
            availability: [
              this.availability({
                bankRecord: entry.bankRecord,
                fieldIds: entry.fieldIds,
                resourceFormKey: first.request.resourceFormKey,
                resourceRecordId: first.request.resourceRecordId,
                resourceItemId: first.request.resourceItemId || this.readString(entry.bankRecord, 'LEFTOVER_ID'),
                resourceKind: first.request.resourceKind || this.readString(entry.bankRecord, 'LEFTOVER_KIND'),
                currentUtilisationQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0),
                currentRecordUtilisedQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0)
              })
            ]
          };
        }
      }

      const desiredIdsForResource = new Set(entry.requests.map(item => item.utilisationId));
      const desiredTotal = entry.requests.reduce((sum, item) => sum + Math.max(0, item.requestedQty), 0);
      const remainingQuantity = this.readNumber(entry.bankRecord, entry.fieldIds.quantityFieldId);
      const reusableQuantity = entry.activeUtilisations
        .filter(record => {
          const recordId = toText(record.id);
          return releaseUtilisationIds.has(recordId) || desiredIdsForResource.has(recordId);
        })
        .reduce((sum, record) => sum + this.readNumber(record, 'UTILISED_QTY'), 0);
      const maxAllowedQuantity = Math.max(0, remainingQuantity + reusableQuantity);
      if (desiredTotal > maxAllowedQuantity + 1e-9) {
        const first = entry.requests[0];
        return {
          success: false,
          conflict: true,
          message: `Only ${formatQuantity(maxAllowedQuantity)} ${this.readString(entry.bankRecord, entry.fieldIds.unitFieldId) || ''}`.trim(),
          availability: [
            this.availability({
              bankRecord: entry.bankRecord,
              fieldIds: entry.fieldIds,
              resourceFormKey: first.request.resourceFormKey,
              resourceRecordId: first.request.resourceRecordId,
              resourceItemId: first.request.resourceItemId || this.readString(entry.bankRecord, 'LEFTOVER_ID'),
              resourceKind: first.request.resourceKind || this.readString(entry.bankRecord, 'LEFTOVER_KIND'),
              currentUtilisationQuantity: desiredTotal,
              currentRecordUtilisedQuantity: desiredTotal
            })
          ]
        };
      }
    }
    return null;
  }

  uniqueAvailability(snapshots) {
    const byKey = new Map();
    (snapshots || []).forEach(snapshot => {
      const key = [snapshot.resourceFormKey || '', snapshot.resourceRecordId || '', snapshot.resourceItemId || ''].join('::');
      if (!key) return;
      byKey.set(key, snapshot);
    });
    const items = Array.from(byKey.values());
    return items.length ? items : undefined;
  }

  async applyPlan(request) {
    const sourceFormKey = toText(request && request.sourceFormKey);
    const sourceRecordId = toText(request && request.sourceRecordId);
    if (!sourceFormKey || !sourceRecordId) return { success: false, message: 'sourceFormKey and sourceRecordId are required.' };

    const clientDataVersion = Number(request && request.clientDataVersion);
    const sourceRecordMetaBefore = await this.measure('utilisationApply.sourceMetaBefore', () =>
      this.sourceRecordMeta(sourceFormKey, sourceRecordId)
    );
    const sourceClientDataVersionMatched =
      Number.isFinite(clientDataVersion) &&
      clientDataVersion > 0 &&
      Number.isFinite(Number(sourceRecordMetaBefore && sourceRecordMetaBefore.dataVersion)) &&
      Number(sourceRecordMetaBefore.dataVersion) === clientDataVersion;
    const normalizedUtilisations = this.normalizePlanEntries(request || {});
    const utilisationFormKey = toText((request && request.utilisationFormKey) || (normalizedUtilisations[0] && normalizedUtilisations[0].utilisationFormKey)) || DEFAULT_UTILISATION_FORM_KEY;
    const batchCache = {
      activeUtilisationsByResource: new Map(),
      bankRecordsByResource: new Map()
    };
    const allActiveUtilisations = await this.measure('utilisationApply.activeUtilisations', () =>
      this.activeUtilisations(utilisationFormKey)
    );
    allActiveUtilisations.forEach(record => {
      const resourceFormKey = this.readString(record, 'RESOURCE_FORM_KEY');
      const resourceRecordId = this.readString(record, 'RESOURCE_RECORD_ID');
      if (!resourceFormKey || !resourceRecordId) return;
      const key = this.resourceKey(resourceFormKey, resourceRecordId);
      const existing = batchCache.activeUtilisationsByResource.get(key) || [];
      existing.push(record);
      batchCache.activeUtilisationsByResource.set(key, existing);
    });
    const activeUtilisations = allActiveUtilisations.filter(
      record => this.readString(record, 'SOURCE_FORM_KEY') === sourceFormKey && this.readString(record, 'SOURCE_RECORD_ID') === sourceRecordId
    );
    const managedScopes = this.normalizeScopes(request && request.managedScopes);
    const managedActiveUtilisations = managedScopes.length
      ? activeUtilisations.filter(record => this.matchesScope(record, managedScopes))
      : activeUtilisations.slice();
    const desiredByUtilisationId = new Map();
    normalizedUtilisations.forEach(entry => {
      desiredByUtilisationId.set(this.buildUtilisationId(entry), entry);
    });
    const desiredUtilisationIds = new Set(desiredByUtilisationId.keys());
    const releaseCandidates = managedActiveUtilisations.filter(record => {
      const recordId = toText(record.id);
      return recordId && !desiredUtilisationIds.has(recordId);
    });

    const validationFailure = await this.measure('utilisationApply.validatePlan', () =>
      this.validatePlan(Array.from(desiredByUtilisationId.values()), releaseCandidates, batchCache)
    );
    if (validationFailure) return validationFailure;

    const pendingSaves = this.createInternalSaveQueue();
    const availability = [];
    let appliedCount = 0;
    let releasedCount = 0;

    for (const record of releaseCandidates) {
      const result = await this.upsert(this.buildReleaseRequest(record, utilisationFormKey), { batchCache, pendingSaves });
      if (!result.success) {
        return {
          success: false,
          message: result.message || 'Failed to release outdated bank utilisations.',
          conflict: result.conflict === true,
          availability: result.availability ? [result.availability] : undefined
        };
      }
      releasedCount += 1;
      if (result.availability) availability.push(result.availability);
    }

    for (const entry of desiredByUtilisationId.values()) {
      const result = await this.upsert(entry, { batchCache, pendingSaves });
      if (!result.success) {
        return {
          success: false,
          message: result.message || 'Failed to update bank utilisations.',
          conflict: result.conflict === true,
          availability: result.availability ? [result.availability] : undefined
        };
      }
      appliedCount += 1;
      if (result.availability) availability.push(result.availability);
    }

    const flushResult = await this.measure('utilisationApply.flushInternalSaves', () => this.flushInternalSaves(pendingSaves));
    if (!flushResult.success) {
      return {
        success: false,
        message: flushResult.message || 'Failed to save bank utilisation updates.'
      };
    }

    return {
      success: true,
      message: 'Bank utilisations updated.',
      utilisationsApplied: appliedCount,
      utilisationsReleased: releasedCount,
      availability: this.uniqueAvailability(availability),
      sourceRecordMeta: (await this.measure('utilisationApply.sourceMetaAfter', () => this.sourceRecordMeta(sourceFormKey, sourceRecordId))) || sourceRecordMetaBefore,
      sourceClientDataVersionMatched
    };
  }

}

const createBankUtilisationRepository = deps => new BankUtilisationRepository(deps || {});

module.exports = {
  BankUtilisationRepository,
  createBankUtilisationRepository
};
