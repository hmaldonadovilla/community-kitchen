import {
  isIosLikeScannerPlatform,
  resolveScannerCloseMode
} from '../../../src/web/qrScanner/platform';

describe('QR scanner platform detection', () => {
  it('identifies iPhone and iPad browser surfaces', () => {
    expect(
      isIosLikeScannerPlatform({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5
      })
    ).toBe(true);
    expect(
      isIosLikeScannerPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        platform: 'MacIntel',
        maxTouchPoints: 5
      })
    ).toBe(true);
  });

  it('keeps the page-owned close control available on Android and desktop', () => {
    expect(
      isIosLikeScannerPlatform({
        userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-A176B)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      })
    ).toBe(false);
    expect(
      isIosLikeScannerPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        platform: 'MacIntel',
        maxTouchPoints: 0
      })
    ).toBe(false);
  });

  it('uses only the native browser close control on iOS-like surfaces', () => {
    expect(
      resolveScannerCloseMode({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5
      })
    ).toBe('native');
    expect(
      resolveScannerCloseMode({
        userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-A176B)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      })
    ).toBe('scripted');
  });
});
