export const resolveGuidedStepIdOnStructureChange = (args: {
  guidedStepIds: string[];
  activeGuidedStepId?: string | null;
  maxReachableIndex?: number | null;
}): string | null => {
  const guidedStepIds = Array.isArray(args.guidedStepIds) ? args.guidedStepIds.filter(Boolean) : [];
  if (!guidedStepIds.length) return null;

  const activeGuidedStepId = `${args.activeGuidedStepId || ''}`.trim();
  const currentIdx = guidedStepIds.indexOf(activeGuidedStepId);
  if (currentIdx >= 0) return null;

  const rawMaxReachableIndex = Number(args.maxReachableIndex);
  const maxReachableIndex = Number.isFinite(rawMaxReachableIndex)
    ? Math.max(0, Math.min(guidedStepIds.length - 1, Math.floor(rawMaxReachableIndex)))
    : 0;

  return guidedStepIds[maxReachableIndex] || guidedStepIds[0] || null;
};
