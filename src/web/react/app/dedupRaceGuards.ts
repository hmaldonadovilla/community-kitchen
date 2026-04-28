const normalizeString = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim();

export const shouldApplyDedupPrecheckResult = (args: {
  requestSeq: number;
  currentSeq: number;
  sessionAtStart: number;
  currentSession: number;
  signatureAtStart?: string | null;
  currentSignature?: string | null;
  currentView?: string | null;
}): boolean => {
  if (args.requestSeq !== args.currentSeq) return false;
  if (args.sessionAtStart !== args.currentSession) return false;
  if (normalizeString(args.currentView).toLowerCase() !== 'form') return false;
  return normalizeString(args.signatureAtStart) === normalizeString(args.currentSignature);
};

export const isDeleteOnKeyChangeSettledForRecord = (args: {
  targetRecordId?: string | null;
  currentRecordId?: string | null;
  deletedRecordIds?: string[] | null;
}): boolean => {
  const targetRecordId = normalizeString(args.targetRecordId);
  if (!targetRecordId) return true;
  const currentRecordId = normalizeString(args.currentRecordId);
  if (currentRecordId && currentRecordId === targetRecordId) return false;
  if (currentRecordId && currentRecordId !== targetRecordId) return true;
  const deleted = Array.isArray(args.deletedRecordIds)
    ? args.deletedRecordIds.some(id => normalizeString(id) === targetRecordId)
    : false;
  return deleted || !currentRecordId;
};
