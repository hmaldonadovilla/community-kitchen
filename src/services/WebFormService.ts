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
import { buildLegacyTemplate, buildReactTemplate } from './webform/template';
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

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
    const cache = this.resolveCache();
    const docProps = getDocumentProperties();
    const cachePrefix = CacheEtagManager.computeCachePrefix(docProps);
    this.cacheManager = new CacheEtagManager(cache, docProps, cachePrefix);
    const uploads = new UploadService(ss);
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

  public renderForm(formKey?: string, params?: Record<string, any>): GoogleAppsScript.HTML.HtmlOutput {
    const useLegacy = this.shouldUseLegacy(params);
    debugLog('renderForm.start', { requestedKey: formKey, mode: useLegacy ? 'legacy' : 'react' });
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const html = useLegacy ? buildLegacyTemplate(def, targetKey) : buildReactTemplate(def, targetKey);
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
    const { form, questions } = this.getFormContext(formKey);
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
    const { form, questions } = this.getFormContext(formKey);
    return this.listing.fetchSubmissionsBatch(form, questions, projection, pageSize, pageToken, includePageRecords, recordIds);
  }

  public fetchSubmissionById(formKey: string, id: string): WebFormSubmission | null {
    const { form, questions } = this.getFormContext(formKey);
    return this.listing.fetchSubmissionById(form, questions, id);
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

  private getFormContext(formKey?: string): { form: FormConfig; questions: QuestionConfig[] } {
    const form = this.definitionBuilder.findForm(formKey);
    const questions = this.loadActiveQuestions(form.configSheet);
    return { form, questions };
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

  private shouldUseLegacy(params?: Record<string, any>): boolean {
    if (!params) return false;
    const candidate =
      (params as any).legacy ??
      (params as any).view ??
      (params as any).ui ??
      (params as any).react;
    const normalized = Array.isArray(candidate) ? candidate[0] : candidate;
    if (normalized === undefined || normalized === null) {
      return false;
    }
    const text = normalized.toString().toLowerCase();
    if (text === 'legacy' || text === 'classic' || text === 'html' || text === 'iframe') {
      return true;
    }
    if (text === 'react') {
      return false;
    }
    if (text === '1' || text === 'true') {
      // maintain compatibility with existing view=react URLs
      return false;
    }
    if (text === '0' || text === 'false') {
      return true;
    }
    return false;
  }
}
