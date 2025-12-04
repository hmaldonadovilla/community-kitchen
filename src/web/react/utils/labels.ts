import { LangCode, WebQuestionDefinition } from '../../types';

export const resolveLabel = (q: WebQuestionDefinition, language: LangCode) => {
  const key = (language || 'en').toString().toLowerCase();
  return (q.label && (q.label as any)[key]) || (q.label && (q.label as any).en) || q.id;
};

export const resolveFieldLabel = (field: any, language: LangCode, fallback: string) => {
  const key = (language || 'en').toString().toLowerCase();
  return field?.[`label${key.toUpperCase()}`] || field?.labelEn || fallback;
};

