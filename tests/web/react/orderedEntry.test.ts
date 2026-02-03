import { findOrderedEntryBlock } from '../../../src/web/react/components/form/orderedEntry';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';

describe('ordered entry blocking', () => {
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
});
