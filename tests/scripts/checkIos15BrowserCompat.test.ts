const { findUnsupportedRegexSyntax } = require('../../scripts/check-ios15-browser-compat');

describe('iOS 15 browser compatibility check', () => {
  test('reports positive and negative regular-expression lookbehind syntax', () => {
    const source = 'const positive = /(?<=prefix)value/; const negative = /(?<!prefix)value/;';

    expect(findUnsupportedRegexSyntax(source)).toEqual([
      expect.objectContaining({ token: '(?<=', label: 'positive regular-expression lookbehind' }),
      expect.objectContaining({ token: '(?<!', label: 'negative regular-expression lookbehind' })
    ]);
  });

  test('allows lookahead and ordinary capture groups', () => {
    const source = 'const domain = /www(?=\\.)/; const value = /(prefix)value/;';

    expect(findUnsupportedRegexSyntax(source)).toEqual([]);
  });
});
