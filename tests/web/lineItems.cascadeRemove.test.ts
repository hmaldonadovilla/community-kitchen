import { cascadeRemoveLineItemRows } from '../../src/web/react/app/lineItems';

describe('cascadeRemoveLineItemRows', () => {
  it('removes descendant rows (by parent metadata) and deletes subgroup keys', () => {
    const lineItems: any = {
      LINES: [
        { id: 'p1', values: { ITEM: 'Parent' } },
        { id: 'c1', values: { ITEM: 'Child', __ckParentGroupId: 'LINES', __ckParentRowId: 'p1' } },
        { id: 'g1', values: { ITEM: 'Grandchild', __ckParentGroupId: 'LINES', __ckParentRowId: 'c1' } }
      ],
      OTHER: [{ id: 'o1', values: { ITEM: 'OtherChild', __ckParentGroupId: 'LINES', __ckParentRowId: 'p1' } }],
      'LINES::p1::SUB': [{ id: 's1', values: { X: 1 } }]
    };

    const res = cascadeRemoveLineItemRows({ lineItems, roots: [{ groupId: 'LINES', rowId: 'p1' }] });

    expect((res.lineItems.LINES || []).map((r: any) => r.id)).toEqual([]);
    expect((res.lineItems.OTHER || []).map((r: any) => r.id)).toEqual([]);
    expect((res.lineItems as any)['LINES::p1::SUB']).toBeUndefined();
    expect(res.removedSubgroupKeys).toContain('LINES::p1::SUB');
    expect(res.removed.map(r => `${r.groupId}::${r.rowId}`).sort()).toEqual(
      ['LINES::c1', 'LINES::g1', 'LINES::p1', 'OTHER::o1'].sort()
    );
  });
});

