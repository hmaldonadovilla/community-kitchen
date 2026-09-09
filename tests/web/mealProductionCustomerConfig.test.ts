import fs from 'fs';
import path from 'path';
import { OptionFilter } from '../../src/types';
import { computeAllowedOptions } from '../../src/web/rules/filter';

interface DietaryField {
  id: string;
  options: string[];
  optionFilter: OptionFilter;
}

interface ConfigQuestion {
  id: string;
  lineItemConfig?: { fields: DietaryField[] };
}

const config = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../docs/config/exports/staging/config_meal_production.json'), 'utf8')
) as { questions: ConfigQuestion[]; definition: { questions: ConfigQuestion[] } };

const categories = ['Standard', 'Vegetarian', 'Vegan', 'Diabetic'];

describe.each([
  ['export', config.questions],
  ['definition', config.definition.questions]
] as const)('Meal Production customer dietary rules (%s)', (_label, questions) => {
  const fields = questions
    .flatMap(question => question.lineItemConfig?.fields || [])
    .filter(field => field.id === 'MEAL_TYPE' || field.id === 'LEFTOVER_MEAL_TYPE');

  test('allows Café orders and leftover capture for lunch and dinner throughout the week', () => {
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      for (const service of ['Lunch', 'Dinner']) {
        for (const day of ['07', '08', '09', '10', '11', '12', '13']) {
          const allowed = computeAllowedOptions(
            field.optionFilter,
            { en: field.options, fr: [], nl: [] },
            ['Café', service, `2026-09-${day}`]
          );
          expect(allowed).toEqual(categories);
        }
      }
    }
  });

  test('preserves the existing customer dietary restrictions', () => {
    for (const field of fields) {
      const options = { en: field.options, fr: [], nl: [] };
      for (const customer of ['HUB', 'Le Phare']) {
        expect(computeAllowedOptions(field.optionFilter, options, [customer, 'Lunch', '2026-09-09'])).toEqual([
          'Vegetarian'
        ]);
      }
      expect(computeAllowedOptions(field.optionFilter, options, ['Belliard', 'Lunch', '2026-09-09'])).toEqual([
        'Vegetarian', 'Vegan', 'Diabetic'
      ]);
    }
  });
});
