export type UtilisationDraftSyncSkipArgs = {
  releaseScopeCount?: number | null;
  dedupDeleteOnKeyChangeInFlight?: boolean;
  dedupDeletePending?: boolean;
};

export const shouldSkipUtilisationDraftSyncForDeleteOnKeyChange = (
  args: UtilisationDraftSyncSkipArgs
): boolean => {
  const releaseScopeCount = Number(args.releaseScopeCount || 0);
  if (!Number.isFinite(releaseScopeCount) || releaseScopeCount <= 0) return false;
  return args.dedupDeleteOnKeyChangeInFlight === true || args.dedupDeletePending === true;
};

export const shouldDeferUtilisationDraftSyncToDeleteOnKeyChange = (
  args: Pick<UtilisationDraftSyncSkipArgs, 'dedupDeleteOnKeyChangeInFlight' | 'dedupDeletePending'>
): boolean => args.dedupDeleteOnKeyChangeInFlight === true || args.dedupDeletePending === true;
