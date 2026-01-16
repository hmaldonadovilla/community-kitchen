import { LangCode } from '../../../types';

export type ChoiceControlVariant = 'select' | 'radio' | 'segmented' | 'switch';

export type OptionLike = {
  value: string;
  label: string;
  labels?: Record<string, string>;
  tooltip?: string;
  searchText?: string;
};

export type BooleanChoiceMap = { trueValue: string; falseValue: string };

const normalizeBoolToken = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const BOOL_TRUE_TOKENS = new Set(['yes', 'y', 'true', 'on', '1', 'oui', 'vrai', 'ja', 'waar', 'aan']);
const BOOL_FALSE_TOKENS = new Set(['no', 'n', 'false', 'off', '0', 'non', 'faux', 'nee', 'onwaar', 'uit']);

const detectBooleanChoice = (options: OptionLike[]): BooleanChoiceMap | null => {
  if (!options || options.length !== 2) return null;
  const score = (opt: OptionLike): { isTrue: boolean; isFalse: boolean } => {
    const candidates = [opt.value, opt.label, opt.labels?.en, opt.labels?.fr, opt.labels?.nl].filter(Boolean);
    const tokens = candidates.map(normalizeBoolToken).filter(Boolean);
    return {
      isTrue: tokens.some(t => BOOL_TRUE_TOKENS.has(t)),
      isFalse: tokens.some(t => BOOL_FALSE_TOKENS.has(t))
    };
  };
  const a = score(options[0]);
  const b = score(options[1]);
  const isValid =
    (a.isTrue && b.isFalse && !a.isFalse && !b.isTrue) ||
    (a.isFalse && b.isTrue && !a.isTrue && !b.isFalse);
  if (!isValid) return null;
  const trueValue = a.isTrue ? options[0].value : options[1].value;
  const falseValue = a.isFalse ? options[0].value : options[1].value;
  if (!trueValue || !falseValue) return null;
  return { trueValue, falseValue };
};

export const resolveNoneLabel = (language: LangCode): string => {
  if (language === 'FR') return 'Aucun';
  if (language === 'NL') return 'Geen';
  return 'None';
};

export const computeChoiceControlVariant = (
  options: OptionLike[],
  required: boolean,
  override?: string | null
): { variant: ChoiceControlVariant; booleanMap?: BooleanChoiceMap; booleanDetected: boolean } => {
  const normalizedOverride = (override || '').toString().trim().toLowerCase();
  const booleanMap = detectBooleanChoice(options);

  if (normalizedOverride && normalizedOverride !== 'auto') {
    if (normalizedOverride === 'switch') {
      return booleanMap
        ? { variant: 'switch', booleanMap, booleanDetected: true }
        : { variant: 'select', booleanDetected: false };
    }
    if (
      normalizedOverride === 'select' ||
      normalizedOverride === 'radio' ||
      normalizedOverride === 'segmented'
    ) {
      return { variant: normalizedOverride as ChoiceControlVariant, booleanDetected: !!booleanMap };
    }
  }

  if (booleanMap && !required) {
    return { variant: 'switch', booleanMap, booleanDetected: true };
  }
  if (options.length > 0 && options.length <= 3) {
    return { variant: 'segmented', booleanDetected: !!booleanMap };
  }
  if (options.length > 0 && options.length <= 6) {
    return { variant: 'radio', booleanDetected: !!booleanMap };
  }
  return { variant: 'select', booleanDetected: !!booleanMap };
};

