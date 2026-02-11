import { Dashboard } from '../../config/Dashboard';
import { ConfigSheet } from '../../config/ConfigSheet';
import {
  FormConfig,
  DedupRule,
  QuestionConfig,
  WebFormDefinition,
  WebQuestionDefinition,
  ListViewConfig,
  LocalizedString,
  OptionMapRefConfig
} from '../../types';
import { loadDedupRules } from '../dedup';
import { parseHeaderKey, sanitizeHeaderCellText } from './recordSchema';

export class DefinitionBuilder {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;
  private optionMapRefCache: Record<string, Record<string, string[]> | undefined>;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, dashboard: Dashboard) {
    this.ss = ss;
    this.dashboard = dashboard;
    this.optionMapRefCache = {};
  }

  findForm(formKey?: string): FormConfig {
    const forms = this.dashboard.getForms();
    if (!forms.length) throw new Error('No forms configured. Run setup first.');
    if (!formKey) return forms[0];

    const match = forms.find(f => f.configSheet === formKey || f.title.toLowerCase() === formKey.toLowerCase());
    if (!match) {
      throw new Error(`Form "${formKey}" not found in dashboard.`);
    }
    return match;
  }

  buildDefinition(formKey?: string): WebFormDefinition {
    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet);
    const dedupRules = loadDedupRules(this.ss, form.configSheet);
    return this.buildDefinitionFromConfig(form, questions, dedupRules);
  }

  buildDefinitionFromConfig(
    form: FormConfig,
    questions: QuestionConfig[],
    dedupRules?: DedupRule[]
  ): WebFormDefinition {
    const activeQuestions = (questions || []).filter(q => q.status === 'Active');
    const resolvedQuestions = activeQuestions.map(q => this.resolveQuestionConfigRefs(q));
    const languageSettings = this.resolveLanguageSettings(form, resolvedQuestions);
    const languages: Array<'EN' | 'FR' | 'NL'> = languageSettings.languages;

    const webQuestions: WebQuestionDefinition[] = resolvedQuestions.map(q => {
      const optionsEn = Array.isArray((q as any).options) ? (q as any).options : [];
      const optionsFr = Array.isArray((q as any).optionsFr) ? (q as any).optionsFr : [];
      const optionsNl = Array.isArray((q as any).optionsNl) ? (q as any).optionsNl : [];
      return {
        id: q.id,
        type: q.type,
        label: {
          en: q.qEn,
          fr: q.qFr,
          nl: q.qNl
        },
        required: q.required,
        requiredMessage: q.requiredMessage,
        defaultValue: q.defaultValue,
        ui: q.ui,
        optionSort: q.optionSort,
        readOnly: q.readOnly,
        header: q.header,
        group: q.group,
        pair: q.pair,
        listView: q.listView,
        button: q.button,
        dataSource: q.dataSource,
        options: optionsEn.length || optionsFr.length || optionsNl.length
          ? {
              en: optionsEn,
              fr: optionsFr,
              nl: optionsNl,
              raw: q.optionsRaw
            }
          : undefined,
        lineItemConfig: q.lineItemConfig,
        uploadConfig: q.uploadConfig,
        optionFilter: q.optionFilter,
        valueMap: q.valueMap,
        derivedValue: q.derivedValue,
        validationRules: q.validationRules,
        visibility: q.visibility,
        changeDialog: q.changeDialog,
        clearOnChange: q.clearOnChange,
        selectionEffects: q.selectionEffects,
        listViewSort: q.listViewSort,
        autoIncrement: q.autoIncrement
      };
    });

    const listView = this.buildListViewConfig(
      webQuestions,
      form.listViewMetaColumns,
      form.listViewColumns,
      form.listViewLegend,
      form.listViewLegendColumns,
      form.listViewLegendColumnWidths,
      form.listViewTitle,
      form.listViewDefaultSort,
      form.listViewPageSize,
      form.listViewPaginationControlsEnabled,
      form.listViewHideHeaderRow,
      form.listViewRowClickEnabled,
      form.listViewSearch,
      form.listViewMetric
    );
    if (listView && form.listViewHeaderSortEnabled !== undefined) {
      listView.headerSortEnabled = Boolean(form.listViewHeaderSortEnabled);
    }
    if (listView && form.listViewView) {
      listView.view = form.listViewView;
    }

    const resolvedDedupRules =
      dedupRules || (form.configSheet ? loadDedupRules(this.ss, form.configSheet) : []);

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages,
      defaultLanguage: languageSettings.defaultLanguage,
      languageSelectorEnabled: languageSettings.languageSelectorEnabled,
      questions: webQuestions,
      dataSources: [],
      listView,
      dedupRules: resolvedDedupRules,
      startRoute: listView ? 'list' : 'form',
      followup: form.followupConfig,
      autoSave: form.autoSave,
      summaryViewEnabled: form.summaryViewEnabled,
      summaryHtmlTemplateId: form.summaryHtmlTemplateId,
      copyCurrentRecordEnabled: form.copyCurrentRecordEnabled,
      copyCurrentRecordDropFields: form.copyCurrentRecordDropFields,
      copyCurrentRecordProfile: form.copyCurrentRecordProfile,
      createButtonLabel: form.createButtonLabel,
      copyCurrentRecordLabel: form.copyCurrentRecordLabel,
      copyCurrentRecordDialog: form.copyCurrentRecordDialog,
      createNewRecordEnabled: form.createNewRecordEnabled,
      createRecordPresetButtonsEnabled: form.createRecordPresetButtonsEnabled,
      actionBars: form.actionBars,
      appHeader: form.appHeader,
      groupBehavior: form.groupBehavior,
      submitValidation: form.submitValidation,
      steps: form.steps,
      portraitOnly: form.portraitOnly,
      submissionConfirmationMessage: form.submissionConfirmationMessage,
      submissionConfirmationTitle: form.submissionConfirmationTitle,
      submissionConfirmationConfirmLabel: form.submissionConfirmationConfirmLabel,
      submissionConfirmationCancelLabel: form.submissionConfirmationCancelLabel,
      dedupDialog: form.dedupDialog,
      submitButtonLabel: form.submitButtonLabel,
      summaryButtonLabel: form.summaryButtonLabel,
      fieldDisableRules: form.fieldDisableRules,
      dedupDeleteOnKeyChange: form.dedupDeleteOnKeyChange
    };
  }

  private resolveQuestionConfigRefs(question: QuestionConfig): QuestionConfig {
    const next: any = { ...(question as any) };
    if (next.optionFilter) {
      next.optionFilter = this.resolveOptionFilterRef(next.optionFilter);
    }
    if (next.valueMap) {
      next.valueMap = this.resolveValueMapRef(next.valueMap);
    }
    if (next.lineItemConfig && typeof next.lineItemConfig === 'object') {
      next.lineItemConfig = this.resolveLineItemConfigRefs(next.lineItemConfig);
    }
    return next as QuestionConfig;
  }

  private resolveLineItemConfigRefs(config: any): any {
    if (!config || typeof config !== 'object') return config;
    const next: any = { ...config };
    if (Array.isArray(config.fields)) {
      next.fields = config.fields.map((field: any) => this.resolveLineItemFieldRefs(field));
    }
    if (config.sectionSelector && typeof config.sectionSelector === 'object') {
      next.sectionSelector = this.resolveLineItemSelectorRefs(config.sectionSelector);
    }
    if (Array.isArray(config.subGroups)) {
      next.subGroups = config.subGroups.map((subGroup: any) => this.resolveLineItemConfigRefs(subGroup));
    }
    return next;
  }

  private resolveLineItemFieldRefs(field: any): any {
    if (!field || typeof field !== 'object') return field;
    const next: any = { ...field };
    if (next.optionFilter) {
      next.optionFilter = this.resolveOptionFilterRef(next.optionFilter);
    }
    if (next.valueMap) {
      next.valueMap = this.resolveValueMapRef(next.valueMap);
    }
    if (next.lineItemConfig && typeof next.lineItemConfig === 'object') {
      next.lineItemConfig = this.resolveLineItemConfigRefs(next.lineItemConfig);
    }
    return next;
  }

  private resolveLineItemSelectorRefs(selector: any): any {
    if (!selector || typeof selector !== 'object') return selector;
    const next: any = { ...selector };
    if (next.optionFilter) {
      next.optionFilter = this.resolveOptionFilterRef(next.optionFilter);
    }
    return next;
  }

  private resolveOptionFilterRef(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;
    const hasMap = raw.optionMap && typeof raw.optionMap === 'object' && Object.keys(raw.optionMap).length > 0;
    if (hasMap) return raw;
    const refCfg = this.normalizeOptionMapRef(raw.optionMapRef);
    if (!refCfg) return raw;
    const resolved = this.buildOptionMapFromRef(refCfg);
    if (!resolved) return raw;
    return { ...raw, optionMap: resolved, optionMapRef: refCfg };
  }

  private resolveValueMapRef(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;
    const hasMap = raw.optionMap && typeof raw.optionMap === 'object' && Object.keys(raw.optionMap).length > 0;
    if (hasMap) return raw;
    const refCfg = this.normalizeOptionMapRef(raw.optionMapRef);
    if (!refCfg) return raw;
    const resolved = this.buildOptionMapFromRef(refCfg);
    if (!resolved) return raw;
    return { ...raw, optionMap: resolved, optionMapRef: refCfg };
  }

  private normalizeOptionMapRef(raw: any): OptionMapRefConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const refRaw = raw.ref ?? raw.tab ?? raw.tabName ?? raw.sheet ?? raw.sheetName;
    const keyRaw = raw.keyColumns ?? raw.keyCols ?? raw.keys ?? raw.keyColumn ?? raw.keyCol ?? raw.key ?? raw.keyHeader;
    const lookupRaw = raw.lookupColumn ?? raw.lookupCol ?? raw.valueColumn ?? raw.valueCol ?? raw.value ?? raw.lookup ?? raw.lookupHeader;
    if (refRaw === undefined || refRaw === null) return undefined;
    if (keyRaw === undefined || keyRaw === null) return undefined;
    if (lookupRaw === undefined || lookupRaw === null) return undefined;

    const normalizeColumn = (value: any): string | number | undefined => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const text = value.toString().trim();
      if (!text) return undefined;
      if (/^\d+$/.test(text)) return Number(text);
      return text;
    };

    const ref = refRaw.toString().trim();
    if (!ref) return undefined;
    const keyCols = Array.isArray(keyRaw)
      ? keyRaw.map((value: any) => normalizeColumn(value)).filter((value): value is string | number => value !== undefined)
      : [normalizeColumn(keyRaw)].filter((value): value is string | number => value !== undefined);
    const lookupColumn = normalizeColumn(lookupRaw);
    if (!keyCols.length || lookupColumn === undefined) return undefined;

    const delimiterRaw = raw.delimiter ?? raw.separator ?? raw.sep ?? raw.split;
    const keyDelimiterRaw = raw.keyDelimiter ?? raw.keyDelim ?? raw.keySeparator ?? raw.keySep;
    const keyColumn = keyCols.length === 1 ? keyCols[0] : keyCols;
    const splitKey = this.normalizeBoolean(raw.splitKey ?? raw.splitKeys ?? raw.split_key ?? raw.split_keys);

    return {
      ref,
      keyColumn,
      lookupColumn,
      delimiter: delimiterRaw !== undefined && delimiterRaw !== null ? delimiterRaw.toString() : undefined,
      splitKey,
      keyDelimiter: keyDelimiterRaw !== undefined && keyDelimiterRaw !== null ? keyDelimiterRaw.toString() : undefined
    };
  }

  private normalizeBoolean(value: any): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = value.toString().trim().toLowerCase();
    if (!normalized) return undefined;
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    return undefined;
  }

  private resolveRefSheetName(ref: string): string {
    const raw = (ref || '').toString().trim();
    if (!raw) return '';
    return raw.startsWith('REF:') ? raw.substring(4).trim() : raw;
  }

  private columnLettersToIndex(letters: string): number {
    const raw = (letters || '').toString().trim().toUpperCase();
    if (!raw || !/^[A-Z]+$/.test(raw)) return 0;
    let out = 0;
    for (let idx = 0; idx < raw.length; idx++) {
      out = out * 26 + (raw.charCodeAt(idx) - 64);
    }
    return out;
  }

  private resolveSheetColumnIndex(col: string | number, headers: any[]): number | null {
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

    const normalizedTarget = raw.toLowerCase().trim();
    if (Array.isArray(headers)) {
      for (let idx = 0; idx < headers.length; idx++) {
        const rawHeader = sanitizeHeaderCellText((headers[idx] || '').toString());
        const parsed = parseHeaderKey(rawHeader);
        const headerCandidates = [rawHeader, parsed.label || '', parsed.key || '']
          .map(value => value.toString().trim().toLowerCase())
          .filter(Boolean);
        if (headerCandidates.includes(normalizedTarget)) return idx + 1;
      }
    }

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

  private splitOptionMapCell(raw: any, delimiter?: string): string[] {
    if (raw === undefined || raw === null) return [];
    const str = String(raw).trim();
    if (!str) return [];
    const delim = delimiter !== undefined && delimiter !== null ? delimiter.toString() : '';
    if (delim && delim.toLowerCase() !== 'none') {
      return str
        .split(delim)
        .map((part: string) => part.trim())
        .filter(Boolean);
    }
    return str
      .split(/[,;\n]+/)
      .map((part: string) => part.trim())
      .filter(Boolean);
  }

  private buildOptionMapFromRef(refCfg: OptionMapRefConfig): Record<string, string[]> | undefined {
    const cacheKey = JSON.stringify(refCfg);
    if (Object.prototype.hasOwnProperty.call(this.optionMapRefCache, cacheKey)) {
      return this.optionMapRefCache[cacheKey];
    }

    const tabName = this.resolveRefSheetName(refCfg.ref);
    if (!tabName) {
      this.optionMapRefCache[cacheKey] = undefined;
      return undefined;
    }
    const sheet = this.ss.getSheetByName(tabName);
    if (!sheet) {
      this.optionMapRefCache[cacheKey] = undefined;
      return undefined;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      this.optionMapRefCache[cacheKey] = undefined;
      return undefined;
    }
    if (lastRow <= 1) {
      this.optionMapRefCache[cacheKey] = {};
      return {};
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const keyCols = Array.isArray(refCfg.keyColumn) ? refCfg.keyColumn : [refCfg.keyColumn];
    const keyColIdxs = keyCols.map(col => this.resolveSheetColumnIndex(col, headers));
    if (keyColIdxs.some(idx => !idx)) {
      this.optionMapRefCache[cacheKey] = undefined;
      return undefined;
    }
    const lookupColIdx = this.resolveSheetColumnIndex(refCfg.lookupColumn, headers);
    if (!lookupColIdx) {
      this.optionMapRefCache[cacheKey] = undefined;
      return undefined;
    }

    const numRows = lastRow - 1;
    const keyColumns = keyColIdxs.map(idx => sheet.getRange(2, idx as number, numRows, 1).getValues());
    const lookupValues = sheet.getRange(2, lookupColIdx, numRows, 1).getValues();
    const map: Record<string, string[]> = {};

    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const keyParts = keyColumns.map(col => {
        const value = col[rowIdx]?.[0];
        return value !== undefined && value !== null ? value.toString().trim() : '';
      });
      if (!keyParts.some(Boolean)) continue;

      if (refCfg.splitKey === true && keyParts.length === 1) {
        const keys = this.splitOptionMapCell(keyParts[0], refCfg.keyDelimiter);
        if (!keys.length) continue;
        const values = this.splitOptionMapCell(lookupValues[rowIdx]?.[0], refCfg.delimiter);
        if (!values.length) continue;
        keys.forEach(key => {
          if (!map[key]) map[key] = [];
          map[key].push(...values);
        });
        continue;
      }

      const firstEmptyIndex = keyParts.findIndex(part => !part);
      if (firstEmptyIndex >= 0 && keyParts.slice(firstEmptyIndex).some(Boolean)) continue;
      const usableParts = firstEmptyIndex >= 0 ? keyParts.slice(0, firstEmptyIndex) : keyParts;
      if (!usableParts.length) continue;
      let key = usableParts.length > 1 ? usableParts.join('||') : usableParts[0];
      if (usableParts.length > 1 && usableParts.every(part => part === '*')) key = '*';
      if (!key) continue;

      const values = this.splitOptionMapCell(lookupValues[rowIdx]?.[0], refCfg.delimiter);
      if (!values.length) continue;
      if (!map[key]) map[key] = [];
      map[key].push(...values);
    }

    Object.keys(map).forEach(key => {
      const seen = new Set<string>();
      const unique: string[] = [];
      map[key].forEach(value => {
        const text = (value ?? '').toString().trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        unique.push(text);
      });
      map[key] = unique;
    });

    this.optionMapRefCache[cacheKey] = map;
    return map;
  }

  private resolveLanguageSettings(
    form: FormConfig,
    questions: QuestionConfig[]
  ): {
    languages: Array<'EN' | 'FR' | 'NL'>;
    defaultLanguage: 'EN' | 'FR' | 'NL';
    languageSelectorEnabled: boolean;
  } {
    const normalizeLang = (value: any): 'EN' | 'FR' | 'NL' => {
      const normalized = (value || 'EN').toString().trim().toUpperCase();
      return (normalized === 'FR' || normalized === 'NL' || normalized === 'EN' ? normalized : 'EN') as 'EN' | 'FR' | 'NL';
    };

    const detected = this.computeLanguages(questions);
    const base = (form.languages && form.languages.length ? form.languages : detected) || ['EN'];
    let langs = Array.from(
      new Set(
        base
          .map(v => (v || '').toString().trim().toUpperCase())
          .filter(v => v === 'EN' || v === 'FR' || v === 'NL') as Array<'EN' | 'FR' | 'NL'>
      )
    );
    if (!langs.length) langs = ['EN'];
    if (langs.length > 3) langs = langs.slice(0, 3);

    const defaultLanguage = normalizeLang(form.defaultLanguage || langs[0] || detected[0] || 'EN');
    if (!langs.includes(defaultLanguage)) {
      langs = [defaultLanguage, ...langs].slice(0, 3);
    }

    const languageSelectorEnabled = form.languageSelectorEnabled !== undefined ? Boolean(form.languageSelectorEnabled) : true;
    const effectiveLangs = languageSelectorEnabled ? langs : [defaultLanguage];

    return { languages: effectiveLangs, defaultLanguage, languageSelectorEnabled };
  }

  private computeLanguages(questions: QuestionConfig[]): Array<'EN' | 'FR' | 'NL'> {
    const langs: Array<'EN' | 'FR' | 'NL'> = [];
    if (questions.some(q => !!q.qEn)) langs.push('EN');
    if (questions.some(q => !!q.qFr)) langs.push('FR');
    if (questions.some(q => !!q.qNl)) langs.push('NL');
    return langs.length ? langs : ['EN'];
  }

  private buildListViewConfig(
    questions: WebQuestionDefinition[],
    metaColumns?: string[],
    dashboardColumns?: ListViewConfig['columns'],
    legend?: ListViewConfig['legend'],
    legendColumnsOverride?: ListViewConfig['legendColumns'],
    legendColumnWidthsOverride?: ListViewConfig['legendColumnWidths'],
    title?: ListViewConfig['title'],
    defaultSortOverride?: ListViewConfig['defaultSort'],
    pageSizeOverride?: ListViewConfig['pageSize'],
    paginationControlsEnabledOverride?: ListViewConfig['paginationControlsEnabled'],
    hideHeaderRowOverride?: ListViewConfig['hideHeaderRow'],
    rowClickEnabledOverride?: ListViewConfig['rowClickEnabled'],
    searchOverride?: ListViewConfig['search'],
    metricOverride?: ListViewConfig['metric']
  ): ListViewConfig | undefined {
    const listQuestions = questions.filter(q => q.listView);
    const customColumns = Array.isArray(dashboardColumns) ? dashboardColumns : [];
    if (!listQuestions.length && !customColumns.length) return undefined;
    const questionColumns = listQuestions.map(q => ({ fieldId: q.id, label: q.label, kind: 'question' as const }));
    const resolvedMetaColumns = this.normalizeMetaColumnList(metaColumns);
    const metaColumnDefs = resolvedMetaColumns.map(fieldId => ({
      fieldId,
      label: this.buildMetaColumnLabel(fieldId),
      kind: 'meta' as const
    }));
    // Dashboard-defined columns (e.g. rule/computed columns) come first so action columns are leftmost.
    const columns = [...customColumns, ...questionColumns, ...metaColumnDefs];
    const sortCandidate = listQuestions
      .filter(q => !!q.listViewSort)
      .sort((a, b) => {
        const aPriority = a.listViewSort?.priority ?? Number.MAX_SAFE_INTEGER;
        const bPriority = b.listViewSort?.priority ?? Number.MAX_SAFE_INTEGER;
        return aPriority - bPriority;
      })[0];
    const normalizeDirection = (value?: string): 'asc' | 'desc' | undefined => {
      if (!value) return undefined;
      const lower = value.toLowerCase();
      if (lower === 'asc' || lower === 'desc') {
        return lower as 'asc' | 'desc';
      }
      return undefined;
    };
    const computedDefaultSort = sortCandidate
      ? {
          fieldId: sortCandidate.id,
          direction: normalizeDirection(sortCandidate.listViewSort?.direction) || 'asc'
        }
      : {
          fieldId: resolvedMetaColumns[0] || (questionColumns[0]?.fieldId ?? 'updatedAt'),
          direction: 'desc' as const
        };
    const defaultSort = defaultSortOverride?.fieldId ? defaultSortOverride : computedDefaultSort;
    const out: ListViewConfig = { columns, metaColumns: resolvedMetaColumns, defaultSort };
    // Allow explicit empty title ("") to hide the list view title in the UI.
    if (title !== undefined) out.title = title;
    if (legend && Array.isArray(legend) && legend.length) out.legend = legend;
    if (legendColumnsOverride !== undefined) {
      const n = Number(legendColumnsOverride);
      if (Number.isFinite(n) && n > 0) out.legendColumns = Math.max(1, Math.min(2, Math.round(n)));
    }
    if (legendColumnWidthsOverride && Array.isArray(legendColumnWidthsOverride) && legendColumnWidthsOverride.length >= 2) {
      const first = Number(legendColumnWidthsOverride[0]);
      const second = Number(legendColumnWidthsOverride[1]);
      if (Number.isFinite(first) && Number.isFinite(second) && first > 0 && second > 0) {
        const total = first + second;
        const normalizedFirst = Number(((first / total) * 100).toFixed(2));
        const normalizedSecond = Number((100 - normalizedFirst).toFixed(2));
        out.legendColumnWidths = [normalizedFirst, normalizedSecond] as [number, number];
      }
    }
    if (pageSizeOverride && Number.isFinite(pageSizeOverride)) out.pageSize = pageSizeOverride;
    if (paginationControlsEnabledOverride !== undefined) out.paginationControlsEnabled = Boolean(paginationControlsEnabledOverride);
    if (hideHeaderRowOverride !== undefined) out.hideHeaderRow = Boolean(hideHeaderRowOverride);
    if (rowClickEnabledOverride !== undefined) out.rowClickEnabled = Boolean(rowClickEnabledOverride);
    if (searchOverride) out.search = searchOverride;
    if (metricOverride) out.metric = metricOverride;
    return out;
  }

  private normalizeMetaColumnList(metaColumns?: string[]): string[] {
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
    // Default meta columns when not configured:
    // - undefined/null -> default to updatedAt
    // - [] (explicit) -> show no meta columns
    if (metaColumns === undefined || metaColumns === null) return ['updatedAt'];
    if (!metaColumns.length) return [];
    const normalized = metaColumns
      .map(value => value && value.toString().trim().toLowerCase())
      .filter(Boolean)
      .map(key => allowedMap[key!] || '')
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    // If configured but nothing valid was provided, treat it as "no meta columns".
    return unique;
  }

  private buildMetaColumnLabel(fieldId: string): LocalizedString {
    switch (fieldId) {
      case 'createdAt':
        return { en: 'Created', fr: 'Créé', nl: 'Aangemaakt' };
      case 'status':
        return { en: 'Status', fr: 'Statut', nl: 'Status' };
      case 'pdfUrl':
        return { en: 'PDF URL', fr: 'Lien PDF', nl: 'PDF-link' };
      case 'updatedAt':
      default:
        return { en: 'Updated', fr: 'Mis à jour', nl: 'Bijgewerkt' };
    }
  }
}
