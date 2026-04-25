export function shouldDiscardRecordLoadResult(args: {
  requestSeq: number;
  currentSeq: number;
  sessionAtStart: number;
  currentSession: number;
}): boolean {
  return args.requestSeq !== args.currentSeq || args.sessionAtStart !== args.currentSession;
}

export function shouldApplyPrefetchedRecordPreview(args: {
  recordId: string;
  selectedRecordId: string;
  hasSelectedSnapshot: boolean;
  sessionAtStart: number;
  currentSession: number;
}): boolean {
  const recordId = (args.recordId || '').toString().trim();
  const selectedRecordId = (args.selectedRecordId || '').toString().trim();
  if (!recordId || !selectedRecordId) return false;
  if (recordId !== selectedRecordId) return false;
  if (args.hasSelectedSnapshot) return false;
  return args.sessionAtStart === args.currentSession;
}

export type RecordSnapshotPrefetchSource = 'homeList' | 'recordPreview';

export function shouldWaitForRecordPrefetchBeforeIndividualFetch(args: {
  hasPending: boolean;
  source?: RecordSnapshotPrefetchSource | string | null;
}): boolean {
  if (!args.hasPending) return false;
  return args.source === 'homeList';
}
