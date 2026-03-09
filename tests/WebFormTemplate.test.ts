import './mocks/GoogleAppsScript';
import { buildWebFormHtml } from '../src/services/WebFormTemplate';

describe('WebFormTemplate', () => {
  const originalScriptApp = (globalThis as any).ScriptApp;
  const originalPropertiesService = (globalThis as any).PropertiesService;

  beforeEach(() => {
    (globalThis as any).ScriptApp = {
      getService: () => ({
        getUrl: () => 'https://script.google.com/macros/s/example-deployment/exec'
      })
    };
    (globalThis as any).PropertiesService = {
      getDocumentProperties: () => ({
        getProperty: (key: string) => (key === 'CK_CACHE_VERSION' ? 'cache-v-test' : null)
      }),
      getScriptProperties: () => ({
        getProperty: () => null
      })
    };
  });

  afterEach(() => {
    (globalThis as any).ScriptApp = originalScriptApp;
    (globalThis as any).PropertiesService = originalPropertiesService;
  });

  test('includes request ts in the bundled react script URL', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production', { ts: '1741513400' });

    expect(html).toContain('bundle=react&app=meal-production&v=cache-v-test&ts=1741513400');
  });
});
