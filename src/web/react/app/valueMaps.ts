import { FieldValue, OptionFilter, WebFormDefinition } from '../../types';
import { LineItemState } from '../types';
import { resolveSubgroupKey } from './lineItems';

export const resolveValueMapValue = (valueMap: OptionFilter, getValue: (fieldId: string) => FieldValue): string => {
  if (!valueMap?.optionMap || !valueMap.dependsOn) return '';
  const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
  const depValues = dependsOn.map(dep => {
    const raw = getValue(dep);
    if (Array.isArray(raw)) return raw.join('|');
    return raw ?? '';
  });
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v.toString()));
  candidateKeys.push('*');
  const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
  const values = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
  const unique = Array.from(new Set(values.map(v => (v ?? '').toString().trim()).filter(Boolean)));
  return unique.join(', ');
};

export const resolveDerivedValue = (config: any, getter: (fieldId: string) => FieldValue): FieldValue => {
  if (!config) return undefined;
  if (config.op === 'addDays') {
    const base = getter(config.dependsOn);
    if (!base) return '';
    const baseDate = new Date(base as any);
    if (isNaN(baseDate.getTime())) return '';
    const offset = typeof config.offsetDays === 'number' ? config.offsetDays : Number(config.offsetDays || 0);
    const result = new Date(baseDate);
    result.setDate(result.getDate() + (isNaN(offset) ? 0 : offset));
    return result.toISOString().slice(0, 10);
  }
  return undefined;
};

export const applyValueMapsToLineRow = (
  fields: any[],
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): Record<string, FieldValue> => {
  const nextValues = { ...rowValues };
  fields
    .filter(field => field?.valueMap || field?.derivedValue)
    .forEach(field => {
      if (field.valueMap) {
        const computed = resolveValueMapValue(field.valueMap, fieldId => {
          if (fieldId === undefined || fieldId === null) return undefined;
          if (rowValues.hasOwnProperty(fieldId)) return nextValues[fieldId];
          return topValues[fieldId];
        });
        nextValues[field.id] = computed;
      }
      if (field.derivedValue) {
        const derived = resolveDerivedValue(field.derivedValue, fid => {
          if (fid === undefined || fid === null) return undefined;
          if (rowValues.hasOwnProperty(fid)) return nextValues[fid];
          return topValues[fid];
        });
        if (derived !== undefined) nextValues[field.id] = derived;
      }
    });
  return nextValues;
};

export const applyValueMapsToForm = (
  definition: WebFormDefinition,
  currentValues: Record<string, FieldValue>,
  currentLineItems: LineItemState
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let values = { ...currentValues };
  let lineItems = { ...currentLineItems };

  definition.questions.forEach(q => {
    if ((q as any).valueMap) {
      values[q.id] = resolveValueMapValue((q as any).valueMap, fieldId => values[fieldId]);
    }
    if ((q as any).derivedValue) {
      const derived = resolveDerivedValue((q as any).derivedValue, fieldId => values[fieldId]);
      if (derived !== undefined) values[q.id] = derived;
    }
    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const updatedRows = rows.map(row => ({
        ...row,
        values: applyValueMapsToLineRow(q.lineItemConfig!.fields, row.values, values)
      }));
      lineItems = { ...lineItems, [q.id]: updatedRows };

      // handle nested subgroups
      if (q.lineItemConfig.subGroups?.length) {
        rows.forEach(row => {
          q.lineItemConfig?.subGroups?.forEach(sub => {
            const key = resolveSubgroupKey(sub as any);
            if (!key) return;
            const subgroupKey = `${q.id}::${row.id}::${key}`;
            const subRows = lineItems[subgroupKey] || [];
            const updatedSubRows = subRows.map(subRow => ({
              ...subRow,
              values: applyValueMapsToLineRow((sub as any).fields || [], subRow.values, { ...values, ...row.values })
            }));
            lineItems = { ...lineItems, [subgroupKey]: updatedSubRows };
          });
        });
      }
    }
  });

  return { values, lineItems };
};



