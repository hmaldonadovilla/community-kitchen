import {
  appendAppOpeningNavigationParam,
  APP_OPEN_NAVIGATION_PARAM,
  APP_OPEN_NAVIGATION_VALUE,
  isAppOpeningNavigationParams
} from '../../src/web/navigationIntent';

describe('navigation intent helpers', () => {
  test('appends the app-opening marker without disturbing existing query or hash fragments', () => {
    expect(appendAppOpeningNavigationParam('https://example.test/exec?form=Meal#top')).toBe(
      'https://example.test/exec?form=Meal&ckNav=open-app#top'
    );
  });

  test('does not duplicate an existing app-opening marker', () => {
    const url = `https://example.test/exec?${APP_OPEN_NAVIGATION_PARAM}=${APP_OPEN_NAVIGATION_VALUE}&form=Meal`;
    expect(appendAppOpeningNavigationParam(url)).toBe(url);
  });

  test('normalizes an existing navigation marker to app-opening', () => {
    expect(appendAppOpeningNavigationParam('https://example.test/exec?ckNav=landing&form=Meal')).toBe(
      'https://example.test/exec?ckNav=open-app&form=Meal'
    );
  });

  test('detects app-opening navigation params', () => {
    expect(isAppOpeningNavigationParams({ ckNav: 'open-app' })).toBe(true);
    expect(isAppOpeningNavigationParams({ ckNav: 'landing' })).toBe(false);
  });
});
