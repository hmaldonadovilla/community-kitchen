import {
  shouldApplyPrefetchedRecordPreview,
  shouldDiscardRecordLoadResult
} from '../../../src/web/react/app/recordLoadGuard';

describe('shouldDiscardRecordLoadResult', () => {
  it('keeps the result when sequence and session still match', () => {
    expect(
      shouldDiscardRecordLoadResult({
        requestSeq: 4,
        currentSeq: 4,
        sessionAtStart: 2,
        currentSession: 2
      })
    ).toBe(false);
  });

  it('discards the result when a newer request superseded it', () => {
    expect(
      shouldDiscardRecordLoadResult({
        requestSeq: 4,
        currentSeq: 5,
        sessionAtStart: 2,
        currentSession: 2
      })
    ).toBe(true);
  });

  it('discards the result when the record session changed', () => {
    expect(
      shouldDiscardRecordLoadResult({
        requestSeq: 4,
        currentSeq: 4,
        sessionAtStart: 2,
        currentSession: 3
      })
    ).toBe(true);
  });

  it('applies a prefetched preview only for the active record in the same session', () => {
    expect(
      shouldApplyPrefetchedRecordPreview({
        recordId: 'rec-1',
        selectedRecordId: 'rec-1',
        hasSelectedSnapshot: false,
        sessionAtStart: 2,
        currentSession: 2
      })
    ).toBe(true);

    expect(
      shouldApplyPrefetchedRecordPreview({
        recordId: 'rec-1',
        selectedRecordId: 'rec-2',
        hasSelectedSnapshot: false,
        sessionAtStart: 2,
        currentSession: 2
      })
    ).toBe(false);

    expect(
      shouldApplyPrefetchedRecordPreview({
        recordId: 'rec-1',
        selectedRecordId: 'rec-1',
        hasSelectedSnapshot: true,
        sessionAtStart: 2,
        currentSession: 2
      })
    ).toBe(false);

    expect(
      shouldApplyPrefetchedRecordPreview({
        recordId: 'rec-1',
        selectedRecordId: 'rec-1',
        hasSelectedSnapshot: false,
        sessionAtStart: 2,
        currentSession: 3
      })
    ).toBe(false);
  });
});
