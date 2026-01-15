import { findOrderedEntryBlock } from '../../../src/web/react/components/form/orderedEntry';

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
});
