import { FileUploadConfig, LineItemFieldConfig, LineItemGroupConfig, QuestionConfig, QuestionType, BaseQuestionType } from '../types';

export class ConfigSheet {
  public static setupExample(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, exampleRows: any[]): void {
    if (ss.getSheetByName(name)) return;
    
    const sheet = ss.insertSheet(name);
    const headers = [
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status (Active/Archived)', 'Edit Options', 'Config (JSON/REF)']
    ];
    
    sheet.getRange(1, 1, 1, 12).setValues(headers).setFontWeight('bold').setBackground('#f3f3f3');
    
    // Add IDs to example rows if missing
    const rowsWithIds = exampleRows.map(row => {
      const id = 'Q' + Math.random().toString(36).substr(2, 9).toUpperCase();
      // Ensure row has 12 columns (add empty for Edit Options + Config)
      const newRow = [id, ...row];
      while (newRow.length < 12) newRow.push('');
      return newRow;
    });

    sheet.getRange(2, 1, rowsWithIds.length, 12).setValues(rowsWithIds);
    
    sheet.setColumnWidth(1, 100); // ID
    sheet.setColumnWidth(2, 100); // Type
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(8, 100);
    sheet.setColumnWidth(11, 100); // Edit Options
    sheet.setColumnWidth(12, 200); // Config JSON/REF
    
    // Data validation for Type column
    const typeRange = sheet.getRange(2, 2, 100, 1);
    const typeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['DATE', 'TEXT', 'PARAGRAPH', 'NUMBER', 'CHOICE', 'CHECKBOX', 'FILE_UPLOAD', 'LINE_ITEM_GROUP'])
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

    // Dropdown for Edit Options
    const editRange = sheet.getRange(2, 11, 100, 1);
    const editRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Edit'])
      .setAllowInvalid(true) // Allow invalid so we can replace with formula
      .build();
    editRange.setDataValidation(editRule);

    // Hide Options columns (EN, FR, NL) to declutter
    sheet.hideColumns(7, 3);
  }

  public static getQuestions(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): QuestionConfig[] {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
    
    this.ensureIds(sheet); // Ensure all rows have IDs before reading

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return []; // No questions
    const lastColumn = Math.max(12, sheet.getLastColumn());
    const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const data = range.getValues();
    
    return data.map(row => {
      const type = row[1] ? row[1].toString().toUpperCase() as QuestionType : 'TEXT';
      const { options, optionsFr, optionsNl } = this.parseOptions(ss, row[6], row[7], row[8]);
      const rawConfig = row[11] ? row[11].toString().trim() : '';
      const lineItemConfig = type === 'LINE_ITEM_GROUP' ? this.parseLineItemConfig(ss, rawConfig || row[6]) : undefined;
      const uploadConfig = type === 'FILE_UPLOAD' ? this.parseUploadConfig(rawConfig || row[6]) : undefined;

      return {
        id: row[0] ? row[0].toString() : '',
        type,
        qEn: row[2],
        qFr: row[3],
        qNl: row[4],
        required: !!row[5],
        options,
        optionsFr,
        optionsNl,
        status: row[9] ? row[9].toString() as 'Active' | 'Archived' : 'Active',
        uploadConfig,
        lineItemConfig
      };
    });
  }

  public static handleOptionEdit(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, e: GoogleAppsScript.Events.SheetsOnEdit): void {
    const range = e.range;
    const sheet = range.getSheet();
    
    // Check if we are in a Config sheet (name starts with "Config")
    if (!sheet.getName().startsWith('Config')) return;
    
    // Check if we are in the "Edit Options" column (Column 11 / K)
    if (range.getColumn() !== 11) return;
    
    // Check if the value is "Edit" (user selected from dropdown)
    if (e.value !== 'Edit') return;
    
    const row = range.getRow();
    if (row < 2) return; // Header row
    
    const id = sheet.getRange(row, 1).getValue();
    if (!id) return;

    // Check type (Column 2)
    const val = sheet.getRange(row, 2).getValue();
    const type = (val ? val.toString() : '').toUpperCase();
    if (type !== 'CHOICE' && type !== 'CHECKBOX') {
      SpreadsheetApp.getActiveSpreadsheet().toast('Option tabs are only available for CHOICE and CHECKBOX types.', 'Invalid Type');
      range.setValue(''); // Reset cell
      return;
    }
    
    const optionsSheetName = `Options_${id}`;
    let optionsSheet = ss.getSheetByName(optionsSheetName);
    let sheetId = '';
    
    if (!optionsSheet) {
      optionsSheet = ss.insertSheet(optionsSheetName);
      optionsSheet.getRange(1, 1, 1, 3).setValues([['Options (EN)', 'Options (FR)', 'Options (NL)']]).setFontWeight('bold');
      sheetId = optionsSheet.getSheetId().toString();
    } else {
      sheetId = optionsSheet.getSheetId().toString();
    }
    
    // Update the Config sheet to point to this new sheet
    // Set Options (EN) to REF:..., clear FR and NL
    sheet.getRange(row, 7).setValue(`REF:${optionsSheetName}`);
    sheet.getRange(row, 8).clearContent();
    sheet.getRange(row, 9).clearContent();
    
    // Replace "Edit" with a Hyperlink to the sheet
    const ssId = ss.getId();
    const url = `https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${sheetId}`;
    const formula = `=HYPERLINK("${url}", "🔗 Edit Options")`;
    range.setFormula(formula);
    
    // Activate the options sheet
    optionsSheet.activate();
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

  private static parseOptions(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, rawEn: any, rawFr: any, rawNl: any): { options: string[]; optionsFr: string[]; optionsNl: string[] } {
    const rawOptionsEn = rawEn ? rawEn.toString().trim() : '';
    if (rawOptionsEn.startsWith('REF:')) {
      const refSheetName = rawOptionsEn.substring(4).trim();
      const refSheet = ss.getSheetByName(refSheetName);
      if (refSheet) {
        const lastRefRow = refSheet.getLastRow();
        if (lastRefRow > 1) {
          const refData = refSheet.getRange(2, 1, lastRefRow - 1, 3).getValues();
          return {
            options: refData.map(r => r[0].toString()).filter(s => s),
            optionsFr: refData.map(r => r[1].toString()).filter(s => s),
            optionsNl: refData.map(r => r[2].toString()).filter(s => s)
          };
        }
      }
    }

    return {
      options: rawOptionsEn ? rawOptionsEn.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      optionsFr: rawFr ? rawFr.toString().split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      optionsNl: rawNl ? rawNl.toString().split(',').map((s: string) => s.trim()).filter(Boolean) : []
    };
  }

  private static parseUploadConfig(rawConfig: string): FileUploadConfig | undefined {
    if (!rawConfig) return undefined;
    const config: FileUploadConfig = {};

    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        if (parsed.destinationFolderId) config.destinationFolderId = parsed.destinationFolderId;
        if (parsed.maxFiles) config.maxFiles = Number(parsed.maxFiles);
        if (parsed.maxFileSizeMb) config.maxFileSizeMb = Number(parsed.maxFileSizeMb);
        if (parsed.allowedExtensions) config.allowedExtensions = parsed.allowedExtensions;
      }
    } catch (_) {
      // Fallback to key=value;key=value syntax
      const parts = rawConfig.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
      parts.forEach(part => {
        const [key, value] = part.split('=').map(p => p.trim());
        if (!key || !value) return;
        switch (key.toLowerCase()) {
          case 'folder':
          case 'destination':
          case 'folderid':
            config.destinationFolderId = value;
            break;
          case 'maxfiles':
            config.maxFiles = Number(value);
            break;
          case 'maxsizemb':
          case 'maxsize':
            config.maxFileSizeMb = Number(value);
            break;
          case 'extensions':
          case 'allowedextensions':
            config.allowedExtensions = value.split('|').map(v => v.trim()).filter(Boolean);
            break;
        }
      });
    }

    return Object.keys(config).length ? config : undefined;
  }

  private static parseLineItemConfig(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawConfig: string
  ): LineItemGroupConfig | undefined {
    if (!rawConfig) return { fields: [] };

    if (rawConfig.startsWith('REF:')) {
      const refSheetName = rawConfig.substring(4).trim();
      return this.parseLineItemSheet(ss, refSheetName);
    }

    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        const fields: LineItemFieldConfig[] = Array.isArray(parsed.fields)
          ? parsed.fields.map((f: any, idx: number) => this.normalizeLineItemField(f, idx))
          : [];
        return {
          minRows: parsed.minRows ? Number(parsed.minRows) : undefined,
          maxRows: parsed.maxRows ? Number(parsed.maxRows) : undefined,
          addButtonLabel: parsed.addButtonLabel,
          fields
        };
      }
    } catch (_) {
      // Ignore JSON errors; fall back to empty
    }

    // If nothing parsed, return empty definition so downstream code can still render a table
    return { fields: [] };
  }

  private static parseLineItemSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): LineItemGroupConfig | undefined {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { fields: [] };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { fields: [] };

    const lastColumn = Math.max(9, sheet.getLastColumn());
    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    const fields: LineItemFieldConfig[] = rows.map((row, idx) => {
      const { options, optionsFr, optionsNl } = this.parseOptions(ss, row[6], row[7], row[8]);
      return {
        id: row[0] ? row[0].toString() : `LI${idx + 1}`,
        type: (row[1] ? row[1].toString().toUpperCase() : 'TEXT') as BaseQuestionType,
        labelEn: row[2] || '',
        labelFr: row[3] || '',
        labelNl: row[4] || '',
        required: !!row[5],
        options,
        optionsFr,
        optionsNl
      };
    }).filter(f => f.labelEn || f.labelFr || f.labelNl);

    return { fields };
  }

  private static normalizeLineItemField(field: any, idx: number): LineItemFieldConfig {
    const baseType = (field?.type ? field.type.toString().toUpperCase() : 'TEXT') as BaseQuestionType;
    return {
      id: field?.id || `LI${idx + 1}`,
      type: baseType,
      labelEn: field?.labelEn || '',
      labelFr: field?.labelFr || '',
      labelNl: field?.labelNl || '',
      required: !!field?.required,
      options: Array.isArray(field?.options) ? field.options : [],
      optionsFr: Array.isArray(field?.optionsFr) ? field.optionsFr : [],
      optionsNl: Array.isArray(field?.optionsNl) ? field.optionsNl : []
    };
  }
}
