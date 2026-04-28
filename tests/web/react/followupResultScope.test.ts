import { resolveFollowupResultApplicationTarget } from '../../../src/web/react/app/followupResultScope';

describe('resolveFollowupResultApplicationTarget', () => {
  it('allows active record updates when record, view, and session still match', () => {
    expect(
      resolveFollowupResultApplicationTarget({
        settledRecordId: 'r1',
        selectedRecordId: 'r1',
        currentSessionId: 4,
        followupSessionId: 4,
        currentView: 'form'
      }).applyToActiveRecord
    ).toBe(true);
  });

  it('rejects stale background results after the user switches record sessions', () => {
    const result = resolveFollowupResultApplicationTarget({
      settledRecordId: 'old-record',
      selectedRecordId: 'new-record',
      currentSessionId: 9,
      followupSessionId: 8,
      currentView: 'form'
    });

    expect(result.applyToActiveRecord).toBe(false);
    expect(result.sessionChanged).toBe(true);
  });

  it('rejects detached results while the user is on home even if the selected id is still present', () => {
    const result = resolveFollowupResultApplicationTarget({
      settledRecordId: 'r1',
      selectedRecordId: 'r1',
      currentSessionId: 4,
      followupSessionId: 4,
      currentView: 'list'
    });

    expect(result.applyToActiveRecord).toBe(false);
    expect(result.viewAllowsActiveRecord).toBe(false);
  });

  it('uses the selected snapshot id as a fallback for active record detection', () => {
    expect(
      resolveFollowupResultApplicationTarget({
        settledRecordId: 'r1',
        selectedSnapshotId: 'r1',
        currentView: 'summary'
      }).applyToActiveRecord
    ).toBe(true);
  });
});
