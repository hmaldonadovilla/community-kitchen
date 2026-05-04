/**
 * Normalizes data-source ids for visibility and freshness lookups.
 *
 * Boundary: this module is pure matching logic. It does not fetch data sources,
 * inspect form state, or evaluate visibility rules.
 */
export const DATA_SOURCE_COUNT_FIELD_PREFIX = '__ckDataSourceCount.';

export const normalizeDataSourceVisibilityKey = (value: string): string =>
  (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
