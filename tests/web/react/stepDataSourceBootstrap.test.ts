import {
  buildStepDataSourceBootstrapSignature,
  createStepDataSourceBootstrapCoordinator,
  shouldForceRefreshStepDataSourceOnBootstrap,
  shouldGateStepDataSourceUntilFresh,
  shouldStartStepDataSourceBootstrap,
  shouldWaitForGuidedUtilisationSyncOnBootstrap,
  shouldWaitForSharedDataMutationsOnBootstrap
} from '../../../src/web/react/app/stepDataSourceBootstrap';

describe('buildStepDataSourceBootstrapSignature', () => {
  it('stays stable across config object identity churn', () => {
    const first = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: {
            id: 'Leftover Bank Data',
            formKey: 'Config: Leftover Bank',
            projection: ['Name', 'Status']
          },
          availability: { enabled: true }
        }
      ]
    });
    const second = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: {
            id: 'Leftover Bank Data',
            formKey: 'Config: Leftover Bank',
            projection: ['Name', 'Status']
          },
          availability: { enabled: true }
        }
      ]
    });

    expect(second).toBe(first);
  });

  it('changes when the record or bootstrap-driving config changes', () => {
    const baseline = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      stepId: 'leftoverForm',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: { id: 'Leftover Bank Data', formKey: 'Config: Leftover Bank' },
          availability: { enabled: true }
        }
      ]
    });

    expect(
      buildStepDataSourceBootstrapSignature({
        recordId: 'REC-2',
        language: 'EN',
        stepId: 'leftoverForm',
        configs: [
          {
            id: 'leftoverRows',
            dataSource: { id: 'Leftover Bank Data', formKey: 'Config: Leftover Bank' },
            availability: { enabled: true }
          }
        ]
      })
    ).not.toBe(baseline);

    expect(
      buildStepDataSourceBootstrapSignature({
        recordId: 'REC-1',
        language: 'EN',
        stepId: 'leftoverForm',
        configs: [
          {
            id: 'leftoverRows',
            dataSource: { id: 'Leftover Bank Data', formKey: 'Config: Leftover Bank' },
            utilisationBehavior: { enabled: true }
          }
        ],
        bootstrap: { waitForGuidedUtilisationSync: true }
      })
    ).not.toBe(baseline);

    expect(
      buildStepDataSourceBootstrapSignature({
        recordId: 'REC-1',
        language: 'EN',
        stepId: 'leftoverForm',
        configs: [
          {
            id: 'leftoverRows',
            dataSource: { id: 'Leftover Bank Data', formKey: 'Config: Leftover Bank' },
            availability: { enabled: true }
          }
        ],
        bootstrap: { waitForSharedDataMutations: true }
      })
    ).not.toBe(baseline);
  });

  it('changes when the active guided step changes', () => {
    const orderSignature = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      stepId: 'orderInfo',
      configs: []
    });

    const leftoverSignature = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      stepId: 'leftoverForm',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: { id: 'Leftover Bank Data', formKey: 'Config: Leftover Bank' },
          availability: { enabled: true }
        }
      ]
    });

    expect(leftoverSignature).not.toBe(orderSignature);
  });

  it('normalizes the guided utilisation wait flag', () => {
    expect(shouldWaitForGuidedUtilisationSyncOnBootstrap(undefined)).toBe(false);
    expect(shouldWaitForGuidedUtilisationSyncOnBootstrap({})).toBe(false);
    expect(
      shouldWaitForGuidedUtilisationSyncOnBootstrap({ waitForGuidedUtilisationSync: true })
    ).toBe(true);
  });

  it('normalizes the shared data mutation wait flag', () => {
    expect(shouldWaitForSharedDataMutationsOnBootstrap(undefined)).toBe(false);
    expect(shouldWaitForSharedDataMutationsOnBootstrap({})).toBe(false);
    expect(shouldWaitForSharedDataMutationsOnBootstrap({ waitForSharedDataMutations: true })).toBe(true);
  });

  it('does not restart a completed or in-flight bootstrap for the same signature', () => {
    expect(
      shouldStartStepDataSourceBootstrap({
        signature: 'record-1:leftoverForm',
        completedSignature: '',
        inFlightSignature: ''
      })
    ).toBe(true);
    expect(
      shouldStartStepDataSourceBootstrap({
        signature: 'record-1:leftoverForm',
        completedSignature: 'record-1:leftoverForm',
        inFlightSignature: ''
      })
    ).toBe(false);
    expect(
      shouldStartStepDataSourceBootstrap({
        signature: 'record-1:leftoverForm',
        completedSignature: '',
        inFlightSignature: 'record-1:leftoverForm'
      })
    ).toBe(false);
    expect(
      shouldStartStepDataSourceBootstrap({
        signature: 'record-2:leftoverForm',
        completedSignature: 'record-1:leftoverForm',
        inFlightSignature: ''
      })
    ).toBe(true);
  });

  it('coordinates duplicate bootstrap attempts only while a request is running', async () => {
    const coordinator = createStepDataSourceBootstrapCoordinator();
    let resolveRun: (value: boolean) => void = () => undefined;
    const task = jest.fn(
      () =>
        new Promise<boolean>(resolve => {
          resolveRun = resolve;
        })
    );

    const first = coordinator.run('record-1:leftoverForm', task);
    const second = coordinator.run('record-1:leftoverForm', task);
    expect(first?.started).toBe(true);
    expect(second?.started).toBe(false);
    expect(second?.promise).toBe(first?.promise);
    expect(task).toHaveBeenCalledTimes(1);
    expect(coordinator.getState('record-1:leftoverForm')).toBe('running');

    resolveRun(true);
    await first?.promise;
    expect(coordinator.getState('record-1:leftoverForm')).toBeNull();

    const third = coordinator.run('record-1:leftoverForm', async () => true);
    expect(third?.started).toBe(true);
    await third?.promise;
    expect(coordinator.getState('record-1:leftoverForm')).toBeNull();
  });

  it('classifies freshness-gated source-first datasource configs', () => {
    expect(shouldForceRefreshStepDataSourceOnBootstrap({ forceRefreshOnMount: true })).toBe(true);
    expect(shouldForceRefreshStepDataSourceOnBootstrap({ availability: { enabled: true } })).toBe(true);
    expect(shouldForceRefreshStepDataSourceOnBootstrap({ utilisationBehavior: { enabled: true } })).toBe(true);
    expect(shouldForceRefreshStepDataSourceOnBootstrap({}, true)).toBe(true);
    expect(shouldForceRefreshStepDataSourceOnBootstrap({})).toBe(false);
    expect(shouldGateStepDataSourceUntilFresh({ availability: { enabled: true } })).toBe(true);
    expect(shouldGateStepDataSourceUntilFresh({})).toBe(false);
  });
});
