jest.mock('../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

import { fetchDataSource } from '../../src/web/data/dataSources';
import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { buildSubgroupKey, ROW_SOURCE_KEY } from '../../src/web/react/app/lineItems';
import { WebFormDefinition } from '../../src/types';

describe('selectionEffects preserveManualRows', () => {
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
            { id: 'RECIPE', type: 'CHOICE', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false }
          ],
          subGroups: [
            {
              id: 'ING',
              label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
              fields: [
                { id: 'ING', type: 'TEXT', label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' }, required: false },
                { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
              ]
            }
          ]
        }
      } as any
    ]
  };

  it('keeps manual rows by default when refreshing auto rows', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R1', ITEMS: [{ ING: 'Auto', QTY: 1, UNIT: 'g' }] }]
    });

    const parentRowId = 'p1';
    const subKey = buildSubgroupKey('MEALS', parentRowId, 'ING');
    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: parentRowId, values: { RECIPE: 'R1' } }],
      [subKey]: [{ id: 'm1', values: { [ROW_SOURCE_KEY]: 'manual', ING: 'Manual', QTY: 2, UNIT: 'g' } }]
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
      lineItems,
      setValues,
      setLineItems,
      opts: {
        contextId: `MEALS::${parentRowId}::RECIPE`,
        lineItem: { groupId: 'MEALS', rowId: parentRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[subKey] || [];
    expect(rows.some((r: any) => (r.values as any)[ROW_SOURCE_KEY] === 'manual')).toBe(true);
  });

  it('removes manual rows when preserveManualRows=false', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R1', ITEMS: [{ ING: 'Auto', QTY: 1, UNIT: 'g' }] }]
    });

    const parentRowId = 'p1';
    const subKey = buildSubgroupKey('MEALS', parentRowId, 'ING');
    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: parentRowId, values: { RECIPE: 'R1' } }],
      [subKey]: [{ id: 'm1', values: { [ROW_SOURCE_KEY]: 'manual', ING: 'Manual', QTY: 2, UNIT: 'g' } }]
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
            aggregateNumericFields: ['QTY'],
            preserveManualRows: false
          }
        ]
      } as any,
      value: 'R1',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        contextId: `MEALS::${parentRowId}::RECIPE`,
        lineItem: { groupId: 'MEALS', rowId: parentRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[subKey] || [];
    expect(rows.some((r: any) => (r.values as any)[ROW_SOURCE_KEY] === 'manual')).toBe(false);
  });
});
