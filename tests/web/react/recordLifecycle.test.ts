import {
  resolveCurrentOpenRecordId,
  resolveKnownClientDataVersion,
  resolveRecordVersionCheckBaseline,
  resolveRecordVersionCheckComparison
} from '../../../src/web/react/app/recordLifecycle';

describe('recordLifecycle helpers', () => {
  it('resolves the active record id from selected id, snapshot, then last submission meta', () => {
    expect(
      resolveCurrentOpenRecordId({
        selectedRecordId: 'REC-SELECTED',
        selectedRecordSnapshot: { id: 'REC-SNAPSHOT' },
        lastSubmissionMetaId: 'REC-META'
      })
    ).toBe('REC-SELECTED');

    expect(
      resolveCurrentOpenRecordId({
        selectedRecordSnapshot: { id: 'REC-SNAPSHOT' },
        lastSubmissionMetaId: 'REC-META'
      })
    ).toBe('REC-SNAPSHOT');

    expect(resolveCurrentOpenRecordId({ lastSubmissionMetaId: 'REC-META' })).toBe('REC-META');
    expect(resolveCurrentOpenRecordId({})).toBe('');
  });

  it('keeps the highest known positive client data version across record state sources', () => {
    expect(
      resolveKnownClientDataVersion({
        recordDataVersion: 4,
        optimisticClientDataVersion: 6,
        lastSubmissionMetaDataVersion: '5',
        selectedRecordSnapshotDataVersion: 'bad'
      })
    ).toBe(6);

    expect(
      resolveKnownClientDataVersion({
        recordDataVersion: null,
        optimisticClientDataVersion: 0,
        lastSubmissionMetaDataVersion: 'bad',
        selectedRecordSnapshotDataVersion: undefined
      })
    ).toBeNull();
  });

  it('prefers the current confirmed version before falling back to the cached list version', () => {
    expect(resolveRecordVersionCheckBaseline({ currentDataVersion: 7, cachedVersion: 4 })).toBe(7);
    expect(resolveRecordVersionCheckBaseline({ currentDataVersion: null, cachedVersion: 4 })).toBe(4);
    expect(resolveRecordVersionCheckBaseline({ currentDataVersion: 0, cachedVersion: 'bad' })).toBeNull();
  });

  it('detects matching, stale, and unknown server version checks', () => {
    expect(
      resolveRecordVersionCheckComparison({
        currentDataVersion: 7,
        cachedVersion: 4,
        serverDataVersion: '7',
        serverRowNumber: '12'
      })
    ).toEqual({
      state: 'match',
      baselineVersion: 7,
      serverVersion: 7,
      serverRow: 12
    });

    expect(
      resolveRecordVersionCheckComparison({
        currentDataVersion: null,
        cachedVersion: 4,
        serverDataVersion: 5,
        serverRowNumber: 1
      })
    ).toEqual({
      state: 'stale',
      baselineVersion: 4,
      serverVersion: 5,
      serverRow: 1
    });

    expect(
      resolveRecordVersionCheckComparison({
        currentDataVersion: null,
        cachedVersion: 4,
        serverDataVersion: 'bad',
        serverRowNumber: 12
      })
    ).toEqual({
      state: 'unknown',
      baselineVersion: 4,
      serverVersion: null,
      serverRow: 12
    });
  });
});
