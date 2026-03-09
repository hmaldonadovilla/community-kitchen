import {
  AnalyticsAggregateCalculation,
  AnalyticsCalculation,
  AnalyticsPlacement,
  AnalyticsSnapshotItem,
  AnalyticsValueType,
  AnalyticsWidgetConfig,
  FormConfig,
  LocalizedString,
  WebFormDefinition,
  WebFormSubmission
} from '../../../types';
import { matchesWhenClause } from '../../../web/rules/visibility';
import { AnalyticsScriptExecutionContext, runAnalyticsScript } from './scripts';

export interface AnalyticsEvaluationDataset {
  form: FormConfig;
  definition: WebFormDefinition;
  records: WebFormSubmission[];
  rows: Array<Record<string, any>>;
}

type AggregateOutcome = {
  value: number;
  metadata: Record<string, any>;
};

type EvaluatedWidget = Omit<AnalyticsSnapshotItem, 'updatedAt' | 'revision'>;

const parseJson = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return undefined;
  }
};

const parseLineItemRows = (raw: any): Array<Record<string, any>> => {
  if (Array.isArray(raw)) {
    return raw.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
  }
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object') as Array<Record<string, any>>;
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
    const withoutThousands = compact.replace(/,/g, '');
    const n = Number(withoutThousands);
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

const resolveValueType = (value: any): AnalyticsValueType => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
};

const resolveValueText = (value: any, maximumFractionDigits?: number): string => {
  const fractionDigits =
    maximumFractionDigits !== undefined && Number.isFinite(Number(maximumFractionDigits))
      ? Math.max(0, Math.min(6, Math.round(Number(maximumFractionDigits))))
      : 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits }).format(value);
  }
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch (_) {
    return `${value ?? ''}`;
  }
};

const resolveLineItemFieldValue = (row: Record<string, any>, fieldId: string): any => {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldId)) return row[fieldId];
  if (row.values && typeof row.values === 'object') return (row.values as any)[fieldId];
  return undefined;
};

const buildRecordContext = (row: Record<string, any>) => ({
  getValue: (fieldId: string) => (row as any)?.[fieldId],
  getLineItems: undefined,
  getLineValue: undefined
});

const buildLineContext = (lineValues: Record<string, any>, row: Record<string, any>) => ({
  getValue: (fieldId: string) => {
    if (Object.prototype.hasOwnProperty.call(lineValues, fieldId)) return lineValues[fieldId];
    return (row as any)?.[fieldId];
  },
  getLineItems: undefined,
  getLineValue: undefined
});

const normalizePlacements = (raw: AnalyticsPlacement[] | undefined): AnalyticsPlacement[] => {
  const placements = Array.isArray(raw) ? raw.filter(Boolean) : [];
  return placements.length ? (Array.from(new Set(placements)) as AnalyticsPlacement[]) : ['analyticsPage'];
};

const evaluateAggregateCalculation = (
  calc: AnalyticsAggregateCalculation,
  dataset: AnalyticsEvaluationDataset
): AggregateOutcome => {
  const aggregate = calc.aggregate === 'sum' ? 'sum' : 'count';
  const groupId = (calc.groupId || '').toString().trim();
  const fieldId = (calc.fieldId || '').toString().trim();
  let matchedRecords = 0;
  let matchedLineItems = 0;
  let value = 0;
  const records = dataset.records || [];

  records.forEach(record => {
    const row = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.status,
      pdfUrl: record.pdfUrl,
      ...(record.values || {})
    } as Record<string, any>;

    if (calc.when && !matchesWhenClause(calc.when as any, buildRecordContext(row) as any)) return;
    matchedRecords += 1;

    if (groupId) {
      const lineRows = parseLineItemRows((record.values || ({} as any))[groupId]);
      if (!lineRows.length) return;
      lineRows.forEach(lineRow => {
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
        if (numeric === null) return;
        value += numeric;
      });
      return;
    }

    if (aggregate === 'count') {
      if (!fieldId || isNonEmpty((row as any)[fieldId])) value += 1;
      return;
    }
    const numeric = toNumber((row as any)[fieldId]);
    if (numeric === null) return;
    value += numeric;
  });

  return {
    value,
    metadata: {
      aggregate,
      groupId: groupId || null,
      fieldId: fieldId || null,
      matchedRecords,
      matchedLineItems
    }
  };
};

const normalizeArithmeticOperand = (
  operand: any,
  resolvedMetrics: Record<string, any>,
  dataset: AnalyticsEvaluationDataset
): number => {
  if (typeof operand === 'number') return Number.isFinite(operand) ? operand : 0;
  if (!operand || typeof operand !== 'object') return 0;
  if ((operand as any).value !== undefined) {
    const numeric = toNumber((operand as any).value);
    return numeric === null ? 0 : numeric;
  }
  const metricId = ((operand as any).metricId || '').toString().trim();
  if (metricId) {
    const referenced = resolvedMetrics[metricId];
    if (typeof referenced === 'number' && Number.isFinite(referenced)) return referenced;
    const numeric = toNumber(referenced);
    return numeric === null ? 0 : numeric;
  }
  const aggregate = (operand as any).aggregate;
  if (aggregate && typeof aggregate === 'object') {
    const outcome = evaluateAggregateCalculation(aggregate as AnalyticsAggregateCalculation, dataset);
    return outcome.value;
  }
  return 0;
};

const evaluateArithmeticCalculation = (
  calc: Extract<AnalyticsCalculation, { type: 'arithmetic' }>,
  resolvedMetrics: Record<string, any>,
  dataset: AnalyticsEvaluationDataset
): { value: number; metadata: Record<string, any> } => {
  const operator = calc.operator === 'subtract' ? 'subtract' : calc.operator === 'multiply' ? 'multiply' : 'add';
  const operands = (Array.isArray(calc.operands) ? calc.operands : []).map(entry =>
    normalizeArithmeticOperand(entry, resolvedMetrics, dataset)
  );
  if (!operands.length) {
    return { value: 0, metadata: { operator, operands: [] } };
  }
  let value = operands[0];
  if (operator === 'add') {
    value = operands.reduce((sum, n) => sum + n, 0);
  } else if (operator === 'subtract') {
    value = operands.slice(1).reduce((acc, n) => acc - n, operands[0]);
  } else {
    value = operands.reduce((acc, n) => acc * n, 1);
  }
  return {
    value,
    metadata: { operator, operands }
  };
};

const evaluateScriptCalculation = (
  widget: AnalyticsWidgetConfig,
  calc: Extract<AnalyticsCalculation, { type: 'script' }>,
  dataset: AnalyticsEvaluationDataset
): { value: any; metadata?: Record<string, any> } => {
  const context: AnalyticsScriptExecutionContext = {
    form: dataset.form,
    definition: dataset.definition,
    records: dataset.records,
    rows: dataset.rows,
    widget
  };
  const rawResult = runAnalyticsScript(calc.functionName, context, calc.args);
  if (rawResult && typeof rawResult === 'object' && Object.prototype.hasOwnProperty.call(rawResult, 'value')) {
    const out = rawResult as any;
    return {
      value: out.value,
      metadata: {
        script: calc.functionName,
        ...(out.metadata && typeof out.metadata === 'object' ? out.metadata : {})
      }
    };
  }
  return {
    value: rawResult,
    metadata: {
      script: calc.functionName
    }
  };
};

export const evaluateAnalyticsWidgets = (
  widgets: AnalyticsWidgetConfig[] | undefined,
  dataset: AnalyticsEvaluationDataset
): EvaluatedWidget[] => {
  const list = Array.isArray(widgets) ? widgets : [];
  const resolvedMetrics: Record<string, any> = {};
  const evaluated: EvaluatedWidget[] = [];

  list.forEach(widget => {
    if (!widget || typeof widget !== 'object') return;
    const id = (widget.id || '').toString().trim();
    if (!id) return;
    const calculation = widget.calculation as AnalyticsCalculation | undefined;
    if (!calculation || typeof calculation !== 'object') return;

    let value: any = null;
    let metadata: Record<string, any> = {};

    try {
      if (calculation.type === 'aggregate') {
        const aggregate = evaluateAggregateCalculation(calculation, dataset);
        value = aggregate.value;
        metadata = aggregate.metadata;
      } else if (calculation.type === 'arithmetic') {
        const arithmetic = evaluateArithmeticCalculation(calculation, resolvedMetrics, dataset);
        value = arithmetic.value;
        metadata = arithmetic.metadata;
      } else if (calculation.type === 'script') {
        const scripted = evaluateScriptCalculation(widget, calculation, dataset);
        value = scripted.value;
        metadata = scripted.metadata || {};
      }
    } catch (err: any) {
      value = null;
      metadata = {
        error: (err?.message || err?.toString?.() || 'Analytics evaluation failed.').toString()
      };
    }

    const valueNumber = toNumber(value);
    const valueType = resolveValueType(value);
    const label = widget.label as LocalizedString | string | undefined;
    const placements = normalizePlacements(widget.placements);
    const valueText = resolveValueText(value, widget.maximumFractionDigits);
    const item: EvaluatedWidget = {
      id,
      label,
      value,
      valueNumber: valueNumber === null ? undefined : valueNumber,
      valueText,
      valueType,
      placements,
      metadata
    };
    evaluated.push(item);
    resolvedMetrics[id] = value;
  });

  return evaluated;
};

