import { LifecycleRule } from '../../types';
import { normalizeToIsoDate } from './followup/utils';

/**
 * Owns pure lifecycle rule date/status decisions shared by scheduled recompute use cases.
 */
const normalizeStatus = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());

export const shiftIsoDate = (iso: string, dayOffset: number): string => {
  const match = (iso || '').toString().trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return iso;
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + dayOffset);
  return normalizeToIsoDate(next) || iso;
};

export const shouldApplyLifecycleStatusDateRule = (args: {
  rule: LifecycleRule;
  currentStatus: unknown;
  rawDateValue: unknown;
  todayIso: string;
}): boolean => {
  const { rule, currentStatus, rawDateValue, todayIso } = args;
  const fromStatusesRaw = 'fromStatuses' in rule ? rule.fromStatuses : undefined;
  const status = normalizeStatus(currentStatus);
  const fromStatuses = Array.isArray(fromStatusesRaw)
    ? fromStatusesRaw.map((value: unknown) => normalizeStatus(value)).filter(Boolean)
    : [];
  if (fromStatuses.length && !fromStatuses.includes(status)) return false;
  const dateIso = normalizeToIsoDate(rawDateValue);
  if (!dateIso) return false;
  const dayOffsetRaw = 'dayOffset' in rule ? rule.dayOffset : 0;
  const offsetDays = Number.isFinite(Number(dayOffsetRaw || 0)) ? Math.trunc(Number(dayOffsetRaw || 0)) : 0;
  const compareIso = offsetDays ? shiftIsoDate(todayIso, offsetDays) : todayIso;
  if (!compareIso) return false;
  if (('compare' in rule ? rule.compare : 'beforeToday') === 'onOrBeforeToday') {
    return dateIso <= compareIso;
  }
  return dateIso < compareIso;
};
