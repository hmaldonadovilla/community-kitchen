import {
  BaseQuestionType,
  FileUploadConfig,
  LineItemFieldConfig,
  LineItemGroupConfig,
  LineItemSelectorConfig,
  LineItemTotalConfig,
  OptionFilter,
  QuestionConfig,
  QuestionType,
  ValidationRule,
  VisibilityCondition,
  VisibilityConfig
} from '../types';

export class ConfigSheet {
  public static setupExample(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, exampleRows: any[]): void {
    if (ss.getSheetByName(name)) return;
    
    const sheet = ss.insertSheet(name);
    const headers = [
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status (Active/Archived)', 'Config (JSON/REF)', 'Option Filter (JSON)', 'Validation Rules (JSON)', 'Edit Options']
    ];
    
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight('bold').setBackground('#f3f3f3');
    
    // Add IDs to example rows if missing
    const rowsWithIds = exampleRows.map(row => {
      const id = 'Q' + Math.random().toString(36).substr(2, 9).toUpperCase();
      // Ensure row has the same columns as headers
      const newRow = [id, ...row];
      while (newRow.length < headers[0].length) newRow.push('');
      return newRow;
    });

    sheet.getRange(2, 1, rowsWithIds.length, headers[0].length).setValues(rowsWithIds);
    
    sheet.setColumnWidth(1, 100); // ID
    sheet.setColumnWidth(2, 100); // Type
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(8, 100);
    sheet.setColumnWidth(10, 120); // Status
    sheet.setColumnWidth(11, 220); // Config JSON/REF
    sheet.setColumnWidth(12, 200); // Option Filter
    sheet.setColumnWidth(13, 220); // Validation Rules
    sheet.setColumnWidth(14, 110); // Edit Options
    
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
    const editRange = sheet.getRange(2, 14, 100, 1);
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
    const lastColumn = Math.max(14, sheet.getLastColumn());
    const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const data = range.getValues();
    
    return data.map(row => {
      const type = row[1] ? row[1].toString().toUpperCase() as QuestionType : 'TEXT';
      const { options, optionsFr, optionsNl } = this.parseOptions(ss, row[6], row[7], row[8]);
      const rawConfig = row[10] ? row[10].toString().trim() : '';
      const optionFilterRaw = row[11] ? row[11].toString().trim() : rawConfig;
      const validationRaw = row[12] ? row[12].toString().trim() : rawConfig;
      const lineItemConfig = type === 'LINE_ITEM_GROUP' ? this.parseLineItemConfig(ss, rawConfig || row[6], row[6]) : undefined;
      const uploadConfig = type === 'FILE_UPLOAD' ? this.parseUploadConfig(rawConfig || row[6]) : undefined;
      const optionFilter = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseOptionFilter(optionFilterRaw) : undefined;
      const validationRules = this.parseValidationRules(validationRaw);
      const visibility = this.parseVisibilityFromAny([rawConfig, optionFilterRaw, validationRaw]);
      const clearOnChange = this.parseClearOnChange([rawConfig, optionFilterRaw, validationRaw]);
      const statusRaw = row[9] ? row[9].toString().trim().toLowerCase() : 'active';
      const status = statusRaw === 'archived' ? 'Archived' : 'Active';

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
        status,
        uploadConfig,
        lineItemConfig,
        optionFilter,
        validationRules,
        visibility,
        clearOnChange
      };
    });
  }

  public static handleOptionEdit(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, e: GoogleAppsScript.Events.SheetsOnEdit): void {
    const range = e.range;
    const sheet = range.getSheet();
    
    // Check if we are in a Config sheet (name starts with "Config")
    if (!sheet.getName().startsWith('Config')) return;
    
    // Check if we are in the "Edit Options" column (Column 14 / N)
    if (range.getColumn() !== 14) return;
    
    // Check if the value is "Edit" (user selected from dropdown)
    if (e.value !== 'Edit') return;
    
    const row = range.getRow();
    if (row < 2) return; // Header row
    
    const id = sheet.getRange(row, 1).getValue();
    if (!id) return;

    // Check type (Column 2)
    const val = sheet.getRange(row, 2).getValue();
    const type = (val ? val.toString() : '').toUpperCase();
    if (type !== 'CHOICE' && type !== 'CHECKBOX' && type !== 'LINE_ITEM_GROUP') {
      SpreadsheetApp.getActiveSpreadsheet().toast('Option tabs are only available for CHOICE, CHECKBOX and LINE_ITEM_GROUP types.', 'Invalid Type');
      range.setValue(''); // Reset cell
      return;
    }

    const optionsRef = sheet.getRange(row, 7).getValue(); // Options (EN)
    let optionsSheetName = '';

    if (optionsRef && optionsRef.toString().startsWith('REF:')) {
      optionsSheetName = optionsRef.toString().substring(4).trim();
    } else {
      optionsSheetName = `Options_${id}`;
      sheet.getRange(row, 7).setValue(`REF:${optionsSheetName}`);
      sheet.getRange(row, 8).clearContent();
      sheet.getRange(row, 9).clearContent();
    }

    let optionsSheet = ss.getSheetByName(optionsSheetName);
    let sheetId = '';

    if (!optionsSheet) {
      optionsSheet = ss.insertSheet(optionsSheetName);
      optionsSheet.getRange(1, 1, 1, 3).setValues([['Options (EN)', 'Options (FR)', 'Options (NL)']]).setFontWeight('bold');
      sheetId = optionsSheet.getSheetId().toString();
    } else {
      sheetId = optionsSheet.getSheetId().toString();
    }

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

  private static parseOptionFilter(rawConfig: string): OptionFilter | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && parsed.optionFilter && parsed.optionFilter.dependsOn && parsed.optionFilter.optionMap) {
        return parsed.optionFilter as OptionFilter;
      }
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static parseValidationRules(rawConfig: string): ValidationRule[] | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && Array.isArray(parsed.validationRules)) {
        return parsed.validationRules as ValidationRule[];
      }
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static safeParseObject(rawConfig: string): any | undefined {
    if (!rawConfig || rawConfig.startsWith('REF:')) return undefined;
    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static normalizeVisibilityCondition(raw: any): VisibilityCondition | undefined {
    if (!raw || !raw.fieldId) return undefined;
    const condition: VisibilityCondition = { fieldId: raw.fieldId };
    if (raw.equals !== undefined) condition.equals = raw.equals;
    if (raw.greaterThan !== undefined) condition.greaterThan = raw.greaterThan;
    if (raw.lessThan !== undefined) condition.lessThan = raw.lessThan;
    return condition;
  }

  private static normalizeVisibility(raw: any): VisibilityConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const showWhen = this.normalizeVisibilityCondition(raw.showWhen || raw.show || raw.visibleWhen);
    const hideWhen = this.normalizeVisibilityCondition(raw.hideWhen || raw.hide || raw.hiddenWhen);
    if (showWhen || hideWhen) return { showWhen, hideWhen };
    return undefined;
  }

  private static parseVisibility(rawConfig: string): VisibilityConfig | undefined {
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed) return undefined;
    if (parsed.visibility) {
      const vis = this.normalizeVisibility(parsed.visibility);
      if (vis) return vis;
    }
    if (parsed.showWhen || parsed.hideWhen) {
      const vis = this.normalizeVisibility(parsed);
      if (vis) return vis;
    }
    return undefined;
  }

  private static parseVisibilityFromAny(rawConfigs: Array<string | undefined>): VisibilityConfig | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const vis = this.parseVisibility(raw);
      if (vis) return vis;
    }
    return undefined;
  }

  private static parseClearOnChange(rawConfigs: Array<string | undefined>): boolean | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (parsed && parsed.clearOnChange !== undefined) {
        return !!parsed.clearOnChange;
      }
    }
    return undefined;
  }

  private static parseLineItemConfig(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawConfig: string,
    optionsRef?: string
  ): LineItemGroupConfig | undefined {
    if (!rawConfig) return { fields: [] };

    // Helper to load fields from a REF sheet (either from config or options column)
    const loadRefFields = (ref: string | undefined): LineItemFieldConfig[] => {
      if (!ref || !ref.startsWith('REF:')) return [];
      const refSheetName = ref.substring(4).trim();
      const refConfig = this.parseLineItemSheet(ss, refSheetName);
      return refConfig?.fields || [];
    };

    if (rawConfig.startsWith('REF:')) {
      const refSheetName = rawConfig.substring(4).trim();
      return this.parseLineItemSheet(ss, refSheetName);
    }

    // If JSON is provided, parse metadata and merge with fields from JSON or referenced sheet in Options (EN)
    let parsed: any;

    try {
      parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        const jsonFields: LineItemFieldConfig[] = Array.isArray(parsed.fields)
          ? parsed.fields.map((f: any, idx: number) => this.normalizeLineItemField(f, idx))
          : [];
        const refFields = jsonFields.length === 0 ? loadRefFields(optionsRef) : [];
        const mergedFields = jsonFields.length ? jsonFields : refFields;
        const sectionSelector = this.normalizeLineItemSelector(ss, parsed.sectionSelector);
        const totals = this.normalizeLineItemTotals(parsed.totals);

        return {
          minRows: parsed.minRows ? Number(parsed.minRows) : undefined,
          maxRows: parsed.maxRows ? Number(parsed.maxRows) : undefined,
          addButtonLabel: parsed.addButtonLabel,
          anchorFieldId: parsed.anchorFieldId,
          addMode: parsed.addMode,
          sectionSelector,
          totals,
          fields: mergedFields
        };
      }
    } catch (_) {
      // Ignore JSON errors; fall back to empty
    }

    // If nothing parsed, return empty definition so downstream code can still render a table
    return { fields: [] };
  }

  private static normalizeLineItemSelector(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawSelector: any
  ): LineItemSelectorConfig | undefined {
    if (!rawSelector || typeof rawSelector !== 'object') return undefined;
    const id = rawSelector.id || rawSelector.fieldId;
    if (!id) return undefined;
    let options: string[] = [];
    let optionsFr: string[] = [];
    let optionsNl: string[] = [];

    if (rawSelector.optionsRef) {
      const parsed = this.parseOptions(ss, rawSelector.optionsRef, rawSelector.optionsRefFr, rawSelector.optionsRefNl);
      options = parsed.options;
      optionsFr = parsed.optionsFr;
      optionsNl = parsed.optionsNl;
    } else {
      options = Array.isArray(rawSelector.options) ? rawSelector.options : [];
      optionsFr = Array.isArray(rawSelector.optionsFr) ? rawSelector.optionsFr : [];
      optionsNl = Array.isArray(rawSelector.optionsNl) ? rawSelector.optionsNl : [];
    }

    return {
      id: id.toString(),
      labelEn: rawSelector.labelEn || '',
      labelFr: rawSelector.labelFr || '',
      labelNl: rawSelector.labelNl || '',
      required: !!rawSelector.required,
      options,
      optionsFr,
      optionsNl,
      optionsRef: rawSelector.optionsRef
    };
  }

  private static normalizeLineItemTotals(rawTotals: any): LineItemTotalConfig[] | undefined {
    if (!Array.isArray(rawTotals)) return undefined;
    const totals: LineItemTotalConfig[] = rawTotals.map((entry: any) => {
      const typeVal = (entry?.type || (entry?.fieldId ? 'sum' : 'count')) as LineItemTotalConfig['type'];
      const type: LineItemTotalConfig['type'] = typeVal === 'sum' ? 'sum' : 'count';
      const cfg: LineItemTotalConfig = { type };
      if (entry?.fieldId) cfg.fieldId = entry.fieldId;
      if (entry?.label !== undefined) cfg.label = entry.label;
      if (entry?.decimalPlaces !== undefined && entry.decimalPlaces !== null) {
        const num = Number(entry.decimalPlaces);
        if (!isNaN(num)) cfg.decimalPlaces = num;
      }
      return cfg;
    }).filter(cfg => cfg.type === 'count' || !!cfg.fieldId);
    return totals.length ? totals : undefined;
  }

  private static parseLineItemSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): LineItemGroupConfig | undefined {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { fields: [] };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { fields: [] };

    const lastColumn = Math.max(10, sheet.getLastColumn());
      const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      const fields: LineItemFieldConfig[] = rows.map((row, idx) => {
        const { options, optionsFr, optionsNl } = this.parseOptions(ss, row[6], row[7], row[8]);
        const rawConfig = row[9] ? row[9].toString().trim() : '';
        const optionFilter = this.parseOptionFilter(rawConfig);
        const validationRules = this.parseValidationRules(rawConfig);
        const visibility = this.parseVisibility(rawConfig);
      return {
        id: row[0] ? row[0].toString() : `LI${idx + 1}`,
        type: (row[1] ? row[1].toString().toUpperCase() : 'TEXT') as BaseQuestionType,
        labelEn: row[2] || '',
        labelFr: row[3] || '',
        labelNl: row[4] || '',
        required: !!row[5],
        options,
        optionsFr,
        optionsNl,
        optionFilter,
        validationRules,
        visibility
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
      optionsNl: Array.isArray(field?.optionsNl) ? field.optionsNl : [],
      optionFilter: field?.optionFilter,
      validationRules: Array.isArray(field?.validationRules) ? field.validationRules : undefined,
      visibility: this.normalizeVisibility(field?.visibility)
    };
  }
}
