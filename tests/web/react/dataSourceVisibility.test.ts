import {
  DATA_SOURCE_COUNT_FIELD_PREFIX,
  normalizeDataSourceVisibilityKey
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
});
