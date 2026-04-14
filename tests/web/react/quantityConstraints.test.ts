import {
  computeOptimisticAggregateReservedQuantity,
  computeAvailableFromAggregate,
  ensureEditableMaxIncludesCurrentValue,
  computeOptimisticFreeQuantity,
  computeOptimisticRowMaxQuantity,
  resolveServerCurrentRecordReservedQuantity,
  sanitizeNumericDraft,
  toFiniteNumberValue
} from '../../../src/web/react/components/form/quantityConstraints';

describe('quantityConstraints', () => {
  it('computes free availability from remaining and reserved only', () => {
    expect(computeAvailableFromAggregate(10, 4)).toBe(6);
    expect(computeAvailableFromAggregate('10', '4')).toBe(6);
    expect(computeAvailableFromAggregate('10', '40')).toBe(0);
  });

  it('computes optimistic free availability by replacing current record reservations with local reservations', () => {
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 10,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 2,
        localCurrentRecordReservedQuantity: 4
      })
    ).toBe(3);
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 5,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 5,
        localCurrentRecordReservedQuantity: 5
      })
    ).toBe(0);
  });

  it('falls back to committed current-record reservations when datasource rows have no explicit metadata', () => {
    expect(
      resolveServerCurrentRecordReservedQuantity({
        hasExplicitServerCurrentRecordReservedQuantity: false,
        serverCurrentRecordReservedQuantity: undefined,
        fallbackCurrentRecordReservedQuantity: 3
      })
    ).toBe(3);
    expect(
      resolveServerCurrentRecordReservedQuantity({
        hasExplicitServerCurrentRecordReservedQuantity: true,
        serverCurrentRecordReservedQuantity: 0,
        fallbackCurrentRecordReservedQuantity: 3
      })
    ).toBe(0);
  });

  it('computes optimistic aggregate reserved stock by replacing the current record quantity only once', () => {
    expect(
      computeOptimisticAggregateReservedQuantity({
        reservedQuantity: 3,
        serverCurrentRecordReservedQuantity: 3,
        localCurrentRecordReservedQuantity: 2
      })
    ).toBe(2);
  });

  it('computes per-row editable max quantity from optimistic free quantity plus current row quantity', () => {
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 5,
        localCurrentRecordReservedQuantity: 5,
        currentRowQuantity: 2
      })
    ).toBe(2);
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 5,
        localCurrentRecordReservedQuantity: 5,
        currentRowQuantity: 1
      })
    ).toBe(1);
  });

  it('keeps free stock at zero while preserving per-row editable max for fully allocated quantities', () => {
    expect(
      computeOptimisticFreeQuantity({
        remainingQuantity: 5,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 5,
        localCurrentRecordReservedQuantity: 5
      })
    ).toBe(0);
    expect(
      computeOptimisticRowMaxQuantity({
        remainingQuantity: 5,
        reservedQuantity: 5,
        serverCurrentRecordReservedQuantity: 5,
        localCurrentRecordReservedQuantity: 5,
        currentRowQuantity: 2
      })
    ).toBe(2);
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

  it('parses finite values safely', () => {
    expect(toFiniteNumberValue('12,5')).toBe(12.5);
    expect(toFiniteNumberValue('')).toBe(0);
    expect(toFiniteNumberValue(undefined)).toBe(0);
  });
});
