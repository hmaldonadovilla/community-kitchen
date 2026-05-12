import {
  isLineItemDedupErrorMessage,
  shouldPreserveLineItemDedupError
} from '../../../src/web/react/features/lineItems/domain/lineItemDedupErrors';

describe('lineItemDedupErrors', () => {
  it('matches configured dedup messages even when the value token changes', () => {
    const rules: any = [
      {
        fields: ['ING', 'UNIT'],
        message: { en: '{value} is already on the list. Update the existing quantity instead of adding a new line' }
      }
    ];

    expect(
      isLineItemDedupErrorMessage({
        rules,
        language: 'EN',
        message: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
      })
    ).toBe(true);
    expect(
      shouldPreserveLineItemDedupError({
        groupConfig: { dedupRules: rules },
        language: 'EN',
        message: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
      })
    ).toBe(true);
  });
});
