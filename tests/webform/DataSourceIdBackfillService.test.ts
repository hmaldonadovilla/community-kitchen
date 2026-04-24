import '../mocks/GoogleAppsScript';
import { DataSourceIdBackfillService } from '../../src/services/webform/dataSourceIdBackfill';
import { DataSourceService } from '../../src/services/webform/dataSources';
import { CacheEtagManager } from '../../src/services/webform/cache';
import { SubmissionService } from '../../src/services/webform/submissions';
import { UploadService } from '../../src/services/webform/uploads';
import { FormConfig, QuestionConfig } from '../../src/types';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

const makeForm = (configSheet: string, destinationTab: string): FormConfig => ({
  title: configSheet.replace(/^Config:\s*/, ''),
  configSheet,
  destinationTab,
  description: '',
  formId: '',
  rowIndex: 1
});

const textQuestion = (id: string): QuestionConfig => ({
  id,
  type: 'TEXT',
  qEn: id,
  qFr: id,
  qNl: id,
  required: false,
  options: [],
  optionsFr: [],
  optionsNl: [],
  status: 'Active'
});

describe('DataSourceIdBackfillService', () => {
  const setup = () => {
    const ss = new MockSpreadsheet() as any;
    const cacheManager = new CacheEtagManager(null, null);
    const submissions = new SubmissionService(ss, new UploadService(ss), cacheManager, null);
    const dataSources = new DataSourceService(ss);

    const mealForm = makeForm('Config: Meal Production', 'Meal Production Data');
    const recipeForm = makeForm('Config: Recipes', 'Recipes Data');
    const ingredientForm = makeForm('Config: Ingredients Management', 'Ingredients Data');

    const recipeQuestions = [textQuestion('QFTD5RD2EM'), textQuestion('STATUS')];
    const ingredientQuestions = [
      textQuestion('INGREDIENT_NAME'),
      textQuestion('CATEGORY'),
      textQuestion('ALLERGEN'),
      textQuestion('STATUS')
    ];
    const mealQuestions: QuestionConfig[] = [
      {
        ...textQuestion('MP_MEALS_REQUEST'),
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [textQuestion('MEAL_TYPE') as any],
          subGroups: [
            {
              id: 'MP_TYPE_LI',
              fields: [
                textQuestion('PREP_QTY') as any,
                {
                  ...(textQuestion('RECIPE') as any),
                  type: 'CHOICE',
                  dataSource: {
                    id: 'Recipes Data',
                    mode: 'options',
                    formKey: 'Config: Recipes',
                    statusAllowList: ['Active'],
                    statusFieldId: 'status',
                    projection: ['QFTD5RD2EM', 'STATUS']
                  },
                  selectionEffects: [
                    {
                      id: 'syncRecipeIngredientsFromSource',
                      type: 'addLineItemsFromDataSource',
                      groupId: 'MP_INGREDIENTS_LI',
                      lookupField: 'id',
                      lookupFields: ['id', 'QFTD5RD2EM'],
                      lookupSourceFieldId: 'RECIPE_SOURCE_ID',
                      parentFieldMapping: {
                        RECIPE_SOURCE_ID: 'id',
                        RECIPE_SOURCE_UPDATED_AT: 'updatedAt',
                        RECIPE: 'QFTD5RD2EM'
                      }
                    }
                  ]
                }
              ],
              subGroups: [
                {
                  id: 'MP_INGREDIENTS_LI',
                  fields: [
                    {
                      ...(textQuestion('ING') as any),
                      type: 'CHOICE',
                      dataSource: {
                        id: 'Ingredients Data',
                        mode: 'options',
                        formKey: 'Config: Ingredients Management',
                        statusAllowList: ['Active'],
                        statusFieldId: 'STATUS',
                        projection: ['INGREDIENT_NAME', 'CATEGORY', 'ALLERGEN', 'STATUS']
                      },
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
                          }
                        }
                      ]
                    },
                    textQuestion('QTY') as any
                  ]
                }
              ]
            }
          ]
        }
      }
    ];

    const contexts = new Map<string, { form: FormConfig; questions: QuestionConfig[] }>([
      [mealForm.configSheet, { form: mealForm, questions: mealQuestions }],
      [recipeForm.configSheet, { form: recipeForm, questions: recipeQuestions }],
      [ingredientForm.configSheet, { form: ingredientForm, questions: ingredientQuestions }]
    ]);
    const service = new DataSourceIdBackfillService({
      ss,
      submissions,
      cacheManager,
      resolveFormContext: (formKey?: string) => {
        const context = contexts.get(formKey || '');
        if (!context) throw new Error(`Missing context ${formKey}`);
        return context;
      },
      fetchDataSource: dataSources.fetchDataSource.bind(dataSources)
    });

    return {
      ss,
      service,
      submissions,
      mealForm,
      mealQuestions,
      recipeForm,
      recipeQuestions,
      ingredientForm,
      ingredientQuestions
    };
  };

  const seedSources = (ctx: ReturnType<typeof setup>) => {
    const recipe = ctx.submissions.saveTrustedSubmissionWithId(
      {
        formKey: ctx.recipeForm.configSheet,
        id: 'recipe-1',
        language: 'EN',
        values: { QFTD5RD2EM: 'Vegetable soup', STATUS: 'Archived' },
        __ckStatus: 'Archived'
      } as any,
      ctx.recipeForm,
      ctx.recipeQuestions,
      []
    );
    const ingredient = ctx.submissions.saveTrustedSubmissionWithId(
      {
        formKey: ctx.ingredientForm.configSheet,
        id: 'ingredient-1',
        language: 'EN',
        values: {
          INGREDIENT_NAME: 'Carrot',
          CATEGORY: 'Fresh vegetables',
          ALLERGEN: 'None',
          STATUS: 'Archived'
        },
        __ckStatus: 'Archived'
      } as any,
      ctx.ingredientForm,
      ctx.ingredientQuestions,
      []
    );
    expect(recipe.success).toBe(true);
    expect(ingredient.success).toBe(true);
  };

  const seedMealProduction = (ctx: ReturnType<typeof setup>) => {
    const result = ctx.submissions.saveTrustedSubmissionWithId(
      {
        formKey: ctx.mealForm.configSheet,
        id: 'mp-1',
        language: 'EN',
        values: {
          MP_MEALS_REQUEST: [
            {
              __ckRowId: 'meal-1',
              MEAL_TYPE: 'Standard',
              MP_TYPE_LI: [
                {
                  __ckRowId: 'prep-1',
                  PREP_QTY: 10,
                  RECIPE: 'Vegetable soup',
                  RECIPE_SOURCE_ID: '',
                  RECIPE_SOURCE_UPDATED_AT: '',
                  MP_INGREDIENTS_LI: [
                    {
                      __ckRowId: 'ing-1',
                      ING: 'Carrot',
                      ING_SOURCE_ID: '',
                      ING_SOURCE_UPDATED_AT: '',
                      QTY: 2
                    }
                  ]
                }
              ]
            }
          ]
        },
        __ckStatus: 'Closed'
      } as any,
      ctx.mealForm,
      ctx.mealQuestions,
      []
    );
    expect(result.success).toBe(true);
  };

  const readMealRows = (ctx: ReturnType<typeof setup>) => {
    const { sheet, columns } = ctx.submissions.ensureDestination(ctx.mealForm.destinationTab, ctx.mealQuestions);
    const values = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    return JSON.parse(values[columns.fields.MP_MEALS_REQUEST - 1]);
  };

  test('dry-run reports recipe and ingredient source id updates without mutating the record', () => {
    const ctx = setup();
    seedSources(ctx);
    seedMealProduction(ctx);

    const result = ctx.service.run(ctx.mealForm.configSheet, { maxRows: 10 });
    expect(result.dryRun).toBe(true);
    expect(result.changedRows).toBe(1);
    expect(result.fieldUpdates).toBe(4);
    expect(result.samples.map(sample => sample.fieldId)).toEqual([
      'RECIPE_SOURCE_ID',
      'RECIPE_SOURCE_UPDATED_AT',
      'ING_SOURCE_ID',
      'ING_SOURCE_UPDATED_AT'
    ]);

    const mealRows = readMealRows(ctx);
    expect(mealRows[0].MP_TYPE_LI[0].RECIPE_SOURCE_ID).toBe('');
    expect(mealRows[0].MP_TYPE_LI[0].MP_INGREDIENTS_LI[0].ING_SOURCE_ID).toBe('');
  });

  test('commit fills only hidden source id fields and writes an audit log', () => {
    const ctx = setup();
    seedSources(ctx);
    seedMealProduction(ctx);

    const result = ctx.service.run(ctx.mealForm.configSheet, {
      dryRun: false,
      maxRows: 10,
      writeAuditLog: true
    });
    expect(result.success).toBe(true);
    expect(result.fieldUpdates).toBe(4);
    expect(result.auditRows).toBe(4);

    const mealRows = readMealRows(ctx);
    const prepRow = mealRows[0].MP_TYPE_LI[0];
    const ingredientRow = prepRow.MP_INGREDIENTS_LI[0];
    expect(prepRow.RECIPE).toBe('Vegetable soup');
    expect(prepRow.RECIPE_SOURCE_ID).toBe('recipe-1');
    expect(prepRow.RECIPE_SOURCE_UPDATED_AT).toContain('T');
    expect(ingredientRow.ING).toBe('Carrot');
    expect(ingredientRow.ING_SOURCE_ID).toBe('ingredient-1');
    expect(ingredientRow.ING_SOURCE_UPDATED_AT).toContain('T');

    const audit = ctx.ss.getSheetByName('Data Source ID Backfill Log');
    expect(audit).toBeDefined();
    expect((audit as any).getValues().length).toBe(5);
  });

  test('skips legacy values that match multiple source records', () => {
    const ctx = setup();
    seedSources(ctx);
    ctx.submissions.saveTrustedSubmissionWithId(
      {
        formKey: ctx.ingredientForm.configSheet,
        id: 'ingredient-2',
        language: 'EN',
        values: {
          INGREDIENT_NAME: 'Carrot',
          CATEGORY: 'Fresh vegetables',
          ALLERGEN: 'None',
          STATUS: 'Active'
        },
        __ckStatus: 'Active'
      } as any,
      ctx.ingredientForm,
      ctx.ingredientQuestions,
      []
    );
    seedMealProduction(ctx);

    const result = ctx.service.run(ctx.mealForm.configSheet, { dryRun: false, maxRows: 10 });
    expect(result.skippedAmbiguous).toBe(1);

    const mealRows = readMealRows(ctx);
    const ingredientRow = mealRows[0].MP_TYPE_LI[0].MP_INGREDIENTS_LI[0];
    expect(ingredientRow.ING_SOURCE_ID).toBe('');
  });
});
