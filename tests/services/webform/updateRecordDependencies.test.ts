import {
  applyUpdateRecordDependencyMutationsToRecord,
  evaluateUpdateRecordDependencyPreview
} from '../../../src/services/webform/updateRecordDependencies';

const buildGuard = () =>
  ({
    targetFormKey: 'Meal Production',
    when: {
      all: [
        { fieldId: 'status', notEquals: 'Closed' },
        {
          any: [
            { fieldId: 'MP_PREP_DATE', isToday: true },
            { fieldId: 'MP_PREP_DATE', isInFuture: true }
          ]
        },
        {
          lineItems: {
            groupId: 'MP_MEALS_REQUEST',
            subGroupId: 'MP_TYPE_LI',
            when: {
              fieldId: 'RECIPE',
              equals: '{{source.QFTD5RD2EM}}'
            }
          }
        }
      ]
    },
    dialog: {
      title: { en: 'Recipe used in meal production' },
      message: { en: 'This recipe is still selected on {{count}} record(s).' },
      confirmLabel: { en: 'Deactivate and clear' },
      cancelLabel: { en: 'Cancel' }
    },
    mutations: [
      {
        type: 'setLineItemValues',
        groupId: 'MP_MEALS_REQUEST',
        subGroupPath: ['MP_TYPE_LI'],
        when: {
          fieldId: 'RECIPE',
          equals: '{{source.QFTD5RD2EM}}'
        },
        values: { RECIPE: null },
        clearSubGroups: ['MP_INGREDIENTS_LI']
      }
    ]
  }) as any;

const targetQuestions: any[] = [
  { id: 'MP_PREP_DATE', type: 'DATE' },
  {
    id: 'MP_MEALS_REQUEST',
    type: 'LINE_ITEM_GROUP',
    lineItemConfig: {
      fields: [],
      subGroups: [
        {
          id: 'MP_TYPE_LI',
          fields: [
            { id: 'PREP_TYPE', type: 'CHOICE' },
            { id: 'RECIPE', type: 'TEXT' }
          ],
          subGroups: [
            {
              id: 'MP_INGREDIENTS_LI',
              fields: [{ id: 'ING', type: 'TEXT' }]
            }
          ]
        }
      ]
    }
  }
];

const buildTargetRecord = () =>
  ({
    formKey: 'Meal Production',
    language: 'EN',
    id: 'mp-1',
    status: 'In progress',
    values: {
      MP_PREP_DATE: '2026-03-12',
      MP_MEALS_REQUEST: [
        {
          __ckRowId: 'meal-1',
          MP_TYPE_LI: [
            {
              __ckRowId: 'prep-cook',
              __ckParentRowId: 'meal-1',
              __ckParentGroupId: 'MP_MEALS_REQUEST',
              PREP_TYPE: 'Cook',
              RECIPE: 'Tomato Soup',
              MP_INGREDIENTS_LI: [{ __ckRowId: 'ing-1', ING: 'Tomato' }]
            },
            {
              __ckRowId: 'prep-reheat',
              __ckParentRowId: 'meal-1',
              __ckParentGroupId: 'MP_MEALS_REQUEST',
              PREP_TYPE: 'Reheat',
              RECIPE: 'Tomato Soup',
              MP_INGREDIENTS_LI: [{ __ckRowId: 'ing-2', ING: 'Bread' }]
            }
          ]
        }
      ]
    }
  }) as any;

describe('updateRecordDependencies', () => {
  it('previews impacted downstream records and resolves dialog placeholders', () => {
    const sourceRecord: any = {
      formKey: 'Recipes',
      language: 'EN',
      id: 'rec-1',
      status: 'Active',
      values: { QFTD5RD2EM: 'Tomato Soup' }
    };
    const impacted = buildTargetRecord();
    const closed: any = {
      ...buildTargetRecord(),
      id: 'mp-closed',
      status: 'Closed'
    };
    const otherRecipe: any = {
      ...buildTargetRecord(),
      id: 'mp-other',
      values: {
        ...buildTargetRecord().values,
        MP_MEALS_REQUEST: [
          {
            __ckRowId: 'meal-2',
            MP_TYPE_LI: [
              {
                __ckRowId: 'prep-other',
                __ckParentRowId: 'meal-2',
                __ckParentGroupId: 'MP_MEALS_REQUEST',
                PREP_TYPE: 'Cook',
                RECIPE: 'Pumpkin Soup',
                MP_INGREDIENTS_LI: [{ __ckRowId: 'ing-3', ING: 'Pumpkin' }]
              }
            ]
          }
        ]
      }
    };

    const preview = evaluateUpdateRecordDependencyPreview({
      guard: buildGuard(),
      sourceRecord,
      language: 'EN',
      targetFormKey: 'Meal Production',
      targetFormTitle: 'Meal Production',
      targetQuestions,
      targetRecords: [impacted, closed, otherRecipe],
      now: new Date('2026-03-12T09:00:00Z')
    });

    expect(preview.impactedCount).toBe(1);
    expect(preview.impactedRecords.map(record => record.id)).toEqual(['mp-1']);
    expect(preview.dialog.title).toBe('Recipe used in meal production');
    expect(preview.dialog.message).toContain('1 record(s)');
  });

  it('clears every matching recipe row and linked subgroup on targeted downstream records', () => {
    const sourceRecord: any = {
      formKey: 'Recipes',
      language: 'EN',
      id: 'rec-1',
      status: 'Active',
      values: { QFTD5RD2EM: 'Tomato Soup' }
    };

    const result = applyUpdateRecordDependencyMutationsToRecord({
      guard: buildGuard(),
      sourceRecord,
      targetQuestions,
      targetRecord: buildTargetRecord(),
      now: new Date('2026-03-12T09:00:00Z')
    });

    expect(result.changed).toBe(true);
    const prepRows = result.record.values.MP_MEALS_REQUEST[0].MP_TYPE_LI;
    expect(prepRows[0].RECIPE).toBeNull();
    expect(prepRows[0].MP_INGREDIENTS_LI).toEqual([]);
    expect(prepRows[1].RECIPE).toBeNull();
    expect(prepRows[1].MP_INGREDIENTS_LI).toEqual([]);
  });
});
