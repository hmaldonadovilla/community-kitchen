import { buildDraftPayload, buildSubmissionPayload } from '../../../src/web/react/app/submission';
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
});
