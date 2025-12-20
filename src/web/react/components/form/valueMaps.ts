import { toDependencyValue } from '../../../core';
import { FieldValue, OptionFilter } from '../../../types';

export const resolveValueMapValue = (valueMap: OptionFilter, getValue: (fieldId: string) => FieldValue): string => {
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
  return unique.join(', ');
};

// Keep derivedValue helpers accessible from this module for convenience, but delegate to the canonical implementation.
export { resolveDerivedValue, applyValueMapsToLineRow, applyValueMapsToForm } from '../../app/valueMaps';



