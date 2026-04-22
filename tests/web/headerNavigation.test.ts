import {
  buildAnalyticsUrl,
  buildLandingUrl,
  isTruthyParam
} from '../../src/web/react/app/headerNavigation';

describe('header navigation helpers', () => {
  test('buildLandingUrl targets the landing bundle and preserves admin mode', () => {
    expect(buildLandingUrl('https://script.google.com/macros/s/deployment/exec', true)).toBe(
      'https://script.google.com/macros/s/deployment/exec?app=landing&admin=true'
    );
  });

  test('buildAnalyticsUrl targets the centralized analytics bundle and preserves admin mode', () => {
    expect(buildAnalyticsUrl('https://script.google.com/macros/s/deployment/exec', true)).toBe(
      'https://script.google.com/macros/s/deployment/exec?app=analytics&admin=true'
    );
  });

  test('buildLandingUrl falls back to the current page path when the service URL is unavailable', () => {
    const globalAny = globalThis as any;
    const originalLocation = globalAny.location;
    Object.defineProperty(globalAny, 'location', {
      configurable: true,
      value: {
        href: 'https://script.google.com/macros/s/deployment/exec?app=analytics&admin=true#summary'
      }
    });

    try {
      expect(buildLandingUrl('', true)).toBe('https://script.google.com/macros/s/deployment/exec?app=landing&admin=true');
    } finally {
      Object.defineProperty(globalAny, 'location', {
        configurable: true,
        value: originalLocation
      });
    }
  });

  test('isTruthyParam matches supported truthy query tokens', () => {
    expect(isTruthyParam('yes')).toBe(true);
    expect(isTruthyParam('0')).toBe(false);
  });
});
