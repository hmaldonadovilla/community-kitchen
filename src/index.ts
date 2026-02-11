import { FormGenerator } from './services/FormGenerator';
import { ConfigSheet } from './config/ConfigSheet';
import { WebFormService } from './services/WebFormService';
import { WebFormDefinition, WebFormSubmission } from './types';
import { bumpTemplateCacheEpoch } from './services/webform/followup/templateCacheEpoch';
import { renderReactBundle } from './services/webform/bundles';

export function setup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const generator = new FormGenerator(ss);
  generator.setup();
}

export function createAllForms(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const generator = new FormGenerator(ss);

  // IMPORTANT:
  // - HTML/Markdown templates are cached in CacheService for performance.
  // - If you replace a Drive file but keep the same fileId, CacheService may still return the old content
  //   until TTL expires. Bumping the epoch forces immediate refresh on next render/prefetch.
  const bust = bumpTemplateCacheEpoch();

  const results = generator.createAllForms();

  if (bust.success && bust.epoch) {
    results.unshift(`Template caches flushed (epoch ${bust.epoch}).`);
  } else {
    results.unshift(`Template cache flush skipped: ${(bust.message || 'unknown error').toString()}`);
  }
  
  Logger.log('=== Form Generation Results ===');
  results.forEach((result: string) => Logger.log(result));
  
  Browser.msgBox('Form Generation Complete', results.join('\n\n'), Browser.Buttons.OK);
}

export function translateAllResponses(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const generator = new FormGenerator(ss);
  const results = generator.translateAllResponses();
  
  Logger.log('=== Translation Results ===');
  results.forEach((result: string) => Logger.log(result));
  
  Browser.msgBox('Translation Complete', results.join('\n\n'), Browser.Buttons.OK);
}

/**
 * Optional scheduled warm-up entrypoint.
 *
 * Attach a time-based trigger to this function in production to prebuild and
 * cache WebFormDefinition objects for all forms. This keeps doGet() lean for
 * end-users by avoiding per-request config parsing on large sheets.
 */
export function warmDefinitions(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  service.warmDefinitions();
}

export function onConfigEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ConfigSheet.handleOptionEdit(ss, e);
}

export function onResponsesEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  service.onResponsesEdit(e);
}

export function doGet(
  e: GoogleAppsScript.Events.DoGet
): GoogleAppsScript.HTML.HtmlOutput | GoogleAppsScript.Content.TextOutput {
  const params = e?.parameter || {};
  const bundle = (params.bundle || '').toString().trim().toLowerCase();
  if (bundle === 'react') {
    return renderReactBundle((params.app ?? params.page ?? '').toString());
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  const formKey = params.form;
  const configParam = (params.config || params.export || '').toString().trim().toLowerCase();
  const wantsConfig =
    configParam === '1' ||
    configParam === 'true' ||
    configParam === 'yes' ||
    configParam === 'config' ||
    configParam === 'full' ||
    configParam === 'export';
  if (wantsConfig) {
    const config = service.fetchFormConfig(formKey);
    const output = ContentService.createTextOutput(JSON.stringify(config, null, 2));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
  return service.renderForm(formKey, params);
}

export function submitWebForm(formObject: any): { success: boolean; message: string } {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.submitWebForm(formObject);
}

export function fetchBootstrapContext(formKey?: string): {
  definition: WebFormDefinition;
  formKey: string;
  listResponse?: any;
  records?: Record<string, WebFormSubmission>;
  homeRev?: number;
  configSource?: string;
  configEnv?: string;
  envTag?: string;
} {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchBootstrapContext(formKey);
}

export function fetchHomeBootstrap(formKey: string, clientRev?: number): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchHomeBootstrap(formKey, clientRev);
}

export function fetchFormConfig(formKey?: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchFormConfig(formKey);
}

// New endpoints (scaffolding)
export function fetchDataSource(
  dataSourceId: string,
  locale?: string,
  projection?: string[],
  limit?: number,
  pageToken?: string
): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchDataSource(dataSourceId, locale, projection, limit, pageToken);
}

export function fetchSubmissions(
  formKey: string,
  projection?: string[],
  pageSize: number = 10,
  pageToken?: string
): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissions(formKey, projection, pageSize, pageToken);
}

export function fetchSubmissionsBatch(
  formKey: string,
  projection?: string[],
  pageSize: number = 10,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[]
): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissionsBatch(formKey, projection, pageSize, pageToken, includePageRecords, recordIds);
}

export function fetchSubmissionsSortedBatch(
  formKey: string,
  projection?: string[],
  pageSize: number = 10,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[],
  sort?: { fieldId?: string; direction?: string; __ifNoneMatch?: boolean; __clientEtag?: string }
): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissionsSortedBatch(formKey, projection, pageSize, pageToken, includePageRecords, recordIds, sort);
}

export function fetchSubmissionById(formKey: string, id: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissionById(formKey, id);
}

export function fetchSubmissionByRowNumber(formKey: string, rowNumber: number): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissionByRowNumber(formKey, rowNumber);
}

export function fetchSubmissionsByRowNumbers(formKey: string, rowNumbers: number[]): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.fetchSubmissionsByRowNumbers(formKey, rowNumbers);
}

export function getRecordVersion(formKey: string, recordId: string, rowNumberHint?: number): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.getRecordVersion(formKey, recordId, rowNumberHint);
}

export function rebuildIndexes(formKey?: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  const res = service.rebuildIndexes(formKey);
  try {
    const msg = res?.success ? (res.message || 'Index rebuild complete.') : (res?.message || 'Index rebuild failed.');
    Browser.msgBox('Rebuild Indexes', msg.toString(), Browser.Buttons.OK);
  } catch (_) {
    // ignore
  }
  return res;
}

export function invalidateWebAppCache(reason?: string): { success: boolean; version?: string | null; message?: string } {
  try {
    const resolvedReason = (reason || '').toString().trim() || 'manual';
    const version = WebFormService.invalidateServerCache(`invalidateWebAppCache:${resolvedReason}`);
    const bust = bumpTemplateCacheEpoch();
    const msgParts: string[] = [];
    msgParts.push(version ? `Web app cache version bumped to ${version}.` : 'Web app cache version bump failed.');
    msgParts.push(
      bust.success && bust.epoch ? `Template caches flushed (epoch ${bust.epoch}).` : `Template cache flush skipped: ${(bust.message || 'unknown').toString()}`
    );
    try {
      Browser.msgBox('Invalidate Web App Cache', msgParts.join('\n\n'), Browser.Buttons.OK);
    } catch (_) {
      // ignore
    }
    return { success: !!version, version, message: msgParts.join(' ') };
  } catch (err: any) {
    const message = (err?.message || err?.toString?.() || 'unknown').toString();
    try {
      Browser.msgBox('Invalidate Web App Cache', message, Browser.Buttons.OK);
    } catch (_) {
      // ignore
    }
    return { success: false, version: null, message };
  }
}

export function saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.saveSubmissionWithId(formObject);
}

export function checkDedupConflict(formObject: WebFormSubmission): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.checkDedupConflict(formObject);
}

export function uploadFiles(files: any, uploadConfig?: any): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.uploadFiles(files, uploadConfig);
}

export function prefetchTemplates(formKey: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.prefetchTemplates(formKey);
}

export function renderDocTemplate(formObject: WebFormSubmission, buttonId: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderDocTemplate(formObject, buttonId);
}

export function renderDocTemplatePdfPreview(formObject: WebFormSubmission, buttonId: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderDocTemplatePdfPreview(formObject, buttonId);
}

export function renderDocTemplateHtml(formObject: WebFormSubmission, buttonId: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderDocTemplateHtml(formObject, buttonId);
}

export function renderMarkdownTemplate(formObject: WebFormSubmission, buttonId: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderMarkdownTemplate(formObject, buttonId);
}

export function renderHtmlTemplate(formObject: WebFormSubmission, buttonId: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderHtmlTemplate(formObject, buttonId);
}

export function renderSubmissionReportHtml(formObject: WebFormSubmission): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderSubmissionReportHtml(formObject);
}

export function renderSummaryHtmlTemplate(formObject: WebFormSubmission): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderSummaryHtmlTemplate(formObject);
}

export function trashPreviewArtifact(cleanupToken: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.trashPreviewArtifact(cleanupToken);
}

export function triggerFollowupAction(formKey: string, recordId: string, action: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.triggerFollowupAction(formKey, recordId, action);
}

export function triggerFollowupActions(formKey: string, recordId: string, actions: string[]): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.triggerFollowupActions(formKey, recordId, actions);
}

export function migrateFormTemplatesToIdPlaceholders(formKey: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.migrateFormTemplatesToIdPlaceholders(formKey);
}

export function installTriggers(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Check if trigger already exists to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  const hasConfig = triggers.some(t => t.getHandlerFunction() === 'onConfigEdit');
  const hasResponses = triggers.some(t => t.getHandlerFunction() === 'onResponsesEdit');
  
  if (!hasConfig) {
    ScriptApp.newTrigger('onConfigEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }

  if (!hasResponses) {
    ScriptApp.newTrigger('onResponsesEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }

  if (!hasConfig && !hasResponses) {
    Browser.msgBox('Triggers installed! (Options + Response indexing)');
  } else if (!hasConfig && hasResponses) {
    Browser.msgBox('Trigger installed! (Options)');
  } else if (hasConfig && !hasResponses) {
    Browser.msgBox('Trigger installed! (Response indexing)');
  } else {
    Browser.msgBox('Triggers already installed.');
  }
}

export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Community Kitchen')
    .addItem('Setup Forms', 'setup')
    .addItem('Install Triggers (Options + Response indexing)', 'installTriggers')
    .addItem('Create/Update All Forms', 'createAllForms')
    .addItem('Invalidate Web App Cache', 'invalidateWebAppCache')
    .addItem('Rebuild Indexes (Data Version + Dedup)', 'rebuildIndexes')
    .addItem('Update & Translate Responses to English', 'translateAllResponses')
    .addToUi();
}
