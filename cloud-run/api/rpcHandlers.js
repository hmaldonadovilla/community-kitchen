const { createAnalyticsRepository } = require('./repositories/analyticsRepository');
const { createAnalyticsPipelineRepository } = require('./repositories/analyticsPipelineRepository');
const { createDataSourceRepository } = require('./repositories/dataSourceRepository');
const { createFileRepository } = require('./repositories/fileRepository');
const { createFollowupRepository } = require('./repositories/followupRepository');
const { createFormConfigRepository } = require('./repositories/configRepository');
const { createInventoryReservationRepository } = require('./repositories/inventoryReservationRepository');
const { createLifecycleRepository } = require('./repositories/lifecycleRepository');
const { createSubmissionRepository } = require('./repositories/submissionRepository');
const { createSubmitEffectsRepository } = require('./repositories/submitEffectsRepository');
const { createTemplateRepository } = require('./repositories/templateRepository');
const {
  applyUpdateRecordDependencyMutationsToRecord,
  evaluateUpdateRecordDependencyPreview
} = require('./repositories/updateRecordDependencies');

const HOME_BOOTSTRAP_LIST_MAX_ITEMS = 200;

const toString = value => (value === undefined || value === null ? '' : value.toString());

const resolveBackendPayload = env => ({
  mode: (env.CK_BACKEND_MODE || env.CK_MODE || '').toString().trim() || undefined,
  apiBaseUrl: (env.CK_API_BASE_URL || '').toString().trim() || undefined,
  rpcPath: (env.CK_API_RPC_PATH || '').toString().trim() || undefined,
  httpFunctions: (env.CK_HTTP_FUNCTIONS || '').toString().trim()
    ? env.CK_HTTP_FUNCTIONS.split(',').map(item => item.trim()).filter(Boolean)
    : undefined,
  appsScriptFunctions: (env.CK_APPS_SCRIPT_FUNCTIONS || '').toString().trim()
    ? env.CK_APPS_SCRIPT_FUNCTIONS.split(',').map(item => item.trim()).filter(Boolean)
    : undefined,
  dataBackend: (env.CK_DATA_BACKEND || '').toString().trim() || undefined,
  fileBackend: (env.CK_FILE_BACKEND || '').toString().trim() || undefined
});

const normalizeDateLocal = value => {
  const raw = toString(value).trim();
  if (!raw) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const todayIso = env => {
  const timeZone = (env.CK_TIMEZONE || env.TZ || 'Europe/Brussels').toString().trim() || 'Europe/Brussels';
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) {
      return `${byType.year}-${byType.month}-${byType.day}`;
    }
  } catch {
    // Fall back to UTC below when the configured timezone is invalid.
  }
  return new Date().toISOString().slice(0, 10);
};

const collectWhenFieldIds = (when, addProjection) => {
  if (!when) return;
  if (Array.isArray(when)) {
    when.forEach(entry => collectWhenFieldIds(entry, addProjection));
    return;
  }
  if (typeof when !== 'object') return;
  if (Array.isArray(when.all)) {
    when.all.forEach(entry => collectWhenFieldIds(entry, addProjection));
    return;
  }
  if (Array.isArray(when.any)) {
    when.any.forEach(entry => collectWhenFieldIds(entry, addProjection));
    return;
  }
  if (when.not) {
    collectWhenFieldIds(when.not, addProjection);
    return;
  }
  const lineItems = when.lineItems || when.lineItem;
  if (lineItems && typeof lineItems === 'object') {
    addProjection(lineItems.groupId || lineItems.group);
    collectWhenFieldIds(lineItems.when, addProjection);
    collectWhenFieldIds(lineItems.parentWhen, addProjection);
    return;
  }
  addProjection(when.fieldId || when.field || when.id);
};

const buildHomeSummaryProjection = definition => {
  const metaFields = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
  const projectionIds = new Set();
  const addProjection = fieldId => {
    const id = toString(fieldId).trim();
    if (!id || metaFields.has(id)) return;
    projectionIds.add(id);
  };

  ((definition && definition.listView && definition.listView.columns) || []).forEach(column => {
    if (!column || column.kind === 'meta') return;
    if (column.type === 'rule') {
      addProjection(column.hrefFieldId);
      (Array.isArray(column.cases) ? column.cases : []).forEach(entry => {
        collectWhenFieldIds(entry && entry.when, addProjection);
        addProjection(entry && entry.hrefFieldId);
      });
      addProjection(column.default && column.default.hrefFieldId);
      return;
    }
    addProjection(column.fieldId);
  });

  const listView = (definition && definition.listView) || {};
  addProjection(listView.dateHeading && listView.dateHeading.fieldId);
  collectWhenFieldIds(listView.defaultWhen, addProjection);

  const search = listView.search || {};
  addProjection(search.dateFieldId);
  const searchFields = search.fields;
  if (Array.isArray(searchFields)) {
    searchFields.forEach(addProjection);
  } else if (searchFields !== undefined && searchFields !== null) {
    searchFields
      .toString()
      .split(',')
      .map(fieldId => fieldId.trim())
      .filter(Boolean)
      .forEach(addProjection);
  }

  (Array.isArray(search.presets) ? search.presets : []).forEach(preset => {
    collectWhenFieldIds(preset && preset.when, addProjection);
    addProjection(preset && preset.dateFieldId);
  });

  return Array.from(projectionIds);
};

const shouldFetchFullHomeSummaryList = definition => {
  const listView = definition && definition.listView;
  if (!listView || !Array.isArray(listView.columns) || !listView.columns.length) return false;
  if (!listView.search) return false;
  if (listView.paginationControlsEnabled === false) return false;
  const mode = (listView.search.mode || 'text').toString().trim().toLowerCase();
  return mode === 'text' || mode === 'advanced' || mode === '';
};

const resolveHomeSummaryPageSize = definition => {
  const configured = Number(definition && definition.listView && definition.listView.pageSize ? definition.listView.pageSize : 10);
  const pageSize = Number.isFinite(configured) && configured > 0 ? Math.max(1, Math.min(Math.floor(configured), 50)) : 10;
  return shouldFetchFullHomeSummaryList(definition) ? HOME_BOOTSTRAP_LIST_MAX_ITEMS : pageSize;
};

const resolveHomeBootstrapDateFilter = (definition, env) => {
  const search = definition && definition.listView && definition.listView.search;
  const mode = ((search && search.mode) || 'text').toString().trim().toLowerCase();
  const fieldId = toString(search && search.dateFieldId).trim();
  if (mode !== 'date' || !fieldId) return null;
  const initialValue = search && search.initialValue;
  if (initialValue === undefined || initialValue === null) return null;
  if (typeof initialValue === 'string') {
    const equals = normalizeDateLocal(initialValue);
    return equals ? { fieldId, equals } : null;
  }
  if (typeof initialValue !== 'object') return null;
  const relativeDate = toString(initialValue.relativeDate || initialValue.relative).trim().toLowerCase();
  if (relativeDate === 'today') return { fieldId, equals: todayIso(env) };
  const rawValue = toString(initialValue.value || initialValue.dateValue).trim();
  const equals = normalizeDateLocal(rawValue);
  return equals ? { fieldId, equals } : null;
};

const revisionFromEtag = etag => {
  const raw = toString(etag).trim();
  if (!raw) return 0;
  const hex = raw.replace(/[^a-f0-9]/gi, '').slice(0, 12);
  const value = Number.parseInt(hex || '0', 16);
  return Number.isFinite(value) ? value : 0;
};

const normalizeHomeListResponse = listResponse => {
  if (!listResponse || !Array.isArray(listResponse.items)) return null;
  const totalCount = Number(listResponse.totalCount || 0);
  const cappedTotalCount = Number.isFinite(totalCount) && totalCount > 0
    ? Math.min(totalCount, HOME_BOOTSTRAP_LIST_MAX_ITEMS)
    : listResponse.items.length;
  const completeData =
    listResponse.items.length >= cappedTotalCount ||
    (!listResponse.nextPageToken && (!Number.isFinite(totalCount) || totalCount <= 0 || listResponse.items.length >= totalCount));
  return {
    ...listResponse,
    contiguousItemCount: listResponse.items.length,
    completeData
  };
};

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const normalizeLanguage = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] || value[0] : value;
  const language = (raw || 'EN').toString().trim().toUpperCase();
  return ['EN', 'FR', 'NL'].includes(language) ? language : 'EN';
};

const parseButtonRef = ref => {
  const raw = (ref || '').toString();
  const token = '__ckQIdx=';
  const pos = raw.lastIndexOf(token);
  if (pos < 0) return { id: raw };
  const id = raw.slice(0, pos);
  const qIdx = Number.parseInt(raw.slice(pos + token.length), 10);
  if (!Number.isFinite(qIdx)) return { id: raw };
  return { id, qIdx };
};

const resolveButtonQuestion = (questions, parsed) => {
  const id = (parsed && parsed.id ? parsed.id : '').toString();
  if (!id) return undefined;
  if (parsed.qIdx !== undefined && parsed.qIdx !== null && Number.isFinite(parsed.qIdx)) {
    const candidate = questions[parsed.qIdx];
    if (candidate && candidate.type === 'BUTTON' && candidate.id === id) return candidate;
  }
  return (questions || []).find(question => question && question.type === 'BUTTON' && question.id === id);
};

const normalizeTemplateRenderRecord = (formObject, questions, formKey) => {
  const payload = formObject && typeof formObject === 'object' ? formObject : {};
  const values = payload.values && typeof payload.values === 'object' ? { ...payload.values } : {};
  (questions || [])
    .filter(question => question && question.type !== 'BUTTON')
    .forEach(question => {
      if (Object.prototype.hasOwnProperty.call(values, question.id)) return;
      if (Object.prototype.hasOwnProperty.call(payload, question.id)) {
        values[question.id] = payload[question.id];
        return;
      }
      if (question.type === 'LINE_ITEM_GROUP') {
        const jsonKey = `${question.id}_json`;
        if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) values[question.id] = payload[jsonKey];
      }
    });
  (questions || [])
    .filter(question => question && question.type === 'LINE_ITEM_GROUP')
    .forEach(question => {
      const raw = values[question.id];
      if (typeof raw === 'string' && raw.trim()) {
        try {
          values[question.id] = JSON.parse(raw);
        } catch {
          // Keep the original string if it is not valid JSON.
        }
      }
    });

  return {
    formKey,
    language: normalizeLanguage(payload.language),
    values,
    id: payload.id ? payload.id.toString() : undefined,
    createdAt: payload.createdAt ? payload.createdAt.toString() : undefined,
    updatedAt: payload.updatedAt ? payload.updatedAt.toString() : undefined,
    status: payload.status ? payload.status.toString() : undefined,
    pdfUrl: payload.pdfUrl ? payload.pdfUrl.toString() : undefined
  };
};

const buildDependencyMutationSavePayload = args => {
  const payloadValues = cloneJson((args.record && args.record.values) || {});
  const payload = {
    formKey: args.formKey,
    language: args.record && args.record.language,
    values: payloadValues,
    id: args.record && args.record.id,
    createdAt: args.record && args.record.createdAt,
    updatedAt: args.record && args.record.updatedAt,
    status: args.record && args.record.status !== undefined ? args.record.status : undefined,
    pdfUrl: args.record && args.record.pdfUrl
  };
  Object.keys(payloadValues || {}).forEach(fieldId => {
    payload[fieldId] = payloadValues[fieldId];
  });
  payload.__ckSaveMode = 'draft';
  payload.__ckAllowClosedUpdate = '1';
  payload.__ckStatus = !args.record || args.record.status === undefined || args.record.status === null ? '' : args.record.status;
  payload.__ckAuditAction = args.auditAction;
  payload.__ckSkipSubmitEffects = true;
  if (Number.isFinite(Number(args.clientDataVersion)) && Number(args.clientDataVersion) > 0) {
    payload.__ckClientDataVersion = Number(args.clientDataVersion);
  }
  return payload;
};

const forceSkipSubmitEffects = formObject => {
  const payload = formObject && typeof formObject === 'object' ? { ...formObject } : {};
  if (payload.values && typeof payload.values === 'object') payload.values = cloneJson(payload.values);
  payload.__ckSkipSubmitEffects = true;
  return payload;
};

const createRpcHandlers = deps => {
  const options = deps || {};
  const env = options.env || process.env;
  const dataSourceRepository = createDataSourceRepository(options);
  const fileRepository = createFileRepository(options);
  const formConfigRepository = createFormConfigRepository(options);
  const submissionRepository = createSubmissionRepository({ ...options, configRepository: formConfigRepository, fileRepository });
  const inventoryReservationRepository = createInventoryReservationRepository({ ...options, submissionRepository });
  const submitEffectsRepository = createSubmitEffectsRepository({
    ...options,
    submissionRepository,
    inventoryReservationRepository
  });
  const templateRepository = createTemplateRepository({
    ...options,
    fileRepository,
    configRepository: formConfigRepository,
    submissionRepository,
    dataSourceRepository
  });
  const followupRepository = createFollowupRepository({
    ...options,
    submissionRepository,
    submitEffectsRepository,
    inventoryReservationRepository,
    templateRepository,
    dataSourceRepository
  });
  const analyticsRepository = createAnalyticsRepository({
    ...options,
    configRepository: formConfigRepository,
    submissionRepository
  });
  const analyticsPipelineRepository = createAnalyticsPipelineRepository({
    ...options,
    configRepository: formConfigRepository,
    submissionRepository,
    dataSourceRepository,
    fileRepository
  });
  const lifecycleRepository = createLifecycleRepository({
    ...options,
    configRepository: formConfigRepository,
    submissionRepository,
    inventoryReservationRepository
  });

  const buildHomeBootstrap = async (formKey, requestOptions = {}) => {
    const config = formConfigRepository.fetchFormConfig(formKey);
    const resolvedFormKey =
      (formKey || '').toString().trim() ||
      config.formKey ||
      (config.form && (config.form.configSheet || config.form.title)) ||
      '__DEFAULT__';
    const definition = config.definition || {};
    const includeAnalytics = requestOptions && requestOptions.includeAnalytics === true;
    const buildAnalyticsPayload = async () => {
      if (!includeAnalytics) return {};
      const analytics = await analyticsRepository.fetchHomeAnalytics(resolvedFormKey);
      return {
        analytics,
        analyticsRev: Number((analytics && analytics.revision) || 0) || 0
      };
    };
    if (!definition.listView || !Array.isArray(definition.listView.columns) || !definition.listView.columns.length) {
      return {
        listResponse: undefined,
        records: {},
        ...(await buildAnalyticsPayload())
      };
    }
    const projection = buildHomeSummaryProjection(definition);
    const fetchPageSize = resolveHomeSummaryPageSize(definition);
    const homeDateFilter = resolveHomeBootstrapDateFilter(definition, env);
    const sort =
      definition.listView.defaultSort && definition.listView.defaultSort.fieldId || homeDateFilter
        ? {
            fieldId: definition.listView.defaultSort && definition.listView.defaultSort.fieldId,
            direction: (definition.listView.defaultSort && definition.listView.defaultSort.direction) || 'desc',
            ...(fetchPageSize > 50 ? { __maxPageSize: HOME_BOOTSTRAP_LIST_MAX_ITEMS } : {}),
            ...(homeDateFilter
              ? {
                  __dateFieldId: homeDateFilter.fieldId,
                  __dateEquals: homeDateFilter.equals
                }
              : {})
          }
        : fetchPageSize > 50
          ? { __maxPageSize: HOME_BOOTSTRAP_LIST_MAX_ITEMS }
          : undefined;
    const batch = await submissionRepository.fetchSubmissionsSortedBatch(
      formKey,
      projection,
      fetchPageSize,
      undefined,
      false,
      undefined,
      sort
    );
    return {
      listResponse: normalizeHomeListResponse(batch && batch.list),
      records: {},
      ...(await buildAnalyticsPayload())
    };
  };

  const fetchBootstrapContext = async (formKey, requestOptions = {}) => {
    const config = formConfigRepository.fetchFormConfig(formKey);
    const resolvedFormKey =
      (formKey || '').toString().trim() ||
      config.formKey ||
      (config.form && (config.form.configSheet || config.form.title)) ||
      '__DEFAULT__';
    const includeHomeData = requestOptions && requestOptions.includeHomeData === true;
    const includeAnalytics = requestOptions && requestOptions.includeAnalytics === true;
    const bootstrap = includeHomeData ? await buildHomeBootstrap(resolvedFormKey, { includeAnalytics }) : {};
    const analyticsOnly = !includeHomeData && includeAnalytics ? await analyticsRepository.fetchHomeAnalytics(resolvedFormKey) : undefined;
    const analytics = bootstrap.analytics || analyticsOnly;
    const homeRev = revisionFromEtag(bootstrap && bootstrap.listResponse && bootstrap.listResponse.etag);
    return {
      definition: config.definition || {},
      formKey: resolvedFormKey,
      configSource: 'cloudRunBundle',
      configEnv: typeof formConfigRepository.getConfigEnv === 'function' ? formConfigRepository.getConfigEnv() : undefined,
      envTag: (env.CK_ENV_TAG || env.CK_ENV || '').toString().trim() || undefined,
      backend: resolveBackendPayload(env),
      homeRev,
      listResponse: bootstrap.listResponse,
      records: bootstrap.records || {},
      analytics,
      analyticsRev: Number(bootstrap.analyticsRev || (analytics && analytics.revision) || 0) || 0
    };
  };

  const resolveUpdateRecordDependencyContext = async (formObject, buttonId) => {
    const payload = formObject && typeof formObject === 'object' ? formObject : {};
    const formKey = (payload.formKey || payload.form || '').toString();
    if (!formKey) throw new Error('Form key is required.');
    const sourceContext = submissionRepository.getFormContext(formKey);
    const parsed = parseButtonRef((buttonId || '').toString());
    const button = resolveButtonQuestion(sourceContext.questions, parsed);
    const cfg = button && button.button;
    const guard = cfg && cfg.dependencyGuard;
    if (!button || !cfg || cfg.action !== 'updateRecord' || !guard) {
      throw new Error(`Unknown or misconfigured button "${buttonId}".`);
    }
    const sourceRecord = normalizeTemplateRenderRecord(payload, sourceContext.questions, sourceContext.formKey || formKey);
    const targetContext = submissionRepository.getFormContext(guard.targetFormKey);
    const targetRecords = await submissionRepository.records(guard.targetFormKey);
    const targetFormKey = targetContext.form.configSheet || targetContext.form.title || targetContext.formKey;
    const preview = evaluateUpdateRecordDependencyPreview({
      guard,
      sourceRecord,
      language: sourceRecord.language,
      targetFormKey,
      targetFormTitle: targetContext.form.title,
      targetQuestions: targetContext.questions,
      targetRecords
    });
    return {
      formKey,
      parsed,
      guard,
      sourceRecord,
      targetContext,
      targetFormKey,
      preview
    };
  };

  return {
    async fetchFormConfig(...args) {
      return formConfigRepository.fetchFormConfig(args[0]);
    },
    async fetchFormCatalog() {
      return formConfigRepository.fetchFormCatalog();
    },
    async fetchAnalyticsDashboard() {
      return analyticsRepository.fetchAnalyticsDashboard();
    },
    async queueAnalyticsPipelineRun(...args) {
      return analyticsPipelineRepository.queueAnalyticsPipelineRun(args[0]);
    },
    async runQueuedAnalyticsPipelineJobs(...args) {
      return analyticsPipelineRepository.runQueuedAnalyticsPipelineJobs(args[0] || {});
    },
    async runDailyAnalyticsRecompute() {
      return analyticsRepository.runDailyAnalyticsRecompute();
    },
    async runDailyLifecycleRecompute() {
      return lifecycleRepository.runDailyLifecycleRecompute();
    },
    async fetchBootstrapContext(...args) {
      return fetchBootstrapContext(args[0]);
    },
    async fetchBootstrapContextWithOptions(...args) {
      return fetchBootstrapContext(args[0], args[1] || {});
    },
    async fetchHomeBootstrap(...args) {
      const formKey = args[0];
      const clientRevRaw = args[1];
      const bootstrap = await buildHomeBootstrap(formKey, { includeAnalytics: true });
      const rev = revisionFromEtag(bootstrap && bootstrap.listResponse && bootstrap.listResponse.etag);
      const clientRev = Number(clientRevRaw);
      if (Number.isFinite(clientRev) && clientRev === rev) {
        return { notModified: true, rev, cache: 'hit' };
      }
      return {
        notModified: false,
        rev,
        listResponse: bootstrap.listResponse,
        records: bootstrap.records || {},
        analytics: bootstrap.analytics,
        analyticsRev: Number(bootstrap.analyticsRev || (bootstrap.analytics && bootstrap.analytics.revision) || 0) || 0,
        cache: 'miss'
      };
    },
    async fetchSubmissions(...args) {
      return submissionRepository.fetchSubmissions(args[0], args[1], args[2], args[3]);
    },
    async fetchSubmissionsBatch(...args) {
      return submissionRepository.fetchSubmissionsBatch(args[0], args[1], args[2], args[3], args[4], args[5]);
    },
    async fetchSubmissionsSortedBatch(...args) {
      return submissionRepository.fetchSubmissionsSortedBatch(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    },
    async fetchSubmissionById(...args) {
      return submissionRepository.fetchSubmissionById(args[0], args[1]);
    },
    async fetchSubmissionByRowNumber(...args) {
      return submissionRepository.fetchSubmissionByRowNumber(args[0], args[1]);
    },
    async fetchSummaryRecord(...args) {
      return templateRepository.fetchSummaryRecord(args[0], args[1], args[2], args[3]);
    },
    async fetchSubmissionsByRowNumbers(...args) {
      return submissionRepository.fetchSubmissionsByRowNumbers(args[0], args[1]);
    },
    async getRecordVersion(...args) {
      return submissionRepository.getRecordVersion(args[0], args[1], args[2]);
    },
    async checkDedupConflict(...args) {
      return submissionRepository.checkDedupConflict(args[0]);
    },
    async saveSubmissionWithId(...args) {
      return submitEffectsRepository.saveSubmissionWithId(args[0]);
    },
    async triggerFollowupAction(...args) {
      return followupRepository.triggerFollowupAction(args[0], args[1], args[2], args[3]);
    },
    async triggerFollowupActions(...args) {
      return followupRepository.triggerFollowupActions(args[0], args[1], args[2], args[3]);
    },
    async enqueueFollowupEmail(...args) {
      return followupRepository.enqueueFollowupEmail(args[0], args[1], args[2] || {});
    },
    async runQueuedFollowupEmailJobs(...args) {
      return followupRepository.runQueuedFollowupEmailJobs(args[0] || {});
    },
    async previewUpdateRecordDependencies(...args) {
      const context = await resolveUpdateRecordDependencyContext(args[0], args[1]);
      return {
        success: true,
        impactedCount: context.preview.impactedCount,
        targetFormKey: context.preview.targetFormKey,
        dialog: context.preview.dialog
      };
    },
    async applyUpdateRecordWithDependencies(...args) {
      const formObject = args[0] || {};
      const buttonId = args[1];
      const context = await resolveUpdateRecordDependencyContext(formObject, buttonId);
      const dependencyBase = {
        targetFormKey: context.preview.targetFormKey,
        impactedCount: context.preview.impactedCount
      };

      if (!context.preview.impactedCount) {
        const sourceResult = await submissionRepository.saveSubmissionWithId(forceSkipSubmitEffects(formObject));
        return {
          ...sourceResult,
          dependency: {
            ...dependencyBase,
            updatedCount: 0
          }
        };
      }

      const rollbackRecords = [];
      let updatedCount = 0;
      try {
        for (const targetRecord of context.preview.impactedRecords) {
          const applied = applyUpdateRecordDependencyMutationsToRecord({
            guard: context.guard,
            sourceRecord: context.sourceRecord,
            targetQuestions: context.targetContext.questions,
            targetRecord
          });
          if (!applied.changed) continue;
          const payload = buildDependencyMutationSavePayload({
            record: applied.record,
            formKey: context.targetFormKey,
            auditAction: `${context.parsed.id || buttonId}:dependencyGuard`,
            clientDataVersion: targetRecord.dataVersion
          });
          const result = await submissionRepository.saveSubmissionWithId(payload);
          if (!result || !result.success) {
            throw new Error((result && result.message ? result.message : 'Failed to update dependent records.').toString());
          }
          rollbackRecords.push(targetRecord);
          if ((result.meta && result.meta.operation ? result.meta.operation : '').toString().trim().toLowerCase() !== 'noop') {
            updatedCount += 1;
          }
        }

        const sourceResult = await submissionRepository.saveSubmissionWithId(forceSkipSubmitEffects(formObject));
        if (!sourceResult || !sourceResult.success) {
          throw new Error((sourceResult && sourceResult.message ? sourceResult.message : 'Update failed.').toString());
        }
        return {
          ...sourceResult,
          dependency: {
            ...dependencyBase,
            updatedCount
          }
        };
      } catch (err) {
        const message = (err && err.message ? err.message : err && err.toString ? err.toString() : 'Update failed.').toString();
        let rollbackFailed = false;
        for (const originalRecord of rollbackRecords) {
          try {
            const rollbackPayload = buildDependencyMutationSavePayload({
              record: originalRecord,
              formKey: context.targetFormKey,
              auditAction: `${context.parsed.id || buttonId}:dependencyRollback`
            });
            const rollbackResult = await submissionRepository.saveSubmissionWithId(rollbackPayload);
            if (!rollbackResult || !rollbackResult.success) rollbackFailed = true;
          } catch {
            rollbackFailed = true;
          }
        }
        return {
          success: false,
          message: rollbackFailed ? `${message} Rollback failed for some dependent records.` : message,
          meta: {},
          dependency: {
            ...dependencyBase,
            updatedCount,
            rollbackFailed
          }
        };
      }
    },
    async upsertInventoryReservation(...args) {
      return inventoryReservationRepository.upsert(args[0]);
    },
    async applyInventoryReservationPlan(...args) {
      return inventoryReservationRepository.applyPlan(args[0]);
    },
    async reconcileInventoryReservations(...args) {
      return inventoryReservationRepository.reconcile(args[0]);
    },
    async fetchDataSource(...args) {
      return dataSourceRepository.fetchDataSource(args[0], args[1], args[2], args[3], args[4]);
    },
    async fetchDriveFileMetadata(...args) {
      if (!fileRepository || typeof fileRepository.fetchDriveFileMetadata !== 'function') {
        throw new Error('Drive file repository is not configured.');
      }
      return fileRepository.fetchDriveFileMetadata(args[0]);
    },
    async uploadFiles(...args) {
      if (!fileRepository || typeof fileRepository.saveFiles !== 'function') {
        throw new Error('Drive file repository is not configured.');
      }
      const urls = await fileRepository.saveFiles(args[0], args[1]);
      return { success: true, urls };
    },
    async prefetchTemplates(...args) {
      return templateRepository.prefetchTemplates(args[0]);
    },
    async renderHtmlTemplate(...args) {
      return templateRepository.renderHtmlTemplate(args[0], args[1]);
    },
    async renderMarkdownTemplate(...args) {
      return templateRepository.renderMarkdownTemplate(args[0], args[1]);
    },
    async renderInlineHtmlTemplate(...args) {
      return templateRepository.renderInlineHtmlTemplate(args[0], args[1]);
    },
    async renderSummaryHtmlTemplate(...args) {
      return templateRepository.renderSummaryHtmlTemplate(args[0]);
    },
    async renderDocTemplate(...args) {
      return templateRepository.renderDocTemplate(args[0], args[1]);
    },
    async renderDocTemplatePdfPreview(...args) {
      return templateRepository.renderDocTemplatePdfPreview(args[0], args[1]);
    },
    async renderDocTemplateHtml(...args) {
      return templateRepository.renderDocTemplateHtml(args[0], args[1]);
    },
    async renderSubmissionReportHtml(...args) {
      return templateRepository.renderSubmissionReportHtml(args[0]);
    },
    async trashPreviewArtifact(...args) {
      return templateRepository.trashPreviewArtifact(args[0]);
    }
  };
};

module.exports = {
  createRpcHandlers
};
