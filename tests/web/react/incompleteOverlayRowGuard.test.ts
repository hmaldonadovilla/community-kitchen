import {
  collectIncompleteRowsByTypeAndQuantity,
  resolveIncompleteOverlayRowDialogCopy
} from '../../../src/web/react/app/incompleteOverlayRowGuard';

describe('incompleteOverlayRowGuard', () => {
  it('collects only multi-ingredient rows with missing or invalid quantities', () => {
    const rowIds = collectIncompleteRowsByTypeAndQuantity([
      { id: 'a', values: { PREP_TYPE: 'Multi-ingredient', PREP_QTY: '' } },
      { id: 'b', values: { PREP_TYPE: 'Entire dish', PREP_QTY: 0 } },
      { id: 'c', values: { PREP_TYPE: 'Multi-ingredient', PREP_QTY: -1 } },
      { id: 'd', values: { PREP_TYPE: 'Single-ingredient', PREP_QTY: '' } }
    ] as any);

    expect(rowIds).toEqual(['a', 'c']);
  });

  it('supports custom field mapping and minimum quantity', () => {
    const rowIds = collectIncompleteRowsByTypeAndQuantity(
      [
        { id: 'a', values: { TYPE: 'FULL', QTY: '1' } },
        { id: 'b', values: { TYPE: 'FULL', QTY: '0' } },
        { id: 'c', values: { TYPE: 'FULL', QTY: '' } }
      ] as any,
      { typeFieldId: 'TYPE', typeValue: 'FULL', quantityFieldId: 'QTY', minQuantity: 1 }
    );

    expect(rowIds).toEqual(['b', 'c']);
  });

  it('resolves stable default dialog copy', () => {
    const copy = resolveIncompleteOverlayRowDialogCopy('EN');
    expect(copy.title).toBe('Missing multi-ingredient leftover number of portions.');
    expect(copy.confirmLabel).toBe('Discard incomplete leftover record.');
    expect(copy.cancelLabel).toBe('Continue editing');
    expect(copy.showCloseButton).toBe(false);
    expect(copy.dismissOnBackdrop).toBe(false);
  });
});
