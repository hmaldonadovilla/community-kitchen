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
});
