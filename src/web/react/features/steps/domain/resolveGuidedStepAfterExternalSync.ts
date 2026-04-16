import { GuidedStepStatus } from './computeStepStatus';

export const resolveGuidedStepIdAfterExternalSync = (args: {
  guidedStepIds: string[];
  steps: GuidedStepStatus[];
  maxReachableIndex: number;
  currentStepId?: string | null;
}): string | null => {
  const guidedStepIds = Array.isArray(args.guidedStepIds) ? args.guidedStepIds.filter(Boolean) : [];
  if (!guidedStepIds.length) return null;

  const rawMaxReachableIndex = Number(args.maxReachableIndex);
  const maxReachableIndex = Number.isFinite(rawMaxReachableIndex)
    ? Math.max(0, Math.min(guidedStepIds.length - 1, Math.floor(rawMaxReachableIndex)))
    : guidedStepIds.length - 1;

  const statusById = new Map<string, GuidedStepStatus>();
  (args.steps || []).forEach(step => {
    const id = (step?.id || '').toString().trim();
    if (!id) return;
    statusById.set(id, step);
  });

  let desiredIndex = -1;
  for (let index = 0; index <= maxReachableIndex; index += 1) {
    const stepId = guidedStepIds[index];
    if (!stepId) continue;
    const status = statusById.get(stepId);
    if (!status?.complete) {
      desiredIndex = index;
      break;
    }
  }

  if (desiredIndex < 0) desiredIndex = maxReachableIndex;
  const desiredStepId = (guidedStepIds[desiredIndex] || '').toString().trim();
  if (!desiredStepId) return null;

  const currentStepId = (args.currentStepId || '').toString().trim();
  return desiredStepId === currentStepId ? null : desiredStepId;
};
