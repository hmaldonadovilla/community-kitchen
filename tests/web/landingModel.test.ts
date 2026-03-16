import { appendAdminQuery, pickLandingLogoUrl, resolveLandingHeaderTitle } from '../../src/web/react/landing/model';

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
});
