import {
  issueReservationRequestEpoch,
  shouldApplyReservationPlanResponse
} from '../../../src/web/react/features/reservations/reservationResponsePolicy';

describe('shouldApplyReservationPlanResponse', () => {
  test('allows the latest response for the same session and record', () => {
    expect(
      shouldApplyReservationPlanResponse({
        requestEpoch: 4,
        latestEpoch: 4,
        requestSessionId: 9,
        currentSessionId: 9,
        requestRecordId: 'record-1',
        currentRecordId: 'record-1'
      })
    ).toBe(true);
  });

  test('rejects an older response after a newer reservation version was queued', () => {
    expect(
      shouldApplyReservationPlanResponse({
        requestEpoch: 4,
        latestEpoch: 5,
        requestSessionId: 9,
        currentSessionId: 9,
        requestRecordId: 'record-1',
        currentRecordId: 'record-1'
      })
    ).toBe(false);
  });

  test('rejects responses from a previous record session', () => {
    expect(
      shouldApplyReservationPlanResponse({
        requestEpoch: 5,
        latestEpoch: 5,
        requestSessionId: 8,
        currentSessionId: 9,
        requestRecordId: 'record-1',
        currentRecordId: 'record-1'
      })
    ).toBe(false);
  });

  test('allows a matching session when the current record id has not been adopted yet', () => {
    expect(
      shouldApplyReservationPlanResponse({
        requestEpoch: 5,
        latestEpoch: 5,
        requestSessionId: 9,
        currentSessionId: 9,
        requestRecordId: 'record-1',
        currentRecordId: ''
      })
    ).toBe(true);
  });

  test('issues a new epoch when a user change is queued before the previous response returns', () => {
    const inFlightEpoch = issueReservationRequestEpoch(0);
    const queuedEpoch = issueReservationRequestEpoch(inFlightEpoch);

    expect(queuedEpoch).toBe(2);
    expect(
      shouldApplyReservationPlanResponse({
        requestEpoch: inFlightEpoch,
        latestEpoch: queuedEpoch,
        requestSessionId: 9,
        currentSessionId: 9,
        requestRecordId: 'record-1',
        currentRecordId: 'record-1'
      })
    ).toBe(false);
  });
});
