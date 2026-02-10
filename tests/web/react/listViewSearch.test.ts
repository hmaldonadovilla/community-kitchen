import { normalizeToIsoDateLocal, shouldClearAppliedQueryOnInputClear } from '../../../src/web/react/app/listViewSearch';

describe('listViewSearch', () => {
  it('normalizes Date objects to local YYYY-MM-DD', () => {
    expect(normalizeToIsoDateLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns null for empty values', () => {
    expect(normalizeToIsoDateLocal(undefined)).toBeNull();
    expect(normalizeToIsoDateLocal(null)).toBeNull();
    expect(normalizeToIsoDateLocal('')).toBeNull();
    expect(normalizeToIsoDateLocal('   ')).toBeNull();
  });

  it('keeps YYYY-MM-DD prefix stable for date-like strings', () => {
    expect(normalizeToIsoDateLocal('2026-01-05')).toBe('2026-01-05');
  });

  it('parses ISO timestamps into local YYYY-MM-DD (avoids UTC day-shift)', () => {
    const iso = '2026-01-03T23:00:00.000Z';
    const d = new Date(iso);
    const expected = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    expect(normalizeToIsoDateLocal(iso)).toBe(expected);
  });

  it('only clears applied query via clear-input in date mode', () => {
    expect(shouldClearAppliedQueryOnInputClear('date')).toBe(true);
    expect(shouldClearAppliedQueryOnInputClear('DATE')).toBe(true);
    expect(shouldClearAppliedQueryOnInputClear('text')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear('advanced')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear(undefined)).toBe(false);
  });
});

