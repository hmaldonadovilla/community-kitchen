import { resolveLineItemMultiAddFeedback } from '../../../src/web/react/components/form/LineItemMultiAddSelect';

describe('LineItemMultiAddSelect feedback', () => {
  it('keeps the configured duplicate message available to the selector', () => {
    const feedback = resolveLineItemMultiAddFeedback({
      result: {
        duplicateValues: ['tomato'],
        message: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
      },
      language: 'EN',
      optionLabelByValue: new Map([['tomato', 'Tomato']])
    });

    expect(feedback).toEqual({
      duplicateValues: ['tomato'],
      message: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
    });
  });

  it('falls back to the selected option label when no duplicate message is returned', () => {
    const feedback = resolveLineItemMultiAddFeedback({
      result: { duplicateValues: ['tomato'] },
      language: 'EN',
      optionLabelByValue: new Map([['tomato', 'Tomato']])
    });

    expect(feedback.message).toBe('Tomato is already in the list, change the quantity');
  });
});
