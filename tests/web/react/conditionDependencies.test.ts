import {
  collectFormWhenFieldIds,
  collectListViewWhenFieldIds
} from '../../../src/web/react/features/conditions/domain/conditionDependencies';

describe('condition dependency domain', () => {
  test('collects list-view dependencies from aliases and line item group clauses', () => {
    const ids = new Set<string>();
    collectListViewWhenFieldIds(
      {
        lineItems: {
          group: 'MEALS',
          when: [{ field: 'mealType' }, { id: 'recipeId' }],
          parentWhen: { fieldId: 'customer' }
        }
      },
      ids
    );

    expect(Array.from(ids)).toEqual(['MEALS', 'mealType', 'recipeId', 'customer']);
  });

  test('preserves form dependency behavior without adding line item group ids', () => {
    const ids = new Set<string>();
    collectFormWhenFieldIds(
      {
        lineItems: {
          group: 'MEALS',
          when: [{ field: 'ignoredAlias' }, { fieldId: 'quantity' }],
          parentWhen: { fieldId: 'customer' }
        },
        fieldId: 'topLevel'
      },
      ids
    );

    expect(Array.from(ids)).toEqual(['quantity', 'customer', 'topLevel']);
  });

  test('walks nested boolean clauses', () => {
    const ids = new Set<string>();
    collectFormWhenFieldIds({ all: [{ fieldId: 'a' }, { not: { any: [{ fieldId: 'b' }, { fieldId: 'c' }] } }] }, ids);

    expect(Array.from(ids)).toEqual(['a', 'b', 'c']);
  });
});
