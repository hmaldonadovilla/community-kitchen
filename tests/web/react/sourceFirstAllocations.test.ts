import {
  decorateSourceFirstAllocationRowForVisibility,
  filterSourceFirstAllocationRows,
  resolveSourceFirstAllocationLabelVisibility,
  resolveSourceFirstRowSortMode,
  shouldRemoveSourceFirstAllocationOutputWhenExcluded,
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

  it('defaults source-first row sorting to datasource order', () => {
    expect(resolveSourceFirstRowSortMode(undefined)).toBe('source');
    expect(resolveSourceFirstRowSortMode('')).toBe('source');
    expect(resolveSourceFirstRowSortMode('unknown')).toBe('source');
  });

  it('accepts alphabetical as an explicit source-first row sort override', () => {
    expect(resolveSourceFirstRowSortMode('alphabetical')).toBe('alphabetical');
    expect(resolveSourceFirstRowSortMode(' ALPHABETICAL ')).toBe('alphabetical');
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

  it('filters source rows against top-level and parent-level when clauses', () => {
    const rows = [
      { LEFTOVER_ID: 'MI-1', LEFTOVER_EXP_DATE: '2026-04-17', DIETARY_APPLICABILITY: 'Vegan, Standard' },
      { LEFTOVER_ID: 'MI-2', LEFTOVER_EXP_DATE: '2026-04-15', DIETARY_APPLICABILITY: 'Standard' }
    ];

    expect(
      filterSourceFirstAllocationRows({
        rows,
        sourceRowsConfig: {
          includeWhen: { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' }
        },
        topValues: { MP_PREP_DATE: '2026-04-16' }
      }).map(row => row.LEFTOVER_ID)
    ).toEqual(['MI-1']);

    expect(
      filterSourceFirstAllocationRows({
        rows,
        sourceRowsConfig: {
          includeWhen: { fieldId: 'DIETARY_APPLICABILITY', equals: ['Vegan, Standard'] }
        },
        parentValues: { MEAL_TYPE: 'Vegan' },
        topValues: { MP_PREP_DATE: '2026-04-16' }
      }).map(row => row.LEFTOVER_ID)
    ).toEqual(['MI-1']);
  });

  it('hides rows that have no free quantity and are not reserved by the current record', () => {
    const rows = [
      { LEFTOVER_ID: 'MI-1', LEFTOVER_EXP_DATE: '2026-04-17', __ckCurrentRecordReservedQuantity: 0, __ckFreeQuantity: 0 },
      { LEFTOVER_ID: 'MI-2', LEFTOVER_EXP_DATE: '2026-04-17', __ckCurrentRecordReservedQuantity: 0, __ckFreeQuantity: 2 }
    ];

    expect(
      filterSourceFirstAllocationRows({
        rows,
        sourceRowsConfig: {
          includeWhen: {
            all: [
              { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' },
              {
                any: [
                  { fieldId: '__ckCurrentRecordReservedQuantity', greaterThan: 0 },
                  { fieldId: '__ckFreeQuantity', greaterThan: 0 }
                ]
              }
            ]
          }
        },
        topValues: { MP_PREP_DATE: '2026-04-16' }
      }).map(row => row.LEFTOVER_ID)
    ).toEqual(['MI-2']);
  });

  it('keeps rows visible when the current record already reserves them', () => {
    const decorated = decorateSourceFirstAllocationRowForVisibility({
      row: {
        LEFTOVER_ID: 'MI-1',
        LEFTOVER_EXP_DATE: '2026-04-17',
        LEFTOVER_PORTIONS: 12,
        LEFTOVER_RESERVED_PORTIONS: 12
      },
      availabilityConfig: {
        sourcePortionsFieldId: 'LEFTOVER_PORTIONS',
        sourceReservedPortionsFieldId: 'LEFTOVER_RESERVED_PORTIONS'
      },
      localCurrentRecordReservedQuantity: 4,
      committedCurrentRecordReservedQuantity: 4
    });

    expect(decorated.__ckCurrentRecordReservedQuantity).toBe(4);
    expect(decorated.__ckFreeQuantity).toBe(0);
    expect(
      filterSourceFirstAllocationRows({
        rows: [decorated],
        sourceRowsConfig: {
          includeWhen: {
            all: [
              { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' },
              {
                any: [
                  { fieldId: '__ckCurrentRecordReservedQuantity', greaterThan: 0 },
                  { fieldId: '__ckFreeQuantity', greaterThan: 0 }
                ]
              }
            ]
          }
        },
        topValues: { MP_PREP_DATE: '2026-04-16' }
      })
    ).toHaveLength(1);
  });

  it('recognizes configs that should clear outputs when source rows become ineligible', () => {
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({ sourceRows: { removeOutputWhenExcluded: true } })).toBe(true);
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({ sourceRows: { removeOutputWhenExcluded: false } })).toBe(false);
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({})).toBe(false);
  });
});
