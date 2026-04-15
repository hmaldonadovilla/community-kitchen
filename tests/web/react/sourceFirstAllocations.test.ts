import {
  resolveSourceFirstAllocationLabelVisibility,
  shouldShowSourceFirstAllocationLabel
} from '../../../src/web/react/app/sourceFirstAllocations';

describe('sourceFirstAllocations helpers', () => {
  it('defaults allocation label visibility to multiple', () => {
    expect(resolveSourceFirstAllocationLabelVisibility(undefined)).toBe('multiple');
    expect(resolveSourceFirstAllocationLabelVisibility('')).toBe('multiple');
    expect(resolveSourceFirstAllocationLabelVisibility('unknown')).toBe('multiple');
  });

  it('accepts always as an explicit allocation label visibility override', () => {
    expect(resolveSourceFirstAllocationLabelVisibility('always')).toBe('always');
    expect(resolveSourceFirstAllocationLabelVisibility(' ALWAYS ')).toBe('always');
  });

  it('shows allocation labels only when multiple parent labels exist by default', () => {
    expect(
      shouldShowSourceFirstAllocationLabel({
        allocationLabelFieldId: 'MEAL_TYPE',
        parentRows: [{ values: { MEAL_TYPE: 'Standard' } }]
      })
    ).toBe(false);

    expect(
      shouldShowSourceFirstAllocationLabel({
        allocationLabelFieldId: 'MEAL_TYPE',
        parentRows: [{ values: { MEAL_TYPE: 'Standard' } }, { values: { MEAL_TYPE: 'Vegan' } }]
      })
    ).toBe(true);
  });

  it('keeps allocation labels visible when configured to always show them', () => {
    expect(
      shouldShowSourceFirstAllocationLabel({
        allocationLabelFieldId: 'MEAL_TYPE',
        allocationLabelVisibility: 'always',
        parentRows: [{ values: { MEAL_TYPE: 'Standard' } }]
      })
    ).toBe(true);
  });
});
