import {
  fieldByIdSafe,
  formatLineItemTotalValue,
  getByPath,
  hasAvailabilityPairValue,
  listSortFor,
  normalizeIdValue,
  optionSortFor,
  resolveCompactPartType,
  sortVisibleTextValues
} from '../../../src/web/react/features/lineItems/domain/lineItemPresentation';

describe('lineItem presentation domain', () => {
  test('resolves case-insensitive dotted paths', () => {
    expect(getByPath({ Recipe: { Name: 'Chili' } }, 'recipe.name')).toBe('Chili');
    expect(getByPath({ recipe: { name: 'Chili' } }, 'recipe.missing')).toBeUndefined();
  });

  test('formats ids, totals, and availability pair presence', () => {
    expect(normalizeIdValue('  abc  ')).toBe('abc');
    expect(normalizeIdValue(null)).toBe('');
    expect(formatLineItemTotalValue({ value: 12.345, decimalPlaces: 1 })).toBe('12.3');
    expect(formatLineItemTotalValue({ value: 12, pending: true })).toBe('');
    expect(hasAvailabilityPairValue({ remaining: ' ', reserved: 0 }, 'remaining', 'reserved')).toBe(true);
    expect(hasAvailabilityPairValue({ remaining: '', reserved: null }, 'remaining', 'reserved')).toBe(false);
  });

  test('resolves field lookup and sort modes', () => {
    const fields = [{ id: 'A', optionSort: 'source' }, { id: 'B' }];
    expect(fieldByIdSafe(fields, 'A')).toBe(fields[0]);
    expect(fieldByIdSafe(fields, 'C')).toBeNull();
    expect(optionSortFor(fields[0])).toBe('source');
    expect(optionSortFor(fields[1])).toBe('alphabetical');
    expect(listSortFor('alphabetical')).toBe('alphabetical');
    expect(listSortFor('other')).toBe('source');
    expect(sortVisibleTextValues(['b2', 'b10', 'a1'], 'alphabetical')).toEqual(['a1', 'b2', 'b10']);
    expect(sortVisibleTextValues(['b', 'a'], 'source')).toEqual(['b', 'a']);
  });

  test('infers compact field part type from source and field alternatives', () => {
    expect(resolveCompactPartType(null)).toBe('text');
    expect(resolveCompactPartType({ type: 'badge' })).toBe('badge');
    expect(resolveCompactPartType({ sourcePath: 'recipe.name' })).toBe('field');
    expect(resolveCompactPartType({ fieldIdAlternatives: ['', 'mealType'] })).toBe('field');
    expect(resolveCompactPartType({ text: 'literal' })).toBe('text');
  });
});
