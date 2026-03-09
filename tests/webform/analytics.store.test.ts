import '../mocks/GoogleAppsScript';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';
import { readAnalyticsSnapshot, writeAnalyticsSnapshot } from '../../src/services/webform/analytics/store';

describe('analytics store', () => {
  it('writes and reads analytics snapshots with monotonic revisions', () => {
    const ss = new MockSpreadsheet();
    const form = {
      title: 'Meal Production',
      configSheet: 'Config: Meal Production',
      destinationTab: 'Meal Production Data'
    } as any;

    const first = writeAnalyticsSnapshot(ss as any, form, [
      {
        id: 'portions_delivered',
        label: { en: 'Portions delivered' },
        value: 42,
        valueNumber: 42,
        valueText: '42',
        valueType: 'number',
        placements: ['listView', 'analyticsPage'],
        metadata: { aggregate: 'sum' }
      }
    ]);

    expect(first.revision).toBe(1);
    expect(first.items).toHaveLength(1);

    const fromStore = readAnalyticsSnapshot(ss as any, form);
    expect(fromStore.revision).toBe(1);
    expect(fromStore.items).toHaveLength(1);
    expect(fromStore.items[0].id).toBe('portions_delivered');
    expect(fromStore.items[0].value).toBe(42);
    expect(fromStore.items[0].placements).toEqual(['listView', 'analyticsPage']);

    const second = writeAnalyticsSnapshot(ss as any, form, [
      {
        id: 'portions_delivered',
        label: { en: 'Portions delivered' },
        value: 45,
        valueNumber: 45,
        valueText: '45',
        valueType: 'number',
        placements: ['listView'],
        metadata: { aggregate: 'sum' }
      }
    ]);

    expect(second.revision).toBe(2);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].value).toBe(45);

    const afterSecondWrite = readAnalyticsSnapshot(ss as any, form);
    expect(afterSecondWrite.revision).toBe(2);
    expect(afterSecondWrite.items).toHaveLength(1);
    expect(afterSecondWrite.items[0].value).toBe(45);
    expect(afterSecondWrite.items[0].placements).toEqual(['listView']);
  });
});

