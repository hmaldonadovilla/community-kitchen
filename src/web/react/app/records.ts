import { FieldValue, WebFormDefinition } from '../../types';

const coerceConsentBoolean = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (Array.isArray(raw)) return raw.length > 0;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return false;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return true;
};

export const normalizeRecordValues = (definition: WebFormDefinition, rawValues?: Record<string, any>): Record<string, FieldValue> => {
  const source = rawValues ? { ...rawValues } : {};
  const normalized: Record<string, FieldValue> = { ...source };
  definition.questions.forEach(question => {
    if (question.type !== 'CHECKBOX') return;
    const raw = source[question.id];
    const hasKey = Object.prototype.hasOwnProperty.call(source, question.id);
    const defaultRaw = (question as any).defaultValue;
    const hasAnyOption = !!(
      question.options?.en?.length ||
      question.options?.fr?.length ||
      question.options?.nl?.length
    );
    const isConsentCheckbox = !question.dataSource && !hasAnyOption;

    if (isConsentCheckbox) {
      if (!hasKey && defaultRaw !== undefined) {
        normalized[question.id] = coerceConsentBoolean(defaultRaw);
        return;
      }
      if (typeof raw === 'boolean') {
        normalized[question.id] = raw;
        return;
      }
      if (Array.isArray(raw)) {
        normalized[question.id] = raw.length > 0;
        return;
      }
      if (typeof raw === 'string') {
        const v = raw.trim().toLowerCase();
        normalized[question.id] = !(v === '' || v === 'false' || v === '0' || v === 'no' || v === 'n');
        return;
      }
      // New record (or missing value): default unchecked.
      normalized[question.id] = false;
      return;
    }

    if (!hasKey && defaultRaw !== undefined) {
      if (Array.isArray(defaultRaw)) {
        normalized[question.id] = defaultRaw
          .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
          .filter(Boolean);
        return;
      }
      if (typeof defaultRaw === 'string') {
        const s = defaultRaw.toString().trim();
        if (!s) {
          normalized[question.id] = [];
          return;
        }
        if (s.includes(',')) {
          normalized[question.id] = s
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
          return;
        }
        normalized[question.id] = [s];
        return;
      }
      // Fallback: treat any other scalar as a single entry.
      normalized[question.id] = [defaultRaw.toString()];
      return;
    }

    if (Array.isArray(raw)) {
      normalized[question.id] = raw as FieldValue;
      return;
    }
    if (typeof raw === 'string') {
      const entries = raw
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
      normalized[question.id] = entries;
    } else if (raw === undefined || raw === null) {
      normalized[question.id] = [];
    }
  });
  return normalized;
};


