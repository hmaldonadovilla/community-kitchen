import { isLineItemGroupQuestionComplete } from '../../../src/web/react/components/form/completeness';

describe('isLineItemGroupQuestionComplete (progress)', () => {
  test('ignores expandGate-disabled progressive rows when computing completion', () => {
    const lineItemConfig: any = {
      ui: {
        mode: 'progressive',
        expandGate: 'collapsedFieldsValid',
        defaultCollapsed: true,
        collapsedFields: [{ fieldId: 'A', showLabel: true }]
      },
      fields: [
        {
          id: 'A',
          type: 'TEXT',
          labelEn: 'A',
          labelFr: 'A',
          labelNl: 'A',
          required: true,
          options: [],
          optionsFr: [],
          optionsNl: []
        },
        {
          id: 'B',
          type: 'TEXT',
          labelEn: 'B',
          labelFr: 'B',
          labelNl: 'B',
          required: true,
          options: [],
          optionsFr: [],
          optionsNl: []
        }
      ]
    };

    const ok = isLineItemGroupQuestionComplete({
      groupId: 'MEALS',
      lineItemConfig,
      values: {},
      lineItems: {
        // r1 is disabled (collapsed + missing collapsed required A)
        MEALS: [
          { id: 'r1', values: { B: 'x' } },
          // r2 is enabled and complete
          { id: 'r2', values: { A: 'a', B: 'b' } }
        ]
      },
      collapsedRows: {},
      language: 'EN',
      getTopValue: () => undefined
    });

    expect(ok).toBe(true);
  });

  test('returns false when all rows are disabled by expandGate', () => {
    const lineItemConfig: any = {
      ui: {
        mode: 'progressive',
        expandGate: 'collapsedFieldsValid',
        defaultCollapsed: true,
        collapsedFields: [{ fieldId: 'A', showLabel: true }]
      },
      fields: [
        {
          id: 'A',
          type: 'TEXT',
          labelEn: 'A',
          labelFr: 'A',
          labelNl: 'A',
          required: true,
          options: [],
          optionsFr: [],
          optionsNl: []
        }
      ]
    };

    const ok = isLineItemGroupQuestionComplete({
      groupId: 'MEALS',
      lineItemConfig,
      values: {},
      lineItems: { MEALS: [{ id: 'r1', values: {} }] },
      collapsedRows: {},
      language: 'EN',
      getTopValue: () => undefined
    });

    expect(ok).toBe(false);
  });
});

