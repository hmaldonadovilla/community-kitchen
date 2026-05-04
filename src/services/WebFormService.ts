import { Dashboard } from '../config/Dashboard';
import { ANALYTICS_PAGE_CONFIG, resolveAnalyticsPageUpdatedAt } from '../config/analyticsPage';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import type {
  AnalyticsDashboardPayload,
  AnalyticsDashboardSection,
  AnalyticsDashboardWidget,
  QueueAnalyticsPipelineRequest,
  QueueAnalyticsPipelineResult
} from '../config/analyticsPageTypes';
import {
  AnalyticsSnapshot,
  FollowupSubmitEffect,
  FormConfig,
  FormConfigExport,
  DataSourceConfig,
  DedupRule,
  InventoryAvailabilitySnapshot,
  InventoryReservationPlanEntry,
  InventoryReservationPlanRequest,
  InventoryReservationPlanResult,
  InventoryReservationPlanScope,
  InventoryReservationMutationRequest,
  InventoryReservationMutationResult,
  InventoryReservationReconciliationRequest,
  InventoryReservationReconciliationResult,
  LifecycleRule,
  RecordMetadata,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  PaginatedResult,
  SubmissionBatchResult,
  FollowupActionResult
  ,
  FollowupSubmitEffectSourceLink,
  SubmitEffectGeneratedRecord
} from '../types';
import { debugLog } from './webform/debug';
import { getBackendRuntimeConfig } from './webform/backendConfig';
import type { BackendRuntimeConfigPayload } from './webform/backendConfig';
import { CacheEtagManager, getDocumentProperties } from './webform/cache';
import { DefinitionBuilder } from './webform/definitionBuilder';
import { DataSourceService } from './webform/dataSources';
import { SubmissionService } from './webform/submissions';
import { ListingService } from './webform/listing';
import { FollowupService } from './webform/followup';
import type { GeneratedPdfArtifact } from './webform/followup/actionHandlers';
import { UploadService } from './webform/uploads';
import { AnalyticsService } from './webform/analytics/service';
import { AnalyticsPipelineService } from './webform/analytics/pipelineService';
import {
  buildAnalyticsPipelineJob,
  formatAnalyticsPipelineJobError,
  normalizeAnalyticsPipelineRunRequest,
  parseAnalyticsPipelineQueue,
  resolveAnalyticsPipelineQueuedNotice,
  serializeAnalyticsPipelineQueue,
  validateAnalyticsPipelineRunRequest,
  type AnalyticsPipelineJob
} from './webform/analytics/pipelineQueue';
import {
  DataSourceIdBackfillOptions,
  DataSourceIdBackfillResult,
  DataSourceIdBackfillService
} from './webform/dataSourceIdBackfill';
import { buildReactShellTemplate, buildReactTemplate } from './webform/template';
import { getDriveApiFile, trashDriveApiFile } from './webform/driveApi';
import { loadDedupRules, computeDedupSignature } from './dedup';
import { collectTemplateIdsFromMap, migrateDocTemplatePlaceholdersToIds } from './webform/followup/templateMigration';
import { prefetchMarkdownTemplateIds } from './webform/followup/markdownTemplateCache';
import { prefetchHtmlTemplateIds } from './webform/followup/htmlTemplateCache';
import { prefetchDocTextTemplateIds } from './webform/followup/docTextTemplateCache';
import { hydrateMealProductionPrepIngredientsFromLeftovers } from './webform/followup/mealProductionLeftoverIngredients';
import { ensureRecordIndexSheet } from './webform/recordIndex';
import { getBundledConfigEnv, getBundledFormConfig, listBundledFormConfigs } from './webform/formConfigBundle';
import { getUiEnvTag } from './webform/envTag';
import { ServerTimingRecorder } from './webform/serverTiming';
import {
  isRetryableMutationLockErrorMessage,
  sleepWithUtilities,
  withSharedDocumentLock
} from './webform/documentLock';
import {
  applyUpdateRecordDependencyMutationsToRecord,
  buildRecordVisibilityContext,
  buildRowVisibilityContext,
  buildTemplateVars,
  evaluateUpdateRecordDependencyPreview
  ,
  resolveTemplateValue
} from './webform/updateRecordDependencies';
import { matchesWhenClause } from '../web/rules/visibility';
import { normalizeToIsoDate } from './webform/followup/utils';
import { HeaderColumns } from './webform/types';
import { isSingleIngredientLeftoverKind } from '../domain/leftoverKinds';

const HOME_BOOTSTRAP_CACHE_TTL_SECONDS = 60 * 60 * 6; // CacheService max TTL
const HOME_REV_PROPERTY_PREFIX = 'CK_HOME_REV_';
const HOME_BOOTSTRAP_CHUNK_SIZE = 95 * 1024; // Keep margin under CacheService ~100KB item limit.
const HOME_BOOTSTRAP_MAX_CHUNKS = 24;
const HOME_BOOTSTRAP_CACHE_SCHEMA_VERSION = 'v2';
const HOME_BOOTSTRAP_LIST_MAX_ITEMS = 200;
const FOLLOWUP_LANE_PROPERTY_PREFIX = 'CK_FOLLOWUP_LANE_';
const FOLLOWUP_LANE_OWNER_TTL_MS = 1000 * 60 * 3;
const FOLLOWUP_LANE_WAIT_TIMEOUT_MS = 1000 * 60 * 4;
const FOLLOWUP_LANE_POLL_MS = 250;
const RECORD_MUTATION_LANE_PROPERTY_PREFIX = 'CK_RECORD_MUTATION_LANE_';
const RECORD_MUTATION_LANE_OWNER_TTL_MS = 1000 * 60 * 3;
const RECORD_MUTATION_LANE_WAIT_TIMEOUT_MS = 1000 * 60 * 4;
const RECORD_MUTATION_LANE_POLL_MS = 250;
const ANALYTICS_PIPELINE_QUEUE_PROPERTY_KEY = 'CK_ANALYTICS_PIPELINE_QUEUE';
const ANALYTICS_PIPELINE_TRIGGER_PROPERTY_KEY = 'CK_ANALYTICS_PIPELINE_TRIGGER_ID';
const ANALYTICS_PIPELINE_TRIGGER_HANDLER = 'runQueuedAnalyticsPipelineJobs';
const USER_RECORD_SAVE_RETRY_DELAYS_MS = [0, 900];
const INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS = [0, 500, 1500];
const RESERVATION_FOLLOWUP_RETRY_DELAYS_MS = [0, 750, 2000];
const RESERVATION_TRANSACTION_LOCK_RETRY_DELAYS_MS = [0, 750, 2000];
const FORM_BACKED_OPTIONS_AUTO_PAGE_MAX_PAGES = 8;
const cloneRecordValues = <T extends Record<string, any>>(value: T): T => JSON.parse(JSON.stringify(value || {}));
const toPlainData = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const FOLLOWUP_LINE_ITEM_META_KEYS = new Set(['__ckRowId', '__ckParentRowId', '__ckParentGroupId']);
const IN_MEMORY_BUNDLED_DEFINITION_CACHE = new Map<string, WebFormDefinition>();

type FollowupRuntimeOptions = {
  pdfArtifact?: (Partial<GeneratedPdfArtifact> & { pdfUrl?: string }) | null;
};

const normalizeFollowupRuntimePdfArtifact = (options?: FollowupRuntimeOptions | null): GeneratedPdfArtifact | null => {
  const raw = options?.pdfArtifact;
  if (!raw || typeof raw !== 'object') return null;
  const fileId = (raw.fileId || '').toString().trim();
  const url = ((raw as any).url || raw.pdfUrl || '').toString().trim();
  if (!fileId && !url && !raw.blob) return null;
  return {
    success: raw.success !== false,
    message: raw.message,
    url: url || undefined,
    fileId: fileId || undefined,
    blob: raw.blob
  };
};

type HomeBootstrapCachePayload = {
  rev: number;
  listResponse?: PaginatedResult<Record<string, any>>;
  records?: Record<string, WebFormSubmission>;
  analytics?: AnalyticsSnapshot;
  analyticsRev?: number;
  cachedAt?: string;
};

type HomeBootstrapChunkMeta = {
  rev: number;
  chunks: number;
  cachedAt?: string;
};

type BootstrapContextOptions = {
  includeHomeData?: boolean;
  includeAnalytics?: boolean;
};

type FollowupLaneTicket = {
  token: string;
  sequence: number;
};

type FollowupLaneOwnerState = {
  token: string;
  sequence: number;
  expiresAtMs: number;
  updatedAt?: string;
};

type FollowupLaneState = {
  lastIssuedSeq: number;
  nextSeq: number;
  owner?: FollowupLaneOwnerState;
};

type RecordMutationLaneTicket = {
  token: string;
  sequence: number;
};

type RecordMutationLaneOwnerState = {
  token: string;
  sequence: number;
  expiresAtMs: number;
  updatedAt?: string;
};

type RecordMutationLaneState = {
  lastIssuedSeq: number;
  nextSeq: number;
  owner?: RecordMutationLaneOwnerState;
};

type InventoryReservationFieldIds = {
  quantityFieldId: string;
  reservedQuantityFieldId: string;
  statusFieldId?: string;
  unitFieldId?: string;
};

type InventoryReservationBatchCache = {
  ledgerContext: { form: FormConfig; questions: QuestionConfig[] };
  activeReservationsByResource: Map<string, WebFormSubmission[]>;
  inventoryRecordsByResource: Map<string, WebFormSubmission>;
};

type InternalRecordSaveQueueEntry = {
  context: { form: FormConfig; questions: QuestionConfig[] };
  dedupRules: DedupRule[];
  payloadsById: Map<string, WebFormSubmission>;
};

type InternalRecordSaveQueue = Map<string, InternalRecordSaveQueueEntry>;

export class WebFormService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private _dashboard?: Dashboard;
  private _cacheManager?: CacheEtagManager;
  private _definitionBuilder?: DefinitionBuilder;
  private _dataSources?: DataSourceService;
  private _submissions?: SubmissionService;
  private _listing?: ListingService;
  private _followups?: FollowupService;
  private _uploads?: UploadService;
  private _analytics?: AnalyticsService;
  private _analyticsPipelines?: AnalyticsPipelineService;
  private _docProps?: GoogleAppsScript.Properties.Properties | null;
  private _docPropsResolved: boolean;
  private _cache?: GoogleAppsScript.Cache.Cache | null;
  private _cacheResolved: boolean;
  private _lookupFieldValueCache?: Map<string, Map<string, string>>;
  private _activeRecordMutationLanes: Map<string, number>;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this._docPropsResolved = false;
    this._cacheResolved = false;
    this._lookupFieldValueCache = new Map();
    this._activeRecordMutationLanes = new Map();
  }

  private get dashboard(): Dashboard {
    if (!this._dashboard) {
      this._dashboard = new Dashboard(this.ss);
    }
    return this._dashboard;
  }

  private get docProps(): GoogleAppsScript.Properties.Properties | null {
    if (!this._docPropsResolved) {
      this._docProps = getDocumentProperties();
      this._docPropsResolved = true;
    }
    return this._docProps ?? null;
  }

  private get cacheManager(): CacheEtagManager {
    if (!this._cacheManager) {
      const docProps = this.docProps;
      const cachePrefix = CacheEtagManager.computeCachePrefix(docProps);
      this._cacheManager = new CacheEtagManager(this.resolveCache(), docProps, cachePrefix);
    }
    return this._cacheManager;
  }

  private get uploads(): UploadService {
    if (!this._uploads) {
      this._uploads = new UploadService(this.ss);
    }
    return this._uploads;
  }

  private get definitionBuilder(): DefinitionBuilder {
    if (!this._definitionBuilder) {
      this._definitionBuilder = new DefinitionBuilder(this.ss, this.dashboard);
    }
    return this._definitionBuilder;
  }

  private get dataSources(): DataSourceService {
    if (!this._dataSources) {
      this._dataSources = new DataSourceService(this.ss);
    }
    return this._dataSources;
  }

  private get submissions(): SubmissionService {
    if (!this._submissions) {
      this._submissions = new SubmissionService(this.ss, this.uploads, this.cacheManager, this.docProps);
    }
    return this._submissions;
  }

  private get analytics(): AnalyticsService {
    if (!this._analytics) {
      this._analytics = new AnalyticsService(this.ss, this.submissions);
    }
    return this._analytics;
  }

  private get analyticsPipelines(): AnalyticsPipelineService {
    if (!this._analyticsPipelines) {
      this._analyticsPipelines = new AnalyticsPipelineService(this.ss, this.submissions, this.dataSources);
    }
    return this._analyticsPipelines;
  }

  private get listing(): ListingService {
    if (!this._listing) {
      this._listing = new ListingService(this.submissions, this.cacheManager);
    }
    return this._listing;
  }

  private get followups(): FollowupService {
    if (!this._followups) {
      this._followups = new FollowupService(this.ss, this.submissions, this.dataSources, (formKey: string, recordId: string) =>
        this.fetchSubmissionById(formKey, recordId)
      );
    }
    return this._followups;
  }

  private resolveBundledConfig(formKey?: string): FormConfigExport | null {
    const config = getBundledFormConfig(formKey);
    if (!config || !config.form || !Array.isArray(config.questions)) return null;
    return config;
  }

  private listBundledForms(): FormConfig[] {
    return listBundledFormConfigs()
      .map(cfg => cfg?.form)
      .filter((form): form is FormConfig => !!form);
  }

  private normalizeFormKey(value: any): string {
    return value == null ? '' : value.toString().trim().toLowerCase();
  }

  private resolveCanonicalFormKey(formKey?: string): string {
    const raw = (formKey || '').toString().trim();
    if (!raw) return '';
    try {
      const { form } = this.resolveFormOnly(raw);
      const canonical = (form?.configSheet || form?.title || raw).toString().trim();
      return canonical || raw;
    } catch {
      return raw;
    }
  }

  private parseQueryParamsFromUrl(rawUrl: string): Record<string, string> {
    const source = (rawUrl || '').toString().trim();
    if (!source) return {};
    const queryIndex = source.indexOf('?');
    const query = queryIndex >= 0 ? source.slice(queryIndex + 1) : source;
    const hashIndex = query.indexOf('#');
    const clean = hashIndex >= 0 ? query.slice(0, hashIndex) : query;
    if (!clean) return {};
    const safeDecode = (value: string): string => {
      try {
        return decodeURIComponent(value || '');
      } catch (_) {
        return (value || '').toString();
      }
    };
    return clean.split('&').reduce((acc, chunk) => {
      const token = (chunk || '').toString().trim();
      if (!token) return acc;
      const eq = token.indexOf('=');
      const rawKey = eq >= 0 ? token.slice(0, eq) : token;
      const rawValue = eq >= 0 ? token.slice(eq + 1) : '';
      const key = safeDecode(rawKey || '').trim();
      if (!key) return acc;
      const value = safeDecode(rawValue || '').trim();
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
  }

  private resolveCurrentWebAppUrl(): string {
    try {
      const service = ScriptApp.getService();
      const raw = service && typeof service.getUrl === 'function' ? service.getUrl() : '';
      return (raw || '').toString().trim();
    } catch {
      return '';
    }
  }

  private stripQueryAndHash(rawUrl: string): string {
    const source = (rawUrl || '').toString().trim();
    if (!source) return '';
    const hashIndex = source.indexOf('#');
    const withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    const queryIndex = withoutHash.indexOf('?');
    return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  }

  private encodeQueryParam(value: string): string {
    return encodeURIComponent((value || '').toString()).replace(/%20/g, '+');
  }

  private buildFormTargetUrl(form: FormConfig): string {
    const formKey = (form.configSheet || form.title || '').toString().trim();
    if (!formKey) return '?';
    const params: Record<string, string> = { form: formKey };
    const appUrlParams = this.parseQueryParamsFromUrl((form as any).appUrl || '');
    if (appUrlParams.app) params.app = appUrlParams.app;
    if (appUrlParams.page) params.page = appUrlParams.page;
    const pairs = Object.entries(params).map(([k, v]) => `${this.encodeQueryParam(k)}=${this.encodeQueryParam(v)}`);
    const query = pairs.join('&');
    const currentExecUrl = this.stripQueryAndHash(this.resolveCurrentWebAppUrl());
    if (currentExecUrl) {
      return `${currentExecUrl}?${query}`;
    }
    const appUrlBase = this.stripQueryAndHash((form as any).appUrl || '');
    if (appUrlBase) {
      return `${appUrlBase}?${query}`;
    }
    return `?${query}`;
  }

  private buildFormMatchKeys(form: FormConfig): string[] {
    const keys = [
      form?.configSheet,
      form?.title,
      (form as any)?.formId,
      (form as any)?.appUrl
    ]
      .map(value => this.normalizeFormKey(value))
      .filter(Boolean);
    return Array.from(new Set(keys));
  }

  private mergeBundledForms(sheetForms: FormConfig[], bundledForms: FormConfig[]): FormConfig[] {
    if (!bundledForms.length) return sheetForms;
    if (!sheetForms.length) return bundledForms;

    const bundledByKey = new Map<string, FormConfig>();
    bundledForms.forEach(form => {
      this.buildFormMatchKeys(form).forEach(key => {
        if (!bundledByKey.has(key)) {
          bundledByKey.set(key, form);
        }
      });
    });

    const usedBundled = new Set<FormConfig>();
    const merged = sheetForms.map(form => {
      const match = this.buildFormMatchKeys(form)
        .map(key => bundledByKey.get(key))
        .find(Boolean);
      if (!match) return form;
      usedBundled.add(match);
      return {
        ...form,
        ...match,
        rowIndex: form.rowIndex || match.rowIndex
      };
    });

    bundledForms.forEach(form => {
      if (!usedBundled.has(form)) {
        merged.push(form);
      }
    });

    return merged;
  }

  private filterActiveQuestions(questions: QuestionConfig[]): QuestionConfig[] {
    return (Array.isArray(questions) ? questions : []).filter(q => q && q.status === 'Active');
  }

  private resolveFormOnly(formKey?: string): { form: FormConfig; source: 'bundled' | 'sheet' } {
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled?.form) return { form: bundled.form, source: 'bundled' };
    return { form: this.definitionBuilder.findForm(formKey), source: 'sheet' };
  }

  private resolveBundledFormContext(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } | null {
    const bundled = this.resolveBundledConfig(formKey);
    if (!bundled) return null;
    return { form: bundled.form, questions: this.filterActiveQuestions(bundled.questions) };
  }

  private resolveBundledDefinitionKey(bundled: FormConfigExport): string {
    return (
      bundled.formKey ||
      bundled.form?.configSheet ||
      bundled.form?.title ||
      '__DEFAULT__'
    )
      .toString()
      .trim() || '__DEFAULT__';
  }

  private mergeBundledSteps(formSteps: any, definitionSteps: any): any {
    const formItems: any[] = Array.isArray(formSteps?.items) ? formSteps.items : [];
    const definitionItems: any[] = Array.isArray(definitionSteps?.items) ? definitionSteps.items : [];
    if (!formItems.length) return definitionSteps;
    if (!definitionItems.length) return formSteps;

    const cloneItem = (item: any) => cloneRecordValues(item as Record<string, any>);
    const mergedItems = formItems.map(cloneItem);
    const indexById = new Map<string, number>();
    mergedItems.forEach((item: any, index: number) => {
      const id = (item?.id ?? '').toString().trim();
      if (id) indexById.set(id, index);
    });

    definitionItems.forEach((item: any) => {
      const id = (item?.id ?? '').toString().trim();
      if (!id || indexById.has(id)) return;

      let insertIndex = mergedItems.length;

      for (let i = definitionItems.indexOf(item) + 1; i < definitionItems.length; i += 1) {
        const nextId = (definitionItems[i]?.id ?? '').toString().trim();
        if (!nextId) continue;
        const nextIndex = indexById.get(nextId);
        if (nextIndex !== undefined) {
          insertIndex = nextIndex;
          break;
        }
      }

      if (insertIndex === mergedItems.length) {
        for (let i = definitionItems.indexOf(item) - 1; i >= 0; i -= 1) {
          const previousId = (definitionItems[i]?.id ?? '').toString().trim();
          if (!previousId) continue;
          const previousIndex = indexById.get(previousId);
          if (previousIndex !== undefined) {
            insertIndex = previousIndex + 1;
            break;
          }
        }
      }

      mergedItems.splice(insertIndex, 0, cloneItem(item));
      indexById.clear();
      mergedItems.forEach((entry: any, index: number) => {
        const entryId = (entry?.id ?? '').toString().trim();
        if (entryId) indexById.set(entryId, index);
      });
    });

    return {
      ...cloneRecordValues(definitionSteps as Record<string, any>),
      ...cloneRecordValues(formSteps as Record<string, any>),
      items: mergedItems
    };
  }

  private resolveEmbeddedBundledDefinition(bundled: FormConfigExport): WebFormDefinition | null {
    const raw = bundled?.definition;
    if (!raw || typeof raw !== 'object') return null;
    const hasQuestions = Array.isArray((raw as any).questions) && (raw as any).questions.length > 0;
    if (!hasQuestions) return null;
    const normalized = cloneRecordValues(raw as WebFormDefinition);
    const formTitle = (bundled.form?.title || '').toString().trim();
    const destinationTab = (bundled.form?.destinationTab || '').toString().trim();
    if (formTitle) normalized.title = formTitle;
    if (destinationTab) normalized.destinationTab = destinationTab;
    if (bundled.form?.steps && typeof bundled.form.steps === 'object') {
      normalized.steps = this.mergeBundledSteps(bundled.form.steps, normalized.steps);
    }
    return normalized;
  }

  private buildBundledDefinitionCacheKey(
    bundled: FormConfigExport,
    activeQuestions: QuestionConfig[],
    dedupRules: DedupRule[]
  ): string {
    const cacheFingerprint = (bundled.cacheFingerprint || '').toString().trim();
    const fingerprint =
      cacheFingerprint ||
      this.cacheManager.digestKey(
        JSON.stringify({
          form: bundled.form || {},
          questions: activeQuestions || [],
          dedupRules: dedupRules || [],
          definition: bundled.definition || null
        })
      );
    return this.cacheManager.makeCacheKey('BDEF', [this.resolveBundledDefinitionKey(bundled), fingerprint]);
  }

  private buildBundledDefinition(
    bundled: FormConfigExport,
    serverTiming?: ServerTimingRecorder | null,
    labelPrefix = 'definition.bundle'
  ): WebFormDefinition {
    const activeQuestions =
      serverTiming?.measure(`${labelPrefix}.filterActiveQuestionsMs`, () => this.filterActiveQuestions(bundled.questions || [])) ??
      this.filterActiveQuestions(bundled.questions || []);
    const dedupRules = bundled.dedupRules || [];
    const embedded =
      serverTiming?.measure(`${labelPrefix}.resolveEmbeddedDefinitionMs`, () => this.resolveEmbeddedBundledDefinition(bundled)) ??
      this.resolveEmbeddedBundledDefinition(bundled);
    const cacheFingerprint = (bundled.cacheFingerprint || '').toString().trim();
    if (embedded && cacheFingerprint) {
      debugLog('definition.bundle.embedded.hit', {
        formKey: this.resolveBundledDefinitionKey(bundled),
        questions: embedded.questions?.length || 0
      });
      return embedded;
    }
    if (!activeQuestions.length && embedded) {
      debugLog('definition.bundle.prebuilt.hit', {
        formKey: this.resolveBundledDefinitionKey(bundled),
        questions: embedded.questions?.length || 0
      });
      return embedded;
    }
    const cacheKey =
      serverTiming?.measure(
        `${labelPrefix}.buildCacheKeyMs`,
        () => this.buildBundledDefinitionCacheKey(bundled, activeQuestions, dedupRules)
      ) ?? this.buildBundledDefinitionCacheKey(bundled, activeQuestions, dedupRules);
    const useInMemoryCache = !!cacheFingerprint;
    if (useInMemoryCache) {
      const memoized = IN_MEMORY_BUNDLED_DEFINITION_CACHE.get(cacheKey);
      if (memoized) {
        debugLog('definition.bundle.memo.hit', {
          formKey: this.resolveBundledDefinitionKey(bundled),
          questions: memoized.questions?.length || 0
        });
        return memoized;
      }
    }
    const startedAt = Date.now();
    try {
      const cached =
        serverTiming?.measure(`${labelPrefix}.cacheReadMs`, () => this.cacheManager.cacheGet<WebFormDefinition>(cacheKey)) ??
        this.cacheManager.cacheGet<WebFormDefinition>(cacheKey);
      if (cached) {
        if (useInMemoryCache) {
          IN_MEMORY_BUNDLED_DEFINITION_CACHE.set(cacheKey, cached);
        }
        debugLog('definition.bundle.cache.hit', {
          formKey: this.resolveBundledDefinitionKey(bundled),
          questions: cached.questions?.length || 0,
          elapsedMs: Date.now() - startedAt
        });
        return cached;
      }
    } catch {
      // Ignore cache read failures and rebuild below.
    }

    const definition =
      serverTiming?.measure(
        `${labelPrefix}.buildDefinitionFromConfigMs`,
        () => this.definitionBuilder.buildDefinitionFromConfig(bundled.form, activeQuestions, dedupRules)
      ) ?? this.definitionBuilder.buildDefinitionFromConfig(bundled.form, activeQuestions, dedupRules);
    if (embedded?.steps && typeof embedded.steps === 'object') {
      definition.steps =
        serverTiming?.measure(
          `${labelPrefix}.mergeBundledStepsMs`,
          () => this.mergeBundledSteps(definition.steps, embedded.steps)
        ) ?? this.mergeBundledSteps(definition.steps, embedded.steps);
    }
    if (useInMemoryCache) {
      IN_MEMORY_BUNDLED_DEFINITION_CACHE.set(cacheKey, definition);
    }
    try {
      if (serverTiming) {
        serverTiming.measure(`${labelPrefix}.cacheWriteMs`, () => this.cacheManager.cachePut(cacheKey, definition, 60 * 60 * 24));
      } else {
        this.cacheManager.cachePut(cacheKey, definition, 60 * 60 * 24);
      }
      debugLog('definition.bundle.cache.miss', {
        formKey: this.resolveBundledDefinitionKey(bundled),
        questions: definition.questions?.length || 0,
        elapsedMs: Date.now() - startedAt
      });
    } catch {
      // Ignore cache write failures; definition is still valid for this request.
    }
    return definition;
  }

  private resolveDedupRules(formKey?: string, form?: FormConfig): DedupRule[] {
    const bundled = this.resolveBundledConfig(formKey || form?.configSheet || form?.title);
    if (bundled && Array.isArray(bundled.dedupRules)) return bundled.dedupRules;
    const resolvedForm = form || this.definitionBuilder.findForm(formKey);
    return loadDedupRules(this.ss, resolvedForm.configSheet);
  }

  public buildDefinition(formKey?: string): WebFormDefinition {
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled) {
      const def = this.buildBundledDefinition(bundled);
      debugLog('definition.bundle.built', {
        requestedKey: formKey || null,
        formKey: bundled.formKey || null,
        questions: def.questions?.length || 0
      });
      return def;
    }
    const def = this.definitionBuilder.buildDefinition(formKey);
    debugLog('buildDefinition.formSelected', { requestedKey: formKey, formTitle: def.title });
    return def;
  }

  private getSheetFormsCached(): FormConfig[] {
    const formsCacheKey = this.cacheManager.makeCacheKey('FORMS', ['ALL']);
    const startedAt = Date.now();
    try {
      const cached = this.cacheManager.cacheGet<FormConfig[]>(formsCacheKey);
      if (cached && Array.isArray(cached)) {
        debugLog('forms.cache.hit', { count: cached.length, elapsedMs: Date.now() - startedAt });
        return cached;
      }
    } catch (_) {
      // Ignore cache read failures; fall back to reading the dashboard sheet.
    }

    const forms = this.dashboard.getForms();
    try {
      // Forms dashboard typically changes infrequently; 1 hour TTL is a good balance.
      this.cacheManager.cachePut(formsCacheKey, forms, 60 * 60);
      debugLog('forms.cache.miss', { count: forms.length, elapsedMs: Date.now() - startedAt });
    } catch (_) {
      // Ignore cache write failures; forms list is still valid for this request.
    }
    return forms;
  }

  private getFormsCached(): FormConfig[] {
    const bundledForms = this.listBundledForms();
    const sheetForms = this.getSheetFormsCached();
    if (!bundledForms.length) return sheetForms;
    const merged = this.mergeBundledForms(sheetForms, bundledForms);
    debugLog('forms.bundle.merge', {
      bundled: bundledForms.length,
      sheet: sheetForms.length,
      merged: merged.length
    });
    return merged;
  }

  private getOrBuildDefinition(formKey?: string): WebFormDefinition {
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled) {
      const def = this.buildBundledDefinition(bundled);
      debugLog('definition.bundle.built', {
        requestedKey: formKey || null,
        formKey: bundled.formKey || null,
        questions: def.questions?.length || 0
      });
      return def;
    }
    const keyBase = (formKey || '').toString().trim() || '__DEFAULT__';
    const formCacheKey = this.cacheManager.makeCacheKey('DEF', [keyBase]);
    const startedAt = Date.now();

    try {
      const cached = this.cacheManager.cacheGet<WebFormDefinition>(formCacheKey);
      if (cached) {
        debugLog('definition.cache.hit', { formKey: keyBase, elapsedMs: Date.now() - startedAt });
        return cached;
      }
    } catch (_) {
      // Ignore cache read failures; fall back to building the definition.
    }

    const def = this.buildDefinition(formKey);
    try {
      this.cacheManager.cachePut(formCacheKey, def, 60 * 60 * 24); // 24h TTL; versioning handled by CacheEtagManager.
      debugLog('definition.cache.miss', {
        formKey: keyBase,
        title: def.title,
        questionCount: def.questions?.length || 0,
        elapsedMs: Date.now() - startedAt
      });
    } catch (_) {
      // Ignore cache write failures; definition is still valid for this request.
    }
    return def;
  }

  public fetchBootstrapContext(
    formKey?: string,
    options?: BootstrapContextOptions
  ): {
    definition: WebFormDefinition;
    formKey: string;
    listResponse?: PaginatedResult<Record<string, any>>;
    records?: Record<string, WebFormSubmission>;
    analytics?: AnalyticsSnapshot;
    analyticsRev?: number;
    homeRev?: number;
    configSource?: string;
    configEnv?: string;
    envTag?: string;
    backend?: BackendRuntimeConfigPayload | null;
  } {
    const includeHomeData = options?.includeHomeData === true;
    const includeAnalytics = options?.includeAnalytics === true;
    const startedAt = Date.now();
    const configEnv = getBundledConfigEnv() || undefined;
    const envTag = getUiEnvTag() || undefined;
    const backend = getBackendRuntimeConfig();
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled) {
      const def = this.buildBundledDefinition(bundled);
      const resolvedKey =
        (formKey || '').toString().trim() ||
        bundled.formKey ||
        bundled.form?.configSheet ||
        bundled.form?.title ||
        '__DEFAULT__';
      debugLog('definition.fetch', {
        formKey: resolvedKey,
        questions: def.questions?.length || 0,
        source: 'bundled',
        includeHomeData,
        includeAnalytics,
        configEnv: configEnv || null,
        envTag: envTag || null
      });
      const bootstrap = includeHomeData || includeAnalytics ? this.buildBootstrap(resolvedKey, def, { includeHomeData, includeAnalytics }) : null;
      const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
      const rev = this.readHomeRevision(canonicalKey);
      if ((bootstrap as any)?.listResponse) {
        this.cacheHomeBootstrap(canonicalKey, rev, bootstrap || null, 'fetchBootstrapContext.bundled');
      }
      debugLog('bootstrap.context.ready', {
        formKey: resolvedKey,
        source: 'bundled',
        includeHomeData,
        includeAnalytics,
        elapsedMs: Date.now() - startedAt
      });
      return {
        definition: def,
        formKey: resolvedKey,
        configSource: 'bundled',
        configEnv,
        envTag,
        backend,
        homeRev: rev,
        listResponse: (bootstrap as any)?.listResponse,
        records: (bootstrap as any)?.records,
        analytics: (bootstrap as any)?.analytics,
        analyticsRev: Number((bootstrap as any)?.analyticsRev || 0) || 0
      };
    }
    const def = this.getOrBuildDefinition(formKey);
    const resolvedKey = (formKey || '').toString().trim() || def.title || '__DEFAULT__';
    debugLog('definition.fetch', {
      formKey: resolvedKey,
      questions: def.questions?.length || 0,
      source: 'sheet',
      includeHomeData,
      includeAnalytics,
      configEnv: configEnv || null,
      envTag: envTag || null
    });
    const bootstrap = includeHomeData || includeAnalytics ? this.buildBootstrap(resolvedKey, def, { includeHomeData, includeAnalytics }) : null;
    const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
    const rev = this.readHomeRevision(canonicalKey);
    if ((bootstrap as any)?.listResponse) {
      this.cacheHomeBootstrap(canonicalKey, rev, bootstrap || null, 'fetchBootstrapContext.sheet');
    }
    debugLog('bootstrap.context.ready', {
      formKey: resolvedKey,
      source: 'sheet',
      includeHomeData,
      includeAnalytics,
      elapsedMs: Date.now() - startedAt
    });
    return {
      definition: def,
      formKey: resolvedKey,
      configSource: 'sheet',
      configEnv,
      envTag,
      backend,
      homeRev: rev,
      listResponse: (bootstrap as any)?.listResponse,
      records: (bootstrap as any)?.records,
      analytics: (bootstrap as any)?.analytics,
      analyticsRev: Number((bootstrap as any)?.analyticsRev || 0) || 0
    };
  }

  public fetchHomeBootstrap(
    formKey: string,
    clientRev?: number
  ): {
    notModified: boolean;
    rev: number;
    listResponse?: PaginatedResult<Record<string, any>>;
    records?: Record<string, WebFormSubmission>;
    analytics?: AnalyticsSnapshot;
    analyticsRev?: number;
    cache?: 'hit' | 'miss';
  } {
    const canonicalKey = this.resolveCanonicalFormKey(formKey) || (formKey || '').toString().trim();
    const rev = this.readHomeRevision(canonicalKey);
    const hasClientRev = clientRev !== null && clientRev !== undefined && `${clientRev}`.trim() !== '';
    const parsedClientRev = hasClientRev ? Number(clientRev) : NaN;
    if (hasClientRev && Number.isFinite(parsedClientRev) && parsedClientRev === rev) {
      return { notModified: true, rev, cache: 'hit' };
    }

    const bundled = this.resolveBundledConfig(canonicalKey || formKey);
    const def = bundled ? this.buildBundledDefinition(bundled) : this.getOrBuildDefinition(canonicalKey || formKey);
    const expectsHomeList = Boolean(def?.listView?.columns?.length);
    const expectsAnalytics = Boolean(def?.analytics?.widgets?.length);
    const cached = this.readCachedHomeBootstrap(canonicalKey, rev);
    const cachedHasExpectedHomeList = !expectsHomeList || Boolean(cached?.listResponse);
    const cachedHasExpectedAnalytics = !expectsAnalytics || Boolean(cached?.analytics);
    if (cached && cachedHasExpectedHomeList && cachedHasExpectedAnalytics) {
      return {
        notModified: false,
        rev,
        listResponse: cached.listResponse,
        records: cached.records || {},
        analytics: cached.analytics,
        analyticsRev: Number(cached.analyticsRev || cached.analytics?.revision || 0) || 0,
        cache: 'hit'
      };
    }

    const bootstrap = this.buildBootstrap(canonicalKey || formKey, def, { includeHomeData: true, includeAnalytics: true });
    this.cacheHomeBootstrap(canonicalKey || formKey, rev, bootstrap || null, 'fetchHomeBootstrap.cacheMiss');
    return toPlainData({
      notModified: false,
      rev,
      listResponse: (bootstrap as any)?.listResponse,
      records: (bootstrap as any)?.records || {},
      analytics: (bootstrap as any)?.analytics,
      analyticsRev: Number((bootstrap as any)?.analyticsRev || (bootstrap as any)?.analytics?.revision || 0) || 0,
      cache: 'miss'
    });
  }

  public fetchFormConfig(formKey?: string): FormConfigExport {
    const startedAt = Date.now();
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled) {
      const def = this.buildBundledDefinition(bundled);
      const resolvedKey =
        (formKey || '').toString().trim() ||
        bundled.formKey ||
        bundled.form?.configSheet ||
        bundled.form?.title ||
        '__DEFAULT__';
      const activeQuestions = this.filterActiveQuestions(bundled.questions || []);
      debugLog('config.export.ready', {
        formKey: resolvedKey,
        questions: bundled.questions?.length || 0,
        activeQuestions: activeQuestions.length,
        dedupRules: bundled.dedupRules?.length || 0,
        validationErrors: bundled.validationErrors?.length || 0,
        source: 'bundled',
        elapsedMs: Date.now() - startedAt
      });
      return {
        ...bundled,
        definition: def
      };
    }
    const form = this.definitionBuilder.findForm(formKey);
    const resolvedKey = (formKey || '').toString().trim() || form.configSheet || form.title || '__DEFAULT__';
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet);
    const activeQuestions = questions.filter(q => q.status === 'Active');
    const dedupRules = loadDedupRules(this.ss, form.configSheet);
    const validationErrors = ConfigValidator.validate(activeQuestions, form.configSheet);
    const definition = this.definitionBuilder.buildDefinition(form.configSheet || form.title);
    debugLog('config.export.ready', {
      formKey: resolvedKey,
      questions: questions.length,
      activeQuestions: activeQuestions.length,
      dedupRules: dedupRules.length,
      validationErrors: validationErrors.length,
      source: 'sheet',
      elapsedMs: Date.now() - startedAt
    });
    return {
      formKey: resolvedKey,
      generatedAt: new Date().toISOString(),
      form,
      questions,
      dedupRules,
      definition,
      validationErrors
    };
  }

  public fetchFormCatalog(): Array<{ formKey: string; title: string; description?: string; targetUrl: string; logoUrl?: string }> {
    const forms = this.getFormsCached();
    const items = forms
      .map(form => {
        const formKey = (form.configSheet || form.title || '').toString().trim();
        if (!formKey) return null;
        const title = (form.title || formKey).toString().trim() || formKey;
        const description = (form.description || '').toString().trim() || undefined;
        return {
          formKey,
          title,
          description,
          targetUrl: this.buildFormTargetUrl(form),
          logoUrl: (form.appHeader?.logoUrl || '').toString().trim() || undefined
        };
      })
      .filter(Boolean) as Array<{ formKey: string; title: string; description?: string; targetUrl: string; logoUrl?: string }>;
    items.sort((a, b) => a.title.localeCompare(b.title));
    return items;
  }

  public fetchAnalyticsDashboard(): AnalyticsDashboardPayload {
    const errors: string[] = [];
    const forms = this.getFormsCached();
    const resolveDisplayText = (value: any, fallback = ''): string => {
      if (value === undefined || value === null) return fallback;
      if (typeof value === 'string') return value.trim() || fallback;
      if (typeof value !== 'object') return `${value ?? ''}`.trim() || fallback;
      const preferred = [(value as any).en, (value as any).EN, (value as any).fr, (value as any).FR, (value as any).nl, (value as any).NL]
        .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
        .find(Boolean);
      return preferred || fallback;
    };
    const snapshotByFormKey = new Map<
      string,
      {
        title: string;
        snapshot: AnalyticsSnapshot;
      }
    >();

    const loadSnapshot = (rawFormKey: string): { title: string; snapshot: AnalyticsSnapshot } | null => {
      const requestedKey = (rawFormKey || '').toString().trim();
      if (!requestedKey) return null;
      const existing = snapshotByFormKey.get(requestedKey);
      if (existing) return existing;

      const match = forms.find(form => {
        const candidateKey = (form.configSheet || form.title || '').toString().trim();
        const candidateTitle = (form.title || '').toString().trim();
        return candidateKey === requestedKey || candidateTitle === requestedKey;
      });

      if (!match) {
        errors.push(`Unknown analytics source form: ${requestedKey}`);
        return null;
      }

      let snapshot = this.analytics.readSnapshot(match);
      if (!snapshot.revision) {
        const definition = this.getOrBuildDefinition(match.configSheet || match.title);
        if (definition.analytics?.widgets?.length) {
          const { questions } = this.getFormContextLite(match.configSheet || match.title);
          snapshot = this.analytics.recomputeForm(match, questions, definition);
        }
      }

      const resolved = {
        title: (match.title || match.configSheet || requestedKey).toString().trim() || requestedKey,
        snapshot
      };
      snapshotByFormKey.set(requestedKey, resolved);
      return resolved;
    };

    const sections: AnalyticsDashboardSection[] = (Array.isArray(ANALYTICS_PAGE_CONFIG.sections) ? ANALYTICS_PAGE_CONFIG.sections : [])
      .map(section => {
        const widgets: AnalyticsDashboardWidget[] = (Array.isArray(section.widgets) ? section.widgets : [])
          .map(widget => {
            const source = loadSnapshot(widget.sourceFormKey);
            if (!source) return null;
            const item = (Array.isArray(source.snapshot.items) ? source.snapshot.items : []).find(
              entry => (entry?.id || '').toString().trim() === widget.sourceWidgetId
            );
            if (!item) {
              errors.push(`Missing analytics widget "${widget.sourceWidgetId}" on ${widget.sourceFormKey}`);
              return null;
            }
            return {
              ...item,
              dashboardWidgetId: widget.id,
              title: resolveDisplayText(widget.title, resolveDisplayText(item.label, item.id)),
              description: resolveDisplayText(widget.description) || undefined,
              sourceFormKey: widget.sourceFormKey,
              sourceFormTitle: source.title,
              sourceWidgetId: widget.sourceWidgetId
            } satisfies AnalyticsDashboardWidget;
          })
          .filter(Boolean) as AnalyticsDashboardWidget[];

        return {
          id: section.id,
          title: section.title,
          description: section.description,
          widgets
        } satisfies AnalyticsDashboardSection;
      })
      .filter(section => section.widgets.length > 0);
    const pipelines = this.analyticsPipelines.buildDashboardPipelines(forms);

    return {
      pageTitle: ANALYTICS_PAGE_CONFIG.pageTitle,
      pageDescription: ANALYTICS_PAGE_CONFIG.pageDescription,
      sections,
      pipelines,
      updatedAt: resolveAnalyticsPageUpdatedAt(sections),
      errors,
      envTag: getUiEnvTag() || undefined
    };
  }

  public queueAnalyticsPipelineRun(request: QueueAnalyticsPipelineRequest): QueueAnalyticsPipelineResult {
    const normalized = normalizeAnalyticsPipelineRunRequest(request);
    const todayIso = this.scriptTodayIso();
    const validationMessage = validateAnalyticsPipelineRunRequest(normalized, todayIso);
    if (validationMessage) return { success: false, message: validationMessage };

    const context = this.getAnalyticsPipelineContext(normalized.ownerFormKey, normalized.pipelineId);
    if (!context) {
      return { success: false, message: `Unknown analytics pipeline: ${normalized.ownerFormKey} / ${normalized.pipelineId}` };
    }

    const notice = resolveAnalyticsPipelineQueuedNotice(context.pipeline);

    try {
      this.withScriptLock('analyticsPipelineQueue', 30_000, () => {
        const props = this.scriptProperties();
        if (!props) {
          throw new Error('PropertiesService is not available.');
        }
        const queue = this.readAnalyticsPipelineQueue(props);
        queue.push(
          buildAnalyticsPipelineJob({
            id: Utilities.getUuid(),
            request: normalized,
            queuedAt: new Date().toISOString()
          })
        );
        props.setProperty(ANALYTICS_PIPELINE_QUEUE_PROPERTY_KEY, serializeAnalyticsPipelineQueue(queue));
        this.ensureAnalyticsPipelineTriggerScheduled(props);
      });
    } catch (err: any) {
      const message = (err?.message || err?.toString?.() || 'Failed to queue analytics pipeline.').toString();
      debugLog('analytics.pipeline.queue.failed', {
        ownerFormKey: normalized.ownerFormKey,
        pipelineId: normalized.pipelineId,
        startDate: normalized.startDate,
        message
      });
      return { success: false, message };
    }

    debugLog('analytics.pipeline.queued', {
      ownerFormKey: normalized.ownerFormKey,
      pipelineId: normalized.pipelineId,
      startDate: normalized.startDate
    });
    return { success: true, message: notice };
  }

  public runQueuedAnalyticsPipelineJobs(): { success: boolean; processed: number; errors: string[] } {
    let jobs: AnalyticsPipelineJob[] = [];
    let triggerId = '';
    try {
      this.withScriptLock('analyticsPipelineQueue.consume', 30_000, () => {
        const props = this.scriptProperties();
        if (!props) return;
        jobs = this.readAnalyticsPipelineQueue(props);
        triggerId = (props.getProperty(ANALYTICS_PIPELINE_TRIGGER_PROPERTY_KEY) || '').toString().trim();
        props.deleteProperty(ANALYTICS_PIPELINE_QUEUE_PROPERTY_KEY);
        props.deleteProperty(ANALYTICS_PIPELINE_TRIGGER_PROPERTY_KEY);
      });
    } catch (err) {
      return {
        success: false,
        processed: 0,
        errors: [(err as any)?.message || (err as any)?.toString?.() || 'Failed to load queued analytics jobs.']
      };
    }

    this.deleteAnalyticsPipelineTriggers(triggerId);

    const errors: string[] = [];
    let processed = 0;
    jobs.forEach(job => {
      try {
        const context = this.getAnalyticsPipelineContext(job.ownerFormKey, job.pipelineId);
        if (!context) {
          throw new Error(`Unknown analytics pipeline: ${job.ownerFormKey} / ${job.pipelineId}`);
        }
        const result = this.analyticsPipelines.runPipeline({
          ownerForm: context.ownerForm,
          sourceForm: context.sourceForm,
          sourceQuestions: context.sourceQuestions,
          pipeline: context.pipeline,
          startDate: job.startDate
        });
        if (!result.success) {
          throw new Error(result.message || 'Analytics pipeline execution failed.');
        }
        processed += 1;
      } catch (err: any) {
        const message = (err?.message || err?.toString?.() || 'Unknown analytics pipeline error').toString();
        errors.push(formatAnalyticsPipelineJobError(job, message));
        debugLog('analytics.pipeline.run.failed', {
          ownerFormKey: job.ownerFormKey,
          pipelineId: job.pipelineId,
          startDate: job.startDate,
          message
        });
      }
    });

    debugLog('analytics.pipeline.queue.processed', {
      queued: jobs.length,
      processed,
      errorCount: errors.length
    });

    return {
      success: errors.length === 0,
      processed,
      errors
    };
  }

  public renderForm(
    formKey?: string,
    params?: Record<string, any>,
    serverTiming?: ServerTimingRecorder | null
  ): GoogleAppsScript.HTML.HtmlOutput {
    const targetKey = (formKey || '').toString().trim();
    const bundleTarget = ((params as any)?.app ?? (params as any)?.page ?? '').toString().trim();
    const serverListBootstrapEnabled = serverTiming?.measure('renderForm.resolveServerListBootstrapMs', () => {
      const raw = ((params as any)?.serverListBootstrap ?? (params as any)?.bootstrapList ?? '').toString().trim().toLowerCase();
      if (!raw) return false;
      return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    }) ?? (() => {
      const raw = ((params as any)?.serverListBootstrap ?? (params as any)?.bootstrapList ?? '').toString().trim().toLowerCase();
      if (!raw) return false;
      return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    })();
    const requestParams = serverTiming?.measure('renderForm.normalizeRequestParamsMs', () => {
      if (!params || typeof params !== 'object') return {} as Record<string, string>;
      const out: Record<string, string> = {};
      Object.keys(params).forEach(key => {
        if (!key) return;
        const raw = (params as any)[key];
        if (raw === undefined || raw === null) return;
        const value = raw.toString();
        if (!value) return;
        out[key] = value;
      });
      return out;
    }) ?? (() => {
      if (!params || typeof params !== 'object') return {} as Record<string, string>;
      const out: Record<string, string> = {};
      Object.keys(params).forEach(key => {
        if (!key) return;
        const raw = (params as any)[key];
        if (raw === undefined || raw === null) return;
        const value = raw.toString();
        if (!value) return;
        out[key] = value;
      });
      return out;
    })();
    const bundled = targetKey
      ? serverTiming?.measure('renderForm.resolveBundledConfigMs', () => this.resolveBundledConfig(targetKey))
        ?? this.resolveBundledConfig(targetKey)
      : null;
    const configEnv =
      serverTiming?.measure('renderForm.resolveBundledConfigEnvMs', () => getBundledConfigEnv() || undefined) ??
      (getBundledConfigEnv() || undefined);
    const envTag =
      serverTiming?.measure('renderForm.resolveUiEnvTagMs', () => getUiEnvTag() || undefined) ??
      (getUiEnvTag() || undefined);
    const backendConfig = serverTiming
      ? serverTiming.measure('renderForm.resolveBackendConfigMs', () => getBackendRuntimeConfig())
      : getBackendRuntimeConfig();

    const mode = bundled ? 'react-embedded' : 'react-shell';
    debugLog('renderForm.start', {
      requestedKey: targetKey || '__DEFAULT__',
      mode,
      bundleTarget: bundleTarget || 'full',
      serverListBootstrapEnabled
    });

    const html = (() => {
      if (!bundled) {
        const normalizedBundleTarget = (bundleTarget || '').toString().trim().toLowerCase();
        const shellBootstrap = serverTiming?.measure('renderForm.buildShellBootstrapMs', () => {
          const bootstrap = { configSource: 'shell', configEnv, envTag, ...(backendConfig ? { backend: backendConfig } : {}) } as any;
          if (normalizedBundleTarget === 'landing') {
            bootstrap.configSource = 'catalog';
            bootstrap.formCatalog = this.fetchFormCatalog();
          } else if (normalizedBundleTarget === 'analytics' || normalizedBundleTarget === 'reports') {
            bootstrap.configSource = 'analyticsDashboard';
            bootstrap.analyticsDashboard = this.fetchAnalyticsDashboard();
          }
          return bootstrap;
        }) ?? (() => {
          const bootstrap = { configSource: 'shell', configEnv, envTag, ...(backendConfig ? { backend: backendConfig } : {}) } as any;
          if (normalizedBundleTarget === 'landing') {
            bootstrap.configSource = 'catalog';
            bootstrap.formCatalog = this.fetchFormCatalog();
          } else if (normalizedBundleTarget === 'analytics' || normalizedBundleTarget === 'reports') {
            bootstrap.configSource = 'analyticsDashboard';
            bootstrap.analyticsDashboard = this.fetchAnalyticsDashboard();
          }
          return bootstrap;
        })();
        return serverTiming?.measure('renderForm.buildShellHtmlMs', () =>
          buildReactShellTemplate(targetKey, bundleTarget, requestParams, serverTiming, shellBootstrap)
        ) ?? buildReactShellTemplate(targetKey, bundleTarget, requestParams, serverTiming, shellBootstrap);
      }
      const def =
        serverTiming?.measure(
          'renderForm.buildBundledDefinitionMs',
          () => this.buildBundledDefinition(bundled, serverTiming, 'renderForm.definition')
        ) ?? this.buildBundledDefinition(bundled, serverTiming, 'renderForm.definition');
      const resolvedKey =
        targetKey ||
        bundled.formKey ||
        bundled.form?.configSheet ||
        bundled.form?.title ||
        '__DEFAULT__';
      const canonicalKey =
        serverTiming?.measure('renderForm.resolveCanonicalFormKeyMs', () => this.resolveCanonicalFormKey(resolvedKey)) ||
        resolvedKey;
      const homeRev = serverTiming?.measure('renderForm.readHomeRevisionMs', () => this.readHomeRevision(canonicalKey))
        ?? this.readHomeRevision(canonicalKey);
      const bootstrapPayload = {
        configSource: 'bundled',
        configEnv,
        envTag,
        homeRev,
        ...(backendConfig ? { backend: backendConfig } : {})
      } as any;

      if (serverListBootstrapEnabled) {
        const bootstrap =
          serverTiming?.measure(
            'renderForm.buildBootstrapMs',
            () =>
              this.buildBootstrap(
                resolvedKey,
                def,
                { includeHomeData: true, includeAnalytics: true },
                serverTiming,
                'renderForm.bootstrap'
              )
          ) ??
          this.buildBootstrap(
            resolvedKey,
            def,
            { includeHomeData: true, includeAnalytics: true },
            serverTiming,
            'renderForm.bootstrap'
          );
        if (bootstrap?.listResponse || bootstrap?.analytics) {
          if (bootstrap.listResponse) {
            bootstrapPayload.listResponse = bootstrap.listResponse;
            bootstrapPayload.records = bootstrap.records || {};
          }
          if (bootstrap.analytics) {
            bootstrapPayload.analytics = bootstrap.analytics;
            bootstrapPayload.analyticsRev = Number((bootstrap as any).analyticsRev || bootstrap.analytics.revision || 0) || 0;
          }
          if (serverTiming) {
            serverTiming.measure(
              'renderForm.cacheHomeBootstrapMs',
              () => this.cacheHomeBootstrap(canonicalKey, homeRev, bootstrap, 'renderForm.serverListBootstrapEnabled')
            );
          } else {
            this.cacheHomeBootstrap(canonicalKey, homeRev, bootstrap, 'renderForm.serverListBootstrapEnabled');
          }
          debugLog('renderForm.bootstrap.embedded', {
            formKey: resolvedKey,
            items: (bootstrap.listResponse?.items || []).length,
            totalCount: (bootstrap.listResponse as any)?.totalCount || 0,
            analyticsRev: Number((bootstrap as any)?.analyticsRev || bootstrap.analytics?.revision || 0) || 0
          });
        } else {
          debugLog('renderForm.bootstrap.embedded.skip', {
            formKey: resolvedKey,
            reason: 'empty'
          });
        }
      } else {
        debugLog('renderForm.bootstrap.embedded.skip', {
          formKey: resolvedKey,
          reason: 'disabled'
        });
      }
      return serverTiming?.measure(
        'renderForm.buildEmbeddedHtmlMs',
        () => buildReactTemplate(def, resolvedKey, bootstrapPayload, bundleTarget, requestParams, serverTiming)
      ) ?? buildReactTemplate(def, resolvedKey, bootstrapPayload, bundleTarget, requestParams, serverTiming);
    })();

    debugLog('renderForm.htmlBuilt', {
      formKey: targetKey || '__DEFAULT__',
      bundleTarget: bundleTarget || 'full',
      htmlLength: html.length,
      hasInitCall: html.includes('init();'),
      scriptCloseCount: (html.match(/<\/script/gi) || []).length
    });
    const output = serverTiming?.measure('renderForm.createHtmlOutputMs', () => HtmlService.createHtmlOutput(html))
      ?? HtmlService.createHtmlOutput(html);
    output.setTitle(targetKey || 'Community Kitchen');
    return output;
  }

  public runDailyAnalyticsRecompute(): { success: boolean; updatedForms: number; errors: string[] } {
    const forms = this.getFormsCached();
    const errors: string[] = [];
    let updatedForms = 0;
    forms.forEach(form => {
      const formKey = (form.configSheet || form.title || '').toString().trim();
      if (!formKey) return;
      try {
        const { questions } = this.getFormContextLite(formKey);
        const definition = this.getOrBuildDefinition(formKey);
        if (definition.analytics?.widgets?.length) {
          this.analytics.recomputeForm(form, questions, definition);
        }
        const canonicalKey = (form.configSheet || form.title || formKey).toString().trim();
        const rev = this.bumpHomeRevision(canonicalKey, 'runDailyAnalyticsRecompute');
        this.primeHomeBootstrapCache(canonicalKey, rev, 'runDailyAnalyticsRecompute');
        updatedForms += 1;
      } catch (err: any) {
        const message = (err?.message || err?.toString?.() || 'Unknown analytics recompute error').toString();
        errors.push(`${formKey}: ${message}`);
      }
    });
    debugLog('analytics.daily.recompute', {
      forms: forms.length,
      updatedForms,
      errorCount: errors.length
    });
    return {
      success: errors.length === 0,
      updatedForms,
      errors
    };
  }

  private scriptTodayIso(): string {
    const now = new Date();
    try {
      if (typeof Utilities !== 'undefined' && Utilities?.formatDate && typeof Session !== 'undefined' && Session?.getScriptTimeZone) {
        return Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    } catch {
      // ignore
    }
    return normalizeToIsoDate(now) || now.toISOString().slice(0, 10);
  }

  private shiftIsoDate(iso: string, dayOffset: number): string {
    const match = (iso || '').toString().trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return iso;
    const next = new Date(year, month - 1, day);
    next.setDate(next.getDate() + dayOffset);
    return normalizeToIsoDate(next) || iso;
  }

  private resolveLifecycleStatusColumn(form: FormConfig, rule: LifecycleRule, columns: HeaderColumns): number | undefined {
    const explicitFieldId = `${'statusFieldId' in rule ? rule.statusFieldId || '' : ''}`.trim();
    if (explicitFieldId && columns.fields?.[explicitFieldId]) {
      return Number(columns.fields[explicitFieldId]) || undefined;
    }
    const followupFieldId = (form.followupConfig?.statusFieldId || '').toString().trim();
    if (followupFieldId && columns.fields?.[followupFieldId]) {
      return Number(columns.fields[followupFieldId]) || undefined;
    }
    return Number(columns.status) || undefined;
  }

  private shouldApplyLifecycleRule(
    rule: LifecycleRule,
    currentStatus: any,
    rawDateValue: any,
    todayIso: string
  ): boolean {
    const fromStatusesRaw = 'fromStatuses' in rule ? rule.fromStatuses : undefined;
    const status = (currentStatus === undefined || currentStatus === null ? '' : currentStatus.toString().trim()).toLowerCase();
    const fromStatuses = Array.isArray(fromStatusesRaw)
      ? fromStatusesRaw.map((value: any) => (value || '').toString().trim().toLowerCase()).filter(Boolean)
      : [];
    if (fromStatuses.length && !fromStatuses.includes(status)) return false;
    const dateIso = normalizeToIsoDate(rawDateValue);
    if (!dateIso) return false;
    const dayOffsetRaw = 'dayOffset' in rule ? rule.dayOffset : 0;
    const offsetDays = Number.isFinite(Number(dayOffsetRaw || 0)) ? Math.trunc(Number(dayOffsetRaw || 0)) : 0;
    const compareIso = offsetDays ? this.shiftIsoDate(todayIso, offsetDays) : todayIso;
    if (!compareIso) return false;
    if (('compare' in rule ? rule.compare : 'beforeToday') === 'onOrBeforeToday') {
      return dateIso <= compareIso;
    }
    return dateIso < compareIso;
  }

  private getActiveLifecycleReservationsForForm(
    formKey: string,
    ledgerKey: string,
    cache: Map<string, WebFormSubmission[]>
  ): WebFormSubmission[] {
    if (cache.has(ledgerKey)) {
      return cache.get(ledgerKey) || [];
    }
    const ledgerContext = this.getFormContextLite(ledgerKey);
    const rows = this.fetchAllSubmissionRecords(ledgerContext.form, ledgerContext.questions).filter(record =>
      this.isActiveReservationRecord(record) &&
      this.readRecordFieldString(record, 'SOURCE_FORM_KEY') === formKey
    );
    cache.set(ledgerKey, rows);
    return rows;
  }

  private releaseLifecycleReservationsForSource(args: {
    formKey: string;
    sourceRecordId: string;
    ledgerKey: string;
    releasedSourceRecords: Set<string>;
    errors: string[];
    errorLabel: string;
  }): number {
    const releaseKey = `${args.ledgerKey}::${args.sourceRecordId}`;
    if (args.releasedSourceRecords.has(releaseKey)) return 0;
    const releaseResult = this.releaseInventoryReservations({
      sourceFormKey: args.formKey,
      sourceRecordId: args.sourceRecordId,
      ledgerFormKey: args.ledgerKey,
      refreshMode: 'revisionOnly'
    });
    if (!releaseResult.success) {
      args.errors.push(`${args.formKey}: ${args.errorLabel}: ${releaseResult.message}`);
      return 0;
    }
    args.releasedSourceRecords.add(releaseKey);
    return Number(releaseResult.reconciledReservations || 0);
  }

  public runDailyLifecycleRecompute(): { success: boolean; updatedForms: number; updatedRecords: number; errors: string[] } {
    const forms = this.getFormsCached();
    const errors: string[] = [];
    const todayIso = this.scriptTodayIso();
    let updatedForms = 0;
    let updatedRecords = 0;

    forms.forEach(form => {
      const formKey = (form.configSheet || form.title || '').toString().trim();
      const rules = Array.isArray(form.lifecycle?.rules) ? form.lifecycle?.rules || [] : [];
      if (!formKey || !rules.length) return;
      try {
        const { form: resolvedForm, questions } = this.getFormContextLite(formKey);
        const { sheet, columns } = this.submissions.ensureDestination(
          resolvedForm.destinationTab || `${resolvedForm.title} Responses`,
          questions
        );
        const lastRow = sheet.getLastRow();
        const lastColumn = Math.max(sheet.getLastColumn(), 1);
        if (lastRow < 2 || lastColumn < 1) return;
        const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
        let formUpdates = 0;

        const activeReservationRowsByLedger = new Map<string, WebFormSubmission[]>();
        const releasedSourceRecords = new Set<string>();

        rules.forEach(rule => {
          if (rule.type === 'releaseActiveReservations') {
            const ledgerFormKey =
              (rule.ledgerFormKey || form.reservationLifecycle?.ledgerFormKey || 'Config: Inventory Reservation Ledger')
                .toString()
                .trim();
            const ledgerKey = ledgerFormKey || 'Config: Inventory Reservation Ledger';
            const activeReservations = this.getActiveLifecycleReservationsForForm(
              formKey,
              ledgerKey,
              activeReservationRowsByLedger
            );
            if (!activeReservations.length) return;

            const sourceRecordIds = Array.from(
              new Set(
                activeReservations
                  .map(record => this.readRecordFieldString(record, 'SOURCE_RECORD_ID'))
                  .filter(Boolean)
              )
            );
            sourceRecordIds.forEach(sourceRecordId => {
              updatedRecords += this.releaseLifecycleReservationsForSource({
                formKey,
                sourceRecordId,
                ledgerKey,
                releasedSourceRecords,
                errors,
                errorLabel: `active reservation release failed for ${sourceRecordId}`
              });
            });
            return;
          }
          if (rule.type === 'releaseStaleReservations') {
            const ledgerFormKey =
              (rule.ledgerFormKey || form.reservationLifecycle?.ledgerFormKey || 'Config: Inventory Reservation Ledger')
                .toString()
                .trim();
            const ledgerKey = ledgerFormKey || 'Config: Inventory Reservation Ledger';
            const activeReservations = this.getActiveLifecycleReservationsForForm(
              formKey,
              ledgerKey,
              activeReservationRowsByLedger
            );
            if (!activeReservations.length) return;

            const sourceRowIndexById = new Map<string, number>();
            const recordIdCol = Number(columns.recordId || 0);
            if (recordIdCol > 0) {
              rows.forEach((rowValues, index) => {
                const sourceRecordId = (rowValues[recordIdCol - 1] || '').toString().trim();
                if (sourceRecordId) sourceRowIndexById.set(sourceRecordId, index);
              });
            }
            const groupedBySource = new Map<string, WebFormSubmission[]>();
            activeReservations.forEach(record => {
              const sourceRecordId = this.readRecordFieldString(record, 'SOURCE_RECORD_ID');
              if (!sourceRecordId) return;
              const list = groupedBySource.get(sourceRecordId) || [];
              list.push(record);
              groupedBySource.set(sourceRecordId, list);
            });

            groupedBySource.forEach((reservationRows, sourceRecordId) => {
              const sourceRowIndex = sourceRowIndexById.get(sourceRecordId);
              if (sourceRowIndex === undefined) {
                if (rule.releaseWhenSourceMissing === false) return;
                updatedRecords += this.releaseLifecycleReservationsForSource({
                  formKey,
                  sourceRecordId,
                  ledgerKey,
                  releasedSourceRecords,
                  errors,
                  errorLabel: `stale release failed for missing source ${sourceRecordId}`
                });
                return;
              }
              const statusCol = this.resolveLifecycleStatusColumn(resolvedForm, rule, columns);
              if (Array.isArray(rule.fromStatuses) && rule.fromStatuses.length && !statusCol) {
                errors.push(
                  `${formKey}: lifecycle rule ${(rule.id || rule.type).toString()} missing status column` +
                  `${rule.statusFieldId ? ` for ${rule.statusFieldId}` : ''}`
                );
                return;
              }
              const currentStatus = statusCol ? rows[sourceRowIndex][statusCol - 1] : undefined;
              const dateCol = Number(columns.fields?.[rule.dateFieldId] || 0);
              if (!dateCol) {
                errors.push(`${formKey}: lifecycle rule ${(rule.id || rule.type).toString()} missing date column for ${rule.dateFieldId}`);
                return;
              }
              const rawDateValue = rows[sourceRowIndex][dateCol - 1];
              if (!this.shouldApplyLifecycleRule(rule, currentStatus, rawDateValue, todayIso)) {
                return;
              }
              updatedRecords += this.releaseLifecycleReservationsForSource({
                formKey,
                sourceRecordId,
                ledgerKey,
                releasedSourceRecords,
                errors,
                errorLabel: `stale release failed for ${sourceRecordId}`
              });
            });
            return;
          }
          const dateCol = Number(columns.fields?.[rule.dateFieldId] || 0);
          const statusCol = this.resolveLifecycleStatusColumn(resolvedForm, rule, columns);
          if (!dateCol) {
            errors.push(`${formKey}: lifecycle rule ${(rule.id || rule.type).toString()} missing date column for ${rule.dateFieldId}`);
            return;
          }
          if (!statusCol) {
            errors.push(
              `${formKey}: lifecycle rule ${(rule.id || rule.type).toString()} missing status column` +
              `${rule.statusFieldId ? ` for ${rule.statusFieldId}` : ''}`
            );
            return;
          }

          rows.forEach((rowValues, index) => {
            if (!this.shouldApplyLifecycleRule(rule, rowValues[statusCol - 1], rowValues[dateCol - 1], todayIso)) {
              return;
            }
            const targetStatus = (rule.toStatus || '').toString().trim().toLowerCase();
            const normalizedStatus = (rowValues[statusCol - 1] === undefined || rowValues[statusCol - 1] === null
              ? ''
              : rowValues[statusCol - 1].toString().trim()).toLowerCase();
            if (!targetStatus || normalizedStatus === targetStatus) {
              return;
            }
            const rowNumber = index + 2;
            this.submissions.writeStatus(sheet, columns, rowNumber, rule.toStatus, rule.statusFieldId);
            rowValues[statusCol - 1] = rule.toStatus;
            formUpdates += 1;
          });
        });

        if (formUpdates > 0 || releasedSourceRecords.size > 0) {
          const canonicalKey = (resolvedForm.configSheet || resolvedForm.title || formKey).toString().trim();
          const rev = this.bumpHomeRevision(canonicalKey, 'runDailyLifecycleRecompute');
          this.primeHomeBootstrapCache(canonicalKey, rev, 'runDailyLifecycleRecompute');
          updatedForms += 1;
          updatedRecords += formUpdates;
        }
      } catch (err: any) {
        const message = (err?.message || err?.toString?.() || 'Unknown lifecycle recompute error').toString();
        errors.push(`${formKey}: ${message}`);
      }
    });

    debugLog('lifecycle.daily.recompute', {
      forms: forms.length,
      updatedForms,
      updatedRecords,
      errorCount: errors.length,
      todayIso
    });
    return {
      success: errors.length === 0,
      updatedForms,
      updatedRecords,
      errors
    };
  }

  private buildBootstrap(
    formKey: string,
    def: WebFormDefinition,
    options?: BootstrapContextOptions,
    serverTiming?: ServerTimingRecorder | null,
    labelPrefix = 'bootstrap'
  ): any {
    try {
      const includeHomeData = options?.includeHomeData === true;
      const includeAnalytics = options?.includeAnalytics === true;
      const { form, questions } =
        serverTiming?.measure(`${labelPrefix}.getFormContextLiteMs`, () => this.getFormContextLite(formKey)) ??
        this.getFormContextLite(formKey);
      const out: any = {};
      const analyticsStartedAt = Date.now();
      if (includeAnalytics && def?.analytics?.widgets?.length) {
        let analytics =
          serverTiming?.measure(`${labelPrefix}.readAnalyticsSnapshotMs`, () => this.analytics.readSnapshot(form)) ??
          this.analytics.readSnapshot(form);
        if (!analytics.revision) {
          analytics =
            serverTiming?.measure(
              `${labelPrefix}.recomputeAnalyticsMs`,
              () => this.analytics.recomputeForm(form, questions, def)
            ) ?? this.analytics.recomputeForm(form, questions, def);
        }
        out.analytics = analytics;
        out.analyticsRev = Number(analytics.revision || 0) || 0;
        debugLog('bootstrap.analytics.ready', {
          formKey,
          revision: out.analyticsRev,
          items: Array.isArray(analytics.items) ? analytics.items.length : 0,
          durationMs: Date.now() - analyticsStartedAt
        });
      }
      if (!includeHomeData || !def?.listView?.columns?.length) {
        return Object.keys(out).length ? out : null;
      }

      const startedAt = Date.now();
      const projection =
        serverTiming?.measure(`${labelPrefix}.buildHomeSummaryProjectionMs`, () => this.buildHomeSummaryProjection(def)) ??
        this.buildHomeSummaryProjection(def);
      const fetchPageSize =
        serverTiming?.measure(`${labelPrefix}.resolveHomeSummaryPageSizeMs`, () => this.resolveHomeSummaryPageSize(def)) ??
        this.resolveHomeSummaryPageSize(def);
      const homeDateFilter = this.resolveHomeBootstrapDateFilter(def);
      const sort:
        | {
            fieldId?: string;
            direction?: string;
            __dateFieldId?: string;
            __dateEquals?: string;
            __maxPageSize?: number;
          }
        | undefined =
        def.listView?.defaultSort?.fieldId || homeDateFilter
          ? {
              fieldId: def.listView?.defaultSort?.fieldId,
              direction: (def.listView?.defaultSort?.direction || 'desc') as any,
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
      const batch =
        serverTiming?.measure(
          `${labelPrefix}.fetchSortedBatchMs`,
          () =>
            this.listing.fetchSubmissionsSortedBatch(
              form,
              questions,
              projection,
              fetchPageSize,
              undefined,
              false,
              undefined,
              sort
            )
        ) ??
        this.listing.fetchSubmissionsSortedBatch(
          form,
          questions,
          projection,
          fetchPageSize,
          undefined,
          false,
          undefined,
          sort
        );
      const listResponse = (batch?.list as any) || null;
      if (!listResponse || !Array.isArray((listResponse as any).items)) {
        return Object.keys(out).length ? out : null;
      }
      const listItems = ((listResponse as any).items || []) as any[];
      const totalCountRaw = Number((listResponse as any).totalCount || 0);
      const cappedTotalCount = Number.isFinite(totalCountRaw) && totalCountRaw > 0
        ? Math.min(totalCountRaw, HOME_BOOTSTRAP_LIST_MAX_ITEMS)
        : listItems.length;
      const completeData =
        listItems.length >= cappedTotalCount ||
        (!(listResponse as any).nextPageToken && (!Number.isFinite(totalCountRaw) || totalCountRaw <= 0 || listItems.length >= totalCountRaw));
      const normalizedListResponse = {
        ...listResponse,
        contiguousItemCount: listItems.length,
        completeData
      };
      debugLog('renderForm.bootstrap.listPrefetch', {
        formKey,
        pageSize: fetchPageSize,
        items: listItems.length,
        totalCount: (listResponse as any).totalCount || 0,
        completeData,
        dateFilterFieldId: homeDateFilter?.fieldId || null,
        dateFilterEquals: homeDateFilter?.equals || null,
        durationMs: Date.now() - startedAt
      });
      debugLog('bootstrap.homeData.ready', {
        formKey,
        pageSize: fetchPageSize,
        projectionCount: projection.length,
        summaryMode: true,
        durationMs: Date.now() - startedAt
      });
      out.listResponse = normalizedListResponse;
      out.records = {};
      return out;
    } catch (err: any) {
      debugLog('renderForm.bootstrap.error', { formKey, message: err?.message || err?.toString?.() || 'unknown' });
      return null;
    }
  }

  private normalizeToIsoDateLocal(value: any): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const year = value.getFullYear();
      const month = (value.getMonth() + 1).toString().padStart(2, '0');
      const day = value.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const raw = value?.toString?.().trim?.() || `${value}`.trim();
    if (!raw) return null;
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const day = parsed.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private resolveHomeBootstrapDateFilter(def: WebFormDefinition): { fieldId: string; equals: string } | null {
    const search = def?.listView?.search as any;
    const mode = (search?.mode || 'text').toString().trim().toLowerCase();
    const fieldId = ((search?.dateFieldId || '') as string).toString().trim();
    if (mode !== 'date' || !fieldId) return null;

    const initialValue = search?.initialValue;
    if (initialValue === undefined || initialValue === null) return null;

    if (typeof initialValue === 'string') {
      const equals = this.normalizeToIsoDateLocal(initialValue);
      return equals ? { fieldId, equals } : null;
    }

    if (typeof initialValue !== 'object') return null;

    const relativeDate = (((initialValue as any).relativeDate ?? (initialValue as any).relative ?? '') || '')
      .toString()
      .trim()
      .toLowerCase();
    if (relativeDate === 'today') {
      return { fieldId, equals: this.scriptTodayIso() };
    }

    const rawValue = (((initialValue as any).value ?? (initialValue as any).dateValue ?? '') || '').toString().trim();
    const equals = this.normalizeToIsoDateLocal(rawValue);
    return equals ? { fieldId, equals } : null;
  }

  public submitWebForm(formObject: any): { success: boolean; message: string } {
    const result = this.saveSubmissionWithId(formObject as WebFormSubmission);
    return { success: result.success, message: result.message };
  }

  public static invalidateServerCache(reason?: string): string | null {
    return CacheEtagManager.invalidate(getDocumentProperties(), reason);
  }

  /**
   * Optional warm-up hook to be called from a time-based trigger.
   *
   * This prebuilds and caches WebFormDefinition objects for all forms so
   * that initial user hits see a warmed definition cache.
   */
  public warmDefinitions(): void {
    const forms = this.getFormsCached();
    const startedAt = Date.now();
    forms.forEach(form => {
      try {
        const def = this.getOrBuildDefinition(form.configSheet || form.title);
        debugLog('definition.warm', {
          formKey: form.configSheet || form.title,
          title: def.title,
          questions: def.questions?.length || 0
        });
      } catch (err: any) {
        debugLog('definition.warm.error', {
          formKey: form.configSheet || form.title,
          message: err?.message || err?.toString?.() || 'unknown'
        });
      }
    });
    debugLog('definition.warm.completed', {
      count: forms.length,
      elapsedMs: Date.now() - startedAt
    });
  }

  public fetchDataSource(
    source: any,
    locale?: string,
    projection?: string[],
    limit?: number,
    pageToken?: string
  ): PaginatedResult<any> {
    const config = typeof source === 'string' ? { id: source, projection } : (source || {});
    const formKey = (config?.formKey || '').toString().trim();
    if (formKey) {
      return this.fetchFormBackedDataSource(config, locale, projection, limit, pageToken);
    }
    return this.dataSources.fetchDataSource(source, locale, projection, limit, pageToken);
  }

  public backfillDataSourceIds(
    formKey: string = 'Config: Meal Production',
    options?: DataSourceIdBackfillOptions
  ): DataSourceIdBackfillResult {
    const targetFormKey = (formKey || 'Config: Meal Production').toString().trim() || 'Config: Meal Production';
    this.assertDataSourceBackfillCommitAllowed(options);
    const backfill = new DataSourceIdBackfillService({
      ss: this.ss,
      submissions: this.submissions,
      cacheManager: this.cacheManager,
      resolveFormContext: (key?: string) => this.getFormContext(key),
      fetchDataSource: (source: any, locale?: string, projection?: string[], limit?: number, pageToken?: string) =>
        this.fetchDataSource(source, locale, projection, limit, pageToken)
    });
    return toPlainData(backfill.run(targetFormKey, options));
  }

  private assertDataSourceBackfillCommitAllowed(options?: DataSourceIdBackfillOptions): void {
    if (options?.dryRun !== false) return;
    const provided = (((options as any)?.commitToken ?? (options as any)?.token ?? '') || '').toString().trim();
    const expected = (() => {
      try {
        return (this.scriptProperties()?.getProperty('CK_BACKFILL_DATA_SOURCE_IDS_TOKEN') || '').toString().trim();
      } catch {
        return '';
      }
    })();
    if (!expected) {
      throw new Error('Data source ID backfill commit token is not configured.');
    }
    if (!provided || provided !== expected) {
      throw new Error('Invalid data source ID backfill commit token.');
    }
  }

  private fetchFormBackedDataSource(
    config: any,
    locale?: string,
    projection?: string[],
    limit?: number,
    pageToken?: string
  ): PaginatedResult<any> {
    const formKey = (config?.formKey || '').toString().trim();
    if (!formKey) return { items: [], nextPageToken: undefined, totalCount: 0 };
    const { form, questions } = this.getFormContextLite(formKey);
    const mode = ((config?.mode || '').toString().trim().toLowerCase());
    const defaultPageSize = mode === 'options' ? 250 : 50;
    const requestedRaw = limit ?? config?.limit ?? defaultPageSize;
    const pageSize = Number.isFinite(Number(requestedRaw))
      ? Math.max(1, Math.min(Number(requestedRaw), 500))
      : defaultPageSize;
    const configProjection = Array.isArray(config?.projection) ? config.projection : undefined;
    const effectiveProjection = configProjection?.length ? configProjection : projection;
    const fetchProjection = this.extendProjectionForDataSourceBackfill(config, effectiveProjection);
    const localeKey = (config?.localeKey || '').toString().trim();
    const localeNeedle = (locale || '').toString().trim().toLowerCase();
    const statusFieldId = ((config?.statusFieldId || 'status') || '').toString().trim();
    const statusAllowList = Array.isArray(config?.statusAllowList)
      ? config.statusAllowList
      : config?.statusAllowList !== undefined && config?.statusAllowList !== null && config?.statusAllowList !== ''
        ? [config.statusAllowList]
        : [];
    const statusAllowSet = new Set(
      statusAllowList
        .map((value: any) => (value === undefined || value === null ? '' : value.toString().trim().toLowerCase()))
        .filter(Boolean)
    );
    const mapping = config?.mapping && typeof config.mapping === 'object' ? config.mapping : undefined;
    const normalizeItems = (sourceItems: any[]): any[] => {
      const filteredItems = (Array.isArray(sourceItems) ? sourceItems : [])
        .filter(item => {
          if (!item || typeof item !== 'object') return false;
          if (localeKey && localeNeedle) {
            const rawLocale = (item as any)[localeKey];
            const itemLocale = rawLocale === undefined || rawLocale === null ? '' : rawLocale.toString().trim().toLowerCase();
            if (itemLocale && itemLocale !== localeNeedle) return false;
          }
          if (statusAllowSet.size > 0) {
            const rawStatus = (item as any)[statusFieldId];
            const itemStatus = rawStatus === undefined || rawStatus === null ? '' : rawStatus.toString().trim().toLowerCase();
            if (!itemStatus || !statusAllowSet.has(itemStatus)) return false;
          }
          return true;
        })
        .map(item => {
          if (!mapping) return item;
          const next = { ...(item as Record<string, any>) };
          Object.entries(mapping).forEach(([sourceKeyRaw, targetKeyRaw]) => {
            const sourceKey = (sourceKeyRaw || '').toString().trim();
            const targetKey = (targetKeyRaw || '').toString().trim();
            if (!sourceKey || !targetKey) return;
            if (next[targetKey] === undefined && next[sourceKey] !== undefined) {
              next[targetKey] = next[sourceKey];
            }
            if (next[sourceKey] === undefined && next[targetKey] !== undefined) {
              next[sourceKey] = next[targetKey];
            }
          });
          return next;
        });
      return this.backfillFormBackedDataSourceItems(config, formKey, effectiveProjection, filteredItems);
    };
    const shouldAggregateAllPages = mode === 'options' && !pageToken;
    if (shouldAggregateAllPages) {
      const mergedItems: any[] = [];
      let nextCursor: string | undefined;
      let pages = 0;
      while (pages < FORM_BACKED_OPTIONS_AUTO_PAGE_MAX_PAGES) {
        const response = this.listing.fetchSubmissions(form, questions, fetchProjection, pageSize, nextCursor);
        pages += 1;
        mergedItems.push(...normalizeItems(Array.isArray(response.items) ? response.items : []));
        const nextToken =
          typeof response.nextPageToken === 'string' && response.nextPageToken.trim()
            ? response.nextPageToken.trim()
            : undefined;
        if (!nextToken) {
          return toPlainData({
            items: mergedItems,
            nextPageToken: undefined,
            totalCount: mergedItems.length
          });
        }
        nextCursor = nextToken;
      }
      debugLog('dataSource.formBacked.autoPage.maxPagesReached', {
        id: config?.id || null,
        formKey,
        pages,
        itemCount: mergedItems.length
      });
      return toPlainData({
        items: mergedItems,
        nextPageToken: nextCursor,
        totalCount: mergedItems.length
      });
    }

    const response = this.listing.fetchSubmissions(form, questions, fetchProjection, pageSize, pageToken);
    const normalizedItems = normalizeItems(Array.isArray(response.items) ? response.items : []);
    const rawTotalCount = Number(response.totalCount);
    const totalCount =
      Number.isFinite(rawTotalCount) && rawTotalCount > 0
        ? rawTotalCount
        : normalizedItems.length;
    return toPlainData({
      items: normalizedItems,
      nextPageToken: response.nextPageToken,
      totalCount
    });
  }

  private extendProjectionForDataSourceBackfill(
    config: DataSourceConfig | undefined,
    projection: string[] | undefined
  ): string[] | undefined {
    const base = Array.isArray(projection) ? projection.map(value => `${value || ''}`.trim()).filter(Boolean) : [];
    const backfill = config?.backfill;
    if (!backfill) {
      return base.length ? base : projection;
    }
    const extras = [
      `${backfill.sourceFormKeyFieldId || ''}`.trim(),
      `${backfill.sourceRecordIdFieldId || ''}`.trim(),
      `${backfill.sourceRowIdFieldId || ''}`.trim()
    ].filter(Boolean);
    if (!extras.length) {
      return base.length ? base : projection;
    }
    const merged = Array.from(new Set([...base, ...extras]));
    return merged.length ? merged : projection;
  }

  private backfillFormBackedDataSourceItems(
    config: DataSourceConfig | undefined,
    formKey: string,
    projection: string[] | undefined,
    items: Record<string, any>[]
  ): Record<string, any>[] {
    const backfill = config?.backfill;
    if (!backfill || !Array.isArray(items) || !items.length) {
      return items;
    }

    const requestedFields = new Set(
      (Array.isArray(projection) ? projection : [])
        .map(value => `${value || ''}`.trim())
        .filter(Boolean)
    );
    const trackedFields = Array.from(
      new Set([
        ...(Array.isArray(backfill.whenMissingAnyFieldIds) ? backfill.whenMissingAnyFieldIds : []),
        ...Object.keys(backfill.values || {})
      ])
    ).filter(Boolean);
    if (
      requestedFields.size > 0 &&
      trackedFields.length > 0 &&
      !trackedFields.some(fieldId => requestedFields.has(fieldId))
    ) {
      return items;
    }

    const sourceRecordCache = new Map<string, WebFormSubmission | null>();
    let appliedCount = 0;
    const nextItems = items.map(item => {
      if (!item || typeof item !== 'object') return item;
      const missingFieldIds = (Array.isArray(backfill.whenMissingAnyFieldIds) ? backfill.whenMissingAnyFieldIds : [])
        .map(value => `${value || ''}`.trim())
        .filter(fieldId => fieldId && this.isBackfillValueMissing((item as Record<string, any>)[fieldId]));
      if (!missingFieldIds.length) return item;

      const sourceFormKey = `${(item as Record<string, any>)[backfill.sourceFormKeyFieldId || ''] || ''}`.trim();
      const sourceRecordId = `${(item as Record<string, any>)[backfill.sourceRecordIdFieldId || ''] || ''}`.trim();
      const sourceRowId = `${(item as Record<string, any>)[backfill.sourceRowIdFieldId || ''] || ''}`.trim();
      if (!sourceFormKey || !sourceRecordId) return item;

      const cacheKey = `${sourceFormKey}::${sourceRecordId}`;
      let sourceRecord = sourceRecordCache.get(cacheKey);
      if (sourceRecord === undefined) {
        sourceRecord = this.fetchSubmissionById(sourceFormKey, sourceRecordId);
        sourceRecordCache.set(cacheKey, sourceRecord);
      }
      if (!sourceRecord) return item;

      const scopeRows = this.resolveDataSourceBackfillScopes({
        sourceRecord,
        sourceRowId,
        backfill
      });
      if (!Object.keys(scopeRows).length) return item;

      const nextItem = { ...item };
      let mutated = false;
      const templateVars = {
        item,
        row: item,
        source: item,
        record: sourceRecord.values || {},
        sourceRecord: sourceRecord.values || {},
        submission: sourceRecord,
        ...scopeRows
      } as Record<string, any>;

      Object.entries(backfill.values || {}).forEach(([fieldIdRaw, template]) => {
        const fieldId = `${fieldIdRaw || ''}`.trim();
        if (!fieldId || !this.isBackfillValueMissing((nextItem as Record<string, any>)[fieldId])) {
          return;
        }
        const resolved = this.resolveConfigComputedValue(resolveTemplateValue(template, templateVars), templateVars);
        if (this.isBackfillValueMissing(resolved)) return;
        (nextItem as Record<string, any>)[fieldId] = resolved;
        mutated = true;
      });

      if (!mutated) {
        return item;
      }

      appliedCount += 1;
      return nextItem;
    });

    if (appliedCount > 0) {
      debugLog('datasource.formBackfill.applied', {
        formKey: this.resolveCanonicalFormKey(formKey),
        appliedCount
      });
    }
    return nextItems;
  }

  private resolveDataSourceBackfillScopes(args: {
    sourceRecord: WebFormSubmission;
    sourceRowId: string;
    backfill: NonNullable<DataSourceConfig['backfill']>;
  }): Record<string, Record<string, any>> {
    const { sourceRecord, backfill } = args;
    const normalizedSourceRowId = `${args.sourceRowId || ''}`.trim();
    const scopeDefs = Array.isArray(backfill.scopes) ? backfill.scopes : [];
    if (!scopeDefs.length) return {};

    const topCtx =
      sourceRecord.formKey && `${sourceRecord.formKey || ''}`.trim()
        ? buildRecordVisibilityContext(sourceRecord, this.getFormContextLite(sourceRecord.formKey || '').questions).ctx
        : {
            getValue: (fieldId: string) => ((sourceRecord.values || {}) as Record<string, any>)[fieldId],
            getLineItems: () => [],
            getLineItemKeys: () => []
          };
    const defsById = new Map(scopeDefs.map(def => [`${def.id || ''}`.trim(), def]));
    const candidateCache = new Map<string, Array<{ row: Record<string, any>; ancestors: Record<string, Record<string, any>> }>>();
    const resolved: Record<string, Record<string, any>> = {};

    const collectCandidates = (
      scopeId: string
    ): Array<{ row: Record<string, any>; ancestors: Record<string, Record<string, any>> }> => {
      if (candidateCache.has(scopeId)) return candidateCache.get(scopeId) || [];
      const def = defsById.get(scopeId);
      if (!def) return [];

      let candidates: Array<{ row: Record<string, any>; ancestors: Record<string, Record<string, any>> }> = [];
      if (def.parentScopeId) {
        const parentCandidates = collectCandidates(`${def.parentScopeId || ''}`.trim());
        candidates = parentCandidates.flatMap(parentCandidate => {
          const childRows = this.parseFollowupLineItemRows(
            parentCandidate.row[def.groupId] || parentCandidate.row[`${def.groupId}_json`]
          );
          return childRows.map(rawRow => {
            const row = (rawRow || {}) as Record<string, any>;
            return {
              row,
              ancestors: {
                ...parentCandidate.ancestors,
                [scopeId]: row
              }
            };
          });
        });
      } else {
        const rootRows = this.parseFollowupLineItemRows(
          (sourceRecord.values || {})[def.groupId] || (sourceRecord.values || {})[`${def.groupId}_json`]
        );
        candidates = rootRows.map(rawRow => {
          const row = (rawRow || {}) as Record<string, any>;
          return {
            row,
            ancestors: {
              [scopeId]: row
            }
          };
        });
      }
      candidateCache.set(scopeId, candidates);
      return candidates;
    };

    scopeDefs.forEach(def => {
      const scopeId = `${def.id || ''}`.trim();
      if (!scopeId) return;
      let candidates = collectCandidates(scopeId);
      if (def.parentScopeId) {
        const parentScopeId = `${def.parentScopeId || ''}`.trim();
        const resolvedParent = resolved[parentScopeId];
        if (resolvedParent) {
          candidates = candidates.filter(candidate => candidate.ancestors[parentScopeId] === resolvedParent);
        }
      }

      let matched = null as { row: Record<string, any>; ancestors: Record<string, Record<string, any>> } | null;
      if (def.matchBySourceRowId && normalizedSourceRowId) {
        matched = candidates.find(candidate => this.normalizeFollowupLineItemRowId(candidate.row) === normalizedSourceRowId) || null;
      }
      if (!matched && def.fallbackMatch === 'first') {
        const filtered = candidates.filter(candidate =>
          this.matchesBackfillRowFilter({
            row: candidate.row,
            parentValues: def.parentScopeId ? candidate.ancestors[`${def.parentScopeId || ''}`.trim()] : undefined,
            groupKey: def.groupId,
            topCtx,
            filter: def.rowFilter
          })
        );
        matched = filtered[0] || null;
      }
      if (!matched) return;
      Object.entries(matched.ancestors).forEach(([ancestorId, row]) => {
        if (row) resolved[ancestorId] = row;
      });
    });

    return resolved;
  }

  private matchesBackfillRowFilter(args: {
    row: Record<string, any>;
    parentValues?: Record<string, any>;
    groupKey: string;
    topCtx: ReturnType<typeof buildRecordVisibilityContext>['ctx'];
    filter?: { includeWhen?: any; excludeWhen?: any } | null;
  }): boolean {
    const filter = args.filter;
    if (!filter) return true;
    const rowCtx = buildRowVisibilityContext({
      row: args.row,
      groupKey: args.groupKey,
      parentValues: args.parentValues,
      topCtx: args.topCtx
    });
    if (filter.includeWhen && !matchesWhenClause(filter.includeWhen, rowCtx.ctx, { now: new Date() })) {
      return false;
    }
    if (filter.excludeWhen && matchesWhenClause(filter.excludeWhen, rowCtx.ctx, { now: new Date() })) {
      return false;
    }
    return true;
  }

  private isBackfillValueMissing(value: any): boolean {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  }

  private readPathValue(root: any, pathRaw: any): any {
    const path = `${pathRaw || ''}`.trim();
    if (!path) return '';
    const parts = path.split('.').map(part => part.trim()).filter(Boolean);
    let current: any = root;
    for (const part of parts) {
      if (current === undefined || current === null) return '';
      if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, part)) {
        current = current[part];
        continue;
      }
      if (
        typeof current === 'object' &&
        current !== null &&
        Object.prototype.hasOwnProperty.call(current, 'values') &&
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
  }

  private readTemplatePathValue(pathRaw: any, vars: Record<string, any>): any {
    return this.readPathValue(vars, pathRaw);
  }

  private normalizeLookupCollection(value: any): any[] {
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
  }

  private hasResolvedComputedValue(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private resolveFirstNonEmptyComputedValue(value: Record<string, any>, vars: Record<string, any>): any {
    const candidates = Array.isArray(value.values) ? value.values : [];
    for (const candidate of candidates) {
      const resolved = this.resolveConfigComputedValue(resolveTemplateValue(candidate, vars), vars);
      if (this.hasResolvedComputedValue(resolved)) return resolved;
    }
    return '';
  }

  private resolveComputedCollection(value: Record<string, any>, vars: Record<string, any>): any[] {
    const resolvedCollection = this.resolveConfigComputedValue(resolveTemplateValue(value.collection, vars), vars);
    if (Array.isArray(resolvedCollection)) return resolvedCollection;
    const normalizedResolvedCollection = this.normalizeLookupCollection(resolvedCollection);
    if (normalizedResolvedCollection.length) return normalizedResolvedCollection;
    const collectionPaths = [
      `${value.collectionPath || ''}`.trim(),
      ...(Array.isArray(value.collectionPathAlternatives)
        ? value.collectionPathAlternatives.map(entry => `${entry || ''}`.trim()).filter(Boolean)
        : [])
    ].filter(Boolean);
    return collectionPaths.reduce<any[]>((resolved, path) => {
      if (resolved.length) return resolved;
      return this.normalizeLookupCollection(this.readTemplatePathValue(path, vars));
    }, []);
  }

  private filterComputedCollectionEntries(value: Record<string, any>, vars: Record<string, any>): any[] {
    const collection = this.resolveComputedCollection(value, vars);
    if (!collection.length) return [];
    const sourceRecord =
      vars.source && typeof vars.source === 'object' && (vars.source as WebFormSubmission).values
        ? (vars.source as WebFormSubmission)
        : ({ values: {} } as WebFormSubmission);
    const topCtx = buildRecordVisibilityContext(sourceRecord, []).ctx;
    const when = value.when ? resolveTemplateValue(value.when, vars) : undefined;
    const rowFilter =
      value.rowFilter && typeof value.rowFilter === 'object' && !Array.isArray(value.rowFilter)
        ? (resolveTemplateValue(value.rowFilter, vars) as { includeWhen?: any; excludeWhen?: any })
        : undefined;
    return collection
      .filter(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const rowCtx = buildRowVisibilityContext({
          row: entry as Record<string, any>,
          groupKey: `${value.groupId || value.collectionGroupId || 'collection'}`.trim() || 'collection',
          parentValues: undefined,
          topCtx
        });
        if (rowFilter?.includeWhen && !matchesWhenClause(rowFilter.includeWhen as any, rowCtx.ctx, { now: new Date() })) {
          return false;
        }
        if (rowFilter?.excludeWhen && matchesWhenClause(rowFilter.excludeWhen as any, rowCtx.ctx, { now: new Date() })) {
          return false;
        }
        if (when && !matchesWhenClause(when as any, rowCtx.ctx, { now: new Date() })) return false;
        return true;
      });
  }

  private filterComputedCollection(value: Record<string, any>, vars: Record<string, any>): any[] {
    const pickFields = Array.isArray(value.pickFields)
      ? value.pickFields.map(entry => `${entry || ''}`.trim()).filter(Boolean)
      : [];
    return this.filterComputedCollectionEntries(value, vars).map(entry => {
      if (!pickFields.length || !entry || typeof entry !== 'object') return entry;
      const next: Record<string, any> = {};
      pickFields.forEach(fieldId => {
        next[fieldId] = (entry as Record<string, any>)[fieldId];
      });
      return next;
    });
  }

  private flattenComputedCollection(value: Record<string, any>, vars: Record<string, any>): any[] {
    const parentRows = this.filterComputedCollectionEntries(value, vars);
    if (!parentRows.length) return [];
    const nestedCollectionPath = `${value.nestedCollectionPath || ''}`.trim();
    if (!nestedCollectionPath) return [];
    const pickFields = Array.isArray(value.pickFields)
      ? value.pickFields.map(entry => `${entry || ''}`.trim()).filter(Boolean)
      : [];
    return parentRows.flatMap(entry => {
      const nestedRows = this.normalizeLookupCollection(this.readPathValue(entry, nestedCollectionPath));
      if (!pickFields.length) return nestedRows;
      return nestedRows.map(nestedEntry => {
        if (!nestedEntry || typeof nestedEntry !== 'object') return nestedEntry;
        const next: Record<string, any> = {};
        pickFields.forEach(fieldId => {
          next[fieldId] = (nestedEntry as Record<string, any>)[fieldId];
        });
        return next;
      });
    });
  }

  private resolveIfPresentComputedValue(value: Record<string, any>, vars: Record<string, any>): any {
    const path = `${value.path || ''}`.trim();
    const resolved = path ? this.readTemplatePathValue(path, vars) : '';
    if (this.hasResolvedComputedValue(resolved)) {
      return this.resolveConfigComputedValue(resolveTemplateValue(value.then, vars), vars);
    }
    return this.resolveConfigComputedValue(resolveTemplateValue(value.else, vars), vars);
  }

  private splitDelimitedValues(value: any, delimiterRaw?: any): string[] {
    const raw = `${value ?? ''}`.trim();
    if (!raw) return [];
    const delimiter = `${delimiterRaw || ','}`;
    return raw
      .split(delimiter)
      .map(token => token.trim())
      .filter(Boolean);
  }

  private getLookupFieldValueMap(args: {
    formKey: string;
    keyFieldId: string;
    valueFieldId: string;
  }): Map<string, string> {
    const cacheKey = JSON.stringify({
      formKey: this.resolveCanonicalFormKey(args.formKey),
      keyFieldId: args.keyFieldId,
      valueFieldId: args.valueFieldId
    });
    const existing = this._lookupFieldValueCache?.get(cacheKey);
    if (existing) return existing;

    const map = new Map<string, string>();
    const { form, questions } = this.getFormContextLite(args.formKey);
    const { sheet, headers, columns } = this.submissions.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const keyCol = Number(columns.fields?.[args.keyFieldId] || 0);
    const valueCol = Number(columns.fields?.[args.valueFieldId] || 0);
    if (keyCol > 0 && valueCol > 0) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
        rows.forEach(rowValues => {
          const key = (rowValues[keyCol - 1] ?? '').toString().trim();
          const value = (rowValues[valueCol - 1] ?? '').toString().trim();
          if (!key || !value || map.has(key)) return;
          map.set(key, value);
        });
      }
    }
    if (!map.size) {
      this.fetchAllSubmissionRecords(form, questions).forEach(record => {
        const key = this.readRecordFieldString(record, args.keyFieldId);
        const value = this.readRecordFieldString(record, args.valueFieldId);
        if (!key || !value || map.has(key)) return;
        map.set(key, value);
      });
    }
    this._lookupFieldValueCache?.set(cacheKey, map);
    return map;
  }

  private resolveLookupSetIntersection(value: Record<string, any>, vars: Record<string, any>): string {
    const collection = this.resolveComputedCollection(value, vars);
    const itemFieldId = `${value.itemFieldId || ''}`.trim();
    const itemValues = collection
      .map(entry => {
        if (!itemFieldId) return `${entry ?? ''}`.trim();
        if (!entry || typeof entry !== 'object') return '';
        return `${(entry as Record<string, any>)[itemFieldId] ?? ''}`.trim();
      })
      .filter(Boolean);
    if (!itemValues.length) {
      const fallbackResolved = this.resolveConfigComputedValue(resolveTemplateValue(value.fallback, vars), vars);
      return typeof fallbackResolved === 'string' ? fallbackResolved.trim() : `${fallbackResolved ?? ''}`.trim();
    }

    const lookupFormKey = `${value.lookupFormKey || ''}`.trim();
    const lookupKeyFieldId = `${value.lookupKeyFieldId || ''}`.trim();
    const lookupValueFieldId = `${value.lookupValueFieldId || ''}`.trim();
    if (!lookupFormKey || !lookupKeyFieldId || !lookupValueFieldId) return '';

    const lookupMap = this.getLookupFieldValueMap({
      formKey: lookupFormKey,
      keyFieldId: lookupKeyFieldId,
      valueFieldId: lookupValueFieldId
    });
    const fallbackValue = (() => {
      const fallbackResolved = this.resolveConfigComputedValue(resolveTemplateValue(value.fallback, vars), vars);
      return typeof fallbackResolved === 'string' ? fallbackResolved.trim() : `${fallbackResolved ?? ''}`.trim();
    })();
    let intersection: string[] | null = null;
    const seenItems = new Set<string>();
    for (const itemValue of itemValues) {
      if (seenItems.has(itemValue)) continue;
      seenItems.add(itemValue);
      const lookupValue =
        lookupMap.get(itemValue) ||
        lookupMap.get(itemValue.toLowerCase()) ||
        Array.from(lookupMap.entries()).find(([key]) => key.toLowerCase() === itemValue.toLowerCase())?.[1] ||
        '';
      const tokens = this.splitDelimitedValues(lookupValue, value.splitOn || ',');
      if (!tokens.length) {
        return fallbackValue;
      }
      if (!intersection) {
        intersection = tokens;
        continue;
      }
      const tokenSet = new Set(tokens.map(token => token.toLowerCase()));
      intersection = intersection.filter(token => tokenSet.has(token.toLowerCase()));
      if (!intersection.length) break;
    }
    const joined = (intersection || []).join(`${value.joinWith || ', '}`.toString()).trim();
    return joined || fallbackValue;
  }

  private resolveConfigComputedValue(value: any, vars: Record<string, any>): any {
    if (Array.isArray(value)) {
      return value.map(entry => this.resolveConfigComputedValue(entry, vars));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const op = `${(value as Record<string, any>).op || ''}`.trim();
    if (op === 'lookupSetIntersection') {
      return this.resolveLookupSetIntersection(value as Record<string, any>, vars);
    }
    if (op === 'firstNonEmpty') {
      return this.resolveFirstNonEmptyComputedValue(value as Record<string, any>, vars);
    }
    if (op === 'filterCollection') {
      return this.filterComputedCollection(value as Record<string, any>, vars);
    }
    if (op === 'flattenCollection') {
      return this.flattenComputedCollection(value as Record<string, any>, vars);
    }
    if (op === 'ifPresent') {
      return this.resolveIfPresentComputedValue(value as Record<string, any>, vars);
    }
    const out: Record<string, any> = {};
    Object.keys(value as Record<string, any>).forEach(key => {
      out[key] = this.resolveConfigComputedValue((value as Record<string, any>)[key], vars);
    });
    return out;
  }

  public fetchSubmissions(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string
  ): PaginatedResult<Record<string, any>> {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissions(form, questions, projection, pageSize, pageToken);
  }

  public fetchSubmissionsBatch(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[]
  ): SubmissionBatchResult<Record<string, any>> {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionsBatch(form, questions, projection, pageSize, pageToken, includePageRecords, recordIds);
  }

  public fetchSubmissionsSortedBatch(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[],
    sort?: {
      fieldId?: string;
      direction?: string;
      __ifNoneMatch?: boolean;
      __clientEtag?: string;
      __dateFieldId?: string;
      __dateEquals?: string;
      __dateFrom?: string;
      __dateTo?: string;
    }
  ): SubmissionBatchResult<Record<string, any>> {
    const { form, questions } = this.getFormContextLite(formKey);
    const publicSort = sort
      ? ({
          ...sort,
          __maxPageSize: undefined
        } as any)
      : sort;
    return toPlainData(
      this.listing.fetchSubmissionsSortedBatch(form, questions, projection, pageSize, pageToken, includePageRecords, recordIds, publicSort)
    );
  }

  public fetchSubmissionById(formKey: string, id: string): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.hydrateFetchedSubmissionIfNeeded(formKey, this.listing.fetchSubmissionById(form, questions, id));
  }

  public fetchSubmissionByRowNumber(formKey: string, rowNumber: number): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.hydrateFetchedSubmissionIfNeeded(formKey, this.listing.fetchSubmissionByRowNumber(form, questions, rowNumber));
  }

  private hydrateFetchedSubmissionIfNeeded(formKey: string, record: WebFormSubmission | null): WebFormSubmission | null {
    if (!record) return record;
    const canonicalFormKey = this.resolveCanonicalFormKey(formKey) || formKey;
    if (canonicalFormKey !== 'Config: Meal Production') {
      return record;
    }
    const leftoverContext = this.getFormContextLite('Config: Leftover Inventory');
    return hydrateMealProductionPrepIngredientsFromLeftovers(record, leftoverRecordId =>
      this.listing.fetchSubmissionById(leftoverContext.form, leftoverContext.questions, leftoverRecordId)
    );
  }

  public fetchSummaryRecord(
    formKey: string,
    language?: string | null,
    id?: string | null,
    rowNumber?: number | null
  ): { success: boolean; record?: WebFormSubmission | null; html?: string; fileName?: string; message?: string } {
    const requestedId = (id || '').toString().trim();
    const requestedRow =
      rowNumber !== undefined && rowNumber !== null && Number.isFinite(Number(rowNumber)) && Number(rowNumber) >= 2
        ? Number(rowNumber)
        : null;
    if (!requestedId && !requestedRow) {
      return { success: false, message: 'Record id or row number is required.' };
    }

    const { form, questions } = this.getFormContext(formKey);
    const templateId = form.summaryHtmlTemplateId;
    if (!templateId) {
      return { success: false, message: 'No summary HTML template configured for this form.' };
    }

    debugLog('summary.fetchCombined.start', {
      formKey,
      recordId: requestedId || null,
      rowNumber: requestedRow,
      language: language || null
    });

    let record: WebFormSubmission | null = null;
    if (requestedRow) {
      record = this.listing.fetchSubmissionByRowNumber(form, questions, requestedRow);
      if (requestedId && record?.id && record.id !== requestedId) {
        debugLog('summary.fetchCombined.rowNumberMismatch', {
          formKey,
          requestedId,
          rowNumber: requestedRow,
          resolvedId: record.id
        });
        record = null;
      }
    }
    if (!record && requestedId) {
      record = this.listing.fetchSubmissionById(form, questions, requestedId);
    }
    if (!record) {
      debugLog('summary.fetchCombined.notFound', {
        formKey,
        recordId: requestedId || null,
        rowNumber: requestedRow
      });
      return { success: false, message: 'Record not found.' };
    }

    const renderLanguage = ((language || record.language || 'EN') as any).toString().trim() || 'EN';
    const renderRecord = this.normalizeTemplateRenderRecord({ ...(record as any), language: renderLanguage }, questions, formKey);
    const result = this.followups.renderHtmlFromHtmlTemplate({
      form,
      questions,
      record: renderRecord,
      templateIdMap: templateId,
      namePrefix: `${form.title || 'Form'} - Summary`
    });
    if (!result.success || !result.html) {
      debugLog('summary.fetchCombined.failed', {
        formKey,
        recordId: record.id || requestedId || null,
        message: result.message || 'failed'
      });
      return { success: false, record, message: result.message || 'Failed to render summary.' };
    }

    debugLog('summary.fetchCombined.ok', {
      formKey,
      recordId: record.id || requestedId || null,
      fileName: result.fileName || ''
    });
    return { success: true, record, html: result.html, fileName: result.fileName };
  }

  public upsertInventoryReservation(
    request: InventoryReservationMutationRequest
  ): InventoryReservationMutationResult {
    try {
      return this.withDocumentTransactionLock('inventoryReservation.upsert', () =>
        this.upsertInventoryReservationDirect(request, { refreshMode: 'revisionOnly' })
      );
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || 'Could not acquire the reservation transaction lock. Please retry.').toString()
      };
    }
  }

  public applyInventoryReservationPlan(
    request: InventoryReservationPlanRequest
  ): InventoryReservationPlanResult {
    const sourceFormKey = (request?.sourceFormKey || '').toString().trim();
    const sourceRecordId = (request?.sourceRecordId || '').toString().trim();
    if (!sourceFormKey || !sourceRecordId) {
      return {
        success: false,
        message: 'sourceFormKey and sourceRecordId are required.'
      };
    }

    try {
      return this.withDocumentTransactionLock('inventoryReservation.applyPlan', () => {
        const clientDataVersion = this.normalizeReservationPlanClientDataVersion(request?.clientDataVersion);
        const sourceRecordMetaBefore = this.buildReservationPlanSourceRecordMeta(sourceFormKey, sourceRecordId);
        const sourceClientDataVersionMatched =
          clientDataVersion !== null &&
          Number.isFinite(Number(sourceRecordMetaBefore?.dataVersion)) &&
          Number(sourceRecordMetaBefore?.dataVersion) > 0
            ? Number(sourceRecordMetaBefore?.dataVersion) === clientDataVersion
            : false;
        const refreshMode = this.normalizeReservationRefreshMode(request?.refreshMode, 'revisionOnly');
        const managedScopes = this.normalizeReservationPlanScopes(request?.managedScopes);
        const normalizedReservations = this.normalizeReservationPlanEntries({
          sourceFormKey,
          sourceRecordId,
          ledgerFormKey: request?.ledgerFormKey,
          entries: request?.reservations
        });
        const ledgerFormKey =
          (request?.ledgerFormKey || normalizedReservations[0]?.ledgerFormKey || 'Config: Inventory Reservation Ledger')
            .toString()
            .trim();
        const ledgerContext = this.getFormContextLite(ledgerFormKey);
        const batchCache: InventoryReservationBatchCache = {
          ledgerContext,
          activeReservationsByResource: new Map<string, WebFormSubmission[]>(),
          inventoryRecordsByResource: new Map<string, WebFormSubmission>()
        };
        const allActiveReservations = this.fetchSubmissionRecordsByFieldCriteria(ledgerContext.form, ledgerContext.questions, [
          { fieldId: 'STATUS', expected: 'active' }
        ]).filter(record => this.isActiveReservationRecord(record));
        allActiveReservations.forEach(record => {
          const resourceFormKey = this.readRecordFieldString(record, 'RESOURCE_FORM_KEY');
          const resourceRecordId = this.readRecordFieldString(record, 'RESOURCE_RECORD_ID');
          if (!resourceFormKey || !resourceRecordId) return;
          const resourceKey = this.buildInventoryReservationResourceKey(resourceFormKey, resourceRecordId);
          const existing = batchCache.activeReservationsByResource.get(resourceKey);
          if (existing) {
            existing.push(record);
          } else {
            batchCache.activeReservationsByResource.set(resourceKey, [record]);
          }
        });
        const activeReservations = allActiveReservations.filter(
          record =>
            this.readRecordFieldString(record, 'SOURCE_FORM_KEY') === sourceFormKey &&
            this.readRecordFieldString(record, 'SOURCE_RECORD_ID') === sourceRecordId
        );
        const managedActiveReservations = managedScopes.length
          ? activeReservations.filter(record => this.matchesInventoryReservationScope(record, managedScopes))
          : activeReservations.slice();

        const desiredByReservationId = new Map<string, InventoryReservationMutationRequest>();
        normalizedReservations.forEach(entry => {
          const reservationId = this.buildInventoryReservationId({
            resourceFormKey: entry.resourceFormKey,
            resourceRecordId: entry.resourceRecordId,
            resourceItemId: entry.resourceItemId,
            sourceFormKey,
            sourceRecordId,
            sourceParentGroupId: entry.sourceParentGroupId,
            sourceParentRowId: entry.sourceParentRowId,
            sourceOutputRowId: entry.sourceOutputRowId
          });
          desiredByReservationId.set(reservationId, entry);
        });
        const desiredReservationIds = new Set(desiredByReservationId.keys());
        const releaseCandidates = managedActiveReservations.filter(record => {
          const recordId = (record.id || '').toString().trim();
          return !!recordId && !desiredReservationIds.has(recordId);
        });

        const validationFailure = this.validateInventoryReservationPlan({
          desiredEntries: Array.from(desiredByReservationId.values()),
          desiredReservationIds,
          releaseCandidates,
          batchCache
        });
        if (validationFailure) {
          return validationFailure;
        }

        const touchedForms = new Map<string, { form: FormConfig; questions: QuestionConfig[] }>();
        const pendingSaves: InternalRecordSaveQueue = new Map();
        const availabilitySnapshots: InventoryAvailabilitySnapshot[] = [];
        let appliedCount = 0;
        let releasedCount = 0;

        for (const record of releaseCandidates) {
          const releaseResult = this.upsertInventoryReservationDirect(
            this.buildInventoryReservationReleaseRequest(record, ledgerFormKey),
            {
              refreshMode: 'none',
              touchedForms,
              batchCache,
              pendingSaves
            }
          );
          if (!releaseResult.success) {
            return {
              success: false,
              message: releaseResult.message || 'Failed to release outdated inventory reservations.',
              conflict: releaseResult.conflict === true,
              availability: releaseResult.availability ? [releaseResult.availability] : undefined
            };
          }
          releasedCount += 1;
          if (releaseResult.availability) availabilitySnapshots.push(releaseResult.availability);
        }

        for (const entry of desiredByReservationId.values()) {
          const result = this.upsertInventoryReservationDirect(entry, {
            refreshMode: 'none',
            touchedForms,
            batchCache,
            pendingSaves
          });
          if (!result.success) {
            return {
              success: false,
              message: result.message || 'Failed to update inventory reservations.',
              conflict: result.conflict === true,
              availability: result.availability ? [result.availability] : undefined
            };
          }
          appliedCount += 1;
          if (result.availability) availabilitySnapshots.push(result.availability);
        }

        const flushResult = this.flushInternalRecordSaveQueue(pendingSaves);
        if (!flushResult.success) {
          return {
            success: false,
            message: flushResult.message || 'Failed to save inventory reservation updates.'
          };
        }

        if (refreshMode !== 'none') {
          this.refreshFormBackedReadCaches(touchedForms, 'inventoryReservation.applyPlan');
          touchedForms.forEach(target => {
            this.refreshMutationCaches(target.form, target.questions, 'inventoryReservation.applyPlan', refreshMode);
          });
        }

        const sourceRecordMetaAfter =
          this.buildReservationPlanSourceRecordMeta(sourceFormKey, sourceRecordId) || sourceRecordMetaBefore;

        return {
          success: true,
          message: 'Inventory reservations updated.',
          reservationsApplied: appliedCount,
          reservationsReleased: releasedCount,
          availability: this.collectUniqueReservationAvailabilitySnapshots(availabilitySnapshots),
          sourceRecordMeta: sourceRecordMetaAfter,
          sourceClientDataVersionMatched
        };
      });
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || 'Could not acquire the reservation transaction lock. Please retry.').toString()
      };
    }
  }

  private normalizeReservationPlanClientDataVersion(value: any): number | null {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
  }

  private buildReservationPlanSourceRecordMeta(sourceFormKey: string, sourceRecordId: string): RecordMetadata | undefined {
    const version = this.getRecordVersion(sourceFormKey, sourceRecordId);
    if (!version?.success) return undefined;
    return {
      id: (version.id || sourceRecordId || '').toString().trim() || undefined,
      updatedAt: (version.updatedAt || '').toString().trim() || undefined,
      dataVersion: Number.isFinite(Number(version.dataVersion)) ? Number(version.dataVersion) : undefined,
      rowNumber: Number.isFinite(Number(version.rowNumber)) ? Number(version.rowNumber) : undefined
    };
  }

  private upsertInventoryReservationDirect(
    request: InventoryReservationMutationRequest,
    options?: {
      refreshMode?: 'full' | 'revisionOnly' | 'none';
      touchedForms?: Map<string, { form: FormConfig; questions: QuestionConfig[] }>;
      batchCache?: InventoryReservationBatchCache;
      pendingSaves?: InternalRecordSaveQueue;
    }
  ): InventoryReservationMutationResult {
    const resourceFormKey = (request?.resourceFormKey || '').toString().trim();
    const resourceRecordId = (request?.resourceRecordId || '').toString().trim();
    const sourceFormKey = (request?.sourceFormKey || '').toString().trim();
    const sourceRecordId = (request?.sourceRecordId || '').toString().trim();
    if (!resourceFormKey || !resourceRecordId || !sourceFormKey || !sourceRecordId) {
      return {
        success: false,
        message: 'resourceFormKey, resourceRecordId, sourceFormKey, and sourceRecordId are required.'
      };
    }

    const ledgerFormKey = (request?.ledgerFormKey || 'Config: Inventory Reservation Ledger').toString().trim();
    const resourceKey = this.buildInventoryReservationResourceKey(resourceFormKey, resourceRecordId);
    const batchCache = options?.batchCache;
    let inventoryRecord = batchCache?.inventoryRecordsByResource.get(resourceKey) || null;
    if (!inventoryRecord) {
      inventoryRecord = this.fetchSubmissionById(resourceFormKey, resourceRecordId);
      if (inventoryRecord && batchCache) {
        batchCache.inventoryRecordsByResource.set(resourceKey, inventoryRecord);
      }
    }
    if (!inventoryRecord) {
      return {
        success: false,
        message: `Inventory record not found: ${resourceFormKey} / ${resourceRecordId}.`
      };
    }

    const fieldIds = this.resolveReservationFieldIds({
      resourceKind: request.resourceKind || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_KIND'),
      quantityFieldId: request.quantityFieldId,
      reservedQuantityFieldId: request.reservedQuantityFieldId,
      statusFieldId: request.statusFieldId,
      unitFieldId: request.unitFieldId
    });
    const requestedQty = this.normalizeReservationQuantity(request.quantity);
    if (requestedQty === null) {
      return {
        success: false,
        message: 'Reservation quantity must be numeric.'
      };
    }

    const ledgerContext = batchCache?.ledgerContext || this.getFormContextLite(ledgerFormKey);
    const activeReservations = (batchCache
      ? batchCache.activeReservationsByResource.get(resourceKey) || []
      : this.fetchSubmissionRecordsByFieldCriteria(ledgerContext.form, ledgerContext.questions, [
          { fieldId: 'STATUS', expected: 'active' },
          { fieldId: 'RESOURCE_FORM_KEY', expected: resourceFormKey },
          { fieldId: 'RESOURCE_RECORD_ID', expected: resourceRecordId }
        ]).filter(record => this.isActiveReservationRecord(record))
    ).slice();
    const reservationId = this.buildInventoryReservationId({
      resourceFormKey,
      resourceRecordId,
      resourceItemId: request.resourceItemId || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_ID'),
      sourceFormKey,
      sourceRecordId,
      sourceParentGroupId: request.sourceParentGroupId,
      sourceParentRowId: request.sourceParentRowId,
      sourceOutputRowId: request.sourceOutputRowId
    });
    const currentReservation =
      activeReservations.find(record => (record.id || '').toString().trim() === reservationId) || null;
    const currentReservationQty = currentReservation ? this.readNumericRecordField(currentReservation, 'RESERVED_QTY') : 0;
    const reservedByOthers = activeReservations
      .filter(record => (record.id || '').toString().trim() !== reservationId)
      .reduce((sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'), 0);
    const currentRecordReservedQty = activeReservations
      .filter(record => this.readRecordFieldString(record, 'RESOURCE_FORM_KEY') === resourceFormKey)
      .filter(record => this.readRecordFieldString(record, 'RESOURCE_RECORD_ID') === resourceRecordId)
      .filter(record => this.readRecordFieldString(record, 'SOURCE_FORM_KEY') === sourceFormKey)
      .filter(record => this.readRecordFieldString(record, 'SOURCE_RECORD_ID') === sourceRecordId)
      .reduce((sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'), 0);

    const remainingQuantity = this.readNumericRecordField(inventoryRecord, fieldIds.quantityFieldId);
    const inventoryStatus = fieldIds.statusFieldId ? this.readRecordFieldString(inventoryRecord, fieldIds.statusFieldId) : '';
    const allowedStatuses = (Array.isArray(request.allowedStatuses) && request.allowedStatuses.length
      ? request.allowedStatuses
      : ['available']
    )
      .map(value => (value || '').toString().trim().toLowerCase())
      .filter(Boolean);
    if (requestedQty > 0 && allowedStatuses.length > 0) {
      const normalizedStatus = (inventoryStatus || '').toString().trim().toLowerCase();
      if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
        return {
          success: false,
          conflict: true,
          message: `This inventory item is not available for reservation (${inventoryStatus || 'unknown status'}).`,
          reservationId,
          availability: this.buildInventoryAvailabilitySnapshot({
            inventoryRecord,
            fieldIds,
            resourceFormKey,
            resourceRecordId,
            resourceItemId: request.resourceItemId || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_ID'),
            resourceKind: request.resourceKind || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_KIND'),
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
        message: `Only ${this.formatReservationQuantity(maxAllowedQuantity)} ${this.readRecordFieldString(inventoryRecord, fieldIds.unitFieldId) || ''}`.trim(),
        reservationId,
        availability: this.buildInventoryAvailabilitySnapshot({
          inventoryRecord,
          fieldIds,
          resourceFormKey,
          resourceRecordId,
          resourceItemId: request.resourceItemId || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_ID'),
          resourceKind: request.resourceKind || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_KIND'),
          reservedQuantity: reservedByOthers + currentReservationQty,
          currentReservationQuantity: currentReservationQty,
          currentRecordReservedQuantity: currentRecordReservedQty
        })
      };
    }

    const touchedForms = options?.touchedForms || new Map<string, { form: FormConfig; questions: QuestionConfig[] }>();
    const ledgerValues: Record<string, any> = {
      RESERVATION_ID: reservationId,
      RESOURCE_FORM_KEY: resourceFormKey,
      RESOURCE_RECORD_ID: resourceRecordId,
      RESOURCE_ITEM_ID: request.resourceItemId || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_ID'),
      RESOURCE_KIND: request.resourceKind || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_KIND'),
      RESOURCE_QTY_FIELD_ID: fieldIds.quantityFieldId,
      RESOURCE_RESERVED_QTY_FIELD_ID: fieldIds.reservedQuantityFieldId,
      RESOURCE_STATUS_FIELD_ID: fieldIds.statusFieldId || '',
      RESOURCE_UNIT_FIELD_ID: fieldIds.unitFieldId || '',
      RESERVED_QTY: requestedQty > 0 ? this.formatReservationQuantity(requestedQty) : 0,
      RESERVED_UNIT: request.unit || this.readRecordFieldString(inventoryRecord, fieldIds.unitFieldId),
      STATUS: requestedQty > 0 ? 'active' : 'released',
      SOURCE_FORM_KEY: sourceFormKey,
      SOURCE_RECORD_ID: sourceRecordId,
      SOURCE_PARENT_GROUP_ID: (request.sourceParentGroupId || '').toString(),
      SOURCE_PARENT_ROW_ID: (request.sourceParentRowId || '').toString(),
      SOURCE_OUTPUT_GROUP_ID: (request.sourceOutputGroupId || '').toString(),
      SOURCE_OUTPUT_ROW_ID: (request.sourceOutputRowId || '').toString(),
      SOURCE_OUTPUT_KEY_FIELD_ID: (request.sourceOutputKeyFieldId || '').toString()
    };

    if (requestedQty > 0 || currentReservation) {
      const saveResult = this.saveInternalRecord({
        context: ledgerContext,
        recordId: reservationId,
        language: currentReservation?.language || 'EN',
        status: requestedQty > 0 ? 'active' : 'released',
        values: ledgerValues,
        auditAction: requestedQty > 0 ? 'inventoryReservation:upsert' : 'inventoryReservation:release',
        queue: options?.pendingSaves
      });
      if (!saveResult.success) {
        return {
          success: false,
          message: saveResult.message || 'Failed to save reservation ledger row.'
        };
      }
      touchedForms.set(ledgerFormKey, ledgerContext);
    }

    const nextReservedQuantity = reservedByOthers + Math.max(0, requestedQty);
    const inventoryContext = this.getFormContextLite(resourceFormKey);
    const nextInventoryValues = cloneRecordValues(inventoryRecord.values || {});
    nextInventoryValues[fieldIds.reservedQuantityFieldId] = this.formatReservationQuantity(nextReservedQuantity);
    if (fieldIds.statusFieldId && !this.readRecordFieldString(inventoryRecord, fieldIds.statusFieldId)) {
      nextInventoryValues[fieldIds.statusFieldId] = 'available';
    }
    const inventorySaveResult = this.saveInternalRecord({
      context: inventoryContext,
      recordId: resourceRecordId,
      language: inventoryRecord.language || 'EN',
      status: fieldIds.statusFieldId ? (nextInventoryValues[fieldIds.statusFieldId] || inventoryRecord.status || '').toString() : inventoryRecord.status,
      values: nextInventoryValues,
      auditAction: 'inventoryReservation:updateAggregate',
      queue: options?.pendingSaves
    });
      if (!inventorySaveResult.success) {
        return {
          success: false,
          message: inventorySaveResult.message || 'Failed to update inventory aggregate reservation.'
        };
    }
    touchedForms.set(resourceFormKey, inventoryContext);

    if (!options?.touchedForms) {
      const refreshMode = this.normalizeReservationRefreshMode(options?.refreshMode, 'revisionOnly');
      if (refreshMode !== 'none') {
        this.refreshFormBackedReadCaches(touchedForms, 'inventoryReservation.upsert');
        touchedForms.forEach(target => {
          this.refreshMutationCaches(target.form, target.questions, 'inventoryReservation.upsert', refreshMode);
        });
      }
    }

    const currentRecordReservedNext = currentRecordReservedQty - currentReservationQty + Math.max(0, requestedQty);
    const refreshedInventory = {
      ...inventoryRecord,
      values: nextInventoryValues,
      status: fieldIds.statusFieldId
        ? (nextInventoryValues[fieldIds.statusFieldId] || inventoryRecord.status || '').toString()
        : inventoryRecord.status
    } as WebFormSubmission;
    if (batchCache) {
      batchCache.inventoryRecordsByResource.set(resourceKey, refreshedInventory);
      const nextActiveReservations = activeReservations.filter(record => (record.id || '').toString().trim() !== reservationId);
      if (requestedQty > 0) {
        const nextReservationRecord = this.buildCachedReservationRecord({
          reservationId,
          ledgerFormKey,
          language: currentReservation?.language || 'EN',
          status: 'active',
          values: ledgerValues,
          existingRecord: currentReservation
        });
        nextActiveReservations.push(nextReservationRecord);
      }
      batchCache.activeReservationsByResource.set(resourceKey, nextActiveReservations);
    }
    const availability = this.buildInventoryAvailabilitySnapshot({
      inventoryRecord: refreshedInventory,
      fieldIds,
      resourceFormKey,
      resourceRecordId,
      resourceItemId: request.resourceItemId || this.readRecordFieldString(refreshedInventory, 'LEFTOVER_ID'),
      resourceKind: request.resourceKind || this.readRecordFieldString(refreshedInventory, 'LEFTOVER_KIND'),
      reservedQuantity: nextReservedQuantity,
      currentReservationQuantity: Math.max(0, requestedQty),
      currentRecordReservedQuantity: Math.max(0, currentRecordReservedNext)
    });

    debugLog('inventoryReservation.upsert.ok', {
      resourceFormKey,
      resourceRecordId,
      reservationId,
      requestedQty,
      released: requestedQty <= 0,
      freeQuantity: availability.freeQuantity
    });

    return {
      success: true,
      message: requestedQty > 0 ? 'Reservation updated.' : 'Reservation released.',
      reservationId,
      released: requestedQty <= 0,
      availability
    };
  }

  private normalizeReservationRefreshMode(
    value: any,
    fallback: 'full' | 'revisionOnly' | 'none'
  ): 'full' | 'revisionOnly' | 'none' {
    return value === 'full' || value === 'revisionOnly' || value === 'none' ? value : fallback;
  }

  private normalizeReservationOutputGroupId(rawOutputGroupId: any, rawOutputRowId?: any): string {
    const outputGroupId = (rawOutputGroupId || '').toString().trim();
    if (!outputGroupId) return '';
    const outputRowId = (rawOutputRowId || '').toString().trim();
    if (outputRowId && outputGroupId === outputRowId) {
      const suffixIndex = outputGroupId.lastIndexOf('_');
      if (suffixIndex > 0) {
        const candidate = outputGroupId.slice(0, suffixIndex).trim();
        if (candidate) return candidate;
      }
    }
    return outputGroupId;
  }

  private normalizeReservationPlanScopes(raw: InventoryReservationPlanScope[] | undefined | null): InventoryReservationPlanScope[] {
    const seen = new Set<string>();
    return (Array.isArray(raw) ? raw : [])
      .map(scope => ({
        sourceParentGroupId: (scope?.sourceParentGroupId || '').toString().trim() || undefined,
        sourceParentRowId: (scope?.sourceParentRowId || '').toString().trim() || undefined,
        sourceOutputGroupId: (scope?.sourceOutputGroupId || '').toString().trim() || undefined
      }))
      .filter(scope => scope.sourceParentGroupId || scope.sourceParentRowId || scope.sourceOutputGroupId)
      .filter(scope => {
        const key = [
          scope.sourceParentGroupId || '',
          scope.sourceParentRowId || '',
          scope.sourceOutputGroupId || ''
        ].join('::');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private normalizeReservationPlanEntries(args: {
    sourceFormKey: string;
    sourceRecordId: string;
    ledgerFormKey?: string;
    entries?: InventoryReservationPlanEntry[] | null;
  }): InventoryReservationMutationRequest[] {
    return (Array.isArray(args.entries) ? args.entries : [])
      .map(entry => {
        const resourceFormKey = (entry?.resourceFormKey || '').toString().trim();
        const resourceRecordId = (entry?.resourceRecordId || '').toString().trim();
        if (!resourceFormKey || !resourceRecordId) return null;
        return {
          resourceFormKey,
          resourceRecordId,
          resourceItemId: (entry?.resourceItemId || '').toString().trim() || undefined,
          resourceKind: (entry?.resourceKind || '').toString().trim() || undefined,
          quantity: entry?.quantity ?? 0,
          unit: (entry?.unit || '').toString().trim() || undefined,
          sourceFormKey: args.sourceFormKey,
          sourceRecordId: args.sourceRecordId,
          sourceParentGroupId: (entry?.sourceParentGroupId || '').toString().trim() || undefined,
          sourceParentRowId: (entry?.sourceParentRowId || '').toString().trim() || undefined,
          sourceOutputGroupId: (entry?.sourceOutputGroupId || '').toString().trim() || undefined,
          sourceOutputRowId: (entry?.sourceOutputRowId || '').toString().trim() || undefined,
          sourceOutputKeyFieldId: (entry?.sourceOutputKeyFieldId || '').toString().trim() || undefined,
          ledgerFormKey: (args.ledgerFormKey || '').toString().trim() || undefined,
          quantityFieldId: (entry?.quantityFieldId || '').toString().trim() || undefined,
          reservedQuantityFieldId: (entry?.reservedQuantityFieldId || '').toString().trim() || undefined,
          statusFieldId: (entry?.statusFieldId || '').toString().trim() || undefined,
          unitFieldId: (entry?.unitFieldId || '').toString().trim() || undefined,
          allowedStatuses: Array.isArray(entry?.allowedStatuses) ? entry.allowedStatuses : undefined
        } as InventoryReservationMutationRequest;
      })
      .filter((entry): entry is InventoryReservationMutationRequest => Boolean(entry));
  }

  private matchesInventoryReservationScope(
    record: WebFormSubmission,
    scopes: InventoryReservationPlanScope[]
  ): boolean {
    return scopes.some(scope => {
      if (scope.sourceParentGroupId) {
        const value = this.readRecordFieldString(record, 'SOURCE_PARENT_GROUP_ID');
        if (value !== scope.sourceParentGroupId) return false;
      }
      if (scope.sourceParentRowId) {
        const value = this.readRecordFieldString(record, 'SOURCE_PARENT_ROW_ID');
        if (value !== scope.sourceParentRowId) return false;
      }
      if (scope.sourceOutputGroupId) {
        const value = this.normalizeReservationOutputGroupId(
          this.readRecordFieldString(record, 'SOURCE_OUTPUT_GROUP_ID'),
          this.readRecordFieldString(record, 'SOURCE_OUTPUT_ROW_ID')
        );
        if (value !== scope.sourceOutputGroupId) return false;
      }
      return true;
    });
  }

  private validateInventoryReservationPlan(args: {
    desiredEntries: InventoryReservationMutationRequest[];
    desiredReservationIds: Set<string>;
    releaseCandidates: WebFormSubmission[];
    batchCache?: InventoryReservationBatchCache;
  }): InventoryReservationPlanResult | null {
    if (!args.desiredEntries.length) return null;

    const releaseReservationIds = new Set(
      args.releaseCandidates
        .map(record => (record.id || '').toString().trim())
        .filter(Boolean)
    );
    const entriesByResource = new Map<
      string,
      {
        inventoryRecord: WebFormSubmission;
        fieldIds: InventoryReservationFieldIds;
        requests: Array<{ request: InventoryReservationMutationRequest; reservationId: string; requestedQty: number }>;
        activeReservations: WebFormSubmission[];
      }
    >();

    for (const request of args.desiredEntries) {
      const requestedQty = this.normalizeReservationQuantity(request.quantity);
      if (requestedQty === null) {
        return {
          success: false,
          message: 'Reservation quantity must be numeric.'
        };
      }
      const resourceKey = `${request.resourceFormKey}::${request.resourceRecordId}`;
      let entry = entriesByResource.get(resourceKey);
      if (!entry) {
        let inventoryRecord =
          args.batchCache?.inventoryRecordsByResource.get(resourceKey) ||
          this.fetchSubmissionById(request.resourceFormKey, request.resourceRecordId);
        if (inventoryRecord && args.batchCache) {
          args.batchCache.inventoryRecordsByResource.set(resourceKey, inventoryRecord);
        }
        if (!inventoryRecord) {
          return {
            success: false,
            message: `Inventory record not found: ${request.resourceFormKey} / ${request.resourceRecordId}.`
          };
        }
        const fieldIds = this.resolveReservationFieldIds({
          resourceKind: request.resourceKind || this.readRecordFieldString(inventoryRecord, 'LEFTOVER_KIND'),
          quantityFieldId: request.quantityFieldId,
          reservedQuantityFieldId: request.reservedQuantityFieldId,
          statusFieldId: request.statusFieldId,
          unitFieldId: request.unitFieldId
        });
        const activeReservations = (
          args.batchCache
            ? args.batchCache.activeReservationsByResource.get(resourceKey) || []
            : (() => {
                const ledgerFormKey = (request.ledgerFormKey || 'Config: Inventory Reservation Ledger').toString().trim();
                const ledgerContext = this.getFormContextLite(ledgerFormKey);
                return this.fetchSubmissionRecordsByFieldCriteria(ledgerContext.form, ledgerContext.questions, [
                  { fieldId: 'STATUS', expected: 'active' },
                  { fieldId: 'RESOURCE_FORM_KEY', expected: request.resourceFormKey },
                  { fieldId: 'RESOURCE_RECORD_ID', expected: request.resourceRecordId }
                ]).filter(record => this.isActiveReservationRecord(record));
              })()
        ).slice();
        entry = {
          inventoryRecord,
          fieldIds,
          requests: [],
          activeReservations
        };
        entriesByResource.set(resourceKey, entry);
      }

      const reservationId = this.buildInventoryReservationId({
        resourceFormKey: request.resourceFormKey,
        resourceRecordId: request.resourceRecordId,
        resourceItemId: request.resourceItemId,
        sourceFormKey: request.sourceFormKey,
        sourceRecordId: request.sourceRecordId,
        sourceParentGroupId: request.sourceParentGroupId,
        sourceParentRowId: request.sourceParentRowId,
        sourceOutputRowId: request.sourceOutputRowId
      });
      entry.requests.push({ request, reservationId, requestedQty });
    }

    for (const [resourceKey, entry] of entriesByResource.entries()) {
      const positiveRequests = entry.requests.filter(item => item.requestedQty > 0);
      const remainingQuantity = this.readNumericRecordField(entry.inventoryRecord, entry.fieldIds.quantityFieldId);
      const inventoryStatus = entry.fieldIds.statusFieldId
        ? this.readRecordFieldString(entry.inventoryRecord, entry.fieldIds.statusFieldId)
        : '';
      const allowedStatuses = Array.from(
        new Set(
          positiveRequests.flatMap(item =>
            (Array.isArray(item.request.allowedStatuses) && item.request.allowedStatuses.length
              ? item.request.allowedStatuses
              : ['available']
            )
              .map(value => (value || '').toString().trim().toLowerCase())
              .filter(Boolean)
          )
        )
      );
      if (positiveRequests.length && allowedStatuses.length) {
        const normalizedStatus = (inventoryStatus || '').toString().trim().toLowerCase();
        if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
          return {
            success: false,
            conflict: true,
            message: `This inventory item is not available for reservation (${inventoryStatus || 'unknown status'}).`,
            availability: [
              this.buildInventoryAvailabilitySnapshot({
                inventoryRecord: entry.inventoryRecord,
                fieldIds: entry.fieldIds,
                resourceFormKey: positiveRequests[0].request.resourceFormKey,
                resourceRecordId: positiveRequests[0].request.resourceRecordId,
                resourceItemId: positiveRequests[0].request.resourceItemId || this.readRecordFieldString(entry.inventoryRecord, 'LEFTOVER_ID'),
                resourceKind: positiveRequests[0].request.resourceKind || this.readRecordFieldString(entry.inventoryRecord, 'LEFTOVER_KIND'),
                reservedQuantity: entry.activeReservations.reduce(
                  (sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'),
                  0
                ),
                currentReservationQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0),
                currentRecordReservedQuantity: positiveRequests.reduce((sum, item) => sum + item.requestedQty, 0)
              })
            ]
          };
        }
      }

      const desiredIdsForResource = new Set(entry.requests.map(item => item.reservationId));
      const preservedReservations = entry.activeReservations.filter(record => {
        const recordId = (record.id || '').toString().trim();
        return !releaseReservationIds.has(recordId);
      });
      const reservedByOthers = preservedReservations
        .filter(record => !desiredIdsForResource.has((record.id || '').toString().trim()))
        .reduce((sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'), 0);
      const desiredTotal = entry.requests.reduce((sum, item) => sum + Math.max(0, item.requestedQty), 0);
      const maxAllowedQuantity = Math.max(0, remainingQuantity - reservedByOthers);
      if (desiredTotal > maxAllowedQuantity + 1e-9) {
        const first = entry.requests[0];
        return {
          success: false,
          conflict: true,
          message: `Only ${this.formatReservationQuantity(maxAllowedQuantity)} ${this.readRecordFieldString(entry.inventoryRecord, entry.fieldIds.unitFieldId) || ''}`.trim(),
          availability: [
            this.buildInventoryAvailabilitySnapshot({
              inventoryRecord: entry.inventoryRecord,
              fieldIds: entry.fieldIds,
              resourceFormKey: first.request.resourceFormKey,
              resourceRecordId: first.request.resourceRecordId,
              resourceItemId: first.request.resourceItemId || this.readRecordFieldString(entry.inventoryRecord, 'LEFTOVER_ID'),
              resourceKind: first.request.resourceKind || this.readRecordFieldString(entry.inventoryRecord, 'LEFTOVER_KIND'),
              reservedQuantity: reservedByOthers + desiredTotal,
              currentReservationQuantity: desiredTotal,
              currentRecordReservedQuantity: desiredTotal
            })
          ]
        };
      }

      debugLog('inventoryReservation.applyPlan.validatedResource', {
        resourceKey,
        desiredCount: entry.requests.length,
        desiredTotal,
        reservedByOthers,
        remainingQuantity
      });
    }

    return null;
  }

  private buildInventoryReservationReleaseRequest(
    reservationRecord: WebFormSubmission,
    ledgerFormKey: string
  ): InventoryReservationMutationRequest {
    return {
      resourceFormKey: this.readRecordFieldString(reservationRecord, 'RESOURCE_FORM_KEY'),
      resourceRecordId: this.readRecordFieldString(reservationRecord, 'RESOURCE_RECORD_ID'),
      resourceItemId: this.readRecordFieldString(reservationRecord, 'RESOURCE_ITEM_ID') || undefined,
      resourceKind: this.readRecordFieldString(reservationRecord, 'RESOURCE_KIND') || undefined,
      quantity: 0,
      unit: this.readRecordFieldString(reservationRecord, 'RESERVED_UNIT') || undefined,
      sourceFormKey: this.readRecordFieldString(reservationRecord, 'SOURCE_FORM_KEY'),
      sourceRecordId: this.readRecordFieldString(reservationRecord, 'SOURCE_RECORD_ID'),
      sourceParentGroupId: this.readRecordFieldString(reservationRecord, 'SOURCE_PARENT_GROUP_ID') || undefined,
      sourceParentRowId: this.readRecordFieldString(reservationRecord, 'SOURCE_PARENT_ROW_ID') || undefined,
      sourceOutputGroupId: this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_GROUP_ID') || undefined,
      sourceOutputRowId: this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_ROW_ID') || undefined,
      sourceOutputKeyFieldId: this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_KEY_FIELD_ID') || undefined,
      ledgerFormKey,
      quantityFieldId: this.readRecordFieldString(reservationRecord, 'RESOURCE_QTY_FIELD_ID') || undefined,
      reservedQuantityFieldId: this.readRecordFieldString(reservationRecord, 'RESOURCE_RESERVED_QTY_FIELD_ID') || undefined,
      statusFieldId: this.readRecordFieldString(reservationRecord, 'RESOURCE_STATUS_FIELD_ID') || undefined,
      unitFieldId: this.readRecordFieldString(reservationRecord, 'RESOURCE_UNIT_FIELD_ID') || undefined
    };
  }

  private collectUniqueReservationAvailabilitySnapshots(
    snapshots: InventoryAvailabilitySnapshot[]
  ): InventoryAvailabilitySnapshot[] | undefined {
    const byKey = new Map<string, InventoryAvailabilitySnapshot>();
    (snapshots || []).forEach(snapshot => {
      const key = [
        snapshot.resourceFormKey || '',
        snapshot.resourceRecordId || '',
        snapshot.resourceItemId || ''
      ].join('::');
      if (!key) return;
      byKey.set(key, snapshot);
    });
    const items = Array.from(byKey.values());
    return items.length ? items : undefined;
  }

  public reconcileInventoryReservations(
    request: InventoryReservationReconciliationRequest
  ): InventoryReservationReconciliationResult {
    return this.finalizeInventoryReservations({ ...request, mode: request?.mode || 'consume' });
  }

  public releaseInventoryReservations(
    request: InventoryReservationReconciliationRequest
  ): InventoryReservationReconciliationResult {
    return this.finalizeInventoryReservations({ ...request, mode: 'release' });
  }

  private finalizeInventoryReservations(
    request: InventoryReservationReconciliationRequest
  ): InventoryReservationReconciliationResult {
    const sourceFormKey = (request?.sourceFormKey || '').toString().trim();
    const sourceRecordId = (request?.sourceRecordId || '').toString().trim();
    if (!sourceFormKey || !sourceRecordId) {
      return {
        success: false,
        message: 'sourceFormKey and sourceRecordId are required.'
      };
    }
    const mode = request?.mode === 'release' ? 'release' : 'consume';
    const refreshMode = (
      request?.refreshMode === 'revisionOnly' || request?.refreshMode === 'none'
        ? request.refreshMode
        : 'full'
    ) as 'full' | 'revisionOnly' | 'none';

    try {
      return this.withDocumentTransactionLock('inventoryReservation.reconcile', () => {
        const ledgerFormKey = (request?.ledgerFormKey || 'Config: Inventory Reservation Ledger').toString().trim();
        const ledgerContext = this.getFormContextLite(ledgerFormKey);
        const sourceRecord = this.fetchSubmissionById(sourceFormKey, sourceRecordId);
        const activeReservations = this.fetchSubmissionRecordsByFieldCriteria(ledgerContext.form, ledgerContext.questions, [
          { fieldId: 'STATUS', expected: 'active' },
          { fieldId: 'SOURCE_FORM_KEY', expected: sourceFormKey },
          { fieldId: 'SOURCE_RECORD_ID', expected: sourceRecordId }
        ]).filter(record => this.isActiveReservationRecord(record));

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

      const touchedForms = new Map<string, { form: FormConfig; questions: QuestionConfig[] }>();
      touchedForms.set(ledgerFormKey, ledgerContext);

      const grouped = new Map<
        string,
        {
          resourceFormKey: string;
          resourceRecordId: string;
          resourceItemId: string;
          inventoryRecord: WebFormSubmission | null;
          consume: WebFormSubmission[];
          release: WebFormSubmission[];
        }
      >();
      activeReservations.forEach(record => {
        const resolvedInventory = this.resolveInventoryRecordForReservation(record);
        const resourceFormKey = resolvedInventory.resourceFormKey || this.readRecordFieldString(record, 'RESOURCE_FORM_KEY');
        const resourceRecordId = resolvedInventory.resourceRecordId || this.readRecordFieldString(record, 'RESOURCE_RECORD_ID');
        const rowMode =
          mode === 'release' || !this.shouldConsumeActiveReservationRecord(sourceRecord, record) ? 'release' : 'consume';
        const key = `${resourceFormKey}::${resourceRecordId}`;
        const entry = grouped.get(key) || {
          resourceFormKey,
          resourceRecordId,
          resourceItemId: resolvedInventory.resourceItemId || this.readRecordFieldString(record, 'RESOURCE_ITEM_ID'),
          inventoryRecord: resolvedInventory.inventoryRecord,
          consume: [],
          release: []
        };
        if (!entry.inventoryRecord && resolvedInventory.inventoryRecord) {
          entry.inventoryRecord = resolvedInventory.inventoryRecord;
        }
        if (!entry.resourceItemId && resolvedInventory.resourceItemId) {
          entry.resourceItemId = resolvedInventory.resourceItemId;
        }
        entry[rowMode].push(record);
        grouped.set(key, entry);
      });

      const availability: InventoryAvailabilitySnapshot[] = [];
      let consumedReservations = 0;
      let releasedReservations = 0;
      grouped.forEach(groupEntry => {
        const { resourceFormKey, resourceRecordId, resourceItemId, inventoryRecord } = groupEntry;
        if (!inventoryRecord) {
          throw new Error(
            `Inventory record not found during reconciliation: ${resourceFormKey} / ${resourceRecordId || resourceItemId}.`
          );
        }
        const rows = [...groupEntry.consume, ...groupEntry.release];
        const first = rows[0];
        const fieldIds = this.resolveReservationFieldIds({
          resourceKind: this.readRecordFieldString(first, 'RESOURCE_KIND'),
          quantityFieldId: this.readRecordFieldString(first, 'RESOURCE_QTY_FIELD_ID'),
          reservedQuantityFieldId: this.readRecordFieldString(first, 'RESOURCE_RESERVED_QTY_FIELD_ID'),
          statusFieldId: this.readRecordFieldString(first, 'RESOURCE_STATUS_FIELD_ID'),
          unitFieldId: this.readRecordFieldString(first, 'RESOURCE_UNIT_FIELD_ID')
        });
        const consumedQuantity = groupEntry.consume.reduce(
          (sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'),
          0
        );
        const releasedQuantity = groupEntry.release.reduce(
          (sum, record) => sum + this.readNumericRecordField(record, 'RESERVED_QTY'),
          0
        );
        const totalClosedQuantity = consumedQuantity + releasedQuantity;
        const remainingQuantity = this.readNumericRecordField(inventoryRecord, fieldIds.quantityFieldId);
        const reservedQuantity = this.readNumericRecordField(inventoryRecord, fieldIds.reservedQuantityFieldId);
        if (mode === 'consume' && consumedQuantity > remainingQuantity + 1e-9) {
          throw new Error(
            `Reservation reconciliation exceeds remaining quantity for ${resourceFormKey} / ${resourceRecordId}.`
          );
        }
        const nextRemainingQuantity = mode === 'consume' ? Math.max(0, remainingQuantity - consumedQuantity) : remainingQuantity;
        const nextReservedQuantity = Math.max(0, reservedQuantity - totalClosedQuantity);
        const nextInventoryValues = cloneRecordValues(inventoryRecord.values || {});
        nextInventoryValues[fieldIds.quantityFieldId] = this.formatReservationQuantity(nextRemainingQuantity);
        nextInventoryValues[fieldIds.reservedQuantityFieldId] = this.formatReservationQuantity(nextReservedQuantity);
        if (fieldIds.statusFieldId && consumedQuantity > 0) {
          nextInventoryValues[fieldIds.statusFieldId] = nextRemainingQuantity > 0 ? 'available' : 'used';
        }
        if (consumedQuantity > 0 && Object.prototype.hasOwnProperty.call(nextInventoryValues, 'LEFTOVER_USED_BY_FORM_KEY')) {
          nextInventoryValues.LEFTOVER_USED_BY_FORM_KEY = sourceFormKey;
        }
        if (consumedQuantity > 0 && Object.prototype.hasOwnProperty.call(nextInventoryValues, 'LEFTOVER_USED_BY_RECORD_ID')) {
          nextInventoryValues.LEFTOVER_USED_BY_RECORD_ID = sourceRecordId;
        }
        const inventoryContext = this.getFormContextLite(resourceFormKey);
        const inventorySaveResult = this.saveInternalRecord({
          context: inventoryContext,
          recordId: resourceRecordId,
          language: inventoryRecord.language || 'EN',
          status: fieldIds.statusFieldId ? (nextInventoryValues[fieldIds.statusFieldId] || '').toString() : inventoryRecord.status,
          values: nextInventoryValues,
          auditAction: 'inventoryReservation:reconcile'
        });
        if (!inventorySaveResult.success) {
          throw new Error(inventorySaveResult.message || 'Failed to reconcile inventory reservation.');
        }
        touchedForms.set(resourceFormKey, inventoryContext);
        availability.push(
          this.buildInventoryAvailabilitySnapshot({
            inventoryRecord: { ...inventoryRecord, values: nextInventoryValues } as WebFormSubmission,
            fieldIds,
            resourceFormKey,
            resourceRecordId,
            resourceItemId: this.readRecordFieldString(first, 'RESOURCE_ITEM_ID'),
            resourceKind: this.readRecordFieldString(first, 'RESOURCE_KIND'),
            reservedQuantity: nextReservedQuantity,
            currentReservationQuantity: 0,
            currentRecordReservedQuantity: 0
          })
        );

        groupEntry.consume.forEach(record => {
          const nextReservationValues = cloneRecordValues(record.values || {});
          nextReservationValues.STATUS = 'consumed';
          if (resourceFormKey) nextReservationValues.RESOURCE_FORM_KEY = resourceFormKey;
          if (resourceRecordId) nextReservationValues.RESOURCE_RECORD_ID = resourceRecordId;
          const saveResult = this.saveInternalRecord({
            context: ledgerContext,
            recordId: (record.id || '').toString().trim(),
            language: record.language || 'EN',
            status: 'consumed',
            values: nextReservationValues,
            auditAction: 'inventoryReservation:consume'
          });
          if (!saveResult.success) {
            throw new Error(saveResult.message || 'Failed to close reservation ledger row.');
          }
        });
        groupEntry.release.forEach(record => {
          const nextReservationValues = cloneRecordValues(record.values || {});
          nextReservationValues.STATUS = 'released';
          if (resourceFormKey) nextReservationValues.RESOURCE_FORM_KEY = resourceFormKey;
          if (resourceRecordId) nextReservationValues.RESOURCE_RECORD_ID = resourceRecordId;
          const saveResult = this.saveInternalRecord({
            context: ledgerContext,
            recordId: (record.id || '').toString().trim(),
            language: record.language || 'EN',
            status: 'released',
            values: nextReservationValues,
            auditAction: 'inventoryReservation:release'
          });
          if (!saveResult.success) {
            throw new Error(saveResult.message || 'Failed to close reservation ledger row.');
          }
        });
        consumedReservations += groupEntry.consume.length;
        releasedReservations += groupEntry.release.length;
      });

      if (refreshMode !== 'none') {
        this.refreshFormBackedReadCaches(touchedForms, 'inventoryReservation.reconcile');
        touchedForms.forEach(target => {
          this.refreshMutationCaches(target.form, target.questions, 'inventoryReservation.reconcile', refreshMode);
        });
      }

      debugLog('inventoryReservation.reconcile.ok', {
        sourceFormKey,
        sourceRecordId,
        reconciledReservations: activeReservations.length,
        consumedReservations,
        releasedReservations,
        touchedInventoryRecords: grouped.size
      });

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
      });
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || 'Could not acquire the reservation transaction lock. Please retry.').toString()
      };
    }
  }

  private shouldConsumeActiveReservationRecord(
    sourceRecord: WebFormSubmission | null,
    reservationRecord: WebFormSubmission
  ): boolean {
    if (!sourceRecord) return true;
    const parentGroupId = this.readRecordFieldString(reservationRecord, 'SOURCE_PARENT_GROUP_ID');
    const parentRowId = this.readRecordFieldString(reservationRecord, 'SOURCE_PARENT_ROW_ID');
    const outputGroupId = this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_GROUP_ID');
    const outputRowId = this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_ROW_ID');
    const outputGroupIds = Array.from(
      new Set(
        [
          outputGroupId,
          this.normalizeReservationOutputGroupId(outputGroupId, outputRowId)
        ]
          .map(value => (value || '').toString().trim())
          .filter(Boolean)
      )
    );
    const resourceItemId = this.readRecordFieldString(reservationRecord, 'RESOURCE_ITEM_ID');
    if (!parentGroupId || !outputGroupIds.length || !resourceItemId) return true;

    const parentRows = this.parseFollowupLineItemRows(
      (sourceRecord.values || {})[parentGroupId] || (sourceRecord.values || {})[`${parentGroupId}_json`]
    );
    if (!parentRows.length) return false;

    const configuredKeyFieldId = this.readRecordFieldString(reservationRecord, 'SOURCE_OUTPUT_KEY_FIELD_ID');
    const candidateKeyFieldIds = [
      configuredKeyFieldId,
      'LEFTOVER_ID',
      'RESOURCE_ITEM_ID',
      'ID',
      'id'
    ].filter(Boolean);

    const candidateParentRows = parentRowId
      ? parentRows.filter(candidate => this.normalizeFollowupLineItemRowId(candidate) === parentRowId)
      : parentRows;
    const rowsToSearch = candidateParentRows.length ? candidateParentRows : parentRows;

    return rowsToSearch.some(parentRow => {
      const outputRows = outputGroupIds.flatMap(groupId =>
        this.parseFollowupLineItemRows(parentRow[groupId] || parentRow[`${groupId}_json`])
      );
      if (!outputRows.length) return false;
      return outputRows.some(row =>
        candidateKeyFieldIds.some(fieldId => `${(row || {})[fieldId] ?? ''}`.trim() === resourceItemId)
      );
    });
  }

  public fetchSubmissionsByRowNumbers(formKey: string, rowNumbers: number[]): Record<string, WebFormSubmission> {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionsByRowNumbers(form, questions, rowNumbers);
  }

  /**
   * Cheap record version check used by the React client to validate cached records.
   */
  public getRecordVersion(
    formKey: string,
    recordId: string,
    rowNumberHint?: number
  ): { success: boolean; id?: string; rowNumber?: number; dataVersion?: number; updatedAt?: string; message?: string } {
    // Keep this very lightweight: avoid loading questions/dedup rules or ensuring destination headers.
    // The index sheet is designed so base columns are fixed and rows align with destination row numbers.
    const { form } = this.resolveFormOnly(formKey);
    return this.submissions.getRecordVersion(form, recordId, rowNumberHint);
  }

  private resolveReservationFinalSubmitStatuses(form: FormConfig): string[] {
    const raw = form.reservationLifecycle?.reconcileOnFinalSubmit;
    if (raw && typeof raw === 'object' && Array.isArray(raw.statuses) && raw.statuses.length) {
      return raw.statuses.map(value => (value || '').toString().trim().toLowerCase()).filter(Boolean);
    }
    const closeStatus = (form.followupConfig?.statusTransitions?.onClose || '').toString().trim();
    if (closeStatus) return [closeStatus.toLowerCase()];
    return ['closed'];
  }

  private shouldReconcileReservationsOnFinalSubmit(
    form: FormConfig,
    nextStatus: string
  ): {
    enabled: boolean;
    ledgerFormKey: string;
    refreshMode: 'full' | 'revisionOnly' | 'none';
  } {
    const raw = form.reservationLifecycle?.reconcileOnFinalSubmit;
    const enabled =
      raw === true ||
      (raw && typeof raw === 'object' && raw.enabled !== false);
    if (!enabled) {
      return {
        enabled: false,
        ledgerFormKey: '',
        refreshMode: 'full'
      };
    }
    const normalizedStatus = (nextStatus || '').toString().trim().toLowerCase();
    const statuses = this.resolveReservationFinalSubmitStatuses(form);
    if (!normalizedStatus || !statuses.includes(normalizedStatus)) {
      return {
        enabled: false,
        ledgerFormKey: '',
        refreshMode: 'full'
      };
    }
    const ledgerFormKey =
      (raw && typeof raw === 'object' ? raw.ledgerFormKey : '') ||
      form.reservationLifecycle?.ledgerFormKey ||
      'Config: Inventory Reservation Ledger';
    const refreshMode =
      raw &&
      typeof raw === 'object' &&
      (raw.refreshMode === 'full' || raw.refreshMode === 'revisionOnly' || raw.refreshMode === 'none')
        ? raw.refreshMode
        : 'full';
    return {
      enabled: true,
      ledgerFormKey: (ledgerFormKey || '').toString().trim() || 'Config: Inventory Reservation Ledger',
      refreshMode
    };
  }

  private resolveReservationReconciliationConfig(form: FormConfig): {
    enabled: boolean;
    ledgerFormKey: string;
    refreshMode: 'full' | 'revisionOnly' | 'none';
  } {
    const raw = form.reservationLifecycle?.reconcileOnFinalSubmit;
    const enabled =
      raw === true ||
      (raw && typeof raw === 'object' && raw.enabled !== false);
    if (!enabled) {
      return {
        enabled: false,
        ledgerFormKey: '',
        refreshMode: 'full'
      };
    }
    const ledgerFormKey =
      (raw && typeof raw === 'object' ? raw.ledgerFormKey : '') ||
      form.reservationLifecycle?.ledgerFormKey ||
      'Config: Inventory Reservation Ledger';
    const refreshMode =
      raw &&
      typeof raw === 'object' &&
      (raw.refreshMode === 'full' || raw.refreshMode === 'revisionOnly' || raw.refreshMode === 'none')
        ? raw.refreshMode
        : 'full';
    return {
      enabled: true,
      ledgerFormKey: (ledgerFormKey || '').toString().trim() || 'Config: Inventory Reservation Ledger',
      refreshMode
    };
  }

  private runFollowupActionWithLifecycle(
    formKey: string,
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    action: string,
    runtime?: { pdfArtifact?: GeneratedPdfArtifact | null }
  ): FollowupActionResult {
    const normalizedAction = (action || '').toString().trim().toUpperCase();
    if (normalizedAction === 'RECONCILE_RESERVATIONS') {
      const reconcileConfig = this.resolveReservationReconciliationConfig(form);
      if (!recordId) {
        return { success: false, message: 'Record ID is required.' };
      }
      if (!reconcileConfig.enabled) {
        return {
          success: false,
          message: 'Reservation reconciliation is not configured for this form.'
        };
      }
      const reconcileResult = this.reconcileInventoryReservations({
        sourceFormKey: formKey,
        sourceRecordId: recordId,
        ledgerFormKey: reconcileConfig.ledgerFormKey,
        refreshMode: reconcileConfig.refreshMode
      });
      if (!reconcileResult.success) {
        return {
          success: false,
          message: reconcileResult.message || 'Failed to reconcile active reservations.'
        };
      }
      return {
        success: true,
        reservationReconciliation: {
          success: true,
          sourceRecordId: recordId,
          reconciledReservations: Number(reconcileResult.reconciledReservations || 0) || 0,
          consumedReservations: Number(reconcileResult.consumedReservations || 0) || 0,
          releasedReservations: Number(reconcileResult.releasedReservations || 0) || 0,
          touchedInventoryRecords: Number(reconcileResult.touchedInventoryRecords || 0) || 0
        }
      };
    }

    let result = this.followups.triggerFollowupAction(form, questions, recordId, action, runtime);
    if (result?.success && normalizedAction === 'CLOSE_RECORD') {
      const closeStatus = (result.status || form.followupConfig?.statusTransitions?.onClose || '').toString().trim();
      const submitEffectsResult = this.applySubmitEffectsForCurrentRecordState({
        form,
        questions,
        formKey,
        recordId,
        operation: 'update',
        statusOverride: closeStatus,
        updatedAt: result.updatedAt
      });
      if (!submitEffectsResult.success) {
        return {
          success: false,
          message: submitEffectsResult.message || 'Record closed but failed to apply submit effects.'
        };
      }
      if (submitEffectsResult.meta) {
        result.submitEffects = submitEffectsResult.meta;
      }
      const reconcileOnFinalSubmit = this.shouldReconcileReservationsOnFinalSubmit(form, closeStatus);
      if (recordId && reconcileOnFinalSubmit.enabled) {
        const reconcileResult = this.reconcileInventoryReservations({
          sourceFormKey: formKey,
          sourceRecordId: recordId,
          ledgerFormKey: reconcileOnFinalSubmit.ledgerFormKey,
          refreshMode: reconcileOnFinalSubmit.refreshMode
        });
        if (!reconcileResult.success) {
          return {
            success: false,
            message: reconcileResult.message || 'Record closed but failed to reconcile active reservations.'
          };
        }
        result.reservationReconciliation = {
          success: true,
          sourceRecordId: recordId,
          reconciledReservations: Number(reconcileResult.reconciledReservations || 0) || 0,
          consumedReservations: Number(reconcileResult.consumedReservations || 0) || 0,
          releasedReservations: Number(reconcileResult.releasedReservations || 0) || 0,
          touchedInventoryRecords: Number(reconcileResult.touchedInventoryRecords || 0) || 0
        };
      }
    }
    return result;
  }

  private runFollowupActionWithResilience(
    formKey: string,
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    action: string,
    touchLaneOwner?: () => void,
    runtime?: { pdfArtifact?: GeneratedPdfArtifact | null }
  ): FollowupActionResult {
    const normalizedAction = (action || '').toString().trim().toUpperCase();
    const retryDelaysMs =
      normalizedAction === 'RECONCILE_RESERVATIONS'
        ? RESERVATION_FOLLOWUP_RETRY_DELAYS_MS
        : [0];

    let lastResult: FollowupActionResult = {
      success: false,
      message: 'Failed to run follow-up action.'
    };

    for (let attemptIndex = 0; attemptIndex < retryDelaysMs.length; attemptIndex += 1) {
      const delayMs = retryDelaysMs[attemptIndex];
      if (delayMs > 0) {
        sleepWithUtilities(delayMs);
      }
      if (touchLaneOwner) touchLaneOwner();
      const result = this.runFollowupActionWithLifecycle(formKey, form, questions, recordId, action, runtime);
      lastResult = result;
      if (result.success || !isRetryableMutationLockErrorMessage(result.message)) {
        return result;
      }
      debugLog('followup.action.retry', {
        formKey,
        recordId,
        action: normalizedAction,
        attempt: attemptIndex + 1,
        attempts: retryDelaysMs.length,
        message: result.message || 'retryable failure'
      });
    }

    return lastResult;
  }

  private applySubmitEffectsForCurrentRecordState(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    formKey: string;
    recordId: string;
    operation: 'create' | 'update';
    statusOverride?: string;
    updatedAt?: string;
  }): { success: boolean; message?: string; meta?: any } {
    const recordId = (args.recordId || '').toString().trim();
    if (!recordId) {
      return { success: false, message: 'Record ID is required to apply submit effects.' };
    }
    const context = this.submissions.getRecordContext(args.form, args.questions, recordId);
    if (!context?.record) {
      return { success: false, message: 'Record not found while applying submit effects.' };
    }

    const sourceRecord = {
      ...(context.record as any),
      formKey: args.formKey,
      id: recordId
    } as WebFormSubmission;
    const statusOverride = (args.statusOverride || '').toString().trim();
    if (statusOverride) {
      (sourceRecord as any).__ckStatus = statusOverride;
      (sourceRecord as any).status = statusOverride;
    }

    return this.applyFollowupSubmitEffects({
      form: args.form,
      questions: args.questions,
      formKey: args.formKey,
      formObject: sourceRecord,
      saveResult: {
        success: true,
        message: '',
        meta: {
          id: recordId,
          createdAt: context.record.createdAt,
          updatedAt: args.updatedAt || context.record.updatedAt,
          operation: args.operation
        }
      },
      refreshMode: 'revisionOnly'
    });
  }

  public saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const recordId = this.ensureMutationRecordId(formObject);
    try {
      return this.withQueuedRecordMutation(formKey, recordId, 'saveSubmissionWithId', () =>
        this.saveSubmissionWithIdDirect(formObject)
      );
    } catch (err: any) {
      const message = (err?.message || 'Could not queue record save.').toString();
      debugLog('mutation.lane.save.error', {
        formKey,
        recordId: recordId || null,
        message
      });
      return {
        success: false,
        message,
        meta: {
          id: recordId || undefined
        }
      };
    }
  }

  private saveSubmissionWithIdDirect(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const recordId = this.ensureMutationRecordId(formObject);
    const { form, questions } = this.getFormContext(formKey);
    const dedupRules = this.resolveDedupRules(formKey, form);
    const result = this.saveSubmissionRecordWithRetry({
      formKey,
      recordId,
      reason: 'saveSubmissionWithId',
      formObject,
      form,
      questions,
      dedupRules
    });
    if (result?.success) {
      const operation = (result.meta?.operation || '').toString().trim().toLowerCase();
      if (operation === 'noop') {
        return result;
      }
      const savedRecordId = (result.meta?.id || (formObject as any).id || '').toString().trim();
      const nextStatus = (
        (formObject as any).__ckStatus !== undefined && (formObject as any).__ckStatus !== null
          ? (formObject as any).__ckStatus
          : ((formObject as any).status !== undefined && (formObject as any).status !== null ? (formObject as any).status : '')
      ).toString().trim();
      const deleteRecordId = ((formObject as any).__ckDeleteRecordId || '').toString().trim();
      const releaseOnDeleteConfig = form.reservationLifecycle?.releaseOnDelete;
      const releaseOnDeleteEnabled =
        releaseOnDeleteConfig === true ||
        (releaseOnDeleteConfig && typeof releaseOnDeleteConfig === 'object' && releaseOnDeleteConfig.enabled !== false);
      if (deleteRecordId && releaseOnDeleteEnabled) {
        const ledgerFormKey =
          (typeof releaseOnDeleteConfig === 'object' ? releaseOnDeleteConfig.ledgerFormKey : '') ||
          form.reservationLifecycle?.ledgerFormKey ||
          'Config: Inventory Reservation Ledger';
        const releaseResult = this.releaseInventoryReservations({
          sourceFormKey: formKey,
          sourceRecordId: deleteRecordId,
          ledgerFormKey,
          refreshMode: 'revisionOnly'
        });
        if (!releaseResult.success) {
          return {
            success: false,
            message: releaseResult.message || 'Record deleted but failed to release active reservations.',
            meta: {
              ...(result.meta || {}),
              reservationRelease: {
                success: false,
                sourceRecordId: deleteRecordId
              }
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
      const reconcileOnFinalSubmit = this.shouldReconcileReservationsOnFinalSubmit(form, nextStatus);
      if (savedRecordId && !deleteRecordId && reconcileOnFinalSubmit.enabled) {
        const reconcileResult = this.reconcileInventoryReservations({
          sourceFormKey: formKey,
          sourceRecordId: savedRecordId,
          ledgerFormKey: reconcileOnFinalSubmit.ledgerFormKey,
          refreshMode: reconcileOnFinalSubmit.refreshMode
        });
        if (!reconcileResult.success) {
          return {
            success: false,
            message: reconcileResult.message || 'Record saved but failed to reconcile active reservations.',
            meta: {
              ...(result.meta || {}),
              reservationReconciliation: {
                success: false,
                sourceRecordId: savedRecordId
              },
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
      const skipSubmitEffectsRaw = (formObject as any).__ckSkipSubmitEffects;
      const skipSubmitEffects =
        skipSubmitEffectsRaw === true ||
        skipSubmitEffectsRaw === 'true' ||
        skipSubmitEffectsRaw === '1' ||
        skipSubmitEffectsRaw === 1;
      if (!skipSubmitEffects) {
        const submitEffectsResult = this.applyFollowupSubmitEffects({
          form,
          questions,
          formKey,
          formObject,
          saveResult: result
        });
        if (!submitEffectsResult.success) {
          return {
            success: false,
            message: submitEffectsResult.message || result.message,
            meta: {
              ...(result.meta || {}),
              submitEffects: submitEffectsResult.meta || undefined,
              sourceSaved: true
            }
          };
        }
        if (submitEffectsResult.meta) {
          result.meta = {
            ...(result.meta || {}),
            submitEffects: submitEffectsResult.meta
          };
        }
      }
      const refreshMode = this.resolveSaveSubmissionRefreshMode(formObject, result);
      if (refreshMode !== 'none') {
        this.refreshMutationCaches(form, questions, 'saveSubmissionWithId', refreshMode);
      }
    }
    return result;
  }

  private saveSubmissionRecordWithRetry(args: {
    formKey: string;
    recordId: string;
    reason: string;
    formObject: WebFormSubmission;
    form: FormConfig;
    questions: QuestionConfig[];
    dedupRules: DedupRule[];
  }): { success: boolean; message: string; meta: any } {
    let lastResult: { success: boolean; message: string; meta: any } | null = null;
    for (let attemptIndex = 0; attemptIndex < USER_RECORD_SAVE_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = USER_RECORD_SAVE_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        sleepWithUtilities(delayMs);
      }
      const result = this.submissions.saveSubmissionWithId(args.formObject, args.form, args.questions, args.dedupRules);
      lastResult = result;
      if (result.success || !isRetryableMutationLockErrorMessage(result.message)) {
        return result;
      }
      debugLog('saveSubmission.retry', {
        formKey: args.formKey,
        recordId: args.recordId || null,
        reason: args.reason,
        attempt: attemptIndex + 1,
        attempts: USER_RECORD_SAVE_RETRY_DELAYS_MS.length,
        message: result.message || 'retryable failure'
      });
    }
    return lastResult || {
      success: false,
      message: 'Failed to save record.',
      meta: {
        id: args.recordId || undefined
      }
    };
  }

  private resolveSaveSubmissionRefreshMode(
    formObject: WebFormSubmission,
    result: { success: boolean; message: string; meta: any }
  ): 'full' | 'revisionOnly' | 'none' {
    const operation = (result?.meta?.operation || '').toString().trim().toLowerCase();
    if (operation === 'noop') return 'none';

    const saveMode = ((formObject as any).__ckSaveMode || '').toString().trim().toLowerCase();
    const skipSubmitEffectsRaw = (formObject as any).__ckSkipSubmitEffects;
    const skipSubmitEffects =
      skipSubmitEffectsRaw === true ||
      skipSubmitEffectsRaw === 'true' ||
      skipSubmitEffectsRaw === '1' ||
      skipSubmitEffectsRaw === 1;
    const auditAction = ((formObject as any).__ckAuditAction || '').toString().trim();
    if (skipSubmitEffects || auditAction) {
      return 'none';
    }
    if (saveMode === 'draft') {
      return 'revisionOnly';
    }
    return 'full';
  }

  private saveSubmissionWithIdQueuedDirect(args: {
    formObject: WebFormSubmission;
    form: FormConfig;
    questions: QuestionConfig[];
    dedupRules: DedupRule[];
    reason: string;
  }): { success: boolean; message: string; meta: any } {
    const formKey = (args.formObject.formKey || (args.formObject as any).form || args.form.configSheet || args.form.title || '').toString();
    const recordId = this.ensureMutationRecordId(args.formObject);
    try {
      return this.withQueuedRecordMutation(formKey, recordId, args.reason, () =>
        this.saveSubmissionRecordWithRetry({
          formKey,
          recordId,
          reason: args.reason,
          formObject: args.formObject,
          form: args.form,
          questions: args.questions,
          dedupRules: args.dedupRules
        })
      );
    } catch (err: any) {
      const message = (err?.message || 'Could not queue record save.').toString();
      debugLog('mutation.lane.directSave.error', {
        formKey,
        recordId: recordId || null,
        reason: args.reason,
        message
      });
      return {
        success: false,
        message,
        meta: {
          id: recordId || undefined
        }
      };
    }
  }

  private ensureMutationRecordId(formObject: WebFormSubmission): string {
    const incomingId = ((formObject as any).id || '').toString().trim();
    if (incomingId) return incomingId;
    const deleteRecordId = ((formObject as any).__ckDeleteRecordId || '').toString().trim();
    if (deleteRecordId) return deleteRecordId;
    const generatedId =
      typeof Utilities !== 'undefined' && (Utilities as any).getUuid
        ? (Utilities as any).getUuid().toString()
        : `uuid-${Math.random().toString(16).slice(2)}`;
    (formObject as any).id = generatedId;
    return generatedId;
  }

  public previewUpdateRecordDependencies(
    formObject: WebFormSubmission,
    buttonId: string
  ): {
    success: boolean;
    impactedCount?: number;
    targetFormKey?: string;
    dialog?: { title: string; message: string; confirmLabel: string; cancelLabel: string };
    message?: string;
  } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) return { success: false, message: 'Form key is required.' };

    const { questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    const guard = cfg?.dependencyGuard;
    if (!btn || !cfg || cfg.action !== 'updateRecord' || !guard) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const sourceRecord = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    const targetContext = this.getFormContext(guard.targetFormKey);
    const targetRecords = this.fetchAllSubmissionRecords(targetContext.form, targetContext.questions);
    const preview = evaluateUpdateRecordDependencyPreview({
      guard,
      sourceRecord,
      language: sourceRecord.language,
      targetFormKey: targetContext.form.configSheet || targetContext.form.title,
      targetFormTitle: targetContext.form.title,
      targetQuestions: targetContext.questions,
      targetRecords
    });

    debugLog('updateRecordDependencies.preview.rpc', {
      formKey,
      buttonId: parsed.id || buttonId,
      impactedCount: preview.impactedCount,
      targetFormKey: preview.targetFormKey
    });

    return {
      success: true,
      impactedCount: preview.impactedCount,
      targetFormKey: preview.targetFormKey,
      dialog: preview.dialog
    };
  }

  public applyUpdateRecordWithDependencies(
    formObject: WebFormSubmission,
    buttonId: string
  ): { success: boolean; message: string; meta: any; dependency?: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.', meta: {} };
    }

    const { questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    const guard = cfg?.dependencyGuard;
    if (!btn || !cfg || cfg.action !== 'updateRecord' || !guard) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".`, meta: {} };
    }

    const sourceRecord = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    const targetContext = this.getFormContext(guard.targetFormKey);
    const targetDedupRules = this.resolveDedupRules(guard.targetFormKey, targetContext.form);
    const targetRecords = this.fetchAllSubmissionRecords(targetContext.form, targetContext.questions);
    const preview = evaluateUpdateRecordDependencyPreview({
      guard,
      sourceRecord,
      language: sourceRecord.language,
      targetFormKey: targetContext.form.configSheet || targetContext.form.title,
      targetFormTitle: targetContext.form.title,
      targetQuestions: targetContext.questions,
      targetRecords
    });

    if (!preview.impactedCount) {
      const sourceResult = this.saveSubmissionWithId(formObject);
      return {
        ...sourceResult,
        dependency: {
          targetFormKey: preview.targetFormKey,
          impactedCount: 0,
          updatedCount: 0
        }
      };
    }

    const rollbackRecords: WebFormSubmission[] = [];
    let updatedCount = 0;
    try {
      preview.impactedRecords.forEach(targetRecord => {
        const applied = applyUpdateRecordDependencyMutationsToRecord({
          guard,
          sourceRecord,
          targetQuestions: targetContext.questions,
          targetRecord
        });
        if (!applied.changed) return;

        const payload = this.buildDependencyMutationSavePayload({
          record: applied.record,
          formKey: targetContext.form.configSheet || targetContext.form.title,
          auditAction: `${parsed.id || buttonId}:dependencyGuard`,
          clientDataVersion: targetRecord.dataVersion
        });
        const result = this.saveSubmissionWithIdQueuedDirect({
          formObject: payload,
          form: targetContext.form,
          questions: targetContext.questions,
          dedupRules: targetDedupRules,
          reason: 'applyUpdateRecordWithDependencies.target'
        });
        if (!result?.success) {
          throw new Error((result?.message || 'Failed to update dependent records.').toString());
        }
        rollbackRecords.push(targetRecord);
        if ((result?.meta?.operation || '').toString().trim().toLowerCase() !== 'noop') {
          updatedCount += 1;
        }
      });

      const sourceResult = this.saveSubmissionWithId(formObject);
      if (!sourceResult?.success) {
        throw new Error((sourceResult?.message || 'Update failed.').toString());
      }

      if (updatedCount > 0) {
        this.refreshAnalyticsAndHomeBootstrap(
          targetContext.form,
          targetContext.questions,
          'applyUpdateRecordWithDependencies.target'
        );
      }

      debugLog('updateRecordDependencies.apply.rpc', {
        formKey,
        buttonId: parsed.id || buttonId,
        targetFormKey: preview.targetFormKey,
        impactedCount: preview.impactedCount,
        updatedCount
      });

      return {
        ...sourceResult,
        dependency: {
          targetFormKey: preview.targetFormKey,
          impactedCount: preview.impactedCount,
          updatedCount
        }
      };
    } catch (err: any) {
      const message = (err?.message || err?.toString?.() || 'Update failed.').toString();
      let rollbackFailed = false;
      if (rollbackRecords.length) {
        rollbackRecords.forEach(originalRecord => {
          try {
            const rollbackPayload = this.buildDependencyMutationSavePayload({
              record: originalRecord,
              formKey: targetContext.form.configSheet || targetContext.form.title,
              auditAction: `${parsed.id || buttonId}:dependencyRollback`
            });
            const rollbackResult = this.saveSubmissionWithIdQueuedDirect({
              formObject: rollbackPayload,
              form: targetContext.form,
              questions: targetContext.questions,
              dedupRules: targetDedupRules,
              reason: 'applyUpdateRecordWithDependencies.rollback'
            });
            if (!rollbackResult?.success) rollbackFailed = true;
          } catch {
            rollbackFailed = true;
          }
        });
        this.refreshAnalyticsAndHomeBootstrap(
          targetContext.form,
          targetContext.questions,
          rollbackFailed ? 'applyUpdateRecordWithDependencies.rollback.partial' : 'applyUpdateRecordWithDependencies.rollback'
        );
      }

      debugLog('updateRecordDependencies.apply.error', {
        formKey,
        buttonId: parsed.id || buttonId,
        targetFormKey: preview.targetFormKey,
        impactedCount: preview.impactedCount,
        updatedCount,
        rollbackFailed,
        message
      });

      return {
        success: false,
        message: rollbackFailed ? `${message} Rollback failed for some dependent records.` : message,
        meta: {},
        dependency: {
          targetFormKey: preview.targetFormKey,
          impactedCount: preview.impactedCount,
          updatedCount,
          rollbackFailed
        }
      };
    }
  }

  /**
   * Lightweight dedup precheck used by the React client to avoid creating duplicate records
   * (e.g., when presets/defaults populate dedup keys).
   */
  public checkDedupConflict(formObject: WebFormSubmission): { success: boolean; conflict?: any; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const { form, questions } = this.getFormContextLite(formKey);
    const dedupRules = this.resolveDedupRules(formKey, form);
    return this.submissions.checkDedupConflict(formObject, form, questions, dedupRules);
  }

  /**
   * Installable trigger entrypoint: handle manual edits to destination "Responses" tabs.
   *
   * Goal:
   * - keep Data Version monotonic
   * - keep record index + dedup signatures up-to-date
   * - bump server etag so cached list/record reads remain consistent with manual writes
   */
  public onResponsesEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
    try {
      const range = (e as any)?.range as GoogleAppsScript.Spreadsheet.Range | undefined;
      if (!range) return;
      const sheet = range.getSheet();
      const sheetName = sheet.getName();
      if (!sheetName) return;

      // Ignore internal/system sheets.
      if (sheetName.startsWith('Config')) return;
      if (sheetName === 'Forms Dashboard') return;
      if (sheetName.endsWith(' Dedup')) return;
      if (sheetName.startsWith('__CK_INDEX__')) return;

      const forms = this.getFormsCached();
      const match = forms.find(f => {
        const dest = (f.destinationTab || `${f.title} Responses`).toString();
        return dest === sheetName;
      });
      if (!match) return;

      const { form, questions } = this.getFormContextLite(match.configSheet || match.title);
      const dedupRules = this.resolveDedupRules(match.configSheet || match.title, form);

      this.submissions.handleManualDestinationEdits({
        form,
        questions,
        dedupRules,
        startRow: range.getRow(),
        numRows: range.getNumRows()
      });
      this.refreshAnalyticsAndHomeBootstrap(form, questions, 'onResponsesEdit');
    } catch {
      // ignore trigger errors
    }
  }

  public triggerFollowupAction(
    formKey: string,
    recordId: string,
    action: string,
    options?: FollowupRuntimeOptions
  ): FollowupActionResult {
    const batch = this.triggerFollowupActions(formKey, recordId, [action], options);
    return batch.results?.[0]?.result || { success: false, message: 'Failed to run follow-up action.' };
  }

  public triggerFollowupActions(
    formKey: string,
    recordId: string,
    actions: string[],
    options?: FollowupRuntimeOptions
  ): { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> } {
    const { form, questions } = this.getFormContext(formKey);
    const normalizedRecordId = (recordId || '').toString().trim();
    const runBatch = () => this.runQueuedFollowupActions(formKey, form, questions, normalizedRecordId, actions, options);
    let result: { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> };
    try {
      result = normalizedRecordId
        ? this.withQueuedRecordMutation(formKey, normalizedRecordId, 'triggerFollowupActions', runBatch)
        : runBatch();
    } catch (err: any) {
      debugLog('followup.batch.queue.error', {
        formKey,
        recordId: normalizedRecordId || null,
        message: err?.message || err?.toString?.() || 'unknown'
      });
      return this.buildFollowupBatchFailureResult(
        Array.isArray(actions) ? actions : [],
        (err?.message || 'Could not queue follow-up actions.').toString()
      );
    }
    if (result?.success) {
      const refreshStartedAt = Date.now();
      const refreshMode = this.shouldRefreshAnalyticsAfterFollowupStatusChange(formKey, result) ? 'full' : 'revisionOnly';
      this.refreshMutationCaches(form, questions, 'triggerFollowupActions', refreshMode);
      debugLog('followup.batch.refresh.done', {
        formKey,
        recordId: normalizedRecordId || null,
        mode: refreshMode,
        durationMs: Date.now() - refreshStartedAt
      });
    }
    return result;
  }

  private shouldRefreshAnalyticsAfterFollowupStatusChange(
    formKey: string,
    result: { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> }
  ): boolean {
    const statusChanged = Array.isArray(result?.results)
      ? result.results.some(entry => entry?.result?.success && entry.result.status !== undefined)
      : false;
    if (!statusChanged) return false;
    try {
      const definition = this.getOrBuildDefinition(formKey);
      return Array.isArray(definition?.analytics?.widgets) && definition.analytics.widgets.length > 0;
    } catch (err: any) {
      debugLog('analytics.followupRefresh.check.error', {
        formKey,
        message: err?.message || err?.toString?.() || 'unknown'
      });
      return false;
    }
  }

  private runQueuedFollowupActions(
    formKey: string,
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    actions: string[],
    options?: FollowupRuntimeOptions
  ): { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> } {
    const normalizedActions = Array.isArray(actions)
      ? actions
          .map(entry => (entry || '').toString().trim())
          .filter(Boolean)
      : [];
    if (!normalizedActions.length) {
      return this.buildFollowupBatchFailureResult([], 'No follow-up actions provided.');
    }
    const normalizedRecordId = (recordId || '').toString().trim();
    if (!normalizedRecordId) {
      return this.buildFollowupBatchFailureResult(normalizedActions, 'Record ID is required.');
    }

    let ticket: FollowupLaneTicket | null = null;
    try {
      ticket = this.reserveFollowupLaneTicket(formKey, normalizedRecordId);
    } catch (err: any) {
      debugLog('followup.lane.reserve.error', {
        formKey,
        recordId: normalizedRecordId,
        message: err?.message || err?.toString?.() || 'unknown'
      });
      return this.buildFollowupBatchFailureResult(normalizedActions, 'Could not queue follow-up actions.');
    }
    if (!ticket) {
      return this.buildFollowupBatchFailureResult(normalizedActions, 'Could not queue follow-up actions.');
    }

    let turn: { success: boolean; message?: string };
    try {
      turn = this.waitForFollowupLaneTurn(formKey, normalizedRecordId, ticket);
    } catch (err: any) {
      debugLog('followup.lane.wait.error', {
        formKey,
        recordId: normalizedRecordId,
        sequence: ticket.sequence,
        message: err?.message || err?.toString?.() || 'unknown'
      });
      return this.buildFollowupBatchFailureResult(normalizedActions, 'Could not queue follow-up actions.');
    }
    if (!turn.success) {
      return this.buildFollowupBatchFailureResult(normalizedActions, turn.message || 'Could not queue follow-up actions.');
    }

    const results: Array<{ action: string; result: FollowupActionResult }> = [];
    const runtime: { pdfArtifact?: GeneratedPdfArtifact | null } = {
      pdfArtifact: normalizeFollowupRuntimePdfArtifact(options)
    };
    try {
      for (let actionIndex = 0; actionIndex < normalizedActions.length; actionIndex += 1) {
        const action = normalizedActions[actionIndex];
        const actionStartedAt = Date.now();
        this.touchFollowupLaneOwner(formKey, normalizedRecordId, ticket);
        const result = this.runFollowupActionWithResilience(
          formKey,
          form,
          questions,
          normalizedRecordId,
          action,
          () => this.touchFollowupLaneOwner(formKey, normalizedRecordId, ticket as FollowupLaneTicket),
          runtime
        );
        debugLog('followup.batch.action.done', {
          formKey,
          recordId: normalizedRecordId,
          action: (action || '').toString().trim().toUpperCase(),
          success: Boolean(result?.success),
          durationMs: Date.now() - actionStartedAt
        });
        results.push({ action, result });
        if (!result.success) {
          for (let remainingIndex = actionIndex + 1; remainingIndex < normalizedActions.length; remainingIndex += 1) {
            results.push({
              action: normalizedActions[remainingIndex],
              result: {
                success: false,
                message: `Skipped because ${action} failed.`
              }
            });
          }
          break;
        }
      }
    } finally {
      this.releaseFollowupLaneTurn(formKey, normalizedRecordId, ticket);
    }

    return {
      success: results.every(entry => !!entry.result?.success),
      results
    };
  }

  private buildFollowupBatchFailureResult(
    actions: string[],
    message: string
  ): { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> } {
    const normalizedMessage = (message || 'Failed to run follow-up actions.').toString();
    const effectiveActions = Array.isArray(actions) && actions.length ? actions : [''];
    return {
      success: false,
      results: effectiveActions.map(action => ({
        action,
        result: {
          success: false,
          message: normalizedMessage
        }
      }))
    };
  }

  private refreshAnalyticsAndHomeBootstrap(form: FormConfig, questions: QuestionConfig[], reason: string): void {
    const canonicalKey = (form.configSheet || form.title || '').toString().trim();
    if (!canonicalKey) return;
    try {
      const definition = this.getOrBuildDefinition(canonicalKey);
      if (definition.analytics?.widgets?.length) {
        this.analytics.recomputeForm(form, questions, definition);
      }
    } catch (err: any) {
      debugLog('analytics.recompute.error', {
        formKey: canonicalKey,
        reason,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
    const rev = this.bumpHomeRevision(canonicalKey, reason);
    this.primeHomeBootstrapCache(canonicalKey, rev, reason);
  }

  private refreshMutationCaches(
    form: FormConfig,
    questions: QuestionConfig[],
    reason: string,
    mode: 'full' | 'revisionOnly' | 'none' = 'full'
  ): void {
    if (mode === 'none') return;
    if (mode === 'full') {
      this.refreshAnalyticsAndHomeBootstrap(form, questions, reason);
      return;
    }
    const canonicalKey = (form.configSheet || form.title || '').toString().trim();
    if (!canonicalKey) return;
    this.bumpHomeRevision(canonicalKey, reason);
  }

  private refreshFormBackedReadCaches(
    touchedForms: Map<string, { form: FormConfig; questions: QuestionConfig[] }>,
    reason: string
  ): void {
    touchedForms.forEach(target => {
      this.bumpFormBackedReadCacheEtag(target.form, target.questions, reason);
    });
  }

  private bumpFormBackedReadCacheEtag(
    form: FormConfig,
    questions: QuestionConfig[],
    reason: string
  ): void {
    const destinationTab = (form.destinationTab || `${form.title} Responses` || '').toString().trim();
    const formKey = (form.configSheet || form.title || '').toString().trim();
    if (!destinationTab || !formKey) return;
    try {
      const { sheet, columns } = this.submissions.ensureDestination(destinationTab, questions);
      const etag = this.cacheManager.bumpSheetEtag(sheet, columns, `${reason}.formBackedRead`);
      debugLog('mutation.formBackedRead.etag.bump', {
        formKey,
        destinationTab,
        etag,
        reason
      });
    } catch (err: any) {
      debugLog('mutation.formBackedRead.etag.bump.error', {
        formKey,
        destinationTab,
        reason,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  /**
   * Prefetch Doc/Markdown templates to make subsequent render actions faster.
   *
   * - Markdown templates: read template text from Drive and store in CacheService (when small enough).
   * - Doc templates: best-effort warmup of Drive file metadata.
   * - Email Doc text: cache plain text bodies so follow-up emails avoid reopening the Doc.
   */
  public prefetchTemplates(formKey: string): {
    success: boolean;
    message?: string;
    counts?: {
      markdownRequested: number;
      markdownCacheHit: number;
      markdownLoaded: number;
      markdownSkippedCache: number;
      markdownFailed: number;
      htmlRequested: number;
      htmlCacheHit: number;
      htmlLoaded: number;
      htmlSkippedCache: number;
      htmlFailed: number;
      docTextRequested: number;
      docTextCacheHit: number;
      docTextLoaded: number;
      docTextSkippedCache: number;
      docTextFailed: number;
      docOk: number;
      docFailed: number;
    };
  } {
    const key = (formKey || '').toString().trim();
    if (!key) return { success: false, message: 'formKey is required.' };
    const { form, questions } = this.getFormContext(key);

    const markdownMaps: any[] = [];
    const htmlMaps: any[] = [];
    const docMaps: any[] = [];
    const docTextMaps: any[] = [];

    // Follow-up templates (Doc-based)
    if (form.followupConfig?.pdfTemplateId) docMaps.push(form.followupConfig.pdfTemplateId);
    if (form.followupConfig?.emailTemplateId) {
      docMaps.push(form.followupConfig.emailTemplateId);
      docTextMaps.push(form.followupConfig.emailTemplateId);
    }
    // Summary replacement (HTML)
    if (form.summaryHtmlTemplateId) htmlMaps.push(form.summaryHtmlTemplateId);

    // BUTTON templates
    questions
      .filter(q => q && q.type === 'BUTTON')
      .forEach(q => {
        const cfg: any = (q as any).button;
        if (!cfg || !cfg.templateId) return;
        const action = (cfg.action || '').toString().trim();
        if (action === 'renderMarkdownTemplate') markdownMaps.push(cfg.templateId);
        else if (action === 'renderHtmlTemplate') htmlMaps.push(cfg.templateId);
        else if (action === 'renderDocTemplate') docMaps.push(cfg.templateId);
      });

    const markdownTemplateIds = Array.from(
      new Set(
        markdownMaps
          .flatMap(map => collectTemplateIdsFromMap(map))
          .map(id => (id || '').toString().trim())
          .filter(Boolean)
      )
    );
    const docTemplateIds = Array.from(
      new Set(
        docMaps
          .flatMap(map => collectTemplateIdsFromMap(map))
          .map(id => (id || '').toString().trim())
          .filter(Boolean)
      )
    );
    const htmlTemplateIds = Array.from(
      new Set(
        htmlMaps
          .flatMap(map => collectTemplateIdsFromMap(map))
          .map(id => (id || '').toString().trim())
          .filter(Boolean)
      )
    );
    const docTextTemplateIds = Array.from(
      new Set(
        docTextMaps
          .flatMap(map => collectTemplateIdsFromMap(map))
          .map(id => (id || '').toString().trim())
          .filter(Boolean)
      )
    );

    debugLog('templates.prefetch.start', {
      formKey: key,
      markdown: markdownTemplateIds.length,
      html: htmlTemplateIds.length,
      doc: docTemplateIds.length,
      docText: docTextTemplateIds.length
    });

    const ttlSeconds = form.templateCacheTtlSeconds;
    debugLog('templates.prefetch.cacheTtl', { formKey: key, ttlSeconds: ttlSeconds ?? null });
    const md = prefetchMarkdownTemplateIds(markdownTemplateIds, ttlSeconds);
    const html = prefetchHtmlTemplateIds(htmlTemplateIds, ttlSeconds);
    const docText = prefetchDocTextTemplateIds(docTextTemplateIds, ttlSeconds);

    let docOk = 0;
    let docFailed = 0;
    docTemplateIds.forEach(id => {
      try {
        const f = DriveApp.getFileById(id);
        // Warm basic metadata (forces Drive fetch + permission check).
        (f.getName ? f.getName() : '').toString();
        docOk += 1;
      } catch {
        const apiMeta = getDriveApiFile(id, 'templates.prefetch.doc');
        if (apiMeta) docOk += 1;
        else docFailed += 1;
      }
    });

    debugLog('templates.prefetch.done', { formKey: key, markdown: md, html, docText, docOk, docFailed });

    return {
      success: true,
      message: 'Prefetch complete.',
      counts: {
        markdownRequested: md.requested,
        markdownCacheHit: md.cacheHit,
        markdownLoaded: md.loaded,
        markdownSkippedCache: md.skipped,
        markdownFailed: md.failed,
        htmlRequested: html.requested,
        htmlCacheHit: html.cacheHit,
        htmlLoaded: html.loaded,
        htmlSkippedCache: html.skipped,
        htmlFailed: html.failed,
        docTextRequested: docText.requested,
        docTextCacheHit: docText.cacheHit,
        docTextLoaded: docText.loaded,
        docTextSkippedCache: docText.skipped,
        docTextFailed: docText.failed,
        docOk,
        docFailed
      }
    };
  }

  /**
   * Phase 1 maintenance: rebuild record indexes for one form (or all forms).
   *
   * This backfills:
   * - "Data Version" column (defaults to 1 when missing)
   * - Record IDs for legacy rows missing an id
   * - Record index sheet rows (id, rowNumber, dataVersion, timestamps, dedup signatures)
   *
   * Notes:
   * - Intended to be run manually from the spreadsheet menu after deployment, especially when existing data exists.
   * - Uses batching to keep Apps Script memory usage predictable.
   */
  public rebuildIndexes(formKey?: string): { success: boolean; message?: string; results?: any[] } {
    try {
      const forms = (() => {
        if (formKey) return [this.resolveFormOnly(formKey).form];
        return this.getFormsCached();
      })();
      if (!forms.length) return { success: true, message: 'No forms found.' };

      const results: any[] = [];
      const BATCH = 2000;

      forms.forEach(form => {
        const { form: resolvedForm, questions } = this.getFormContextLite(form.configSheet || form.title);
        const dest = resolvedForm.destinationTab || `${resolvedForm.title} Responses`;
        const dedupRules = this.resolveDedupRules(form.configSheet || form.title, resolvedForm);
        const effectiveDedupRules = (dedupRules || []).filter(r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form');

        const { sheet, columns } = this.submissions.ensureDestination(dest, questions);
        const lastRow = sheet.getLastRow();
        const total = Math.max(0, lastRow - 1);
        if (!columns.recordId || !columns.dataVersion) {
          results.push({ formKey: form.configSheet, destination: dest, success: false, message: 'Missing Record ID / Data Version columns.' });
          return;
        }

        const idx = ensureRecordIndexSheet(this.ss, sheet.getName(), effectiveDedupRules);
        const width = idx.columns.headerWidth;
        const asIso = (value: any): string => {
          if (value instanceof Date) return value.toISOString();
          if (!value) return '';
          try {
            const d = new Date(value);
            if (!isNaN(d.getTime())) return d.toISOString();
          } catch {
            // ignore
          }
          try {
            return value.toString();
          } catch {
            return '';
          }
        };

        // Union of dedup key columns
        const keyIds = Array.from(
          new Set(
            effectiveDedupRules
              .flatMap(r => (Array.isArray(r.keys) ? r.keys : []))
              .map(k => (k || '').toString().trim())
              .filter(Boolean)
          )
        );
        const keyCols: Array<{ keyId: string; colIdx: number }> = keyIds
          .map(keyId => ({ keyId, colIdx: columns.fields[keyId] }))
          .filter(entry => Number.isFinite(entry.colIdx) && entry.colIdx > 0);

        let updatedIds = 0;
        let updatedVersions = 0;
        let indexedRows = 0;

        for (let offset = 0; offset < total; offset += BATCH) {
          const startRow = 2 + offset;
          const rows = Math.min(BATCH, total - offset);
          if (rows <= 0) break;

          const idVals = sheet.getRange(startRow, columns.recordId, rows, 1).getValues().map(r => (r[0] || '').toString());
          const versionVals = sheet.getRange(startRow, columns.dataVersion, rows, 1).getValues().map(r => r[0]);
          const createdVals = columns.createdAt ? sheet.getRange(startRow, columns.createdAt, rows, 1).getValues().map(r => r[0]) : new Array(rows).fill(undefined);
          const updatedVals = columns.updatedAt ? sheet.getRange(startRow, columns.updatedAt, rows, 1).getValues().map(r => r[0]) : new Array(rows).fill(undefined);

          const keyValuesById: Record<string, any[]> = {};
          keyCols.forEach(({ keyId, colIdx }) => {
            keyValuesById[keyId] = sheet.getRange(startRow, colIdx, rows, 1).getValues().map(r => r[0]);
          });

          const nextIds: any[][] = [];
          const nextVersions: any[][] = [];
          const indexMatrix: any[][] = new Array(rows).fill(null).map(() => new Array(width).fill(''));

          for (let i = 0; i < rows; i += 1) {
            const rowNumber = startRow + i;
            let id = (idVals[i] || '').toString().trim();
            if (!id) {
              id = Utilities.getUuid ? Utilities.getUuid() : `uuid-${Math.random().toString(16).slice(2)}`;
              updatedIds += 1;
            }
            const rawV = Number(versionVals[i]);
            const v = Number.isFinite(rawV) && rawV > 0 ? rawV : 1;
            if (!(Number.isFinite(rawV) && rawV > 0)) updatedVersions += 1;

            const createdIso = asIso(createdVals[i]) || '';
            const updatedIso = asIso(updatedVals[i]) || '';

            // Compute dedup signatures for this row
            const valuesForKeys: Record<string, any> = {};
            keyCols.forEach(({ keyId }) => {
              valuesForKeys[keyId] = keyValuesById[keyId] ? keyValuesById[keyId][i] : '';
            });
            const dedupSignatures: Record<string, string> = {};
            effectiveDedupRules.forEach(rule => {
              const sig = computeDedupSignature(rule, valuesForKeys);
              if (!sig) return;
              dedupSignatures[(rule.id || '').toString()] = sig;
            });

            nextIds.push([id]);
            nextVersions.push([v]);

            const rowValues = indexMatrix[i];
            rowValues[idx.columns.recordId - 1] = id;
            rowValues[idx.columns.rowNumber - 1] = rowNumber;
            rowValues[idx.columns.dataVersion - 1] = v;
            rowValues[idx.columns.updatedAtIso - 1] = updatedIso || '';
            rowValues[idx.columns.createdAtIso - 1] = createdIso || '';
            Object.entries(dedupSignatures).forEach(([ruleIdRaw, sig]) => {
              const ruleId = (ruleIdRaw || '').toString().trim().replace(/\s+/g, '_');
              const col = (idx.columns.dedupByRuleId as any)[ruleId] as number | undefined;
              if (!col) return;
              rowValues[col - 1] = sig;
            });
          }

          // Write back any repairs (ids/versions) and index batch.
          sheet.getRange(startRow, columns.recordId, rows, 1).setValues(nextIds);
          sheet.getRange(startRow, columns.dataVersion, rows, 1).setValues(nextVersions);
          idx.sheet.getRange(startRow, 1, rows, width).setValues(indexMatrix);
          indexedRows += rows;
        }

        // Invalidate caches after maintenance.
        try {
          this.cacheManager.bumpSheetEtag(sheet, columns, 'rebuildIndexes');
        } catch (_) {
          // ignore
        }

        results.push({
          formKey: form.configSheet,
          destination: dest,
          success: true,
          totalRows: total,
          indexedRows,
          repairedIds: updatedIds,
          repairedVersions: updatedVersions
        });
      });

      return { success: true, message: 'Index rebuild complete.', results };
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Failed to rebuild indexes.').toString();
      return { success: false, message: msg };
    }
  }

  /**
   * One-time maintenance: migrate legacy label-based Doc placeholders to ID-based placeholders.
   *
   * This updates the Google Doc template(s) in-place (body/header/footer).
   *
   * It scans:
   * - followup pdfTemplateId + emailTemplateId
   * - BUTTON fields with action=renderDocTemplate
   */
  public migrateFormTemplatesToIdPlaceholders(
    formKey: string
  ): { success: boolean; message: string; results?: Array<{ templateId: string; success: boolean; message?: string; warnings?: string[] }> } {
    const key = (formKey || '').toString().trim();
    if (!key) return { success: false, message: 'formKey is required.' };
    const { form, questions } = this.getFormContext(key);

    const templateMaps: Array<{ source: string; map: any }> = [];
    if (form.followupConfig?.pdfTemplateId) {
      templateMaps.push({ source: 'followup.pdfTemplateId', map: form.followupConfig.pdfTemplateId });
    }
    if (form.followupConfig?.emailTemplateId) {
      templateMaps.push({ source: 'followup.emailTemplateId', map: form.followupConfig.emailTemplateId });
    }
    questions
      .filter(q => q && q.type === 'BUTTON')
      .forEach(q => {
        const cfg: any = (q as any).button;
        if (cfg && cfg.action === 'renderDocTemplate' && cfg.templateId) {
          templateMaps.push({ source: `button:${q.id}`, map: cfg.templateId });
        }
      });

    const templateIds = Array.from(
      new Set(templateMaps.flatMap(entry => collectTemplateIdsFromMap(entry.map)).map(id => (id || '').toString().trim()).filter(Boolean))
    );
    if (!templateIds.length) {
      return { success: true, message: 'No templates configured for this form.' };
    }

    debugLog('templateMigration.start', { formKey: key, templates: templateIds.length });
    const results = templateIds.map(id => migrateDocTemplatePlaceholdersToIds({ templateId: id, questions }));
    const failures = results.filter(r => !r.success);
    debugLog('templateMigration.done', { formKey: key, ok: results.length - failures.length, failed: failures.length });

    if (failures.length) {
      const msg = `Template migration finished with errors: ${failures.length}/${results.length} failed.`;
      return { success: false, message: msg, results };
    }
    return { success: true, message: `Template migration complete: ${results.length} template(s) updated.`, results };
  }

  /**
   * Render a configured BUTTON field's Doc template into a PDF for preview.
   * This does not write anything to the destination tab.
   */
  public renderDocTemplate(formObject: WebFormSubmission, buttonId: string): { success: boolean; pdfUrl?: string; fileId?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderDocTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);

    debugLog('renderDocTemplate.start', { formKey, buttonId: btn.id, language: record.language });
    const result = this.followups.renderPdfFromTemplate({
      form,
      questions,
      record,
      templateIdMap: cfg.templateId,
      folderId: cfg.folderId,
      namePrefix: `${form.title || 'Form'} - ${btn.qEn || btn.id}`
    });
    if (!result.success) {
      debugLog('renderDocTemplate.failed', { formKey, buttonId: btn.id, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render template.' };
    }
    debugLog('renderDocTemplate.ok', { formKey, buttonId: btn.id, fileId: result.fileId || '', url: result.url || '' });
    return { success: true, pdfUrl: result.url, fileId: result.fileId };
  }

  /**
   * Render a configured BUTTON field's Doc template into an in-memory PDF (base64) for preview.
   * This does not write anything to the destination tab and does not persist a PDF file in Drive.
   */
  public renderDocTemplatePdfPreview(
    formObject: WebFormSubmission,
    buttonId: string
  ): { success: boolean; pdfBase64?: string; mimeType?: string; fileName?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderDocTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderDocTemplatePdfPreview.start', { formKey, buttonId: btn.id, language: record.language });
    const result = this.followups.renderPdfBytesFromTemplate({
      form,
      questions,
      record,
      templateIdMap: cfg.templateId,
      namePrefix: `${form.title || 'Form'} - ${btn.qEn || btn.id}`
    });
    if (!result.success || !result.pdfBase64) {
      debugLog('renderDocTemplatePdfPreview.failed', { formKey, buttonId: btn.id, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to generate PDF preview.' };
    }
    debugLog('renderDocTemplatePdfPreview.ok', { formKey, buttonId: btn.id, fileName: result.fileName || '' });
    return {
      success: true,
      pdfBase64: result.pdfBase64,
      mimeType: result.mimeType || 'application/pdf',
      fileName: result.fileName
    };
  }

  /**
   * Render a configured BUTTON field's Doc template into a previewable Doc copy (iframe-friendly).
   * This does not write anything to the destination tab.
   *
   * NOTE: Google APIs do not support exporting a Google Doc to HTML/ZIP via Drive export,
   * so we preview the rendered Doc copy directly.
   */
  public renderDocTemplateHtml(
    formObject: WebFormSubmission,
    buttonId: string
  ): { success: boolean; previewFileId?: string; previewUrl?: string; cleanupToken?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderDocTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderDocTemplateHtml.start', { formKey, buttonId: btn.id, language: record.language });
    const result = this.followups.renderDocPreviewFromTemplate({
      form,
      questions,
      record,
      templateIdMap: cfg.templateId,
      folderId: cfg.folderId,
      namePrefix: `${form.title || 'Form'} - ${btn.qEn || btn.id}`
    });
    if (!result.success || !result.fileId || !result.previewUrl) {
      debugLog('renderDocTemplateHtml.failed', { formKey, buttonId: btn.id, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render preview.' };
    }
    const cleanupToken = this.issuePreviewCleanupToken(result.fileId);
    debugLog('renderDocTemplateHtml.ok', { formKey, buttonId: btn.id, fileId: result.fileId });
    return { success: true, previewFileId: result.fileId, previewUrl: result.previewUrl, cleanupToken };
  }

  /**
   * Render a configured BUTTON field's Markdown template (Drive text file) into expanded Markdown for preview.
   * This does not write anything to the destination tab and does not persist any Drive artifacts.
   */
  public renderMarkdownTemplate(
    formObject: WebFormSubmission,
    buttonId: string
  ): { success: boolean; markdown?: string; fileName?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderMarkdownTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderMarkdownTemplate.start', { formKey, buttonId: btn.id, language: record.language });
    const result = this.followups.renderMarkdownFromTemplate({
      form,
      questions,
      record,
      templateIdMap: cfg.templateId,
      namePrefix: `${form.title || 'Form'} - ${btn.qEn || btn.id}`
    });
    if (!result.success || !result.markdown) {
      debugLog('renderMarkdownTemplate.failed', { formKey, buttonId: btn.id, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render Markdown.' };
    }
    debugLog('renderMarkdownTemplate.ok', { formKey, buttonId: btn.id, fileName: result.fileName || '' });
    return { success: true, markdown: result.markdown, fileName: result.fileName };
  }

  /**
   * Render a configured BUTTON field's HTML template (Drive HTML/text file) into expanded HTML for preview.
   * This does not write anything to the destination tab and does not persist any Drive artifacts.
   */
  public renderHtmlTemplate(
    formObject: WebFormSubmission,
    buttonId: string
  ): { success: boolean; html?: string; fileName?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const parsed = this.parseButtonRef((buttonId || '').toString());
    const btn = this.resolveButtonQuestion(questions, parsed);
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderHtmlTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderHtmlTemplate.start', { formKey, buttonId: btn.id, language: record.language });
    const result = this.followups.renderHtmlFromHtmlTemplate({
      form,
      questions,
      record,
      templateIdMap: cfg.templateId,
      namePrefix: `${form.title || 'Form'} - ${btn.qEn || btn.id}`
    });
    if (!result.success || !result.html) {
      debugLog('renderHtmlTemplate.failed', { formKey, buttonId: btn.id, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render HTML.' };
    }
    debugLog('renderHtmlTemplate.ok', { formKey, buttonId: btn.id, fileName: result.fileName || '' });
    return { success: true, html: result.html, fileName: result.fileName };
  }

  /**
   * Render the configured follow-up PDF template into a previewable Doc copy (used by the Summary view).
   * This does not write anything to the destination tab.
   */
  public renderSubmissionReportHtml(
    formObject: WebFormSubmission
  ): { success: boolean; previewFileId?: string; previewUrl?: string; cleanupToken?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const templateId = form.followupConfig?.pdfTemplateId;
    if (!templateId) {
      return { success: false, message: 'No follow-up PDF template configured for this form.' };
    }
    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderSubmissionReportHtml.start', { formKey, language: record.language });
    const result = this.followups.renderDocPreviewFromTemplate({
      form,
      questions,
      record,
      templateIdMap: templateId,
      folderId: form.followupConfig?.pdfFolderId,
      namePrefix: `${form.title || 'Form'} - Summary`
    });
    if (!result.success || !result.fileId || !result.previewUrl) {
      debugLog('renderSubmissionReportHtml.failed', { formKey, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render preview.' };
    }
    const cleanupToken = this.issuePreviewCleanupToken(result.fileId);
    debugLog('renderSubmissionReportHtml.ok', { formKey, fileId: result.fileId });
    return { success: true, previewFileId: result.fileId, previewUrl: result.previewUrl, cleanupToken };
  }

  /**
   * Render the configured Summary HTML template (if any) into an expanded HTML string.
   * Used to fully replace the Summary view UI in the React web app.
   */
  public renderSummaryHtmlTemplate(
    formObject: WebFormSubmission
  ): { success: boolean; html?: string; fileName?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const templateId = form.summaryHtmlTemplateId;
    if (!templateId) {
      return { success: false, message: 'No summary HTML template configured for this form.' };
    }
    const record = this.prepareTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderSummaryHtmlTemplate.start', { formKey, language: record.language });
    const result = this.followups.renderHtmlFromHtmlTemplate({
      form,
      questions,
      record,
      templateIdMap: templateId,
      namePrefix: `${form.title || 'Form'} - Summary`
    });
    if (!result.success || !result.html) {
      debugLog('renderSummaryHtmlTemplate.failed', { formKey, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render summary.' };
    }
    debugLog('renderSummaryHtmlTemplate.ok', { formKey, fileName: result.fileName || '' });
    return { success: true, html: result.html, fileName: result.fileName };
  }

  public renderInlineHtmlTemplate(
    formObject: WebFormSubmission,
    templateIdMap: any
  ): { success: boolean; html?: string; fileName?: string; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    if (!formKey) {
      return { success: false, message: 'Form key is required.' };
    }
    if (!templateIdMap) {
      return { success: false, message: 'templateIdMap is required.' };
    }
    const { form, questions } = this.getFormContext(formKey);
    const record = this.prepareTemplateRenderRecord(formObject as any, questions, formKey);
    debugLog('renderInlineHtmlTemplate.start', { formKey, language: record.language });
    const result = this.followups.renderHtmlFromHtmlTemplate({
      form,
      questions,
      record,
      templateIdMap,
      namePrefix: `${form.title || 'Form'} - Inline`
    });
    if (!result.success || !result.html) {
      debugLog('renderInlineHtmlTemplate.failed', { formKey, message: result.message || 'failed' });
      return { success: false, message: result.message || 'Failed to render HTML.' };
    }
    debugLog('renderInlineHtmlTemplate.ok', { formKey, fileName: result.fileName || '' });
    return { success: true, html: result.html, fileName: result.fileName };
  }

  private prepareTemplateRenderRecord(
    formObject: any,
    questions: QuestionConfig[],
    formKey: string
  ): WebFormSubmission {
    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
    this.attachRelatedSubmitEffectRecords(record, questions, formKey);
    return record;
  }

  /**
   * Trash a previously generated preview Doc copy using a server-issued cleanup token.
   * This prevents callers from trashing arbitrary Drive files.
   */
  public trashPreviewArtifact(cleanupToken: string): { success: boolean; message?: string } {
    const token = (cleanupToken || '').toString().trim();
    if (!token) return { success: false, message: 'cleanupToken is required.' };
    const cache = this.resolveCache();
    if (!cache) return { success: false, message: 'Cache unavailable.' };
    const key = this.previewCacheKey(token);
    const fileId = cache.get(key);
    if (!fileId) return { success: true, message: 'Expired.' };
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (err: any) {
      const trashed = trashDriveApiFile(fileId);
      if (!trashed) {
        const msg = (err?.message || err?.toString?.() || 'Failed to trash preview file.').toString();
        debugLog('preview.trash.failed', { fileId, message: msg });
        return { success: false, message: msg };
      }
    }
    try {
      const remover = (cache as any).remove;
      if (typeof remover === 'function') remover.call(cache, key);
      else cache.put(key, '', 1);
    } catch {
      // ignore
    }
    return { success: true };
  }

  /**
   * Upload files to Drive and return the resulting URL list string (comma-separated).
   * This does not write anything to the destination tab; the caller should save the URLs via saveSubmissionWithId.
   */
  public uploadFiles(files: any, uploadConfig?: any): { success: boolean; urls: string; message?: string } {
    try {
      const urls = this.uploads.saveFiles(files, uploadConfig);
      return { success: true, urls: urls || '' };
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Failed to upload files.').toString();
      debugLog('uploadFiles.error', { message: msg });
      return { success: false, urls: '', message: msg };
    }
  }

  private normalizeTemplateRenderRecord(
    formObject: any,
    questions: any[],
    formKey: string
  ): WebFormSubmission {
    // Normalize language (supports array input like other endpoints).
    const langValue = Array.isArray(formObject?.language)
      ? (formObject.language[formObject.language.length - 1] || formObject.language[0])
      : formObject?.language;
    const languageRaw = (langValue || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const values = formObject?.values && typeof formObject.values === 'object' ? { ...formObject.values } : {};
    questions
      .filter(q => q.type !== 'BUTTON')
      .forEach(q => {
        if (Object.prototype.hasOwnProperty.call(values, q.id)) return;
        if (Object.prototype.hasOwnProperty.call(formObject || {}, q.id)) {
          (values as any)[q.id] = (formObject as any)[q.id];
          return;
        }
        if (q.type === 'LINE_ITEM_GROUP') {
          const jsonKey = `${q.id}_json`;
          if (Object.prototype.hasOwnProperty.call(formObject || {}, jsonKey)) {
            (values as any)[q.id] = (formObject as any)[jsonKey];
          }
        }
      });
    // Best-effort parse for LINE_ITEM_GROUP values if they were provided as JSON strings.
    questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        const raw = (values as any)[q.id];
        if (typeof raw === 'string' && raw.trim()) {
          try {
            (values as any)[q.id] = JSON.parse(raw);
          } catch {
            // keep raw
          }
        }
      });

    let renderValues = values;
    if (this.hasMissingTemplateLineItemValueMaps(values, questions)) {
      const renderQuestions = this.resolveTemplateRenderQuestions(formKey, questions);
      const backfill = this.backfillMissingTemplateLineItemValueMaps(values, renderQuestions);
      if (backfill.appliedCount > 0) {
        debugLog('renderTemplate.valueMapBackfill', {
          formKey,
          appliedCount: backfill.appliedCount
        });
      }
      renderValues = backfill.values;
    }

    let record: WebFormSubmission = {
      formKey: formKey,
      language,
      values: renderValues,
      id: formObject?.id ? formObject.id.toString() : undefined,
      createdAt: formObject?.createdAt ? formObject.createdAt.toString() : undefined,
      updatedAt: formObject?.updatedAt ? formObject.updatedAt.toString() : undefined,
      status: formObject?.status ? formObject.status.toString() : undefined,
      pdfUrl: undefined
    };
    const canonicalFormKey = this.resolveCanonicalFormKey(formKey) || formKey;
    if (canonicalFormKey === 'Config: Meal Production') {
      record = hydrateMealProductionPrepIngredientsFromLeftovers(record, leftoverRecordId =>
        this.fetchSubmissionById('Config: Leftover Inventory', leftoverRecordId)
      );
    }
    return record;
  }

  private attachRelatedSubmitEffectRecords(
    record: WebFormSubmission,
    questions: QuestionConfig[],
    formKey: string
  ): void {
    const sourceRecordId = (record.id || '').toString().trim();
    if (!sourceRecordId) return;
    const sourceFormKey = this.resolveCanonicalFormKey(formKey);
    if (!sourceFormKey) return;
    const { form } = this.getFormContextLite(formKey);
    const effects = Array.isArray(form.followupConfig?.submitEffects) ? form.followupConfig?.submitEffects : [];
    if (!effects.length) return;

    const byTargetFormKey: Record<string, SubmitEffectGeneratedRecord[]> = {};

    effects.forEach(effect => {
      const sourceLink = effect?.sourceLink;
      if (!sourceLink?.sourceRecordIdFieldId) return;
      const related = this.fetchRecordsLinkedToSource({
        targetFormKey: effect.targetFormKey,
        sourceLink,
        sourceFormKey,
        sourceRecordId
      });
      if (!related.length) return;
      const targetFormKey = (effect.targetFormKey || '').toString().trim();
      if (!targetFormKey) return;
      byTargetFormKey[targetFormKey] = [...(byTargetFormKey[targetFormKey] || []), ...related];
    });

    if (!Object.keys(byTargetFormKey).length) return;
    const payload = toPlainData({ byTargetFormKey });
    const json = JSON.stringify(payload);
    debugLog('submitEffects.relatedRecords.attached', {
      formKey,
      sourceRecordId,
      targetFormKeys: Object.keys(byTargetFormKey),
      total: Object.values(byTargetFormKey).reduce((sum, records) => sum + (Array.isArray(records) ? records.length : 0), 0)
    });
    (record as any).__ckGeneratedSubmitEffectRecords = payload;
    (record.values as Record<string, any>).__CK_GENERATED_SUBMIT_EFFECT_RECORDS_JSON = json;
  }

  private fetchRecordsLinkedToSource(args: {
    targetFormKey: string;
    sourceLink: FollowupSubmitEffectSourceLink;
    sourceFormKey: string;
    sourceRecordId: string;
  }): SubmitEffectGeneratedRecord[] {
    const targetFormKey = (args.targetFormKey || '').toString().trim();
    const sourceRecordId = (args.sourceRecordId || '').toString().trim();
    const sourceFormKey = (args.sourceFormKey || '').toString().trim();
    const sourceRecordIdFieldId = (args.sourceLink?.sourceRecordIdFieldId || '').toString().trim();
    const sourceFormKeyFieldId = (args.sourceLink?.sourceFormKeyFieldId || '').toString().trim();
    if (!targetFormKey || !sourceRecordId || !sourceRecordIdFieldId) return [];

    const { form, questions } = this.getFormContext(targetFormKey);
    const { sheet, columns } = this.submissions.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const totalRows = Math.max(0, sheet.getLastRow() - 1);
    if (!totalRows) return [];

    const criteria: Array<{ fieldId: string; expected: string; colIndex: number }> = [];
    const recordIdCol = Number(columns.fields[sourceRecordIdFieldId] || 0);
    if (recordIdCol > 0) {
      criteria.push({ fieldId: sourceRecordIdFieldId, expected: sourceRecordId, colIndex: recordIdCol });
    }
    const formKeyCol = Number(columns.fields[sourceFormKeyFieldId] || 0);
    if (sourceFormKeyFieldId && formKeyCol > 0) {
      criteria.push({ fieldId: sourceFormKeyFieldId, expected: sourceFormKey, colIndex: formKeyCol });
    }
    if (!criteria.length) return [];

    const valuesByField = new Map<string, any[][]>();
    criteria.forEach(entry => {
      valuesByField.set(
        entry.fieldId,
        sheet.getRange(2, entry.colIndex, totalRows, 1).getValues()
      );
    });

    const matchedRows: number[] = [];
    for (let idx = 0; idx < totalRows; idx += 1) {
      const matches = criteria.every(entry => {
        const rows = valuesByField.get(entry.fieldId) || [];
        const cell = rows[idx]?.[0];
        return `${cell || ''}`.trim() === entry.expected;
      });
      if (matches) matchedRows.push(idx + 2);
    }
    if (!matchedRows.length) return [];
    debugLog('submitEffects.relatedRecords.lookup', {
      targetFormKey,
      sourceFormKey,
      sourceRecordId,
      matches: matchedRows.length
    });

    return matchedRows
      .map(rowNumber => {
        const record = this.listing.fetchSubmissionByRowNumber(form, questions, rowNumber);
        if (!record?.id) return null;
        return {
          targetFormKey,
          recordId: record.id,
          values: toPlainData(record.values || {})
        } as SubmitEffectGeneratedRecord;
      })
      .filter((entry): entry is SubmitEffectGeneratedRecord => Boolean(entry));
  }

  private resolveTemplateRenderQuestions(formKey: string, fallbackQuestions: any[]): any[] {
    const bundled = this.resolveBundledConfig(formKey);
    if (bundled?.form) {
      const activeQuestions = this.filterActiveQuestions(bundled.questions || []);
      const dedupRules = bundled.dedupRules || [];
      return this.definitionBuilder.buildDefinitionFromConfig(bundled.form, activeQuestions, dedupRules).questions || fallbackQuestions;
    }
    return (this.getOrBuildDefinition(formKey)?.questions || fallbackQuestions || []) as any[];
  }

  private hasMissingTemplateLineItemValueMaps(
    values: Record<string, any>,
    questions: any[]
  ): boolean {
    const isMissingValue = (value: any): boolean =>
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

    const groupHasMissingValueMap = (groupConfig: any, rows: any[]): boolean => {
      if (!Array.isArray(rows) || !rows.length) return false;
      const fields = Array.isArray(groupConfig?.fields)
        ? groupConfig.fields
        : Array.isArray(groupConfig?.lineItemConfig?.fields)
          ? groupConfig.lineItemConfig.fields
          : [];
      const subGroups = Array.isArray(groupConfig?.subGroups)
        ? groupConfig.subGroups
        : Array.isArray(groupConfig?.lineItemConfig?.subGroups)
          ? groupConfig.lineItemConfig.subGroups
          : [];
      return rows.some((row: any) => {
        if (!row || typeof row !== 'object') return false;
        const hasMissingField = fields.some((field: any) => {
          const fieldId = (field?.id ?? '').toString().trim();
          return !!fieldId && !!field?.valueMap && isMissingValue(row[fieldId]);
        });
        if (hasMissingField) return true;
        return subGroups.some((subGroup: any) => {
          const subGroupId = (subGroup?.id || subGroup?.subGroupId || '').toString().trim();
          if (!subGroupId) return false;
          return groupHasMissingValueMap(subGroup, Array.isArray(row[subGroupId]) ? row[subGroupId] : []);
        });
      });
    };

    return (questions || []).some(question => {
      if (question?.type !== 'LINE_ITEM_GROUP') return false;
      const groupId = (question?.id || '').toString().trim();
      if (!groupId) return false;
      const rows = Array.isArray(values[groupId]) ? values[groupId] : [];
      return groupHasMissingValueMap(question.lineItemConfig || question, rows);
    });
  }

  private backfillMissingTemplateLineItemValueMaps(
    values: Record<string, any>,
    questions: any[]
  ): { values: Record<string, any>; appliedCount: number } {
    let nextValues = values;
    let appliedCount = 0;

    const isMissingValue = (value: any): boolean =>
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

    const resolveValueMapText = (valueMap: any, getValue: (fieldId: string) => any): string => {
      if (!valueMap?.optionMap || !valueMap?.dependsOn) return '';
      const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
      const depValues = dependsOn.map((dep: any) => {
        const raw = getValue((dep ?? '').toString());
        return raw === undefined || raw === null ? '' : raw.toString().trim();
      });
      const candidateKeys: string[] = [];
      if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
      depValues.filter(Boolean).forEach((value: string) => candidateKeys.push(value));
      candidateKeys.push('*');
      const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
      const rawValues = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
      const unique = Array.from(new Set(rawValues.map((entry: any) => (entry ?? '').toString().trim()).filter(Boolean)));
      return unique.join(', ');
    };

    const processGroupRows = (groupConfig: any, rows: any[]): any[] => {
      if (!Array.isArray(rows) || !rows.length) return rows;
      const fields = Array.isArray(groupConfig?.fields)
        ? groupConfig.fields
        : Array.isArray(groupConfig?.lineItemConfig?.fields)
          ? groupConfig.lineItemConfig.fields
          : [];
      const subGroups = Array.isArray(groupConfig?.subGroups)
        ? groupConfig.subGroups
        : Array.isArray(groupConfig?.lineItemConfig?.subGroups)
          ? groupConfig.lineItemConfig.subGroups
          : [];

      let anyChanged = false;
      const nextRows = rows.map((row: any) => {
        if (!row || typeof row !== 'object') return row;
        let nextRow = row;
        fields.forEach((field: any) => {
          const fieldId = (field?.id ?? '').toString().trim();
          if (!fieldId || !field?.valueMap || !isMissingValue((nextRow as any)[fieldId])) return;
          const computed = resolveValueMapText(field.valueMap, depId => {
            if (Object.prototype.hasOwnProperty.call(nextRow, depId)) return nextRow[depId];
            return nextValues[depId];
          });
          if (!computed) return;
          if (nextRow === row) nextRow = { ...row };
          nextRow[fieldId] = computed;
          appliedCount += 1;
          anyChanged = true;
        });

        subGroups.forEach((subGroup: any) => {
          const subGroupId = (subGroup?.id || subGroup?.subGroupId || '').toString().trim();
          if (!subGroupId) return;
          const currentSubRows = Array.isArray((nextRow as any)[subGroupId]) ? (nextRow as any)[subGroupId] : [];
          const nextSubRows = processGroupRows(subGroup, currentSubRows);
          if (nextSubRows === currentSubRows) return;
          if (nextRow === row) nextRow = { ...row };
          nextRow[subGroupId] = nextSubRows;
          anyChanged = true;
        });

        return nextRow;
      });

      return anyChanged ? nextRows : rows;
    };

    (questions || []).forEach(question => {
      if (question?.type !== 'LINE_ITEM_GROUP') return;
      const groupId = (question?.id || '').toString().trim();
      if (!groupId) return;
      const currentRows = Array.isArray(nextValues[groupId]) ? nextValues[groupId] : [];
      const nextRows = processGroupRows(question.lineItemConfig || question, currentRows);
      if (nextRows === currentRows) return;
      if (nextValues === values) nextValues = { ...values };
      nextValues[groupId] = nextRows;
    });

    return { values: nextValues, appliedCount };
  }

  private fetchAllSubmissionRecords(form: FormConfig, questions: QuestionConfig[]): WebFormSubmission[] {
    const { sheet, headers, columns } = this.submissions.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return rows
      .map(rowValues => this.submissions.buildSubmissionRecord(form.configSheet || form.title, questions, columns, rowValues))
      .filter((record): record is WebFormSubmission => !!record);
  }

  private findSubmissionRowNumbersByFieldCriteria(
    form: FormConfig,
    questions: QuestionConfig[],
    criteria: Array<{ fieldId: string; expected: string }>
  ): number[] {
    const normalizedCriteria = (criteria || [])
      .map(entry => ({
        fieldId: (entry?.fieldId || '').toString().trim(),
        expected: (entry?.expected || '').toString().trim()
      }))
      .filter(entry => entry.fieldId && entry.expected);
    if (!normalizedCriteria.length) return [];

    const { sheet, columns } = this.submissions.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const totalRows = Math.max(0, sheet.getLastRow() - 1);
    if (!totalRows) return [];

    const resolvedCriteria = normalizedCriteria
      .map(entry => ({
        ...entry,
        colIndex: Number(columns.fields[entry.fieldId] || 0)
      }))
      .filter(entry => entry.colIndex > 0);
    if (!resolvedCriteria.length) return [];

    const valuesByField = new Map<string, any[][]>();
    resolvedCriteria.forEach(entry => {
      valuesByField.set(entry.fieldId, sheet.getRange(2, entry.colIndex, totalRows, 1).getValues());
    });

    const matchedRows: number[] = [];
    for (let idx = 0; idx < totalRows; idx += 1) {
      const matches = resolvedCriteria.every(entry => {
        const rows = valuesByField.get(entry.fieldId) || [];
        const cell = rows[idx]?.[0];
        return `${cell || ''}`.trim() === entry.expected;
      });
      if (matches) matchedRows.push(idx + 2);
    }
    return matchedRows;
  }

  private fetchSubmissionRecordsByFieldCriteria(
    form: FormConfig,
    questions: QuestionConfig[],
    criteria: Array<{ fieldId: string; expected: string }>
  ): WebFormSubmission[] {
    const matchedRows = this.findSubmissionRowNumbersByFieldCriteria(form, questions, criteria);
    if (!matchedRows.length) return [];
    return matchedRows
      .map(rowNumber => this.listing.fetchSubmissionByRowNumber(form, questions, rowNumber))
      .filter((record): record is WebFormSubmission => Boolean(record));
  }

  private resolveInventoryRecordForReservation(
    reservationRecord: WebFormSubmission
  ): {
    resourceFormKey: string;
    resourceRecordId: string;
    resourceItemId: string;
    inventoryRecord: WebFormSubmission | null;
    healed: boolean;
  } {
    const resourceFormKey = this.readRecordFieldString(reservationRecord, 'RESOURCE_FORM_KEY');
    const rawResourceRecordId = this.readRecordFieldString(reservationRecord, 'RESOURCE_RECORD_ID');
    const resourceItemId = this.readRecordFieldString(reservationRecord, 'RESOURCE_ITEM_ID');
    if (!resourceFormKey) {
      return {
        resourceFormKey: '',
        resourceRecordId: rawResourceRecordId,
        resourceItemId,
        inventoryRecord: null,
        healed: false
      };
    }

    const directRecord = rawResourceRecordId ? this.fetchSubmissionById(resourceFormKey, rawResourceRecordId) : null;
    if (directRecord) {
      return {
        resourceFormKey,
        resourceRecordId: rawResourceRecordId,
        resourceItemId,
        inventoryRecord: directRecord,
        healed: false
      };
    }

    if (!resourceItemId) {
      return {
        resourceFormKey,
        resourceRecordId: rawResourceRecordId,
        resourceItemId,
        inventoryRecord: null,
        healed: false
      };
    }

    const inventoryContext = this.getFormContextLite(resourceFormKey);
    const matchedRecords = this.fetchAllSubmissionRecords(inventoryContext.form, inventoryContext.questions).filter(record => {
      const candidateItemId = this.readRecordFieldString(record, 'LEFTOVER_ID');
      return candidateItemId === resourceItemId;
    });
    if (matchedRecords.length !== 1) {
      return {
        resourceFormKey,
        resourceRecordId: rawResourceRecordId,
        resourceItemId,
        inventoryRecord: null,
        healed: false
      };
    }

    const healedRecord = matchedRecords[0];
    debugLog('inventoryReservation.reconcile.resolveFallback', {
      resourceFormKey,
      resourceRecordId: rawResourceRecordId || null,
      healedRecordId: healedRecord.id || null,
      resourceItemId
    });
    return {
      resourceFormKey,
      resourceRecordId: (healedRecord.id || '').toString().trim(),
      resourceItemId,
      inventoryRecord: healedRecord,
      healed: true
    };
  }

  private withDocumentTransactionLock<T>(label: string, fn: () => T): T {
    const busyMessage = 'Could not acquire the reservation transaction lock. Please retry.';
    let lastError: any = null;
    for (let attemptIndex = 0; attemptIndex < RESERVATION_TRANSACTION_LOCK_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = RESERVATION_TRANSACTION_LOCK_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        sleepWithUtilities(delayMs);
      }
      try {
        return withSharedDocumentLock(label, 8000, fn, busyMessage);
      } catch (err: any) {
        lastError = err;
        const message = (err?.message || busyMessage).toString();
        if (!isRetryableMutationLockErrorMessage(message)) {
          throw err;
        }
        debugLog('inventoryReservation.lock.retry', {
          label,
          attempt: attemptIndex + 1,
          attempts: RESERVATION_TRANSACTION_LOCK_RETRY_DELAYS_MS.length,
          message
        });
      }
    }
    throw lastError || new Error(busyMessage);
  }

  private resolveReservationFieldIds(args: {
    resourceKind?: string;
    quantityFieldId?: string;
    reservedQuantityFieldId?: string;
    statusFieldId?: string;
    unitFieldId?: string;
  }): InventoryReservationFieldIds {
    const isSingleIngredient = isSingleIngredientLeftoverKind(args.resourceKind);
    const quantityFieldId =
      (args.quantityFieldId || '').toString().trim() || (isSingleIngredient ? 'LEFTOVER_QTY' : 'LEFTOVER_PORTIONS');
    const reservedQuantityFieldId =
      (args.reservedQuantityFieldId || '').toString().trim() ||
      (isSingleIngredient ? 'LEFTOVER_RESERVED_QTY' : 'LEFTOVER_RESERVED_PORTIONS');
    const statusFieldId = (args.statusFieldId || '').toString().trim() || 'LEFTOVER_STATUS';
    const unitFieldId = (args.unitFieldId || '').toString().trim() || (isSingleIngredient ? 'LEFTOVER_UNIT' : '');
    return { quantityFieldId, reservedQuantityFieldId, statusFieldId, unitFieldId };
  }

  private normalizeReservationQuantity(value: any): number | null {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }

  private formatReservationQuantity(value: number): number | string {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round(value * 1000) / 1000;
    return Number.isInteger(rounded) ? rounded : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  private readRecordField(record: WebFormSubmission | Record<string, any> | null | undefined, fieldId?: string): any {
    const key = (fieldId || '').toString().trim();
    if (!record || !key) return undefined;
    if ((record as any).values && Object.prototype.hasOwnProperty.call((record as any).values, key)) {
      return (record as any).values[key];
    }
    return (record as any)[key];
  }

  private readRecordFieldString(record: WebFormSubmission | Record<string, any> | null | undefined, fieldId?: string): string {
    const value = this.readRecordField(record, fieldId);
    return value === undefined || value === null ? '' : value.toString().trim();
  }

  private readNumericRecordField(record: WebFormSubmission | Record<string, any> | null | undefined, fieldId?: string): number {
    const value = this.readRecordField(record, fieldId);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isActiveReservationRecord(record: WebFormSubmission | null | undefined): boolean {
    return this.readRecordFieldString(record || undefined, 'STATUS').toLowerCase() === 'active';
  }

  private buildInventoryReservationResourceKey(resourceFormKey: string, resourceRecordId: string): string {
    return `${(resourceFormKey || '').toString().trim()}::${(resourceRecordId || '').toString().trim()}`;
  }

  private buildInventoryReservationId(args: {
    resourceFormKey: string;
    resourceRecordId: string;
    resourceItemId?: string;
    sourceFormKey: string;
    sourceRecordId: string;
    sourceParentGroupId?: string;
    sourceParentRowId?: string;
    sourceOutputRowId?: string;
  }): string {
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
      .map(value => (value || '').toString().trim())
      .join('::');
    const digest = this.cacheManager.digestKey(raw).replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `reservation::${digest}`;
  }

  private buildCachedReservationRecord(args: {
    reservationId: string;
    ledgerFormKey: string;
    language: string;
    status: string;
    values: Record<string, any>;
    existingRecord?: WebFormSubmission | null;
  }): WebFormSubmission {
    const record: WebFormSubmission = {
      ...(args.existingRecord || {}),
      formKey: args.ledgerFormKey,
      language: (args.language || 'EN').toString().trim() || 'EN',
      id: args.reservationId,
      status: args.status,
      values: cloneRecordValues(args.values || {})
    } as WebFormSubmission;
    Object.keys(record.values || {}).forEach(fieldId => {
      (record as any)[fieldId] = (record.values as any)[fieldId];
    });
    return record;
  }

  private saveInternalRecord(args: {
    context: { form: FormConfig; questions: QuestionConfig[] };
    recordId: string;
    language: string;
    values: Record<string, any>;
    auditAction: string;
    status?: string;
    queue?: InternalRecordSaveQueue;
  }): { success: boolean; message: string; meta: any } {
    const formKey = (args.context.form.configSheet || args.context.form.title || '').toString().trim();
    const dedupRules = this.resolveDedupRules(formKey, args.context.form);
    const languageRaw = (args.language || 'EN').toString().trim().toUpperCase();
    const language = (languageRaw === 'FR' || languageRaw === 'NL' ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';
    const payload: WebFormSubmission = {
      formKey,
      language,
      id: args.recordId,
      values: cloneRecordValues(args.values || {})
    };
    Object.keys(payload.values || {}).forEach(fieldId => {
      (payload as any)[fieldId] = (payload.values as any)[fieldId];
    });
    (payload as any).__ckSkipSubmitEffects = '1';
    (payload as any).__ckAllowClosedUpdate = '1';
    (payload as any).__ckSaveMode = 'draft';
    (payload as any).__ckAuditAction = args.auditAction;
    if (args.status !== undefined) {
      (payload as any).__ckStatus = args.status;
      payload.status = args.status;
    }
    if (args.queue) {
      this.enqueueInternalRecordSave(args.queue, {
        formKey,
        context: args.context,
        dedupRules,
        payload
      });
      return {
        success: true,
        message: 'Queued internal record save.',
        meta: {
          id: args.recordId
        }
      };
    }
    let lastResult: { success: boolean; message: string; meta: any } | null = null;
    for (let attemptIndex = 0; attemptIndex < INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        sleepWithUtilities(delayMs);
      }
      const result = this.submissions.saveTrustedSubmissionWithId(
        payload,
        args.context.form,
        args.context.questions,
        dedupRules
      );
      lastResult = result;
      if (result.success || !isRetryableMutationLockErrorMessage(result.message)) {
        return result;
      }
      debugLog('saveInternalRecord.retry', {
        formKey,
        recordId: args.recordId,
        auditAction: args.auditAction,
        attempt: attemptIndex + 1,
        attempts: INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS.length,
        message: result.message || 'retryable failure'
      });
    }
    return lastResult || {
      success: false,
      message: 'Failed to save internal record.',
      meta: {
        id: args.recordId
      }
    };
  }

  private enqueueInternalRecordSave(
    queue: InternalRecordSaveQueue,
    args: {
      formKey: string;
      context: { form: FormConfig; questions: QuestionConfig[] };
      dedupRules: DedupRule[];
      payload: WebFormSubmission;
    }
  ): void {
    const existing = queue.get(args.formKey);
    if (existing) {
      existing.payloadsById.set((args.payload.id || '').toString().trim(), args.payload);
      return;
    }
    queue.set(args.formKey, {
      context: args.context,
      dedupRules: args.dedupRules,
      payloadsById: new Map([[(args.payload.id || '').toString().trim(), args.payload]])
    });
  }

  private flushInternalRecordSaveQueue(
    queue: InternalRecordSaveQueue
  ): { success: boolean; message?: string } {
    for (const [formKey, entry] of queue.entries()) {
      let lastMessage = 'Failed to save internal records.';
      for (let attemptIndex = 0; attemptIndex < INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS.length; attemptIndex += 1) {
        const delayMs = INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS[attemptIndex];
        if (delayMs > 0) {
          sleepWithUtilities(delayMs);
        }
        const result = this.submissions.saveTrustedSubmissionBatch(
          Array.from(entry.payloadsById.values()),
          entry.context.form,
          entry.context.questions,
          entry.dedupRules
        );
        if (result.success) {
          break;
        }
        lastMessage = result.message || lastMessage;
        if (!isRetryableMutationLockErrorMessage(lastMessage)) {
          return { success: false, message: lastMessage };
        }
        debugLog('saveInternalRecord.batch.retry', {
          formKey,
          attempt: attemptIndex + 1,
          attempts: INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS.length,
          message: lastMessage
        });
        if (attemptIndex === INTERNAL_RECORD_SAVE_RETRY_DELAYS_MS.length - 1) {
          return { success: false, message: lastMessage };
        }
      }
    }
    return { success: true };
  }

  private buildInventoryAvailabilitySnapshot(args: {
    inventoryRecord: WebFormSubmission;
    fieldIds: { quantityFieldId: string; reservedQuantityFieldId: string; statusFieldId?: string; unitFieldId?: string };
    resourceFormKey: string;
    resourceRecordId: string;
    resourceItemId?: string;
    resourceKind?: string;
    reservedQuantity: number;
    currentReservationQuantity: number;
    currentRecordReservedQuantity: number;
  }): InventoryAvailabilitySnapshot {
    const remainingQuantity = this.readNumericRecordField(args.inventoryRecord, args.fieldIds.quantityFieldId);
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
      unit: this.readRecordFieldString(args.inventoryRecord, args.fieldIds.unitFieldId),
      status: this.readRecordFieldString(args.inventoryRecord, args.fieldIds.statusFieldId)
    };
  }

  private buildDependencyMutationSavePayload(args: {
    record: WebFormSubmission;
    formKey: string;
    auditAction: string;
    clientDataVersion?: number;
  }): WebFormSubmission {
    const payloadValues = cloneRecordValues(args.record.values || {});
    const payload: WebFormSubmission = {
      formKey: args.formKey,
      language: args.record.language,
      values: payloadValues,
      id: args.record.id,
      createdAt: args.record.createdAt,
      updatedAt: args.record.updatedAt,
      status: args.record.status || undefined,
      pdfUrl: args.record.pdfUrl
    };
    Object.keys(payloadValues).forEach(fieldId => {
      (payload as any)[fieldId] = payloadValues[fieldId];
    });
    (payload as any).__ckSaveMode = 'draft';
    (payload as any).__ckAllowClosedUpdate = '1';
    (payload as any).__ckStatus = args.record.status === undefined || args.record.status === null ? '' : args.record.status;
    (payload as any).__ckAuditAction = args.auditAction;
    if (Number.isFinite(Number(args.clientDataVersion)) && Number(args.clientDataVersion) > 0) {
      (payload as any).__ckClientDataVersion = Number(args.clientDataVersion);
    }
    return payload;
  }

  private applyFollowupSubmitEffects(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    formKey: string;
    formObject: WebFormSubmission;
    saveResult: { success: boolean; message: string; meta: any };
    refreshMode?: 'full' | 'revisionOnly' | 'none';
  }): { success: boolean; message?: string; meta?: any } {
    const effects = Array.isArray(args.form.followupConfig?.submitEffects) ? args.form.followupConfig?.submitEffects || [] : [];
    if (!effects.length) {
      return { success: true, meta: { configured: 0, executed: 0, created: 0, updated: 0 } };
    }

    const sourceRecord = this.normalizeTemplateRenderRecord(args.formObject as any, args.questions, args.formKey);
    sourceRecord.id = args.saveResult.meta?.id || sourceRecord.id;
    sourceRecord.createdAt = args.saveResult.meta?.createdAt || sourceRecord.createdAt;
    sourceRecord.updatedAt = args.saveResult.meta?.updatedAt || sourceRecord.updatedAt;
    sourceRecord.status =
      ((args.formObject as any).__ckStatus !== undefined && (args.formObject as any).__ckStatus !== null
        ? (args.formObject as any).__ckStatus
        : args.formObject.status) || sourceRecord.status;

    const { ctx } = buildRecordVisibilityContext(sourceRecord, args.questions);
    const operation = (args.saveResult.meta?.operation || 'update').toString().trim().toLowerCase();
    const touchedForms = new Map<string, { form: FormConfig; questions: QuestionConfig[] }>();
    let executed = 0;
    let created = 0;
    let updated = 0;
    const generatedRecords: SubmitEffectGeneratedRecord[] = [];

    debugLog('submitEffects.start', {
      formKey: args.formKey,
      recordId: sourceRecord.id || null,
      configured: effects.length,
      operation
    });

    try {
      effects.forEach((effect, index) => {
        if (!this.shouldRunFollowupSubmitEffect(effect, operation)) {
          debugLog('submitEffects.skip.runOn', {
            formKey: args.formKey,
            recordId: sourceRecord.id || null,
            effectIndex: index,
            effectType: effect.type,
            runOn: effect.runOn || 'both',
            operation
          });
          return;
        }

        const vars = buildTemplateVars({
          sourceRecord,
          targetFormKey: effect.targetFormKey
        });
        const resolvedWhen = effect.when ? resolveTemplateValue(effect.when, vars) : undefined;
        if (resolvedWhen && !matchesWhenClause(resolvedWhen as any, ctx, { now: new Date() })) {
          debugLog('submitEffects.skip.when', {
            formKey: args.formKey,
            recordId: sourceRecord.id || null,
            effectIndex: index,
            effectType: effect.type,
            targetFormKey: effect.targetFormKey
          });
          return;
        }

        if (effect.type === 'createRecord' || effect.type === 'updateRecord') {
          const targetContext = this.getFormContext(effect.targetFormKey);
          const targetDedupRules = this.resolveDedupRules(effect.targetFormKey, targetContext.form);
          const payloads = this.buildFollowupSubmitPayloads({
            effect,
            sourceRecord,
            sourceQuestions: args.questions
          });
          if (!payloads.length) {
            debugLog(`submitEffects.${effect.type}.skip.empty`, {
              formKey: args.formKey,
              recordId: sourceRecord.id || null,
              effectIndex: index,
              targetFormKey: effect.targetFormKey
            });
            return;
          }
          executed += 1;
          touchedForms.set(effect.targetFormKey, targetContext);
          payloads.forEach((payload, payloadIndex) => {
            if (effect.type === 'updateRecord' && !((payload as any).id || '').toString().trim()) {
              throw new Error('Follow-up submit effect updateRecord requires a target recordId.');
            }
            const saveResult = this.saveSubmissionWithIdQueuedDirect({
              formObject: payload,
              form: targetContext.form,
              questions: targetContext.questions,
              dedupRules: targetDedupRules,
              reason: `submitEffects.${effect.type}`
            });
            if (!saveResult?.success) {
              throw new Error(
                (
                  saveResult?.message ||
                  (effect.type === 'updateRecord'
                    ? 'Failed to update downstream record.'
                    : 'Failed to create downstream record.')
                ).toString()
              );
            }
            const saveOperation = (saveResult.meta?.operation || '').toString().trim().toLowerCase();
            if (effect.type === 'updateRecord') {
              if (saveOperation !== 'noop') updated += 1;
            } else {
              created += 1;
            }
            const savedRecordId = (saveResult.meta?.id || '').toString().trim();
            if (effect.type === 'createRecord' && savedRecordId) {
              generatedRecords.push({
                effectId: (effect as any).id ? (effect as any).id.toString() : undefined,
                targetFormKey: effect.targetFormKey,
                recordId: savedRecordId,
                values: this.buildGeneratedRecordValuesFromPayload(payload, targetContext.questions)
              });
            }
            debugLog(`submitEffects.${effect.type}.ok`, {
              formKey: args.formKey,
              recordId: sourceRecord.id || null,
              effectIndex: index,
              payloadIndex,
              targetFormKey: effect.targetFormKey,
              targetRecordId: saveResult.meta?.id || null
            });
          });
        }
      });
    } catch (err: any) {
      const message = (err?.message || err?.toString?.() || 'Submit effects failed.').toString();
      debugLog('submitEffects.error', {
        formKey: args.formKey,
        recordId: sourceRecord.id || null,
        configured: effects.length,
        executed,
        created,
        updated,
        operation,
        message
      });
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

    const refreshMode = args.refreshMode || 'full';
    touchedForms.forEach(target => {
      this.refreshMutationCaches(target.form, target.questions, 'saveSubmissionWithId.submitEffects', refreshMode);
    });

    debugLog('submitEffects.ok', {
      formKey: args.formKey,
      recordId: sourceRecord.id || null,
      configured: effects.length,
      executed,
      created,
      updated,
      operation
    });

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

  private readSubmitEffectPayloadFieldValue(payload: WebFormSubmission | Record<string, any>, fieldId: string): any {
    const values = payload && typeof (payload as any).values === 'object' ? ((payload as any).values as Record<string, any>) : null;
    if (values && Object.prototype.hasOwnProperty.call(values, fieldId)) {
      return values[fieldId];
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, fieldId)) {
      return (payload as any)[fieldId];
    }
    return undefined;
  }

  private buildGeneratedRecordValuesFromPayload(
    payload: WebFormSubmission | Record<string, any>,
    questions: QuestionConfig[]
  ): Record<string, any> {
    const out: Record<string, any> = {};
    (questions || []).forEach(question => {
      const fieldId = (question?.id || '').toString().trim();
      if (!fieldId || question?.type === 'BUTTON') return;
      const rawValue = this.readSubmitEffectPayloadFieldValue(payload, fieldId);
      if (rawValue === undefined) return;
      if (question?.type === 'LINE_ITEM_GROUP' && typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) {
          out[fieldId] = '';
          return;
        }
        try {
          out[fieldId] = toPlainData(JSON.parse(trimmed));
          return;
        } catch {
          out[fieldId] = rawValue;
          return;
        }
      }
      out[fieldId] = toPlainData(rawValue);
    });
    return out;
  }

  private shouldRunFollowupSubmitEffect(effect: FollowupSubmitEffect, operation: string): boolean {
    const runOn = (effect.runOn || 'both').toString().trim().toLowerCase();
    if (runOn === 'both') return true;
    if (runOn === 'create') return operation === 'create';
    if (runOn === 'update') return operation === 'update';
    return true;
  }

  private buildFollowupSubmitPayloads(args: {
    effect: FollowupSubmitEffect;
    sourceRecord: WebFormSubmission;
    sourceQuestions: QuestionConfig[];
  }): WebFormSubmission[] {
    const scopes = this.resolveFollowupCreateRecordScopes({
      effect: args.effect,
      sourceRecord: args.sourceRecord,
      sourceQuestions: args.sourceQuestions
    });

    return scopes.map(scope => {
      const vars = buildTemplateVars({
        sourceRecord: args.sourceRecord,
        targetFormKey: args.effect.targetFormKey,
        row: scope.row,
        parent: scope.parent,
        lineItem: scope.lineItem
      });
      const resolved = this.resolveConfigComputedValue(resolveTemplateValue(args.effect, vars), vars) as FollowupSubmitEffect;
      const payloadValues = cloneRecordValues((resolved.values || {}) as Record<string, any>);
      const payload: WebFormSubmission = {
        formKey: resolved.targetFormKey,
        language: args.sourceRecord.language,
        values: payloadValues
      };
      const resolvedRecordId =
        resolved.recordId === undefined || resolved.recordId === null ? '' : resolved.recordId.toString().trim();
      if (resolvedRecordId) {
        (payload as any).id = resolvedRecordId;
      }
      Object.keys(payloadValues).forEach(fieldId => {
        (payload as any)[fieldId] = payloadValues[fieldId];
      });
      (payload as any).__ckSkipSubmitEffects = '1';
      (payload as any).__ckAuditAction =
        resolved.auditAction || `submitEffect:${resolved.type}:${args.sourceRecord.id || 'source'}`;
      if (Object.prototype.hasOwnProperty.call(resolved, 'status')) {
        (payload as any).__ckSaveMode = 'draft';
        (payload as any).__ckStatus =
          resolved.status === undefined || resolved.status === null ? '' : resolved.status.toString();
        payload.status = resolved.status === null ? undefined : resolved.status === undefined ? undefined : resolved.status.toString();
      }
      return payload;
    });
  }

  private resolveFollowupCreateRecordScopes(args: {
    effect: FollowupSubmitEffect;
    sourceRecord: WebFormSubmission;
    sourceQuestions: QuestionConfig[];
  }): Array<{
    row?: Record<string, any>;
    parent?: Record<string, any>;
    lineItem: { groupId: string; subGroupPath: string[]; index: number; rowId?: string };
  }> {
    const iterator = args.effect.forEachLineItem;
    if (!iterator?.groupId) {
      return [{ lineItem: { groupId: '', subGroupPath: [], index: 1, rowId: '' } }];
    }

    const top = buildRecordVisibilityContext(args.sourceRecord, args.sourceQuestions);
    const rows = this.collectFollowupLineItemRows({
      recordValues: args.sourceRecord.values || {},
      groupId: iterator.groupId,
      subGroupPath: iterator.subGroupPath || [],
      when: iterator.when,
      topCtx: top.ctx
    });

    debugLog('submitEffects.createRecord.scopes', {
      formKey: args.sourceRecord.formKey || '',
      recordId: args.sourceRecord.id || null,
      targetFormKey: args.effect.targetFormKey,
      groupId: iterator.groupId,
      subGroupPath: iterator.subGroupPath || [],
      matchedRows: rows.length
    });

    return rows.map((row, index) => ({
      row: row.row,
      parent: row.parent,
      lineItem: {
        groupId: iterator.groupId,
        subGroupPath: iterator.subGroupPath || [],
        index: index + 1,
        rowId:
          row.rowId ||
          `${((iterator.subGroupPath || [])[((iterator.subGroupPath || []).length - 1)] || iterator.groupId || 'row').toString()}_${index}`
      }
    }));
  }

  private collectFollowupLineItemRows(args: {
    recordValues: Record<string, any>;
    groupId: string;
    subGroupPath: string[];
    when?: any;
    topCtx: ReturnType<typeof buildRecordVisibilityContext>['ctx'];
  }): Array<{ row: Record<string, any>; parent?: Record<string, any>; rowId?: string }> {
    const rootRows = this.parseFollowupLineItemRows(args.recordValues[args.groupId] || args.recordValues[`${args.groupId}_json`]);
    const matches = this.collectFollowupLineItemRowsAtPath({
      rows: rootRows,
      path: args.subGroupPath || [],
      parent: undefined
    });
    if (!args.when) {
      return matches.map(match => ({
        row: this.sanitizeFollowupTemplateRow(match.row),
        parent: match.parent ? this.sanitizeFollowupTemplateRow(match.parent) : undefined,
        rowId: this.normalizeFollowupLineItemRowId(match.row)
      }));
    }
    return matches
      .filter(match => {
        const rowCtx = buildRowVisibilityContext({
          row: match.row,
          groupKey: args.groupId,
          parentValues: match.parent,
          topCtx: args.topCtx
        });
        return matchesWhenClause(args.when, rowCtx.ctx, { now: new Date() });
      })
      .map(match => ({
        row: this.sanitizeFollowupTemplateRow(match.row),
        parent: match.parent ? this.sanitizeFollowupTemplateRow(match.parent) : undefined,
        rowId: this.normalizeFollowupLineItemRowId(match.row)
      }));
  }

  private collectFollowupLineItemRowsAtPath(args: {
    rows: any[];
    path: string[];
    parent?: Record<string, any>;
  }): Array<{ row: Record<string, any>; parent?: Record<string, any> }> {
    if (!Array.isArray(args.rows) || !args.rows.length) return [];
    if (!args.path.length) {
      return args.rows.map(row => ({ row: (row || {}) as Record<string, any>, parent: args.parent }));
    }
    const [nextGroupId, ...restPath] = args.path;
    return args.rows.flatMap(rawRow => {
      const row = (rawRow || {}) as Record<string, any>;
      const childRows = this.parseFollowupLineItemRows(row[nextGroupId] || row[`${nextGroupId}_json`]);
      return this.collectFollowupLineItemRowsAtPath({
        rows: childRows,
        path: restPath,
        parent: row
      });
    });
  }

  private parseFollowupLineItemRows(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private sanitizeFollowupTemplateRow(value: any): any {
    if (Array.isArray(value)) {
      return value.map(entry => this.sanitizeFollowupTemplateRow(entry));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const out: Record<string, any> = {};
    Object.keys(value).forEach(key => {
      if (FOLLOWUP_LINE_ITEM_META_KEYS.has(key)) return;
      out[key] = this.sanitizeFollowupTemplateRow((value as Record<string, any>)[key]);
    });
    return out;
  }

  private normalizeFollowupLineItemRowId(value: any): string {
    if (!value || typeof value !== 'object') return '';
    const raw = (value as Record<string, any>).__ckRowId;
    if (raw === undefined || raw === null) return '';
    try {
      return raw.toString().trim();
    } catch {
      return '';
    }
  }

  private getAnalyticsPipelineContext(
    ownerFormKey: string,
    pipelineId: string
  ): {
    ownerForm: FormConfig;
    sourceForm: FormConfig;
    sourceQuestions: QuestionConfig[];
    pipeline: any;
  } | null {
    const ownerKey = (ownerFormKey || '').toString().trim();
    const targetPipelineId = (pipelineId || '').toString().trim();
    if (!ownerKey || !targetPipelineId) return null;
    const { form: ownerForm } = this.getFormContextLite(ownerKey);
    const pipeline = (Array.isArray(ownerForm.analytics?.pipelines) ? ownerForm.analytics?.pipelines : []).find(
      entry => (entry?.id || '').toString().trim() === targetPipelineId
    );
    if (!pipeline) return null;
    const sourceFormKey = (pipeline.sourceFormKey || ownerKey).toString().trim() || ownerKey;
    const { form: sourceForm, questions: sourceQuestions } = this.getFormContextLite(sourceFormKey);
    return {
      ownerForm,
      sourceForm,
      sourceQuestions,
      pipeline
    };
  }

  private readAnalyticsPipelineQueue(props: GoogleAppsScript.Properties.Properties): AnalyticsPipelineJob[] {
    const raw = (props.getProperty(ANALYTICS_PIPELINE_QUEUE_PROPERTY_KEY) || '').toString().trim();
    return parseAnalyticsPipelineQueue(raw);
  }

  private ensureAnalyticsPipelineTriggerScheduled(props: GoogleAppsScript.Properties.Properties): void {
    const existingId = (props.getProperty(ANALYTICS_PIPELINE_TRIGGER_PROPERTY_KEY) || '').toString().trim();
    const existingTriggers = this.findAnalyticsPipelineTriggers();
    if (existingTriggers.length) {
      const matched = existingId
        ? existingTriggers.find(trigger => {
            try {
              return (trigger as any)?.getUniqueId?.() === existingId;
            } catch {
              return false;
            }
          })
        : existingTriggers[0];
      if (matched) return;
    }

    const scriptApp = (globalThis as any).ScriptApp;
    if (!scriptApp?.newTrigger) {
      throw new Error('ScriptApp trigger API is not available.');
    }
    const trigger = scriptApp.newTrigger(ANALYTICS_PIPELINE_TRIGGER_HANDLER).timeBased().after(1_000).create();
    const uniqueId = (() => {
      try {
        return (trigger as any)?.getUniqueId?.()?.toString?.().trim?.() || '';
      } catch {
        return '';
      }
    })();
    props.setProperty(ANALYTICS_PIPELINE_TRIGGER_PROPERTY_KEY, uniqueId || 'scheduled');
  }

  private findAnalyticsPipelineTriggers(): GoogleAppsScript.Script.Trigger[] {
    const scriptApp = (globalThis as any).ScriptApp;
    if (!scriptApp?.getProjectTriggers) return [];
    try {
      return ((scriptApp.getProjectTriggers() || []) as GoogleAppsScript.Script.Trigger[]).filter(trigger => {
        try {
          return trigger.getHandlerFunction() === ANALYTICS_PIPELINE_TRIGGER_HANDLER;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  private deleteAnalyticsPipelineTriggers(triggerId?: string): void {
    const scriptApp = (globalThis as any).ScriptApp;
    if (!scriptApp?.deleteTrigger) return;
    this.findAnalyticsPipelineTriggers().forEach(trigger => {
      const matchesId = (() => {
        if (!triggerId) return true;
        try {
          return (trigger as any)?.getUniqueId?.() === triggerId;
        } catch {
          return false;
        }
      })();
      if (!matchesId && triggerId) return;
      try {
        scriptApp.deleteTrigger(trigger);
      } catch {
        // ignore cleanup failures
      }
    });
  }

  private getFormContext(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } {
    const bundled = this.resolveBundledFormContext(formKey);
    if (bundled) return bundled;
    const form = this.definitionBuilder.findForm(formKey);
    const questions = this.loadActiveQuestions(form.configSheet);
    return { form, questions };
  }

  private getFormContextLite(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } {
    const bundled = this.resolveBundledFormContext(formKey);
    if (bundled) return bundled;
    const cacheKey = this.cacheManager.makeCacheKey('CTX', [formKey || '', 'lite']);
    const cached = this.cacheManager.cacheGet<{ form: FormConfig; questions: QuestionConfig[] }>(cacheKey);
    if (cached && cached.form && Array.isArray(cached.questions)) {
      return cached;
    }
    const form = this.definitionBuilder.findForm(formKey);
    const questions = ConfigSheet.getQuestionsLite(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const result = { form, questions };
    this.cacheManager.cachePut(cacheKey, result);
    return result;
  }

  private loadActiveQuestions(configSheet: string): QuestionConfig[] {
    return ConfigSheet.getQuestions(this.ss, configSheet).filter(q => q.status === 'Active');
  }

  private scriptProperties(): GoogleAppsScript.Properties.Properties | null {
    try {
      return (typeof PropertiesService !== 'undefined' && (PropertiesService as any).getScriptProperties)
        ? (PropertiesService as any).getScriptProperties()
        : null;
    } catch {
      return null;
    }
  }

  private withScriptLock<T>(label: string, timeoutMs: number, fn: () => T): T {
    const lock = (() => {
      try {
        return typeof LockService !== 'undefined' && (LockService as any).getScriptLock
          ? (LockService as any).getScriptLock()
          : null;
      } catch {
        return null;
      }
    })();
    let hasLock = false;
    try {
      if (lock) {
        if (typeof lock.waitLock === 'function') {
          lock.waitLock(timeoutMs);
          hasLock = true;
        } else if (typeof lock.tryLock === 'function') {
          hasLock = !!lock.tryLock(timeoutMs);
          if (!hasLock) {
            throw new Error(`Timed out acquiring script lock for ${label}.`);
          }
        }
      }
      return fn();
    } finally {
      if (lock && hasLock) {
        try {
          lock.releaseLock();
        } catch (err: any) {
          debugLog('followup.lane.lock.release.error', {
            label,
            message: err?.message || err?.toString?.() || 'unknown'
          });
        }
      }
    }
  }

  private withQueuedRecordMutation<T>(formKey: string, recordId: string, reason: string, fn: () => T): T {
    const normalizedFormKey = this.resolveCanonicalFormKey(formKey) || (formKey || '').toString().trim();
    const normalizedRecordId = (recordId || '').toString().trim();
    if (!normalizedFormKey || !normalizedRecordId) {
      return fn();
    }
    const executionKey = `${this.normalizeFormKey(normalizedFormKey)}::${normalizedRecordId}`;
    const existingDepth = this._activeRecordMutationLanes.get(executionKey) || 0;
    if (existingDepth > 0) {
      this._activeRecordMutationLanes.set(executionKey, existingDepth + 1);
      debugLog('mutation.lane.reentrant', {
        formKey: normalizedFormKey,
        recordId: normalizedRecordId,
        depth: existingDepth + 1,
        reason
      });
      try {
        return fn();
      } finally {
        const nextDepth = (this._activeRecordMutationLanes.get(executionKey) || 1) - 1;
        if (nextDepth > 0) this._activeRecordMutationLanes.set(executionKey, nextDepth);
        else this._activeRecordMutationLanes.delete(executionKey);
      }
    }

    const ticket = this.reserveRecordMutationLaneTicket(normalizedFormKey, normalizedRecordId);
    if (!ticket) {
      throw new Error('Could not queue record mutation.');
    }
    const turn = this.waitForRecordMutationLaneTurn(normalizedFormKey, normalizedRecordId, ticket);
    if (!turn.success) {
      throw new Error((turn.message || 'Could not queue record mutation.').toString());
    }
    this._activeRecordMutationLanes.set(executionKey, 1);
    try {
      this.touchRecordMutationLaneOwner(normalizedFormKey, normalizedRecordId, ticket);
      return fn();
    } finally {
      this._activeRecordMutationLanes.delete(executionKey);
      this.releaseRecordMutationLaneTurn(normalizedFormKey, normalizedRecordId, ticket);
    }
  }

  private recordMutationLanePropertyKey(formKey: string, recordId: string): string {
    const digest = this.cacheManager
      .digestKey(`${this.normalizeFormKey(formKey)}::${(recordId || '').toString().trim()}`)
      .replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `${RECORD_MUTATION_LANE_PROPERTY_PREFIX}${digest}`;
  }

  private readRecordMutationLaneState(
    props: GoogleAppsScript.Properties.Properties | null,
    formKey: string,
    recordId: string
  ): RecordMutationLaneState {
    if (!props) return { lastIssuedSeq: 0, nextSeq: 1 };
    try {
      const raw = props.getProperty(this.recordMutationLanePropertyKey(formKey, recordId));
      if (!raw) return { lastIssuedSeq: 0, nextSeq: 1 };
      const parsed = JSON.parse(raw) as Partial<RecordMutationLaneState>;
      const lastIssuedSeq = Number(parsed?.lastIssuedSeq || 0);
      const nextSeq = Number(parsed?.nextSeq || 1);
      const ownerRaw = parsed?.owner;
      const owner =
        ownerRaw &&
        typeof ownerRaw === 'object' &&
        (ownerRaw as any).token &&
        Number.isFinite(Number((ownerRaw as any).sequence)) &&
        Number.isFinite(Number((ownerRaw as any).expiresAtMs))
          ? {
              token: ((ownerRaw as any).token || '').toString(),
              sequence: Number((ownerRaw as any).sequence),
              expiresAtMs: Number((ownerRaw as any).expiresAtMs),
              updatedAt: ((ownerRaw as any).updatedAt || '').toString() || undefined
            }
          : undefined;
      return {
        lastIssuedSeq: Number.isFinite(lastIssuedSeq) && lastIssuedSeq >= 0 ? lastIssuedSeq : 0,
        nextSeq: Number.isFinite(nextSeq) && nextSeq >= 1 ? nextSeq : 1,
        owner
      };
    } catch {
      return { lastIssuedSeq: 0, nextSeq: 1 };
    }
  }

  private writeRecordMutationLaneState(
    props: GoogleAppsScript.Properties.Properties | null,
    formKey: string,
    recordId: string,
    state: RecordMutationLaneState | null
  ): void {
    if (!props) return;
    const key = this.recordMutationLanePropertyKey(formKey, recordId);
    try {
      const lastIssuedSeq = Number(state?.lastIssuedSeq || 0);
      const nextSeq = Number(state?.nextSeq || 1);
      const owner = state?.owner;
      if (!state || (nextSeq > lastIssuedSeq && !owner)) {
        props.deleteProperty(key);
        return;
      }
      props.setProperty(
        key,
        JSON.stringify({
          lastIssuedSeq,
          nextSeq,
          owner: owner
            ? {
                token: owner.token,
                sequence: owner.sequence,
                expiresAtMs: owner.expiresAtMs,
                updatedAt: owner.updatedAt || new Date().toISOString()
              }
            : undefined
        })
      );
    } catch {
      // ignore lane persistence failures
    }
  }

  private reserveRecordMutationLaneTicket(formKey: string, recordId: string): RecordMutationLaneTicket | null {
    const props = this.scriptProperties();
    const token = (typeof Utilities !== 'undefined' && (Utilities as any).getUuid
      ? (Utilities as any).getUuid()
      : `${Date.now()}-${Math.random()}`)
      .toString();
    if (!props) {
      return { token, sequence: 1 };
    }
    return this.withScriptLock('mutation.lane.reserve', 8000, () => {
      const state = this.readRecordMutationLaneState(props, formKey, recordId);
      const sequence = Math.max(Number(state.lastIssuedSeq || 0), 0) + 1;
      this.writeRecordMutationLaneState(props, formKey, recordId, {
        ...state,
        lastIssuedSeq: sequence,
        nextSeq: Math.max(Number(state.nextSeq || 1), 1)
      });
      debugLog('mutation.lane.queued', {
        formKey,
        recordId,
        sequence,
        nextSeq: Math.max(Number(state.nextSeq || 1), 1)
      });
      return { token, sequence };
    });
  }

  private waitForRecordMutationLaneTurn(
    formKey: string,
    recordId: string,
    ticket: RecordMutationLaneTicket
  ): { success: boolean; message?: string } {
    const props = this.scriptProperties();
    if (!props) return { success: true };
    const startedAt = Date.now();
    const sleepFn =
      typeof Utilities !== 'undefined' && typeof (Utilities as any).sleep === 'function'
        ? (ms: number) => (Utilities as any).sleep(ms)
        : null;

    while (Date.now() - startedAt < RECORD_MUTATION_LANE_WAIT_TIMEOUT_MS) {
      const claimed = this.withScriptLock('mutation.lane.claim', 8000, () => {
        const state = this.readRecordMutationLaneState(props, formKey, recordId);
        const now = Date.now();
        const activeOwner =
          state.owner && Number(state.owner.expiresAtMs || 0) > now
            ? state.owner
            : undefined;
        const normalizedState: RecordMutationLaneState = {
          ...state,
          owner: activeOwner
        };
        if (ticket.sequence < normalizedState.nextSeq) {
          return { success: false, skipped: true };
        }
        if (ticket.sequence !== normalizedState.nextSeq || activeOwner) {
          this.writeRecordMutationLaneState(props, formKey, recordId, normalizedState);
          return { success: false, waitingFor: normalizedState.nextSeq, owner: activeOwner?.sequence || null };
        }
        normalizedState.owner = {
          token: ticket.token,
          sequence: ticket.sequence,
          expiresAtMs: now + RECORD_MUTATION_LANE_OWNER_TTL_MS,
          updatedAt: new Date(now).toISOString()
        };
        this.writeRecordMutationLaneState(props, formKey, recordId, normalizedState);
        return { success: true };
      });

      if (claimed.success) {
        debugLog('mutation.lane.claimed', {
          formKey,
          recordId,
          sequence: ticket.sequence,
          waitedMs: Date.now() - startedAt
        });
        return { success: true };
      }
      if ((claimed as any).skipped) {
        return { success: false, message: 'Record mutation queue advanced past this request.' };
      }
      if (!sleepFn) {
        return { success: false, message: 'Record mutation queue is busy. Please retry.' };
      }
      sleepFn(RECORD_MUTATION_LANE_POLL_MS);
    }

    debugLog('mutation.lane.wait.timeout', {
      formKey,
      recordId,
      sequence: ticket.sequence,
      waitedMs: Date.now() - startedAt
    });
    return {
      success: false,
      message: 'Another record mutation is still running for this record. Please retry shortly.'
    };
  }

  private touchRecordMutationLaneOwner(formKey: string, recordId: string, ticket: RecordMutationLaneTicket): void {
    const props = this.scriptProperties();
    if (!props) return;
    try {
      this.withScriptLock('mutation.lane.touch', 2000, () => {
        const state = this.readRecordMutationLaneState(props, formKey, recordId);
        if (!state.owner || state.owner.token !== ticket.token) return;
        state.owner = {
          ...state.owner,
          expiresAtMs: Date.now() + RECORD_MUTATION_LANE_OWNER_TTL_MS,
          updatedAt: new Date().toISOString()
        };
        this.writeRecordMutationLaneState(props, formKey, recordId, state);
      });
    } catch (err: any) {
      debugLog('mutation.lane.touch.error', {
        formKey,
        recordId,
        sequence: ticket.sequence,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  private releaseRecordMutationLaneTurn(formKey: string, recordId: string, ticket: RecordMutationLaneTicket): void {
    const props = this.scriptProperties();
    if (!props) return;
    try {
      this.withScriptLock('mutation.lane.release', 8000, () => {
        const state = this.readRecordMutationLaneState(props, formKey, recordId);
        const nextSeq = Math.max(Number(state.nextSeq || 1), ticket.sequence + 1);
        const lastIssuedSeq = Math.max(Number(state.lastIssuedSeq || 0), ticket.sequence);
        const ownerMatches = !!state.owner && state.owner.token === ticket.token;
        const nextState: RecordMutationLaneState = {
          lastIssuedSeq,
          nextSeq,
          owner: ownerMatches ? undefined : state.owner
        };
        this.writeRecordMutationLaneState(props, formKey, recordId, nextState);
        debugLog('mutation.lane.released', {
          formKey,
          recordId,
          sequence: ticket.sequence,
          nextSeq,
          queuedRemaining: Math.max(lastIssuedSeq - nextSeq + 1, 0)
        });
      });
    } catch (err: any) {
      debugLog('mutation.lane.release.error', {
        formKey,
        recordId,
        sequence: ticket.sequence,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  private followupLanePropertyKey(formKey: string, recordId: string): string {
    const digest = this.cacheManager
      .digestKey(`${this.normalizeFormKey(formKey)}::${(recordId || '').toString().trim()}`)
      .replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `${FOLLOWUP_LANE_PROPERTY_PREFIX}${digest}`;
  }

  private readFollowupLaneState(
    props: GoogleAppsScript.Properties.Properties | null,
    formKey: string,
    recordId: string
  ): FollowupLaneState {
    if (!props) return { lastIssuedSeq: 0, nextSeq: 1 };
    try {
      const raw = props.getProperty(this.followupLanePropertyKey(formKey, recordId));
      if (!raw) return { lastIssuedSeq: 0, nextSeq: 1 };
      const parsed = JSON.parse(raw) as Partial<FollowupLaneState>;
      const lastIssuedSeq = Number(parsed?.lastIssuedSeq || 0);
      const nextSeq = Number(parsed?.nextSeq || 1);
      const ownerRaw = parsed?.owner;
      const owner =
        ownerRaw &&
        typeof ownerRaw === 'object' &&
        (ownerRaw as any).token &&
        Number.isFinite(Number((ownerRaw as any).sequence)) &&
        Number.isFinite(Number((ownerRaw as any).expiresAtMs))
          ? {
              token: ((ownerRaw as any).token || '').toString(),
              sequence: Number((ownerRaw as any).sequence),
              expiresAtMs: Number((ownerRaw as any).expiresAtMs),
              updatedAt: ((ownerRaw as any).updatedAt || '').toString() || undefined
            }
          : undefined;
      return {
        lastIssuedSeq: Number.isFinite(lastIssuedSeq) && lastIssuedSeq >= 0 ? lastIssuedSeq : 0,
        nextSeq: Number.isFinite(nextSeq) && nextSeq >= 1 ? nextSeq : 1,
        owner
      };
    } catch {
      return { lastIssuedSeq: 0, nextSeq: 1 };
    }
  }

  private writeFollowupLaneState(
    props: GoogleAppsScript.Properties.Properties | null,
    formKey: string,
    recordId: string,
    state: FollowupLaneState | null
  ): void {
    if (!props) return;
    const key = this.followupLanePropertyKey(formKey, recordId);
    try {
      const lastIssuedSeq = Number(state?.lastIssuedSeq || 0);
      const nextSeq = Number(state?.nextSeq || 1);
      const owner = state?.owner;
      if (!state || (nextSeq > lastIssuedSeq && !owner)) {
        props.deleteProperty(key);
        return;
      }
      props.setProperty(
        key,
        JSON.stringify({
          lastIssuedSeq,
          nextSeq,
          owner: owner
            ? {
                token: owner.token,
                sequence: owner.sequence,
                expiresAtMs: owner.expiresAtMs,
                updatedAt: owner.updatedAt || new Date().toISOString()
              }
            : undefined
        })
      );
    } catch {
      // ignore lane persistence failures
    }
  }

  private reserveFollowupLaneTicket(formKey: string, recordId: string): FollowupLaneTicket | null {
    const props = this.scriptProperties();
    const token = (typeof Utilities !== 'undefined' && (Utilities as any).getUuid
      ? (Utilities as any).getUuid()
      : `${Date.now()}-${Math.random()}`)
      .toString();
    if (!props) {
      return { token, sequence: 1 };
    }
    return this.withScriptLock('followup.lane.reserve', 8000, () => {
      const state = this.readFollowupLaneState(props, formKey, recordId);
      const sequence = Math.max(Number(state.lastIssuedSeq || 0), 0) + 1;
      this.writeFollowupLaneState(props, formKey, recordId, {
        ...state,
        lastIssuedSeq: sequence,
        nextSeq: Math.max(Number(state.nextSeq || 1), 1)
      });
      debugLog('followup.lane.queued', {
        formKey,
        recordId,
        sequence,
        nextSeq: Math.max(Number(state.nextSeq || 1), 1)
      });
      return { token, sequence };
    });
  }

  private waitForFollowupLaneTurn(
    formKey: string,
    recordId: string,
    ticket: FollowupLaneTicket
  ): { success: boolean; message?: string } {
    const props = this.scriptProperties();
    if (!props) return { success: true };
    const startedAt = Date.now();
    const sleepFn =
      typeof Utilities !== 'undefined' && typeof (Utilities as any).sleep === 'function'
        ? (ms: number) => (Utilities as any).sleep(ms)
        : null;

    while (Date.now() - startedAt < FOLLOWUP_LANE_WAIT_TIMEOUT_MS) {
      const claimed = this.withScriptLock('followup.lane.claim', 8000, () => {
        const state = this.readFollowupLaneState(props, formKey, recordId);
        const now = Date.now();
        const activeOwner =
          state.owner && Number(state.owner.expiresAtMs || 0) > now
            ? state.owner
            : undefined;
        const normalizedState: FollowupLaneState = {
          ...state,
          owner: activeOwner
        };
        if (ticket.sequence < normalizedState.nextSeq) {
          return { success: false, skipped: true };
        }
        if (ticket.sequence !== normalizedState.nextSeq || activeOwner) {
          this.writeFollowupLaneState(props, formKey, recordId, normalizedState);
          return { success: false, waitingFor: normalizedState.nextSeq, owner: activeOwner?.sequence || null };
        }
        normalizedState.owner = {
          token: ticket.token,
          sequence: ticket.sequence,
          expiresAtMs: now + FOLLOWUP_LANE_OWNER_TTL_MS,
          updatedAt: new Date(now).toISOString()
        };
        this.writeFollowupLaneState(props, formKey, recordId, normalizedState);
        return { success: true };
      });

      if (claimed.success) {
        debugLog('followup.lane.claimed', {
          formKey,
          recordId,
          sequence: ticket.sequence,
          waitedMs: Date.now() - startedAt
        });
        return { success: true };
      }
      if ((claimed as any).skipped) {
        return { success: false, message: 'Follow-up queue advanced past this request.' };
      }
      if (!sleepFn) {
        return { success: false, message: 'Follow-up queue is busy. Please retry.' };
      }
      sleepFn(FOLLOWUP_LANE_POLL_MS);
    }

    debugLog('followup.lane.wait.timeout', {
      formKey,
      recordId,
      sequence: ticket.sequence,
      waitedMs: Date.now() - startedAt
    });
    return {
      success: false,
      message: 'Another follow-up batch is still running for this record. Please retry shortly.'
    };
  }

  private touchFollowupLaneOwner(formKey: string, recordId: string, ticket: FollowupLaneTicket): void {
    const props = this.scriptProperties();
    if (!props) return;
    try {
      this.withScriptLock('followup.lane.touch', 2000, () => {
        const state = this.readFollowupLaneState(props, formKey, recordId);
        if (!state.owner || state.owner.token !== ticket.token) return;
        state.owner = {
          ...state.owner,
          expiresAtMs: Date.now() + FOLLOWUP_LANE_OWNER_TTL_MS,
          updatedAt: new Date().toISOString()
        };
        this.writeFollowupLaneState(props, formKey, recordId, state);
      });
    } catch (err: any) {
      debugLog('followup.lane.touch.error', {
        formKey,
        recordId,
        sequence: ticket.sequence,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  private releaseFollowupLaneTurn(formKey: string, recordId: string, ticket: FollowupLaneTicket): void {
    const props = this.scriptProperties();
    if (!props) return;
    try {
      this.withScriptLock('followup.lane.release', 8000, () => {
        const state = this.readFollowupLaneState(props, formKey, recordId);
        const nextSeq = Math.max(Number(state.nextSeq || 1), ticket.sequence + 1);
        const lastIssuedSeq = Math.max(Number(state.lastIssuedSeq || 0), ticket.sequence);
        const ownerMatches = !!state.owner && state.owner.token === ticket.token;
        const nextState: FollowupLaneState = {
          lastIssuedSeq,
          nextSeq,
          owner: ownerMatches ? undefined : state.owner
        };
        this.writeFollowupLaneState(props, formKey, recordId, nextState);
        debugLog('followup.lane.released', {
          formKey,
          recordId,
          sequence: ticket.sequence,
          nextSeq,
          queuedRemaining: Math.max(lastIssuedSeq - nextSeq + 1, 0)
        });
      });
    } catch (err: any) {
      debugLog('followup.lane.release.error', {
        formKey,
        recordId,
        sequence: ticket.sequence,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  private homeRevisionPropertyKey(formKey: string): string {
    const normalized = this.normalizeFormKey(formKey || '__default__');
    const digest = this.cacheManager.digestKey(normalized).replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `${HOME_REV_PROPERTY_PREFIX}${digest}`;
  }

  private readHomeRevision(formKey: string): number {
    const props = this.scriptProperties();
    if (!props) return 0;
    try {
      const raw = props.getProperty(this.homeRevisionPropertyKey(formKey));
      const parsed = Number(raw || '0');
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private bumpHomeRevision(formKey: string, reason?: string): number {
    const key = (formKey || '').toString().trim();
    if (!key) return 0;
    const props = this.scriptProperties();
    const next = this.readHomeRevision(key) + 1;
    if (props) {
      try {
        props.setProperty(this.homeRevisionPropertyKey(key), String(next));
      } catch {
        // ignore
      }
    }
    debugLog('home.rev.bump', { formKey: key, rev: next, reason: reason || 'manual' });
    return next;
  }

  private resolveHomeSummaryPageSize(def: WebFormDefinition): number {
    const configured = Number(def.listView?.pageSize || 10);
    const pageSize = Number.isFinite(configured) && configured > 0 ? Math.max(1, Math.min(Math.floor(configured), 50)) : 10;
    if (this.shouldFetchFullHomeSummaryList(def)) {
      return HOME_BOOTSTRAP_LIST_MAX_ITEMS;
    }
    return pageSize;
  }

  private shouldFetchFullHomeSummaryList(def: WebFormDefinition): boolean {
    const listView = def?.listView;
    if (!listView?.columns?.length) return false;
    if (!listView.search) return false;
    if (listView.paginationControlsEnabled === false) return false;
    const mode = (((listView.search as any)?.mode || 'text') || '').toString().trim().toLowerCase();
    return mode === 'text' || mode === 'advanced' || mode === '';
  }

  private buildHomeSummaryProjection(def: WebFormDefinition): string[] {
    const metaFields = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const projectionIds = new Set<string>();
    const addProjection = (fieldId: any) => {
      const fid = fieldId === undefined || fieldId === null ? '' : fieldId.toString().trim();
      if (!fid || metaFields.has(fid)) return;
      projectionIds.add(fid);
    };
    const collectWhenFieldIds = (when: any) => {
      if (!when) return;
      if (Array.isArray(when)) {
        when.forEach(collectWhenFieldIds);
        return;
      }
      if (typeof when !== 'object') return;
      if (Array.isArray((when as any).all)) {
        ((when as any).all as any[]).forEach(collectWhenFieldIds);
        return;
      }
      if (Array.isArray((when as any).any)) {
        ((when as any).any as any[]).forEach(collectWhenFieldIds);
        return;
      }
      if ((when as any).not) {
        collectWhenFieldIds((when as any).not);
        return;
      }
      const lineItems = (when as any).lineItems ?? (when as any).lineItem;
      if (lineItems && typeof lineItems === 'object') {
        addProjection((lineItems as any).groupId ?? (lineItems as any).group);
        collectWhenFieldIds((lineItems as any).when);
        collectWhenFieldIds((lineItems as any).parentWhen);
        return;
      }
      addProjection((when as any).fieldId ?? (when as any).field ?? (when as any).id);
    };

    (def.listView?.columns || []).forEach(col => {
      if (!col || (col as any).kind === 'meta') return;
      if ((col as any).type === 'rule') {
        addProjection((col as any).hrefFieldId);
        const cases = Array.isArray((col as any).cases) ? ((col as any).cases as any[]) : [];
        cases.forEach(entry => {
          collectWhenFieldIds(entry?.when);
          addProjection(entry?.hrefFieldId);
        });
        addProjection((col as any)?.default?.hrefFieldId);
        return;
      }
      addProjection((col as any).fieldId);
    });

    addProjection((def.listView?.dateHeading as any)?.fieldId);
    collectWhenFieldIds((def.listView as any)?.defaultWhen);

    const searchConfig = (def.listView?.search || {}) as any;
    addProjection(searchConfig?.dateFieldId);
    const searchFieldsRaw = searchConfig?.fields;
    if (Array.isArray(searchFieldsRaw)) {
      searchFieldsRaw.forEach(addProjection);
    } else if (searchFieldsRaw !== undefined && searchFieldsRaw !== null) {
      searchFieldsRaw
        .toString()
        .split(',')
        .map((fieldId: string) => fieldId.trim())
        .filter(Boolean)
        .forEach(addProjection);
    }

    const presets = Array.isArray((def.listView?.search as any)?.presets) ? ((def.listView?.search as any).presets as any[]) : [];
    presets.forEach(preset => {
      collectWhenFieldIds((preset as any)?.when);
      addProjection((preset as any)?.dateFieldId);
    });

    return Array.from(projectionIds);
  }

  private homeBootstrapCacheKey(formKey: string): string {
    return this.cacheManager.makeCacheKey('HOME_BOOTSTRAP_LATEST', [HOME_BOOTSTRAP_CACHE_SCHEMA_VERSION, (formKey || '').toString().trim()]);
  }

  private homeBootstrapChunkBaseKey(formKey: string): string {
    return this.cacheManager.makeCacheKey('HOME_BOOTSTRAP_CHUNK', [HOME_BOOTSTRAP_CACHE_SCHEMA_VERSION, (formKey || '').toString().trim()]);
  }

  private homeBootstrapChunkMetaKey(baseKey: string): string {
    return `${baseKey}:meta`;
  }

  private homeBootstrapChunkKey(baseKey: string, index: number): string {
    return `${baseKey}:chunk:${index}`;
  }

  private normalizeCachedHomeBootstrap(
    raw: any,
    expectedRev?: number
  ): HomeBootstrapCachePayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const rev = Number((raw as any).rev);
    if (!Number.isFinite(rev)) return null;
    if (expectedRev !== undefined && Number.isFinite(expectedRev) && rev !== expectedRev) return null;
    const list = (raw as any).listResponse;
    const analytics = (raw as any).analytics;
    const hasList = !!list && Array.isArray((list as any).items);
    const hasAnalytics = !!analytics && typeof analytics === 'object';
    if (!hasList && !hasAnalytics) return null;
    return raw as HomeBootstrapCachePayload;
  }

  private readCachedHomeBootstrapChunked(formKey: string, expectedRev?: number): HomeBootstrapCachePayload | null {
    const cache = this.resolveCache();
    if (!cache) return null;
    const baseKey = this.homeBootstrapChunkBaseKey(formKey);
    const metaRaw = cache.get(this.homeBootstrapChunkMetaKey(baseKey));
    if (!metaRaw) return null;

    let meta: HomeBootstrapChunkMeta | null = null;
    try {
      const parsed = JSON.parse(metaRaw);
      if (!parsed || typeof parsed !== 'object') return null;
      const chunks = Number((parsed as any).chunks);
      const rev = Number((parsed as any).rev);
      if (!Number.isFinite(chunks) || chunks < 1 || chunks > HOME_BOOTSTRAP_MAX_CHUNKS) return null;
      if (!Number.isFinite(rev)) return null;
      if (expectedRev !== undefined && Number.isFinite(expectedRev) && rev !== expectedRev) return null;
      meta = { chunks, rev, cachedAt: (parsed as any).cachedAt };
    } catch (_) {
      return null;
    }
    if (!meta) return null;

    const keys = Array.from({ length: meta.chunks }, (_, i) => this.homeBootstrapChunkKey(baseKey, i));
    let parts: Record<string, string> = {};
    try {
      parts = cache.getAll(keys) || {};
    } catch (_) {
      return null;
    }
    let payloadRaw = '';
    for (const key of keys) {
      const part = parts[key];
      if (typeof part !== 'string' || !part.length) return null;
      payloadRaw += part;
    }

    try {
      const parsed = JSON.parse(payloadRaw);
      return this.normalizeCachedHomeBootstrap(parsed, expectedRev);
    } catch (_) {
      return null;
    }
  }

  private readCachedHomeBootstrap(formKey: string, expectedRev?: number): HomeBootstrapCachePayload | null {
    const key = (formKey || '').toString().trim();
    if (!key) return null;
    const cached = this.cacheManager.cacheGet<HomeBootstrapCachePayload>(this.homeBootstrapCacheKey(key));
    const normalized = this.normalizeCachedHomeBootstrap(cached, expectedRev);
    if (normalized?.listResponse || normalized?.analytics) return normalized;
    return this.readCachedHomeBootstrapChunked(key, expectedRev);
  }

  private cacheHomeBootstrap(formKey: string, rev: number, bootstrap: any, reason?: string): void {
    const key = (formKey || '').toString().trim();
    const hasList = !!bootstrap?.listResponse && Array.isArray((bootstrap.listResponse as any).items);
    const hasAnalytics = !!bootstrap?.analytics && typeof bootstrap.analytics === 'object';
    if (!key || (!hasList && !hasAnalytics)) return;
    const payload: HomeBootstrapCachePayload = {
      rev: Number.isFinite(Number(rev)) ? Number(rev) : this.readHomeRevision(key),
      listResponse: hasList ? bootstrap.listResponse : undefined,
      records: hasList ? (bootstrap.records || {}) : undefined,
      analytics: hasAnalytics ? bootstrap.analytics : undefined,
      analyticsRev: Number((bootstrap as any)?.analyticsRev || bootstrap?.analytics?.revision || 0) || 0,
      cachedAt: new Date().toISOString()
    };
    const cache = this.resolveCache();
    if (!cache) return;
    const payloadRaw = JSON.stringify(payload);
    const singleKey = this.homeBootstrapCacheKey(key);
    if (payloadRaw.length <= HOME_BOOTSTRAP_CHUNK_SIZE) {
      try {
        cache.put(singleKey, payloadRaw, HOME_BOOTSTRAP_CACHE_TTL_SECONDS);
      } catch {
        // ignore cache write failures
      }
    } else {
      const chunkCount = Math.ceil(payloadRaw.length / HOME_BOOTSTRAP_CHUNK_SIZE);
      if (chunkCount > HOME_BOOTSTRAP_MAX_CHUNKS) {
        debugLog('home.bootstrap.cache.skip', {
          formKey: key,
          reason: 'chunkLimitExceeded',
          rev: payload.rev,
          chunks: chunkCount
        });
        return;
      }
      const baseKey = this.homeBootstrapChunkBaseKey(key);
      const values: Record<string, string> = {
        [this.homeBootstrapChunkMetaKey(baseKey)]: JSON.stringify({
          rev: payload.rev,
          chunks: chunkCount,
          cachedAt: payload.cachedAt
        } as HomeBootstrapChunkMeta)
      };
      for (let i = 0; i < chunkCount; i += 1) {
        const start = i * HOME_BOOTSTRAP_CHUNK_SIZE;
        values[this.homeBootstrapChunkKey(baseKey, i)] = payloadRaw.slice(start, start + HOME_BOOTSTRAP_CHUNK_SIZE);
      }
      try {
        cache.putAll(values, HOME_BOOTSTRAP_CACHE_TTL_SECONDS);
      } catch {
        // ignore cache write failures
      }
    }
    debugLog('home.bootstrap.cache.put', {
      formKey: key,
      rev: payload.rev,
      items: (payload.listResponse?.items || []).length,
      analyticsRev: payload.analyticsRev || 0,
      mode: payloadRaw.length <= HOME_BOOTSTRAP_CHUNK_SIZE ? 'single' : 'chunked',
      reason: reason || null
    });
  }

  private primeHomeBootstrapCache(formKey: string, rev?: number, reason?: string): void {
    const key = (formKey || '').toString().trim();
    if (!key) return;
    const lock = (() => {
      try {
        return typeof LockService !== 'undefined' && (LockService as any).getScriptLock
          ? (LockService as any).getScriptLock()
          : null;
      } catch {
        return null;
      }
    })();
    let hasLock = false;
    try {
      if (lock) hasLock = !!lock.tryLock(150);
      const expectedRev = Number.isFinite(Number(rev)) ? Number(rev) : this.readHomeRevision(key);
      const cached = this.readCachedHomeBootstrap(key, expectedRev);
      const bundled = this.resolveBundledConfig(key);
      const def = bundled ? this.buildBundledDefinition(bundled) : this.getOrBuildDefinition(key);
      const expectsHomeList = Boolean(def?.listView?.columns?.length);
      const expectsAnalytics = Boolean(def?.analytics?.widgets?.length);
      if (
        cached &&
        (!expectsHomeList || Boolean(cached.listResponse)) &&
        (!expectsAnalytics || Boolean(cached.analytics))
      ) {
        return;
      }
      const bootstrap = this.buildBootstrap(key, def, { includeHomeData: true, includeAnalytics: true });
      this.cacheHomeBootstrap(key, expectedRev, bootstrap || null, reason || 'primeHomeBootstrapCache');
    } catch (_) {
      // ignore warm failures
    } finally {
      if (lock && hasLock) {
        try {
          lock.releaseLock();
        } catch (_) {
          // ignore
        }
      }
    }
  }

  private resolveCache(): GoogleAppsScript.Cache.Cache | null {
    if (this._cacheResolved) return this._cache ?? null;
    this._cacheResolved = true;
    try {
      this._cache = (typeof CacheService !== 'undefined' && (CacheService as any).getScriptCache)
        ? (CacheService as any).getScriptCache()
        : null;
    } catch {
      this._cache = null;
    }
    return this._cache ?? null;
  }

  private previewCacheKey(token: string): string {
    return `CK_PREVIEW_DOC:${token}`;
  }

  private issuePreviewCleanupToken(fileId: string): string | undefined {
    const cache = this.resolveCache();
    if (!cache) return undefined;
    const token = (Utilities.getUuid ? Utilities.getUuid() : `${Date.now()}-${Math.random()}`).toString();
    const key = this.previewCacheKey(token);
    // 1 hour TTL; if the client never calls cleanup, the token expires and the preview file remains until manually cleaned.
    cache.put(key, fileId, 3600);
    return token;
  }

  /**
   * Parse a client-provided button reference.
   *
   * New format (client-generated): `${buttonId}__ckQIdx=${questionIndex}`
   * This makes BUTTON actions unambiguous even if multiple questions share the same id.
   */
  private parseButtonRef(ref: string): { id: string; qIdx?: number } {
    const raw = (ref || '').toString();
    const token = '__ckQIdx=';
    const pos = raw.lastIndexOf(token);
    if (pos < 0) return { id: raw };
    const id = raw.slice(0, pos);
    const idxRaw = raw.slice(pos + token.length);
    const qIdx = Number.parseInt(idxRaw, 10);
    if (!Number.isFinite(qIdx)) return { id: raw };
    return { id, qIdx };
  }

  private resolveButtonQuestion(questions: QuestionConfig[], parsed: { id: string; qIdx?: number }): QuestionConfig | undefined {
    const id = (parsed?.id || '').toString();
    if (!id) return undefined;
    const qIdx = parsed?.qIdx;
    if (qIdx !== undefined && qIdx !== null && Number.isFinite(qIdx)) {
      const candidate = questions[qIdx as number];
      if (candidate && candidate.type === 'BUTTON' && candidate.id === id) {
        return candidate;
      }
    }
    return questions.find(q => q && q.type === 'BUTTON' && q.id === id);
  }

}
