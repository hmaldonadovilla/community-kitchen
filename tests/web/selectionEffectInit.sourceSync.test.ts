import { buildSubgroupKey } from '../../src/web/react/app/lineItems';
import { CK_RECIPE_INGREDIENTS_DIRTY_KEY } from '../../src/web/react/app/recipeIngredientsDirty';
import {
  collectComputedSelectionEffectInitTargets,
  collectSelectionEffectInitTargets,
  dedupeSelectionEffectInitTargets
} from '../../src/web/react/features/lineItems/domain/selectionEffectInit';
import { WebQuestionDefinition } from '../../src/types';

const buildMealQuestion = (effectOverrides: Record<string, any> = {}): WebQuestionDefinition =>
  ({
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
          selectionEffects: [
            {
              id: 'syncRecipeIngredientsFromSource',
              type: 'addLineItemsFromDataSource',
              groupId: 'INGREDIENTS',
              lookupField: 'id',
              lookupFields: ['id', 'QFTD5RD2EM'],
              lookupSourceFieldId: 'RECIPE_SOURCE_ID',
              dataField: 'Q65ILNUSGL',
              lineItemMapping: { ING: 'ING', QTY: 'QTY' },
              ...effectOverrides
            }
          ]
        }
      ],
      subGroups: [
        {
          id: 'INGREDIENTS',
          fields: [
            { id: 'ING', type: 'TEXT', label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' } },
            { id: 'QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } }
          ]
        }
      ]
    }
  }) as any;

const buildRecipeIngredientsQuestion = (effectOverrides: Record<string, any> = {}): WebQuestionDefinition =>
  ({
    id: 'INGREDIENTS',
    type: 'LINE_ITEM_GROUP',
    label: { en: 'Ingredients', fr: 'Ingredients', nl: 'Ingredients' },
    required: false,
    lineItemConfig: {
      fields: [
        {
          id: 'ING',
          type: 'CHOICE',
          label: { en: 'Ingredient', fr: 'Ingredient', nl: 'Ingredient' },
          selectionEffects: [
            {
              id: 'syncIngredientFromSource',
              type: 'setValuesFromDataSource',
              lookupField: 'id',
              lookupFields: ['id', 'INGREDIENT_NAME'],
              lookupSourceFieldId: 'ING_SOURCE_ID',
              fieldMapping: {
                ING_SOURCE_ID: 'id',
                ING_SOURCE_UPDATED_AT: 'updatedAt',
                ING: 'INGREDIENT_NAME',
                CAT: 'CATEGORY',
                ALLERGEN: 'ALLERGEN'
              },
              ...effectOverrides
            }
          ]
        },
        { id: 'CAT', type: 'TEXT', label: { en: 'Category', fr: 'Category', nl: 'Category' } },
        { id: 'ALLERGEN', type: 'TEXT', label: { en: 'Allergen', fr: 'Allergen', nl: 'Allergen' } },
        { id: 'ING_SOURCE_ID', type: 'TEXT', label: { en: 'Source id', fr: 'Source id', nl: 'Source id' } },
        {
          id: 'ING_SOURCE_UPDATED_AT',
          type: 'TEXT',
          label: { en: 'Source updated', fr: 'Source updated', nl: 'Source updated' }
        }
      ]
    }
  }) as any;

describe('selection effect init source sync', () => {
  it('skips hydrated datasource rows by default', () => {
    const ingredientKey = buildSubgroupKey('MEALS', 'meal_1', 'INGREDIENTS');
    const targets = collectSelectionEffectInitTargets(
      buildMealQuestion(),
      {
        MEALS: [{ id: 'meal_1', values: { RECIPE: 'Old soup', RECIPE_SOURCE_ID: 'recipe-1' } }],
        [ingredientKey]: [{ id: 'ing_1', values: { ING: 'Carrot', QTY: 1 } }]
      },
      { status: 'Open' }
    );

    expect(targets).toEqual([]);
  });

  it('replays hydrated datasource rows when sourceSync.refreshOnInit is enabled', () => {
    const ingredientKey = buildSubgroupKey('MEALS', 'meal_1', 'INGREDIENTS');
    const targets = collectSelectionEffectInitTargets(
      buildMealQuestion({ sourceSync: { refreshOnInit: true, stopWhen: { fieldId: 'status', equals: 'Closed' } } }),
      {
        MEALS: [{ id: 'meal_1', values: { RECIPE: 'Old soup', RECIPE_SOURCE_ID: 'recipe-1' } }],
        [ingredientKey]: [{ id: 'ing_1', values: { ING: 'Carrot', QTY: 1 } }]
      },
      { status: 'Open' }
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual(
      expect.objectContaining({
        groupKey: 'MEALS',
        rowId: 'meal_1',
        rawValue: 'Old soup'
      })
    );
  });

  it('does not replay source sync when sourceSync.stopWhen matches', () => {
    const ingredientKey = buildSubgroupKey('MEALS', 'meal_1', 'INGREDIENTS');
    const targets = collectSelectionEffectInitTargets(
      buildMealQuestion({ sourceSync: { refreshOnInit: true, stopWhen: { fieldId: 'status', equals: 'Closed' } } }),
      {
        MEALS: [{ id: 'meal_1', values: { RECIPE: 'Old soup', RECIPE_SOURCE_ID: 'recipe-1' } }],
        [ingredientKey]: [{ id: 'ing_1', values: { ING: 'Carrot', QTY: 1 } }]
      },
      { status: 'Closed' }
    );

    expect(targets).toEqual([]);
  });

  it('does not replay recipe ingredient source sync after ingredients were edited manually', () => {
    const ingredientKey = buildSubgroupKey('MEALS', 'meal_1', 'INGREDIENTS');
    const targets = collectSelectionEffectInitTargets(
      buildMealQuestion({ sourceSync: { refreshOnInit: true, forceRefresh: true } }),
      {
        MEALS: [
          {
            id: 'meal_1',
            values: {
              RECIPE: 'Old soup',
              RECIPE_SOURCE_ID: 'recipe-1',
              [CK_RECIPE_INGREDIENTS_DIRTY_KEY]: true
            }
          }
        ],
        [ingredientKey]: [{ id: 'ing_1', values: { ING: 'Carrot', QTY: 1 } }]
      },
      { status: 'Open' }
    );

    expect(targets).toEqual([]);
  });

  it('replays hydrated setValuesFromDataSource rows when sourceSync.refreshOnInit is enabled', () => {
    const targets = collectSelectionEffectInitTargets(
      buildRecipeIngredientsQuestion({
        sourceSync: { refreshOnInit: true, stopWhen: { fieldId: 'status', equals: 'Disabled' } }
      }),
      {
        INGREDIENTS: [
          {
            id: 'ingredient_1',
            values: {
              ING: 'Old carrots',
              CAT: 'Tins',
              ING_SOURCE_ID: 'product-1',
              ING_SOURCE_UPDATED_AT: '2026-01-01T00:00:00.000Z'
            }
          }
        ]
      },
      { status: 'Active' }
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual(
      expect.objectContaining({
        groupKey: 'INGREDIENTS',
        rowId: 'ingredient_1',
        rawValue: 'Old carrots'
      })
    );
  });

  it('deduplicates normal and computed init targets for the same hydrated source-sync row', () => {
    const question = buildRecipeIngredientsQuestion({
      sourceSync: { refreshOnInit: true, stopWhen: { fieldId: 'status', equals: 'Disabled' } }
    });
    const lineItems = {
      INGREDIENTS: [
        {
          id: 'ingredient_1',
          values: {
            ING: 'Old carrots',
            CAT: 'Tins',
            ING_SOURCE_ID: 'product-1',
            ING_SOURCE_UPDATED_AT: '2026-01-01T00:00:00.000Z'
          }
        }
      ]
    } as any;
    const topValues = { status: 'Active' };
    const directTargets = collectSelectionEffectInitTargets(question, lineItems, topValues);
    const computedTargets = collectComputedSelectionEffectInitTargets(question, lineItems, topValues);

    expect(directTargets).toHaveLength(1);
    expect(computedTargets).toHaveLength(1);
    expect(dedupeSelectionEffectInitTargets([...directTargets, ...computedTargets])).toHaveLength(1);
  });

  it('does not replay hydrated setValuesFromDataSource rows when sourceSync.stopWhen matches', () => {
    const targets = collectSelectionEffectInitTargets(
      buildRecipeIngredientsQuestion({
        sourceSync: { refreshOnInit: true, stopWhen: { fieldId: 'status', equals: 'Disabled' } }
      }),
      {
        INGREDIENTS: [
          {
            id: 'ingredient_1',
            values: {
              ING: 'Old carrots',
              CAT: 'Tins',
              ING_SOURCE_ID: 'product-1',
              ING_SOURCE_UPDATED_AT: '2026-01-01T00:00:00.000Z'
            }
          }
        ]
      },
      { status: 'Disabled' }
    );

    expect(targets).toEqual([]);
  });
});
