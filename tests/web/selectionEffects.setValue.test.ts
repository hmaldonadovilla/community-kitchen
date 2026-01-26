import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { WebFormDefinition } from '../../src/types';

describe('selectionEffects setValue', () => {
  it('sets top-level values when the effect runs', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        { id: 'MP_IS_REHEAT', type: 'CHOICE', label: { en: 'Reheat', fr: 'Reheat', nl: 'Reheat' }, required: false } as any,
        { id: 'LEFTOVER_INFO', type: 'TEXT', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false } as any
      ]
    };

    let values: Record<string, any> = { MP_IS_REHEAT: 'No' };
    let lineItems: Record<string, any> = {};
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'MP_IS_REHEAT',
        selectionEffects: [{ type: 'setValue', fieldId: 'LEFTOVER_INFO', value: 'No left over' }]
      } as any,
      value: 'No',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    expect(values.LEFTOVER_INFO).toBe('No left over');
  });

  it('sets line-item values using $row references', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Lines', fr: 'Lines', nl: 'Lines' },
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
              { id: 'LEFTOVER_INFO', type: 'NUMBER', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [{ id: 'r1', values: { QTY: 3 } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'QTY',
        selectionEffects: [{ type: 'setValue', fieldId: 'LEFTOVER_INFO', value: '$row.QTY' }]
      } as any,
      value: 3,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'LINES', rowId: 'r1', rowValues: { QTY: 3 } } }
    });

    expect(lineItems.LINES[0].values.LEFTOVER_INFO).toBe(3);
  });

  it('clears values when setValue uses null', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [{ id: 'LEFTOVER_INFO', type: 'TEXT', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false } as any]
    };

    let values: Record<string, any> = { LEFTOVER_INFO: 'Keep' };
    let lineItems: Record<string, any> = {};
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'LEFTOVER_INFO',
        selectionEffects: [{ type: 'setValue', fieldId: 'LEFTOVER_INFO', value: null }]
      } as any,
      value: 'No',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    expect(values.LEFTOVER_INFO).toBeNull();
  });
});
