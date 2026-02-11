import { collectListViewMetricDependencies, computeListViewMetricValue } from '../../../src/web/react/app/listViewMetric';

describe('listViewMetric', () => {
  it('collects projection dependencies from metric config', () => {
    const deps = collectListViewMetricDependencies({
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'FINAL_QTY',
      when: {
        all: [{ fieldId: 'status', equals: 'Closed' }, { any: [{ fieldId: 'MP_SERVICE', equals: 'Lunch' }] }]
      }
    } as any);
    expect(deps).toEqual(expect.arrayContaining(['MP_MEALS_REQUEST', 'status', 'MP_SERVICE']));
  });

  it('sums line-item values with row-level when filtering', () => {
    const items: any[] = [
      {
        id: '1',
        status: 'Closed',
        MP_MEALS_REQUEST: JSON.stringify([{ FINAL_QTY: 20 }, { FINAL_QTY: '30' }, { FINAL_QTY: '1,5' }])
      },
      {
        id: '2',
        status: 'In progress',
        MP_MEALS_REQUEST: JSON.stringify([{ FINAL_QTY: 50 }])
      },
      {
        id: '3',
        status: 'Closed',
        MP_MEALS_REQUEST: [{ values: { FINAL_QTY: '15' } }]
      }
    ];

    const out = computeListViewMetricValue(
      items,
      {
        groupId: 'MP_MEALS_REQUEST',
        fieldId: 'FINAL_QTY',
        when: { fieldId: 'status', equals: 'Closed' }
      } as any
    );

    expect(out.value).toBe(66.5);
    expect(out.matchedRecords).toBe(2);
    expect(out.matchedLineItems).toBe(4);
  });

  it('returns zero when metric config is missing or invalid', () => {
    expect(computeListViewMetricValue([], undefined)).toEqual({
      value: 0,
      matchedRecords: 0,
      matchedLineItems: 0
    });
    expect(
      computeListViewMetricValue([{ id: '1', status: 'Closed', MP_MEALS_REQUEST: '[{\"FINAL_QTY\":20}]' }] as any, {
        groupId: '',
        fieldId: 'FINAL_QTY'
      } as any)
    ).toEqual({
      value: 0,
      matchedRecords: 0,
      matchedLineItems: 0
    });
  });
});
