import {
  buildSourceFirstSelectionTogglePatch,
  collectSourceFirstSentenceFieldErrorMap,
  collectSourceFirstSentenceFieldErrors,
  fieldByIdSafe,
  formatLineItemTotalValue,
  getByPath,
  hasAvailabilityPairValue,
  listSortFor,
  normalizeIdValue,
  optionSortFor,
  resolveCompactPartType,
  resolveSourceFirstAllocationDisplayValue,
  resolveSourceFirstCompactTextParts,
  resolveSourceFirstListScrollStyle,
  sortSourceFirstVisibleSourceRows,
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

  test('resolves source-first list scroll style from max visible rows', () => {
    expect(resolveSourceFirstListScrollStyle(undefined)).toBeUndefined();
    expect(resolveSourceFirstListScrollStyle(0)).toBeUndefined();
    expect(resolveSourceFirstListScrollStyle(2.8)).toEqual({
      maxHeight: '264px',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      touchAction: 'pan-y'
    });
  });

  test('infers compact field part type from source and field alternatives', () => {
    expect(resolveCompactPartType(null)).toBe('text');
    expect(resolveCompactPartType({ type: 'badge' })).toBe('badge');
    expect(resolveCompactPartType({ sourcePath: 'recipe.name' })).toBe('field');
    expect(resolveCompactPartType({ fieldIdAlternatives: ['', 'mealType'] })).toBe('field');
    expect(resolveCompactPartType({ text: 'literal' })).toBe('text');
  });

  test('builds source-first selection toggle patches with quantity and mode defaults', () => {
    const fieldById = new Map<string, any>([
      ['quantity', { id: 'quantity' }],
      ['mode', { id: 'mode' }]
    ]);
    const patch = buildSourceFirstSelectionTogglePatch({
      checked: true,
      selectedFieldId: 'selected',
      virtualValues: { maxQuantity: 12 },
      quantityFieldId: 'quantity',
      modeFieldId: 'mode',
      defaultModeValue: 'reserve',
      fieldById,
      parentValues: {},
      resolveMaxFieldId: () => 'maxQuantity'
    });

    expect(patch).toEqual({
      selected: true,
      quantity: '12',
      mode: 'reserve'
    });
  });

  test('builds source-first deselection patches without applying defaults', () => {
    const patch = buildSourceFirstSelectionTogglePatch({
      checked: false,
      selectedFieldId: 'selected',
      virtualValues: { maxQuantity: 12 },
      quantityFieldId: 'quantity',
      modeFieldId: 'mode',
      defaultModeValue: 'reserve',
      fieldById: new Map([['quantity', { id: 'quantity' }]]),
      parentValues: {},
      resolveMaxFieldId: () => 'maxQuantity'
    });

    expect(patch).toEqual({ selected: false });
  });

  test('collects first unique source-first sentence field validation errors', () => {
    const fieldById = new Map<string, any>([
      ['quantity', { id: 'quantity' }],
      ['mode', { id: 'mode' }]
    ]);
    const messages = collectSourceFirstSentenceFieldErrors({
      parts: [{ fieldId: 'quantity' }, { fieldId: 'mode' }, { fieldId: 'quantity' }, { text: 'literal' }],
      fieldById,
      virtualValues: { quantity: '', mode: '' },
      parentValues: {},
      validateFieldRules: field => (field.id === 'quantity' ? ['Quantity required'] : ['Mode required'])
    });

    expect(messages).toEqual(['Quantity required', 'Mode required']);
  });

  test('keeps field-level source-first sentence errors per field even when messages match', () => {
    const fieldById = new Map<string, any>([
      ['quantity', { id: 'quantity' }],
      ['mode', { id: 'mode' }]
    ]);
    const map = collectSourceFirstSentenceFieldErrorMap({
      parts: [{ fieldId: 'quantity' }, { fieldId: 'mode' }],
      fieldById,
      virtualValues: { quantity: '', mode: '' },
      parentValues: {},
      validateFieldRules: () => ['Required']
    });

    expect(map).toEqual({ quantity: 'Required', mode: 'Required' });
    expect(
      collectSourceFirstSentenceFieldErrors({
        parts: [{ fieldId: 'quantity' }, { fieldId: 'mode' }],
        fieldById,
        virtualValues: { quantity: '', mode: '' },
        parentValues: {},
        validateFieldRules: () => ['Required']
      })
    ).toEqual(['Required']);
  });

  test('resolves source-first allocation display values', () => {
    const mealTypeField = {
      id: 'mealType',
      type: 'CHOICE',
      options: {
        en: ['veg', 'meat']
      },
      optionsRaw: [
        { __ckOptionValue: 'veg', __ckOptionLabel: 'Vegetarian' },
        { __ckOptionValue: 'meat', __ckOptionLabel: 'Meat' }
      ]
    };
    expect(
      resolveSourceFirstAllocationDisplayValue({
        field: mealTypeField,
        virtualValues: { mealType: 'veg' },
        parentValues: {},
        language: 'EN'
      })
    ).toBe('Vegetarian');
    expect(
      resolveSourceFirstAllocationDisplayValue({
        field: { id: 'date', type: 'DATE' },
        virtualValues: {},
        parentValues: { date: '02/01/2026' },
        language: 'EN'
      })
    ).toBe('2026-01-02');
  });

  test('resolves source-first compact text parts from source rows and virtual values', () => {
    const fieldById = new Map<string, any>([
      ['portionCount', { id: 'portionCount', type: 'NUMBER' }],
      ['unit', { id: 'unit', type: 'TEXT' }]
    ]);
    const text = resolveSourceFirstCompactTextParts({
      parts: [
        { sourcePath: 'recipe.name' },
        { text: ' - ' },
        { fieldId: 'portionCount', suffixFieldId: 'unit' },
        {
          type: 'sourceListSummary',
          sourcePath: 'allergens',
          summaryFieldId: 'name',
          separator: ', ',
          sort: 'alphabetical'
        }
      ],
      virtualValues: { portionCount: 3 },
      parentValues: { unit: 'portions' },
      sourceRow: {
        recipe: { name: 'Soup' },
        allergens: [{ name: 'Soy' }, { name: 'Milk' }, { name: 'Soy' }]
      },
      fieldById,
      language: 'EN'
    });

    expect(text).toBe('Soup - 3 portionsMilk, Soy');
  });

  test('sorts source-first visible rows by resolved headline with source-key fallback', () => {
    const rows = [
      { sourceRow: { id: '2', name: 'Banana' }, eligibleParents: [{ id: 'p1', values: {} }] },
      { sourceRow: { id: '10', name: 'Apple' }, eligibleParents: [{ id: 'p1', values: {} }] },
      { sourceRow: { id: '1' }, eligibleParents: [{ id: 'p1', values: {} }] }
    ] as any[];
    const sourceOrder = sortSourceFirstVisibleSourceRows({
      rows,
      sortMode: 'source',
      config: { rowKeyFieldId: 'id' },
      compactHeadlineRows: [{ parts: [{ sourcePath: 'name' }] }],
      fieldById: new Map(),
      language: 'EN',
      buildVirtualValues: () => ({}),
      matchesRule: () => true
    });
    expect(sourceOrder).toBe(rows);

    const alphaOrder = sortSourceFirstVisibleSourceRows({
      rows,
      sortMode: 'alphabetical',
      config: { rowKeyFieldId: 'id' },
      compactHeadlineRows: [{ parts: [{ sourcePath: 'name' }] }],
      fieldById: new Map(),
      language: 'EN',
      buildVirtualValues: () => ({}),
      matchesRule: () => true
    });

    expect(alphaOrder.map(entry => entry.sourceRow.id)).toEqual(['1', '10', '2']);
    expect(rows.map(entry => entry.sourceRow.id)).toEqual(['2', '10', '1']);
  });
});
