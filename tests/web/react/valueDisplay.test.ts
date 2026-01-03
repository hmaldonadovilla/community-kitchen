import { formatDateEeeDdMmmYyyy, formatDisplayText, localizeOptionValue } from '../../../src/web/react/utils/valueDisplay';
import { toDateInputValue } from '../../../src/web/react/components/form/utils';

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

  test('toDateInputValue normalizes ISO timestamps to local YYYY-MM-DD (prevents -1 day in edit view)', () => {
    // Typical Apps Script serialization of a date-only cell in UTC+1.
    const iso = '2026-01-02T23:00:00.000Z';
    expect(toDateInputValue(iso)).toBe('2026-01-03');
  });

  test('formatDisplayText localizes booleans', () => {
    expect(formatDisplayText(true, { language: 'FR' })).toBe('Oui');
    expect(formatDisplayText(false, { language: 'NL' })).toBe('Nee');
  });
});


