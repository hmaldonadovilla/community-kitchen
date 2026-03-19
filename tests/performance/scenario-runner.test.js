const {
  extractInitialLoadNetworkBuckets,
  isBundleResourceEntry,
  isHomeDataRequestEntry,
} = require('../../scripts/performance/scenario-runner.js');

describe('scenario-runner network buckets', () => {
  test('detects bundle and callback resources', () => {
    expect(
      isBundleResourceEntry({
        name: 'https://script.google.com/macros/s/abc/exec?bundle=react&v=123',
        initiatorType: 'script',
      })
    ).toBe(true);
    expect(
      isHomeDataRequestEntry({
        name: 'https://script.google.com/macros/s/abc/callback?nocache_id=6',
        initiatorType: 'xmlhttprequest',
      })
    ).toBe(true);
  });

  test('extracts document, bundle, and first-page-data buckets', () => {
    const metrics = extractInitialLoadNetworkBuckets({
      pageSnapshot: {
        navigation: {
          responseStart: 5460,
          responseEnd: 5460,
          duration: 6050,
        },
        resources: [],
      },
      frameSnapshot: {
        now: 7600,
        resources: [
          {
            name: 'https://script.google.com/macros/s/abc/exec?bundle=react&v=123',
            initiatorType: 'script',
            startTime: 120,
            duration: 1300,
            responseEnd: 1420,
            encodedBodySize: 22,
          },
          {
            name: 'https://script.googleusercontent.com/echo?user_content_key=xyz',
            initiatorType: 'script',
            startTime: 1420,
            duration: 1690,
            responseEnd: 3110,
            encodedBodySize: 448000,
          },
          {
            name: 'https://script.google.com/macros/s/abc/callback?nocache_id=6',
            initiatorType: 'xmlhttprequest',
            startTime: 3200,
            duration: 4070,
            responseEnd: 7270,
            encodedBodySize: 4100,
          },
          {
            name: 'https://script.google.com/macros/s/abc/callback?nocache_id=7',
            initiatorType: 'xmlhttprequest',
            startTime: 8100,
            duration: 6830,
            responseEnd: 14930,
            encodedBodySize: 3600,
          },
        ],
      },
      homeReadyWallClockMs: 12640,
    });

    expect(metrics.documentTtfbMs).toBe(5460);
    expect(metrics.documentRequestMs).toBe(5460);
    expect(metrics.bundleLoadMs).toBe(2990);
    expect(metrics.firstPageDataLoadMs).toBe(4070);
    expect(metrics.initialDataRequestCount).toBe(1);
    expect(metrics.initialDataWindowMs).toBe(4070);
    expect(metrics.pageUsableMs).toBe(12640);
    expect(metrics.bundleRequestUrl).toContain('bundle=react');
    expect(metrics.firstPageDataRequestUrl).toContain('callback?nocache_id=6');
  });
});
