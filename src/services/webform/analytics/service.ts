import { AnalyticsSnapshot, FormConfig, QuestionConfig, WebFormDefinition, WebFormSubmission } from '../../../types';
import { debugLog } from '../debug';
import { SubmissionService } from '../submissions';
import { evaluateAnalyticsWidgets } from './engine';
import { readAnalyticsSnapshot, writeAnalyticsSnapshot } from './store';

const buildAnalyticsRow = (record: WebFormSubmission): Record<string, any> => ({
  id: record.id,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  status: record.status,
  pdfUrl: record.pdfUrl,
  ...(record.values || {})
});

export class AnalyticsService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly submissions: SubmissionService;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, submissions: SubmissionService) {
    this.ss = ss;
    this.submissions = submissions;
  }

  readSnapshot(form: FormConfig): AnalyticsSnapshot {
    return readAnalyticsSnapshot(this.ss, form);
  }

  recomputeForm(form: FormConfig, questions: QuestionConfig[], definition: WebFormDefinition): AnalyticsSnapshot {
    const widgets = definition.analytics?.widgets || [];
    const records = this.loadAllRecords(form, questions);
    const rows = records.map(buildAnalyticsRow);
    const evaluated = evaluateAnalyticsWidgets(widgets, {
      form,
      definition,
      records,
      rows
    });
    const snapshot = writeAnalyticsSnapshot(this.ss, form, evaluated);
    debugLog('analytics.recompute', {
      formKey: form.configSheet || form.title || null,
      widgetCount: widgets.length,
      recordCount: records.length,
      revision: snapshot.revision
    });
    return snapshot;
  }

  private loadAllRecords(form: FormConfig, questions: QuestionConfig[]): WebFormSubmission[] {
    const destinationName = form.destinationTab || `${form.title} Responses`;
    const { sheet, headers, columns } = this.submissions.ensureDestination(destinationName, questions);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(0, lastRow - 1);
    if (!rowCount) return [];
    const values = sheet.getRange(2, 1, rowCount, headers.length).getValues() || [];
    const records: WebFormSubmission[] = [];
    values.forEach(row => {
      const record = this.submissions.buildSubmissionRecord(form.configSheet || form.title, questions, columns, row);
      if (!record?.id) return;
      records.push(record);
    });
    return records;
  }
}

