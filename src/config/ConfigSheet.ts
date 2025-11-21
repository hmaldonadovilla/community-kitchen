import { QuestionConfig, QuestionType } from '../types';

export class ConfigSheet {
  public static setupExample(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, exampleRows: any[]): void {
    if (ss.getSheetByName(name)) return;
    
    const sheet = ss.insertSheet(name);
    const headers = [
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status (Active/Archived)']
    ];
    
    sheet.getRange(1, 1, 1, 10).setValues(headers).setFontWeight('bold').setBackground('#f3f3f3');
    
    // Add IDs to example rows if missing
    const rowsWithIds = exampleRows.map(row => {
      const id = 'Q' + Math.random().toString(36).substr(2, 9).toUpperCase();
      return [id, ...row];
    });

    sheet.getRange(2, 1, rowsWithIds.length, 10).setValues(rowsWithIds);
    
    sheet.setColumnWidth(1, 100); // ID
    sheet.setColumnWidth(2, 100); // Type
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(8, 100);
    
    // Data validation for Type column
    const typeRange = sheet.getRange(2, 2, 100, 1);
    const typeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['DATE', 'TEXT', 'PARAGRAPH', 'NUMBER', 'CHOICE', 'CHECKBOX'])
      .setAllowInvalid(false)
      .build();
    typeRange.setDataValidation(typeRule);
    
    // Data validation for Required column
    const requiredRange = sheet.getRange(2, 6, 100, 1);
    const requiredRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'])
      .setAllowInvalid(false)
      .build();
    requiredRange.setDataValidation(requiredRule);
    
    // Data validation for Status column
    const statusRange = sheet.getRange(2, 10, 100, 1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Archived']).build();
    statusRange.setDataValidation(rule);
  }

  public static getQuestions(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): QuestionConfig[] {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
    
    this.ensureIds(sheet); // Ensure all rows have IDs before reading

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return []; // No questions
    
    const range = sheet.getRange(2, 1, lastRow - 1, 10);
    const data = range.getValues();
    
    return data.map(row => ({
      id: row[0].toString(),
      type: row[1].toString().toUpperCase() as QuestionType,
      qEn: row[2],
      qFr: row[3],
      qNl: row[4],
      required: !!row[5],
      options: row[6] ? row[6].toString().split(',').map((s: string) => s.trim()) : [],
      optionsFr: row[7] ? row[7].toString().split(',').map((s: string) => s.trim()) : [],
      optionsNl: row[8] ? row[8].toString().split(',').map((s: string) => s.trim()) : [],
      status: row[9] ? row[9].toString() as 'Active' | 'Archived' : 'Active'
    }));
  }

  private static ensureIds(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const idRange = sheet.getRange(2, 1, lastRow - 1, 1);
    const ids = idRange.getValues();
    let hasChanges = false;

    const newIds = ids.map(row => {
      if (!row[0]) {
        hasChanges = true;
        return ['Q' + Math.random().toString(36).substr(2, 9).toUpperCase()];
      }
      return row;
    });

    if (hasChanges) {
      idRange.setValues(newIds);
    }
  }
}
