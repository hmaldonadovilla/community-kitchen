export const shouldSkipGuidedStepBackgroundSync = (args: {
  autoSaveDirty: boolean;
  autoSaveQueued: boolean;
  lastExternalSyncAt?: number | null;
  lastLocalRecordMutationAt?: number | null;
}): boolean => {
  if (args.autoSaveDirty || args.autoSaveQueued) return false;

  const lastExternalSyncAt = Number(args.lastExternalSyncAt);
  if (!Number.isFinite(lastExternalSyncAt) || lastExternalSyncAt <= 0) return false;

  const lastLocalRecordMutationAt = Number(args.lastLocalRecordMutationAt);
  if (!Number.isFinite(lastLocalRecordMutationAt) || lastLocalRecordMutationAt <= 0) return true;
  return lastLocalRecordMutationAt <= lastExternalSyncAt;
};
