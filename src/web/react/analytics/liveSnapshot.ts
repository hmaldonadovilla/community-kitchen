import type {
  AnalyticsAggregateCalculation,
  AnalyticsSnapshot,
  AnalyticsSnapshotItem,
  AnalyticsWidgetConfig,
  WebFormSubmission
} from '../../../types';
import { matchesWhenClause } from '../../rules/visibility';

type RecordContribution = {
  value: number;
  matchedRecords: number;
  matchedLineItems: number;
};

const parseJson = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const parseLineItemRows = (record: WebFormSubmission, groupId: string): Array<Record<string, any>> => {
  const fromValues = (record.values || ({} as any))[groupId];
  if (Array.isArray(fromValues)) {
    return fromValues.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
  }
  if (typeof fromValues === 'string') {
    const parsed = parseJson(fromValues.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
    }
  }
  const fromLineItems = ((record as any).lineItems || {})[groupId];
  if (Array.isArray(fromLineItems)) {
    return fromLineItems
      .map(entry => {
        if (!entry || typeof entry !== 'object') return null;
        return entry.values && typeof entry.values === 'object' ? entry.values : entry;
      })
      .filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
  }
  return [];
};

const toNumber = (raw: any): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const text = raw.toString().trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, '');
  const direct = Number(compact);
  if (Number.isFinite(direct)) return direct;
  if (compact.includes('.') && compact.includes(',')) {
    const n = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  if (compact.includes(',') && !compact.includes('.')) {
    const n = Number(compact.replace(/,/g, '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const isNonEmpty = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string') return raw.trim() !== '';
  if (Array.isArray(raw)) return raw.length > 0;
  return true;
};

const resolveLineItemFieldValue = (row: Record<string, any>, fieldId: string): any => {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldId)) return row[fieldId];
  if (row.values && typeof row.values === 'object') return (row.values as any)[fieldId];
  return undefined;
};

const buildRecordContext = (row: Record<string, any>) => ({
  getValue: (fieldId: string) => row[fieldId],
  getLineItems: undefined,
  getLineValue: undefined
});

const buildLineContext = (lineValues: Record<string, any>, row: Record<string, any>) => ({
  getValue: (fieldId: string) => {
    if (Object.prototype.hasOwnProperty.call(lineValues, fieldId)) return lineValues[fieldId];
    return row[fieldId];
  },
  getLineItems: undefined,
  getLineValue: undefined
});

const formatValueText = (value: number, maximumFractionDigits?: number): string => {
  const fractionDigits =
    maximumFractionDigits !== undefined && Number.isFinite(Number(maximumFractionDigits))
      ? Math.max(0, Math.min(6, Math.round(Number(maximumFractionDigits))))
      : 0;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits }).format(value);
};

const evaluateRecordAggregateContribution = (
  record: WebFormSubmission | null | undefined,
  calc: AnalyticsAggregateCalculation
): RecordContribution => {
  if (!record) return { value: 0, matchedRecords: 0, matchedLineItems: 0 };
  const row = {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    pdfUrl: record.pdfUrl,
    ...(record.values || {})
  } as Record<string, any>;
  if (calc.when && !matchesWhenClause(calc.when as any, buildRecordContext(row) as any)) {
    return { value: 0, matchedRecords: 0, matchedLineItems: 0 };
  }

  const aggregate = calc.aggregate === 'sum' ? 'sum' : 'count';
  const groupId = (calc.groupId || '').toString().trim();
  const fieldId = (calc.fieldId || '').toString().trim();
  let matchedLineItems = 0;
  let value = 0;

  if (groupId) {
    parseLineItemRows(record, groupId).forEach(lineRow => {
      const lineValues =
        lineRow && typeof lineRow === 'object' && lineRow.values && typeof lineRow.values === 'object'
          ? ({ ...(lineRow.values as any) } as Record<string, any>)
          : ({ ...(lineRow as any) } as Record<string, any>);
      if (calc.lineWhen && !matchesWhenClause(calc.lineWhen as any, buildLineContext(lineValues, row) as any)) return;
      matchedLineItems += 1;
      if (aggregate === 'count') {
        if (!fieldId || isNonEmpty(resolveLineItemFieldValue(lineRow, fieldId))) value += 1;
        return;
      }
      const numeric = toNumber(resolveLineItemFieldValue(lineRow, fieldId));
      if (numeric !== null) value += numeric;
    });
    return { value, matchedRecords: 1, matchedLineItems };
  }

  if (aggregate === 'count') {
    if (!fieldId || isNonEmpty(row[fieldId])) value += 1;
  } else {
    const numeric = toNumber(row[fieldId]);
    if (numeric !== null) value += numeric;
  }

  return { value, matchedRecords: 1, matchedLineItems };
};

export const applyRecordDeltaToAnalyticsSnapshot = (args: {
  snapshot: AnalyticsSnapshot | null | undefined;
  widgets: AnalyticsWidgetConfig[] | null | undefined;
  previousRecord?: WebFormSubmission | null;
  nextRecord?: WebFormSubmission | null;
}): { snapshot: AnalyticsSnapshot | null; changed: boolean; changedWidgetIds: string[] } => {
  const snapshot = args.snapshot || null;
  const items = Array.isArray(snapshot?.items) ? snapshot!.items : [];
  const widgets = Array.isArray(args.widgets) ? args.widgets : [];
  if (!snapshot || !items.length || !widgets.length) {
    return { snapshot, changed: false, changedWidgetIds: [] };
  }

  const widgetById = new Map<string, AnalyticsWidgetConfig>();
  widgets.forEach(widget => {
    const id = (widget?.id || '').toString().trim();
    if (id) widgetById.set(id, widget);
  });

  const changedWidgetIds: string[] = [];
  const nextItems = items.map((item: AnalyticsSnapshotItem) => {
    const id = (item?.id || '').toString().trim();
    const widget = id ? widgetById.get(id) : null;
    const calc = widget?.calculation;
    if (!widget || !calc || calc.type !== 'aggregate') return item;

    const previous = evaluateRecordAggregateContribution(args.previousRecord, calc);
    const next = evaluateRecordAggregateContribution(args.nextRecord, calc);
    const delta = next.value - previous.value;
    const matchedRecordsDelta = next.matchedRecords - previous.matchedRecords;
    const matchedLineItemsDelta = next.matchedLineItems - previous.matchedLineItems;
    if (delta === 0 && matchedRecordsDelta === 0 && matchedLineItemsDelta === 0) return item;

    const baseValue =
      typeof item.valueNumber === 'number' && Number.isFinite(item.valueNumber)
        ? item.valueNumber
        : toNumber(item.value) ?? 0;
    const value = baseValue + delta;
    const metadata = { ...(item.metadata || {}) } as Record<string, any>;
    if (typeof metadata.matchedRecords === 'number') metadata.matchedRecords += matchedRecordsDelta;
    if (typeof metadata.matchedLineItems === 'number') metadata.matchedLineItems += matchedLineItemsDelta;
    changedWidgetIds.push(id);
    return {
      ...item,
      value,
      valueNumber: value,
      valueText: formatValueText(value, widget.maximumFractionDigits),
      valueType: 'number' as const,
      metadata
    };
  });

  if (!changedWidgetIds.length) {
    return { snapshot, changed: false, changedWidgetIds: [] };
  }

  return {
    snapshot: {
      ...snapshot,
      items: nextItems,
      updatedAt: new Date().toISOString(),
      revision: Math.max(0, Number(snapshot.revision || 0)) + 1
    },
    changed: true,
    changedWidgetIds
  };
};
