import { appendAdminQuery, buildBundledLandingCatalog, pickLandingLogoUrl, resolveLandingHeaderTitle } from '../../src/web/react/landing/model';

describe('landing model helpers', () => {
  test('appendAdminQuery appends admin=true without disturbing hash fragments', () => {
    expect(appendAdminQuery('https://example.test/app?form=A#section', true)).toBe(
      'https://example.test/app?form=A&admin=true#section'
    );
  });

  test('pickLandingLogoUrl returns the most common configured logo', () => {
    expect(
      pickLandingLogoUrl([
        { formKey: 'a', title: 'A', targetUrl: 'https://example.test/a', logoUrl: 'https://img.test/shared.png' },
        { formKey: 'b', title: 'B', targetUrl: 'https://example.test/b', logoUrl: 'https://img.test/other.png' },
        { formKey: 'c', title: 'C', targetUrl: 'https://example.test/c', logoUrl: 'https://img.test/shared.png' }
      ])
    ).toBe('https://img.test/shared.png');
  });

  test('resolveLandingHeaderTitle falls back to Community Kitchen when the document title is empty', () => {
    expect(resolveLandingHeaderTitle('')).toBe('Community Kitchen');
    expect(resolveLandingHeaderTitle('Landing')).toBe('Landing');
  });

  test('buildBundledLandingCatalog derives launcher items from embedded configs', () => {
    const items = buildBundledLandingCatalog([
      {
        formKey: 'Config: Meal Production',
        generatedAt: '2026-04-04T00:00:00.000Z',
        form: {
          title: 'Meal Production',
          configSheet: 'Config: Meal Production',
          description: 'Produce meals',
          appUrl: 'https://example.test/exec?form=Config%3A%20Meal%20Production',
          appHeader: {
            logoUrl: 'https://img.test/logo.png'
          }
        } as any,
        questions: [],
        dedupRules: [],
        definition: {} as any,
        validationErrors: []
      },
      {
        formKey: 'Config: Checklist',
        generatedAt: '2026-04-04T00:00:00.000Z',
        form: {
          title: 'Checklist',
          configSheet: 'Config: Checklist',
          appUrl: 'https://example.test/exec?form=Config%3A%20Checklist'
        } as any,
        questions: [],
        dedupRules: [],
        definition: {} as any,
        validationErrors: []
      }
    ] as any);

    expect(items).toEqual([
      {
        formKey: 'Config: Checklist',
        title: 'Checklist',
        description: undefined,
        targetUrl: 'https://example.test/exec?form=Config%3A%20Checklist',
        logoUrl: undefined
      },
      {
        formKey: 'Config: Meal Production',
        title: 'Meal Production',
        description: 'Produce meals',
        targetUrl: 'https://example.test/exec?form=Config%3A%20Meal%20Production',
        logoUrl: 'https://img.test/logo.png'
      }
    ]);
  });
});
