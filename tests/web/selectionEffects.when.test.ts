import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import {
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  buildSubgroupKey
} from '../../src/web/react/app/lineItems';
import { WebFormDefinition } from '../../src/types';

describe('selectionEffects when', () => {
  it('gates addLineItems using a numeric when clause in line items', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'MP_TO_COOK', type: 'NUMBER', label: { en: 'To cook', fr: 'To cook', nl: 'To cook' }, required: false }],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                label: { en: 'Cook', fr: 'Cook', nl: 'Cook' },
                fields: [
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'PREP_TYPE', type: 'CHOICE', label: { en: 'Type', fr: 'Type', nl: 'Type' }, required: false }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MP_MEALS_REQUEST: [{ id: 'p1', values: { MP_TO_COOK: 0 } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };
    const question = {
      id: 'MP_TO_COOK',
      selectionEffects: [
        {
          id: 'mp_to_cook_sync',
          type: 'addLineItems',
          groupId: 'MP_TYPE_LI',
          when: { fieldId: 'MP_TO_COOK', greaterThan: 0 },
          preset: { PREP_QTY: '$row.MP_TO_COOK', PREP_TYPE: 'Cook' }
        }
      ]
    } as any;

    runSelectionEffects({
      definition,
      question,
      value: 0,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MP_MEALS_REQUEST', rowId: 'p1', rowValues: { MP_TO_COOK: 0 } } }
    });

    const subKey = buildSubgroupKey('MP_MEALS_REQUEST', 'p1', 'MP_TYPE_LI');
    expect(lineItems[subKey] || []).toEqual([]);

    lineItems = {
      ...lineItems,
      MP_MEALS_REQUEST: [{ id: 'p1', values: { MP_TO_COOK: 5 } }]
    };

    runSelectionEffects({
      definition,
      question,
      value: 5,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MP_MEALS_REQUEST', rowId: 'p1', rowValues: { MP_TO_COOK: 5 } } }
    });

    const rows = lineItems[subKey] || [];
    expect(rows.length).toBe(1);
    expect(rows[0].values.PREP_QTY).toBe(5);
    expect(rows[0].values.PREP_TYPE).toBe('Cook');
  });

  it('upserts paired delete/add line-item sync rows without row-id churn', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'MP_TO_COOK', type: 'NUMBER', label: { en: 'To cook', fr: 'To cook', nl: 'To cook' }, required: false }],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                label: { en: 'Cook', fr: 'Cook', nl: 'Cook' },
                fields: [
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'PREP_TYPE', type: 'CHOICE', label: { en: 'Type', fr: 'Type', nl: 'Type' }, required: false }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    const subKey = buildSubgroupKey('MP_MEALS_REQUEST', 'p1', 'MP_TYPE_LI');
    let lineItems: Record<string, any> = {
      MP_MEALS_REQUEST: [{ id: 'p1', values: { MP_TO_COOK: 6 } }],
      [subKey]: [
        { id: 'entire_1', values: { PREP_TYPE: 'Entire dish', PREP_QTY: 2 } },
        {
          id: 'cook_1',
          values: {
            PREP_TYPE: 'Cook',
            PREP_QTY: 8,
            [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
            [ROW_PARENT_GROUP_ID_KEY]: 'MP_MEALS_REQUEST',
            [ROW_PARENT_ROW_ID_KEY]: 'p1'
          }
        }
      ]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };
    const question = {
      id: 'MP_TO_COOK',
      selectionEffects: [
        { id: 'delete_mp_to_cook_sync', type: 'deleteLineItems', groupId: 'MP_TYPE_LI', targetEffectId: 'mp_to_cook_sync' },
        { id: 'mp_to_cook_sync', type: 'addLineItems', groupId: 'MP_TYPE_LI', preset: { PREP_QTY: '$row.MP_TO_COOK', PREP_TYPE: 'Cook' } }
      ]
    } as any;

    runSelectionEffects({
      definition,
      question,
      value: 6,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MP_MEALS_REQUEST', rowId: 'p1', rowValues: { MP_TO_COOK: 6 } } }
    });

    const rows = lineItems[subKey] || [];
    const cookRows = rows.filter((row: any) => row?.values?.PREP_TYPE === 'Cook');
    expect(cookRows.length).toBe(1);
    expect(cookRows[0].id).toBe('cook_1');
    expect(cookRows[0].values.PREP_QTY).toBe(6);
  });
});
