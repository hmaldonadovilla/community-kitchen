import {
  DATA_SOURCE_COUNT_FIELD_PREFIX,
  buildDataSourceConfigLookup,
  filterDataSourceFreshnessWatchesByDataSourceIds,
  normalizeDataSourceVisibilityKey,
  resolveDataSourceConfigById
} from '../../../src/web/react/app/dataSourceVisibility';

describe('dataSourceVisibility', () => {
  it('normalizes data-source ids for case and punctuation-insensitive matching', () => {
    expect(normalizeDataSourceVisibilityKey(' Leftover Inventory Data ')).toBe('leftoverinventorydata');
    expect(normalizeDataSourceVisibilityKey('leftover_inventory-data')).toBe('leftoverinventorydata');
    expect(normalizeDataSourceVisibilityKey('')).toBe('');
  });

  it('keeps the configured synthetic count field prefix stable', () => {
    expect(DATA_SOURCE_COUNT_FIELD_PREFIX).toBe('__ckDataSourceCount.');
  });

  it('builds exact and normalized config lookups without replacing first matches', () => {
    const first = { id: 'Leftover Inventory Data', sheet: 'leftovers' };
    const duplicate = { id: 'leftover-inventory-data', sheet: 'duplicate' };
    const recipes = { id: 'Recipes Data', sheet: 'recipes' };

    const lookup = buildDataSourceConfigLookup([first, duplicate, recipes]);

    expect(lookup.byExact.get('Leftover Inventory Data')).toBe(first);
    expect(lookup.byExact.get('Recipes Data')).toBe(recipes);
    expect(lookup.byNormalized.get('leftoverinventorydata')).toBe(first);
  });

  it('resolves configs by exact id or normalized id', () => {
    const configs = [
      { id: 'Leftover Inventory Data', sheet: 'leftovers' },
      { id: 'Recipes Data', sheet: 'recipes' }
    ];

    expect(resolveDataSourceConfigById(configs, 'Recipes Data')).toEqual({ id: 'Recipes Data', sheet: 'recipes' });
    expect(resolveDataSourceConfigById(configs, 'leftover-inventory-data')).toEqual({
      id: 'Leftover Inventory Data',
      sheet: 'leftovers'
    });
    expect(resolveDataSourceConfigById(configs, '')).toBeNull();
  });

  it('filters freshness watches by touched data-source ids', () => {
    const watches = [
      { key: 'leftovers', dataSourceIds: ['Leftover Inventory Data'] },
      { key: 'recipes', dataSourceIds: ['Recipes Data'] }
    ];

    expect(filterDataSourceFreshnessWatchesByDataSourceIds(watches, ['leftover-inventory-data'])).toEqual([
      watches[0]
    ]);
    expect(filterDataSourceFreshnessWatchesByDataSourceIds(watches, [])).toEqual(watches);
  });
});
