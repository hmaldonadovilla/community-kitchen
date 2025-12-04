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

const normalizeValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toString();
};

export function buildLocalizedOptions(options: OptionSet, allowed: string[], language: LangCode): OptionItem[] {
  const langKey = (language || 'en').toString().toLowerCase();
  const labels = options[langKey] || options.en || [];
  const baseOpts = options.en || labels;
  const allowedSet = allowed && allowed.length ? new Set(allowed) : null;
  const values = allowedSet ? allowed : baseOpts;
  const seen = new Set<string>();
  const items: OptionItem[] = [];

  const buildItem = (value: string): OptionItem => {
    const labelIdx = baseOpts.findIndex(opt => opt === value);
    const label =
      labelIdx >= 0
        ? labels[labelIdx] || value
        : (() => {
            const fallbackIdx = baseOpts.findIndex(opt => normalizeValue(opt) === value);
            if (fallbackIdx >= 0) {
              return labels[fallbackIdx] || baseOpts[fallbackIdx];
            }
            return value;
          })();
    const resolvedIndex = labelIdx >= 0 ? labelIdx : baseOpts.findIndex(opt => opt === value);
    return {
      value,
      label,
      labels: {
        en: options.en?.[resolvedIndex] || value,
        fr: options.fr?.[resolvedIndex] || value,
        nl: options.nl?.[resolvedIndex] || value
      }
    };
  };

  values.forEach(entry => {
    const normalized = normalizeValue(entry);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(buildItem(normalized));
  });

  return items;
}
