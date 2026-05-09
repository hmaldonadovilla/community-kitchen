import type {
  DataSourceConfig,
  DataSourceFreshnessDialogConfig,
  DataSourceFreshnessWatchConfig,
  WhenClause,
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
  stopWhen?: WhenClause;
  dialog?: DataSourceFreshnessDialogConfig | null;
}

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : `${value}`.trim());

const normalizeStringList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map(entry => normalizeText(entry))
    .filter(Boolean);

const NUMERIC_FIELD_ID_PATTERN = /(?:^|_)(?:QTY|QUANTITY|PORTION|PORTIONS|COUNT|AMOUNT|FREE)(?:_|$)/i;

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
      stopWhen: rawWatch.stopWhen,
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

export const resolveDataSourceFreshnessSignatureFieldIds = (
  config?: DataSourceConfig | null
): string[] => {
  const projection = normalizeStringList((config as any)?.projection);
  const statusFieldId = normalizeText((config as any)?.statusFieldId);
  if (!projection.length && !statusFieldId) return [];
  return Array.from(
    new Set(
      ['id', 'value', 'status', statusFieldId, ...projection]
        .map(entry => normalizeText(entry))
        .filter(Boolean)
    )
  );
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

export const primeDataSourceFreshnessWatchBaselines = (args: {
  watches: ResolvedDataSourceFreshnessWatch[];
  now: number;
  lastServerActivityAtByWatchKey: Record<string, number | null | undefined>;
}): {
  lastServerActivityAtByWatchKey: Record<string, number>;
  initializedWatchKeys: string[];
} => {
  const next = { ...(args.lastServerActivityAtByWatchKey || {}) } as Record<string, number>;
  const initializedWatchKeys: string[] = [];
  (Array.isArray(args.watches) ? args.watches : []).forEach(watch => {
    if (!watch?.key) return;
    const current = Number(next[watch.key]);
    if (Number.isFinite(current) && current > 0) return;
    next[watch.key] = args.now;
    initializedWatchKeys.push(watch.key);
  });
  return {
    lastServerActivityAtByWatchKey: next,
    initializedWatchKeys
  };
};

export const buildDataSourceFreshnessBaselineKey = (args: {
  watchKey?: string | null;
  dataSourceId?: string | null;
}): string => {
  const watchKey = normalizeText(args.watchKey);
  const dataSourceId = normalizeText(args.dataSourceId);
  return watchKey && dataSourceId ? `${watchKey}::${dataSourceId}` : '';
};

export const resolveDataSourceFreshnessBaselineComparison = (args: {
  baselineSignature?: string | null;
  nextSignature?: string | null;
}): {
  changed: boolean;
  shouldPrimeBaseline: boolean;
} => {
  const baselineSignature = normalizeText(args.baselineSignature);
  const nextSignature = normalizeText(args.nextSignature);
  if (!nextSignature) {
    return {
      changed: false,
      shouldPrimeBaseline: false
    };
  }
  if (!baselineSignature) {
    return {
      changed: false,
      shouldPrimeBaseline: true
    };
  }
  return {
    changed: baselineSignature !== nextSignature,
    shouldPrimeBaseline: false
  };
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

const normalizeSignatureFieldValue = (fieldId: string, value: any): any => {
  if (value === undefined || value === null) {
    return NUMERIC_FIELD_ID_PATTERN.test(fieldId) ? 0 : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (NUMERIC_FIELD_ID_PATTERN.test(fieldId)) {
      if (!trimmed) return 0;
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric;
    }
    return trimmed;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(entry => normalizeSignatureFieldValue(fieldId, entry));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, any> = {};
    Object.keys(value)
      .sort()
      .forEach(key => {
        next[key] = normalizeSignatureFieldValue(key, value[key]);
      });
    return next;
  }
  return value;
};

const buildProjectedItemSignature = (item: any, fieldIds: string[]): any => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }
  const next: Record<string, any> = {};
  fieldIds.forEach(fieldId => {
    if (!fieldId) return;
    if (!Object.prototype.hasOwnProperty.call(item, fieldId)) return;
    next[fieldId] = normalizeSignatureFieldValue(fieldId, item[fieldId]);
  });
  return next;
};

export const buildDataSourceFreshnessSnapshotSignature = (
  value: any,
  opts?: { fieldIds?: string[] | null }
): string => {
  const fieldIds = Array.from(new Set(normalizeStringList(opts?.fieldIds))).sort();
  if (fieldIds.length) {
    const items = Array.isArray((value as any)?.items) ? (value as any).items : Array.isArray(value) ? value : [];
    const totalCount = Number((value as any)?.totalCount);
    const normalizedItems = items
      .map((item: any) => buildProjectedItemSignature(item, fieldIds))
      .sort((left: any, right: any) => stableStringify(left).localeCompare(stableStringify(right)));
    return stableStringify({
      items: normalizedItems,
      totalCount: Number.isFinite(totalCount) ? totalCount : normalizedItems.length
    });
  }
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
