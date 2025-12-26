import {
  AutoSaveConfig,
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
  FormConfig
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
      const listViewMetaColumns = dashboardConfig?.listViewMetaColumns;
      const autoSave = dashboardConfig?.autoSave;
      const summaryViewEnabled = dashboardConfig?.summaryViewEnabled;
      const copyCurrentRecordEnabled = dashboardConfig?.copyCurrentRecordEnabled;
      const createRecordPresetButtonsEnabled = dashboardConfig?.createRecordPresetButtonsEnabled;
      const actionBars = dashboardConfig?.actionBars;
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
          listViewMetaColumns,
          autoSave,
          summaryViewEnabled,
          copyCurrentRecordEnabled,
          createRecordPresetButtonsEnabled,
          actionBars,
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
    listViewMetaColumns?: string[];
    autoSave?: AutoSaveConfig;
    summaryViewEnabled?: boolean;
    copyCurrentRecordEnabled?: boolean;
    createRecordPresetButtonsEnabled?: boolean;
    actionBars?: ActionBarsConfig;
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
    const metaRaw =
      parsed.listViewMetaColumns !== undefined
        ? parsed.listViewMetaColumns
        : parsed.listViewDefaults !== undefined
        ? parsed.listViewDefaults
        : parsed.defaultListFields !== undefined
        ? parsed.defaultListFields
        : undefined;
    const hasMetaSetting = metaRaw !== undefined;
    const listViewMetaColumns = this.normalizeListViewMetaColumns(metaRaw);
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
    if (
      !followup &&
      !hasMetaSetting &&
      !autoSave &&
      summaryViewEnabled === undefined &&
      copyCurrentRecordEnabled === undefined &&
      createRecordPresetButtonsEnabled === undefined &&
      !actionBars &&
      !languages &&
      defaultLanguage === undefined &&
      languageSelectorEnabled === undefined
    ) {
      return undefined;
    }
    return {
      followup,
      listViewMetaColumns,
      autoSave,
      summaryViewEnabled,
      copyCurrentRecordEnabled,
      createRecordPresetButtonsEnabled,
      actionBars,
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
