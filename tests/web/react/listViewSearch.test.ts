import {
  normalizeToIsoDateLocal,
  resolveInitialListSearchValue,
  resolveOldestPrefetchedIsoDate,
  shouldClearAppliedQueryOnInputClear,
  shouldUseServerDateSearch
} from '../../../src/web/react/app/listViewSearch';

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

  it('keeps the applied query when clearing the input in date mode', () => {
    expect(shouldClearAppliedQueryOnInputClear('date')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear('DATE')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear('text')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear('advanced')).toBe(false);
    expect(shouldClearAppliedQueryOnInputClear(undefined)).toBe(false);
  });

  it('resolves the oldest prefetched date for a list field', () => {
    expect(
      resolveOldestPrefetchedIsoDate(
        [
          { MP_PREP_DATE: '2026-03-09' },
          { MP_PREP_DATE: '2026-03-08' },
          { MP_PREP_DATE: '2026-02-27' }
        ],
        'MP_PREP_DATE'
      )
    ).toBe('2026-02-27');
  });

  it('uses local date search when the full dataset is already loaded', () => {
    expect(
      shouldUseServerDateSearch({
        queryDate: '2026-02-27',
        fieldId: 'MP_PREP_DATE',
        items: [{ MP_PREP_DATE: '2026-02-27' }],
        loadedCount: 100,
        totalCount: 100,
        completeData: true
      })
    ).toBe(false);
  });

  it('uses server date search for the oldest currently prefetched date', () => {
    expect(
      shouldUseServerDateSearch({
        queryDate: '2026-02-27',
        fieldId: 'MP_PREP_DATE',
        items: [
          { MP_PREP_DATE: '2026-03-09' },
          { MP_PREP_DATE: '2026-03-08' },
          { MP_PREP_DATE: '2026-02-27' }
        ],
        loadedCount: 200,
        totalCount: 250,
        completeData: false
      })
    ).toBe(true);
  });

  it('uses local date search for dates newer than the oldest prefetched date', () => {
    expect(
      shouldUseServerDateSearch({
        queryDate: '2026-03-08',
        fieldId: 'MP_PREP_DATE',
        items: [
          { MP_PREP_DATE: '2026-03-09' },
          { MP_PREP_DATE: '2026-03-08' },
          { MP_PREP_DATE: '2026-02-27' }
        ],
        loadedCount: 200,
        totalCount: 250,
        completeData: false
      })
    ).toBe(false);
  });

  it('uses server date search when later pages are loaded after a gap but the contiguous prefix stops at a newer date', () => {
    expect(
      shouldUseServerDateSearch({
        queryDate: '2026-02-27',
        fieldId: 'MP_PREP_DATE',
        items: [
          { MP_PREP_DATE: '2026-03-09' },
          { MP_PREP_DATE: '2026-03-08' },
          { MP_PREP_DATE: '2026-02-28' }
        ],
        loadedCount: 28,
        totalCount: 100,
        completeData: false
      })
    ).toBe(true);
  });

  it('resolves a relative today initial value for date search', () => {
    expect(
      resolveInitialListSearchValue(
        {
          mode: 'date',
          initialValue: { relativeDate: 'today' }
        },
        new Date(2026, 3, 7)
      )
    ).toBe('2026-04-07');
  });

  it('normalizes explicit date initial values for date search', () => {
    expect(
      resolveInitialListSearchValue({
        mode: 'date',
        initialValue: { value: '2026-04-07T12:00:00.000Z' }
      })
    ).toBeTruthy();
  });

  it('keeps explicit text initial values unchanged for text search', () => {
    expect(
      resolveInitialListSearchValue({
        mode: 'text',
        initialValue: 'Closed'
      })
    ).toBe('Closed');
  });
});
