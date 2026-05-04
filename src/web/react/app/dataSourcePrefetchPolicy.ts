import { normalizeDataSourceVisibilityKey } from './dataSourceVisibility';

type DataSourceLike = {
  id?: unknown;
};

type DataSourceFreshnessWatchLike = {
  dataSourceIds?: unknown[];
};

export const filterFormOpenPrefetchDataSources = <T extends DataSourceLike>(args: {
  configs: T[];
  freshnessWatches: DataSourceFreshnessWatchLike[];
}): T[] => {
  const configs = Array.isArray(args.configs) ? args.configs.filter(Boolean) : [];
  const watchedIds = new Set(
    (Array.isArray(args.freshnessWatches) ? args.freshnessWatches : [])
      .flatMap(watch => (Array.isArray(watch?.dataSourceIds) ? watch.dataSourceIds : []))
      .map(value => normalizeDataSourceVisibilityKey(`${value ?? ''}`))
      .filter(Boolean)
  );
  if (!watchedIds.size) return configs;
  return configs.filter(config => {
    const id = normalizeDataSourceVisibilityKey(`${config?.id ?? ''}`);
    return !id || !watchedIds.has(id);
  });
};

export const normalizeDataSourcePrefetchRetryDelays = (retryDelaysMs?: unknown[] | null): number[] => {
  const delays = Array.isArray(retryDelaysMs) && retryDelaysMs.length
    ? Array.from(
        new Set(
          retryDelaysMs
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value >= 0)
            .map(value => Math.floor(value))
        )
      )
    : [];
  return delays.length ? delays : [0];
};

export const buildFormDataSourceRefreshKey = (args: {
  formKey?: string | null;
  language?: string | null;
  selectedRecordId?: string | null;
  view?: string | null;
}): string =>
  `${(args.formKey || '').toString()}::${(args.language || '').toString()}::${(args.selectedRecordId || 'create').toString()}::${(
    args.view || ''
  ).toString()}`;
