import { clearErrorsForRemovedLineItemRows } from '../../../src/web/react/features/lineItems/domain/lineItemRowErrors';

describe('lineItemRowErrors', () => {
  it('clears field errors for removed rows while keeping other row errors', () => {
    const errors = clearErrorsForRemovedLineItemRows({
      errors: {
        'INGREDIENTS__ING__row-1': 'Duplicate ingredient.',
        'INGREDIENTS__UNIT__row-1': 'Please select a unit',
        'INGREDIENTS__ING__row-2': 'Keep this row error',
        OTHER: 'Keep top-level error'
      },
      removedRows: [{ groupId: 'INGREDIENTS', rowId: 'row-1' }]
    });

    expect(errors).toEqual({
      'INGREDIENTS__ING__row-2': 'Keep this row error',
      OTHER: 'Keep top-level error'
    });
  });

  it('clears errors for removed nested subgroup keys', () => {
    const groupKey = 'MEALS::meal-1::INGREDIENTS';
    const errors = clearErrorsForRemovedLineItemRows({
      errors: {
        [groupKey]: 'Group error',
        [`${groupKey}__ING__row-1`]: 'Duplicate ingredient.',
        [`${groupKey}::row-1::DETAIL__FIELD__detail-1`]: 'Nested detail error',
        MEALS: 'Keep parent error'
      },
      removedGroupKeys: [groupKey]
    });

    expect(errors).toEqual({
      MEALS: 'Keep parent error'
    });
  });
});
