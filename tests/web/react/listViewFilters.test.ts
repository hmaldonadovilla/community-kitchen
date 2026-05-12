import {
  filterItemsByWhenClause,
  filterItemsForSearchPreset,
  resolveSearchPresetDateFilter,
  shouldClearSearchOnOverlayPresetClose,
  shouldShowSearchPresetInMode,
  whenClauseContainsTodayFilter
} from '../../../src/web/react/app/listViewFilters';

describe('listViewFilters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-04T10:30:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('applies default when clauses against prefetched rows', () => {
    const items = [
      { id: '1', MP_PREP_DATE: '2026-02-04' },
      { id: '2', MP_PREP_DATE: '2026-02-03' }
    ] as any[];

    expect(filterItemsByWhenClause(items as any, { fieldId: 'MP_PREP_DATE', isToday: true } as any, new Date())).toEqual([
      { id: '1', MP_PREP_DATE: '2026-02-04' }
    ]);
  });

  it('detects today filters nested inside when clauses', () => {
    expect(
      whenClauseContainsTodayFilter(
        {
          all: [
            { fieldId: 'status', notEquals: 'Closed' },
            { any: [{ fieldId: 'MP_PREP_DATE', isToday: true }] }
          ]
        } as any,
        'MP_PREP_DATE'
      )
    ).toBe(true);
  });

  it('defaults preset buttons to cards mode only', () => {
    expect(shouldShowSearchPresetInMode(undefined, 'cards')).toBe(true);
    expect(shouldShowSearchPresetInMode(undefined, 'table')).toBe(false);
    expect(shouldShowSearchPresetInMode({ showIn: ['table'] }, 'table')).toBe(true);
  });

  it('detects overlay presets that should clear search on close', () => {
    expect(shouldClearSearchOnOverlayPresetClose({ overlay: { clearSearchOnClose: true } } as any)).toBe(true);
    expect(shouldClearSearchOnOverlayPresetClose({ overlay: { clearSearchOnClose: false } } as any)).toBe(false);
    expect(shouldClearSearchOnOverlayPresetClose(null)).toBe(false);
  });

  it('filters preset results using lookback days and includeToday false', () => {
    const items = [
      { id: '1', MP_PREP_DATE: '2026-02-04', MP_DISTRIBUTOR: 'Belliard' },
      { id: '2', MP_PREP_DATE: '2026-02-03', MP_DISTRIBUTOR: 'Belliard' },
      { id: '3', MP_PREP_DATE: '2026-01-28', MP_DISTRIBUTOR: 'HUB' },
      { id: '4', MP_PREP_DATE: '2026-01-27', MP_DISTRIBUTOR: 'Le Phare' }
    ] as any[];

    const filtered = filterItemsForSearchPreset({
      items: items as any,
      preset: {
        action: 'listViewSearchPreset',
        dateFieldId: 'MP_PREP_DATE',
        lookbackDays: 7,
        includeToday: false
      } as any,
      defaultMode: 'text',
      searchableFieldIds: ['MP_DISTRIBUTOR'],
      keywordFieldIds: ['MP_DISTRIBUTOR'],
      fieldTypeById: {},
      now: new Date()
    });

    expect(filtered.map(item => item.id)).toEqual(['2', '3']);
  });

  it('resolves date-window presets into server-friendly date ranges', () => {
    expect(
      resolveSearchPresetDateFilter({
        preset: {
          action: 'listViewSearchPreset',
          dateFieldId: 'MP_PREP_DATE',
          lookbackDays: 7,
          includeToday: false
        } as any,
        defaultMode: 'text',
        now: new Date()
      })
    ).toEqual({
      fieldId: 'MP_PREP_DATE',
      from: '2026-01-28',
      to: '2026-02-03'
    });
  });

  it('filters preset results using lookahead days from today', () => {
    const items = [
      { id: '1', MP_PREP_DATE: '2026-02-04' },
      { id: '2', MP_PREP_DATE: '2026-02-08' },
      { id: '3', MP_PREP_DATE: '2026-02-12' },
      { id: '4', MP_PREP_DATE: '2026-02-13' },
      { id: '5', MP_PREP_DATE: '2026-02-03' }
    ] as any[];

    const filtered = filterItemsForSearchPreset({
      items: items as any,
      preset: {
        action: 'listViewSearchPreset',
        dateFieldId: 'MP_PREP_DATE',
        lookaheadDays: 8,
        includeToday: true
      } as any,
      defaultMode: 'text',
      searchableFieldIds: [],
      keywordFieldIds: [],
      fieldTypeById: {},
      now: new Date()
    });

    expect(filtered.map(item => item.id)).toEqual(['1', '2', '3']);
  });

  it('filters preset results using lookahead days excluding today', () => {
    const items = [
      { id: '1', MP_PREP_DATE: '2026-02-04' },
      { id: '2', MP_PREP_DATE: '2026-02-05' },
      { id: '3', MP_PREP_DATE: '2026-02-11' },
      { id: '4', MP_PREP_DATE: '2026-02-12' },
      { id: '5', MP_PREP_DATE: '2026-02-13' }
    ] as any[];

    const filtered = filterItemsForSearchPreset({
      items: items as any,
      preset: {
        action: 'listViewSearchPreset',
        dateFieldId: 'MP_PREP_DATE',
        lookaheadDays: 8,
        includeToday: false
      } as any,
      defaultMode: 'text',
      searchableFieldIds: [],
      keywordFieldIds: [],
      fieldTypeById: {},
      now: new Date()
    });

    expect(filtered.map(item => item.id)).toEqual(['2', '3', '4']);
  });
});
