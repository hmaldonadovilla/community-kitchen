import {
  buildDataSourceFreshnessBaselineKey,
  buildDataSourceFreshnessSnapshotSignature,
  buildDataSourceFreshnessWatchKey,
  primeDataSourceFreshnessWatchBaselines,
  resolveActiveDataSourceFreshnessWatches,
  resolveDataSourceFreshnessBaselineComparison,
  resolveDataSourceFreshnessSignatureFieldIds,
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
            dataSourceId: 'Leftover Bank Data',
            dataSourceIds: ['Leftover Bank Data', ' Leftover Bank Data '],
            quietWindowMs: 1000
          }
        ]
      } as any)
    ).toEqual([
      expect.objectContaining({
        key: buildDataSourceFreshnessWatchKey({
          stepId: 'leftoverForm',
          dataSourceIds: ['Leftover Bank Data']
        }),
        stepId: 'leftoverForm',
        dataSourceIds: ['Leftover Bank Data'],
        quietWindowMs: 5000
      })
    ]);
  });

  test('filters watches by the active guided step and computes the next delay', () => {
    const watches = resolveDataSourceFreshnessWatches({
      dataSourceWatches: [
        {
          stepId: 'leftoverForm',
          dataSourceIds: ['Leftover Bank Data'],
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
    expect(active[0]?.dataSourceIds).toEqual(['Leftover Bank Data']);
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

  test('primes missing datasource watch baselines once so the quiet window can elapse', () => {
    const watches = resolveDataSourceFreshnessWatches({
      dataSourceWatches: [
        {
          stepId: 'leftoverForm',
          dataSourceIds: ['Leftover Bank Data'],
          quietWindowMs: 30000
        }
      ]
    } as any);

    const first = primeDataSourceFreshnessWatchBaselines({
      watches,
      now: 10_000,
      lastServerActivityAtByWatchKey: {}
    });

    expect(first.initializedWatchKeys).toEqual([watches[0].key]);
    expect(first.lastServerActivityAtByWatchKey[watches[0].key]).toBe(10_000);

    const second = primeDataSourceFreshnessWatchBaselines({
      watches,
      now: 20_000,
      lastServerActivityAtByWatchKey: first.lastServerActivityAtByWatchKey
    });

    expect(second.initializedWatchKeys).toEqual([]);
    expect(second.lastServerActivityAtByWatchKey[watches[0].key]).toBe(10_000);
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

  test('uses a scoped datasource baseline key per watch and source', () => {
    expect(
      buildDataSourceFreshnessBaselineKey({
        watchKey: 'leftoverForm::Leftover Bank Data',
        dataSourceId: 'Leftover Bank Data'
      })
    ).toBe('leftoverForm::Leftover Bank Data::Leftover Bank Data');
  });

  test('primes datasource signature baseline before reporting freshness changes', () => {
    expect(
      resolveDataSourceFreshnessBaselineComparison({
        baselineSignature: '',
        nextSignature: 'fresh-server-signature'
      })
    ).toEqual({
      changed: false,
      shouldPrimeBaseline: true
    });

    expect(
      resolveDataSourceFreshnessBaselineComparison({
        baselineSignature: 'fresh-server-signature',
        nextSignature: 'fresh-server-signature'
      })
    ).toEqual({
      changed: false,
      shouldPrimeBaseline: false
    });

    expect(
      resolveDataSourceFreshnessBaselineComparison({
        baselineSignature: 'fresh-server-signature',
        nextSignature: 'changed-server-signature'
      })
    ).toEqual({
      changed: true,
      shouldPrimeBaseline: false
    });
  });

  test('uses datasource projection fields for freshness comparisons', () => {
    expect(
      resolveDataSourceFreshnessSignatureFieldIds({
        id: 'Leftover Bank Data',
        projection: ['LEFTOVER_QTY'],
        statusFieldId: 'LEFTOVER_STATUS'
      } as any)
    ).toEqual(['id', 'value', 'status', 'LEFTOVER_STATUS', 'LEFTOVER_QTY']);
  });

  test('ignores metadata-only datasource changes when projected fields are unchanged', () => {
    const before = {
      items: [
        {
          id: 'leftover-1',
          LEFTOVER_QTY: 500,
          updatedAt: '2026-04-16T10:00:00.000Z',
          __rowNumber: 68
        }
      ],
      totalCount: 1
    };
    const after = {
      items: [
        {
          id: 'leftover-1',
          LEFTOVER_QTY: 500,
          updatedAt: '2026-04-16T10:00:30.000Z',
          __rowNumber: 68
        }
      ],
      totalCount: 1
    };

    expect(
      buildDataSourceFreshnessSnapshotSignature(before, {
        fieldIds: ['LEFTOVER_QTY']
      })
    ).toBe(
      buildDataSourceFreshnessSnapshotSignature(after, {
        fieldIds: ['LEFTOVER_QTY']
      })
    );
  });
});
