export function resolveListViewUiState(args: {
  visibleCount: number;
  hasLoadedOnce: boolean;
  loading: boolean;
  prefetching: boolean;
  error: string | null;
  assumeInitialLoad: boolean;
}): { showLoadingStatus: boolean; showNoRecords: boolean } {
  const visibleCount = Math.max(0, Math.floor(Number(args.visibleCount) || 0));
  const hasLoadedOnce = Boolean(args.hasLoadedOnce);
  const loading = Boolean(args.loading);
  const prefetching = Boolean(args.prefetching);
  const error = (args.error || '').toString().trim();
  const assumeInitialLoad = Boolean(args.assumeInitialLoad);

  if (error) {
    return { showLoadingStatus: false, showNoRecords: false };
  }

  const showLoadingStatus = !prefetching && (loading || (assumeInitialLoad && !hasLoadedOnce));
  const showNoRecords = !loading && !prefetching && hasLoadedOnce && visibleCount === 0;

  return { showLoadingStatus, showNoRecords };
}

