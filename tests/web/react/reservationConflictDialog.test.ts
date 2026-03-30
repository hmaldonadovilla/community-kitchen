import { buildReservationConflictDialogCopy, computeReservationConflictUsableQuantity } from '../../../src/web/react/components/form/reservationConflictDialog';

describe('reservationConflictDialog', () => {
  test('computes usable quantity from free + current reservation', () => {
    expect(
      computeReservationConflictUsableQuantity({
        resourceFormKey: 'Config: Leftover Inventory',
        resourceRecordId: 'abc',
        quantityFieldId: 'LEFTOVER_PORTIONS',
        reservedQuantityFieldId: 'LEFTOVER_RESERVED_PORTIONS',
        remainingQuantity: 5,
        reservedQuantity: 3,
        freeQuantity: 2,
        currentReservationQuantity: 1,
        currentRecordReservedQuantity: 3
      })
    ).toBe(3);
  });

  test('renders configurable copy with placeholders', () => {
    const copy = buildReservationConflictDialogCopy({
      language: 'EN',
      dialog: {
        title: 'Availability changed',
        message: '{itemLabel} now has {availableWithUnit} available.',
        confirmLabel: 'Use available amount',
        cancelLabel: 'Cancel action'
      },
      availability: {
        resourceFormKey: 'Config: Leftover Inventory',
        resourceRecordId: 'abc',
        resourceItemId: 'LE-1',
        resourceKind: 'Entire dish',
        quantityFieldId: 'LEFTOVER_PORTIONS',
        reservedQuantityFieldId: 'LEFTOVER_RESERVED_PORTIONS',
        remainingQuantity: 5,
        reservedQuantity: 3,
        freeQuantity: 2,
        currentReservationQuantity: 0,
        currentRecordReservedQuantity: 0
      },
      sourceRow: {
        LEFTOVER_RECIPE: 'Curry & fish (diabetic)',
        LEFTOVER_ID: 'LE-1',
        LEFTOVER_KIND: 'Entire dish'
      },
      requestedQuantity: 4,
      fallbackTitle: 'Notice',
      fallbackMessage: 'Fallback {availableWithUnit}',
      fallbackConfirmLabel: 'OK',
      fallbackCancelLabel: 'Cancel'
    });

    expect(copy.title).toBe('Availability changed');
    expect(copy.message).toBe('Curry & fish (diabetic) now has 2 portions available.');
    expect(copy.confirmLabel).toBe('Use available amount');
    expect(copy.cancelLabel).toBe('Cancel action');
    expect(copy.showCancel).toBe(true);
  });
});
