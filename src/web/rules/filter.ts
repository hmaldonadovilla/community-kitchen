import { OptionFilter } from '../../types';
import { LangCode, OptionSet } from '../types';

export interface OptionItem {
  value: string;
  label: string;
  labels: Record<string, string>;
}

const normalize = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  return val.toString();
};

export function computeAllowedOptions(
  filter: OptionFilter | undefined,
  options: OptionSet,
  dependencyValues: (string | number | null | undefined)[]
): string[] {
  if (!filter) return options.en || [];

  const depValues = dependencyValues.map(v => normalize(v));
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v));
  candidateKeys.push('*');

  const match = candidateKeys.reduce<string[] | undefined>((acc, key) => acc || filter.optionMap[key], undefined);
  if (match) return match;
  return [];
}

export function buildLocalizedOptions(
  options: OptionSet,
  allowed: string[],
  language: LangCode
): OptionItem[] {
  const langKey = (language || 'en').toString().toLowerCase();
  const labels = options[langKey] || options.en || [];
  const baseOpts = options.en || labels;
  const allowedSet = allowed && allowed.length ? new Set(allowed) : null;
  const values = allowedSet ? allowed : baseOpts;
  const items: OptionItem[] = [];

  values.forEach((value, idx) => {
    const base = baseOpts[idx] || value;
    const labelIdx = baseOpts.indexOf(base);
    const label = labelIdx >= 0 ? (labels[labelIdx] || base) : value;
    items.push({
      value: base,
      label,
      labels: {
        en: options.en?.[labelIdx] || base,
        fr: options.fr?.[labelIdx] || base,
        nl: options.nl?.[labelIdx] || base
      }
    });
  });

  return items;
}
