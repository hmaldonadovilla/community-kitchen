import { hydrateMealProductionPrepIngredientsFromLeftovers } from '../../../src/services/webform/followup/mealProductionLeftoverIngredients';
import { WebFormSubmission } from '../../../src/types';

describe('hydrateMealProductionPrepIngredientsFromLeftovers', () => {
  it('hydrates single-ingredient and combine multi-ingredient prep rows from linked leftover records', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-record-1',
      values: {
        MP_MEALS_REQUEST: [
          {
            MEAL_TYPE: 'Vegetarian',
            FINAL_QTY: 450,
            MP_TYPE_LI: [
              {
                PREP_TYPE: 'Single-ingredient',
                PREP_QTY: '500',
                RECIPE: 'Basil - fresh',
                LEFTOVER_KIND: 'Single-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-single',
                LEFTOVER_USE_QTY: '500',
                LEFTOVER_DISPLAY_UNIT: 'gr',
                MP_INGREDIENTS_LI: []
              },
              {
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Bulgur & vegetable warm salad mama mia',
                LEFTOVER_KIND: 'Multi-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-multi',
                LEFTOVER_USAGE_MODE: 'Combine',
                MP_INGREDIENTS_LI: []
              }
            ]
          }
        ]
      }
    } as any;

    const leftovers = new Map<string, WebFormSubmission>([
      [
        'leftover-single',
        {
          formKey: 'Config: Leftover Bank',
          language: 'EN',
          id: 'leftover-single',
          values: {
            LEFTOVER_KIND: 'Single-ingredient',
            LEFTOVER_INGREDIENT: 'Basil - fresh',
            LEFTOVER_CAT: 'Herbs - spices - condiments',
            LEFTOVER_ALLERGEN: 'None',
            LEFTOVER_UNIT: 'gr'
          }
        } as any
      ],
      [
        'leftover-multi',
        {
          formKey: 'Config: Leftover Bank',
          language: 'EN',
          id: 'leftover-multi',
          values: {
            LEFTOVER_KIND: 'Multi-ingredient',
            LEFTOVER_INGREDIENTS_LI: [
              { ING: 'Bulgur', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten', QTY: '2.80', UNIT: 'kg' },
              { ING: 'Broccoli', CAT: 'Fresh vegetables', ALLERGEN: 'None', QTY: '2.33', UNIT: 'kg' }
            ]
          }
        } as any
      ]
    ]);

    const hydrated = hydrateMealProductionPrepIngredientsFromLeftovers(record, leftoverRecordId => leftovers.get(leftoverRecordId) || null);
    const prepRows = hydrated.values.MP_MEALS_REQUEST[0].MP_TYPE_LI;

    expect(prepRows[0].MP_INGREDIENTS_LI).toEqual([
      expect.objectContaining({
        ING: 'Basil - fresh',
        CAT: 'Herbs - spices - condiments',
        ALLERGEN: 'None',
        QTY: '500',
        UNIT: 'gr'
      })
    ]);
    expect(prepRows[1].MP_INGREDIENTS_LI).toEqual([
      expect.objectContaining({ ING: 'Bulgur', ALLERGEN: 'Gluten' }),
      expect.objectContaining({ ING: 'Broccoli', ALLERGEN: 'None' })
    ]);
  });

  it('keeps existing prep ingredient rows untouched', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-record-2',
      values: {
        MP_MEALS_REQUEST: [
          {
            MEAL_TYPE: 'Vegetarian',
            MP_TYPE_LI: [
              {
                PREP_TYPE: 'Cook',
                RECIPE: 'Chili',
                MP_INGREDIENTS_LI: [{ ING: 'Beans', ALLERGEN: 'None' }]
              }
            ]
          }
        ]
      }
    } as any;

    const hydrated = hydrateMealProductionPrepIngredientsFromLeftovers(record, () => {
      throw new Error('resolver should not be called');
    });

    expect(hydrated).toBe(record);
  });
});
