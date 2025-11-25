import { computeAllowedOptions } from '../../src/web/rules/filter';

describe('computeAllowedOptions', () => {
  const options = { en: ['A', 'B', 'C'], fr: ['Aa', 'Bb', 'Cc'], nl: ['Aa', 'Bb', 'Cc'] };
  const filter = {
    dependsOn: 'x',
    optionMap: {
      A: ['A', 'B'],
      B: ['C'],
      '*': ['A']
    }
  };

  it('returns mapped options for exact match', () => {
    const allowed = computeAllowedOptions(filter as any, options as any, ['A']);
    expect(allowed).toEqual(['A', 'B']);
  });

  it('falls back to wildcard', () => {
    const allowed = computeAllowedOptions(filter as any, options as any, ['Z']);
    expect(allowed).toEqual(['A']);
  });

  it('returns base options when no filter', () => {
    const allowed = computeAllowedOptions(undefined as any, options as any, []);
    expect(allowed).toEqual(options.en);
  });
});
