import { filterAnalyticsPageWidgets, formatAnalyticsValue } from '../../src/web/react/analytics/model';

describe('analytics model helpers', () => {
  test('filterAnalyticsPageWidgets keeps only analytics-page items', () => {
    expect(
      filterAnalyticsPageWidgets([
        { id: 'totalMeals', placements: ['analyticsPage'], valueNumber: 120 } as any,
        { id: 'listOnly', placements: ['listView'], valueNumber: 20 } as any,
        { id: 'defaultPlacement', valueNumber: 15 } as any
      ] as any)
    ).toEqual([
      { id: 'totalMeals', placements: ['analyticsPage'], valueNumber: 120 },
      { id: 'defaultPlacement', valueNumber: 15 }
    ]);
  });

  test('formatAnalyticsValue prefers explicit text and localizes numeric values', () => {
    expect(formatAnalyticsValue({ valueText: 'Ready' } as any, 'EN')).toBe('Ready');
    expect(formatAnalyticsValue({ valueNumber: 1234.5 } as any, 'FR')).toMatch(/1.?234,5/);
  });
});
