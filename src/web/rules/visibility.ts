import { VisibilityConfig, VisibilityCondition } from '../../types';
import { VisibilityContext, WhenConfig } from '../types';

export function matchesWhen(value: unknown, when?: WhenConfig | VisibilityCondition): boolean {
  if (!when) return true;
  const values = Array.isArray(value) ? value : [value];
  // Normalize undefined/null and trim/standardize strings for tolerant comparisons
  const normalizeVal = (v: unknown) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v.trim();
    return v;
  };
  const normalizeStr = (v: unknown) => normalizeVal(v).toString().trim().toLowerCase();
  const normalized = values.map(normalizeVal);
  // If we have any non-empty values, ignore empty placeholders when evaluating equals
  const candidates = normalized.some(v => v !== '') ? normalized.filter(v => v !== '') : normalized;

  if (when.equals !== undefined) {
    const expectedRaw = Array.isArray(when.equals) ? when.equals : [when.equals];
    const expected = expectedRaw.map(normalizeVal);
    const expectedStr = expectedRaw.map(normalizeStr);
    const hasMatch = candidates.some(v => {
      const vNorm = normalizeVal(v);
      const vStr = normalizeStr(v);
      return expected.includes(vNorm as never) || expectedStr.includes(vStr);
    });
    if (!hasMatch) return false;
  }

  const numericVals = candidates
    .map(v => Number(v))
    .filter(v => !isNaN(v));

  if (when.greaterThan !== undefined) {
    if (!numericVals.some(v => v > Number(when.greaterThan))) return false;
  }
  if (when.lessThan !== undefined) {
    if (!numericVals.some(v => v < Number(when.lessThan))) return false;
  }

  return true;
}

function resolveVisibilityValue(
  condition: VisibilityCondition,
  ctx: VisibilityContext,
  rowId?: string,
  linePrefix?: string
): unknown {
  if (!condition) return '';
  const scopedId = linePrefix ? `${linePrefix}__${condition.fieldId}` : condition.fieldId;
  let direct = rowId && ctx.getLineValue ? ctx.getLineValue(rowId, scopedId) : ctx.getValue(scopedId);
  // Fallback: if scoped lookup failed, try unscoped line value (row-level fields stored without prefix)
  if ((direct === undefined || direct === null) && rowId && ctx.getLineValue) {
    direct = ctx.getLineValue(rowId, condition.fieldId);
  }
  const normalizeArray = (val: unknown) => {
    if (!Array.isArray(val)) return val;
    const firstDefined = val.find(v => v !== undefined && v !== null && v !== '');
    return firstDefined !== undefined ? firstDefined : val[0];
  };
  const normalized = normalizeArray(direct);
  if (normalized !== undefined && normalized !== '' && normalized !== null) return normalized;
  if (linePrefix) return ctx.getValue(condition.fieldId);
  return direct;
}

export function shouldHideField(
  visibility: VisibilityConfig | undefined,
  ctx: VisibilityContext,
  options?: { rowId?: string; linePrefix?: string }
): boolean {
  if (!visibility) return false;
  const rowId = options?.rowId;
  const linePrefix = options?.linePrefix;

  const showMatch = visibility.showWhen
    ? matchesWhen(resolveVisibilityValue(visibility.showWhen, ctx, rowId, linePrefix), visibility.showWhen)
    : true;
  const hideMatch = visibility.hideWhen
    ? matchesWhen(resolveVisibilityValue(visibility.hideWhen, ctx, rowId, linePrefix), visibility.hideWhen)
    : false;

  if (visibility.showWhen && !showMatch) return true;
  if (visibility.hideWhen && hideMatch) return true;
  return false;
}
