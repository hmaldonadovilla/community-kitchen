import { VisibilityConfig, VisibilityCondition } from '../../types';
import { VisibilityContext, WhenConfig } from '../types';

export function matchesWhen(value: unknown, when?: WhenConfig | VisibilityCondition): boolean {
  if (!when) return true;
  const values = Array.isArray(value) ? value : [value];

  if (when.equals !== undefined) {
    const expected = Array.isArray(when.equals) ? when.equals : [when.equals];
    if (!values.some(v => expected.includes(v as never))) return false;
  }

  const numericVals = values
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
  const direct = rowId && ctx.getLineValue ? ctx.getLineValue(rowId, scopedId) : ctx.getValue(scopedId);
  if (direct !== undefined && direct !== '' && direct !== null) return direct;
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
