import {
  clearSelectionEffectSourceMetadata,
  collectSelectionEffectSourceMetadataFieldIds
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
});
