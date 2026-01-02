import {
  AutoSaveConfig,
  AppHeaderConfig,
  ActionBarsConfig,
  ActionBarItemConfig,
  ActionBarViewConfig,
  ActionBarSystemButton,
  ButtonPlacement,
  ButtonAction,
  FollowupConfig,
  FollowupStatusConfig,
  EmailRecipientEntry,
  EmailRecipientDataSourceConfig,
  FormConfig,
  GroupBehaviorConfig,
  ListViewColumnConfig,
  ListViewLegendItem,
  LocalizedString
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

    sheet.getRange('A3:F3').setValues(headers).setFontWeight('bold').setBackground('#e0e0e0');

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
      const listViewTitle = dashboardConfig?.listViewTitle;
      const listViewDefaultSort = dashboardConfig?.listViewDefaultSort;
      const listViewPageSize = dashboardConfig?.listViewPageSize;
      const listViewMetaColumns = dashboardConfig?.listViewMetaColumns;
      const listViewColumns = dashboardConfig?.listViewColumns;
      const listViewLegend = dashboardConfig?.listViewLegend;
      const autoSave = dashboardConfig?.autoSave;
      const summaryViewEnabled = dashboardConfig?.summaryViewEnabled;
      const copyCurrentRecordEnabled = dashboardConfig?.copyCurrentRecordEnabled;
      const createRecordPresetButtonsEnabled = dashboardConfig?.createRecordPresetButtonsEnabled;
      const actionBars = dashboardConfig?.actionBars;
      const appHeader = dashboardConfig?.appHeader;
      const groupBehavior = dashboardConfig?.groupBehavior;
      const languages = dashboardConfig?.languages;
      const defaultLanguage = dashboardConfig?.defaultLanguage;
      const languageSelectorEnabled = dashboardConfig?.languageSelectorEnabled;
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
          listViewTitle,
          listViewDefaultSort,
          listViewPageSize,
          listViewMetaColumns,
          listViewColumns,
          listViewLegend,
          autoSave,
          summaryViewEnabled,
          copyCurrentRecordEnabled,
          createRecordPresetButtonsEnabled,
          actionBars,
          appHeader,
          groupBehavior,
          languages,
          defaultLanguage,
          languageSelectorEnabled
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
    listViewTitle?: LocalizedString;
    listViewDefaultSort?: { fieldId: string; direction?: 'asc' | 'desc' };
    listViewPageSize?: number;
    listViewMetaColumns?: string[];
    listViewColumns?: ListViewColumnConfig[];
    listViewLegend?: ListViewLegendItem[];
    autoSave?: AutoSaveConfig;
    summaryViewEnabled?: boolean;
    copyCurrentRecordEnabled?: boolean;
    createRecordPresetButtonsEnabled?: boolean;
    actionBars?: ActionBarsConfig;
    appHeader?: AppHeaderConfig;
    groupBehavior?: GroupBehaviorConfig;
    languages?: Array<'EN' | 'FR' | 'NL'>;
    defaultLanguage?: 'EN' | 'FR' | 'NL';
    languageSelectorEnabled?: boolean;
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
    const listViewTitle = normalizeLocalized(listViewTitleRaw);

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
    const autoSave = this.normalizeAutoSave(parsed.autoSave || parsed.autosave || parsed.draftSave);
    const summaryViewEnabled = (() => {
      if (parsed.summaryViewEnabled !== undefined) return Boolean(parsed.summaryViewEnabled);
      if (parsed.summaryView !== undefined) return Boolean(parsed.summaryView);
      if (parsed.summary !== undefined) return Boolean(parsed.summary);
      if (parsed.disableSummaryView !== undefined) return !Boolean(parsed.disableSummaryView);
      return undefined;
    })();
    const copyCurrentRecordEnabled = (() => {
      if (parsed.copyCurrentRecordEnabled !== undefined) return Boolean(parsed.copyCurrentRecordEnabled);
      if (parsed.copyEnabled !== undefined) return Boolean(parsed.copyEnabled);
      if (parsed.disableCopyCurrentRecord !== undefined) return !Boolean(parsed.disableCopyCurrentRecord);
      if (parsed.disableCopy !== undefined) return !Boolean(parsed.disableCopy);
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
    const groupBehavior: GroupBehaviorConfig | undefined =
      autoCollapseOnComplete === undefined && autoOpenNextIncomplete === undefined && autoScrollOnExpand === undefined
        ? undefined
        : {
            autoCollapseOnComplete,
            autoOpenNextIncomplete,
            autoScrollOnExpand
          };

    if (
      !followup &&
      !listViewTitle &&
      !listViewDefaultSort &&
      listViewPageSize === undefined &&
      !hasMetaSetting &&
      !listViewColumns?.length &&
      !listViewLegend?.length &&
      !autoSave &&
      summaryViewEnabled === undefined &&
      copyCurrentRecordEnabled === undefined &&
      createRecordPresetButtonsEnabled === undefined &&
      !actionBars &&
      !appHeader &&
      !groupBehavior &&
      !languages &&
      defaultLanguage === undefined &&
      languageSelectorEnabled === undefined
    ) {
      return undefined;
    }
    return {
      followup,
      listViewTitle,
      listViewDefaultSort,
      listViewPageSize,
      listViewMetaColumns,
      listViewColumns,
      listViewLegend,
      autoSave,
      summaryViewEnabled,
      copyCurrentRecordEnabled,
      createRecordPresetButtonsEnabled,
      actionBars,
      appHeader,
      groupBehavior,
      languages,
      defaultLanguage,
      languageSelectorEnabled
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
    const allowedActions = new Set<ButtonAction>(['renderDocTemplate', 'createRecordPreset']);

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
      if (homeRaw && typeof homeRaw === 'object' && (homeRaw as any).hideWhenActive !== undefined) {
        cfg.system = cfg.system || {};
        cfg.system.home = { hideWhenActive: Boolean((homeRaw as any).hideWhenActive) };
      }
    }

    return Object.keys(cfg).length ? cfg : undefined;
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

  private buildFollowupConfig(source: any): FollowupConfig | undefined {
    if (!source || typeof source !== 'object') return undefined;
    const config: FollowupConfig = {};
    config.pdfTemplateId = this.normalizeTemplateId(source.pdfTemplateId);
    if (source.pdfFolderId) config.pdfFolderId = source.pdfFolderId;
    config.emailTemplateId = this.normalizeTemplateId(source.emailTemplateId);
    if (source.emailSubject) config.emailSubject = source.emailSubject;
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
    const allowedRuleStyles = new Set(['link', 'warning', 'muted', 'default']);
    const allowedIcons = new Set(['warning', 'check', 'error', 'info', 'external', 'lock', 'edit', 'view']);
    const allowedOpenViews = new Set(['auto', 'form', 'summary']);

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

    const normalizeRuleCase = (entry: any): any | null => {
      if (!entry || typeof entry !== 'object') return null;
      const text = normalizeLocalized((entry as any).text ?? (entry as any).value ?? (entry as any).label);
      if (!text) return null;
      const out: any = { text };
      const when = normalizeWhen((entry as any).when ?? (entry as any).if ?? (entry as any).condition);
      if (when) out.when = when;
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
        const def = normalizeRuleCase((entry as any).default);
        if (def) out.default = { text: def.text, style: def.style, icon: def.icon, hrefFieldId: def.hrefFieldId };
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
        const openViewRaw = ((entry as any).openView ?? (entry as any).open ?? (entry as any).view ?? '').toString().trim().toLowerCase();
        if (openViewRaw && allowedOpenViews.has(openViewRaw)) out.openView = openViewRaw;
        if ((entry as any).sortable !== undefined) out.sortable = Boolean((entry as any).sortable);
        columns.push(out as ListViewColumnConfig);
        return;
      }

      const label = normalizeLocalized((entry as any).label ?? (entry as any).header ?? (entry as any).title);
      const kindRaw = ((entry as any).kind ?? '').toString().trim().toLowerCase();
      const kind = kindRaw === 'meta' || metaSet.has(fieldId) ? 'meta' : 'question';
      const out: any = { fieldId, kind };
      if (label) out.label = label;
      columns.push(out as ListViewColumnConfig);
    });

    return columns.length ? columns : undefined;
  }

  private normalizeListViewLegend(value: any): ListViewLegendItem[] | undefined {
    if (value === undefined || value === null) return undefined;
    const allowedIcons = new Set(['warning', 'check', 'error', 'info', 'external', 'lock', 'edit', 'view']);

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
    const push = (iconRaw: any, textRaw: any) => {
      const text = normalizeLocalized(textRaw);
      if (!text) return;

      const icon = (iconRaw || '').toString().trim().toLowerCase();
      if (!icon) {
        items.push({ text } as any);
        return;
      }
      if (!allowedIcons.has(icon) || seenIcons.has(icon)) return;
      seenIcons.add(icon);
      items.push({ icon: icon as any, text });
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
      push((entry as any).icon, (entry as any).text ?? (entry as any).label ?? (entry as any).description);
    });
    return items.length ? items : undefined;
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
