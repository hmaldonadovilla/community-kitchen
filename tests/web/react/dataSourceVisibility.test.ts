import {
  DATA_SOURCE_COUNT_FIELD_PREFIX,
  buildDataSourceConfigLookup,
  filterDataSourceFreshnessWatchesByDataSourceIds,
  normalizeDataSourceVisibilityKey,
  resolveDataSourceConfigById
} from '../../../src/web/react/app/dataSourceVisibility';

describe('dataSourceVisibility', () => {
  it('normalizes data-source ids for case and punctuation-insensitive matching', () => {
    expect(normalizeDataSourceVisibilityKey(' Leftover Bank Data ')).toBe('leftoverbankdata');
    expect(normalizeDataSourceVisibilityKey('leftover_bank-data')).toBe('leftoverbankdata');
    expect(normalizeDataSourceVisibilityKey('')).toBe('');
  });

  it('keeps the configured synthetic count field prefix stable', () => {
    expect(DATA_SOURCE_COUNT_FIELD_PREFIX).toBe('__ckDataSourceCount.');
  });

  it('builds exact and normalized config lookups without replacing first matches', () => {
    const first = { id: 'Leftover Bank Data', sheet: 'leftovers' };
    const duplicate = { id: 'leftover-bank-data', sheet: 'duplicate' };
    const recipes = { id: 'Recipes Data', sheet: 'recipes' };

    const lookup = buildDataSourceConfigLookup([first, duplicate, recipes]);

    expect(lookup.byExact.get('Leftover Bank Data')).toBe(first);
    expect(lookup.byExact.get('Recipes Data')).toBe(recipes);
    expect(lookup.byNormalized.get('leftoverbankdata')).toBe(first);
  });

  it('resolves configs by exact id or normalized id', () => {
    const configs = [
      { id: 'Leftover Bank Data', sheet: 'leftovers' },
      { id: 'Recipes Data', sheet: 'recipes' }
    ];

    expect(resolveDataSourceConfigById(configs, 'Recipes Data')).toEqual({ id: 'Recipes Data', sheet: 'recipes' });
    expect(resolveDataSourceConfigById(configs, 'leftover-bank-data')).toEqual({
      id: 'Leftover Bank Data',
      sheet: 'leftovers'
    });
    expect(resolveDataSourceConfigById(configs, '')).toBeNull();
  });

  it('filters freshness watches by touched data-source ids', () => {
    const watches = [
      { key: 'leftovers', dataSourceIds: ['Leftover Bank Data'] },
      { key: 'recipes', dataSourceIds: ['Recipes Data'] }
    ];

    expect(filterDataSourceFreshnessWatchesByDataSourceIds(watches, ['leftover-bank-data'])).toEqual([
      watches[0]
    ]);
    expect(filterDataSourceFreshnessWatchesByDataSourceIds(watches, [])).toEqual(watches);
  });
});
