import { FieldValue, WebFormDefinition } from '../../types';

export const normalizeRecordValues = (definition: WebFormDefinition, rawValues?: Record<string, any>): Record<string, FieldValue> => {
  const source = rawValues ? { ...rawValues } : {};
  const normalized: Record<string, FieldValue> = { ...source };
  definition.questions.forEach(question => {
    if (question.type !== 'CHECKBOX') return;
    const raw = source[question.id];
    const hasAnyOption = !!(
      question.options?.en?.length ||
      question.options?.fr?.length ||
      question.options?.nl?.length
    );
    const isConsentCheckbox = !question.dataSource && !hasAnyOption;

    if (isConsentCheckbox) {
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


