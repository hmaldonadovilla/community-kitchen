import {
  buildReservationFailureMessage,
  getReservationCommitMode,
  shouldImmediatelySyncStepReservationChange,
  shouldDeferReservationSync
} from '../../../src/web/react/components/form/reservationSyncPolicy';
import { normalizeInventoryAvailabilitySnapshotForDisplay } from '../../../src/web/react/features/reservations/availabilitySnapshots';

describe('reservationSyncPolicy', () => {
  test('defers reservation sync for quantity-only patches', () => {
    expect(
      shouldDeferReservationSync({
        patch: {
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toBe(true);
  });

  test('does not defer reservation sync when the selection state is part of the patch', () => {
    expect(
      shouldDeferReservationSync({
        patch: {
          LEFTOVER_SELECTED: true,
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toBe(false);
  });

  test('immediately syncs step reservations when a valid quantity change is present', () => {
    expect(
      shouldImmediatelySyncStepReservationChange({
        patch: {
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('immediately syncs step reservations for other valid line changes once the reservation state is complete', () => {
    expect(
      shouldImmediatelySyncStepReservationChange({
        patch: {
          LEFTOVER_USAGE_MODE: 'Combine'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('immediately syncs step reservations when a line is deselected', () => {
    expect(
      shouldImmediatelySyncStepReservationChange({
        patch: {
          LEFTOVER_SELECTED: false
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: false,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('does not immediately sync step reservations when the edited line is still invalid', () => {
    expect(
      shouldImmediatelySyncStepReservationChange({
        patch: {
          LEFTOVER_USE_QTY: null
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: null,
        hasValidationErrors: true
      })
    ).toBe(false);
  });

  test('maps transient reservation lock failures to the user-facing recovery message', () => {
    expect(
      buildReservationFailureMessage(
        'Could not acquire the reservation transaction lock. Please retry.',
        "We couldn't update the reservation.",
        "We couldn't update the reservation properly. Please try again."
      )
    ).toBe("We couldn't update the reservation properly. Please try again.");
  });

  test('keeps non-lock failures unchanged', () => {
    expect(
      buildReservationFailureMessage(
        'The selected reservation is no longer available.',
        "We couldn't update the reservation."
      )
    ).toBe('The selected reservation is no longer available.');
  });

  test('formats availability conflicts with the leftover item and remaining quantity', () => {
    expect(
      buildReservationFailureMessage(
        'Only 0',
        "We couldn't update the reservation.",
        undefined,
        {
          itemId: 'LE-95',
          itemLabel: 'Bulgur & vegetable sauce',
          availability: {
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover-1',
            resourceItemId: 'LE-95',
            quantityFieldId: 'LEFTOVER_PORTIONS',
            reservedQuantityFieldId: 'LEFTOVER_RESERVED_PORTIONS',
            remainingQuantity: 5,
            reservedQuantity: 10,
            freeQuantity: 0,
            currentReservationQuantity: 5,
            currentRecordReservedQuantity: 5,
            unit: 'portions',
            status: 'available'
          }
        }
      )
    ).toBe(
      'Bulgur & vegetable sauce | LE-95 has only 0 portions available. Adjust the quantity or choose another leftover item.'
    );
  });

  test('formats unavailable reservation items with the leftover item and remaining quantity', () => {
    expect(
      buildReservationFailureMessage(
        'This inventory item is not available for reservation (used).',
        "We couldn't update the reservation.",
        undefined,
        {
          itemId: 'LP-22',
          itemLabel: 'Broccoli mix - frozen',
          availability: {
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover-2',
            resourceItemId: 'LP-22',
            quantityFieldId: 'LEFTOVER_QTY',
            reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
            remainingQuantity: 500,
            reservedQuantity: 0,
            freeQuantity: 500,
            currentReservationQuantity: 0,
            currentRecordReservedQuantity: 0,
            unit: 'gr',
            status: 'used'
          }
        }
      )
    ).toBe(
      'Broccoli mix - frozen | LP-22 is no longer available for reservation. Current remaining quantity: 500 gr. Adjust the quantity or choose another leftover item.'
    );
  });

  test('detects step-commit reservation mode', () => {
    expect(getReservationCommitMode({ commitMode: 'step' })).toBe('step');
    expect(getReservationCommitMode({})).toBe('immediate');
  });

  test('preserves current-record reservations in step-sync availability snapshots', () => {
    expect(
      normalizeInventoryAvailabilitySnapshotForDisplay({
        resourceFormKey: 'Config: Leftover Inventory',
        resourceRecordId: 'leftover-1',
        resourceItemId: 'LE-43',
        reservedQuantity: 2,
        currentRecordReservedQuantity: 2,
        freeQuantity: 3
      } as any)
    ).toEqual(
      expect.objectContaining({
        resourceRecordId: 'leftover-1',
        resourceItemId: 'LE-43',
        reservedQuantity: 2,
        currentRecordReservedQuantity: 2,
        freeQuantity: 3
      })
    );
  });
});
