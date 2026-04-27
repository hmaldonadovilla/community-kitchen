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
