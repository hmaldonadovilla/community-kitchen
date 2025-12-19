import { LangCode, LineItemSelectorConfig } from '../../types';

export const detectDebug = (): boolean => {
  try {
    return Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);
  } catch (_) {
    return false;
  }
};

export const resolveSelectorLabel = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  if (language === 'FR') return selector.labelFr || selector.labelEn || selector.id;
  if (language === 'NL') return selector.labelNl || selector.labelEn || selector.id;
  return selector.labelEn || selector.id;
};



