import { resolveUiRecordStatus } from '../../../src/web/react/app/recordMeta';

describe('recordMeta', () => {
  it('prefers the persisted status when present', () => {
    expect(
      resolveUiRecordStatus({
        persistedStatus: 'In production',
        autoSaveDefaultStatus: 'In progress',
        guidedForwardGateSatisfied: true
      })
    ).toBe('In production');
  });

  it('falls back to the autosave default status once the current guided step is locally complete', () => {
    expect(
      resolveUiRecordStatus({
        persistedStatus: '',
        autoSaveDefaultStatus: 'In progress',
        guidedForwardGateSatisfied: true
      })
    ).toBe('In progress');
  });

  it('keeps status empty while the current guided step is still incomplete', () => {
    expect(
      resolveUiRecordStatus({
        persistedStatus: '',
        autoSaveDefaultStatus: 'In progress',
        guidedForwardGateSatisfied: false
      })
    ).toBeNull();
  });
});
