export type RemovedLineItemRowRef = {
  groupId?: string | null;
  rowId?: string | null;
};

const buildRemovedRowsByGroup = (removedRows: RemovedLineItemRowRef[]): Map<string, Set<string>> => {
  const byGroup = new Map<string, Set<string>>();
  removedRows.forEach(entry => {
    const groupId = (entry.groupId || '').toString();
    const rowId = (entry.rowId || '').toString();
    if (!groupId || !rowId) return;
    const rowIds = byGroup.get(groupId) || new Set<string>();
    rowIds.add(rowId);
    byGroup.set(groupId, rowIds);
  });
  return byGroup;
};

const isRemovedRowErrorKey = (key: string, removedRowsByGroup: Map<string, Set<string>>): boolean => {
  const parts = key.split('__');
  if (parts.length !== 3) return false;
  const groupId = parts[0] || '';
  const rowId = parts[2] || '';
  if (!groupId || !rowId) return false;
  return removedRowsByGroup.get(groupId)?.has(rowId) === true;
};

const isRemovedGroupErrorKey = (key: string, removedGroupKeys: string[]): boolean =>
  removedGroupKeys.some(groupKey => key === groupKey || key.startsWith(`${groupKey}__`) || key.startsWith(`${groupKey}::`));

export const clearErrorsForRemovedLineItemRows = (args: {
  errors: Record<string, string>;
  removedRows?: RemovedLineItemRowRef[];
  removedGroupKeys?: string[];
}): Record<string, string> => {
  const removedRowsByGroup = buildRemovedRowsByGroup(args.removedRows || []);
  const removedGroupKeys = (args.removedGroupKeys || []).map(key => (key || '').toString()).filter(Boolean);
  if (!removedRowsByGroup.size && !removedGroupKeys.length) return args.errors;

  let changed = false;
  const next: Record<string, string> = {};
  Object.entries(args.errors || {}).forEach(([key, value]) => {
    if (isRemovedRowErrorKey(key, removedRowsByGroup) || isRemovedGroupErrorKey(key, removedGroupKeys)) {
      changed = true;
      return;
    }
    next[key] = value;
  });
  return changed ? next : args.errors;
};
