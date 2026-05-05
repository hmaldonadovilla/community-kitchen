import {
  coerceCompactItemsCollectionAction,
  getCompactSourceValueAction,
  mapCompactActionEntriesAction,
  normalizeCompactLookupValueAction
} from '../../../src/web/react/features/lineItems/domain/compactLineItemRows';

describe('compact line item row domain', () => {
  test('normalizes lookup values from scalars and arrays', () => {
    expect(normalizeCompactLookupValueAction(['', null, ' ABC '])).toBe('abc');
    expect(normalizeCompactLookupValueAction(' Soup ')).toBe('soup');
    expect(normalizeCompactLookupValueAction(null)).toBe('');
  });

  test('resolves source values case-insensitively and from values fallback', () => {
    expect(getCompactSourceValueAction({ Nested: { Code: 'A1' } }, 'nested.code')).toBe('A1');
    expect(getCompactSourceValueAction({ values: { Meal: 'Soup' } }, 'meal')).toBe('Soup');
    expect(getCompactSourceValueAction({ other: true }, 'missing')).toBeUndefined();
  });

  test('coerces compact item collections from objects and json strings', () => {
    expect(coerceCompactItemsCollectionAction({ id: 1 })).toEqual([{ id: 1 }]);
    expect(coerceCompactItemsCollectionAction('[{\"id\":1},{\"id\":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(coerceCompactItemsCollectionAction('{\"id\":1}')).toEqual([{ id: 1 }]);
    expect(coerceCompactItemsCollectionAction('not json')).toEqual([]);
  });

  test('maps and aggregates compact action entries', () => {
    const mapped = mapCompactActionEntriesAction(
      [
        { item: 'soup', qty: '2', unit: 'kg' },
        { item: 'soup', qty: '3', unit: 'kg' },
        { item: 'salad', qty: '1', unit: 'kg' }
      ],
      {
        lineItemMapping: {
          MEAL: 'item',
          QTY: 'qty',
          UNIT: 'unit'
        },
        aggregateBy: ['MEAL', 'UNIT'],
        aggregateNumericFields: ['QTY']
      }
    );

    expect(mapped).toEqual([
      { MEAL: 'soup', QTY: 5, UNIT: 'kg' },
      { MEAL: 'salad', QTY: '1', UNIT: 'kg' }
    ]);
  });
});
