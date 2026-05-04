type DataSourceLike = {
  id?: unknown;
};

type DataSourceFreshnessWatchLike = {
  dataSourceIds?: unknown[];
};

const normalizeDataSourceKey = (value: unknown): string =>
  (value === undefined || value === null ? '' : value.toString())
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const filterFormOpenPrefetchDataSources = <T extends DataSourceLike>(args: {
  configs: T[];
  freshnessWatches: DataSourceFreshnessWatchLike[];
}): T[] => {
  const configs = Array.isArray(args.configs) ? args.configs.filter(Boolean) : [];
  const watchedIds = new Set(
    (Array.isArray(args.freshnessWatches) ? args.freshnessWatches : [])
      .flatMap(watch => (Array.isArray(watch?.dataSourceIds) ? watch.dataSourceIds : []))
      .map(normalizeDataSourceKey)
      .filter(Boolean)
  );
  if (!watchedIds.size) return configs;
  return configs.filter(config => {
    const id = normalizeDataSourceKey(config?.id);
    return !id || !watchedIds.has(id);
  });
};
