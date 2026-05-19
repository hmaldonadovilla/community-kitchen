import type { AnalyticsGeneratedBankReportConfig, WebFormSubmission } from '../../../types';
import { ROW_ID_KEY } from '../../../web/react/app/lineItems';
import { normalizeToIsoDate } from '../followup/utils';
import { formatAnalyticsReportDateToken } from './reportFormatting';

export type GeneratedBankReportSheet = {
  name: string;
  values: any[][];
};

export type GeneratedBankReportAggregation = {
  sheets: GeneratedBankReportSheet[];
  recordCount: number;
  rowCount: number;
};

type PrepContext = {
  mealRow: Record<string, any>;
  prepRow: Record<string, any>;
  siblingPrepRows: Array<Record<string, any>>;
};

const MI_HEADERS = [
  'Meal Production date',
  'Customer',
  'Service',
  'Responsible cook',
  'Dietary Category',
  'Recipe',
  'Ordered portions',
  'To cook portions',
  'Delivered portions',
  'Leftover used',
  'MI leftover name',
  'MI leftover portions',
  'Frozen'
];

const SI_HEADERS = [
  'Meal Production date',
  'Customer',
  'Service',
  'Responsible cook',
  'SI leftover name',
  'SI leftover quantity',
  'SI leftover unit',
  'Frozen'
];

const toText = (value: any): string => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeToken = (value: any): string => toText(value).toLowerCase();

const normalizeList = (value: any, fallback: string[]): string[] =>
  (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? fallback : [value])
    .map(toText)
    .filter(Boolean);

const parseLineItemRows = (raw: any): Array<Record<string, any>> => {
  if (Array.isArray(raw)) return raw.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
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

const rowId = (row: Record<string, any> | undefined): string => toText(row?.[ROW_ID_KEY] || row?.id);

const valueByField = (values: Record<string, any> | undefined, fieldId: string): any => {
  const id = toText(fieldId);
  if (!id || !values) return '';
  return Object.prototype.hasOwnProperty.call(values, id) ? values[id] : '';
};

const hasReportValue = (value: any): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

const preferredValueByField = (
  preferredValues: Record<string, any> | undefined,
  fallbackValues: Record<string, any> | undefined,
  fieldId: string
): any => {
  const preferred = valueByField(preferredValues, fieldId);
  return hasReportValue(preferred) ? preferred : valueByField(fallbackValues, fieldId);
};

const preferredValueByFields = (
  preferredValues: Record<string, any> | undefined,
  fallbackValues: Record<string, any> | undefined,
  preferredFieldId: string,
  fallbackFieldId: string
): any => {
  const preferred = valueByField(preferredValues, preferredFieldId);
  return hasReportValue(preferred) ? preferred : valueByField(fallbackValues, fallbackFieldId);
};

const displayValue = (values: Record<string, any> | undefined, fieldId: string, displayFieldId?: string): any => {
  const raw = valueByField(values, fieldId);
  const displayField = toText(displayFieldId);
  if (displayField && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const display = (raw as Record<string, any>)[displayField];
    if (display !== undefined && display !== null && toText(display)) return display;
  }
  return raw;
};

const frozenLabel = (bankValues: Record<string, any>, report: AnalyticsGeneratedBankReportConfig): string => {
  const frozenValue = normalizeToken(report.frozenStorageValue || 'Frozen');
  return normalizeToken(valueByField(bankValues, report.storageFieldId)) === frozenValue
    ? report.yesLabel || 'YES'
    : report.noLabel || 'NO';
};

const frozenLabelFromPreferredValues = (
  preferredValues: Record<string, any> | undefined,
  fallbackValues: Record<string, any>,
  report: AnalyticsGeneratedBankReportConfig
): string => {
  const frozenValue = normalizeToken(report.frozenStorageValue || 'Frozen');
  return normalizeToken(preferredValueByField(preferredValues, fallbackValues, report.storageFieldId)) === frozenValue
    ? report.yesLabel || 'YES'
    : report.noLabel || 'NO';
};

const isKind = (bankValues: Record<string, any>, report: AnalyticsGeneratedBankReportConfig, configuredKinds: string[]): boolean => {
  const kind = normalizeToken(valueByField(bankValues, report.bankKindFieldId));
  const allowed = normalizeList(configuredKinds, []).map(normalizeToken).filter(Boolean);
  return !!kind && allowed.includes(kind);
};

const sourceRecordIncluded = (
  record: WebFormSubmission,
  report: AnalyticsGeneratedBankReportConfig,
  startDate: string,
  endDate: string
): boolean => {
  const recordDate = normalizeToIsoDate((record.values || {})[report.dateFieldId]);
  if (!recordDate || recordDate < startDate || recordDate > endDate) return false;
  const statuses = normalizeList(report.includeStatuses, []).map(normalizeToken);
  if (!statuses.length) return true;
  const statusFieldId = toText(report.statusFieldId);
  const rawStatus =
    statusFieldId && Object.prototype.hasOwnProperty.call(record.values || {}, statusFieldId)
      ? (record.values || {})[statusFieldId]
      : record.status;
  return statuses.includes(normalizeToken(rawStatus));
};

const findCookPrepContext = (
  record: WebFormSubmission,
  sourceRowId: string,
  report: AnalyticsGeneratedBankReportConfig
): PrepContext | null => {
  const cookValue = normalizeToken(report.cookPrepTypeValue || 'Cook');
  const mealRows = parseLineItemRows((record.values || {})[report.mealGroupId]);
  for (const mealRow of mealRows) {
    const siblingPrepRows = parseLineItemRows(mealRow[report.prepGroupId]);
    const prepRow = siblingPrepRows.find(row => rowId(row) === sourceRowId);
    if (!prepRow) continue;
    if (normalizeToken(prepRow[report.prepTypeFieldId]) !== cookValue) return null;
    return { mealRow, prepRow, siblingPrepRows };
  }
  return null;
};

const findLineItemRowById = (raw: any, targetRowId: string, visited = new Set<any>()): Record<string, any> | null => {
  const target = toText(targetRowId);
  if (!target || raw === undefined || raw === null) return null;

  if (typeof raw === 'string') {
    const rows = parseLineItemRows(raw);
    for (const row of rows) {
      const match = findLineItemRowById(row, target, visited);
      if (match) return match;
    }
    return null;
  }

  if (typeof raw !== 'object') return null;
  if (visited.has(raw)) return null;
  visited.add(raw);

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const match = findLineItemRowById(item, target, visited);
      if (match) return match;
    }
    return null;
  }

  const candidate = raw as Record<string, any>;
  if (rowId(candidate) === target) return candidate;

  for (const value of Object.values(candidate)) {
    const match = findLineItemRowById(value, target, visited);
    if (match) return match;
  }
  return null;
};

const findSingleSourceRow = (
  sourceValues: Record<string, any>,
  bankValues: Record<string, any>,
  report: AnalyticsGeneratedBankReportConfig
): Record<string, any> | null => {
  const targetRowId = toText(valueByField(bankValues, report.bankSourceRowIdFieldId));
  const byId = findLineItemRowById(sourceValues, targetRowId);
  if (byId) return byId;

  const groupId = toText((report as any).singleSourceGroupId);
  if (!groupId) return null;
  const rows = parseLineItemRows(sourceValues[groupId]);
  if (!rows.length) return null;
  const sourceNameFieldId = toText((report as any).singleSourceNameFieldId) || report.singleLeftoverNameFieldId;
  const bankName = normalizeToken(valueByField(bankValues, report.singleLeftoverNameFieldId));
  if (!bankName) return null;
  return rows.find(row => normalizeToken(valueByField(row, sourceNameFieldId)) === bankName) || null;
};

const hasLeftoverSibling = (context: PrepContext, report: AnalyticsGeneratedBankReportConfig): boolean => {
  const cookValue = normalizeToken(report.cookPrepTypeValue || 'Cook');
  return context.siblingPrepRows.some(row => {
    const prepType = normalizeToken(row[report.prepTypeFieldId]);
    return !!prepType && prepType !== cookValue;
  });
};

const sortRows = (rows: any[][]): any[][] =>
  rows.slice().sort((left, right) => {
    for (let index = 0; index < Math.min(5, left.length, right.length); index += 1) {
      const result = toText(left[index]).localeCompare(toText(right[index]));
      if (result !== 0) return result;
    }
    return 0;
  });

export const aggregateGeneratedBankReport = (args: {
  sourceRecords: WebFormSubmission[];
  bankRecords: WebFormSubmission[];
  report: AnalyticsGeneratedBankReportConfig;
  startDate: string;
  endDate: string;
}): GeneratedBankReportAggregation => {
  const report = args.report;
  const multiKinds = normalizeList(report.multiIngredientKindValues, ['Multi-ingredient', 'Entire dish']);
  const singleKinds = normalizeList(report.singleIngredientKindValues, ['Single-ingredient', 'Part dish']);
  const sourceRecordsById = new Map<string, WebFormSubmission>();
  args.sourceRecords.forEach(record => {
    const recordId = toText(record.id);
    if (!recordId || !sourceRecordIncluded(record, report, args.startDate, args.endDate)) return;
    sourceRecordsById.set(recordId, record);
  });

  const includedSourceRecordIds = new Set<string>();
  const miRows: any[][] = [];
  const siRows: any[][] = [];

  args.bankRecords.forEach(bankRecord => {
    const bankValues = bankRecord.values || {};
    const sourceRecordId = toText(valueByField(bankValues, report.bankSourceRecordIdFieldId));
    const sourceRecord = sourceRecordsById.get(sourceRecordId);
    if (!sourceRecord) return;
    const sourceValues = sourceRecord.values || {};
    const formattedDate = formatAnalyticsReportDateToken(normalizeToIsoDate(sourceValues[report.dateFieldId]) || '');
    const baseCells = [
      formattedDate,
      displayValue(sourceValues, report.customerFieldId, report.customerDisplayField),
      valueByField(sourceValues, report.serviceFieldId),
      valueByField(sourceValues, report.cookFieldId)
    ];

    if (isKind(bankValues, report, multiKinds)) {
      const context = findCookPrepContext(sourceRecord, toText(valueByField(bankValues, report.bankSourceRowIdFieldId)), report);
      if (!context) return;
      includedSourceRecordIds.add(sourceRecordId);
      miRows.push([
        ...baseCells,
        valueByField(context.mealRow, report.dietaryFieldId),
        valueByField(context.prepRow, report.originalRecipeFieldId),
        valueByField(context.mealRow, report.orderedPortionsFieldId),
        valueByField(context.mealRow, report.toCookPortionsFieldId),
        valueByField(context.mealRow, report.deliveredPortionsFieldId),
        hasLeftoverSibling(context, report) ? report.yesLabel || 'YES' : report.noLabel || 'NO',
        valueByField(bankValues, report.multiLeftoverNameFieldId),
        valueByField(bankValues, report.multiLeftoverPortionsFieldId),
        frozenLabel(bankValues, report)
      ]);
      return;
    }

    if (isKind(bankValues, report, singleKinds)) {
      const sourceRow = findSingleSourceRow(sourceValues, bankValues, report);
      const sourceNameFieldId = toText((report as any).singleSourceNameFieldId) || report.singleLeftoverNameFieldId;
      const sourceQuantityFieldId = toText((report as any).singleSourceQuantityFieldId) || report.singleLeftoverQuantityFieldId;
      const sourceUnitFieldId = toText((report as any).singleSourceUnitFieldId) || report.singleLeftoverUnitFieldId;
      const sourceStorageFieldId = toText((report as any).singleSourceStorageFieldId) || report.storageFieldId;
      includedSourceRecordIds.add(sourceRecordId);
      siRows.push([
        ...baseCells,
        preferredValueByFields(sourceRow || undefined, bankValues, sourceNameFieldId, report.singleLeftoverNameFieldId),
        preferredValueByFields(sourceRow || undefined, bankValues, sourceQuantityFieldId, report.singleLeftoverQuantityFieldId),
        preferredValueByFields(sourceRow || undefined, bankValues, sourceUnitFieldId, report.singleLeftoverUnitFieldId),
        frozenLabelFromPreferredValues(
          sourceRow ? { ...sourceRow, [report.storageFieldId]: valueByField(sourceRow, sourceStorageFieldId) } : undefined,
          bankValues,
          report
        )
      ]);
    }
  });

  const sortedMiRows = sortRows(miRows);
  const sortedSiRows = sortRows(siRows);

  return {
    recordCount: includedSourceRecordIds.size,
    rowCount: sortedMiRows.length + sortedSiRows.length,
    sheets: [
      {
        name: report.multiSheetName || 'Generated MI leftovers',
        values: [MI_HEADERS, ...sortedMiRows]
      },
      {
        name: report.singleSheetName || 'Generated SI leftovers',
        values: [SI_HEADERS, ...sortedSiRows]
      }
    ]
  };
};
