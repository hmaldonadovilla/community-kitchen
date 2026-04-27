import {
  releaseDeferredAnalyticsPrefetchKey,
  reserveDeferredAnalyticsPrefetchKey
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
});
