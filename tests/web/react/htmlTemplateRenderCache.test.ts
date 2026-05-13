export {};

type RunnerStep = {
  withFailureHandler: (cb: (err: any) => void) => Record<string, (...args: any[]) => void>;
};

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
};

const createLocalStorageMock = (): LocalStorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
};

const installGoogleScriptRunMock = (handlers: {
  renderSummaryHtmlTemplate?: (payload: any, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
  renderHtmlTemplate?: (payload: any, buttonId: string, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
  renderMarkdownTemplate?: (payload: any, buttonId: string, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
  renderInlineHtmlTemplate?: (payload: any, templateIdMap: any, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
}) => {
  const runner: any = {};
  runner.withSuccessHandler = (onSuccess: (res: any) => void): RunnerStep => {
    return {
      withFailureHandler: (onFail: (err: any) => void) => {
        const fns: Record<string, (...args: any[]) => void> = {};
        fns.renderSummaryHtmlTemplate = (payload: any) => {
          if (!handlers.renderSummaryHtmlTemplate) throw new Error('renderSummaryHtmlTemplate handler not installed');
          handlers.renderSummaryHtmlTemplate(payload, onSuccess, onFail);
        };
        fns.renderHtmlTemplate = (payload: any, buttonId: string) => {
          if (!handlers.renderHtmlTemplate) throw new Error('renderHtmlTemplate handler not installed');
          handlers.renderHtmlTemplate(payload, buttonId, onSuccess, onFail);
        };
        fns.renderMarkdownTemplate = (payload: any, buttonId: string) => {
          if (!handlers.renderMarkdownTemplate) throw new Error('renderMarkdownTemplate handler not installed');
          handlers.renderMarkdownTemplate(payload, buttonId, onSuccess, onFail);
        };
        fns.renderInlineHtmlTemplate = (payload: any, templateIdMap: any) => {
          if (!handlers.renderInlineHtmlTemplate) throw new Error('renderInlineHtmlTemplate handler not installed');
          handlers.renderInlineHtmlTemplate(payload, templateIdMap, onSuccess, onFail);
        };
        return fns;
      }
    };
  };
  (globalThis as any).google = { script: { run: runner } };
};

describe('client HTML render caching (api.ts)', () => {
  afterEach(() => {
    delete (globalThis as any).google;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).__CK_CACHE_VERSION__;
    jest.resetModules();
  });

  it('dedupes in-flight renderSummaryHtmlTemplate calls', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>ok</div>' }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { A: '1' } };
    const p1 = api.renderSummaryHtmlTemplateApi(payload);
    const p2 = api.renderSummaryHtmlTemplateApi(payload);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(calls.length).toBe(1);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.html).toBe('<div>ok</div>');
    expect(r2.html).toBe('<div>ok</div>');
  });

  it('returns cached summary HTML on subsequent calls (no extra Apps Script call)', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>cached</div>' }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const payload: any = { formKey: 'F', language: 'EN', id: 'R2', values: { A: '1' } };
    const first = await api.renderSummaryHtmlTemplateApi(payload);
    const second = await api.renderSummaryHtmlTemplateApi(payload);

    expect(calls.length).toBe(1);
    expect(first.html).toBe('<div>cached</div>');
    expect(second.html).toBe('<div>cached</div>');
  });

  it('persists successful summary HTML under the current cache version across module reloads', async () => {
    jest.resetModules();
    const calls: any[] = [];
    (globalThis as any).localStorage = createLocalStorageMock();
    (globalThis as any).__CK_CACHE_VERSION__ = 'cache-a';

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>persisted</div>' }), 0);
      }
    });

    let api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const payload: any = { formKey: 'F', language: 'EN', id: 'R-persisted', values: { A: '1' } };
    const first = await api.renderSummaryHtmlTemplateApi(payload);
    expect(first.html).toBe('<div>persisted</div>');
    expect(calls.length).toBe(1);

    jest.resetModules();
    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>server-again</div>' }), 0);
      }
    });
    api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const second = await api.renderSummaryHtmlTemplateApi(payload);

    expect(second.html).toBe('<div>persisted</div>');
    expect(calls.length).toBe(1);
  });

  it('misses persisted summary HTML when the cache version changes', async () => {
    jest.resetModules();
    const calls: any[] = [];
    (globalThis as any).localStorage = createLocalStorageMock();
    (globalThis as any).__CK_CACHE_VERSION__ = 'cache-a';

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>cache-a</div>' }), 0);
      }
    });

    let api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const payload: any = { formKey: 'F', language: 'EN', id: 'R-versioned', values: { A: '1' } };
    await api.renderSummaryHtmlTemplateApi(payload);
    expect(calls.length).toBe(1);

    jest.resetModules();
    (globalThis as any).__CK_CACHE_VERSION__ = 'cache-b';
    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>cache-b</div>' }), 0);
      }
    });
    api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const second = await api.renderSummaryHtmlTemplateApi(payload);

    expect(second.html).toBe('<div>cache-b</div>');
    expect(calls.length).toBe(2);
  });

  it('changes cache key when payload values change (re-renders)', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        const html = `<div>${payload?.values?.A || ''}</div>`;
        setTimeout(() => onSuccess({ success: true, html }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const p1: any = { formKey: 'F', language: 'EN', id: 'R3', values: { A: '1' } };
    const p2: any = { formKey: 'F', language: 'EN', id: 'R3', values: { A: '2' } };
    const r1 = await api.renderSummaryHtmlTemplateApi(p1);
    const r2 = await api.renderSummaryHtmlTemplateApi(p2);

    expect(calls.length).toBe(2);
    expect(r1.html).toBe('<div>1</div>');
    expect(r2.html).toBe('<div>2</div>');
  });

  it('uses a seeded summary HTML cache entry without an Apps Script call', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderSummaryHtmlTemplate: (payload, onSuccess) => {
        calls.push(payload);
        setTimeout(() => onSuccess({ success: true, html: '<div>server</div>' }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const payload: any = { formKey: 'F', language: 'EN', id: 'R-seeded', values: { A: '1' } };
    api.seedSummaryHtmlTemplateCache(payload, { success: true, html: '<div>prefetched</div>' });

    const cached = api.peekSummaryHtmlTemplateCache(payload);
    const rendered = await api.renderSummaryHtmlTemplateApi(payload);

    expect(cached?.html).toBe('<div>prefetched</div>');
    expect(rendered.html).toBe('<div>prefetched</div>');
    expect(calls.length).toBe(0);
  });

  it('caches renderHtmlTemplate (button) per record + values + buttonId', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderHtmlTemplate: (payload, buttonId, onSuccess) => {
        calls.push({ payload, buttonId });
        const html = `<div>${buttonId}:${payload?.values?.A || ''}</div>`;
        setTimeout(() => onSuccess({ success: true, html }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const payload: any = { formKey: 'F', language: 'EN', id: 'R4', values: { A: '1' } };
    const r1 = await api.renderHtmlTemplateApi(payload, 'BTN1');
    const r2 = await api.renderHtmlTemplateApi(payload, 'BTN1');
    const r3 = await api.renderHtmlTemplateApi(payload, 'BTN2');

    expect(calls.length).toBe(2);
    expect(r1.html).toBe('<div>BTN1:1</div>');
    expect(r2.html).toBe('<div>BTN1:1</div>');
    expect(r3.html).toBe('<div>BTN2:1</div>');
  });

  it('uses template-scoped HTML cache for static button templates', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderHtmlTemplate: (payload, buttonId, onSuccess) => {
        calls.push({ payload, buttonId });
        setTimeout(() => onSuccess({ success: true, html: '<div>static html</div>' }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const firstPayload: any = { formKey: 'F', language: 'EN', id: '', values: { A: '1' } };
    const secondPayload: any = { formKey: 'F', language: 'EN', id: '', values: { A: '2' } };
    const cacheOptions = { cacheScope: 'template', templateId: 'bundle:static.html' } as const;
    const first = await api.renderHtmlTemplateApi(firstPayload, 'BTN_STATIC', cacheOptions);
    const second = await api.renderHtmlTemplateApi(secondPayload, 'BTN_STATIC', cacheOptions);
    const peeked = api.peekHtmlTemplateCache(secondPayload, 'BTN_STATIC', cacheOptions);

    expect(calls.length).toBe(1);
    expect(first.html).toBe('<div>static html</div>');
    expect(second.html).toBe('<div>static html</div>');
    expect(peeked?.html).toBe('<div>static html</div>');
  });

  it('caches renderMarkdownTemplate results and reuses persisted markdown after module reload', async () => {
    jest.resetModules();
    const calls: any[] = [];
    (globalThis as any).localStorage = createLocalStorageMock();
    (globalThis as any).__CK_CACHE_VERSION__ = 'cache-md';

    installGoogleScriptRunMock({
      renderMarkdownTemplate: (payload, buttonId, onSuccess) => {
        calls.push({ payload, buttonId });
        setTimeout(() => onSuccess({ success: true, markdown: '# Cached markdown' }), 0);
      }
    });

    let api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const payload: any = { formKey: 'F', language: 'EN', id: 'R-md', values: { A: '1' } };
    const first = await api.renderMarkdownTemplateApi(payload, 'BTN_MD');
    expect(first.markdown).toBe('# Cached markdown');
    expect(calls.length).toBe(1);

    jest.resetModules();
    installGoogleScriptRunMock({
      renderMarkdownTemplate: (nextPayload, buttonId, onSuccess) => {
        calls.push({ payload: nextPayload, buttonId });
        setTimeout(() => onSuccess({ success: true, markdown: '# Server again' }), 0);
      }
    });
    api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');
    const second = await api.renderMarkdownTemplateApi(payload, 'BTN_MD');

    expect(second.markdown).toBe('# Cached markdown');
    expect(calls.length).toBe(1);
  });

  it('uses template-scoped Markdown cache for static button templates', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderMarkdownTemplate: (payload, buttonId, onSuccess) => {
        calls.push({ payload, buttonId });
        setTimeout(() => onSuccess({ success: true, markdown: 'Static markdown' }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const firstPayload: any = { formKey: 'F', language: 'EN', id: '', values: { A: '1' } };
    const secondPayload: any = { formKey: 'F', language: 'EN', id: '', values: { A: '2' } };
    const cacheOptions = { cacheScope: 'template', templateId: 'drive-md-template' } as const;
    const first = await api.renderMarkdownTemplateApi(firstPayload, 'BTN_MD_STATIC', cacheOptions);
    const second = await api.renderMarkdownTemplateApi(secondPayload, 'BTN_MD_STATIC', cacheOptions);
    const peeked = api.peekMarkdownTemplateCache(secondPayload, 'BTN_MD_STATIC', cacheOptions);

    expect(calls.length).toBe(1);
    expect(first.markdown).toBe('Static markdown');
    expect(second.markdown).toBe('Static markdown');
    expect(peeked?.markdown).toBe('Static markdown');
  });

  it('uses scoped inline HTML cache suffix to ignore unrelated draft value changes', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderInlineHtmlTemplate: (payload, templateIdMap, onSuccess) => {
        calls.push({ payload, templateIdMap });
        const firstRow = payload?.values?.GROUP?.[0] || {};
        const html = `<div>${firstRow?.FIELD || ''}</div>`;
        setTimeout(() => onSuccess({ success: true, html }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const templateIdMap: any = { en: 'bundle:example.html' };
    const cacheKeySuffix = JSON.stringify({
      scope: 'overlayDetail',
      rowId: 'row-1',
      templateId: 'bundle:example.html',
      payload: [{ FIELD: 'visible' }]
    });
    const firstPayload: any = {
      formKey: 'F',
      language: 'EN',
      id: 'R-inline',
      values: {
        GROUP: [{ FIELD: 'visible' }],
        UNRELATED: 'before'
      }
    };
    const secondPayload: any = {
      ...firstPayload,
      values: {
        ...firstPayload.values,
        UNRELATED: 'after'
      }
    };

    const first = await api.renderInlineHtmlTemplateApi(firstPayload, templateIdMap, cacheKeySuffix);
    const second = await api.renderInlineHtmlTemplateApi(secondPayload, templateIdMap, cacheKeySuffix);
    const peeked = api.peekInlineHtmlTemplateCache(secondPayload, templateIdMap, cacheKeySuffix);

    expect(calls.length).toBe(1);
    expect(first.html).toBe('<div>visible</div>');
    expect(second.html).toBe('<div>visible</div>');
    expect(peeked?.html).toBe('<div>visible</div>');
  });

  it('re-renders scoped inline HTML when the content suffix changes', async () => {
    jest.resetModules();
    const calls: any[] = [];

    installGoogleScriptRunMock({
      renderInlineHtmlTemplate: (payload, templateIdMap, onSuccess) => {
        calls.push({ payload, templateIdMap });
        const firstRow = payload?.values?.GROUP?.[0] || {};
        const html = `<div>${firstRow?.FIELD || ''}</div>`;
        setTimeout(() => onSuccess({ success: true, html }), 0);
      }
    });

    const api = require('../../../src/web/react/api') as typeof import('../../../src/web/react/api');

    const templateIdMap: any = { en: 'bundle:example.html' };
    const firstPayload: any = {
      formKey: 'F',
      language: 'EN',
      id: 'R-inline-change',
      values: {
        GROUP: [{ FIELD: 'before' }]
      }
    };
    const secondPayload: any = {
      ...firstPayload,
      values: {
        GROUP: [{ FIELD: 'after' }]
      }
    };

    const first = await api.renderInlineHtmlTemplateApi(
      firstPayload,
      templateIdMap,
      JSON.stringify({ scope: 'overlayDetail', rowId: 'row-1', payload: [{ FIELD: 'before' }] })
    );
    const second = await api.renderInlineHtmlTemplateApi(
      secondPayload,
      templateIdMap,
      JSON.stringify({ scope: 'overlayDetail', rowId: 'row-1', payload: [{ FIELD: 'after' }] })
    );

    expect(calls.length).toBe(2);
    expect(first.html).toBe('<div>before</div>');
    expect(second.html).toBe('<div>after</div>');
  });
});
