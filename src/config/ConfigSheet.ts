import {
  AutoIncrementConfig,
  ButtonConfig,
  ChoiceControl,
  DataSourceConfig,
  DefaultValue,
  DerivedValueConfig,
  FieldChangeDialogConfig,
  FileUploadConfig,
  LineItemFieldType,
  LineItemFieldConfig,
  LineItemCollapsedFieldConfig,
  LineItemDedupRule,
  LineItemGroupConfig,
  LineItemGroupUiConfig,
  LineItemSelectorConfig,
  LineItemTotalConfig,
  ListViewSortConfig,
  LocalizedString,
  OptionSortMode,
  OptionMapRefConfig,
  OptionFilter,
  ValueMapConfig,
  ParagraphDisclaimerConfig,
  PageSectionConfig,
  QuestionGroupConfig,
  QuestionUiConfig,
  QuestionConfig,
  QuestionType,
  PresetValue,
  SelectionEffect,
  ValidationRule,
  VisibilityCondition,
  WhenClause,
  VisibilityConfig
} from '../types';

export class ConfigSheet {
  public static setupExample(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, exampleRows: any[]): void {
    if (ss.getSheetByName(name)) return;
    
    const sheet = ss.insertSheet(name);
    const headers = [
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status (Active/Archived)', 'Config (JSON/REF)', 'Option Filter (JSON)', 'Validation Rules (JSON)', 'List View?', 'Edit Options']
    ];
    
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight('normal');
    
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
      .requireValueInList([
        'DATE',
        'TEXT',
        'PARAGRAPH',
        'NUMBER',
        'CHOICE',
        'CHECKBOX',
        'FILE_UPLOAD',
        'LINE_ITEM_GROUP',
        'BUTTON'
      ])
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
      const { options, optionsFr, optionsNl, optionsRaw } = this.parseOptions(ss, row[idxOptionsEn], row[idxOptionsFr], row[idxOptionsNl]);
      const rawConfig = row[idxConfig] ? row[idxConfig].toString().trim() : '';
      const optionFilterRaw = row[idxOptionFilter] ? row[idxOptionFilter].toString().trim() : rawConfig;
      const validationRaw = row[idxValidation] ? row[idxValidation].toString().trim() : rawConfig;
      const lineItemConfig = type === 'LINE_ITEM_GROUP' ? this.parseLineItemConfig(ss, rawConfig || row[idxOptionsEn], row[idxOptionsEn]) : undefined;
      const uploadConfig = type === 'FILE_UPLOAD' ? this.parseUploadConfig(rawConfig || row[6]) : undefined;
      const optionFilter = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseOptionFilter(ss, optionFilterRaw) : undefined;
      const dataSource = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseDataSource(rawConfig) : undefined;
      const validationRules = this.parseValidationRules(validationRaw);
      const valueMap = type === 'TEXT' ? this.parseValueMap(ss, rawConfig) : undefined;
      const visibility = this.parseVisibilityFromAny([rawConfig, optionFilterRaw, validationRaw]);
      const changeDialog = this.parseChangeDialogFromAny([rawConfig, optionFilterRaw, validationRaw]);
      const clearOnChange = this.parseClearOnChange([rawConfig, optionFilterRaw, validationRaw]);
      const header = this.parseHeaderFlag([rawConfig, optionFilterRaw, validationRaw]);
      const requiredMessage = this.parseRequiredMessage([rawConfig, optionFilterRaw, validationRaw]);
      const group = this.parseQuestionGroup([rawConfig, optionFilterRaw, validationRaw]);
      const pair = this.parsePairKey([rawConfig, optionFilterRaw, validationRaw]);
      const ui = this.parseQuestionUi([rawConfig, optionFilterRaw, validationRaw]);
      const readOnly = this.parseReadOnly([rawConfig, optionFilterRaw, validationRaw]);
      const optionSort =
        type === 'CHOICE' || type === 'CHECKBOX' ? this.parseOptionSort([rawConfig, optionFilterRaw, validationRaw]) : undefined;
      const selectionEffects = (type === 'CHOICE' || type === 'CHECKBOX') ? this.parseSelectionEffects(rawConfig) : undefined;
      const statusRaw = row[idxStatus] ? row[idxStatus].toString().trim().toLowerCase() : 'active';
      const status = statusRaw === 'archived' ? 'Archived' : 'Active';
      const listViewFlag = row[idxListView] !== '' && row[idxListView] !== null ? !!row[idxListView] : false;
      const listViewSort = listViewFlag ? this.parseListViewSort(rawConfig) : undefined;
      const autoIncrement = type === 'TEXT' ? this.parseAutoIncrement(rawConfig) : undefined;
      const derivedValue = this.parseDerivedValue(rawConfig);
      const defaultValue = this.parseDefaultValue(rawConfig);
      const button = type === 'BUTTON' ? this.parseButtonConfig(rawConfig) : undefined;

      return {
        id: row[0] ? row[0].toString() : '',
        type,
        qEn: row[idxQEn],
        qFr: row[idxQFr],
        qNl: row[idxQNl],
        required: type === 'BUTTON' ? false : !!row[idxRequired],
        requiredMessage,
        defaultValue,
        ui,
        readOnly,
        optionSort,
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
        optionsRaw,
        status,
        uploadConfig,
        lineItemConfig,
        dataSource,
        optionFilter,
        validationRules,
        visibility,
        changeDialog,
        clearOnChange,
        selectionEffects,
        listViewSort,
        autoIncrement,
        valueMap,
        derivedValue,
        button
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
    const idxConfig = findHeader(['config', 'config (json/ref)'], 10);
    const idxListView = findHeader(['list view', 'list view?'], 14);

    return data.map(row => {
      const type = row[idxType] ? (row[idxType].toString().toUpperCase() as QuestionType) : ('TEXT' as QuestionType);
      const statusRaw = row[idxStatus] ? row[idxStatus].toString().trim().toLowerCase() : 'active';
      const status = statusRaw === 'archived' ? 'Archived' : 'Active';
      const listViewFlag = row[idxListView] !== '' && row[idxListView] !== null ? !!row[idxListView] : false;
      const rawConfig = row[idxConfig] ? row[idxConfig].toString().trim() : '';
      const listViewSort =
        listViewFlag && rawConfig && /listview/i.test(rawConfig) ? this.parseListViewSort(rawConfig) : undefined;

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
        listViewSort,
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

  private static parseOptions(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawEn: any,
    rawFr: any,
    rawNl: any
  ): { options: string[]; optionsFr: string[]; optionsNl: string[]; optionsRaw?: Record<string, any>[] } {
    const rawOptionsEn = rawEn ? rawEn.toString().trim() : '';
    if (rawOptionsEn.startsWith('REF:')) {
      const refSheetName = rawOptionsEn.substring(4).trim();
      const refSheet = ss.getSheetByName(refSheetName);
      if (refSheet) {
        const lastRefRow = refSheet.getLastRow();
        const lastRefColumn = Math.max(3, refSheet.getLastColumn());
        if (lastRefRow > 1) {
          const refData = refSheet.getRange(2, 1, lastRefRow - 1, lastRefColumn).getValues();
          const headers = refSheet.getRange(1, 1, 1, lastRefColumn).getValues()[0] || [];
          const normalizedHeaders = headers.map((h: any, idx: number) => {
            const key = h !== undefined && h !== null ? h.toString().trim() : '';
            return key || `Column_${idx + 1}`;
          });
          const optionsRaw = refData
            .map((row: any[]) => {
              const rowObj: Record<string, any> = {};
              normalizedHeaders.forEach((key, idx) => {
                if (!key) return;
                rowObj[key] = row[idx];
              });
              const baseValue = row[0];
              if (baseValue !== undefined && baseValue !== null && baseValue !== '') {
                rowObj.__ckOptionValue = baseValue.toString();
              }
              return rowObj;
            })
            .filter(row => row.__ckOptionValue);
          return {
            options: refData.map(r => r[0].toString()).filter(s => s),
            optionsFr: refData.map(r => r[1].toString()).filter(s => s),
            optionsNl: refData.map(r => r[2].toString()).filter(s => s),
            optionsRaw
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
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight('normal');

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
        const root: any =
          (parsed as any).uploadConfig && typeof (parsed as any).uploadConfig === 'object' ? (parsed as any).uploadConfig : parsed;

        const dest = root.destinationFolderId ?? root.destination_folder_id ?? root.folderId ?? root.folder_id;
        if (dest !== undefined && dest !== null && dest.toString) config.destinationFolderId = dest.toString();

        const minFiles = root.minFiles ?? root.min_files ?? root.minCount ?? root.min_count;
        if (minFiles !== undefined && minFiles !== null) {
          const n = Number(minFiles);
          if (!isNaN(n)) config.minFiles = n;
        }

        const maxFiles = root.maxFiles ?? root.max_files ?? root.maxCount ?? root.max_count;
        if (maxFiles !== undefined && maxFiles !== null) {
          const n = Number(maxFiles);
          if (!isNaN(n)) config.maxFiles = n;
        }

        const maxSize =
          root.maxFileSizeMb ??
          root.maxFileSizeMB ??
          root.max_file_size_mb ??
          root.max_size_mb ??
          root.maxSizeMb ??
          root.max_size;
        if (maxSize !== undefined && maxSize !== null) {
          const n = Number(maxSize);
          if (!isNaN(n)) config.maxFileSizeMb = n;
        }

        const exts = root.allowedExtensions ?? root.allowed_extensions ?? root.extensions ?? root.exts ?? root.allowedExts;
        if (Array.isArray(exts)) config.allowedExtensions = exts as any;
        else if (typeof exts === 'string') {
          config.allowedExtensions = exts
            .split(/[|,\s]+/)
            .map(s => s.trim())
            .filter(Boolean);
        }

        const mimes =
          root.allowedMimeTypes ?? root.allowed_mime_types ?? root.allowedTypes ?? root.allowed_types ?? root.mimeTypes ?? root.mimes;
        if (Array.isArray(mimes)) config.allowedMimeTypes = mimes as any;
        else if (typeof mimes === 'string') {
          config.allowedMimeTypes = mimes
            .split(/[|,\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
        }

        const errorMessages = root.errorMessages ?? root.error_messages ?? root.errors ?? root.messages;
        if (errorMessages && typeof errorMessages === 'object') config.errorMessages = errorMessages;

        const helperText =
          root.helperText ??
          root.helper_text ??
          root.remainingHelperText ??
          root.remaining_helper_text ??
          root.remainingText ??
          root.remaining_text;
        if (helperText !== undefined && helperText !== null) config.helperText = helperText;

        const linkLabel =
          root.linkLabel ??
          root.link_label ??
          root.fileLinkLabel ??
          root.file_link_label ??
          root.fileLabel ??
          root.file_label;
        if (linkLabel !== undefined && linkLabel !== null) (config as any).linkLabel = linkLabel;

        const uploadUi = root.ui ?? root.UI ?? root.uploadUi ?? root.upload_ui;
        if (uploadUi && typeof uploadUi === 'object') (config as any).ui = uploadUi;
        const uploadVariant =
          root.uiVariant ??
          root.ui_variant ??
          root.variant ??
          root.uploadVariant ??
          root.upload_variant ??
          root.displayVariant ??
          root.display_variant;
        const progressiveFlag = root.progressive ?? root.progressiveUi ?? root.progressive_ui;
        if (progressiveFlag === true) {
          (config as any).ui = (config as any).ui || {};
          (config as any).ui.variant = 'progressive';
        } else if (uploadVariant !== undefined && uploadVariant !== null) {
          const v = uploadVariant.toString().trim().toLowerCase();
          if (v === 'progressive' || v === 'standard') {
            (config as any).ui = (config as any).ui || {};
            (config as any).ui.variant = v;
          }
        }

        const compression = root.compression ?? root.compress;
        if (compression !== undefined) config.compression = compression;
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
          case 'minfiles':
          case 'mincount':
            config.minFiles = Number(value);
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
          case 'mimes':
          case 'mimetypes':
          case 'allowedmimetypes':
            config.allowedMimeTypes = value.split('|').map(v => v.trim()).filter(Boolean);
            break;
        }
      });
    }

    return Object.keys(config).length ? config : undefined;
  }

  private static normalizeUploadConfig(raw: any): FileUploadConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const cfg: FileUploadConfig = {};
    const root = raw.uploadConfig && typeof raw.uploadConfig === 'object' ? raw.uploadConfig : raw;
    const dest = root.destinationFolderId ?? root.destination_folder_id ?? root.folderId ?? root.folder_id;
    if (dest !== undefined && dest !== null) cfg.destinationFolderId = dest.toString();

    const minFiles = root.minFiles ?? root.min_files ?? root.minCount ?? root.min_count;
    if (minFiles !== undefined && minFiles !== null) {
      const n = Number(minFiles);
      if (!isNaN(n)) cfg.minFiles = n;
    }
    const maxFiles = root.maxFiles ?? root.max_files ?? root.maxCount ?? root.max_count;
    if (maxFiles !== undefined && maxFiles !== null) {
      const n = Number(maxFiles);
      if (!isNaN(n)) cfg.maxFiles = n;
    }

    const maxSize =
      root.maxFileSizeMb ??
      root.maxFileSizeMB ??
      root.max_file_size_mb ??
      root.max_size_mb ??
      root.maxSizeMb ??
      root.max_size;
    if (maxSize !== undefined && maxSize !== null) {
      const n = Number(maxSize);
      if (!isNaN(n)) cfg.maxFileSizeMb = n;
    }

    const exts = root.allowedExtensions ?? root.allowed_extensions ?? root.extensions ?? root.exts ?? root.allowedExts;
    if (Array.isArray(exts)) {
      cfg.allowedExtensions = exts.map((v: any) => (v !== undefined && v !== null ? v.toString() : '')).filter(Boolean);
    } else if (typeof exts === 'string') {
      cfg.allowedExtensions = exts
        .split(/[|,\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    const mimes =
      root.allowedMimeTypes ?? root.allowed_mime_types ?? root.allowedTypes ?? root.allowed_types ?? root.mimeTypes ?? root.mimes;
    if (Array.isArray(mimes)) {
      cfg.allowedMimeTypes = mimes.map((v: any) => (v !== undefined && v !== null ? v.toString() : '')).filter(Boolean);
    } else if (typeof mimes === 'string') {
      cfg.allowedMimeTypes = mimes
        .split(/[|,\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    const errorMessages = root.errorMessages ?? root.error_messages ?? root.errors ?? root.messages;
    if (errorMessages && typeof errorMessages === 'object') cfg.errorMessages = errorMessages;

    const helperText =
      root.helperText ??
      root.helper_text ??
      root.remainingHelperText ??
      root.remaining_helper_text ??
      root.remainingText ??
      root.remaining_text;
    if (helperText !== undefined && helperText !== null) cfg.helperText = helperText;

    const linkLabel =
      root.linkLabel ??
      root.link_label ??
      root.fileLinkLabel ??
      root.file_link_label ??
      root.fileLabel ??
      root.file_label;
    if (linkLabel !== undefined && linkLabel !== null) (cfg as any).linkLabel = linkLabel;

    const uploadUi = root.ui ?? root.UI ?? root.uploadUi ?? root.upload_ui;
    if (uploadUi && typeof uploadUi === 'object') (cfg as any).ui = uploadUi;
    const uploadVariant =
      root.uiVariant ??
      root.ui_variant ??
      root.variant ??
      root.uploadVariant ??
      root.upload_variant ??
      root.displayVariant ??
      root.display_variant;
    const progressiveFlag = root.progressive ?? root.progressiveUi ?? root.progressive_ui;
    if (progressiveFlag === true) {
      (cfg as any).ui = (cfg as any).ui || {};
      (cfg as any).ui.variant = 'progressive';
    } else if (uploadVariant !== undefined && uploadVariant !== null) {
      const v = uploadVariant.toString().trim().toLowerCase();
      if (v === 'progressive' || v === 'standard') {
        (cfg as any).ui = (cfg as any).ui || {};
        (cfg as any).ui.variant = v;
      }
    }

    const compression = root.compression ?? root.compress;
    if (compression !== undefined) cfg.compression = compression;
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static normalizeOptionMapRef(raw: any): OptionMapRefConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const refRaw = (raw as any).ref ?? (raw as any).tab ?? (raw as any).tabName ?? (raw as any).sheet ?? (raw as any).sheetName;
    const keyRaw =
      (raw as any).keyColumns ??
      (raw as any).keyCols ??
      (raw as any).keys ??
      (raw as any).keyColumn ??
      (raw as any).keyCol ??
      (raw as any).key ??
      (raw as any).keyHeader;
    const lookupRaw =
      (raw as any).lookupColumn ??
      (raw as any).lookupCol ??
      (raw as any).valueColumn ??
      (raw as any).valueCol ??
      (raw as any).value ??
      (raw as any).lookup ??
      (raw as any).lookupHeader;

    if (refRaw === undefined || refRaw === null) return undefined;
    if (keyRaw === undefined || keyRaw === null) return undefined;
    if (lookupRaw === undefined || lookupRaw === null) return undefined;

    const ref = refRaw.toString().trim();
    if (!ref) return undefined;

    const normalizeCol = (val: any): string | number | undefined => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      const s = val.toString().trim();
      if (!s) return undefined;
      if (/^\d+$/.test(s)) return Number(s);
      return s;
    };

    const keyColumnList = (() => {
      if (Array.isArray(keyRaw)) {
        const cols = keyRaw.map(v => normalizeCol(v)).filter((v): v is string | number => v !== undefined);
        return cols.length ? cols : undefined;
      }
      const single = normalizeCol(keyRaw);
      return single !== undefined ? [single] : undefined;
    })();
    const lookupColumn = normalizeCol(lookupRaw);
    if (!keyColumnList || lookupColumn === undefined) return undefined;
    const keyColumn = keyColumnList.length === 1 ? keyColumnList[0] : keyColumnList;

    const delimiterRaw = (raw as any).delimiter ?? (raw as any).separator ?? (raw as any).sep ?? (raw as any).split;
    const delimiter =
      delimiterRaw !== undefined && delimiterRaw !== null ? delimiterRaw.toString() : undefined;

    const splitKeyRaw = (raw as any).splitKey ?? (raw as any).splitKeys ?? (raw as any).split_key ?? (raw as any).split_keys;
    const splitKey = this.normalizeBoolean(splitKeyRaw);
    const keyDelimRaw = (raw as any).keyDelimiter ?? (raw as any).keyDelim ?? (raw as any).keySeparator ?? (raw as any).keySep;
    const keyDelimiter = keyDelimRaw !== undefined && keyDelimRaw !== null ? keyDelimRaw.toString() : undefined;

    return {
      ref,
      keyColumn,
      lookupColumn,
      delimiter: delimiter ? delimiter.toString() : undefined,
      splitKey,
      keyDelimiter: keyDelimiter ? keyDelimiter.toString() : undefined
    };
  }

  private static resolveRefSheetName(ref: string): string {
    const raw = (ref || '').toString().trim();
    if (!raw) return '';
    return raw.startsWith('REF:') ? raw.substring(4).trim() : raw;
  }

  private static columnLettersToIndex(letters: string): number {
    const s = (letters || '').toString().trim().toUpperCase();
    if (!s || !/^[A-Z]+$/.test(s)) return 0;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      n = n * 26 + (s.charCodeAt(i) - 64); // 'A' -> 1
    }
    return n;
  }

  private static resolveSheetColumnIndex(col: string | number, headers: any[]): number | null {
    if (typeof col === 'number' && Number.isFinite(col)) {
      const idx = Math.floor(col);
      if (idx < 1) return null;
      const max = Array.isArray(headers) ? headers.length : 0;
      if (max && idx > max) return null;
      return idx;
    }
    const raw = col !== undefined && col !== null ? col.toString().trim() : '';
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const idx = Number(raw);
      if (idx < 1) return null;
      const max = Array.isArray(headers) ? headers.length : 0;
      if (max && idx > max) return null;
      return idx;
    }
    const target = raw.toLowerCase().trim();
    const headerIdx = Array.isArray(headers)
      ? headers.findIndex(h => (h || '').toString().trim().toLowerCase() === target)
      : -1;
    if (headerIdx >= 0) return headerIdx + 1;

    // If there is no matching header, fall back to column letters (A, B, AA, ...).
    const upper = raw.toUpperCase();
    if (/^[A-Z]+$/.test(upper) && upper.length <= 3) {
      const idx = this.columnLettersToIndex(upper);
      const max = Array.isArray(headers) ? headers.length : 0;
      if (idx < 1) return null;
      if (max && idx > max) return null;
      return idx;
    }

    return null;
  }

  private static splitOptionMapCell(raw: any, delimiter?: string): string[] {
    if (raw === undefined || raw === null) return [];
    const str = String(raw).trim();
    if (!str) return [];
    const delim = delimiter !== undefined && delimiter !== null ? delimiter.toString() : '';
    if (delim && delim.toLowerCase() !== 'none') {
      return str
        .split(delim)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    return str
      .split(/[,;\n]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  private static normalizeBypassValues(raw: any): string[] | undefined {
    if (raw === undefined || raw === null) return undefined;
    const values = Array.isArray(raw)
      ? raw.map(v => (v ?? '').toString().trim()).filter(Boolean)
      : this.splitOptionMapCell(raw);
    if (!values.length) return undefined;
    const seen = new Set<string>();
    const unique = values.filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
    return unique.length ? unique : undefined;
  }

  private static normalizeOptionMapRecord(raw: any): Record<string, string[]> | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const out: Record<string, string[]> = {};
    Object.keys(raw).forEach(key => {
      const valuesRaw: any = (raw as any)[key];
      if (valuesRaw === undefined || valuesRaw === null) return;
      if (Array.isArray(valuesRaw)) {
        out[key] = valuesRaw.map((v: any) => (v === undefined || v === null ? '' : v.toString().trim())).filter(Boolean);
        return;
      }
      if (typeof valuesRaw === 'string' || typeof valuesRaw === 'number' || typeof valuesRaw === 'boolean') {
        out[key] = this.splitOptionMapCell(valuesRaw);
        return;
      }
    });
    return out;
  }

  private static buildOptionMapFromRef(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    refCfg: OptionMapRefConfig
  ): Record<string, string[]> | undefined {
    const tabName = this.resolveRefSheetName(refCfg.ref);
    if (!tabName) return undefined;
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return undefined;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) return undefined;
    if (lastRow <= 1) return {};

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const keyCols = Array.isArray(refCfg.keyColumn) ? refCfg.keyColumn : [refCfg.keyColumn];
    const keyColIdxs = keyCols.map(col => this.resolveSheetColumnIndex(col, headers));
    if (keyColIdxs.some(idx => !idx)) return undefined;
    const lookupColIdx = this.resolveSheetColumnIndex(refCfg.lookupColumn, headers);
    if (!lookupColIdx) return undefined;

    const numRows = lastRow - 1;
    const keyColumns = keyColIdxs.map(idx => sheet.getRange(2, idx as number, numRows, 1).getValues());
    const lookups = sheet.getRange(2, lookupColIdx, numRows, 1).getValues();
    const map: Record<string, string[]> = {};

    for (let i = 0; i < numRows; i++) {
      const keyParts = keyColumns.map(col => {
        const v = col[i]?.[0];
        return v !== undefined && v !== null ? v.toString().trim() : '';
      });
      if (!keyParts.some(Boolean)) continue;

      // When enabled and using a single key column, split key cells into multiple keys (e.g., "Vegan, Vegetarian").
      // Each key receives the same lookup value(s).
      if ((refCfg as any)?.splitKey === true && keyParts.length === 1) {
        const keys = this.splitOptionMapCell(keyParts[0], (refCfg as any)?.keyDelimiter);
        if (!keys.length) continue;
        const lookupRaw = lookups[i]?.[0];
        const values = this.splitOptionMapCell(lookupRaw, refCfg.delimiter);
        if (!values.length) continue;
        keys.forEach(key => {
          if (!map[key]) map[key] = [];
          map[key].push(...values);
        });
        continue;
      }

      // For composite keys, allow prefix keys (e.g., [A, ""] -> "A") but disallow gaps (e.g., [A, "", B]).
      const firstEmptyIdx = keyParts.findIndex(p => !p);
      if (firstEmptyIdx >= 0 && keyParts.slice(firstEmptyIdx).some(Boolean)) continue;
      const usableParts = firstEmptyIdx >= 0 ? keyParts.slice(0, firstEmptyIdx) : keyParts;
      if (!usableParts.length) continue;
      let key = usableParts.length > 1 ? usableParts.join('||') : usableParts[0];
      // Treat all-wildcard composite keys as the global fallback key.
      if (usableParts.length > 1 && usableParts.every(p => p === '*')) key = '*';
      if (!key) continue;
      const lookupRaw = lookups[i]?.[0];
      const values = this.splitOptionMapCell(lookupRaw, refCfg.delimiter);
      if (!values.length) continue;
      if (!map[key]) map[key] = [];
      map[key].push(...values);
    }

    Object.keys(map).forEach(k => {
      const seen = new Set<string>();
      const uniq: string[] = [];
      map[k].forEach(v => {
        const t = (v ?? '').toString().trim();
        if (!t || seen.has(t)) return;
        seen.add(t);
        uniq.push(t);
      });
      map[k] = uniq;
    });

    return map;
  }

  private static normalizeOptionMapLike(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    raw: any
  ): OptionFilter | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const dependsOnRaw = (raw as any).dependsOn;
    if (dependsOnRaw === undefined || dependsOnRaw === null) return undefined;
    const dependsOn = Array.isArray(dependsOnRaw)
      ? dependsOnRaw.map(v => (v === undefined || v === null ? '' : v.toString().trim())).filter(Boolean)
      : dependsOnRaw.toString().trim();
    if (Array.isArray(dependsOn) && !dependsOn.length) return undefined;
    if (!Array.isArray(dependsOn) && !dependsOn) return undefined;

    const bypassValues = this.normalizeBypassValues((raw as any).bypassValues);
    const bypassConfig = bypassValues ? { bypassValues } : {};

    const optionMap = this.normalizeOptionMapRecord((raw as any).optionMap);
    if (optionMap) {
      return { ...(raw as any), dependsOn, optionMap, ...bypassConfig } as OptionFilter;
    }

    const refCfg = this.normalizeOptionMapRef((raw as any).optionMapRef);
    if (refCfg) {
      const resolved = this.buildOptionMapFromRef(ss, refCfg);
      if (!resolved) return undefined;
      return { ...(raw as any), dependsOn, optionMap: resolved, optionMapRef: refCfg, ...bypassConfig } as OptionFilter;
    }

    const dataSourceField = (raw as any).dataSourceField;
    if (typeof dataSourceField === 'string' && dataSourceField.trim()) {
      return { ...(raw as any), dependsOn, dataSourceField: dataSourceField.trim(), ...bypassConfig } as OptionFilter;
    }

    return undefined;
  }

  private static normalizeValueMapLike(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    raw: any
  ): ValueMapConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const dependsOnRaw = (raw as any).dependsOn;
    if (dependsOnRaw === undefined || dependsOnRaw === null) return undefined;
    const dependsOn = Array.isArray(dependsOnRaw)
      ? dependsOnRaw.map(v => (v === undefined || v === null ? '' : v.toString().trim())).filter(Boolean)
      : dependsOnRaw.toString().trim();
    if (Array.isArray(dependsOn) && !dependsOn.length) return undefined;
    if (!Array.isArray(dependsOn) && !dependsOn) return undefined;

    const optionMap = this.normalizeOptionMapRecord((raw as any).optionMap);
    if (optionMap) {
      return { dependsOn, optionMap };
    }

    const refCfg = this.normalizeOptionMapRef((raw as any).optionMapRef);
    if (refCfg) {
      const resolved = this.buildOptionMapFromRef(ss, refCfg);
      if (!resolved) return undefined;
      return { dependsOn, optionMap: resolved, optionMapRef: refCfg };
    }

    return undefined;
  }

  private static parseOptionFilter(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawConfig: string
  ): OptionFilter | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig));
      const candidate = parsed?.optionFilter;
      const normalized = this.normalizeOptionMapLike(ss, candidate);
      if (normalized) return normalized;
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
    if (!candidate || typeof candidate !== 'object') return undefined;
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
    const statusAllowRaw =
      candidate.statusAllowList !== undefined
        ? candidate.statusAllowList
        : candidate.allowedStatuses !== undefined
          ? candidate.allowedStatuses
          : candidate.allowedStatus !== undefined
            ? candidate.allowedStatus
            : candidate.statusAllowed !== undefined
              ? candidate.statusAllowed
              : undefined;
    if (statusAllowRaw !== undefined && statusAllowRaw !== null && statusAllowRaw !== '') {
      const rawList: any[] = Array.isArray(statusAllowRaw)
        ? statusAllowRaw
        : typeof statusAllowRaw === 'string'
          ? statusAllowRaw.split(',').map(s => s.trim())
          : [statusAllowRaw];
      const normalized = rawList
        .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
        .filter(Boolean);
      if (normalized.length) {
        config.statusAllowList = Array.from(new Set(normalized));
      }
    }
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

  private static parseValueMap(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    rawConfig?: string
  ): ValueMapConfig | undefined {
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(this.sanitizeJson(rawConfig || ''));
      const vm = parsed?.valueMap;
      const normalized = this.normalizeValueMapLike(ss, vm);
      if (normalized) return normalized;
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

  private static parseDefaultValue(rawConfig?: string): DefaultValue | undefined {
    const parsed = this.safeParseObject(rawConfig || '');
    if (!parsed) return undefined;
    const candidate =
      (parsed as any).defaultValue !== undefined
        ? (parsed as any).defaultValue
        : (parsed as any).default !== undefined
        ? (parsed as any).default
        : undefined;
    return this.normalizeDefaultValue(candidate);
  }

  private static parseButtonConfig(rawConfig?: string): ButtonConfig | undefined {
    const parsed = this.safeParseObject(rawConfig || '');
    if (!parsed) return undefined;
    const cfgRaw: any = (parsed as any).button;
    if (!cfgRaw || typeof cfgRaw !== 'object') return undefined;

    const action = (cfgRaw.action || 'renderDocTemplate').toString().trim();
    const allowedPlacements = new Set([
      'form',
      'formSummaryMenu',
      'summaryBar',
      'topBar',
      'topBarList',
      'topBarForm',
      'topBarSummary',
      'listBar'
    ]);
    const placementsRaw = Array.isArray(cfgRaw.placements) ? cfgRaw.placements : cfgRaw.placement ? [cfgRaw.placement] : [];
    const placements = placementsRaw
      .map((p: any) => (p === undefined || p === null ? '' : p.toString().trim()))
      .filter((p: string) => allowedPlacements.has(p));

    if (action === 'renderDocTemplate') {
      const templateId = cfgRaw.templateId ?? cfgRaw.template ?? cfgRaw.docTemplateId ?? cfgRaw.docId;
      if (!templateId) return undefined;

      const outputRaw = (cfgRaw.output || 'pdf').toString().trim().toLowerCase();
      const output = outputRaw === 'pdf' ? 'pdf' : undefined;

      const previewModeRaw = (cfgRaw.previewMode || cfgRaw.preview || 'pdf').toString().trim().toLowerCase();
      const previewMode = previewModeRaw === 'live' ? 'live' : 'pdf';

      const folderId =
        cfgRaw.folderId !== undefined && cfgRaw.folderId !== null ? cfgRaw.folderId.toString().trim() : undefined;
      const loadingLabel = cfgRaw.loadingLabel !== undefined ? cfgRaw.loadingLabel : undefined;

      const config: ButtonConfig = {
        action: 'renderDocTemplate',
        templateId: templateId as any,
        output: (output as any) || 'pdf',
        previewMode: previewMode as any
      } as any;
      if (placements.length) (config as any).placements = placements as any;
      if (folderId) (config as any).folderId = folderId;
      if (loadingLabel) (config as any).loadingLabel = loadingLabel as any;
      return config;
    }

    if (action === 'renderMarkdownTemplate') {
      const templateId =
        cfgRaw.templateId ??
        cfgRaw.template ??
        cfgRaw.markdownTemplateId ??
        cfgRaw.markdownId ??
        cfgRaw.mdTemplateId ??
        cfgRaw.mdId;
      if (!templateId) return undefined;
      const config: ButtonConfig = {
        action: 'renderMarkdownTemplate',
        templateId: templateId as any
      } as any;
      if (placements.length) (config as any).placements = placements as any;
      return config;
    }

    if (action === 'renderHtmlTemplate') {
      const templateId =
        cfgRaw.templateId ??
        cfgRaw.template ??
        cfgRaw.htmlTemplateId ??
        cfgRaw.htmlId ??
        cfgRaw.templateHtmlId ??
        cfgRaw.templateHtml ??
        cfgRaw.templateIdHtml;
      if (!templateId) return undefined;
      const config: ButtonConfig = {
        action: 'renderHtmlTemplate',
        templateId: templateId as any
      } as any;
      if (placements.length) (config as any).placements = placements as any;
      return config;
    }

    if (action === 'createRecordPreset') {
      const presetRaw = cfgRaw.presetValues ?? cfgRaw.preset ?? cfgRaw.values ?? cfgRaw.defaults;
      if (!presetRaw || typeof presetRaw !== 'object') return undefined;
      const presetValues: Record<string, any> = {};
      Object.keys(presetRaw).forEach(key => {
        const id = (key || '').toString().trim();
        if (!id) return;
        const val = (presetRaw as any)[key];
        if (val === undefined || val === null) return;
        const normalized = this.normalizeDefaultValue(val);
        if (normalized === undefined) return;
        presetValues[id] = normalized;
      });
      if (!Object.keys(presetValues).length) return undefined;

      const config: ButtonConfig = { action: 'createRecordPreset', presetValues } as any;
      if (placements.length) (config as any).placements = placements as any;
      return config;
    }

    if (action === 'listViewSearchPreset') {
      const modeRaw = cfgRaw.mode !== undefined && cfgRaw.mode !== null ? cfgRaw.mode.toString().trim().toLowerCase() : '';
      const mode = modeRaw === 'date' || modeRaw === 'advanced' || modeRaw === 'text' ? modeRaw : undefined;
      const keyword =
        cfgRaw.keyword !== undefined && cfgRaw.keyword !== null ? cfgRaw.keyword.toString() : undefined;
      const dateValue =
        cfgRaw.dateValue !== undefined && cfgRaw.dateValue !== null ? cfgRaw.dateValue.toString() : undefined;
      const fieldFiltersRaw = cfgRaw.fieldFilters;
      let fieldFilters: Record<string, string | string[]> | undefined;
      if (fieldFiltersRaw && typeof fieldFiltersRaw === 'object' && !Array.isArray(fieldFiltersRaw)) {
        fieldFilters = {};
        Object.keys(fieldFiltersRaw).forEach(key => {
          const id = (key || '').toString().trim();
          if (!id) return;
          const value = (fieldFiltersRaw as any)[key];
          if (Array.isArray(value)) {
            const normalized = value
              .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
              .filter(Boolean);
            if (normalized.length) fieldFilters![id] = normalized;
            return;
          }
          if (value === undefined || value === null) return;
          const normalized = value.toString().trim();
          if (!normalized) return;
          fieldFilters![id] = normalized;
        });
        if (!Object.keys(fieldFilters).length) fieldFilters = undefined;
      }

      const config: ButtonConfig = { action: 'listViewSearchPreset' } as any;
      if (mode) (config as any).mode = mode;
      if (keyword !== undefined) (config as any).keyword = keyword;
      if (dateValue !== undefined) (config as any).dateValue = dateValue;
      if (fieldFilters) (config as any).fieldFilters = fieldFilters;
      return config;
    }

    if (action === 'updateRecord') {
      const setRaw = cfgRaw.set ?? cfgRaw.patch ?? cfgRaw.update ?? cfgRaw.changes;
      if (!setRaw || typeof setRaw !== 'object') return undefined;
      const outSet: any = {};
      if (Object.prototype.hasOwnProperty.call(setRaw, 'status')) {
        const s = (setRaw as any).status;
        outSet.status = s === undefined ? undefined : s === null ? null : s.toString();
      }
      const valuesRaw = (setRaw as any).values;
      if (valuesRaw && typeof valuesRaw === 'object') {
        const values: Record<string, any> = {};
        Object.keys(valuesRaw).forEach(key => {
          const id = (key || '').toString().trim();
          if (!id) return;
          const val = (valuesRaw as any)[key];
          if (val === undefined) return;
          if (val === null) {
            values[id] = null;
            return;
          }
          const normalized = this.normalizeDefaultValue(val);
          if (normalized === undefined) return;
          values[id] = normalized;
        });
        if (Object.keys(values).length) outSet.values = values;
      }
      const hasStatus = Object.prototype.hasOwnProperty.call(outSet, 'status') && outSet.status !== undefined;
      const hasValues = !!outSet.values && Object.keys(outSet.values || {}).length > 0;
      if (!hasStatus && !hasValues) return undefined;

      const navigateToRaw = (cfgRaw.navigateTo ?? cfgRaw.targetView ?? cfgRaw.openView ?? 'auto').toString().trim().toLowerCase();
      const navigateTo =
        navigateToRaw === 'form' || navigateToRaw === 'summary' || navigateToRaw === 'list' || navigateToRaw === 'auto'
          ? navigateToRaw
          : undefined;
      const confirmRaw = cfgRaw.confirm ?? cfgRaw.confirmation;
      const confirm = confirmRaw && typeof confirmRaw === 'object' ? confirmRaw : undefined;

      const config: ButtonConfig = { action: 'updateRecord', set: outSet } as any;
      if (navigateTo) (config as any).navigateTo = navigateTo;
      if (confirm) (config as any).confirm = confirm;
      if (placements.length) (config as any).placements = placements as any;
      return config;
    }

    if (action === 'openUrlField') {
      const fieldId =
        cfgRaw.fieldId ??
        cfgRaw.urlFieldId ??
        cfgRaw.urlField ??
        cfgRaw.hrefFieldId ??
        cfgRaw.hrefField;
      const resolved = fieldId !== undefined && fieldId !== null ? fieldId.toString().trim() : '';
      if (!resolved) return undefined;
      const config: ButtonConfig = { action: 'openUrlField', fieldId: resolved } as any;
      if (placements.length) (config as any).placements = placements as any;
      return config;
    }

    return undefined;
  }

  private static normalizeDefaultValue(raw: any): DefaultValue | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (Array.isArray(raw)) {
      const items = raw
        .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
        .filter(Boolean);
      return items;
    }
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return raw.toString().trim();
    try {
      const s = raw.toString();
      return s ? s.toString().trim() : undefined;
    } catch (_) {
      return undefined;
    }
  }

  private static normalizeSelectionEffectValue(raw: any): PresetValue | null | undefined {
    if (raw === null) return null;
    return this.normalizeDefaultValue(raw) as PresetValue | undefined;
  }

  private static normalizeSelectionEffects(rawEffects: any): SelectionEffect[] | undefined {
    if (!Array.isArray(rawEffects)) return undefined;
    const effects: SelectionEffect[] = [];
    rawEffects.forEach((effect: any) => {
      if (!effect) return;
      const type = (effect.type || 'addLineItems').toString();
      if (type !== 'addLineItems' && type !== 'addLineItemsFromDataSource' && type !== 'deleteLineItems' && type !== 'setValue') {
        return;
      }
      const normalized: SelectionEffect = {
        type: type as SelectionEffect['type']
      };
      if (effect.groupId !== undefined && effect.groupId !== null) {
        const groupId = effect.groupId.toString().trim();
        if (groupId) normalized.groupId = groupId;
      }
      if (type !== 'setValue' && !normalized.groupId) return;
      {
        const targetPathRaw =
          effect.targetPath !== undefined
            ? effect.targetPath
            : effect.targetGroupPath !== undefined
              ? effect.targetGroupPath
              : effect.groupPath !== undefined
                ? effect.groupPath
                : undefined;
        if (Array.isArray(targetPathRaw)) {
          const path = targetPathRaw
            .map((entry: any) => (entry !== undefined && entry !== null ? entry.toString().trim() : ''))
            .filter(Boolean);
          if (path.length) normalized.targetPath = path;
        } else if (targetPathRaw !== undefined && targetPathRaw !== null) {
          const path = targetPathRaw.toString().trim();
          if (path) normalized.targetPath = path;
        }
      }
      {
        const idCandidate =
          effect.id !== undefined
            ? effect.id
            : effect.effectId !== undefined
              ? effect.effectId
              : effect.key !== undefined
                ? effect.key
                : undefined;
        if (idCandidate !== undefined && idCandidate !== null) {
          const id = idCandidate.toString().trim();
          if (id) normalized.id = id;
        }
      }
      if (Array.isArray(effect.triggerValues)) {
        const triggers = effect.triggerValues
          .map((val: any) => (val !== undefined && val !== null ? val.toString() : ''))
          .filter(Boolean);
        if (triggers.length) normalized.triggerValues = triggers;
      }
      {
        const whenRaw = effect.when ?? effect.condition ?? effect.whenClause;
        const normalizedWhen = this.normalizeWhenClause(whenRaw);
        if (normalizedWhen) normalized.when = normalizedWhen;
      }
      if (effect.hideRemoveButton !== undefined) {
        normalized.hideRemoveButton = Boolean(effect.hideRemoveButton);
      }
      if (type === 'setValue') {
        const fieldIdCandidate = effect.fieldId ?? effect.targetFieldId ?? effect.fieldRef;
        const fieldId = fieldIdCandidate !== undefined && fieldIdCandidate !== null ? fieldIdCandidate.toString().trim() : '';
        if (!fieldId) return;
        normalized.fieldId = fieldId;
        if (Object.prototype.hasOwnProperty.call(effect, 'value')) {
          const value = this.normalizeSelectionEffectValue(effect.value);
          if (value !== undefined || effect.value === null) {
            normalized.value = value as PresetValue | null;
          }
        }
      }
      {
        const targetCandidate =
          effect.targetEffectId !== undefined
            ? effect.targetEffectId
            : effect.deleteEffectId !== undefined
              ? effect.deleteEffectId
              : effect.removeEffectId !== undefined
                ? effect.removeEffectId
                : undefined;
        if (targetCandidate !== undefined && targetCandidate !== null) {
          const target = targetCandidate.toString().trim();
          if (target) normalized.targetEffectId = target;
        }
      }
      if (effect.preset && typeof effect.preset === 'object') {
        const preset: Record<string, any> = {};
        Object.keys(effect.preset).forEach(key => {
          const val = effect.preset[key];
          if (val === undefined || val === null) return;
          if (typeof val === 'number') {
            preset[key.toString()] = val;
            return;
          }
          if (typeof val === 'boolean') {
            preset[key.toString()] = val;
            return;
          }
          if (Array.isArray(val)) {
            preset[key.toString()] = val
              .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
              .filter(Boolean);
            return;
          }
          preset[key.toString()] = val.toString();
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

  private static normalizeWhenClause(raw: any): WhenClause | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw)) {
      const list = raw.map(entry => this.normalizeWhenClause(entry)).filter(Boolean) as WhenClause[];
      if (!list.length) return undefined;
      if (list.length === 1) return list[0];
      return { all: list };
    }
    if (typeof raw !== 'object') return undefined;

    const allRaw = (raw as any).all ?? (raw as any).and;
    if (Array.isArray(allRaw)) {
      const list = allRaw.map((entry: any) => this.normalizeWhenClause(entry)).filter(Boolean) as WhenClause[];
      if (!list.length) return undefined;
      if (list.length === 1) return list[0];
      return { all: list };
    }
    const anyRaw = (raw as any).any ?? (raw as any).or;
    if (Array.isArray(anyRaw)) {
      const list = anyRaw.map((entry: any) => this.normalizeWhenClause(entry)).filter(Boolean) as WhenClause[];
      if (!list.length) return undefined;
      if (list.length === 1) return list[0];
      return { any: list };
    }
    if (Object.prototype.hasOwnProperty.call(raw as any, 'not')) {
      const nested = this.normalizeWhenClause((raw as any).not);
      return nested ? { not: nested } : undefined;
    }

    const lineItemsRaw = (raw as any).lineItems ?? (raw as any).lineItem;
    if (lineItemsRaw && typeof lineItemsRaw === 'object') {
      const groupIdRaw =
        (lineItemsRaw as any).groupId ??
        (lineItemsRaw as any).group ??
        (lineItemsRaw as any).lineGroupId ??
        (lineItemsRaw as any).lineGroup;
      const groupId = groupIdRaw !== undefined && groupIdRaw !== null ? groupIdRaw.toString().trim() : '';
      if (!groupId) return undefined;

      const subGroupRaw = (lineItemsRaw as any).subGroupId ?? (lineItemsRaw as any).subGroup;
      const subGroupId = subGroupRaw !== undefined && subGroupRaw !== null ? subGroupRaw.toString().trim() : '';
      const subGroupPathRaw = (lineItemsRaw as any).subGroupPath ?? (lineItemsRaw as any).subGroupPathIds;
      const subGroupPath =
        Array.isArray(subGroupPathRaw)
          ? subGroupPathRaw.map((entry: any) => (entry !== undefined && entry !== null ? entry.toString().trim() : '')).filter(Boolean)
          : subGroupPathRaw !== undefined && subGroupPathRaw !== null
            ? subGroupPathRaw.toString().trim()
            : '';

      const whenRaw = (lineItemsRaw as any).when;
      const when = this.normalizeWhenClause(whenRaw);

      const parentWhenRaw =
        (lineItemsRaw as any).parentWhen ??
        (lineItemsRaw as any).parent ??
        (lineItemsRaw as any).parentRowWhen;
      const parentWhen = this.normalizeWhenClause(parentWhenRaw);

      const matchRaw = (lineItemsRaw as any).match ?? (lineItemsRaw as any).mode;
      const matchStr = typeof matchRaw === 'string' ? matchRaw.trim().toLowerCase() : '';
      const match = matchStr === 'all' || matchStr === 'any' ? (matchStr as 'all' | 'any') : undefined;

      const parentMatchRaw = (lineItemsRaw as any).parentMatch ?? (lineItemsRaw as any).parentMode;
      const parentMatchStr = typeof parentMatchRaw === 'string' ? parentMatchRaw.trim().toLowerCase() : '';
      const parentMatch =
        parentMatchStr === 'all' || parentMatchStr === 'any' ? (parentMatchStr as 'all' | 'any') : undefined;

      const parentScopeRaw = (lineItemsRaw as any).parentScope ?? (lineItemsRaw as any).parentDepth;
      const parentScopeStr = typeof parentScopeRaw === 'string' ? parentScopeRaw.trim().toLowerCase() : '';
      const parentScope =
        parentScopeStr === 'immediate' || parentScopeStr === 'ancestor'
          ? (parentScopeStr as 'immediate' | 'ancestor')
          : undefined;

      const cfg: any = { groupId };
      if (subGroupId) cfg.subGroupId = subGroupId;
      if (subGroupPath) cfg.subGroupPath = subGroupPath;
      if (when) cfg.when = when;
      if (parentWhen) cfg.parentWhen = parentWhen;
      if (match) cfg.match = match;
      if (parentMatch) cfg.parentMatch = parentMatch;
      if (parentScope) cfg.parentScope = parentScope;
      return { lineItems: cfg } as any;
    }

    const fieldIdRaw = (raw as any).fieldId ?? (raw as any).field ?? (raw as any).id;
    if (!fieldIdRaw) return undefined;
    const fieldId = fieldIdRaw.toString();
    const condition: VisibilityCondition = { fieldId };
    if ((raw as any).equals !== undefined) condition.equals = (raw as any).equals;
    if ((raw as any).notEquals !== undefined) condition.notEquals = (raw as any).notEquals;
    if ((raw as any).greaterThan !== undefined) condition.greaterThan = (raw as any).greaterThan;
    if ((raw as any).lessThan !== undefined) condition.lessThan = (raw as any).lessThan;
    if ((raw as any).notEmpty !== undefined) condition.notEmpty = Boolean((raw as any).notEmpty);
    if ((raw as any).isEmpty !== undefined) condition.isEmpty = Boolean((raw as any).isEmpty);
    if ((raw as any).isToday !== undefined) condition.isToday = Boolean((raw as any).isToday);
    if ((raw as any).isInPast !== undefined) condition.isInPast = Boolean((raw as any).isInPast);
    if ((raw as any).isInFuture !== undefined) condition.isInFuture = Boolean((raw as any).isInFuture);
    return condition;
  }

  private static normalizeVisibility(raw: any): VisibilityConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const showWhen = this.normalizeWhenClause(raw.showWhen || raw.show || raw.visibleWhen);
    const hideWhen = this.normalizeWhenClause(raw.hideWhen || raw.hide || raw.hiddenWhen);
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

  private static parseChangeDialog(rawConfig: string): FieldChangeDialogConfig | undefined {
    const parsed = this.safeParseObject(rawConfig);
    if (!parsed) return undefined;
    const cfgRaw = (parsed as any).changeDialog;
    if (!cfgRaw || typeof cfgRaw !== 'object') return undefined;
    return this.normalizeChangeDialog(cfgRaw);
  }

  private static parseChangeDialogFromAny(rawConfigs: Array<string | undefined>): FieldChangeDialogConfig | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const cfg = this.parseChangeDialog(raw);
      if (cfg) return cfg;
    }
    return undefined;
  }

  private static normalizeChangeDialogTarget(raw: any): { scope: 'top' | 'row' | 'parent' | 'effect'; fieldId: string; effectId?: string } | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const scopeRaw = raw.scope ?? raw.targetScope;
    const scope = typeof scopeRaw === 'string' ? scopeRaw.trim().toLowerCase() : '';
    if (scope !== 'top' && scope !== 'row' && scope !== 'parent' && scope !== 'effect') return undefined;
    const fieldIdRaw = raw.fieldId ?? raw.field ?? raw.id;
    if (fieldIdRaw === undefined || fieldIdRaw === null) return undefined;
    const fieldId = fieldIdRaw.toString().trim();
    if (!fieldId) return undefined;
    const effectIdRaw = raw.effectId ?? raw.effect ?? raw.selectionEffectId;
    const effectId = effectIdRaw !== undefined && effectIdRaw !== null ? effectIdRaw.toString().trim() : undefined;
    return {
      scope: scope as 'top' | 'row' | 'parent' | 'effect',
      fieldId,
      effectId: effectId || undefined
    };
  }

  private static normalizeChangeDialog(raw: any): FieldChangeDialogConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const when = this.normalizeWhenClause(raw.when);
    if (!when) return undefined;
    const cfg: FieldChangeDialogConfig = { when };
    if (raw.title !== undefined) cfg.title = raw.title as any;
    if (raw.message !== undefined) cfg.message = raw.message as any;
    if (raw.confirmLabel !== undefined) cfg.confirmLabel = raw.confirmLabel as any;
    if (raw.cancelLabel !== undefined) cfg.cancelLabel = raw.cancelLabel as any;
    const dedupModeRaw = raw.dedupMode;
    if (typeof dedupModeRaw === 'string') {
      const mode = dedupModeRaw.trim().toLowerCase();
      if (mode === 'auto' || mode === 'always' || mode === 'never') {
        cfg.dedupMode = mode as FieldChangeDialogConfig['dedupMode'];
      }
    }
    const cancelActionRaw = raw.cancelAction ?? raw.onCancel;
    if (typeof cancelActionRaw === 'string') {
      const action = cancelActionRaw.trim();
      const normalized = action.toLowerCase();
      if (normalized === 'none') {
        cfg.cancelAction = 'none';
      } else if (
        normalized === 'discarddraftandgohome' ||
        normalized === 'discard_draft_and_go_home' ||
        normalized === 'discard-draft-and-go-home'
      ) {
        cfg.cancelAction = 'discardDraftAndGoHome';
      }
    }
    if (Array.isArray(raw.inputs)) {
      const inputs = raw.inputs.map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null;
        const idRaw = entry.id ?? entry.key;
        if (idRaw === undefined || idRaw === null) return null;
        const id = idRaw.toString().trim();
        if (!id) return null;
        const target = this.normalizeChangeDialogTarget(entry.target ?? entry.applyTo ?? entry.targetField);
        if (!target) return null;
        const typeRaw = entry.type !== undefined && entry.type !== null ? entry.type.toString().trim().toUpperCase() : '';
        const type =
          typeRaw === 'TEXT' ||
          typeRaw === 'PARAGRAPH' ||
          typeRaw === 'NUMBER' ||
          typeRaw === 'CHOICE' ||
          typeRaw === 'CHECKBOX' ||
          typeRaw === 'DATE'
            ? (typeRaw as any)
            : undefined;
        const input: any = {
          id,
          target
        };
        if (entry.label !== undefined) input.label = entry.label;
        if (entry.placeholder !== undefined) input.placeholder = entry.placeholder;
        if (type) input.type = type;
        if (entry.required !== undefined) input.required = !!entry.required;
        return input;
      }).filter(Boolean) as FieldChangeDialogConfig['inputs'];
      if (inputs && inputs.length) cfg.inputs = inputs;
    }
    return cfg;
  }

  private static normalizeClearOnChange(raw: any): QuestionConfig['clearOnChange'] | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw !== 'object') return undefined;

    const cfg: any = {};
    if (raw.enabled !== undefined || raw.isEnabled !== undefined || raw.on !== undefined) {
      cfg.enabled = Boolean(raw.enabled ?? raw.isEnabled ?? raw.on);
    }
    const modeRaw = (raw.mode ?? raw.strategy ?? raw.scope ?? '').toString().trim().toLowerCase();
    if (modeRaw === 'full' || modeRaw === 'all') cfg.mode = 'full';
    if (modeRaw === 'ordered' || modeRaw === 'after' || modeRaw === 'afterself') cfg.mode = 'ordered';

    const bypassRaw =
      raw.bypassFields ?? raw.bypass ?? raw.keepFields ?? raw.keep ?? raw.excludeFromClear ?? raw.exclude;
    const bypassFields: string[] =
      Array.isArray(bypassRaw)
        ? bypassRaw
            .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
            .filter(Boolean)
        : typeof bypassRaw === 'string'
          ? bypassRaw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];
    if (bypassFields.length) cfg.bypassFields = Array.from(new Set(bypassFields));

    if (!Object.keys(cfg).length) {
      return { enabled: true } as QuestionConfig['clearOnChange'];
    }
    return cfg as QuestionConfig['clearOnChange'];
  }

  private static parseClearOnChange(rawConfigs: Array<string | undefined>): QuestionConfig['clearOnChange'] | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (parsed && parsed.clearOnChange !== undefined) {
        return this.normalizeClearOnChange(parsed.clearOnChange);
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

  private static parseRequiredMessage(rawConfigs: Array<string | undefined>): LocalizedString | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const candidate =
        (parsed as any).requiredMessage ??
        (parsed as any).required_message ??
        (parsed as any).requiredErrorMessage ??
        (parsed as any).required_error_message;
      if (candidate === undefined || candidate === null) continue;
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        return trimmed ? trimmed : undefined;
      }
      if (typeof candidate === 'object') {
        // LocalizedString shape; pass through.
        return candidate as LocalizedString;
      }
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

    const pageSectionRaw =
      raw.pageSection !== undefined
        ? raw.pageSection
        : raw.page_section !== undefined
          ? raw.page_section
          : raw.pageSectionConfig !== undefined
            ? raw.pageSectionConfig
            : raw.page_section_config !== undefined
              ? raw.page_section_config
              : undefined;
    const pageSection = this.normalizePageSection(pageSectionRaw);
    if (pageSection) cfg.pageSection = pageSection;

    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static normalizePageSection(raw: any): PageSectionConfig | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const title = raw.toString().trim();
      return title ? { title } : undefined;
    }
    if (typeof raw !== 'object') return undefined;

    const cfg: Partial<PageSectionConfig> = {};
    if (raw.id !== undefined && raw.id !== null) {
      const id = raw.id.toString().trim();
      if (id) cfg.id = id;
    }

    const titleRaw = raw.title !== undefined ? raw.title : raw.label !== undefined ? raw.label : raw.name;
    if (titleRaw !== undefined && titleRaw !== null) cfg.title = titleRaw as any;

    const infoRaw =
      raw.infoText !== undefined
        ? raw.infoText
        : raw.info_text !== undefined
          ? raw.info_text
          : raw.info !== undefined
            ? raw.info
            : raw.note !== undefined
              ? raw.note
              : raw.text !== undefined
                ? raw.text
                : raw.help !== undefined
                  ? raw.help
                  : undefined;
    if (infoRaw !== undefined && infoRaw !== null) cfg.infoText = infoRaw as any;

    const infoDisplayRaw =
      raw.infoDisplay !== undefined
        ? raw.infoDisplay
        : raw.info_display !== undefined
          ? raw.info_display
          : raw.infoMode !== undefined
            ? raw.infoMode
            : raw.info_mode !== undefined
              ? raw.info_mode
              : undefined;
    if (infoDisplayRaw !== undefined && infoDisplayRaw !== null) {
      const mode = infoDisplayRaw.toString().trim().toLowerCase();
      if (mode === 'pill') cfg.infoDisplay = 'pill';
      if (mode === 'belowtitle' || mode === 'below_title' || mode === 'title') cfg.infoDisplay = 'belowTitle';
      if (mode === 'hidden' || mode === 'none' || mode === 'off') cfg.infoDisplay = 'hidden';
    }

    // Require a title for page sections; otherwise skip (avoid emitting invalid config).
    if (cfg.title === undefined || cfg.title === null) return undefined;
    if (typeof cfg.title === 'string' && !cfg.title.toString().trim()) return undefined;

    return cfg as PageSectionConfig;
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

  private static normalizeBoolean(input: any): boolean | undefined {
    if (input === undefined || input === null) return undefined;
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input !== 0;
    const s = input.toString().trim().toLowerCase();
    if (!s) return undefined;
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off') return false;
    return undefined;
  }

  private static parseReadOnly(rawConfigs: Array<string | undefined>): boolean | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const obj: any = parsed as any;
      const direct =
        obj.readOnly !== undefined
          ? obj.readOnly
          : obj.readonly !== undefined
            ? obj.readonly
            : obj.locked !== undefined
              ? obj.locked
              : obj.disableEdit !== undefined
                ? obj.disableEdit
                : obj.disabled !== undefined
                  ? obj.disabled
                  : undefined;
      const nestedUi = obj.ui && typeof obj.ui === 'object' ? (obj.ui.readOnly ?? obj.ui.readonly) : undefined;
      const normalized = this.normalizeBoolean(direct !== undefined ? direct : nestedUi);
      if (normalized !== undefined) return normalized;
    }
    return undefined;
  }

  private static normalizeOptionSortMode(raw: any, preserveOrderRaw?: any): OptionSortMode | undefined {
    const s = raw !== undefined && raw !== null ? raw.toString().trim().toLowerCase() : '';
    if (s === 'source' || s === 'original' || s === 'config' || s === 'preserve' || s === 'none') return 'source';
    if (s === 'alphabetical' || s === 'alpha' || s === 'label') return 'alphabetical';
    const preserve = this.normalizeBoolean(preserveOrderRaw);
    if (preserve === true) return 'source';
    if (preserve === false) return 'alphabetical';
    return undefined;
  }

  private static parseOptionSort(rawConfigs: Array<string | undefined>): OptionSortMode | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const obj: any = parsed as any;
      const sortRaw =
        obj.optionSort !== undefined
          ? obj.optionSort
          : obj.optionsSort !== undefined
            ? obj.optionsSort
            : obj.optionSorting !== undefined
              ? obj.optionSorting
              : obj.optionsSorting !== undefined
                ? obj.optionsSorting
                : undefined;
      const preserveRaw =
        obj.preserveOptionOrder !== undefined
          ? obj.preserveOptionOrder
          : obj.keepOptionOrder !== undefined
            ? obj.keepOptionOrder
            : obj.disableOptionSorting !== undefined
              ? obj.disableOptionSorting
              : undefined;
      const normalized = this.normalizeOptionSortMode(sortRaw, preserveRaw);
      if (normalized) return normalized;
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

  private static normalizeSummaryVisibility(raw: any): QuestionUiConfig['summaryVisibility'] | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (raw === true) return 'always';
    if (raw === false) return undefined;
    const candidate = raw.toString().trim().toLowerCase();
    switch (candidate) {
      case 'always':
      case 'show':
      case 'visible':
        return 'always';
      case 'never':
      case 'hide':
      case 'hidden':
        return 'never';
      case 'inherit':
      case 'auto':
        return undefined;
      default:
        return undefined;
    }
  }

  private static normalizeParagraphRows(raw: any): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return undefined;
    // Clamp to a reasonable range for mobile layouts.
    const clamped = Math.max(2, Math.min(20, Math.round(n)));
    return clamped;
  }

  private static normalizeQuestionUi(rawUi: any): QuestionUiConfig | undefined {
    if (!rawUi || typeof rawUi !== 'object') return undefined;
    const control = this.normalizeChoiceControl(rawUi.control || rawUi.choiceControl || rawUi.choice);
    const labelLayout = this.normalizeLabelLayout(
      rawUi.labelLayout ?? rawUi.label_layout ?? rawUi.stackedLabel ?? rawUi.stackLabel ?? rawUi.stacked
    );
    const summaryVisibility = this.normalizeSummaryVisibility(rawUi.summaryVisibility ?? rawUi.summary_visibility);

    const helperTextRaw =
      rawUi.helperText ??
      rawUi.helper_text ??
      rawUi.helper ??
      rawUi.helpText ??
      rawUi.help_text ??
      rawUi.supportingText ??
      rawUi.supporting_text ??
      rawUi.hint;
    const normalizeUiLocalized = (args: {
      rawValue: any;
      enOverride?: any;
      frOverride?: any;
      nlOverride?: any;
    }): QuestionUiConfig['helperText'] => {
      const rawObj = args.rawValue && typeof args.rawValue === 'object' ? args.rawValue : null;
      const rawStr = typeof args.rawValue === 'string' ? args.rawValue : '';
      const hasLangOverrides = !!(args.enOverride || args.frOverride || args.nlOverride);
      const en = args.enOverride || (rawObj && (rawObj as any).en) || rawStr || '';
      const fr = args.frOverride || (rawObj && (rawObj as any).fr) || '';
      const nl = args.nlOverride || (rawObj && (rawObj as any).nl) || '';
      return rawObj ||
        (hasLangOverrides
          ? ({
              en: en || undefined,
              fr: fr || undefined,
              nl: nl || undefined
            } as any)
          : rawStr
            ? (rawStr as any)
            : undefined);
    };

    const helperText = normalizeUiLocalized({
      rawValue: helperTextRaw,
      enOverride: rawUi.helperTextEn,
      frOverride: rawUi.helperTextFr,
      nlOverride: rawUi.helperTextNl
    });

    const helperByPlacement =
      rawUi.helperTextByPlacement && typeof rawUi.helperTextByPlacement === 'object' ? rawUi.helperTextByPlacement : undefined;
    const helperTextBelowLabel = normalizeUiLocalized({
      rawValue:
        rawUi.helperTextBelowLabel ??
        rawUi.helperTextBelow ??
        rawUi.belowLabelHelperText ??
        helperByPlacement?.belowLabel ??
        helperByPlacement?.below_label ??
        helperByPlacement?.below,
      enOverride: rawUi.helperTextBelowLabelEn ?? rawUi.helperTextBelowEn,
      frOverride: rawUi.helperTextBelowLabelFr ?? rawUi.helperTextBelowFr,
      nlOverride: rawUi.helperTextBelowLabelNl ?? rawUi.helperTextBelowNl
    });
    const helperTextPlaceholder = normalizeUiLocalized({
      rawValue:
        rawUi.helperTextPlaceholder ??
        rawUi.helperPlaceholder ??
        rawUi.placeholderHelperText ??
        helperByPlacement?.placeholder ??
        helperByPlacement?.inside,
      enOverride: rawUi.helperTextPlaceholderEn ?? rawUi.helperPlaceholderEn,
      frOverride: rawUi.helperTextPlaceholderFr ?? rawUi.helperPlaceholderFr,
      nlOverride: rawUi.helperTextPlaceholderNl ?? rawUi.helperPlaceholderNl
    });

    const normalizeHelperPlacement = (raw: any): QuestionUiConfig['helperPlacement'] | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const candidate = raw.toString().trim().toLowerCase();
      switch (candidate) {
        case 'belowlabel':
        case 'below_label':
        case 'below label':
        case 'underlabel':
        case 'under_label':
        case 'under label':
        case 'label':
        case 'below':
        case 'under':
          return 'belowLabel';
        case 'placeholder':
        case 'input':
        case 'inputcontrol':
        case 'input_control':
        case 'input control':
        case 'inside':
        case 'insideinput':
        case 'inside_input':
        case 'inside input':
        case 'control':
          return 'placeholder';
        default:
          return undefined;
      }
    };
    const helperPlacement = normalizeHelperPlacement(
      rawUi.helperPlacement ??
        rawUi.helperPlacementMode ??
        rawUi.helperPlacementLocation ??
        rawUi.helper_placement ??
        rawUi.helperPosition ??
        rawUi.helper_position ??
        rawUi.helperLocation ??
        rawUi.helper_location
    );

    const normalizeBool = (v: any): boolean | undefined => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      const s = v.toString().trim().toLowerCase();
      if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'on') return true;
      if (s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'off' || s === '') return false;
      return undefined;
    };
    const hideLabel = normalizeBool(rawUi.hideLabel ?? rawUi.hide_label ?? rawUi.noLabel ?? rawUi.no_label ?? rawUi.removeLabel);
    const summaryHideLabel = normalizeBool(
      rawUi.summaryHideLabel ??
        rawUi.summary_hide_label ??
        rawUi.hideSummaryLabel ??
        rawUi.hide_summary_label ??
        rawUi.summaryNoLabel ??
        rawUi.summary_no_label ??
        rawUi.noSummaryLabel ??
        rawUi.no_summary_label
    );
    const paragraphRows = this.normalizeParagraphRows(rawUi.paragraphRows ?? rawUi.paragraph_rows ?? rawUi.textareaRows ?? rawUi.textarea_rows);
    const paragraphDisclaimer = this.normalizeParagraphDisclaimer(
      rawUi.paragraphDisclaimer ??
        rawUi.paragraph_disclaimer ??
        rawUi.paragraphDisclaimerConfig ??
        rawUi.paragraph_disclaimer_config
    );
    const overlayOpenActionsRaw =
      rawUi.overlayOpenActions ??
      rawUi.overlayOpenAction ??
      rawUi.overlayOpen ??
      rawUi.overlayActions ??
      rawUi.overlayAction;
    const overlayOpenActions = Array.isArray(overlayOpenActionsRaw)
      ? overlayOpenActionsRaw
      : overlayOpenActionsRaw
        ? [overlayOpenActionsRaw]
        : undefined;
    const choiceSearchEnabled = normalizeBool(
      rawUi.choiceSearchEnabled ??
        rawUi.choiceSearch ??
        rawUi.selectSearchEnabled ??
        rawUi.searchEnabled ??
        rawUi.searchable
    );
    const nonMatchWarningModeRaw =
      rawUi.nonMatchWarningMode ??
      rawUi.nonMatchWarnings ??
      rawUi.optionFilterWarningMode ??
      rawUi.optionFilterWarnings;
    const nonMatchWarningModeCandidate =
      nonMatchWarningModeRaw !== undefined && nonMatchWarningModeRaw !== null
        ? nonMatchWarningModeRaw.toString().trim().toLowerCase()
        : '';
    const nonMatchWarningMode: LineItemGroupUiConfig['nonMatchWarningMode'] =
      nonMatchWarningModeCandidate === 'validation' ||
      nonMatchWarningModeCandidate === 'rules' ||
      nonMatchWarningModeCandidate === 'rule' ||
      nonMatchWarningModeCandidate === 'generic'
        ? 'validation'
        : nonMatchWarningModeCandidate === 'both' || nonMatchWarningModeCandidate === 'all'
          ? 'both'
          : nonMatchWarningModeCandidate
              ? 'descriptive'
              : undefined;
    const cfg: QuestionUiConfig = {};
    if (control) cfg.control = control;
    if (labelLayout && labelLayout !== 'auto') cfg.labelLayout = labelLayout;
    if (helperText !== undefined) (cfg as any).helperText = helperText;
    if (helperTextBelowLabel !== undefined) (cfg as any).helperTextBelowLabel = helperTextBelowLabel;
    if (helperTextPlaceholder !== undefined) (cfg as any).helperTextPlaceholder = helperTextPlaceholder;
    if (helperPlacement !== undefined) (cfg as any).helperPlacement = helperPlacement;
    if (hideLabel === true) cfg.hideLabel = true;
    if (summaryHideLabel !== undefined) cfg.summaryHideLabel = summaryHideLabel;
    if (summaryVisibility) cfg.summaryVisibility = summaryVisibility;
    if (paragraphRows) (cfg as any).paragraphRows = paragraphRows;
    if (paragraphDisclaimer) (cfg as any).paragraphDisclaimer = paragraphDisclaimer;
    if (choiceSearchEnabled !== undefined) (cfg as any).choiceSearchEnabled = choiceSearchEnabled;
    if (overlayOpenActions && overlayOpenActions.length) (cfg as any).overlayOpenActions = overlayOpenActions;
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private static parseQuestionUi(rawConfigs: Array<string | undefined>): QuestionUiConfig | undefined {
    for (const raw of rawConfigs) {
      if (!raw) continue;
      const parsed = this.safeParseObject(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      // Support UI keys both nested under `ui/view/layout` and at the top-level for convenience.
      // (e.g., `{ "summaryVisibility": "always" }` instead of `{ "ui": { "summaryVisibility": "always" } }`)
      const ui = this.normalizeQuestionUi((parsed as any).ui || (parsed as any).view || (parsed as any).layout || parsed);
      if (ui) return ui;
    }
    return undefined;
  }

  private static normalizeLineItemUi(rawUi: any): LineItemGroupUiConfig | undefined {
    if (!rawUi || typeof rawUi !== 'object') return undefined;

    const normalizeBool = (v: any): boolean | undefined => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      const s = v.toString().trim().toLowerCase();
      if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'on') return true;
      if (s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'off' || s === '') return false;
      return undefined;
    };

    const modeRaw = rawUi.mode !== undefined ? rawUi.mode : rawUi.type;
    const modeCandidate = modeRaw !== undefined && modeRaw !== null ? modeRaw.toString().toLowerCase() : '';
    const mode: LineItemGroupUiConfig['mode'] =
      modeCandidate === 'progressive'
        ? 'progressive'
        : modeCandidate === 'default'
          ? 'default'
          : modeCandidate === 'table'
            ? 'table'
            : undefined;

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
    const overlayDetail = rawUi.overlayDetail ?? rawUi.overlay_detail ?? rawUi.overlayDetailLayout ?? rawUi.overlay_detail_layout;

    const tableColumnsRaw =
      rawUi.tableColumns ??
      rawUi.table_columns ??
      rawUi.tableColumnIds ??
      rawUi.table_column_ids ??
      rawUi.columns;
    const tableColumns = (Array.isArray(tableColumnsRaw)
      ? tableColumnsRaw
      : typeof tableColumnsRaw === 'string'
        ? tableColumnsRaw.split(',')
        : []
    )
      .map(entry => (entry !== undefined && entry !== null ? entry.toString().trim() : ''))
      .filter(Boolean);
    const tableColumnWidthsRaw =
      rawUi.tableColumnWidths ??
      rawUi.table_column_widths ??
      rawUi.tableColumnWidthMap ??
      rawUi.table_column_width_map ??
      rawUi.columnWidths ??
      rawUi.columnWidth ??
      rawUi.column_widths;
    const tableColumnWidths = (() => {
      if (!tableColumnWidthsRaw || typeof tableColumnWidthsRaw !== 'object' || Array.isArray(tableColumnWidthsRaw)) return undefined;
      const entries = Object.entries(tableColumnWidthsRaw).reduce<Record<string, string | number>>((acc, [key, value]) => {
        const normalizedKey = key !== undefined && key !== null ? key.toString().trim() : '';
        if (!normalizedKey) return acc;
        if (value === undefined || value === null) return acc;
        if (typeof value === 'number') {
          acc[normalizedKey] = value;
          return acc;
        }
        const stringValue = value.toString().trim();
        if (stringValue) acc[normalizedKey] = stringValue;
        return acc;
      }, {});
      return Object.keys(entries).length ? entries : undefined;
    })();
    const tableHideUntilAnchor = normalizeBool(
      rawUi.tableHideUntilAnchor ??
        rawUi.table_hide_until_anchor ??
        rawUi.hideUntilAnchor ??
        rawUi.hide_until_anchor
    );
    const needsAttentionMessage =
      rawUi.needsAttentionMessage ??
      rawUi.needs_attention_message ??
      rawUi.needsAttention ??
      rawUi.attentionMessage ??
      rawUi.attention_message;

    const showItemPill = normalizeBool(
      rawUi.showItemPill ??
        rawUi.showItemCountPill ??
        rawUi.itemPill ??
        rawUi.itemsPill ??
        rawUi.showItemsPill ??
        rawUi.show_items_pill
    );

    const placementRaw =
      rawUi.addButtonPlacement ??
      rawUi.addButtonPosition ??
      rawUi.addButtonLocation ??
      rawUi.addButton ??
      rawUi.add_button_placement ??
      rawUi.add_button_position ??
      rawUi.add_button_location ??
      rawUi.add_button;
    const placementCandidate = placementRaw !== undefined && placementRaw !== null ? placementRaw.toString().trim().toLowerCase() : '';
    const addButtonPlacement: LineItemGroupUiConfig['addButtonPlacement'] | undefined =
      placementCandidate === 'top' || placementCandidate === 'header'
        ? 'top'
        : placementCandidate === 'bottom' || placementCandidate === 'footer'
          ? 'bottom'
          : placementCandidate === 'both' || placementCandidate === 'all'
            ? 'both'
            : placementCandidate === 'hidden' || placementCandidate === 'none' || placementCandidate === 'hide'
              ? 'hidden'
              : undefined;

    const allowRemoveAutoRows = normalizeBool(
      rawUi.allowRemoveAutoRows ??
        rawUi.autoRowsRemovable ??
        rawUi.allowRemoveAuto ??
        rawUi.allow_remove_auto_rows ??
        rawUi.allow_remove_auto
    );

    const saveDisabledRows = normalizeBool(
      rawUi.saveDisabledRows ??
        rawUi.persistDisabledRows ??
        rawUi.saveDisabledRowsOnSubmit ??
        rawUi.persistDisabledRowsOnSubmit ??
        rawUi.includeDisabledRowsOnSubmit ??
        rawUi.include_disabled_rows_on_submit
    );

    const openInOverlay = normalizeBool(
      rawUi.openInOverlay ??
        rawUi.openInFullPageOverlay ??
        rawUi.fullPageOverlay ??
        rawUi.fullPage ??
        rawUi.overlay
    );

    const closeButtonLabel =
      rawUi.closeButtonLabel ??
      rawUi.close_button_label ??
      rawUi.closeLabel ??
      rawUi.close_label ??
      rawUi.closeButtonText ??
      rawUi.close_button_text ??
      rawUi.closeText ??
      rawUi.close_text;

    const closeConfirm = rawUi.closeConfirm ?? rawUi.close_confirm;

    const choiceSearchEnabled = normalizeBool(
      rawUi.choiceSearchEnabled ??
        rawUi.choiceSearch ??
        rawUi.selectSearchEnabled ??
        rawUi.searchEnabled ??
        rawUi.searchable
    );
    const nonMatchWarningModeRaw =
      rawUi.nonMatchWarningMode ??
      rawUi.nonMatchWarnings ??
      rawUi.optionFilterWarningMode ??
      rawUi.optionFilterWarnings;
    const nonMatchWarningModeCandidate =
      nonMatchWarningModeRaw !== undefined && nonMatchWarningModeRaw !== null
        ? nonMatchWarningModeRaw.toString().trim().toLowerCase()
        : '';
    const nonMatchWarningMode: LineItemGroupUiConfig['nonMatchWarningMode'] =
      nonMatchWarningModeCandidate === 'validation' ||
      nonMatchWarningModeCandidate === 'rules' ||
      nonMatchWarningModeCandidate === 'rule' ||
      nonMatchWarningModeCandidate === 'generic'
        ? 'validation'
        : nonMatchWarningModeCandidate === 'both' || nonMatchWarningModeCandidate === 'all'
          ? 'both'
          : nonMatchWarningModeCandidate
              ? 'descriptive'
              : undefined;

    const cfg: LineItemGroupUiConfig = {};
    if (mode) cfg.mode = mode;
    if (collapsedFields && collapsedFields.length) cfg.collapsedFields = collapsedFields;
    if (expandGate) cfg.expandGate = expandGate;
    if (defaultCollapsed !== undefined) cfg.defaultCollapsed = defaultCollapsed;
    if (rowDisclaimer) (cfg as any).rowDisclaimer = rowDisclaimer;
    if (tableColumns.length) (cfg as any).tableColumns = tableColumns;
    if (tableColumnWidths) (cfg as any).tableColumnWidths = tableColumnWidths;
    if (tableHideUntilAnchor !== undefined) (cfg as any).tableHideUntilAnchor = tableHideUntilAnchor;
    if (needsAttentionMessage !== undefined) (cfg as any).needsAttentionMessage = needsAttentionMessage;
    if (showItemPill !== undefined) (cfg as any).showItemPill = showItemPill;
    if (addButtonPlacement) (cfg as any).addButtonPlacement = addButtonPlacement;
    if (allowRemoveAutoRows !== undefined) (cfg as any).allowRemoveAutoRows = allowRemoveAutoRows;
    if (saveDisabledRows !== undefined) (cfg as any).saveDisabledRows = saveDisabledRows;
    if (openInOverlay !== undefined) (cfg as any).openInOverlay = openInOverlay;
    if (closeButtonLabel !== undefined) (cfg as any).closeButtonLabel = closeButtonLabel;
    if (closeConfirm !== undefined) (cfg as any).closeConfirm = closeConfirm;
    if (choiceSearchEnabled !== undefined) (cfg as any).choiceSearchEnabled = choiceSearchEnabled;
    if (nonMatchWarningMode !== undefined) (cfg as any).nonMatchWarningMode = nonMatchWarningMode;
    if (overlayDetail !== undefined) (cfg as any).overlayDetail = overlayDetail;
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
          const normalizedWhen = this.normalizeWhenClause((c as any).when);
          if (normalizedWhen) out.when = normalizedWhen;
          return out;
        })
        .filter(Boolean);
    }
    const hasAny = Object.keys(cfg).some(k => (cfg as any)[k] !== undefined);
    return hasAny ? cfg : undefined;
  }

  private static normalizeParagraphDisclaimer(raw: any): ParagraphDisclaimerConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const groupIdRaw =
      raw.sourceGroupId ??
      raw.groupId ??
      raw.group ??
      raw.lineItemGroupId ??
      raw.line_item_group_id ??
      raw.lineItemGroup ??
      raw.line_item_group;
    if (!groupIdRaw) return undefined;

    const cfg: ParagraphDisclaimerConfig = {
      sourceGroupId: groupIdRaw.toString().trim()
    };

    const subGroupRaw =
      raw.sourceSubGroupId ??
      raw.subGroupId ??
      raw.subgroupId ??
      raw.subGroup ??
      raw.subgroup ??
      raw.sub_group_id ??
      raw.subgroup_id;
    if (subGroupRaw) cfg.sourceSubGroupId = subGroupRaw.toString().trim();

    const itemFieldRaw = raw.itemFieldId ?? raw.fieldId ?? raw.itemField ?? raw.sourceFieldId ?? raw.sourceField;
    if (itemFieldRaw) cfg.itemFieldId = itemFieldRaw.toString().trim();

    if (raw.title !== undefined) cfg.title = raw.title;
    if (raw.listMessage !== undefined) cfg.listMessage = raw.listMessage;
    if (raw.message !== undefined) cfg.message = raw.message;
    if (raw.separator !== undefined && raw.separator !== null) cfg.separator = raw.separator.toString();
    if (raw.editable !== undefined && raw.editable !== null) cfg.editable = Boolean(raw.editable);

    return cfg;
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
          ? parsed.fields.map((f: any, idx: number) => this.normalizeLineItemField(ss, f, idx))
          : [];
        const refFields = jsonFields.length === 0 ? loadRefFields(optionsRef) : [];
        const mergedFields = jsonFields.length ? jsonFields : refFields;
        const sectionSelector = this.normalizeLineItemSelector(ss, parsed.sectionSelector);
        const totals = this.normalizeLineItemTotals(parsed.totals);
        const dedupRules = this.normalizeLineItemDedupRules(parsed.dedupRules);
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
          addOverlay: parsed.addOverlay,
          sectionSelector,
          dedupRules,
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
    let optionsRaw: Record<string, any>[] | undefined;

    if (rawSelector.optionsRef) {
      const parsed = this.parseOptions(ss, rawSelector.optionsRef, rawSelector.optionsRefFr, rawSelector.optionsRefNl);
      options = parsed.options;
      optionsFr = parsed.optionsFr;
      optionsNl = parsed.optionsNl;
      optionsRaw = parsed.optionsRaw;
    } else {
      options = Array.isArray(rawSelector.options) ? rawSelector.options : [];
      optionsFr = Array.isArray(rawSelector.optionsFr) ? rawSelector.optionsFr : [];
      optionsNl = Array.isArray(rawSelector.optionsNl) ? rawSelector.optionsNl : [];
      optionsRaw = Array.isArray(rawSelector.optionsRaw) ? rawSelector.optionsRaw : undefined;
    }

    const optionFilter = this.normalizeOptionMapLike(ss, rawSelector.optionFilter);
    const choiceSearchEnabled = this.normalizeBoolean(
      rawSelector.choiceSearchEnabled ??
        rawSelector.choiceSearch ??
        rawSelector.selectSearchEnabled ??
        rawSelector.searchEnabled ??
        rawSelector.searchable
    );
    const placeholderRaw = rawSelector.placeholder ?? rawSelector.placeholderText ?? rawSelector.placeholderLabel;
    const placeholderObj = placeholderRaw && typeof placeholderRaw === 'object' ? placeholderRaw : null;
    const placeholderStr = typeof placeholderRaw === 'string' ? placeholderRaw : '';
    const placeholderEn =
      rawSelector.placeholderEn || (placeholderObj && placeholderObj.en) || placeholderStr || '';
    const placeholderFr =
      rawSelector.placeholderFr || (placeholderObj && placeholderObj.fr) || '';
    const placeholderNl =
      rawSelector.placeholderNl || (placeholderObj && placeholderObj.nl) || '';
    const helperTextRaw = rawSelector.helperText ?? rawSelector.helper ?? rawSelector.helperLabel;
    const helperTextObj = helperTextRaw && typeof helperTextRaw === 'object' ? helperTextRaw : null;
    const helperTextStr = typeof helperTextRaw === 'string' ? helperTextRaw : '';
    const helperTextEn =
      rawSelector.helperTextEn || (helperTextObj && helperTextObj.en) || helperTextStr || '';
    const helperTextFr =
      rawSelector.helperTextFr || (helperTextObj && helperTextObj.fr) || '';
    const helperTextNl =
      rawSelector.helperTextNl || (helperTextObj && helperTextObj.nl) || '';
    const hideLabel = this.normalizeBoolean(rawSelector.hideLabel ?? rawSelector.hideLabelText ?? rawSelector.hideSelectorLabel);

    return {
      id: id.toString(),
      labelEn: rawSelector.labelEn || '',
      labelFr: rawSelector.labelFr || '',
      labelNl: rawSelector.labelNl || '',
      placeholder: placeholderObj || (placeholderStr ? placeholderStr : undefined),
      placeholderEn: placeholderEn || undefined,
      placeholderFr: placeholderFr || undefined,
      placeholderNl: placeholderNl || undefined,
      helperText: helperTextObj || (helperTextStr ? helperTextStr : undefined),
      helperTextEn: helperTextEn || undefined,
      helperTextFr: helperTextFr || undefined,
      helperTextNl: helperTextNl || undefined,
      hideLabel: hideLabel === undefined ? undefined : hideLabel,
      required: !!rawSelector.required,
      options,
      optionsFr,
      optionsNl,
      optionsRaw,
      optionsRef: rawSelector.optionsRef,
      choiceSearchEnabled,
      optionFilter
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

  private static normalizeLineItemDedupRules(rawRules: any): LineItemDedupRule[] | undefined {
    if (!Array.isArray(rawRules)) return undefined;
    const rules: LineItemDedupRule[] = rawRules.map((entry: any) => {
      if (!entry || typeof entry !== 'object') return null;
      const rawFields = entry.fields ?? entry.fieldIds ?? entry.keys ?? entry.keyFields;
      const fields = (() => {
        if (Array.isArray(rawFields)) {
          return rawFields
            .map(v => (v !== undefined && v !== null ? v.toString().trim() : ''))
            .filter(Boolean);
        }
        if (typeof rawFields === 'string') {
          return rawFields
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        }
        return [];
      })();
      if (!fields.length) return null;
      const message = entry.message ?? entry.errorMessage ?? entry.error ?? entry.msg;
      const cfg: LineItemDedupRule = { fields };
      if (message !== undefined) cfg.message = message;
      return cfg;
    }).filter(Boolean) as LineItemDedupRule[];
    return rules.length ? rules : undefined;
  }

  private static parseLineItemSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): LineItemGroupConfig | undefined {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { fields: [] };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { fields: [] };

    const lastColumn = Math.max(10, sheet.getLastColumn());
      const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      const fields: LineItemFieldConfig[] = rows.map((row, idx) => {
        const { options, optionsFr, optionsNl, optionsRaw } = this.parseOptions(ss, row[6], row[7], row[8]);
        const rawConfig = row[9] ? row[9].toString().trim() : '';
        const optionFilter = this.parseOptionFilter(ss, rawConfig);
        const validationRules = this.parseValidationRules(rawConfig);
        const visibility = this.parseVisibility(rawConfig);
        const changeDialog = this.parseChangeDialogFromAny([rawConfig]);
        const fieldType = (row[1] ? row[1].toString().toUpperCase() : 'TEXT') as LineItemFieldType;
        const dataSource = (fieldType === 'CHOICE' || fieldType === 'CHECKBOX')
          ? this.parseDataSource(rawConfig)
          : undefined;
        const selectionEffects = this.parseSelectionEffects(rawConfig);
        const valueMap = this.parseValueMap(ss, rawConfig);
        const derivedValue = this.parseDerivedValue(rawConfig);
        const defaultValue = this.parseDefaultValue(rawConfig);
      const ui = this.parseQuestionUi([rawConfig]);
      const group = this.parseQuestionGroup([rawConfig]);
      const pair = this.parsePairKey([rawConfig]);
      const readOnly = this.parseReadOnly([rawConfig]);
      const optionSort =
        fieldType === 'CHOICE' || fieldType === 'CHECKBOX' ? this.parseOptionSort([rawConfig]) : undefined;
      const requiredMessage = this.parseRequiredMessage([rawConfig]);
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
        requiredMessage,
        defaultValue,
        group,
        pair,
        ui,
        readOnly,
        optionSort,
        options,
        optionsFr,
        optionsNl,
        optionsRaw,
        optionFilter,
        validationRules,
        visibility,
        changeDialog,
        dataSource,
        selectionEffects,
        valueMap,
        derivedValue,
        uploadConfig
      };
    }).filter(f => f.labelEn || f.labelFr || f.labelNl);

    return { fields };
  }

  private static normalizeLineItemField(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    field: any,
    idx: number
  ): LineItemFieldConfig {
    const baseType = (field?.type ? field.type.toString().toUpperCase() : 'TEXT') as LineItemFieldType;
    const dataSource = (baseType === 'CHOICE' || baseType === 'CHECKBOX')
      ? this.buildDataSourceConfig(this.extractDataSourceCandidate(field))
      : undefined;
    const uploadConfig =
      baseType === 'FILE_UPLOAD' ? this.normalizeUploadConfig(field?.uploadConfig || field?.upload) : undefined;
    const selectionEffects = this.normalizeSelectionEffects(field?.selectionEffects);
    const optionFilter = this.normalizeOptionMapLike(ss, field?.optionFilter);
    const valueMap = this.normalizeValueMapLike(ss, field?.valueMap);
    const derivedValue = this.normalizeDerivedValue(field?.derivedValue);
    const changeDialog = this.normalizeChangeDialog(field?.changeDialog);
    const ui = this.normalizeQuestionUi(field?.ui || field?.view || field?.layout);
    const group = this.normalizeQuestionGroup(field?.group || field?.section || field?.card);
    const readOnly = (() => {
      const direct =
        field?.readOnly ?? field?.readonly ?? field?.locked ?? field?.disableEdit ?? field?.disabled ?? field?.disable ?? undefined;
      const nested = field?.ui && typeof field.ui === 'object' ? (field.ui.readOnly ?? field.ui.readonly) : undefined;
      return this.normalizeBoolean(direct !== undefined ? direct : nested);
    })();
    const pairCandidate =
      field?.pair !== undefined
        ? field.pair
        : field?.pairKey !== undefined
        ? field.pairKey
        : field?.pairWith !== undefined
        ? field.pairWith
        : undefined;
    const pair = pairCandidate !== undefined && pairCandidate !== null ? pairCandidate.toString().trim() : undefined;
    const defaultValue = this.normalizeDefaultValue(field?.defaultValue ?? field?.default);
    const requiredMessageCandidate =
      field?.requiredMessage ?? field?.required_message ?? field?.requiredErrorMessage ?? field?.required_error_message;
    const requiredMessage =
      requiredMessageCandidate !== undefined && requiredMessageCandidate !== null ? (requiredMessageCandidate as LocalizedString) : undefined;
    const optionSort = this.normalizeOptionSortMode(
      field?.optionSort ?? field?.optionsSort ?? field?.optionSorting ?? field?.optionsSorting,
      field?.preserveOptionOrder ?? field?.keepOptionOrder ?? field?.disableOptionSorting
    );
    return {
      id: field?.id || `LI${idx + 1}`,
      type: baseType,
      labelEn: field?.labelEn || '',
      labelFr: field?.labelFr || '',
      labelNl: field?.labelNl || '',
      required: !!field?.required,
      requiredMessage,
      defaultValue,
      group,
      pair: pair || undefined,
      ui,
      readOnly,
      optionSort,
      options: Array.isArray(field?.options) ? field.options : [],
      optionsFr: Array.isArray(field?.optionsFr) ? field.optionsFr : [],
      optionsNl: Array.isArray(field?.optionsNl) ? field.optionsNl : [],
      optionsRaw: Array.isArray(field?.optionsRaw) ? field.optionsRaw : undefined,
      optionFilter,
      validationRules: Array.isArray(field?.validationRules) ? field.validationRules : undefined,
      visibility: this.normalizeVisibility(field?.visibility),
      changeDialog,
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
        const subGroups = Array.isArray(entry.subGroups)
          ? entry.subGroups
              .map((subEntry: any, idx: number) =>
                this.normalizeSubGroupConfig(
                  ss,
                  subEntry,
                  `${entry.id || refCfg.id || fallbackId || refName}_sub_${idx + 1}`
                )
              )
              .filter(Boolean) as LineItemGroupConfig[]
          : refCfg.subGroups;
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
          addOverlay: entry.addOverlay ?? refCfg.addOverlay,
          sectionSelector: entry.sectionSelector ? this.normalizeLineItemSelector(ss, entry.sectionSelector) : refCfg.sectionSelector,
          dedupRules: entry.dedupRules ? this.normalizeLineItemDedupRules(entry.dedupRules) : refCfg.dedupRules,
          totals: entry.totals ? this.normalizeLineItemTotals(entry.totals) : refCfg.totals,
          subGroups
        };
      }
    }

    const fields: LineItemFieldConfig[] = Array.isArray(entry.fields)
      ? entry.fields.map((f: any, idx: number) => this.normalizeLineItemField(ss, f, idx))
      : [];
    const sectionSelector = this.normalizeLineItemSelector(ss, entry.sectionSelector);
    const dedupRules = this.normalizeLineItemDedupRules(entry.dedupRules);
    const totals = this.normalizeLineItemTotals(entry.totals);
    const ui = this.normalizeLineItemUi(entry.ui);
    const subGroups = Array.isArray(entry.subGroups)
      ? entry.subGroups
          .map((subEntry: any, idx: number) => this.normalizeSubGroupConfig(ss, subEntry, `${entry.id || fallbackId}_sub_${idx + 1}`))
          .filter(Boolean) as LineItemGroupConfig[]
      : undefined;

    return {
      id: entry.id ? entry.id.toString() : fallbackId,
      label: entry.label,
      ui,
      minRows: entry.minRows ? Number(entry.minRows) : undefined,
      maxRows: entry.maxRows ? Number(entry.maxRows) : undefined,
      addButtonLabel: entry.addButtonLabel,
      anchorFieldId: entry.anchorFieldId,
      addMode: entry.addMode,
      addOverlay: entry.addOverlay,
      sectionSelector,
      dedupRules,
      totals,
      fields,
      subGroups
    };
  }

  private static normalizeValueMap(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    raw: any
  ): ValueMapConfig | undefined {
    return this.normalizeValueMapLike(ss, raw);
  }

  private static normalizeDerivedValue(raw: any): DerivedValueConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const opRaw = raw.op ? raw.op.toString().trim() : 'addDays';
    const op = opRaw.toLowerCase();
    const whenRaw = raw.when !== undefined && raw.when !== null ? raw.when.toString().trim().toLowerCase() : '';
    const when = whenRaw === 'empty' || whenRaw === 'always' ? (whenRaw as any) : undefined;
    const hidden = raw.hidden !== undefined ? Boolean(raw.hidden) : undefined;

    if (op === 'adddays' || opRaw === 'addDays') {
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

    if (op === 'timeofdaymap' || opRaw === 'timeOfDayMap') {
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

    if (op === 'calc' || op === 'calculate' || op === 'formula') {
      const expressionRaw = raw.expression ?? raw.formula ?? raw.expr ?? raw.expressionText;
      const expression = expressionRaw !== undefined && expressionRaw !== null ? expressionRaw.toString().trim() : '';
      if (!expression) return undefined;
      const cfg: any = { op: 'calc', expression };
      const applyOnRaw = raw.applyOn !== undefined && raw.applyOn !== null ? raw.applyOn.toString().trim().toLowerCase() : '';
      if (applyOnRaw === 'change' || applyOnRaw === 'blur') cfg.applyOn = applyOnRaw;
      if (when) cfg.when = when;
      if (hidden !== undefined) cfg.hidden = hidden;
      const precisionRaw = raw.precision ?? raw.round ?? raw.decimals;
      if (precisionRaw !== undefined && precisionRaw !== null) {
        const num = Number(precisionRaw);
        if (!isNaN(num)) cfg.precision = Math.max(0, Math.floor(num));
      }
      if (raw.min !== undefined && raw.min !== null) {
        const num = Number(raw.min);
        if (!isNaN(num)) cfg.min = num;
      }
      if (raw.max !== undefined && raw.max !== null) {
        const num = Number(raw.max);
        if (!isNaN(num)) cfg.max = num;
      }
      const filtersRaw = raw.lineItemFilters ?? raw.aggregateFilters ?? raw.filters;
      if (Array.isArray(filtersRaw)) {
        const lineItemFilters = filtersRaw
          .map((entry: any) => {
            if (!entry || typeof entry !== 'object') return null;
            const refRaw = entry.ref ?? entry.path ?? entry.target;
            const ref = refRaw !== undefined && refRaw !== null ? refRaw.toString().trim() : '';
            if (!ref) return null;
            const whenClause = entry.when;
            if (!whenClause || typeof whenClause !== 'object') return null;
            return { ref, when: whenClause };
          })
          .filter(Boolean);
        if (lineItemFilters.length) cfg.lineItemFilters = lineItemFilters;
      }
      return cfg as DerivedValueConfig;
    }

    return undefined;
  }
}
