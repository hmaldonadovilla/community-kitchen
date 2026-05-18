import {
  clearSelectionEffectSourceMetadata,
  collectSelectionEffectSourceMetadataFieldIds,
  preserveSelectionEffectSourceMappedValues
} from '../../src/web/react/app/selectionEffectSourceMetadata';

describe('selection effect source metadata', () => {
  it('clears recipe source id metadata without clearing the changed label', () => {
    const field: any = {
      id: 'RECIPE',
      selectionEffects: [
        {
          type: 'addLineItemsFromDataSource',
          lookupSourceFieldId: 'RECIPE_SOURCE_ID',
          parentFieldMapping: {
            RECIPE_SOURCE_ID: 'id',
            RECIPE_SOURCE_UPDATED_AT: 'updatedAt',
            RECIPE: 'QFTD5RD2EM'
          }
        }
      ]
    };

    expect(collectSelectionEffectSourceMetadataFieldIds(field, 'RECIPE')).toEqual([
      'RECIPE_SOURCE_ID',
      'RECIPE_SOURCE_UPDATED_AT'
    ]);
    expect(
      clearSelectionEffectSourceMetadata(
        {
          RECIPE: 'Tajine',
          RECIPE_SOURCE_ID: 'old-recipe-id',
          RECIPE_SOURCE_UPDATED_AT: 'old-updated-at'
        },
        field,
        'RECIPE'
      )
    ).toEqual({
      RECIPE: 'Tajine',
      RECIPE_SOURCE_ID: null,
      RECIPE_SOURCE_UPDATED_AT: null
    });
  });

  it('clears ingredient source metadata without clearing mapped business fields', () => {
    const field: any = {
      id: 'ING',
      selectionEffects: [
        {
          type: 'setValuesFromDataSource',
          lookupSourceFieldId: 'ING_SOURCE_ID',
          fieldMapping: {
            ING_SOURCE_ID: 'id',
            ING_SOURCE_UPDATED_AT: 'updatedAt',
            ING: 'INGREDIENT_NAME',
            CAT: 'CATEGORY',
            ALLERGEN: 'ALLERGEN'
          }
        }
      ]
    };

    expect(
      clearSelectionEffectSourceMetadata(
        {
          ING: 'New rice',
          ING_SOURCE_ID: 'old-product-id',
          ING_SOURCE_UPDATED_AT: 'old-updated-at',
          CAT: 'Dry goods',
          ALLERGEN: 'None'
        },
        field,
        'ING'
      )
    ).toEqual({
      ING: 'New rice',
      ING_SOURCE_ID: null,
      ING_SOURCE_UPDATED_AT: null,
      CAT: 'Dry goods',
      ALLERGEN: 'None'
    });
  });

  it('preserves refreshed source mapped fields when a stale row update keeps the same source value', () => {
    const definition: any = {
      questions: [
        {
          id: 'INGREDIENTS',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              {
                id: 'ING',
                selectionEffects: [
                  {
                    type: 'setValuesFromDataSource',
                    lookupSourceFieldId: 'ING_SOURCE_ID',
                    fieldMapping: {
                      ING_SOURCE_ID: 'id',
                      ING_SOURCE_UPDATED_AT: 'updatedAt',
                      ING: 'INGREDIENT_NAME',
                      CAT: 'CATEGORY',
                      ALLERGEN: 'ALLERGEN'
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const previousLineItems: any = {
      INGREDIENTS: [
        {
          id: 'row-1',
          values: {
            ING: 'Black pepper',
            CAT: 'Herbs - spices - condiments',
            ALLERGEN: 'None',
            ING_SOURCE_ID: 'ingredient-1',
            ING_SOURCE_UPDATED_AT: '2026-02-10T16:13:54.500Z'
          }
        }
      ]
    };
    const staleNextLineItems: any = {
      INGREDIENTS: [
        {
          id: 'row-1',
          values: {
            ING: 'Black pepper',
            CAT: '',
            ALLERGEN: ''
          }
        }
      ]
    };

    expect(
      preserveSelectionEffectSourceMappedValues({
        definition,
        previousLineItems,
        nextLineItems: staleNextLineItems
      })
    ).toEqual(previousLineItems);
  });

  it('does not preserve source mapped fields after the source selection changes', () => {
    const definition: any = {
      questions: [
        {
          id: 'INGREDIENTS',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              {
                id: 'ING',
                selectionEffects: [
                  {
                    type: 'setValuesFromDataSource',
                    fieldMapping: {
                      CAT: 'CATEGORY',
                      ALLERGEN: 'ALLERGEN'
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const nextLineItems: any = {
      INGREDIENTS: [{ id: 'row-1', values: { ING: 'Tomato', CAT: '', ALLERGEN: '' } }]
    };

    expect(
      preserveSelectionEffectSourceMappedValues({
        definition,
        previousLineItems: {
          INGREDIENTS: [{ id: 'row-1', values: { ING: 'Black pepper', CAT: 'Spices', ALLERGEN: 'None' } }]
        } as any,
        nextLineItems
      })
    ).toBe(nextLineItems);
  });
});
