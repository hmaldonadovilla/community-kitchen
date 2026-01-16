import { LangCode, LineItemSelectorConfig, OptionSet } from '../../../types';

export const resolveSelectorLabel = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  if (language === 'FR') return selector.labelFr || selector.labelEn || selector.id;
  if (language === 'NL') return selector.labelNl || selector.labelEn || selector.id;
  return selector.labelEn || selector.id;
};

export const buildSelectorOptionSet = (selector?: LineItemSelectorConfig | null): OptionSet | null => {
  if (!selector) return null;
  const base = selector.options || [];
  return {
    en: base,
    fr: selector.optionsFr && selector.optionsFr.length ? selector.optionsFr : base,
    nl: selector.optionsNl && selector.optionsNl.length ? selector.optionsNl : base,
    raw: selector.optionsRaw
  };
};

