import { resolveLocalizedString } from '../../i18n';
import type { DedupDialogConfig, LangCode, LocalizedString } from '../../types';

/**
 * Resolve dedup dialog copy from config with defaults.
 *
 * Owner: WebForm UI (React)
 */
export type DedupDialogCopy = {
  title: string;
  intro: string;
  outro: string;
  confirmLabel: string;
  cancelLabel: string;
};

const resolveRequiredText = (value: LocalizedString | undefined, language: LangCode, fallback: string): string => {
  const resolved = resolveLocalizedString(value, language, fallback).toString();
  return resolved.trim() ? resolved : fallback;
};

const resolveOptionalText = (value: LocalizedString | undefined, language: LangCode, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  return resolveLocalizedString(value, language, fallback).toString();
};

export const resolveDedupDialogCopy = (config: DedupDialogConfig | undefined, language: LangCode): DedupDialogCopy => {
  return {
    title: resolveRequiredText(
      config?.title,
      language,
      'Creating duplicate record for the same customer, service and date is not allowed.'
    ),
    intro: resolveOptionalText(config?.intro, language, 'A meal production record already exists for:'),
    outro: resolveOptionalText(config?.outro, language, 'What do you want to do?'),
    confirmLabel: resolveRequiredText(config?.openLabel, language, 'Open existing record'),
    cancelLabel: resolveRequiredText(config?.changeLabel, language, 'Change customer, service or date')
  };
};
