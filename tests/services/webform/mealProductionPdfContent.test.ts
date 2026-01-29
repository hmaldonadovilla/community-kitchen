import { buildMealProductionPdfPlaceholders } from '../../../src/services/webform/followup/mealProductionPdfContent';
import { WebFormSubmission, FormConfig, QuestionConfig } from '../../../src/types';

describe('buildMealProductionPdfPlaceholders', () => {
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
            labelFr: 'Commandé',
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

  const record: WebFormSubmission = {
    formKey: 'Config: Meal Production',
    language: 'EN',
    values: {
      MP_MEALS_REQUEST: [
        {
          MEAL_TYPE: 'Vegetarian',
          ORD_QTY: 20,
          FINAL_QTY: 18,
          MP_TYPE_LI: [
            {
              PREP_TYPE: 'Cook',
              PREP_QTY: 12,
              RECIPE: 'Veg curry',
              MP_INGREDIENTS_LI: [
                { ING: 'Carrots', ALLERGEN: 'None' },
                { ING: 'Peas', ALLERGEN: 'Peas' }
              ]
            },
            {
              PREP_TYPE: 'Entire dish',
              PREP_QTY: 6,
              RECIPE: 'Leftover curry',
              MP_INGREDIENTS_LI: [
                { ING: 'Carrots', ALLERGEN: 'None' }
              ]
            },
            {
              PREP_TYPE: 'Part dish',
              PREP_QTY: 0,
              RECIPE: 'Spice mix',
              MP_INGREDIENTS_LI: [
                { ING: 'Spices', ALLERGEN: 'None' }
              ]
            }
          ]
        }
      ]
    }
  };

  const form: FormConfig = {
    title: 'Meal Production',
    configSheet: 'Config: Meal Production',
    destinationTab: 'Meal Production Data',
    rowIndex: 1,
    followupConfig: {},
    actionBars: {}
  } as FormConfig;

  it('includes cooked and leftover sections in meal blocks', () => {
    const placeholders = buildMealProductionPdfPlaceholders({ record, questions, form });
    expect(placeholders.MEAL_BLOCKS).toContain('Vegetarian');
    expect(placeholders.MEAL_BLOCKS).toContain('Delivered: 18 portions');
    expect(placeholders.MEAL_BLOCKS).toContain('Veg curry');
    expect(placeholders.MEAL_BLOCKS).toContain('Leftover curry');
    expect(placeholders.MEAL_BLOCKS).toContain('Spices');
    expect(placeholders.APP_HEADER_LOGO_HTML).toBe('');
  });
});
