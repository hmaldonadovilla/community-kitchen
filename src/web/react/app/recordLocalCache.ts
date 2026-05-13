import type { WebFormDefinition, WebFormSubmission } from '../../types';
import { mergeListRecordSnapshot } from './listCache';
import { isPastIsoDate, normalizeToIsoDateLocal } from './listViewSearch';

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

type RecordLocalCacheConfig = {
  enabled: boolean;
  dateFieldId: string;
  maxAgeMs: number;
  maxEntries: number;
};

type RecordLocalCacheEnvelope = {
  version: 1;
  savedAtMs: number;
  cacheVersion: string;
  formKey: string;
  recordDate: string;
  dataVersion: number | null;
  updatedAt: string | null;
  record: WebFormSubmission;
};

export type RecordLocalCacheWriteResult = {
  attempted: number;
  eligible: number;
  written: number;
  skipped: number;
};

const RECORD_CACHE_PREFIX = 'ck.record.v1';
const DEFAULT_MAX_AGE_DAYS = 365;
const DEFAULT_MAX_ENTRIES = 250;

const encodeKeyPart = (value: any): string => encodeURIComponent((value || 'default').toString()).replace(/\./g, '%2E');

export const resolveRecordLocalCacheVersion = (): string => {
  try {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    const raw =
      (win?.__CK_CACHE_VERSION__ || (globalThis as any)?.__CK_CACHE_VERSION__ || 'default').toString().trim() || 'default';
    return raw;
  } catch {
    return 'default';
  }
};

const resolveStorage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    const storage = (globalThis as any)?.localStorage;
    return storage || null;
  } catch {
    return null;
  }
};

const resolvePositiveNumber = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const resolveRecordLocalCacheConfig = (definition: WebFormDefinition): RecordLocalCacheConfig => {
  const raw = ((definition as any)?.recordLocalCache || (definition as any)?.recordCache || {}) as any;
  const maxAgeDays = resolvePositiveNumber(raw?.maxAgeDays) || DEFAULT_MAX_AGE_DAYS;
  const maxEntries = Math.max(1, Math.floor(resolvePositiveNumber(raw?.maxEntries) || DEFAULT_MAX_ENTRIES));
  const dateFieldId = (
    raw?.dateFieldId ||
    ((definition as any)?.listView?.search as any)?.dateFieldId ||
    ((definition as any)?.listView?.dateFieldId as any) ||
    ''
  )
    .toString()
    .trim();

  return {
    enabled: raw?.enabled !== false,
    dateFieldId,
    maxAgeMs: maxAgeDays * 24 * 60 * 60 * 1000,
    maxEntries
  };
};

const resolveRecordDate = (record: WebFormSubmission | null | undefined, dateFieldId: string): string | null => {
  if (!record || !dateFieldId) return null;
  const values = ((record as any).values || {}) as Record<string, any>;
  return normalizeToIsoDateLocal(values[dateFieldId] ?? (record as any)[dateFieldId]);
};

export const shouldCacheRecordSnapshotLocally = (args: {
  definition: WebFormDefinition;
  record: WebFormSubmission | null | undefined;
  now?: Date;
}): { eligible: boolean; reason: string; recordDate: string | null; dateFieldId: string } => {
  const config = resolveRecordLocalCacheConfig(args.definition);
  if (!config.enabled) return { eligible: false, reason: 'disabled', recordDate: null, dateFieldId: config.dateFieldId };
  if (!config.dateFieldId) return { eligible: false, reason: 'missingDateField', recordDate: null, dateFieldId: '' };
  const recordId = (args.record?.id || '').toString().trim();
  if (!recordId) return { eligible: false, reason: 'missingRecordId', recordDate: null, dateFieldId: config.dateFieldId };
  const recordDate = resolveRecordDate(args.record, config.dateFieldId);
  if (!recordDate) return { eligible: false, reason: 'missingRecordDate', recordDate: null, dateFieldId: config.dateFieldId };
  if (!isPastIsoDate(recordDate, args.now || new Date())) {
    return { eligible: false, reason: 'notPastDate', recordDate, dateFieldId: config.dateFieldId };
  }
  return { eligible: true, reason: 'pastDate', recordDate, dateFieldId: config.dateFieldId };
};

const buildRecordLocalCacheKey = (formKey: string, recordId: string, cacheVersion: string): string =>
  `${RECORD_CACHE_PREFIX}.${encodeKeyPart(formKey)}.${encodeKeyPart(cacheVersion)}.${encodeKeyPart(recordId)}`;

const buildRecordLocalCacheFamilyPrefix = (formKey: string, cacheVersion?: string): string =>
  cacheVersion
    ? `${RECORD_CACHE_PREFIX}.${encodeKeyPart(formKey)}.${encodeKeyPart(cacheVersion)}.`
    : `${RECORD_CACHE_PREFIX}.${encodeKeyPart(formKey)}.`;

const parseEnvelope = (raw: string | null): RecordLocalCacheEnvelope | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = (parsed as any).record;
    if (!record || typeof record !== 'object') return null;
    const savedAtMs = Number((parsed as any).savedAtMs);
    return {
      version: 1,
      savedAtMs: Number.isFinite(savedAtMs) && savedAtMs > 0 ? savedAtMs : 0,
      cacheVersion: ((parsed as any).cacheVersion || '').toString(),
      formKey: ((parsed as any).formKey || '').toString(),
      recordDate: ((parsed as any).recordDate || '').toString(),
      dataVersion: resolvePositiveNumber((parsed as any).dataVersion),
      updatedAt: ((parsed as any).updatedAt || '').toString() || null,
      record: record as WebFormSubmission
    };
  } catch {
    return null;
  }
};

const readEnvelope = (storage: Storage, key: string): RecordLocalCacheEnvelope | null => parseEnvelope(storage.getItem(key));

const pruneRecordLocalCache = (args: {
  storage: Storage;
  formKey: string;
  cacheVersion: string;
  maxAgeMs: number;
  maxEntries: number;
  nowMs: number;
}): void => {
  const formPrefix = buildRecordLocalCacheFamilyPrefix(args.formKey);
  const activePrefix = buildRecordLocalCacheFamilyPrefix(args.formKey, args.cacheVersion);
  const activeEntries: Array<{ key: string; savedAtMs: number }> = [];
  const removeKeys: string[] = [];

  for (let i = 0; i < args.storage.length; i += 1) {
    const key = args.storage.key(i);
    if (!key || !key.startsWith(formPrefix)) continue;
    if (!key.startsWith(activePrefix)) {
      removeKeys.push(key);
      continue;
    }
    const envelope = readEnvelope(args.storage, key);
    if (!envelope || !envelope.savedAtMs || args.nowMs - envelope.savedAtMs > args.maxAgeMs) {
      removeKeys.push(key);
      continue;
    }
    activeEntries.push({ key, savedAtMs: envelope.savedAtMs });
  }

  activeEntries
    .sort((a, b) => b.savedAtMs - a.savedAtMs)
    .slice(args.maxEntries)
    .forEach(entry => removeKeys.push(entry.key));

  removeKeys.forEach(key => {
    try {
      args.storage.removeItem(key);
    } catch {
      // ignore
    }
  });
};

const toEnvelope = (args: {
  formKey: string;
  cacheVersion: string;
  record: WebFormSubmission;
  recordDate: string;
  nowMs: number;
}): RecordLocalCacheEnvelope => ({
  version: 1,
  savedAtMs: args.nowMs,
  cacheVersion: args.cacheVersion,
  formKey: args.formKey,
  recordDate: args.recordDate,
  dataVersion: resolvePositiveNumber((args.record as any).dataVersion),
  updatedAt: ((args.record as any).updatedAt || '').toString() || null,
  record: args.record
});

const writeOne = (args: {
  definition: WebFormDefinition;
  formKey: string;
  record: WebFormSubmission;
  cacheVersion: string;
  now: Date;
  storage: Storage;
}): { eligible: boolean; written: boolean; reason: string; recordId: string } => {
  const recordId = (args.record?.id || '').toString().trim();
  const eligibility = shouldCacheRecordSnapshotLocally({
    definition: args.definition,
    record: args.record,
    now: args.now
  });
  if (!eligibility.eligible || !recordId || !eligibility.recordDate) {
    return { eligible: false, written: false, reason: eligibility.reason, recordId };
  }

  const key = buildRecordLocalCacheKey(args.formKey, recordId, args.cacheVersion);
  const existing = readEnvelope(args.storage, key)?.record || null;
  const merged = mergeListRecordSnapshot(existing, args.record);
  if (!merged) return { eligible: true, written: false, reason: 'mergeFailed', recordId };
  const existingVersion = resolvePositiveNumber((existing as any)?.dataVersion);
  const mergedVersion = resolvePositiveNumber((merged as any)?.dataVersion);
  const incomingVersion = resolvePositiveNumber((args.record as any)?.dataVersion);
  if (existing && existingVersion !== null && incomingVersion !== null && mergedVersion === existingVersion && incomingVersion < existingVersion) {
    return { eligible: true, written: false, reason: 'olderThanCached', recordId };
  }

  args.storage.setItem(
    key,
    JSON.stringify(
      toEnvelope({
        formKey: args.formKey,
        cacheVersion: args.cacheVersion,
        record: merged,
        recordDate: eligibility.recordDate,
        nowMs: args.now.getTime()
      })
    )
  );
  return { eligible: true, written: true, reason: 'stored', recordId };
};

export const writeCachedRecordSnapshot = (args: {
  definition: WebFormDefinition;
  formKey: string;
  record: WebFormSubmission | null | undefined;
  cacheVersion?: string;
  now?: Date;
  onDiagnostic?: DiagnosticLogger;
  source?: string;
}): RecordLocalCacheWriteResult => {
  if (!args.record) return { attempted: 0, eligible: 0, written: 0, skipped: 0 };
  const recordId = (args.record.id || '').toString();
  const result = writeCachedRecordSnapshots({
    definition: args.definition,
    formKey: args.formKey,
    records: { [recordId]: args.record },
    cacheVersion: args.cacheVersion,
    now: args.now,
    onDiagnostic: args.onDiagnostic,
    source: args.source
  });
  return result;
};

export const writeCachedRecordSnapshots = (args: {
  definition: WebFormDefinition;
  formKey: string;
  records: Record<string, WebFormSubmission> | null | undefined;
  cacheVersion?: string;
  now?: Date;
  onDiagnostic?: DiagnosticLogger;
  source?: string;
}): RecordLocalCacheWriteResult => {
  const entries = Object.values(args.records || {}).filter(Boolean);
  if (!entries.length) return { attempted: 0, eligible: 0, written: 0, skipped: 0 };
  const storage = resolveStorage();
  if (!storage) return { attempted: entries.length, eligible: 0, written: 0, skipped: entries.length };

  const config = resolveRecordLocalCacheConfig(args.definition);
  const cacheVersion = args.cacheVersion || resolveRecordLocalCacheVersion();
  const now = args.now || new Date();
  const summary: RecordLocalCacheWriteResult = { attempted: entries.length, eligible: 0, written: 0, skipped: 0 };
  const skippedReasons: Record<string, number> = {};

  entries.forEach(record => {
    try {
      const result = writeOne({
        definition: args.definition,
        formKey: args.formKey,
        record,
        cacheVersion,
        now,
        storage
      });
      if (result.eligible) summary.eligible += 1;
      if (result.written) summary.written += 1;
      else {
        summary.skipped += 1;
        skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1;
      }
    } catch (err: any) {
      summary.skipped += 1;
      skippedReasons.error = (skippedReasons.error || 0) + 1;
      args.onDiagnostic?.('record.localCache.write.error', {
        formKey: args.formKey,
        source: args.source || null,
        message: (err?.message || err?.toString?.() || 'failed').toString()
      });
    }
  });

  if (summary.written > 0) {
    pruneRecordLocalCache({
      storage,
      formKey: args.formKey,
      cacheVersion,
      maxAgeMs: config.maxAgeMs,
      maxEntries: config.maxEntries,
      nowMs: now.getTime()
    });
    args.onDiagnostic?.('record.localCache.write', {
      formKey: args.formKey,
      source: args.source || null,
      cacheVersion,
      attempted: summary.attempted,
      eligible: summary.eligible,
      written: summary.written,
      skipped: summary.skipped,
      skippedReasons
    });
  }

  return summary;
};

export const readCachedRecordSnapshot = (args: {
  definition: WebFormDefinition;
  formKey: string;
  recordId: string;
  cacheVersion?: string;
  now?: Date;
  onDiagnostic?: DiagnosticLogger;
  source?: string;
}): WebFormSubmission | null => {
  const recordId = (args.recordId || '').toString().trim();
  if (!recordId) return null;
  const storage = resolveStorage();
  if (!storage) return null;

  const config = resolveRecordLocalCacheConfig(args.definition);
  if (!config.enabled || !config.dateFieldId) return null;

  const cacheVersion = args.cacheVersion || resolveRecordLocalCacheVersion();
  const key = buildRecordLocalCacheKey(args.formKey, recordId, cacheVersion);
  const envelope = readEnvelope(storage, key);
  if (!envelope) {
    args.onDiagnostic?.('record.localCache.miss', {
      formKey: args.formKey,
      recordId,
      source: args.source || null,
      cacheVersion
    });
    return null;
  }

  const now = args.now || new Date();
  if (!envelope.savedAtMs || now.getTime() - envelope.savedAtMs > config.maxAgeMs) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    args.onDiagnostic?.('record.localCache.stale', {
      formKey: args.formKey,
      recordId,
      source: args.source || null,
      cacheVersion,
      reason: 'expired'
    });
    return null;
  }

  const cachedRecordId = (envelope.record?.id || '').toString().trim();
  const recordDate = resolveRecordDate(envelope.record, config.dateFieldId);
  if (cachedRecordId !== recordId || !recordDate || !isPastIsoDate(recordDate, now)) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    args.onDiagnostic?.('record.localCache.stale', {
      formKey: args.formKey,
      recordId,
      source: args.source || null,
      cacheVersion,
      reason: cachedRecordId !== recordId ? 'recordIdMismatch' : 'notPastDate'
    });
    return null;
  }

  args.onDiagnostic?.('record.localCache.hit', {
    formKey: args.formKey,
    recordId,
    source: args.source || null,
    cacheVersion,
    recordDate,
    dataVersion: resolvePositiveNumber((envelope.record as any).dataVersion),
    savedAtMs: envelope.savedAtMs
  });
  return envelope.record;
};
