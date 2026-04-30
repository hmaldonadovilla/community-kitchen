export const shouldWaitBeforeLeavingRecord = (args: {
  uploadsInFlight?: number;
  autoSaveInFlight?: boolean;
  autoSaveDirty?: boolean;
  autoSaveQueued?: boolean;
  draftSaveInFlight?: boolean;
  recordSyncInFlight?: boolean;
  reservationSyncInFlight?: boolean;
  followupBatchInFlight?: boolean;
  guidedStepLiveSyncInFlight?: boolean;
  guidedStepLiveSyncPending?: boolean;
  renderedDraftChanged?: boolean;
}): boolean =>
  Number(args.uploadsInFlight || 0) > 0 ||
  args.autoSaveInFlight === true ||
  args.autoSaveDirty === true ||
  args.autoSaveQueued === true ||
  args.draftSaveInFlight === true ||
  args.recordSyncInFlight === true ||
  args.reservationSyncInFlight === true ||
  args.followupBatchInFlight === true ||
  args.guidedStepLiveSyncInFlight === true ||
  args.guidedStepLiveSyncPending === true ||
  args.renderedDraftChanged === true;
