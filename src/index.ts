import { FormGenerator } from './services/FormGenerator';
import { ConfigSheet } from './config/ConfigSheet';
import { WebFormService } from './services/WebFormService';
import { WebFormSubmission } from './types';

export function setup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const generator = new FormGenerator(ss);
  generator.setup();
}

export function createAllForms(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const generator = new FormGenerator(ss);
  const results = generator.createAllForms();
  
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

export function onConfigEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ConfigSheet.handleOptionEdit(ss, e);
}

export function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  const formKey = e?.parameter?.form;
  return service.renderForm(formKey, e?.parameter);
}

export function submitWebForm(formObject: any): { success: boolean; message: string } {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.submitWebForm(formObject);
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

export function saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: any } {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.saveSubmissionWithId(formObject);
}

export function uploadFiles(files: any, uploadConfig?: any): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.uploadFiles(files, uploadConfig);
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

export function renderSubmissionReportHtml(formObject: WebFormSubmission): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.renderSubmissionReportHtml(formObject);
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

export function migrateFormTemplatesToIdPlaceholders(formKey: string): any {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  return service.migrateFormTemplatesToIdPlaceholders(formKey);
}

export function installTriggers(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Check if trigger already exists to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.find(t => t.getHandlerFunction() === 'onConfigEdit');
  
  if (!existing) {
    ScriptApp.newTrigger('onConfigEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    Browser.msgBox('Trigger installed! You can now use the "Edit Options" checkboxes.');
  } else {
    Browser.msgBox('Trigger already installed.');
  }
}

export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Community Kitchen')
    .addItem('Setup Forms', 'setup')
    .addItem('Install Triggers (Required for Options)', 'installTriggers')
    .addItem('Create/Update All Forms', 'createAllForms')
    .addItem('Update & Translate Responses to English', 'translateAllResponses')
    .addToUi();
}
