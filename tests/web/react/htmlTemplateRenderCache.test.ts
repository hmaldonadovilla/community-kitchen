export {};

type RunnerStep = {
  withFailureHandler: (cb: (err: any) => void) => Record<string, (...args: any[]) => void>;
};

const installGoogleScriptRunMock = (handlers: {
  renderSummaryHtmlTemplate?: (payload: any, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
  renderHtmlTemplate?: (payload: any, buttonId: string, onSuccess: (res: any) => void, onFail: (err: any) => void) => void;
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
        return fns;
      }
    };
  };
  (globalThis as any).google = { script: { run: runner } };
};

describe('client HTML render caching (api.ts)', () => {
  afterEach(() => {
    delete (globalThis as any).google;
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
});

