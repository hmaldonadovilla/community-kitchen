export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeEnvName, resolveConfigsDir } = require('../scripts/embed-form-configs');
const { resolveLandingPageConfigPath } = require('../scripts/embed-landing-page-config');
const { resolveAnalyticsPageConfigPath } = require('../scripts/embed-analytics-page-config');
const path = require('path');
const fs = require('fs');

describe('embed-form-configs env helpers', () => {
  test('normalizes production to prod', () => {
    expect(normalizeEnvName('production')).toBe('prod');
    expect(normalizeEnvName('Prod')).toBe('prod');
  });

  test('resolves env-specific config dirs', () => {
    const dir = resolveConfigsDir('staging');
    expect(path.normalize(dir)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging$/);
  });

  test('exported configs include a stable cache fingerprint', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'bundledFormConfigs.ts'), 'utf8');
    expect(raw).toContain('"cacheFingerprint":');
  });

  test('resolves env-specific landing page config path', () => {
    const filePath = resolveLandingPageConfigPath('staging');
    expect(path.normalize(filePath)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging[\\/]+landing_page\.json$/);
  });

  test('embedded landing page config is generated from the export file', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'bundledLandingPageConfig.ts'), 'utf8');
    expect(raw).toContain('"heroTitle": "Welcome to the Community Kitchen"');
    expect(raw).toContain('"adminSectionNote": "Reports are available from the dashboard below."');
    expect(raw).toContain('"logoFormKey": "Config: Meal Production"');
    expect(raw).toContain('"imageUrl": "data:image/');
  });

  test('resolves env-specific analytics page config path', () => {
    const filePath = resolveAnalyticsPageConfigPath('staging');
    expect(path.normalize(filePath)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging[\\/]+analytics_page\.json$/);
  });

  test('embedded analytics page config is generated from the export file', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'bundledAnalyticsPageConfig.ts'), 'utf8');
    expect(raw).toContain('"pageTitle": "Reports"');
    expect(raw).toContain('"logoFormKey": "Config: Meal Production"');
    expect(raw).toContain('"sections": []');
    expect(raw).toContain('"pendingNavigationTitle": "Please wait"');
    expect(raw).toContain('"pendingNavigationMessage": "Opening forms..."');
    expect(raw).toContain('"imageUrl": "data:image/');
  });
});
