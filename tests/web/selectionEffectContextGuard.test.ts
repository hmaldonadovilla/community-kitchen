import { resolveSelectionEffectContextGuardFieldIds } from '../../src/web/effects/selectionEffectContextGuard';

describe('selection effect context guard fields', () => {
  it('collects source, multiplier, lookup source, and when fields', () => {
    const fields = resolveSelectionEffectContextGuardFieldIds(
      {
        id: 'syncRecipeIngredientsFromSource',
        type: 'addLineItemsFromDataSource',
        lookupSourceFieldId: 'RECIPE_SOURCE_ID',
        rowMultiplierFieldId: 'PREP_QTY',
        when: {
          all: [
            { fieldId: 'MP_TO_COOK', greaterThan: 0 },
            { any: [{ fieldId: 'PREP_TYPE', equals: ['Cook'] }] }
          ]
        },
        sourceSync: {
          stopWhen: { fieldId: 'status', equals: 'Closed' }
        }
      } as any,
      { id: 'RECIPE' } as any
    );

    expect(fields).toEqual(['RECIPE', 'RECIPE_SOURCE_ID', 'PREP_QTY', 'MP_TO_COOK', 'PREP_TYPE', 'status']);
  });

  it('does not use transient row metadata as a guard field', () => {
    const fields = resolveSelectionEffectContextGuardFieldIds(
      {
        type: 'setValuesFromDataSource',
        lookupSourceFieldId: '__ckRowId',
        when: { fieldId: '__ckSelectionEffectId', equals: 'effect-1' }
      } as any,
      { id: 'ING' } as any
    );

    expect(fields).toEqual(['ING']);
  });
});
