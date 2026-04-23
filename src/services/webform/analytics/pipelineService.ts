import type { AnalyticsDashboardPipeline } from '../../../config/analyticsPageTypes';
import {
  AnalyticsIngredientUsagePipelineConfig,
  AnalyticsPipelineConfig,
  FormConfig,
  QuestionConfig,
  WebFormSubmission
} from '../../../types';
import { exportDriveApiFile, trashDriveApiFile } from '../driveApi';
import { debugLog } from '../debug';
import { resolveOutputTarget } from '../followup/docRenderer.copy';
import { resolveLocalizedStringValue, resolveRecipients } from '../followup/recipients';
import { normalizeToIsoDate } from '../followup/utils';
import { SubmissionService } from '../submissions';
import { DataSourceService } from '../dataSources';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DEFAULT_DATE_LABEL = 'Start date';
const DEFAULT_SUBMIT_LABEL = 'Send report';
const DEFAULT_PENDING_LABEL = 'Queueing...';
const DEFAULT_QUEUED_NOTICE = 'The report has been queued. The spreadsheet will be sent by email.';
const EXPORT_SYNC_ATTEMPTS = 4;
const EXPORT_SYNC_SLEEP_MS = 1_500;

type IngredientUsageRow = {
  ING: string;
  UNIT: string;
  QTY: number;
  CAT: string;
  SUPPLIER: string;
};

type IngredientUsageAggregation = {
  rows: IngredientUsageRow[];
  recordCount: number;
};

export type AnalyticsPipelineExecutionSummary = {
  startDate: string;
  endDate: string;
  recordCount: number;
  rowCount: number;
  attachmentName: string;
  attachmentFileId?: string;
  attachmentUrl?: string;
};

const resolveDisplayText = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object') return `${value ?? ''}`.trim();
  const preferred = [(value as any).en, (value as any).EN, (value as any).fr, (value as any).FR, (value as any).nl, (value as any).NL]
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .filter(Boolean);
  if (preferred.length) return preferred[0];
  const first = Object.values(value)
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .find(Boolean);
  return first || '';
};

const hasAnalyticsPagePlacement = (pipeline: AnalyticsPipelineConfig): boolean => {
  const placements = Array.isArray(pipeline?.placements) ? pipeline.placements : ['analyticsPage'];
  return placements.includes('analyticsPage');
};

const parseLineItemRows = (raw: any): Array<Record<string, any>> => {
  if (Array.isArray(raw)) {
    return raw.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
  }
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed)
      ? (parsed.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>)
      : [];
  } catch {
    return [];
  }
};

const toNumber = (raw: any): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = raw.toString().trim();
  if (!text) return null;
  const direct = Number(text.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(direct) ? direct : null;
};

const normalizeStatusToken = (value: any): string =>
  (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());

const replaceTemplateTokens = (template: string, placeholders: Record<string, string>): string =>
  (template || '').replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, token) => placeholders[`{{${token}}}`] ?? '');

const resolveCurrentStatus = (
  record: WebFormSubmission,
  config: AnalyticsIngredientUsagePipelineConfig
): string => {
  const statusFieldId = (config.report.statusFieldId || '').toString().trim();
  if (statusFieldId) {
    const fromValues = (record.values || {})[statusFieldId];
    if (fromValues !== undefined && fromValues !== null && fromValues !== '') {
      return fromValues.toString().trim();
    }
    if (statusFieldId.toLowerCase() === 'status') {
      return (record.status || '').toString().trim();
    }
  }
  return (record.status || '').toString().trim();
};

const resolveClosedStatuses = (form: FormConfig, config: AnalyticsIngredientUsagePipelineConfig): string[] => {
  const explicit = Array.isArray(config.report.closedStatuses) ? config.report.closedStatuses : [];
  const normalizedExplicit = explicit.map(normalizeStatusToken).filter(Boolean);
  if (normalizedExplicit.length) return Array.from(new Set(normalizedExplicit));
  const followupClosed = normalizeStatusToken(form.followupConfig?.statusTransitions?.onClose || '');
  return [followupClosed || 'closed'];
};

const resolveTempSpreadsheetCreate = (): ((name: string) => GoogleAppsScript.Spreadsheet.Spreadsheet) => {
  const create = (SpreadsheetApp as any)?.create;
  if (typeof create !== 'function') {
    throw new Error('SpreadsheetApp.create is not available.');
  }
  return create.bind(SpreadsheetApp);
};

const trashFileById = (fileId: string): void => {
  const id = (fileId || '').toString().trim();
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return;
  } catch {
    trashDriveApiFile(id);
  }
};

const flushSpreadsheetChanges = (): void => {
  const flush = (SpreadsheetApp as any)?.flush;
  if (typeof flush !== 'function') return;
  try {
    flush.call(SpreadsheetApp);
  } catch {
    // ignore best-effort flush failures
  }
};

const sleepForExportSync = (ms: number): void => {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const sleep = (globalThis as any)?.Utilities?.sleep;
  if (typeof sleep !== 'function') return;
  try {
    sleep.call(Utilities, ms);
  } catch {
    // ignore best-effort sleep failures
  }
};

const normalizeComparableCell = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return value.toString().trim();
};

const readSpreadsheetRangeValues = (
  spreadsheetId: string,
  sheetName: string,
  rowCount: number,
  columnCount: number
): any[][] | null => {
  const openById = (SpreadsheetApp as any)?.openById;
  if (typeof openById !== 'function') return null;
  try {
    const reopened = openById.call(SpreadsheetApp, spreadsheetId);
    const namedSheet =
      sheetName && typeof reopened?.getSheetByName === 'function' ? reopened.getSheetByName(sheetName) : null;
    const fallbackSheet = Array.isArray(reopened?.getSheets?.()) ? reopened.getSheets()[0] : null;
    const sheet = namedSheet || fallbackSheet;
    if (!sheet?.getRange) return null;
    const values = sheet.getRange(1, 1, rowCount, columnCount).getValues();
    return Array.isArray(values) ? values : null;
  } catch {
    return null;
  }
};

const rangeValuesMatch = (actual: any[][] | null, expected: any[][]): boolean => {
  if (!actual || actual.length < expected.length) return false;
  for (let rowIndex = 0; rowIndex < expected.length; rowIndex += 1) {
    const expectedRow = expected[rowIndex] || [];
    const actualRow = actual[rowIndex] || [];
    if (actualRow.length < expectedRow.length) return false;
    for (let columnIndex = 0; columnIndex < expectedRow.length; columnIndex += 1) {
      if (
        normalizeComparableCell(actualRow[columnIndex]) !== normalizeComparableCell(expectedRow[columnIndex])
      ) {
        return false;
      }
    }
  }
  return true;
};

export class AnalyticsPipelineService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly submissions: SubmissionService;
  private readonly dataSources: DataSourceService;

  constructor(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    submissions: SubmissionService,
    dataSources: DataSourceService
  ) {
    this.ss = ss;
    this.submissions = submissions;
    this.dataSources = dataSources;
  }

  buildDashboardPipelines(forms: FormConfig[]): AnalyticsDashboardPipeline[] {
    const byFormKey = new Map<string, FormConfig>();
    forms.forEach(form => {
      const formKey = (form.configSheet || form.title || '').toString().trim();
      if (formKey) byFormKey.set(formKey, form);
    });

    return forms
      .flatMap(form => {
        const ownerFormKey = (form.configSheet || form.title || '').toString().trim();
        const ownerFormTitle = (form.title || ownerFormKey).toString().trim() || ownerFormKey;
        return (Array.isArray(form.analytics?.pipelines) ? form.analytics?.pipelines : [])
          .filter(hasAnalyticsPagePlacement)
          .map(pipeline => {
            const sourceFormKey = (pipeline.sourceFormKey || ownerFormKey).toString().trim() || ownerFormKey;
            const sourceFormTitle =
              (byFormKey.get(sourceFormKey)?.title || sourceFormKey).toString().trim() || sourceFormKey;
            const title = resolveDisplayText(pipeline.title) || ownerFormTitle;
            return {
              dashboardPipelineId: `${ownerFormKey}::${pipeline.id}`,
              pipelineId: pipeline.id,
              ownerFormKey,
              title,
              description: resolveDisplayText(pipeline.description) || undefined,
              sourceFormKey,
              sourceFormTitle,
              dateLabel: resolveDisplayText(pipeline.ui?.dateLabel) || DEFAULT_DATE_LABEL,
              dateHelperText: resolveDisplayText(pipeline.ui?.dateHelperText) || undefined,
              submitLabel: resolveDisplayText(pipeline.ui?.submitLabel) || DEFAULT_SUBMIT_LABEL,
              pendingLabel: resolveDisplayText(pipeline.ui?.pendingLabel) || DEFAULT_PENDING_LABEL,
              queuedNotice: resolveDisplayText(pipeline.ui?.queuedNotice) || DEFAULT_QUEUED_NOTICE
            } satisfies AnalyticsDashboardPipeline;
          });
      })
      .sort((left, right) => {
        const titleCompare = left.title.localeCompare(right.title);
        if (titleCompare !== 0) return titleCompare;
        return left.sourceFormTitle.localeCompare(right.sourceFormTitle);
      });
  }

  runPipeline(args: {
    ownerForm: FormConfig;
    sourceForm: FormConfig;
    sourceQuestions: QuestionConfig[];
    pipeline: AnalyticsPipelineConfig;
    startDate: string;
  }): { success: boolean; message?: string; summary?: AnalyticsPipelineExecutionSummary } {
    if (args.pipeline.type !== 'ingredientUsageReport') {
      return { success: false, message: `Unsupported analytics pipeline type: ${args.pipeline.type}` };
    }

    const startDate = normalizeToIsoDate(args.startDate);
    const endDate = normalizeToIsoDate(new Date());
    if (!startDate || !endDate) {
      return { success: false, message: 'Invalid date range.' };
    }
    if (startDate > endDate) {
      return { success: false, message: 'Start date must be today or earlier.' };
    }

    const aggregation = this.aggregateIngredientUsage({
      form: args.sourceForm,
      questions: args.sourceQuestions,
      pipeline: args.pipeline,
      startDate,
      endDate
    });
    const artifact = this.buildWorkbookArtifact({
      ownerForm: args.ownerForm,
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      rows: aggregation.rows,
      startDate,
      endDate,
      recordCount: aggregation.recordCount
    });

    this.sendPipelineEmail({
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      artifact,
      startDate,
      endDate,
      recordCount: aggregation.recordCount,
      rowCount: aggregation.rows.length
    });

    debugLog('analytics.pipeline.completed', {
      ownerFormKey: args.ownerForm.configSheet || args.ownerForm.title || '',
      sourceFormKey: args.sourceForm.configSheet || args.sourceForm.title || '',
      pipelineId: args.pipeline.id,
      startDate,
      endDate,
      recordCount: aggregation.recordCount,
      rowCount: aggregation.rows.length,
      attachmentName: artifact.fileName
    });

    return {
      success: true,
      summary: {
        startDate,
        endDate,
        recordCount: aggregation.recordCount,
        rowCount: aggregation.rows.length,
        attachmentName: artifact.fileName,
        attachmentFileId: artifact.fileId,
        attachmentUrl: artifact.url
      }
    };
  }

  private aggregateIngredientUsage(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    pipeline: AnalyticsIngredientUsagePipelineConfig;
    startDate: string;
    endDate: string;
  }): IngredientUsageAggregation {
    const records = this.loadAllRecords(args.form, args.questions);
    const includedPrepTypes = new Set(
      (Array.isArray(args.pipeline.report.prepTypeValues) && args.pipeline.report.prepTypeValues.length
        ? args.pipeline.report.prepTypeValues
        : ['Cook']
      )
        .map(value => value.toString().trim().toLowerCase())
        .filter(Boolean)
    );
    const closedStatuses = new Set(resolveClosedStatuses(args.form, args.pipeline));
    const ingredientFieldConfig = this.findNestedFieldConfig(
      args.questions,
      args.pipeline.report.mealGroupId,
      [args.pipeline.report.prepGroupId, args.pipeline.report.ingredientGroupId],
      args.pipeline.report.ingredientFieldId
    );

    const grouped = new Map<string, IngredientUsageRow>();
    let recordCount = 0;

    records.forEach(record => {
      const status = normalizeStatusToken(resolveCurrentStatus(record, args.pipeline));
      if (!closedStatuses.has(status)) return;
      const recordDate = normalizeToIsoDate((record.values || {})[args.pipeline.report.dateFieldId]);
      if (!recordDate || recordDate < args.startDate || recordDate > args.endDate) return;
      recordCount += 1;

      parseLineItemRows((record.values || {})[args.pipeline.report.mealGroupId]).forEach(mealRow => {
        parseLineItemRows(mealRow[args.pipeline.report.prepGroupId]).forEach(prepRow => {
          const prepType = (prepRow[args.pipeline.report.prepTypeFieldId] || '').toString().trim().toLowerCase();
          if (!includedPrepTypes.has(prepType)) return;
          parseLineItemRows(prepRow[args.pipeline.report.ingredientGroupId]).forEach(ingredientRow => {
            const ingredient = (ingredientRow[args.pipeline.report.ingredientFieldId] || '').toString().trim();
            const unit = (ingredientRow[args.pipeline.report.unitFieldId] || '').toString().trim();
            const quantity = toNumber(ingredientRow[args.pipeline.report.quantityFieldId]);
            if (!ingredient || !unit || quantity === null) return;
            const details =
              ingredientFieldConfig?.dataSource
                ? this.dataSources.lookupDataSourceDetails(ingredientFieldConfig as any, ingredient, record.language || 'EN')
                : null;
            const category =
              (args.pipeline.report.categoryFieldId
                ? ingredientRow[args.pipeline.report.categoryFieldId]
                : undefined) ||
              (args.pipeline.report.categoryLookupColumn ? details?.[args.pipeline.report.categoryLookupColumn.toUpperCase()] : undefined) ||
              '';
            const supplier =
              (args.pipeline.report.supplierFieldId
                ? ingredientRow[args.pipeline.report.supplierFieldId]
                : undefined) ||
              (args.pipeline.report.supplierLookupColumn ? details?.[args.pipeline.report.supplierLookupColumn.toUpperCase()] : undefined) ||
              '';
            const key = `${ingredient.toLowerCase()}::${unit.toLowerCase()}`;
            const current = grouped.get(key) || {
              ING: ingredient,
              UNIT: unit,
              QTY: 0,
              CAT: '',
              SUPPLIER: ''
            };
            current.QTY += quantity;
            if (!current.CAT && category) current.CAT = category.toString().trim();
            if (!current.SUPPLIER && supplier) current.SUPPLIER = supplier.toString().trim();
            grouped.set(key, current);
          });
        });
      });
    });

    return {
      rows: Array.from(grouped.values()).sort((left, right) => {
        const ingredientCompare = left.ING.localeCompare(right.ING);
        if (ingredientCompare !== 0) return ingredientCompare;
        return left.UNIT.localeCompare(right.UNIT);
      }),
      recordCount
    };
  }

  private buildWorkbookArtifact(args: {
    ownerForm: FormConfig;
    sourceForm: FormConfig;
    pipeline: AnalyticsIngredientUsagePipelineConfig;
    rows: IngredientUsageRow[];
    startDate: string;
    endDate: string;
    recordCount: number;
  }): { blob: GoogleAppsScript.Base.Blob; fileName: string; fileId?: string; url?: string } {
    const title = resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Analytics';
    const fileName = this.resolveAttachmentFileName({
      title,
      attachmentConfig: args.pipeline.attachment,
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rows.length
    });
    const createSpreadsheet = resolveTempSpreadsheetCreate();
    const temp = createSpreadsheet(fileName.replace(/\.xlsx$/i, ''));
    const tempId = temp.getId();

    try {
      const sheet = temp.getSheets()[0] || temp.insertSheet('Report');
      const sheetName = (args.pipeline.attachment?.sheetName || 'Ingredients').toString().trim();
      if (sheetName && typeof sheet.setName === 'function') {
        try {
          sheet.setName(sheetName.slice(0, 99));
        } catch {
          // keep the default name when renaming fails
        }
      }
      const values: any[][] = [['ING', 'UNIT', 'QTY', 'CAT', 'SUPPLIER']];
      args.rows.forEach(row => {
        values.push([row.ING, row.UNIT, row.QTY, row.CAT, row.SUPPLIER]);
      });
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      sheet.getRange(1, 1, 1, values[0].length).setFontWeight('bold');

      this.waitForWorkbookContentToPersist({
        spreadsheetId: tempId,
        sheetName,
        verificationRows: values.slice(0, Math.min(values.length, 2))
      });
      const exported = this.exportWorkbookBlob(tempId);
      if (!exported) {
        throw new Error('Failed to export XLSX report.');
      }
      const blob = exported.setName ? exported.setName(fileName) : Utilities.newBlob(exported.getBytes(), XLSX_MIME_TYPE, fileName);
      const outputTarget = resolveOutputTarget(this.ss, args.pipeline.attachment?.folderId, args.sourceForm.followupConfig);
      const saved = outputTarget.createFile(blob);
      return {
        blob,
        fileName,
        fileId: saved.fileId,
        url: saved.url
      };
    } finally {
      trashFileById(tempId);
    }
  }

  private sendPipelineEmail(args: {
    sourceForm: FormConfig;
    pipeline: AnalyticsIngredientUsagePipelineConfig;
    artifact: { blob: GoogleAppsScript.Base.Blob; fileName: string; fileId?: string; url?: string };
    startDate: string;
    endDate: string;
    recordCount: number;
    rowCount: number;
  }): void {
    const syntheticRecord: WebFormSubmission = {
      formKey: args.sourceForm.configSheet || args.sourceForm.title || '',
      language: 'EN',
      values: {}
    };
    const placeholders: Record<string, string> = {
      '{{PIPELINE_TITLE}}': resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Analytics report',
      '{{START_DATE}}': args.startDate,
      '{{END_DATE}}': args.endDate,
      '{{RECORD_COUNT}}': `${args.recordCount}`,
      '{{ROW_COUNT}}': `${args.rowCount}`,
      '{{ATTACHMENT_NAME}}': args.artifact.fileName,
      '{{SOURCE_FORM}}': (args.sourceForm.title || args.sourceForm.configSheet || '').toString().trim()
    };
    const toRecipients = resolveRecipients(this.dataSources, args.pipeline.email.recipients, placeholders, syntheticRecord);
    if (!toRecipients.length) {
      throw new Error('Resolved analytics pipeline recipients are empty.');
    }
    const ccRecipients = resolveRecipients(this.dataSources, args.pipeline.email.cc, placeholders, syntheticRecord);
    const bccRecipients = resolveRecipients(this.dataSources, args.pipeline.email.bcc, placeholders, syntheticRecord);
    const subjectTemplate =
      resolveLocalizedStringValue(args.pipeline.email.subject, 'EN') || '{{PIPELINE_TITLE}} | {{START_DATE}} to {{END_DATE}}';
    const messageTemplate =
      resolveLocalizedStringValue(args.pipeline.email.message, 'EN') ||
      'The requested analytics export is attached.\n\nRange: {{START_DATE}} to {{END_DATE}}\nClosed records included: {{RECORD_COUNT}}\nAggregated rows: {{ROW_COUNT}}';
    const subject = replaceTemplateTokens(subjectTemplate, placeholders).trim();
    const body = replaceTemplateTokens(messageTemplate, placeholders).trim();
    const from = replaceTemplateTokens((args.pipeline.email.from || '').toString(), placeholders).trim();
    const fromName = replaceTemplateTokens((args.pipeline.email.fromName || '').toString(), placeholders).trim();

    debugLog('analytics.pipeline.email.send', {
      pipelineId: args.pipeline.id,
      toCount: toRecipients.length,
      ccCount: ccRecipients.length,
      bccCount: bccRecipients.length,
      attachmentName: args.artifact.fileName
    });

    GmailApp.sendEmail(toRecipients.join(','), subject || 'Analytics report', body || 'See attached report.', {
      htmlBody: (body || 'See attached report.').replace(/\n/g, '<br/>'),
      attachments: [args.artifact.blob],
      cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
      bcc: bccRecipients.length ? bccRecipients.join(',') : undefined,
      from: from || undefined,
      name: fromName || undefined
    });
  }

  private resolveAttachmentFileName(args: {
    title: string;
    attachmentConfig: AnalyticsIngredientUsagePipelineConfig['attachment'] | undefined;
    startDate: string;
    endDate: string;
    recordCount: number;
    rowCount: number;
  }): string {
    const template =
      (args.attachmentConfig?.fileNameTemplate || '{{PIPELINE_TITLE}} {{START_DATE}} to {{END_DATE}}.xlsx').toString();
    const text = replaceTemplateTokens(template, {
      '{{PIPELINE_TITLE}}': args.title,
      '{{START_DATE}}': args.startDate,
      '{{END_DATE}}': args.endDate,
      '{{RECORD_COUNT}}': `${args.recordCount}`,
      '{{ROW_COUNT}}': `${args.rowCount}`
    })
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const withExtension = /\.xlsx$/i.test(text) ? text : `${text || 'analytics-report'}.xlsx`;
    return withExtension;
  }

  private waitForWorkbookContentToPersist(args: {
    spreadsheetId: string;
    sheetName: string;
    verificationRows: any[][];
  }): void {
    flushSpreadsheetChanges();
    const verificationRows = Array.isArray(args.verificationRows)
      ? args.verificationRows.filter(row => Array.isArray(row) && row.length)
      : [];
    if (!verificationRows.length) return;

    const rowCount = verificationRows.length;
    const columnCount = verificationRows[0].length;
    const supportsReadback = typeof (SpreadsheetApp as any)?.openById === 'function';

    if (!supportsReadback) {
      sleepForExportSync(EXPORT_SYNC_SLEEP_MS);
      flushSpreadsheetChanges();
      return;
    }

    for (let attempt = 0; attempt < EXPORT_SYNC_ATTEMPTS; attempt += 1) {
      const visibleValues = readSpreadsheetRangeValues(args.spreadsheetId, args.sheetName, rowCount, columnCount);
      if (rangeValuesMatch(visibleValues, verificationRows)) {
        if (attempt > 0) {
          debugLog('analytics.pipeline.export.sync.ready', {
            spreadsheetId: args.spreadsheetId,
            attempt: attempt + 1,
            sheetName: args.sheetName
          });
        }
        return;
      }
      if (attempt >= EXPORT_SYNC_ATTEMPTS - 1) break;
      sleepForExportSync(EXPORT_SYNC_SLEEP_MS);
      flushSpreadsheetChanges();
    }

    debugLog('analytics.pipeline.export.sync.timeout', {
      spreadsheetId: args.spreadsheetId,
      sheetName: args.sheetName,
      verificationRowCount: rowCount,
      verificationColumnCount: columnCount
    });
  }

  private exportWorkbookBlob(spreadsheetId: string): GoogleAppsScript.Base.Blob | null {
    const id = (spreadsheetId || '').toString().trim();
    if (!id) return null;
    for (let attempt = 0; attempt < EXPORT_SYNC_ATTEMPTS; attempt += 1) {
      const exported = exportDriveApiFile(id, XLSX_MIME_TYPE);
      if (exported) return exported;
      if (attempt >= EXPORT_SYNC_ATTEMPTS - 1) break;
      sleepForExportSync(EXPORT_SYNC_SLEEP_MS);
      flushSpreadsheetChanges();
    }
    return null;
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

  private findNestedFieldConfig(
    questions: QuestionConfig[],
    rootGroupId: string,
    subGroupPath: string[],
    fieldId: string
  ): any | null {
    const root = questions.find(question => question.id === rootGroupId && question.type === 'LINE_ITEM_GROUP');
    if (!root) return null;
    let current: any = root.lineItemConfig;
    for (const subGroupId of subGroupPath) {
      const next = (current?.subGroups || []).find((entry: any) => entry?.id === subGroupId);
      if (!next) return null;
      current = next;
    }
    return (current?.fields || []).find((field: any) => field?.id === fieldId) || null;
  }
}
