import { buildRecordSyncComparableFingerprint, buildRecordSyncReviewSteps } from '../../../src/web/react/app/recordSyncReview';

describe('recordSyncReview helpers', () => {
  const definition: any = {
    formKey: 'Config: Meal Production',
    questions: [
      {
        id: 'MP_MEALS_REQUEST',
        type: 'LINE_ITEM_GROUP',
        label: { en: 'Meal rows', fr: 'Meal rows', nl: 'Meal rows' },
        required: false,
        lineItemConfig: {
          fields: [
            {
              id: 'MEAL_TYPE',
              type: 'CHOICE',
              labelEn: 'Dietary category',
              labelFr: 'Dietary category',
              labelNl: 'Dietary category',
              required: false,
              options: ['Vegetarian', 'Vegan'],
              optionsFr: ['Vegetarian', 'Vegan'],
              optionsNl: ['Vegetarian', 'Vegan']
            },
            {
              id: 'RECIPE',
              type: 'TEXT',
              labelEn: 'Recipe',
              labelFr: 'Recipe',
              labelNl: 'Recipe',
              required: false
            }
          ]
        }
      },
      {
        id: 'MP_LEFTOVER_CAPTURE_LI',
        type: 'LINE_ITEM_GROUP',
        label: { en: 'Leftovers', fr: 'Leftovers', nl: 'Leftovers' },
        required: false,
        lineItemConfig: {
          fields: [
            {
              id: 'LEFTOVER_DIETARY_APPLICABILITY',
              type: 'TEXT',
              labelEn: 'Dietary applicability',
              labelFr: 'Dietary applicability',
              labelNl: 'Dietary applicability',
              required: false
            },
            {
              id: 'LEFTOVER_QTY',
              type: 'NUMBER',
              labelEn: 'Quantity',
              labelFr: 'Quantity',
              labelNl: 'Quantity',
              required: false
            }
          ]
        }
      }
    ],
    steps: {
      mode: 'guided',
      items: [
        {
          id: 'recipe',
          label: { en: 'Recipe', fr: 'Recipe', nl: 'Recipe' },
          include: [
            {
              kind: 'lineGroup',
              id: 'MP_MEALS_REQUEST',
              fields: ['MEAL_TYPE', 'RECIPE']
            }
          ]
        },
        {
          id: 'leftovers',
          label: { en: 'Leftovers', fr: 'Leftovers', nl: 'Leftovers' },
          include: [
            {
              kind: 'lineGroup',
              id: 'MP_LEFTOVER_CAPTURE_LI',
              label: { en: 'Single-ingredient leftovers', fr: 'Single-ingredient leftovers', nl: 'Single-ingredient leftovers' }
            }
          ]
        }
      ]
    }
  };

  test('ignores status, pdfUrl, and __ck row metadata in comparable fingerprints', () => {
    const previous = buildRecordSyncComparableFingerprint({
      definition,
      formKey: definition.formKey,
      language: 'EN',
      values: {
        status: 'In progress',
        pdfUrl: 'https://example.test/a.pdf',
        MP_SERVICE: 'Lunch',
        MP_MEALS_REQUEST: [{ MEAL_TYPE: 'Vegan', RECIPE: 'Tajine' }] as any,
        MP_MEALS_REQUEST_json: '[{"MEAL_TYPE":"Vegan","RECIPE":"Tajine"}]'
      } as any,
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'row-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine', __ckRowId: 'row-1' } as any }]
      } as any
    });

    const next = buildRecordSyncComparableFingerprint({
      definition,
      formKey: definition.formKey,
      language: 'EN',
      values: {
        status: 'Final report emailed',
        pdfUrl: 'https://example.test/b.pdf',
        MP_SERVICE: 'Lunch',
        MP_MEALS_REQUEST: [{ MEAL_TYPE: 'Vegan', RECIPE: 'Tajine sauce' }] as any,
        MP_MEALS_REQUEST_json: '[{"MEAL_TYPE":"Vegan","RECIPE":"Tajine sauce"}]'
      } as any,
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'row-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine', __ckRowId: 'row-1' } as any }]
      } as any
    });

    expect(next).toBe(previous);
  });

  test('ignores mirrored line-group payload fields in review steps', () => {
    const groups = buildRecordSyncReviewSteps({
      definition,
      language: 'EN' as any,
      previousValues: {
        MP_MEALS_REQUEST: [{ MEAL_TYPE: 'Vegan', RECIPE: 'Tajine' }] as any,
        MP_MEALS_REQUEST_json: '[{"MEAL_TYPE":"Vegan","RECIPE":"Tajine"}]',
        MP_LEFTOVER_CAPTURE_LI: [] as any,
        MP_LEFTOVER_CAPTURE_LI_json: '[]'
      } as any,
      previousLineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine' } as any }]
      } as any,
      nextValues: {
        MP_MEALS_REQUEST: [{ MEAL_TYPE: 'Vegan', RECIPE: 'Tajine sauce' }] as any,
        MP_MEALS_REQUEST_json: '[{"MEAL_TYPE":"Vegan","RECIPE":"Tajine sauce"}]',
        MP_LEFTOVER_CAPTURE_LI: [{ LEFTOVER_QTY: 7 }] as any,
        MP_LEFTOVER_CAPTURE_LI_json: '[{"LEFTOVER_QTY":7}]'
      } as any,
      nextLineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine' } as any }]
      } as any
    });

    expect(groups).toEqual([]);
  });

  test('builds step-scoped review groups and keeps the current step first', () => {
    const groups = buildRecordSyncReviewSteps({
      definition,
      language: 'EN' as any,
      preferredFirstStepId: 'leftovers',
      previousValues: {
        status: 'In progress'
      } as any,
      previousLineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine' } as any }],
        MP_LEFTOVER_CAPTURE_LI: [
          {
            id: 'leftover-1',
            values: {
              LEFTOVER_DIETARY_APPLICABILITY: 'Vegetarian',
              LEFTOVER_QTY: 10
            } as any
          }
        ]
      } as any,
      nextValues: {
        status: 'Final report emailed'
      } as any,
      nextLineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegan', RECIPE: 'Tajine sauce' } as any }],
        MP_LEFTOVER_CAPTURE_LI: [
          {
            id: 'leftover-1',
            values: {
              LEFTOVER_DIETARY_APPLICABILITY: 'Vegetarian',
              LEFTOVER_QTY: 7
            } as any
          }
        ]
      } as any
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].stepId).toBe('leftovers');
    expect(groups[0].items).toEqual([
      expect.objectContaining({
        label: 'Single-ingredient leftovers | Vegetarian',
        previousText: '10',
        nextText: '7'
      })
    ]);
    expect(groups[1].stepId).toBe('recipe');
    expect(groups[1].items).toEqual([
      expect.objectContaining({
        label: 'Recipe | Vegan',
        previousText: 'Tajine',
        nextText: 'Tajine sauce'
      })
    ]);
  });
});
