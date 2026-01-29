import { FieldValue, LineItemDedupRule, LineItemRowState, OptionFilter, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LineItemState } from '../types';
import { toDependencyValue } from '../../core';
import { computeNonMatchOptionKeys } from '../../rules/filter';

export const ROW_SOURCE_KEY = '__ckRowSource';
export const ROW_SOURCE_AUTO = 'auto';
export const ROW_SOURCE_MANUAL = 'manual';
/**
 * When a line-item row is created by a selectionEffects rule with an explicit `id`,
 * we tag the row values with this key so rules/disclaimers can reference the originating effect.
 */
export const ROW_SELECTION_EFFECT_ID_KEY = '__ckSelectionEffectId';

/**
 * Parent/child relationship metadata for rows created via selection effects (persisted inside row values).
 * This is used to support cascading deletes and targeted "delete child row" behaviors.
 */
export const ROW_PARENT_ROW_ID_KEY = '__ckParentRowId';
export const ROW_PARENT_GROUP_ID_KEY = '__ckParentGroupId';

/**
 * When true, suppress the UI "Remove" action for this row.
 */
export const ROW_HIDE_REMOVE_KEY = '__ckHideRemove';

/**
 * Warning metadata for optionFilter matchMode="or".
 * Stores the dependency keys that were NOT satisfied by the row's selected option.
 */
export const ROW_NON_MATCH_OPTIONS_KEY = '__ckNonMatchOptions';

/**
 * Persisted stable row id (stored inside row values so it survives save/load).
 * This is required for parent↔child relationships (selection effects) to remain valid across sessions.
 */
export const ROW_ID_KEY = '__ckRowId';

const normalizeMetaString = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

export const parseRowHideRemove = (raw: any): boolean => {
  if (!raw) return false;
  const val = typeof raw === 'string' ? raw.toLowerCase().trim() : raw;
  if (val === true || val === 'true' || val === 1 || val === '1') return true;
  return false;
};

export const parseRowSource = (raw: any): 'auto' | 'manual' | undefined => {
  if (!raw) return undefined;
  const val = typeof raw === 'string' ? raw.toLowerCase().trim() : raw;
  if (val === ROW_SOURCE_AUTO || val === 'a' || val === 1 || val === '1' || val === true || val === 'true') return 'auto';
  if (val === ROW_SOURCE_MANUAL || val === 'm' || val === 0 || val === '0' || val === false || val === 'false') return 'manual';
  return undefined;
};

const normalizeStringList = (raw: any): string[] => {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.includes(',')
      ? raw.split(',')
      : [raw];
  const seen = new Set<string>();
  return list
    .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
    .filter(v => {
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    });
};

export const parseRowNonMatchOptions = (raw: any): string[] => normalizeStringList(raw);

const normalizeRowLimit = (raw: any): number | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
};

export const resolveLineItemRowLimits = (cfg?: { minRows?: any; maxRows?: any }): { minRows?: number; maxRows?: number } => {
  if (!cfg) return {};
  const minRows = normalizeRowLimit((cfg as any).minRows);
  const maxRows = normalizeRowLimit((cfg as any).maxRows);
  return { minRows, maxRows };
};

export const isLineItemMaxRowsReached = (count: number, maxRows?: number): boolean => {
  if (maxRows === undefined || maxRows === null) return false;
  return count >= maxRows;
};

const normalizeDedupScalar = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    const parts = raw.map(normalizeDedupScalar).filter(Boolean);
    if (!parts.length) return '';
    return Array.from(new Set(parts)).sort().join('||');
  }
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw.toString().toLowerCase();
  try {
    return raw.toString().trim().toLowerCase();
  } catch (_) {
    return '';
  }
};

export const buildLineItemDedupKey = (rowValues: Record<string, FieldValue>, fieldIds: string[]): string | null => {
  if (!fieldIds.length) return null;
  const parts = fieldIds.map(fid => normalizeDedupScalar((rowValues as any)[fid]));
  if (parts.some(p => !p)) return null;
  return parts.join('||');
};

export const formatLineItemDedupValue = (raw: FieldValue): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    return raw
      .map(item => formatLineItemDedupValue(item as any))
      .filter(Boolean)
      .join(', ');
  }
  if (raw instanceof Date) return raw.toISOString();
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

export const normalizeLineItemDedupRules = (raw: any): LineItemDedupRule[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(rule => {
      if (!rule || typeof rule !== 'object') return null;
      const rawFields = (rule as any).fields ?? (rule as any).fieldIds ?? (rule as any).keys ?? (rule as any).keyFields;
      const fields = (() => {
        if (Array.isArray(rawFields)) {
          return rawFields
            .map(v => (v !== undefined && v !== null ? v.toString().trim() : ''))
            .filter(Boolean);
        }
        if (typeof rawFields === 'string') {
          return rawFields
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        }
        return [];
      })();
      if (!fields.length) return null;
      return { fields, message: (rule as any).message } as LineItemDedupRule;
    })
    .filter(Boolean) as LineItemDedupRule[];
};

export const findLineItemDedupConflict = (args: {
  rules: LineItemDedupRule[];
  rows: LineItemRowState[];
  rowValues: Record<string, FieldValue>;
  excludeRowId?: string;
}):
  | {
      rule: LineItemDedupRule;
      fields: string[];
      matchRow: LineItemRowState;
    }
  | null => {
  const { rules, rows, rowValues, excludeRowId } = args;
  if (!rules.length || !rows.length) return null;
  for (const rule of rules) {
    const fields = (rule.fields || []).map(fid => (fid ?? '').toString().trim()).filter(Boolean);
    if (!fields.length) continue;
    const nextKey = buildLineItemDedupKey(rowValues, fields);
    if (!nextKey) continue;
    const match = rows.find(row => {
      if (excludeRowId && row.id === excludeRowId) return false;
      const key = buildLineItemDedupKey((row.values || {}) as Record<string, FieldValue>, fields);
      return key === nextKey;
    });
    if (match) {
      return { rule, fields, matchRow: match };
    }
  }
  return null;
};

const isOrMatchMode = (filter: OptionFilter | undefined): boolean => {
  const raw = (filter as any)?.matchMode;
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'or';
};

const resolveNonMatchSourceFieldId = (fields: any[], anchorFieldId?: string): string => {
  const candidates = (fields || []).filter(f => f && f.optionFilter && isOrMatchMode(f.optionFilter));
  if (!candidates.length) return '';
  if (anchorFieldId && candidates.some(f => (f?.id ?? '').toString() === anchorFieldId)) return anchorFieldId;
  const first = candidates[0];
  return (first?.id ?? '').toString();
};

const resolveDependencyValues = (args: {
  filter: OptionFilter;
  rowValues: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  selectorId?: string;
  selectorValue?: FieldValue;
}): (string | number | null | undefined)[] => {
  const { filter, rowValues, topValues, parentValues, selectorId, selectorValue } = args;
  const depIds = Array.isArray(filter.dependsOn) ? filter.dependsOn : [filter.dependsOn];
  return depIds
    .map(depId => {
      const dep = depId !== undefined && depId !== null ? depId.toString().trim() : '';
      if (!dep) return undefined;
      if (selectorId && dep === selectorId) {
        if (selectorValue !== undefined && selectorValue !== null) return toDependencyValue(selectorValue);
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, dep)) return toDependencyValue((rowValues as any)[dep]);
        if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, dep)) return toDependencyValue((parentValues as any)[dep]);
        return toDependencyValue((topValues as any)[dep]);
      }
      if (Object.prototype.hasOwnProperty.call(rowValues || {}, dep)) return toDependencyValue((rowValues as any)[dep]);
      if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, dep)) return toDependencyValue((parentValues as any)[dep]);
      return toDependencyValue((topValues as any)[dep]);
    })
    .filter(v => v !== undefined);
};

const resolveSingleChoiceValue = (raw: FieldValue): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first === undefined || first === null ? '' : first.toString().trim();
  }
  return raw.toString().trim();
};

export const computeRowNonMatchOptions = (args: {
  fields: any[];
  rowValues: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  selectorId?: string;
  selectorValue?: FieldValue;
  anchorFieldId?: string;
  sourceField?: any;
}): string[] => {
  const { fields, rowValues, topValues, parentValues, selectorId, selectorValue, anchorFieldId, sourceField } = args;
  const resolvedFields = Array.isArray(fields) ? fields : [];
  const sourceFieldId = resolveNonMatchSourceFieldId(resolvedFields, anchorFieldId);
  const targetField =
    sourceField ||
    (sourceFieldId ? resolvedFields.find(f => (f?.id ?? '').toString() === sourceFieldId) : undefined);
  if (!targetField?.optionFilter || !isOrMatchMode(targetField.optionFilter)) return [];

  const selectedRaw = (rowValues as any)[(targetField?.id ?? sourceFieldId) as any];
  const selectedList = Array.isArray(selectedRaw) ? selectedRaw : [selectedRaw];
  const dependencyValues = resolveDependencyValues({
    filter: targetField.optionFilter,
    rowValues,
    topValues,
    parentValues,
    selectorId,
    selectorValue
  });
  const nonMatchKeys = selectedList.flatMap(rawSelected => {
    const selected = resolveSingleChoiceValue(rawSelected as FieldValue);
    if (!selected) return [];
    return computeNonMatchOptionKeys({
      filter: targetField.optionFilter,
      dependencyValues,
      selectedValue: selected
    });
  });
  return normalizeStringList(nonMatchKeys);
};

export const recomputeLineItemNonMatchOptions = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  subgroupSelectors?: Record<string, string>;
}): { lineItems: LineItemState; changed: boolean; updatedRows: number } => {
  const { definition, values, lineItems, subgroupSelectors = {} } = args;
  let nextState: LineItemState = lineItems;
  let changed = false;
  let updatedRows = 0;

  const updateRows = (rowList: LineItemRowState[], fields: any[], opts: { anchorFieldId?: string; parentValues?: Record<string, FieldValue>; selectorId?: string; selectorValue?: FieldValue }) => {
    let anyRowChanged = false;
    const nextRows = rowList.map(row => {
      const rowValues = { ...(row.values || {}) };
      const normalized = computeRowNonMatchOptions({
        fields,
        rowValues,
        topValues: values,
        parentValues: opts.parentValues,
        selectorId: opts.selectorId,
        selectorValue: opts.selectorValue,
        anchorFieldId: opts.anchorFieldId
      });
      const existing = parseRowNonMatchOptions((rowValues as any)[ROW_NON_MATCH_OPTIONS_KEY]);

      const same =
        normalized.length === existing.length && normalized.every((val, idx) => val === existing[idx]);
      if (same) return row;

      if (normalized.length) {
        rowValues[ROW_NON_MATCH_OPTIONS_KEY] = normalized;
      } else {
        delete (rowValues as any)[ROW_NON_MATCH_OPTIONS_KEY];
      }
      anyRowChanged = true;
      updatedRows += 1;
      return { ...row, values: rowValues };
    });

    if (!anyRowChanged) return rowList;
    changed = true;
    return nextRows;
  };

  const updateGroupRows = (args: {
    groupKey: string;
    groupCfg: any;
    rows: LineItemRowState[];
    parentValues?: Record<string, FieldValue>;
    isSubgroup: boolean;
  }): void => {
    const { groupKey, groupCfg, rows, parentValues, isSubgroup } = args;
    const fields = (groupCfg?.fields || []) as any[];
    const selectorId =
      groupCfg?.sectionSelector?.id !== undefined && groupCfg?.sectionSelector?.id !== null
        ? groupCfg.sectionSelector.id.toString()
        : undefined;
    const selectorValue = selectorId ? (isSubgroup ? subgroupSelectors[groupKey] : (values as any)[selectorId]) : undefined;
    const updated = updateRows(rows, fields, {
      anchorFieldId: groupCfg?.anchorFieldId,
      parentValues,
      selectorId,
      selectorValue
    });
    if (updated !== rows) {
      if (nextState === lineItems) nextState = { ...lineItems };
      nextState[groupKey] = updated;
    }

    const subGroups = (groupCfg?.subGroups || []) as any[];
    if (!subGroups.length) return;
    const parentRows = updated || rows;
    parentRows.forEach(parentRow => {
      const nextParentValues = parentRow?.values || {};
      subGroups.forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const subKey = buildSubgroupKey(groupKey, parentRow.id, subId);
        const subRows = nextState[subKey] || [];
        if (!subRows.length) return;
        updateGroupRows({ groupKey: subKey, groupCfg: sub, rows: subRows, parentValues: nextParentValues, isSubgroup: true });
      });
    });
  };

  (definition.questions || [])
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      const groupRows = nextState[group.id] || [];
      updateGroupRows({ groupKey: group.id, groupCfg: group.lineItemConfig, rows: groupRows, isSubgroup: false });
    });

  return { lineItems: nextState, changed, updatedRows };
};

export const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string) =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

export type ParsedSubgroupKey = {
  groupKey: string;
  rootGroupId: string;
  parentGroupKey: string;
  parentGroupId: string;
  parentRowId: string;
  subGroupId: string;
  path: string[];
};

export const parseSubgroupKey = (key: string): ParsedSubgroupKey | null => {
  const raw = (key || '').toString();
  if (!raw.includes('::')) return null;
  const parts = raw.split('::').filter(Boolean);
  if (parts.length < 3 || parts.length % 2 === 0) return null;
  const rootGroupId = parts[0] || '';
  const parentRowId = parts[parts.length - 2] || '';
  const subGroupId = parts[parts.length - 1] || '';
  const parentGroupKey = parts.slice(0, parts.length - 2).join('::');
  if (!rootGroupId || !parentGroupKey || !parentRowId || !subGroupId) return null;
  const path = parts.filter((_, idx) => idx > 0 && idx % 2 === 0);
  return {
    groupKey: raw,
    rootGroupId,
    parentGroupKey,
    parentGroupId: rootGroupId,
    parentRowId,
    subGroupId,
    path
  };
};

export const buildLineContextId = (groupId: string, rowId: string, fieldId?: string) =>
  `${groupId}::${rowId}::${fieldId || 'field'}`;

export const resolveSubgroupKey = (sub?: { id?: string; label?: any }): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  if (typeof sub.label === 'string') return sub.label;
  return sub.label?.en || sub.label?.fr || sub.label?.nl || '';
};

export const clearAutoIncrementFields = (
  definition: WebFormDefinition,
  values: Record<string, FieldValue>,
  lineItems: LineItemState
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  const nextValues = { ...values };
  const nextLineItems: LineItemState = { ...lineItems };

  definition.questions.forEach(q => {
    if (q.type === 'TEXT' && (q as any).autoIncrement) {
      nextValues[q.id] = '';
    }
    if (q.type !== 'LINE_ITEM_GROUP') return;

    const clearGroupAutoFields = (args: { groupKey: string; groupCfg: any; rows: LineItemRowState[] }) => {
      const { groupKey, groupCfg, rows } = args;
      const autoFields: string[] = (groupCfg?.fields || []).filter((f: any) => f?.autoIncrement).map((f: any) => f.id);
      if (autoFields.length && rows.length) {
        nextLineItems[groupKey] = rows.map(row => {
          const vals = { ...row.values };
          autoFields.forEach((fid: string) => {
            vals[fid] = '';
          });
          return { ...row, values: vals };
        });
      }
      const subGroups = (groupCfg?.subGroups || []) as any[];
      if (!subGroups.length) return;
      rows.forEach(row => {
        subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const childKey = buildSubgroupKey(groupKey, row.id, subId);
          const childRows = nextLineItems[childKey];
          if (!childRows || !childRows.length) return;
          clearGroupAutoFields({ groupKey: childKey, groupCfg: sub, rows: childRows });
        });
      });
    };

    const rows = nextLineItems[q.id] || [];
    clearGroupAutoFields({ groupKey: q.id, groupCfg: q.lineItemConfig, rows });
  });

  return { values: nextValues, lineItems: nextLineItems };
};

export const seedSubgroupDefaults = (
  lineItems: LineItemState,
  group: WebQuestionDefinition,
  parentRowId: string
): LineItemState => {
  // Intentionally no-op: do not auto-create empty subgroup rows in any mode.
  // Subgroup rows should only exist when explicitly added (manual or selection effects).
  return lineItems;
};

export const buildInitialLineItems = (definition: WebFormDefinition, recordValues?: Record<string, any>): LineItemState => {
  let state: LineItemState = {};

  const buildPathKey = (rootGroupId: string, path: string[]): string =>
    path.length ? `${rootGroupId}::${path.join('::')}` : rootGroupId;

  const effectFieldLookup: Record<string, string> = {};
  const collectEffectFields = (rootGroupId: string, groupCfg: any, path: string[]) => {
    const fields = (groupCfg?.lineItemConfig?.fields || groupCfg?.fields || []) as any[];
    const subGroups = (groupCfg?.lineItemConfig?.subGroups || groupCfg?.subGroups || []) as any[];
    fields.forEach(field => {
      const effects = Array.isArray((field as any)?.selectionEffects) ? (field as any).selectionEffects : [];
      effects.forEach((eff: any) => {
        if (!eff || eff.type !== 'addLineItemsFromDataSource' || !eff.groupId) return;
        const key = buildPathKey(rootGroupId, [...path, eff.groupId.toString()]);
        if (!effectFieldLookup[key]) {
          effectFieldLookup[key] = field.id?.toString?.() || '';
        }
      });
    });
    subGroups.forEach(sub => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      collectEffectFields(rootGroupId, sub, [...path, subId]);
    });
  };

  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      collectEffectFields(group.id, group, []);
    });

  const parseRawRows = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  };

  const resolveGroupConfig = (groupCfg: any) => {
    const cfg = groupCfg?.lineItemConfig || groupCfg || {};
    return {
      fields: (cfg.fields || []) as any[],
      subGroups: (cfg.subGroups || []) as any[],
      addMode: (cfg.addMode || '').toString().trim().toLowerCase(),
      minRows: cfg.minRows,
      anchorFieldId:
        cfg.anchorFieldId !== undefined && cfg.anchorFieldId !== null ? cfg.anchorFieldId.toString() : ''
    };
  };

  const parseGroupRows = (args: {
    rootGroupId: string;
    groupKey: string;
    groupCfg: any;
    path: string[];
    rawRows: any[];
    parentRowId?: string;
    parentGroupKey?: string;
    legacyParentIdByAnchor?: Map<string, string>;
  }): LineItemRowState[] => {
    const { rootGroupId, groupKey, groupCfg, path, rawRows, parentRowId, parentGroupKey, legacyParentIdByAnchor } = args;
    const cfg = resolveGroupConfig(groupCfg);
    const usedRowIds = new Set<string>();

    const parsedRows = (rawRows || []).map((r, idx) => {
      const values = { ...(r || {}) };
      const isChildRow = (() => {
        const pid = normalizeMetaString((values as any)[ROW_PARENT_ROW_ID_KEY]);
        const pgid = normalizeMetaString((values as any)[ROW_PARENT_GROUP_ID_KEY]);
        return !!(pid && pgid);
      })();

      const rowId = (() => {
        const stored = normalizeMetaString((values as any)[ROW_ID_KEY]);
        if (stored) return stored;
        if (!isChildRow && legacyParentIdByAnchor && cfg.anchorFieldId) {
          const anchorVal = normalizeMetaString((values as any)[cfg.anchorFieldId]);
          const legacy = anchorVal ? legacyParentIdByAnchor.get(anchorVal) || '' : '';
          if (legacy && !usedRowIds.has(legacy)) return legacy;
        }
        const prefix = path.length ? path[path.length - 1] : rootGroupId;
        return `${prefix}_${idx}_${Math.random().toString(16).slice(2)}`;
      })();
      usedRowIds.add(rowId);
      (values as any)[ROW_ID_KEY] = rowId;

      if (parentRowId && parentGroupKey) {
        if (!Object.prototype.hasOwnProperty.call(values, ROW_PARENT_ROW_ID_KEY)) {
          (values as any)[ROW_PARENT_ROW_ID_KEY] = parentRowId;
        }
        if (!Object.prototype.hasOwnProperty.call(values, ROW_PARENT_GROUP_ID_KEY)) {
          (values as any)[ROW_PARENT_GROUP_ID_KEY] = parentGroupKey;
        }
      }

      const row: LineItemRowState = {
        id: rowId,
        values,
        parentId: parentRowId,
        parentGroupId: parentGroupKey
      };

      const source = parseRowSource((values as any)?.[ROW_SOURCE_KEY]);
      if (source === 'auto') row.autoGenerated = true;
      if (source === 'manual') row.autoGenerated = false;

      if (path.length && parentRowId && parentGroupKey) {
        const effectKey = buildPathKey(rootGroupId, path);
        const effectFieldId = effectFieldLookup[effectKey];
        if (effectFieldId) {
          row.effectContextId = buildLineContextId(parentGroupKey, parentRowId, effectFieldId);
        }
      }

      // Extract child subgroup rows recursively
      if (cfg.subGroups.length) {
        cfg.subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const childRaw = (r && (r as any)[subId]) || [];
          const childRows = parseRawRows(childRaw);
          const childKey = buildSubgroupKey(groupKey, rowId, subId);
          const childParsed = parseGroupRows({
            rootGroupId,
            groupKey: childKey,
            groupCfg: sub,
            path: [...path, subId],
            rawRows: childRows,
            parentRowId: rowId,
            parentGroupKey: groupKey
          });
          if (childParsed.length) {
            state = { ...state, [childKey]: childParsed };
          }
          delete (values as any)[subId];
        });
      }

      return row;
    });

    if (!parsedRows.length && cfg.addMode !== 'overlay' && cfg.addMode !== 'auto' && cfg.addMode !== 'selectoroverlay' && cfg.addMode !== 'selector-overlay') {
      const rawMinRows = cfg.minRows;
      const minRows = (() => {
        if (rawMinRows === undefined || rawMinRows === null) return 0;
        const parsed = Number(rawMinRows);
        if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
        return Math.max(0, Math.floor(parsed));
      })();
      if (minRows) {
        for (let i = 0; i < minRows; i += 1) {
          const prefix = path.length ? path[path.length - 1] : rootGroupId;
          const newRowId = `${prefix}_${i}_${Math.random().toString(16).slice(2)}`;
          parsedRows.push({ id: newRowId, values: {} });
        }
      }
    }

    return parsedRows;
  };

  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const raw = recordValues?.[q.id] || recordValues?.[`${q.id}_json`];
      const rows = parseRawRows(raw);

      const cfg = resolveGroupConfig(q);
      const legacyParentIdByAnchor = (() => {
        if (!cfg.anchorFieldId) return new Map<string, string>();
        const map = new Map<string, string>();
        (rows || []).forEach(r => {
          if (!r || typeof r !== 'object') return;
          const parentGroupId = normalizeMetaString((r as any)[ROW_PARENT_GROUP_ID_KEY]);
          const parentRowId = normalizeMetaString((r as any)[ROW_PARENT_ROW_ID_KEY]);
          if (parentGroupId !== q.id || !parentRowId) return;
          const anchorVal = normalizeMetaString((r as any)[cfg.anchorFieldId]);
          if (!anchorVal) return;
          if (!map.has(anchorVal)) map.set(anchorVal, parentRowId);
        });
        return map;
      })();

      const parsedRows = parseGroupRows({
        rootGroupId: q.id,
        groupKey: q.id,
        groupCfg: q,
        path: [],
        rawRows: rows,
        legacyParentIdByAnchor
      });

      parsedRows.forEach(row => {
        state = seedSubgroupDefaults(state, q, row.id);
      });

      state[q.id] = parsedRows;
    });

  return state;
};

export const cascadeRemoveLineItemRows = (args: {
  lineItems: LineItemState;
  roots: Array<{ groupId: string; rowId: string }>;
}): { lineItems: LineItemState; removed: Array<{ groupId: string; rowId: string }>; removedSubgroupKeys: string[] } => {
  const { lineItems, roots } = args;
  const seed = (roots || []).filter(r => r?.groupId && r?.rowId);
  if (!seed.length) return { lineItems, removed: [], removedSubgroupKeys: [] };

  const childrenByParent = new Map<string, Array<{ groupId: string; rowId: string }>>();
  Object.keys(lineItems).forEach(groupKey => {
    const rows = lineItems[groupKey] || [];
    rows.forEach(row => {
      const parentRowId =
        normalizeMetaString((row.values as any)?.[ROW_PARENT_ROW_ID_KEY]) || normalizeMetaString((row as any)?.parentId);
      const parentGroupKey =
        normalizeMetaString((row.values as any)?.[ROW_PARENT_GROUP_ID_KEY]) ||
        normalizeMetaString((row as any)?.parentGroupId);
      if (!parentRowId || !parentGroupKey) return;
      const parentKey = `${parentGroupKey}::${parentRowId}`;
      const existing = childrenByParent.get(parentKey) || [];
      existing.push({ groupId: groupKey, rowId: row.id });
      childrenByParent.set(parentKey, existing);
    });
  });

  const removed: Array<{ groupId: string; rowId: string }> = [];
  const removedSet = new Set<string>();
  const queue: Array<{ groupId: string; rowId: string }> = [...seed];
  while (queue.length) {
    const cur = queue.shift()!;
    const key = `${cur.groupId}::${cur.rowId}`;
    if (removedSet.has(key)) continue;
    removedSet.add(key);
    removed.push(cur);
    const children = childrenByParent.get(key) || [];
    children.forEach(child => queue.push(child));
  }

  // Remove rows from their owning group keys.
  const removedByGroup = new Map<string, Set<string>>();
  removed.forEach(({ groupId, rowId }) => {
    if (!removedByGroup.has(groupId)) removedByGroup.set(groupId, new Set());
    removedByGroup.get(groupId)!.add(rowId);
  });

  let nextLineItems: LineItemState = { ...lineItems };
  removedByGroup.forEach((rowIds, groupKey) => {
    const rows = nextLineItems[groupKey] || [];
    nextLineItems = { ...nextLineItems, [groupKey]: rows.filter(r => !rowIds.has(r.id)) };
  });

  // Also delete any subgroup keys whose parent row was removed.
  const removedSubgroupKeys: string[] = [];
  Object.keys(nextLineItems).forEach(key => {
    const parsed = parseSubgroupKey(key);
    if (!parsed) return;
    const parentKey = `${parsed.parentGroupKey}::${parsed.parentRowId}`;
    if (!removedSet.has(parentKey)) return;
    removedSubgroupKeys.push(key);
    delete (nextLineItems as any)[key];
  });

  return { lineItems: nextLineItems, removed, removedSubgroupKeys };
};

