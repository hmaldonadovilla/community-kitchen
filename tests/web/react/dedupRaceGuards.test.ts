import {
  isDeleteOnKeyChangeSettledForRecord,
  shouldApplyDedupPrecheckResult
} from '../../../src/web/react/app/dedupRaceGuards';

describe('dedup race guards', () => {
  it('applies a dedup precheck result only for the same request, session, signature, and form view', () => {
    expect(
      shouldApplyDedupPrecheckResult({
        requestSeq: 3,
        currentSeq: 3,
        sessionAtStart: 7,
        currentSession: 7,
        signatureAtStart: 'customer=belliard|date=2026-04-28',
        currentSignature: 'customer=belliard|date=2026-04-28',
        currentView: 'form'
      })
    ).toBe(true);
  });

  it('rejects stale dedup precheck results after the user changes record session or signature', () => {
    expect(
      shouldApplyDedupPrecheckResult({
        requestSeq: 3,
        currentSeq: 3,
        sessionAtStart: 7,
        currentSession: 8,
        signatureAtStart: 'old',
        currentSignature: 'old',
        currentView: 'form'
      })
    ).toBe(false);

    expect(
      shouldApplyDedupPrecheckResult({
        requestSeq: 3,
        currentSeq: 3,
        sessionAtStart: 7,
        currentSession: 7,
        signatureAtStart: 'old',
        currentSignature: 'new',
        currentView: 'form'
      })
    ).toBe(false);
  });

  it('rejects dedup precheck results after navigating away from the form', () => {
    expect(
      shouldApplyDedupPrecheckResult({
        requestSeq: 3,
        currentSeq: 3,
        sessionAtStart: 7,
        currentSession: 7,
        signatureAtStart: 'same',
        currentSignature: 'same',
        currentView: 'list'
      })
    ).toBe(false);
  });

  it('treats an in-flight delete as settled when the target record is no longer current', () => {
    expect(
      isDeleteOnKeyChangeSettledForRecord({
        targetRecordId: 'r1',
        currentRecordId: '',
        deletedRecordIds: []
      })
    ).toBe(true);

    expect(
      isDeleteOnKeyChangeSettledForRecord({
        targetRecordId: 'r1',
        currentRecordId: 'r1',
        deletedRecordIds: ['r1']
      })
    ).toBe(false);

    expect(
      isDeleteOnKeyChangeSettledForRecord({
        targetRecordId: 'r1',
        currentRecordId: 'r2',
        deletedRecordIds: []
      })
    ).toBe(true);
  });
});
