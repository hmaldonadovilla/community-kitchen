describe('services/webform/followup/htmlRenderer script gating', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('rejects <script> tags in Drive-sourced HTML templates', () => {
    jest.doMock('../../../src/services/webform/followup/htmlTemplateCache', () => ({
      getCachedHtmlTemplate: jest.fn(() => null),
      setCachedHtmlTemplate: jest.fn(() => false),
      readHtmlTemplateRawFromDrive: jest.fn(() => ({
        success: true,
        raw: '<div>Hello</div><script>alert(1)</script>',
        mimeType: 'text/html'
      }))
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { renderHtmlFromHtmlTemplate } = require('../../../src/services/webform/followup/htmlRenderer') as typeof import('../../../src/services/webform/followup/htmlRenderer');

    const res = renderHtmlFromHtmlTemplate({
      dataSources: { lookupDataSourceDetails: () => null } as any,
      form: { title: 'F', templateCacheTtlSeconds: 0 } as any,
      questions: [],
      record: { formKey: 'F', language: 'EN', values: {}, id: 'R1' } as any,
      templateIdMap: 'drive-file-id'
    });

    expect(res.success).toBe(false);
    expect((res.message || '').toLowerCase()).toContain('scripts are not allowed');
  });

  it('preserves template-authored scripts for bundled templates while stripping injected scripts from values', () => {
    jest.doMock('../../../src/services/webform/followup/htmlTemplateCache', () => ({
      getCachedHtmlTemplate: jest.fn(() => null),
      setCachedHtmlTemplate: jest.fn(() => false),
      readHtmlTemplateRawFromDrive: jest.fn(() => ({
        success: true,
        raw: '<div>{{FIELD}}</div><script>window.__ck_trusted = 1;</script>',
        mimeType: 'bundle'
      }))
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { renderHtmlFromHtmlTemplate } = require('../../../src/services/webform/followup/htmlRenderer') as typeof import('../../../src/services/webform/followup/htmlRenderer');

    const res = renderHtmlFromHtmlTemplate({
      dataSources: { lookupDataSourceDetails: () => null } as any,
      form: { title: 'F', templateCacheTtlSeconds: 0 } as any,
      questions: [{ id: 'FIELD', type: 'TEXT', qEn: 'Field' } as any],
      record: {
        formKey: 'F',
        language: 'EN',
        id: 'R1',
        values: { FIELD: '<script>window.__ck_injected = 1;</script>hello' }
      } as any,
      templateIdMap: 'bundle:test.html'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('hello');
    expect(res.html).toContain('__ck_trusted');
    expect(res.html).not.toContain('__ck_injected');
  });
});

