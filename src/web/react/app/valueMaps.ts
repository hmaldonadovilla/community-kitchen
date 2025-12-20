import { FieldValue, OptionFilter, WebFormDefinition } from '../../types';
import { LineItemState } from '../types';
import { resolveSubgroupKey } from './lineItems';
import { isEmptyValue } from '../utils/values';

const derivedDebugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);

const derivedLog = (event: string, payload?: Record<string, unknown>) => {
  if (!derivedDebugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][DerivedValue]', event, payload || {});
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
  // - today/timeOfDayMap: empty (prefill/default behavior)
  const op = (config?.op || '').toString();
  return op === 'addDays' ? 'always' : 'empty';
};

export const resolveValueMapValue = (valueMap: OptionFilter, getValue: (fieldId: string) => FieldValue): string => {
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
  return undefined;
};

export const applyValueMapsToLineRow = (
  fields: any[],
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): Record<string, FieldValue> => {
  const nextValues = { ...rowValues };
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
        const when = resolveDerivedWhen(field.derivedValue);
        if (when === 'empty' && !isEmptyValue(nextValues[field.id])) return;
        const derived = resolveDerivedValue(field.derivedValue, fid => {
          if (fid === undefined || fid === null) return undefined;
          if (rowValues.hasOwnProperty(fid)) return nextValues[fid];
          return topValues[fid];
        });
        if (derived !== undefined && derived !== nextValues[field.id]) {
          nextValues[field.id] = derived;
          derivedLog('line.set', { fieldId: field.id, op: field.derivedValue?.op || null, when });
        }
      }
    });
  return nextValues;
};

export const applyValueMapsToForm = (
  definition: WebFormDefinition,
  currentValues: Record<string, FieldValue>,
  currentLineItems: LineItemState
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let values = { ...currentValues };
  let lineItems = { ...currentLineItems };

  definition.questions.forEach(q => {
    if ((q as any).valueMap) {
      values[q.id] = resolveValueMapValue((q as any).valueMap, fieldId => values[fieldId]);
    }
    if ((q as any).derivedValue) {
      const when = resolveDerivedWhen((q as any).derivedValue);
      if (when === 'empty' && !isEmptyValue(values[q.id])) {
        // allow user override / preserve stored values
      } else {
      const derived = resolveDerivedValue((q as any).derivedValue, fieldId => values[fieldId]);
        if (derived !== undefined && derived !== values[q.id]) {
          values[q.id] = derived;
          derivedLog('top.set', { fieldId: q.id, op: (q as any).derivedValue?.op || null, when });
        }
      }
    }
    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const updatedRows = rows.map(row => ({
        ...row,
        values: applyValueMapsToLineRow(q.lineItemConfig!.fields, row.values, values)
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
              values: applyValueMapsToLineRow((sub as any).fields || [], subRow.values, { ...values, ...row.values })
            }));
            lineItems = { ...lineItems, [subgroupKey]: updatedSubRows };
          });
        });
      }
    }
  });

  return { values, lineItems };
};



