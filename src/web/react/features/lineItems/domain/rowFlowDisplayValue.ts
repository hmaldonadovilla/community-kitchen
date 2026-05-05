import type { CSSProperties } from 'react';
import { buildLocalizedOptions, toOptionSet } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  OptionSet,
  RowFlowOverlayContextHeaderConfig
} from '../../../../types';
import { formatDateEeeDdMmmYyyy } from '../../../utils/valueDisplay';
import {
  normalizeValueList,
  resolveRowFlowFieldTarget,
  type RowFlowResolvedState,
  type RowFlowResolvedSegment
} from '../../steps/domain/rowFlow';
import {
  listSortFor,
  optionSortFor,
  sortVisibleTextValues
} from './lineItemPresentation';

export type RowFlowOutputSegmentPresentation = {
  segmentType: string;
  segmentLayout: string;
  isBlockLayout: boolean;
  tone: string;
  segmentTextStyle: CSSProperties;
  segmentContainerStyle: CSSProperties;
  spacerStyle: CSSProperties;
};

export const resolveRowFlowOutputSegmentPresentationAction = (
  config?: { type?: unknown; layout?: unknown; tone?: unknown } | null
): RowFlowOutputSegmentPresentation => {
  const segmentType = ((config?.type || 'field').toString() || 'field').trim().toLowerCase();
  const segmentLayout = ((config?.layout || 'inline').toString() || 'inline').trim().toLowerCase();
  const isBlockLayout = segmentLayout === 'block';
  const tone = ((config?.tone || 'default').toString() || 'default').trim().toLowerCase();
  const segmentTextStyle: CSSProperties =
    tone === 'muted'
      ? { color: 'var(--muted)' }
      : tone === 'strong'
        ? { fontWeight: 600 }
        : {};
  const segmentContainerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    maxWidth: '100%',
    ...(isBlockLayout ? { flex: '1 0 100%', width: '100%' } : { flex: '0 1 auto' })
  };
  const spacerStyle: CSSProperties = {
    flex: '1 1 auto',
    minWidth: isBlockLayout ? '100%' : 0,
    width: isBlockLayout ? '100%' : undefined
  };

  return {
    segmentType,
    segmentLayout,
    isBlockLayout,
    tone,
    segmentTextStyle,
    segmentContainerStyle,
    spacerStyle
  };
};

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

export const buildRowFlowContextHeaderAction = (args: {
  config?: RowFlowOverlayContextHeaderConfig;
  rowId: string;
  rowValues: Record<string, FieldValue>;
  rowFlowState: RowFlowResolvedState;
  groupId: string;
  language: LangCode;
  resolveTopValue: (fieldId: string) => FieldValue;
  resolveRowFlowFieldConfig: (groupKey: string, fieldId: string) => any;
  resolveRowFlowDisplayValue: (
    segment: RowFlowResolvedSegment,
    targetGroupKey: string,
    field: any,
    parentValues?: Record<string, FieldValue>
  ) => { text: string; hasValue: boolean };
}): string => {
  const simpleText = resolveLocalizedString(args.config as any, args.language, '').trim();
  const fields = args.config?.fields || [];
  if (!fields.length) return simpleText;
  const parts = fields
    .map(entry => {
      const fieldRef = (entry?.fieldRef || '').toString().trim();
      if (!fieldRef) return '';
      const target = resolveRowFlowFieldTarget({
        fieldRef,
        groupId: args.groupId,
        rowId: args.rowId,
        rowValues: args.rowValues || {},
        references: args.rowFlowState.references
      });

      const valuesForField = (() => {
        if (target?.fieldId) {
          return (target.rows || []).flatMap(entry => normalizeValueList((entry.row?.values || {})[target.fieldId]));
        }
        return [];
      })();

      const resolveFallbackText = (): string => {
        const topVals = normalizeValueList(args.resolveTopValue(fieldRef));
        if (!topVals.length) return '';
        const text = topVals
          .map(value => {
            if (value === undefined || value === null) return '';
            if (fieldRef === 'MP_PREP_DATE') return formatDateEeeDdMmmYyyy(value, args.language) || value.toString();
            if (typeof value === 'boolean') {
              return value ? tSystem('common.yes', args.language, 'Yes') : tSystem('common.no', args.language, 'No');
            }
            return value.toString();
          })
          .filter(Boolean)
          .join(', ');
        return text;
      };

      const displayText = (() => {
        if (target?.fieldId && valuesForField.length) {
          const field = args.resolveRowFlowFieldConfig(target.groupKey, target.fieldId);
          const format = valuesForField.length > 1 ? { type: 'list' as const, listDelimiter: ', ' } : undefined;
          const display = field
            ? args.resolveRowFlowDisplayValue(
                {
                  id: fieldRef,
                  config: { fieldRef, format },
                  target,
                  values: valuesForField
                } as RowFlowResolvedSegment,
                target.groupKey,
                field,
                target.parentValues
              )
            : { text: valuesForField.map(value => (value ?? '').toString()).filter(Boolean).join(', '), hasValue: true };
          return display.text || '';
        }
        return resolveFallbackText();
      })();

      if (!displayText) return '';
      const label = resolveLocalizedString(entry?.label, args.language, '');
      if (!label) return displayText;
      return label.includes('{{value}}')
        ? label.replace('{{value}}', displayText)
        : `${label}: ${displayText}`;
    })
    .filter(Boolean);
  return parts.join(' ') || simpleText;
};
