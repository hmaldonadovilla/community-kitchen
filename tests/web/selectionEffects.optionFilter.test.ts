jest.mock('../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

import { fetchDataSource } from '../../src/web/data/dataSources';
import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { WebFormDefinition } from '../../src/types';

describe('selectionEffects respects optionFilter when generating rows', () => {
  it('skips addLineItems when the preset value violates the target field optionFilter', () => {
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
                id: 'ING',
                type: 'CHOICE',
                label: { en: 'Ingredient', fr: 'Ingrédient', nl: 'Ingrediënt' },
                required: false,
                optionFilter: {
                  dependsOn: 'MEAL_TYPE',
                  optionMap: {
                    'No-salt': ['Pepper'],
                    '*': ['Salt', 'Pepper']
                  }
                }
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = { MEAL_TYPE: 'No-salt' };
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
        id: 'TRIGGER',
        selectionEffects: [{ id: 'addSalt', type: 'addLineItems', groupId: 'LINES', preset: { ING: 'Salt' } }]
      } as any,
      value: 'Yes',
      language: 'EN' as any,
      values,
      setValues,
      setLineItems
    });

    expect(lineItems['LINES'] || []).toEqual([]);
  });

  it('filters addLineItemsFromDataSource entries when mapped values violate target field optionFilter (subgroups)', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [
        {
          ID: 'R1',
          ITEMS: [
            { ING: 'Salt', QTY: 1, UNIT: 'g' },
            { ING: 'Pepper', QTY: 2, UNIT: 'g' }
          ]
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
              { id: 'MEAL_TYPE', type: 'CHOICE', label: { en: 'Meal Type', fr: 'Meal Type', nl: 'Meal Type' }, required: false },
              { id: 'RECIPE', type: 'CHOICE', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false }
            ],
            subGroups: [
              {
                id: 'ING',
                label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
                fields: [
                  {
                    id: 'ING',
                    type: 'CHOICE',
                    label: { en: 'Ingredient', fr: 'Ingrédient', nl: 'Ingrediënt' },
                    required: false,
                    optionFilter: {
                      dependsOn: 'MEAL_TYPE',
                      optionMap: {
                        'No-salt': ['Pepper'],
                        '*': ['Salt', 'Pepper']
                      }
                    }
                  },
                  { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                  { id: 'UNIT', type: 'CHOICE', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                ]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: 'p1', values: { MEAL_TYPE: 'No-salt', RECIPE: 'R1' } }]
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
        id: 'RECIPE',
        dataSource: { id: 'Recipes Data' },
        selectionEffects: [
          {
            id: 'recipeIngredients',
            type: 'addLineItemsFromDataSource',
            groupId: 'ING',
            lookupField: 'ID',
            dataField: 'ITEMS',
            lineItemMapping: { ING: 'ING', QTY: 'QTY', UNIT: 'UNIT' },
            aggregateBy: ['ING', 'UNIT'],
            aggregateNumericFields: ['QTY']
          }
        ]
      } as any,
      value: 'R1',
      language: 'EN' as any,
      values,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'MEALS', rowId: 'p1', rowValues: { MEAL_TYPE: 'No-salt', RECIPE: 'R1' } }, forceContextReset: true }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const subKey = `MEALS::p1::ING`;
    const rows = (lineItems as any)[subKey] || [];
    expect(rows.length).toBe(1);
    expect((rows[0].values as any).ING).toBe('Pepper');
    expect(rows.some((r: any) => (r.values as any).ING === 'Salt')).toBe(false);
  });
});

