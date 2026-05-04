export const guidedStepRequiresPersistedRecord = (args: {
  currentStepIndex?: number | null;
  nextStepIndex?: number | null;
  currentRecordId?: string | null;
}): boolean => {
  const currentStepIndex = Number(args.currentStepIndex);
  const nextStepIndex = Number(args.nextStepIndex);
  if (!Number.isFinite(currentStepIndex) || !Number.isFinite(nextStepIndex)) return false;
  if (nextStepIndex <= currentStepIndex) return false;
  if (nextStepIndex <= 0) return false;
  const recordId = (args.currentRecordId || '').toString().trim();
  return !recordId;
};

export const shouldWaitForActiveDraftSaveBeforeEnsuringRecord = (args: {
  currentRecordId?: string | null;
  autoSaveInFlight?: boolean | null;
  draftSaveInFlight?: boolean | null;
  draftSavePromiseInFlight?: boolean | null;
}): boolean => {
  const recordId = (args.currentRecordId || '').toString().trim();
  if (recordId) return false;
  return Boolean(args.autoSaveInFlight || args.draftSaveInFlight || args.draftSavePromiseInFlight);
};
