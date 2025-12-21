import { Dashboard } from '../../config/Dashboard';
import { ConfigSheet } from '../../config/ConfigSheet';
import {
  FormConfig,
  QuestionConfig,
  WebFormDefinition,
  WebQuestionDefinition,
  ListViewConfig,
  LocalizedString
} from '../../types';
import { loadDedupRules } from '../dedup';

export class DefinitionBuilder {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, dashboard: Dashboard) {
    this.ss = ss;
    this.dashboard = dashboard;
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
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const languages: Array<'EN' | 'FR' | 'NL'> = this.computeLanguages(questions);

    const webQuestions: WebQuestionDefinition[] = questions.map(q => ({
      id: q.id,
      type: q.type,
      label: {
        en: q.qEn,
        fr: q.qFr,
        nl: q.qNl
      },
      required: q.required,
      defaultValue: q.defaultValue,
      ui: q.ui,
      header: q.header,
      group: q.group,
      pair: q.pair,
      listView: q.listView,
      dataSource: q.dataSource,
      options: q.options.length || q.optionsFr.length || q.optionsNl.length
        ? {
            en: q.options,
            fr: q.optionsFr,
            nl: q.optionsNl
          }
        : undefined,
      lineItemConfig: q.lineItemConfig,
      uploadConfig: q.uploadConfig,
      optionFilter: q.optionFilter,
      valueMap: q.valueMap,
      derivedValue: q.derivedValue,
      validationRules: q.validationRules,
      visibility: q.visibility,
      clearOnChange: q.clearOnChange,
      selectionEffects: q.selectionEffects,
      listViewSort: q.listViewSort,
      autoIncrement: q.autoIncrement
    }));

    const listView = this.buildListViewConfig(webQuestions, form.listViewMetaColumns);

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages,
      questions: webQuestions,
      dataSources: [],
      listView,
      dedupRules: loadDedupRules(this.ss, form.configSheet),
      startRoute: listView ? 'list' : 'form',
      followup: form.followupConfig,
      autoSave: form.autoSave
    };
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
    metaColumns?: string[]
  ): ListViewConfig | undefined {
    const listQuestions = questions.filter(q => q.listView);
    if (!listQuestions.length) return undefined;
    const questionColumns = listQuestions.map(q => ({ fieldId: q.id, label: q.label, kind: 'question' as const }));
    const resolvedMetaColumns = this.normalizeMetaColumnList(metaColumns);
    const metaColumnDefs = resolvedMetaColumns.map(fieldId => ({
      fieldId,
      label: this.buildMetaColumnLabel(fieldId),
      kind: 'meta' as const
    }));
    const columns = [...questionColumns, ...metaColumnDefs];
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
    const defaultSort = sortCandidate
      ? {
          fieldId: sortCandidate.id,
          direction: normalizeDirection(sortCandidate.listViewSort?.direction) || 'asc'
        }
      : {
          fieldId: resolvedMetaColumns[0] || (questionColumns[0]?.fieldId ?? 'updatedAt'),
          direction: 'desc' as const
        };
    return { columns, metaColumns: resolvedMetaColumns, defaultSort };
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
    if (!metaColumns || !metaColumns.length) return ['updatedAt'];
    const normalized = metaColumns
      .map(value => value && value.toString().trim().toLowerCase())
      .filter(Boolean)
      .map(key => allowedMap[key!] || '')
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    return unique.length ? unique : ['updatedAt'];
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
