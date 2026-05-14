import {
  normalizeSharedDataFormKey,
  resolveFollowupSharedDataMutationTargetFormKeys,
  resolvePendingSharedDataMutationMatches,
  resolveUtilisationSharedDataTargetFormKeys,
  resolveStepDataSourceTargetFormKeys,
  resolveSubmitEffectTargetFormKeys
} from '../../../src/web/react/app/sharedDataMutations';

describe('sharedDataMutations helpers', () => {
  it('normalizes shared form keys and step datasource targets', () => {
    expect(normalizeSharedDataFormKey(' Config: Leftover Bank ')).toBe('Config: Leftover Bank');
    expect(
      resolveStepDataSourceTargetFormKeys([
        {
          dataSource: {
            id: 'Leftover Bank Data',
            formKey: 'Config: Leftover Bank'
          }
        },
        {
          id: 'Leftover Bank Data',
          formKey: ' Config: Leftover Bank '
        },
        'Config: Ingredients Management'
      ])
    ).toEqual(['Config: Leftover Bank', 'Config: Ingredients Management']);
  });

  it('resolves shared forms touched by close submit effects and active utilisations', () => {
    const definition: any = {
      followupConfig: {
        submitEffects: [
          {
            type: 'createRecord',
            targetFormKey: 'Config: Leftover Bank'
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
                      formKey: 'Config: Leftover Bank'
                    },
                    utilisation: {
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

    expect(resolveSubmitEffectTargetFormKeys(definition)).toEqual(['Config: Leftover Bank']);
    expect(resolveUtilisationSharedDataTargetFormKeys(definition)).toEqual(['Config: Leftover Bank']);
    expect(
      resolveFollowupSharedDataMutationTargetFormKeys({
        definition,
        actions: ['CREATE_PDF', 'CLOSE_RECORD']
      })
    ).toEqual(['Config: Leftover Bank']);
  });

  it('matches pending mutations by shared target form key', () => {
    expect(
      resolvePendingSharedDataMutationMatches({
        targetFormKeys: ['Config: Leftover Bank'],
        pending: [
          {
            recordId: 'MP-1',
            reason: 'close.background',
            targetFormKeys: [' Config: Leftover Bank ']
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
