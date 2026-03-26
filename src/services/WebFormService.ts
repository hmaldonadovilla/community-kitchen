import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import {
  AnalyticsSnapshot,
  FollowupSubmitEffect,
  FormConfig,
  FormConfigExport,
  DedupRule,
  LifecycleRule,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  PaginatedResult,
  SubmissionBatchResult,
  FollowupActionResult
} from '../types';
import { debugLog } from './webform/debug';
import { CacheEtagManager, getDocumentProperties } from './webform/cache';
import { DefinitionBuilder } from './webform/definitionBuilder';
import { DataSourceService } from './webform/dataSources';
import { SubmissionService } from './webform/submissions';
import { ListingService } from './webform/listing';
import { FollowupService } from './webform/followup';
import { UploadService } from './webform/uploads';
import { AnalyticsService } from './webform/analytics/service';
import { buildReactShellTemplate, buildReactTemplate } from './webform/template';
import { getDriveApiFile, trashDriveApiFile } from './webform/driveApi';
import { loadDedupRules, computeDedupSignature } from './dedup';
import { collectTemplateIdsFromMap, migrateDocTemplatePlaceholdersToIds } from './webform/followup/templateMigration';
import { prefetchMarkdownTemplateIds } from './webform/followup/markdownTemplateCache';
import { prefetchHtmlTemplateIds } from './webform/followup/htmlTemplateCache';
import { ensureRecordIndexSheet } from './webform/recordIndex';
import { getBundledConfigEnv, getBundledFormConfig, listBundledFormConfigs } from './webform/formConfigBundle';
import { getUiEnvTag } from './webform/envTag';
import { ServerTimingRecorder } from './webform/serverTiming';
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

const HOME_BOOTSTRAP_CACHE_TTL_SECONDS = 60 * 60 * 6; // CacheService max TTL
const HOME_REV_PROPERTY_PREFIX = 'CK_HOME_REV_';
const HOME_BOOTSTRAP_CHUNK_SIZE = 95 * 1024; // Keep margin under CacheService ~100KB item limit.
const HOME_BOOTSTRAP_MAX_CHUNKS = 24;
const cloneRecordValues = <T extends Record<string, any>>(value: T): T => JSON.parse(JSON.stringify(value || {}));
const FOLLOWUP_LINE_ITEM_META_KEYS = new Set(['__ckRowId', '__ckParentRowId', '__ckParentGroupId']);

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
  private _docProps?: GoogleAppsScript.Properties.Properties | null;
  private _docPropsResolved: boolean;
  private _cache?: GoogleAppsScript.Cache.Cache | null;
  private _cacheResolved: boolean;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this._docPropsResolved = false;
    this._cacheResolved = false;
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

  private get listing(): ListingService {
    if (!this._listing) {
      this._listing = new ListingService(this.submissions, this.cacheManager);
    }
    return this._listing;
  }

  private get followups(): FollowupService {
    if (!this._followups) {
      this._followups = new FollowupService(this.ss, this.submissions, this.dataSources);
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
    } catch (_) {
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
    } catch (_) {
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
    const fingerprint = this.cacheManager.digestKey(
      JSON.stringify({
        form: bundled.form || {},
        questions: activeQuestions || [],
        dedupRules: dedupRules || []
      })
    );
    return this.cacheManager.makeCacheKey('BDEF', [this.resolveBundledDefinitionKey(bundled), fingerprint]);
  }

  private buildBundledDefinition(bundled: FormConfigExport): WebFormDefinition {
    const embedded = this.resolveEmbeddedBundledDefinition(bundled);
    if (embedded) {
      debugLog('definition.bundle.prebuilt.hit', {
        formKey: this.resolveBundledDefinitionKey(bundled),
        questions: embedded.questions?.length || 0
      });
      return embedded;
    }

    const activeQuestions = this.filterActiveQuestions(bundled.questions || []);
    const dedupRules = bundled.dedupRules || [];
    const cacheKey = this.buildBundledDefinitionCacheKey(bundled, activeQuestions, dedupRules);
    const startedAt = Date.now();
    try {
      const cached = this.cacheManager.cacheGet<WebFormDefinition>(cacheKey);
      if (cached) {
        debugLog('definition.bundle.cache.hit', {
          formKey: this.resolveBundledDefinitionKey(bundled),
          questions: cached.questions?.length || 0,
          elapsedMs: Date.now() - startedAt
        });
        return cached;
      }
    } catch (_) {
      // Ignore cache read failures and rebuild below.
    }

    const definition = this.definitionBuilder.buildDefinitionFromConfig(bundled.form, activeQuestions, dedupRules);
    try {
      this.cacheManager.cachePut(cacheKey, definition, 60 * 60 * 24);
      debugLog('definition.bundle.cache.miss', {
        formKey: this.resolveBundledDefinitionKey(bundled),
        questions: definition.questions?.length || 0,
        elapsedMs: Date.now() - startedAt
      });
    } catch (_) {
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
  } {
    const includeHomeData = options?.includeHomeData === true;
    const includeAnalytics = options?.includeAnalytics === true;
    const startedAt = Date.now();
    const configEnv = getBundledConfigEnv() || undefined;
    const envTag = getUiEnvTag() || undefined;
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
    cache?: 'hit' | 'miss';
  } {
    const canonicalKey = this.resolveCanonicalFormKey(formKey) || (formKey || '').toString().trim();
    const rev = this.readHomeRevision(canonicalKey);
    const parsedClientRev = Number(clientRev);
    if (Number.isFinite(parsedClientRev) && parsedClientRev === rev) {
      return { notModified: true, rev, cache: 'hit' };
    }

    const cached = this.readCachedHomeBootstrap(canonicalKey, rev);
    if (cached?.listResponse) {
      return {
        notModified: false,
        rev,
        listResponse: cached.listResponse,
        records: cached.records || {},
        cache: 'hit'
      };
    }

    const bundled = this.resolveBundledConfig(canonicalKey || formKey);
    const def = bundled ? this.buildBundledDefinition(bundled) : this.getOrBuildDefinition(canonicalKey || formKey);
    const bootstrap = this.buildBootstrap(canonicalKey || formKey, def, { includeHomeData: true });
    this.cacheHomeBootstrap(canonicalKey || formKey, rev, bootstrap || null, 'fetchHomeBootstrap.cacheMiss');
    return {
      notModified: false,
      rev,
      listResponse: (bootstrap as any)?.listResponse,
      records: (bootstrap as any)?.records || {},
      cache: 'miss'
    };
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
    const bundled = serverTiming?.measure('renderForm.resolveBundledConfigMs', () => this.resolveBundledConfig(targetKey || undefined))
      ?? this.resolveBundledConfig(targetKey || undefined);
    const configEnv =
      serverTiming?.measure('renderForm.resolveBundledConfigEnvMs', () => getBundledConfigEnv() || undefined) ??
      (getBundledConfigEnv() || undefined);
    const envTag =
      serverTiming?.measure('renderForm.resolveUiEnvTagMs', () => getUiEnvTag() || undefined) ??
      (getUiEnvTag() || undefined);

    const mode = bundled ? 'react-embedded' : 'react-shell';
    debugLog('renderForm.start', {
      requestedKey: targetKey || '__DEFAULT__',
      mode,
      bundleTarget: bundleTarget || 'full',
      serverListBootstrapEnabled
    });

    const html = (() => {
      if (!bundled) {
        return serverTiming?.measure('renderForm.buildShellHtmlMs', () => buildReactShellTemplate(targetKey, bundleTarget, requestParams, serverTiming))
          ?? buildReactShellTemplate(targetKey, bundleTarget, requestParams, serverTiming);
      }
      const def = serverTiming?.measure('renderForm.buildBundledDefinitionMs', () => this.buildBundledDefinition(bundled))
        ?? this.buildBundledDefinition(bundled);
      const resolvedKey =
        targetKey ||
        bundled.formKey ||
        bundled.form?.configSheet ||
        bundled.form?.title ||
        '__DEFAULT__';
      const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
      const homeRev = serverTiming?.measure('renderForm.readHomeRevisionMs', () => this.readHomeRevision(canonicalKey))
        ?? this.readHomeRevision(canonicalKey);
      const bootstrapPayload = { configSource: 'bundled', configEnv, envTag, homeRev } as any;

      if (serverListBootstrapEnabled) {
        const bootstrap = this.buildBootstrap(resolvedKey, def, { includeHomeData: true, includeAnalytics: true });
        if (bootstrap?.listResponse || bootstrap?.analytics) {
          if (bootstrap.listResponse) {
            bootstrapPayload.listResponse = bootstrap.listResponse;
            bootstrapPayload.records = bootstrap.records || {};
          }
          if (bootstrap.analytics) {
            bootstrapPayload.analytics = bootstrap.analytics;
            bootstrapPayload.analyticsRev = Number((bootstrap as any).analyticsRev || bootstrap.analytics.revision || 0) || 0;
          }
          this.cacheHomeBootstrap(canonicalKey, homeRev, bootstrap, 'renderForm.serverListBootstrapEnabled');
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
    } catch (_) {
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
    const explicitFieldId = (rule.statusFieldId || '').toString().trim();
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
    const targetStatus = (rule.toStatus || '').toString().trim().toLowerCase();
    if (!targetStatus) return false;
    const status = (currentStatus === undefined || currentStatus === null ? '' : currentStatus.toString().trim()).toLowerCase();
    if (status === targetStatus) return false;
    const fromStatuses = Array.isArray(rule.fromStatuses)
      ? rule.fromStatuses.map(value => (value || '').toString().trim().toLowerCase()).filter(Boolean)
      : [];
    if (fromStatuses.length && !fromStatuses.includes(status)) return false;
    const dateIso = normalizeToIsoDate(rawDateValue);
    if (!dateIso) return false;
    const offsetDays = Number.isFinite(Number(rule.dayOffset || 0)) ? Math.trunc(Number(rule.dayOffset || 0)) : 0;
    const compareIso = offsetDays ? this.shiftIsoDate(todayIso, offsetDays) : todayIso;
    if (!compareIso) return false;
    if (rule.compare === 'onOrBeforeToday') {
      return dateIso <= compareIso;
    }
    return dateIso < compareIso;
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

        rules.forEach(rule => {
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
            const rowNumber = index + 2;
            this.submissions.writeStatus(sheet, columns, rowNumber, rule.toStatus, rule.statusFieldId);
            rowValues[statusCol - 1] = rule.toStatus;
            formUpdates += 1;
          });
        });

        if (formUpdates > 0) {
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
    options?: BootstrapContextOptions
  ): any {
    try {
      const includeHomeData = options?.includeHomeData === true;
      const includeAnalytics = options?.includeAnalytics === true;
      const { form, questions } = this.getFormContextLite(formKey);
      const out: any = {};
      const analyticsStartedAt = Date.now();
      if (includeAnalytics && def?.analytics?.widgets?.length) {
        let analytics = this.analytics.readSnapshot(form);
        if (!analytics.revision) {
          analytics = this.analytics.recomputeForm(form, questions, def);
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
      const projection = this.buildHomeSummaryProjection(def);
      const fetchPageSize = this.resolveHomeSummaryPageSize(def);
      const sort: { fieldId?: string; direction?: string } | undefined = def.listView?.defaultSort?.fieldId
        ? {
            fieldId: def.listView.defaultSort.fieldId,
            direction: (def.listView.defaultSort.direction || 'desc') as any
          }
        : undefined;
      const batch = this.listing.fetchSubmissionsSortedBatch(
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
      debugLog('renderForm.bootstrap.listPrefetch', {
        formKey,
        pageSize: fetchPageSize,
        items: (listResponse as any).items?.length || 0,
        totalCount: (listResponse as any).totalCount || 0,
        durationMs: Date.now() - startedAt
      });
      debugLog('bootstrap.homeData.ready', {
        formKey,
        pageSize: fetchPageSize,
        projectionCount: projection.length,
        summaryMode: true,
        durationMs: Date.now() - startedAt
      });
      out.listResponse = listResponse;
      out.records = {};
      return out;
    } catch (err: any) {
      debugLog('renderForm.bootstrap.error', { formKey, message: err?.message || err?.toString?.() || 'unknown' });
      return null;
    }
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
    const response = this.listing.fetchSubmissions(form, questions, effectiveProjection, pageSize, pageToken);
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
    const items = (Array.isArray(response.items) ? response.items : [])
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
    return {
      items,
      nextPageToken: response.nextPageToken,
      totalCount: items.length
    };
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
    }
  ): SubmissionBatchResult<Record<string, any>> {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionsSortedBatch(form, questions, projection, pageSize, pageToken, includePageRecords, recordIds, sort);
  }

  public fetchSubmissionById(formKey: string, id: string): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionById(form, questions, id);
  }

  public fetchSubmissionByRowNumber(formKey: string, rowNumber: number): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionByRowNumber(form, questions, rowNumber);
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

  public saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const { form, questions } = this.getFormContext(formKey);
    const dedupRules = this.resolveDedupRules(formKey, form);
    const result = this.submissions.saveSubmissionWithId(formObject, form, questions, dedupRules);
    if (result?.success) {
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
      this.refreshAnalyticsAndHomeBootstrap(form, questions, 'saveSubmissionWithId');
    }
    return result;
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

    const { form, questions } = this.getFormContext(formKey);
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

    const { form, questions } = this.getFormContext(formKey);
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
        const result = this.submissions.saveSubmissionWithId(payload, targetContext.form, targetContext.questions, targetDedupRules);
        if (!result?.success) {
          throw new Error((result?.message || 'Failed to update dependent records.').toString());
        }
        rollbackRecords.push(targetRecord);
        updatedCount += 1;
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
            const rollbackResult = this.submissions.saveSubmissionWithId(
              rollbackPayload,
              targetContext.form,
              targetContext.questions,
              targetDedupRules
            );
            if (!rollbackResult?.success) rollbackFailed = true;
          } catch (_) {
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
    } catch (_) {
      // ignore trigger errors
    }
  }

  public triggerFollowupAction(
    formKey: string,
    recordId: string,
    action: string
  ): FollowupActionResult {
    const { form, questions } = this.getFormContext(formKey);
    const result = this.followups.triggerFollowupAction(form, questions, recordId, action);
    if (result?.success) {
      this.refreshAnalyticsAndHomeBootstrap(form, questions, 'triggerFollowupAction');
    }
    return result;
  }

  public triggerFollowupActions(
    formKey: string,
    recordId: string,
    actions: string[]
  ): { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> } {
    const { form, questions } = this.getFormContext(formKey);
    const result = this.followups.triggerFollowupActions(form, questions, recordId, actions);
    if (result?.success) {
      this.refreshAnalyticsAndHomeBootstrap(form, questions, 'triggerFollowupActions');
    }
    return result;
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

  /**
   * Prefetch Doc/Markdown templates to make subsequent render actions faster.
   *
   * - Markdown templates: read template text from Drive and store in CacheService (when small enough).
   * - Doc templates: best-effort warmup of Drive file metadata (Doc body/copies cannot be cached safely).
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

    // Follow-up templates (Doc-based)
    if (form.followupConfig?.pdfTemplateId) docMaps.push(form.followupConfig.pdfTemplateId);
    if (form.followupConfig?.emailTemplateId) docMaps.push(form.followupConfig.emailTemplateId);
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

    debugLog('templates.prefetch.start', {
      formKey: key,
      markdown: markdownTemplateIds.length,
      html: htmlTemplateIds.length,
      doc: docTemplateIds.length
    });

    const ttlSeconds = form.templateCacheTtlSeconds;
    debugLog('templates.prefetch.cacheTtl', { formKey: key, ttlSeconds: ttlSeconds ?? null });
    const md = prefetchMarkdownTemplateIds(markdownTemplateIds, ttlSeconds);
    const html = prefetchHtmlTemplateIds(htmlTemplateIds, ttlSeconds);

    let docOk = 0;
    let docFailed = 0;
    docTemplateIds.forEach(id => {
      try {
        const f = DriveApp.getFileById(id);
        // Warm basic metadata (forces Drive fetch + permission check).
        (f.getName ? f.getName() : '').toString();
        docOk += 1;
      } catch (_) {
        const apiMeta = getDriveApiFile(id, 'templates.prefetch.doc');
        if (apiMeta) docOk += 1;
        else docFailed += 1;
      }
    });

    debugLog('templates.prefetch.done', { formKey: key, markdown: md, html, docOk, docFailed });

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
          } catch (_) {
            // ignore
          }
          try {
            return value.toString();
          } catch (_) {
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
    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
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
    const record = this.normalizeTemplateRenderRecord(formObject as any, questions, formKey);
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
    } catch (_) {
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
    questions: QuestionConfig[],
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
          } catch (_) {
            // keep raw
          }
        }
      });

    const record: WebFormSubmission = {
      formKey: formKey,
      language,
      values,
      id: formObject?.id ? formObject.id.toString() : undefined,
      createdAt: formObject?.createdAt ? formObject.createdAt.toString() : undefined,
      updatedAt: formObject?.updatedAt ? formObject.updatedAt.toString() : undefined,
      status: formObject?.status ? formObject.status.toString() : undefined,
      pdfUrl: undefined
    };
    return record;
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
            const saveResult = this.submissions.saveSubmissionWithId(payload, targetContext.form, targetContext.questions, targetDedupRules);
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
            if (effect.type === 'updateRecord') updated += 1;
            else created += 1;
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
          operation
        }
      };
    }

    touchedForms.forEach(target => {
      this.refreshAnalyticsAndHomeBootstrap(target.form, target.questions, 'saveSubmissionWithId.submitEffects');
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
        operation
      }
    };
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
      const resolved = resolveTemplateValue(args.effect, vars) as FollowupSubmitEffect;
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
      } catch (_) {
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
    } catch (_) {
      return '';
    }
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
    } catch (_) {
      return null;
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
    } catch (_) {
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
      } catch (_) {
        // ignore
      }
    }
    debugLog('home.rev.bump', { formKey: key, rev: next, reason: reason || 'manual' });
    return next;
  }

  private resolveHomeSummaryPageSize(def: WebFormDefinition): number {
    const configured = Number(def.listView?.pageSize || 10);
    return Number.isFinite(configured) && configured > 0 ? Math.max(1, Math.min(Math.floor(configured), 50)) : 10;
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

    const presets = Array.isArray((def.listView?.search as any)?.presets) ? ((def.listView?.search as any).presets as any[]) : [];
    presets.forEach(preset => {
      collectWhenFieldIds((preset as any)?.when);
      addProjection((preset as any)?.dateFieldId);
    });

    return Array.from(projectionIds);
  }

  private homeBootstrapCacheKey(formKey: string): string {
    return this.cacheManager.makeCacheKey('HOME_BOOTSTRAP_LATEST', [(formKey || '').toString().trim()]);
  }

  private homeBootstrapChunkBaseKey(formKey: string): string {
    return this.cacheManager.makeCacheKey('HOME_BOOTSTRAP_CHUNK', [(formKey || '').toString().trim()]);
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
      } catch (_) {
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
      } catch (_) {
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
      } catch (_) {
        return null;
      }
    })();
    let hasLock = false;
    try {
      if (lock) hasLock = !!lock.tryLock(150);
      const expectedRev = Number.isFinite(Number(rev)) ? Number(rev) : this.readHomeRevision(key);
      const cached = this.readCachedHomeBootstrap(key, expectedRev);
      if (cached?.listResponse) return;
      const bundled = this.resolveBundledConfig(key);
      const def = bundled ? this.buildBundledDefinition(bundled) : this.getOrBuildDefinition(key);
      const bootstrap = this.buildBootstrap(key, def, { includeHomeData: true });
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
    } catch (_) {
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
