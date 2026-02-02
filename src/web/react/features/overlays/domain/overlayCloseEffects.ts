import type { FieldValue, VisibilityContext } from '../../../../types';
import type { LineItemState } from '../../../types';
import type { RowFlowActionEffect } from '../../../../../types';
import { matchesWhenClause } from '../../../../rules/visibility';
import { buildSubgroupKey } from '../../../app/lineItems';

export type OverlayCloseDeletePlan = Array<{ groupKey: string; rowIds: string[] }>;

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

