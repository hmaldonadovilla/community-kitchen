import {
  computeAvailableFromBankQuantity,
  ensureEditableMaxIncludesCurrentValue,
  computeOptimisticFreeQuantity,
  computeOptimisticRowMaxQuantity,
  resolveServerCurrentRecordUtilisedQuantity,
  sanitizeNumericDraft,
  toFiniteNumberValue
} from '../../../src/web/react/components/form/quantityConstraints';

describe('quantityConstraints', () => {
  it('computes free availability directly from the bank quantity', () => {
    expect(computeAvailableFromBankQuantity(10)).toBe(10);
    expect(computeAvailableFromBankQuantity('10')).toBe(10);
    expect(computeAvailableFromBankQuantity('-4')).toBe(0);
  });

  it('computes optimistic free availability by applying the local utilisation delta to the bank quantity', () => {
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 10,
        serverCurrentRecordUtilisedQuantity: 2,
        localCurrentRecordUtilisedQuantity: 4
      })
    ).toBe(8);
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 0,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5
      })
    ).toBe(0);
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 500,
        serverCurrentRecordUtilisedQuantity: 200,
        localCurrentRecordUtilisedQuantity: 200
      })
    ).toBe(500);
  });

  it('falls back to committed current-record utilisations when datasource rows have no explicit metadata', () => {
    expect(
      resolveServerCurrentRecordUtilisedQuantity({
        hasExplicitServerCurrentRecordUtilisedQuantity: false,
        serverCurrentRecordUtilisedQuantity: undefined,
        fallbackCurrentRecordUtilisedQuantity: 3
      })
    ).toBe(3);
    expect(
      resolveServerCurrentRecordUtilisedQuantity({
        hasExplicitServerCurrentRecordUtilisedQuantity: true,
        serverCurrentRecordUtilisedQuantity: 0,
        fallbackCurrentRecordUtilisedQuantity: 3
      })
    ).toBe(0);
  });

  it('computes per-row editable max quantity from optimistic free quantity plus current row quantity', () => {
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5,
        currentRowQuantity: 2
      })
    ).toBe(7);
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5,
        currentRowQuantity: 1
      })
    ).toBe(6);
  });

  it('lets an existing utilisation increase up to free stock plus its current row quantity', () => {
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 15,
        serverCurrentRecordUtilisedQuantity: 6,
        localCurrentRecordUtilisedQuantity: 6,
        currentRowQuantity: 6
      })
    ).toBe(21);
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 15,
        serverCurrentRecordUtilisedQuantity: 6,
        localCurrentRecordUtilisedQuantity: 10
      })
    ).toBe(11);
  });

  it('keeps free stock at zero while preserving per-row editable max for fully allocated quantities', () => {
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 0,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5
      })
    ).toBe(0);
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 0,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5,
        currentRowQuantity: 2
      })
    ).toBe(2);
  });

  it('does not inflate editable max when a manual draft exceeds available stock', () => {
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 6,
        currentRowQuantity: 6
      })
    ).toBe(10);
  });

  it('does not let a new over-availability draft become its own editable max', () => {
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 1,
        serverCurrentRecordUtilisedQuantity: 0,
        localCurrentRecordUtilisedQuantity: 20,
        currentRowQuantity: 20
      })
    ).toBe(1);
  });

  it('keeps editable max at least equal to the current row quantity', () => {
    expect(ensureEditableMaxIncludesCurrentValue(0, 2)).toBe(2);
    expect(ensureEditableMaxIncludesCurrentValue(1, '3')).toBe(3);
    expect(ensureEditableMaxIncludesCurrentValue(5, 2)).toBe(5);
  });

  it('clamps integer numeric drafts to max', () => {
    expect(sanitizeNumericDraft('50', { integerOnly: true, maxValue: 5 })).toBe('5');
    expect(sanitizeNumericDraft('003', { integerOnly: true, maxValue: 8 })).toBe('3');
    expect(sanitizeNumericDraft('', { integerOnly: true, maxValue: 8 })).toBe('');
  });

  it('clamps decimal numeric drafts to max', () => {
    expect(sanitizeNumericDraft('300.5', { maxValue: 250 })).toBe('250');
    expect(sanitizeNumericDraft('12,50', { maxValue: 20 })).toBe('12.50');
    expect(sanitizeNumericDraft('abc', { maxValue: 20 })).toBe('');
  });

  it('clamps numeric drafts to min when configured', () => {
    expect(sanitizeNumericDraft('0', { integerOnly: true, minValue: 1 })).toBe('1');
    expect(sanitizeNumericDraft('', { integerOnly: true, minValue: 1 })).toBe('');
  });

  it('parses finite values safely', () => {
    expect(toFiniteNumberValue('12,5')).toBe(12.5);
    expect(toFiniteNumberValue('')).toBe(0);
    expect(toFiniteNumberValue(undefined)).toBe(0);
  });
});
