import {
  buildReservationFailureMessage,
  getReservationCommitMode,
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

  test('maps transient reservation lock failures to the user-facing recovery message', () => {
    expect(
      buildReservationFailureMessage(
        'Could not acquire the reservation transaction lock. Please retry.',
        "We couldn't update the leftover selection."
      )
    ).toBe(
      "We couldn't update the leftover selection properly. Please go back to the Leftover bank screen and try again."
    );
  });

  test('keeps non-lock failures unchanged', () => {
    expect(
      buildReservationFailureMessage(
        'The selected leftover is no longer available.',
        "We couldn't update the leftover selection."
      )
    ).toBe('The selected leftover is no longer available.');
  });

  test('detects step-commit reservation mode', () => {
    expect(getReservationCommitMode({ commitMode: 'step' })).toBe('step');
    expect(getReservationCommitMode({})).toBe('immediate');
  });
});
