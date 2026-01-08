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
import { collectTemplateIdsFromMap, migrateDocTemplatePlaceholdersToIds } from './webform/followup/templateMigration';
import { prefetchMarkdownTemplateIds } from './webform/followup/markdownTemplateCache';
import { prefetchHtmlTemplateIds } from './webform/followup/htmlTemplateCache';

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

  public fetchSubmissionsSortedBatch(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[],
    sort?: { fieldId?: string; direction?: string }
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

  public saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const { form, questions } = this.getFormContext(formKey);
    const dedupRules = loadDedupRules(this.ss, form.configSheet);
    return this.submissions.saveSubmissionWithId(formObject, form, questions, dedupRules);
  }

  /**
   * Lightweight dedup precheck used by the React client to avoid creating duplicate records
   * (e.g., when presets/defaults populate dedup keys).
   */
  public checkDedupConflict(formObject: WebFormSubmission): { success: boolean; conflict?: any; message?: string } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const { form, questions } = this.getFormContextLite(formKey);
    const dedupRules = loadDedupRules(this.ss, form.configSheet);
    return this.submissions.checkDedupConflict(formObject, form, questions, dedupRules);
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
        docFailed += 1;
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
      const msg = (err?.message || err?.toString?.() || 'Failed to trash preview file.').toString();
      debugLog('preview.trash.failed', { fileId, message: msg });
      return { success: false, message: msg };
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
      debugLog('uploadFiles.error', { message: err?.message || err?.toString?.() || 'unknown' });
      return { success: false, urls: '', message: 'Failed to upload files.' };
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
