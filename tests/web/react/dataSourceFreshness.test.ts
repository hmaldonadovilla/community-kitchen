import {
  buildDataSourceFreshnessSnapshotSignature,
  buildDataSourceFreshnessWatchKey,
  resolveActiveDataSourceFreshnessWatches,
  resolveDataSourceFreshnessTimerDelay,
  resolveDataSourceFreshnessWatches
} from '../../../src/web/react/app/dataSourceFreshness';

describe('dataSourceFreshness helpers', () => {
  test('normalizes datasource watches and clamps quiet windows', () => {
    expect(
      resolveDataSourceFreshnessWatches({
        dataSourceWatches: [
          {
            stepId: 'leftoverForm',
            dataSourceId: 'Leftover Inventory Data',
            dataSourceIds: ['Leftover Inventory Data', ' Leftover Inventory Data '],
            quietWindowMs: 1000
          }
        ]
      } as any)
    ).toEqual([
      expect.objectContaining({
        key: buildDataSourceFreshnessWatchKey({
          stepId: 'leftoverForm',
          dataSourceIds: ['Leftover Inventory Data']
        }),
        stepId: 'leftoverForm',
        dataSourceIds: ['Leftover Inventory Data'],
        quietWindowMs: 5000
      })
    ]);
  });

  test('filters watches by the active guided step and computes the next delay', () => {
    const watches = resolveDataSourceFreshnessWatches({
      dataSourceWatches: [
        {
          stepId: 'leftoverForm',
          dataSourceIds: ['Leftover Inventory Data'],
          quietWindowMs: 30000
        },
        {
          stepId: 'deliveryForm',
          dataSourceIds: ['Recipes Data'],
          quietWindowMs: 45000
        }
      ]
    } as any);

    const active = resolveActiveDataSourceFreshnessWatches({
      watches,
      stepId: 'leftoverForm'
    });

    expect(active).toHaveLength(1);
    expect(active[0]?.dataSourceIds).toEqual(['Leftover Inventory Data']);
    expect(
      resolveDataSourceFreshnessTimerDelay({
        watches: active,
        view: 'form',
        recordId: 'record-1',
        recordLoading: false,
        now: 90_000,
        lastServerActivityAtByWatchKey: {
          [active[0].key]: 75_000
        }
      })
    ).toBe(15_000);
  });

  test('builds a stable signature from datasource rows', () => {
    const before = {
      items: [{ id: 'leftover-1', LEFTOVER_QTY: 0 }],
      totalCount: 1
    };
    const after = {
      items: [{ id: 'leftover-1', LEFTOVER_QTY: 500 }],
      totalCount: 1
    };

    expect(buildDataSourceFreshnessSnapshotSignature(before)).not.toBe(
      buildDataSourceFreshnessSnapshotSignature(after)
    );
  });
});
