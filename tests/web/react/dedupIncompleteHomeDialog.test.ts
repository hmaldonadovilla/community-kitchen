import {
  resolveDedupIncompleteHomeDialogConfig,
  resolveDedupIncompleteHomeDialogCopy
} from '../../../src/web/react/app/dedupIncompleteHomeDialog';

describe('dedupIncompleteHomeDialog', () => {
  it('resolves dialog config from actionBars.system.home', () => {
    const config = resolveDedupIncompleteHomeDialogConfig({
      system: {
        home: {
          hideWhenActive: true,
          dedupIncompleteDialog: {
            enabled: true,
            title: { en: '' },
            message: { en: 'Custom message' },
            confirmLabel: { en: 'Delete and leave' },
            cancelLabel: { en: 'Keep editing' },
            primaryAction: 'cancel',
            showCancel: true,
            showCloseButton: false,
            dismissOnBackdrop: false,
            deleteRecordOnConfirm: true
          }
        }
      }
    } as any);

    expect(config).toEqual({
      enabled: true,
      title: { en: '' },
      message: { en: 'Custom message' },
      confirmLabel: { en: 'Delete and leave' },
      cancelLabel: { en: 'Keep editing' },
      primaryAction: 'cancel',
      showCancel: true,
      showCloseButton: false,
      dismissOnBackdrop: false,
      deleteRecordOnConfirm: true
    });
  });

  it('falls back to defaults for missing dialog copy', () => {
    const copy = resolveDedupIncompleteHomeDialogCopy(undefined, 'EN');
    expect(copy.title).toBe('Incomplete record');
    expect(copy.confirmLabel).toBe('Continue and delete the record');
    expect(copy.cancelLabel).toBe('Cancel and continue editing');
    expect(copy.primaryAction).toBe('confirm');
    expect(copy.showCancel).toBe(true);
    expect(copy.showCloseButton).toBe(true);
    expect(copy.dismissOnBackdrop).toBe(true);
    expect(copy.deleteFailedMessage).toBe('Could not delete the current record. Please try again.');
  });

  it('keeps an explicitly empty title and supports cancel as primary action', () => {
    const copy = resolveDedupIncompleteHomeDialogCopy(
      {
        title: { en: '' },
        primaryAction: 'cancel'
      },
      'EN'
    );
    expect(copy.title).toBe('');
    expect(copy.primaryAction).toBe('cancel');
  });
});
