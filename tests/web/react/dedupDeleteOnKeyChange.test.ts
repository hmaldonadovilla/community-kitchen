import { buildDedupDeleteUtilisationReleasePlan } from '../../../src/web/react/app/dedupDeleteOnKeyChange';

describe('buildDedupDeleteUtilisationReleasePlan', () => {
  test('builds an empty configured utilisation plan for selected leftovers on deleted records', () => {
    const definition: any = {
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverBank',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                dataSourceRows: [
                  {
                    id: 'leftoverBankRows',
                    outputGroupId: 'MP_TYPE_LI',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    dataSource: { formKey: 'Config: Leftover Bank' },
                    utilisation: {
                      enabled: true,
                      commitMode: 'step',
                      resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const plan = buildDedupDeleteUtilisationReleasePlan({
      definition,
      formKey: 'Config: Meal Production',
      recordId: 'MP-AA000123',
      previousLineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { ORD_QTY: 4 } }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
          {
            id: 'LEFTOVER-ROW-1',
            values: {
              LEFTOVER_ID: 'MI-1',
              LEFTOVER_RECORD_ID: 'BANK-1',
              LEFTOVER_USE_QTY: 4
            }
          }
        ]
      } as any
    });

    expect(plan).toEqual(expect.objectContaining({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'MP-AA000123',
      refreshMode: 'revisionOnly',
      utilisations: [],
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ]
    }));
  });

  test('returns null when the deleted record had no managed leftover selections', () => {
    const definition: any = {
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverBank',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                dataSourceRows: [
                  {
                    id: 'leftoverBankRows',
                    outputGroupId: 'MP_TYPE_LI',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    dataSource: { formKey: 'Config: Leftover Bank' },
                    utilisation: {
                      enabled: true,
                      commitMode: 'step',
                      resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    expect(
      buildDedupDeleteUtilisationReleasePlan({
        definition,
        formKey: 'Config: Meal Production',
        recordId: 'MP-AA000124',
        previousLineItems: {
          MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { ORD_QTY: 4 } }]
        } as any
      })
    ).toBeNull();
  });
});
