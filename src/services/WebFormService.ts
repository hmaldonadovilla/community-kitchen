import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import {
  FormConfig,
  FormConfigExport,
  DedupRule,
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
import { buildReactShellTemplate, buildReactTemplate } from './webform/template';
import { getDriveApiFile, trashDriveApiFile } from './webform/driveApi';
import { loadDedupRules, computeDedupSignature } from './dedup';
import { collectTemplateIdsFromMap, migrateDocTemplatePlaceholdersToIds } from './webform/followup/templateMigration';
import { prefetchMarkdownTemplateIds } from './webform/followup/markdownTemplateCache';
import { prefetchHtmlTemplateIds } from './webform/followup/htmlTemplateCache';
import { ensureRecordIndexSheet } from './webform/recordIndex';
import { getBundledConfigEnv, getBundledFormConfig, listBundledFormConfigs } from './webform/formConfigBundle';
import { getUiEnvTag } from './webform/envTag';

const HOME_BOOTSTRAP_CACHE_TTL_SECONDS = 60 * 60 * 6; // CacheService max TTL
const HOME_REV_PROPERTY_PREFIX = 'CK_HOME_REV_';
const HOME_BOOTSTRAP_CHUNK_SIZE = 95 * 1024; // Keep margin under CacheService ~100KB item limit.
const HOME_BOOTSTRAP_MAX_CHUNKS = 24;

type HomeBootstrapCachePayload = {
  rev: number;
  listResponse?: PaginatedResult<Record<string, any>>;
  records?: Record<string, WebFormSubmission>;
  cachedAt?: string;
};

type HomeBootstrapChunkMeta = {
  rev: number;
  chunks: number;
  cachedAt?: string;
};

export class WebFormService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;
  private cacheManager: CacheEtagManager;
  private definitionBuilder: DefinitionBuilder;
  private dataSources: DataSourceService;
  private submissions: SubmissionService;
  private listing: ListingService;
  private followups: FollowupService;
  private uploads: UploadService;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
    const cache = this.resolveCache();
    const docProps = getDocumentProperties();
    const cachePrefix = CacheEtagManager.computeCachePrefix(docProps);
    this.cacheManager = new CacheEtagManager(cache, docProps, cachePrefix);
    const uploads = new UploadService(ss);
    this.uploads = uploads;
    this.definitionBuilder = new DefinitionBuilder(ss, this.dashboard);
    this.dataSources = new DataSourceService(ss);
    this.submissions = new SubmissionService(ss, uploads, this.cacheManager, docProps);
    this.listing = new ListingService(this.submissions, this.cacheManager);
    this.followups = new FollowupService(ss, this.submissions, this.dataSources);
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

  private buildBundledDefinition(bundled: FormConfigExport): WebFormDefinition {
    const activeQuestions = this.filterActiveQuestions(bundled.questions || []);
    return this.definitionBuilder.buildDefinitionFromConfig(bundled.form, activeQuestions, bundled.dedupRules || []);
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

  public fetchBootstrapContext(formKey?: string): {
    definition: WebFormDefinition;
    formKey: string;
    listResponse?: PaginatedResult<Record<string, any>>;
    records?: Record<string, WebFormSubmission>;
    homeRev?: number;
    configSource?: string;
    configEnv?: string;
    envTag?: string;
  } {
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
        configEnv: configEnv || null,
        envTag: envTag || null
      });
      const bootstrap = this.buildBootstrap(resolvedKey, def);
      const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
      const rev = this.readHomeRevision(canonicalKey);
      this.cacheHomeBootstrap(canonicalKey, rev, bootstrap || null, 'fetchBootstrapContext.bundled');
      return {
        definition: def,
        formKey: resolvedKey,
        configSource: 'bundled',
        configEnv,
        envTag,
        homeRev: rev,
        listResponse: (bootstrap as any)?.listResponse,
        records: (bootstrap as any)?.records
      };
    }
    const def = this.getOrBuildDefinition(formKey);
    const resolvedKey = (formKey || '').toString().trim() || def.title || '__DEFAULT__';
    debugLog('definition.fetch', {
      formKey: resolvedKey,
      questions: def.questions?.length || 0,
      source: 'sheet',
      configEnv: configEnv || null,
      envTag: envTag || null
    });
    const bootstrap = this.buildBootstrap(resolvedKey, def);
    const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
    const rev = this.readHomeRevision(canonicalKey);
    this.cacheHomeBootstrap(canonicalKey, rev, bootstrap || null, 'fetchBootstrapContext.sheet');
    return {
      definition: def,
      formKey: resolvedKey,
      configSource: 'sheet',
      configEnv,
      envTag,
      homeRev: rev,
      listResponse: (bootstrap as any)?.listResponse,
      records: (bootstrap as any)?.records
    };
  }

  public fetchHomeBootstrap(
    formKey: string,
    clientRev?: number
  ): { notModified: boolean; rev: number; listResponse?: PaginatedResult<Record<string, any>>; records?: Record<string, WebFormSubmission>; cache?: 'hit' | 'miss' } {
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
    const bootstrap = this.buildBootstrap(canonicalKey || formKey, def);
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

  public renderForm(formKey?: string, params?: Record<string, any>): GoogleAppsScript.HTML.HtmlOutput {
    const targetKey = (formKey || '').toString().trim();
    const bundleTarget = ((params as any)?.app ?? (params as any)?.page ?? '').toString().trim();
    const serverListBootstrapEnabled = (() => {
      const raw = ((params as any)?.serverListBootstrap ?? (params as any)?.bootstrapList ?? '').toString().trim().toLowerCase();
      if (!raw) return false;
      return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    })();
    const requestParams = (() => {
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
    const bundled = this.resolveBundledConfig(targetKey || undefined);
    const configEnv = getBundledConfigEnv() || undefined;
    const envTag = getUiEnvTag() || undefined;

    const mode = bundled ? 'react-embedded' : 'react-shell';
    debugLog('renderForm.start', {
      requestedKey: targetKey || '__DEFAULT__',
      mode,
      bundleTarget: bundleTarget || 'full',
      serverListBootstrapEnabled
    });

    const html = (() => {
      if (!bundled) return buildReactShellTemplate(targetKey, bundleTarget, requestParams);
      const def = this.buildBundledDefinition(bundled);
      const resolvedKey =
        targetKey ||
        bundled.formKey ||
        bundled.form?.configSheet ||
        bundled.form?.title ||
        '__DEFAULT__';
      const canonicalKey = this.resolveCanonicalFormKey(resolvedKey) || resolvedKey;
      const homeRev = this.readHomeRevision(canonicalKey);
      const bootstrapPayload = { configSource: 'bundled', configEnv, envTag, homeRev } as any;
      const cachedBootstrap = this.readCachedHomeBootstrap(canonicalKey, homeRev);
      if (cachedBootstrap?.listResponse) {
        bootstrapPayload.listResponse = cachedBootstrap.listResponse;
        bootstrapPayload.records = cachedBootstrap.records || {};
        debugLog('renderForm.bootstrap.cached.hit', {
          formKey: resolvedKey,
          rev: homeRev,
          items: (cachedBootstrap.listResponse.items || []).length,
          totalCount: (cachedBootstrap.listResponse as any)?.totalCount || 0
        });
      } else {
        debugLog('renderForm.bootstrap.cached.miss', {
          formKey: resolvedKey,
          rev: homeRev
        });
      }
      if (serverListBootstrapEnabled) {
        const bootstrap = this.buildBootstrap(resolvedKey, def);
        if (bootstrap?.listResponse) {
          bootstrapPayload.listResponse = bootstrap.listResponse;
          bootstrapPayload.records = bootstrap.records || {};
          this.cacheHomeBootstrap(canonicalKey, homeRev, bootstrap, 'renderForm.serverListBootstrapEnabled');
          debugLog('renderForm.bootstrap.embedded', {
            formKey: resolvedKey,
            items: (bootstrap.listResponse.items || []).length,
            totalCount: (bootstrap.listResponse as any)?.totalCount || 0
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
      return buildReactTemplate(def, resolvedKey, bootstrapPayload, bundleTarget, requestParams);
    })();

    debugLog('renderForm.htmlBuilt', {
      formKey: targetKey || '__DEFAULT__',
      bundleTarget: bundleTarget || 'full',
      htmlLength: html.length,
      hasInitCall: html.includes('init();'),
      scriptCloseCount: (html.match(/<\/script/gi) || []).length
    });
    const output = HtmlService.createHtmlOutput(html);
    output.setTitle(targetKey || 'Community Kitchen');
    return output;
  }

  private buildBootstrap(formKey: string, def: WebFormDefinition): any {
    try {
      if (!def?.listView?.columns?.length) return null;
      const { form, questions } = this.getFormContextLite(formKey);

      const metaFields = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
      const projectionIds = new Set<string>();
      const addProjection = (fieldId: string) => {
        const fid = (fieldId || '').toString().trim();
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
        const fidRaw = (when as any).fieldId ?? (when as any).field ?? (when as any).id;
        const fid = fidRaw !== undefined && fidRaw !== null ? fidRaw.toString().trim() : '';
        if (fid) addProjection(fid);
      };
      (def.listView.columns || []).forEach(col => {
        if (!col) return;
        const type = (col as any).type;
        if (type === 'rule') {
          const colHref = (col as any).hrefFieldId;
          if (colHref !== undefined && colHref !== null) addProjection(colHref);
          const cases = Array.isArray((col as any).cases) ? ((col as any).cases as any[]) : [];
          cases.forEach(entry => {
            collectWhenFieldIds(entry?.when);
            addProjection(entry?.hrefFieldId);
          });
          addProjection((col as any)?.default?.hrefFieldId);
          return;
        }
        if ((col as any).kind === 'meta') return;
        addProjection((col as any).fieldId);
      });
      const projection = Array.from(projectionIds);
      const listSearchMode = (def.listView?.search?.mode || 'text').toString();
      const dateSearchFieldId = ((def.listView?.search as any)?.dateFieldId || '').toString().trim();
      if (listSearchMode === 'date' && dateSearchFieldId) addProjection(dateSearchFieldId);
      if (listSearchMode === 'advanced') {
        const fieldsRaw = (def.listView?.search as any)?.fields;
        const fields: string[] = (() => {
          if (fieldsRaw === undefined || fieldsRaw === null) return [];
          if (Array.isArray(fieldsRaw)) return fieldsRaw.map(v => (v === undefined || v === null ? '' : `${v}`.trim())).filter(Boolean);
          const str = `${fieldsRaw}`.trim();
          if (!str) return [];
          return str
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        })();
        fields.forEach(addProjection);
      }

      const startedAt = Date.now();
      const fetchPageSize = Math.max(1, Math.min(def.listView?.pageSize || 10, 50));
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
      if (!listResponse || !Array.isArray((listResponse as any).items)) return null;
      debugLog('renderForm.bootstrap.listPrefetch', {
        formKey,
        pageSize: fetchPageSize,
        items: (listResponse as any).items?.length || 0,
        totalCount: (listResponse as any).totalCount || 0,
        durationMs: Date.now() - startedAt
      });
      return { listResponse, records: {} };
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
    return this.dataSources.fetchDataSource(source, locale, projection, limit, pageToken);
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
    sort?: { fieldId?: string; direction?: string; __ifNoneMatch?: boolean; __clientEtag?: string }
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
      const canonicalKey = (form.configSheet || form.title || formKey || '').toString().trim();
      const rev = this.bumpHomeRevision(canonicalKey, 'saveSubmissionWithId');
      this.primeHomeBootstrapCache(canonicalKey, rev, 'saveSubmissionWithId');
    }
    return result;
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
      const canonicalKey = (form.configSheet || form.title || match.configSheet || match.title || '').toString().trim();
      const rev = this.bumpHomeRevision(canonicalKey, 'onResponsesEdit');
      this.primeHomeBootstrapCache(canonicalKey, rev, 'onResponsesEdit');
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
      const canonicalKey = (form.configSheet || form.title || formKey || '').toString().trim();
      const rev = this.bumpHomeRevision(canonicalKey, 'triggerFollowupAction');
      this.primeHomeBootstrapCache(canonicalKey, rev, 'triggerFollowupAction');
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
      const canonicalKey = (form.configSheet || form.title || formKey || '').toString().trim();
      const rev = this.bumpHomeRevision(canonicalKey, 'triggerFollowupActions');
      this.primeHomeBootstrapCache(canonicalKey, rev, 'triggerFollowupActions');
    }
    return result;
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
    if (!list || !Array.isArray((list as any).items)) return null;
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
    if (normalized?.listResponse) return normalized;
    return this.readCachedHomeBootstrapChunked(key, expectedRev);
  }

  private cacheHomeBootstrap(formKey: string, rev: number, bootstrap: any, reason?: string): void {
    const key = (formKey || '').toString().trim();
    if (!key || !bootstrap?.listResponse || !Array.isArray((bootstrap.listResponse as any).items)) return;
    const payload: HomeBootstrapCachePayload = {
      rev: Number.isFinite(Number(rev)) ? Number(rev) : this.readHomeRevision(key),
      listResponse: bootstrap.listResponse,
      records: bootstrap.records || {},
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
      const bootstrap = this.buildBootstrap(key, def);
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
    try {
      return (typeof CacheService !== 'undefined' && (CacheService as any).getScriptCache)
        ? (CacheService as any).getScriptCache()
        : null;
    } catch (_) {
      return null;
    }
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
