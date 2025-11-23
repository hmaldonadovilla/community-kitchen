import { FormConfig } from '../types';

export const DASHBOARD_SHEET_NAME = 'Forms Dashboard';

export class Dashboard {
  private sheet: GoogleAppsScript.Spreadsheet.Sheet;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    let sheet = ss.getSheetByName(DASHBOARD_SHEET_NAME);
    if (!sheet) {
      sheet = this.createDashboard(ss);
    }
    this.sheet = sheet;
  }

  private createDashboard(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = ss.insertSheet(DASHBOARD_SHEET_NAME);
    sheet.getRange('A1').setValue('Forms Dashboard').setFontSize(14).setFontWeight('bold');

    const baseUrl = this.getWebAppUrl() || 'https://script.google.com/.../exec';
    const headers = [
      [
        'Form Title',
        'Configuration Sheet Name',
        'Destination Tab Name',
        'Description',
        'Web App URL (?form=ConfigSheetName)'
      ]
    ];

    sheet.getRange('A3:E3').setValues(headers).setFontWeight('bold').setBackground('#e0e0e0');

    const exampleAppUrl = `${baseUrl}?form=${encodeURIComponent('Config: Example')}`;
    const examples = [
      [
        'Example Form',
        'Config: Example',
        'Form Responses',
        'Multi-language form with date, text, number, and choice questions.',
        exampleAppUrl
      ]
    ];

    sheet.getRange(4, 1, examples.length, 5).setValues(examples);

    // Styling
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 250);
    sheet.setColumnWidth(5, 260);
    
    return sheet;
  }

  public getForms(): FormConfig[] {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 4) return [];

    const headerRow = this.sheet.getRange(3, 1, 1, this.sheet.getLastColumn()).getValues()[0].map(h => h?.toString().trim().toLowerCase());
    const findHeader = (labels: string[], fallback: number) => {
      const normalized = labels.map(l => l.toLowerCase());
      const found = headerRow.findIndex(h => normalized.some(n => h === n || h.startsWith(n)));
      return found >= 0 ? found : fallback;
    };

    const colTitle = findHeader(['form title'], 0);
    const colConfig = findHeader(['configuration sheet name'], 1);
    const colDestination = findHeader(['destination tab name'], 2);
    const colDescription = findHeader(['description'], 3);
    const colAppUrl = findHeader(['web app url (?form=configsheetname)', 'web app url'], -1);
    const legacyFormIdIndex = (headerRow.length === 0 || headerRow.length > 5) ? 4 : -1;
    const colFormId = findHeader(['form id', 'form id (legacy)'], legacyFormIdIndex);

    const data = this.sheet.getRange(4, 1, lastRow - 3, this.sheet.getLastColumn()).getValues();
    const forms: FormConfig[] = [];
    
    data.forEach((row, index) => {
      const title = row[colTitle];
      const configSheetName = row[colConfig];
      const destinationTab = row[colDestination];
      const description = row[colDescription];
      const appUrl = colAppUrl >= 0 ? row[colAppUrl] : undefined;
      const formId = colFormId >= 0 ? row[colFormId] : undefined;
      if (title && configSheetName) {
        forms.push({
          title,
          configSheet: configSheetName,
          destinationTab,
          description,
          appUrl,
          formId,
          rowIndex: index + 4
        });
      }
    });
    
    return forms;
  }

  public updateFormDetails(rowIndex: number, appUrl?: string): void {
    if (!appUrl) return;
    const headers = this.sheet.getRange(3, 1, 1, this.sheet.getLastColumn()).getValues()[0].map(h => h?.toString().trim().toLowerCase());
    const appUrlCol = headers.findIndex(h => h.startsWith('web app url')) + 1; // 1-based
    if (appUrlCol > 0) {
      this.sheet.getRange(rowIndex, appUrlCol).setValue(appUrl);
    }
  }

  public getWebAppUrl(): string {
    const propUrl = this.readWebAppUrlFromProps();
    if (propUrl) return propUrl;
    return this.resolveWebAppUrl();
  }

  private resolveWebAppUrl(): string {
    try {
      const service = (typeof ScriptApp !== 'undefined' && ScriptApp.getService) ? ScriptApp.getService() : undefined;
      const rawUrl = service?.getUrl ? service.getUrl() : '';
      if (!rawUrl) return '';
      // Prefer exec URL over dev when available
      return rawUrl.replace(/\/dev(\b|$)/, '/exec');
    } catch (_) {
      return '';
    }
  }

  private readWebAppUrlFromProps(): string {
    try {
      const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
        ? PropertiesService.getScriptProperties()
        : undefined;
      const url = props?.getProperty('WEB_APP_URL') || props?.getProperty('WEBAPP_URL');
      return url || '';
    } catch (_) {
      return '';
    }
  }
}
