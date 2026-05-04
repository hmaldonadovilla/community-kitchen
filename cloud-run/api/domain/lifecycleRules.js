/**
 * Owns pure lifecycle rule date/status decisions for Cloud Run scheduled recompute.
 */
const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeToIsoDate = value => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const raw = value.toString().trim();
  if (!raw) return '';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
};

const shiftIsoDate = (iso, dayOffset) => {
  const match = toText(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  next.setDate(next.getDate() + dayOffset);
  return normalizeToIsoDate(next) || iso;
};

const normalizeStatus = value => toText(value).toLowerCase();

const shouldApplyLifecycleStatusDateRule = ({ rule, currentStatus, rawDateValue, todayIso }) => {
  const fromStatuses = Array.isArray(rule && rule.fromStatuses)
    ? rule.fromStatuses.map(value => normalizeStatus(value)).filter(Boolean)
    : [];
  const status = normalizeStatus(currentStatus);
  if (fromStatuses.length && !fromStatuses.includes(status)) return false;
  const dateIso = normalizeToIsoDate(rawDateValue);
  if (!dateIso) return false;
  const offsetDays = Number.isFinite(Number(rule && rule.dayOffset || 0)) ? Math.trunc(Number(rule && rule.dayOffset || 0)) : 0;
  const compareIso = offsetDays ? shiftIsoDate(todayIso, offsetDays) : todayIso;
  if ((rule && rule.compare) === 'onOrBeforeToday') return dateIso <= compareIso;
  return dateIso < compareIso;
};

module.exports = {
  normalizeToIsoDate,
  shiftIsoDate,
  shouldApplyLifecycleStatusDateRule
};
