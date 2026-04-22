import { buildListViewAnalyticsMetrics, filterAnalyticsPageWidgets, formatAnalyticsValue } from '../../src/web/react/analytics/model';

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

  test('buildListViewAnalyticsMetrics uses widget placements and precision when snapshot metadata is stale', () => {
    expect(
      buildListViewAnalyticsMetrics(
        {
          formKey: 'Config: Meal Production',
          revision: 4,
          updatedAt: '2026-04-22T10:00:00.000Z',
          items: [
            {
              id: 'total_meals',
              label: { en: 'Meals produced' },
              valueNumber: 42,
              placements: ['analyticsPage'],
              updatedAt: '2026-04-22T10:00:00.000Z',
              revision: 4
            },
            {
              id: 'page_only',
              label: { en: 'Page only' },
              valueNumber: 3.25,
              placements: ['analyticsPage'],
              updatedAt: '2026-04-22T10:00:00.000Z',
              revision: 4
            }
          ]
        } as any,
        [
          {
            id: 'total_meals',
            label: { en: 'Meals produced' },
            placements: ['listView', 'analyticsPage'],
            maximumFractionDigits: 0
          }
        ] as any,
        'EN'
      )
    ).toEqual([{ id: 'total_meals', text: '42 Meals produced' }]);
  });
});
