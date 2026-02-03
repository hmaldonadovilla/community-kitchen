import { resolveCopyCurrentRecordDialog } from '../../../src/web/react/app/copyCurrentRecordDialog';

describe('copyCurrentRecordDialog', () => {
  it('returns null when not configured', () => {
    const res = resolveCopyCurrentRecordDialog({} as any, 'EN' as any);
    expect(res).toBeNull();
  });

  it('resolves localized copy dialog with single OK defaults', () => {
    const definition: any = {
      copyCurrentRecordDialog: {
        title: { en: 'Copying record' },
        message: { en: 'Select the production date.' },
        confirmLabel: { en: 'OK' }
      }
    };

    const res = resolveCopyCurrentRecordDialog(definition, 'EN' as any);
    expect(res).toEqual({
      title: 'Copying record',
      message: 'Select the production date.',
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      showCancel: false,
      showCloseButton: false,
      dismissOnBackdrop: false
    });
  });

  it('allows opt-in cancel/close/backdrop', () => {
    const definition: any = {
      copyCurrentRecordDialog: {
        message: { en: 'Hello' },
        showCancel: true,
        showCloseButton: true,
        dismissOnBackdrop: true
      }
    };

    const res = resolveCopyCurrentRecordDialog(definition, 'EN' as any);
    expect(res?.showCancel).toBe(true);
    expect(res?.showCloseButton).toBe(true);
    expect(res?.dismissOnBackdrop).toBe(true);
  });
});

