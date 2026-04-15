import type {
  DataSourceFreshnessDialogConfig,
  DataSourceFreshnessWatchConfig,
  RecordFreshnessConfig
} from '../../../types';
import type { View } from '../types';
import {
  DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS,
  MAX_RECORD_FRESHNESS_QUIET_WINDOW_MS,
  MIN_RECORD_FRESHNESS_QUIET_WINDOW_MS
} from './recordFreshness';

export interface ResolvedDataSourceFreshnessWatch {
  key: string;
  stepId: string;
  dataSourceIds: string[];
  quietWindowMs: number;
  dialog?: DataSourceFreshnessDialogConfig | null;
}

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : `${value}`.trim());

const normalizeStringList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map(entry => normalizeText(entry))
    .filter(Boolean);

const normalizeQuietWindowMs = (value: unknown): number => {
  const quietWindowRaw = Number(value);
  return Number.isFinite(quietWindowRaw)
    ? Math.max(
        MIN_RECORD_FRESHNESS_QUIET_WINDOW_MS,
        Math.min(MAX_RECORD_FRESHNESS_QUIET_WINDOW_MS, Math.floor(quietWindowRaw))
      )
    : DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS;
};

const normalizeDataSourceIds = (watch: DataSourceFreshnessWatchConfig | null | undefined): string[] => {
  const ids = [
    normalizeText(watch?.dataSourceId),
    ...normalizeStringList(watch?.dataSourceIds)
  ].filter(Boolean);
  return Array.from(new Set(ids));
};

export const buildDataSourceFreshnessWatchKey = (args: {
  stepId?: string | null;
  dataSourceIds?: string[] | null;
}): string => {
  const stepId = normalizeText(args.stepId);
  const ids = Array.from(new Set(normalizeStringList(args.dataSourceIds))).sort();
  if (!stepId || !ids.length) return '';
  return `${stepId}::${ids.join('|')}`;
};

export const resolveDataSourceFreshnessWatches = (
  value?: RecordFreshnessConfig | null
): ResolvedDataSourceFreshnessWatch[] => {
  const watches = Array.isArray(value?.dataSourceWatches) ? value?.dataSourceWatches : [];
  const seen = new Set<string>();
  const next: ResolvedDataSourceFreshnessWatch[] = [];

  watches.forEach(rawWatch => {
    if (!rawWatch || rawWatch.enabled === false) return;
    const stepId = normalizeText(rawWatch.stepId);
    const dataSourceIds = normalizeDataSourceIds(rawWatch);
    const key = buildDataSourceFreshnessWatchKey({ stepId, dataSourceIds });
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push({
      key,
      stepId,
      dataSourceIds,
      quietWindowMs: normalizeQuietWindowMs(rawWatch.quietWindowMs),
      dialog: rawWatch.dialog || null
    });
  });

  return next;
};

export const resolveActiveDataSourceFreshnessWatches = (args: {
  watches: ResolvedDataSourceFreshnessWatch[];
  stepId?: string | null;
}): ResolvedDataSourceFreshnessWatch[] => {
  const stepId = normalizeText(args.stepId);
  if (!stepId) return [];
  return (Array.isArray(args.watches) ? args.watches : []).filter(watch => watch.stepId === stepId);
};

export const resolveDataSourceFreshnessTimerDelay = (args: {
  watches: ResolvedDataSourceFreshnessWatch[];
  view: View;
  recordId?: string | null;
  recordLoading: boolean;
  now: number;
  lastServerActivityAtByWatchKey: Record<string, number | null | undefined>;
}): number | null => {
  if (args.view !== 'form') return null;
  if (!normalizeText(args.recordId)) return null;
  if (args.recordLoading) return null;
  const watches = Array.isArray(args.watches) ? args.watches : [];
  if (!watches.length) return null;

  let minDelayMs: number | null = null;
  watches.forEach(watch => {
    const lastServerActivityAt = Number(args.lastServerActivityAtByWatchKey?.[watch.key]);
    const delayMs =
      Number.isFinite(lastServerActivityAt) && lastServerActivityAt > 0
        ? Math.max(0, watch.quietWindowMs - Math.max(0, args.now - lastServerActivityAt))
        : watch.quietWindowMs;
    minDelayMs = minDelayMs === null ? delayMs : Math.min(minDelayMs, delayMs);
  });
  return minDelayMs;
};

const stableStringify = (value: any): string => {
  const seen = new WeakSet<object>();
  const normalize = (input: any): any => {
    if (input === null || input === undefined) return input;
    if (Array.isArray(input)) return input.map(normalize);
    if (typeof input === 'object') {
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      const next: Record<string, any> = {};
      Object.keys(input)
        .sort()
        .forEach(key => {
          next[key] = normalize(input[key]);
        });
      return next;
    }
    return input;
  };
  return JSON.stringify(normalize(value));
};

export const buildDataSourceFreshnessSnapshotSignature = (value: any): string => {
  const normalized =
    value && typeof value === 'object' && !Array.isArray(value)
      ? {
          items: Array.isArray((value as any).items) ? (value as any).items : [],
          nextPageToken: normalizeText((value as any).nextPageToken) || null,
          totalCount: Number.isFinite(Number((value as any).totalCount)) ? Number((value as any).totalCount) : null
        }
      : {
          items: Array.isArray(value) ? value : []
        };
  return stableStringify(normalized);
};
