import './mocks/GoogleAppsScript';
import { buildWebFormHtml } from '../src/services/WebFormTemplate';
import { ServerTimingRecorder } from '../src/services/webform/serverTiming';

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

  test('exposes the service url to the client bootstrap globals', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'landing');

    expect(html).toContain('window.__CK_SERVICE_URL__ = "https://script.google.com/macros/s/example-deployment/exec"');
  });

  test('starts early home bootstrap prefetch for bundled screens without embedded home data', () => {
    const html = buildWebFormHtml({ title: 'Config: Test', questions: [] } as any, 'Config: Test', { homeRev: 4 }, 'meal-production');

    expect(html).toContain('window.__CK_HOME_BOOTSTRAP_PREFETCH__ = prefetchState');
    expect(html).toContain('.fetchHomeBootstrap(homeKey, null);');
  });

  test('exposes server timings to the client shell when timing is enabled', () => {
    const timing = new ServerTimingRecorder(true);
    timing.measure('renderForm.buildEmbeddedHtmlMs', () => null);
    timing.measure('renderForm.definition.buildDefinitionFromConfigMs', () => null);
    timing.measure('renderForm.bootstrap.fetchSortedBatchMs', () => null);

    const html = buildWebFormHtml(
      { title: 'Config: Test', questions: [] } as any,
      'Config: Test',
      { homeRev: 4 },
      'meal-production',
      {},
      timing
    );

    expect(html).toContain('window.__CK_SERVER_TIMINGS__ = {');
    expect(html).toContain('"renderForm.buildEmbeddedHtmlMs"');
    expect(html).toContain('"renderForm.definition.buildDefinitionFromConfigMs"');
    expect(html).toContain('"renderForm.bootstrap.fetchSortedBatchMs"');
  });
});
