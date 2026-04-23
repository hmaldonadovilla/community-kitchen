import {
  applyCopyCurrentRecordDropFields,
  applyCopyCurrentRecordProfile,
  resolveCopyCurrentRecordDestructiveChangeBypassFieldIds,
  shouldBypassCopyCurrentRecordDestructiveChange
} from '../../../src/web/react/app/copyProfile';

describe('copyCurrentRecordProfile', () => {
  it('copies only whitelisted top values and whitelisted line item fields', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'TEXT', required: false, label: { en: 'A' } },
        { id: 'B', type: 'TEXT', required: false, label: { en: 'B' } },
        { id: 'C', type: 'TEXT', required: false, label: { en: 'C' } },
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'MEAL_TYPE', type: 'CHOICE', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'ORD_QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'MP_COOK_TEMP', type: 'CHECKBOX', required: false, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      copyCurrentRecordProfile: {
        values: ['A', 'B'],
        lineItems: [{ groupId: 'G', fields: ['MEAL_TYPE', 'ORD_QTY'], includeWhen: { fieldId: 'ORD_QTY', greaterThan: 0 } }]
      }
    };

    const out = applyCopyCurrentRecordProfile({
      definition,
      values: { A: 'x', B: 'y', C: 'z' } as any,
      lineItems: {
        G: [
          { id: 'r1', values: { MEAL_TYPE: 'V', ORD_QTY: 0, MP_COOK_TEMP: true } },
          { id: 'r2', values: { MEAL_TYPE: 'V', ORD_QTY: 2, MP_COOK_TEMP: true, __ckRowSource: 'auto' } }
        ],
        'G::r2::SUB': [{ id: 'sr1', values: { X: 'x' } }]
      } as any
    });

    expect(out).toBeTruthy();
    expect(out?.values).toEqual({ A: 'x', B: 'y' });
    expect(out?.lineItems?.G?.map(r => ({ id: r.id, values: r.values }))).toEqual([
      { id: 'r2', values: { MEAL_TYPE: 'V', ORD_QTY: 2, __ckRowSource: 'auto' } }
    ]);
    expect(Object.keys(out?.lineItems || {})).toEqual(['G']);
  });

  it('copies configured nested subgroup rows without copying other subgroup data', () => {
    const definition: any = {
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'MEAL_TYPE', type: 'CHOICE', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'ORD_QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      copyCurrentRecordProfile: {
        lineItems: [
          {
            groupId: 'MEALS',
            fields: ['MEAL_TYPE', 'ORD_QTY'],
            includeWhen: { fieldId: 'ORD_QTY', greaterThan: 0 },
            subGroups: [
              {
                groupId: 'COOK_ROWS',
                fields: ['PREP_TYPE', 'PREP_QTY', 'RECIPE'],
                includeWhen: {
                  all: [
                    { fieldId: 'PREP_TYPE', equals: ['Cook'] },
                    { fieldId: 'RECIPE', notEmpty: true }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const out = applyCopyCurrentRecordProfile({
      definition,
      values: {} as any,
      lineItems: {
        MEALS: [{ id: 'meal1', values: { MEAL_TYPE: 'Vegetarian', ORD_QTY: 50 } }],
        'MEALS::meal1::COOK_ROWS': [
          {
            id: 'cook1',
            values: { PREP_TYPE: 'Cook', PREP_QTY: 50, RECIPE: 'Chili', __ckRowSource: 'auto', EXTRA: 'x' }
          },
          {
            id: 'cook2',
            values: { PREP_TYPE: 'Entire dish', PREP_QTY: 10, RECIPE: 'Leftover', __ckRowSource: 'auto' }
          }
        ],
        'MEALS::meal1::COOK_ROWS::cook1::INGREDIENTS': [{ id: 'ing1', values: { ING: 'Salt', QTY: 1 } }]
      } as any
    });

    expect(out?.lineItems?.MEALS?.map(r => ({ id: r.id, values: r.values }))).toEqual([
      { id: 'meal1', values: { MEAL_TYPE: 'Vegetarian', ORD_QTY: 50 } }
    ]);
    expect(out?.lineItems?.['MEALS::meal1::COOK_ROWS']?.map(r => ({ id: r.id, values: r.values }))).toEqual([
      { id: 'cook1', values: { PREP_TYPE: 'Cook', PREP_QTY: 50, RECIPE: 'Chili', __ckRowSource: 'auto' } }
    ]);
    expect(Object.keys(out?.lineItems || {}).sort()).toEqual(['MEALS', 'MEALS::meal1::COOK_ROWS']);
  });

  it('clears dropped top-level fields to empty values so defaults are not re-applied', () => {
    const definition: any = {
      questions: [
        { id: 'DATE', type: 'DATE', required: false, label: { en: 'Date' }, defaultValue: '2026-04-09' },
        { id: 'CONSENT', type: 'CHECKBOX', required: false, label: { en: 'Consent' } },
        {
          id: 'FILES',
          type: 'FILE_UPLOAD',
          required: false,
          label: { en: 'Files' }
        },
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: { fields: [{ id: 'X', type: 'TEXT', required: false }] }
        }
      ]
    };

    const out = applyCopyCurrentRecordDropFields({
      definition,
      values: { CONSENT: true, FILES: ['file-a'] } as any,
      lineItems: { G: [{ id: 'r1', values: { X: 'x' } }] } as any,
      dropFields: ['DATE', 'CONSENT', 'FILES', 'G']
    });

    expect(out.values).toEqual({
      DATE: '',
      CONSENT: false,
      FILES: []
    });
    expect(out.lineItems).toEqual({ G: [] });
    expect(out.lineItemsCleared).toBe(true);
  });

  it('marks only dropped top-level fields for destructive-change bypass after copy', () => {
    const definition: any = {
      questions: [
        { id: 'MP_PREP_DATE', type: 'DATE', required: false, label: { en: 'Date' } },
        { id: 'CONSENT', type: 'CHECKBOX', required: false, label: { en: 'Consent' } },
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: { fields: [{ id: 'X', type: 'TEXT', required: false }] }
        }
      ]
    };

    expect(
      resolveCopyCurrentRecordDestructiveChangeBypassFieldIds({
        definition,
        dropFields: ['MP_PREP_DATE', 'G', 'UNKNOWN', 'MP_PREP_DATE']
      })
    ).toEqual(['MP_PREP_DATE']);
  });

  it('bypasses destructive top-level changes only for unsaved copied draft fields', () => {
    expect(
      shouldBypassCopyCurrentRecordDestructiveChange({
        scope: 'top',
        fieldId: 'MP_PREP_DATE',
        isCreateFlow: true,
        bypassFieldIds: { MP_PREP_DATE: true }
      })
    ).toBe(true);

    expect(
      shouldBypassCopyCurrentRecordDestructiveChange({
        scope: 'top',
        fieldId: 'MP_PREP_DATE',
        isCreateFlow: false,
        bypassFieldIds: { MP_PREP_DATE: true }
      })
    ).toBe(false);

    expect(
      shouldBypassCopyCurrentRecordDestructiveChange({
        scope: 'line',
        fieldId: 'MP_PREP_DATE',
        isCreateFlow: true,
        bypassFieldIds: ['MP_PREP_DATE']
      })
    ).toBe(false);

    expect(
      shouldBypassCopyCurrentRecordDestructiveChange({
        scope: 'top',
        fieldId: 'MP_SERVICE',
        isCreateFlow: true,
        bypassFieldIds: ['MP_PREP_DATE']
      })
    ).toBe(false);
  });
});
