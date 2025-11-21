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
    
    const headers = [
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID (DO NOT EDIT)', 'Edit URL', 'Published URL']
    ];
    
    sheet.getRange('A3:G3').setValues(headers).setFontWeight('bold').setBackground('#e0e0e0');
    
    // Example Data
    const examples = [
      ['Example Form', 'Config: Example', 'Form Responses', 'Multi-language form with date, text, number, and choice questions.', '', '', '']
    ];
    sheet.getRange(4, 1, examples.length, 7).setValues(examples);
    
    // Styling
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 250);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(6, 150);
    sheet.setColumnWidth(7, 150);
    
    return sheet;
  }

  public getForms(): FormConfig[] {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 4) return [];
    
    const data = this.sheet.getRange(4, 1, lastRow - 3, 5).getValues();
    const forms: FormConfig[] = [];
    
    data.forEach((row, index) => {
      const [title, configSheetName, destinationTab, description, formId] = row;
      if (title && configSheetName) {
        forms.push({
          title,
          configSheet: configSheetName,
          destinationTab,
          description,
          formId,
          rowIndex: index + 4
        });
      }
    });
    
    return forms;
  }

  public updateFormDetails(rowIndex: number, id: string, editUrl: string, publishedUrl: string): void {
    this.sheet.getRange(rowIndex, 5).setValue(id);
    this.sheet.getRange(rowIndex, 6).setValue(editUrl);
    this.sheet.getRange(rowIndex, 7).setValue(publishedUrl);
  }
}
