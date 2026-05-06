import {
  buildInventoryReservationPlanFingerprint,
  buildStepInventoryReservationPlan,
  cloneLineItemStateSnapshot,
  detectGuidedReservationManagedRowRemovals,
  mergeGuidedReservationLineItemsFromSnapshot,
  resolveGuidedReservationManagedRowRemovalDetectionScope
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

  test('detects managed output-row removals that should trigger an immediate guided reservation sync', () => {
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

    const impacts = detectGuidedReservationManagedRowRemovals({
      definition,
      stepId: 'orderInfo',
      mode: 'all',
      previousLineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegan' } }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
          {
            id: 'OUT-1',
            values: {
              LEFTOVER_ID: 'LP-21',
              LEFTOVER_RECORD_ID: 'INV-21',
              LEFTOVER_USE_QTY: 500
            }
          }
        ]
      } as any,
      nextLineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegan' } }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': []
      } as any
    });

    expect(impacts).toEqual([
      {
        stepId: 'leftoverForm',
        parentGroupId: 'MP_MEALS_REQUEST',
        parentRowId: 'MEAL-1',
        outputGroupId: 'MP_TYPE_LI',
        removedRowIds: ['OUT-1']
      }
    ]);
  });

  test('limits managed output-row removal detection to the active guided step', () => {
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
          },
          {
            id: 'production',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST'
              }
            ]
          }
        ]
      }
    };
    const previousLineItems = {
      MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegan' } }],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
        {
          id: 'OUT-1',
          values: {
            LEFTOVER_ID: 'LP-21',
            LEFTOVER_RECORD_ID: 'INV-21',
            LEFTOVER_USE_QTY: 500
          }
        }
      ]
    } as any;
    const nextLineItems = {
      MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegan' } }],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': []
    } as any;

    expect(
      detectGuidedReservationManagedRowRemovals({
        definition,
        stepId: 'production',
        mode: 'step',
        previousLineItems,
        nextLineItems
      })
    ).toEqual([]);
    expect(
      detectGuidedReservationManagedRowRemovals({
        definition,
        stepId: 'leftoverForm',
        mode: 'step',
        previousLineItems,
        nextLineItems
      })
    ).toEqual([
      {
        stepId: 'leftoverForm',
        parentGroupId: 'MP_MEALS_REQUEST',
        parentRowId: 'MEAL-1',
        outputGroupId: 'MP_TYPE_LI',
        removedRowIds: ['OUT-1']
      }
    ]);
  });

  test('resolves managed row removal detection from the active guided step only', () => {
    expect(resolveGuidedReservationManagedRowRemovalDetectionScope(' leftoverForm ')).toEqual({
      stepId: 'leftoverForm',
      mode: 'step'
    });
    expect(resolveGuidedReservationManagedRowRemovalDetectionScope('')).toBeNull();
  });

  test('ignores removed managed rows that never held a reservation selection', () => {
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

    const impacts = detectGuidedReservationManagedRowRemovals({
      definition,
      stepId: 'orderInfo',
      mode: 'all',
      previousLineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: {} }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
          {
            id: 'OUT-1',
            values: {
              LEFTOVER_ID: '',
              LEFTOVER_RECORD_ID: '',
              LEFTOVER_USE_QTY: 0
            }
          }
        ]
      } as any,
      nextLineItems: {
        MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: {} }],
        'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': []
      } as any
    });

    expect(impacts).toEqual([]);
  });

  test('preserves a diff snapshot even when the source line-item object is later mutated', () => {
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

    const currentLineItems: any = {
      MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegan' } }],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
        {
          id: 'OUT-1',
          values: {
            LEFTOVER_ID: 'LP-21',
            LEFTOVER_RECORD_ID: 'INV-21',
            LEFTOVER_USE_QTY: 500
          }
        }
      ]
    };
    const previousSnapshot = cloneLineItemStateSnapshot(currentLineItems);

    currentLineItems['MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI'] = [];

    const impacts = detectGuidedReservationManagedRowRemovals({
      definition,
      stepId: 'orderInfo',
      mode: 'all',
      previousLineItems: previousSnapshot,
      nextLineItems: currentLineItems
    });

    expect(impacts).toEqual([
      {
        stepId: 'leftoverForm',
        parentGroupId: 'MP_MEALS_REQUEST',
        parentRowId: 'MEAL-1',
        outputGroupId: 'MP_TYPE_LI',
        removedRowIds: ['OUT-1']
      }
    ]);
  });

  test('merges saved guided reservation rows back into the current line item state', () => {
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

    const sourceLineItems: any = {
      MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
        {
          id: 'OUT-1',
          values: {
            LEFTOVER_ID: 'MI-20',
            LEFTOVER_RECORD_ID: 'INV-20',
            LEFTOVER_USE_QTY: 5
          }
        }
      ],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI::OUT-1::INGREDIENTS': [
        {
          id: 'ING-1',
          values: { ING: 'Courgette' }
        }
      ]
    };
    const targetLineItems: any = {
      MP_MEALS_REQUEST: [{ id: 'MEAL-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI': [
        {
          id: 'OUT-OLD',
          values: {
            LEFTOVER_ID: 'MI-20',
            LEFTOVER_RECORD_ID: 'INV-20',
            LEFTOVER_USE_QTY: 4
          }
        }
      ],
      'MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI::OUT-OLD::INGREDIENTS': [
        {
          id: 'ING-OLD',
          values: { ING: 'Old ingredient' }
        }
      ]
    };

    const merged = mergeGuidedReservationLineItemsFromSnapshot({
      definition,
      stepId: 'leftoverForm',
      sourceLineItems,
      targetLineItems
    });

    expect(merged.mergedRows).toBe(1);
    expect(merged.mergedChildGroups).toBe(1);
    expect(merged.lineItems['MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI']).toEqual([
      {
        id: 'OUT-1',
        values: {
          LEFTOVER_ID: 'MI-20',
          LEFTOVER_RECORD_ID: 'INV-20',
          LEFTOVER_USE_QTY: 5
        }
      }
    ]);
    expect(merged.lineItems['MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI::OUT-1::INGREDIENTS']).toEqual([
      {
        id: 'ING-1',
        values: { ING: 'Courgette' }
      }
    ]);
    expect(merged.lineItems['MP_MEALS_REQUEST::MEAL-1::MP_TYPE_LI::OUT-OLD::INGREDIENTS']).toBeUndefined();
  });
});
