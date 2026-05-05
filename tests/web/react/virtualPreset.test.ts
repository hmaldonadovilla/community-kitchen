import {
  resolveVirtualPresetAction,
  resolveVirtualPresetValueAction
} from '../../../src/web/react/components/form/virtualPreset';

const context = {
  rowValues: { meal: 'Soup', quantity: 12 },
  parentValues: { customer: 'Belliard' },
  sourceRow: { recipe: { name: 'Chili' }, tags: ['hot', 'veg'] }
};

const resolveTopValue = (fieldId: string) => ({ date: '2026-05-05' } as any)[fieldId];

describe('virtual preset helpers', () => {
  test('resolves row, parent, top, and source tokens', () => {
    expect(resolveVirtualPresetValueAction({ raw: '$row.meal', context, resolveTopValue })).toBe('Soup');
    expect(resolveVirtualPresetValueAction({ raw: '$parent.customer', context, resolveTopValue })).toBe('Belliard');
    expect(resolveVirtualPresetValueAction({ raw: '$top.date', context, resolveTopValue })).toBe('2026-05-05');
    expect(resolveVirtualPresetValueAction({ raw: '$source.recipe.name', context, resolveTopValue })).toBe('Chili');
  });

  test('drops unresolved values from arrays and objects', () => {
    expect(
      resolveVirtualPresetValueAction({
        raw: ['$row.meal', '$parent.missing', '$source.recipe.name'],
        context,
        resolveTopValue
      })
    ).toEqual(['Soup', 'Chili']);
    expect(
      resolveVirtualPresetValueAction({
        raw: { meal: '$row.meal', missing: '$source.nope', source: '$source.recipe.name' },
        context,
        resolveTopValue
      })
    ).toEqual({ meal: 'Soup', source: 'Chili' });
  });

  test('resolves full preset records', () => {
    expect(
      resolveVirtualPresetAction({
        preset: {
          meal: '$row.meal',
          customer: '$parent.customer',
          sourceName: '$source.recipe.name',
          missing: '$top.missing'
        },
        context,
        resolveTopValue
      })
    ).toEqual({
      meal: 'Soup',
      customer: 'Belliard',
      sourceName: 'Chili'
    });
  });
});
