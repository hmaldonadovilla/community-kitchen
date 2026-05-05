import {
  buildRowFlowContextHeaderAction,
  resolveRowFlowDisplayValueAction
} from '../../../src/web/react/features/lineItems/domain/rowFlowDisplayValue';

describe('row flow display value domain', () => {
  test('formats choice segment values with localized option labels', () => {
    const ensureLineOptions = jest.fn();

    const display = resolveRowFlowDisplayValueAction({
      segment: {
        id: 'mealTypes',
        config: { format: { type: 'list', listDelimiter: ' / ', sort: 'source' } },
        values: ['soup', 'salad'],
        target: { primaryRow: { row: { values: {} } } }
      } as any,
      targetGroupKey: 'MEALS',
      field: { id: 'MEAL_TYPE', type: 'CHOICE' },
      language: 'EN',
      resolveTopValue: () => undefined,
      ensureLineOptions,
      resolveOptionSetForField: () => ({ en: ['soup', 'salad'], fr: [], nl: [] }),
      resolveValueMapValue: () => undefined
    });

    expect(display).toEqual({ text: 'soup / salad', hasValue: true });
    expect(ensureLineOptions).toHaveBeenCalledWith('MEALS', { id: 'MEAL_TYPE', type: 'CHOICE' });
  });

  test('uses value-map output and fallback row values when primary values are empty', () => {
    const display = resolveRowFlowDisplayValueAction({
      segment: {
        id: 'fallback',
        config: { format: { type: 'list', listDelimiter: ', ', sort: 'alphabetical' } },
        values: [],
        fallbackValues: ['ignored'],
        fallbackTarget: { primaryRow: { row: { values: { CODE: 'x' } } } }
      } as any,
      targetGroupKey: 'PRIMARY',
      field: { id: 'PRIMARY_FIELD', type: 'TEXT' },
      fallbackGroupKey: 'FALLBACK',
      fallbackField: { id: 'LABEL', type: 'TEXT', valueMap: { kind: 'test' } },
      fallbackParentValues: { CODE: 'parent' },
      language: 'EN',
      resolveTopValue: () => 'top',
      ensureLineOptions: jest.fn(),
      resolveOptionSetForField: () => ({ en: [], fr: [], nl: [] }),
      resolveValueMapValue: (_valueMap, resolveValue) => [`${resolveValue('CODE')}-b`, `${resolveValue('CODE')}-a`]
    });

    expect(display).toEqual({ text: 'x-a, x-b', hasValue: true });
  });

  test('builds row-flow context headers from fallback top-level values', () => {
    const header = buildRowFlowContextHeaderAction({
      config: {
        fields: [
          { fieldRef: 'STATUS', label: { en: 'Status {{value}}' } },
          { fieldRef: 'MP_PREP_DATE', label: { en: 'Date' } }
        ]
      },
      rowId: 'row1',
      rowValues: {},
      rowFlowState: { references: [] } as any,
      groupId: 'MEALS',
      language: 'EN',
      resolveTopValue: fieldId => (fieldId === 'STATUS' ? 'Ready' : fieldId === 'MP_PREP_DATE' ? '2026-05-05' : undefined),
      resolveRowFlowFieldConfig: () => null,
      resolveRowFlowDisplayValue: () => ({ text: '', hasValue: false })
    });

    expect(header).toBe('Status Ready Date: Tue, 05-May-2026');
  });
});
