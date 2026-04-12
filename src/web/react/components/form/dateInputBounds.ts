const pad2 = (value: number): string => value.toString().padStart(2, '0');

const formatLocalYmd = (date: Date): string => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const resolveDateInputBound = (raw: string | null | undefined, now: Date = new Date()): string | undefined => {
  const candidate = (raw || '').toString().trim();
  if (!candidate) return undefined;
  if (candidate.toLowerCase() === 'today') return formatLocalYmd(now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return formatLocalYmd(parsed);
};

export const isDateInputValueWithinBounds = (value: string, bounds: { min?: string; max?: string }): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) return true;
  if (bounds.min && normalized < bounds.min) return false;
  if (bounds.max && normalized > bounds.max) return false;
  return true;
};

export type DateInputBoundCorrection = 'min' | 'max' | null;

export type DateInputBoundResolution = {
  value: string;
  corrected: boolean;
  correction: DateInputBoundCorrection;
};

export const resolveDateInputValueWithinBounds = (
  value: string,
  bounds: { min?: string; max?: string }
): DateInputBoundResolution => {
  const normalized = (value || '').trim();
  if (!normalized) return { value: '', corrected: false, correction: null };
  if (bounds.min && normalized < bounds.min) {
    return { value: bounds.min, corrected: true, correction: 'min' };
  }
  if (bounds.max && normalized > bounds.max) {
    return { value: bounds.max, corrected: true, correction: 'max' };
  }
  return { value: normalized, corrected: false, correction: null };
};
