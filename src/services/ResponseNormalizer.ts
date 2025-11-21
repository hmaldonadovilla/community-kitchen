import { QuestionConfig } from '../types';

export class ResponseNormalizer {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
  }

  public normalize(destinationTabName: string, questions: QuestionConfig[]): void {
    const rawSheet = this.ss.getSheetByName(destinationTabName);
    if (!rawSheet) return; // Should not happen if generator worked

    const cleanTabName = destinationTabName + ' (Clean)';
    let cleanSheet = this.ss.getSheetByName(cleanTabName);
    
    if (!cleanSheet) {
      cleanSheet = this.ss.insertSheet(cleanTabName);
    } else {
      cleanSheet.clear();
    }

    // Hide raw sheet
    rawSheet.hideSheet();

    // Headers
    const headers = ['Timestamp', 'Language', ...questions.map(q => q.qEn)];
    cleanSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

    // Formulas
    // We assume:
    // Col A = Timestamp
    // Col B = Language Selection (usually)
    // Subsequent columns are questions.
    // Since we have 3 languages, each question has 3 columns in the raw sheet.
    // We need to find them.
    
    // const rawHeaders = rawSheet.getRange(1, 1, 1, rawSheet.getLastColumn()).getValues()[0].map(h => h.toString());
    
    // Row 2 formulas
    // Timestamp: =ARRAYFORMULA('Raw Tab'!A2:A)
    cleanSheet.getRange(2, 1).setFormula(`=ARRAYFORMULA('${destinationTabName}'!A2:A)`);
    
    // Language: Find the column with "Select Language"
    // Retry logic for headers to ensure all columns are present
    let rawHeaders: string[] = [];
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        rawHeaders = rawSheet.getRange(1, 1, 1, rawSheet.getLastColumn()).getValues()[0].map(h => h.toString());
        
        // Check if we have columns for all questions
        const allFound = questions.every(q => {
             const en = this.findColumnIndex(rawHeaders, q.qEn);
             const fr = this.findColumnIndex(rawHeaders, q.qFr);
             const nl = this.findColumnIndex(rawHeaders, q.qNl);
             return en >= 0 && fr >= 0 && nl >= 0;
        });
        
        if (allFound) break;
        
        if (attempt < maxRetries - 1) {
            Utilities.sleep(2000);
            SpreadsheetApp.flush();
        }
    }

    const langColIndex = rawHeaders.findIndex(h => h.includes('Select Language'));
    if (langColIndex >= 0) {
       const colLetter = this.getColLetter(langColIndex + 1);
       cleanSheet.getRange(2, 2).setFormula(`=ARRAYFORMULA('${destinationTabName}'!${colLetter}2:${colLetter})`);
    }

    // Questions
    questions.forEach((q, index) => {
      // Find the 3 columns for this question
      // They are named q.qEn, q.qFr, q.qNl
      // Note: Google Sheets might append numbers if titles are duplicate, e.g. "Temperature", "Temperature [1]"
      // We should try to find exact match first, then fuzzy?
      // Actually, since we know the order of creation (EN, FR, NL), we might be able to guess?
      // But user might reorder.
      // Let's stick to title matching but be careful.
      
      const colEnIndex = this.findColumnIndex(rawHeaders, q.qEn);
      const colFrIndex = this.findColumnIndex(rawHeaders, q.qFr);
      const colNlIndex = this.findColumnIndex(rawHeaders, q.qNl);

      const cols = [colEnIndex, colFrIndex, colNlIndex].filter(i => i >= 0).map(i => this.getColLetter(i + 1));
      
      if (cols.length > 0) {
        // Coalesce: =ARRAYFORMULA(IF(LEN(ColEN), ColEN, IF(LEN(ColFR), ColFR, ColNL)))
        // This preserves data types (e.g. Dates remain numbers) unlike & which forces string.
        const ranges = cols.map(c => `'${destinationTabName}'!${c}2:${c}`);
        
        let formulaInner = ranges[ranges.length - 1];
        for (let i = ranges.length - 2; i >= 0; i--) {
            formulaInner = `IF(LEN(${ranges[i]}), ${ranges[i]}, ${formulaInner})`;
        }
        
        const formula = `=ARRAYFORMULA(${formulaInner})`;
        const targetRange = cleanSheet.getRange(2, index + 3);
        targetRange.setFormula(formula);
        
        if (q.type === 'DATE') {
            // Apply date formatting to the entire column (row 2 onwards)
            // We can't easily select "to bottom" without knowing last row, but we can set it for a large range or just the range we have.
            // Actually, getRange(row, col, numRows) - if we want whole column, we might need to be careful.
            // But setFormula is on a single cell (which expands). The formatting needs to be on the cells.
            // Let's set it for the column.
            cleanSheet.getRange(2, index + 3, cleanSheet.getMaxRows() - 1).setNumberFormat('dd/MM/yyyy');
        }
      } else {
         cleanSheet.getRange(2, index + 3).setValue('Column Not Found');
      }
    });
    
    // Translate CHOICE and CHECKBOX responses to English
    this.translateResponses(cleanSheet, destinationTabName, questions);
  }

  private getColLetter(colIndex: number): string {
    let temp, letter = '';
    while (colIndex > 0) {
      temp = (colIndex - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
  }

  private findColumnIndex(headers: string[], title: string): number {
    return headers.findIndex(h => h.trim().toLowerCase() === title.trim().toLowerCase() || h.toLowerCase().startsWith(title.trim().toLowerCase() + ' ['));
  }
  
  /**
   * Translates CHOICE and CHECKBOX responses from FR/NL to EN
   * Can be called independently to re-translate existing responses
   */
  public translateResponses(cleanSheet: GoogleAppsScript.Spreadsheet.Sheet, destinationTabName: string, questions: QuestionConfig[]): void {
    const lastRow = cleanSheet.getLastRow();
    if (lastRow < 2) return; // No data to translate
    
    Logger.log(`Translating responses in sheet: ${cleanSheet.getName()}, rows: ${lastRow}`);
    
    // CRITICAL: Convert formulas to values first, otherwise formulas will recalculate
    // and overwrite our translated values!
    const lastCol = cleanSheet.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      const allDataRange = cleanSheet.getRange(1, 1, lastRow, lastCol);
      const values = allDataRange.getValues();
      allDataRange.setValues(values); // This converts formulas to static values
      SpreadsheetApp.flush(); // Ensure the change is applied
      Logger.log('Converted formulas to values');
    }
    
    questions.forEach((q, index) => {
      if (q.type !== 'CHOICE' && q.type !== 'CHECKBOX') return;
      if (q.options.length === 0) return; // No options to translate
      
      const columnIndex = index + 3; // Column C = 3
      const range = cleanSheet.getRange(2, columnIndex, lastRow - 1, 1);
      const values = range.getValues();
      
      Logger.log(`Translating column ${columnIndex} for question: ${q.qEn}`);
      
      const translatedValues = values.map(row => {
        const value = row[0];
        if (!value) return row;
        
        if (q.type === 'CHECKBOX') {
          // Handle multi-select: split by comma, translate each, rejoin
          const items = value.toString().split(',').map((item: string) => item.trim());
          const translated = items.map((item: string) => this.translateValue(item, q.options, q.optionsFr, q.optionsNl));
          return [translated.join(', ')];
        } else {
          // Single value
          return [this.translateValue(value.toString(), q.options, q.optionsFr, q.optionsNl)];
        }
      });
      
      range.setValues(translatedValues);
    });
    
    Logger.log('Translation complete');
  }
  
  /**
   * Translates a single value from FR/NL to EN
   */
  private translateValue(value: string, optionsEn: string[], optionsFr: string[], optionsNl: string[]): string {
    // If already in English, return as-is
    if (optionsEn.includes(value)) return value;
    
    // Check if it's French
    const frIndex = optionsFr.indexOf(value);
    if (frIndex >= 0 && frIndex < optionsEn.length) {
      return optionsEn[frIndex];
    }
    
    // Check if it's Dutch
    const nlIndex = optionsNl.indexOf(value);
    if (nlIndex >= 0 && nlIndex < optionsEn.length) {
      return optionsEn[nlIndex];
    }
    
    // If not found in any language, return original value
    return value;
  }
}
