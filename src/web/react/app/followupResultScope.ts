const normalizeRecordId = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim();

const normalizeView = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim().toLowerCase();

const normalizeSession = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const resolveFollowupResultApplicationTarget = (args: {
  settledRecordId?: string | null;
  selectedRecordId?: string | null;
  selectedSnapshotId?: string | null;
  currentSessionId?: number | null;
  followupSessionId?: number | null;
  currentView?: string | null;
}): {
  applyToActiveRecord: boolean;
  currentRecordId: string;
  settledRecordId: string;
  sessionChanged: boolean;
  viewAllowsActiveRecord: boolean;
} => {
  const settledRecordId = normalizeRecordId(args.settledRecordId);
  const currentRecordId = normalizeRecordId(args.selectedRecordId) || normalizeRecordId(args.selectedSnapshotId);
  const currentView = normalizeView(args.currentView);
  const viewAllowsActiveRecord = currentView === 'form' || currentView === 'summary';
  const currentSessionId = normalizeSession(args.currentSessionId);
  const followupSessionId = normalizeSession(args.followupSessionId);
  const sessionChanged =
    currentSessionId !== null &&
    followupSessionId !== null &&
    currentSessionId !== followupSessionId;

  return {
    applyToActiveRecord: Boolean(
      viewAllowsActiveRecord &&
      settledRecordId &&
      currentRecordId &&
      settledRecordId === currentRecordId &&
      !sessionChanged
    ),
    currentRecordId,
    settledRecordId,
    sessionChanged,
    viewAllowsActiveRecord
  };
};
