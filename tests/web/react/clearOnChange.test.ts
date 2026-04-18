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

  it('keeps bypassed date fields when an ordered service change clears downstream order data', () => {
    const definition: any = {
      title: 'Meal Production',
      destinationTab: 'Meal Production',
      languages: ['EN'],
      questions: [
        { id: 'MP_DISTRIBUTOR', type: 'CHOICE' },
        { id: 'MP_SERVICE', type: 'CHOICE', clearOnChange: { mode: 'ordered', bypassFields: ['MP_PREP_DATE'] } },
        { id: 'MP_COOK_NAME', type: 'CHOICE' },
        { id: 'MP_PREP_DATE', type: 'DATE' },
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'ORD_QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const result = applyClearOnChange({
      definition,
      values: {
        MP_DISTRIBUTOR: 'Belliard',
        MP_SERVICE: 'Lunch',
        MP_COOK_NAME: 'Aline',
        MP_PREP_DATE: '2026-04-17'
      } as any,
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'row-1', values: { ORD_QTY: 10 } }]
      } as any,
      fieldId: 'MP_SERVICE',
      nextValue: 'Dinner',
      orderedFieldIds: ['MP_DISTRIBUTOR', 'MP_SERVICE', 'MP_COOK_NAME', 'MP_PREP_DATE', 'MP_MEALS_REQUEST']
    });

    expect(result.values.MP_DISTRIBUTOR).toBe('Belliard');
    expect(result.values.MP_SERVICE).toBe('Dinner');
    expect(result.values.MP_PREP_DATE).toBe('2026-04-17');
    expect(result.values.MP_COOK_NAME).toBeUndefined();
    expect((result.lineItems.MP_MEALS_REQUEST || []).length).toBe(0);
  });

  it('clears production date and service when an ordered customer change removes downstream meal data', () => {
    const definition: any = {
      title: 'Meal Production',
      destinationTab: 'Meal Production',
      languages: ['EN'],
      questions: [
        { id: 'MP_DISTRIBUTOR', type: 'CHOICE', clearOnChange: { mode: 'ordered' } },
        { id: 'MP_SERVICE', type: 'CHOICE' },
        { id: 'MP_COOK_NAME', type: 'CHOICE' },
        { id: 'MP_PREP_DATE', type: 'DATE' },
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'ORD_QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const result = applyClearOnChange({
      definition,
      values: {
        MP_DISTRIBUTOR: 'Belliard',
        MP_SERVICE: 'Lunch',
        MP_COOK_NAME: 'Aline',
        MP_PREP_DATE: '2026-04-18'
      } as any,
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'row-1', values: { ORD_QTY: 10 } }]
      } as any,
      fieldId: 'MP_DISTRIBUTOR',
      nextValue: 'HUB',
      orderedFieldIds: ['MP_DISTRIBUTOR', 'MP_SERVICE', 'MP_COOK_NAME', 'MP_PREP_DATE', 'MP_MEALS_REQUEST']
    });

    expect(result.values.MP_DISTRIBUTOR).toBe('HUB');
    expect(result.values.MP_SERVICE).toBeUndefined();
    expect(result.values.MP_PREP_DATE).toBeUndefined();
    expect(result.values.MP_COOK_NAME).toBeUndefined();
    expect((result.lineItems.MP_MEALS_REQUEST || []).length).toBe(0);
  });
});
