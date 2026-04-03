import { matchesDataSourceRowToParent } from '../../../src/web/react/components/form/dataSourceRowMatching';

describe('matchesDataSourceRowToParent', () => {
  test('matches exact values by default', () => {
    expect(
      matchesDataSourceRowToParent({
        item: { DIETARY_APPLICABILITY: 'Vegetarian' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Vegetarian'
      })
    ).toBe(true);

    expect(
      matchesDataSourceRowToParent({
        item: { DIETARY_APPLICABILITY: 'Vegan' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Vegetarian'
      })
    ).toBe(false);
  });

  test('matches delimited values when configured', () => {
    expect(
      matchesDataSourceRowToParent({
        item: { DIETARY_APPLICABILITY: 'Vegetarian, Vegan, Standard' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Vegan',
        mode: 'includesDelimited',
        delimiter: ','
      })
    ).toBe(true);

    expect(
      matchesDataSourceRowToParent({
        item: { DIETARY_APPLICABILITY: 'Vegetarian / Diabetic' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Diabetic',
        mode: 'includesDelimited',
        delimiter: ','
      })
    ).toBe(true);
  });

  test('treats missing source applicability as unrestricted', () => {
    expect(
      matchesDataSourceRowToParent({
        item: { LEFTOVER_MEAL_TYPE: 'Vegetarian' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Vegetarian',
        mode: 'includesDelimited',
        delimiter: ','
      })
    ).toBe(true);

    expect(
      matchesDataSourceRowToParent({
        item: { LEFTOVER_MEAL_TYPE: 'Standard' },
        sourceMatchFieldId: 'DIETARY_APPLICABILITY',
        parentValue: 'Vegan',
        mode: 'includesDelimited',
        delimiter: ','
      })
    ).toBe(true);
  });
});
