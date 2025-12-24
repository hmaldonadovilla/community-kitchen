import { resolveValueMapValue } from '../../../src/web/react/components/form/valueMaps';

describe('valueMap localization (Options EN/FR/NL)', () => {
  it('localizes mapped values using the target field option set', () => {
    const valueMap: any = {
      dependsOn: 'ING',
      optionMap: {
        Pesto: ['Sauces', 'Other']
      }
    };
    const targetOptions: any = {
      en: ['Sauces', 'Other'],
      fr: ['Sauces (FR)', 'Autre'],
      nl: ['Saus', 'Andere']
    };
    const out = resolveValueMapValue(valueMap, (id: string) => (id === 'ING' ? 'Pesto' : undefined), {
      language: 'FR',
      targetOptions
    });
    expect(out).toBe('Sauces (FR), Autre');
  });

  it('falls back to the raw mapped value when no label match exists', () => {
    const valueMap: any = {
      dependsOn: 'ING',
      optionMap: {
        Pesto: ['Unknown']
      }
    };
    const targetOptions: any = {
      en: ['Sauces'],
      fr: ['Sauces (FR)'],
      nl: ['Saus']
    };
    const out = resolveValueMapValue(valueMap, (id: string) => (id === 'ING' ? 'Pesto' : undefined), {
      language: 'FR',
      targetOptions
    });
    expect(out).toBe('Unknown');
  });

  it('does not localize when targetOptions/language are not provided', () => {
    const valueMap: any = {
      dependsOn: 'ING',
      optionMap: {
        Pesto: ['Sauces']
      }
    };
    const out = resolveValueMapValue(valueMap, (id: string) => (id === 'ING' ? 'Pesto' : undefined));
    expect(out).toBe('Sauces');
  });
});


