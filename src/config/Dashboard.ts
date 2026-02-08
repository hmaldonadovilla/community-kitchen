import {
  AutoSaveConfig,
  AuditLoggingConfig,
  AppHeaderConfig,
  ActionBarsConfig,
  ActionBarItemConfig,
  ActionBarViewConfig,
  ActionBarSystemButton,
  DedupIncompleteHomeDialogConfig,
  ButtonPlacement,
  ButtonAction,
  FollowupConfig,
  FollowupStatusConfig,
  FieldDisableRule,
  EmailRecipientEntry,
  EmailRecipientDataSourceConfig,
  DedupDialogConfig,
  CopyCurrentRecordProfile,
  FormConfig,
  GroupBehaviorConfig,
  ListViewColumnConfig,
  ListViewLegendItem,
  ListViewSearchConfig,
  ListViewViewConfig,
  LocalizedString,
  SystemActionGateDialogConfig,
  SubmitValidationConfig,
  StepsConfig
} from '../types';

export const DASHBOARD_SHEET_NAME = 'Forms Dashboard';
const DEBUG_PROPERTY_KEY = 'CK_DEBUG';

export class Dashboard {
  private readonly sheet: GoogleAppsScript.Spreadsheet.Sheet;
  private readonly debugEnabled: boolean;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    let sheet = ss.getSheetByName(DASHBOARD_SHEET_NAME);
    if (!sheet) {
      sheet = this.createDashboard(ss);
    }
    this.sheet = sheet;
    this.debugEnabled = this.isDebugEnabled();
    this.debug('Dashboard initialized', { lastRow: this.sheet.getLastRow(), lastColumn: this.sheet.getLastColumn() });
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
        'Web App URL (?form=ConfigSheetName)',
        'Follow-up Config (JSON)'
      ]
    ];

    sheet.getRange('A3:F3').setValues(headers).setFontWeight('normal');

    const exampleAppUrl = `${baseUrl}?form=${encodeURIComponent('Config: Example')}`;
    const examples = [
      [
        'Example Form',
        'Config: Example',
        'Form Responses',
        'Multi-language form with date, text, number, and choice questions.',
        exampleAppUrl,
        ''
      ]
    ];

    sheet.getRange(4, 1, examples.length, 6).setValues(examples);

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

    const totalColumns = Math.max(5, this.sheet.getLastColumn());
    const { rowIndex: headerRowIndex, headerValues } = this.resolveHeaderRow();
    this.debug('Header row resolved', { headerRowIndex, headerValues });
    const headerRow = headerValues.map(h => h?.toString().trim().toLowerCase());
    const dataStartRow = headerRowIndex + 1;
    if (lastRow < dataStartRow) return [];
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
    const colFollowup = findHeader(['follow-up config', 'follow up config'], -1);

    const dataRowCount = Math.max(0, lastRow - headerRowIndex);
    if (dataRowCount === 0) return [];
    const data = this.sheet.getRange(dataStartRow, 1, dataRowCount, totalColumns).getValues();
    const forms: FormConfig[] = [];
    
    data.forEach((row, index) => {
      const title = row[colTitle];
      const configSheetName = row[colConfig];
      const destinationTab = row[colDestination];
      const description = row[colDescription];
      const appUrl = colAppUrl >= 0 ? row[colAppUrl] : undefined;
      const formId = colFormId >= 0 ? row[colFormId] : undefined;
      const dashboardConfig = colFollowup >= 0 ? this.parseDashboardConfig(row[colFollowup]) : undefined;
      const followupConfig = dashboardConfig?.followup;
      const templateCacheTtlSeconds = dashboardConfig?.templateCacheTtlSeconds;
      const listViewTitle = dashboardConfig?.listViewTitle;
      const listViewDefaultSort = dashboardConfig?.listViewDefaultSort;
      const listViewPageSize = dashboardConfig?.listViewPageSize;
      const listViewPaginationControlsEnabled = dashboardConfig?.listViewPaginationControlsEnabled;
      const listViewHeaderSortEnabled = dashboardConfig?.listViewHeaderSortEnabled;
      const listViewHideHeaderRow = dashboardConfig?.listViewHideHeaderRow;
      const listViewRowClickEnabled = dashboardConfig?.listViewRowClickEnabled;
      const listViewMetaColumns = dashboardConfig?.listViewMetaColumns;
      const listViewColumns = dashboardConfig?.listViewColumns;
      const listViewLegend = dashboardConfig?.listViewLegend;
      const listViewLegendColumns = dashboardConfig?.listViewLegendColumns;
      const listViewSearch = dashboardConfig?.listViewSearch;
      const listViewView = dashboardConfig?.listViewView;
      const autoSave = dashboardConfig?.autoSave;
      const auditLogging = dashboardConfig?.auditLogging;
      const summaryViewEnabled = dashboardConfig?.summaryViewEnabled;
      const summaryHtmlTemplateId = dashboardConfig?.summaryHtmlTemplateId;
      const copyCurrentRecordEnabled = dashboardConfig?.copyCurrentRecordEnabled;
      const copyCurrentRecordDropFields = dashboardConfig?.copyCurrentRecordDropFields;
      const copyCurrentRecordProfile = dashboardConfig?.copyCurrentRecordProfile;
      const createButtonLabel = dashboardConfig?.createButtonLabel;
      const copyCurrentRecordLabel = dashboardConfig?.copyCurrentRecordLabel;
      const copyCurrentRecordDialog = dashboardConfig?.copyCurrentRecordDialog;
      const createNewRecordEnabled = dashboardConfig?.createNewRecordEnabled;
      const createRecordPresetButtonsEnabled = dashboardConfig?.createRecordPresetButtonsEnabled;
      const actionBars = dashboardConfig?.actionBars;
      const appHeader = dashboardConfig?.appHeader;
      const groupBehavior = dashboardConfig?.groupBehavior;
      const submitValidation = dashboardConfig?.submitValidation;
      const portraitOnly = dashboardConfig?.portraitOnly;
      const submissionConfirmationMessage = dashboardConfig?.submissionConfirmationMessage;
      const submissionConfirmationTitle = dashboardConfig?.submissionConfirmationTitle;
      const submissionConfirmationConfirmLabel = dashboardConfig?.submissionConfirmationConfirmLabel;
      const submissionConfirmationCancelLabel = dashboardConfig?.submissionConfirmationCancelLabel;
      const dedupDialog = dashboardConfig?.dedupDialog;
      const submitButtonLabel = dashboardConfig?.submitButtonLabel;
      const summaryButtonLabel = dashboardConfig?.summaryButtonLabel;
      const languages = dashboardConfig?.languages;
      const defaultLanguage = dashboardConfig?.defaultLanguage;
      const languageSelectorEnabled = dashboardConfig?.languageSelectorEnabled;
      const steps = dashboardConfig?.steps;
      const fieldDisableRules = dashboardConfig?.fieldDisableRules;
      const dedupDeleteOnKeyChange = dashboardConfig?.dedupDeleteOnKeyChange;
      if (title && configSheetName) {
        forms.push({
          title,
          configSheet: configSheetName,
          destinationTab,
          description,
          appUrl,
          formId,
          rowIndex: dataStartRow + index,
          followupConfig,
          templateCacheTtlSeconds,
          listViewTitle,
          listViewDefaultSort,
          listViewPageSize,
          listViewPaginationControlsEnabled,
          listViewHeaderSortEnabled,
          listViewHideHeaderRow,
          listViewRowClickEnabled,
          listViewMetaColumns,
          listViewColumns,
          listViewLegend,
          listViewLegendColumns,
          listViewSearch,
          listViewView,
          autoSave,
          auditLogging,
          summaryViewEnabled,
          summaryHtmlTemplateId,
          copyCurrentRecordEnabled,
          copyCurrentRecordDropFields,
          copyCurrentRecordProfile,
          createButtonLabel,
          copyCurrentRecordLabel,
          copyCurrentRecordDialog,
          createNewRecordEnabled,
          createRecordPresetButtonsEnabled,
          actionBars,
          appHeader,
          groupBehavior,
          submitValidation,
          steps,
          portraitOnly,
          submissionConfirmationMessage,
          submissionConfirmationTitle,
          submissionConfirmationConfirmLabel,
          submissionConfirmationCancelLabel,
          dedupDialog,
          submitButtonLabel,
          summaryButtonLabel,
          fieldDisableRules,
          languages,
          defaultLanguage,
          languageSelectorEnabled,
          dedupDeleteOnKeyChange
        });
      }
    });
    this.debug('Forms parsed from dashboard', { count: forms.length, forms });
    
    return forms;
  }

  public updateFormDetails(rowIndex: number, appUrl?: string): void {
    if (!appUrl) return;
    const { headerValues } = this.resolveHeaderRow();
    const headers = headerValues.map(h => h?.toString().trim().toLowerCase());
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

  private parseDashboardConfig(
    raw: any
  ): {
    followup?: FollowupConfig;
    templateCacheTtlSeconds?: number;
    listViewTitle?: LocalizedString;
    listViewDefaultSort?: { fieldId: string; direction?: 'asc' | 'desc' };
    listViewPageSize?: number;
    listViewPaginationControlsEnabled?: boolean;
    listViewHeaderSortEnabled?: boolean;
    listViewHideHeaderRow?: boolean;
    listViewRowClickEnabled?: boolean;
    listViewMetaColumns?: string[];
    listViewColumns?: ListViewColumnConfig[];
    listViewLegend?: ListViewLegendItem[];
    listViewLegendColumns?: number;
    listViewSearch?: ListViewSearchConfig;
    listViewView?: ListViewViewConfig;
    autoSave?: AutoSaveConfig;
    auditLogging?: AuditLoggingConfig;
    summaryViewEnabled?: boolean;
    summaryHtmlTemplateId?: FollowupConfig['pdfTemplateId'];
    copyCurrentRecordEnabled?: boolean;
    copyCurrentRecordDropFields?: string[];
    copyCurrentRecordProfile?: CopyCurrentRecordProfile;
    createButtonLabel?: LocalizedString;
    copyCurrentRecordLabel?: LocalizedString;
    copyCurrentRecordDialog?: SystemActionGateDialogConfig;
    createNewRecordEnabled?: boolean;
    createRecordPresetButtonsEnabled?: boolean;
    actionBars?: ActionBarsConfig;
    appHeader?: AppHeaderConfig;
    groupBehavior?: GroupBehaviorConfig;
    submitValidation?: SubmitValidationConfig;
    portraitOnly?: boolean;
    submissionConfirmationMessage?: LocalizedString;
    submissionConfirmationTitle?: LocalizedString;
    submissionConfirmationConfirmLabel?: LocalizedString;
    submissionConfirmationCancelLabel?: LocalizedString;
    dedupDialog?: DedupDialogConfig;
    submitButtonLabel?: LocalizedString;
    summaryButtonLabel?: LocalizedString;
    languages?: Array<'EN' | 'FR' | 'NL'>;
    defaultLanguage?: 'EN' | 'FR' | 'NL';
    languageSelectorEnabled?: boolean;
    steps?: StepsConfig;
    fieldDisableRules?: FieldDisableRule[];
    dedupDeleteOnKeyChange?: boolean;
  } | undefined {
    if (!raw || (typeof raw === 'string' && raw.trim() === '')) return undefined;
    const value = raw.toString().trim();
    let parsed: any;
    try {
      parsed = JSON.parse(this.sanitizeJson(value));
    } catch (err) {
      this.debug('Failed to parse dashboard config', { error: err ? err.toString() : 'parse error' });
      return undefined;
    }
    if (!parsed || typeof parsed !== 'object') return undefined;
    const languagesRaw =
      parsed.languages !== undefined
        ? parsed.languages
        : parsed.supportedLanguages !== undefined
        ? parsed.supportedLanguages
        : parsed.enabledLanguages !== undefined
        ? parsed.enabledLanguages
        : parsed.languageList !== undefined
        ? parsed.languageList
        : parsed.langs !== undefined
        ? parsed.langs
        : undefined;
    let languages = this.normalizeLanguageList(languagesRaw);

    const disabledLanguagesRaw =
      parsed.disabledLanguages !== undefined
        ? parsed.disabledLanguages
        : parsed.disabledLangs !== undefined
        ? parsed.disabledLangs
        : parsed.disableLanguagesList !== undefined
        ? parsed.disableLanguagesList
        : undefined;
    const disabledLanguages = this.normalizeLanguageList(disabledLanguagesRaw);
    if (languages && disabledLanguages && disabledLanguages.length) {
      languages = languages.filter(lang => !disabledLanguages.includes(lang));
    }

    const defaultLanguage = this.normalizeLanguageCode(
      parsed.defaultLanguage !== undefined
        ? parsed.defaultLanguage
        : parsed.defaultLang !== undefined
        ? parsed.defaultLang
        : parsed.languageDefault !== undefined
        ? parsed.languageDefault
        : undefined
    );

    const languageSelectorEnabled = (() => {
      if (parsed.languageSelectorEnabled !== undefined) return Boolean(parsed.languageSelectorEnabled);
      if (parsed.languageSelectionEnabled !== undefined) return Boolean(parsed.languageSelectionEnabled);
      if (parsed.enableLanguageSelector !== undefined) return Boolean(parsed.enableLanguageSelector);
      if (parsed.disableLanguageSelector !== undefined) return !Boolean(parsed.disableLanguageSelector);
      if (parsed.singleLanguageMode !== undefined) return !Boolean(parsed.singleLanguageMode);
      if (parsed.disableLanguages !== undefined && typeof parsed.disableLanguages === 'boolean') {
        return !Boolean(parsed.disableLanguages);
      }
      return undefined;
    })();

    // Enforce max 3 languages (app supports EN/FR/NL only).
    if (languages && languages.length > 3) {
      languages = languages.slice(0, 3);
    }
    // Ensure defaultLanguage is included if both are provided.
    if (languages && languages.length && defaultLanguage && !languages.includes(defaultLanguage)) {
      languages = [defaultLanguage, ...languages].slice(0, 3);
    }

    const followup = this.buildFollowupConfig(parsed);

    const templateCacheObj =
      parsed.templateCache !== undefined && parsed.templateCache !== null && typeof parsed.templateCache === 'object'
        ? parsed.templateCache
        : undefined;
    const ttlSecondsRaw =
      parsed.templateCacheTtlSeconds !== undefined
        ? parsed.templateCacheTtlSeconds
        : parsed.templateCacheTTLSeconds !== undefined
        ? parsed.templateCacheTTLSeconds
        : parsed.templateCacheTtl !== undefined
        ? parsed.templateCacheTtl
        : parsed.templateCacheTTL !== undefined
        ? parsed.templateCacheTTL
        : parsed.templateCacheTtlSec !== undefined
        ? parsed.templateCacheTtlSec
        : parsed.templateCacheTtlSecondsLegacy !== undefined
        ? parsed.templateCacheTtlSecondsLegacy
        : templateCacheObj && templateCacheObj.ttlSeconds !== undefined
        ? templateCacheObj.ttlSeconds
        : templateCacheObj && templateCacheObj.ttl !== undefined
        ? templateCacheObj.ttl
        : undefined;
    const ttlHoursRaw =
      parsed.templateCacheTtlHours !== undefined
        ? parsed.templateCacheTtlHours
        : parsed.templateCacheTTLHours !== undefined
        ? parsed.templateCacheTTLHours
        : parsed.templateCacheHours !== undefined
        ? parsed.templateCacheHours
        : templateCacheObj && templateCacheObj.ttlHours !== undefined
        ? templateCacheObj.ttlHours
        : undefined;

    const normalizeTtlSeconds = (raw: any): number | undefined => {
      if (raw === undefined || raw === null || raw === '') return undefined;
      if (typeof raw === 'string') {
        const s = raw.trim().toLowerCase();
        if (!s) return undefined;
        if (s === 'none' || s === 'no' || s === 'off' || s === 'disabled' || s === 'false') return undefined;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      if (n <= 0) return undefined;
      // CacheService hard cap is 6 hours (21600s).
      return Math.max(30, Math.min(21600, Math.round(n)));
    };

    const templateCacheTtlSeconds =
      normalizeTtlSeconds(ttlSecondsRaw) ?? (ttlHoursRaw !== undefined ? normalizeTtlSeconds(Number(ttlHoursRaw) * 3600) : undefined);
    const normalizeLocalized = (input: any): any => {
      if (input === undefined || input === null) return undefined;
      if (typeof input === 'string') {
        const trimmed = input.trim();
        return trimmed ? trimmed : undefined;
      }
      if (typeof input !== 'object') return undefined;
      const out: Record<string, string> = {};
      Object.entries(input).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        const trimmed = v.trim();
        if (!trimmed) return;
        out[k.toLowerCase()] = trimmed;
      });
      return Object.keys(out).length ? out : undefined;
    };

    const normalizeBoolean = (input: any): boolean | undefined => {
      if (input === undefined || input === null) return undefined;
      if (typeof input === 'boolean') return input;
      if (typeof input === 'number') return input !== 0;
      const s = input.toString().trim().toLowerCase();
      if (!s) return undefined;
      if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
      return Boolean(input);
    };
    const normalizeFieldIdList = (input: any): string[] | undefined => {
      if (input === undefined || input === null || input === '') return undefined;
      const list = Array.isArray(input)
        ? input
        : typeof input === 'string'
          ? input.split(',').map((entry: string) => entry.trim())
          : [input];
      const ids = list
        .map(value => (value === undefined || value === null ? '' : value.toString().trim()))
        .filter(Boolean);
      return ids.length ? Array.from(new Set(ids)) : undefined;
    };
    const normalizeFieldDisableRules = (rawRules: any): FieldDisableRule[] | undefined => {
      if (rawRules === undefined || rawRules === null || rawRules === '') return undefined;
      const list = Array.isArray(rawRules) ? rawRules : [rawRules];
      const rules = list
        .map((entry: any): FieldDisableRule | null => {
          if (!entry || typeof entry !== 'object') return null;
          const whenCandidate =
            entry.when !== undefined
              ? entry.when
              : entry.whenClause !== undefined
                ? entry.whenClause
                : entry.condition !== undefined
                  ? entry.condition
                  : (entry.fieldId !== undefined || entry.all !== undefined || entry.any !== undefined || entry.not !== undefined || entry.lineItems !== undefined)
                    ? entry
                    : undefined;
          if (!whenCandidate || typeof whenCandidate !== 'object') return null;
          const idRaw = entry.id !== undefined && entry.id !== null ? entry.id.toString().trim() : '';
          const bypassFields = normalizeFieldIdList(
            entry.bypassFields !== undefined
              ? entry.bypassFields
              : entry.bypass !== undefined
                ? entry.bypass
                : entry.excludeFields !== undefined
                  ? entry.excludeFields
                  : entry.allowFields
          );
          return {
            id: idRaw || undefined,
            when: whenCandidate,
            bypassFields
          };
        })
        .filter(Boolean) as FieldDisableRule[];
      return rules.length ? rules : undefined;
    };

    const listViewObj =
      parsed.listView !== undefined && parsed.listView !== null && typeof parsed.listView === 'object' ? parsed.listView : undefined;
    const listViewTitleRaw =
      parsed.listViewTitle !== undefined
        ? parsed.listViewTitle
        : parsed.listTitle !== undefined
        ? parsed.listTitle
        : listViewObj && listViewObj.title !== undefined
        ? listViewObj.title
        : listViewObj && listViewObj.heading !== undefined
        ? listViewObj.heading
        : undefined;
    // Title: allow explicit empty string to mean "hide title" (instead of falling back to default "Records").
    const listViewTitle = (() => {
      if (listViewTitleRaw === undefined) return undefined;
      if (listViewTitleRaw === null) return '';
      const normalized = normalizeLocalized(listViewTitleRaw);
      return normalized !== undefined ? normalized : '';
    })();

    const listViewPageSizeRaw =
      parsed.listViewPageSize !== undefined
        ? parsed.listViewPageSize
        : parsed.pageSize !== undefined
        ? parsed.pageSize
        : listViewObj && listViewObj.pageSize !== undefined
        ? listViewObj.pageSize
        : undefined;
    const listViewPageSize = (() => {
      if (listViewPageSizeRaw === undefined || listViewPageSizeRaw === null || listViewPageSizeRaw === '') return undefined;
      const n = Number(listViewPageSizeRaw);
      if (!Number.isFinite(n)) return undefined;
      return Math.max(1, Math.min(50, Math.round(n)));
    })();

    const listViewPaginationControlsEnabledRaw =
      parsed.listViewPaginationControlsEnabled !== undefined
        ? parsed.listViewPaginationControlsEnabled
        : parsed.paginationControlsEnabled !== undefined
          ? parsed.paginationControlsEnabled
          : listViewObj && (listViewObj.paginationControlsEnabled !== undefined || (listViewObj as any).paginationEnabled !== undefined)
            ? (listViewObj.paginationControlsEnabled ?? (listViewObj as any).paginationEnabled)
            : undefined;
    const listViewPaginationControlsEnabled = normalizeBoolean(listViewPaginationControlsEnabledRaw);

    const listViewHeaderSortEnabledRaw =
      parsed.listViewHeaderSortEnabled !== undefined
        ? parsed.listViewHeaderSortEnabled
        : parsed.disableListViewHeaderSort !== undefined
          ? !Boolean(parsed.disableListViewHeaderSort)
          : listViewObj && (listViewObj.headerSortEnabled !== undefined || (listViewObj as any).headerSortingEnabled !== undefined)
            ? (listViewObj.headerSortEnabled ?? (listViewObj as any).headerSortingEnabled)
            : listViewObj && (listViewObj as any).disableHeaderSort !== undefined
              ? !Boolean((listViewObj as any).disableHeaderSort)
              : undefined;
    const listViewHeaderSortEnabled = normalizeBoolean(listViewHeaderSortEnabledRaw);

    const listViewHideHeaderRowRaw =
      parsed.listViewHideHeaderRow !== undefined
        ? parsed.listViewHideHeaderRow
        : parsed.hideListViewHeaderRow !== undefined
          ? parsed.hideListViewHeaderRow
          : listViewObj && (listViewObj.hideHeaderRow !== undefined || (listViewObj as any).hideTableHeader !== undefined)
            ? (listViewObj.hideHeaderRow ?? (listViewObj as any).hideTableHeader)
            : listViewObj && (listViewObj as any).showHeaderRow !== undefined
              ? !Boolean((listViewObj as any).showHeaderRow)
              : undefined;
    const listViewHideHeaderRow = normalizeBoolean(listViewHideHeaderRowRaw);

    const listViewRowClickEnabledRaw =
      parsed.listViewRowClickEnabled !== undefined
        ? parsed.listViewRowClickEnabled
        : parsed.disableListViewRowClick !== undefined
          ? !Boolean(parsed.disableListViewRowClick)
          : listViewObj &&
              ((listViewObj as any).rowClickEnabled !== undefined ||
                (listViewObj as any).rowClickable !== undefined ||
                (listViewObj as any).disableRowClick !== undefined)
            ? ((listViewObj as any).rowClickEnabled ??
                (listViewObj as any).rowClickable ??
                ((listViewObj as any).disableRowClick !== undefined ? !Boolean((listViewObj as any).disableRowClick) : undefined))
            : undefined;
    const listViewRowClickEnabled = normalizeBoolean(listViewRowClickEnabledRaw);

    const listViewDefaultSortRaw =
      parsed.listViewDefaultSort !== undefined
        ? parsed.listViewDefaultSort
        : parsed.defaultSort !== undefined
        ? parsed.defaultSort
        : listViewObj && listViewObj.defaultSort !== undefined
        ? listViewObj.defaultSort
        : listViewObj && listViewObj.sort !== undefined
        ? listViewObj.sort
        : undefined;
    const listViewDefaultSort = (() => {
      if (!listViewDefaultSortRaw || typeof listViewDefaultSortRaw !== 'object') return undefined;
      const fieldId = (listViewDefaultSortRaw as any).fieldId !== undefined ? `${(listViewDefaultSortRaw as any).fieldId}`.trim() : '';
      if (!fieldId) return undefined;
      const dirRaw =
        (listViewDefaultSortRaw as any).direction !== undefined ? `${(listViewDefaultSortRaw as any).direction}`.trim().toLowerCase() : '';
      const direction = dirRaw === 'asc' || dirRaw === 'desc' ? (dirRaw as 'asc' | 'desc') : undefined;
      return { fieldId, direction };
    })();
    const metaRaw =
      parsed.listViewMetaColumns !== undefined
        ? parsed.listViewMetaColumns
        : parsed.listViewDefaults !== undefined
        ? parsed.listViewDefaults
        : parsed.defaultListFields !== undefined
        ? parsed.defaultListFields
        : listViewObj && listViewObj.metaColumns !== undefined
        ? listViewObj.metaColumns
        : listViewObj && listViewObj.meta !== undefined
        ? listViewObj.meta
        : undefined;
    const hasMetaSetting = metaRaw !== undefined;
    const listViewMetaColumns = this.normalizeListViewMetaColumns(metaRaw);
    const listViewColumnsRaw =
      parsed.listViewColumns !== undefined
        ? parsed.listViewColumns
        : parsed.listViewColumnConfigs !== undefined
        ? parsed.listViewColumnConfigs
        : parsed.listViewRuleColumns !== undefined
        ? parsed.listViewRuleColumns
        : parsed.listView !== undefined && parsed.listView !== null && typeof parsed.listView === 'object'
        ? (parsed.listView.columns ?? parsed.listView.extraColumns ?? parsed.listView.customColumns)
        : undefined;
    const listViewColumns = this.normalizeListViewColumns(listViewColumnsRaw);
    const legendRaw =
      parsed.listViewLegend !== undefined
        ? parsed.listViewLegend
        : parsed.listLegend !== undefined
        ? parsed.listLegend
        : parsed.listView !== undefined && parsed.listView !== null && typeof parsed.listView === 'object'
        ? (parsed.listView.legend ?? parsed.listView.listViewLegend)
        : undefined;
    const listViewLegend = this.normalizeListViewLegend(legendRaw);
    const listViewLegendColumnsRaw =
      parsed.listViewLegendColumns !== undefined
        ? parsed.listViewLegendColumns
        : parsed.legendColumns !== undefined
          ? parsed.legendColumns
          : parsed.listView !== undefined && parsed.listView !== null && typeof parsed.listView === 'object'
            ? ((parsed.listView as any).legendColumns ?? (parsed.listView as any).legendCols)
            : undefined;
    const listViewLegendColumns = (() => {
      if (listViewLegendColumnsRaw === undefined || listViewLegendColumnsRaw === null || listViewLegendColumnsRaw === '') return undefined;
      const n = Number(listViewLegendColumnsRaw);
      if (!Number.isFinite(n)) return undefined;
      return Math.max(1, Math.min(2, Math.round(n)));
    })();

    const listViewSearchRaw =
      parsed.listViewSearch !== undefined
        ? parsed.listViewSearch
        : parsed.listSearch !== undefined
        ? parsed.listSearch
        : listViewObj && listViewObj.search !== undefined
        ? listViewObj.search
        : listViewObj && listViewObj.searchMode !== undefined
        ? listViewObj.searchMode
        : undefined;
    const listViewSearch = this.normalizeListViewSearch(listViewSearchRaw);

    const listViewViewRaw =
      (parsed as any).listViewView !== undefined
        ? (parsed as any).listViewView
        : (parsed as any).listViewViewMode !== undefined
          ? { mode: (parsed as any).listViewViewMode }
          : (parsed as any).listViewMode !== undefined
            ? { mode: (parsed as any).listViewMode }
            : listViewObj && (listViewObj as any).view !== undefined
              ? (listViewObj as any).view
              : listViewObj && (listViewObj as any).ui !== undefined
                ? (listViewObj as any).ui
                : undefined;
    const listViewView = this.normalizeListViewView(listViewViewRaw);
    const fieldDisableRulesRaw =
      (parsed as any).fieldDisableRules !== undefined
        ? (parsed as any).fieldDisableRules
        : (parsed as any).disableFieldsRules !== undefined
          ? (parsed as any).disableFieldsRules
          : (parsed as any).disableFieldRules !== undefined
            ? (parsed as any).disableFieldRules
            : (parsed as any).disableAllFieldsRules !== undefined
              ? (parsed as any).disableAllFieldsRules
              : undefined;
    const fieldDisableRules = (() => {
      const normalized = normalizeFieldDisableRules(fieldDisableRulesRaw);
      if (normalized && normalized.length) return normalized;
      const whenShorthand =
        (parsed as any).disableAllFieldsWhen !== undefined
          ? (parsed as any).disableAllFieldsWhen
          : (parsed as any).disableFieldsWhen !== undefined
            ? (parsed as any).disableFieldsWhen
            : (parsed as any).fieldDisableWhen !== undefined
              ? (parsed as any).fieldDisableWhen
              : undefined;
      if (!whenShorthand || typeof whenShorthand !== 'object') return undefined;
      const bypassFields = normalizeFieldIdList(
        (parsed as any).disableAllFieldsBypass !== undefined
          ? (parsed as any).disableAllFieldsBypass
          : (parsed as any).disableFieldsBypass !== undefined
            ? (parsed as any).disableFieldsBypass
            : (parsed as any).fieldDisableBypassFields
      );
      return [{ when: whenShorthand, bypassFields }];
    })();
    const autoSave = this.normalizeAutoSave(parsed.autoSave || parsed.autosave || parsed.draftSave);
    const auditLogging = this.normalizeAuditLogging(
      parsed.auditLogging !== undefined
        ? parsed.auditLogging
        : parsed.audit !== undefined
        ? parsed.audit
        : parsed.auditLog !== undefined
        ? parsed.auditLog
        : parsed.changeAudit !== undefined
        ? parsed.changeAudit
        : undefined
    );
    const summaryViewEnabled = (() => {
      if (parsed.summaryViewEnabled !== undefined) return Boolean(parsed.summaryViewEnabled);
      if (parsed.summaryView !== undefined) return Boolean(parsed.summaryView);
      if (parsed.summary !== undefined) return Boolean(parsed.summary);
      if (parsed.disableSummaryView !== undefined) return !Boolean(parsed.disableSummaryView);
      return undefined;
    })();

    const summaryHtmlTemplateId = (() => {
      const direct =
        parsed.summaryHtmlTemplateId !== undefined
          ? parsed.summaryHtmlTemplateId
          : parsed.summaryHtmlTemplate !== undefined
            ? parsed.summaryHtmlTemplate
            : parsed.summaryTemplateId !== undefined
              ? parsed.summaryTemplateId
              : undefined;
      if (direct !== undefined) return this.normalizeTemplateId(direct);
      // Optional nested form: { summary: { htmlTemplateId: ... } }
      if (parsed.summary && typeof parsed.summary === 'object') {
        const nested = (parsed.summary as any).htmlTemplateId ?? (parsed.summary as any).summaryHtmlTemplateId;
        if (nested !== undefined) return this.normalizeTemplateId(nested);
      }
      return undefined;
    })();

    const copyCurrentRecordEnabled = (() => {
      if (parsed.copyCurrentRecordEnabled !== undefined) return Boolean(parsed.copyCurrentRecordEnabled);
      if (parsed.copyEnabled !== undefined) return Boolean(parsed.copyEnabled);
      if (parsed.disableCopyCurrentRecord !== undefined) return !Boolean(parsed.disableCopyCurrentRecord);
      if (parsed.disableCopy !== undefined) return !Boolean(parsed.disableCopy);
      return undefined;
    })();

    const copyCurrentRecordDropFieldsRaw =
      parsed.copyCurrentRecordDropFields !== undefined
        ? parsed.copyCurrentRecordDropFields
        : parsed.copyDropFields !== undefined
          ? parsed.copyDropFields
          : parsed.copyDrop !== undefined
            ? parsed.copyDrop
            : undefined;
    const copyCurrentRecordDropFields = (() => {
      const raw = copyCurrentRecordDropFieldsRaw as any;
      if (raw === undefined || raw === null || raw === '') return undefined;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        const parts = trimmed
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
        return parts.length ? parts : undefined;
      }
      const items = Array.isArray(raw) ? raw : [raw];
      const out = items
        .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
        .filter(Boolean);
      return out.length ? out : undefined;
    })();

    const normalizeJsonObject = (value: any): Record<string, any> | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          const parsedValue = JSON.parse(this.sanitizeJson(trimmed));
          if (parsedValue && typeof parsedValue === 'object') return parsedValue as any;
        } catch {
          return undefined;
        }
        return undefined;
      }
      if (typeof value === 'object') return value as any;
      return undefined;
    };

    const copyNested = parsed.copy && typeof parsed.copy === 'object' ? parsed.copy : undefined;

    const copyCurrentRecordProfileRaw =
      parsed.copyCurrentRecordProfile !== undefined
        ? parsed.copyCurrentRecordProfile
        : parsed.copyProfile !== undefined
          ? parsed.copyProfile
          : copyNested && (copyNested as any).profile !== undefined
            ? (copyNested as any).profile
            : copyNested && (copyNested as any).copyCurrentRecordProfile !== undefined
              ? (copyNested as any).copyCurrentRecordProfile
              : undefined;
    const copyCurrentRecordProfile = normalizeJsonObject(copyCurrentRecordProfileRaw) as CopyCurrentRecordProfile | undefined;

    const createButtonLabelRaw =
      parsed.createButtonLabel !== undefined
        ? parsed.createButtonLabel
        : parsed.createLabel !== undefined
          ? parsed.createLabel
          : undefined;
    const createButtonLabel = normalizeLocalized(createButtonLabelRaw);

    const copyCurrentRecordLabelRaw =
      parsed.copyCurrentRecordLabel !== undefined
        ? parsed.copyCurrentRecordLabel
        : parsed.copyLabel !== undefined
          ? parsed.copyLabel
          : undefined;
    const copyCurrentRecordLabel = normalizeLocalized(copyCurrentRecordLabelRaw);

    const copyCurrentRecordDialogRaw =
      parsed.copyCurrentRecordDialog !== undefined
        ? parsed.copyCurrentRecordDialog
        : parsed.copyDialog !== undefined
          ? parsed.copyDialog
          : copyNested && (copyNested as any).dialog !== undefined
            ? (copyNested as any).dialog
            : copyNested && (copyNested as any).copyCurrentRecordDialog !== undefined
              ? (copyNested as any).copyCurrentRecordDialog
              : undefined;
    const copyCurrentRecordDialog = (() => {
      const rawValue = normalizeJsonObject(copyCurrentRecordDialogRaw) as any;
      if (!rawValue || typeof rawValue !== 'object') return undefined;

      const title = normalizeLocalized(rawValue.title);
      const message = normalizeLocalized(rawValue.message);
      const confirmLabel = normalizeLocalized(rawValue.confirmLabel);
      const cancelLabel = normalizeLocalized(rawValue.cancelLabel);
      const out: Record<string, any> = { ...rawValue };
      if (title !== undefined) out.title = title;
      if (message !== undefined) out.message = message;
      if (confirmLabel !== undefined) out.confirmLabel = confirmLabel;
      if (cancelLabel !== undefined) out.cancelLabel = cancelLabel;
      return out as SystemActionGateDialogConfig;
    })();

    const createNewRecordEnabled = (() => {
      if (parsed.createNewRecordEnabled !== undefined) return Boolean(parsed.createNewRecordEnabled);
      if (parsed.newRecordEnabled !== undefined) return Boolean(parsed.newRecordEnabled);
      if (parsed.createBlankRecordEnabled !== undefined) return Boolean(parsed.createBlankRecordEnabled);
      if (parsed.disableCreateNewRecord !== undefined) return !Boolean(parsed.disableCreateNewRecord);
      if (parsed.disableNewRecord !== undefined) return !Boolean(parsed.disableNewRecord);
      if (parsed.disableCreateNew !== undefined) return !Boolean(parsed.disableCreateNew);
      if (parsed.onlyPresetCreate !== undefined) return !Boolean(parsed.onlyPresetCreate);
      return undefined;
    })();

    const createRecordPresetButtonsEnabled = (() => {
      if (parsed.createRecordPresetButtonsEnabled !== undefined) return Boolean(parsed.createRecordPresetButtonsEnabled);
      if (parsed.createRecordPresetEnabled !== undefined) return Boolean(parsed.createRecordPresetEnabled);
      if (parsed.enableCreateRecordPresetButtons !== undefined) return Boolean(parsed.enableCreateRecordPresetButtons);
      if (parsed.disableCreateRecordPresetButtons !== undefined) return !Boolean(parsed.disableCreateRecordPresetButtons);
      if (parsed.disableCreatePresets !== undefined) return !Boolean(parsed.disableCreatePresets);
      return undefined;
    })();

    const actionBars = this.normalizeActionBars(
      parsed.actionBars !== undefined
        ? parsed.actionBars
        : parsed.actionBar !== undefined
        ? parsed.actionBar
        : parsed.actionBarConfig !== undefined
        ? parsed.actionBarConfig
        : parsed.actionButtons !== undefined
        ? parsed.actionButtons
        : parsed.buttonsUi !== undefined
        ? parsed.buttonsUi
        : undefined
    );

    const normalizeString = (input: any): string | undefined => {
      if (input === undefined || input === null) return undefined;
      const s = input.toString().trim();
      return s ? s : undefined;
    };

    const normalizeDriveImageUrl = (input: any): string | undefined => {
      const raw = normalizeString(input);
      if (!raw) return undefined;

      const extractDriveId = (value: string): string | undefined => {
        // Common share formats:
        // - https://drive.google.com/file/d/<ID>/view?...
        // - https://drive.google.com/open?id=<ID>
        // - https://drive.google.com/uc?id=<ID>
        // - https://drive.google.com/uc?export=view&id=<ID>
        const byPath = value.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
        if (byPath && byPath[1]) return byPath[1];
        const byQuery = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
        if (byQuery && byQuery[1]) return byQuery[1];
        return undefined;
      };

      // Full URL: if it's a Drive share link, convert it to a direct-view URL.
      if (/^https?:\/\//i.test(raw)) {
        const id = extractDriveId(raw);
        if (id) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
        return raw;
      }

      // Bare Drive file id: treat it as a Drive image.
      if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
        return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(raw)}`;
      }

      return undefined;
    };

    const appHeaderObj = parsed.appHeader !== undefined && parsed.appHeader !== null && typeof parsed.appHeader === 'object' ? parsed.appHeader : undefined;
    const appHeaderLogoRaw =
      appHeaderObj && (appHeaderObj.logo !== undefined || appHeaderObj.logoUrl !== undefined)
        ? (appHeaderObj.logo ?? appHeaderObj.logoUrl)
        : parsed.appHeaderLogo !== undefined
        ? parsed.appHeaderLogo
        : parsed.appLogo !== undefined
        ? parsed.appLogo
        : parsed.logo !== undefined
        ? parsed.logo
        : parsed.logoUrl !== undefined
        ? parsed.logoUrl
        : undefined;
    const appHeaderLogoUrl = normalizeDriveImageUrl(appHeaderLogoRaw);
    const appHeader: AppHeaderConfig | undefined = appHeaderLogoUrl ? { logoUrl: appHeaderLogoUrl } : undefined;

    const groupBehaviorObj =
      parsed.groupBehavior !== undefined && parsed.groupBehavior !== null && typeof parsed.groupBehavior === 'object'
        ? parsed.groupBehavior
        : parsed.formGroups !== undefined && parsed.formGroups !== null && typeof parsed.formGroups === 'object'
        ? parsed.formGroups
        : undefined;
    const autoCollapseOnComplete =
      groupBehaviorObj && (groupBehaviorObj.autoCollapseOnComplete !== undefined || groupBehaviorObj.collapseOnComplete !== undefined)
        ? Boolean(groupBehaviorObj.autoCollapseOnComplete ?? groupBehaviorObj.collapseOnComplete)
        : parsed.autoCollapseOnComplete !== undefined
        ? Boolean(parsed.autoCollapseOnComplete)
        : undefined;
    const autoOpenNextIncomplete =
      groupBehaviorObj && (groupBehaviorObj.autoOpenNextIncomplete !== undefined || groupBehaviorObj.openNextIncomplete !== undefined)
        ? Boolean(groupBehaviorObj.autoOpenNextIncomplete ?? groupBehaviorObj.openNextIncomplete)
        : parsed.autoOpenNextIncomplete !== undefined
        ? Boolean(parsed.autoOpenNextIncomplete)
        : undefined;
    const autoScrollOnExpand =
      groupBehaviorObj && (groupBehaviorObj.autoScrollOnExpand !== undefined || groupBehaviorObj.scrollOnExpand !== undefined)
        ? Boolean(groupBehaviorObj.autoScrollOnExpand ?? groupBehaviorObj.scrollOnExpand)
        : parsed.autoScrollOnExpand !== undefined
        ? Boolean(parsed.autoScrollOnExpand)
        : undefined;
    const summaryExpandAll =
      groupBehaviorObj &&
      (groupBehaviorObj.summaryExpandAll !== undefined ||
        groupBehaviorObj.summaryKeepExpanded !== undefined ||
        groupBehaviorObj.expandAllInSummary !== undefined ||
        groupBehaviorObj.keepExpandedInSummary !== undefined)
        ? Boolean(
            groupBehaviorObj.summaryExpandAll ??
              groupBehaviorObj.summaryKeepExpanded ??
              groupBehaviorObj.expandAllInSummary ??
              groupBehaviorObj.keepExpandedInSummary
          )
        : parsed.summaryExpandAll !== undefined
          ? Boolean(parsed.summaryExpandAll)
          : undefined;
    const groupBehavior: GroupBehaviorConfig | undefined =
      autoCollapseOnComplete === undefined &&
      autoOpenNextIncomplete === undefined &&
      autoScrollOnExpand === undefined &&
      summaryExpandAll === undefined
        ? undefined
        : {
            autoCollapseOnComplete,
            autoOpenNextIncomplete,
            autoScrollOnExpand,
            summaryExpandAll
          };

    const steps = this.normalizeSteps(
      (parsed as any).steps !== undefined
        ? (parsed as any).steps
        : (parsed as any).guidedSteps !== undefined
          ? (parsed as any).guidedSteps
          : (parsed as any).stepper !== undefined
            ? (parsed as any).stepper
            : (parsed as any).stepsConfig !== undefined
              ? (parsed as any).stepsConfig
              : undefined
    );

    const submissionObj =
      parsed.submission !== undefined && parsed.submission !== null && typeof parsed.submission === 'object' ? parsed.submission : undefined;
    const submitValidationRaw =
      parsed.submitValidation !== undefined
        ? parsed.submitValidation
        : parsed.submitValidationConfig !== undefined
          ? parsed.submitValidationConfig
          : submissionObj && (submissionObj.validation !== undefined || submissionObj.validationConfig !== undefined)
            ? (submissionObj.validation ?? submissionObj.validationConfig)
            : undefined;
    const submitValidationObj =
      submitValidationRaw && typeof submitValidationRaw === 'object' ? (submitValidationRaw as any) : undefined;
    const submitValidationEnforceRaw =
      submitValidationObj?.enforceFieldOrder ??
      submitValidationObj?.orderedFields ??
      submitValidationObj?.orderedEntry ??
      submitValidationObj?.enabled;
    const submitValidationMessageRaw =
      submitValidationObj?.submitTopErrorMessage ??
      submitValidationObj?.submitErrorMessage ??
      submitValidationObj?.topErrorMessage ??
      submitValidationObj?.errorMessage;
    const submitValidation: SubmitValidationConfig | undefined =
      submitValidationEnforceRaw === undefined && submitValidationMessageRaw === undefined
        ? undefined
        : {
            enforceFieldOrder: normalizeBoolean(submitValidationEnforceRaw),
            submitTopErrorMessage: normalizeLocalized(submitValidationMessageRaw)
          };
    const submissionConfirmationRaw =
      parsed.submissionConfirmationMessage !== undefined
        ? parsed.submissionConfirmationMessage
        : parsed.submitConfirmationMessage !== undefined
          ? parsed.submitConfirmationMessage
          : parsed.confirmationMessage !== undefined
            ? parsed.confirmationMessage
            : submissionObj && (submissionObj.confirmationMessage !== undefined || submissionObj.message !== undefined)
              ? (submissionObj.confirmationMessage ?? submissionObj.message)
              : undefined;
    const submissionConfirmationMessage = normalizeLocalized(submissionConfirmationRaw);

    const submissionTitleRaw =
      parsed.submissionConfirmationTitle !== undefined
        ? parsed.submissionConfirmationTitle
        : parsed.submitConfirmationTitle !== undefined
          ? parsed.submitConfirmationTitle
          : parsed.confirmationTitle !== undefined
            ? parsed.confirmationTitle
            : submissionObj && (submissionObj.confirmationTitle !== undefined || submissionObj.title !== undefined)
              ? (submissionObj.confirmationTitle ?? submissionObj.title)
              : undefined;
    const submissionConfirmationTitle = normalizeLocalized(submissionTitleRaw);

    const submissionConfirmLabelRaw =
      parsed.submissionConfirmationConfirmLabel !== undefined
        ? parsed.submissionConfirmationConfirmLabel
        : parsed.submitConfirmationConfirmLabel !== undefined
          ? parsed.submitConfirmationConfirmLabel
          : parsed.confirmationConfirmLabel !== undefined
            ? parsed.confirmationConfirmLabel
            : submissionObj && (submissionObj.confirmLabel !== undefined || submissionObj.confirmButtonLabel !== undefined)
              ? (submissionObj.confirmLabel ?? submissionObj.confirmButtonLabel)
              : undefined;
    const submissionConfirmationConfirmLabel = normalizeLocalized(submissionConfirmLabelRaw);

    const submissionCancelLabelRaw =
      parsed.submissionConfirmationCancelLabel !== undefined
        ? parsed.submissionConfirmationCancelLabel
        : parsed.submitConfirmationCancelLabel !== undefined
          ? parsed.submitConfirmationCancelLabel
          : parsed.confirmationCancelLabel !== undefined
            ? parsed.confirmationCancelLabel
            : submissionObj && (submissionObj.cancelLabel !== undefined || submissionObj.cancelButtonLabel !== undefined)
              ? (submissionObj.cancelLabel ?? submissionObj.cancelButtonLabel)
              : undefined;
    const submissionConfirmationCancelLabel = normalizeLocalized(submissionCancelLabelRaw);

    const dedupDialogRaw =
      parsed.dedupDialog !== undefined
        ? parsed.dedupDialog
        : parsed.dedupDialogConfig !== undefined
          ? parsed.dedupDialogConfig
          : parsed.duplicateDialog !== undefined
            ? parsed.duplicateDialog
            : parsed.dedup !== undefined && parsed.dedup !== null && typeof parsed.dedup === 'object'
              ? (parsed.dedup.dialog ?? parsed.dedup.dialogConfig ?? parsed.dedup.dialogSettings)
              : undefined;
    const dedupDialogObj = dedupDialogRaw && typeof dedupDialogRaw === 'object' ? (dedupDialogRaw as any) : undefined;
    const dedupDialogCandidate: DedupDialogConfig | undefined = dedupDialogObj
      ? {
          title: normalizeLocalized(dedupDialogObj.title ?? dedupDialogObj.header ?? dedupDialogObj.heading),
          intro: normalizeLocalized(
            dedupDialogObj.intro ?? dedupDialogObj.bodyIntro ?? dedupDialogObj.messageIntro ?? dedupDialogObj.bodyStart
          ),
          outro: normalizeLocalized(
            dedupDialogObj.outro ??
              dedupDialogObj.bodyOutro ??
              dedupDialogObj.messageOutro ??
              dedupDialogObj.bodyEnd ??
              dedupDialogObj.footer ??
              dedupDialogObj.prompt
          ),
          changeLabel: normalizeLocalized(dedupDialogObj.changeLabel ?? dedupDialogObj.changeButtonLabel),
          cancelLabel: normalizeLocalized(dedupDialogObj.cancelLabel ?? dedupDialogObj.cancelButtonLabel),
          openLabel: normalizeLocalized(
            dedupDialogObj.openLabel ??
              dedupDialogObj.confirmLabel ??
              dedupDialogObj.openButtonLabel ??
              dedupDialogObj.confirmButtonLabel
          )
        }
      : undefined;
    const dedupDialog =
      dedupDialogCandidate && Object.values(dedupDialogCandidate).some(value => value !== undefined)
        ? dedupDialogCandidate
        : undefined;

    const submitButtonLabelRaw =
      parsed.submitButtonLabel !== undefined
        ? parsed.submitButtonLabel
        : parsed.submitLabel !== undefined
          ? parsed.submitLabel
          : submissionObj && (submissionObj.submitButtonLabel !== undefined || submissionObj.submitLabel !== undefined)
            ? (submissionObj.submitButtonLabel ?? submissionObj.submitLabel)
            : undefined;
    const submitButtonLabel = normalizeLocalized(submitButtonLabelRaw);

    const summaryButtonLabelRaw =
      parsed.summaryButtonLabel !== undefined
        ? parsed.summaryButtonLabel
        : parsed.summaryLabel !== undefined
          ? parsed.summaryLabel
          : undefined;
    const summaryButtonLabel = normalizeLocalized(summaryButtonLabelRaw);
    const dedupDeleteOnKeyChangeRaw =
      (parsed as any).dedupDeleteOnKeyChange !== undefined
        ? (parsed as any).dedupDeleteOnKeyChange
        : (parsed as any).dedupRecreateOnKeyChange !== undefined
          ? (parsed as any).dedupRecreateOnKeyChange
        : (parsed as any).recreateOnDedupKeyChange !== undefined
          ? (parsed as any).recreateOnDedupKeyChange
          : (parsed as any).dedupKeyChangeRecreate !== undefined
            ? (parsed as any).dedupKeyChangeRecreate
            : (parsed as any).recreateRecordOnDedupKeyChange !== undefined
              ? (parsed as any).recreateRecordOnDedupKeyChange
              : (parsed as any).deleteRecordOnDedupKeyChange;
    const dedupDeleteOnKeyChange = normalizeBoolean(dedupDeleteOnKeyChangeRaw);

    const uiObj = parsed.ui !== undefined && parsed.ui !== null && typeof parsed.ui === 'object' ? parsed.ui : undefined;

    const portraitOnlyRaw =
      parsed.portraitOnly !== undefined
        ? parsed.portraitOnly
        : parsed.lockPortrait !== undefined
          ? parsed.lockPortrait
          : parsed.portraitModeOnly !== undefined
            ? parsed.portraitModeOnly
            : parsed.disableLandscape !== undefined
              ? parsed.disableLandscape
              : parsed.avoidLandscape !== undefined
                ? parsed.avoidLandscape
                : uiObj && uiObj.portraitOnly !== undefined
                  ? uiObj.portraitOnly
                  : uiObj && uiObj.lockPortrait !== undefined
                    ? uiObj.lockPortrait
                    : undefined;
    const portraitOnly = normalizeBoolean(portraitOnlyRaw);

    if (
      !followup &&
      templateCacheTtlSeconds === undefined &&
      !listViewTitle &&
      !listViewDefaultSort &&
      listViewPageSize === undefined &&
      listViewPaginationControlsEnabled === undefined &&
      listViewHeaderSortEnabled === undefined &&
      listViewHideHeaderRow === undefined &&
      listViewRowClickEnabled === undefined &&
      !hasMetaSetting &&
      !listViewColumns?.length &&
      !listViewLegend?.length &&
      listViewLegendColumns === undefined &&
      !listViewSearch &&
      !listViewView &&
      !autoSave &&
      !auditLogging &&
      summaryViewEnabled === undefined &&
      !summaryHtmlTemplateId &&
      copyCurrentRecordEnabled === undefined &&
      !copyCurrentRecordDropFields?.length &&
      !copyCurrentRecordProfile &&
      !createButtonLabel &&
      !copyCurrentRecordLabel &&
      !copyCurrentRecordDialog &&
      createNewRecordEnabled === undefined &&
      createRecordPresetButtonsEnabled === undefined &&
      !actionBars &&
      !appHeader &&
      !groupBehavior &&
      !submitValidation &&
      portraitOnly === undefined &&
      !submissionConfirmationMessage &&
      !submissionConfirmationTitle &&
      !submissionConfirmationConfirmLabel &&
      !submissionConfirmationCancelLabel &&
      !dedupDialog &&
      !submitButtonLabel &&
      !summaryButtonLabel &&
      !fieldDisableRules?.length &&
      !languages &&
      defaultLanguage === undefined &&
      languageSelectorEnabled === undefined &&
      !steps &&
      dedupDeleteOnKeyChange === undefined
    ) {
      return undefined;
    }
    return {
      followup,
      templateCacheTtlSeconds,
      listViewTitle,
      listViewDefaultSort,
      listViewPageSize,
      listViewPaginationControlsEnabled,
      listViewHeaderSortEnabled,
      listViewHideHeaderRow,
      listViewRowClickEnabled,
      listViewMetaColumns,
      listViewColumns,
      listViewLegend,
      listViewLegendColumns,
      listViewSearch,
      listViewView,
      autoSave,
      auditLogging,
      summaryViewEnabled,
      summaryHtmlTemplateId,
      copyCurrentRecordEnabled,
      copyCurrentRecordDropFields,
      copyCurrentRecordProfile,
      createButtonLabel,
      copyCurrentRecordLabel,
      copyCurrentRecordDialog,
      createNewRecordEnabled,
      createRecordPresetButtonsEnabled,
      actionBars,
      appHeader,
      groupBehavior,
      submitValidation,
      portraitOnly,
      submissionConfirmationMessage,
      submissionConfirmationTitle,
      submissionConfirmationConfirmLabel,
      submissionConfirmationCancelLabel,
      dedupDialog,
      submitButtonLabel,
      summaryButtonLabel,
      fieldDisableRules,
      languages,
      defaultLanguage,
      languageSelectorEnabled,
      steps,
      dedupDeleteOnKeyChange
    };
  }

  private normalizeActionBars(value: any): ActionBarsConfig | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const cfg: ActionBarsConfig = {};

    const allowedSystem: Set<ActionBarSystemButton> = new Set([
      'home',
      'create',
      'edit',
      'summary',
      'actions',
      'submit'
    ]);
    const allowedPlacements = new Set<ButtonPlacement>([
      'form',
      'formSummaryMenu',
      'summaryBar',
      'topBar',
      'topBarList',
      'topBarForm',
      'topBarSummary',
      'listBar'
    ]);
    const allowedActions = new Set<ButtonAction>([
      'renderDocTemplate',
      'renderMarkdownTemplate',
      'renderHtmlTemplate',
      'createRecordPreset',
      'updateRecord',
      'openUrlField'
    ]);

    const normalizePlacements = (raw: any): ButtonPlacement[] => {
      if (raw === undefined || raw === null) return [];
      const entries: any[] = Array.isArray(raw)
        ? raw
        : raw
            .toString()
            .split(',')
            .map((p: string) => p.trim());
      const normalized = entries
        .map(p => (p === undefined || p === null ? '' : p.toString().trim()))
        .filter(Boolean)
        .filter((p: string) => allowedPlacements.has(p as ButtonPlacement)) as ButtonPlacement[];
      return Array.from(new Set(normalized));
    };

    const normalizeActions = (raw: any): ButtonAction[] | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const entries: any[] = Array.isArray(raw)
        ? raw
        : raw
            .toString()
            .split(',')
            .map((p: string) => p.trim());
      const normalized = entries
        .map(p => (p === undefined || p === null ? '' : p.toString().trim()))
        .filter(Boolean)
        .filter((a: string) => allowedActions.has(a as ButtonAction)) as ButtonAction[];
      const unique = Array.from(new Set(normalized));
      return unique.length ? unique : undefined;
    };

    const normalizeLocalized = (value: any): LocalizedString | undefined => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
      }
      if (typeof value !== 'object') return undefined;
      const out: Record<string, string> = {};
      Object.entries(value).forEach(([key, rawVal]) => {
        if (typeof rawVal !== 'string') return;
        const trimmed = rawVal.trim();
        if (!trimmed) return;
        out[key.toLowerCase()] = trimmed;
      });
      return Object.keys(out).length ? (out as LocalizedString) : undefined;
    };

    const normalizeItems = (raw: any): ActionBarItemConfig[] | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const itemsRaw: any[] = Array.isArray(raw) ? raw : [raw];
      const items: ActionBarItemConfig[] = [];
      itemsRaw.forEach(entry => {
        if (typeof entry === 'string') {
          const id = entry.toString().trim().toLowerCase();
          if (allowedSystem.has(id as ActionBarSystemButton)) {
            items.push(id as ActionBarSystemButton);
          }
          return;
        }
        if (!entry || typeof entry !== 'object') return;
        const type = (entry.type || '').toString().trim();
        if (type === 'system') {
          const idRaw = (entry.id || '').toString().trim().toLowerCase();
          if (!allowedSystem.has(idRaw as ActionBarSystemButton)) return;
          const out: any = { type: 'system', id: idRaw };
          if (entry.hideWhenActive !== undefined) out.hideWhenActive = Boolean(entry.hideWhenActive);
          if (entry.menuBehavior !== undefined) out.menuBehavior = entry.menuBehavior;
          if (entry.summaryBehavior !== undefined) out.summaryBehavior = entry.summaryBehavior;
          if (entry.showCopyCurrentRecord !== undefined) out.showCopyCurrentRecord = Boolean(entry.showCopyCurrentRecord);
          const placements = normalizePlacements(entry.placements ?? entry.placement);
          if (placements.length) out.placements = placements;
          const actions = normalizeActions(entry.actions);
          if (actions && actions.length) out.actions = actions;
          items.push(out as any);
          return;
        }
        if (type === 'custom') {
          const placements = normalizePlacements(entry.placements ?? entry.placement);
          if (!placements.length) return;
          const out: any = { type: 'custom', placements };
          const displayRaw = (entry.display || entry.mode || '').toString().trim().toLowerCase();
          if (displayRaw === 'menu' || displayRaw === 'inline') out.display = displayRaw;
          if (entry.label !== undefined) out.label = entry.label;
          const actions = normalizeActions(entry.actions);
          if (actions && actions.length) out.actions = actions;
          items.push(out as any);
          return;
        }
      });
      return items.length ? items : undefined;
    };

    const normalizeViewConfig = (raw: any): ActionBarViewConfig | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const viewObj = Array.isArray(raw) ? { items: raw } : raw;
      if (!viewObj || typeof viewObj !== 'object') return undefined;
      const items = normalizeItems((viewObj as any).items ?? (viewObj as any).buttons ?? (viewObj as any).capsule);
      const primary = normalizeItems((viewObj as any).primary ?? (viewObj as any).right);
      if (!items?.length && !primary?.length) return undefined;
      const out: ActionBarViewConfig = {};
      if (items?.length) out.items = items;
      if (primary?.length) out.primary = primary;
      return out;
    };

    const normalizeBar = (raw: any, allowSticky: boolean): any => {
      if (!raw || typeof raw !== 'object') return undefined;
      const out: any = {};
      if (allowSticky && raw.sticky !== undefined) out.sticky = Boolean(raw.sticky);
      (['list', 'form', 'summary'] as const).forEach(viewKey => {
        const cfg = normalizeViewConfig((raw as any)[viewKey]);
        if (cfg) out[viewKey] = cfg;
      });
      return Object.keys(out).length ? out : undefined;
    };

    const topRaw = (value as any).top ?? (value as any).topBar;
    const bottomRaw = (value as any).bottom ?? (value as any).bottomBar;
    const top = normalizeBar(topRaw, true);
    const bottom = normalizeBar(bottomRaw, false);
    if (top) cfg.top = top;
    if (bottom) cfg.bottom = bottom;

    const systemRaw = (value as any).system ?? (value as any).systemButtons;
    if (systemRaw && typeof systemRaw === 'object') {
      const homeRaw = (systemRaw as any).home;
      if (homeRaw && typeof homeRaw === 'object') {
        const homeCfg: {
          hideWhenActive?: boolean;
          dedupIncompleteDialog?: DedupIncompleteHomeDialogConfig;
        } = {};
        if ((homeRaw as any).hideWhenActive !== undefined) {
          homeCfg.hideWhenActive = Boolean((homeRaw as any).hideWhenActive);
        }
        const dedupIncompleteDialogRaw =
          (homeRaw as any).dedupIncompleteDialog ??
          (homeRaw as any).incompleteDedupDialog ??
          (homeRaw as any).missingDedupDialog;
        if (dedupIncompleteDialogRaw && typeof dedupIncompleteDialogRaw === 'object') {
          const rawDialog = dedupIncompleteDialogRaw as any;
          const dialog: DedupIncompleteHomeDialogConfig = { ...rawDialog };
          const title = normalizeLocalized(rawDialog.title);
          const message = normalizeLocalized(rawDialog.message);
          const confirmLabel = normalizeLocalized(rawDialog.confirmLabel);
          const cancelLabel = normalizeLocalized(rawDialog.cancelLabel);
          const deleteFailedMessage = normalizeLocalized(rawDialog.deleteFailedMessage);
          if (title !== undefined) dialog.title = title;
          if (message !== undefined) dialog.message = message;
          if (confirmLabel !== undefined) dialog.confirmLabel = confirmLabel;
          if (cancelLabel !== undefined) dialog.cancelLabel = cancelLabel;
          if (deleteFailedMessage !== undefined) dialog.deleteFailedMessage = deleteFailedMessage;
          if (rawDialog.enabled !== undefined) dialog.enabled = Boolean(rawDialog.enabled);
          if (rawDialog.showCancel !== undefined) dialog.showCancel = Boolean(rawDialog.showCancel);
          if (rawDialog.showCloseButton !== undefined) dialog.showCloseButton = Boolean(rawDialog.showCloseButton);
          if (rawDialog.dismissOnBackdrop !== undefined) dialog.dismissOnBackdrop = Boolean(rawDialog.dismissOnBackdrop);
          if (rawDialog.primaryAction === 'cancel' || rawDialog.primaryAction === 'confirm') {
            dialog.primaryAction = rawDialog.primaryAction;
          }
          if (rawDialog.deleteRecordOnConfirm !== undefined) {
            dialog.deleteRecordOnConfirm = Boolean(rawDialog.deleteRecordOnConfirm);
          }
          homeCfg.dedupIncompleteDialog = dialog;
        }
        if (Object.keys(homeCfg).length) {
          cfg.system = cfg.system || {};
          cfg.system.home = homeCfg;
        }
      }
    }

    return Object.keys(cfg).length ? cfg : undefined;
  }

  private normalizeSteps(value: any): StepsConfig | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const normalizeString = (input: any): string => {
      if (input === undefined || input === null) return '';
      return input.toString().trim();
    };

    const normalizeLocalized = (input: any): any => {
      if (input === undefined || input === null) return undefined;
      if (typeof input === 'string') {
        const trimmed = input.trim();
        return trimmed ? trimmed : undefined;
      }
      if (typeof input !== 'object') return undefined;
      const out: Record<string, string> = {};
      Object.entries(input).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        const trimmed = v.trim();
        if (!trimmed) return;
        out[k.toLowerCase()] = trimmed;
      });
      return Object.keys(out).length ? out : undefined;
    };

    const normalizeGate = (raw: any): 'free' | 'whenComplete' | 'whenValid' | undefined => {
      const s = normalizeString(raw).toLowerCase();
      if (!s) return undefined;
      if (s === 'free' || s === 'any' || s === 'always') return 'free';
      if (s === 'whencomplete' || s === 'complete') return 'whenComplete';
      if (s === 'whenvalid' || s === 'valid') return 'whenValid';
      return undefined;
    };

    const normalizeAutoAdvance = (raw: any): 'off' | 'onComplete' | 'onValid' | undefined => {
      const s = normalizeString(raw).toLowerCase();
      if (!s) return undefined;
      if (s === 'off' || s === 'none' || s === 'false' || s === '0') return 'off';
      if (s === 'oncomplete' || s === 'complete') return 'onComplete';
      if (s === 'onvalid' || s === 'valid') return 'onValid';
      return undefined;
    };

    const normalizeDisplayMode = (raw: any): 'inline' | 'overlay' | 'inherit' | undefined => {
      const s = normalizeString(raw).toLowerCase();
      if (!s) return undefined;
      if (s === 'inline') return 'inline';
      if (s === 'overlay') return 'overlay';
      if (s === 'inherit') return 'inherit';
      return undefined;
    };

    const normalizeCondition = (raw: any): any => {
      if (!raw) return undefined;
      if (Array.isArray(raw)) {
        const list = (raw as any[]).map(entry => normalizeCondition(entry)).filter(Boolean);
        if (!list.length) return undefined;
        if (list.length === 1) return list[0];
        return { all: list };
      }
      if (typeof raw !== 'object') return undefined;

      const allRaw = (raw as any).all ?? (raw as any).and;
      if (Array.isArray(allRaw)) {
        const list = (allRaw as any[]).map(entry => normalizeCondition(entry)).filter(Boolean);
        if (!list.length) return undefined;
        if (list.length === 1) return list[0];
        return { all: list };
      }
      const anyRaw = (raw as any).any ?? (raw as any).or;
      if (Array.isArray(anyRaw)) {
        const list = (anyRaw as any[]).map(entry => normalizeCondition(entry)).filter(Boolean);
        if (!list.length) return undefined;
        if (list.length === 1) return list[0];
        return { any: list };
      }
      if (Object.prototype.hasOwnProperty.call(raw as any, 'not')) {
        const nested = normalizeCondition((raw as any).not);
        return nested ? { not: nested } : undefined;
      }

      const fieldId = normalizeString((raw as any).fieldId ?? (raw as any).field ?? (raw as any).id);
      if (!fieldId) return undefined;
      const out: any = { fieldId };
      if ((raw as any).equals !== undefined) out.equals = (raw as any).equals;
      if ((raw as any).greaterThan !== undefined) out.greaterThan = (raw as any).greaterThan;
      if ((raw as any).lessThan !== undefined) out.lessThan = (raw as any).lessThan;
      if ((raw as any).notEmpty !== undefined) out.notEmpty = Boolean((raw as any).notEmpty);
      return out;
    };

    const normalizeRowFilter = (raw: any): any => {
      if (!raw || typeof raw !== 'object') return undefined;
      const includeWhen = normalizeCondition((raw as any).includeWhen);
      const excludeWhen = normalizeCondition((raw as any).excludeWhen);
      if (!includeWhen && !excludeWhen) return undefined;
      const out: any = {};
      if (includeWhen) out.includeWhen = includeWhen;
      if (excludeWhen) out.excludeWhen = excludeWhen;
      return out;
    };

    const normalizeStepContextHeaderPart = (raw: any): any => {
      if (raw === undefined || raw === null) return null;
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        const id = normalizeString(raw);
        return id ? id : null;
      }
      if (typeof raw !== 'object') return null;
      const id = normalizeString((raw as any).id ?? (raw as any).fieldId ?? (raw as any).field);
      return id ? { id } : null;
    };

    const normalizeStepContextHeader = (raw: any): any => {
      if (raw === undefined || raw === null) return undefined;
      const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { parts: raw };
      const keyedParts = Object.keys(source as any)
        .filter(key => /^part\d+$/i.test(key))
        .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')))
        .map(key => (source as any)[key]);
      const partsRaw =
        (source as any).parts ??
        (source as any).fields ??
        (source as any).include ??
        (keyedParts.length ? keyedParts : undefined);
      const partsList: any[] = Array.isArray(partsRaw)
        ? partsRaw
        : typeof partsRaw === 'string'
          ? partsRaw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : partsRaw
            ? [partsRaw]
            : [];
      const parts = partsList.map(entry => normalizeStepContextHeaderPart(entry)).filter(Boolean);
      if (!parts.length) return undefined;
      const out: any = { parts };
      const separator = normalizeString((source as any).separator);
      if (separator) out.separator = separator;
      return out;
    };

    const normalizeTarget = (raw: any): any => {
      if (!raw) return null;
      // Allow compact string as a question id
      if (typeof raw === 'string') {
        const id = normalizeString(raw);
        return id ? { kind: 'question', id } : null;
      }
      if (typeof raw !== 'object') return null;
      const kindRaw = normalizeString((raw as any).kind ?? (raw as any).type).toLowerCase();
      const kind = kindRaw === 'linegroup' || kindRaw === 'line_item_group' ? 'lineGroup' : 'question';
      const id = normalizeString((raw as any).id ?? (raw as any).fieldId);
      if (!id) return null;
      if (kind === 'question') {
        const outQ: any = { kind: 'question', id };
        if ((raw as any).renderAsLabel !== undefined && (raw as any).renderAsLabel !== null) {
          outQ.renderAsLabel = Boolean((raw as any).renderAsLabel);
        }
        return outQ;
      }

      const out: any = { kind: 'lineGroup', id };

      const normalizeFieldTarget = (input: any): any => {
        if (input === undefined || input === null) return null;
        if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
          const fid = normalizeString(input);
          return fid ? fid : null;
        }
        if (typeof input !== 'object') {
          const fid = normalizeString(input);
          return fid ? fid : null;
        }
        const fid = normalizeString((input as any).id ?? (input as any).fieldId ?? (input as any).field);
        if (!fid) return null;
        const outField: any = { id: fid };
        if ((input as any).renderAsLabel !== undefined && (input as any).renderAsLabel !== null) {
          outField.renderAsLabel = Boolean((input as any).renderAsLabel);
        }
        return outField;
      };

      const presRaw = normalizeString((raw as any).presentation).toLowerCase();
      if (presRaw === 'groupeditor' || presRaw === 'group') out.presentation = 'groupEditor';
      if (presRaw === 'liftedrowfields' || presRaw === 'lifted') out.presentation = 'liftedRowFields';
      const fieldsRaw = (raw as any).fields;
      const fields =
        Array.isArray(fieldsRaw)
          ? (fieldsRaw as any[]).map(v => normalizeFieldTarget(v)).filter(Boolean)
          : typeof fieldsRaw === 'string'
            ? fieldsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
      if (fields.length) out.fields = fields;
      const readOnlyFieldsRaw = (raw as any).readOnlyFields;
      const readOnlyFields =
        Array.isArray(readOnlyFieldsRaw)
          ? (readOnlyFieldsRaw as any[]).map(v => normalizeString(v)).filter(Boolean)
          : typeof readOnlyFieldsRaw === 'string'
            ? readOnlyFieldsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
      if (readOnlyFields.length) out.readOnlyFields = readOnlyFields;
      const rows = normalizeRowFilter((raw as any).rows);
      if (rows) out.rows = rows;
      const validationRows = normalizeRowFilter((raw as any).validationRows);
      if (validationRows) out.validationRows = validationRows;
      const collapsedFieldsInHeader =
        (raw as any).collapsedFieldsInHeader !== undefined && (raw as any).collapsedFieldsInHeader !== null
          ? Boolean((raw as any).collapsedFieldsInHeader)
          : false;
      if (collapsedFieldsInHeader) out.collapsedFieldsInHeader = true;
      const displayMode = normalizeDisplayMode((raw as any).displayMode);
      if (displayMode) out.displayMode = displayMode;
      const rowFlowRaw = (raw as any).rowFlow;
      if (rowFlowRaw && typeof rowFlowRaw === 'object') out.rowFlow = rowFlowRaw;

      const groupOverrideRaw = (raw as any).groupOverride;
      if (groupOverrideRaw && typeof groupOverrideRaw === 'object' && !Array.isArray(groupOverrideRaw)) {
        out.groupOverride = groupOverrideRaw;
      }

      const subGroupsRaw = (raw as any).subGroups;
      if (subGroupsRaw && typeof subGroupsRaw === 'object') {
        const sgOut: any = {};
        const sgDisplayMode = normalizeDisplayMode((subGroupsRaw as any).displayMode);
        if (sgDisplayMode) sgOut.displayMode = sgDisplayMode;
        const includeRaw = (subGroupsRaw as any).include;
        const includeList: any[] = Array.isArray(includeRaw) ? includeRaw : includeRaw ? [includeRaw] : [];
        const normalizedSubs: any[] = [];
        includeList.forEach(entry => {
          if (!entry || typeof entry !== 'object') return;
          const sgId = normalizeString((entry as any).id);
          if (!sgId) return;
          const sg: any = { id: sgId };
          const sgFieldsRaw = (entry as any).fields;
          const sgFields =
            Array.isArray(sgFieldsRaw)
              ? (sgFieldsRaw as any[]).map(v => normalizeFieldTarget(v)).filter(Boolean)
              : typeof sgFieldsRaw === 'string'
                ? sgFieldsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];
          if (sgFields.length) sg.fields = sgFields;
          const sgReadOnlyFieldsRaw = (entry as any).readOnlyFields;
          const sgReadOnlyFields =
            Array.isArray(sgReadOnlyFieldsRaw)
              ? (sgReadOnlyFieldsRaw as any[]).map(v => normalizeString(v)).filter(Boolean)
              : typeof sgReadOnlyFieldsRaw === 'string'
                ? sgReadOnlyFieldsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];
          if (sgReadOnlyFields.length) sg.readOnlyFields = sgReadOnlyFields;
          const sgRows = normalizeRowFilter((entry as any).rows);
          if (sgRows) sg.rows = sgRows;
          const sgValidationRows = normalizeRowFilter((entry as any).validationRows);
          if (sgValidationRows) sg.validationRows = sgValidationRows;
          const sgMode = normalizeDisplayMode((entry as any).displayMode);
          if (sgMode) sg.displayMode = sgMode;
          normalizedSubs.push(sg);
        });
        if (normalizedSubs.length) sgOut.include = normalizedSubs;
        if (Object.keys(sgOut).length) out.subGroups = sgOut;
      }

      return out;
    };

    const modeRaw = normalizeString((value as any).mode ?? (value as any).uiMode ?? (value as any).editMode).toLowerCase();
    if (modeRaw && modeRaw !== 'guided') return undefined;

    const stateFieldsRaw = (value as any).stateFields;
    const prefixRaw =
      stateFieldsRaw && typeof stateFieldsRaw === 'object'
        ? normalizeString((stateFieldsRaw as any).prefix)
        : normalizeString((value as any).stateFieldPrefix ?? (value as any).stateFieldsPrefix);
    const stateFields = prefixRaw ? ({ prefix: prefixRaw } as any) : undefined;

    const defaultForwardGate = normalizeGate((value as any).defaultForwardGate);
    const defaultAutoAdvance = normalizeAutoAdvance((value as any).defaultAutoAdvance);
    const stepSubmitLabel = normalizeLocalized((value as any).stepSubmitLabel);
    const backButtonLabel = normalizeLocalized((value as any).backButtonLabel);
    const showBackButtonRaw = (value as any).showBackButton;
    const showBackButton =
      showBackButtonRaw !== undefined && showBackButtonRaw !== null ? Boolean(showBackButtonRaw) : undefined;

    const headerRaw = (value as any).header;
    const header = (() => {
      if (!headerRaw || typeof headerRaw !== 'object') return undefined;
      const includeRaw = (headerRaw as any).include;
      const targetsRaw: any[] = Array.isArray(includeRaw) ? includeRaw : includeRaw ? [includeRaw] : [];
      const include = targetsRaw.map(normalizeTarget).filter(Boolean);
      return include.length ? ({ include } as any) : undefined;
    })();

    const itemsRaw = (value as any).items;
    const itemsList: any[] = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];
    const items: any[] = [];
    itemsList.forEach(stepRaw => {
      if (!stepRaw || typeof stepRaw !== 'object') return;
      const id = normalizeString((stepRaw as any).id);
      if (!id) return;
      const includeRaw = (stepRaw as any).include;
      const includeList: any[] = Array.isArray(includeRaw) ? includeRaw : includeRaw ? [includeRaw] : [];
      const include = includeList.map(normalizeTarget).filter(Boolean);
      if (!include.length) return;
      const step: any = { id, include };
      const label = normalizeLocalized((stepRaw as any).label);
      if (label) step.label = label;
      const helpText = normalizeLocalized((stepRaw as any).helpText);
      if (helpText) step.helpText = helpText;
      const contextHeader = normalizeStepContextHeader((stepRaw as any).contextHeader ?? (stepRaw as any).guidedContextHeader);
      if (contextHeader) step.contextHeader = contextHeader;
      const navRaw = (stepRaw as any).navigation;
      if (navRaw && typeof navRaw === 'object') {
        const nav: any = {};
        const gate = normalizeGate((navRaw as any).forwardGate);
        const adv = normalizeAutoAdvance((navRaw as any).autoAdvance);
        if (gate) nav.forwardGate = gate;
        if (adv) nav.autoAdvance = adv;
        if ((navRaw as any).allowBack !== undefined) nav.allowBack = Boolean((navRaw as any).allowBack);
        const submitLabel = normalizeLocalized((navRaw as any).submitLabel);
        if (submitLabel) nav.submitLabel = submitLabel;
        const backLabel = normalizeLocalized((navRaw as any).backLabel);
        if (backLabel) nav.backLabel = backLabel;
        if ((navRaw as any).showBackButton !== undefined && (navRaw as any).showBackButton !== null) {
          nav.showBackButton = Boolean((navRaw as any).showBackButton);
        }
        if (Object.keys(nav).length) step.navigation = nav;
      }
      const renderRaw = (stepRaw as any).render;
      if (renderRaw && typeof renderRaw === 'object') {
        const render: any = {};
        const lgRaw = (renderRaw as any).lineGroups;
        const sgRaw = (renderRaw as any).subGroups;
        if (lgRaw && typeof lgRaw === 'object') {
          const m = normalizeDisplayMode((lgRaw as any).mode);
          if (m && m !== 'inherit') render.lineGroups = { mode: m };
        }
        if (sgRaw && typeof sgRaw === 'object') {
          const m = normalizeDisplayMode((sgRaw as any).mode);
          if (m && m !== 'inherit') render.subGroups = { mode: m };
        }
        if (Object.keys(render).length) step.render = render;
      }
      items.push(step);
    });
    if (!items.length) return undefined;

    const out: any = { mode: 'guided', items };
    if (stateFields) out.stateFields = stateFields;
    if (defaultForwardGate) out.defaultForwardGate = defaultForwardGate;
    if (defaultAutoAdvance) out.defaultAutoAdvance = defaultAutoAdvance;
    if (stepSubmitLabel) out.stepSubmitLabel = stepSubmitLabel;
    if (backButtonLabel) out.backButtonLabel = backButtonLabel;
    if (showBackButton !== undefined) out.showBackButton = showBackButton;
    if (header) out.header = header;
    return out as StepsConfig;
  }

  private normalizeLanguageCode(value: any): 'EN' | 'FR' | 'NL' | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = value.toString().trim().toUpperCase();
    if (normalized === 'EN' || normalized === 'FR' || normalized === 'NL') {
      return normalized;
    }
    return undefined;
  }

  private normalizeLanguageList(value: any): Array<'EN' | 'FR' | 'NL'> | undefined {
    if (value === undefined || value === null) return undefined;
    const raw: any[] = Array.isArray(value)
      ? value
      : value
          .toString()
          .split(',')
          .map((entry: string) => entry.trim());
    const normalized = raw
      .map(v => this.normalizeLanguageCode(v))
      .filter((v): v is 'EN' | 'FR' | 'NL' => Boolean(v));
    const unique = Array.from(new Set(normalized));
    return unique.length ? unique : undefined;
  }

  private normalizeAutoSave(value: any): AutoSaveConfig | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return { enabled: value };
    if (typeof value !== 'object') return undefined;
    const cfg: AutoSaveConfig = {};
    if ((value as any).enabled !== undefined) cfg.enabled = Boolean((value as any).enabled);
    if ((value as any).debounceMs !== undefined && (value as any).debounceMs !== null) {
      const n = Number((value as any).debounceMs);
      if (Number.isFinite(n)) {
        cfg.debounceMs = Math.max(300, Math.min(60000, n));
      }
    }
    if ((value as any).status !== undefined && (value as any).status !== null) {
      const s = (value as any).status.toString().trim();
      if (s) cfg.status = s;
    }
    return Object.keys(cfg).length ? cfg : undefined;
  }

  private normalizeAuditLogging(value: any): AuditLoggingConfig | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return { enabled: value };
    if (typeof value !== 'object') return undefined;

    const cfg: AuditLoggingConfig = {};
    if ((value as any).enabled !== undefined) cfg.enabled = Boolean((value as any).enabled);

    const sheetNameRaw =
      (value as any).sheetName !== undefined
        ? (value as any).sheetName
        : (value as any).sheet !== undefined
        ? (value as any).sheet
        : (value as any).destinationSheet !== undefined
        ? (value as any).destinationSheet
        : (value as any).tabName !== undefined
        ? (value as any).tabName
        : undefined;
    if (sheetNameRaw !== undefined && sheetNameRaw !== null) {
      const sheetName = sheetNameRaw.toString().trim();
      if (sheetName) cfg.sheetName = sheetName;
    }

    const normalizeStringList = (raw: any): string[] | undefined => {
      if (raw === undefined || raw === null || raw === '') return undefined;
      const list = Array.isArray(raw)
        ? raw
        : raw
            .toString()
            .split(',')
            .map((entry: string) => entry.trim());
      const items = list
        .map((entry: any) => (entry === undefined || entry === null ? '' : entry.toString().trim()))
        .filter(Boolean);
      if (!items.length) return undefined;
      return Array.from(new Set(items));
    };

    const statusesRaw =
      (value as any).statuses !== undefined
        ? (value as any).statuses
        : (value as any).enabledStatuses !== undefined
        ? (value as any).enabledStatuses
        : (value as any).statusAllowList !== undefined
        ? (value as any).statusAllowList
        : (value as any).statusesAllowList !== undefined
        ? (value as any).statusesAllowList
        : undefined;
    const statuses = normalizeStringList(statusesRaw);
    if (statuses?.length) cfg.statuses = statuses;

    const snapshotButtonsRaw =
      (value as any).snapshotButtons !== undefined
        ? (value as any).snapshotButtons
        : (value as any).snapshotOnButtons !== undefined
        ? (value as any).snapshotOnButtons
        : (value as any).snapshotButtonIds !== undefined
        ? (value as any).snapshotButtonIds
        : (value as any).lockButtons !== undefined
        ? (value as any).lockButtons
        : undefined;
    const snapshotButtons = normalizeStringList(snapshotButtonsRaw);
    if (snapshotButtons?.length) cfg.snapshotButtons = snapshotButtons;

    return Object.keys(cfg).length ? cfg : undefined;
  }

  private buildFollowupConfig(source: any): FollowupConfig | undefined {
    if (!source || typeof source !== 'object') return undefined;
    const config: FollowupConfig = {};
    const normalizeOptionalString = (value: any): string | undefined => {
      if (value === undefined || value === null) return undefined;
      const text = value.toString().trim();
      return text ? text : undefined;
    };
    config.pdfTemplateId = this.normalizeTemplateId(source.pdfTemplateId);
    if (source.pdfFolderId) config.pdfFolderId = source.pdfFolderId;
    if (source.pdfFileNameFieldId) config.pdfFileNameFieldId = source.pdfFileNameFieldId;
    config.emailTemplateId = this.normalizeTemplateId(source.emailTemplateId);
    if (source.emailSubject) config.emailSubject = source.emailSubject;
    const emailFromRaw = source.emailFrom ?? source.emailSender ?? source.senderEmail ?? source.from;
    const emailFrom = normalizeOptionalString(emailFromRaw);
    if (emailFrom) config.emailFrom = emailFrom;
    const emailFromNameRaw = source.emailFromName ?? source.emailSenderName ?? source.senderName ?? source.fromName;
    const emailFromName = normalizeOptionalString(emailFromNameRaw);
    if (emailFromName) config.emailFromName = emailFromName;
    if (source.emailRecipients) {
      config.emailRecipients = this.normalizeRecipientEntries(source.emailRecipients);
    }
    if (source.emailCc || source.emailCcRecipients) {
      config.emailCc = this.normalizeRecipientEntries(source.emailCc || source.emailCcRecipients);
    }
    if (source.emailBcc || source.emailBccRecipients) {
      config.emailBcc = this.normalizeRecipientEntries(source.emailBcc || source.emailBccRecipients);
    }
    if (source.statusFieldId) config.statusFieldId = source.statusFieldId;
    const transitionsSource = source.statusTransitions || source.transitions || {};
    if (transitionsSource && typeof transitionsSource === 'object') {
      const transitions: FollowupStatusConfig = {};
      if (transitionsSource.inProgress) transitions.inProgress = transitionsSource.inProgress;
      if (transitionsSource.reOpened) transitions.reOpened = transitionsSource.reOpened;
      if (transitionsSource.onPdf) transitions.onPdf = transitionsSource.onPdf;
      if (transitionsSource.onEmail) transitions.onEmail = transitionsSource.onEmail;
      if (transitionsSource.onClose) transitions.onClose = transitionsSource.onClose;
      if (Object.keys(transitions).length) {
        config.statusTransitions = transitions;
      }
    }
    return Object.keys(config).length ? config : undefined;
  }

  private normalizeListViewMetaColumns(value: any): string[] | undefined {
    if (value === undefined || value === null) return undefined;
    const rawEntries: string[] = Array.isArray(value)
      ? value
      : value.toString().split(',').map((entry: string) => entry.trim());
    const allowedMap: Record<string, string> = {
      createdat: 'createdAt',
      created_at: 'createdAt',
      created: 'createdAt',
      updatedat: 'updatedAt',
      updated_at: 'updatedAt',
      updated: 'updatedAt',
      status: 'status',
      pdfurl: 'pdfUrl',
      pdf_url: 'pdfUrl',
      pdf: 'pdfUrl'
    };
    const normalized = rawEntries
      .map((entry: string) => entry && entry.toString().trim().toLowerCase())
      .filter(Boolean)
      .map((key: string) => allowedMap[key!] || '')
      .filter(Boolean);
    const unique = Array.from(new Set(normalized)) as string[];
    // Explicit empty array (or "no valid entries") should be respected as "no meta columns".
    return unique;
  }

  private normalizeListViewColumns(value: any): ListViewColumnConfig[] | undefined {
    if (value === undefined || value === null) return undefined;
    const raw: any[] = Array.isArray(value) ? value : [value];
    const columns: ListViewColumnConfig[] = [];

    const metaSet = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const allowedShowIn = new Set(['table', 'cards']);
    const allowedRuleStyles = new Set(['link', 'warning', 'muted', 'default']);
    const allowedIcons = new Set(['warning', 'check', 'error', 'info', 'external', 'lock', 'edit', 'copy', 'view']);
    const allowedOpenViews = new Set(['auto', 'form', 'summary', 'button', 'copy', 'submit']);

    const normalizeOpenViewTarget = (raw: any): string | undefined => {
      const s = raw !== undefined && raw !== null ? raw.toString().trim().toLowerCase() : '';
      return s && allowedOpenViews.has(s) ? s : undefined;
    };

    const normalizeOpenButtonId = (entry: any, openViewRaw?: any): string => {
      const openButtonRaw =
        (entry as any).openButtonId !== undefined
          ? (entry as any).openButtonId
          : (entry as any).buttonId !== undefined
            ? (entry as any).buttonId
            : (entry as any).openButton !== undefined
              ? (entry as any).openButton
              : (entry as any).actionButtonId !== undefined
                ? (entry as any).actionButtonId
                : undefined;
      const openButtonId = openButtonRaw !== undefined && openButtonRaw !== null ? openButtonRaw.toString().trim() : '';
      if (openButtonId) return openButtonId;
      if (openViewRaw && typeof openViewRaw === 'object') {
        const nested =
          (openViewRaw as any).openButtonId !== undefined
            ? (openViewRaw as any).openButtonId
            : (openViewRaw as any).buttonId !== undefined
              ? (openViewRaw as any).buttonId
              : (openViewRaw as any).openButton !== undefined
                ? (openViewRaw as any).openButton
                : (openViewRaw as any).actionButtonId !== undefined
                  ? (openViewRaw as any).actionButtonId
                  : undefined;
        const nestedId = nested !== undefined && nested !== null ? nested.toString().trim() : '';
        if (nestedId) return nestedId;
      }
      return '';
    };

    const normalizeOpenViewConfig = (entry: any): { openView?: any; openViewTarget?: string; rowClick?: boolean; openButtonId?: string } => {
      const raw = (entry as any).openView ?? (entry as any).open ?? (entry as any).view ?? undefined;
      if (raw === undefined || raw === null) {
        const openButtonId = normalizeOpenButtonId(entry, undefined);
        return openButtonId ? { openButtonId } : {};
      }
      if (typeof raw === 'string') {
        const target = normalizeOpenViewTarget(raw);
        const openButtonId = normalizeOpenButtonId(entry, raw);
        if (!target) return openButtonId ? { openButtonId } : {};
        return {
          openView: target,
          openViewTarget: target,
          openButtonId: openButtonId || undefined
        };
      }
      if (typeof raw === 'object') {
        const target = normalizeOpenViewTarget((raw as any).target ?? (raw as any).view ?? (raw as any).open ?? (raw as any).openView);
        const rowClickRaw = (raw as any).rowClick ?? (raw as any).row ?? (raw as any).applyToRow ?? (raw as any).applyToRowClick;
        const rowClick = rowClickRaw !== undefined ? Boolean(rowClickRaw) : undefined;
        const openButtonId = normalizeOpenButtonId(entry, raw);
        if (!target) return openButtonId ? { openButtonId } : {};
        return {
          openView: rowClick !== undefined ? ({ target, rowClick } as any) : target,
          openViewTarget: target,
          rowClick,
          openButtonId: openButtonId || undefined
        };
      }
      const openButtonId = normalizeOpenButtonId(entry, raw);
      return openButtonId ? { openButtonId } : {};
    };

    const normalizeLocalized = (input: any): any => {
      if (input === undefined || input === null) return undefined;
      if (typeof input === 'string') return input;
      if (typeof input !== 'object') return undefined;
      // Allow any language keys; keep as-is.
      const out: Record<string, string> = {};
      Object.entries(input).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        const trimmed = v.trim();
        if (trimmed) out[k] = trimmed;
      });
      return Object.keys(out).length ? out : undefined;
    };

    const normalizeShowIn = (entry: any): Array<'table' | 'cards'> | undefined => {
      const raw =
        (entry as any)?.showIn !== undefined
          ? (entry as any).showIn
          : (entry as any)?.showInModes !== undefined
            ? (entry as any).showInModes
            : (entry as any)?.modes !== undefined
              ? (entry as any).modes
              : (entry as any)?.views !== undefined
                ? (entry as any).views
                : (entry as any)?.view !== undefined
                  ? (entry as any).view
                  : (entry as any)?.onlyIn !== undefined
                    ? (entry as any).onlyIn
                    : undefined;
      if (raw === undefined || raw === null || raw === '') return undefined;

      const normalizeToken = (v: any): 'table' | 'cards' | null => {
        const s = v !== undefined && v !== null ? v.toString().trim().toLowerCase() : '';
        if (!s) return null;
        if (s === 'both' || s === 'all') return null;
        if (s === 'list' || s === 'card') return 'cards';
        return allowedShowIn.has(s) ? (s as any) : null;
      };

      if (typeof raw === 'string') {
        const s = raw.trim().toLowerCase();
        if (!s) return undefined;
        if (s === 'both' || s === 'all') return ['table', 'cards'];
        const single = normalizeToken(s);
        return single ? [single] : undefined;
      }

      const items = Array.isArray(raw) ? raw : [raw];
      const out: Array<'table' | 'cards'> = [];
      items.forEach(v => {
        const token = normalizeToken(v);
        if (!token) return;
        if (out.includes(token)) return;
        out.push(token);
      });
      return out.length ? out : undefined;
    };

    const normalizeWhen = (when: any): any => {
      if (when === undefined || when === null) return undefined;
      if (Array.isArray(when)) {
        const list = when.map(normalizeWhen).filter(Boolean);
        return list.length ? ({ all: list } as any) : undefined;
      }
      if (typeof when !== 'object') return undefined;
      if (Array.isArray((when as any).all)) {
        const list = ((when as any).all as any[]).map(normalizeWhen).filter(Boolean);
        return list.length ? ({ all: list } as any) : undefined;
      }
      if (Array.isArray((when as any).any)) {
        const list = ((when as any).any as any[]).map(normalizeWhen).filter(Boolean);
        return list.length ? ({ any: list } as any) : undefined;
      }
      const fieldIdRaw = (when as any).fieldId ?? (when as any).field ?? (when as any).id;
      const fieldId = fieldIdRaw !== undefined && fieldIdRaw !== null ? fieldIdRaw.toString().trim() : '';
      if (!fieldId) return undefined;
      const out: any = { fieldId };
      if ((when as any).equals !== undefined) out.equals = (when as any).equals;
      if ((when as any).notEquals !== undefined) out.notEquals = (when as any).notEquals;
      if ((when as any).notEmpty !== undefined) out.notEmpty = Boolean((when as any).notEmpty);
      if ((when as any).isToday !== undefined) out.isToday = Boolean((when as any).isToday);
      if ((when as any).isNotToday !== undefined) out.isNotToday = Boolean((when as any).isNotToday);
      return out;
    };

    const normalizeRuleAction = (entry: any): any | null => {
      if (!entry || typeof entry !== 'object') return null;
      const text = normalizeLocalized((entry as any).text ?? (entry as any).value ?? (entry as any).label);
      if (text === undefined) return null;
      const out: any = { text };
      if ((entry as any).hideText !== undefined) out.hideText = Boolean((entry as any).hideText);
      const styleRaw = ((entry as any).style ?? (entry as any).variant ?? (entry as any).tone ?? '').toString().trim().toLowerCase();
      if (styleRaw && allowedRuleStyles.has(styleRaw)) out.style = styleRaw;
      const iconRaw = ((entry as any).icon ?? '').toString().trim().toLowerCase();
      if (iconRaw && allowedIcons.has(iconRaw)) out.icon = iconRaw;
      const hrefRaw =
        (entry as any).hrefFieldId !== undefined
          ? (entry as any).hrefFieldId
          : (entry as any).urlFieldId !== undefined
          ? (entry as any).urlFieldId
          : (entry as any).linkFieldId !== undefined
          ? (entry as any).linkFieldId
          : (entry as any).hrefField !== undefined
          ? (entry as any).hrefField
          : (entry as any).urlField !== undefined
          ? (entry as any).urlField
          : undefined;
      const hrefFieldId = hrefRaw !== undefined && hrefRaw !== null ? hrefRaw.toString().trim() : '';
      if (hrefFieldId) out.hrefFieldId = hrefFieldId;

      const open = normalizeOpenViewConfig(entry);
      if (open.openView !== undefined) out.openView = open.openView;
      if (open.openButtonId) out.openButtonId = open.openButtonId;
      return out;
    };

    const normalizeRuleCase = (entry: any): any | null => {
      if (!entry || typeof entry !== 'object') return null;
      const text = normalizeLocalized((entry as any).text ?? (entry as any).value ?? (entry as any).label);
      const out: any = {};
      if (text !== undefined) out.text = text;
      else out.text = '';
      const when = normalizeWhen((entry as any).when ?? (entry as any).if ?? (entry as any).condition);
      if (when) out.when = when;
      if ((entry as any).hideText !== undefined) out.hideText = Boolean((entry as any).hideText);
      const styleRaw = ((entry as any).style ?? (entry as any).variant ?? (entry as any).tone ?? '').toString().trim().toLowerCase();
      if (styleRaw && allowedRuleStyles.has(styleRaw)) out.style = styleRaw;
      const iconRaw = ((entry as any).icon ?? '').toString().trim().toLowerCase();
      if (iconRaw && allowedIcons.has(iconRaw)) out.icon = iconRaw;
      const actionsRaw = Array.isArray((entry as any).actions) ? ((entry as any).actions as any[]) : [];
      const actions = actionsRaw.map(normalizeRuleAction).filter(Boolean);
      if (actions.length) out.actions = actions;
      const hrefRaw =
        (entry as any).hrefFieldId !== undefined
          ? (entry as any).hrefFieldId
          : (entry as any).urlFieldId !== undefined
          ? (entry as any).urlFieldId
          : (entry as any).linkFieldId !== undefined
          ? (entry as any).linkFieldId
          : (entry as any).hrefField !== undefined
          ? (entry as any).hrefField
          : (entry as any).urlField !== undefined
          ? (entry as any).urlField
          : undefined;
      const hrefFieldId = hrefRaw !== undefined && hrefRaw !== null ? hrefRaw.toString().trim() : '';
      if (hrefFieldId) out.hrefFieldId = hrefFieldId;

      const open = normalizeOpenViewConfig(entry);
      if (open.openView !== undefined) out.openView = open.openView;
      if (open.openButtonId) out.openButtonId = open.openButtonId;
      return out;
    };

    raw.forEach(entry => {
      if (typeof entry === 'string') {
        const fieldId = entry.trim();
        if (!fieldId) return;
        columns.push({ fieldId, kind: metaSet.has(fieldId) ? 'meta' : 'question' });
        return;
      }
      if (!entry || typeof entry !== 'object') return;

      const typeRaw = ((entry as any).type ?? (entry as any).columnType ?? (entry as any).kind ?? '').toString().trim().toLowerCase();
      const type = typeRaw === 'rule' || typeRaw === 'computed' ? 'rule' : 'field';

      const fieldIdRaw = (entry as any).fieldId ?? (entry as any).id ?? (entry as any).key;
      const fieldId = fieldIdRaw !== undefined && fieldIdRaw !== null ? fieldIdRaw.toString().trim() : '';
      if (!fieldId) return;

      if (type === 'rule') {
        const label = normalizeLocalized((entry as any).label ?? (entry as any).header ?? (entry as any).title) || fieldId;
        const casesRaw = Array.isArray((entry as any).cases)
          ? ((entry as any).cases as any[])
          : Array.isArray((entry as any).rules)
          ? ((entry as any).rules as any[])
          : [];
        const cases = casesRaw.map(normalizeRuleCase).filter(Boolean);
        if (!cases.length) return;
        const out: any = { type: 'rule', fieldId, label, cases };
        const showIn = normalizeShowIn(entry);
        if (showIn) out.showIn = showIn;
        const def = normalizeRuleCase((entry as any).default);
        if (def) {
          out.default = {
            text: def.text,
            hideText: def.hideText,
            style: def.style,
            icon: def.icon,
            actions: def.actions,
            hrefFieldId: def.hrefFieldId,
            openView: def.openView,
            openButtonId: def.openButtonId
          };
        }
        const colHrefRaw =
          (entry as any).hrefFieldId !== undefined
            ? (entry as any).hrefFieldId
            : (entry as any).urlFieldId !== undefined
            ? (entry as any).urlFieldId
            : (entry as any).linkFieldId !== undefined
            ? (entry as any).linkFieldId
            : undefined;
        const colHrefFieldId = colHrefRaw !== undefined && colHrefRaw !== null ? colHrefRaw.toString().trim() : '';
        if (colHrefFieldId) out.hrefFieldId = colHrefFieldId;
        const open = normalizeOpenViewConfig(entry);
        if (open.openView !== undefined) out.openView = open.openView;
        if (open.openButtonId) out.openButtonId = open.openButtonId;
        if ((entry as any).sortable !== undefined) out.sortable = Boolean((entry as any).sortable);
        columns.push(out as ListViewColumnConfig);
        return;
      }

      const label = normalizeLocalized((entry as any).label ?? (entry as any).header ?? (entry as any).title);
      const kindRaw = ((entry as any).kind ?? '').toString().trim().toLowerCase();
      const kind = kindRaw === 'meta' || metaSet.has(fieldId) ? 'meta' : 'question';
      const out: any = { fieldId, kind };
      if (label) out.label = label;
      const showIn = normalizeShowIn(entry);
      if (showIn) out.showIn = showIn;
      columns.push(out as ListViewColumnConfig);
    });

    return columns.length ? columns : undefined;
  }

  private normalizeListViewLegend(value: any): ListViewLegendItem[] | undefined {
    if (value === undefined || value === null) return undefined;
    const allowedIcons = new Set(['warning', 'check', 'error', 'info', 'external', 'lock', 'edit', 'copy', 'view']);

    const normalizeLocalized = (input: any): any => {
      if (input === undefined || input === null) return undefined;
      if (typeof input === 'string') return input;
      if (typeof input !== 'object') return undefined;
      const out: Record<string, string> = {};
      Object.entries(input).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        const trimmed = v.trim();
        if (trimmed) out[k] = trimmed;
      });
      return Object.keys(out).length ? out : undefined;
    };

    const items: ListViewLegendItem[] = [];
    const seenIcons = new Set<string>();
    const normalizePill = (input: any): ListViewLegendItem['pill'] | undefined => {
      if (!input || typeof input !== 'object') return undefined;
      const text = normalizeLocalized((input as any).text ?? (input as any).label ?? (input as any).title);
      if (!text) return undefined;
      const toneRaw = ((input as any).tone ?? (input as any).color ?? (input as any).variant ?? '')
        .toString()
        .trim()
        .toLowerCase();
      const tone = toneRaw === 'default' || toneRaw === 'muted' || toneRaw === 'strong' ? (toneRaw as any) : undefined;
      return tone ? ({ text, tone } as any) : ({ text } as any);
    };
    const push = (iconRaw: any, textRaw: any, pillRaw?: any) => {
      const text = normalizeLocalized(textRaw);
      if (!text) return;
      const pill = normalizePill(pillRaw);

      const icon = (iconRaw || '').toString().trim().toLowerCase();
      if (!icon) {
        items.push(pill ? ({ text, pill } as any) : ({ text } as any));
        return;
      }
      if (!allowedIcons.has(icon) || seenIcons.has(icon)) return;
      seenIcons.add(icon);
      items.push(pill ? ({ icon: icon as any, text, pill } as any) : ({ icon: icon as any, text } as any));
    };

    // Accept object map form: { warning: "Missing date", error: {en: "..."} }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const v = value as any;
      const looksLikeSingle =
        v.icon !== undefined || v.text !== undefined || v.label !== undefined || v.description !== undefined;
      if (!looksLikeSingle) {
        Object.entries(v).forEach(([k, v2]) => push(k, v2));
        return items.length ? items : undefined;
      }
    }

    const raw: any[] = Array.isArray(value) ? value : [value];
    raw.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      push(
        (entry as any).icon,
        (entry as any).text ?? (entry as any).label ?? (entry as any).description,
        (entry as any).pill
      );
    });
    return items.length ? items : undefined;
  }

  private normalizeListViewSearch(value: any): ListViewSearchConfig | undefined {
    if (value === undefined || value === null) return undefined;

    const normalizeLocalizedMaybeEmpty = (input: any): any => {
      if (input === undefined) return undefined;
      if (input === null) return '';
      if (typeof input === 'string') return input.trim();
      if (typeof input !== 'object') return undefined;
      const out: Record<string, string> = {};
      Object.entries(input).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        const s = v.toString().trim();
        if (!s) return;
        out[k.toLowerCase()] = s;
      });
      return Object.keys(out).length ? out : '';
    };

    const normalizeMode = (raw: any): 'text' | 'date' | 'advanced' | undefined => {
      if (!raw) return undefined;
      const mode = raw.toString().trim().toLowerCase();
      if (!mode) return undefined;
      if (mode === 'text' || mode === 'default' || mode === 'keyword') return 'text';
      if (mode === 'date' || mode === 'bydate' || mode === 'dateonly') return 'date';
      if (mode === 'advanced' || mode === 'filters' || mode === 'filter' || mode === 'gmail') return 'advanced';
      return undefined;
    };

    // Support compact string forms:
    // - "text"
    // - "date"
    // - "advanced"
    // - "date:FIELD_ID"
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return undefined;
      const split = raw.split(':');
      if (split.length >= 2) {
        const mode = normalizeMode(split[0]);
        if (mode === 'date') {
          const dateFieldId = split
            .slice(1)
            .join(':')
            .trim();
          return dateFieldId ? { mode: 'date', dateFieldId } : { mode: 'date' };
        }
      }
      const mode = normalizeMode(raw);
      return mode ? { mode } : undefined;
    }

    if (typeof value !== 'object') return undefined;
    const mode = normalizeMode((value as any).mode ?? (value as any).type ?? (value as any).kind ?? (value as any).searchMode);
    if (!mode) return undefined;
    const placeholderRaw =
      (value as any).placeholder !== undefined
        ? (value as any).placeholder
        : (value as any).placeholderText !== undefined
          ? (value as any).placeholderText
          : (value as any).searchPlaceholder !== undefined
            ? (value as any).searchPlaceholder
            : (value as any).hint !== undefined
              ? (value as any).hint
              : undefined;
    const placeholder = normalizeLocalizedMaybeEmpty(placeholderRaw);
    const presetsTitleRaw = (value as any).presetsTitle;
    const presetsTitle = normalizeLocalizedMaybeEmpty(presetsTitleRaw);
    if (mode === 'advanced') {
      const fieldsRaw =
        (value as any).fields !== undefined
          ? (value as any).fields
          : (value as any).fieldIds !== undefined
            ? (value as any).fieldIds
            : (value as any).filters !== undefined
              ? (value as any).filters
              : undefined;
      const fields = (() => {
        if (fieldsRaw === undefined || fieldsRaw === null || fieldsRaw === '') return undefined;
        if (typeof fieldsRaw === 'string') {
          const parts = fieldsRaw
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);
          return parts.length ? parts : undefined;
        }
        const items = Array.isArray(fieldsRaw) ? fieldsRaw : [fieldsRaw];
        const out = items
          .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
          .filter(Boolean);
        return out.length ? out : undefined;
      })();
      const out: any = fields ? { mode: 'advanced', fields } : { mode: 'advanced' };
      if (placeholder !== undefined) out.placeholder = placeholder;
      if (presetsTitle !== undefined) out.presetsTitle = presetsTitle;
      return out as ListViewSearchConfig;
    }
    if (mode !== 'date') {
      const out: any = { mode };
      if (placeholder !== undefined) out.placeholder = placeholder;
      if (presetsTitle !== undefined) out.presetsTitle = presetsTitle;
      return out as ListViewSearchConfig;
    }

    const fidRaw =
      (value as any).dateFieldId !== undefined
        ? (value as any).dateFieldId
        : (value as any).fieldId !== undefined
        ? (value as any).fieldId
        : (value as any).dateField !== undefined
        ? (value as any).dateField
        : (value as any).field !== undefined
        ? (value as any).field
        : undefined;
    const dateFieldId = fidRaw !== undefined && fidRaw !== null ? fidRaw.toString().trim() : '';
    const out: any = dateFieldId ? { mode: 'date', dateFieldId } : { mode: 'date' };
    if (placeholder !== undefined) out.placeholder = placeholder;
    if (presetsTitle !== undefined) out.presetsTitle = presetsTitle;
    return out as ListViewSearchConfig;
  }

  private normalizeListViewView(value: any): ListViewViewConfig | undefined {
    if (value === undefined || value === null) return undefined;

    const normalizeMode = (raw: any): 'table' | 'cards' | undefined => {
      if (raw === undefined || raw === null || raw === '') return undefined;
      const mode = raw.toString().trim().toLowerCase();
      if (!mode) return undefined;
      if (mode === 'table' || mode === 'grid') return 'table';
      if (mode === 'cards' || mode === 'card' || mode === 'list') return 'cards';
      return undefined;
    };

    if (typeof value === 'string') {
      const mode = normalizeMode(value);
      return mode ? { mode } : undefined;
    }
    if (typeof value !== 'object') return undefined;

    const mode = normalizeMode((value as any).mode ?? (value as any).viewMode ?? (value as any).type ?? (value as any).kind);
    const toggleEnabledRaw =
      (value as any).toggleEnabled !== undefined
        ? (value as any).toggleEnabled
        : (value as any).showToggle !== undefined
          ? (value as any).showToggle
          : (value as any).toggle !== undefined
            ? (value as any).toggle
            : undefined;
    const toggleEnabled = toggleEnabledRaw !== undefined ? Boolean(toggleEnabledRaw) : undefined;
    const defaultMode = normalizeMode((value as any).defaultMode ?? (value as any).default ?? (value as any).initialMode);

    const out: ListViewViewConfig = {};
    if (mode) out.mode = mode;
    if (toggleEnabled !== undefined) out.toggleEnabled = toggleEnabled;
    if (defaultMode) out.defaultMode = defaultMode;
    return Object.keys(out).length ? out : undefined;
  }

  private normalizeTemplateId(value: any): FollowupConfig['pdfTemplateId'] {
    if (!value) return undefined;

    const normalizeBase = (raw: any): any => {
      if (!raw) return undefined;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        return trimmed ? trimmed : undefined;
      }
      if (typeof raw === 'object') {
        const map: Record<string, string> = {};
        Object.entries(raw).forEach(([lang, id]) => {
          if (typeof id !== 'string') return;
          const trimmed = id.trim();
          if (!trimmed) return;
          map[lang.toUpperCase()] = trimmed;
        });
        return Object.keys(map).length ? map : undefined;
      }
      return undefined;
    };

    // Conditional selector: { cases: [{ when: { fieldId, ... }, templateId: "..." | {EN: "..."} }], default?: ... }
    if (typeof value === 'object' && Array.isArray((value as any).cases)) {
      const casesRaw = (value as any).cases as any[];
      const cases: any[] = [];
      casesRaw.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        const whenRaw = (entry as any).when || (entry as any).condition;
        if (!whenRaw || typeof whenRaw !== 'object') return;
        const fieldIdRaw = (whenRaw as any).fieldId || (whenRaw as any).field || (whenRaw as any).id;
        const fieldId = fieldIdRaw ? fieldIdRaw.toString().trim() : '';
        if (!fieldId) return;
        const when = { ...(whenRaw as any), fieldId };

        const templateIdRaw =
          (entry as any).templateId ?? (entry as any).template ?? (entry as any).docTemplateId ?? (entry as any).docId ?? (entry as any).id;
        const templateId = normalizeBase(templateIdRaw);
        if (!templateId) return;
        cases.push({ when, templateId });
      });
      const def = normalizeBase((value as any).default);
      if (!cases.length && !def) return undefined;
      const out: any = { cases };
      if (def) out.default = def;
      return out;
    }

    // Base template id: string or language map
    return normalizeBase(value);
  }

  private normalizeRecipientEntries(value: any): EmailRecipientEntry[] | undefined {
    if (!value) return undefined;
    const entries: EmailRecipientEntry[] = [];
    const pushString = (input: string) => {
      const trimmed = input.trim();
      if (trimmed) entries.push(trimmed);
    };
    const consume = (entry: any) => {
      if (typeof entry === 'string') {
        pushString(entry);
        return;
      }
      if (entry && typeof entry === 'object' && entry.type === 'dataSource') {
        const normalized = this.normalizeRecipientDataSource(entry);
        if (normalized) entries.push(normalized);
      }
    };
    if (Array.isArray(value)) {
      value.forEach(consume);
    } else if (typeof value === 'string') {
      value.split(/[,;\n]/).forEach(str => pushString(str));
    } else if (typeof value === 'object') {
      consume(value);
    }
    return entries.length ? entries : undefined;
  }

  private normalizeRecipientDataSource(entry: any): EmailRecipientDataSourceConfig | undefined {
    const dataSource = entry?.dataSource;
    const recordFieldId = entry?.recordFieldId || entry?.fieldId;
    const lookupField = entry?.lookupField || entry?.matchField;
    const valueField = entry?.valueField || entry?.emailField || entry?.targetField;
    if (!dataSource || !recordFieldId || !lookupField || !valueField) return undefined;
    const normalized: EmailRecipientDataSourceConfig = {
      type: 'dataSource',
      recordFieldId: recordFieldId.toString(),
      lookupField: lookupField.toString(),
      valueField: valueField.toString(),
      dataSource
    };
    if (entry.fallbackEmail && typeof entry.fallbackEmail === 'string') {
      normalized.fallbackEmail = entry.fallbackEmail.trim();
    }
    return normalized;
  }

  private sanitizeJson(raw: string): string {
    if (!raw) return raw;
    let inString = false;
    let escaping = false;
    let result = '';
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

  private resolveHeaderRow(): { rowIndex: number; headerValues: any[] } {
    const lastColumn = Math.max(5, this.sheet.getLastColumn());
    const lastRow = this.sheet.getLastRow();
    const scanRows = Math.min(Math.max(lastRow, 3), 25);
    if (scanRows > 0) {
      const rows = this.sheet.getRange(1, 1, scanRows, lastColumn).getValues();
      for (let idx = 0; idx < rows.length; idx++) {
        const normalized = rows[idx].map(cell => cell?.toString().trim().toLowerCase());
        if (normalized.some(cell => cell && (cell === 'form title' || cell.startsWith('form title')))) {
          return { rowIndex: idx + 1, headerValues: rows[idx] };
        }
      }
    }
    const fallbackHeaders = this.sheet.getRange(3, 1, 1, lastColumn).getValues()[0];
    return { rowIndex: 3, headerValues: fallbackHeaders };
  }

  private debug(message: string, payload?: Record<string, any>): void {
    if (!this.debugEnabled) return;
    const serialized = payload ? ` ${JSON.stringify(payload)}` : '';
    const entry = `[Dashboard] ${message}${serialized}`;
    if (typeof Logger !== 'undefined' && Logger.log) {
      try {
        Logger.log(entry);
      } catch (_) {
        // ignore logging failures
      }
    }
    if (typeof console !== 'undefined' && console.log) {
      try {
        console.log(entry);
      } catch (_) {
        // ignore console failures
      }
    }
  }

  private isDebugEnabled(): boolean {
    try {
      const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
        ? PropertiesService.getScriptProperties()
        : undefined;
      const flag = props?.getProperty(DEBUG_PROPERTY_KEY);
      if (!flag) return false;
      return flag === '1' || flag.toLowerCase() === 'true';
    } catch (_) {
      return false;
    }
  }
}
