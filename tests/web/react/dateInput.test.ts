import { isDateInputValueWithinBounds, resolveDateInputBound } from '../../../src/web/react/components/form/dateInputBounds';

describe('DateInput helpers', () => {
  test('resolves today bounds to the local YYYY-MM-DD date', () => {
    expect(resolveDateInputBound('today', new Date(2026, 3, 11))).toBe('2026-04-11');
  });

  test('keeps explicit YYYY-MM-DD bounds unchanged', () => {
    expect(resolveDateInputBound('2026-04-15', new Date(2026, 3, 11))).toBe('2026-04-15');
  });

  test('rejects values outside the configured bounds', () => {
    expect(isDateInputValueWithinBounds('2026-04-10', { min: '2026-04-11' })).toBe(false);
    expect(isDateInputValueWithinBounds('2026-04-12', { min: '2026-04-11', max: '2026-04-20' })).toBe(true);
    expect(isDateInputValueWithinBounds('2026-04-21', { max: '2026-04-20' })).toBe(false);
  });
});
