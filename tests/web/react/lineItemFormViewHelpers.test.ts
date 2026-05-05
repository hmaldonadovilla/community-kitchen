import {
  areFieldValuesEqual,
  areOverlayHeaderFieldsComplete,
  collectLineItemConfigEntries,
  parseLineFieldPath,
  resolveLineItemDedupMessage,
  resolveLineItemDedupValueToken,
  resolveOverlayHeaderFields,
  resolveRequiredValue
} from '../../../src/web/react/features/lineItems/domain/formViewHelpers';

describe('line item form view helpers', () => {
  test('compares field values with array and object support', () => {
    expect(areFieldValuesEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(areFieldValuesEqual(['a'], ['a', 'b'])).toBe(false);
    expect(areFieldValuesEqual({ a: 1 } as any, { a: 1 } as any)).toBe(true);
    expect(areFieldValuesEqual({ a: 1 } as any, { a: 2 } as any)).toBe(false);
  });

  test('parses encoded line field paths', () => {
    expect(parseLineFieldPath('group__field__row1')).toEqual({
      groupId: 'group',
      fieldId: 'field',
      rowId: 'row1'
    });
    expect(parseLineFieldPath('invalid')).toBeNull();
  });

  test('resolves overlay header fields from explicit, fallback, and default columns', () => {
    const groupCfg = {
      fields: [{ id: 'name' }, { id: 'qty' }, { id: 'mode' }],
      ui: { tableColumns: ['qty'] }
    };

    expect(resolveOverlayHeaderFields(groupCfg, { header: { tableColumns: ['name', 'missing'] } })).toEqual([{ id: 'name' }]);
    expect(resolveOverlayHeaderFields(groupCfg, {})).toEqual([{ id: 'qty' }]);
    expect(resolveOverlayHeaderFields({ fields: groupCfg.fields }, {})).toEqual(groupCfg.fields);
    expect(resolveOverlayHeaderFields(groupCfg, { header: { tableColumns: [] } })).toEqual([]);
  });

  test('checks overlay header completeness using required display values', () => {
    const fields = [{ id: 'name' }, { id: 'qty' }] as any[];
    expect(
      areOverlayHeaderFieldsComplete({
        fields,
        rowValues: { name: 'Soup', qty: 2 },
        ctx: { values: {}, lineItems: {} } as any,
        rowId: 'row1',
        linePrefix: 'group'
      })
    ).toBe(true);
    expect(
      areOverlayHeaderFieldsComplete({
        fields,
        rowValues: { name: 'Soup', qty: '' },
        ctx: { values: {}, lineItems: {} } as any,
        rowId: 'row1',
        linePrefix: 'group'
      })
    ).toBe(false);
    expect(resolveRequiredValue({ id: 'name', type: 'TEXT' }, 'Soup')).toBe('Soup');
  });

  test('collects nested line item config entries', () => {
    const entries = collectLineItemConfigEntries([
      {
        id: 'meals',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [],
          subGroups: [{ id: 'ingredients', fields: [], subGroups: [{ id: 'batches', fields: [] }] }]
        }
      } as any
    ]);

    expect(entries.map(entry => entry.id)).toEqual(['meals', 'meals.ingredients', 'meals.ingredients.batches']);
  });

  test('resolves dedup messages and display value tokens', () => {
    expect(
      resolveLineItemDedupMessage(
        { fields: ['name'], message: { en: 'Duplicate {value}', fr: 'Doublon {value}' } } as any,
        'fr',
        { value: 'Soup' }
      )
    ).toBe('Doublon Soup');
    expect(resolveLineItemDedupMessage({ fields: ['name'] } as any, 'en')).toBe('This entry already exists in this list.');
    expect(resolveLineItemDedupValueToken({ name: ['Soup', 'Bread'] }, 'name')).toBe('Soup, Bread');
  });
});
