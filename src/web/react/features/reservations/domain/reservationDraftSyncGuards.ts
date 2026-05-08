export type ReservationDraftSyncSkipArgs = {
  releaseScopeCount?: number | null;
  dedupDeleteOnKeyChangeInFlight?: boolean;
  dedupDeletePending?: boolean;
};

export const shouldSkipReservationDraftSyncForDeleteOnKeyChange = (
  args: ReservationDraftSyncSkipArgs
): boolean => {
  const releaseScopeCount = Number(args.releaseScopeCount || 0);
  if (!Number.isFinite(releaseScopeCount) || releaseScopeCount <= 0) return false;
  return args.dedupDeleteOnKeyChangeInFlight === true || args.dedupDeletePending === true;
};
