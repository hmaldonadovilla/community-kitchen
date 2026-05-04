import type { FieldValue } from '../../types';

export const extractServerGeneratedTopValues = (response: any): Record<string, FieldValue> => {
  const raw = response?.meta?.autoIncrementValues;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw).reduce<Record<string, FieldValue>>((acc, [fieldId, value]) => {
    const key = (fieldId || '').toString().trim();
    if (!key) return acc;
    if (value === undefined || value === null) return acc;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (typeof normalized === 'string' && !normalized) return acc;
    acc[key] = normalized as FieldValue;
    return acc;
  }, {});
};

export const mergeServerGeneratedTopValues = (
  values: Record<string, FieldValue>,
  generatedValues: Record<string, FieldValue>
): Record<string, FieldValue> => {
  const entries = Object.entries(generatedValues || {});
  if (!entries.length) return values;
  const base = values || {};
  let next: Record<string, FieldValue> | null = null;
  entries.forEach(([fieldId, value]) => {
    if (!fieldId) return;
    if ((base as any)[fieldId] === value) return;
    if (!next) next = { ...base };
    next[fieldId] = value;
  });
  return next || values;
};
