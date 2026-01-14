import { FieldValue, LineItemRowState, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LineItemState } from '../types';

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

export const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string) =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

export const parseSubgroupKey = (key: string): { parentGroupId: string; parentRowId: string; subGroupId: string } | null => {
  const parts = key.split('::');
  if (parts.length !== 3) return null;
  return { parentGroupId: parts[0], parentRowId: parts[1], subGroupId: parts[2] };
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

    const autoFields: string[] = (q.lineItemConfig?.fields || []).filter(f => (f as any).autoIncrement).map(f => f.id);
    const rows = nextLineItems[q.id] || [];
    if (autoFields.length && rows.length) {
      nextLineItems[q.id] = rows.map(row => {
        const vals = { ...row.values };
        autoFields.forEach((fid: string) => {
          vals[fid] = '';
        });
        return { ...row, values: vals };
      });
    }

    const subGroups = q.lineItemConfig?.subGroups || [];
    subGroups.forEach(sub => {
      const subKey = resolveSubgroupKey(sub as any);
      const autoSubFields: string[] = ((sub as any).fields || [])
        .filter((f: any) => f?.autoIncrement && f?.id)
        .map((f: any) => String(f.id));
      if (!autoSubFields.length) return;
      rows.forEach(row => {
        const childKey = buildSubgroupKey(q.id, row.id, subKey);
        const childRows = nextLineItems[childKey];
        if (!childRows || !childRows.length) return;
        nextLineItems[childKey] = childRows.map(child => {
          const vals = { ...child.values };
          autoSubFields.forEach((fid: string) => {
            vals[fid] = '';
          });
          return { ...child, values: vals };
        });
      });
    });
  });

  return { values: nextValues, lineItems: nextLineItems };
};

export const seedSubgroupDefaults = (
  lineItems: LineItemState,
  group: WebQuestionDefinition,
  parentRowId: string
): LineItemState => {
  if (!group.lineItemConfig?.subGroups?.length) return lineItems;
  let next = lineItems;
  group.lineItemConfig.subGroups.forEach(sub => {
    const subKeyRaw = resolveSubgroupKey(sub as any);
    if (!subKeyRaw || (sub as any).addMode === 'overlay' || (sub as any).addMode === 'auto') return;
    const subKey = buildSubgroupKey(group.id, parentRowId, subKeyRaw);
    const existing = next[subKey] || [];
    if (existing.length) return;
    const minRows = Math.max(1, (sub as any).minRows || 1);
    const newRows: LineItemRowState[] = [];
    for (let i = 0; i < minRows; i += 1) {
      newRows.push({
        id: `${subKey}_${i}_${Math.random().toString(16).slice(2)}`,
        values: {},
        parentId: parentRowId,
        parentGroupId: group.id
      });
    }
    next = { ...next, [subKey]: newRows };
  });
  return next;
};

export const buildInitialLineItems = (definition: WebFormDefinition, recordValues?: Record<string, any>): LineItemState => {
  let state: LineItemState = {};
  const effectFieldLookup: Record<string, string> = {};
  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      const subgroupIds = group.lineItemConfig?.subGroups?.map(sg => resolveSubgroupKey(sg as any)).filter(Boolean) || [];
      subgroupIds.forEach(subId => {
        const effectField = (group.lineItemConfig?.fields || []).find(f =>
          Array.isArray((f as any).selectionEffects) &&
          (f as any).selectionEffects.some((eff: any) => eff?.type === 'addLineItemsFromDataSource' && eff.groupId === subId)
        );
        if (effectField?.id) {
          effectFieldLookup[`${group.id}::${subId}`] = effectField.id.toString();
        }
      });
    });

  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const raw = recordValues?.[q.id] || recordValues?.[`${q.id}_json`];
      let rows: any[] = [];
      if (Array.isArray(raw)) {
        rows = raw;
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rows = parsed;
        } catch (_) {
          rows = [];
        }
      }

      const parsedRows = (rows || []).map((r, idx) => {
        const rowId = `${q.id}_${idx}_${Math.random().toString(16).slice(2)}`;
        const values = { ...(r || {}) };
        // extract subgroup rows if present
        if (q.lineItemConfig?.subGroups?.length) {
          q.lineItemConfig.subGroups.forEach(sub => {
            const key = resolveSubgroupKey(sub as any);
            if (!key) return;
            const rawChild = (r && (r as any)[key]) || [];
            const childRows: any[] = Array.isArray(rawChild)
              ? rawChild
              : typeof rawChild === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(rawChild);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch (_) {
                    return [];
                  }
                })()
              : [];
            const childParsed = childRows.map((cr, cIdx) => ({
              id: `${(sub as any).id || key}_${cIdx}_${Math.random().toString(16).slice(2)}`,
              values: cr || {},
              parentId: rowId,
              parentGroupId: q.id,
              autoGenerated: (() => {
                const source = parseRowSource((cr as any)?.[ROW_SOURCE_KEY]);
                if (source === 'auto') return true;
                if (source === 'manual') return false;
                return undefined;
              })(),
              effectContextId: (() => {
                const effectFieldId = effectFieldLookup[`${q.id}::${key}`];
                if (!effectFieldId) return undefined;
                return buildLineContextId(q.id, rowId, effectFieldId);
              })()
            }));
            if (childParsed.length) {
              state = { ...state, [buildSubgroupKey(q.id, rowId, key)]: childParsed };
            }
            delete (values as any)[key];
          });
        }
        state = seedSubgroupDefaults(state, q, rowId);
        const parentId = normalizeMetaString((values as any)[ROW_PARENT_ROW_ID_KEY]);
        const parentGroupId = normalizeMetaString((values as any)[ROW_PARENT_GROUP_ID_KEY]);
        return {
          id: rowId,
          values,
          parentId: parentId && parentGroupId ? parentId : undefined,
          parentGroupId: parentId && parentGroupId ? parentGroupId : undefined
        } as any;
      });

      if (!parsedRows.length && q.lineItemConfig?.addMode !== 'overlay' && q.lineItemConfig?.addMode !== 'auto') {
        const minRows = Math.max(1, q.lineItemConfig?.minRows || 1);
        for (let i = 0; i < minRows; i += 1) {
          const newRowId = `${q.id}_${i}_${Math.random().toString(16).slice(2)}`;
          parsedRows.push({ id: newRowId, values: {} });
          state = seedSubgroupDefaults(state, q, newRowId);
        }
      }

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
      const parentGroupId =
        normalizeMetaString((row.values as any)?.[ROW_PARENT_GROUP_ID_KEY]) ||
        normalizeMetaString((row as any)?.parentGroupId);
      if (!parentRowId || !parentGroupId) return;
      const parentKey = `${parentGroupId}::${parentRowId}`;
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
    const parentKey = `${parsed.parentGroupId}::${parsed.parentRowId}`;
    if (!removedSet.has(parentKey)) return;
    removedSubgroupKeys.push(key);
    delete (nextLineItems as any)[key];
  });

  return { lineItems: nextLineItems, removed, removedSubgroupKeys };
};


