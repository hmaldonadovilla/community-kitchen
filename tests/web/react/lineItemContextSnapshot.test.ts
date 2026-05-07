import {
  buildLineItemContextSnapshot,
  isLineItemContextSnapshotCurrent
} from '../../../src/web/react/app/lineItemContextSnapshot';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';

describe('line item context snapshots', () => {
  it('merges ancestor row values when checking whether an async effect is still current', () => {
    const prepKey = buildSubgroupKey('MEALS', 'meal-1', 'PREP_ROWS');
    const ingredientsKey = buildSubgroupKey(prepKey, 'cook-1', 'INGREDIENTS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MP_TO_COOK: 425 } }],
      [prepKey]: [{ id: 'cook-1', values: { PREP_QTY: '425', PREP_TYPE: 'Cook' } }],
      [ingredientsKey]: [{ id: 'ing-1', values: { ING: 'Carrot' } }]
    };

    expect(buildLineItemContextSnapshot(lineItems, ingredientsKey, 'ing-1')).toEqual(
      expect.objectContaining({
        ING: 'Carrot',
        PREP_QTY: '425',
        PREP_TYPE: 'Cook',
        MP_TO_COOK: 425
      })
    );
    expect(
      isLineItemContextSnapshotCurrent({
        lineItems,
        groupKey: ingredientsKey,
        rowId: 'ing-1',
        snapshotValues: { ING: 'Carrot', PREP_QTY: 425, MP_TO_COOK: '425' },
        fieldIds: ['ING', 'PREP_QTY', 'MP_TO_COOK']
      })
    ).toBe(true);
  });

  it('marks an async effect stale when a guarded ancestor value has changed', () => {
    const prepKey = buildSubgroupKey('MEALS', 'meal-1', 'PREP_ROWS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MP_TO_COOK: 425 } }],
      [prepKey]: [{ id: 'cook-1', values: { RECIPE: 'Adassi', PREP_QTY: 425 } }]
    };

    expect(
      isLineItemContextSnapshotCurrent({
        lineItems,
        groupKey: prepKey,
        rowId: 'cook-1',
        snapshotValues: { RECIPE: 'Adassi', PREP_QTY: 450, MP_TO_COOK: 450 },
        fieldIds: ['RECIPE', 'PREP_QTY', 'MP_TO_COOK']
      })
    ).toBe(false);
  });
});
