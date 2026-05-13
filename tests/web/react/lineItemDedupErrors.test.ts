import {
  applyLineItemDedupConflictErrors,
  hasLineItemDedupErrorInScope,
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

  it('detects scoped dedup errors for overlay action gating', () => {
    const groupConfig: any = {
      subGroups: [
        {
          id: 'INGREDIENTS',
          dedupRules: [
            {
              fields: ['ING', 'UNIT'],
              message: { en: '{value} is already on the list. Update the existing quantity instead of adding a new line' }
            }
          ]
        }
      ]
    };

    expect(
      hasLineItemDedupErrorInScope({
        errors: {
          'MEAL::row-1::INGREDIENTS__ING__ingredient-row-2':
            'Tomato is already on the list. Update the existing quantity instead of adding a new line',
          OTHER: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
        },
        groupKey: 'MEAL',
        groupConfig,
        language: 'EN'
      })
    ).toBe(true);

    expect(
      hasLineItemDedupErrorInScope({
        errors: {
          OTHER: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
        },
        groupKey: 'MEAL',
        groupConfig,
        language: 'EN'
      })
    ).toBe(false);
  });

  it('clears stale validation on the changed dedup field while preserving unrelated row errors', () => {
    const rules: any = [
      {
        fields: ['ING', 'UNIT'],
        message: { en: '{value} is already on the list. Update the existing quantity instead of adding a new line' }
      }
    ];

    const errors = applyLineItemDedupConflictErrors({
      errors: {
        'INGREDIENTS__ING__row-2':
          'Carrot is already on the list. Update the existing quantity instead of adding a new line',
        'INGREDIENTS__UNIT__row-2': 'Please select a unit',
        'INGREDIENTS__QTY__row-2': 'Please enter the quantity'
      },
      groupId: 'INGREDIENTS',
      rowId: 'row-2',
      changedFieldId: 'UNIT',
      conflictFieldId: 'ING',
      conflictFields: ['ING', 'UNIT'],
      conflictMessage: 'Tomato is already on the list. Update the existing quantity instead of adding a new line',
      dedupErrorFieldIds: ['ING'],
      rules,
      language: 'EN'
    });

    expect(errors).toEqual({
      'INGREDIENTS__ING__row-2':
        'Tomato is already on the list. Update the existing quantity instead of adding a new line',
      'INGREDIENTS__QTY__row-2': 'Please enter the quantity'
    });
  });

  it('does not clear unrelated field validation when a duplicate conflict remains', () => {
    const errors = applyLineItemDedupConflictErrors({
      errors: {
        'INGREDIENTS__QTY__row-2': 'Please enter the quantity'
      },
      groupId: 'INGREDIENTS',
      rowId: 'row-2',
      changedFieldId: 'QTY',
      conflictFieldId: 'ING',
      conflictFields: ['ING', 'UNIT'],
      conflictMessage: 'Duplicate ingredient.',
      dedupErrorFieldIds: ['ING'],
      rules: [{ fields: ['ING', 'UNIT'], message: { en: 'Duplicate ingredient.' } }] as any,
      language: 'EN'
    });

    expect(errors).toEqual({
      'INGREDIENTS__ING__row-2': 'Duplicate ingredient.',
      'INGREDIENTS__QTY__row-2': 'Please enter the quantity'
    });
  });
});
