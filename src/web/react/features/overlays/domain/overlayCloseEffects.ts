import type { FieldValue, VisibilityContext } from '../../../../types';
import type { WebFormDefinition } from '../../../../../types';
import type { LineItemState } from '../../../types';
import type { RowFlowActionEffect } from '../../../../../types';
import { matchesWhenClause } from '../../../../rules/visibility';
import { buildSubgroupKey, cascadeRemoveLineItemRows } from '../../../app/lineItems';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import { markRecipeIngredientsDirtyForGroupKey } from '../../../app/recipeIngredientsDirty';

export type OverlayCloseDeletePlan = Array<{ groupKey: string; rowIds: string[] }>;
export type OverlayCloseDeleteState = {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  removedSubgroupKeys: string[];
  removed: Array<{ groupId: string; rowId: string }>;
  dirtyGroups: Array<{ groupId: string; parentGroupKey?: string; parentRowId?: string }>;
};

const normalizeId = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

const resolveTargetGroupKey = (args: { overlayGroupId: string; overlayRowId?: string; targetGroupId?: string }): string => {
  const overlayGroupId = normalizeId(args.overlayGroupId);
  const targetGroupId = normalizeId(args.targetGroupId) || overlayGroupId;
  if (!targetGroupId) return '';
  if (targetGroupId.includes('::') || targetGroupId.includes('.')) return targetGroupId;
  if (targetGroupId === overlayGroupId) return overlayGroupId;
  const rowId = normalizeId(args.overlayRowId);
  if (!rowId) return targetGroupId;
  return buildSubgroupKey(overlayGroupId, rowId, targetGroupId);
};

export const resolveOverlayCloseDeletePlan = (args: {
  effects: RowFlowActionEffect[];
  overlayGroupId: string;
  overlayRowId?: string;
  topValues: Record<string, FieldValue>;
  lineItems: LineItemState;
}): OverlayCloseDeletePlan => {
  const overlayGroupId = normalizeId(args.overlayGroupId);
  if (!overlayGroupId) return [];
  const effects = Array.isArray(args.effects) ? args.effects : [];
  if (!effects.length) return [];

  const parentRowId = normalizeId(args.overlayRowId);
  const parentRows = args.lineItems[overlayGroupId] || [];
  const parentRow = parentRowId ? parentRows.find(r => normalizeId((r as any)?.id) === parentRowId) : undefined;
  const parentValues = ((parentRow as any)?.values || {}) as Record<string, FieldValue>;

  const plan: OverlayCloseDeletePlan = [];
  const seen = new Set<string>();

  effects.forEach(effect => {
    if (!effect || typeof effect !== 'object') return;
    if ((effect as any).type !== 'deleteLineItems') return;
    const targetGroupKey = resolveTargetGroupKey({
      overlayGroupId,
      overlayRowId: parentRowId,
      targetGroupId: (effect as any).groupId
    });
    if (!targetGroupKey) return;

    const rows = args.lineItems[targetGroupKey] || [];
    if (!rows.length) return;

    const includeWhen = (effect as any)?.rowFilter?.includeWhen;
    const excludeWhen = (effect as any)?.rowFilter?.excludeWhen;
    const ctxBase: Pick<VisibilityContext, 'getLineItems' | 'getLineItemKeys'> = {
      getLineItems: groupId => args.lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(args.lineItems || {})
    };

    const rowIds = rows
      .filter(row => {
        if (!includeWhen && !excludeWhen) return true;
        const rowValues = (((row as any)?.values || {}) as Record<string, FieldValue>) || {};
        const rowCtx: VisibilityContext = {
          ...ctxBase,
          getValue: fieldId => {
            if (Object.prototype.hasOwnProperty.call(rowValues, fieldId)) return (rowValues as any)[fieldId];
            if (Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return (parentValues as any)[fieldId];
            if (Object.prototype.hasOwnProperty.call(args.topValues, fieldId)) return (args.topValues as any)[fieldId];
            return undefined;
          },
          getLineValue: (_rowId: string, fieldId: string) => {
            if (Object.prototype.hasOwnProperty.call(rowValues, fieldId)) return (rowValues as any)[fieldId];
            if (Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return (parentValues as any)[fieldId];
            if (Object.prototype.hasOwnProperty.call(args.topValues, fieldId)) return (args.topValues as any)[fieldId];
            return undefined;
          }
        };
        const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx, { rowId: (row as any)?.id, linePrefix: targetGroupKey }) : true;
        const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx, { rowId: (row as any)?.id, linePrefix: targetGroupKey }) : false;
        return includeOk && !excludeMatch;
      })
      .map(row => normalizeId((row as any)?.id))
      .filter(Boolean);

    const uniq = rowIds.filter(id => {
      const key = `${targetGroupKey}::${id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (uniq.length) {
      plan.push({ groupKey: targetGroupKey, rowIds: uniq });
    }
  });

  return plan;
};

export const resolveOverlayCloseDeleteScope = (args: {
  overlayGroupId: string;
  overlayRowId?: string;
  detailSelectionGroupId?: string;
  detailSelectionRowId?: string;
}): { overlayGroupId: string; overlayRowId?: string } => {
  const overlayGroupId = normalizeId(args.overlayGroupId);
  const overlayRowId = normalizeId(args.overlayRowId);
  const detailSelectionGroupId = normalizeId(args.detailSelectionGroupId);
  const detailSelectionRowId = normalizeId(args.detailSelectionRowId);
  const detailWithinOverlay =
    !!overlayGroupId &&
    !!detailSelectionGroupId &&
    !!detailSelectionRowId &&
    (detailSelectionGroupId === overlayGroupId || detailSelectionGroupId.startsWith(`${overlayGroupId}::`));
  if (detailWithinOverlay) {
    return { overlayGroupId: detailSelectionGroupId, overlayRowId: detailSelectionRowId };
  }
  return { overlayGroupId, overlayRowId: overlayRowId || undefined };
};

export const applyOverlayCloseDeletePlan = (args: {
  definition: WebFormDefinition;
  deletePlan: OverlayCloseDeletePlan;
  topValues: Record<string, FieldValue>;
  lineItems: LineItemState;
}): OverlayCloseDeleteState => {
  const roots = (Array.isArray(args.deletePlan) ? args.deletePlan : [])
    .flatMap(entry =>
      ((entry?.rowIds || []) as string[])
        .map(rowId => ({ groupId: normalizeId(entry?.groupKey), rowId: normalizeId(rowId) }))
        .filter(root => root.groupId && root.rowId)
    );
  if (!roots.length) {
    return {
      values: { ...(args.topValues || {}) },
      lineItems: { ...(args.lineItems || {}) },
      removedSubgroupKeys: [],
      removed: [],
      dirtyGroups: []
    };
  }

  const cascade = cascadeRemoveLineItemRows({ lineItems: args.lineItems || {}, roots });
  let nextLineItems = cascade.lineItems;
  const dirtyGroups: Array<{ groupId: string; parentGroupKey?: string; parentRowId?: string }> = [];
  const dirtyGroupIds = Array.from(new Set(roots.map(root => root.groupId))).filter(Boolean);
  dirtyGroupIds.forEach(groupId => {
    const marked = markRecipeIngredientsDirtyForGroupKey(nextLineItems, groupId);
    nextLineItems = marked.lineItems;
    if (marked.changed) {
      dirtyGroups.push({
        groupId,
        parentGroupKey: marked.parentGroupKey,
        parentRowId: marked.parentRowId
      });
    }
  });

  const recomputed = applyValueMapsToForm(args.definition, args.topValues || {}, nextLineItems, { mode: 'init' });
  return {
    values: recomputed.values,
    lineItems: recomputed.lineItems,
    removedSubgroupKeys: cascade.removedSubgroupKeys,
    removed: cascade.removed,
    dirtyGroups
  };
};
