import { buildUtilisationConflictDialogCopy, computeUtilisationConflictUsableQuantity } from '../../../src/web/react/components/form/utilisationConflictDialog';

describe('utilisationConflictDialog', () => {
  test('computes usable quantity from free + current utilisation', () => {
    expect(
      computeUtilisationConflictUsableQuantity({
        resourceFormKey: 'Config: Leftover Bank',
        resourceRecordId: 'abc',
        quantityFieldId: 'LEFTOVER_PORTIONS',
        remainingQuantity: 5,
        freeQuantity: 2,
        currentUtilisationQuantity: 1,
        currentRecordUtilisedQuantity: 3
      })
    ).toBe(3);
  });

  test('renders configurable copy with placeholders', () => {
    const copy = buildUtilisationConflictDialogCopy({
      language: 'EN',
      dialog: {
        title: 'Availability changed',
        message: '{itemLabel} now has {availableWithUnit} available.',
        confirmLabel: 'Use available amount',
        cancelLabel: 'Cancel action'
      },
      availability: {
        resourceFormKey: 'Config: Leftover Bank',
        resourceRecordId: 'abc',
        resourceItemId: 'LE-1',
        resourceKind: 'Entire dish',
        unit: 'portions',
        quantityFieldId: 'LEFTOVER_PORTIONS',
        remainingQuantity: 5,
        freeQuantity: 2,
        currentUtilisationQuantity: 0,
        currentRecordUtilisedQuantity: 0
      },
      requestedQuantity: 4,
      itemId: 'LE-1',
      itemLabel: 'Curry & fish (diabetic)',
      fallbackTitle: 'Notice',
      fallbackMessage: 'Fallback {availableWithUnit}',
      fallbackConfirmLabel: 'OK',
      fallbackCancelLabel: 'Cancel'
    });

    expect(copy.title).toBe('Availability changed');
    expect(copy.message).toBe('Curry & fish (diabetic) now has 2 portions available.');
    expect(copy.confirmLabel).toBe('Use available amount');
    expect(copy.cancelLabel).toBe('Cancel action');
    expect(copy.showCancel).toBe(true);
  });

  test('supports a single-action conflict notice without a title', () => {
    const copy = buildUtilisationConflictDialogCopy({
      language: 'EN',
      dialog: {
        title: { en: '' },
        message: {
          en: 'Leftover availability changed before you completed your selection. Your selected quantity is no longer available. Please adjust your selections before continuing'
        },
        confirmLabel: { en: 'OK' },
        showCancel: false,
        showCloseButton: false,
        dismissOnBackdrop: false
      },
      availability: null,
      requestedQuantity: 4,
      fallbackTitle: 'Notice',
      fallbackMessage: 'Fallback message',
      fallbackConfirmLabel: 'OK',
      fallbackCancelLabel: 'Cancel'
    });

    expect(copy).toEqual(
      expect.objectContaining({
        title: '',
        message:
          'Leftover availability changed before you completed your selection. Your selected quantity is no longer available. Please adjust your selections before continuing',
        confirmLabel: 'OK',
        showCancel: false,
        showCloseButton: false,
        dismissOnBackdrop: false
      })
    );
  });
});
