/**
 * Normalizes data-source ids for visibility and freshness lookups.
 *
 * Boundary: this module is pure matching logic. It does not fetch data sources,
 * inspect form state, or evaluate visibility rules.
 */
export const DATA_SOURCE_COUNT_FIELD_PREFIX = '__ckDataSourceCount.';

export const normalizeDataSourceVisibilityKey = (value: string): string =>
  (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export type DataSourceConfigLookup<TConfig> = {
  byExact: Map<string, TConfig>;
  byNormalized: Map<string, TConfig>;
};

type DataSourceConfigLike = {
  id?: unknown;
};

type DataSourceFreshnessWatchLike = {
  dataSourceIds?: unknown[];
};

export const buildDataSourceConfigLookup = <TConfig extends DataSourceConfigLike>(
  configs: TConfig[]
): DataSourceConfigLookup<TConfig> => {
  const byExact = new Map<string, TConfig>();
  const byNormalized = new Map<string, TConfig>();
  (Array.isArray(configs) ? configs : []).forEach(cfg => {
    const id = (cfg?.id || '').toString().trim();
    if (!id) return;
    if (!byExact.has(id)) byExact.set(id, cfg);
    const normalized = normalizeDataSourceVisibilityKey(id);
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, cfg);
  });
  return { byExact, byNormalized };
};

export const resolveDataSourceConfigById = <TConfig extends DataSourceConfigLike>(
  configs: TConfig[],
  dataSourceId: string
): TConfig | null => {
  const id = (dataSourceId || '').toString().trim();
  if (!id) return null;
  const lookup = buildDataSourceConfigLookup(configs);
  return lookup.byExact.get(id) || lookup.byNormalized.get(normalizeDataSourceVisibilityKey(id)) || null;
};

export const filterDataSourceFreshnessWatchesByDataSourceIds = <TWatch extends DataSourceFreshnessWatchLike>(
  watches: TWatch[],
  dataSourceIds?: string[] | null
): TWatch[] => {
  const normalizedRequestedIds = new Set(
    (Array.isArray(dataSourceIds) ? dataSourceIds : [])
      .map(id => normalizeDataSourceVisibilityKey(`${id || ''}`))
      .filter(Boolean)
  );
  const activeWatches = Array.isArray(watches) ? watches : [];
  if (!normalizedRequestedIds.size) return activeWatches;
  return activeWatches.filter(watch =>
    (Array.isArray(watch?.dataSourceIds) ? watch.dataSourceIds : []).some(id =>
      normalizedRequestedIds.has(normalizeDataSourceVisibilityKey(`${id || ''}`))
    )
  );
};
