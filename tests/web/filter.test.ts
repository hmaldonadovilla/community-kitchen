import { buildLocalizedOptions, computeAllowedOptions, computeNonMatchOptionKeys } from '../../src/web/rules/filter';

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

  it('supports multi-select dependency values (pipe-joined) by intersecting allowed sets', () => {
    const multi = {
      dependsOn: 'x',
      optionMap: {
        Vegan: ['Rice', 'Pasta', 'Beans'],
        'No-salt': ['Rice', 'Beans'],
        '*': ['Rice', 'Pasta', 'Beans', 'Salt']
      }
    };
    const allowed = computeAllowedOptions(multi as any, { en: ['Rice', 'Pasta', 'Beans', 'Salt'] } as any, ['Vegan|No-salt']);
    expect(allowed).toEqual(['Rice', 'Beans']);
  });

  it('multi-select: explicit full-key mapping takes precedence when present', () => {
    const multi = {
      dependsOn: 'x',
      optionMap: {
        Vegan: ['Rice'],
        'No-salt': ['Beans'],
        'Vegan|No-salt': ['Pasta'],
        '*': ['Rice', 'Beans', 'Pasta']
      }
    };
    const allowed = computeAllowedOptions(multi as any, { en: ['Rice', 'Beans', 'Pasta'] } as any, ['Vegan|No-salt']);
    expect(allowed).toEqual(['Pasta']);
  });

  it('supports matchMode="or" for multi-select dependencies (union)', () => {
    const multi = {
      dependsOn: 'x',
      matchMode: 'or',
      optionMap: {
        Vegan: ['Rice', 'Beans'],
        'No-salt': ['Rice'],
        '*': ['Rice', 'Beans', 'Salt']
      }
    };
    const allowed = computeAllowedOptions(multi as any, { en: ['Rice', 'Beans', 'Salt'] } as any, ['Vegan|No-salt']);
    expect(allowed).toEqual(['Rice', 'Beans']);
  });

  it('filters dataSource-backed options using dataSourceField', () => {
    const dataSourceFilter = {
      dependsOn: 'diet',
      dataSourceField: 'dietary',
      dataSourceDelimiter: ','
    };
    const options = {
      en: ['A', 'B', 'C'],
      raw: [
        { __ckOptionValue: 'A', dietary: 'Vegan, Vegetarian' },
        { __ckOptionValue: 'B', dietary: 'No-salt' },
        { __ckOptionValue: 'C', dietary: 'Vegan' }
      ]
    };
    const allowed = computeAllowedOptions(dataSourceFilter as any, options as any, ['Vegan']);
    expect(allowed).toEqual(['A', 'C']);
  });

  it('bypasses optionMap filtering when dependency value matches bypassValues', () => {
    const bypassFilter = {
      dependsOn: 'x',
      optionMap: {
        A: ['A'],
        '*': ['B']
      },
      bypassValues: ['All']
    };
    const allowed = computeAllowedOptions(bypassFilter as any, options as any, ['All']);
    expect(allowed).toEqual(options.en);
  });

  it('bypasses dataSource filtering when dependency value matches bypassValues', () => {
    const dataSourceFilter = {
      dependsOn: 'diet',
      dataSourceField: 'dietary',
      dataSourceDelimiter: ',',
      bypassValues: ['All']
    };
    const options = {
      en: ['A', 'B', 'C'],
      raw: [
        { __ckOptionValue: 'A', dietary: 'Vegan, Vegetarian' },
        { __ckOptionValue: 'B', dietary: 'No-salt' },
        { __ckOptionValue: 'C', dietary: 'Vegan' }
      ]
    };
    const allowed = computeAllowedOptions(dataSourceFilter as any, options as any, ['All']);
    expect(allowed).toEqual(options.en);
  });
});

describe('computeNonMatchOptionKeys', () => {
  it('returns non-matching keys for matchMode="or"', () => {
    const filter = {
      dependsOn: 'x',
      matchMode: 'or',
      optionMap: {
        Vegan: ['Rice', 'Beans'],
        'No-salt': ['Rice'],
        '*': ['Rice', 'Beans', 'Salt']
      }
    };
    const nonMatch = computeNonMatchOptionKeys({
      filter: filter as any,
      dependencyValues: ['Vegan|No-salt'],
      selectedValue: 'Beans'
    });
    expect(nonMatch).toEqual(['No-salt']);
  });
});

describe('buildLocalizedOptions (optionSort)', () => {
  it('sorts alphabetically by default', () => {
    const options: any = { en: ['B', 'A', 'C'], fr: ['B', 'A', 'C'], nl: ['B', 'A', 'C'] };
    const res = buildLocalizedOptions(options, options.en, 'EN');
    expect(res.map(r => r.value)).toEqual(['A', 'B', 'C']);
  });

  it('preserves source order when sort=source', () => {
    const options: any = { en: ['B', 'A', 'C'], fr: ['B', 'A', 'C'], nl: ['B', 'A', 'C'] };
    const res = buildLocalizedOptions(options, options.en, 'EN', { sort: 'source' });
    expect(res.map(r => r.value)).toEqual(['B', 'A', 'C']);
  });
});
