import {
  buildReservationFailureMessage,
  getReservationCommitMode,
  normalizeStepReservationAvailabilityForDisplay,
  shouldImmediatelySyncStepReservationChange,
  shouldDeferReservationSync
} from '../../../src/web/react/components/form/reservationSyncPolicy';

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

  test('detects step-commit reservation mode', () => {
    expect(getReservationCommitMode({ commitMode: 'step' })).toBe('step');
    expect(getReservationCommitMode({})).toBe('immediate');
  });

  test('does not double-count the current record when applying step-sync availability snapshots', () => {
    expect(
      normalizeStepReservationAvailabilityForDisplay({
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
        currentRecordReservedQuantity: 0,
        freeQuantity: 3
      })
    );
  });
});
