import {
  decorateSourceFirstAllocationRowForVisibility,
  filterSourceFirstAllocationRows,
  resolveSourceFirstAllocationDisplayFreeQuantity,
  resolveSourceFirstAllocationUtilisationVisibilityScope,
  resolveSourceFirstAllocationLabelVisibility,
  resolveSourceFirstRowSortMode,
  shouldPreserveSourceFirstAllocationOutputWhenExcluded,
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

  it('hides rows that have no free quantity and are not utilised by the current record', () => {
    const rows = [
      { LEFTOVER_ID: 'MI-1', LEFTOVER_EXP_DATE: '2026-04-17', __ckCurrentRecordUtilisedQuantity: 0, __ckFreeQuantity: 0 },
      { LEFTOVER_ID: 'MI-2', LEFTOVER_EXP_DATE: '2026-04-17', __ckCurrentRecordUtilisedQuantity: 0, __ckFreeQuantity: 2 }
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
                  { fieldId: '__ckCurrentRecordUtilisedQuantity', greaterThan: 0 },
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

  it('keeps rows visible when the current record already uses them', () => {
    const decorated = decorateSourceFirstAllocationRowForVisibility({
      row: {
        LEFTOVER_ID: 'MI-1',
        LEFTOVER_EXP_DATE: '2026-04-17',
        LEFTOVER_PORTIONS: 12
      },
      availabilityConfig: {
        sourcePortionsFieldId: 'LEFTOVER_PORTIONS'
      },
      localCurrentRecordUtilisedQuantity: 4,
      committedCurrentRecordUtilisedQuantity: 4
    });

    expect(decorated.__ckCurrentRecordUtilisedQuantity).toBe(4);
    expect(decorated.__ckFreeQuantity).toBe(12);
    expect(
      filterSourceFirstAllocationRows({
        rows: [decorated],
        sourceRowsConfig: {
          includeWhen: {
            all: [
              { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' },
              {
                any: [
                  { fieldId: '__ckCurrentRecordUtilisedQuantity', greaterThan: 0 },
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

  it('uses the full current-record utilisation total for parent-scoped source rows', () => {
    expect(
      resolveSourceFirstAllocationUtilisationVisibilityScope({
        localTotalUtilisedQuantity: 5,
        committedTotalUtilisedQuantity: 4
      })
    ).toEqual({
      localCurrentRecordUtilisedQuantity: 5,
      committedCurrentRecordUtilisedQuantity: 4
    });
  });

  it('updates visible free stock from local drafts while preserving other-record utilisations', () => {
    const decorated = decorateSourceFirstAllocationRowForVisibility({
      row: {
        LEFTOVER_ID: 'MI-20',
        LEFTOVER_PORTIONS: 0,
        __ckCurrentRecordUtilisedQuantity: 11
      },
      availabilityConfig: {
        sourcePortionsFieldId: 'LEFTOVER_PORTIONS'
      },
      localCurrentRecordUtilisedQuantity: 10,
      committedCurrentRecordUtilisedQuantity: 11
    });

    expect(decorated.__ckCurrentRecordUtilisedQuantity).toBe(10);
    expect(decorated.__ckServerCurrentRecordUtilisedQuantity).toBe(11);
    expect(decorated.__ckFreeQuantity).toBe(1);
  });

  it('does not double-count local quantities already included in an optimistic bank quantity', () => {
    const decorated = decorateSourceFirstAllocationRowForVisibility({
      row: {
        LEFTOVER_ID: 'MI-20',
        LEFTOVER_PORTIONS: 6,
        __ckServerCurrentRecordUtilisedQuantity: 5,
        __ckCurrentRecordUtilisedQuantity: 5
      },
      availabilityConfig: {
        sourcePortionsFieldId: 'LEFTOVER_PORTIONS'
      },
      localCurrentRecordUtilisedQuantity: 5,
      committedCurrentRecordUtilisedQuantity: 2
    });

    expect(decorated.__ckServerCurrentRecordUtilisedQuantity).toBe(5);
    expect(decorated.__ckCurrentRecordUtilisedQuantity).toBe(5);
    expect(decorated.__ckFreeQuantity).toBe(6);
  });

  it('uses explicit server free quantity after local and server utilisations agree', () => {
    expect(
      resolveSourceFirstAllocationDisplayFreeQuantity({
        remainingQuantity: 6,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 5,
        explicitFreeQuantity: 6
      })
    ).toBe(6);
  });

  it('recomputes free quantity while local utilisation edits are ahead of the server snapshot', () => {
    expect(
      resolveSourceFirstAllocationDisplayFreeQuantity({
        remainingQuantity: 6,
        serverCurrentRecordUtilisedQuantity: 5,
        localCurrentRecordUtilisedQuantity: 10,
        explicitFreeQuantity: 6
      })
    ).toBe(1);
  });

  it('uses authoritative server free quantity without recomputing against local utilisation', () => {
    expect(
      resolveSourceFirstAllocationDisplayFreeQuantity({
        remainingQuantity: 0,
        serverCurrentRecordUtilisedQuantity: 8,
        localCurrentRecordUtilisedQuantity: 0,
        explicitFreeQuantity: 3,
        forceExplicitFreeQuantity: true
      })
    ).toBe(3);
  });

  it('keeps server and local current-record utilisations separate during release drafts', () => {
    const decorated = decorateSourceFirstAllocationRowForVisibility({
      row: {
        LEFTOVER_ID: 'MI-20',
        LEFTOVER_PORTIONS: 0,
        __ckServerCurrentRecordUtilisedQuantity: 11,
        __ckCurrentRecordUtilisedQuantity: 1
      },
      availabilityConfig: {
        sourcePortionsFieldId: 'LEFTOVER_PORTIONS'
      },
      localCurrentRecordUtilisedQuantity: 0,
      committedCurrentRecordUtilisedQuantity: 11
    });

    expect(decorated.__ckServerCurrentRecordUtilisedQuantity).toBe(11);
    expect(decorated.__ckCurrentRecordUtilisedQuantity).toBe(0);
    expect(decorated.__ckFreeQuantity).toBe(11);
  });

  it('recognizes configs that should clear outputs when source rows become ineligible', () => {
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({ sourceRows: { removeOutputWhenExcluded: true } })).toBe(true);
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({ sourceRows: { removeOutputWhenExcluded: false } })).toBe(false);
    expect(shouldRemoveSourceFirstAllocationOutputWhenExcluded({})).toBe(false);
  });

  it('preserves active managed utilisation outputs when datasource rows become temporarily excluded', () => {
    const config = {
      rowKeyFieldId: 'LEFTOVER_ID',
      outputKeyFieldId: 'LEFTOVER_ID',
      quantityFieldId: 'LEFTOVER_USE_QTY',
      selectedFieldId: 'LEFTOVER_SELECTED',
      utilisation: {
        enabled: true,
        resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
      }
    };

    expect(
      shouldPreserveSourceFirstAllocationOutputWhenExcluded({
        config,
        outputRow: {
          values: {
            LEFTOVER_ID: 'SI-6',
            LEFTOVER_RECORD_ID: 'leftover-record-1',
            LEFTOVER_USE_QTY: 3
          }
        }
      })
    ).toBe(true);
  });

  it('prevents post-save datasource exclusion cleanup from releasing an active utilisation', () => {
    const config = {
      rowKeyFieldId: 'LEFTOVER_ID',
      outputKeyFieldId: 'LEFTOVER_ID',
      quantityFieldId: 'LEFTOVER_USE_QTY',
      selectedFieldId: 'LEFTOVER_SELECTED',
      sourceRows: { removeOutputWhenExcluded: true },
      utilisation: {
        enabled: true,
        resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
      }
    };
    const outputRow = {
      values: {
        LEFTOVER_ID: 'SI-6',
        LEFTOVER_RECORD_ID: 'leftover::meal-1::partial::row-1',
        LEFTOVER_USE_QTY: 3
      }
    };
    const eligibleSourceKeys = new Set<string>();
    const sourceKey = `${outputRow.values.LEFTOVER_ID}`.trim();

    const wouldCleanupOutput =
      shouldRemoveSourceFirstAllocationOutputWhenExcluded(config) &&
      !eligibleSourceKeys.has(sourceKey) &&
      !shouldPreserveSourceFirstAllocationOutputWhenExcluded({ config, outputRow });

    expect(wouldCleanupOutput).toBe(false);
  });

  it('infers the utilisation record id field for legacy source-first configs', () => {
    const config = {
      rowKeyFieldId: 'LEFTOVER_ID',
      outputKeyFieldId: 'LEFTOVER_ID',
      quantityFieldId: 'LEFTOVER_USE_QTY',
      utilisation: {
        enabled: true
      }
    };

    expect(
      shouldPreserveSourceFirstAllocationOutputWhenExcluded({
        config,
        outputRow: {
          values: {
            LEFTOVER_ID: 'SI-6',
            LEFTOVER_RECORD_ID: 'leftover-record-1',
            LEFTOVER_USE_QTY: 3
          }
        }
      })
    ).toBe(true);
  });

  it('does not preserve inactive utilisation outputs during datasource exclusion cleanup', () => {
    const config = {
      rowKeyFieldId: 'LEFTOVER_ID',
      outputKeyFieldId: 'LEFTOVER_ID',
      quantityFieldId: 'LEFTOVER_USE_QTY',
      selectedFieldId: 'LEFTOVER_SELECTED',
      utilisation: {
        enabled: true,
        resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
      }
    };

    expect(
      shouldPreserveSourceFirstAllocationOutputWhenExcluded({
        config,
        outputRow: {
          values: {
            LEFTOVER_ID: 'SI-6',
            LEFTOVER_RECORD_ID: 'leftover-record-1',
            LEFTOVER_SELECTED: false,
            LEFTOVER_USE_QTY: 3
          }
        }
      })
    ).toBe(false);
    expect(
      shouldPreserveSourceFirstAllocationOutputWhenExcluded({
        config,
        outputRow: {
          values: {
            LEFTOVER_ID: 'SI-6',
            LEFTOVER_RECORD_ID: 'leftover-record-1',
            LEFTOVER_USE_QTY: 0
          }
        }
      })
    ).toBe(false);
  });
});
