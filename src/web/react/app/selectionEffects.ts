import { handleSelectionEffects } from '../../core';
import { FieldValue, LangCode, LineItemRowState, PresetValue, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LineItemState } from '../types';
import { applyValueMapsToForm } from './valueMaps';
import {
  ROW_SOURCE_AUTO,
  ROW_SOURCE_KEY,
  ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  ROW_HIDE_REMOVE_KEY,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  buildLineContextId,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  parseRowSource,
  parseSubgroupKey,
  resolveSubgroupKey,
  seedSubgroupDefaults
} from './lineItems';

type SelectionEffectOpts = {
  lineItem?: { groupId: string; rowId: string; rowValues: any };
  contextId?: string;
  forceContextReset?: boolean;
};

const areFieldValuesEqual = (a: FieldValue, b: FieldValue): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i += 1) {
      if (arrA[i] !== arrB[i]) return false;
    }
    return true;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }
  return false;
};

const areValueMapsEqual = (a: Record<string, FieldValue>, b: Record<string, FieldValue>): boolean => {
  if (a === b) return true;
  const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
  for (const key of keys) {
    if (!areFieldValuesEqual((a as any)[key], (b as any)[key])) return false;
  }
  return true;
};

export const runSelectionEffects = (args: {
  definition: WebFormDefinition;
  question: WebQuestionDefinition;
  value: FieldValue;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  setValues: (next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)) => void;
  setLineItems: (next: LineItemState | ((prev: LineItemState) => LineItemState)) => void;
  logEvent?: (event: string, payload?: Record<string, unknown>) => void;
  onRowAppended?: (args: { anchor: string; targetKey: string; rowId: string; source?: { groupId: string; rowId: string } }) => void;
  opts?: SelectionEffectOpts;
  effectOverrides?: Record<string, Record<string, FieldValue>>;
}) => {
  const { definition, question, value, language, values, lineItems, setValues, setLineItems, logEvent, onRowAppended, opts, effectOverrides } = args;
  if (!question.selectionEffects || !question.selectionEffects.length) return;
  let latestValuesSnapshot: Record<string, FieldValue> = values;
  const emittedLogKeys = new Set<string>();
  const setValuesIfChanged = (nextValues: Record<string, FieldValue>) => {
    if (areValueMapsEqual(latestValuesSnapshot, nextValues)) return;
    latestValuesSnapshot = nextValues;
    setValues(nextValues);
  };
  const logEventOnce = (onceKey: string, event: string, payload?: Record<string, unknown>) => {
    if (!logEvent) return;
    if (!onceKey) {
      logEvent(event, payload);
      return;
    }
    if (emittedLogKeys.has(onceKey)) return;
    emittedLogKeys.add(onceKey);
    logEvent(event, payload);
  };
  const applyValueMapsWithBlurDerived = (nextLineItems: LineItemState) =>
    applyValueMapsToForm(definition, latestValuesSnapshot, nextLineItems, { mode: 'change' });

  const applyValueMapsWithBlurDerivedForValues = (
    nextValues: Record<string, FieldValue>,
    nextLineItems: LineItemState,
    lockedTopFields?: string[]
  ) =>
    applyValueMapsToForm(definition, nextValues, nextLineItems, {
      mode: 'change',
      lockedTopFields
    });

  const resolveRowIdPrefix = (groupKey: string): string => {
    const parsed = parseSubgroupKey(groupKey);
    return parsed?.subGroupId || groupKey;
  };

  const resolveGroupConfigForKey = (groupKey: string): { root?: WebQuestionDefinition; group?: any } => {
    const parsed = parseSubgroupKey(groupKey);
    if (!parsed) {
      const root = definition.questions.find(q => q.id === groupKey);
      return { root, group: root?.lineItemConfig };
    }
    const root = definition.questions.find(q => q.id === parsed.rootGroupId);
    if (!root) return { root };
    let current: any = root;
    for (let i = 0; i < parsed.path.length; i += 1) {
      const subId = parsed.path[i];
      const subs = (current?.lineItemConfig?.subGroups || current?.subGroups || []) as any[];
      const match = subs.find(s => resolveSubgroupKey(s) === subId);
      if (!match) break;
      current = match;
    }
    return { root, group: current };
  };

  const resolveTargetGroupKey = (targetGroupId: string, lineItemCtx?: { groupId: string; rowId?: string }): string => {
    if (!lineItemCtx?.groupId || !lineItemCtx?.rowId) return targetGroupId;
    const rawTarget = (targetGroupId || '').toString();
    const pathSegments = rawTarget.includes('.')
      ? rawTarget
          .split('.')
          .map(seg => seg.trim())
          .filter(Boolean)
      : [];
    // If we're already operating inside a subgroup key, resolve subgroup ids relative to that parent row.
    const parsed = parseSubgroupKey(lineItemCtx.groupId);
    const currentPath = parsed?.path || [];
    const matchesCurrentPrefix =
      pathSegments.length && currentPath.length
        ? pathSegments.slice(0, currentPath.length).join('.') === currentPath.join('.')
        : false;
    const relativePath = pathSegments.length ? (matchesCurrentPrefix ? pathSegments.slice(currentPath.length) : pathSegments) : [];
    const targetId = relativePath.length ? relativePath[0] : rawTarget;
    if (parsed) {
      // same subgroup path -> current subgroup key
      if (!relativePath.length && pathSegments.length && matchesCurrentPrefix) return lineItemCtx.groupId;
      if (targetId === parsed.subGroupId) return lineItemCtx.groupId;
      const currentCfg = resolveGroupConfigForKey(lineItemCtx.groupId).group;
      const subMatch = currentCfg?.subGroups?.find((sub: any) => {
        const key = resolveSubgroupKey(sub as any);
        return key === targetId;
      });
      if (subMatch) {
        const key = resolveSubgroupKey(subMatch as any) || targetId;
        return buildSubgroupKey(lineItemCtx.groupId, lineItemCtx.rowId, key);
      }
      if (targetId === parsed.rootGroupId) return parsed.rootGroupId;
      return rawTarget;
    }
    const parentGroup = definition.questions.find(q => q.id === lineItemCtx.groupId);
    const subMatch = parentGroup?.lineItemConfig?.subGroups?.find(sub => {
      const key = resolveSubgroupKey(sub as any);
      return key === targetId;
    });
    if (subMatch) {
      const key = resolveSubgroupKey(subMatch as any) || targetId;
      return buildSubgroupKey(lineItemCtx.groupId, lineItemCtx.rowId, key);
    }
    return rawTarget;
  };

  const resolveEffectContextId = (): string | undefined => {
    const explicit = (opts?.contextId || '').toString().trim();
    if (explicit) return explicit;
    const groupId = (opts?.lineItem?.groupId || '').toString().trim();
    const rowId = (opts?.lineItem?.rowId || '').toString().trim();
    if (!groupId || !rowId) return undefined;
    return buildLineContextId(groupId, rowId, question.id);
  };

  const resolvedContextId = resolveEffectContextId();
  const effectiveLineItem = (() => {
    const lineItem = opts?.lineItem;
    if (!lineItem?.groupId) return lineItem;
    const merged: Record<string, FieldValue> = { ...((lineItem.rowValues || {}) as Record<string, FieldValue>) };
    const mergeMissing = (source?: Record<string, FieldValue>) => {
      if (!source) return;
      Object.entries(source).forEach(([key, val]) => {
        if (Object.prototype.hasOwnProperty.call(merged, key)) return;
        merged[key] = val;
      });
    };
    let currentKey = lineItem.groupId;
    let info = parseSubgroupKey(currentKey);
    while (info) {
      const currentInfo = info;
      const parentRows = lineItems[currentInfo.parentGroupKey] || [];
      const parentRow = parentRows.find(r => r.id === currentInfo.parentRowId);
      mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
      currentKey = currentInfo.parentGroupKey;
      info = parseSubgroupKey(currentKey);
    }
    return { ...lineItem, rowValues: merged };
  })();

  handleSelectionEffects(
    definition,
    question,
    value as any,
    language,
    {
      logEvent,
      addLineItemRow: (
        groupId: string,
        preset?: Record<string, any>,
        meta?: {
          effectContextId?: string;
          auto?: boolean;
          effectId?: string;
          hideRemoveButton?: boolean;
          replaceExistingByEffectId?: boolean;
        }
      ) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const sourceGroupId = opts?.lineItem?.groupId;
          const sourceRowId = opts?.lineItem?.rowId;
          const wantsInsertUnderTrigger = !!sourceGroupId && !!sourceRowId && targetKey === sourceGroupId;
          // capture section selector value at creation so later selector changes don't rewrite existing rows
          const targetGroup =
            definition.questions.find(q => q.id === targetKey) ||
            definition.questions.find(q => q.id === opts?.lineItem?.groupId);
          const selectorId = targetGroup?.lineItemConfig?.sectionSelector?.id;
          const selectorValue = selectorId && Object.prototype.hasOwnProperty.call(values, selectorId) ? (values as any)[selectorId] : undefined;
          const presetValues: Record<string, FieldValue> = {};
          Object.entries(preset || {}).forEach(([key, raw]) => {
            if (raw === undefined || raw === null) return;
            presetValues[key] = raw as FieldValue;
          });
          if (meta?.auto === true) {
            presetValues[ROW_SOURCE_KEY] = ROW_SOURCE_AUTO;
          }
          const normalizedEffectId =
            meta?.effectId === undefined || meta?.effectId === null ? '' : meta.effectId.toString().trim();
          if (normalizedEffectId) {
            presetValues[ROW_SELECTION_EFFECT_ID_KEY] = normalizedEffectId;
          }
          if (meta?.hideRemoveButton === true) {
            presetValues[ROW_HIDE_REMOVE_KEY] = true;
          }
          if (opts?.lineItem?.groupId && opts?.lineItem?.rowId) {
            presetValues[ROW_PARENT_GROUP_ID_KEY] = opts.lineItem.groupId;
            presetValues[ROW_PARENT_ROW_ID_KEY] = opts.lineItem.rowId;
          }
          if (selectorId && selectorValue !== undefined && selectorValue !== null && presetValues[selectorId] === undefined) {
            presetValues[selectorId] = selectorValue;
          }
          const normalizeMetaString = (raw: any): string => {
            if (raw === undefined || raw === null) return '';
            try {
              return raw.toString().trim();
            } catch (_) {
              return '';
            }
          };
          if (meta?.replaceExistingByEffectId === true && normalizedEffectId) {
            const requestedParentGroupId = normalizeMetaString(opts?.lineItem?.groupId);
            const requestedParentRowId = normalizeMetaString(opts?.lineItem?.rowId);
            const matchesExisting = (row: any): boolean => {
              const rowEffectId = normalizeMetaString((row?.values as any)?.[ROW_SELECTION_EFFECT_ID_KEY]);
              if (!rowEffectId || rowEffectId !== normalizedEffectId) return false;
              const rowParentGroup = normalizeMetaString(
                (row?.values as any)?.[ROW_PARENT_GROUP_ID_KEY] ?? (row as any)?.parentGroupId
              );
              const rowParentRow = normalizeMetaString((row?.values as any)?.[ROW_PARENT_ROW_ID_KEY] ?? (row as any)?.parentId);
              if (requestedParentGroupId && requestedParentRowId) {
                return rowParentGroup === requestedParentGroupId && rowParentRow === requestedParentRowId;
              }
              return true;
            };
            const existingIdxs = rows.map((row, idx) => (matchesExisting(row) ? idx : -1)).filter(idx => idx >= 0);
            if (existingIdxs.length) {
              const keepIdx = existingIdxs[0];
              const baseRow = rows[keepIdx];
              const mergedValues: Record<string, FieldValue> = {
                ...((baseRow?.values || {}) as Record<string, FieldValue>),
                ...presetValues
              };
              if (!mergedValues[ROW_ID_KEY]) mergedValues[ROW_ID_KEY] = baseRow.id;
              const nextRows = rows
                .map((row, idx) =>
                  idx === keepIdx
                    ? {
                        ...baseRow,
                        values: mergedValues,
                        parentId: opts?.lineItem?.rowId,
                        parentGroupId: opts?.lineItem?.groupId,
                        autoGenerated: meta?.auto === undefined ? baseRow.autoGenerated : meta.auto,
                        effectContextId: meta?.effectContextId === undefined ? baseRow.effectContextId : meta.effectContextId
                      }
                    : row
                )
                .filter((_, idx) => !existingIdxs.includes(idx) || idx === keepIdx);
              const nextLineItems = { ...prev, [targetKey]: nextRows };
              const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
              setValuesIfChanged(nextValues);
              return recomputed;
            }
          }
          const rowIdPrefix = resolveRowIdPrefix(targetKey);
          const newRow: LineItemRowState = {
            id: `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`,
            values: { ...presetValues, [ROW_ID_KEY]: '' }, // filled below; keeps the ID persisted in row values
            parentId: opts?.lineItem?.rowId,
            parentGroupId: opts?.lineItem?.groupId,
            autoGenerated: meta?.auto,
            effectContextId: meta?.effectContextId
          };
          newRow.values[ROW_ID_KEY] = newRow.id;
          const subgroupInfo = parseSubgroupKey(targetKey);
          let nextRows: LineItemRowState[] = [];
          let appended = true;
          if (wantsInsertUnderTrigger) {
            const baseIdx = rows.findIndex(r => r.id === sourceRowId);
            if (baseIdx >= 0) {
              // Insert after the triggering row, but preserve order if multiple rows are added under the same trigger:
              // append to the contiguous "children" block directly beneath the triggering row.
              let insertIdx = baseIdx + 1;
              while (
                insertIdx < rows.length &&
                (rows[insertIdx] as any)?.parentId === sourceRowId &&
                (rows[insertIdx] as any)?.parentGroupId === sourceGroupId
              ) {
                insertIdx += 1;
              }
              nextRows = [...rows.slice(0, insertIdx), newRow, ...rows.slice(insertIdx)];
              appended = false;
            }
          }
          if (!nextRows.length) {
            nextRows = [newRow, ...rows];
            appended = false;
          }
          let nextLineItems = { ...prev, [targetKey]: nextRows };
          // Important: do NOT auto-seed subgroup default rows for selection-effect-created rows.
          // Selection effects should only create what they explicitly preset; otherwise it produces "phantom" empty rows.
          const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
          setValuesIfChanged(nextValues);
          if (appended) {
            const anchor = `${targetKey}__${newRow.id}`;
            onRowAppended?.({
              anchor,
              targetKey,
              rowId: newRow.id,
              source: sourceGroupId && sourceRowId ? { groupId: sourceGroupId, rowId: sourceRowId } : undefined
            });
          }
          return recomputed;
        });
      },
      updateAutoLineItems: (
        groupId: string,
        presets: Array<Record<string, PresetValue>>,
        meta: {
          effectContextId: string;
          numericTargets: string[];
          keyFields?: string[];
          effectId?: string;
          hideRemoveButton?: boolean;
          preserveManualRows?: boolean;
        }
      ) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const keyFields = (meta.keyFields || []).map(k => k.toString());
          const preserveManualRows = meta.preserveManualRows !== false;
          const buildKey = (obj: Record<string, any>): string => {
            if (!keyFields.length) return '';
            return keyFields
              .map(fid => {
                const raw = obj ? (obj as any)[fid] : undefined;
                if (raw === undefined || raw === null) return '';
                if (Array.isArray(raw)) return (raw[0] ?? '').toString().trim();
                return raw.toString().trim();
              })
              .join('||');
          };

          const nextAutoKeys = new Set(keyFields.length ? presets.map(p => buildKey(p as any)).filter(Boolean) : []);

          let removedManualCount = 0;
          let removedUnmarkedCount = 0;
          const keepRows = rows.filter(r => {
            // Keep rows from other effect contexts.
            if (r.effectContextId && r.effectContextId !== meta.effectContextId) return true;

            const source = parseRowSource((r.values as any)?.[ROW_SOURCE_KEY]);
            const isExplicitAuto = source === 'auto' || r.autoGenerated === true;

            // When manual rows should be discarded, drop anything that's not explicitly "other effect context".
            // This treats legacy/unmarked rows as manual for safety.
            if (!preserveManualRows) {
              if (source === 'manual') {
                removedManualCount += 1;
              } else if (!isExplicitAuto) {
                removedUnmarkedCount += 1;
              }
              // Remove auto rows for this context as well; they'll be rebuilt from presets.
              return false;
            }

            // Preserve manual rows by default.
            if (source === 'manual') return true;

            // Drop explicit/known auto rows for this context.
            if (isExplicitAuto && r.effectContextId === meta.effectContextId) return false;

            // Legacy/unmarked: if it matches a new auto key, treat it as an old auto row and replace it.
            if (keyFields.length && r.effectContextId === meta.effectContextId) {
              const key = buildKey(r.values as any);
              if (key && nextAutoKeys.has(key)) return false;
            }
            return true;
          });

          // Rebuild auto rows for this context from scratch so recipe changes fully replace them
          const rowIdPrefix = resolveRowIdPrefix(targetKey);
          const rebuiltAuto: LineItemRowState[] = presets.map(preset => {
            const values: Record<string, FieldValue> = { ...preset };
            meta.numericTargets.forEach(fid => {
              if ((preset as any)[fid] !== undefined) {
                values[fid] = (preset as any)[fid] as FieldValue;
              }
            });
            values[ROW_SOURCE_KEY] = ROW_SOURCE_AUTO;
            const normalizedEffectId =
              meta.effectId === undefined || meta.effectId === null ? '' : meta.effectId.toString().trim();
            if (normalizedEffectId) values[ROW_SELECTION_EFFECT_ID_KEY] = normalizedEffectId;
            if (meta.hideRemoveButton === true) values[ROW_HIDE_REMOVE_KEY] = true;
            if (opts?.lineItem?.groupId && opts?.lineItem?.rowId) {
              values[ROW_PARENT_GROUP_ID_KEY] = opts.lineItem.groupId;
              values[ROW_PARENT_ROW_ID_KEY] = opts.lineItem.rowId;
            }
            return {
              id: `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`,
              values,
              parentId: opts?.lineItem?.rowId,
              parentGroupId: opts?.lineItem?.groupId,
              autoGenerated: true,
              effectContextId: meta.effectContextId
            };
          });

          const next: LineItemState = { ...prev, [targetKey]: [...keepRows, ...rebuiltAuto] };
          const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(next);
          setValuesIfChanged(nextValues);
          if (removedManualCount || removedUnmarkedCount) {
            logEventOnce(
              `selectionEffects.updateAutoLineItems.manualCleared::${targetKey}::${meta.effectContextId}`,
              'selectionEffects.updateAutoLineItems.manualCleared',
              {
                groupId,
                targetKey,
                removedManualCount,
                removedUnmarkedCount,
                effectContextId: meta.effectContextId
              }
            );
          }
          return recomputed;
        });
      },
      deleteLineItemRows: (
        groupId: string,
        meta?: { effectId?: string; parentGroupId?: string; parentRowId?: string }
      ) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const effectId = meta?.effectId !== undefined && meta?.effectId !== null ? meta.effectId.toString().trim() : '';
          const parentGroupId =
            meta?.parentGroupId !== undefined && meta?.parentGroupId !== null ? meta.parentGroupId.toString().trim() : opts?.lineItem?.groupId;
          const parentRowId =
            meta?.parentRowId !== undefined && meta?.parentRowId !== null ? meta.parentRowId.toString().trim() : opts?.lineItem?.rowId;

          const matchesTarget = (row: any): boolean => {
            const rowEffectId =
              (row?.values as any)?.[ROW_SELECTION_EFFECT_ID_KEY] !== undefined && (row?.values as any)?.[ROW_SELECTION_EFFECT_ID_KEY] !== null
                ? (row.values as any)[ROW_SELECTION_EFFECT_ID_KEY].toString().trim()
                : '';
            if (effectId && rowEffectId !== effectId) return false;
            const rowParentGroup =
              (row?.values as any)?.[ROW_PARENT_GROUP_ID_KEY] !== undefined && (row?.values as any)?.[ROW_PARENT_GROUP_ID_KEY] !== null
                ? (row.values as any)[ROW_PARENT_GROUP_ID_KEY].toString().trim()
                : (row as any)?.parentGroupId !== undefined && (row as any)?.parentGroupId !== null
                  ? (row as any).parentGroupId.toString().trim()
                  : '';
            const rowParentRow =
              (row?.values as any)?.[ROW_PARENT_ROW_ID_KEY] !== undefined && (row?.values as any)?.[ROW_PARENT_ROW_ID_KEY] !== null
                ? (row.values as any)[ROW_PARENT_ROW_ID_KEY].toString().trim()
                : (row as any)?.parentId !== undefined && (row as any)?.parentId !== null
                  ? (row as any).parentId.toString().trim()
                  : '';
            if (parentGroupId && parentRowId) {
              return rowParentGroup === parentGroupId && rowParentRow === parentRowId;
            }
            // No parent context: fallback to deleting by effect id only.
            return !!effectId && rowEffectId === effectId;
          };

          const roots = rows.filter(matchesTarget).map(r => ({ groupId: targetKey, rowId: r.id }));
          if (!roots.length) return prev;

          const cascade = cascadeRemoveLineItemRows({ lineItems: prev, roots });
          const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(cascade.lineItems);
          setValuesIfChanged(nextValues);
          logEventOnce(
            `selectionEffects.deleteLineItems::${targetKey}::${effectId || ''}::${parentGroupId || ''}::${parentRowId || ''}`,
            'selectionEffects.deleteLineItems',
            {
              groupId,
              targetKey,
              removedCount: cascade.removed.length,
              effectId: effectId || null,
              parentGroupId: parentGroupId || null,
              parentRowId: parentRowId || null
            }
          );
          return recomputed;
        });
      },
      setValue: ({ fieldId, value, lineItem }) => {
        const target = lineItem || opts?.lineItem;
        if (target?.groupId && target?.rowId) {
          setLineItems(prev => {
            const groupKey = target.groupId;
            const rows = prev[groupKey] || [];
            const idx = rows.findIndex(r => r.id === target.rowId);
            if (idx < 0) return prev;
            const baseRow = rows[idx];
            const nextRowValues = { ...(baseRow.values || {}), [fieldId]: value as FieldValue };
            const nextRows = [...rows];
            nextRows[idx] = { ...baseRow, values: nextRowValues };
            const nextLineItems = { ...prev, [groupKey]: nextRows };
            const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
            setValuesIfChanged(nextValues);
            return recomputed;
          });
          return;
        }
        setValues(prev => {
          const nextValues = { ...prev, [fieldId]: value as FieldValue };
          const { values: appliedValues, lineItems: recomputed } = applyValueMapsWithBlurDerivedForValues(
            nextValues,
            lineItems,
            [fieldId]
          );
          setLineItems(recomputed);
          return appliedValues;
        });
      },
      clearLineItems: (groupId: string, contextId?: string, meta?: { preserveManualRows?: boolean }) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const preserveManualRows = meta?.preserveManualRows !== false;
          const remaining =
            !preserveManualRows
              ? rows.filter(r => r.effectContextId && contextId && r.effectContextId !== contextId)
              : contextId
                ? rows.filter(r => !(r.autoGenerated && r.effectContextId === contextId))
                : rows.filter(r => !r.autoGenerated);
          const removedIds = new Set(rows.filter(r => !remaining.includes(r)).map(r => r.id));
          const next: LineItemState = { ...prev, [targetKey]: remaining };
          const subgroupInfo = parseSubgroupKey(targetKey);
          if (!subgroupInfo) {
            const prefixes = Array.from(removedIds).map(id => `${targetKey}::${id}::`);
            Object.keys(next).forEach(key => {
              if (!key.startsWith(`${targetKey}::`)) return;
              if (prefixes.some(prefix => key.startsWith(prefix))) {
                delete (next as any)[key];
              }
            });
          }
          const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(next);
          setValuesIfChanged(nextValues);
          return recomputed;
        });
        logEventOnce(`lineItems.cleared::${groupId}::${contextId || ''}`, 'lineItems.cleared', { groupId });
      }
    },
    opts
      ? {
          ...opts,
          lineItem: effectiveLineItem,
          contextId: resolvedContextId || opts.contextId,
          topValues: values,
          effectOverrides: effectOverrides as any
        }
      : { topValues: values, effectOverrides: effectOverrides as any }
  );
};
