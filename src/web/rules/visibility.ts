import { VisibilityConfig, VisibilityCondition, WhenClause } from '../../types';
import { FieldValue, VisibilityContext } from '../types';

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

let dateWhenLogged = false;
const logDateWhenOnce = (): void => {
  if (dateWhenLogged) return;
  if (!whenDebugEnabled()) return;
  dateWhenLogged = true;
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][When]', 'dateComparisons.enabled', { operators: ['isToday', 'isInPast', 'isInFuture'] });
  } catch (_) {
    // ignore
  }
};

const pad2 = (n: number): string => n.toString().padStart(2, '0');

const formatLocalYmd = (d: Date): string => {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseDateLike = (raw: unknown): Date | null => {
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

const toLocalYmd = (raw: unknown): string => {
  const d = parseDateLike(raw);
  return d ? formatLocalYmd(d) : '';
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
  const wantsEmpty = (when as any).isEmpty;
  if (typeof wantsNotEmpty === 'boolean' || typeof wantsEmpty === 'boolean') {
    const hasAny = normalized.some(isNonEmpty);
    if (typeof wantsNotEmpty === 'boolean') {
      if (wantsNotEmpty && !hasAny) return false;
      if (!wantsNotEmpty && hasAny) return false;
    } else if (typeof wantsEmpty === 'boolean') {
      if (wantsEmpty && hasAny) return false;
      if (!wantsEmpty && !hasAny) return false;
    }
  }

  const wantsIsToday = (when as any).isToday === true;
  const wantsIsInPast = (when as any).isInPast === true;
  const wantsIsInFuture = (when as any).isInFuture === true;

  if (wantsIsToday || wantsIsInPast || wantsIsInFuture) {
    logDateWhenOnce();
    const todayYmd = formatLocalYmd(new Date());
    const dateYmds = candidates.map(v => toLocalYmd(v)).filter(Boolean);
    if (!dateYmds.length) return false;
    if (wantsIsToday && !dateYmds.some(ymd => ymd === todayYmd)) return false;
    if (wantsIsInPast && !dateYmds.some(ymd => ymd < todayYmd)) return false;
    if (wantsIsInFuture && !dateYmds.some(ymd => ymd > todayYmd)) return false;
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

const pickLineItemsClause = (raw: any): any | null => {
  if (!raw || typeof raw !== 'object') return null;
  const clause = (raw as any).lineItems ?? (raw as any).lineItem;
  if (clause && typeof clause === 'object') return clause;
  return null;
};

const normalizeLineItemMatchMode = (raw: any): 'any' | 'all' => {
  const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return mode === 'all' ? 'all' : 'any';
};

const normalizeLineItemId = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

const normalizeLineItemPathInput = (raw: any): string[] => {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('.') : [];
  return list.map(v => (v === undefined || v === null ? '' : v.toString().trim())).filter(Boolean);
};

const normalizePathSegment = (raw: string): string => raw.toString().trim().toUpperCase();

const matchPathSegments = (pattern: string[], actual: string[]): boolean => {
  const p = pattern.map(normalizePathSegment);
  const a = actual.map(normalizePathSegment);
  const walk = (pi: number, ai: number): boolean => {
    if (pi >= p.length) return ai >= a.length;
    const seg = p[pi];
    if (seg === '**') {
      if (pi === p.length - 1) return true;
      for (let k = ai; k <= a.length; k += 1) {
        if (walk(pi + 1, k)) return true;
      }
      return false;
    }
    if (ai >= a.length) return false;
    if (seg === '*' || seg === a[ai]) return walk(pi + 1, ai + 1);
    return false;
  };
  return walk(0, 0);
};

const parseGroupKeyPath = (
  key: string
): { rootId: string; path: string[]; parentChain: Array<{ groupKey: string; rowId: string }> } => {
  const raw = (key || '').toString();
  if (!raw) return { rootId: '', path: [], parentChain: [] };
  if (raw.includes('::')) {
    const parts = raw.split('::').filter(Boolean);
    const rootId = parts[0] || '';
    const tail = parts.slice(1);
    if (!rootId || tail.length % 2 !== 0) return { rootId, path: [], parentChain: [] };
    const path: string[] = [];
    const parentChain: Array<{ groupKey: string; rowId: string }> = [];
    let currentKey = rootId;
    for (let i = 0; i < tail.length; i += 2) {
      const rowId = tail[i] || '';
      const subId = tail[i + 1] || '';
      if (!rowId || !subId) break;
      path.push(subId);
      parentChain.push({ groupKey: currentKey, rowId });
      currentKey = `${currentKey}::${rowId}::${subId}`;
    }
    return { rootId, path, parentChain };
  }
  if (raw.includes('.')) {
    const parts = raw.split('.').filter(Boolean);
    return { rootId: parts[0] || '', path: parts.slice(1), parentChain: [] };
  }
  return { rootId: raw, path: [], parentChain: [] };
};

const resolveMatchingGroupKeys = (groupId: string, path: string[], ctx: VisibilityContext): string[] => {
  const normalizedGroupId = normalizeLineItemId(groupId).toUpperCase();
  if (!normalizedGroupId) return [];
  if (!path.length) return [groupId];
  const keys = typeof ctx.getLineItemKeys === 'function' ? ctx.getLineItemKeys() : [];
  if (!keys.length) return [];
  return keys.filter(key => {
    const parsed = parseGroupKeyPath(key);
    if (!parsed.rootId) return false;
    if (parsed.rootId.toUpperCase() !== normalizedGroupId) return false;
    return matchPathSegments(path, parsed.path);
  });
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

  const lineItemsClause = pickLineItemsClause(when);
  if (lineItemsClause) {
    const groupId = normalizeLineItemId(
      (lineItemsClause as any).groupId ?? (lineItemsClause as any).group ?? (lineItemsClause as any).lineGroupId ?? (lineItemsClause as any).lineGroup
    );
    return groupId;
  }

  const fid = (when as any).fieldId;
  return fid !== undefined && fid !== null ? fid.toString().trim() : '';
};

export const containsLineItemsClause = (when: WhenClause | undefined): boolean => {
  if (!when) return false;
  if (Array.isArray(when)) return when.some(entry => containsLineItemsClause(entry as any));
  if (typeof when !== 'object') return false;
  if (pickLineItemsClause(when)) return true;

  const allList = pickWhenList(when);
  if (allList) return allList.some(entry => containsLineItemsClause(entry as any));

  const anyList = pickWhenAnyList(when);
  if (anyList) return anyList.some(entry => containsLineItemsClause(entry as any));

  const notNode = (when as any).not;
  if (notNode) return containsLineItemsClause(notNode as any);

  return false;
};

export const containsParentLineItemsClause = (when: WhenClause | undefined): boolean => {
  if (!when) return false;
  if (Array.isArray(when)) return when.some(entry => containsParentLineItemsClause(entry as any));
  if (typeof when !== 'object') return false;
  const lineItemsClause = pickLineItemsClause(when);
  if (lineItemsClause) {
    return Boolean((lineItemsClause as any).parentWhen || (lineItemsClause as any).parentMatch);
  }

  const allList = pickWhenList(when);
  if (allList) return allList.some(entry => containsParentLineItemsClause(entry as any));

  const anyList = pickWhenAnyList(when);
  if (anyList) return anyList.some(entry => containsParentLineItemsClause(entry as any));

  const notNode = (when as any).not;
  if (notNode) return containsParentLineItemsClause(notNode as any);

  return false;
};

/**
 * Evaluate a (possibly compound) `when` clause against a visibility context.
 *
 * Supported shapes:
 * - Leaf: { fieldId, equals?, greaterThan?, lessThan?, notEmpty? }
 * - Line items: { lineItems: { groupId, subGroupId?, when?, match? } }
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

  const lineItemsClause = pickLineItemsClause(when);
  if (lineItemsClause) {
    return matchesLineItemsClause(lineItemsClause, ctx, options);
  }

  // Leaf condition
  const fieldIdRaw = (when as any).fieldId;
  const fieldId = fieldIdRaw !== undefined && fieldIdRaw !== null ? fieldIdRaw.toString().trim() : '';
  if (!fieldId) return true;
  const leaf: VisibilityCondition = { ...(when as any), fieldId };
  const value = resolveVisibilityValue(leaf, ctx, options?.rowId, options?.linePrefix);
  return matchesWhen(value, leaf as any);
};

const matchesLineItemsClause = (
  raw: any,
  ctx: VisibilityContext,
  options?: { rowId?: string; linePrefix?: string }
): boolean => {
  if (!raw || typeof raw !== 'object') return true;
  if (typeof ctx.getLineItems !== 'function') return false;

  const groupId = normalizeLineItemId((raw as any).groupId ?? (raw as any).group ?? (raw as any).lineGroupId ?? (raw as any).lineGroup);
  if (!groupId) return false;
  const subGroupId = normalizeLineItemId((raw as any).subGroupId ?? (raw as any).subGroup ?? (raw as any).subGroupID);
  const subGroupPathRaw = (raw as any).subGroupPath ?? (raw as any).subGroupPaths ?? (raw as any).subGroupPathIds;
  const subGroupPath = normalizeLineItemPathInput(subGroupPathRaw || (subGroupId ? [subGroupId] : []));
  const matchRaw = (raw as any).match;
  const parentMatchRaw = (raw as any).parentMatch;
  const matchMode = normalizeLineItemMatchMode(matchRaw);
  const parentMatchMode = parentMatchRaw !== undefined ? normalizeLineItemMatchMode(parentMatchRaw) : undefined;
  const when = (raw as any).when as WhenClause | undefined;
  const parentWhen = (raw as any).parentWhen as WhenClause | undefined;
  const parentScopeRaw = (raw as any).parentScope;
  const parentScope = typeof parentScopeRaw === 'string' && parentScopeRaw.trim().toLowerCase() === 'ancestor' ? 'ancestor' : 'immediate';
  const hasExplicitPath = subGroupPathRaw !== undefined && subGroupPathRaw !== null;
  const hasWildcard = subGroupPath.some(seg => seg === '*' || seg === '**');
  const scope = (() => {
    const scopedRowId = normalizeLineItemId(options?.rowId);
    const scopedPrefix = options?.linePrefix ? options.linePrefix.toString().trim() : '';
    if (!scopedRowId || !scopedPrefix) return null;
    const parsed = parseGroupKeyPath(scopedPrefix);
    if (!parsed.rootId) return null;
    return {
      rootId: parsed.rootId,
      chain: [...parsed.parentChain, { groupKey: scopedPrefix, rowId: scopedRowId }]
    };
  })();
  const normalizeScopeKey = (raw: string): string => normalizeLineItemId(raw).toUpperCase();
  const scopeRoot = scope ? normalizeScopeKey(scope.rootId) : '';
  const scopedToRow = Boolean(scope && scopeRoot && scopeRoot === normalizeScopeKey(groupId));

  const getRows = (key: string): any[] => {
    const rows = ctx.getLineItems?.(key);
    return Array.isArray(rows) ? rows : [];
  };
  const scopedRows = (rows: any[]): any[] => {
    if (!scopedToRow || !scope?.chain.length) return rows;
    const targetRowId = normalizeScopeKey(scope.chain[0].rowId);
    return rows.filter(row => normalizeScopeKey((row as any)?.id) === targetRowId);
  };
  const isKeyInScope = (key: string): boolean => {
    if (!scopedToRow || !scope?.chain.length) return true;
    const parsed = parseGroupKeyPath(key);
    if (normalizeScopeKey(parsed.rootId) !== scopeRoot) return false;
    if (parsed.parentChain.length < scope.chain.length) return false;
    for (let idx = 0; idx < scope.chain.length; idx += 1) {
      const expected = scope.chain[idx];
      const actual = parsed.parentChain[idx];
      if (!actual) return false;
      if (normalizeScopeKey(actual.groupKey) !== normalizeScopeKey(expected.groupKey)) return false;
      if (normalizeScopeKey(actual.rowId) !== normalizeScopeKey(expected.rowId)) return false;
    }
    return true;
  };

  const buildRowCtx = (
    rowValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue> | undefined,
    linePrefix: string
  ): VisibilityContext => {
    const normalizeRowFieldId = (fieldId: string): string => {
      const raw = fieldId ? fieldId.toString() : '';
      const prefix = linePrefix ? `${linePrefix}__` : '';
      if (prefix && raw.startsWith(prefix)) return raw.slice(prefix.length);
      return raw;
    };

    const resolveRowValue = (fieldId: string): FieldValue | undefined => {
      const localId = normalizeRowFieldId(fieldId);
      if (Object.prototype.hasOwnProperty.call(rowValues || {}, localId)) return (rowValues as any)[localId] as FieldValue;
      if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, localId)) return (parentValues as any)[localId] as FieldValue;
      if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId] as FieldValue;
      if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, fieldId)) return (parentValues as any)[fieldId] as FieldValue;
      return undefined;
    };

    return {
      getValue: resolveRowValue,
      getLineItems: ctx.getLineItems,
      getLineValue: (_rowId: string, fieldId: string) => resolveRowValue(fieldId)
    };
  };

  const rowMatches = (
    row: any,
    linePrefix: string,
    parentValues: Record<string, FieldValue> | undefined,
    clause: WhenClause | undefined
  ): boolean => {
    if (!clause) return true;
    const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
    const rowCtx = buildRowCtx(rowValues, parentValues, linePrefix);
    const rowId = (row as any)?.id ?? '';
    return matchesWhenClause(clause, rowCtx, { rowId, linePrefix });
  };

  if (!subGroupId && !subGroupPath.length) {
    const rows = scopedRows(getRows(groupId));
    if (!rows.length) return false;
    const clause = when || parentWhen;
    const mode = matchRaw !== undefined ? matchMode : parentMatchMode || matchMode;
    if (mode === 'all') return rows.every(row => rowMatches(row, groupId, undefined, clause));
    return rows.some(row => rowMatches(row, groupId, undefined, clause));
  }

  const useLegacySubgroup = !hasExplicitPath && subGroupId && !hasWildcard && parentScope === 'immediate';
  if (useLegacySubgroup) {
    const parentRows = scopedRows(getRows(groupId));
    if (!parentRows.length) return false;

    let hasAnyParentCandidate = false;
    const effectiveParentMatchMode =
      parentMatchMode || (parentWhen ? 'any' : matchMode === 'all' ? 'all' : 'any');
    for (const parentRow of parentRows) {
      const parentId = normalizeLineItemId((parentRow as any)?.id);
      if (!parentId) continue;
      if (parentWhen && !rowMatches(parentRow, groupId, undefined, parentWhen)) continue;
      hasAnyParentCandidate = true;
      const subKey = `${groupId}::${parentId}::${subGroupId}`;
      const subRows = getRows(subKey);
      if (!subRows.length) {
        if (effectiveParentMatchMode === 'all') return false;
        continue;
      }
      const parentValues = ((parentRow as any)?.values || {}) as Record<string, FieldValue>;
      const childMatches = subRows.map(subRow => rowMatches(subRow, subKey, parentValues, when));
      const parentHasMatch = matchMode === 'all' ? childMatches.every(Boolean) : childMatches.some(Boolean);
      if (effectiveParentMatchMode === 'any' && parentHasMatch) return true;
      if (effectiveParentMatchMode === 'all' && !parentHasMatch) return false;
    }

    return effectiveParentMatchMode === 'all' ? hasAnyParentCandidate : false;
  }

  const candidateKeys = resolveMatchingGroupKeys(groupId, subGroupPath, ctx).filter(isKeyInScope);
  if (!candidateKeys.length) return false;

  const effectiveParentMatchMode =
    parentMatchMode || (parentWhen ? 'any' : matchMode === 'all' ? 'all' : 'any');

  const resolveAncestorRows = (parentChain: Array<{ groupKey: string; rowId: string }>) => {
    const chain: Array<{ groupKey: string; rowId: string; row?: any; parentValues?: Record<string, FieldValue> }> = [];
    parentChain.forEach((entry, idx) => {
      const rows = getRows(entry.groupKey);
      const row = rows.find(r => normalizeLineItemId((r as any)?.id) === normalizeLineItemId(entry.rowId));
      const parentValues = idx > 0 ? ((chain[idx - 1]?.row as any)?.values || undefined) : undefined;
      chain.push({ groupKey: entry.groupKey, rowId: entry.rowId, row, parentValues });
    });
    return chain;
  };

  const parentMatches = (ancestorChain: Array<{ groupKey: string; rowId: string; row?: any; parentValues?: Record<string, FieldValue> }>): boolean => {
    if (!parentWhen) return true;
    if (!ancestorChain.length) return false;
    if (parentScope === 'ancestor') {
      const matches = ancestorChain.map(entry =>
        entry.row ? rowMatches(entry.row, entry.groupKey, entry.parentValues, parentWhen) : false
      );
      if (!matches.length) return false;
      return parentMatchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
    }
    const immediate = ancestorChain[ancestorChain.length - 1];
    if (!immediate?.row) return false;
    return rowMatches(immediate.row, immediate.groupKey, immediate.parentValues, parentWhen);
  };

  const keyMatches = candidateKeys.map(key => {
    const rows = getRows(key);
    if (!rows.length) return false;
    const parsed = parseGroupKeyPath(key);
    const ancestorChain = resolveAncestorRows(parsed.parentChain);
    if (!parentMatches(ancestorChain)) return false;
    const immediateParentValues =
      ancestorChain.length > 0 ? ((ancestorChain[ancestorChain.length - 1].row as any)?.values || undefined) : undefined;
    const matches = rows.map(row => rowMatches(row, key, immediateParentValues, when));
    if (!matches.length) return false;
    return matchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
  });

  if (!keyMatches.length) return false;
  if (effectiveParentMatchMode === 'all') return keyMatches.every(Boolean);
  return keyMatches.some(Boolean);
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
