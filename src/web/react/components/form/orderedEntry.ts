import { shouldHideField, toOptionSet } from '../../../core';
import type { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import type { LineItemState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import { parseSubgroupKey } from '../../app/lineItems';
import { resolveValueMapValue } from './valueMaps';
import { isUploadValueComplete } from './utils';
import { isLineItemGroupQuestionComplete } from './completeness';

export type OrderedEntryTarget =
  | { scope: 'top'; questionId: string }
  | { scope: 'line'; groupId: string; rowId: string; fieldId: string };

export type OrderedEntryBlock = {
  missingFieldPath: string;
  scope: 'top' | 'line';
  reason: 'missingRequired';
};

const isRequiredFieldMissing = (args: {
  field: any;
  rawValue: FieldValue | undefined;
  mappedValue?: FieldValue;
  required: boolean;
}): boolean => {
  const { field, rawValue, mappedValue, required } = args;
  if (!required) return false;
  const value = field?.valueMap ? mappedValue : rawValue;
  if (field?.type === 'FILE_UPLOAD') {
    return !isUploadValueComplete({ value: value as any, uploadConfig: field?.uploadConfig, required: true });
  }
  return isEmptyValue(value as any);
};

const resolveTopQuestionMissing = (args: {
  question: WebQuestionDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows?: Record<string, boolean>;
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): boolean => {
  const { question, language, values, lineItems, collapsedRows, resolveVisibilityValue, getTopValue } = args;
  if (!question.required) return false;
  const hidden = shouldHideField(question.visibility, { getValue: resolveVisibilityValue });
  if (hidden) return false;
  if (question.type === 'LINE_ITEM_GROUP') {
    if (!question.lineItemConfig) return true;
    return !isLineItemGroupQuestionComplete({
      groupId: question.id,
      lineItemConfig: question.lineItemConfig,
      values,
      lineItems,
      collapsedRows,
      language,
      getTopValue
    });
  }
  const mapped = question.valueMap
    ? resolveValueMapValue(question.valueMap, (fieldId: string) => getTopValue(fieldId), {
        language,
        targetOptions: toOptionSet(question as any)
      })
    : undefined;
  return isRequiredFieldMissing({
    field: question,
    rawValue: values[question.id],
    mappedValue: mapped,
    required: true
  });
};

const resolveLineFieldMissing = (args: {
  field: any;
  rowValues: Record<string, FieldValue>;
  language: LangCode;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): boolean => {
  const { field, rowValues, language, getTopValue } = args;
  const mapped = field?.valueMap
    ? resolveValueMapValue(field.valueMap, (fieldId: string) => {
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
        return getTopValue(fieldId);
      }, { language, targetOptions: toOptionSet(field as any) })
    : undefined;
  return isRequiredFieldMissing({
    field,
    rawValue: rowValues[field?.id],
    mappedValue: mapped,
    required: !!field?.required
  });
};

export const findOrderedEntryBlock = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows?: Record<string, boolean>;
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  orderedQuestions: WebQuestionDefinition[];
  target: OrderedEntryTarget;
  targetGroup?: WebQuestionDefinition;
}): OrderedEntryBlock | null => {
  const {
    definition,
    language,
    values,
    lineItems,
    collapsedRows,
    resolveVisibilityValue,
    getTopValue,
    orderedQuestions,
    target,
    targetGroup
  } = args;
  const topQuestions = orderedQuestions.length ? orderedQuestions : definition.questions || [];
  const targetTopId = (() => {
    if (target.scope === 'top') return target.questionId;
    const parsed = parseSubgroupKey(target.groupId);
    return parsed?.parentGroupId || target.groupId;
  })();
  const targetIndex = topQuestions.findIndex((q: WebQuestionDefinition) => q.id === targetTopId);
  if (targetIndex > 0) {
    for (let idx = 0; idx < targetIndex; idx += 1) {
      const question = topQuestions[idx];
      if (!question) continue;
      if (
        resolveTopQuestionMissing({
          question,
          language,
          values,
          lineItems,
          collapsedRows,
          resolveVisibilityValue,
          getTopValue
        })
      ) {
        return { missingFieldPath: question.id, scope: 'top', reason: 'missingRequired' };
      }
    }
  }

  if (target.scope !== 'line' || !targetGroup?.lineItemConfig?.fields) return null;
  const fields = targetGroup.lineItemConfig.fields || [];
  const rowId = target.rowId;
  const rowValues = ((lineItems[target.groupId] || []) as any[]).find(row => row?.id === rowId)?.values || {};
  const targetFieldId = target.fieldId?.toString?.() || '';
  const targetFieldIndex = fields.findIndex((field: any) => (field?.id || '').toString() === targetFieldId);
  if (targetFieldIndex <= 0) return null;

  const groupCtx: VisibilityContext = {
    getValue: (fid: string) => resolveVisibilityValue(fid),
    getLineValue: (_rowId: string, fid: string) => rowValues[fid]
  };

  for (let idx = 0; idx < targetFieldIndex; idx += 1) {
    const field = fields[idx];
    if (!field?.required) continue;
    const hidden = shouldHideField(field.visibility, groupCtx, { rowId, linePrefix: target.groupId });
    if (hidden) continue;
    if (resolveLineFieldMissing({ field, rowValues, language, getTopValue })) {
      return {
        missingFieldPath: `${target.groupId}__${field.id}__${rowId}`,
        scope: 'line',
        reason: 'missingRequired'
      };
    }
  }

  return null;
};
