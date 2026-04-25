import {
  applyFieldChangeDialogTargets,
  resolveFieldChangeDialogConfirmUpdates,
  resolveFieldChangeDialogCancelAction
} from '../../src/web/react/app/fieldChangeDialog';

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

  it('clears stale datasource source metadata when a guarded line source field changes', () => {
    const definition: any = {
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              {
                id: 'RECIPE',
                type: 'CHOICE',
                selectionEffects: [
                  {
                    type: 'addLineItemsFromDataSource',
                    lookupSourceFieldId: 'RECIPE_SOURCE_ID',
                    parentFieldMapping: {
                      RECIPE_SOURCE_ID: 'id',
                      RECIPE_SOURCE_UPDATED_AT: 'updatedAt',
                      RECIPE: 'QFTD5RD2EM'
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const result = applyFieldChangeDialogTargets({
      definition,
      values: {},
      lineItems: {
        MEALS: [
          {
            id: 'row1',
            values: {
              RECIPE: 'Old soup',
              RECIPE_SOURCE_ID: 'recipe-1',
              RECIPE_SOURCE_UPDATED_AT: 'old-updated'
            }
          }
        ]
      },
      updates: [
        {
          target: { scope: 'row', fieldId: 'RECIPE' },
          value: 'New soup'
        }
      ],
      context: { scope: 'line', groupId: 'MEALS', rowId: 'row1' }
    });

    expect(result.lineItems.MEALS[0].values).toEqual({
      RECIPE: 'New soup',
      RECIPE_SOURCE_ID: null,
      RECIPE_SOURCE_UPDATED_AT: null
    });
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

describe('resolveFieldChangeDialogConfirmUpdates', () => {
  it('clears file uploads and single checkboxes with type-aware empty values', () => {
    const definition: any = {
      questions: [
        { id: 'ING_EVD', type: 'FILE_UPLOAD' },
        { id: 'MP_COOK_TEMP', type: 'CHECKBOX', options: [] }
      ]
    };

    const updates = resolveFieldChangeDialogConfirmUpdates({
      dialog: {
        when: { fieldId: 'ING_EVD', notEmpty: true } as any,
        confirmUpdates: [
          { target: { scope: 'top', fieldId: 'ING_EVD' }, clear: true },
          { target: { scope: 'top', fieldId: 'MP_COOK_TEMP' }, clear: true }
        ]
      } as any,
      definition,
      context: { scope: 'line', groupId: 'MP_MEALS_REQUEST::row1::MP_TYPE_LI' }
    });

    expect(updates).toEqual([
      { target: { scope: 'top', fieldId: 'ING_EVD' }, value: [] },
      { target: { scope: 'top', fieldId: 'MP_COOK_TEMP' }, value: false }
    ]);
  });

  it('clears multi-select checkboxes to an empty array and preserves explicit values', () => {
    const definition: any = {
      questions: [
        { id: 'FLAGS', type: 'CHECKBOX', options: ['A', 'B'] },
        { id: 'STATUS', type: 'TEXT' }
      ]
    };

    const updates = resolveFieldChangeDialogConfirmUpdates({
      dialog: {
        when: { fieldId: 'FLAGS', notEmpty: true } as any,
        confirmUpdates: [
          { target: { scope: 'top', fieldId: 'FLAGS' }, clear: true },
          { target: { scope: 'top', fieldId: 'STATUS' }, value: 'reset' }
        ]
      } as any,
      definition,
      context: { scope: 'top' }
    });

    expect(updates).toEqual([
      { target: { scope: 'top', fieldId: 'FLAGS' }, value: [] },
      { target: { scope: 'top', fieldId: 'STATUS' }, value: 'reset' }
    ]);
  });
});

describe('resolveFieldChangeDialogCancelAction', () => {
  it('defaults to none', () => {
    expect(resolveFieldChangeDialogCancelAction(undefined as any)).toBe('none');
    expect(resolveFieldChangeDialogCancelAction({ when: { fieldId: 'DATE', notEmpty: true } } as any)).toBe('none');
  });

  it('resolves discardDraftAndGoHome action', () => {
    expect(
      resolveFieldChangeDialogCancelAction({
        when: { fieldId: 'DATE', isInFuture: true },
        cancelAction: 'discardDraftAndGoHome'
      } as any)
    ).toBe('discardDraftAndGoHome');
  });
});
