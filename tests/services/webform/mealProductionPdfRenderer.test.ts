import { buildMealProductionHtmlBlocks } from '../../../src/services/webform/followup/mealProductionPdfRenderer';
import { QuestionConfig, WebFormSubmission } from '../../../src/types';

describe('buildMealProductionHtmlBlocks', () => {
  const questions: QuestionConfig[] = [
    {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meal requests',
      qFr: 'Demandes',
      qNl: 'Aanvragen',
      required: false,
      options: [],
      optionsFr: [],
      optionsNl: [],
      status: 'Active',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'TEXT',
            labelEn: 'Meal type',
            labelFr: 'Type',
            labelNl: 'Type',
            required: false,
            options: [],
            optionsFr: [],
            optionsNl: []
          },
          {
            id: 'ORD_QTY',
            type: 'NUMBER',
            labelEn: 'Ordered',
            labelFr: 'Commande',
            labelNl: 'Besteld',
            required: false,
            options: [],
            optionsFr: [],
            optionsNl: []
          },
          {
            id: 'FINAL_QTY',
            type: 'NUMBER',
            labelEn: 'Final',
            labelFr: 'Final',
            labelNl: 'Final',
            required: false,
            options: [],
            optionsFr: [],
            optionsNl: []
          }
        ],
        subGroups: [
          {
            id: 'MP_TYPE_LI',
            fields: [
              {
                id: 'PREP_TYPE',
                type: 'TEXT',
                labelEn: 'Prep type',
                labelFr: '',
                labelNl: '',
                required: false,
                options: [],
                optionsFr: [],
                optionsNl: []
              },
              {
                id: 'PREP_QTY',
                type: 'NUMBER',
                labelEn: 'Prep qty',
                labelFr: '',
                labelNl: '',
                required: false,
                options: [],
                optionsFr: [],
                optionsNl: []
              },
              {
                id: 'RECIPE',
                type: 'TEXT',
                labelEn: 'Recipe',
                labelFr: 'Recette',
                labelNl: 'Recept',
                required: false,
                options: [],
                optionsFr: [],
                optionsNl: []
              }
            ],
            subGroups: [
              {
                id: 'MP_INGREDIENTS_LI',
                fields: [
                  {
                    id: 'ING',
                    type: 'TEXT',
                    labelEn: 'Ingredient',
                    labelFr: '',
                    labelNl: '',
                    required: false,
                    options: [],
                    optionsFr: [],
                    optionsNl: []
                  },
                  {
                    id: 'ALLERGEN',
                    type: 'TEXT',
                    labelEn: 'Allergen',
                    labelFr: '',
                    labelNl: '',
                    required: false,
                    options: [],
                    optionsFr: [],
                    optionsNl: []
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  ];

  it('sorts combined ingredient lists alphabetically in the summary-style HTML blocks', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      values: {
        MP_MEALS_REQUEST: [
          {
            MEAL_TYPE: 'Vegetarian',
            ORD_QTY: 20,
            FINAL_QTY: 20,
            MP_TYPE_LI: [
              {
                PREP_TYPE: 'Cook',
                PREP_QTY: 20,
                RECIPE: 'Veg curry',
                MP_INGREDIENTS_LI: [
                  { ING: 'Zucchini', ALLERGEN: 'None' },
                  { ING: 'banana', ALLERGEN: 'None' }
                ]
              },
              {
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Combined leftover curry',
                MP_INGREDIENTS_LI: [
                  { ING: 'Carrot', ALLERGEN: 'None' }
                ]
              },
              {
                PREP_TYPE: 'Single-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Apple garnish',
                MP_INGREDIENTS_LI: [
                  { ING: 'Apple', ALLERGEN: 'None' }
                ]
              },
              {
                PREP_TYPE: 'Single-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Beetroot topping',
                MP_INGREDIENTS_LI: [
                  { ING: 'Beetroot', ALLERGEN: 'None' }
                ]
              }
            ]
          }
        ]
      } as any
    } as any;

    const html = buildMealProductionHtmlBlocks(record, questions);
    expect(html).toContain('Apple, banana, Beetroot, Zucchini');
    expect(html).toContain('<span>Carrot</span>');
  });
});
