import { applyClearOnChange } from '../../../src/web/react/app/clearOnChange';

describe('applyClearOnChange', () => {
  it('clears other fields and resets line items', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT', clearOnChange: true },
        { id: 'B', type: 'TEXT' },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const values: any = { A: 'old', B: 'keep' };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { QTY: 3 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect(result.values.B).toBeUndefined();
    expect((result.lineItems.GROUP || []).length).toBe(0);
  });

  it('supports ordered clear mode (clears only fields after source)', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'PRE', type: 'TEXT' },
        { id: 'A', type: 'TEXT', clearOnChange: { mode: 'ordered' } },
        { id: 'B', type: 'TEXT' },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const values: any = { PRE: 'stay', A: 'old', B: 'clear' };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { QTY: 3 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.PRE).toBe('stay');
    expect(result.values.A).toBe('new');
    expect(result.values.B).toBeUndefined();
    expect((result.lineItems.GROUP || []).length).toBe(0);
  });

  it('removes stale serialized line-item payload before rebuilding cleared groups', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT', clearOnChange: { mode: 'ordered' } },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            addMode: 'auto',
            anchorFieldId: 'TYPE',
            fields: [{ id: 'TYPE', type: 'CHOICE' }, { id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const staleRows = [{ TYPE: 'Stale', QTY: 9 }];
    const values: any = { A: 'old', GROUP: staleRows, GROUP_json: JSON.stringify(staleRows) };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { TYPE: 'Stale', QTY: 9 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect(result.values.GROUP).toBeUndefined();
    expect(result.values.GROUP_json).toBeUndefined();
    expect((result.lineItems.GROUP || []).length).toBe(0);
  });

  it('removes stale nested line-item state keys for cleared groups', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT', clearOnChange: { mode: 'ordered' } },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            addMode: 'auto',
            anchorFieldId: 'TYPE',
            fields: [{ id: 'TYPE', type: 'CHOICE' }],
            subGroups: [
              {
                id: 'SUB',
                fields: [{ id: 'NAME', type: 'TEXT' }]
              }
            ]
          }
        }
      ]
    };

    const values: any = { A: 'old' };
    const lineItems: any = {
      GROUP: [{ id: 'parent1', values: { TYPE: 'Standard' } }],
      'GROUP.parent1.SUB': [{ id: 'sub1', values: { NAME: 'Stale' } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect((result.lineItems.GROUP || []).length).toBe(0);
    expect(result.lineItems['GROUP.parent1.SUB']).toBeUndefined();
  });

  it('respects bypass fields in ordered mode', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT', clearOnChange: { mode: 'ordered', bypassFields: ['C', 'GROUP'] } },
        { id: 'B', type: 'TEXT' },
        { id: 'C', type: 'TEXT' },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const values: any = { A: 'old', B: 'clear', C: 'keep' };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { QTY: 3 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect(result.values.B).toBeUndefined();
    expect(result.values.C).toBe('keep');
    expect((result.lineItems.GROUP || []).length).toBe(1);
  });

  it('respects bypass fields in full mode', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT', clearOnChange: { mode: 'full', bypassFields: ['B', 'GROUP'] } },
        { id: 'B', type: 'TEXT' },
        { id: 'C', type: 'TEXT' },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const values: any = { A: 'old', B: 'keep', C: 'clear' };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { QTY: 3 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect(result.values.B).toBe('keep');
    expect(result.values.C).toBeUndefined();
    expect((result.lineItems.GROUP || []).length).toBe(1);
  });

  it('uses provided orderedFieldIds when mode is ordered', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT' },
        { id: 'B', type: 'TEXT', clearOnChange: { mode: 'ordered' } },
        { id: 'C', type: 'TEXT' },
        { id: 'D', type: 'TEXT' }
      ]
    };

    const values: any = { A: 'a', B: 'old', C: 'keep', D: 'clear' };
    const lineItems: any = {};

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'B',
      nextValue: 'new',
      orderedFieldIds: ['A', 'C', 'B', 'D']
    });

    expect(result.values.A).toBe('a');
    expect(result.values.B).toBe('new');
    expect(result.values.C).toBe('keep');
    expect(result.values.D).toBeUndefined();
  });
});
