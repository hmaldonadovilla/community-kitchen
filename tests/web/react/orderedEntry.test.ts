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
});
