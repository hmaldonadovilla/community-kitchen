import { shouldSkipCleanDraftSnapshotSave } from '../../../src/web/react/app/snapshotSave';

describe('snapshotSave', () => {
  it('skips clean draft saves for existing records by default', () => {
    expect(
      shouldSkipCleanDraftSnapshotSave({
        mode: 'draft',
        existingRecordId: 'rec-1',
        draftSaveRequestInFlight: false,
        autoSaveDirty: false,
        autoSaveQueued: false
      })
    ).toBe(true);
  });

  it('does not skip when a milestone forces the latest snapshot to be saved', () => {
    expect(
      shouldSkipCleanDraftSnapshotSave({
        mode: 'draft',
        existingRecordId: 'rec-1',
        draftSaveRequestInFlight: false,
        autoSaveDirty: false,
        autoSaveQueued: false,
        force: true
      })
    ).toBe(false);
  });

  it('does not skip reservation draft sync saves for clean records', () => {
    expect(
      shouldSkipCleanDraftSnapshotSave({
        mode: 'draft',
        existingRecordId: 'rec-1',
        draftSaveRequestInFlight: false,
        autoSaveDirty: false,
        autoSaveQueued: false,
        reservationDraftSync: true
      })
    ).toBe(false);
  });

  it('does not skip submit snapshots', () => {
    expect(
      shouldSkipCleanDraftSnapshotSave({
        mode: 'submit',
        existingRecordId: 'rec-1',
        draftSaveRequestInFlight: false,
        autoSaveDirty: false,
        autoSaveQueued: false
      })
    ).toBe(false);
  });
});
