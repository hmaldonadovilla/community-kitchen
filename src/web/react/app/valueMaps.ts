import { FieldValue, LineItemRowState, ValueMapConfig, WebFormDefinition } from '../../types';
import { LineItemState } from '../types';
import { buildSubgroupKey, resolveSubgroupKey } from './lineItems';
import { isEmptyValue } from '../utils/values';
import { matchesWhenClause } from '../../rules/visibility';

export type ApplyValueMapsMode = 'change' | 'blur' | 'init' | 'submit';

export type ApplyValueMapsOptions = {
  mode?: ApplyValueMapsMode;
  /**
   * Top-level field ids that should not be overwritten by derived/value-map logic
   * in the current apply pass (e.g., the field currently being edited).
   */
  lockedTopFields?: string[];
};

const derivedDebugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);

const derivedLog = (event: string, payload?: Record<string, unknown>) => {
  if (!derivedDebugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][DerivedValue]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const defaultLog = (event: string, payload?: Record<string, unknown>) => {
  if (!derivedDebugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][DefaultValue]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const pad2 = (n: number): string => n.toString().padStart(2, '0');

const formatLocalYmd = (d: Date): string => {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseDateValue = (raw: FieldValue): Date | null => {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = raw.toString().trim();
  if (!s) return null;
  // Treat YYYY-MM-DD as a local date to avoid UTC parsing surprises.
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      const local = new Date(y, m - 1, d, 0, 0, 0, 0);
      return isNaN(local.getTime()) ? null : local;
    }
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseTimeOfDayMinutes = (raw: unknown): number | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    // Heuristic: <= 24 means "hours", otherwise treat as "minutes since midnight".
    if (n >= 0 && n <= 24) return Math.max(0, Math.min(24, Math.floor(n))) * 60;
    if (n >= 0 && n <= 24 * 60) return Math.floor(n);
    return null;
  }
  const s = raw.toString().trim().toLowerCase();
  if (!s) return null;
  const hmColon = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hmColon) {
    const h = Number(hmColon[1]);
    const m = Number(hmColon[2]);
    if (h >= 0 && h <= 24 && m >= 0 && m <= 59) return h * 60 + m;
    return null;
  }
  const hmH = s.match(/^(\d{1,2})h(\d{1,2})?$/);
  if (hmH) {
    const h = Number(hmH[1]);
    const m = hmH[2] !== undefined ? Number(hmH[2]) : 0;
    if (h >= 0 && h <= 24 && m >= 0 && m <= 59) return h * 60 + m;
    return null;
  }
  const hOnly = s.match(/^(\d{1,2})$/);
  if (hOnly) {
    const h = Number(hOnly[1]);
    if (h >= 0 && h <= 24) return h * 60;
  }
  return null;
};

const resolveDerivedWhen = (config: any): 'always' | 'empty' => {
  const raw = (config?.when || '').toString().trim().toLowerCase();
  if (raw === 'always') return 'always';
  if (raw === 'empty') return 'empty';
  // Defaults:
  // - addDays: always (computed field)
  // - today/timeOfDayMap/copy: empty (prefill/default behavior)
  const op = (config?.op || '').toString();
  return op === 'addDays' || op === 'calc' ? 'always' : 'empty';
};

const resolveDerivedApplyOn = (config: any): 'change' | 'blur' => {
  const raw = (config?.applyOn || '').toString().trim().toLowerCase();
  if (raw === 'change' || raw === 'blur') return raw;
  // Defaults:
  // - copy: blur (avoid mid-typing churn)
  // - everything else: change
  return (config?.op || '').toString() === 'copy' ? 'blur' : 'change';
};

const coerceConsentBoolean = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (Array.isArray(raw)) return raw.length > 0;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return false;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return true;
};

export const coerceDefaultValue = (args: {
  type: string;
  raw: any;
  hasAnyOption?: boolean;
  hasDataSource?: boolean;
}): FieldValue | undefined => {
  const { type, raw, hasAnyOption = false, hasDataSource = false } = args;
  if (raw === undefined) return undefined;

  if (type === 'CHECKBOX') {
    const isConsent = !hasDataSource && !hasAnyOption;
    if (isConsent) return coerceConsentBoolean(raw);

    if (Array.isArray(raw)) {
      const items = raw
        .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
        .filter(Boolean);
      return items;
    }
    if (typeof raw === 'string') {
      const s = raw.toString().trim();
      if (!s) return [];
      // Support either a single option value or a comma-separated list.
      if (s.includes(',')) {
        return s
          .split(',')
          .map(part => part.trim())
          .filter(Boolean);
      }
      return [s];
    }
    return [];
  }

  if (type === 'NUMBER') {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return '';
      const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
      const n = Number(normalized);
      return Number.isFinite(n) ? n : s;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw?.toString?.();
  }

  if (type === 'DATE') {
    if (typeof raw === 'string') return raw.toString().trim();
    return raw?.toString?.();
  }

  if (type === 'LINE_ITEM_GROUP' || type === 'FILE_UPLOAD') {
    return undefined;
  }

  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw)) {
    // For non-checkbox fields, collapse arrays to first scalar.
    const first = raw[0];
    return first === undefined || first === null ? undefined : first.toString();
  }
  if (typeof raw === 'string') return raw.toString().trim();
  return raw?.toString?.();
};

const toFiniteNumber = (raw: unknown): number | null => {
  if (raw === undefined || raw === null) return null;
  const scalar = Array.isArray(raw)
    ? raw.find(v => v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '')) ?? raw[0]
    : raw;
  if (scalar === undefined || scalar === null) return null;
  if (typeof scalar === 'boolean') return null;
  if (scalar instanceof Date) return null;
  if (typeof scalar === 'string') {
    const s = scalar.trim();
    if (!s) return null;
    const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(scalar);
  return Number.isFinite(n) ? n : null;
};

const normalizeCalcRef = (raw: string): string => raw.replace(/\s+/g, '').toLowerCase();

const buildCalcFilterMap = (raw: any): Map<string, any> => {
  const map = new Map<string, any>();
  if (!Array.isArray(raw)) return map;
  raw.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const refRaw = (entry as any).ref ?? (entry as any).path ?? (entry as any).target;
    const ref = refRaw !== undefined && refRaw !== null ? refRaw.toString().trim() : '';
    if (!ref) return;
    const when = (entry as any).when;
    if (!when || typeof when !== 'object') return;
    map.set(normalizeCalcRef(ref), when);
  });
  return map;
};

const buildCalcRowCtx = (args: {
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  lineItems: LineItemState;
}): { getValue: (fieldId: string) => FieldValue | undefined; getLineItems?: (key: string) => any[]; getLineValue?: (_rowId: string, fieldId: string) => FieldValue | undefined } => {
  const { rowValues, parentValues, topValues, lineItems } = args;
  const resolveValue = (fieldId: string): FieldValue | undefined => {
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId] as FieldValue;
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, fieldId)) return (parentValues as any)[fieldId] as FieldValue;
    return topValues[fieldId];
  };
  return {
    getValue: resolveValue,
    getLineItems: key => {
      const rows = (lineItems as any)[key];
      return Array.isArray(rows) ? rows : [];
    },
    getLineValue: (_rowId: string, fieldId: string) => resolveValue(fieldId)
  };
};

const collectLineItemPathRows = (args: {
  groupKey?: string;
  rowId?: string;
  rowValues?: Record<string, FieldValue>;
  lineItems: LineItemState;
  groupPath: string[];
}): Array<{ groupKey: string; rowId: string; rowValues: Record<string, FieldValue>; parentValues: Record<string, FieldValue> | undefined }> => {
  const { groupKey, rowId, rowValues, lineItems, groupPath } = args;
  if (!groupPath.length) return [];

  if (rowId && groupKey) {
    let parents = [{ groupKey, rowId, rowValues: rowValues || {}, parentValues: undefined as Record<string, FieldValue> | undefined }];
    groupPath.forEach(segment => {
      const next: Array<{ groupKey: string; rowId: string; rowValues: Record<string, FieldValue>; parentValues: Record<string, FieldValue> | undefined }> =
        [];
      parents.forEach(parent => {
        const subKey = buildSubgroupKey(parent.groupKey, parent.rowId, segment);
        const rows = (lineItems[subKey] || []) as any[];
        rows.forEach(row => {
          next.push({
            groupKey: subKey,
            rowId: row.id,
            rowValues: (row?.values || {}) as Record<string, FieldValue>,
            parentValues: parent.rowValues
          });
        });
      });
      parents = next;
    });
    return parents;
  }

  // Top-level aggregation: start from groupPath[0] as a root line-item group id.
  const [rootGroupId, ...rest] = groupPath;
  const rootRows = (lineItems[rootGroupId] || []) as any[];
  let parents = rootRows.map(row => ({
    groupKey: rootGroupId,
    rowId: row.id,
    rowValues: (row?.values || {}) as Record<string, FieldValue>,
    parentValues: undefined as Record<string, FieldValue> | undefined
  }));
  rest.forEach(segment => {
    const next: Array<{ groupKey: string; rowId: string; rowValues: Record<string, FieldValue>; parentValues: Record<string, FieldValue> | undefined }> =
      [];
    parents.forEach(parent => {
      const subKey = buildSubgroupKey(parent.groupKey, parent.rowId, segment);
      const rows = (lineItems[subKey] || []) as any[];
      rows.forEach(row => {
        next.push({
          groupKey: subKey,
          rowId: row.id,
          rowValues: (row?.values || {}) as Record<string, FieldValue>,
          parentValues: parent.rowValues
        });
      });
    });
    parents = next;
  });
  return parents;
};

const safeEvalNumericExpression = (expr: string): number | null => {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const illegal = /[^0-9+\-*/().\s]/.test(trimmed);
  if (illegal) return null;
  try {
    const result = Function(`"use strict"; return (${trimmed});`)();
    return Number.isFinite(result) ? (result as number) : null;
  } catch (_) {
    return null;
  }
};

const resolveDerivedCalcValue = (args: {
  config: any;
  rowValues: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  lineItems?: LineItemState;
  groupKey?: string;
  rowId?: string;
}): FieldValue | undefined => {
  const { config, rowValues, topValues, lineItems, groupKey, rowId } = args;
  const expression = config?.expression !== undefined && config?.expression !== null ? config.expression.toString().trim() : '';
  if (!expression) return undefined;
  if (!lineItems) return undefined;

  const filterMap = buildCalcFilterMap(config?.lineItemFilters ?? config?.aggregateFilters ?? config?.filters);

  const resolveFieldToken = (rawId: string): number => {
    const id = rawId.trim();
    if (!id) return 0;
    const raw = Object.prototype.hasOwnProperty.call(rowValues || {}, id) ? rowValues[id] : topValues[id];
    const num = toFiniteNumber(raw);
    return num === null ? 0 : num;
  };

  const resolveSumToken = (rawPath: string): number => {
    const pathClean = rawPath.trim().replace(/\s+/g, '');
    if (!pathClean) return 0;
    const parts = pathClean.split('.').filter(Boolean);
    if (parts.length < 2) return 0;
    const fieldId = parts[parts.length - 1];
    const groupPath = parts.slice(0, -1);
    const rows = collectLineItemPathRows({ groupKey, rowId, rowValues, lineItems, groupPath });
    if (!rows.length) return 0;
    const filterWhen = filterMap.get(normalizeCalcRef(pathClean));
    let sum = 0;
    rows.forEach(row => {
      if (filterWhen) {
        const rowCtx = buildCalcRowCtx({
          rowValues: row.rowValues,
          parentValues: row.parentValues,
          topValues,
          lineItems
        });
        if (!matchesWhenClause(filterWhen as any, rowCtx)) return;
      }
      const num = toFiniteNumber((row.rowValues || {})[fieldId]);
      if (num !== null) sum += num;
    });
    return sum;
  };

  const withFields = expression.replace(/\{([^}]+)\}/g, (_match: string, raw: string) => resolveFieldToken(raw).toString());
  const withSums = withFields.replace(/SUM\s*\(([^)]+)\)/gi, (_match: string, raw: string) => resolveSumToken(raw).toString());
  const result = safeEvalNumericExpression(withSums);
  if (result === null) {
    derivedLog('calc.invalid', { expression, resolved: withSums });
    return undefined;
  }
  let computed = result;
  if (typeof config?.min === 'number') computed = Math.max(computed, config.min);
  if (typeof config?.max === 'number') computed = Math.min(computed, config.max);
  if (typeof config?.precision === 'number') {
    const factor = Math.pow(10, Math.max(0, Math.floor(config.precision)));
    computed = Math.round(computed * factor) / factor;
  }
  return Number.isFinite(computed) ? computed : undefined;
};

const resolveCopyMode = (config: any): 'replace' | 'allowIncrease' | 'allowDecrease' => {
  const raw = (config?.copyMode || config?.mode || '').toString().trim();
  const key = raw.toLowerCase();
  if (key === 'allowincrease' || key === 'allow_increase' || key === 'increase' || key === 'min') return 'allowIncrease';
  if (key === 'allowdecrease' || key === 'allow_decrease' || key === 'decrease' || key === 'max') return 'allowDecrease';
  return 'replace';
};

const computeCopyValue = (args: { config: any; current: FieldValue; source: FieldValue }): FieldValue | undefined => {
  const { config, current, source } = args;
  const when = resolveDerivedWhen(config);
  const currentEmpty = isEmptyValue(current);
  if (when === 'empty' && !currentEmpty) return undefined;

  const mode = resolveCopyMode(config);
  if (when === 'always' && mode !== 'replace') {
    const srcNum = toFiniteNumber(source);
    if (srcNum === null) return source;
    const curNum = toFiniteNumber(current);
    if (curNum === null) return srcNum;
    if (mode === 'allowIncrease') return Math.max(curNum, srcNum);
    if (mode === 'allowDecrease') return Math.min(curNum, srcNum);
  }

  return source;
};

export const resolveValueMapValue = (valueMap: ValueMapConfig, getValue: (fieldId: string) => FieldValue): string => {
  if (!valueMap?.optionMap || !valueMap.dependsOn) return '';
  const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
  const depValues = dependsOn.map(dep => {
    const raw = getValue(dep);
    if (Array.isArray(raw)) return raw.join('|');
    return raw ?? '';
  });
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v.toString()));
  candidateKeys.push('*');
  const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
  const values = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
  const unique = Array.from(new Set(values.map(v => (v ?? '').toString().trim()).filter(Boolean)));
  return unique.join(', ');
};

export const resolveDerivedValue = (config: any, getter: (fieldId: string) => FieldValue): FieldValue => {
  if (!config) return undefined;
  if (config.op === 'addDays') {
    const base = getter(config.dependsOn);
    const baseDate = parseDateValue(base);
    if (!baseDate) return '';
    const offset = typeof config.offsetDays === 'number' ? config.offsetDays : Number(config.offsetDays || 0);
    const result = new Date(baseDate);
    result.setDate(result.getDate() + (isNaN(offset) ? 0 : offset));
    // Keep existing behavior: store as YYYY-MM-DD.
    return formatLocalYmd(result);
  }
  if (config.op === 'today') {
    return formatLocalYmd(new Date());
  }
  if (config.op === 'timeOfDayMap') {
    const thresholdsRaw = Array.isArray(config.thresholds) ? config.thresholds : [];
    const thresholds: Array<{ before?: number | null; value: string }> = [];
    let fallback: string | null = null;
    thresholdsRaw.forEach((entry: any) => {
      if (!entry) return;
      const value = entry.value !== undefined && entry.value !== null ? entry.value.toString() : '';
      if (!value.trim()) return;
      const beforeMinutes = parseTimeOfDayMinutes(entry.before);
      if (beforeMinutes === null) {
        fallback = value.trim();
        return;
      }
      thresholds.push({ before: beforeMinutes, value: value.trim() });
    });

    thresholds.sort((a, b) => (a.before || 0) - (b.before || 0));

    const sourceId = config.dependsOn ? config.dependsOn.toString().trim() : '';
    const baseDate = sourceId ? parseDateValue(getter(sourceId)) : null;
    const now = baseDate || new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    const match = thresholds.find(t => typeof t.before === 'number' && minutes < (t.before as number));
    if (match) return match.value;
    return fallback ?? '';
  }
  if (config.op === 'copy') {
    const sourceId = config.dependsOn !== undefined && config.dependsOn !== null ? config.dependsOn.toString().trim() : '';
    if (!sourceId) return undefined;
    return getter(sourceId);
  }
  return undefined;
};

export const applyValueMapsToLineRow = (
  fields: any[],
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>,
  options?: ApplyValueMapsOptions,
  context?: { groupKey?: string; rowId?: string; lineItems?: LineItemState }
): Record<string, FieldValue> => {
  const nextValues = { ...rowValues };
  const mode: ApplyValueMapsMode = options?.mode || 'change';

  fields
    .filter(field => field?.valueMap || field?.derivedValue)
    .forEach(field => {
      if (field.valueMap) {
        const computed = resolveValueMapValue(field.valueMap, fieldId => {
          if (fieldId === undefined || fieldId === null) return undefined;
          if (rowValues.hasOwnProperty(fieldId)) return nextValues[fieldId];
          return topValues[fieldId];
        });
        nextValues[field.id] = computed;
      }
      if (field.derivedValue) {
        const applyOn = resolveDerivedApplyOn(field.derivedValue);
        if (mode === 'change' && applyOn === 'blur') return;

        const when = resolveDerivedWhen(field.derivedValue);
        if (field.derivedValue?.op === 'copy') {
          const sourceId = (field.derivedValue?.dependsOn || '').toString().trim();
          if (!sourceId) return;
          const source = Object.prototype.hasOwnProperty.call(rowValues, sourceId) ? nextValues[sourceId] : topValues[sourceId];
          const derived = computeCopyValue({ config: field.derivedValue, current: nextValues[field.id], source });
          if (derived !== undefined && derived !== nextValues[field.id]) {
            nextValues[field.id] = derived;
            derivedLog('line.set', {
              fieldId: field.id,
              op: 'copy',
              when,
              applyOn,
              copyMode: resolveCopyMode(field.derivedValue)
            });
          }
          return;
        }
        if (field.derivedValue?.op === 'calc') {
          if (when === 'empty' && !isEmptyValue(nextValues[field.id])) return;
          const derived = resolveDerivedCalcValue({
            config: field.derivedValue,
            rowValues: nextValues,
            topValues,
            lineItems: context?.lineItems,
            groupKey: context?.groupKey,
            rowId: context?.rowId
          });
          if (derived !== undefined && derived !== nextValues[field.id]) {
            nextValues[field.id] = derived;
            derivedLog('line.set', { fieldId: field.id, op: 'calc', when, applyOn });
          }
          return;
        }

        if (when === 'empty' && !isEmptyValue(nextValues[field.id])) return;
        const derived = resolveDerivedValue(field.derivedValue, fid => {
          if (fid === undefined || fid === null) return undefined;
          if (rowValues.hasOwnProperty(fid)) return nextValues[fid];
          return topValues[fid];
        });
        if (derived !== undefined && derived !== nextValues[field.id]) {
          nextValues[field.id] = derived;
          derivedLog('line.set', { fieldId: field.id, op: field.derivedValue?.op || null, when, applyOn });
        }
      }
    });

  // Apply default values only when the field is missing from the row payload (does not override edits).
  fields.forEach(field => {
    if (!field || field.defaultValue === undefined) return;
    if (Object.prototype.hasOwnProperty.call(nextValues, field.id)) return;
    const hasAnyOption =
      Array.isArray(field.options) ? field.options.length > 0 : !!(field.optionsEn?.length || field.optionsFr?.length || field.optionsNl?.length);
    const coerced = coerceDefaultValue({
      type: (field.type || '').toString(),
      raw: field.defaultValue,
      hasAnyOption,
      hasDataSource: !!field.dataSource
    });
    if (coerced !== undefined) {
      nextValues[field.id] = coerced;
      defaultLog('line.set', { fieldId: field.id, type: field.type || null });
    }
  });
  return nextValues;
};

export const applyValueMapsToForm = (
  definition: WebFormDefinition,
  currentValues: Record<string, FieldValue>,
  currentLineItems: LineItemState,
  options?: ApplyValueMapsOptions
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let values = { ...currentValues };
  let lineItems = { ...currentLineItems };
  const mode: ApplyValueMapsMode = options?.mode || 'change';
  const lockedTopFields = Array.isArray(options?.lockedTopFields) ? options?.lockedTopFields : [];
  const lockedTopValues: Record<string, FieldValue> = {};
  if (lockedTopFields.length) {
    lockedTopFields.forEach(raw => {
      const id = (raw || '').toString().trim();
      if (!id) return;
      if (Object.prototype.hasOwnProperty.call(values, id)) {
        lockedTopValues[id] = values[id];
      }
    });
  }

  definition.questions.forEach(q => {
    if ((q as any).valueMap) {
      values[q.id] = resolveValueMapValue((q as any).valueMap, fieldId => values[fieldId]);
    }
    if ((q as any).derivedValue) {
      const applyOn = resolveDerivedApplyOn((q as any).derivedValue);
      if (mode === 'change' && applyOn === 'blur') {
        // skip blur-only derived values during typing
      } else if ((q as any).derivedValue?.op === 'copy') {
        const when = resolveDerivedWhen((q as any).derivedValue);
        const sourceId = (((q as any).derivedValue?.dependsOn || '') as any).toString().trim();
        if (sourceId) {
          const source = values[sourceId];
          const derived = computeCopyValue({ config: (q as any).derivedValue, current: values[q.id], source });
          if (derived !== undefined && derived !== values[q.id]) {
            values[q.id] = derived;
            derivedLog('top.set', { fieldId: q.id, op: 'copy', when, applyOn, copyMode: resolveCopyMode((q as any).derivedValue) });
          }
        }
      } else if ((q as any).derivedValue?.op === 'calc') {
        const when = resolveDerivedWhen((q as any).derivedValue);
        if (when === 'empty' && !isEmptyValue(values[q.id])) {
          // allow user override / preserve stored values
        } else {
          const derived = resolveDerivedCalcValue({
            config: (q as any).derivedValue,
            rowValues: {},
            topValues: values,
            lineItems
          });
          if (derived !== undefined && derived !== values[q.id]) {
            values[q.id] = derived;
            derivedLog('top.set', { fieldId: q.id, op: 'calc', when, applyOn });
          }
        }
      } else {
        const when = resolveDerivedWhen((q as any).derivedValue);
        if (when === 'empty' && !isEmptyValue(values[q.id])) {
          // allow user override / preserve stored values
        } else {
          const derived = resolveDerivedValue((q as any).derivedValue, fieldId => values[fieldId]);
          if (derived !== undefined && derived !== values[q.id]) {
            values[q.id] = derived;
            derivedLog('top.set', { fieldId: q.id, op: (q as any).derivedValue?.op || null, when, applyOn });
          }
        }
      }
    }

    // Apply default values only when the field is missing from the payload (does not override edits).
    if ((q as any).defaultValue !== undefined && !Object.prototype.hasOwnProperty.call(values, q.id)) {
      const opts = (q as any).options;
      const hasAnyOption = !!(opts?.en?.length || opts?.fr?.length || opts?.nl?.length);
      const coerced = coerceDefaultValue({
        type: (q as any).type || '',
        raw: (q as any).defaultValue,
        hasAnyOption,
        hasDataSource: !!(q as any).dataSource
      });
      if (coerced !== undefined) {
        values[q.id] = coerced;
        defaultLog('top.set', { fieldId: q.id, type: (q as any).type || null });
      }
    }

    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const applyGroupValueMaps = (args: {
        groupCfg: any;
        groupKey: string;
        rows: LineItemRowState[];
        contextValues: Record<string, FieldValue>;
      }) => {
        const { groupCfg, groupKey, rows, contextValues } = args;
        if (!groupCfg) return;
        const fields = (groupCfg?.fields || []) as any[];
        const updatedRows = rows.map(row => ({
          ...row,
          values: applyValueMapsToLineRow(fields, row.values, contextValues, options, {
            groupKey,
            rowId: row.id,
            lineItems
          })
        }));
        lineItems = { ...lineItems, [groupKey]: updatedRows };

        const subGroups = (groupCfg?.subGroups || []) as any[];
        if (!subGroups.length) return;
        updatedRows.forEach(row => {
          const nextContext = { ...contextValues, ...(row.values || {}) };
          subGroups.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const subgroupKey = buildSubgroupKey(groupKey, row.id, subId);
            const subRows = lineItems[subgroupKey] || [];
            if (!subRows.length) return;
            applyGroupValueMaps({ groupCfg: sub, groupKey: subgroupKey, rows: subRows, contextValues: nextContext });
          });
        });
      };

      const rows = lineItems[q.id] || [];
      applyGroupValueMaps({ groupCfg: q.lineItemConfig, groupKey: q.id, rows, contextValues: values });
    }
  });

  if (lockedTopFields.length) {
    lockedTopFields.forEach(raw => {
      const id = (raw || '').toString().trim();
      if (!id) return;
      if (Object.prototype.hasOwnProperty.call(lockedTopValues, id)) {
        values[id] = lockedTopValues[id];
      }
    });
  }

  return { values, lineItems };
};



