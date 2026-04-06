jest.mock('../../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

import { fetchDataSource } from '../../../src/web/data/dataSources';
import { runSelectionEffects } from '../../../src/web/react/app/selectionEffects';
import { runSelectionEffectsForAncestors } from '../../../src/web/react/app/runSelectionEffectsForAncestors';
import {
  buildSubgroupKey,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  ROW_SOURCE_KEY
} from '../../../src/web/react/app/lineItems';
import type { LineItemState } from '../../../src/web/react/types';
import type { FieldValue } from '../../../src/web/types';
import type { WebFormDefinition, WebQuestionDefinition } from '../../../src/types';

describe('selectionEffects ancestor propagation (change)', () => {
  beforeEach(() => {
    (fetchDataSource as unknown as jest.Mock).mockReset();
  });

  it('recomputes ancestor-derived fields immediately after selection-effect line item mutations', async () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
              {
                id: 'MP_TO_COOK',
                type: 'NUMBER',
                label: { en: 'To cook', fr: 'To cook', nl: 'To cook' },
                required: false,
                derivedValue: {
                  op: 'calc',
                  expression: '{QTY} - SUM(MP_TYPE_LI.PREP_QTY)',
                  lineItemFilters: [
                    { ref: 'MP_TYPE_LI.PREP_QTY', when: { fieldId: 'PREP_TYPE', equals: ['Entire dish'] } }
                  ]
                },
                selectionEffects: [
                  {
                    id: 'sync_cook_row',
                    type: 'deleteLineItems',
                    groupId: 'MP_TYPE_LI',
                    targetEffectId: 'sync_cook_row_add'
                  },
                  {
                    id: 'sync_cook_row_add',
                    type: 'addLineItems',
                    groupId: 'MP_TYPE_LI',
                    when: { fieldId: 'MP_TO_COOK', greaterThan: 0 },
                    preset: { PREP_QTY: '$row.MP_TO_COOK', PREP_TYPE: 'Cook' },
                    replaceExistingByEffectId: true,
                    hideRemoveButton: true
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  {
                    id: 'USE_QTY',
                    type: 'NUMBER',
                    label: { en: 'Use qty', fr: 'Use qty', nl: 'Use qty' },
                    selectionEffects: [
                      {
                        id: 'sync_leftover_row',
                        type: 'deleteLineItems',
                        groupId: 'MP_TYPE_LI',
                        targetEffectId: 'sync_leftover_row_add'
                      },
                      {
                        id: 'sync_leftover_row_add',
                        type: 'addLineItems',
                        groupId: 'MP_TYPE_LI',
                        when: { fieldId: 'USE_QTY', greaterThan: 0 },
                        preset: { PREP_QTY: '$row.USE_QTY', PREP_TYPE: 'Entire dish' },
                        replaceExistingByEffectId: true,
                        hideRemoveButton: true
                      }
                    ]
                  }
                ]
              },
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' } }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const mealRowId = 'meal_1';
    const leftoversKey = buildSubgroupKey('MEALS', mealRowId, 'LEFTOVERS');
    const prepKey = buildSubgroupKey('MEALS', mealRowId, 'MP_TYPE_LI');
    let values: Record<string, FieldValue> = {};
    let lineItems: LineItemState = {
      MEALS: [{ id: mealRowId, values: { QTY: 10, MP_TO_COOK: 10 } }],
      [leftoversKey]: [{ id: 'leftover_1', values: { USE_QTY: '' } }],
      [prepKey]: []
    };

    const setValues = (next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: LineItemState | ((prev: LineItemState) => LineItemState)) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    const invokeSelectionEffects = (
      question: WebQuestionDefinition,
      value: FieldValue,
      opts?: { lineItem?: { groupId: string; rowId: string; rowValues: any }; contextId?: string; forceContextReset?: boolean },
      snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState }
    ) => {
      const currentValues = snapshots?.values || values;
      const currentLineItems = snapshots?.lineItems || lineItems;
      runSelectionEffects({
        definition,
        question,
        value,
        language: 'EN' as any,
        values: currentValues,
        lineItems: currentLineItems,
        setValues,
        setLineItems,
        opts,
        onLineItemsMutated: ({ sourceGroupKey, prevLineItems, nextLineItems, nextValues }) => {
          globalThis.setTimeout(() => {
            runSelectionEffectsForAncestors({
              definition,
              values: nextValues,
              onSelectionEffect: (ancestorQuestion, ancestorValue, ancestorOpts) => {
                invokeSelectionEffects(ancestorQuestion, ancestorValue, ancestorOpts, {
                  values: nextValues,
                  lineItems: nextLineItems
                });
              },
              sourceGroupKey,
              prevLineItems,
              nextLineItems,
              options: { mode: 'change', topValues: nextValues }
            });
          }, 0);
        }
      });
    };

    invokeSelectionEffects(
      {
        id: 'USE_QTY',
        type: 'NUMBER',
        selectionEffects: [
          {
            id: 'sync_leftover_row',
            type: 'deleteLineItems',
            groupId: 'MP_TYPE_LI',
            targetEffectId: 'sync_leftover_row_add'
          },
          {
            id: 'sync_leftover_row_add',
            type: 'addLineItems',
            groupId: 'MP_TYPE_LI',
            when: { fieldId: 'USE_QTY', greaterThan: 0 },
            preset: { PREP_QTY: '$row.USE_QTY', PREP_TYPE: 'Entire dish' },
            replaceExistingByEffectId: true,
            hideRemoveButton: true
          }
        ]
      } as any,
      3,
      {
        lineItem: { groupId: leftoversKey, rowId: 'leftover_1', rowValues: { USE_QTY: 3 } }
      }
    );

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const prepRows = lineItems[prepKey] || [];
    expect(prepRows.some(row => row.values.PREP_TYPE === 'Entire dish' && Number(row.values.PREP_QTY) === 3)).toBe(true);
    expect(prepRows.some(row => row.values.PREP_TYPE === 'Cook' && Number(row.values.PREP_QTY) === 7)).toBe(true);
    const mealRow = (lineItems.MEALS || []).find(row => row.id === mealRowId);
    expect(Number(mealRow?.values?.MP_TO_COOK)).toBe(7);
  });

  it('regenerates sibling prep rows immediately when an entire-dish usage mode is selected', async () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'ORD_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
              {
                id: 'MP_TO_COOK',
                type: 'NUMBER',
                label: { en: 'To cook', fr: 'To cook', nl: 'To cook' },
                required: false,
                derivedValue: {
                  op: 'calc',
                  expression: '{ORD_QTY} - SUM(MP_TYPE_LI.PREP_QTY)',
                  lineItemFilters: [
                    { ref: 'MP_TYPE_LI.PREP_QTY', when: { fieldId: 'PREP_TYPE', equals: ['Entire dish'] } }
                  ]
                },
                selectionEffects: [
                  {
                    id: 'delete_mp_to_cook_sync',
                    type: 'deleteLineItems',
                    groupId: 'MP_TYPE_LI',
                    targetEffectId: 'mp_to_cook_sync'
                  },
                  {
                    id: 'mp_to_cook_sync',
                    type: 'addLineItems',
                    groupId: 'MP_TYPE_LI',
                    when: { fieldId: 'MP_TO_COOK', greaterThan: 0 },
                    preset: {
                      PREP_QTY: '$row.MP_TO_COOK',
                      PREP_TYPE: 'Cook',
                      RECIPE: 'Cooked dish'
                    },
                    replaceExistingByEffectId: true,
                    hideRemoveButton: true
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  { id: 'LEFTOVER_SELECTED', type: 'CHECKBOX', label: { en: 'Use', fr: 'Use', nl: 'Use' } },
                  { id: 'LEFTOVER_KIND', type: 'TEXT', label: { en: 'Kind', fr: 'Kind', nl: 'Kind' } },
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' } },
                  { id: 'LEFTOVER_RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' } },
                  { id: 'LEFTOVER_USE_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
                  { id: 'LEFTOVER_USAGE_MODE', type: 'CHOICE', label: { en: 'Mode', fr: 'Mode', nl: 'Mode' } }
                ]
              },
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' } },
                  { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' } },
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' } }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const mealRowId = 'meal_1';
    const leftoversKey = buildSubgroupKey('MEALS', mealRowId, 'LEFTOVERS');
    const prepKey = buildSubgroupKey('MEALS', mealRowId, 'MP_TYPE_LI');
    let values: Record<string, FieldValue> = {};
    let lineItems: LineItemState = {
      MEALS: [{ id: mealRowId, values: { ORD_QTY: 10, MP_TO_COOK: 10 } }],
      [leftoversKey]: [
        {
          id: 'leftover_1',
          values: {
            LEFTOVER_SELECTED: true,
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_ID: 'LE-4',
            LEFTOVER_RECIPE: 'Rice curry & fish',
            LEFTOVER_USE_QTY: 5,
            LEFTOVER_USAGE_MODE: ''
          }
        }
      ],
      [prepKey]: []
    };

    const setValues = (next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: LineItemState | ((prev: LineItemState) => LineItemState)) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    const invokeSelectionEffects = (
      question: WebQuestionDefinition,
      value: FieldValue,
      opts?: { lineItem?: { groupId: string; rowId: string; rowValues: any }; contextId?: string; forceContextReset?: boolean },
      snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState }
    ) => {
      const currentValues = snapshots?.values || values;
      const currentLineItems = snapshots?.lineItems || lineItems;
      runSelectionEffects({
        definition,
        question,
        value,
        language: 'EN' as any,
        values: currentValues,
        lineItems: currentLineItems,
        setValues,
        setLineItems,
        opts,
        onLineItemsMutated: ({ sourceGroupKey, prevLineItems, nextLineItems, nextValues }) => {
          globalThis.setTimeout(() => {
            runSelectionEffectsForAncestors({
              definition,
              values: nextValues,
              onSelectionEffect: (ancestorQuestion, ancestorValue, ancestorOpts) => {
                invokeSelectionEffects(ancestorQuestion, ancestorValue, ancestorOpts, {
                  values: nextValues,
                  lineItems: nextLineItems
                });
              },
              sourceGroupKey,
              prevLineItems,
              nextLineItems,
              options: { mode: 'change', topValues: nextValues }
            });
          }, 0);
        }
      });
    };

    invokeSelectionEffects(
      {
        id: 'LEFTOVER_USAGE_MODE',
        type: 'CHOICE',
        selectionEffects: [
          {
            type: 'deleteLineItems',
            groupId: 'MP_TYPE_LI',
            targetEffectId: 'sync_leftover_entire_reheat_prep'
          },
          {
            type: 'deleteLineItems',
            groupId: 'MP_TYPE_LI',
            targetEffectId: 'sync_leftover_entire_combine_prep'
          },
          {
            id: 'sync_leftover_entire_reheat_prep',
            type: 'addLineItems',
            groupId: 'MP_TYPE_LI',
            when: {
              all: [
                { fieldId: 'LEFTOVER_SELECTED', equals: true },
                { fieldId: 'LEFTOVER_KIND', equals: 'Entire dish' },
                { fieldId: 'LEFTOVER_ID', notEmpty: true },
                { fieldId: 'LEFTOVER_USE_QTY', greaterThan: 0 },
                { fieldId: 'LEFTOVER_USAGE_MODE', equals: 'Reheat' }
              ]
            },
            preset: {
              PREP_TYPE: 'Entire dish',
              PREP_QTY: '$row.LEFTOVER_USE_QTY',
              RECIPE: '$row.LEFTOVER_RECIPE',
              LEFTOVER_ID: '$row.LEFTOVER_ID'
            },
            replaceExistingByEffectId: true,
            hideRemoveButton: true
          },
          {
            id: 'sync_leftover_entire_combine_prep',
            type: 'addLineItems',
            groupId: 'MP_TYPE_LI',
            when: {
              all: [
                { fieldId: 'LEFTOVER_SELECTED', equals: true },
                { fieldId: 'LEFTOVER_KIND', equals: 'Entire dish' },
                { fieldId: 'LEFTOVER_ID', notEmpty: true },
                { fieldId: 'LEFTOVER_USE_QTY', greaterThan: 0 },
                { fieldId: 'LEFTOVER_USAGE_MODE', equals: 'Combine' }
              ]
            },
            preset: {
              PREP_TYPE: 'Part dish',
              PREP_QTY: '$row.LEFTOVER_USE_QTY',
              RECIPE: '$row.LEFTOVER_RECIPE',
              LEFTOVER_ID: '$row.LEFTOVER_ID'
            },
            replaceExistingByEffectId: true,
            hideRemoveButton: true
          }
        ]
      } as any,
      'Reheat',
      {
        lineItem: {
          groupId: leftoversKey,
          rowId: 'leftover_1',
          rowValues: {
            LEFTOVER_SELECTED: true,
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_ID: 'LE-4',
            LEFTOVER_RECIPE: 'Rice curry & fish',
            LEFTOVER_USE_QTY: 5,
            LEFTOVER_USAGE_MODE: 'Reheat'
          }
        }
      }
    );

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const prepRows = lineItems[prepKey] || [];
    const leftoverRow = prepRows.find(row => row.values.PREP_TYPE === 'Entire dish');
    const cookRow = prepRows.find(row => row.values.PREP_TYPE === 'Cook');
    expect(leftoverRow).toBeTruthy();
    expect(Number(leftoverRow?.values.PREP_QTY)).toBe(5);
    expect(leftoverRow?.values.RECIPE).toBe('Rice curry & fish');
    expect(leftoverRow?.values.LEFTOVER_ID).toBe('LE-4');
    expect(cookRow).toBeTruthy();
    expect(Number(cookRow?.values.PREP_QTY)).toBe(5);
    const mealRow = (lineItems.MEALS || []).find(row => row.id === mealRowId);
    expect(Number(mealRow?.values?.MP_TO_COOK)).toBe(5);
  });

  it('recomputes same-row recipe ingredients when an auto row multiplier changes', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          QFTD5RD2EM: 'Dhaal (diabetic)',
          NUM_PORTIONS: 15,
          Q65ILNUSGL: [{ ING: 'Salt', QTY: 4, UNIT: 'Tbsp' }]
        }
      ]
    });

    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [
              {
                id: 'MP_TO_COOK',
                type: 'NUMBER',
                label: { en: 'To cook', fr: 'To cook', nl: 'To cook' },
                required: false,
                selectionEffects: [
                  {
                    id: 'mp_to_cook_sync',
                    type: 'addLineItems',
                    groupId: 'MP_TYPE_LI',
                    when: { fieldId: 'MP_TO_COOK', greaterThan: 0 },
                    preset: {
                      PREP_QTY: '$row.MP_TO_COOK',
                      PREP_TYPE: 'Cook'
                    },
                    replaceExistingByEffectId: true,
                    hideRemoveButton: true
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' } },
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
                  {
                    id: 'RECIPE',
                    type: 'CHOICE',
                    label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' },
                    required: false,
                    dataSource: {
                      id: 'Recipes Data',
                      mode: 'options',
                      projection: ['QFTD5RD2EM', 'NUM_PORTIONS', 'Q65ILNUSGL']
                    } as any,
                    selectionEffects: [
                      {
                        id: 'recipe_ingredients_sync',
                        type: 'addLineItemsFromDataSource',
                        groupId: 'MP_INGREDIENTS_LI',
                        targetPath: 'MP_INGREDIENTS_LI',
                        lookupField: 'QFTD5RD2EM',
                        dataField: 'Q65ILNUSGL',
                        rowMultiplierFieldId: 'PREP_QTY',
                        dataSourceMultiplierField: 'NUM_PORTIONS',
                        scaleNumericFields: ['QTY'],
                        lineItemMapping: {
                          ING: 'ING',
                          QTY: 'QTY',
                          UNIT: 'UNIT'
                        },
                        aggregateBy: ['ING', 'UNIT'],
                        aggregateNumericFields: ['QTY'],
                        preserveManualRows: false
                      }
                    ]
                  }
                ],
                subGroups: [
                  {
                    id: 'MP_INGREDIENTS_LI',
                    fields: [
                      { id: 'ING', type: 'TEXT', label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' } },
                      { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
                      { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' } }
                    ]
                  }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const mealRowId = 'meal_1';
    const prepKey = buildSubgroupKey('MEALS', mealRowId, 'MP_TYPE_LI');
    const ingredientsKey = buildSubgroupKey(prepKey, 'cook_1', 'MP_INGREDIENTS_LI');
    let values: Record<string, FieldValue> = {};
    let lineItems: LineItemState = {
      MEALS: [{ id: mealRowId, values: { MP_TO_COOK: 5 } }],
      [prepKey]: [
        {
          id: 'cook_1',
          values: {
            PREP_TYPE: 'Cook',
            PREP_QTY: 5,
            RECIPE: 'Dhaal (diabetic)',
            [ROW_SOURCE_KEY]: 'auto',
            [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
            [ROW_PARENT_GROUP_ID_KEY]: 'MEALS',
            [ROW_PARENT_ROW_ID_KEY]: mealRowId
          },
          autoGenerated: true,
          effectContextId: 'MEALS::meal_1::MP_TO_COOK::mp_to_cook_sync'
        }
      ],
      [ingredientsKey]: [{ id: 'ing_1', values: { ING: 'Salt', QTY: '1.33', UNIT: 'Tbsp' } }]
    };

    const setValues = (next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: LineItemState | ((prev: LineItemState) => LineItemState)) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    const invokeSelectionEffects = (
      question: WebQuestionDefinition,
      value: FieldValue,
      opts?: { lineItem?: { groupId: string; rowId: string; rowValues: any }; contextId?: string; forceContextReset?: boolean },
      snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState }
    ) => {
      const currentValues = snapshots?.values || values;
      const currentLineItems = snapshots?.lineItems || lineItems;
      runSelectionEffects({
        definition,
        question,
        value,
        language: 'EN' as any,
        values: currentValues,
        lineItems: currentLineItems,
        setValues,
        setLineItems,
        opts,
        onLineItemsMutated: ({ sourceGroupKey, prevLineItems, nextLineItems, nextValues }) => {
          globalThis.setTimeout(() => {
            runSelectionEffectsForAncestors({
              definition,
              values: nextValues,
              onSelectionEffect: (ancestorQuestion, ancestorValue, ancestorOpts) => {
                invokeSelectionEffects(ancestorQuestion, ancestorValue, ancestorOpts, {
                  values: nextValues,
                  lineItems: nextLineItems
                });
              },
              sourceGroupKey,
              prevLineItems,
              nextLineItems,
              options: { mode: 'change', topValues: nextValues }
            });
          }, 0);
        }
      });
    };

    invokeSelectionEffects(
      {
        id: 'MP_TO_COOK',
        type: 'NUMBER',
        selectionEffects: [
          {
            id: 'mp_to_cook_sync',
            type: 'addLineItems',
            groupId: 'MP_TYPE_LI',
            when: { fieldId: 'MP_TO_COOK', greaterThan: 0 },
            preset: {
              PREP_QTY: '$row.MP_TO_COOK',
              PREP_TYPE: 'Cook'
            },
            replaceExistingByEffectId: true,
            hideRemoveButton: true
          }
        ]
      } as any,
      50,
      {
        lineItem: {
          groupId: 'MEALS',
          rowId: mealRowId,
          rowValues: { MP_TO_COOK: 50 }
        }
      }
    );

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const cookRow = (lineItems[prepKey] || []).find(row => row.id === 'cook_1');
    expect(Number(cookRow?.values.PREP_QTY)).toBe(50);
    const ingredientRows = lineItems[ingredientsKey] || [];
    expect(ingredientRows).toHaveLength(1);
    expect(Number(ingredientRows[0].values.QTY)).toBe(13.33);
    expect(ingredientRows[0].values.UNIT).toBe('Tbsp');
  });
});
