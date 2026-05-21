import type { AnalyticsDashboardPipeline } from '../../../config/analyticsPageTypes';
import {
  AnalyticsIngredientUsagePipelineConfig,
  AnalyticsPipelineConfig,
  AnalyticsRecordTableColumnConfig,
  AnalyticsRecordTableLineItemConfig,
  AnalyticsRecordTablePipelineConfig,
  AnalyticsRecordTableReportConfig,
  FormConfig,
  QuestionConfig,
  WhenClause,
  WebFormSubmission
} from '../../../types';
import { matchesWhenClause } from '../../../web/rules/visibility';
import { exportDriveApiFile, trashDriveApiFile } from '../driveApi';
import { debugLog } from '../debug';
import { resolveOutputTarget } from '../followup/docRenderer.copy';
import { resolveLocalizedStringValue, resolveRecipients } from '../followup/recipients';
import { normalizeToIsoDate } from '../followup/utils';
import { SubmissionService } from '../submissions';
import { DataSourceService } from '../dataSources';
import { buildRecordVisibilityContext, buildRowVisibilityContext } from '../updateRecordDependencies';
import { aggregateGeneratedBankReport, type GeneratedBankReportSheet } from './generatedBankReport';
import {
  buildAnalyticsReportTemplatePlaceholders,
  normalizeIngredientUsageAggregateQuantity,
  normalizeIngredientUsageQuantity
} from './reportFormatting';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DEFAULT_DATE_LABEL = 'Date';
const DEFAULT_SUBMIT_LABEL = 'Send report';
const DEFAULT_PENDING_LABEL = 'Sending...';
const DEFAULT_QUEUED_NOTICE = "Report request sent. We'll email it to the Operations Manager.";
const REPORT_SPREADSHEET_LOCALE_PROPERTY_KEY = 'CK_REPORT_SPREADSHEET_LOCALE';
const DEFAULT_REPORT_SPREADSHEET_LOCALE = 'nl_BE';
const EXPORT_SYNC_ATTEMPTS = 4;
const EXPORT_SYNC_SLEEP_MS = 1_500;

type IngredientUsageRow = {
  ingredient: string;
  unit: string;
  quantity: number;
  category: string;
};

type IngredientUsageAggregation = {
  rows: IngredientUsageRow[];
  recordCount: number;
};

type RecordTableRowContext = {
  record: WebFormSubmission;
  questions: QuestionConfig[];
  topCtx: ReturnType<typeof buildRecordVisibilityContext>['ctx'];
  row?: Record<string, any>;
  parentValues?: Record<string, any>;
  groupKey?: string;
  syntheticMissing?: boolean;
};

type RecordTableAggregation = {
  headers: string[];
  rows: any[][];
  recordCount: number;
};

type NumericColumnFormatRule = {
  integer?: string;
  decimal?: string;
};

type ReportNumberFormatPatterns = {
  decimal: string;
  integer: string;
};

type WorkbookSheet = GeneratedBankReportSheet & {
  columnNumberFormats?: Record<number, string>;
  numericColumnFormatRules?: Record<number, NumericColumnFormatRule>;
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
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const text = raw.toString().trim();
  if (!text) return null;
  const direct = Number(text.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(direct) ? direct : null;
};

const normalizeStatusToken = (value: any): string =>
  (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());

const normalizeStringList = (value: any): string[] =>
  (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value])
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .filter(Boolean);

const normalizePathList = (value: any): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split('.') : [])
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .filter(Boolean);

const replaceTemplateTokens = (template: string, placeholders: Record<string, string>): string =>
  (template || '').replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, token) => placeholders[`{{${token}}}`] ?? '');

const resolveQuestionLabel = (field: any, fallback = ''): string =>
  (
    field?.qEn ||
    field?.labelEn ||
    field?.label ||
    field?.id ||
    fallback ||
    ''
  )
    .toString()
    .trim();

const resolveRecordStatus = (record: WebFormSubmission, statusFieldIdRaw?: string): string => {
  const statusFieldId = (statusFieldIdRaw || '').toString().trim();
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

const resolveCurrentStatus = (
  record: WebFormSubmission,
  config: AnalyticsIngredientUsagePipelineConfig
): string => resolveRecordStatus(record, config.report.statusFieldId);

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

const resolveScriptProperty = (key: string): string => {
  try {
    const props = typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties
      ? PropertiesService.getScriptProperties()
      : null;
    return (props?.getProperty(key) || '').toString().trim();
  } catch {
    return '';
  }
};

const normalizeSpreadsheetLocale = (value: any): string => {
  const locale = (value === undefined || value === null ? '' : value.toString().trim()).replace('-', '_');
  return locale || DEFAULT_REPORT_SPREADSHEET_LOCALE;
};

const resolveReportSpreadsheetLocale = (): string =>
  normalizeSpreadsheetLocale(resolveScriptProperty(REPORT_SPREADSHEET_LOCALE_PROPERTY_KEY));

const resolveReportNumberFormatPatterns = (spreadsheetLocale: string): ReportNumberFormatPatterns => {
  normalizeSpreadsheetLocale(spreadsheetLocale);
  // Sheets format pattern syntax is en_US-style. The spreadsheet locale controls rendered separators.
  return {
    decimal: '#,##0.##',
    integer: '#,##0'
  };
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

const toFiniteNumber = (value: any): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const isEffectivelyInteger = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-9;

const resolveNumericFormat = (value: any, rule: NumericColumnFormatRule): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return '';
  return isEffectivelyInteger(numeric) ? (rule.integer || '') : (rule.decimal || '');
};

export class AnalyticsPipelineService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly submissions: SubmissionService;
  private readonly dataSources: DataSourceService;
  private readonly reportSpreadsheetLocale: string;
  private readonly reportNumberFormats: ReportNumberFormatPatterns;

  constructor(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    submissions: SubmissionService,
    dataSources: DataSourceService
  ) {
    this.ss = ss;
    this.submissions = submissions;
    this.dataSources = dataSources;
    this.reportSpreadsheetLocale = resolveReportSpreadsheetLocale();
    this.reportNumberFormats = resolveReportNumberFormatPatterns(this.reportSpreadsheetLocale);
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
          .map((pipeline, index) => {
            const sourceFormKey = (pipeline.sourceFormKey || ownerFormKey).toString().trim() || ownerFormKey;
            const sourceFormTitle =
              (byFormKey.get(sourceFormKey)?.title || sourceFormKey).toString().trim() || sourceFormKey;
            const title = resolveDisplayText(pipeline.title) || ownerFormTitle;
            const order = Number(pipeline.order);
            return {
              dashboardPipelineId: `${ownerFormKey}::${pipeline.id}`,
              pipelineId: pipeline.id,
              order: Number.isFinite(order) ? order : 1000 + index,
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
        const orderCompare = (left.order ?? 1000) - (right.order ?? 1000);
        if (orderCompare !== 0) return orderCompare;
        const titleCompare = left.title.localeCompare(right.title);
        if (titleCompare !== 0) return titleCompare;
        return left.sourceFormTitle.localeCompare(right.sourceFormTitle);
      });
  }

  runPipeline(args: {
    ownerForm: FormConfig;
    sourceForm: FormConfig;
    sourceQuestions: QuestionConfig[];
    relatedForms?: Record<string, { form: FormConfig; questions: QuestionConfig[] }>;
    pipeline: AnalyticsPipelineConfig;
    startDate: string;
  }): { success: boolean; message?: string; summary?: AnalyticsPipelineExecutionSummary } {
    const startDate = normalizeToIsoDate(args.startDate);
    const endDate = normalizeToIsoDate(new Date());
    if (!startDate || !endDate) {
      return { success: false, message: 'Invalid date range.' };
    }
    if (startDate > endDate) {
      return { success: false, message: 'Start date must be today or earlier.' };
    }

    const built = (() => {
      if (args.pipeline.type === 'ingredientUsageReport') {
        const aggregation = this.aggregateIngredientUsage({
          form: args.sourceForm,
          questions: args.sourceQuestions,
          pipeline: args.pipeline,
          startDate,
          endDate
        });
        return {
          recordCount: aggregation.recordCount,
          rowCount: aggregation.rows.length,
          artifact: this.buildIngredientUsageWorkbookArtifact({
            ownerForm: args.ownerForm,
            sourceForm: args.sourceForm,
            pipeline: args.pipeline,
            rows: aggregation.rows,
            startDate,
            endDate,
            recordCount: aggregation.recordCount
          })
        };
      }

      if (args.pipeline.type === 'recordTableReport') {
        const aggregation = this.aggregateRecordTable({
          form: args.sourceForm,
          questions: args.sourceQuestions,
          pipeline: args.pipeline,
          startDate,
          endDate
        });
        return {
          recordCount: aggregation.recordCount,
          rowCount: aggregation.rows.length,
          artifact: this.buildSpreadsheetArtifact({
            sourceForm: args.sourceForm,
            pipeline: args.pipeline,
            values: [aggregation.headers, ...aggregation.rows],
            startDate,
            endDate,
            recordCount: aggregation.recordCount,
            rowCount: aggregation.rows.length
          })
        };
      }

      if (args.pipeline.type === 'generatedBankReport') {
        const bankFormKey = (args.pipeline.report.bankFormKey || '').toString().trim();
        const bankContext = bankFormKey ? args.relatedForms?.[bankFormKey] : undefined;
        if (!bankContext) {
          return {
            error: `Unknown generated bank report form: ${bankFormKey || '(blank)'}`
          };
        }
        const sourceRecords = this.loadAllRecords(args.sourceForm, args.sourceQuestions);
        const bankRecords = this.loadAllRecords(bankContext.form, bankContext.questions);
        const aggregation = aggregateGeneratedBankReport({
          sourceRecords,
          bankRecords,
          report: args.pipeline.report,
          startDate,
          endDate
        });
        return {
          recordCount: aggregation.recordCount,
          rowCount: aggregation.rowCount,
          artifact: this.buildSpreadsheetArtifact({
            sourceForm: args.sourceForm,
            pipeline: args.pipeline,
            sheets: aggregation.sheets,
            startDate,
            endDate,
            recordCount: aggregation.recordCount,
            rowCount: aggregation.rowCount,
            defaultSheetName: 'Generated bank records'
          })
        };
      }

      return null;
    })();

    if (!built) {
      return { success: false, message: `Unsupported report pipeline type: ${(args.pipeline as any).type}` };
    }
    if ('error' in built) {
      return { success: false, message: built.error };
    }

    this.sendPipelineEmail({
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      artifact: built.artifact,
      startDate,
      endDate,
      recordCount: built.recordCount,
      rowCount: built.rowCount
    });

    debugLog('analytics.pipeline.completed', {
      ownerFormKey: args.ownerForm.configSheet || args.ownerForm.title || '',
      sourceFormKey: args.sourceForm.configSheet || args.sourceForm.title || '',
      pipelineId: args.pipeline.id,
      startDate,
      endDate,
      recordCount: built.recordCount,
      rowCount: built.rowCount,
      attachmentName: built.artifact.fileName
    });

    return {
      success: true,
      summary: {
        startDate,
        endDate,
        recordCount: built.recordCount,
        rowCount: built.rowCount,
        attachmentName: built.artifact.fileName,
        attachmentFileId: built.artifact.fileId,
        attachmentUrl: built.artifact.url
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
            const tablespoonGrams =
              (args.pipeline.report.tablespoonGramsFieldId
                ? toNumber(ingredientRow[args.pipeline.report.tablespoonGramsFieldId])
                : null) ??
              (args.pipeline.report.tablespoonGramsLookupColumn
                ? toNumber(details?.[args.pipeline.report.tablespoonGramsLookupColumn.toUpperCase()])
                : null);
            const normalized = normalizeIngredientUsageQuantity({
              quantity,
              unit,
              tablespoonGrams
            });
            if (normalized.missingTablespoonConversion) {
              debugLog('analytics.ingredientUsage.tablespoonConversionMissing', {
                pipelineId: args.pipeline.id,
                ingredient,
                unit
              });
            }
            const key = `${ingredient.toLowerCase()}::${normalized.unit.toLowerCase()}`;
            const current = grouped.get(key) || {
              ingredient,
              unit: normalized.unit,
              quantity: 0,
              category: ''
            };
            current.quantity += normalized.quantity;
            if (!current.category && category) current.category = category.toString().trim();
            grouped.set(key, current);
          });
        });
      });
    });

    const finalGrouped = new Map<string, IngredientUsageRow>();
    Array.from(grouped.values()).forEach(row => {
      const normalized = normalizeIngredientUsageAggregateQuantity({
        quantity: row.quantity,
        unit: row.unit
      });
      const key = `${row.ingredient.toLowerCase()}::${normalized.unit.toLowerCase()}`;
      const current = finalGrouped.get(key) || {
        ingredient: row.ingredient,
        unit: normalized.unit,
        quantity: 0,
        category: ''
      };
      current.quantity += normalized.quantity;
      if (!current.category && row.category) current.category = row.category;
      finalGrouped.set(key, current);
    });

    return {
      rows: Array.from(finalGrouped.values()).sort((left, right) => {
        const ingredientCompare = left.ingredient.localeCompare(right.ingredient);
        if (ingredientCompare !== 0) return ingredientCompare;
        return left.unit.localeCompare(right.unit);
      }),
      recordCount
    };
  }

  private aggregateRecordTable(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    pipeline: AnalyticsRecordTablePipelineConfig;
    startDate: string;
    endDate: string;
  }): RecordTableAggregation {
    const report = args.pipeline.report;
    const columns = Array.isArray(report.columns) ? report.columns : [];
    const headers = columns.map(column =>
      this.resolveRecordTableColumnHeader({
        report,
        questions: args.questions,
        column
      })
    );
    const records = this.loadAllRecords(args.form, args.questions);
    const includeStatuses = new Set(normalizeStringList(report.includeStatuses).map(normalizeStatusToken));
    const excludeStatuses = new Set(normalizeStringList(report.excludeStatuses).map(normalizeStatusToken));
    const contexts: RecordTableRowContext[] = [];
    const expectedKeys = new Set<string>();
    let recordCount = 0;

    records.forEach(record => {
      const recordDate = normalizeToIsoDate((record.values || {})[report.dateFieldId]);
      if (!recordDate || recordDate < args.startDate || recordDate > args.endDate) return;
      const status = normalizeStatusToken(resolveRecordStatus(record, report.statusFieldId));
      if (includeStatuses.size && !includeStatuses.has(status)) return;
      if (excludeStatuses.size && excludeStatuses.has(status)) return;

      const { ctx: topCtx } = buildRecordVisibilityContext(record, args.questions);
      if (report.when && !matchesWhenClause(report.when as WhenClause, topCtx, { now: new Date() })) return;

      const recordContexts = this.collectRecordTableContexts({
        record,
        questions: args.questions,
        report,
        topCtx
      });
      if (!recordContexts.length) return;
      recordCount += 1;
      recordContexts.forEach(context => {
        contexts.push(context);
        const expectedKey = this.resolveExpectedRecordKey(report, context.record);
        if (expectedKey) expectedKeys.add(expectedKey);
      });
    });

    this.appendExpectedRecordTableRows({
      contexts,
      expectedKeys,
      report,
      questions: args.questions,
      sourceFormKey: args.form.configSheet || args.form.title || '',
      startDate: args.startDate,
      endDate: args.endDate
    });

    contexts.sort((left, right) => this.compareRecordTableContexts(report, left, right));

    return {
      headers: headers.length ? headers : ['Report'],
      rows: contexts.map(context => columns.map(column => this.resolveRecordTableColumnValue(report, context, column))),
      recordCount
    };
  }

  private collectRecordTableContexts(args: {
    record: WebFormSubmission;
    questions: QuestionConfig[];
    report: AnalyticsRecordTableReportConfig;
    topCtx: ReturnType<typeof buildRecordVisibilityContext>['ctx'];
  }): RecordTableRowContext[] {
    const lineItem = args.report.lineItem;
    if (!lineItem?.groupId) {
      return [{ record: args.record, questions: args.questions, topCtx: args.topCtx }];
    }

    return this.collectLineItemRowsFromContainer(
      args.record.values || {},
      lineItem.groupId,
      normalizePathList(lineItem.subGroupPath)
    )
      .filter(entry =>
        this.matchesRecordTableLineItemFilter({
          entry,
          lineItem,
          topCtx: args.topCtx
        })
      )
      .map(entry => ({
        record: args.record,
        questions: args.questions,
        topCtx: args.topCtx,
        row: entry.row,
        parentValues: entry.parentValues,
        groupKey: entry.groupKey
      }));
  }

  private matchesRecordTableLineItemFilter(args: {
    entry: { row: Record<string, any>; parentValues?: Record<string, any>; groupKey: string };
    lineItem: AnalyticsRecordTableLineItemConfig;
    topCtx: ReturnType<typeof buildRecordVisibilityContext>['ctx'];
  }): boolean {
    const rowCtx = buildRowVisibilityContext({
      row: args.entry.row,
      groupKey: args.entry.groupKey,
      parentValues: args.entry.parentValues,
      topCtx: args.topCtx
    });
    if (args.lineItem.includeWhen && !matchesWhenClause(args.lineItem.includeWhen as WhenClause, rowCtx.ctx, { now: new Date() })) {
      return false;
    }
    if (args.lineItem.excludeWhen && matchesWhenClause(args.lineItem.excludeWhen as WhenClause, rowCtx.ctx, { now: new Date() })) {
      return false;
    }
    return true;
  }

  private collectLineItemRowsFromContainer(
    container: Record<string, any>,
    groupId: string,
    subGroupPath: string[] = []
  ): Array<{ row: Record<string, any>; parentValues?: Record<string, any>; groupKey: string }> {
    const rootRows = parseLineItemRows((container || {})[groupId] || (container || {})[`${groupId}_json`]);
    if (!subGroupPath.length) {
      return rootRows.map(row => ({ row, groupKey: groupId }));
    }

    const collect = (
      rows: Record<string, any>[],
      path: string[],
      parentValues: Record<string, any> | undefined,
      groupKey: string
    ): Array<{ row: Record<string, any>; parentValues?: Record<string, any>; groupKey: string }> => {
      if (!path.length) return rows.map(row => ({ row, parentValues, groupKey }));
      const [nextGroupId, ...rest] = path;
      return rows.flatMap(row => {
        const childRows = parseLineItemRows(row[nextGroupId] || row[`${nextGroupId}_json`]);
        return collect(childRows, rest, row, nextGroupId);
      });
    };

    return collect(rootRows, subGroupPath, undefined, groupId);
  }

  private resolveExpectedRecordKey(report: AnalyticsRecordTableReportConfig, record: WebFormSubmission): string {
    const keyFields = normalizeStringList(report.expectedRows?.keyFields);
    if (!keyFields.length) return '';
    return keyFields.map(fieldId => this.stringifyRecordTableCell(this.resolveRecordFieldValue(record, fieldId))).join('::');
  }

  private appendExpectedRecordTableRows(args: {
    contexts: RecordTableRowContext[];
    expectedKeys: Set<string>;
    report: AnalyticsRecordTableReportConfig;
    questions: QuestionConfig[];
    sourceFormKey: string;
    startDate: string;
    endDate: string;
  }): void {
    const expected = args.report.expectedRows;
    const dailyRows = Array.isArray(expected?.daily) ? expected?.daily || [] : [];
    const keyFields = normalizeStringList(expected?.keyFields);
    if (!dailyRows.length || !keyFields.length) return;

    const maxDays = Math.max(1, Math.min(750, Number(expected?.maxDays || 370) || 370));
    const cursor = new Date(`${args.startDate}T00:00:00Z`);
    const end = new Date(`${args.endDate}T00:00:00Z`);
    let dayCount = 0;
    while (cursor <= end && dayCount < maxDays) {
      const dateIso = cursor.toISOString().slice(0, 10);
      dailyRows.forEach(template => {
        const values = {
          ...(template || {}),
          [args.report.dateFieldId]: dateIso
        };
        const key = keyFields.map(fieldId => this.stringifyRecordTableCell(values[fieldId])).join('::');
        if (!key || args.expectedKeys.has(key)) return;
        args.expectedKeys.add(key);
        const record: WebFormSubmission = {
          formKey: args.sourceFormKey,
          language: 'EN',
          status: '',
          values
        };
        const { ctx: topCtx } = buildRecordVisibilityContext(record, args.questions);
        args.contexts.push({
          record,
          questions: args.questions,
          topCtx,
          syntheticMissing: true
        });
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      dayCount += 1;
    }
  }

  private compareRecordTableContexts(
    report: AnalyticsRecordTableReportConfig,
    left: RecordTableRowContext,
    right: RecordTableRowContext
  ): number {
    const leftDate = normalizeToIsoDate((left.record.values || {})[report.dateFieldId]) || '';
    const rightDate = normalizeToIsoDate((right.record.values || {})[report.dateFieldId]) || '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    const leftKey = this.resolveExpectedRecordKey(report, left.record);
    const rightKey = this.resolveExpectedRecordKey(report, right.record);
    return leftKey.localeCompare(rightKey);
  }

  private resolveRecordTableColumnValue(
    report: AnalyticsRecordTableReportConfig,
    context: RecordTableRowContext,
    column: AnalyticsRecordTableColumnConfig
  ): any {
    const source = column.source || (context.row && column.fieldId ? 'lineItemField' : 'recordField');
    let rawValue: any = '';
    if (source === 'recordField') rawValue = this.resolveRecordFieldValue(context.record, column.fieldId || '');
    else if (source === 'recordStatus') rawValue = resolveRecordStatus(context.record, report.statusFieldId);
    else if (source === 'lineItemField') rawValue = this.resolveLineItemFieldValue(context.row, column.fieldId || '');
    else if (source === 'hasLineItem') rawValue = this.resolveHasLineItemColumn(context, column);
    else if (source === 'lineItemAggregate') rawValue = this.resolveLineItemAggregateColumn(context, column);
    else if (source === 'completionStatus') rawValue = this.resolveCompletionStatusColumn(report, context, column);
    else if (source === 'firstMissingStep') rawValue = this.resolveMissingStepLabels(report, context)[0] || column.fallback || '';
    else if (source === 'missingSteps') rawValue = this.resolveMissingStepLabels(report, context).join(column.separator || ', ');
    else if (source === 'constant') rawValue = column.value;

    const mapped = this.applyRecordTableValueMap(rawValue, column);
    return this.stringifyRecordTableCell(mapped);
  }

  private resolveRecordTableColumnHeader(args: {
    report: AnalyticsRecordTableReportConfig;
    questions: QuestionConfig[];
    column: AnalyticsRecordTableColumnConfig;
  }): string {
    const configured = (args.column.header || '').toString().trim();
    if (configured) return configured;

    const fieldId = (args.column.fieldId || '').toString().trim();
    const source = args.column.source || (fieldId ? 'recordField' : '');
    if (source === 'recordField' && fieldId) {
      const question = args.questions.find(entry => entry.id === fieldId);
      return resolveQuestionLabel(question, fieldId);
    }
    if (source === 'lineItemField' && fieldId) {
      const lineItem = args.report.lineItem;
      const field = lineItem?.groupId
        ? this.findNestedFieldConfig(args.questions, lineItem.groupId, normalizePathList(lineItem.subGroupPath), fieldId)
        : null;
      return resolveQuestionLabel(field, fieldId);
    }
    if (source === 'recordStatus') return 'Status';
    if (source === 'completionStatus') return 'Status';
    if (source === 'firstMissingStep') return 'First missing step';
    if (source === 'missingSteps') return 'Missing steps';
    return fieldId || 'Column';
  }

  private resolveRecordFieldValue(record: WebFormSubmission, fieldId: string): any {
    const id = (fieldId || '').toString().trim();
    if (!id) return '';
    if (Object.prototype.hasOwnProperty.call(record.values || {}, id)) return (record.values || {})[id];
    const lower = id.toLowerCase();
    if (lower === 'status') return record.status || '';
    if (lower === 'id') return record.id || '';
    if (lower === 'createdat') return record.createdAt || '';
    if (lower === 'updatedat') return record.updatedAt || '';
    if (lower === 'pdfurl') return record.pdfUrl || '';
    return '';
  }

  private resolveLineItemFieldValue(row: Record<string, any> | undefined, fieldId: string): any {
    if (!row || !fieldId) return '';
    if (Object.prototype.hasOwnProperty.call(row, fieldId)) return row[fieldId];
    return '';
  }

  private resolveHasLineItemColumn(context: RecordTableRowContext, column: AnalyticsRecordTableColumnConfig): string {
    const rows = this.collectColumnLineItemRows(context, column);
    const hasMatch = rows.some(entry => this.matchesColumnLineItemWhen(context, column, entry));
    return hasMatch ? column.trueLabel || 'Yes' : column.falseLabel || 'No';
  }

  private resolveLineItemAggregateColumn(context: RecordTableRowContext, column: AnalyticsRecordTableColumnConfig): any {
    const rows = this.collectColumnLineItemRows(context, column).filter(entry =>
      this.matchesColumnLineItemWhen(context, column, entry)
    );
    const aggregate = (column.aggregate || 'sum').toString();
    if (aggregate === 'count') return rows.length;
    if (aggregate === 'listUnique') {
      const seen = new Set<string>();
      rows.forEach(entry => {
        const value = this.stringifyRecordTableCell(this.resolveLineItemFieldValue(entry.row, column.fieldId || ''));
        if (value) seen.add(value);
      });
      return Array.from(seen).join(column.separator || ', ');
    }
    return rows.reduce((sum, entry) => sum + (toNumber(this.resolveLineItemFieldValue(entry.row, column.fieldId || '')) || 0), 0);
  }

  private collectColumnLineItemRows(
    context: RecordTableRowContext,
    column: AnalyticsRecordTableColumnConfig
  ): Array<{ row: Record<string, any>; parentValues?: Record<string, any>; groupKey: string }> {
    const groupId = (column.groupId || '').toString().trim();
    if (!groupId) return [];
    const source = context.row && (
      Object.prototype.hasOwnProperty.call(context.row, groupId) ||
      Object.prototype.hasOwnProperty.call(context.row, `${groupId}_json`)
    )
      ? context.row
      : context.record.values || {};
    return this.collectLineItemRowsFromContainer(source, groupId, normalizePathList(column.subGroupPath));
  }

  private matchesColumnLineItemWhen(
    context: RecordTableRowContext,
    column: AnalyticsRecordTableColumnConfig,
    entry: { row: Record<string, any>; parentValues?: Record<string, any>; groupKey: string }
  ): boolean {
    if (!column.when) return true;
    const rowCtx = buildRowVisibilityContext({
      row: entry.row,
      groupKey: entry.groupKey,
      parentValues: entry.parentValues || context.row,
      topCtx: context.topCtx
    });
    return matchesWhenClause(column.when as WhenClause, rowCtx.ctx, { now: new Date() });
  }

  private resolveCompletionStatusColumn(
    report: AnalyticsRecordTableReportConfig,
    context: RecordTableRowContext,
    column: AnalyticsRecordTableColumnConfig
  ): string {
    if (context.syntheticMissing) return column.missingLabel || 'Missing';
    const completedStatuses = new Set(normalizeStringList(report.completedStatuses).map(normalizeStatusToken));
    const status = normalizeStatusToken(resolveRecordStatus(context.record, report.statusFieldId));
    const complete = completedStatuses.size ? completedStatuses.has(status) : status === 'closed';
    return complete ? column.completeLabel || 'Complete' : column.incompleteLabel || 'Incomplete';
  }

  private resolveMissingStepLabels(report: AnalyticsRecordTableReportConfig, context: RecordTableRowContext): string[] {
    return (Array.isArray(report.steps) ? report.steps : [])
      .filter(step => {
        if (!step?.completeWhen) return false;
        return !matchesWhenClause(step.completeWhen as WhenClause, context.topCtx, { now: new Date() });
      })
      .map(step => (step.label || '').toString().trim())
      .filter(Boolean);
  }

  private applyRecordTableValueMap(value: any, column: AnalyticsRecordTableColumnConfig): any {
    const valueMap = column.valueMap && typeof column.valueMap === 'object' ? column.valueMap : null;
    if (!valueMap) return value;
    const text = this.stringifyRecordTableCell(value);
    if (Object.prototype.hasOwnProperty.call(valueMap, text)) return valueMap[text];
    const lower = text.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(valueMap, lower)) return valueMap[lower];
    return value;
  }

  private stringifyRecordTableCell(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      return value.map(entry => this.stringifyRecordTableCell(entry)).filter(Boolean).join(', ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return `${value}`;
    }
  }

  private buildIngredientUsageWorkbookArtifact(args: {
    ownerForm: FormConfig;
    sourceForm: FormConfig;
    pipeline: AnalyticsIngredientUsagePipelineConfig;
    rows: IngredientUsageRow[];
    startDate: string;
    endDate: string;
    recordCount: number;
  }): { blob: GoogleAppsScript.Base.Blob; fileName: string; fileId?: string; url?: string } {
    const values: any[][] = [['Ingredients', 'Quantity', 'Unit', 'Category']];
    args.rows.forEach(row => {
      values.push([row.ingredient, row.quantity, row.unit, row.category]);
    });
    return this.buildSpreadsheetArtifact({
      sourceForm: args.sourceForm,
      pipeline: args.pipeline,
      values,
      numericColumnFormatRules: { 2: { decimal: this.reportNumberFormats.decimal, integer: this.reportNumberFormats.integer } },
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rows.length,
      defaultSheetName: 'Ingredients'
    });
  }

  private buildSpreadsheetArtifact(args: {
    sourceForm: FormConfig;
    pipeline: AnalyticsPipelineConfig;
    values?: any[][];
    sheets?: WorkbookSheet[];
    columnNumberFormats?: Record<number, string>;
    numericColumnFormatRules?: Record<number, NumericColumnFormatRule>;
    startDate: string;
    endDate: string;
    recordCount: number;
    rowCount: number;
    defaultSheetName?: string;
  }): { blob: GoogleAppsScript.Base.Blob; fileName: string; fileId?: string; url?: string } {
    const title = resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Report';
    const fileName = this.resolveAttachmentFileName({
      title,
      attachmentConfig: args.pipeline.attachment,
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rowCount
    });
    const createSpreadsheet = resolveTempSpreadsheetCreate();
    const temp = createSpreadsheet(fileName.replace(/\.xlsx$/i, ''));
    this.applyReportSpreadsheetLocale(temp);
    const tempId = temp.getId();

    try {
      const workbookSheets =
        Array.isArray(args.sheets) && args.sheets.length
          ? args.sheets
          : [
              {
                name: (args.pipeline.attachment?.sheetName || args.defaultSheetName || 'Report').toString().trim(),
                values: Array.isArray(args.values) ? args.values : [],
                columnNumberFormats: args.columnNumberFormats,
                numericColumnFormatRules: args.numericColumnFormatRules
              }
            ];
      workbookSheets.forEach((entry, index) => {
        const sheet = index === 0 ? temp.getSheets()[0] || temp.insertSheet('Report') : temp.insertSheet((entry.name || `Report ${index + 1}`).slice(0, 99));
        const sheetName = (entry.name || args.defaultSheetName || `Report ${index + 1}`).toString().trim() || `Report ${index + 1}`;
        if (index === 0 && sheetName && typeof sheet.setName === 'function') {
          try {
            sheet.setName(sheetName.slice(0, 99));
          } catch {
            // keep the default name when renaming fails
          }
        }
        const values = entry.values.length ? entry.values : [['No data']];
        sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
        sheet.getRange(1, 1, 1, values[0].length).setFontWeight('bold');
        this.applyColumnNumberFormats({
          sheet,
          rowCount: values.length,
          columnCount: values[0].length,
          values,
          columnNumberFormats: entry.columnNumberFormats,
          numericColumnFormatRules: entry.numericColumnFormatRules
        });

        this.waitForWorkbookContentToPersist({
          spreadsheetId: tempId,
          sheetName,
          verificationRows: values.slice(0, Math.min(values.length, 2))
        });
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

  private applyColumnNumberFormats(args: {
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    rowCount: number;
    columnCount: number;
    values: any[][];
    columnNumberFormats?: Record<number, string>;
    numericColumnFormatRules?: Record<number, NumericColumnFormatRule>;
  }): void {
    if (args.rowCount <= 1) return;
    Object.entries(args.columnNumberFormats || {}).forEach(([rawColumnIndex, rawFormat]) => {
      const columnIndex = Number(rawColumnIndex);
      const format = (rawFormat || '').toString().trim();
      if (!Number.isInteger(columnIndex) || columnIndex < 1 || columnIndex > args.columnCount || !format) return;
      args.sheet.getRange(2, columnIndex, args.rowCount - 1, 1).setNumberFormat(format);
    });
    Object.entries(args.numericColumnFormatRules || {}).forEach(([rawColumnIndex, rule]) => {
      const columnIndex = Number(rawColumnIndex);
      if (!Number.isInteger(columnIndex) || columnIndex < 1 || columnIndex > args.columnCount || !rule) return;
      let runFormat = '';
      let runStartRow = 0;
      let runLength = 0;
      const flushRun = () => {
        if (!runFormat || runStartRow <= 0 || runLength <= 0) return;
        args.sheet.getRange(runStartRow, columnIndex, runLength, 1).setNumberFormat(runFormat);
      };
      for (let rowIndex = 1; rowIndex < args.values.length; rowIndex += 1) {
        const format = resolveNumericFormat(args.values[rowIndex]?.[columnIndex - 1], rule);
        const sheetRow = rowIndex + 1;
        if (!format) {
          flushRun();
          runFormat = '';
          runStartRow = 0;
          runLength = 0;
          continue;
        }
        if (format === runFormat && runStartRow > 0) {
          runLength += 1;
          continue;
        }
        flushRun();
        runFormat = format;
        runStartRow = sheetRow;
        runLength = 1;
      }
      flushRun();
    });
  }

  private applyReportSpreadsheetLocale(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const setLocale = (spreadsheet as any)?.setSpreadsheetLocale;
    if (typeof setLocale !== 'function') return;
    try {
      setLocale.call(spreadsheet, this.reportSpreadsheetLocale);
    } catch {
      // Keep report generation best-effort if the Sheets runtime rejects the locale.
    }
  }

  private sendPipelineEmail(args: {
    sourceForm: FormConfig;
    pipeline: AnalyticsPipelineConfig;
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
    const placeholders = buildAnalyticsReportTemplatePlaceholders({
      title: resolveDisplayText(args.pipeline.title) || args.sourceForm.title || 'Report',
      startDate: args.startDate,
      endDate: args.endDate,
      recordCount: args.recordCount,
      rowCount: args.rowCount,
      attachmentName: args.artifact.fileName,
      sourceForm: (args.sourceForm.title || args.sourceForm.configSheet || '').toString().trim()
    });
    const toRecipients = resolveRecipients(this.dataSources, args.pipeline.email.recipients, placeholders, syntheticRecord);
    if (!toRecipients.length) {
      throw new Error('Resolved report recipients are empty.');
    }
    const ccRecipients = resolveRecipients(this.dataSources, args.pipeline.email.cc, placeholders, syntheticRecord);
    const bccRecipients = resolveRecipients(this.dataSources, args.pipeline.email.bcc, placeholders, syntheticRecord);
    const subjectTemplate =
      resolveLocalizedStringValue(args.pipeline.email.subject, 'EN') || '{{PIPELINE_TITLE}} | {{START_DATE}} to {{END_DATE}}';
    const messageTemplate =
      resolveLocalizedStringValue(args.pipeline.email.message, 'EN') ||
      'The requested report is attached.\n\nRange: {{START_DATE}} to {{END_DATE}}\nRecords included: {{RECORD_COUNT}}\nRows: {{ROW_COUNT}}';
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

    GmailApp.sendEmail(toRecipients.join(','), subject || 'Report', body || 'See attached report.', {
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
    attachmentConfig: AnalyticsPipelineConfig['attachment'] | undefined;
    startDate: string;
    endDate: string;
    recordCount: number;
    rowCount: number;
  }): string {
    const template =
      (args.attachmentConfig?.fileNameTemplate || '{{PIPELINE_TITLE}} {{START_DATE}} to {{END_DATE}}.xlsx').toString();
    const text = replaceTemplateTokens(
      template,
      buildAnalyticsReportTemplatePlaceholders({
        title: args.title,
        startDate: args.startDate,
        endDate: args.endDate,
        recordCount: args.recordCount,
        rowCount: args.rowCount
      })
    )
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const withExtension = /\.xlsx$/i.test(text) ? text : `${text || 'report'}.xlsx`;
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
