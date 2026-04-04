import { LangCode, WebQuestionDefinition } from '../../types';

const humanizeFallbackId = (rawId: string): string => {
  const trimmed = (rawId || '').toString().trim();
  if (!trimmed) return '';

  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return trimmed;

  const words = normalized.split(' ').filter(Boolean);
  const source =
    words.length > 1 && /^[A-Z]{1,3}$/.test(words[0] || '')
      ? words.slice(1)
      : words;
  const humanized = source.map(word => word.toLowerCase()).join(' ').trim();
  if (!humanized) return trimmed;
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
};

export const resolveLabel = (q: WebQuestionDefinition, language: LangCode) => {
  const key = (language || 'en').toString().toLowerCase();
  const rawQuestion = (q || {}) as any;
  const localizedLabel =
    (q.label && (q.label as any)[key]) ||
    (q.label && (q.label as any).en) ||
    rawQuestion[`q${key.charAt(0).toUpperCase()}${key.slice(1)}`] ||
    rawQuestion.qEn ||
    rawQuestion[`label${key.charAt(0).toUpperCase()}${key.slice(1)}`] ||
    rawQuestion.labelEn;
  return localizedLabel || humanizeFallbackId(q.id || '');
};

export const resolveFieldLabel = (field: any, language: LangCode, fallback: string) => {
  const keyLower = (language || 'EN').toString().trim().toLowerCase();
  const label = field?.label;
  if (label) {
    if (typeof label === 'string') return label;
    const fromLabelObject = (label as any)[keyLower] || (label as any).en;
    if (fromLabelObject) return fromLabelObject;
  }

  const key = (language || 'EN').toString().trim().toUpperCase();
  const localizedQuestionKey = `q${key.charAt(0)}${key.slice(1).toLowerCase()}`;
  const localizedLabelKey = `label${key.charAt(0)}${key.slice(1).toLowerCase()}`;
  if (key === 'FR') {
    return field?.labelFr || field?.qFr || field?.labelEn || field?.qEn || fallback;
  }
  if (key === 'NL') {
    return field?.labelNl || field?.qNl || field?.labelEn || field?.qEn || fallback;
  }
  return field?.[localizedLabelKey] || field?.[localizedQuestionKey] || field?.labelEn || field?.qEn || fallback;
};
