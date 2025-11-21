import { FormGenerator } from './services/FormGenerator';

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

export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Community Kitchen')
    .addItem('Setup Example', 'setup')
    .addItem('Create/Update All Forms', 'createAllForms')
    .addItem('Update & Translate Responses to English', 'translateAllResponses')
    .addToUi();
}
