import '../../mocks/GoogleAppsScript';
import { renderHtmlFromHtmlTemplate } from '../../../src/services/webform/followup/htmlRenderer';
import { WebFormService } from '../../../src/services/WebFormService';
import { buildDraftPayload } from '../../../src/web/react/app/submission';
import { buildInitialLineItems, ROW_ID_KEY } from '../../../src/web/react/app/lineItems';
import { FormConfig, QuestionConfig, WebFormDefinition, WebFormSubmission } from '../../../src/types';
import { MockSpreadsheet } from '../../mocks/GoogleAppsScript';

const mealProductionGroup: QuestionConfig = {
  id: 'MP_MEALS_REQUEST',
  type: 'LINE_ITEM_GROUP',
  qEn: 'Meal requests',
  qFr: 'Demandes',
  qNl: 'Aanvragen',
  required: false,
  status: 'Active',
  options: [],
  optionsFr: [],
  optionsNl: [],
  lineItemConfig: {
    fields: [
      { id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', required: false } as any,
      { id: 'ORD_QTY', type: 'NUMBER', labelEn: 'Ordered', required: false } as any,
      { id: 'FINAL_QTY', type: 'NUMBER', labelEn: 'Final', required: false } as any
    ],
    subGroups: [
      {
        id: 'MP_TYPE_LI',
        fields: [
          { id: 'PREP_TYPE', type: 'TEXT', labelEn: 'Prep type', required: false } as any,
          { id: 'PREP_QTY', type: 'NUMBER', labelEn: 'Prep qty', required: false } as any,
          { id: 'RECIPE', type: 'TEXT', labelEn: 'Recipe', required: false } as any,
          { id: 'REC_INST', type: 'PARAGRAPH', labelEn: 'Instructions', required: false } as any,
          { id: 'LEFTOVER_USAGE_MODE', type: 'TEXT', labelEn: 'Leftover usage mode', required: false } as any,
          { id: 'LEFTOVER_SUMMARY_ACTION', type: 'TEXT', labelEn: 'Leftover summary action', required: false } as any
        ],
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'CAT', type: 'TEXT', labelEn: 'Category', required: false } as any,
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false } as any,
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', required: false } as any,
              { id: 'UNIT', type: 'TEXT', labelEn: 'Unit', required: false } as any,
              { id: 'ALLERGEN', type: 'TEXT', labelEn: 'Allergen', required: false } as any
            ]
          } as any
        ]
      } as any
    ]
  }
} as any;

const questions: QuestionConfig[] = [
  { id: 'MP_DISTRIBUTOR', type: 'TEXT', qEn: 'Distributor', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  { id: 'MP_SERVICE', type: 'TEXT', qEn: 'Service', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  { id: 'MP_PREP_DATE', type: 'DATE', qEn: 'Prep Date', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  {
    id: 'MP_EXP_DATE',
    type: 'DATE',
    qEn: 'Expiration Date',
    required: false,
    status: 'Active',
    options: [],
    optionsFr: [],
    optionsNl: [],
    derivedValue: { op: 'addDays', dependsOn: 'MP_PREP_DATE', offsetDays: 3, overrideFieldId: 'MP_EXP_DATE_OVERRIDE' }
  } as any,
  {
    id: 'MP_EXP_DATE_OVERRIDE',
    type: 'DATE',
    qEn: 'Expiration Date Override',
    required: false,
    status: 'Active',
    options: [],
    optionsFr: [],
    optionsNl: []
  } as any,
  { id: 'MP_ID', type: 'TEXT', qEn: 'Meal Production ID', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  { id: 'ING_EVD', type: 'FILE_UPLOAD', qEn: 'Evidence', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  { id: 'MP_COOK_TEMP', type: 'CHECKBOX', qEn: 'All pots ≥63°C', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  { id: 'TEMP_EVD', type: 'FILE_UPLOAD', qEn: 'Food safety photo', required: false, status: 'Active', options: [], optionsFr: [], optionsNl: [] } as any,
  mealProductionGroup
];

const form: FormConfig = {
  title: 'Meal Production',
  configSheet: 'Config: Meal Production',
  destinationTab: 'Meal Production Data',
  rowIndex: 1,
  templateCacheTtlSeconds: 0,
  summaryHtmlTemplateId: { EN: 'bundle:ingredients_needed.html' },
  followupConfig: {},
  actionBars: {}
} as any;

const definition: WebFormDefinition = {
  title: 'Meal Production',
  destinationTab: 'Meal Production Data',
  questions: questions as any,
  languages: ['EN'] as any,
  summaryHtmlTemplateId: { EN: 'bundle:ingredients_needed.html' }
} as any;

const recordValues = {
  MP_DISTRIBUTOR: 'Belliard',
  MP_SERVICE: 'Dinner',
  MP_PREP_DATE: '2026-03-20',
  MP_EXP_DATE: '2026-03-23',
  MP_EXP_DATE_OVERRIDE: '',
  MP_ID: 'MP-AA000818',
  ING_EVD: 'https://example.com/photo-1',
  MP_COOK_TEMP: true,
  TEMP_EVD: 'https://example.com/temp-photo-1',
  MP_MEALS_REQUEST: [
    {
      [ROW_ID_KEY]: 'meal-1',
      MEAL_TYPE: 'Diabetic',
      ORD_QTY: 15,
      FINAL_QTY: 15,
      MP_TYPE_LI: [
        {
          [ROW_ID_KEY]: 'prep-1',
          PREP_TYPE: 'Cook',
          PREP_QTY: 15,
          RECIPE: 'Garlic green beans',
          REC_INST: 'Cook gently.',
          MP_INGREDIENTS_LI: [
            { [ROW_ID_KEY]: 'ing-1', CAT: 'Beans', ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag', ALLERGEN: 'None' },
            { [ROW_ID_KEY]: 'ing-2', CAT: 'Seasoning', ING: 'Salt', QTY: 3, UNIT: 'Tbsp', ALLERGEN: 'None' }
          ]
        }
      ]
    }
  ]
};

const dataSources = { lookupDataSourceDetails: () => null } as any;

function seedIngredientsData(ss: MockSpreadsheet): void {
  const ingredientsSheet = ss.insertSheet('Ingredients Data');
  ingredientsSheet.setMockData([
    [
      'Language',
      'Ingredient name [INGREDIENT_NAME]',
      'Category [CATEGORY]',
      'Allowed unit [ALLOWED_UNIT]',
      'Dietary applicability [DIETARY_APPLICABILITY]',
      'Supplier [SUPPLIER]',
      'Allergen [ALLERGEN]'
    ],
    ['EN', 'Green beans - frozen', 'Frozen vegetables', 'bag', 'Vegan, Vegetarian', 'Freshmed', 'None'],
    ['EN', 'Salt', 'Herbs - spices - condiments', 'Tbsp, gr', 'Vegan, Vegetarian', 'Freshmed', 'None']
  ]);
}

describe('meal production bundled HTML rendering', () => {
  it('renders nested ingredients in bundle:ingredients_needed.html from record values', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: recordValues as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:ingredients_needed.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Green beans - frozen');
    expect(res.html).toContain('Salt');
    expect(res.html).toContain('ck-category-row');
  });

  it('renders the summary ingredients action as a primary button', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: recordValues as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:meal_production.summary.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('data-ck-action="ING_PREVIEW"');
    expect(res.html).toContain('data-ck-action="MP_OVERRIDE_EXP_DATE"');
    expect(res.html).toContain('data-ck-action-value-field="MP_EXP_DATE_OVERRIDE"');
    expect(res.html).toContain('(*) manually entered');
    expect(res.html).toContain('background: var(--accent, #0b57d0)');
    expect(res.html).toContain('color: var(--accentText, #fff)');
  });

  it('renders nested ingredients in bundle:ingredients_needed.html from buildDraftPayload output', () => {
    const lineItems = buildInitialLineItems(definition, recordValues as any);
    const payload = buildDraftPayload({
      definition,
      formKey: 'Config: Meal Production',
      language: 'EN' as any,
      values: recordValues as any,
      lineItems,
      existingRecordId: 'MP-AA000818'
    });

    const record: WebFormSubmission = {
      formKey: payload.formKey,
      language: payload.language as any,
      id: payload.id,
      values: payload.values as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:ingredients_needed.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Green beans - frozen');
    expect(res.html).toContain('Salt');
    expect(res.html).toContain('ck-category-row');
  });

  it('renders nested ingredients in bundle:mp.ing_recipe.html for a single prep row', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: {
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Diabetic',
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-1',
                PREP_TYPE: 'Cook',
                PREP_QTY: 15,
                RECIPE: 'Garlic green beans',
                REC_INST: 'Cook gently.',
                MP_INGREDIENTS_LI: [
                  { [ROW_ID_KEY]: 'ing-1', CAT: 'Beans', ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag', ALLERGEN: 'None' },
                  { [ROW_ID_KEY]: 'ing-2', CAT: 'Seasoning', ING: 'Salt', QTY: 3, UNIT: 'Tbsp', ALLERGEN: 'None' }
                ]
              }
            ]
          }
        ]
      } as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:mp.ing_recipe.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Green beans - frozen');
    expect(res.html).toContain('Salt');
    expect(res.html).toContain('No instructions provided.');
  });

  it('renders mp.ing_recipe.html even when ingredient categories are blank', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: {
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Diabetic',
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-1',
                PREP_TYPE: 'Cook',
                PREP_QTY: 15,
                RECIPE: 'Garlic green beans',
                REC_INST: 'Cook gently.',
                MP_INGREDIENTS_LI: [
                  { [ROW_ID_KEY]: 'ing-1', CAT: '', ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag', ALLERGEN: 'None' },
                  { [ROW_ID_KEY]: 'ing-2', CAT: '', ING: 'Salt', QTY: 3, UNIT: 'Tbsp', ALLERGEN: 'None' }
                ]
              }
            ]
          }
        ]
      } as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:mp.ing_recipe.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Green beans - frozen');
    expect(res.html).toContain('Salt');
    expect(res.html).toContain('Ingredients list');
  });

  it('renders meal production bundled templates through WebFormService using actual bundled form config', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const payload: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: recordValues as any,
      status: 'In progress'
    } as any;

    const summary = service.renderSummaryHtmlTemplate(payload);
    const recipe = service.renderInlineHtmlTemplate(payload, { EN: 'bundle:mp.ing_recipe.html' });

    expect(summary.success).toBe(true);
    expect(summary.html).toContain('Green beans - frozen');
    expect(summary.html).toContain('Salt');
    expect(summary.html).toContain('data-food-safety-confirmation-value>✅</div>');
    expect(summary.html).toContain("text === '✔' || text === '✅'");
    expect(summary.html).toContain('data-food-safety-photo-value>');
    expect(recipe.success).toBe(true);
    expect(recipe.html).toContain('Green beans - frozen');
    expect(recipe.html).toContain('Salt');
  });

  it('hydrates leftover ingredients from linked bank records when meal production prep rows are saved without MP_INGREDIENTS_LI', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const realFetchSubmissionById = service.fetchSubmissionById.bind(service);
    jest.spyOn(service, 'fetchSubmissionById').mockImplementation((formKey: string, recordId: string) => {
      if (formKey !== 'Config: Leftover Bank') {
        return realFetchSubmissionById(formKey, recordId);
      }
      if (recordId === 'leftover-single') {
        return {
          formKey,
          language: 'EN',
          id: recordId,
          values: {
            LEFTOVER_KIND: 'Single-ingredient',
            LEFTOVER_INGREDIENT: 'Basil - fresh',
            LEFTOVER_CAT: 'Herbs - spices - condiments',
            LEFTOVER_ALLERGEN: 'None',
            LEFTOVER_UNIT: 'gr'
          }
        } as any;
      }
      if (recordId === 'leftover-multi') {
        return {
          formKey,
          language: 'EN',
          id: recordId,
          values: {
            LEFTOVER_KIND: 'Multi-ingredient',
            LEFTOVER_INGREDIENTS_LI: [
              { ING: 'Bulgur', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten', QTY: '2.80', UNIT: 'kg' },
              { ING: 'Broccoli', CAT: 'Fresh vegetables', ALLERGEN: 'None', QTY: '2.33', UNIT: 'kg' }
            ]
          }
        } as any;
      }
      return null;
    });

    const payload: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-record-leftovers',
      values: {
        MP_DISTRIBUTOR: 'Hub',
        MP_SERVICE: 'Lunch',
        MP_PREP_DATE: '2026-04-22',
        MP_ID: 'MP-AA001403',
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Vegetarian',
            ORD_QTY: 450,
            MP_TO_COOK: 450,
            FINAL_QTY: 450,
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-single',
                PREP_TYPE: 'Single-ingredient',
                PREP_QTY: '500',
                RECIPE: 'Basil - fresh',
                LEFTOVER_KIND: 'Single-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-single',
                LEFTOVER_ID: 'SI-4',
                LEFTOVER_USE_QTY: '500',
                LEFTOVER_DISPLAY_UNIT: 'gr',
                MP_INGREDIENTS_LI: []
              },
              {
                [ROW_ID_KEY]: 'prep-multi',
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Bulgur & vegetable warm salad mama mia',
                LEFTOVER_KIND: 'Multi-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-multi',
                LEFTOVER_ID: 'MI-10',
                LEFTOVER_USAGE_MODE: 'Combine',
                MP_INGREDIENTS_LI: []
              },
              {
                [ROW_ID_KEY]: 'prep-cook',
                PREP_TYPE: 'Cook',
                PREP_QTY: 450,
                RECIPE: 'Chili',
                MP_INGREDIENTS_LI: [
                  { [ROW_ID_KEY]: 'ing-1', CAT: 'Vegan protein', ING: 'Red beans - tinned', QTY: 10, UNIT: 'tin-2505gr', ALLERGEN: 'None' },
                  { [ROW_ID_KEY]: 'ing-2', CAT: 'Herbs - spices - condiments', ING: 'Bouillon powder', QTY: 30, UNIT: 'Tbsp', ALLERGEN: 'Soy' }
                ]
              }
            ]
          }
        ]
      } as any,
      status: 'In progress'
    } as any;

    const summary = service.renderSummaryHtmlTemplate(payload);

    expect(summary.success).toBe(true);
    expect(summary.html).toContain('<td data-ingredient-name>Basil - fresh</td>');
    expect(summary.html).toContain('<td data-ingredient-name>Broccoli</td>');
    expect(summary.html).toContain('<td data-ingredient-allergen>Gluten</td>');
  });

  it('includes leftover display-mode metadata in the summary template payload', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const payload: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA001403',
      values: {
        ...recordValues,
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Vegetarian',
            ORD_QTY: 450,
            MP_TO_COOK: 450,
            FINAL_QTY: 450,
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-multi-combine',
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 0,
                RECIPE: 'Bulgur & vegetable warm salad mama mia',
                LEFTOVER_USAGE_MODE: 'Combine',
                LEFTOVER_SUMMARY_ACTION: 'combine'
              },
              {
                [ROW_ID_KEY]: 'prep-multi-reheat',
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 40,
                RECIPE: 'Chili',
                LEFTOVER_USAGE_MODE: 'Reheat',
                LEFTOVER_SUMMARY_ACTION: 'reheat '
              }
            ]
          }
        ]
      } as any,
      status: 'Closed'
    } as any;

    const summary = service.renderSummaryHtmlTemplate(payload);

    expect(summary.success).toBe(true);
    expect(summary.html).toContain('data-leftover-summary-action>combine</span>');
    expect(summary.html).toContain('data-leftover-summary-action>reheat </span>');
  });

  it('injects generated leftover records into the summary template payload for later rendering', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const bankConfig = ss.insertSheet('Config: Leftover Bank');
    bankConfig.setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'TEXT', 'Kind', 'Kind', 'Kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RECIPE', 'TEXT', 'Recipe', 'Recipe', 'Recipe', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_INGREDIENT', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PORTIONS', 'NUMBER', 'Portions', 'Portions', 'Portions', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Qty', 'Qty', 'Qty', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_RECORD_ID', 'TEXT', 'Source record id', 'Source record id', 'Source record id', false, '', '', '', 'Active', '', '', '', '', '']
    ]);
    const bankData = ss.insertSheet('Leftover Bank Data');
    bankData.setMockData([
      ['ID [ID]', 'Leftover ID [LEFTOVER_ID]', 'Kind [LEFTOVER_KIND]', 'Recipe [LEFTOVER_RECIPE]', 'Ingredient [LEFTOVER_INGREDIENT]', 'Portions [LEFTOVER_PORTIONS]', 'Qty [LEFTOVER_QTY]', 'Unit [LEFTOVER_UNIT]', 'Source form [LEFTOVER_SOURCE_FORM_KEY]', 'Source record [LEFTOVER_SOURCE_RECORD_ID]'],
      ['inv-1', 'LE-1', 'Multi-ingredient', 'Garlic green beans', '', 5, '', '', 'Config: Meal Production', 'MP-AA000818'],
      ['inv-2', 'LP-1', 'Single-ingredient', '', 'Rice', '', 250, 'gr', 'Config: Meal Production', 'MP-AA000818']
    ]);

    const service = new WebFormService(ss as any);
    const payload: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: recordValues as any,
      status: 'Closed'
    } as any;

    const summary = service.renderSummaryHtmlTemplate(payload);

    expect(summary.success).toBe(true);
    expect(summary.html).toContain('<ul class="ck-generated-list" data-generated-leftovers-list></ul>');
    expect(summary.html).toContain('data-generated-leftovers-json');
    expect(summary.html).toContain('LE-1');
    expect(summary.html).toContain('LP-1');
    expect(summary.html).toContain('LEFTOVER_PORTIONS');
  });

  it('backfills missing ingredient category and allergen metadata at render time for actual bundled meal production records', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const payload: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: {
        ...recordValues,
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Diabetic',
            ORD_QTY: 15,
            FINAL_QTY: 15,
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-1',
                PREP_TYPE: 'Cook',
                PREP_QTY: 15,
                RECIPE: 'Garlic green beans',
                REC_INST: 'Cook gently.',
                MP_INGREDIENTS_LI: [
                  { [ROW_ID_KEY]: 'ing-1', CAT: '', ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag', ALLERGEN: '' },
                  { [ROW_ID_KEY]: 'ing-2', CAT: '', ING: 'Salt', QTY: 3, UNIT: 'Tbsp', ALLERGEN: '' }
                ]
              }
            ]
          }
        ]
      } as any,
      status: 'In progress'
    } as any;

    const ingredientsNeeded = service.renderInlineHtmlTemplate(payload, { EN: 'bundle:ingredients_needed.html' });

    expect(ingredientsNeeded.success).toBe(true);
    expect(ingredientsNeeded.html).toContain('Frozen vegetables');
    expect(ingredientsNeeded.html).toContain('Herbs - spices - condiments');
    expect(ingredientsNeeded.html).toContain('Green beans - frozen');
    expect(ingredientsNeeded.html).toContain('Salt');
  });

  it('filters grouped ingredient categories from bundle:ingredients_needed.html using the same rules as ingredient rows', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000900',
      values: {
        MP_DISTRIBUTOR: 'Belliard',
        MP_SERVICE: 'Dinner',
        MP_PREP_DATE: '2026-04-01',
        MP_ID: 'MP-AA000900',
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Diabetic',
            ORD_QTY: 20,
            FINAL_QTY: 20,
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-cook',
                PREP_TYPE: 'Cook',
                PREP_QTY: 10,
                RECIPE: 'Adassi',
                MP_INGREDIENTS_LI: [
                  {
                    [ROW_ID_KEY]: 'ing-cook-1',
                    CAT: 'Dry carbohydrates',
                    ING: 'Rice',
                    QTY: 2,
                    UNIT: 'kg',
                    ALLERGEN: 'None'
                  }
                ]
              },
              {
                [ROW_ID_KEY]: 'prep-leftover',
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 10,
                RECIPE: 'Rice curry & fish',
                MP_INGREDIENTS_LI: [
                  {
                    [ROW_ID_KEY]: 'ing-leftover-1',
                    CAT: 'Animal protein Halal',
                    ING: 'Fishsticks',
                    QTY: 12,
                    UNIT: 'piece',
                    ALLERGEN: 'Fish'
                  }
                ]
              }
            ]
          }
        ]
      } as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:ingredients_needed.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Rice');
    expect(res.html).toContain('Dry carbohydrates');
    expect(res.html).not.toContain('Fishsticks');
    expect(res.html).not.toContain('Animal protein Halal');
  });

  it('omits empty grouped categories from bundle:ingredients_needed.html when only leftovers remain after filtering', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000901',
      values: {
        MP_DISTRIBUTOR: 'Belliard',
        MP_SERVICE: 'Dinner',
        MP_PREP_DATE: '2026-04-01',
        MP_ID: 'MP-AA000901',
        MP_MEALS_REQUEST: [
          {
            [ROW_ID_KEY]: 'meal-1',
            MEAL_TYPE: 'Diabetic',
            ORD_QTY: 20,
            FINAL_QTY: 20,
            MP_TYPE_LI: [
              {
                [ROW_ID_KEY]: 'prep-leftover',
                PREP_TYPE: 'Multi-ingredient',
                PREP_QTY: 10,
                RECIPE: 'Rice curry & fish',
                MP_INGREDIENTS_LI: [
                  {
                    [ROW_ID_KEY]: 'ing-leftover-1',
                    CAT: 'Animal protein Halal',
                    ING: 'Fishsticks',
                    QTY: 12,
                    UNIT: 'piece',
                    ALLERGEN: 'Fish'
                  }
                ]
              }
            ]
          }
        ]
      } as any
    } as any;

    const res = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap: { EN: 'bundle:ingredients_needed.html' }
    });

    expect(res.success).toBe(true);
    expect(res.html).not.toContain('Fishsticks');
    expect(res.html).not.toContain('Animal protein Halal');
    expect(res.html).not.toContain('<table class="ck-ingredients-table"');
  });

  it('renders meal production bundled templates from the actual bundled definition draft payload path', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const bundledDefinition = service.buildDefinition('Config: Meal Production');
    const lineItems = buildInitialLineItems(bundledDefinition, recordValues as any);
    const payload = buildDraftPayload({
      definition: bundledDefinition,
      formKey: 'Config: Meal Production',
      language: 'EN' as any,
      values: recordValues as any,
      lineItems,
      existingRecordId: 'MP-AA000818'
    });

    const summary = service.renderSummaryHtmlTemplate(payload as any);
    const recipe = service.renderInlineHtmlTemplate(payload as any, { EN: 'bundle:mp.ing_recipe.html' });

    expect(summary.success).toBe(true);
    expect(summary.html).toContain('Green beans - frozen');
    expect(summary.html).toContain('Salt');
    expect(recipe.success).toBe(true);
    expect(recipe.html).toContain('Green beans - frozen');
    expect(recipe.html).toContain('Salt');
  });

  it('renders mp.ing_recipe.html from the filtered overlay payload path', () => {
    const ss = new MockSpreadsheet();
    seedIngredientsData(ss);
    const service = new WebFormService(ss as any);
    const bundledDefinition = service.buildDefinition('Config: Meal Production');
    const lineItems = buildInitialLineItems(bundledDefinition, recordValues as any);
    const payload = buildDraftPayload({
      definition: bundledDefinition,
      formKey: 'Config: Meal Production',
      language: 'EN' as any,
      values: recordValues as any,
      lineItems,
      existingRecordId: 'MP-AA000818'
    });

    const rootRows = Array.isArray((payload.values as any).MP_MEALS_REQUEST)
      ? ([...(payload.values as any).MP_MEALS_REQUEST] as any[])
      : [];
    const filteredParents = rootRows.filter(row => (row as any)?.[ROW_ID_KEY] === 'meal-1');
    filteredParents.forEach(parentRow => {
      const children = Array.isArray((parentRow as any).MP_TYPE_LI) ? (parentRow as any).MP_TYPE_LI : [];
      (parentRow as any).MP_TYPE_LI = children.filter((child: any) => (child as any)?.[ROW_ID_KEY] === 'prep-1');
    });
    (payload.values as any).MP_MEALS_REQUEST = filteredParents;
    (payload.values as any).MP_MEALS_REQUEST_json = JSON.stringify(filteredParents);

    const recipe = service.renderInlineHtmlTemplate(payload as any, { EN: 'bundle:mp.ing_recipe.html' });

    expect(recipe.success).toBe(true);
    expect(recipe.html).toContain('Green beans - frozen');
    expect(recipe.html).toContain('Salt');
  });

  it('fetches a record and renders summary HTML in one service call', () => {
    const service = new WebFormService(new MockSpreadsheet() as any);
    const record: WebFormSubmission = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-AA000818',
      values: recordValues as any,
      status: 'In progress'
    } as any;
    const fetchSubmissionByRowNumber = jest.fn(() => record);
    const fetchSubmissionById = jest.fn(() => null);
    const renderHtmlFromHtmlTemplate = jest.fn(({ record: renderRecord }: any) => ({
      success: true,
      html: `<div>${renderRecord.language}: Green beans - frozen</div>`,
      fileName: 'Meal Production - Summary'
    }));

    (service as any)._listing = { fetchSubmissionByRowNumber, fetchSubmissionById };
    (service as any)._followups = { renderHtmlFromHtmlTemplate };

    const result = service.fetchSummaryRecord('Config: Meal Production', 'FR', 'MP-AA000818', 12);

    expect(result.success).toBe(true);
    expect(result.record).toBe(record);
    expect(result.html).toContain('Green beans - frozen');
    expect(fetchSubmissionByRowNumber).toHaveBeenCalledWith(expect.anything(), expect.anything(), 12);
    expect(fetchSubmissionById).not.toHaveBeenCalled();
    expect(renderHtmlFromHtmlTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateIdMap: expect.any(Object),
        record: expect.objectContaining({ language: 'FR' })
      })
    );
  });
});
