const crypto = require('crypto');

const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';

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

class InventoryReservationRepository {
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

  isActiveReservation(record) {
    return this.readString(record, 'STATUS').toLowerCase() === 'active';
  }

  resourceKey(resourceFormKey, resourceRecordId) {
    return `${toText(resourceFormKey)}::${toText(resourceRecordId)}`;
  }

  buildReservationId(args) {
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
    return `reservation::${md5Base64(raw).replace(/[^a-zA-Z0-9:_-]/g, '_')}`;
  }

  resolveFieldIds(args = {}) {
    const isSingleIngredient = isSingleIngredientLeftoverKind(args.resourceKind);
    const quantityFieldId = toText(args.quantityFieldId) || (isSingleIngredient ? 'LEFTOVER_QTY' : 'LEFTOVER_PORTIONS');
    const reservedQuantityFieldId =
      toText(args.reservedQuantityFieldId) || (isSingleIngredient ? 'LEFTOVER_RESERVED_QTY' : 'LEFTOVER_RESERVED_PORTIONS');
    const statusFieldId = toText(args.statusFieldId) || 'LEFTOVER_STATUS';
    const unitFieldId = toText(args.unitFieldId) || (isSingleIngredient ? 'LEFTOVER_UNIT' : '');
    return { quantityFieldId, reservedQuantityFieldId, statusFieldId, unitFieldId };
  }

  availability(args) {
    const remainingQuantity = this.readNumber(args.inventoryRecord, args.fieldIds.quantityFieldId);
    const reservedQuantity = Math.max(0, args.reservedQuantity);
    return {
      resourceFormKey: args.resourceFormKey,
      resourceRecordId: args.resourceRecordId,
      resourceItemId: args.resourceItemId,
      resourceKind: args.resourceKind,
      quantityFieldId: args.fieldIds.quantityFieldId,
      reservedQuantityFieldId: args.fieldIds.reservedQuantityFieldId,
      statusFieldId: args.fieldIds.statusFieldId,
      unitFieldId: args.fieldIds.unitFieldId,
      remainingQuantity,
      reservedQuantity,
      freeQuantity: Math.max(0, remainingQuantity - reservedQuantity),
      currentReservationQuantity: Math.max(0, args.currentReservationQuantity),
      currentRecordReservedQuantity: Math.max(0, args.currentRecordReservedQuantity),
      unit: this.readString(args.inventoryRecord, args.fieldIds.unitFieldId),
      status: this.readString(args.inventoryRecord, args.fieldIds.statusFieldId)
    };
  }

  async records(formKey) {
    this.ensureRepository();
    return this.measure(`reservations.records.${toText(formKey)}`, () => this.submissionRepository.records(formKey));
  }

  async fetchById(formKey, recordId) {
    this.ensureRepository();
    return this.measure(`reservations.fetchById.${toText(formKey)}`, () => this.submissionRepository.fetchSubmissionById(formKey, recordId));
  }

  async activeReservations(ledgerFormKey, criteria = {}) {
    const records = await this.measure(`reservations.activeLedgerScan.${toText(ledgerFormKey)}`, () => this.records(ledgerFormKey));
    return records.filter(record => {
      if (!this.isActiveReservation(record)) return false;
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
          message: (result && result.message) || 'Failed to save inventory reservation updates.',
          metaById
        };
      }
      Object.assign(metaById, result.metaById || {});
    }
    if (this.timing && typeof this.timing.increment === 'function') {
      this.timing.increment('reservationInternalSaveBatches', entries.length);
      this.timing.increment('reservationInternalRecordsQueued', Object.keys(metaById).length);
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
    return (Array.isArray(request && request.reservations) ? request.reservations : [])
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
          ledgerFormKey: toText(request.ledgerFormKey) || undefined,
          quantityFieldId: toText(entry.quantityFieldId) || undefined,
          reservedQuantityFieldId: toText(entry.reservedQuantityFieldId) || undefined,
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

    const ledgerFormKey = toText(request.ledgerFormKey) || DEFAULT_LEDGER_FORM_KEY;
    const resourceKey = this.resourceKey(resourceFormKey, resourceRecordId);
    const cache = options.batchCache;
    let inventoryRecord = cache && cache.inventoryRecordsByResource.get(resourceKey);
    if (!inventoryRecord) {
      inventoryRecord = await this.fetchById(resourceFormKey, resourceRecordId);
      if (inventoryRecord && cache) cache.inventoryRecordsByResource.set(resourceKey, inventoryRecord);
    }
    if (!inventoryRecord) {
      return { success: false, message: `Inventory record not found: ${resourceFormKey} / ${resourceRecordId}.` };
    }

    const fieldIds = this.resolveFieldIds({
      resourceKind: request.resourceKind || this.readString(inventoryRecord, 'LEFTOVER_KIND'),
      quantityFieldId: request.quantityFieldId,
      reservedQuantityFieldId: request.reservedQuantityFieldId,
      statusFieldId: request.statusFieldId,
      unitFieldId: request.unitFieldId
    });
    const requestedQty = normalizeQuantity(request.quantity);
    if (requestedQty === null) return { success: false, message: 'Reservation quantity must be numeric.' };

    const activeReservations = (cache
      ? cache.activeReservationsByResource.get(resourceKey) || []
      : await this.activeReservations(ledgerFormKey, {
          RESOURCE_FORM_KEY: resourceFormKey,
          RESOURCE_RECORD_ID: resourceRecordId
        })
    ).slice();
    const resourceItemId = request.resourceItemId || this.readString(inventoryRecord, 'LEFTOVER_ID');
    const resourceKind = request.resourceKind || this.readString(inventoryRecord, 'LEFTOVER_KIND');
    const reservationId = this.buildReservationId({
      resourceFormKey,
      resourceRecordId,
      resourceItemId,
      sourceFormKey,
      sourceRecordId,
      sourceParentGroupId: request.sourceParentGroupId,
      sourceParentRowId: request.sourceParentRowId,
      sourceOutputRowId: request.sourceOutputRowId
    });
    const currentReservation = activeReservations.find(record => toText(record.id) === reservationId) || null;
    const currentReservationQty = currentReservation ? this.readNumber(currentReservation, 'RESERVED_QTY') : 0;
    const reservedByOthers = activeReservations
      .filter(record => toText(record.id) !== reservationId)
      .reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0);
    const currentRecordReservedQty = activeReservations
      .filter(record => this.readString(record, 'RESOURCE_FORM_KEY') === resourceFormKey)
      .filter(record => this.readString(record, 'RESOURCE_RECORD_ID') === resourceRecordId)
      .filter(record => this.readString(record, 'SOURCE_FORM_KEY') === sourceFormKey)
      .filter(record => this.readString(record, 'SOURCE_RECORD_ID') === sourceRecordId)
      .reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0);

    const remainingQuantity = this.readNumber(inventoryRecord, fieldIds.quantityFieldId);
    const inventoryStatus = fieldIds.statusFieldId ? this.readString(inventoryRecord, fieldIds.statusFieldId) : '';
    const allowedStatuses = (Array.isArray(request.allowedStatuses) && request.allowedStatuses.length ? request.allowedStatuses : ['available'])
      .map(value => toText(value).toLowerCase())
      .filter(Boolean);
    if (requestedQty > 0 && allowedStatuses.length) {
      const normalizedStatus = inventoryStatus.toLowerCase();
      if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
        return {
          success: false,
          conflict: true,
          message: `This inventory item is not available for reservation (${inventoryStatus || 'unknown status'}).`,
          reservationId,
          availability: this.availability({
            inventoryRecord,
            fieldIds,
            resourceFormKey,
            resourceRecordId,
            resourceItemId,
            resourceKind,
            reservedQuantity: reservedByOthers + currentReservationQty,
            currentReservationQuantity: currentReservationQty,
            currentRecordReservedQuantity: currentRecordReservedQty
          })
        };
      }
    }

    const maxAllowedQuantity = Math.max(0, remainingQuantity - reservedByOthers);
    if (requestedQty > 0 && requestedQty > maxAllowedQuantity + 1e-9) {
      return {
        success: false,
        conflict: true,
        message: `Only ${formatQuantity(maxAllowedQuantity)} ${this.readString(inventoryRecord, fieldIds.unitFieldId) || ''}`.trim(),
        reservationId,
        availability: this.availability({
          inventoryRecord,
          fieldIds,
          resourceFormKey,
          resourceRecordId,
          resourceItemId,
          resourceKind,
          reservedQuantity: reservedByOthers + currentReservationQty,
          currentReservationQuantity: currentReservationQty,
          currentRecordReservedQuantity: currentRecordReservedQty
        })
      };
    }

    const ledgerValues = {
      RESERVATION_ID: reservationId,
      RESOURCE_FORM_KEY: resourceFormKey,
      RESOURCE_RECORD_ID: resourceRecordId,
      RESOURCE_ITEM_ID: resourceItemId,
      RESOURCE_KIND: resourceKind,
      RESOURCE_QTY_FIELD_ID: fieldIds.quantityFieldId,
      RESOURCE_RESERVED_QTY_FIELD_ID: fieldIds.reservedQuantityFieldId,
      RESOURCE_STATUS_FIELD_ID: fieldIds.statusFieldId || '',
      RESOURCE_UNIT_FIELD_ID: fieldIds.unitFieldId || '',
      RESERVED_QTY: requestedQty > 0 ? formatQuantity(requestedQty) : 0,
      RESERVED_UNIT: request.unit || this.readString(inventoryRecord, fieldIds.unitFieldId),
      STATUS: requestedQty > 0 ? 'active' : 'released',
      SOURCE_FORM_KEY: sourceFormKey,
      SOURCE_RECORD_ID: sourceRecordId,
      SOURCE_PARENT_GROUP_ID: toText(request.sourceParentGroupId),
      SOURCE_PARENT_ROW_ID: toText(request.sourceParentRowId),
      SOURCE_OUTPUT_GROUP_ID: toText(request.sourceOutputGroupId),
      SOURCE_OUTPUT_ROW_ID: toText(request.sourceOutputRowId),
      SOURCE_OUTPUT_KEY_FIELD_ID: toText(request.sourceOutputKeyFieldId)
    };

    let ledgerResult = null;
    if (requestedQty > 0 || currentReservation) {
      ledgerResult = await this.saveInternal(
        ledgerFormKey,
        reservationId,
        (currentReservation && currentReservation.language) || 'EN',
        requestedQty > 0 ? 'active' : 'released',
        ledgerValues,
        requestedQty > 0 ? 'inventoryReservation:upsert' : 'inventoryReservation:release',
        { clientDataVersion: currentReservation && currentReservation.dataVersion, queue: options.pendingSaves }
      );
      if (!ledgerResult || !ledgerResult.success) return { success: false, message: (ledgerResult && ledgerResult.message) || 'Failed to save reservation ledger row.' };
    }

    const nextReservedQuantity = reservedByOthers + Math.max(0, requestedQty);
    const nextInventoryValues = cloneJson(inventoryRecord.values || {});
    nextInventoryValues[fieldIds.reservedQuantityFieldId] = formatQuantity(nextReservedQuantity);
    if (fieldIds.statusFieldId && !this.readString(inventoryRecord, fieldIds.statusFieldId)) nextInventoryValues[fieldIds.statusFieldId] = 'available';
    const inventoryResult = await this.saveInternal(
      resourceFormKey,
      resourceRecordId,
      inventoryRecord.language || 'EN',
      fieldIds.statusFieldId ? toText(nextInventoryValues[fieldIds.statusFieldId] || inventoryRecord.status) : inventoryRecord.status,
      nextInventoryValues,
      'inventoryReservation:updateAggregate',
      { clientDataVersion: inventoryRecord.dataVersion, queue: options.pendingSaves }
    );
    if (!inventoryResult || !inventoryResult.success) {
      return { success: false, message: (inventoryResult && inventoryResult.message) || 'Failed to update inventory aggregate reservation.' };
    }

    const refreshedInventory = {
      ...inventoryRecord,
      values: nextInventoryValues,
      dataVersion: inventoryResult && inventoryResult.meta ? inventoryResult.meta.dataVersion : inventoryRecord.dataVersion,
      status: fieldIds.statusFieldId ? toText(nextInventoryValues[fieldIds.statusFieldId] || inventoryRecord.status) : inventoryRecord.status
    };
    if (cache) {
      cache.inventoryRecordsByResource.set(resourceKey, refreshedInventory);
      const nextActiveReservations = activeReservations.filter(record => toText(record.id) !== reservationId);
      if (requestedQty > 0) {
        nextActiveReservations.push({
          ...(currentReservation || {}),
          formKey: ledgerFormKey,
          language: (currentReservation && currentReservation.language) || 'EN',
          id: reservationId,
          dataVersion: ledgerResult && ledgerResult.meta ? ledgerResult.meta.dataVersion : currentReservation && currentReservation.dataVersion,
          status: 'active',
          values: cloneJson(ledgerValues)
        });
      }
      cache.activeReservationsByResource.set(resourceKey, nextActiveReservations);
    }

    const currentRecordReservedNext = currentRecordReservedQty - currentReservationQty + Math.max(0, requestedQty);
    return {
      success: true,
      message: requestedQty > 0 ? 'Reservation updated.' : 'Reservation released.',
      reservationId,
      released: requestedQty <= 0,
      availability: this.availability({
        inventoryRecord: refreshedInventory,
        fieldIds,
        resourceFormKey,
        resourceRecordId,
        resourceItemId,
        resourceKind,
        reservedQuantity: nextReservedQuantity,
        currentReservationQuantity: Math.max(0, requestedQty),
        currentRecordReservedQuantity: Math.max(0, currentRecordReservedNext)
      })
    };
  }

  buildReleaseRequest(record, ledgerFormKey) {
    return {
      resourceFormKey: this.readString(record, 'RESOURCE_FORM_KEY'),
      resourceRecordId: this.readString(record, 'RESOURCE_RECORD_ID'),
      resourceItemId: this.readString(record, 'RESOURCE_ITEM_ID') || undefined,
      resourceKind: this.readString(record, 'RESOURCE_KIND') || undefined,
      quantity: 0,
      unit: this.readString(record, 'RESERVED_UNIT') || undefined,
      sourceFormKey: this.readString(record, 'SOURCE_FORM_KEY'),
      sourceRecordId: this.readString(record, 'SOURCE_RECORD_ID'),
      sourceParentGroupId: this.readString(record, 'SOURCE_PARENT_GROUP_ID') || undefined,
      sourceParentRowId: this.readString(record, 'SOURCE_PARENT_ROW_ID') || undefined,
      sourceOutputGroupId: this.readString(record, 'SOURCE_OUTPUT_GROUP_ID') || undefined,
      sourceOutputRowId: this.readString(record, 'SOURCE_OUTPUT_ROW_ID') || undefined,
      sourceOutputKeyFieldId: this.readString(record, 'SOURCE_OUTPUT_KEY_FIELD_ID') || undefined,
      ledgerFormKey,
      quantityFieldId: this.readString(record, 'RESOURCE_QTY_FIELD_ID') || undefined,
      reservedQuantityFieldId: this.readString(record, 'RESOURCE_RESERVED_QTY_FIELD_ID') || undefined,
      statusFieldId: this.readString(record, 'RESOURCE_STATUS_FIELD_ID') || undefined,
      unitFieldId: this.readString(record, 'RESOURCE_UNIT_FIELD_ID') || undefined
    };
  }

  async validatePlan(desiredEntries, releaseCandidates, batchCache) {
    if (!desiredEntries.length) return null;
    const releaseReservationIds = new Set(releaseCandidates.map(record => toText(record.id)).filter(Boolean));
    const entriesByResource = new Map();
    for (const request of desiredEntries) {
      const requestedQty = normalizeQuantity(request.quantity);
      if (requestedQty === null) return { success: false, message: 'Reservation quantity must be numeric.' };
      const resourceKey = this.resourceKey(request.resourceFormKey, request.resourceRecordId);
      let entry = entriesByResource.get(resourceKey);
      if (!entry) {
        let inventoryRecord = batchCache.inventoryRecordsByResource.get(resourceKey);
        if (!inventoryRecord) {
          inventoryRecord = await this.fetchById(request.resourceFormKey, request.resourceRecordId);
          if (inventoryRecord) batchCache.inventoryRecordsByResource.set(resourceKey, inventoryRecord);
        }
        if (!inventoryRecord) return { success: false, message: `Inventory record not found: ${request.resourceFormKey} / ${request.resourceRecordId}.` };
        const fieldIds = this.resolveFieldIds({
          resourceKind: request.resourceKind || this.readString(inventoryRecord, 'LEFTOVER_KIND'),
          quantityFieldId: request.quantityFieldId,
          reservedQuantityFieldId: request.reservedQuantityFieldId,
          statusFieldId: request.statusFieldId,
          unitFieldId: request.unitFieldId
        });
        entry = {
          inventoryRecord,
          fieldIds,
          requests: [],
          activeReservations: (batchCache.activeReservationsByResource.get(resourceKey) || []).slice()
        };
        entriesByResource.set(resourceKey, entry);
      }
      entry.requests.push({
        request,
        reservationId: this.buildReservationId(request),
        requestedQty
      });
    }

    for (const entry of entriesByResource.values()) {
      const positiveRequests = entry.requests.filter(item => item.requestedQty > 0);
      const inventoryStatus = entry.fieldIds.statusFieldId ? this.readString(entry.inventoryRecord, entry.fieldIds.statusFieldId) : '';
      const allowedStatuses = Array.from(
        new Set(
          positiveRequests.flatMap(item =>
            (Array.isArray(item.request.allowedStatuses) && item.request.allowedStatuses.length ? item.request.allowedStatuses : ['available'])
              .map(value => toText(value).toLowerCase())
              .filter(Boolean)
          )
        )
      );
      if (positiveRequests.length && allowedStatuses.length) {
        const normalizedStatus = inventoryStatus.toLowerCase();
        if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
          const first = positiveRequests[0];
          return {
            success: false,
            conflict: true,
            message: `This inventory item is not available for reservation (${inventoryStatus || 'unknown status'}).`,
            availability: [
              this.availability({
                inventoryRecord: entry.inventoryRecord,
                fieldIds: entry.fieldIds,
                resourceFormKey: first.request.resourceFormKey,
                resourceRecordId: first.request.resourceRecordId,
                resourceItemId: first.request.resourceItemId || this.readString(entry.inventoryRecord, 'LEFTOVER_ID'),
                resourceKind: first.request.resourceKind || this.readString(entry.inventoryRecord, 'LEFTOVER_KIND'),
                reservedQuantity: entry.activeReservations.reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0),
                currentReservationQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0),
                currentRecordReservedQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0)
              })
            ]
          };
        }
      }

      const desiredIdsForResource = new Set(entry.requests.map(item => item.reservationId));
      const preservedReservations = entry.activeReservations.filter(record => !releaseReservationIds.has(toText(record.id)));
      const reservedByOthers = preservedReservations
        .filter(record => !desiredIdsForResource.has(toText(record.id)))
        .reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0);
      const desiredTotal = entry.requests.reduce((sum, item) => sum + Math.max(0, item.requestedQty), 0);
      const remainingQuantity = this.readNumber(entry.inventoryRecord, entry.fieldIds.quantityFieldId);
      const maxAllowedQuantity = Math.max(0, remainingQuantity - reservedByOthers);
      if (desiredTotal > maxAllowedQuantity + 1e-9) {
        const first = entry.requests[0];
        return {
          success: false,
          conflict: true,
          message: `Only ${formatQuantity(maxAllowedQuantity)} ${this.readString(entry.inventoryRecord, entry.fieldIds.unitFieldId) || ''}`.trim(),
          availability: [
            this.availability({
              inventoryRecord: entry.inventoryRecord,
              fieldIds: entry.fieldIds,
              resourceFormKey: first.request.resourceFormKey,
              resourceRecordId: first.request.resourceRecordId,
              resourceItemId: first.request.resourceItemId || this.readString(entry.inventoryRecord, 'LEFTOVER_ID'),
              resourceKind: first.request.resourceKind || this.readString(entry.inventoryRecord, 'LEFTOVER_KIND'),
              reservedQuantity: reservedByOthers + desiredTotal,
              currentReservationQuantity: desiredTotal,
              currentRecordReservedQuantity: desiredTotal
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
    const sourceRecordMetaBefore = await this.measure('reservationApply.sourceMetaBefore', () =>
      this.sourceRecordMeta(sourceFormKey, sourceRecordId)
    );
    const sourceClientDataVersionMatched =
      Number.isFinite(clientDataVersion) &&
      clientDataVersion > 0 &&
      Number.isFinite(Number(sourceRecordMetaBefore && sourceRecordMetaBefore.dataVersion)) &&
      Number(sourceRecordMetaBefore.dataVersion) === clientDataVersion;
    const normalizedReservations = this.normalizePlanEntries(request || {});
    const ledgerFormKey = toText((request && request.ledgerFormKey) || (normalizedReservations[0] && normalizedReservations[0].ledgerFormKey)) || DEFAULT_LEDGER_FORM_KEY;
    const batchCache = {
      activeReservationsByResource: new Map(),
      inventoryRecordsByResource: new Map()
    };
    const allActiveReservations = await this.measure('reservationApply.activeReservations', () =>
      this.activeReservations(ledgerFormKey)
    );
    allActiveReservations.forEach(record => {
      const resourceFormKey = this.readString(record, 'RESOURCE_FORM_KEY');
      const resourceRecordId = this.readString(record, 'RESOURCE_RECORD_ID');
      if (!resourceFormKey || !resourceRecordId) return;
      const key = this.resourceKey(resourceFormKey, resourceRecordId);
      const existing = batchCache.activeReservationsByResource.get(key) || [];
      existing.push(record);
      batchCache.activeReservationsByResource.set(key, existing);
    });
    const activeReservations = allActiveReservations.filter(
      record => this.readString(record, 'SOURCE_FORM_KEY') === sourceFormKey && this.readString(record, 'SOURCE_RECORD_ID') === sourceRecordId
    );
    const managedScopes = this.normalizeScopes(request && request.managedScopes);
    const managedActiveReservations = managedScopes.length
      ? activeReservations.filter(record => this.matchesScope(record, managedScopes))
      : activeReservations.slice();
    const desiredByReservationId = new Map();
    normalizedReservations.forEach(entry => {
      desiredByReservationId.set(this.buildReservationId(entry), entry);
    });
    const desiredReservationIds = new Set(desiredByReservationId.keys());
    const releaseCandidates = managedActiveReservations.filter(record => {
      const recordId = toText(record.id);
      return recordId && !desiredReservationIds.has(recordId);
    });

    const validationFailure = await this.measure('reservationApply.validatePlan', () =>
      this.validatePlan(Array.from(desiredByReservationId.values()), releaseCandidates, batchCache)
    );
    if (validationFailure) return validationFailure;

    const pendingSaves = this.createInternalSaveQueue();
    const availability = [];
    let appliedCount = 0;
    let releasedCount = 0;

    for (const record of releaseCandidates) {
      const result = await this.upsert(this.buildReleaseRequest(record, ledgerFormKey), { batchCache, pendingSaves });
      if (!result.success) {
        return {
          success: false,
          message: result.message || 'Failed to release outdated inventory reservations.',
          conflict: result.conflict === true,
          availability: result.availability ? [result.availability] : undefined
        };
      }
      releasedCount += 1;
      if (result.availability) availability.push(result.availability);
    }

    for (const entry of desiredByReservationId.values()) {
      const result = await this.upsert(entry, { batchCache, pendingSaves });
      if (!result.success) {
        return {
          success: false,
          message: result.message || 'Failed to update inventory reservations.',
          conflict: result.conflict === true,
          availability: result.availability ? [result.availability] : undefined
        };
      }
      appliedCount += 1;
      if (result.availability) availability.push(result.availability);
    }

    const flushResult = await this.measure('reservationApply.flushInternalSaves', () => this.flushInternalSaves(pendingSaves));
    if (!flushResult.success) {
      return {
        success: false,
        message: flushResult.message || 'Failed to save inventory reservation updates.'
      };
    }

    return {
      success: true,
      message: 'Inventory reservations updated.',
      reservationsApplied: appliedCount,
      reservationsReleased: releasedCount,
      availability: this.uniqueAvailability(availability),
      sourceRecordMeta: (await this.measure('reservationApply.sourceMetaAfter', () => this.sourceRecordMeta(sourceFormKey, sourceRecordId))) || sourceRecordMetaBefore,
      sourceClientDataVersionMatched
    };
  }

  parseRows(raw) {
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
  }

  rowId(row) {
    return toText((row && (row.__ckRowId || row.id)) || '');
  }

  shouldConsume(sourceRecord, reservationRecord) {
    if (!sourceRecord) return true;
    const parentGroupId = this.readString(reservationRecord, 'SOURCE_PARENT_GROUP_ID');
    const parentRowId = this.readString(reservationRecord, 'SOURCE_PARENT_ROW_ID');
    const outputGroupId = this.readString(reservationRecord, 'SOURCE_OUTPUT_GROUP_ID');
    const outputRowId = this.readString(reservationRecord, 'SOURCE_OUTPUT_ROW_ID');
    const outputGroupIds = Array.from(new Set([outputGroupId, this.normalizeOutputGroupId(outputGroupId, outputRowId)].map(toText).filter(Boolean)));
    const resourceItemId = this.readString(reservationRecord, 'RESOURCE_ITEM_ID');
    if (!parentGroupId || !outputGroupIds.length || !resourceItemId) return true;

    const parentRows = this.parseRows((sourceRecord.values || {})[parentGroupId] || (sourceRecord.values || {})[`${parentGroupId}_json`]);
    if (!parentRows.length) return false;
    const candidateKeyFieldIds = [
      this.readString(reservationRecord, 'SOURCE_OUTPUT_KEY_FIELD_ID'),
      'LEFTOVER_ID',
      'RESOURCE_ITEM_ID',
      'ID',
      'id'
    ].filter(Boolean);
    const candidateParentRows = parentRowId ? parentRows.filter(row => this.rowId(row) === parentRowId) : parentRows;
    const rowsToSearch = candidateParentRows.length ? candidateParentRows : parentRows;
    return rowsToSearch.some(parentRow =>
      outputGroupIds
        .flatMap(groupId => this.parseRows(parentRow[groupId] || parentRow[`${groupId}_json`]))
        .some(row => candidateKeyFieldIds.some(fieldId => toText(row && row[fieldId]) === resourceItemId))
    );
  }

  async resolveInventoryRecord(record) {
    const resourceFormKey = this.readString(record, 'RESOURCE_FORM_KEY');
    const resourceRecordId = this.readString(record, 'RESOURCE_RECORD_ID');
    const resourceItemId = this.readString(record, 'RESOURCE_ITEM_ID');
    if (!resourceFormKey) return { resourceFormKey: '', resourceRecordId, resourceItemId, inventoryRecord: null };
    const direct = resourceRecordId ? await this.fetchById(resourceFormKey, resourceRecordId) : null;
    if (direct) return { resourceFormKey, resourceRecordId, resourceItemId, inventoryRecord: direct };
    if (!resourceItemId) return { resourceFormKey, resourceRecordId, resourceItemId, inventoryRecord: null };
    const matched = (await this.records(resourceFormKey)).filter(candidate => this.readString(candidate, 'LEFTOVER_ID') === resourceItemId);
    if (matched.length !== 1) return { resourceFormKey, resourceRecordId, resourceItemId, inventoryRecord: null };
    return { resourceFormKey, resourceRecordId: toText(matched[0].id), resourceItemId, inventoryRecord: matched[0] };
  }

  async reconcile(request) {
    const sourceFormKey = toText(request && request.sourceFormKey);
    const sourceRecordId = toText(request && request.sourceRecordId);
    if (!sourceFormKey || !sourceRecordId) return { success: false, message: 'sourceFormKey and sourceRecordId are required.' };
    const mode = request && request.mode === 'release' ? 'release' : 'consume';
    const ledgerFormKey = toText(request && request.ledgerFormKey) || DEFAULT_LEDGER_FORM_KEY;
    const sourceRecord = await this.fetchById(sourceFormKey, sourceRecordId);
    const activeReservations = await this.activeReservations(ledgerFormKey, {
      SOURCE_FORM_KEY: sourceFormKey,
      SOURCE_RECORD_ID: sourceRecordId
    });

    if (!activeReservations.length) {
      return {
        success: true,
        message: 'No active reservations found.',
        reconciledReservations: 0,
        consumedReservations: 0,
        releasedReservations: 0,
        touchedInventoryRecords: 0,
        availability: []
      };
    }

    const grouped = new Map();
    for (const record of activeReservations) {
      const resolved = await this.resolveInventoryRecord(record);
      const rowMode = mode === 'release' || !this.shouldConsume(sourceRecord, record) ? 'release' : 'consume';
      const key = this.resourceKey(resolved.resourceFormKey, resolved.resourceRecordId);
      const entry = grouped.get(key) || {
        resourceFormKey: resolved.resourceFormKey,
        resourceRecordId: resolved.resourceRecordId,
        resourceItemId: resolved.resourceItemId || this.readString(record, 'RESOURCE_ITEM_ID'),
        inventoryRecord: resolved.inventoryRecord,
        consume: [],
        release: []
      };
      if (!entry.inventoryRecord && resolved.inventoryRecord) entry.inventoryRecord = resolved.inventoryRecord;
      entry[rowMode].push(record);
      grouped.set(key, entry);
    }

    const availability = [];
    let consumedReservations = 0;
    let releasedReservations = 0;
    const pendingSaves = this.createInternalSaveQueue();
    for (const groupEntry of grouped.values()) {
      if (!groupEntry.inventoryRecord) {
        throw new Error(`Inventory record not found during reconciliation: ${groupEntry.resourceFormKey} / ${groupEntry.resourceRecordId || groupEntry.resourceItemId}.`);
      }
      const rows = [...groupEntry.consume, ...groupEntry.release];
      const first = rows[0];
      const fieldIds = this.resolveFieldIds({
        resourceKind: this.readString(first, 'RESOURCE_KIND'),
        quantityFieldId: this.readString(first, 'RESOURCE_QTY_FIELD_ID'),
        reservedQuantityFieldId: this.readString(first, 'RESOURCE_RESERVED_QTY_FIELD_ID'),
        statusFieldId: this.readString(first, 'RESOURCE_STATUS_FIELD_ID'),
        unitFieldId: this.readString(first, 'RESOURCE_UNIT_FIELD_ID')
      });
      const consumedQuantity = groupEntry.consume.reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0);
      const releasedQuantity = groupEntry.release.reduce((sum, record) => sum + this.readNumber(record, 'RESERVED_QTY'), 0);
      const totalClosedQuantity = consumedQuantity + releasedQuantity;
      const remainingQuantity = this.readNumber(groupEntry.inventoryRecord, fieldIds.quantityFieldId);
      const reservedQuantity = this.readNumber(groupEntry.inventoryRecord, fieldIds.reservedQuantityFieldId);
      if (mode === 'consume' && consumedQuantity > remainingQuantity + 1e-9) {
        throw new Error(`Reservation reconciliation exceeds remaining quantity for ${groupEntry.resourceFormKey} / ${groupEntry.resourceRecordId}.`);
      }
      const nextRemainingQuantity = mode === 'consume' ? Math.max(0, remainingQuantity - consumedQuantity) : remainingQuantity;
      const nextReservedQuantity = Math.max(0, reservedQuantity - totalClosedQuantity);
      const nextInventoryValues = cloneJson(groupEntry.inventoryRecord.values || {});
      nextInventoryValues[fieldIds.quantityFieldId] = formatQuantity(nextRemainingQuantity);
      nextInventoryValues[fieldIds.reservedQuantityFieldId] = formatQuantity(nextReservedQuantity);
      if (fieldIds.statusFieldId && consumedQuantity > 0) nextInventoryValues[fieldIds.statusFieldId] = nextRemainingQuantity > 0 ? 'available' : 'used';
      if (consumedQuantity > 0 && Object.prototype.hasOwnProperty.call(nextInventoryValues, 'LEFTOVER_USED_BY_FORM_KEY')) {
        nextInventoryValues.LEFTOVER_USED_BY_FORM_KEY = sourceFormKey;
      }
      if (consumedQuantity > 0 && Object.prototype.hasOwnProperty.call(nextInventoryValues, 'LEFTOVER_USED_BY_RECORD_ID')) {
        nextInventoryValues.LEFTOVER_USED_BY_RECORD_ID = sourceRecordId;
      }
      const inventoryResult = await this.saveInternal(
        groupEntry.resourceFormKey,
        groupEntry.resourceRecordId,
        groupEntry.inventoryRecord.language || 'EN',
        fieldIds.statusFieldId ? toText(nextInventoryValues[fieldIds.statusFieldId]) : groupEntry.inventoryRecord.status,
        nextInventoryValues,
        'inventoryReservation:reconcile',
        { clientDataVersion: groupEntry.inventoryRecord.dataVersion, queue: pendingSaves }
      );
      if (!inventoryResult.success) throw new Error(inventoryResult.message || 'Failed to reconcile inventory reservation.');
      const nextInventoryRecord = {
        ...groupEntry.inventoryRecord,
        values: nextInventoryValues,
        dataVersion: inventoryResult && inventoryResult.meta ? inventoryResult.meta.dataVersion : groupEntry.inventoryRecord.dataVersion
      };
      availability.push(
        this.availability({
          inventoryRecord: nextInventoryRecord,
          fieldIds,
          resourceFormKey: groupEntry.resourceFormKey,
          resourceRecordId: groupEntry.resourceRecordId,
          resourceItemId: this.readString(first, 'RESOURCE_ITEM_ID'),
          resourceKind: this.readString(first, 'RESOURCE_KIND'),
          reservedQuantity: nextReservedQuantity,
          currentReservationQuantity: 0,
          currentRecordReservedQuantity: 0
        })
      );

      for (const record of groupEntry.consume) {
        const values = cloneJson(record.values || {});
        values.STATUS = 'consumed';
        values.RESOURCE_FORM_KEY = groupEntry.resourceFormKey;
        values.RESOURCE_RECORD_ID = groupEntry.resourceRecordId;
        const result = await this.saveInternal(ledgerFormKey, toText(record.id), record.language || 'EN', 'consumed', values, 'inventoryReservation:consume', {
          clientDataVersion: record.dataVersion,
          queue: pendingSaves
        });
        if (!result.success) throw new Error(result.message || 'Failed to close reservation ledger row.');
      }
      for (const record of groupEntry.release) {
        const values = cloneJson(record.values || {});
        values.STATUS = 'released';
        values.RESOURCE_FORM_KEY = groupEntry.resourceFormKey;
        values.RESOURCE_RECORD_ID = groupEntry.resourceRecordId;
        const result = await this.saveInternal(ledgerFormKey, toText(record.id), record.language || 'EN', 'released', values, 'inventoryReservation:release', {
          clientDataVersion: record.dataVersion,
          queue: pendingSaves
        });
        if (!result.success) throw new Error(result.message || 'Failed to close reservation ledger row.');
      }
      consumedReservations += groupEntry.consume.length;
      releasedReservations += groupEntry.release.length;
    }

    const flushResult = await this.measure('reservationReconcile.flushInternalSaves', () => this.flushInternalSaves(pendingSaves));
    if (!flushResult.success) {
      return {
        success: false,
        message: flushResult.message || 'Failed to save inventory reservation reconciliation updates.',
        reconciledReservations: activeReservations.length,
        consumedReservations,
        releasedReservations,
        touchedInventoryRecords: grouped.size,
        availability
      };
    }

    return {
      success: true,
      message:
        mode === 'release'
          ? 'Inventory reservations released.'
          : releasedReservations > 0
            ? 'Inventory reservations reconciled and stale reservations released.'
            : 'Inventory reservations reconciled.',
      reconciledReservations: activeReservations.length,
      consumedReservations,
      releasedReservations,
      touchedInventoryRecords: grouped.size,
      availability
    };
  }
}

const createInventoryReservationRepository = deps => new InventoryReservationRepository(deps || {});

module.exports = {
  InventoryReservationRepository,
  createInventoryReservationRepository
};
