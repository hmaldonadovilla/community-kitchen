import {
  shouldDeferUtilisationDraftSyncToDeleteOnKeyChange,
  shouldSkipUtilisationDraftSyncForDeleteOnKeyChange
} from '../../../src/web/react/features/utilisations/domain/utilisationDraftSyncGuards';

describe('utilisationDraftSyncGuards', () => {
  test('skips release-scope draft sync while delete-on-key-change owns the mutation', () => {
    expect(
      shouldSkipUtilisationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeleteOnKeyChangeInFlight: true
      })
    ).toBe(true);
    expect(
      shouldSkipUtilisationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeletePending: true
      })
    ).toBe(true);
  });

  test('allows normal utilisation draft sync when there is no delete-on-key-change owner', () => {
    expect(
      shouldSkipUtilisationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeleteOnKeyChangeInFlight: false,
        dedupDeletePending: false
      })
    ).toBe(false);
    expect(
      shouldSkipUtilisationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 0,
        dedupDeletePending: true
      })
    ).toBe(false);
  });

  test('defers any pending utilisation draft sync once delete-on-key-change owns the next save', () => {
    expect(
      shouldDeferUtilisationDraftSyncToDeleteOnKeyChange({
        dedupDeleteOnKeyChangeInFlight: false,
        dedupDeletePending: false
      })
    ).toBe(false);
    expect(
      shouldDeferUtilisationDraftSyncToDeleteOnKeyChange({
        dedupDeleteOnKeyChangeInFlight: true,
        dedupDeletePending: false
      })
    ).toBe(true);
    expect(
      shouldDeferUtilisationDraftSyncToDeleteOnKeyChange({
        dedupDeleteOnKeyChangeInFlight: false,
        dedupDeletePending: true
      })
    ).toBe(true);
  });
});
