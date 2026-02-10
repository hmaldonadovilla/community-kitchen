import {
  collectIncompleteEntireLeftoverRowIds,
  resolveIncompleteEntireLeftoverOverlayDialogCopy
} from '../../../src/web/react/app/leftoverOverlayGuard';

describe('leftoverOverlayGuard', () => {
  it('collects only entire-dish rows with missing or invalid quantities', () => {
    const rowIds = collectIncompleteEntireLeftoverRowIds([
      { id: 'a', values: { PREP_TYPE: 'Entire dish', PREP_QTY: '' } },
      { id: 'b', values: { PREP_TYPE: 'Entire dish', PREP_QTY: 0 } },
      { id: 'c', values: { PREP_TYPE: 'Entire dish', PREP_QTY: -1 } },
      { id: 'd', values: { PREP_TYPE: 'Part dish', PREP_QTY: '' } }
    ] as any);

    expect(rowIds).toEqual(['a', 'c']);
  });

  it('supports custom field mapping and minimum quantity', () => {
    const rowIds = collectIncompleteEntireLeftoverRowIds(
      [
        { id: 'a', values: { TYPE: 'FULL', QTY: '1' } },
        { id: 'b', values: { TYPE: 'FULL', QTY: '0' } },
        { id: 'c', values: { TYPE: 'FULL', QTY: '' } }
      ] as any,
      { prepTypeFieldId: 'TYPE', prepTypeValue: 'FULL', quantityFieldId: 'QTY', minQuantity: 1 }
    );

    expect(rowIds).toEqual(['b', 'c']);
  });

  it('resolves stable default dialog copy', () => {
    const copy = resolveIncompleteEntireLeftoverOverlayDialogCopy('EN');
    expect(copy.title).toBe('Missing Entire leftover number of portions.');
    expect(copy.confirmLabel).toBe('Discard incomplete leftover record.');
    expect(copy.cancelLabel).toBe('Continue editing');
    expect(copy.showCloseButton).toBe(false);
    expect(copy.dismissOnBackdrop).toBe(false);
  });
});
