import { resolveLocalizedString } from '../../../../i18n';
import type { LangCode } from '../../../../types';

export type AddOverlayCopy = {
  title?: string;
  helperText?: string;
  searchHelperText?: string;
  placeholder?: string;
};

const resolveOptionalLocalizedCopy = (value: unknown, language: LangCode): string | undefined => {
  if (value === undefined || value === null) return undefined;
  return resolveLocalizedString(value as any, language, '').trim();
};

export const resolveAddOverlayCopy = (groupCfg: any, language: LangCode): AddOverlayCopy => {
  const cfg = groupCfg?.addOverlay || {};
  return {
    title: resolveOptionalLocalizedCopy(cfg.title, language),
    helperText: resolveOptionalLocalizedCopy(cfg.helperText, language),
    searchHelperText: resolveOptionalLocalizedCopy(cfg.searchHelperText, language),
    placeholder: resolveOptionalLocalizedCopy(cfg.placeholder, language)
  };
};
