import { findFirstOrderedEntryIssue, findOrderedEntryBlock } from '../../../src/web/react/components/form/orderedEntry';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';

describe('ordered entry blocking', () => {
  test('finds first missing required field from the start of the ordered sequence', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [{ id: 'FIRST', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] }]
    };
    const issue = findFirstOrderedEntryIssue({
      definition,
      language: 'EN',
      values: {},
      lineItems: {},
      errors: {},
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions
    });
    expect(issue).toEqual({
      missingFieldPath: 'FIRST',
      scope: 'top',
      reason: 'missingRequired'
    });
  });

  test('advances first ordered issue to the next required field after filling the current one', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [
        { id: 'FIRST', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
        { id: 'SECOND', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] }
      ]
    };

    const firstIssue = findFirstOrderedEntryIssue({
      definition,
      language: 'EN',
      values: {},
      lineItems: {},
      errors: {},
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions
    });
    expect(firstIssue?.missingFieldPath).toBe('FIRST');

    const secondIssue = findFirstOrderedEntryIssue({
      definition,
      language: 'EN',
      values: { FIRST: 'ok' },
      lineItems: {},
      errors: {},
      resolveVisibilityValue: (fieldId: string) => ({ FIRST: 'ok' } as any)[fieldId],
      getTopValue: (fieldId: string) => ({ FIRST: 'ok' } as any)[fieldId],
      orderedQuestions: definition.questions
    });
    expect(secondIssue).toEqual({
      missingFieldPath: 'SECOND',
      scope: 'top',
      reason: 'missingRequired'
    });
  });

  test('blocks edits when a required earlier field is missing', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [
        { id: 'FIRST', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
        { id: 'SECOND', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] },
        { id: 'THIRD', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] }
      ]
    };
    const values = { SECOND: 'ok' };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values,
      lineItems: {},
      resolveVisibilityValue: (fieldId: string) => (values as any)[fieldId],
      getTopValue: (fieldId: string) => (values as any)[fieldId],
      orderedQuestions: definition.questions,
      target: { scope: 'top', questionId: 'THIRD' }
    });

    expect(block).toEqual({
      missingFieldPath: 'FIRST',
      scope: 'top',
      reason: 'missingRequired'
    });
  });

  test('blocks line item edits when earlier required row fields are missing', () => {
    const group = {
      id: 'ITEMS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          { id: 'A', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'B', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] }
        ]
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group]
    };
    const lineItems = { ITEMS: [{ id: 'row1', values: { B: 'later' } }] };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'line', groupId: 'ITEMS', rowId: 'row1', fieldId: 'B' },
      targetGroup: group as any
    });

    expect(block).toEqual({
      missingFieldPath: 'ITEMS__A__row1',
      scope: 'line',
      reason: 'missingRequired'
    });
  });

  test('blocks line item edits when validation rules require earlier fields (including parent refs)', () => {
    const subGroup = {
      id: 'MP_INGREDIENTS_LI',
      fields: [
        {
          id: 'QTY',
          type: 'NUMBER',
          required: false,
          validationRules: [
            {
              when: { fieldId: 'PREP_TYPE', equals: ['Cook'] },
              then: { fieldId: 'QTY', required: true },
              message: { en: 'Qty required' }
            }
          ]
        },
        {
          id: 'UNIT',
          type: 'CHOICE',
          required: false,
          validationRules: [
            {
              when: { fieldId: 'PREP_TYPE', equals: ['Cook'] },
              then: { fieldId: 'UNIT', required: true },
              message: { en: 'Unit required' }
            }
          ]
        }
      ]
    };

    const group = {
      id: 'MP_TYPE_LI',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'PREP_TYPE', type: 'CHOICE', required: false }],
        subGroups: [subGroup]
      }
    };

    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group]
    };

    const parentRowId = 'row_parent';
    const subRowId = 'row_sub';
    const subKey = buildSubgroupKey(group.id, parentRowId, subGroup.id);

    const lineItems = {
      [group.id]: [{ id: parentRowId, values: { PREP_TYPE: 'Cook' } }],
      [subKey]: [{ id: subRowId, values: { UNIT: 'kg' } }]
    };

    const subGroupDef: any = {
      id: subKey,
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: { fields: subGroup.fields }
    };

    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'line', groupId: subKey, rowId: subRowId, fieldId: 'UNIT' },
      targetGroup: subGroupDef
    });

    expect(block).toEqual({
      missingFieldPath: `${subKey}__QTY__${subRowId}`,
      scope: 'line',
      reason: 'missingRequired'
    });
  });

  test('blocks top-level edits when an earlier line item group has validation errors', () => {
    const group: any = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      required: false,
      lineItemConfig: {
        fields: [
          { id: 'ORD_QTY', type: 'NUMBER', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'FINAL_QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] }
        ]
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group, { id: 'NOTES', type: 'PARAGRAPH', required: false, options: [], optionsFr: [], optionsNl: [] }]
    };
    const lineItems: any = {
      MP_MEALS_REQUEST: [{ id: 'row1', values: { ORD_QTY: 100, FINAL_QTY: 60 } }]
    };
    const errors = {
      MP_MEALS_REQUEST__FINAL_QTY__row1: 'Delivered portions must be >= ordered.'
    };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      errors,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'top', questionId: 'NOTES' }
    });
    expect(block).toEqual({
      missingFieldPath: 'MP_MEALS_REQUEST__FINAL_QTY__row1',
      scope: 'top',
      reason: 'invalid'
    });
  });

  test('prefers row-level field errors over group-level errors for ordered-entry blocking', () => {
    const group: any = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      required: false,
      lineItemConfig: {
        fields: [
          { id: 'MEAL_TYPE', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'ORD_QTY', type: 'NUMBER', required: true, options: [], optionsFr: [], optionsNl: [] }
        ]
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group, { id: 'NOTES', type: 'PARAGRAPH', required: false, options: [], optionsFr: [], optionsNl: [] }]
    };
    const lineItems: any = {
      MP_MEALS_REQUEST: [{ id: 'row1', values: { MEAL_TYPE: 'Vegetarian', ORD_QTY: -1 } }]
    };
    const errors = {
      MP_MEALS_REQUEST: 'Enter an integer ≥ 0 in all fields to record ordered portions.',
      MP_MEALS_REQUEST__ORD_QTY__row1: 'Ordered portions must be 0 or more'
    };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      errors,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'top', questionId: 'NOTES' }
    });
    expect(block).toEqual({
      missingFieldPath: 'MP_MEALS_REQUEST__ORD_QTY__row1',
      scope: 'top',
      reason: 'invalid'
    });
  });

  test('blocks line item edits when an earlier row field has a validation error', () => {
    const group: any = {
      id: 'ITEMS',
      type: 'LINE_ITEM_GROUP',
      required: false,
      lineItemConfig: {
        fields: [
          { id: 'A', type: 'NUMBER', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'B', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] },
          { id: 'C', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] }
        ]
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group]
    };
    const lineItems: any = { ITEMS: [{ id: 'row1', values: { A: 10, B: 5 } }] };
    const errors = { ITEMS__B__row1: 'B must be >= A' };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      errors,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'line', groupId: 'ITEMS', rowId: 'row1', fieldId: 'C' },
      targetGroup: group
    });
    expect(block).toEqual({
      missingFieldPath: 'ITEMS__B__row1',
      scope: 'line',
      reason: 'invalid'
    });
  });

  test('returns first missing line-item field path when an earlier line group is incomplete', () => {
    const group: any = {
      id: 'LINES',
      type: 'LINE_ITEM_GROUP',
      required: true,
      lineItemConfig: {
        fields: [
          { id: 'A', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'B', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] }
        ]
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [group, { id: 'NOTES', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] }]
    };
    const lineItems: any = { LINES: [{ id: 'row1', values: { B: 'later' } }] };
    const errors = { LINES__A__row1: 'A is required.' };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      errors,
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'top', questionId: 'NOTES' }
    });

    expect(block).toEqual({
      missingFieldPath: 'LINES__A__row1',
      scope: 'top',
      reason: 'missingRequired'
    });
  });

  test('does not block on excluded guided-step rows when no in-scope errors exist', () => {
    const scopedGroup: any = {
      id: 'LINES',
      type: 'LINE_ITEM_GROUP',
      required: true,
      lineItemConfig: {
        fields: [
          { id: 'A', type: 'TEXT', required: true, options: [], optionsFr: [], optionsNl: [] },
          { id: 'TYPE', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] }
        ],
        _guidedRowFilter: { fieldId: 'TYPE', equals: ['INCLUDED'] }
      }
    };
    const definition: any = {
      title: 'Test',
      destinationTab: 'Tab',
      languages: ['EN'],
      questions: [scopedGroup, { id: 'NEXT', type: 'TEXT', required: false, options: [], optionsFr: [], optionsNl: [] }]
    };
    const lineItems: any = {
      LINES: [
        { id: 'row1', values: { TYPE: 'INCLUDED', A: 'ok' } },
        { id: 'row2', values: { TYPE: 'EXCLUDED', A: '' } }
      ]
    };
    const block = findOrderedEntryBlock({
      definition,
      language: 'EN',
      values: {},
      lineItems,
      errors: {},
      resolveVisibilityValue: () => undefined,
      getTopValue: () => undefined,
      orderedQuestions: definition.questions,
      target: { scope: 'top', questionId: 'NEXT' }
    });

    expect(block).toBeNull();
  });
});
