import { FieldValue, ValueMapConfig, WebFormDefinition } from '../../types';
import { LineItemState } from '../types';
import { resolveSubgroupKey } from './lineItems';
import { isEmptyValue } from '../utils/values';

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
  return op === 'addDays' ? 'always' : 'empty';
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
  options?: ApplyValueMapsOptions
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
      const rows = lineItems[q.id] || [];
      const updatedRows = rows.map(row => ({
        ...row,
        values: applyValueMapsToLineRow(q.lineItemConfig!.fields, row.values, values, options)
      }));
      lineItems = { ...lineItems, [q.id]: updatedRows };

      // handle nested subgroups
      if (q.lineItemConfig.subGroups?.length) {
        rows.forEach(row => {
          q.lineItemConfig?.subGroups?.forEach(sub => {
            const key = resolveSubgroupKey(sub as any);
            if (!key) return;
            const subgroupKey = `${q.id}::${row.id}::${key}`;
            const subRows = lineItems[subgroupKey] || [];
            const updatedSubRows = subRows.map(subRow => ({
              ...subRow,
              values: applyValueMapsToLineRow((sub as any).fields || [], subRow.values, { ...values, ...row.values }, options)
            }));
            lineItems = { ...lineItems, [subgroupKey]: updatedSubRows };
          });
        });
      }
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



