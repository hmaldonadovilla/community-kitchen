import { handleSelectionEffects } from '../../core';
import { FieldValue, LangCode, LineItemRowState, WebFormDefinition, WebQuestionDefinition } from '../../types';
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

export const runSelectionEffects = (args: {
  definition: WebFormDefinition;
  question: WebQuestionDefinition;
  value: FieldValue;
  language: LangCode;
  values: Record<string, FieldValue>;
  setValues: (next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)) => void;
  setLineItems: (next: LineItemState | ((prev: LineItemState) => LineItemState)) => void;
  logEvent?: (event: string, payload?: Record<string, unknown>) => void;
  onRowAppended?: (args: { anchor: string; targetKey: string; rowId: string; source?: { groupId: string; rowId: string } }) => void;
  opts?: SelectionEffectOpts;
}) => {
  const { definition, question, value, language, values, setValues, setLineItems, logEvent, onRowAppended, opts } = args;
  if (!question.selectionEffects || !question.selectionEffects.length) return;

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

  handleSelectionEffects(
    definition,
    question,
    value as any,
    language,
    {
      addLineItemRow: (
        groupId: string,
        preset?: Record<string, any>,
        meta?: { effectContextId?: string; auto?: boolean; effectId?: string; hideRemoveButton?: boolean }
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
          const newRow: LineItemRowState = {
            id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
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
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
            mode: 'change'
          });
          setValues(nextValues);
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
        presets: Array<Record<string, string | number>>,
        meta: { effectContextId: string; numericTargets: string[]; keyFields?: string[]; effectId?: string; hideRemoveButton?: boolean }
      ) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const keyFields = (meta.keyFields || []).map(k => k.toString());
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

          const keepRows = rows.filter(r => {
            // Keep rows from other effect contexts.
            if (r.effectContextId && r.effectContextId !== meta.effectContextId) return true;

            const source = parseRowSource((r.values as any)?.[ROW_SOURCE_KEY]);
            // Always keep explicit manual rows.
            if (source === 'manual') return true;

            // Drop explicit/known auto rows for this context.
            if ((source === 'auto' || r.autoGenerated) && r.effectContextId === meta.effectContextId) return false;

            // Legacy/unmarked: if it matches a new auto key, treat it as an old auto row and replace it.
            if (keyFields.length && r.effectContextId === meta.effectContextId) {
              const key = buildKey(r.values as any);
              if (key && nextAutoKeys.has(key)) return false;
            }
            return true;
          });

          // Rebuild auto rows for this context from scratch so recipe changes fully replace them
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
              id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
              values,
              parentId: opts?.lineItem?.rowId,
              parentGroupId: opts?.lineItem?.groupId,
              autoGenerated: true,
              effectContextId: meta.effectContextId
            };
          });

          const next: LineItemState = { ...prev, [targetKey]: [...keepRows, ...rebuiltAuto] };
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next, {
            mode: 'change'
          });
          setValues(nextValues);
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
                : '';
            const rowParentRow =
              (row?.values as any)?.[ROW_PARENT_ROW_ID_KEY] !== undefined && (row?.values as any)?.[ROW_PARENT_ROW_ID_KEY] !== null
                ? (row.values as any)[ROW_PARENT_ROW_ID_KEY].toString().trim()
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
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, cascade.lineItems, {
            mode: 'change'
          });
          setValues(nextValues);
          logEvent?.('selectionEffects.deleteLineItems', {
            groupId,
            targetKey,
            removedCount: cascade.removed.length,
            effectId: effectId || null,
            parentGroupId: parentGroupId || null,
            parentRowId: parentRowId || null
          });
          if (typeof console !== 'undefined') {
            console.info('[SelectionEffects] deleteLineItems removed rows', {
              groupId,
              targetKey,
              removedCount: cascade.removed.length,
              effectId: effectId || null,
              parentGroupId: parentGroupId || null,
              parentRowId: parentRowId || null
            });
          }
          return recomputed;
        });
      },
      clearLineItems: (groupId: string, contextId?: string) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const remaining = contextId
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
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next, {
            mode: 'change'
          });
          setValues(nextValues);
          return recomputed;
        });
        logEvent?.('lineItems.cleared', { groupId });
      }
    },
    opts ? { ...opts, topValues: values } : { topValues: values }
  );
};


