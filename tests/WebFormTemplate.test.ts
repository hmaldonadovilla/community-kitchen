import './mocks/GoogleAppsScript';
import { buildWebFormHtml } from '../src/services/WebFormTemplate';
import { ServerTimingRecorder } from '../src/services/webform/serverTiming';

describe('WebFormTemplate', () => {
  const originalScriptApp = (globalThis as any).ScriptApp;
  const originalPropertiesService = (globalThis as any).PropertiesService;
  let scriptProperties: Record<string, string>;

  beforeEach(() => {
    scriptProperties = { CK_WEB_ASSET_MODE: 'embedded' };
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
        getProperty: (key: string) => scriptProperties[key] || null
      })
    };
  });

  afterEach(() => {
    (globalThis as any).ScriptApp = originalScriptApp;
    (globalThis as any).PropertiesService = originalPropertiesService;
  });

  test('includes request ts in the bundled react script URL', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production', { ts: '1741513400' });

    expect(html).toMatch(/bundle=react&app=meal-production&v=cache-v-test\.[a-f0-9]{12}&ts=1741513400/);
  });

  test('exposes the service url to the client bootstrap globals', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'landing');

    expect(html).toContain('window.__CK_SERVICE_URL__ = "https://script.google.com/macros/s/example-deployment/exec"');
  });

  test('suppresses the second boot wait copy for app-opening navigation from the landing page', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production', { ckNav: 'open-app' });

    expect(html).toContain('<h1>Loading…</h1>');
    expect(html).not.toContain('Please keep this page open. This may take a few seconds.');
    expect(html).toContain('"ckNav":"open-app"');
  });

  test('keeps the normal boot wait copy for direct app loads', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production');

    expect(html).toContain('Please keep this page open. This may take a few seconds.');
  });

  test('includes high-visibility header autosave notice styles', () => {
    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production');

    expect(html).toContain('.ck-app-save-status');
    expect(html).toContain('font-size: var(--ck-font-group-title);');
    expect(html).toContain('color: var(--accent);');
    expect(html).toContain('data-title-right-priority="1"');
  });

  test('uses the public Apps Script path for the React bundle when the service URL is domain-scoped', () => {
    (globalThis as any).ScriptApp = {
      getService: () => ({
        getUrl: () => 'https://script.google.com/a/communitykitchen.be/macros/s/example-deployment/exec'
      })
    };

    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production');

    expect(html).toContain('src="https://script.google.com/macros/s/example-deployment/exec?bundle=react&app=meal-production');
    expect(html).not.toContain('src="https://script.google.com/a/communitykitchen.be/macros/s/example-deployment/exec?bundle=react');
  });

  test('uses Firebase-hosted React assets when external web assets are configured', () => {
    scriptProperties = {
      CK_WEB_ASSET_MODE: 'external',
      CK_WEB_ASSET_BASE_URL: 'https://assets.example.test/static/'
    };

    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production', { ts: '1741513400' });

    expect(html).toMatch(
      /src="https:\/\/assets\.example\.test\/static\/assets\/webform-react(?:-meal-production)?\.[a-f0-9]{12}\.js\?ts=1741513400"/
    );
    expect(html).not.toContain('bundle=react');
    expect(html).toContain('window.__CK_WEB_ASSET__ = {"src":"https://assets.example.test/static/assets/');
    expect(html).toContain('"mode":"external"');
  });

  test('falls back to the Apps Script bundle route when the external asset base URL is unsafe', () => {
    scriptProperties = {
      CK_WEB_ASSET_MODE: 'external',
      CK_WEB_ASSET_BASE_URL: 'http://assets.example.test'
    };

    const html = buildWebFormHtml(null, 'Config: Test', null, 'meal-production');

    expect(html).toContain('src="https://script.google.com/macros/s/example-deployment/exec?bundle=react&app=meal-production');
    expect(html).toContain('"mode":"embedded"');
  });

  test('starts early home bootstrap prefetch for bundled screens without embedded home data', () => {
    const html = buildWebFormHtml({ title: 'Config: Test', questions: [] } as any, 'Config: Test', { homeRev: 4 }, 'meal-production');

    expect(html).toContain('window.__CK_HOME_BOOTSTRAP_PREFETCH__ = prefetchState');
    expect(html).toContain('.fetchHomeBootstrap(homeKey, null);');
    expect(html).toContain('nextBootstrap.analytics = res.analytics');
    expect(html).toContain('nextBootstrap.analyticsRev = analyticsRev');
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

  test('embeds runtime backend config from script properties', () => {
    scriptProperties = {
      CK_BACKEND_MODE: 'hybrid',
      CK_API_BASE_URL: 'https://community-kitchen-api.example.test',
      CK_HTTP_FUNCTIONS: 'fetchDataSource',
      CK_DATA_BACKEND: 'drive',
      CK_FILE_BACKEND: 'drive'
    };

    const html = buildWebFormHtml({ title: 'Config: Test', questions: [] } as any, 'Config: Test', null, 'meal-production');

    expect(html).toContain('"backend"');
    expect(html).toContain('"mode":"hybrid"');
    expect(html).toContain('"apiBaseUrl":"https://community-kitchen-api.example.test"');
    expect(html).toContain('"httpFunctions":["fetchDataSource"]');
    expect(html).toContain('"dataBackend":"drive"');
    expect(html).toContain('"fileBackend":"drive"');
  });
});
