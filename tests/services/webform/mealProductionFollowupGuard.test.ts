import { FollowupService } from '../../../src/services/webform/followup';
import { validateMealProductionFollowupActionReadiness } from '../../../src/services/webform/followup/mealProductionFollowupGuard';
import { FormConfig, QuestionConfig, WebFormSubmission } from '../../../src/types';

const mealProductionForm = {
  title: 'Meal Production',
  configSheet: 'Config: Meal Production',
  destinationTab: 'Meal Production Data',
  followupConfig: {
    pdfTemplateId: 'template-id',
    emailTemplateId: 'email-template-id',
    emailRecipients: ['kitchen@example.org']
  }
} as FormConfig;

const mealProductionQuestions: QuestionConfig[] = [
  {
    id: 'MP_MEALS_REQUEST',
    type: 'LINE_ITEM_GROUP',
    qEn: 'Meal requests',
    qFr: 'Demandes',
    qNl: 'Maaltijden',
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
          labelFr: '',
          labelNl: '',
          required: false,
          options: [],
          optionsFr: [],
          optionsNl: []
        },
        {
          id: 'MP_TO_COOK',
          type: 'NUMBER',
          labelEn: 'To cook',
          labelFr: '',
          labelNl: '',
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
  }
];

const buildRecord = (mealRow: Record<string, any>): WebFormSubmission => ({
  formKey: 'Config: Meal Production',
  language: 'EN',
  id: 'meal-production-record-1',
  values: {
    MP_MEALS_REQUEST: [
      {
        MEAL_TYPE: 'Vegetarian',
        ORD_QTY: 270,
        FINAL_QTY: 270,
        ...mealRow
      }
    ]
  }
});

describe('validateMealProductionFollowupActionReadiness', () => {
  it('blocks final report email when a cooked prep row has no recipe', () => {
    const record = buildRecord({
      MP_TO_COOK: 270,
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Cook',
          PREP_QTY: 270,
          RECIPE: '',
          MP_INGREDIENTS_LI: []
        }
      ]
    });

    const errors = validateMealProductionFollowupActionReadiness({
      form: mealProductionForm,
      questions: mealProductionQuestions,
      record,
      action: 'SEND_EMAIL'
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('send the final report email');
    expect(errors[0]).toContain('Vegetarian');
    expect(errors[0]).toContain('no recipe is selected');
  });

  it('blocks closing when portions to cook have no cooked prep row', () => {
    const record = buildRecord({
      MP_TO_COOK: '12',
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Multi-ingredient',
          PREP_QTY: 0,
          RECIPE: 'Leftover dhal'
        }
      ]
    });

    const errors = validateMealProductionFollowupActionReadiness({
      form: mealProductionForm,
      questions: mealProductionQuestions,
      record,
      action: 'CLOSE_RECORD'
    });

    expect(errors).toEqual([
      expect.stringContaining('Cannot close the Meal Production record because Vegetarian has portions to cook but no cooked prep row.')
    ]);
  });

  it('allows terminal follow-up actions when the cooked prep row has a recipe', () => {
    const record = buildRecord({
      MP_TO_COOK: 42,
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Cook',
          PREP_QTY: 42,
          RECIPE: 'Chili'
        }
      ]
    });

    const errors = validateMealProductionFollowupActionReadiness({
      form: mealProductionForm,
      questions: mealProductionQuestions,
      record,
      action: 'CREATE_PDF'
    });

    expect(errors).toEqual([]);
  });

  it('blocks a positive cooked prep row even when the parent to-cook value is missing', () => {
    const record = buildRecord({
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Cook',
          PREP_QTY: '18',
          RECIPE: ''
        }
      ]
    });

    const errors = validateMealProductionFollowupActionReadiness({
      form: mealProductionForm,
      questions: mealProductionQuestions,
      record,
      action: 'CREATE_PDF'
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Cannot create the final report');
    expect(errors[0]).toContain('no recipe is selected');
  });

  it('does not block records without portions to cook', () => {
    const record = buildRecord({
      MP_TO_COOK: 0,
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Cook',
          PREP_QTY: 0,
          RECIPE: ''
        }
      ]
    });

    const errors = validateMealProductionFollowupActionReadiness({
      form: mealProductionForm,
      questions: mealProductionQuestions,
      record,
      action: 'SEND_EMAIL'
    });

    expect(errors).toEqual([]);
  });

  it('does not apply to unrelated forms', () => {
    const record: WebFormSubmission = {
      formKey: 'Config: Delivery',
      language: 'EN',
      values: {
        MP_MEALS_REQUEST: [
          {
            MP_TO_COOK: 10,
            MP_TYPE_LI: [{ PREP_TYPE: 'Cook', PREP_QTY: 10, RECIPE: '' }]
          }
        ]
      }
    };

    const errors = validateMealProductionFollowupActionReadiness({
      form: { title: 'Delivery', configSheet: 'Config: Delivery' } as FormConfig,
      questions: [],
      record,
      action: 'SEND_EMAIL'
    });

    expect(errors).toEqual([]);
  });
});

describe('FollowupService Meal Production readiness guard', () => {
  it('returns a validation failure before generating a PDF', () => {
    const record = buildRecord({
      MP_TO_COOK: 25,
      MP_TYPE_LI: [
        {
          PREP_TYPE: 'Cook',
          PREP_QTY: 25,
          RECIPE: ' '
        }
      ]
    });
    const submissionService = {
      getRecordContext: jest.fn(() => ({
        sheet: {},
        headers: [],
        columns: { fields: {} },
        rowIndex: 2,
        rowValues: [],
        record
      }))
    };
    const service = new FollowupService({} as any, submissionService as any, {} as any);
    const pdfSpy = jest.spyOn(service, 'generatePdfArtifact');

    const result = service.triggerFollowupAction(mealProductionForm, mealProductionQuestions, record.id || '', 'CREATE_PDF');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Validation failed');
    expect(result.message).toContain('no recipe is selected');
    expect(pdfSpy).not.toHaveBeenCalled();
  });
});
