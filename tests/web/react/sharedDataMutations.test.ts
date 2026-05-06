import {
  normalizeSharedDataFormKey,
  resolveFollowupSharedDataMutationTargetFormKeys,
  resolvePendingSharedDataMutationMatches,
  resolveReservationSharedDataTargetFormKeys,
  resolveStepDataSourceTargetFormKeys,
  resolveSubmitEffectTargetFormKeys
} from '../../../src/web/react/app/sharedDataMutations';

describe('sharedDataMutations helpers', () => {
  it('normalizes shared form keys and step datasource targets', () => {
    expect(normalizeSharedDataFormKey(' Config: Leftover Inventory ')).toBe('Config: Leftover Inventory');
    expect(
      resolveStepDataSourceTargetFormKeys([
        {
          dataSource: {
            id: 'Leftover Inventory Data',
            formKey: 'Config: Leftover Inventory'
          }
        },
        {
          id: 'Leftover Inventory Data',
          formKey: ' Config: Leftover Inventory '
        },
        'Config: Ingredients Management'
      ])
    ).toEqual(['Config: Leftover Inventory', 'Config: Ingredients Management']);
  });

  it('resolves shared forms touched by close submit effects and reservation reconciliation', () => {
    const definition: any = {
      followupConfig: {
        submitEffects: [
          {
            type: 'createRecord',
            targetFormKey: 'Config: Leftover Inventory'
          }
        ]
      },
      steps: {
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MEALS',
                dataSourceRows: [
                  {
                    dataSource: {
                      formKey: 'Config: Leftover Inventory'
                    },
                    reservation: {
                      enabled: true
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    expect(resolveSubmitEffectTargetFormKeys(definition)).toEqual(['Config: Leftover Inventory']);
    expect(resolveReservationSharedDataTargetFormKeys(definition)).toEqual(['Config: Leftover Inventory']);
    expect(
      resolveFollowupSharedDataMutationTargetFormKeys({
        definition,
        actions: ['CREATE_PDF', 'CLOSE_RECORD', 'RECONCILE_RESERVATIONS']
      })
    ).toEqual(['Config: Leftover Inventory']);
  });

  it('matches pending mutations by shared target form key', () => {
    expect(
      resolvePendingSharedDataMutationMatches({
        targetFormKeys: ['Config: Leftover Inventory'],
        pending: [
          {
            recordId: 'MP-1',
            reason: 'close.background',
            targetFormKeys: [' Config: Leftover Inventory ']
          },
          {
            recordId: 'MP-2',
            reason: 'email.background',
            targetFormKeys: ['Config: Distributor']
          }
        ]
      })
    ).toEqual([
      expect.objectContaining({
        recordId: 'MP-1'
      })
    ]);
  });
});
