import {
  buildInventoryReservationPlanFingerprint,
  buildStepInventoryReservationPlan
} from '../../../src/web/react/features/reservations/stepReservationPlan';

describe('buildStepInventoryReservationPlan', () => {
  test('builds one batched reservation plan from guided-step output rows', () => {
    const definition: any = {
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                dataSourceRows: [
                  {
                    id: 'leftoverInventoryRows',
                    outputGroupId: 'MP_TYPE_LI',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    dataSource: { formKey: 'Config: Leftover Inventory' },
                    reservation: {
                      enabled: true,
                      commitMode: 'step',
                      resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID',
                      allowedStatuses: ['available']
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const lineItems: any = {
      MP_MEALS_REQUEST: [
        { id: 'MEAL-1', values: {} },
        { id: 'MEAL-2', values: {} }
      ],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
        {
          id: 'OUT-1',
          values: {
            LEFTOVER_ID: 'LE-1',
            LEFTOVER_RECORD_ID: 'INV-1',
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_USE_QTY: '3'
          }
        }
      ],
      'MP_MEALS_REQUEST::MEAL-2::MP_TYPE_LI': [
        {
          id: 'OUT-2',
          values: {
            LEFTOVER_ID: 'LP-2',
            LEFTOVER_RECORD_ID: 'INV-2',
            LEFTOVER_KIND: 'Part dish',
            LEFTOVER_USE_QTY: '250'
          }
        }
      ]
    };

    const plan = buildStepInventoryReservationPlan({
      definition,
      stepId: 'leftoverForm',
      formKey: 'Config: Meal Production',
      recordId: 'MP-1',
      lineItems
    });

    expect(plan).toEqual({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'MP-1',
      refreshMode: 'revisionOnly',
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'INV-1',
          resourceItemId: 'LE-1',
          resourceKind: 'Entire dish',
          quantity: 3,
          unit: undefined,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-1',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: 'OUT-1',
          sourceOutputKeyFieldId: 'LEFTOVER_ID',
          allowedStatuses: ['available']
        },
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'INV-2',
          resourceItemId: 'LP-2',
          resourceKind: 'Part dish',
          quantity: 250,
          unit: undefined,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-2',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: 'OUT-2',
          sourceOutputKeyFieldId: 'LEFTOVER_ID',
          allowedStatuses: ['available']
        }
      ]
    });
  });

  test('returns managed scopes even when the step currently has no selected leftovers', () => {
    const definition: any = {
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                dataSourceRows: [
                  {
                    id: 'leftoverInventoryRows',
                    outputGroupId: 'MP_TYPE_LI',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    dataSource: { formKey: 'Config: Leftover Inventory' },
                    reservation: {
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

    const plan = buildStepInventoryReservationPlan({
      definition,
      stepId: 'leftoverForm',
      formKey: 'Config: Meal Production',
      recordId: 'MP-2',
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: {} }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': []
      } as any
    });

    expect(plan?.managedScopes).toEqual([
      {
        sourceParentGroupId: 'MP_MEALS_REQUEST',
        sourceParentRowId: 'MEAL-1',
        sourceOutputGroupId: 'MP_TYPE_LI'
      }
    ]);
    expect(plan?.reservations).toEqual([]);
  });

  test('includes previous managed scopes when rows disappeared and can build a stable fingerprint', () => {
    const definition: any = {
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                dataSourceRows: [
                  {
                    id: 'leftoverInventoryRows',
                    outputGroupId: 'MP_TYPE_LI',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    dataSource: { formKey: 'Config: Leftover Inventory' },
                    reservation: {
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

    const plan = buildStepInventoryReservationPlan({
      definition,
      stepId: 'orderInfo',
      formKey: 'Config: Meal Production',
      recordId: 'MP-3',
      mode: 'all',
      previousManagedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'MEAL-OLD',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: {} }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': []
      } as any
    });

    expect(plan?.managedScopes).toEqual([
      {
        sourceParentGroupId: 'MP_MEALS_REQUEST',
        sourceParentRowId: 'MEAL-OLD',
        sourceOutputGroupId: 'MP_TYPE_LI'
      },
      {
        sourceParentGroupId: 'MP_MEALS_REQUEST',
        sourceParentRowId: 'MEAL-1',
        sourceOutputGroupId: 'MP_TYPE_LI'
      }
    ]);
    expect(buildInventoryReservationPlanFingerprint(plan)).toBe(
      buildInventoryReservationPlanFingerprint({
        ...plan,
        managedScopes: [...(plan?.managedScopes || [])].reverse()
      } as any)
    );
  });
});
