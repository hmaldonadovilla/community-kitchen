jest.mock('../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

import { fetchDataSource } from '../../src/web/data/dataSources';
import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { buildLineContextId, buildSubgroupKey, ROW_SOURCE_KEY } from '../../src/web/react/app/lineItems';
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

    // Should clear immediately (before async data fetch resolves).
    const rowsImmediate = (lineItems as any)[subKey] || [];
    expect(rowsImmediate.some((r: any) => (r.values as any)[ROW_SOURCE_KEY] === 'manual')).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[subKey] || [];
    expect(rows.some((r: any) => (r.values as any)[ROW_SOURCE_KEY] === 'manual')).toBe(false);
  });

  it('removes existing auto rows on first run even when opts.contextId is omitted (fieldChangeDialog confirm flow)', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R2', ITEMS: [{ ING: 'NewAuto', QTY: 1, UNIT: 'g' }] }]
    });

    const parentRowId = 'p1';
    const subKey = buildSubgroupKey('MEALS', parentRowId, 'ING');
    const effectContextId = buildLineContextId('MEALS', parentRowId, 'RECIPE');

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: parentRowId, values: { RECIPE: 'R1' } }],
      [subKey]: [
        {
          id: 'a1',
          values: { [ROW_SOURCE_KEY]: 'auto', ING: 'OldAuto', QTY: 99, UNIT: 'g' },
          autoGenerated: true,
          effectContextId
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
      value: 'R2',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: {
        lineItem: { groupId: 'MEALS', rowId: parentRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    // Should clear immediately; otherwise stale auto rows remain until a later selection change.
    const rowsImmediate = (lineItems as any)[subKey] || [];
    expect(rowsImmediate.some((r: any) => (r.values as any)[ROW_SOURCE_KEY] === 'auto' && r.id === 'a1')).toBe(false);
  });

  it('includes ancestor row values when evaluating optionFilters (fieldChangeDialog confirm flow)', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R1', ITEMS: [{ ING: 'Rice', QTY: 1, UNIT: 'g' }] }]
    });

    const localDefinition: WebFormDefinition = {
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
                id: 'DETAILS',
                label: { en: 'Details', fr: 'Details', nl: 'Details' },
                fields: [
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
                        label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' },
                        required: false,
                        optionFilter: { dependsOn: 'MEAL_TYPE', optionMap: { Standard: ['Rice'] } }
                      },
                      { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                      { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                    ]
                  }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const parentRowId = 'p1';
    const detailsRowId = 'd1';
    const detailsKey = buildSubgroupKey('MEALS', parentRowId, 'DETAILS');
    const ingKey = buildSubgroupKey(detailsKey, detailsRowId, 'ING');

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: parentRowId, values: { MEAL_TYPE: 'Standard' } }],
      [detailsKey]: [{ id: detailsRowId, values: { RECIPE: 'R1' } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition: localDefinition,
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
        // Mirror fieldChangeDialog confirm: rowValues from current row only (no parent MEAL_TYPE).
        lineItem: { groupId: detailsKey, rowId: detailsRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[ingKey] || [];
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0]?.values as any)?.ING).toBe('Rice');
  });

  it('does not block data-driven presets when optionFilter dependency values are missing (avoids wiping groups)', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R1', ITEMS: [{ ING: ' Rice ', QTY: 1, UNIT: 'g' }] }]
    });

    const localDefinition: WebFormDefinition = {
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
                id: 'DETAILS',
                label: { en: 'Details', fr: 'Details', nl: 'Details' },
                fields: [
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
                        label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' },
                        required: false,
                        optionFilter: { dependsOn: 'MEAL_TYPE', optionMap: { Standard: ['Rice'] } }
                      },
                      { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                      { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                    ]
                  }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const parentRowId = 'p1';
    const detailsRowId = 'd1';
    const detailsKey = buildSubgroupKey('MEALS', parentRowId, 'DETAILS');
    const ingKey = buildSubgroupKey(detailsKey, detailsRowId, 'ING');

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      // MEAL_TYPE is intentionally missing here.
      MEALS: [{ id: parentRowId, values: {} }],
      [detailsKey]: [{ id: detailsRowId, values: { RECIPE: 'R1' } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition: localDefinition,
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
        // Mirror confirm flow: rowValues is current row only.
        lineItem: { groupId: detailsKey, rowId: detailsRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[ingKey] || [];
    expect(rows.length).toBeGreaterThan(0);
    // Preset value should be kept (even if it contains whitespace).
    expect((rows[0]?.values as any)?.ING).toBe(' Rice ');
  });

  it('falls back to unfiltered entries when optionFilters remove all recipe items (avoids empty ingredient groups)', async () => {
    const mockFetch = fetchDataSource as unknown as jest.Mock;
    mockFetch.mockResolvedValue({
      items: [{ ID: 'R1', ITEMS: [{ ING: 'Rice', QTY: 1, UNIT: 'g' }] }]
    });

    const localDefinition: WebFormDefinition = {
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
            fields: [{ id: 'MEAL_TYPE', type: 'CHOICE', label: { en: 'Meal type', fr: 'Meal type', nl: 'Meal type' }, required: false }],
            subGroups: [
              {
                id: 'DETAILS',
                label: { en: 'Details', fr: 'Details', nl: 'Details' },
                fields: [{ id: 'RECIPE', type: 'CHOICE', label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' }, required: false }],
                subGroups: [
                  {
                    id: 'ING',
                    label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
                    fields: [
                      {
                        id: 'ING',
                        type: 'CHOICE',
                        label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' },
                        required: false,
                        // Allowed list intentionally excludes the recipe ingredient, so strict filtering would remove all entries.
                        optionFilter: { dependsOn: 'MEAL_TYPE', optionMap: { Standard: ['Other'] } }
                      },
                      { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' }, required: false },
                      { id: 'UNIT', type: 'TEXT', label: { en: 'Unit', fr: 'Unit', nl: 'Unit' }, required: false }
                    ]
                  }
                ]
              }
            ]
          }
        } as any
      ]
    };

    const parentRowId = 'p1';
    const detailsRowId = 'd1';
    const detailsKey = buildSubgroupKey('MEALS', parentRowId, 'DETAILS');
    const ingKey = buildSubgroupKey(detailsKey, detailsRowId, 'ING');

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      MEALS: [{ id: parentRowId, values: { MEAL_TYPE: 'Standard' } }],
      [detailsKey]: [{ id: detailsRowId, values: { RECIPE: 'R1' } }]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition: localDefinition,
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
        lineItem: { groupId: detailsKey, rowId: detailsRowId, rowValues: { RECIPE: 'R1' } },
        forceContextReset: true
      }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const rows = (lineItems as any)[ingKey] || [];
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0]?.values as any)?.ING).toBe('Rice');
  });
});
