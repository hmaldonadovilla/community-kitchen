import { formatDateEeeDdMmmYyyy, formatDisplayText, localizeOptionValue } from '../../../src/web/react/utils/valueDisplay';

describe('valueDisplay', () => {
  test('localizeOptionValue maps EN value to localized label by index', () => {
    const optionSet = { en: ['Lunch', 'Dinner'], fr: ['Midi', 'Soir'], nl: ['Lunch', 'Diner'] };
    expect(localizeOptionValue('Lunch', optionSet as any, 'FR')).toBe('Midi');
    expect(localizeOptionValue('Dinner', optionSet as any, 'NL')).toBe('Diner');
  });

  test('formatDateEeeDdMmmYyyy formats date with localized month names', () => {
    const fr = formatDateEeeDdMmmYyyy('2025-12-24', 'FR');
    expect(fr).toContain('déc.');
    expect(fr).toContain('2025');
  });

  test('formatDisplayText localizes booleans', () => {
    expect(formatDisplayText(true, { language: 'FR' })).toBe('Oui');
    expect(formatDisplayText(false, { language: 'NL' })).toBe('Nee');
  });
});


