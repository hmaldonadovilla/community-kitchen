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
import { isLineItemContextSnapshotCurrent } from './lineItemContextSnapshot';
import { buildSelectionEffectLineItemUpsert } from './selectionEffectLineItemUpsert';

type SelectionEffectOpts = {
  lineItem?: { groupId: string; rowId: string; rowValues: any };
  contextId?: string;
  forceContextReset?: boolean;
  preferLookupSourceValue?: boolean;
  effectTrail?: string[];
  topValues?: Record<string, FieldValue>;
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
  onLineItemsMutated?: (args: {
    sourceGroupKey: string;
    prevLineItems: LineItemState;
    nextLineItems: LineItemState;
    nextValues: Record<string, FieldValue>;
  }) => void;
  logEvent?: (event: string, payload?: Record<string, unknown>) => void;
  onRowAppended?: (args: { anchor: string; targetKey: string; rowId: string; source?: { groupId: string; rowId: string } }) => void;
  onAsyncEffectStart?: (meta: Record<string, unknown>) => (() => void) | void;
  opts?: SelectionEffectOpts;
  effectOverrides?: Record<string, Record<string, FieldValue>>;
}) => {
  const {
    definition,
    question,
    value,
    language,
    values,
    lineItems,
    setValues,
    setLineItems,
    onLineItemsMutated,
    logEvent,
    onRowAppended,
    onAsyncEffectStart,
    opts,
    effectOverrides
  } = args;
  if (!question.selectionEffects || !question.selectionEffects.length) return;
  let latestValuesSnapshot: Record<string, FieldValue> = values;
  let latestLineItemsSnapshot: LineItemState = lineItems;
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
      const parentCfg = resolveGroupConfigForKey(parsed.parentGroupKey).group;
      const siblingMatch = parentCfg?.subGroups?.find((sub: any) => {
        const key = resolveSubgroupKey(sub as any);
        return key === targetId;
      });
      if (siblingMatch) {
        const key = resolveSubgroupKey(siblingMatch as any) || targetId;
        return buildSubgroupKey(parsed.parentGroupKey, parsed.parentRowId, key);
      }
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

  const buildEffectTrailToken = (params: {
    fieldId: string;
    value: FieldValue;
    groupId?: string;
    rowId?: string;
  }): string => {
    const groupId = (params.groupId || '').toString().trim() || '__top__';
    const rowId = (params.rowId || '').toString().trim() || '__record__';
    const fieldId = (params.fieldId || '').toString().trim();
    let valueKey = '';
    try {
      valueKey = JSON.stringify(params.value ?? null);
    } catch (_) {
      valueKey = `${params.value ?? ''}`;
    }
    return `${groupId}::${rowId}::${fieldId}::${valueKey}`;
  };

  const resolveQuestionForField = (fieldId: string, groupKey?: string): WebQuestionDefinition | undefined => {
    const normalizedFieldId = (fieldId || '').toString().trim();
    if (!normalizedFieldId) return undefined;
    if (!groupKey) {
      return definition.questions.find(q => q.id === normalizedFieldId);
    }
    const resolvedGroup = resolveGroupConfigForKey(groupKey).group as any;
    if (!resolvedGroup || !Array.isArray(resolvedGroup.fields)) return undefined;
    return resolvedGroup.fields.find((field: any) => field?.id === normalizedFieldId) as WebQuestionDefinition | undefined;
  };

  const scheduleChainedSelectionEffects = (params: {
    fieldId: string;
    value: FieldValue;
    groupId?: string;
    rowId?: string;
    nextValues: Record<string, FieldValue>;
    nextLineItems: LineItemState;
  }) => {
    const questionForField = resolveQuestionForField(params.fieldId, params.groupId);
    if (!questionForField?.selectionEffects?.length) return;
    const token = buildEffectTrailToken({
      fieldId: params.fieldId,
      value: params.value,
      groupId: params.groupId,
      rowId: params.rowId
    });
    const existingTrail = opts?.effectTrail || [];
    if (existingTrail.includes(token)) return;
    globalThis.setTimeout(() => {
      const nextRowValues =
        params.groupId && params.rowId
          ? (((params.nextLineItems[params.groupId] || []).find(row => row.id === params.rowId)?.values || {}) as Record<string, FieldValue>)
          : undefined;
      runSelectionEffects({
        definition,
        question: questionForField,
        value:
          params.groupId && params.rowId
            ? (nextRowValues?.[params.fieldId] as FieldValue)
            : (params.nextValues[params.fieldId] as FieldValue),
        language,
        values: params.nextValues,
        lineItems: params.nextLineItems,
        setValues,
        setLineItems,
        onLineItemsMutated,
        logEvent,
        onRowAppended,
        effectOverrides,
        opts: {
          lineItem:
            params.groupId && params.rowId
              ? { groupId: params.groupId, rowId: params.rowId, rowValues: nextRowValues || {} }
              : undefined,
          forceContextReset: true,
          effectTrail: [...existingTrail, token]
        }
      });
    }, 0);
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
      const parentRows = latestLineItemsSnapshot[currentInfo.parentGroupKey] || [];
      const parentRow = parentRows.find(r => r.id === currentInfo.parentRowId);
      mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
      currentKey = currentInfo.parentGroupKey;
      info = parseSubgroupKey(currentKey);
    }
    return { ...lineItem, rowValues: merged };
  })();
  const sourceLineItemContext = effectiveLineItem || opts?.lineItem;
  const shouldApplyLineItemContextMutation = (
    currentLineItems: LineItemState,
    contextGuardFieldIds?: string[]
  ): boolean => {
    if (!sourceLineItemContext?.groupId || !sourceLineItemContext?.rowId) return true;
    if (!contextGuardFieldIds?.length) return true;
    const isCurrent = isLineItemContextSnapshotCurrent({
      lineItems: currentLineItems,
      groupKey: sourceLineItemContext.groupId,
      rowId: sourceLineItemContext.rowId,
      snapshotValues: (sourceLineItemContext.rowValues || {}) as Record<string, FieldValue>,
      fieldIds: contextGuardFieldIds
    });
    if (!isCurrent) {
      logEventOnce(
        `selectionEffects.staleContext.skip::${sourceLineItemContext.groupId}::${sourceLineItemContext.rowId}`,
        'selectionEffects.staleContext.skip',
        {
          groupId: sourceLineItemContext.groupId,
          rowId: sourceLineItemContext.rowId,
          fieldIds: contextGuardFieldIds
        }
      );
    }
    return isCurrent;
  };

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
          contextGuardFieldIds?: string[];
        }
      ) => {
        setLineItems(prev => {
          if (!shouldApplyLineItemContextMutation(prev, meta?.contextGuardFieldIds)) return prev;
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
            } catch {
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
              const upsert = buildSelectionEffectLineItemUpsert({
                rows,
                existingIdxs,
                keepIdx,
                presetValues,
                parentRowId: opts?.lineItem?.rowId,
                parentGroupId: opts?.lineItem?.groupId,
                autoGenerated: meta?.auto,
                effectContextId: meta?.effectContextId
              });
              if (!upsert.changed) return prev;
              const nextRows = upsert.nextRows;
              const nextLineItems = { ...prev, [targetKey]: nextRows };
              const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
              latestLineItemsSnapshot = recomputed;
              setValuesIfChanged(nextValues);
              onLineItemsMutated?.({
                sourceGroupKey: targetKey,
                prevLineItems: prev,
                nextLineItems: recomputed,
                nextValues
              });
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
          latestLineItemsSnapshot = recomputed;
          setValuesIfChanged(nextValues);
          onLineItemsMutated?.({
            sourceGroupKey: targetKey,
            prevLineItems: prev,
            nextLineItems: recomputed,
            nextValues
          });
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
          replaceAllAutoRows?: boolean;
          contextGuardFieldIds?: string[];
        }
      ) => {
        setLineItems(prev => {
          if (!shouldApplyLineItemContextMutation(prev, meta.contextGuardFieldIds)) return prev;
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const keyFields = (meta.keyFields || []).map(k => k.toString());
          const preserveManualRows = meta.preserveManualRows !== false;
          const replaceAllAutoRows = meta.replaceAllAutoRows === true;
          const normalizedEffectId =
            meta.effectId === undefined || meta.effectId === null ? '' : meta.effectId.toString().trim();
          const normalizeMetaString = (raw: any): string => {
            if (raw === undefined || raw === null) return '';
            try {
              return raw.toString().trim();
            } catch {
              return '';
            }
          };
          const requestedParentGroupId = normalizeMetaString(opts?.lineItem?.groupId);
          const requestedParentRowId = normalizeMetaString(opts?.lineItem?.rowId);
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
          const matchesEffectParent = (row: LineItemRowState): boolean => {
            if (!normalizedEffectId) return false;
            const rowValues = (row?.values || {}) as Record<string, any>;
            const rowEffectId = normalizeMetaString(rowValues[ROW_SELECTION_EFFECT_ID_KEY]);
            if (rowEffectId !== normalizedEffectId) return false;
            if (!requestedParentGroupId || !requestedParentRowId) return true;
            const rowParentGroup = normalizeMetaString(rowValues[ROW_PARENT_GROUP_ID_KEY] ?? (row as any)?.parentGroupId);
            const rowParentRow = normalizeMetaString(rowValues[ROW_PARENT_ROW_ID_KEY] ?? (row as any)?.parentId);
            return rowParentGroup === requestedParentGroupId && rowParentRow === requestedParentRowId;
          };
          const isOwnedAutoRow = (row: LineItemRowState): boolean =>
            row.effectContextId === meta.effectContextId || matchesEffectParent(row);

          const nextAutoKeys = new Set(keyFields.length ? presets.map(p => buildKey(p as any)).filter(Boolean) : []);
          const reusableAutoRowsByKey = new Map<string, LineItemRowState[]>();
          const reusableAutoRowsByIndex: LineItemRowState[] = [];

          rows.forEach(row => {
            const source = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
            const isExplicitAuto = source === 'auto' || row.autoGenerated === true;
            if (!isExplicitAuto) return;
            if (!isOwnedAutoRow(row)) return;
            const key = buildKey((row.values || {}) as Record<string, any>);
            if (key) {
              const bucket = reusableAutoRowsByKey.get(key) || [];
              bucket.push(row);
              reusableAutoRowsByKey.set(key, bucket);
              return;
            }
            reusableAutoRowsByIndex.push(row);
          });

          let removedManualCount = 0;
          let removedUnmarkedCount = 0;
          let removedAutoOtherContextCount = 0;
          const keepRows = rows.filter(r => {
            const source = parseRowSource((r.values as any)?.[ROW_SOURCE_KEY]);
            const isExplicitAuto = source === 'auto' || r.autoGenerated === true;

            if (replaceAllAutoRows && isExplicitAuto) {
              if (r.effectContextId && r.effectContextId !== meta.effectContextId) {
                removedAutoOtherContextCount += 1;
              }
              return false;
            }

            // Keep rows from other effect contexts unless the caller explicitly owns the full auto set.
            if (r.effectContextId && r.effectContextId !== meta.effectContextId && !matchesEffectParent(r)) return true;

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
            if (isExplicitAuto && isOwnedAutoRow(r)) return false;

            // Legacy/unmarked: if it matches a new auto key, treat it as an old auto row and replace it.
            if (keyFields.length && isOwnedAutoRow(r)) {
              const key = buildKey(r.values as any);
              if (key && nextAutoKeys.has(key)) return false;
            }
            return true;
          });

          // Rebuild auto rows for this context from scratch so recipe changes fully replace them
          const rowIdPrefix = resolveRowIdPrefix(targetKey);
          let reusableIndex = 0;
          const rebuiltAuto: LineItemRowState[] = presets.map(preset => {
            const presetKey = buildKey(preset as any);
            const reusableRow = presetKey
              ? (reusableAutoRowsByKey.get(presetKey) || []).shift()
              : reusableAutoRowsByIndex[reusableIndex++];
            const rowId = reusableRow?.id || `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`;
            const values: Record<string, FieldValue> = { ...preset };
            meta.numericTargets.forEach(fid => {
              if ((preset as any)[fid] !== undefined) {
                values[fid] = (preset as any)[fid] as FieldValue;
              }
            });
            values[ROW_ID_KEY] = rowId;
            values[ROW_SOURCE_KEY] = ROW_SOURCE_AUTO;
            if (normalizedEffectId) values[ROW_SELECTION_EFFECT_ID_KEY] = normalizedEffectId;
            if (meta.hideRemoveButton === true) values[ROW_HIDE_REMOVE_KEY] = true;
            if (opts?.lineItem?.groupId && opts?.lineItem?.rowId) {
              values[ROW_PARENT_GROUP_ID_KEY] = opts.lineItem.groupId;
              values[ROW_PARENT_ROW_ID_KEY] = opts.lineItem.rowId;
            }
            return {
              id: rowId,
              values,
              parentId: opts?.lineItem?.rowId,
              parentGroupId: opts?.lineItem?.groupId,
              autoGenerated: true,
              effectContextId: meta.effectContextId
            };
          });

          const next: LineItemState = { ...prev, [targetKey]: [...keepRows, ...rebuiltAuto] };
          const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(next);
          latestLineItemsSnapshot = recomputed;
          setValuesIfChanged(nextValues);
          onLineItemsMutated?.({
            sourceGroupKey: targetKey,
            prevLineItems: prev,
            nextLineItems: recomputed,
            nextValues
          });
          if (removedManualCount || removedUnmarkedCount || removedAutoOtherContextCount) {
            logEventOnce(
              `selectionEffects.updateAutoLineItems.manualCleared::${targetKey}::${meta.effectContextId}`,
              'selectionEffects.updateAutoLineItems.manualCleared',
              {
                groupId,
                targetKey,
                removedManualCount,
                removedUnmarkedCount,
                removedAutoOtherContextCount,
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
          latestLineItemsSnapshot = recomputed;
          setValuesIfChanged(nextValues);
          onLineItemsMutated?.({
            sourceGroupKey: targetKey,
            prevLineItems: prev,
            nextLineItems: recomputed,
            nextValues
          });
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
      setValue: ({ fieldId, value, lineItem, skipSelectionEffects, contextGuardFieldIds }) => {
        const target = lineItem || opts?.lineItem;
        if (target?.groupId && target?.rowId) {
          setLineItems(prev => {
            if (!shouldApplyLineItemContextMutation(prev, contextGuardFieldIds)) return prev;
            const groupKey = target.groupId;
            const rows = prev[groupKey] || [];
            const idx = rows.findIndex(r => r.id === target.rowId);
            if (idx < 0) return prev;
            const baseRow = rows[idx];
            if (areFieldValuesEqual((baseRow.values || {})[fieldId], value as FieldValue)) return prev;
            const nextRowValues = { ...(baseRow.values || {}), [fieldId]: value as FieldValue };
            const nextRows = [...rows];
            nextRows[idx] = { ...baseRow, values: nextRowValues };
            const nextLineItems = { ...prev, [groupKey]: nextRows };
            const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
            latestLineItemsSnapshot = recomputed;
            setValuesIfChanged(nextValues);
            onLineItemsMutated?.({
              sourceGroupKey: groupKey,
              prevLineItems: prev,
              nextLineItems: recomputed,
              nextValues
            });
            if (!skipSelectionEffects) {
              scheduleChainedSelectionEffects({
                fieldId,
                value: value as FieldValue,
                groupId: groupKey,
                rowId: target.rowId,
                nextValues,
                nextLineItems: recomputed
              });
            }
            return recomputed;
          });
          return;
        }
        setValues(prev => {
          if (areFieldValuesEqual(prev[fieldId], value as FieldValue)) return prev;
          const nextValues = { ...prev, [fieldId]: value as FieldValue };
          const { values: appliedValues, lineItems: recomputed } = applyValueMapsWithBlurDerivedForValues(
            nextValues,
            latestLineItemsSnapshot,
            [fieldId]
          );
          latestLineItemsSnapshot = recomputed;
          setLineItems(recomputed);
          if (!skipSelectionEffects) {
            scheduleChainedSelectionEffects({
              fieldId,
              value: value as FieldValue,
              nextValues: appliedValues,
              nextLineItems: recomputed
            });
          }
          return appliedValues;
        });
      },
      beginAsyncEffect: onAsyncEffectStart,
      setValues: ({ values: fieldValues, lineItem, skipSelectionEffects, contextGuardFieldIds }) => {
        const target = lineItem || opts?.lineItem;
        if (target?.groupId && target?.rowId) {
          setLineItems(prev => {
            if (!shouldApplyLineItemContextMutation(prev, contextGuardFieldIds)) return prev;
            const groupKey = target.groupId;
            const rows = prev[groupKey] || [];
            const idx = rows.findIndex(r => r.id === target.rowId);
            if (idx < 0) return prev;
            const baseRow = rows[idx];
            const changedEntries = Object.entries(fieldValues || {}).filter(
              ([fieldId, nextValue]) => !areFieldValuesEqual((baseRow.values || {})[fieldId], nextValue as FieldValue)
            );
            if (!changedEntries.length) return prev;
            const nextRowValues = { ...(baseRow.values || {}) };
            changedEntries.forEach(([fieldId, nextValue]) => {
              nextRowValues[fieldId] = nextValue as FieldValue;
            });
            const nextRows = [...rows];
            nextRows[idx] = { ...baseRow, values: nextRowValues };
            const nextLineItems = { ...prev, [groupKey]: nextRows };
            const { values: nextValues, lineItems: recomputed } = applyValueMapsWithBlurDerived(nextLineItems);
            latestLineItemsSnapshot = recomputed;
            setValuesIfChanged(nextValues);
            onLineItemsMutated?.({
              sourceGroupKey: groupKey,
              prevLineItems: prev,
              nextLineItems: recomputed,
              nextValues
            });
            if (!skipSelectionEffects) {
              changedEntries.forEach(([fieldId, nextValue]) => {
                scheduleChainedSelectionEffects({
                  fieldId,
                  value: nextValue as FieldValue,
                  groupId: groupKey,
                  rowId: target.rowId,
                  nextValues,
                  nextLineItems: recomputed
                });
              });
            }
            return recomputed;
          });
          return;
        }
        setValues(prev => {
          const changedEntries = Object.entries(fieldValues || {}).filter(
            ([fieldId, nextValue]) => !areFieldValuesEqual(prev[fieldId], nextValue as FieldValue)
          );
          if (!changedEntries.length) return prev;
          const nextRawValues = { ...prev };
          changedEntries.forEach(([fieldId, nextValue]) => {
            nextRawValues[fieldId] = nextValue as FieldValue;
          });
          const lockedTopFields = changedEntries.map(([fieldId]) => fieldId);
          const { values: appliedValues, lineItems: recomputed } = applyValueMapsWithBlurDerivedForValues(
            nextRawValues,
            latestLineItemsSnapshot,
            lockedTopFields
          );
          latestLineItemsSnapshot = recomputed;
          setLineItems(recomputed);
          if (!skipSelectionEffects) {
            changedEntries.forEach(([fieldId, nextValue]) => {
              scheduleChainedSelectionEffects({
                fieldId,
                value: nextValue as FieldValue,
                nextValues: appliedValues,
                nextLineItems: recomputed
              });
            });
          }
          return appliedValues;
        });
      },
      clearLineItems: (
        groupId: string,
        contextId?: string,
        meta?: {
          preserveManualRows?: boolean;
          preserveAutoRows?: boolean;
          effectId?: string;
          parentGroupId?: string;
          parentRowId?: string;
          contextGuardFieldIds?: string[];
        }
      ) => {
        setLineItems(prev => {
          if (!shouldApplyLineItemContextMutation(prev, meta?.contextGuardFieldIds)) return prev;
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const preserveManualRows = meta?.preserveManualRows !== false;
          const normalizeMetaString = (raw: any): string => {
            if (raw === undefined || raw === null) return '';
            try {
              return raw.toString().trim();
            } catch {
              return '';
            }
          };
          const effectId = normalizeMetaString(meta?.effectId);
          const requestedContextId = normalizeMetaString(contextId);
          const parentGroupId = normalizeMetaString(meta?.parentGroupId) || normalizeMetaString(opts?.lineItem?.groupId);
          const parentRowId = normalizeMetaString(meta?.parentRowId) || normalizeMetaString(opts?.lineItem?.rowId);
          const legacyRootContextId =
            effectId && requestedContextId.endsWith(`::${effectId}`)
              ? requestedContextId.slice(0, -(effectId.length + 2))
              : '';
          const legacyFieldContextId =
            parentGroupId && parentRowId ? buildLineContextId(parentGroupId, parentRowId, question.id) : '';
          const matchesEffectParent = (row: LineItemRowState): boolean => {
            if (!effectId) return false;
            const rowValues = (row?.values || {}) as Record<string, any>;
            const rowEffectId = normalizeMetaString(rowValues[ROW_SELECTION_EFFECT_ID_KEY]);
            if (rowEffectId !== effectId) return false;
            if (!parentGroupId || !parentRowId) return true;
            const rowParentGroup = normalizeMetaString(rowValues[ROW_PARENT_GROUP_ID_KEY] ?? (row as any)?.parentGroupId);
            const rowParentRow = normalizeMetaString(rowValues[ROW_PARENT_ROW_ID_KEY] ?? (row as any)?.parentId);
            return rowParentGroup === parentGroupId && rowParentRow === parentRowId;
          };
          const matchesCurrentContext = (row: LineItemRowState): boolean =>
            !!requestedContextId && normalizeMetaString(row.effectContextId) === requestedContextId;
          const matchesLegacyBaseContext = (row: LineItemRowState): boolean =>
            (!!legacyRootContextId && normalizeMetaString(row.effectContextId) === legacyRootContextId) ||
            (!!legacyFieldContextId && normalizeMetaString(row.effectContextId) === legacyFieldContextId);
          const isOwnedByClear = (row: LineItemRowState): boolean =>
            matchesCurrentContext(row) || matchesLegacyBaseContext(row) || matchesEffectParent(row);
          const isReusableAutoRow = (row: LineItemRowState): boolean => matchesCurrentContext(row) || matchesEffectParent(row);
          const remaining =
            !preserveManualRows
              ? rows.filter(r => {
                  const source = parseRowSource((r.values as any)?.[ROW_SOURCE_KEY]);
                  const isExplicitAuto = source === 'auto' || r.autoGenerated === true;
                  if (meta?.preserveAutoRows === true && isExplicitAuto && isReusableAutoRow(r)) return true;
                  if (r.effectContextId && contextId && !isOwnedByClear(r)) return true;
                  const rowEffectId = normalizeMetaString(((r.values || {}) as Record<string, any>)[ROW_SELECTION_EFFECT_ID_KEY]);
                  if (effectId && rowEffectId && rowEffectId !== effectId) return true;
                  if (effectId && rowEffectId === effectId && parentGroupId && parentRowId && !matchesEffectParent(r)) return true;
                  return false;
                })
              : contextId
                ? rows.filter(r => {
                    const source = parseRowSource((r.values as any)?.[ROW_SOURCE_KEY]);
                    const isExplicitAuto = source === 'auto' || r.autoGenerated === true;
                    return !(isExplicitAuto && isOwnedByClear(r));
                  })
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
          latestLineItemsSnapshot = recomputed;
          setValuesIfChanged(nextValues);
          onLineItemsMutated?.({
            sourceGroupKey: targetKey,
            prevLineItems: prev,
            nextLineItems: recomputed,
            nextValues
          });
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
        topValues: opts.topValues || values,
        effectOverrides: effectOverrides as any
      }
      : { topValues: values, effectOverrides: effectOverrides as any }
  );
};
