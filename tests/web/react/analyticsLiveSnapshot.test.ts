import { applyRecordDeltaToAnalyticsSnapshot } from '../../../src/web/react/analytics/liveSnapshot';
import type { AnalyticsSnapshot, AnalyticsWidgetConfig, WebFormSubmission } from '../../../src/types';

const portionsDeliveredWidget: AnalyticsWidgetConfig = {
  id: 'portions_delivered',
  label: 'portions delivered',
  placements: ['listView', 'analyticsPage'],
  maximumFractionDigits: 0,
  calculation: {
    type: 'aggregate',
    aggregate: 'sum',
    groupId: 'MP_MEALS_REQUEST',
    fieldId: 'FINAL_QTY',
    when: {
      fieldId: 'status',
      equals: 'Final report emailed'
    }
  }
};

const baseSnapshot: AnalyticsSnapshot = {
  formKey: 'meal_production',
  revision: 4,
  updatedAt: '2026-04-27T08:00:00.000Z',
  items: [
    {
      id: 'portions_delivered',
      label: 'portions delivered',
      value: 23,
      valueNumber: 23,
      valueText: '23',
      valueType: 'number',
      placements: ['listView', 'analyticsPage'],
      updatedAt: '2026-04-27T08:00:00.000Z',
      revision: 4,
      metadata: {
        aggregate: 'sum',
        groupId: 'MP_MEALS_REQUEST',
        fieldId: 'FINAL_QTY',
        matchedRecords: 2,
        matchedLineItems: 3
      }
    }
  ]
};

const makeRecord = (status: string, rows: any[]): WebFormSubmission =>
  ({
    id: 'record-1',
    formKey: 'meal_production',
    language: 'EN',
    status,
    createdAt: '2026-04-27T07:00:00.000Z',
    updatedAt: '2026-04-27T08:10:00.000Z',
    values: {
      MP_MEALS_REQUEST: JSON.stringify(rows)
    },
    lineItems: {}
  } as any);

describe('applyRecordDeltaToAnalyticsSnapshot', () => {
  it('adds aggregate contribution when a record reaches Final report emailed', () => {
    const result = applyRecordDeltaToAnalyticsSnapshot({
      snapshot: baseSnapshot,
      widgets: [portionsDeliveredWidget],
      previousRecord: makeRecord('In progress', [{ FINAL_QTY: 10 }, { values: { FINAL_QTY: '5' } }]),
      nextRecord: makeRecord('Final report emailed', [{ FINAL_QTY: 10 }, { values: { FINAL_QTY: '5' } }])
    });

    expect(result.changed).toBe(true);
    expect(result.changedWidgetIds).toEqual(['portions_delivered']);
    expect(result.snapshot?.revision).toBe(5);
    expect(result.snapshot?.items[0]).toMatchObject({
      value: 38,
      valueNumber: 38,
      valueText: '38',
      metadata: {
        matchedRecords: 3,
        matchedLineItems: 5
      }
    });
  });

  it('subtracts aggregate contribution when a record leaves the counted status', () => {
    const result = applyRecordDeltaToAnalyticsSnapshot({
      snapshot: baseSnapshot,
      widgets: [portionsDeliveredWidget],
      previousRecord: makeRecord('Final report emailed', [{ FINAL_QTY: 8 }, { FINAL_QTY: '2' }]),
      nextRecord: makeRecord('In progress', [{ FINAL_QTY: 8 }, { FINAL_QTY: '2' }])
    });

    expect(result.changed).toBe(true);
    expect(result.snapshot?.items[0]).toMatchObject({
      value: 13,
      valueNumber: 13,
      valueText: '13',
      metadata: {
        matchedRecords: 1,
        matchedLineItems: 1
      }
    });
  });

  it('leaves the snapshot unchanged when the widget cannot be updated locally', () => {
    const result = applyRecordDeltaToAnalyticsSnapshot({
      snapshot: baseSnapshot,
      widgets: [
        {
          id: 'portions_delivered',
          calculation: {
            type: 'script',
            functionName: 'analytics_custom'
          }
        } as any
      ],
      previousRecord: makeRecord('In progress', [{ FINAL_QTY: 10 }]),
      nextRecord: makeRecord('Final report emailed', [{ FINAL_QTY: 10 }])
    });

    expect(result.changed).toBe(false);
    expect(result.snapshot).toBe(baseSnapshot);
  });
});
