import { shouldHideField, toOptionSet } from '../../../core';
import type { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import type { LineItemState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import { parseSubgroupKey } from '../../app/lineItems';
import { resolveParagraphUserText } from '../../app/paragraphDisclaimer';
import { matchesWhenClause } from '../../../rules/visibility';
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
  const requiredValue =
    field?.type === 'PARAGRAPH'
      ? resolveParagraphUserText({ rawValue: value as FieldValue, config: (field?.ui as any)?.paragraphDisclaimer })
      : value;
  if (field?.type === 'FILE_UPLOAD') {
    return !isUploadValueComplete({ value: value as any, uploadConfig: field?.uploadConfig, required: true });
  }
  return isEmptyValue(requiredValue as any);
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
  const hidden = shouldHideField(question.visibility, {
    getValue: resolveVisibilityValue,
    getLineItems: (groupId: string) => lineItems[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems)
  });
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
  parentValues?: Record<string, FieldValue>;
  language: LangCode;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  requiredOverride?: boolean;
}): boolean => {
  const { field, rowValues, parentValues, language, getTopValue, requiredOverride } = args;
  const mapped = field?.valueMap
    ? resolveValueMapValue(field.valueMap, (fieldId: string) => {
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
        if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return (parentValues as any)[fieldId];
        return getTopValue(fieldId);
      }, { language, targetOptions: toOptionSet(field as any) })
    : undefined;
  return isRequiredFieldMissing({
    field,
    rawValue: rowValues[field?.id],
    mappedValue: mapped,
    required: requiredOverride ?? !!field?.required
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
    return parsed?.rootGroupId || target.groupId;
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
  const parentValues = (() => {
    const merged: Record<string, FieldValue> = {};
    const mergeMissing = (source?: Record<string, FieldValue>) => {
      if (!source) return;
      Object.entries(source).forEach(([key, val]) => {
        if (Object.prototype.hasOwnProperty.call(merged, key)) return;
        merged[key] = val;
      });
    };
    let currentKey = target.groupId;
    let info = parseSubgroupKey(currentKey);
    while (info) {
      const currentInfo = info;
      const parentRows = lineItems[currentInfo.parentGroupKey] || [];
      const parentRow = parentRows.find(row => row.id === currentInfo.parentRowId);
      mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
      currentKey = currentInfo.parentGroupKey;
      info = parseSubgroupKey(currentKey);
    }
    return merged;
  })();
  const targetFieldId = target.fieldId?.toString?.() || '';
  const targetFieldIndex = fields.findIndex((field: any) => (field?.id || '').toString() === targetFieldId);
  if (targetFieldIndex <= 0) return null;

  const resolveLineValue = (fieldId: string): FieldValue | undefined => {
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
    if (Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return parentValues[fieldId];
    return getTopValue(fieldId);
  };

  const groupCtx: VisibilityContext = {
    getValue: (fid: string) => resolveLineValue(fid) ?? resolveVisibilityValue(fid),
    getLineValue: (_rowId: string, fid: string) => resolveLineValue(fid),
    getLineItems: (groupId: string) => lineItems[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  };

  const isFieldRequiredByRules = (field: any): boolean => {
    const rules = Array.isArray(field?.validationRules)
      ? field.validationRules.filter((rule: any) => !!rule)
      : [];
    if (!rules.length) return false;
    const missing = resolveLineFieldMissing({ field, rowValues, parentValues, language, getTopValue, requiredOverride: true });
    if (!missing) return false;
    const isHidden = (fieldId: string) => {
      const candidate = (fields || []).find((f: any) => (f?.id || '').toString() === fieldId) as any;
      if (!candidate) return false;
      return shouldHideField(candidate.visibility, groupCtx, { rowId, linePrefix: target.groupId });
    };
    return rules.some((rule: any) => {
      const thenFieldId = (rule?.then?.fieldId ?? '').toString();
      if (thenFieldId !== (field?.id ?? '').toString()) return false;
      if (rule?.then?.required !== true) return false;
      const phase = (rule?.phase || 'both').toString().trim().toLowerCase();
      if (phase !== 'both' && phase !== 'submit') return false;
      if (!rule?.when || !matchesWhenClause(rule.when as any, groupCtx as any)) return false;
      if (isHidden(thenFieldId)) return false;
      return true;
    });
  };

  for (let idx = 0; idx < targetFieldIndex; idx += 1) {
    const field = fields[idx];
    const hidden = shouldHideField(field.visibility, groupCtx, { rowId, linePrefix: target.groupId });
    if (hidden) continue;
    const missingByRequired =
      field?.required === true && resolveLineFieldMissing({ field, rowValues, parentValues, language, getTopValue });
    const missingByRules = field?.required !== true && isFieldRequiredByRules(field);
    if (missingByRequired || missingByRules) {
      return {
        missingFieldPath: `${target.groupId}__${field.id}__${rowId}`,
        scope: 'line',
        reason: 'missingRequired'
      };
    }
  }

  return null;
};
