import { resolveOverlayDetailErrors } from '../../../src/web/react/features/overlays/domain/overlayDetailValidation';

describe('resolveOverlayDetailErrors', () => {
  test('uses subgroup overlay validation for nested detail rows before fallback validation', () => {
    const errorGroupKey = 'MP_MEALS_REQUEST::meal_1::MP_TYPE_LI::cook_1::MP_INGREDIENTS_LI';

    const errors = resolveOverlayDetailErrors({
      errorGroupKey,
      lineOverlayOpen: false,
      lineOverlayGroupId: '',
      subgroupOverlayOpen: true,
      subgroupOverlaySubKey: 'MP_MEALS_REQUEST::meal_1::MP_TYPE_LI',
      lineOverlayErrors: null,
      subgroupOverlayErrors: {
        [`${errorGroupKey}__QTY__ing_1`]: 'Please enter the quantity',
        [`${errorGroupKey}__UNIT__ing_1`]: 'Please select a unit',
        OTHER: 'ignore'
      },
      fallbackErrors: {}
    });

    expect(errors).toEqual({
      [`${errorGroupKey}__QTY__ing_1`]: 'Please enter the quantity',
      [`${errorGroupKey}__UNIT__ing_1`]: 'Please select a unit'
    });
  });

  test('falls back only when the detail group is outside the active overlay scope', () => {
    const errorGroupKey = 'MP_MEALS_REQUEST::meal_1::MP_TYPE_LI::cook_1::MP_INGREDIENTS_LI';

    const errors = resolveOverlayDetailErrors({
      errorGroupKey,
      lineOverlayOpen: false,
      lineOverlayGroupId: '',
      subgroupOverlayOpen: false,
      subgroupOverlaySubKey: '',
      lineOverlayErrors: null,
      subgroupOverlayErrors: null,
      fallbackErrors: {
        [`${errorGroupKey}__UNIT__ing_1`]: 'Fallback unit error'
      }
    });

    expect(errors).toEqual({
      [`${errorGroupKey}__UNIT__ing_1`]: 'Fallback unit error'
    });
  });
});
