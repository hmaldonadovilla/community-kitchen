import type { LineItemState } from '../../types';
import { cascadeRemoveLineItemRows } from '../../app/lineItems';

/**
 * Owner: guided step data-source exclusive output selection.
 * Removes matching auto-output rows and cascades child row removal.
 */
export const applyStepDataSourceExclusiveSelectionRemovalAction = (args: {
  lineItems: LineItemState;
  rootGroupId: string;
  outputGroupKey: string;
  outputGroupId: string;
  exclusiveSelectionKeyFieldId: string;
  sourceKey: string;
  sameRootScope: boolean;
}): LineItemState => {
  let nextState: LineItemState = args.lineItems;
  const deleteRoots: Array<{ groupId: string; rowId: string }> = [];
  const removeMatchingRows = (groupKey: string, matchValue: string): void => {
    const rows = nextState[groupKey] || [];
    const filtered = rows.filter(row => {
      const matches = `${(row.values as any)?.[args.exclusiveSelectionKeyFieldId] ?? ''}` === matchValue;
      if (matches) {
        deleteRoots.push({ groupId: groupKey, rowId: row.id });
      }
      return !matches;
    });
    if (filtered.length === rows.length) return;
    if (nextState === args.lineItems) nextState = { ...args.lineItems };
    nextState[groupKey] = filtered;
  };

  if (args.sameRootScope) {
    Object.keys(args.lineItems).forEach(groupKey => {
      if (!groupKey.startsWith(`${args.rootGroupId}::`) || !groupKey.endsWith(`::${args.outputGroupId}`)) return;
      removeMatchingRows(groupKey, args.sourceKey);
    });
  } else {
    removeMatchingRows(args.outputGroupKey, args.sourceKey);
  }

  if (!deleteRoots.length) return nextState;
  return cascadeRemoveLineItemRows({ lineItems: nextState, roots: deleteRoots }).lineItems;
};
