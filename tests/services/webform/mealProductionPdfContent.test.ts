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
    expect(placeholders.MEAL_BLOCKS).toContain('Veg curry');
    expect(placeholders.MEAL_BLOCKS).toContain('Leftover curry');
    expect(placeholders.MEAL_BLOCKS).toContain('Spices');
    expect(placeholders.MEAL_BLOCKS).toContain('Allergens');
    expect(placeholders.MEAL_BLOCKS).toContain('Peas');
    expect(placeholders.MEAL_BLOCKS).toContain('background:#d8f0d2');
    expect(placeholders.MEAL_BLOCKS).toContain('width:25%');
    expect(placeholders.MEAL_BLOCKS).toContain('width:75%');
    const tables = (placeholders.MEAL_BLOCKS.match(/class="ck-meal-table"/g) || []).length;
    expect(tables).toBe(2);
    expect(placeholders.APP_HEADER_LOGO_HTML).toBe('');
  });

  it('merges entire dish leftovers with quantity 0 into cooked section', () => {
    const recordWithZeroEntire: WebFormSubmission = {
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
                PREP_QTY: 18,
                RECIPE: 'Veg curry',
                MP_INGREDIENTS_LI: [
                  { ING: 'Carrots', ALLERGEN: 'None' }
                ]
              },
              {
                PREP_TYPE: 'Entire dish',
                PREP_QTY: 0,
                RECIPE: 'Leftover curry',
                MP_INGREDIENTS_LI: [
                  { ING: 'Peas', ALLERGEN: 'Peas' }
                ]
              }
            ]
          }
        ]
      }
    };

    const placeholders = buildMealProductionPdfPlaceholders({ record: recordWithZeroEntire, questions, form });
    expect(placeholders.MEAL_BLOCKS).toContain('Veg curry');
    expect(placeholders.MEAL_BLOCKS).not.toContain('Leftover curry');
    expect(placeholders.MEAL_BLOCKS).toContain('Carrots, Peas');
    expect(placeholders.MEAL_BLOCKS).toContain('Peas');
    const tables = (placeholders.MEAL_BLOCKS.match(/class="ck-meal-table"/g) || []).length;
    expect(tables).toBe(1);
  });
});
