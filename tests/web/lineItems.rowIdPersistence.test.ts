import {
  buildInitialLineItems,
  ROW_SELECTION_EFFECT_ID_KEY,
  ROW_SOURCE_KEY
} from '../../src/web/react/app/lineItems';
import { WebFormDefinition } from '../../src/types';

describe('buildInitialLineItems row id persistence', () => {
  it('uses __ckRowId when present for parent rows and subgroup rows', () => {
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
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }],
            subGroups: [
              {
                id: 'SUB',
                label: { en: 'Sub', fr: 'Sub', nl: 'Sub' },
                fields: [{ id: 'A', type: 'TEXT', label: { en: 'A', fr: 'A', nl: 'A' }, required: false }]
              }
            ]
          }
        } as any
      ]
    };

    const recordValues: any = {
      LINES: [
        {
          __ckRowId: 'p1',
          ITEM: 'Parent',
          SUB: [{ __ckRowId: 'c1', A: 'Child' }]
        }
      ]
    };

    const state = buildInitialLineItems(definition, recordValues);

    expect(Array.isArray((state as any).LINES)).toBe(true);
    expect((state as any).LINES[0].id).toBe('p1');
    expect((state as any).LINES[0].values.__ckRowId).toBe('p1');

    const subKey = 'LINES::p1::SUB';
    expect(Array.isArray((state as any)[subKey])).toBe(true);
    expect((state as any)[subKey][0].id).toBe('c1');
    expect((state as any)[subKey][0].values.__ckRowId).toBe('c1');
  });

  it('does not reload transient subgroup rows from persisted record values', () => {
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
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }],
            subGroups: [
              {
                id: 'TRANSIENT',
                label: { en: 'Transient', fr: 'Transient', nl: 'Transient' },
                ui: { persistRows: false } as any,
                fields: [{ id: 'A', type: 'TEXT', label: { en: 'A', fr: 'A', nl: 'A' }, required: false }]
              }
            ]
          }
        } as any
      ]
    };

    const recordValues: any = {
      LINES: [
        {
          __ckRowId: 'p1',
          ITEM: 'Parent',
          TRANSIENT: [{ __ckRowId: 'c1', A: 'Child' }]
        }
      ]
    };

    const state = buildInitialLineItems(definition, recordValues);

    expect(Array.isArray((state as any).LINES)).toBe(true);
    expect((state as any).LINES[0].id).toBe('p1');
    expect((state as any)['LINES::p1::TRANSIENT']).toBeUndefined();
  });

  it('hydrates persisted selection-effect subgroup rows with the named effect context', () => {
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
                id: 'RECIPE',
                type: 'CHOICE',
                label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' },
                required: false,
                selectionEffects: [
                  {
                    id: 'syncRecipeIngredientsFromSource',
                    type: 'addLineItemsFromDataSource',
                    groupId: 'INGREDIENTS',
                    dataField: 'INGREDIENTS',
                    lineItemMapping: { ING: 'ING' }
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'INGREDIENTS',
                label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
                fields: [{ id: 'ING', type: 'TEXT', label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' } }]
              }
            ]
          }
        } as any
      ]
    };
    const recordValues = {
      MEALS: [
        {
          __ckRowId: 'meal_1',
          RECIPE: 'Soup',
          INGREDIENTS: [
            {
              __ckRowId: 'ing_1',
              [ROW_SOURCE_KEY]: 'auto',
              [ROW_SELECTION_EFFECT_ID_KEY]: 'syncRecipeIngredientsFromSource',
              ING: 'Carrot'
            }
          ]
        }
      ]
    };

    const state = buildInitialLineItems(definition, recordValues as any);
    const childRows = (state as any)['MEALS::meal_1::INGREDIENTS'];

    expect(childRows).toHaveLength(1);
    expect(childRows[0].effectContextId).toBe('MEALS::meal_1::syncRecipeIngredientsFromSource');
  });
});
