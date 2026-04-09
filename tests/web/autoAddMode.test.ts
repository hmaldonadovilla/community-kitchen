import { reconcileAutoAddModeGroups } from '../../src/web/react/app/autoAddModeOverlay';

describe('reconcileAutoAddModeGroups', () => {
  it('rebuilds cleared top-level auto rows from updated dependency values', () => {
    const definition = {
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            addMode: 'auto',
            anchorFieldId: 'MEAL_TYPE',
            fields: [
              {
                id: 'MEAL_TYPE',
                type: 'CHOICE',
                options: ['Vegetarian', 'Vegan', 'Diabetic', 'No-salt', 'Standard'],
                optionFilter: {
                  dependsOn: ['MP_DISTRIBUTOR', 'MP_SERVICE', 'MP_PREP_DATE'],
                  optionMap: {
                    'Belliard||Lunch': ['Vegetarian', 'Vegan', 'Diabetic', 'No-salt'],
                    'Belliard||Dinner': ['Vegetarian', 'Vegan', 'Diabetic', 'No-salt', 'Standard'],
                    '*': ['Vegetarian']
                  }
                }
              }
            ]
          }
        }
      ]
    } as any;

    const result = reconcileAutoAddModeGroups({
      definition,
      values: {
        MP_DISTRIBUTOR: 'Belliard',
        MP_SERVICE: 'Dinner',
        MP_PREP_DATE: '2026-04-09'
      } as any,
      lineItems: {
        MP_MEALS_REQUEST: []
      } as any,
      optionState: {},
      language: 'EN',
      ensureLineOptions: jest.fn()
    });

    expect(result.changed).toBe(true);
    expect((result.lineItems.MP_MEALS_REQUEST || []).map((row: any) => row.values.MEAL_TYPE)).toEqual([
      'Diabetic',
      'No-salt',
      'Standard',
      'Vegan',
      'Vegetarian'
    ]);
  });
});
