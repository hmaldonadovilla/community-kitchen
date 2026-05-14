export const shouldSkipCleanDraftSnapshotSave = (args: {
  mode: 'draft' | 'submit';
  existingRecordId?: string;
  draftSaveRequestInFlight: boolean;
  autoSaveDirty: boolean;
  autoSaveQueued: boolean;
  force?: boolean;
  utilisationDraftSync?: boolean;
}): boolean => {
  if (args.force) return false;
  if (args.utilisationDraftSync) return false;
  return (
    args.mode === 'draft' &&
    !!args.existingRecordId &&
    !args.draftSaveRequestInFlight &&
    !args.autoSaveDirty &&
    !args.autoSaveQueued
  );
};
