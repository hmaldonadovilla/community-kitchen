import { resolveTableColumnWidthStyle } from '../../../src/web/react/features/lineItems/domain/tableColumnWidths';

describe('tableColumnWidths domain', () => {
  test('returns undefined for invalid or missing width configs', () => {
    expect(resolveTableColumnWidthStyle(null, 'name')).toBeUndefined();
    expect(resolveTableColumnWidthStyle([], 'name')).toBeUndefined();
    expect(resolveTableColumnWidthStyle({}, 'name')).toBeUndefined();
  });

  test('resolves numeric widths as percentages and trims string widths', () => {
    expect(resolveTableColumnWidthStyle({ name: 25 }, 'name')).toEqual({ width: '25%' });
    expect(resolveTableColumnWidthStyle({ name: '  12rem  ' }, 'name')).toEqual({ width: '12rem' });
  });

  test('resolves case-insensitive and normalized column ids', () => {
    expect(resolveTableColumnWidthStyle({ mealtype: '10rem' }, 'MealType')).toEqual({ width: '10rem' });
    expect(resolveTableColumnWidthStyle({ remove: '48px' }, '__remove')).toEqual({ width: '48px' });
    expect(resolveTableColumnWidthStyle({ actions: '64px' }, '__edit')).toEqual({ width: '64px' });
  });
});
