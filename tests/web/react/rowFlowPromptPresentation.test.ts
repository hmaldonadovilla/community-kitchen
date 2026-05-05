import {
  partitionRowFlowPromptActionsAction,
  resolveRowFlowPromptLayoutAction,
  splitRowFlowPromptLabelAction
} from '../../../src/web/react/features/lineItems/domain/rowFlowPromptPresentation';

describe('row flow prompt presentation domain', () => {
  test('splits prompt labels into primary label and helper text', () => {
    expect(splitRowFlowPromptLabelAction('Quantity')).toEqual({
      labelText: 'Quantity',
      helperText: ''
    });

    expect(splitRowFlowPromptLabelAction('Quantity\nUse the cooked amount\nBefore waste')).toEqual({
      labelText: 'Quantity',
      helperText: 'Use the cooked amount\nBefore waste'
    });
  });

  test('resolves prompt layout flags with defaults', () => {
    expect(resolveRowFlowPromptLayoutAction(null)).toEqual({
      labelLayout: 'stacked',
      actionsLayout: 'below',
      useInlineLabel: false,
      hideLabel: false,
      actionsInline: false
    });

    expect(
      resolveRowFlowPromptLayoutAction({
        input: { labelLayout: 'INLINE' },
        actionsLayout: 'INLINE'
      })
    ).toEqual({
      labelLayout: 'inline',
      actionsLayout: 'inline',
      useInlineLabel: true,
      hideLabel: false,
      actionsInline: true
    });

    expect(resolveRowFlowPromptLayoutAction({ input: { labelLayout: 'hidden' } })).toMatchObject({
      hideLabel: true
    });
  });

  test('partitions prompt actions by configured position', () => {
    const actions = [
      { id: 'add', position: 'start' },
      { id: 'next' },
      { id: 'remove', position: 'end' }
    ];

    expect(partitionRowFlowPromptActionsAction(actions)).toEqual({
      startActions: [actions[0], actions[1]],
      endActions: [actions[2]]
    });
  });
});
