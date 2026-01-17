import { FollowupStatusConfig, LocalizedString } from '../types';

/**
 * Status transition helpers shared by backend + web app.
 * Responsibility: resolve configured status values and normalize comparisons.
 * Pure functions only (no DOM, no IO).
 */

export type StatusTransitionKey = keyof FollowupStatusConfig;

export const STATUS_TRANSITION_KEYS: StatusTransitionKey[] = [
  'inProgress',
  'reOpened',
  'onPdf',
  'onEmail',
  'onClose'
];

const DEFAULT_ON_CLOSE = 'Closed';

const normalizeStatusText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const normalizeKey = (value: any): string => normalizeStatusText(value).toLowerCase();

const valuesFromLocalized = (value: string | LocalizedString | undefined, includeDefaultOnClose?: boolean, key?: StatusTransitionKey): string[] => {
  const raw = value ?? (includeDefaultOnClose && key === 'onClose' ? DEFAULT_ON_CLOSE : undefined);
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'string') {
    const trimmed = normalizeStatusText(raw);
    return trimmed ? [trimmed] : [];
  }
  if (typeof raw !== 'object') return [];
  const entries = Object.values(raw as Record<string, string>);
  return entries.map(v => normalizeStatusText(v)).filter(Boolean);
};

export const resolveStatusTransitionValue = (
  transitions: FollowupStatusConfig | undefined,
  key: StatusTransitionKey,
  language?: string,
  opts?: { includeDefaultOnClose?: boolean }
): string => {
  const raw = transitions?.[key];
  if (typeof raw === 'string') return normalizeStatusText(raw);
  if (!raw || typeof raw !== 'object') {
    if (opts?.includeDefaultOnClose && key === 'onClose') return DEFAULT_ON_CLOSE;
    return '';
  }
  const langUpper = (language || 'EN').toString().toUpperCase();
  const langLower = (language || 'en').toString().toLowerCase();
  const direct =
    (raw as any)[langUpper] ??
    (raw as any)[langLower] ??
    (raw as any).en ??
    (raw as any).EN;
  if (direct !== undefined && direct !== null) return normalizeStatusText(direct);
  const fallback = Object.values(raw as Record<string, string>).find(v => normalizeStatusText(v));
  return fallback ? normalizeStatusText(fallback) : '';
};

export const getStatusTransitionValues = (
  transitions: FollowupStatusConfig | undefined,
  key: StatusTransitionKey,
  opts?: { includeDefaultOnClose?: boolean }
): string[] => {
  const values = valuesFromLocalized(transitions?.[key] as any, opts?.includeDefaultOnClose, key);
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach(v => {
    const k = normalizeKey(v);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(v);
  });
  return out;
};

export const collectStatusTransitionValues = (
  transitions: FollowupStatusConfig | undefined,
  opts?: { includeDefaultOnClose?: boolean }
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  STATUS_TRANSITION_KEYS.forEach(key => {
    getStatusTransitionValues(transitions, key, opts).forEach(v => {
      const k = normalizeKey(v);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
  });
  return out;
};

export const hasStatusTransitionValue = (
  transitions: FollowupStatusConfig | undefined,
  key: StatusTransitionKey
): boolean => {
  return getStatusTransitionValues(transitions, key).length > 0;
};

export const isStatusValueMatch = (rawStatus: any, candidate: any): boolean => {
  const left = normalizeKey(rawStatus);
  const right = normalizeKey(candidate);
  if (!left || !right) return false;
  return left === right;
};

export const matchesStatusTransition = (
  rawStatus: any,
  transitions: FollowupStatusConfig | undefined,
  key: StatusTransitionKey,
  opts?: { includeDefaultOnClose?: boolean }
): boolean => {
  const raw = normalizeKey(rawStatus);
  if (!raw) return false;
  const candidates = getStatusTransitionValues(transitions, key, opts);
  return candidates.some(candidate => normalizeKey(candidate) === raw);
};

export const resolveStatusTransitionKey = (
  rawStatus: any,
  transitions: FollowupStatusConfig | undefined,
  opts?: { includeDefaultOnClose?: boolean; keys?: StatusTransitionKey[] }
): StatusTransitionKey | null => {
  const raw = normalizeKey(rawStatus);
  if (!raw) return null;
  const keys = Array.isArray(opts?.keys) && opts?.keys.length ? opts.keys : STATUS_TRANSITION_KEYS;
  for (const key of keys) {
    const candidates = getStatusTransitionValues(transitions, key, opts);
    if (candidates.some(candidate => normalizeKey(candidate) === raw)) {
      return key;
    }
  }
  return null;
};
