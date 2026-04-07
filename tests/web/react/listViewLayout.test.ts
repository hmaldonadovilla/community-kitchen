import { resolveListViewLayout } from '../../../src/web/react/app/listViewLayout';

describe('listViewLayout', () => {
  it('returns null when layout is missing', () => {
    expect(resolveListViewLayout(undefined)).toBeNull();
  });

  it('filters invalid sections and preserves metric alignment', () => {
    expect(
      resolveListViewLayout({
        sections: ['metric', 'search', 'invalid' as any, 'results'],
        metricAlign: 'center'
      })
    ).toEqual({
      sections: ['metric', 'search', 'results'],
      metricAlign: 'center'
    });
  });

  it('defaults metric alignment to end', () => {
    expect(
      resolveListViewLayout({
        sections: ['search', 'results']
      })
    ).toEqual({
      sections: ['search', 'results'],
      metricAlign: 'end'
    });
  });
});
