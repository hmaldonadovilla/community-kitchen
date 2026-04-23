jest.mock('../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

import { fetchDataSource } from '../../src/web/data/dataSources';
import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { buildSubgroupKey } from '../../src/web/react/app/lineItems';
import { WebFormDefinition } from '../../src/types';

describe('selectionEffects setValue', () => {
  beforeEach(() => {
    (fetchDataSource as unknown as jest.Mock).mockReset();
  });

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

  it('cascades line-item setValue updates into the target field selection effects', async () => {
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
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  {
                    id: 'LEFTOVER_SELECTED',
                    type: 'CHECKBOX',
                    label: { en: 'Use', fr: 'Use', nl: 'Use' },
                    selectionEffects: [
                      {
                        type: 'setValue',
                        fieldId: 'LEFTOVER_USE_QTY',
                        when: { fieldId: 'LEFTOVER_SELECTED', equals: true },
                        value: 5
                      }
                    ]
                  },
                  {
                    id: 'LEFTOVER_USE_QTY',
                    type: 'NUMBER',
                    label: { en: 'Qty', fr: 'Qty', nl: 'Qty' },
                    selectionEffects: [
                      {
                        id: 'sync_leftover_part_prep',
                        type: 'deleteLineItems',
                        groupId: 'MP_TYPE_LI',
                        targetEffectId: 'sync_leftover_part_prep_add'
                      },
                      {
                        id: 'sync_leftover_part_prep_add',
                        type: 'addLineItems',
                        groupId: 'MP_TYPE_LI',
                        when: { fieldId: 'LEFTOVER_USE_QTY', greaterThan: 0 },
                        preset: {
                          PREP_TYPE: 'Part dish',
                          PREP_QTY: '$row.LEFTOVER_USE_QTY'
                        },
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
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' } },
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    const leftoversKey = buildSubgroupKey('MEALS', 'meal_1', 'LEFTOVERS');
    const prepKey = buildSubgroupKey('MEALS', 'meal_1', 'MP_TYPE_LI');
    let lineItems: Record<string, any> = {
      MEALS: [{ id: 'meal_1', values: {} }],
      [leftoversKey]: [{ id: 'leftover_1', values: { LEFTOVER_SELECTED: true, LEFTOVER_USE_QTY: '' } }],
      [prepKey]: []
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
        id: 'LEFTOVER_SELECTED',
        selectionEffects: [
          {
            type: 'setValue',
            fieldId: 'LEFTOVER_USE_QTY',
            when: { fieldId: 'LEFTOVER_SELECTED', equals: true },
            value: 5
          }
        ]
      } as any,
      value: true,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: leftoversKey,
          rowId: 'leftover_1',
          rowValues: { LEFTOVER_SELECTED: true, LEFTOVER_USE_QTY: '' }
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(lineItems[leftoversKey][0].values.LEFTOVER_USE_QTY).toBe(5);
    expect(lineItems[prepKey]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.objectContaining({
            PREP_TYPE: 'Part dish',
            PREP_QTY: 5
          })
        })
      ])
    );
  });

  it('uses lookupSourceFieldId for data-driven line-item regeneration from a row id', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          ITEM_ID: 'LP-1',
          ITEM_NAME: 'Salt',
          ITEM_KIND: 'Part dish'
        }
      ]
    });

    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      dataSources: [
        {
          id: 'Inventory',
          formKey: 'Config: Inventory',
          mode: 'options',
          projection: ['ITEM_ID', 'ITEM_NAME', 'ITEM_KIND']
        } as any
      ],
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' } },
                  { id: 'LEFTOVER_SELECTED', type: 'CHECKBOX', label: { en: 'Use', fr: 'Use', nl: 'Use' } },
                  {
                    id: 'LEFTOVER_USE_QTY',
                    type: 'NUMBER',
                    label: { en: 'Qty', fr: 'Qty', nl: 'Qty' },
                    selectionEffects: [
                      {
                        id: 'sync_leftover_part_prep',
                        type: 'addLineItemsFromDataSource',
                        groupId: 'MP_TYPE_LI',
                        dataSource: { id: 'Inventory' } as any,
                        lookupField: 'ITEM_ID',
                        lookupSourceFieldId: 'LEFTOVER_ID',
                        when: {
                          all: [
                            { fieldId: 'LEFTOVER_SELECTED', equals: true },
                            { fieldId: 'LEFTOVER_USE_QTY', greaterThan: 0 }
                          ]
                        },
                        preset: {
                          PREP_TYPE: 'Part dish',
                          PREP_QTY: '$row.LEFTOVER_USE_QTY'
                        },
                        lineItemMapping: {
                          LEFTOVER_ID: 'ITEM_ID',
                          RECIPE: 'ITEM_NAME',
                          LEFTOVER_KIND: 'ITEM_KIND'
                        },
                        aggregateBy: ['LEFTOVER_ID', 'PREP_TYPE', 'RECIPE', 'LEFTOVER_KIND'],
                        aggregateNumericFields: ['PREP_QTY'],
                        preserveManualRows: false
                      }
                    ]
                  }
                ]
              },
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' } },
                  { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' } },
                  { id: 'LEFTOVER_KIND', type: 'TEXT', label: { en: 'Kind', fr: 'Kind', nl: 'Kind' } },
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' } },
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    const leftoversKey = buildSubgroupKey('MEALS', 'meal_1', 'LEFTOVERS');
    const prepKey = buildSubgroupKey('MEALS', 'meal_1', 'MP_TYPE_LI');
    let lineItems: Record<string, any> = {
      MEALS: [{ id: 'meal_1', values: {} }],
      [leftoversKey]: [
        {
          id: 'leftover_1',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_SELECTED: true,
            LEFTOVER_USE_QTY: 5
          }
        }
      ],
      [prepKey]: []
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: (((definition.questions[0] as any).lineItemConfig.subGroups[0].fields || []) as any[]).find(
        field => field.id === 'LEFTOVER_USE_QTY'
      ) as any,
      value: 5,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: leftoversKey,
          rowId: 'leftover_1',
          rowValues: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_SELECTED: true,
            LEFTOVER_USE_QTY: 5
          }
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(lineItems[prepKey]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.objectContaining({
            LEFTOVER_ID: 'LP-1',
            RECIPE: 'Salt',
            LEFTOVER_KIND: 'Part dish',
            PREP_TYPE: 'Part dish',
            PREP_QTY: '5'
          })
        })
      ])
    );
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

  it('hydrates top-level values from a matched data-source row', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        { LEFTOVER_ID: 'LE-1', LEFTOVER_RECIPE: 'Soup', LEFTOVER_STATUS: 'available' },
        { LEFTOVER_ID: 'LE-2', LEFTOVER_RECIPE: 'Stew', LEFTOVER_STATUS: 'used' }
      ]
    });

    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        { id: 'LEFTOVER_ID', type: 'CHOICE', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false } as any,
        { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false } as any,
        { id: 'STATUS', type: 'TEXT', label: { en: 'Status', fr: 'Status', nl: 'Status' }, required: false } as any
      ]
    };

    let values: Record<string, any> = { LEFTOVER_ID: 'LE-1' };
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
        id: 'LEFTOVER_ID',
        dataSource: { id: 'Config: Leftover Inventory' },
        selectionEffects: [
          {
            type: 'setValuesFromDataSource',
            lookupField: 'LEFTOVER_ID',
            fieldMapping: {
              RECIPE: 'LEFTOVER_RECIPE',
              STATUS: 'LEFTOVER_STATUS'
            }
          }
        ]
      } as any,
      value: 'LE-1',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(values.RECIPE).toBe('Soup');
    expect(values.STATUS).toBe('available');
  });

  it('hydrates line-item values from a matched data-source row', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          LEFTOVER_ID: 'LE-7',
          LEFTOVER_PREP_TYPE: 'Entire dish',
          LEFTOVER_RECIPE: 'Garlic green beans',
          LEFTOVER_PORTIONS: 12
        }
      ]
    });

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
              { id: 'LEFTOVER_ID', type: 'CHOICE', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false },
              { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' }, required: false },
              { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false },
              { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [{ id: 'r1', values: { LEFTOVER_ID: 'LE-7' } }]
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
        id: 'LEFTOVER_ID',
        dataSource: { id: 'Config: Leftover Inventory' },
        selectionEffects: [
          {
            type: 'setValuesFromDataSource',
            lookupField: 'LEFTOVER_ID',
            fieldMapping: {
              PREP_TYPE: 'LEFTOVER_PREP_TYPE',
              RECIPE: 'LEFTOVER_RECIPE',
              PREP_QTY: 'LEFTOVER_PORTIONS'
            }
          }
        ]
      } as any,
      value: 'LE-7',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'LINES', rowId: 'r1', rowValues: { LEFTOVER_ID: 'LE-7' } } }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(lineItems.LINES[0].values.PREP_TYPE).toBe('Entire dish');
    expect(lineItems.LINES[0].values.RECIPE).toBe('Garlic green beans');
    expect(lineItems.LINES[0].values.PREP_QTY).toBe(12);
  });

  it('fans out subgroup rows from all matching data-source rows', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'left-1',
          LEFTOVER_ID: 'LE-1',
          LEFTOVER_MEAL_TYPE: 'Standard',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: 'Soup',
          LEFTOVER_PORTIONS: 12
        },
        {
          id: 'left-2',
          LEFTOVER_ID: 'LP-1',
          LEFTOVER_MEAL_TYPE: 'Standard',
          LEFTOVER_KIND: 'Part dish',
          LEFTOVER_INGREDIENT: 'Salt',
          LEFTOVER_QTY: 250,
          LEFTOVER_UNIT: 'gr'
        },
        {
          id: 'left-3',
          LEFTOVER_ID: 'LE-2',
          LEFTOVER_MEAL_TYPE: 'Vegan',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: 'Stew',
          LEFTOVER_PORTIONS: 5
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
              { id: 'MEAL_TYPE', type: 'CHOICE', label: { en: 'Meal type', fr: 'Meal type', nl: 'Meal type' }, required: false }
            ],
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  { id: 'LEFTOVER_RECORD_ID', type: 'TEXT', label: { en: 'Record', fr: 'Record', nl: 'Record' }, required: false },
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' }, required: false },
                  { id: 'LEFTOVER_KIND', type: 'TEXT', label: { en: 'Kind', fr: 'Kind', nl: 'Kind' }, required: false },
                  { id: 'LEFTOVER_RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false },
                  { id: 'LEFTOVER_INGREDIENT', type: 'TEXT', label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' }, required: false },
                  {
                    id: 'LEFTOVER_PORTIONS_AVAILABLE',
                    type: 'NUMBER',
                    label: { en: 'Portions', fr: 'Portions', nl: 'Portions' },
                    required: false
                  },
                  { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'LEFTOVER_UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Standard' } }]
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
        id: 'MEAL_TYPE',
        selectionEffects: [
          {
            id: 'seed_leftovers',
            type: 'addLineItemsFromDataSource',
            groupId: 'LEFTOVERS',
            targetPath: 'LEFTOVERS',
            dataSource: {
              id: 'Leftover Inventory Data'
            },
            matchField: 'LEFTOVER_MEAL_TYPE',
            preserveManualRows: false,
            lineItemMapping: {
              LEFTOVER_RECORD_ID: 'id',
              LEFTOVER_ID: 'LEFTOVER_ID',
              LEFTOVER_KIND: 'LEFTOVER_KIND',
              LEFTOVER_RECIPE: 'LEFTOVER_RECIPE',
              LEFTOVER_INGREDIENT: 'LEFTOVER_INGREDIENT',
              LEFTOVER_PORTIONS_AVAILABLE: 'LEFTOVER_PORTIONS',
              LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY',
              LEFTOVER_UNIT: 'LEFTOVER_UNIT'
            }
          }
        ]
      } as any,
      value: 'Standard',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MEALS', rowId: 'meal-1', rowValues: { MEAL_TYPE: 'Standard' } } }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(lineItems['MEALS::meal-1::LEFTOVERS']).toHaveLength(2);
    expect(lineItems['MEALS::meal-1::LEFTOVERS'][0].values.LEFTOVER_ID).toBe('LE-1');
    expect(lineItems['MEALS::meal-1::LEFTOVERS'][1].values.LEFTOVER_ID).toBe('LP-1');
    expect(lineItems['MEALS::meal-1::LEFTOVERS'][1].values.LEFTOVER_QTY_AVAILABLE).toBe('250');
  });

  it('hydrates line-item values from a sibling lookup field when checkbox selection is used', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          LEFTOVER_ID: 'LE-11',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: 'Soup',
          LEFTOVER_PORTIONS: 8
        }
      ]
    });

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
              { id: 'LEFTOVER_SELECTED', type: 'CHECKBOX', label: { en: 'Use', fr: 'Use', nl: 'Use' }, required: false },
              { id: 'LEFTOVER_ID', type: 'CHOICE', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false },
              { id: 'LEFTOVER_KIND', type: 'TEXT', label: { en: 'Type', fr: 'Type', nl: 'Type' }, required: false },
              { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false },
              { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [{ id: 'r1', values: { LEFTOVER_SELECTED: 'Yes', LEFTOVER_ID: 'LE-11' } }]
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
        id: 'LEFTOVER_SELECTED',
        dataSource: { id: 'Config: Leftover Inventory' },
        selectionEffects: [
          {
            type: 'setValuesFromDataSource',
            lookupField: 'LEFTOVER_ID',
            fieldMapping: {
              LEFTOVER_KIND: 'LEFTOVER_KIND',
              RECIPE: 'LEFTOVER_RECIPE',
              PREP_QTY: 'LEFTOVER_PORTIONS'
            }
          }
        ]
      } as any,
      value: 'Yes',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: 'LINES',
          rowId: 'r1',
          rowValues: { LEFTOVER_SELECTED: 'Yes', LEFTOVER_ID: 'LE-11' }
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(lineItems.LINES[0].values.LEFTOVER_KIND).toBe('Entire dish');
    expect(lineItems.LINES[0].values.RECIPE).toBe('Soup');
    expect(lineItems.LINES[0].values.PREP_QTY).toBe(8);
  });

  it('resolves effect datasource ids from the richer form config before fetching', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'inventory-1',
          LEFTOVER_ID: 'LE-1',
          LEFTOVER_MEAL_TYPE: 'Standard',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: 'Soup',
          LEFTOVER_PORTIONS: 6
        }
      ]
    });

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
              {
                id: 'LEFTOVER_SELECTED',
                type: 'CHECKBOX',
                label: { en: 'Use', fr: 'Use', nl: 'Use' },
                required: false,
                selectionEffects: [
                  {
                    type: 'setValuesFromDataSource',
                    dataSource: { id: 'Leftover Inventory Data' },
                    lookupField: 'LEFTOVER_ID',
                    fieldMapping: {
                      LEFTOVER_ID: 'LEFTOVER_ID',
                      LEFTOVER_KIND: 'LEFTOVER_KIND',
                      LEFTOVER_PORTIONS_AVAILABLE: 'LEFTOVER_PORTIONS'
                    }
                  }
                ]
              },
              {
                id: 'LEFTOVER_ID',
                type: 'CHOICE',
                label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' },
                required: false,
                dataSource: {
                  id: 'Leftover Inventory Data',
                  formKey: 'Config: Leftover Inventory',
                  statusFieldId: 'LEFTOVER_STATUS',
                  statusAllowList: ['available'],
                  projection: ['id', 'LEFTOVER_ID', 'LEFTOVER_MEAL_TYPE', 'LEFTOVER_KIND', 'LEFTOVER_PORTIONS']
                }
              },
              {
                id: 'LEFTOVER_KIND',
                type: 'TEXT',
                label: { en: 'Kind', fr: 'Kind', nl: 'Kind' },
                required: false
              },
              {
                id: 'LEFTOVER_PORTIONS_AVAILABLE',
                type: 'NUMBER',
                label: { en: 'Qty', fr: 'Qty', nl: 'Qty' },
                required: false
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [{ id: 'r1', values: { LEFTOVER_SELECTED: true, LEFTOVER_ID: 'LE-1' } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: (definition.questions[0] as any).lineItemConfig.fields[0] as any,
      value: true,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'LINES', rowId: 'r1', rowValues: { LEFTOVER_SELECTED: true, LEFTOVER_ID: 'LE-1' } } }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'Leftover Inventory Data',
        formKey: 'Config: Leftover Inventory',
        statusFieldId: 'LEFTOVER_STATUS',
        statusAllowList: ['available']
      }),
      'EN'
    );
    expect(lineItems.LINES[0].values.LEFTOVER_ID).toBe('LE-1');
    expect(lineItems.LINES[0].values.LEFTOVER_KIND).toBe('Entire dish');
    expect(lineItems.LINES[0].values.LEFTOVER_PORTIONS_AVAILABLE).toBe(6);
  });

  it('seeds all datasource rows into a subgroup when no lookupField or matchField is configured', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        { id: 'inventory-1', LEFTOVER_ID: 'LE-1', LEFTOVER_KIND: 'Entire dish', LEFTOVER_PORTIONS: 6 },
        { id: 'inventory-2', LEFTOVER_ID: 'LP-1', LEFTOVER_KIND: 'Part dish', LEFTOVER_QTY: 250, LEFTOVER_UNIT: 'gr' }
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
                id: 'MEAL_TYPE',
                type: 'CHOICE',
                label: { en: 'Meal', fr: 'Meal', nl: 'Meal' },
                required: false,
                selectionEffects: [
                  {
                    id: 'seed_leftovers',
                    type: 'addLineItemsFromDataSource',
                    groupId: 'LEFTOVERS',
                    targetPath: 'LEFTOVERS',
                    dataSource: { id: 'Leftover Inventory Data' },
                    preserveManualRows: false,
                    lineItemMapping: {
                      LEFTOVER_RECORD_ID: 'id',
                      LEFTOVER_ID: 'LEFTOVER_ID',
                      LEFTOVER_KIND: 'LEFTOVER_KIND',
                      LEFTOVER_PORTIONS_AVAILABLE: 'LEFTOVER_PORTIONS',
                      LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY',
                      LEFTOVER_UNIT: 'LEFTOVER_UNIT'
                    }
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'LEFTOVERS',
                fields: [
                  { id: 'LEFTOVER_RECORD_ID', type: 'TEXT', label: { en: 'Rec', fr: 'Rec', nl: 'Rec' }, required: false },
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' }, required: false },
                  { id: 'LEFTOVER_KIND', type: 'TEXT', label: { en: 'Kind', fr: 'Kind', nl: 'Kind' }, required: false },
                  { id: 'LEFTOVER_PORTIONS_AVAILABLE', type: 'NUMBER', label: { en: 'Portions', fr: 'Portions', nl: 'Portions' }, required: false },
                  { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'LEFTOVER_UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                ]
              } as any
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: (definition.questions[0] as any).lineItemConfig.fields[0] as any,
      value: 'Vegetarian',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MEALS', rowId: 'meal-1', rowValues: { MEAL_TYPE: 'Vegetarian' } } }
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(lineItems['MEALS::meal-1::LEFTOVERS']).toHaveLength(2);
    expect(lineItems['MEALS::meal-1::LEFTOVERS'][0].values.LEFTOVER_ID).toBe('LE-1');
    expect(lineItems['MEALS::meal-1::LEFTOVERS'][1].values.LEFTOVER_ID).toBe('LP-1');
  });

  it('supports preset literals and $row values with addLineItemsFromDataSource', async () => {
    (fetchDataSource as unknown as jest.Mock).mockResolvedValue({
      items: [
        {
          LEFTOVER_ID: 'LE-11',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: 'Soup',
          LEFTOVER_INGREDIENTS_LI: JSON.stringify([{ ING: 'Salt', QTY: 2, UNIT: 'Tbsp' }])
        }
      ]
    });

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
              { id: 'LEFTOVER_ID', type: 'CHOICE', label: { en: 'Leftover', fr: 'Leftover', nl: 'Leftover' }, required: false },
              { id: 'LEFTOVER_USE_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
              { id: 'LEFTOVER_USAGE_MODE', type: 'CHOICE', label: { en: 'Mode', fr: 'Mode', nl: 'Mode' }, required: false }
            ],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Prep', fr: 'Prep', nl: 'Prep' }, required: false },
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'RECIPE', type: 'TEXT', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false },
                  { id: 'LEFTOVER_ID', type: 'TEXT', label: { en: 'Id', fr: 'Id', nl: 'Id' }, required: false },
                  { id: 'LEFTOVER_USAGE_MODE', type: 'TEXT', label: { en: 'Mode', fr: 'Mode', nl: 'Mode' }, required: false },
                  { id: 'LEFTOVER_INGREDIENTS_LI', type: 'TEXT', label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' }, required: false }
                ]
              } as any
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [{ id: 'r1', values: { LEFTOVER_ID: 'LE-11', LEFTOVER_USE_QTY: 5, LEFTOVER_USAGE_MODE: 'Reheat' } }]
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
        id: 'LEFTOVER_ID',
        dataSource: { id: 'Config: Leftover Inventory' },
        selectionEffects: [
          {
            id: 'sync_leftover_entire_reheat_prep',
            type: 'addLineItemsFromDataSource',
            groupId: 'MP_TYPE_LI',
            dataSource: { id: 'Leftover Inventory Data' },
            lookupField: 'LEFTOVER_ID',
            preset: {
              PREP_TYPE: 'Entire dish',
              PREP_QTY: '$row.LEFTOVER_USE_QTY',
              LEFTOVER_USAGE_MODE: '$row.LEFTOVER_USAGE_MODE'
            },
            lineItemMapping: {
              RECIPE: 'LEFTOVER_RECIPE',
              LEFTOVER_ID: 'LEFTOVER_ID',
              LEFTOVER_INGREDIENTS_LI: 'LEFTOVER_INGREDIENTS_LI'
            }
          }
        ]
      } as any,
      value: 'LE-11',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: 'LINES',
          rowId: 'r1',
          rowValues: { LEFTOVER_ID: 'LE-11', LEFTOVER_USE_QTY: 5, LEFTOVER_USAGE_MODE: 'Reheat' }
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const generated = lineItems['LINES::r1::MP_TYPE_LI'];
    expect(generated).toHaveLength(1);
    expect(generated[0].values.PREP_TYPE).toBe('Entire dish');
    expect(Number(generated[0].values.PREP_QTY)).toBe(5);
    expect(generated[0].values.RECIPE).toBe('Soup');
    expect(generated[0].values.LEFTOVER_ID).toBe('LE-11');
    expect(generated[0].values.LEFTOVER_USAGE_MODE).toBe('Reheat');
    expect(generated[0].values.LEFTOVER_INGREDIENTS_LI).toContain('Salt');
  });

  it('hydrates subgroup rows from a serialized row payload', async () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'PREP_ROWS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Prep', fr: 'Prep', nl: 'Prep' },
          required: false,
          lineItemConfig: {
            fields: [
              {
                id: 'LEFTOVER_INGREDIENTS_LI',
                type: 'TEXT',
                label: { en: 'Payload', fr: 'Payload', nl: 'Payload' },
                required: false
              }
            ],
            subGroups: [
              {
                id: 'MP_INGREDIENTS_LI',
                label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
                fields: [
                  { id: 'ING', type: 'TEXT', label: { en: 'Ing', fr: 'Ing', nl: 'Ing' }, required: false },
                  { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      PREP_ROWS: [
        {
          id: 'prep-1',
          values: {
            LEFTOVER_INGREDIENTS_LI: JSON.stringify([
              { ING: 'Salt', QTY: 100, UNIT: 'gr' },
              { ING: 'Salt', QTY: 150, UNIT: 'gr' }
            ])
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

    runSelectionEffects({
      definition,
      question: {
        id: 'LEFTOVER_INGREDIENTS_LI',
        selectionEffects: [
          {
            type: 'addLineItemsFromFieldPayload',
            groupId: 'MP_INGREDIENTS_LI',
            targetPath: 'MP_INGREDIENTS_LI',
            dataField: 'LEFTOVER_INGREDIENTS_LI',
            preserveManualRows: false,
            lineItemMapping: {
              ING: 'ING',
              QTY: 'QTY',
              UNIT: 'UNIT'
            },
            aggregateBy: ['ING', 'UNIT'],
            aggregateNumericFields: ['QTY']
          }
        ]
      } as any,
      value: lineItems.PREP_ROWS[0].values.LEFTOVER_INGREDIENTS_LI,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: 'PREP_ROWS',
          rowId: 'prep-1',
          rowValues: lineItems.PREP_ROWS[0].values
        }
      }
    });

    const subKey = buildSubgroupKey('PREP_ROWS', 'prep-1', 'MP_INGREDIENTS_LI');
    expect(lineItems[subKey]).toHaveLength(1);
    expect(lineItems[subKey][0].values.ING).toBe('Salt');
    expect(lineItems[subKey][0].values.QTY).toBe('250');
    expect(lineItems[subKey][0].values.UNIT).toBe('gr');
  });

  it('adds line items to a sibling subgroup under the same parent row', () => {
    const mealsGroupKey = 'MP_MEALS_REQUEST';
    const mealRowId = 'meal-1';
    const leftoverUsageKey = buildSubgroupKey(mealsGroupKey, mealRowId, 'MP_LEFTOVER_USAGE_LI');
    const prepTypeKey = buildSubgroupKey(mealsGroupKey, mealRowId, 'MP_TYPE_LI');

    const definition: WebFormDefinition = {
      title: 'Meal production',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: mealsGroupKey,
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'MEAL_TYPE', type: 'TEXT', label: { en: 'Meal type', fr: 'Meal type', nl: 'Meal type' } }],
            subGroups: [
              {
                id: 'MP_LEFTOVER_USAGE_LI',
                fields: [
                  { id: 'LEFTOVER_SELECTED', type: 'CHECKBOX', label: { en: 'Use', fr: 'Use', nl: 'Use' } },
                  { id: 'LEFTOVER_USE_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } }
                ]
              },
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_TYPE', type: 'TEXT', label: { en: 'Prep type', fr: 'Prep type', nl: 'Prep type' } },
                  { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      [mealsGroupKey]: [{ id: mealRowId, values: { MEAL_TYPE: 'Diabetic' } }],
      [leftoverUsageKey]: [{ id: 'leftover-row-1', values: { LEFTOVER_SELECTED: true, LEFTOVER_USE_QTY: 5 } }]
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
        id: 'LEFTOVER_SELECTED',
        selectionEffects: [
          {
            id: 'sync_leftover_to_prep',
            type: 'addLineItems',
            groupId: 'MP_TYPE_LI',
            preset: {
              PREP_TYPE: 'Entire dish',
              PREP_QTY: '$row.LEFTOVER_USE_QTY'
            }
          }
        ]
      } as any,
      value: true,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: {
          groupId: leftoverUsageKey,
          rowId: 'leftover-row-1',
          rowValues: { LEFTOVER_SELECTED: true, LEFTOVER_USE_QTY: 5 }
        }
      }
    });

    expect(Array.isArray(lineItems[prepTypeKey])).toBe(true);
    expect(lineItems[prepTypeKey]).toHaveLength(1);
    expect(lineItems[prepTypeKey][0].values.PREP_TYPE).toBe('Entire dish');
    expect(lineItems[prepTypeKey][0].values.PREP_QTY).toBe(5);
  });

  it('keeps newly added rows when a later top-level setValue runs in the same selection-effect pass', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'TRIGGER',
          type: 'CHECKBOX',
          label: { en: 'Trigger', fr: 'Trigger', nl: 'Trigger' },
          required: false,
          selectionEffects: [
            {
              id: 'seed_line',
              type: 'addLineItems',
              groupId: 'LINES',
              preset: { QTY: 5 }
            },
            {
              id: 'reset_step',
              type: 'setValue',
              fieldId: '__ckStep',
              value: 'order'
            }
          ]
        } as any,
        {
          id: 'TOTAL_QTY',
          type: 'NUMBER',
          label: { en: 'Total', fr: 'Total', nl: 'Total' },
          required: false,
          derivedValue: {
            op: 'calc',
            expression: 'SUM(LINES.QTY)',
            when: 'always'
          }
        } as any,
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Lines', fr: 'Lines', nl: 'Lines' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false }]
          }
        } as any
      ]
    };

    let values: Record<string, any> = { MP_PREP_DATE: '2026-04-25' };
    let lineItems: Record<string, any> = {};
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: definition.questions[0] as any,
      value: true,
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    expect(values.MP_PREP_DATE).toBe('2026-04-25');
    expect(values.__ckStep).toBe('order');
    expect(values.TOTAL_QTY).toBe(5);
    expect(lineItems.LINES).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          QTY: 5
        })
      })
    ]);
  });
});
