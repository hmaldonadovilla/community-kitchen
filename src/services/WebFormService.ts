import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import {
  FormConfig,
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
import { buildReactTemplate } from './webform/template';
import { loadDedupRules } from './dedup';

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

  public buildDefinition(formKey?: string): WebFormDefinition {
    const def = this.definitionBuilder.buildDefinition(formKey);
    debugLog('buildDefinition.formSelected', { requestedKey: formKey, formTitle: def.title });
    return def;
  }

  public renderForm(formKey?: string, _params?: Record<string, any>): GoogleAppsScript.HTML.HtmlOutput {
    debugLog('renderForm.start', { requestedKey: formKey, mode: 'react' });
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const bootstrap = this.buildBootstrap(targetKey, def);
    const html = buildReactTemplate(def, targetKey, bootstrap);
    debugLog('renderForm.htmlBuilt', {
      formKey: targetKey,
      questionCount: def.questions.length,
      languages: def.languages,
      htmlLength: html.length,
      hasInitCall: html.includes('init();'),
      scriptCloseCount: (html.match(/<\/script/gi) || []).length
    });
    const output = HtmlService.createHtmlOutput(html);
    output.setTitle(def.title || 'Form');
    return output;
  }

  private buildBootstrap(formKey: string, def: WebFormDefinition): any {
    try {
      if (!def?.listView?.columns?.length) return null;
      const { form, questions } = this.getFormContextLite(formKey);

      const projection = (def.listView.columns || [])
        .filter(col => col && col.kind !== 'meta')
        .map(col => (col.fieldId || '').toString())
        .filter(Boolean);

      const fetchPageSize = 50;
      const recordBootstrapLimit = 25;
      let token: string | undefined;
      let aggregated: any[] = [];
      let lastRes: any = null;
      let pages = 0;
      const startedAt = Date.now();

      do {
        const res = this.listing.fetchSubmissions(form, questions, projection, fetchPageSize, token);
        lastRes = res;
        const items = (res && Array.isArray((res as any).items)) ? (res as any).items : [];
        aggregated = aggregated.concat(items);
        token = (res as any)?.nextPageToken;
        pages += 1;
        if (!token || aggregated.length >= ((res as any)?.totalCount || 200)) {
          token = undefined;
        }
      } while (token);

      debugLog('renderForm.bootstrap.listPrefetch', {
        formKey,
        pages,
        items: aggregated.length,
        durationMs: Date.now() - startedAt
      });

      if (!lastRes) return null;
      const totalCount = (lastRes as any)?.totalCount || aggregated.length;

      // For small datasets, also embed record snapshots so record selection is instant (no google.script.run call on click).
      if (totalCount > 0 && totalCount <= recordBootstrapLimit) {
        const batch = this.listing.fetchSubmissionsBatch(form, questions, projection, totalCount, undefined, true);
        const listResponse = { ...(batch?.list as any), items: (batch?.list as any)?.items || aggregated, nextPageToken: undefined };
        const records = (batch as any)?.records || {};
        debugLog('renderForm.bootstrap.recordPrefetch', {
          formKey,
          records: Object.keys(records).length,
          totalCount,
          durationMs: Date.now() - startedAt
        });
        return { listResponse, records };
      }

      const listResponse = { ...(lastRes as any), items: aggregated, nextPageToken: undefined };
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

  public static invalidateServerCache(reason?: string): void {
    CacheEtagManager.invalidate(getDocumentProperties(), reason);
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

  public fetchSubmissionById(formKey: string, id: string): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionById(form, questions, id);
  }

  public fetchSubmissionByRowNumber(formKey: string, rowNumber: number): WebFormSubmission | null {
    const { form, questions } = this.getFormContextLite(formKey);
    return this.listing.fetchSubmissionByRowNumber(form, questions, rowNumber);
  }

  public saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const { form, questions } = this.getFormContext(formKey);
    const dedupRules = loadDedupRules(this.ss, form.configSheet);
    return this.submissions.saveSubmissionWithId(formObject, form, questions, dedupRules);
  }

  public triggerFollowupAction(
    formKey: string,
    recordId: string,
    action: string
  ): FollowupActionResult {
    const { form, questions } = this.getFormContext(formKey);
    return this.followups.triggerFollowupAction(form, questions, recordId, action);
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
    const btn = questions.find(q => q && q.type === 'BUTTON' && q.id === (buttonId || '').toString());
    const cfg: any = (btn as any)?.button;
    if (!btn || !cfg || cfg.action !== 'renderDocTemplate' || !cfg.templateId) {
      return { success: false, message: `Unknown or misconfigured button "${buttonId}".` };
    }

    // Normalize language (supports array input like other endpoints).
    const langValue = Array.isArray((formObject as any).language)
      ? ((formObject as any).language[(formObject as any).language.length - 1] || (formObject as any).language[0])
      : (formObject as any).language;
    const languageRaw = (langValue || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const values = (formObject as any).values && typeof (formObject as any).values === 'object' ? { ...(formObject as any).values } : {};
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
      id: (formObject as any).id ? (formObject as any).id.toString() : undefined,
      createdAt: (formObject as any).createdAt ? (formObject as any).createdAt.toString() : undefined,
      updatedAt: (formObject as any).updatedAt ? (formObject as any).updatedAt.toString() : undefined,
      status: (formObject as any).status ? (formObject as any).status.toString() : undefined,
      pdfUrl: undefined
    };

    debugLog('renderDocTemplate.start', { formKey, buttonId: btn.id, language });
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
   * Upload files to Drive and return the resulting URL list string (comma-separated).
   * This does not write anything to the destination tab; the caller should save the URLs via saveSubmissionWithId.
   */
  public uploadFiles(files: any, uploadConfig?: any): { success: boolean; urls: string; message?: string } {
    try {
      const urls = this.uploads.saveFiles(files, uploadConfig);
      return { success: true, urls: urls || '' };
    } catch (err: any) {
      debugLog('uploadFiles.error', { message: err?.message || err?.toString?.() || 'unknown' });
      return { success: false, urls: '', message: 'Failed to upload files.' };
    }
  }

  private getFormContext(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } {
    const form = this.definitionBuilder.findForm(formKey);
    const questions = this.loadActiveQuestions(form.configSheet);
    return { form, questions };
  }

  private getFormContextLite(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } {
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

  private resolveCache(): GoogleAppsScript.Cache.Cache | null {
    try {
      return (typeof CacheService !== 'undefined' && (CacheService as any).getScriptCache)
        ? (CacheService as any).getScriptCache()
        : null;
    } catch (_) {
      return null;
    }
  }

}
