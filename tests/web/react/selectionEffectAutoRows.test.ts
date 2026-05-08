import { resolveStableSelectionEffectContextId } from '../../../src/web/react/app/selectionEffectAutoRows';

describe('selection effect auto-row context stability', () => {
  it('keeps the named effect context when a later rebuild proposes the generic field context for the same parent row', () => {
    const parentGroupId = 'MP_MEALS_REQUEST::meal_1::MP_TYPE_LI';
    const parentRowId = 'type_1';

    expect(
      resolveStableSelectionEffectContextId({
        nextContextId: `${parentGroupId}::${parentRowId}::RECIPE`,
        existingContextId: `${parentGroupId}::${parentRowId}::syncRecipeIngredientsFromSource`,
        effectId: 'syncRecipeIngredientsFromSource',
        parentGroupId,
        parentRowId
      })
    ).toBe(`${parentGroupId}::${parentRowId}::syncRecipeIngredientsFromSource`);
  });

  it('allows canonical named contexts to replace unrelated legacy contexts', () => {
    expect(
      resolveStableSelectionEffectContextId({
        nextContextId: 'MEALS::meal_1::syncRecipeIngredientsFromSource',
        existingContextId: 'previous-render-context::syncRecipeIngredientsFromSource',
        effectId: 'syncRecipeIngredientsFromSource',
        parentGroupId: 'MEALS',
        parentRowId: 'meal_1'
      })
    ).toBe('MEALS::meal_1::syncRecipeIngredientsFromSource');
  });

  it('keeps normal context changes when the next context is already a named effect context', () => {
    expect(
      resolveStableSelectionEffectContextId({
        nextContextId: 'MEALS::meal_1::syncRecipeIngredientsFromSource',
        existingContextId: 'MEALS::meal_1::RECIPE',
        effectId: 'syncRecipeIngredientsFromSource',
        parentGroupId: 'MEALS',
        parentRowId: 'meal_1'
      })
    ).toBe('MEALS::meal_1::syncRecipeIngredientsFromSource');
  });
});
