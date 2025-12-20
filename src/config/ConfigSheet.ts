import {
  AutoIncrementConfig,
  BaseQuestionType,
  ChoiceControl,
  DataSourceConfig,
  DerivedValueConfig,
  FileUploadConfig,
  LineItemFieldType,
  LineItemFieldConfig,
  LineItemCollapsedFieldConfig,
  LineItemGroupConfig,
  LineItemGroupUiConfig,
  LineItemSelectorConfig,
  LineItemTotalConfig,
  ListViewSortConfig,
  OptionFilter,
  QuestionGroupConfig,
  QuestionUiConfig,
  QuestionConfig,
  QuestionType,
  SelectionEffect,
  ValidationRule,
  VisibilityCondition,
  VisibilityConfig
} from '../types';

export class ConfigSheet {
  public static setupExample(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, exampleRows: any[]): void {
    if (ss.getSheetByName(name)) return;
    
    const sheet = ss.insertSheet(name);
    const headers = [
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status (Active/Archived)', 'Config (JSON/REF)', 'Option Filter (JSON)', 'Validation Rules (JSON)', 'List View?', 'Edit Options']
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

    // List View? column (TRUE/FALSE)
    const listViewRange = sheet.getRange(2, 14, 100, 1);
    const listViewRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'])
      .setAllowInvalid(true)
      .build();
    listViewRange.setDataValidation(listViewRule);

    // Dropdown for Edit Options (shifted to column 15)
    const editRange = sheet.getRange(2, 15, 100, 1);
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
    const lastColumn = Math.max(15, sheet.getLastColumn());
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => (h || '').toString().trim().toLowerCase());
    const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const data = range.getValues();

    const findHeader = (labels: string[], fallbackIdx: number): number => {
      const normalized = labels.map(l => l.toLowerCase());
      const found = headers.findIndex(h => normalized.some(n => h === n || h.startsWith(n)));
      return found >= 0 ? found : fallbackIdx;
    };

    const idxType = findHeader(['type'], 1);
    const idxQEn = findHeader(['question (en)', 'question en'], 2);
    const idxQFr = findHeader(['question (fr)'], 3);
    const idxQNl = findHeader(['question (nl)'], 4);
    const idxRequired = findHeader(['required'], 5);
    const idxOptionsEn = findHeader(['options (en)'], 6);
    const idxOptionsFr = findHeader(['options (fr)'], 7);
    const idxOptionsNl = findHeader(['options (nl)'], 8);
    const idxStatus = findHeader(['status'], 9);
    const idxConfig = findHeader(['config', 'config (json/ref)'], 10);
    const idxOptionFilter = findHeader(['option filter'], 11);
    const idxValidation = findHeader(['validation rules'], 12);
    const idxListView = findHeader(['list view', 'list view?'], 14);

    return data.map(row => {
      const type = row[idxType] ? row[idxType].toString().toUpperCase() as QuestionType : 'TEXT';
      const { options, optionsFr, optionsNl } = this.parseOptions(ss, row[idxOptionsEn], row[idxOptionsFr], row[idxOptionsNl]);
      const rawConfig = row[idxConfig] ? row[idxConfig].toString().trim() : '';
      const optionFilterRaw = row[idxOptionFilter] ? row[idxOptionFilter].toString().trim() : rawConfig;
      const validationRaw = row[idxValidation] ? row[idxValidation].toString().trim() : rawConfig;
      const lineItemConfig = type === 'LINE_ITEM_GROUP' ? this.parseLineItemConfig(ss, rawConfig || row[idxOptionsEn], row[idxOptionsEn]) : undefined;
      const uploadConfig = type === 'FILE_UPLOAD' ? this.parseUploadConfig(rawConfig || row[6]) : undefined;
      const optionFilter = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseOptionFilter(optionFilterRaw) : undefined;
      const dataSource = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseDataSource(rawConfig) : undefined;
      const validationRules = this.parseValidationRules(validationRaw);
      const valueMap = type === 'TEXT' ? this.parseValueMap(rawConfig) : undefined;
      const visibility = this.parseVisibilityFromAny([rawConfig, optionFilterRaw, validationRaw]);
      const clearOnChange = this.parseClearOnChange([rawConfig, optionFilterRaw, validationRaw]);
      const header = this.parseHeaderFlag([rawConfig, optionFilterRaw, validationRaw]);
      const group = this.parseQuestionGroup([rawConfig, optionFilterRaw, validationRaw]);
      const pair = this.parsePairKey([rawConfig, optionFilterRaw, validationRaw]);
      const ui = this.parseQuestionUi([rawConfig, optionFilterRaw, validationRaw]);
      const selectionEffects = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseSelectionEffects(rawConfig) : undefined;
      const statusRaw = row[idxStatus] ? row[idxStatus].toString().trim().toLowerCase() : 'active';
      const status = statusRaw === 'archived' ? 'Archived' : 'Active';
      const listViewFlag = row[idxListView] !== '' && row[idxListView] !== null ? !!row[idxListView] : false;
      const listViewSort = listViewFlag ? this.parseListViewSort(rawConfig) : undefined;
      const autoIncrement = type === 'TEXT' ? this.parseAutoIncrement(rawConfig) : undefined;
      const derivedValue = this.parseDerivedValue(rawConfig);

      return {
        id: row[0] ? row[0].toString() : '',
        type,
        qEn: row[idxQEn],
        qFr: row[idxQFr],
        qNl: row[idxQNl],
        required: !!row[idxRequired],
        ui,
        header,
        group:
          group ||
          (header
            ? {
                header: true,
                title: { en: 'Header', fr: 'Header', nl: 'Header' },
                collapsible: true
              }
            : undefined),
        pair,
        listView: listViewFlag,
        options,
        optionsFr,
        optionsNl,
        status,
        uploadConfig,
        lineItemConfig,
        dataSource,
        optionFilter,
        validationRules,
        visibility,
        clearOnChange,
        selectionEffects,
        listViewSort,
        autoIncrement,
        valueMap,
        derivedValue
      };
    });
  }

  /**
   * Lightweight question loader used by listing/record fetch endpoints.
   *
   * This intentionally avoids parsing options REF tabs and heavy JSON configs
   * (line items, uploads, selection effects, validations, etc.) to keep
   * Apps Script calls fast when we only need column mapping.
   */
  public static getQuestionsLite(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): QuestionConfig[] {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

    // Ensure IDs exist (but do not parse any other config).
    this.ensureIds(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const lastColumn = Math.max(15, sheet.getLastColumn());
    const headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map(h => (h || '').toString().trim().toLowerCase());
    const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const data = range.getValues();

    const findHeader = (labels: string[], fallbackIdx: number): number => {
      const normalized = labels.map(l => l.toLowerCase());
      const found = headers.findIndex(h => normalized.some(n => h === n || h.startsWith(n)));
      return found >= 0 ? found : fallbackIdx;
    };

    const idxType = findHeader(['type'], 1);
    const idxQEn = findHeader(['question (en)', 'question en'], 2);
    const idxQFr = findHeader(['question (fr)'], 3);
    const idxQNl = findHeader(['question (nl)'], 4);
    const idxRequired = findHeader(['required'], 5);
    const idxStatus = findHeader(['status'], 9);
    const idxListView = findHeader(['list view', 'list view?'], 14);

    return data.map(row => {
      const type = row[idxType] ? (row[idxType].toString().toUpperCase() as QuestionType) : ('TEXT' as QuestionType);
      const statusRaw = row[idxStatus] ? row[idxStatus].toString().trim().toLowerCase() : 'active';
      const status = statusRaw === 'archived' ? 'Archived' : 'Active';
      const listViewFlag = row[idxListView] !== '' && row[idxListView] !== null ? !!row[idxListView] : false;

      return {
        id: row[0] ? row[0].toString() : '',
        type,
        qEn: row[idxQEn],
        qFr: row[idxQFr],
        qNl: row[idxQNl],
        required: !!row[idxRequired],
          header: undefined,
        listView: listViewFlag,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status,
        uploadConfig: undefined,
        lineItemConfig: undefined,
        dataSource: undefined,
        optionFilter: undefined,
        validationRules: [],
        visibility: undefined,
        clearOnChange: false,
        selectionEffects: undefined,
        listViewSort: undefined,
        autoIncrement: undefined,
        valueMap: undefined,
        derivedValue: undefined
      };
    });
  }

  public static handleOptionEdit(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, e: GoogleAppsScript.Events.SheetsOnEdit): void {
    const range = e.range;
    const sheet = range.getSheet();
    
    // Check if we are in a Config sheet (name starts with "Config")
    if (!sheet.getName().startsWith('Config')) return;
    
    // Dynamically find the "Edit Options" column (header may shift if columns are added)
    let targetColumn = 14; // legacy fallback
    try {
      const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
      const headers = typeof headerRange.getValues === 'function' ? headerRange.getValues()[0] : [];
      const editColIdx = headers.findIndex(h => {
        const normalized = (h || '').toString().trim().toLowerCase();
        return normalized === 'edit options' || normalized.startsWith('edit options');
      });
      if (editColIdx >= 0) {
        targetColumn = editColIdx + 1; // convert to 1-based index
      }
    } catch (_) {
      // If header lookup fails (e.g., during tests/mocks), fall back to legacy column
      targetColumn = 14;
    }
    if (range.getColumn() !== targetColumn) return;
    
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

    if (type === 'LINE_ITEM_GROUP') {
      const refCell = sheet.getRange(row, 7); // Config (JSON/REF) commonly used for REF
      const refValue = refCell.getValue();
      let lineSheetName = '';
      if (refValue && refValue.toString().startsWith('REF:')) {
        lineSheetName = refValue.toString().substring(4).trim();
      } else {
        lineSheetName = `LineItems_${id}`;
        refCell.setValue(`REF:${lineSheetName}`);
      }
      let lineSheet = ss.getSheetByName(lineSheetName);
      if (!lineSheet) {
        lineSheet = this.createLineItemRefSheet(ss, lineSheetName);
      }
      const ssId = ss.getId();
      const sheetId = lineSheet.getSheetId().toString();
      const url = `https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${sheetId}`;
      const formula = `=HYPERLINK("${url}", "🔗 Edit Line Items")`;
      range.setFormula(formula);
      lineSheet.activate();
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

  private static createLineItemRefSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = ss.insertSheet(name);
  const headers = [
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Config (JSON/REF)', 'Option Filter (JSON)', 'Validation Rules (JSON)', 'List View?', 'Edit Options']
    ];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight('bold').setBackground('#f3f3f3');

    // Data validation for Type column
    const typeRange = sheet.getRange(2, 2, 200, 1);
    const typeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['DATE', 'TEXT', 'PARAGRAPH', 'NUMBER', 'CHOICE', 'CHECKBOX'])
      .setAllowInvalid(false)
      .build();
    typeRange.setDataValidation(typeRule);

    // Required column validation
    const requiredRange = sheet.getRange(2, 6, 200, 1);
    const requiredRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'])
      .setAllowInvalid(false)
      .build();
    requiredRange.setDataValidation(requiredRule);

    // List View? column (TRUE/FALSE)
    const listViewRange = sheet.getRange(2, 13, 200, 1);
    const listViewRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'])
      .setAllowInvalid(true)
      .build();
    listViewRange.setDataValidation(listViewRule);

    // Edit Options column validation (shifted)
    const editRange = sheet.getRange(2, 14, 200, 1);
    const editRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Edit'])
      .setAllowInvalid(true)
      .build();
    editRange.setDataValidation(editRule);

    // Hide options columns to declutter
    sheet.hideColumns(7, 3);
    return sheet;
  }

  private static parseUploadConfig(rawConfig: string): FileUploadConfig | undefined {
    if (!rawConfig) return undefined;
    const config: FileUploadConfig = {};

    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig));
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

  private static normalizeUploadConfig(raw: any): FileUploadConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const cfg: FileUploadConfig = {};
    if (raw.destinationFolderId !== undefined && raw.destinationFolderId !== null) {
      cfg.destinationFolderId = raw.destinationFolderId.toString();
    }
    if (raw.maxFiles !== undefined && raw.maxFiles !== null) {
      const n = Number(raw.maxFiles);
      if (!isNaN(n)) cfg.maxFiles = n;
    }
    if (raw.maxFileSizeMb !== undefined && raw.maxFileSizeMb !== null) {
      const n = Number(raw.maxFileSizeMb);
      if (!isNaN(n)) cfg.maxFileSizeMb = n;
    }
    if (Array.isArray(raw.allowedExtensions)) {
      cfg.allowedExtensions = raw.allowedExtensions
        .map((v: any) => (v !== undefined && v !== null ? v.toString() : ''))
        .filter(Boolean);
    }
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static parseOptionFilter(rawConfig: string): OptionFilter | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig));
      if (parsed && parsed.optionFilter && parsed.optionFilter.dependsOn && parsed.optionFilter.optionMap) {
        return parsed.optionFilter as OptionFilter;
      }
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static parseDataSource(rawConfig: string): DataSourceConfig | undefined {
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed) return undefined;
    const candidate = this.extractDataSourceCandidate(parsed);
    if (!candidate || typeof candidate !== 'object') return undefined;
    return this.buildDataSourceConfig(candidate);
  }

  private static buildDataSourceConfig(candidate: any): DataSourceConfig | undefined {
    const idValue = candidate.id || candidate.sourceId || candidate.sheet;
    if (!idValue) return undefined;

    const config: DataSourceConfig = { id: idValue.toString() };
    if (candidate.ref) config.ref = candidate.ref.toString();
    const mode = (candidate.mode || candidate.kind || '').toString();
    if (mode && (mode === 'options' || mode === 'prefill' || mode === 'list')) {
      config.mode = mode as DataSourceConfig['mode'];
    }
    if (candidate.sheetId) config.sheetId = candidate.sheetId.toString();
    if (candidate.tabName) config.tabName = candidate.tabName.toString();
    if (candidate.localeKey) config.localeKey = candidate.localeKey.toString();
    if (Array.isArray(candidate.projection)) {
      const projection = candidate.projection
        .map((p: any) => (p !== undefined && p !== null ? p.toString() : ''))
        .filter(Boolean);
      if (projection.length) config.projection = projection;
    }
    if (candidate.limit !== undefined && candidate.limit !== null && candidate.limit !== '') {
      const limitNum = Number(candidate.limit);
      if (!isNaN(limitNum)) config.limit = limitNum;
    }
    if (candidate.mapping && typeof candidate.mapping === 'object') {
      const mapping: Record<string, string> = {};
      Object.keys(candidate.mapping).forEach(key => {
        const val = candidate.mapping[key];
        if (val !== undefined && val !== null) {
          mapping[key.toString()] = val.toString();
        }
      });
      if (Object.keys(mapping).length) config.mapping = mapping;
    }
    if (candidate.tooltipField) {
      config.tooltipField = candidate.tooltipField.toString();
    }
    if (candidate.tooltipLabel !== undefined && candidate.tooltipLabel !== null) {
      const tl = candidate.tooltipLabel;
      if (typeof tl === 'string') {
        config.tooltipLabel = tl;
      } else if (typeof tl === 'object') {
        const localized: any = {};
        Object.entries(tl).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            localized[k] = v.toString();
          }
        });
        if (Object.keys(localized).length) {
          config.tooltipLabel = localized;
        }
      }
    }
    return config;
  }

  private static extractDataSourceCandidate(raw: any): any | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    if (raw.dataSource && typeof raw.dataSource === 'object') return raw.dataSource;
    if (raw.source && typeof raw.source === 'object') return raw.source;
    if (raw.dataSourceConfig && typeof raw.dataSourceConfig === 'object') return raw.dataSourceConfig;
    if (raw.id && (raw.mode || raw.projection || raw.limit || raw.tabName || raw.sheetId)) return raw;
    return undefined;
  }

  private static parseValidationRules(rawConfig: string): ValidationRule[] | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig));
      if (parsed && Array.isArray(parsed.validationRules)) {
        return parsed.validationRules as ValidationRule[];
      }
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static parseSelectionEffects(rawConfig: string): SelectionEffect[] | undefined {
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed) return undefined;
    return this.normalizeSelectionEffects(parsed.selectionEffects);
  }

  private static parseValueMap(rawConfig?: string): OptionFilter | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig || ''));
      const vm = parsed?.valueMap;
      if (vm && vm.dependsOn && vm.optionMap) {
        return vm as OptionFilter;
      }
    } catch (_) {
      // ignore parse errors
    }
    return undefined;
  }

  private static parseDerivedValue(rawConfig?: string): DerivedValueConfig | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig || ''));
      if (parsed?.derivedValue) {
        return this.normalizeDerivedValue(parsed.derivedValue);
      }
    } catch (_) {
      // ignore parse errors
    }
    return undefined;
  }

  private static normalizeSelectionEffects(rawEffects: any): SelectionEffect[] | undefined {
    if (!Array.isArray(rawEffects)) return undefined;
    const effects: SelectionEffect[] = [];
    rawEffects.forEach((effect: any) => {
      if (!effect || !effect.groupId) return;
      const type = (effect.type || 'addLineItems').toString();
      if (type !== 'addLineItems' && type !== 'addLineItemsFromDataSource') return;
      const normalized: SelectionEffect = {
        type: type as SelectionEffect['type'],
        groupId: effect.groupId.toString()
      };
      if (Array.isArray(effect.triggerValues)) {
        const triggers = effect.triggerValues
          .map((val: any) => (val !== undefined && val !== null ? val.toString() : ''))
          .filter(Boolean);
        if (triggers.length) normalized.triggerValues = triggers;
      }
      if (effect.preset && typeof effect.preset === 'object') {
        const preset: Record<string, string | number> = {};
        Object.keys(effect.preset).forEach(key => {
          const val = effect.preset[key];
          if (val === undefined || val === null) return;
          preset[key.toString()] = typeof val === 'number' ? val : val.toString();
        });
        if (Object.keys(preset).length) normalized.preset = preset;
      }
      if (type === 'addLineItemsFromDataSource') {
        const dsCandidate = this.extractDataSourceCandidate(effect) || this.extractDataSourceCandidate(effect.dataSource);
        if (dsCandidate) {
          const config = this.buildDataSourceConfig(dsCandidate);
          if (config) {
            normalized.dataSource = config;
          }
        } else if (effect.dataSourceId) {
          normalized.dataSource = { id: effect.dataSourceId.toString() };
        }
        if (effect.lookupField) {
          normalized.lookupField = effect.lookupField.toString();
        }
        if (effect.dataField) {
          normalized.dataField = effect.dataField.toString();
        }
        if (effect.clearGroupBeforeAdd !== undefined) {
          normalized.clearGroupBeforeAdd = Boolean(effect.clearGroupBeforeAdd);
        }
        if (effect.lineItemMapping && typeof effect.lineItemMapping === 'object') {
          const mapping: Record<string, string> = {};
          Object.keys(effect.lineItemMapping).forEach(key => {
            const value = effect.lineItemMapping[key];
            if (value !== undefined && value !== null) {
              mapping[key.toString()] = value.toString();
            }
          });
          if (Object.keys(mapping).length) {
            normalized.lineItemMapping = mapping;
          }
        }
        if (Array.isArray(effect.aggregateBy)) {
          const aggregateBy = effect.aggregateBy
            .map((fieldId: any) => (fieldId !== undefined && fieldId !== null ? fieldId.toString() : ''))
            .filter(Boolean);
          if (aggregateBy.length) normalized.aggregateBy = aggregateBy;
        }
        if (Array.isArray(effect.aggregateNumericFields)) {
          const numericFields = effect.aggregateNumericFields
            .map((fieldId: any) => (fieldId !== undefined && fieldId !== null ? fieldId.toString() : ''))
            .filter(Boolean);
          if (numericFields.length) normalized.aggregateNumericFields = numericFields;
        }
        if (effect.rowMultiplierFieldId) {
          normalized.rowMultiplierFieldId = effect.rowMultiplierFieldId.toString();
        }
        if (effect.dataSourceMultiplierField) {
          normalized.dataSourceMultiplierField = effect.dataSourceMultiplierField.toString();
        }
        if (Array.isArray(effect.scaleNumericFields)) {
          const scaleFields = effect.scaleNumericFields
            .map((fieldId: any) => (fieldId !== undefined && fieldId !== null ? fieldId.toString() : ''))
            .filter(Boolean);
          if (scaleFields.length) normalized.scaleNumericFields = scaleFields;
        }
      }
      effects.push(normalized);
    });
    return effects.length ? effects : undefined;
  }

  private static parseListViewSort(rawConfig: string): ListViewSortConfig | undefined {
    if (!rawConfig) return undefined;
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed) return undefined;
    const candidate =
      (parsed.listView && (parsed.listView.sort || parsed.listView.defaultSort)) ||
      parsed.listViewSort;
    if (!candidate) return undefined;
    const normalizeDirection = (value: any): 'asc' | 'desc' | undefined => {
      if (!value) return undefined;
      const dir = value.toString().toLowerCase();
      if (dir === 'desc') return 'desc';
      if (dir === 'asc') return 'asc';
      return undefined;
    };
    if (typeof candidate === 'string') {
      const direction = normalizeDirection(candidate);
      return direction ? { direction } : undefined;
    }
    if (typeof candidate !== 'object') return undefined;
    const direction = normalizeDirection(candidate.direction || candidate.order);
    const prioritySource = candidate.priority ?? candidate.rank ?? candidate.orderIndex;
    const priority =
      prioritySource !== undefined && prioritySource !== null && !Number.isNaN(Number(prioritySource))
        ? Number(prioritySource)
        : undefined;
    const result: ListViewSortConfig = {};
    if (direction) result.direction = direction;
    if (priority !== undefined) result.priority = priority;
    return Object.keys(result).length ? result : undefined;
  }

  private static parseAutoIncrement(rawConfig: string): AutoIncrementConfig | undefined {
    if (!rawConfig || rawConfig.startsWith('REF:')) return undefined;
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed || typeof parsed !== 'object') return undefined;
    const source = parsed.autoIncrement || parsed.autoIncrementConfig;
    if (!source || typeof source !== 'object') return undefined;
    const config: AutoIncrementConfig = {};
    if (source.prefix) config.prefix = source.prefix.toString();
    if (source.padLength !== undefined) {
      const pad = Number(source.padLength);
      if (Number.isFinite(pad) && pad > 0) config.padLength = pad;
    }
    if (source.propertyKey) config.propertyKey = source.propertyKey.toString();
    return Object.keys(config).length ? config : undefined;
  }

  private static safeParseObject(rawConfig: string): any | undefined {
    if (!rawConfig || rawConfig.startsWith('REF:')) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      // ignore
    }
    return undefined;
  }

  private static sanitizeJson(raw: string): string {
    if (!raw) return raw;
    let result = '';
    let inString = false;
    let escaping = false;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        result += char;
        if (escaping) {
          escaping = false;
        } else if (char === '\\') {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }
      if (char === '#' || (char === '/' && raw[i + 1] === '/')) {
        if (char === '/' && raw[i + 1] === '/') {
          i++;
        }
        while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
          i++;
        }
        if (i < raw.length) {
          result += raw[i];
        }
        continue;
      }
      result += char;
    }
    return result;
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

  private static parseHeaderFlag(rawConfigs: Array<string | undefined>): boolean | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      if (parsed.header !== undefined) return !!parsed.header;
      if (parsed.inHeader !== undefined) return !!parsed.inHeader;
      if (parsed.editHeader !== undefined) return !!parsed.editHeader;
    }
    return undefined;
  }

  private static normalizeQuestionGroup(raw: any): QuestionGroupConfig | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const title = raw.toString().trim();
      return title ? { title } : undefined;
    }
    if (typeof raw !== 'object') return undefined;

    const cfg: QuestionGroupConfig = {};
    if (raw.id !== undefined && raw.id !== null) cfg.id = raw.id.toString();
    if (raw.header !== undefined) cfg.header = !!raw.header;

    const titleRaw = raw.title !== undefined ? raw.title : raw.label !== undefined ? raw.label : raw.name;
    if (titleRaw !== undefined && titleRaw !== null) cfg.title = titleRaw;

    if (raw.collapsible !== undefined) cfg.collapsible = !!raw.collapsible;
    if (raw.defaultCollapsed !== undefined) cfg.defaultCollapsed = !!raw.defaultCollapsed;

    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static parseQuestionGroup(rawConfigs: Array<string | undefined>): QuestionGroupConfig | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const group = this.normalizeQuestionGroup((parsed as any).group || (parsed as any).section || (parsed as any).card);
      if (group) return group;
    }
    return undefined;
  }

  private static parsePairKey(rawConfigs: Array<string | undefined>): string | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const obj: any = parsed as any;
      const candidate =
        obj.pair !== undefined ? obj.pair : obj.pairKey !== undefined ? obj.pairKey : obj.pairWith !== undefined ? obj.pairWith : undefined;
      if (candidate === undefined || candidate === null) continue;
      const value = candidate.toString().trim();
      if (value) return value;
    }
    return undefined;
  }

  private static normalizeChoiceControl(raw: any): ChoiceControl | undefined {
    if (raw === undefined || raw === null) return undefined;
    const candidate = raw.toString().trim().toLowerCase();
    switch (candidate) {
      case 'auto':
      case 'select':
      case 'radio':
      case 'segmented':
      case 'switch':
        return candidate as ChoiceControl;
      default:
        return undefined;
    }
  }

  private static normalizeLabelLayout(raw: any): QuestionUiConfig['labelLayout'] | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (raw === true) return 'stacked';
    const candidate = raw.toString().trim().toLowerCase();
    switch (candidate) {
      case 'stacked':
      case 'stack':
      case 'vertical':
        return 'stacked';
      case 'auto':
        return 'auto';
      default:
        return undefined;
    }
  }

  private static normalizeQuestionUi(rawUi: any): QuestionUiConfig | undefined {
    if (!rawUi || typeof rawUi !== 'object') return undefined;
    const control = this.normalizeChoiceControl(rawUi.control || rawUi.choiceControl || rawUi.choice);
    const labelLayout = this.normalizeLabelLayout(
      rawUi.labelLayout ?? rawUi.label_layout ?? rawUi.stackedLabel ?? rawUi.stackLabel ?? rawUi.stacked
    );
    const cfg: QuestionUiConfig = {};
    if (control) cfg.control = control;
    if (labelLayout && labelLayout !== 'auto') cfg.labelLayout = labelLayout;
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static parseQuestionUi(rawConfigs: Array<string | undefined>): QuestionUiConfig | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const ui = this.normalizeQuestionUi(parsed.ui || parsed.view || parsed.layout);
      if (ui) return ui;
    }
    return undefined;
  }

  private static normalizeLineItemUi(rawUi: any): LineItemGroupUiConfig | undefined {
    if (!rawUi || typeof rawUi !== 'object') return undefined;

    const modeRaw = rawUi.mode !== undefined ? rawUi.mode : rawUi.type;
    const modeCandidate = modeRaw !== undefined && modeRaw !== null ? modeRaw.toString().toLowerCase() : '';
    const mode: LineItemGroupUiConfig['mode'] =
      modeCandidate === 'progressive' ? 'progressive' : modeCandidate === 'default' ? 'default' : undefined;

    const collapsedRaw = rawUi.collapsedFields || rawUi.collapsed || rawUi.summaryFields;
    const collapsedFields: LineItemCollapsedFieldConfig[] | undefined = Array.isArray(collapsedRaw)
      ? collapsedRaw
          .map((entry: any) => {
            if (!entry) return null;
            if (typeof entry === 'string') return { fieldId: entry, showLabel: true };
            if (typeof entry === 'object' && entry.fieldId) {
              return { fieldId: entry.fieldId.toString(), showLabel: entry.showLabel !== undefined ? !!entry.showLabel : true };
            }
            return null;
          })
          .filter(Boolean) as LineItemCollapsedFieldConfig[]
      : undefined;

    const gateRaw = rawUi.expandGate || rawUi.gate;
    const gateCandidate = gateRaw !== undefined && gateRaw !== null ? gateRaw.toString() : '';
    const expandGate: LineItemGroupUiConfig['expandGate'] =
      gateCandidate === 'always' ? 'always' : gateCandidate === 'collapsedFieldsValid' ? 'collapsedFieldsValid' : undefined;

    const defaultCollapsed =
      rawUi.defaultCollapsed !== undefined && rawUi.defaultCollapsed !== null ? !!rawUi.defaultCollapsed : undefined;

    const rowDisclaimer = this.normalizeRowDisclaimer(rawUi.rowDisclaimer ?? rawUi.row_disclaimer ?? rawUi.disclaimer);

    const cfg: LineItemGroupUiConfig = {};
    if (mode) cfg.mode = mode;
    if (collapsedFields && collapsedFields.length) cfg.collapsedFields = collapsedFields;
    if (expandGate) cfg.expandGate = expandGate;
    if (defaultCollapsed !== undefined) cfg.defaultCollapsed = defaultCollapsed;
    if (rowDisclaimer) (cfg as any).rowDisclaimer = rowDisclaimer;
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static normalizeRowDisclaimer(raw: any): any | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string') {
      const s = raw.toString().trim();
      return s ? s : undefined;
    }
    if (typeof raw !== 'object') return undefined;

    // Support LocalizedString objects directly (e.g., { en: "...", fr: "...", nl: "..." }).
    const hasTemplateShape =
      Object.prototype.hasOwnProperty.call(raw, 'template') ||
      Object.prototype.hasOwnProperty.call(raw, 'cases') ||
      Object.prototype.hasOwnProperty.call(raw, 'fallback');
    if (!hasTemplateShape) {
      const hasAnyLocale =
        typeof (raw as any).en === 'string' || typeof (raw as any).fr === 'string' || typeof (raw as any).nl === 'string';
      return hasAnyLocale ? raw : undefined;
    }

    const cfg: any = {};
    if ((raw as any).template !== undefined) cfg.template = (raw as any).template;
    if ((raw as any).fallback !== undefined) cfg.fallback = (raw as any).fallback;
    if (Array.isArray((raw as any).cases)) {
      cfg.cases = (raw as any).cases
        .map((c: any) => {
          if (!c || typeof c !== 'object') return null;
          if (!c.text) return null;
          const out: any = { text: c.text };
          if (c.when && typeof c.when === 'object' && c.when.fieldId) out.when = c.when;
          return out;
        })
        .filter(Boolean);
    }
    const hasAny = Object.keys(cfg).some(k => (cfg as any)[k] !== undefined);
    return hasAny ? cfg : undefined;
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
        const ui = this.normalizeLineItemUi(parsed.ui || parsed.view || parsed.layout);
        const subGroups = Array.isArray(parsed.subGroups)
          ? parsed.subGroups
              .map((entry: any, idx: number) => this.normalizeSubGroupConfig(ss, entry, `${optionsRef || ''}_sub_${idx + 1}`))
              .filter(Boolean) as LineItemGroupConfig[]
          : undefined;

        return {
          id: parsed.id ? parsed.id.toString() : undefined,
          label: parsed.label,
          ui,
          minRows: parsed.minRows ? Number(parsed.minRows) : undefined,
          maxRows: parsed.maxRows ? Number(parsed.maxRows) : undefined,
          addButtonLabel: parsed.addButtonLabel,
          anchorFieldId: parsed.anchorFieldId,
          addMode: parsed.addMode,
          sectionSelector,
          totals,
          fields: mergedFields,
          subGroups
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
        const fieldType = (row[1] ? row[1].toString().toUpperCase() : 'TEXT') as LineItemFieldType;
        const dataSource = (fieldType === 'CHOICE' || fieldType === 'CHECKBOX')
          ? this.parseDataSource(rawConfig)
          : undefined;
        const selectionEffects = this.parseSelectionEffects(rawConfig);
        const valueMap = this.parseValueMap(rawConfig);
        const derivedValue = this.parseDerivedValue(rawConfig);
      const ui = this.parseQuestionUi([rawConfig]);
      const group = this.parseQuestionGroup([rawConfig]);
      const pair = this.parsePairKey([rawConfig]);
      const uploadConfig =
        fieldType === 'FILE_UPLOAD'
          ? this.parseUploadConfig(rawConfig || (row[6] ? row[6].toString().trim() : ''))
          : undefined;
      return {
        id: row[0] ? row[0].toString() : `LI${idx + 1}`,
        type: fieldType,
        labelEn: row[2] || '',
        labelFr: row[3] || '',
        labelNl: row[4] || '',
        required: !!row[5],
        group,
        pair,
        ui,
        options,
        optionsFr,
        optionsNl,
        optionFilter,
        validationRules,
        visibility,
        dataSource,
        selectionEffects,
        valueMap,
        derivedValue,
        uploadConfig
      };
    }).filter(f => f.labelEn || f.labelFr || f.labelNl);

    return { fields };
  }

  private static normalizeLineItemField(field: any, idx: number): LineItemFieldConfig {
    const baseType = (field?.type ? field.type.toString().toUpperCase() : 'TEXT') as LineItemFieldType;
    const dataSource = (baseType === 'CHOICE' || baseType === 'CHECKBOX')
      ? this.buildDataSourceConfig(this.extractDataSourceCandidate(field))
      : undefined;
    const uploadConfig =
      baseType === 'FILE_UPLOAD' ? this.normalizeUploadConfig(field?.uploadConfig || field?.upload) : undefined;
    const selectionEffects = this.normalizeSelectionEffects(field?.selectionEffects);
    const valueMap = this.normalizeValueMap(field?.valueMap);
    const derivedValue = this.normalizeDerivedValue(field?.derivedValue);
    const ui = this.normalizeQuestionUi(field?.ui || field?.view || field?.layout);
    const group = this.normalizeQuestionGroup(field?.group || field?.section || field?.card);
    const pairCandidate =
      field?.pair !== undefined
        ? field.pair
        : field?.pairKey !== undefined
        ? field.pairKey
        : field?.pairWith !== undefined
        ? field.pairWith
        : undefined;
    const pair = pairCandidate !== undefined && pairCandidate !== null ? pairCandidate.toString().trim() : undefined;
    return {
      id: field?.id || `LI${idx + 1}`,
      type: baseType,
      labelEn: field?.labelEn || '',
      labelFr: field?.labelFr || '',
      labelNl: field?.labelNl || '',
      required: !!field?.required,
      group,
      pair: pair || undefined,
      ui,
      options: Array.isArray(field?.options) ? field.options : [],
      optionsFr: Array.isArray(field?.optionsFr) ? field.optionsFr : [],
      optionsNl: Array.isArray(field?.optionsNl) ? field.optionsNl : [],
      optionFilter: field?.optionFilter,
      validationRules: Array.isArray(field?.validationRules) ? field.validationRules : undefined,
      visibility: this.normalizeVisibility(field?.visibility),
      dataSource,
      selectionEffects,
      valueMap,
      derivedValue,
      uploadConfig
    };
  }

  private static normalizeSubGroupConfig(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    entry: any,
    fallbackId?: string
  ): LineItemGroupConfig | undefined {
    if (!entry || typeof entry !== 'object') return undefined;

    if (typeof entry.ref === 'string' && entry.ref.startsWith('REF:')) {
      const refName = entry.ref.substring(4).trim();
      const refCfg = this.parseLineItemSheet(ss, refName);
      if (refCfg) {
        return {
          ...refCfg,
          id: entry.id ? entry.id.toString() : refCfg.id || fallbackId,
          label: entry.label || refCfg.label,
          ui: entry.ui ? this.normalizeLineItemUi(entry.ui) : refCfg.ui,
          minRows: entry.minRows ?? refCfg.minRows,
          maxRows: entry.maxRows ?? refCfg.maxRows,
          addMode: entry.addMode ?? refCfg.addMode,
          addButtonLabel: entry.addButtonLabel ?? refCfg.addButtonLabel,
          anchorFieldId: entry.anchorFieldId ?? refCfg.anchorFieldId,
          sectionSelector: entry.sectionSelector ? this.normalizeLineItemSelector(ss, entry.sectionSelector) : refCfg.sectionSelector,
          totals: entry.totals ? this.normalizeLineItemTotals(entry.totals) : refCfg.totals
        };
      }
    }

    const fields: LineItemFieldConfig[] = Array.isArray(entry.fields)
      ? entry.fields.map((f: any, idx: number) => this.normalizeLineItemField(f, idx))
      : [];
    const sectionSelector = this.normalizeLineItemSelector(ss, entry.sectionSelector);
    const totals = this.normalizeLineItemTotals(entry.totals);
    const ui = this.normalizeLineItemUi(entry.ui);

    return {
      id: entry.id ? entry.id.toString() : fallbackId,
      label: entry.label,
      ui,
      minRows: entry.minRows ? Number(entry.minRows) : undefined,
      maxRows: entry.maxRows ? Number(entry.maxRows) : undefined,
      addButtonLabel: entry.addButtonLabel,
      anchorFieldId: entry.anchorFieldId,
      addMode: entry.addMode,
      sectionSelector,
      totals,
      fields
    };
  }

  private static normalizeValueMap(raw: any): OptionFilter | undefined {
    if (!raw) return undefined;
    if (raw.dependsOn && raw.optionMap) return raw as OptionFilter;
    return undefined;
  }

  private static normalizeDerivedValue(raw: any): DerivedValueConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const op = raw.op ? raw.op.toString() : 'addDays';
    const whenRaw = raw.when !== undefined && raw.when !== null ? raw.when.toString().trim().toLowerCase() : '';
    const when = whenRaw === 'empty' || whenRaw === 'always' ? (whenRaw as any) : undefined;
    const hidden = raw.hidden !== undefined ? Boolean(raw.hidden) : undefined;

    if (op === 'addDays') {
      const dependsOn = raw.dependsOn ? raw.dependsOn.toString().trim() : '';
      if (!dependsOn) return undefined;
      const cfg: any = { op: 'addDays', dependsOn };
      if (raw.offsetDays !== undefined && raw.offsetDays !== null) {
        const num = Number(raw.offsetDays);
        if (!isNaN(num)) cfg.offsetDays = num;
      }
      if (when) cfg.when = when;
      if (hidden !== undefined) cfg.hidden = hidden;
      return cfg as DerivedValueConfig;
    }

    if (op === 'today') {
      const cfg: any = { op: 'today' };
      if (when) cfg.when = when;
      if (hidden !== undefined) cfg.hidden = hidden;
      return cfg as DerivedValueConfig;
    }

    if (op === 'timeOfDayMap') {
      const dependsOn = raw.dependsOn ? raw.dependsOn.toString().trim() : '';
      const thresholdsRaw = raw.thresholds ?? raw.map ?? raw.mapping ?? raw.timeMap;
      if (!Array.isArray(thresholdsRaw)) return undefined;

      const thresholds: any[] = [];
      thresholdsRaw.forEach((entry: any) => {
        if (entry === undefined || entry === null) return;
        if (typeof entry === 'string') {
          const v = entry.toString().trim();
          if (v) thresholds.push({ value: v });
          return;
        }
        if (Array.isArray(entry)) {
          const before = entry.length >= 1 ? entry[0] : undefined;
          const value = entry.length >= 2 ? entry[1] : undefined;
          const v = value !== undefined && value !== null ? value.toString().trim() : '';
          if (!v) return;
          const b = before !== undefined && before !== null ? before : undefined;
          thresholds.push(b === undefined ? { value: v } : { before: b, value: v });
          return;
        }
        if (typeof entry === 'object') {
          const v = entry.value !== undefined && entry.value !== null ? entry.value.toString().trim() : '';
          if (!v) return;
          const b =
            entry.before !== undefined && entry.before !== null
              ? entry.before
              : entry.at !== undefined && entry.at !== null
                ? entry.at
                : entry.until !== undefined && entry.until !== null
                  ? entry.until
                  : undefined;
          thresholds.push(b === undefined ? { value: v } : { before: b, value: v });
        }
      });

      if (!thresholds.length) return undefined;

      const cfg: any = { op: 'timeOfDayMap', thresholds };
      if (dependsOn) cfg.dependsOn = dependsOn;
      if (when) cfg.when = when;
      if (hidden !== undefined) cfg.hidden = hidden;
      return cfg as DerivedValueConfig;
    }

    if (op === 'copy') {
      const dependsOn = raw.dependsOn ? raw.dependsOn.toString().trim() : '';
      if (!dependsOn) return undefined;
      const cfg: any = { op: 'copy', dependsOn };
      const applyOnRaw = raw.applyOn !== undefined && raw.applyOn !== null ? raw.applyOn.toString().trim().toLowerCase() : '';
      if (applyOnRaw === 'change' || applyOnRaw === 'blur') cfg.applyOn = applyOnRaw;
      const copyModeRaw =
        raw.copyMode !== undefined && raw.copyMode !== null
          ? raw.copyMode.toString().trim()
          : raw.mode !== undefined && raw.mode !== null
            ? raw.mode.toString().trim()
            : '';
      const copyMode = copyModeRaw.toLowerCase();
      if (copyMode === 'replace' || copyMode === 'allowincrease' || copyMode === 'allowdecrease') {
        cfg.copyMode = copyMode === 'allowincrease' ? 'allowIncrease' : copyMode === 'allowdecrease' ? 'allowDecrease' : 'replace';
      }
      if (when) cfg.when = when;
      if (hidden !== undefined) cfg.hidden = hidden;
      return cfg as DerivedValueConfig;
    }

    return undefined;
  }
}
