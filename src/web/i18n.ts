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

export function resolveOptionalLocalizedString(
  value: LocalizedString | string | undefined | null,
  language: LangCode,
  fallback = ''
): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return fallback;
  const key = (language || 'EN').toString().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(value, key)) return (value[key] ?? '').toString();
  if (Object.prototype.hasOwnProperty.call(value, 'en')) return (value.en ?? '').toString();
  return fallback;
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
