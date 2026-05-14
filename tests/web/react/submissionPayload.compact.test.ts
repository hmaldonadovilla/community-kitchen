import { buildDraftStateFingerprint } from '../../../src/web/react/app/draftSaveFingerprint';
import {
  buildDraftPayload,
  buildSubmissionPayload,
  collectRuntimeLineItemFieldIds,
  stripRuntimeLineItemStateFields
} from '../../../src/web/react/app/submission';
import { CK_RECIPE_INGREDIENTS_DIRTY_KEY } from '../../../src/web/react/app/recipeIngredientsDirty';

describe('submission payload compaction', () => {
  const definition: any = {
    title: 'Test',
    destinationTab: 'Dest',
    languages: ['EN'],
    questions: []
  };

  test('buildDraftPayload keeps form values under the values envelope only', () => {
    const payload = buildDraftPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: { A: 'Alpha' },
      lineItems: {}
    });

    expect(payload.values).toEqual({ A: 'Alpha' });
    expect((payload as any).A).toBeUndefined();
  });

  test('buildSubmissionPayload keeps form values under the values envelope only', async () => {
    const payload = await buildSubmissionPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: { A: 'Alpha' },
      lineItems: {}
    });

    expect(payload.values).toEqual({ A: 'Alpha' });
    expect((payload as any).A).toBeUndefined();
  });

  test('line item serialization preserves recipe ingredient dirty state', async () => {
    const lineDefinition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [{ id: 'RECIPE', type: 'TEXT' }],
            subGroups: [
              {
                id: 'INGREDIENTS',
                fields: [{ id: 'ING', type: 'TEXT' }]
              }
            ]
          }
        }
      ]
    };
    const lineItems: any = {
      MEALS: [
        {
          id: 'meal_1',
          values: {
            RECIPE: 'Soup',
            [CK_RECIPE_INGREDIENTS_DIRTY_KEY]: true
          }
        }
      ]
    };

    const draft = buildDraftPayload({
      definition: lineDefinition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems
    });
    const submitted = await buildSubmissionPayload({
      definition: lineDefinition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems
    });

    expect(draft.values.MEALS[0][CK_RECIPE_INGREDIENTS_DIRTY_KEY]).toBe(true);
    expect(JSON.parse(draft.values.MEALS_json)[0][CK_RECIPE_INGREDIENTS_DIRTY_KEY]).toBe(true);
    expect(submitted.values.MEALS[0][CK_RECIPE_INGREDIENTS_DIRTY_KEY]).toBe(true);
  });

  test('line item serialization strips utilisation availability runtime fields', async () => {
    const lineDefinition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MEALS',
                dataSourceRows: [
                  {
                    availability: {
                      targetQuantityFieldId: 'LEFTOVER_QTY_AVAILABLE',
                      targetMaxQuantityFieldId: 'LEFTOVER_QTY_MAX',
                      targetPortionsFieldId: 'LEFTOVER_PORTIONS_AVAILABLE',
                      targetMaxPortionsFieldId: 'LEFTOVER_PORTIONS_MAX'
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              { id: 'LEFTOVER_USE_QTY', type: 'NUMBER' },
              { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER' },
              { id: 'LEFTOVER_QTY_MAX', type: 'NUMBER' }
            ]
          }
        }
      ]
    };
    const lineItems: any = {
      MEALS: [
        {
          id: 'meal_1',
          values: {
            LEFTOVER_USE_QTY: 2,
            LEFTOVER_QTY_AVAILABLE: 3,
            LEFTOVER_QTY_MAX: 5,
            __ckCurrentRecordUtilisedQuantity: 2,
            __ckServerCurrentRecordUtilisedQuantity: 2,
            __ckFreeQuantity: 3,
            [CK_RECIPE_INGREDIENTS_DIRTY_KEY]: true
          }
        }
      ]
    };

    const draft = buildDraftPayload({
      definition: lineDefinition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems
    });
    const submitted = await buildSubmissionPayload({
      definition: lineDefinition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems
    });

    expect(draft.values.MEALS[0]).toEqual(
      expect.objectContaining({
        LEFTOVER_USE_QTY: 2,
        __ckRowId: 'meal_1',
        [CK_RECIPE_INGREDIENTS_DIRTY_KEY]: true
      })
    );
    expect(draft.values.MEALS[0].LEFTOVER_QTY_AVAILABLE).toBeUndefined();
    expect(draft.values.MEALS[0].LEFTOVER_QTY_MAX).toBeUndefined();
    expect(draft.values.MEALS[0].__ckCurrentRecordUtilisedQuantity).toBeUndefined();
    expect(draft.values.MEALS[0].__ckServerCurrentRecordUtilisedQuantity).toBeUndefined();
    expect(draft.values.MEALS[0].__ckFreeQuantity).toBeUndefined();
    expect(submitted.values.MEALS[0].LEFTOVER_QTY_MAX).toBeUndefined();
  });

  test('autosave state fingerprints ignore utilisation availability runtime fields', () => {
    const lineDefinition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MEALS',
                dataSourceRows: [
                  {
                    availability: {
                      targetPortionsFieldId: 'LEFTOVER_PORTIONS_AVAILABLE',
                      targetMaxPortionsFieldId: 'LEFTOVER_PORTIONS_MAX'
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      questions: []
    };
    const runtimeFieldIds = collectRuntimeLineItemFieldIds(lineDefinition);
    const first = buildDraftStateFingerprint({
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems: stripRuntimeLineItemStateFields(
        {
          MEALS: [
            {
              id: 'meal_1',
              values: {
                LEFTOVER_ID: 'MI-20',
                LEFTOVER_USE_PORTIONS: 5,
                LEFTOVER_PORTIONS_AVAILABLE: 6,
                LEFTOVER_PORTIONS_MAX: 11,
                __ckFreeQuantity: 6
              }
            }
          ]
        } as any,
        runtimeFieldIds
      )
    });
    const second = buildDraftStateFingerprint({
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems: stripRuntimeLineItemStateFields(
        {
          MEALS: [
            {
              id: 'meal_1',
              values: {
                LEFTOVER_ID: 'MI-20',
                LEFTOVER_USE_PORTIONS: 5,
                LEFTOVER_PORTIONS_AVAILABLE: 7,
                LEFTOVER_PORTIONS_MAX: 12,
                __ckFreeQuantity: 7
              }
            }
          ]
        } as any,
        runtimeFieldIds
      )
    });
    const changedUtilisation = buildDraftStateFingerprint({
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems: stripRuntimeLineItemStateFields(
        {
          MEALS: [
            {
              id: 'meal_1',
              values: {
                LEFTOVER_ID: 'MI-20',
                LEFTOVER_USE_PORTIONS: 6,
                LEFTOVER_PORTIONS_AVAILABLE: 5,
                LEFTOVER_PORTIONS_MAX: 11,
                __ckFreeQuantity: 5
              }
            }
          ]
        } as any,
        runtimeFieldIds
      )
    });

    expect(first).toBe(second);
    expect(first).not.toBe(changedUtilisation);
  });
});
