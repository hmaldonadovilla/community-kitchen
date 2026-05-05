import { buildLocalizedOptions, toOptionSet } from '../../../../core';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, OptionSet } from '../../../../types';
import { formatDateEeeDdMmmYyyy } from '../../../utils/valueDisplay';
import {
  normalizeValueList,
  type RowFlowResolvedSegment
} from '../../steps/domain/rowFlow';
import {
  listSortFor,
  optionSortFor,
  sortVisibleTextValues
} from './lineItemPresentation';

export const resolveRowFlowDisplayValueAction = (args: {
  segment: RowFlowResolvedSegment;
  targetGroupKey: string;
  field: any;
  parentValues?: Record<string, FieldValue>;
  fallbackGroupKey?: string;
  fallbackField?: any;
  fallbackParentValues?: Record<string, FieldValue>;
  language: LangCode;
  resolveTopValue: (fieldId: string) => FieldValue;
  ensureLineOptions: (groupKey: string, field: any) => void;
  resolveOptionSetForField: (field: any, groupKey: string) => OptionSet;
  resolveValueMapValue: (
    valueMap: any,
    resolveValue: (fieldId: string) => FieldValue,
    options?: { language?: LangCode; targetOptions?: OptionSet }
  ) => FieldValue;
}): { text: string; hasValue: boolean } => {
  const primaryValues = args.segment.values;
  const fallbackValuesForField = args.segment.fallbackValues || [];
  const useFallback = !primaryValues.length && !!fallbackValuesForField.length && !!args.fallbackField;
  const valuesForField = useFallback ? fallbackValuesForField : primaryValues;
  const effectiveField = useFallback ? args.fallbackField : args.field;
  const effectiveTargetGroupKey = useFallback ? (args.fallbackGroupKey || args.targetGroupKey) : args.targetGroupKey;
  const effectiveParentValues = useFallback ? args.fallbackParentValues : args.parentValues;
  const formatType = args.segment.config?.format?.type === 'list' ? 'list' : 'text';
  const listDelimiter = args.segment.config?.format?.listDelimiter || ', ';
  const uniqueValues = args.segment.config?.format?.unique !== false;
  const listSortMode = listSortFor(args.segment.config?.format?.sort);
  const rowValues = useFallback
    ? args.segment.fallbackTarget?.primaryRow?.row?.values || {}
    : args.segment.target?.primaryRow?.row?.values || {};
  const mapped = effectiveField?.valueMap
    ? args.resolveValueMapValue(
        effectiveField.valueMap,
        (fid: string) => (rowValues as any)[fid] ?? (effectiveParentValues as any)?.[fid] ?? args.resolveTopValue(fid),
        { language: args.language, targetOptions: toOptionSet(effectiveField as any) }
      )
    : undefined;
  const rawValues = effectiveField?.valueMap ? normalizeValueList(mapped as FieldValue) : valuesForField;
  if (!rawValues.length) return { text: '', hasValue: false };

  if (effectiveField?.type === 'CHOICE' || effectiveField?.type === 'CHECKBOX') {
    args.ensureLineOptions(effectiveTargetGroupKey, effectiveField);
    const optionSetField = args.resolveOptionSetForField(effectiveField, effectiveTargetGroupKey);
    const localized = buildLocalizedOptions(optionSetField, optionSetField.en || [], args.language, {
      sort: optionSortFor(effectiveField)
    });
    const labels = rawValues.map(val => {
      const raw = Array.isArray(val) ? val[0] : val;
      const match = localized.find(opt => opt.value === raw);
      return (match?.label || raw || '').toString();
    });
    const normalizedLabels = uniqueValues ? Array.from(new Set(labels.filter(Boolean))) : labels.filter(Boolean);
    const orderedLabels = sortVisibleTextValues(normalizedLabels, listSortMode);
    const text = formatType === 'list' ? orderedLabels.join(listDelimiter) : orderedLabels[0] || '';
    return { text, hasValue: text.trim() !== '' };
  }

  const labels = rawValues.map(val => {
    if (val === undefined || val === null) return '';
    if (effectiveField?.type === 'DATE') return formatDateEeeDdMmmYyyy(val, args.language) || val.toString();
    if (typeof val === 'boolean') {
      return val ? tSystem('common.yes', args.language, 'Yes') : tSystem('common.no', args.language, 'No');
    }
    return val.toString();
  });
  const normalizedLabels = uniqueValues ? Array.from(new Set(labels.filter(Boolean))) : labels.filter(Boolean);
  const orderedLabels = sortVisibleTextValues(normalizedLabels, listSortMode);
  const text = formatType === 'list' ? orderedLabels.join(listDelimiter) : orderedLabels[0] || '';
  return { text, hasValue: text.trim() !== '' };
};
