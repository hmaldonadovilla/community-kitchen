import { LangCode, LocalizedString } from './types';

export function resolveLocalizedString(
  value: LocalizedString | undefined,
  language: LangCode,
  fallback = ''
): string {
  if (!value && fallback) return fallback;
  if (typeof value === 'string') return value;
  const key = (language || 'EN').toString().toLowerCase();
  return value?.[key] || value?.en || fallback;
}

export function resolveMessage(
  message: LocalizedString | undefined,
  language: LangCode,
  fallback: LocalizedString | string
): string {
  if (!message) {
    return resolveLocalizedString(
      typeof fallback === 'string' ? { en: fallback } : fallback,
      language,
      typeof fallback === 'string' ? fallback : ''
    );
  }
  return resolveLocalizedString(message, language, resolveLocalizedString(fallback as LocalizedString, language, ''));
}
