import { shouldSkipGuidedStepBackgroundSync } from '../../../src/web/react/app/guidedStepBackgroundSync';

describe('guidedStepBackgroundSync', () => {
  test('does not skip when the record has not been externally synchronized', () => {
    expect(
      shouldSkipGuidedStepBackgroundSync({
        autoSaveDirty: false,
        autoSaveQueued: false,
        lastExternalSyncAt: 0,
        lastLocalRecordMutationAt: 0
      })
    ).toBe(false);
  });

  test('skips clean step navigation immediately after an external sync', () => {
    expect(
      shouldSkipGuidedStepBackgroundSync({
        autoSaveDirty: false,
        autoSaveQueued: false,
        lastExternalSyncAt: 200,
        lastLocalRecordMutationAt: 150
      })
    ).toBe(true);
  });

  test('does not skip when the current tab has edited the record after the external sync', () => {
    expect(
      shouldSkipGuidedStepBackgroundSync({
        autoSaveDirty: false,
        autoSaveQueued: false,
        lastExternalSyncAt: 200,
        lastLocalRecordMutationAt: 250
      })
    ).toBe(false);
  });

  test('does not skip while there is still a local draft to persist', () => {
    expect(
      shouldSkipGuidedStepBackgroundSync({
        autoSaveDirty: true,
        autoSaveQueued: false,
        lastExternalSyncAt: 200,
        lastLocalRecordMutationAt: 150
      })
    ).toBe(false);
    expect(
      shouldSkipGuidedStepBackgroundSync({
        autoSaveDirty: false,
        autoSaveQueued: true,
        lastExternalSyncAt: 200,
        lastLocalRecordMutationAt: 150
      })
    ).toBe(false);
  });
});
