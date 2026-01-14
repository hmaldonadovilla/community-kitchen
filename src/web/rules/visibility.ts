import { VisibilityConfig, VisibilityCondition, WhenClause } from '../../types';
import { VisibilityContext } from '../types';

const whenDebugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);
let compoundWhenLogged = false;
const logCompoundWhenOnce = (): void => {
  if (compoundWhenLogged) return;
  if (!whenDebugEnabled()) return;
  compoundWhenLogged = true;
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][When]', 'compoundWhen.enabled', { note: 'all/any/not supported' });
  } catch (_) {
    // ignore
  }
};

export function matchesWhen(value: unknown, when?: VisibilityCondition | any): boolean {
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

  const isNonEmpty = (v: unknown): boolean => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'boolean') return v === true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (v instanceof Date) return !Number.isNaN(v.getTime());
    if (Array.isArray(v)) return v.some(isNonEmpty);
    if (typeof v === 'object') {
      const url = (v as any)?.url;
      if (typeof url === 'string') return url.trim() !== '';
      try {
        return Object.keys(v as any).length > 0;
      } catch (_) {
        return true;
      }
    }
    return true;
  };

  const wantsNotEmpty = (when as any).notEmpty;
  if (typeof wantsNotEmpty === 'boolean') {
    const hasAny = normalized.some(isNonEmpty);
    if (wantsNotEmpty && !hasAny) return false;
    if (!wantsNotEmpty && hasAny) return false;
  }

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
    .map(v => {
      const vv = normalizeVal(v);
      // Treat empty/blank as "not numeric" (do not coerce '' -> 0), so numeric comparisons
      // don't accidentally match on empty fields.
      if (vv === '') return NaN;
      if (typeof vv === 'boolean') return NaN;
      if (vv instanceof Date) return NaN;
      const n = Number(vv);
      return Number.isFinite(n) ? n : NaN;
    })
    .filter(v => !isNaN(v));

  if (when.greaterThan !== undefined) {
    if (!numericVals.some(v => v > Number(when.greaterThan))) return false;
  }
  if (when.lessThan !== undefined) {
    if (!numericVals.some(v => v < Number(when.lessThan))) return false;
  }

  return true;
}

const pickWhenList = (raw: any): any[] | null => {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as any).all ?? (raw as any).and;
  if (Array.isArray(list)) return list;
  return null;
};

const pickWhenAnyList = (raw: any): any[] | null => {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as any).any ?? (raw as any).or;
  if (Array.isArray(list)) return list;
  return null;
};

/**
 * Extract the first referenced fieldId from a (possibly compound) `when` clause.
 * Used for UI/validation surfaces that need a stable anchor field id.
 */
export const firstWhenFieldId = (when: any): string => {
  if (!when) return '';
  if (Array.isArray(when)) {
    for (const entry of when) {
      const fid = firstWhenFieldId(entry);
      if (fid) return fid;
    }
    return '';
  }
  if (typeof when !== 'object') return '';

  const allList = pickWhenList(when);
  if (allList) {
    for (const entry of allList) {
      const fid = firstWhenFieldId(entry);
      if (fid) return fid;
    }
    return '';
  }

  const anyList = pickWhenAnyList(when);
  if (anyList) {
    for (const entry of anyList) {
      const fid = firstWhenFieldId(entry);
      if (fid) return fid;
    }
    return '';
  }

  const notNode = (when as any).not;
  if (notNode) return firstWhenFieldId(notNode);

  const fid = (when as any).fieldId;
  return fid !== undefined && fid !== null ? fid.toString().trim() : '';
};

/**
 * Evaluate a (possibly compound) `when` clause against a visibility context.
 *
 * Supported shapes:
 * - Leaf: { fieldId, equals?, greaterThan?, lessThan?, notEmpty? }
 * - Compound AND: { all: WhenClause[] } (also supports alias key `and`)
 * - Compound OR:  { any: WhenClause[] } (also supports alias key `or`)
 * - NOT:          { not: WhenClause }
 * - Shorthand:    WhenClause[] (treated as AND)
 */
export const matchesWhenClause = (
  when: WhenClause | undefined,
  ctx: VisibilityContext,
  options?: { rowId?: string; linePrefix?: string }
): boolean => {
  if (!when) return true;

  // Shorthand: array treated as AND
  if (Array.isArray(when)) {
    logCompoundWhenOnce();
    return when.every(entry => matchesWhenClause(entry as any, ctx, options));
  }
  if (typeof when !== 'object') return true;

  const allList = pickWhenList(when);
  if (allList) {
    logCompoundWhenOnce();
    return allList.every(entry => matchesWhenClause(entry as any, ctx, options));
  }

  const anyList = pickWhenAnyList(when);
  if (anyList) {
    logCompoundWhenOnce();
    return anyList.some(entry => matchesWhenClause(entry as any, ctx, options));
  }

  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
    logCompoundWhenOnce();
    return !matchesWhenClause(((when as any).not as any) || undefined, ctx, options);
  }

  // Leaf condition
  const fieldIdRaw = (when as any).fieldId;
  const fieldId = fieldIdRaw !== undefined && fieldIdRaw !== null ? fieldIdRaw.toString().trim() : '';
  if (!fieldId) return true;
  const leaf: VisibilityCondition = { ...(when as any), fieldId };
  const value = resolveVisibilityValue(leaf, ctx, options?.rowId, options?.linePrefix);
  return matchesWhen(value, leaf as any);
};

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

  const showMatch = visibility.showWhen ? matchesWhenClause(visibility.showWhen as any, ctx, { rowId, linePrefix }) : true;
  const hideMatch = visibility.hideWhen ? matchesWhenClause(visibility.hideWhen as any, ctx, { rowId, linePrefix }) : false;

  if (visibility.showWhen && !showMatch) return true;
  if (visibility.hideWhen && hideMatch) return true;
  return false;
}
