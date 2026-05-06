export type DeferredAnalyticsPrefetchKeyRef = { current: string };

export const reserveDeferredAnalyticsPrefetchKey = (
  ref: DeferredAnalyticsPrefetchKeyRef,
  key: string
): boolean => {
  const normalized = (key || '').toString();
  if (!normalized) return false;
  if (ref.current === normalized) return false;
  ref.current = normalized;
  return true;
};

export const releaseDeferredAnalyticsPrefetchKey = (
  ref: DeferredAnalyticsPrefetchKeyRef,
  key: string
): void => {
  if (ref.current === (key || '').toString()) {
    ref.current = '';
  }
};

export const shouldPrefetchDeferredAnalytics = (args: {
  hasListViewAnalyticsWidgets: boolean;
  snapshotItemCount: number;
  refreshRequested?: boolean;
  stale: boolean;
}): boolean => {
  if (!args.hasListViewAnalyticsWidgets) return false;
  return Boolean(args.refreshRequested) || args.stale || args.snapshotItemCount <= 0;
};

export const shouldRequestHomeAnalyticsRefreshOnListEnter = (args: {
  hasListViewAnalyticsWidgets: boolean;
  previousView?: string | null;
  snapshotItemCount: number;
  stale: boolean;
}): boolean => {
  if (!args.hasListViewAnalyticsWidgets) return false;
  const previousView = (args.previousView || '').toString().trim();
  if (previousView === 'list') return false;
  if (previousView) return true;
  return args.stale || args.snapshotItemCount <= 0;
};
