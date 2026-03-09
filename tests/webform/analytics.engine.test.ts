import { evaluateAnalyticsWidgets } from '../../src/services/webform/analytics/engine';

describe('analytics engine', () => {
  const baseDataset = {
    form: { title: 'Meal Production', configSheet: 'Config: Meal Production' } as any,
    definition: { title: 'Meal Production', analytics: { widgets: [] } } as any,
    records: [
      {
        id: 'rec-1',
        status: 'Closed',
        values: {
          MP_MEALS_REQUEST: JSON.stringify([{ values: { FINAL_QTY: 10 } }, { values: { FINAL_QTY: 5 } }]),
          FINAL_QTY: 15
        }
      },
      {
        id: 'rec-2',
        status: 'In progress',
        values: {
          MP_MEALS_REQUEST: JSON.stringify([{ values: { FINAL_QTY: 9 } }]),
          FINAL_QTY: 9
        }
      },
      {
        id: 'rec-3',
        status: 'Closed',
        values: {
          MP_MEALS_REQUEST: JSON.stringify([{ values: { FINAL_QTY: 8 } }]),
          FINAL_QTY: 8
        }
      }
    ] as any[],
    rows: []
  } as any;

  it('evaluates aggregate and arithmetic widgets', () => {
    const widgets: any[] = [
      {
        id: 'portions_delivered',
        label: { en: 'Portions delivered' },
        placements: ['listView', 'analyticsPage'],
        maximumFractionDigits: 0,
        calculation: {
          type: 'aggregate',
          aggregate: 'sum',
          groupId: 'MP_MEALS_REQUEST',
          fieldId: 'FINAL_QTY',
          when: { fieldId: 'status', equals: 'Closed' }
        }
      },
      {
        id: 'closed_records',
        calculation: {
          type: 'aggregate',
          aggregate: 'count',
          when: { fieldId: 'status', equals: 'Closed' }
        }
      },
      {
        id: 'double_portions',
        calculation: {
          type: 'arithmetic',
          operator: 'multiply',
          operands: [{ metricId: 'portions_delivered' }, 2]
        }
      },
      {
        id: 'delta',
        calculation: {
          type: 'arithmetic',
          operator: 'subtract',
          operands: [{ metricId: 'double_portions' }, { metricId: 'portions_delivered' }]
        }
      }
    ];

    const evaluated = evaluateAnalyticsWidgets(widgets as any, {
      ...baseDataset,
      definition: { ...baseDataset.definition, analytics: { widgets } }
    } as any);
    const byId = Object.fromEntries(evaluated.map(item => [item.id, item]));

    expect(byId.portions_delivered.value).toBe(23);
    expect(byId.portions_delivered.valueText).toBe('23');
    expect(byId.portions_delivered.placements).toEqual(['listView', 'analyticsPage']);
    expect(byId.closed_records.value).toBe(2);
    expect(byId.double_portions.value).toBe(46);
    expect(byId.delta.value).toBe(23);
  });

  it('runs script analytics functions and captures failures', () => {
    (globalThis as any).analytics_scriptSample = jest.fn((_ctx: any, args: any) => ({
      value: Number(args?.base || 0) + 5,
      metadata: { source: 'custom' }
    }));

    const widgets: any[] = [
      {
        id: 'script_ok',
        calculation: { type: 'script', functionName: 'analytics_scriptSample', args: { base: 7 } }
      },
      {
        id: 'script_missing',
        calculation: { type: 'script', functionName: 'analytics_missingScript' }
      }
    ];

    const evaluated = evaluateAnalyticsWidgets(widgets as any, baseDataset as any);
    const byId = Object.fromEntries(evaluated.map(item => [item.id, item]));

    expect(byId.script_ok.value).toBe(12);
    expect(byId.script_ok.metadata).toEqual({ script: 'analytics_scriptSample', source: 'custom' });
    expect(byId.script_missing.value).toBeNull();
    expect((byId.script_missing.metadata as any).error).toContain('analytics_missingScript');
    expect((globalThis as any).analytics_scriptSample).toHaveBeenCalledTimes(1);

    delete (globalThis as any).analytics_scriptSample;
  });
});

