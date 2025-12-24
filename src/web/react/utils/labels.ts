import { LangCode, WebQuestionDefinition } from '../../types';

export const resolveLabel = (q: WebQuestionDefinition, language: LangCode) => {
  const key = (language || 'en').toString().toLowerCase();
  return (q.label && (q.label as any)[key]) || (q.label && (q.label as any).en) || q.id;
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
  if (key === 'FR') return field?.labelFr || field?.labelEn || fallback;
  if (key === 'NL') return field?.labelNl || field?.labelEn || fallback;
  return field?.labelEn || fallback;
};

