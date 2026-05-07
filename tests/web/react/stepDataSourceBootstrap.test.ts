import {
  buildStepDataSourceBootstrapSignature,
  createStepDataSourceBootstrapRegistry,
  shouldStartStepDataSourceBootstrap,
  shouldWaitForGuidedReservationSyncOnBootstrap,
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
            id: 'Leftover Inventory Data',
            formKey: 'Config: Leftover Inventory',
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
            id: 'Leftover Inventory Data',
            formKey: 'Config: Leftover Inventory',
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
          dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
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
            dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
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
            dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
            reservationBehavior: { enabled: true }
          }
        ],
        bootstrap: { waitForGuidedReservationSync: true }
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
            dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
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
          dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
          availability: { enabled: true }
        }
      ]
    });

    expect(leftoverSignature).not.toBe(orderSignature);
  });

  it('normalizes the guided reservation wait flag', () => {
    expect(shouldWaitForGuidedReservationSyncOnBootstrap(undefined)).toBe(false);
    expect(shouldWaitForGuidedReservationSyncOnBootstrap({})).toBe(false);
    expect(
      shouldWaitForGuidedReservationSyncOnBootstrap({ waitForGuidedReservationSync: true })
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

  it('coordinates duplicate bootstrap attempts across remounts', () => {
    const registry = createStepDataSourceBootstrapRegistry();

    expect(registry.markRunning('record-1:leftoverForm')).toBe(true);
    expect(registry.getState('record-1:leftoverForm')).toBe('running');
    expect(registry.markRunning('record-1:leftoverForm')).toBe(false);

    registry.markCompleted('record-1:leftoverForm');
    expect(registry.getState('record-1:leftoverForm')).toBe('completed');
    expect(registry.markRunning('record-1:leftoverForm')).toBe(false);

    registry.markFailed('record-1:leftoverForm');
    expect(registry.getState('record-1:leftoverForm')).toBeNull();
    expect(registry.markRunning('record-1:leftoverForm')).toBe(true);
  });
});
