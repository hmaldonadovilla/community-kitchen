import { applyLineItemRowSort } from '../../../src/web/react/app/lineItemRowSort';

describe('lineItemRowSort', () => {
  const rows: any[] = [
    { id: 'r1', values: { ING: 'Sunflower oil', QTY: 10 } },
    { id: 'r2', values: { ING: 'Mint - dried', QTY: 2 } },
    { id: 'r3', values: { ING: 'Cinnamon', QTY: 30 } },
    { id: 'r4', values: { ING: '', QTY: '' } }
  ];

  it('sorts rows alphabetically by the configured field without mutating input rows', () => {
    const sorted = applyLineItemRowSort({
      rows,
      fields: [{ id: 'ING', type: 'TEXT' } as any],
      config: { fieldId: 'ING' }
    });

    expect(sorted.map(row => row.id)).toEqual(['r3', 'r2', 'r1', 'r4']);
    expect(rows.map(row => row.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('uses numeric comparison for NUMBER fields in auto mode', () => {
    const sorted = applyLineItemRowSort({
      rows,
      fields: [{ id: 'QTY', type: 'NUMBER' } as any],
      config: { fieldId: 'QTY' }
    });

    expect(sorted.map(row => row.id)).toEqual(['r2', 'r1', 'r3', 'r4']);
  });

  it('can place empty values first and sort descending', () => {
    const sorted = applyLineItemRowSort({
      rows,
      fields: [{ id: 'ING', type: 'TEXT' } as any],
      config: { fieldId: 'ING', direction: 'desc', empty: 'first' }
    });

    expect(sorted.map(row => row.id)).toEqual(['r4', 'r1', 'r2', 'r3']);
  });

  it('keeps current-session rows first when configured, then sorts the remaining rows', () => {
    const sorted = applyLineItemRowSort({
      rows: [
        ...rows,
        { id: 'r5', values: { ING: 'Aubergine', QTY: 4 }, localAddedAtMs: 100 },
        { id: 'r6', values: { ING: 'Basil', QTY: 1 }, localAddedAtMs: 200 }
      ],
      fields: [{ id: 'ING', type: 'TEXT' } as any],
      config: { fieldId: 'ING', direction: 'asc', mode: 'text', newRows: 'firstUntilSave' }
    });

    expect(sorted.map(row => row.id)).toEqual(['r6', 'r5', 'r3', 'r2', 'r1', 'r4']);
  });
});
