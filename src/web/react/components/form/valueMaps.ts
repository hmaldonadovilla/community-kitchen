import { toDependencyValue } from '../../../core';
import { FieldValue, LangCode, OptionFilter, OptionSet } from '../../../types';

export const resolveValueMapValue = (
  valueMap: OptionFilter,
  getValue: (fieldId: string) => FieldValue,
  opts?: { language?: LangCode; targetOptions?: OptionSet }
): string => {
  if (!valueMap?.optionMap || !valueMap.dependsOn) return '';
  const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
  const depValues = dependsOn.map(dep => toDependencyValue(getValue(dep)) ?? '');
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v.toString()));
  candidateKeys.push('*');
  const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
  const values = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
  const unique = Array.from(new Set(values.map(v => (v ?? '').toString().trim()).filter(Boolean)));
  if (!unique.length) return '';

  const optionSet = opts?.targetOptions;
  const language = opts?.language;
  if (!optionSet || !language) return unique.join(', ');

  const langKey = (language || 'EN').toString().trim().toUpperCase();
  const labels =
    (langKey === 'FR' ? optionSet.fr : langKey === 'NL' ? optionSet.nl : optionSet.en) || optionSet.en || [];
  const base = optionSet.en || labels;
  const localized = unique.map(value => {
    const idx = Array.isArray(base) ? base.findIndex(v => (v ?? '').toString() === value) : -1;
    const mapped = idx >= 0 && Array.isArray(labels) ? labels[idx] : undefined;
    const out = mapped !== undefined && mapped !== null ? mapped.toString().trim() : '';
    return out || value;
  });

  return localized.join(', ');
};

// Keep derivedValue helpers accessible from this module for convenience, but delegate to the canonical implementation.
export { resolveDerivedValue, applyValueMapsToLineRow, applyValueMapsToForm } from '../../app/valueMaps';



