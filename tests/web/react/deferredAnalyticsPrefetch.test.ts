import {
  releaseDeferredAnalyticsPrefetchKey,
  reserveDeferredAnalyticsPrefetchKey,
  shouldPrefetchDeferredAnalytics
} from '../../../src/web/react/app/deferredAnalyticsPrefetch';

describe('deferred analytics prefetch keys', () => {
  it('prevents duplicate in-flight requests for the same revision key', () => {
    const ref = { current: '' };

    expect(reserveDeferredAnalyticsPrefetchKey(ref, 'form::1')).toBe(true);
    expect(reserveDeferredAnalyticsPrefetchKey(ref, 'form::1')).toBe(false);
    expect(ref.current).toBe('form::1');
  });

  it('allows retry after a cancelled or failed request releases the key', () => {
    const ref = { current: '' };

    expect(reserveDeferredAnalyticsPrefetchKey(ref, 'form::1')).toBe(true);
    releaseDeferredAnalyticsPrefetchKey(ref, 'form::1');
    expect(ref.current).toBe('');
    expect(reserveDeferredAnalyticsPrefetchKey(ref, 'form::1')).toBe(true);
  });

  it('does not release a newer in-flight key from a stale cleanup', () => {
    const ref = { current: '' };

    expect(reserveDeferredAnalyticsPrefetchKey(ref, 'form::1')).toBe(true);
    ref.current = 'form::2';
    releaseDeferredAnalyticsPrefetchKey(ref, 'form::1');
    expect(ref.current).toBe('form::2');
  });

  it('prefetches when analytics are missing or marked stale', () => {
    expect(
      shouldPrefetchDeferredAnalytics({
        hasListViewAnalyticsWidgets: true,
        snapshotItemCount: 0,
        stale: false
      })
    ).toBe(true);
    expect(
      shouldPrefetchDeferredAnalytics({
        hasListViewAnalyticsWidgets: true,
        snapshotItemCount: 1,
        stale: true
      })
    ).toBe(true);
    expect(
      shouldPrefetchDeferredAnalytics({
        hasListViewAnalyticsWidgets: true,
        snapshotItemCount: 1,
        stale: false
      })
    ).toBe(false);
    expect(
      shouldPrefetchDeferredAnalytics({
        hasListViewAnalyticsWidgets: false,
        snapshotItemCount: 0,
        stale: true
      })
    ).toBe(false);
  });
});
