import { applyFieldChangeDialogTargets } from '../../src/web/react/app/fieldChangeDialog';

describe('applyFieldChangeDialogTargets', () => {
  it('updates top-level values', () => {
    const result = applyFieldChangeDialogTargets({
      values: { NAME: 'Old' },
      lineItems: {},
      updates: [
        {
          target: { scope: 'top', fieldId: 'NAME' },
          value: 'New'
        }
      ],
      context: { scope: 'top' }
    });
    expect(result.values.NAME).toEqual('New');
  });

  it('updates line-item row values', () => {
    const result = applyFieldChangeDialogTargets({
      values: {},
      lineItems: {
        ITEMS: [{ id: 'row1', values: { QTY: 1 } }]
      },
      updates: [
        {
          target: { scope: 'row', fieldId: 'QTY' },
          value: 3
        }
      ],
      context: { scope: 'line', groupId: 'ITEMS', rowId: 'row1' }
    });
    expect(result.lineItems.ITEMS[0].values.QTY).toEqual(3);
  });

  it('updates parent row values when in a subgroup', () => {
    const result = applyFieldChangeDialogTargets({
      values: {},
      lineItems: {
        PARENT: [{ id: 'parent1', values: { STATUS: 'old' } }],
        'PARENT::parent1::SUB': [{ id: 'child1', values: { NOTE: 'x' } }]
      },
      updates: [
        {
          target: { scope: 'parent', fieldId: 'STATUS' },
          value: 'new'
        }
      ],
      context: { scope: 'line', groupId: 'PARENT::parent1::SUB', rowId: 'child1' }
    });
    expect(result.lineItems.PARENT[0].values.STATUS).toEqual('new');
  });

  it('collects effect overrides', () => {
    const result = applyFieldChangeDialogTargets({
      values: {},
      lineItems: {},
      updates: [
        {
          target: { scope: 'effect', fieldId: 'QTY', effectId: 'effectA' },
          value: 5
        }
      ],
      context: { scope: 'top' }
    });
    expect(result.effectOverrides.effectA.QTY).toEqual(5);
  });
});
