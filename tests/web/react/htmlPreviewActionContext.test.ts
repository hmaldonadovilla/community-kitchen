import { resolveHtmlPreviewActionContext } from '../../../src/web/react/components/app/htmlPreviewActionContext';

describe('resolveHtmlPreviewActionContext', () => {
  it('resolves a dynamic value patch from a configured source selector', () => {
    const attrs = new Map<string, string>([
      ['data-ck-action-value-field', 'MP_EXP_DATE_OVERRIDE'],
      ['data-ck-action-value-source', '[data-expiration-override-date]'],
      ['data-ck-action-value-required', 'true']
    ]);

    const context = resolveHtmlPreviewActionContext({
      getAttribute: name => attrs.get(name) ?? null,
      readValue: selector => (selector === '[data-expiration-override-date]' ? '2026-03-24' : '')
    });

    expect(context).toEqual({
      values: {
        MP_EXP_DATE_OVERRIDE: '2026-03-24'
      }
    });
  });

  it('reports required dynamic values that are blank', () => {
    const attrs = new Map<string, string>([
      ['data-ck-action-value-field', 'MP_EXP_DATE_OVERRIDE'],
      ['data-ck-action-value-source', '[data-expiration-override-date]'],
      ['data-ck-action-value-required', 'true']
    ]);

    const context = resolveHtmlPreviewActionContext({
      getAttribute: name => attrs.get(name) ?? null,
      readValue: () => ''
    });

    expect(context).toEqual({
      missingRequiredValues: ['MP_EXP_DATE_OVERRIDE']
    });
  });

  it('allows optional dynamic values to clear a field', () => {
    const attrs = new Map<string, string>([
      ['data-ck-action-value-field', 'MP_EXP_DATE_OVERRIDE'],
      ['data-ck-action-value-source', '[data-expiration-override-date]']
    ]);

    const context = resolveHtmlPreviewActionContext({
      getAttribute: name => attrs.get(name) ?? null,
      readValue: () => ''
    });

    expect(context).toEqual({
      values: {
        MP_EXP_DATE_OVERRIDE: ''
      }
    });
  });
});
