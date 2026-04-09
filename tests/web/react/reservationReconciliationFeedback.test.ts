import { buildReservationReconciliationFeedback } from '../../../src/web/react/app/reservationReconciliationFeedback';

describe('reservationReconciliationFeedback', () => {
  it('falls back to concise built-in messaging when no config is provided', () => {
    expect(
      buildReservationReconciliationFeedback({
        language: 'EN',
        baseMessage: 'Submitted and closed.',
        consumedReservations: 1,
        releasedReservations: 2,
        fallbackConsumedSummarySingular: '{count} reservation consumed',
        fallbackConsumedSummaryPlural: '{count} reservations consumed',
        fallbackReleasedSummarySingular: '{count} reservation released',
        fallbackReleasedSummaryPlural: '{count} reservations released'
      })
    ).toBe('Submitted and closed. 1 reservation consumed, 2 reservations released.');
  });

  it('renders configurable localized feedback templates', () => {
    expect(
      buildReservationReconciliationFeedback({
        language: 'EN',
        baseMessage: 'Submitted and closed.',
        consumedReservations: 1,
        releasedReservations: 2,
        feedback: {
          message: {
            en: '{baseMessage} {reconciliationSummary}.'
          },
          consumedSummarySingular: {
            en: '{count} reservation finalized'
          },
          consumedSummaryPlural: {
            en: '{count} reservations finalized'
          },
          releasedSummarySingular: {
            en: '{count} reservation released'
          },
          releasedSummaryPlural: {
            en: '{count} reservations released'
          }
        }
      })
    ).toBe('Submitted and closed. 1 reservation finalized, 2 reservations released.');
  });

  it('returns the base message when there is nothing to summarize', () => {
    expect(
      buildReservationReconciliationFeedback({
        language: 'EN',
        baseMessage: 'Submitted and closed.',
        consumedReservations: 0,
        releasedReservations: 0
      })
    ).toBe('Submitted and closed.');
  });
});
