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

  it('resolves incompleteFieldsDialog with fieldIds criteria by default', () => {
    const config = resolveDedupIncompleteHomeDialogConfig({
      system: {
        home: {
          incompleteFieldsDialog: {
            enabled: true,
            fields: [' INGREDIENT_NAME ', 'CREATED_BY', 'ingredient_name'],
            message: { en: 'Missing required fields.' }
          }
        }
      }
    } as any);

    expect(config).toEqual({
      enabled: true,
      criteria: 'fieldIds',
      fieldIds: ['INGREDIENT_NAME', 'CREATED_BY'],
      message: { en: 'Missing required fields.' }
    });
  });

  it('respects explicit criteria aliases', () => {
    const config = resolveDedupIncompleteHomeDialogConfig({
      system: {
        home: {
          incompleteFieldsDialog: {
            trigger: 'any',
            fieldIds: ['INGREDIENT_NAME']
          }
        }
      }
    } as any);

    expect(config?.criteria).toBe('either');
    expect(config?.fieldIds).toEqual(['INGREDIENT_NAME']);
  });

  it('falls back to defaults for missing dialog copy', () => {
    const copy = resolveDedupIncompleteHomeDialogCopy(undefined, 'EN');
    expect(copy.title).toBe('Incomplete record');
    expect(copy.confirmLabel).toBe('Continue and delete the record');
    expect(copy.cancelLabel).toBe('Cancel and continue editing');
    expect(copy.primaryAction).toBe('confirm');
    expect(copy.showCancel).toBe(true);
    expect(copy.showCloseButton).toBe(false);
    expect(copy.dismissOnBackdrop).toBe(false);
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
