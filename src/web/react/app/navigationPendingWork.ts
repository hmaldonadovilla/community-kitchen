export const shouldWaitBeforeLeavingRecord = (args: {
  discardInvalidDraft?: boolean;
  uploadsInFlight?: number;
  autoSaveInFlight?: boolean;
  autoSaveDirty?: boolean;
  autoSaveQueued?: boolean;
  draftSaveInFlight?: boolean;
  recordSyncInFlight?: boolean;
  utilisationSyncInFlight?: boolean;
  dedupDeletePending?: boolean;
  dedupDeleteInFlight?: boolean;
  followupBatchInFlight?: boolean;
  guidedStepLiveSyncInFlight?: boolean;
  guidedStepLiveSyncPending?: boolean;
  renderedDraftChanged?: boolean;
}): boolean => {
  if (args.discardInvalidDraft === true) {
    return (
      Number(args.uploadsInFlight || 0) > 0 ||
      args.autoSaveInFlight === true ||
      args.draftSaveInFlight === true ||
      args.recordSyncInFlight === true ||
      args.utilisationSyncInFlight === true ||
      args.dedupDeletePending === true ||
      args.dedupDeleteInFlight === true ||
      args.followupBatchInFlight === true ||
      args.guidedStepLiveSyncInFlight === true ||
      args.guidedStepLiveSyncPending === true
    );
  }
  return (
    Number(args.uploadsInFlight || 0) > 0 ||
    args.autoSaveInFlight === true ||
    args.autoSaveDirty === true ||
    args.autoSaveQueued === true ||
    args.draftSaveInFlight === true ||
    args.recordSyncInFlight === true ||
    args.utilisationSyncInFlight === true ||
    args.dedupDeletePending === true ||
    args.dedupDeleteInFlight === true ||
    args.followupBatchInFlight === true ||
    args.guidedStepLiveSyncInFlight === true ||
    args.guidedStepLiveSyncPending === true ||
    args.renderedDraftChanged === true
  );
};
