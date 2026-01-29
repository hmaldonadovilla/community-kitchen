import { LangCode, LineItemSelectorConfig, OptionSet } from '../../../types';

export const resolveSelectorLabel = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  if (language === 'FR') return selector.labelFr || selector.labelEn || selector.id;
  if (language === 'NL') return selector.labelNl || selector.labelEn || selector.id;
  return selector.labelEn || selector.id;
};

export const resolveSelectorPlaceholder = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  const raw = selector.placeholder;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (language === 'FR') return (raw as any).fr || (raw as any).en || '';
    if (language === 'NL') return (raw as any).nl || (raw as any).en || '';
    return (raw as any).en || '';
  }
  if (language === 'FR') return selector.placeholderFr || selector.placeholderEn || '';
  if (language === 'NL') return selector.placeholderNl || selector.placeholderEn || '';
  return selector.placeholderEn || '';
};

export const resolveSelectorHelperText = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  const raw = selector.helperText;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (language === 'FR') return (raw as any).fr || (raw as any).en || '';
    if (language === 'NL') return (raw as any).nl || (raw as any).en || '';
    return (raw as any).en || '';
  }
  if (language === 'FR') return selector.helperTextFr || selector.helperTextEn || '';
  if (language === 'NL') return selector.helperTextNl || selector.helperTextEn || '';
  return selector.helperTextEn || '';
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
