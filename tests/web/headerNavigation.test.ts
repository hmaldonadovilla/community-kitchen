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

  test('buildAnalyticsUrl targets the analytics bundle for the current form', () => {
    expect(buildAnalyticsUrl('https://script.google.com/macros/s/deployment/exec', 'Config: Meal Production', false)).toBe(
      'https://script.google.com/macros/s/deployment/exec?form=Config%3A+Meal+Production&app=analytics'
    );
  });

  test('isTruthyParam matches supported truthy query tokens', () => {
    expect(isTruthyParam('yes')).toBe(true);
    expect(isTruthyParam('0')).toBe(false);
  });
});
