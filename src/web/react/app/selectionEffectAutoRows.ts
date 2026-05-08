const normalizeMetaString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

export const mergeRebuiltAutoRowValues = <TValue>(args: {
  existingValues?: Record<string, TValue> | null;
  presetValues?: Record<string, TValue> | null;
}): Record<string, TValue> => ({
  ...((args.existingValues || {}) as Record<string, TValue>),
  ...((args.presetValues || {}) as Record<string, TValue>)
});

const lastContextSegment = (raw: unknown): string => {
  const normalized = normalizeMetaString(raw);
  if (!normalized) return '';
  const parts = normalized.split('::');
  return (parts[parts.length - 1] || '').trim();
};

export const resolveStableSelectionEffectContextId = (args: {
  nextContextId?: unknown;
  existingContextId?: unknown;
  effectId?: unknown;
  parentGroupId?: unknown;
  parentRowId?: unknown;
}): string => {
  const nextContextId = normalizeMetaString(args.nextContextId);
  const existingContextId = normalizeMetaString(args.existingContextId);
  const effectId = normalizeMetaString(args.effectId);
  const parentGroupId = normalizeMetaString(args.parentGroupId);
  const parentRowId = normalizeMetaString(args.parentRowId);

  if (!effectId || !existingContextId) return nextContextId;
  const nextEndsWithEffectId = lastContextSegment(nextContextId) === effectId;
  const existingEndsWithEffectId = lastContextSegment(existingContextId) === effectId;
  const existingBelongsToParent =
    !!parentGroupId &&
    !!parentRowId &&
    existingContextId.startsWith(`${parentGroupId}::${parentRowId}::`);

  if (!nextEndsWithEffectId && existingEndsWithEffectId && existingBelongsToParent) {
    return existingContextId;
  }
  return nextContextId;
};
