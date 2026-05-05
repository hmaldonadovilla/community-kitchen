import {
  areFormFieldValuesShallowEqual,
  areLineItemsShallowEqual,
  diffFormValues
} from '../../../src/web/react/components/form/formValueComparison';

describe('form value comparison helpers', () => {
  test('compares scalar and array field values shallowly', () => {
    expect(areFormFieldValuesShallowEqual('a', 'a')).toBe(true);
    expect(areFormFieldValuesShallowEqual('a', 'b')).toBe(false);
    expect(areFormFieldValuesShallowEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(areFormFieldValuesShallowEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(areFormFieldValuesShallowEqual(['a'], 'a')).toBe(true);
    expect(areFormFieldValuesShallowEqual(['a'], ['a', 'b'])).toBe(false);
  });

  test('returns changed top-level field ids', () => {
    expect(diffFormValues({ name: 'Soup', tags: ['hot'] }, { name: 'Soup', tags: ['hot'], qty: 3 })).toEqual(['qty']);
    expect(diffFormValues({ name: 'Soup', tags: ['hot'] }, { name: 'Stew', tags: ['hot'] })).toEqual(['name']);
    expect(diffFormValues({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
  });

  test('compares line-item rows by group, row order, row id, and field values', () => {
    const base = {
      meals: [
        { id: 'row1', values: { meal: 'Soup', qty: 2 } },
        { id: 'row2', values: { meal: 'Bread', tags: ['fresh'] } }
      ]
    } as any;
    expect(areLineItemsShallowEqual(base, {
      meals: [
        { id: 'row1', values: { meal: 'Soup', qty: 2 } },
        { id: 'row2', values: { meal: 'Bread', tags: ['fresh'] } }
      ]
    } as any)).toBe(true);
    expect(areLineItemsShallowEqual(base, {
      meals: [
        { id: 'row1', values: { meal: 'Soup', qty: 3 } },
        { id: 'row2', values: { meal: 'Bread', tags: ['fresh'] } }
      ]
    } as any)).toBe(false);
    expect(areLineItemsShallowEqual(base, {
      meals: [
        { id: 'row2', values: { meal: 'Bread', tags: ['fresh'] } },
        { id: 'row1', values: { meal: 'Soup', qty: 2 } }
      ]
    } as any)).toBe(false);
  });
});
