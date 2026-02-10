import { shouldHideField, toOptionSet } from '../../../core';
import type { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import type { LineItemState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import { buildSubgroupKey, parseSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';
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
  reason: 'missingRequired' | 'invalid';
};

type FormErrors = Record<string, string>;

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

const hasAnyErrorInLineItemGroup = (errors: FormErrors, groupId: string): boolean => {
  if (!groupId) return false;
  const keys = Object.keys(errors || {});
  if (!keys.length) return false;
  return keys.some(k => k === groupId || k.startsWith(`${groupId}__`) || k.startsWith(`${groupId}::`));
};

const findFirstErrorInGroup = (args: {
  errors: FormErrors;
  lineItems: LineItemState;
  groupId: string;
  groupCfg: any;
}): string => {
  const { errors, lineItems, groupId, groupCfg } = args;
  if (!groupId) return '';
  if (errors[groupId]) return groupId;
  if (!groupCfg) return '';
  const rootRows = (lineItems[groupId] || []) as any[];
  const fields = Array.isArray(groupCfg?.fields) ? groupCfg.fields : [];
  const subGroups = Array.isArray(groupCfg?.subGroups) ? groupCfg.subGroups : [];

  const scanGroup = (scanArgs: { groupKey: string; groupCfg: any; rows: any[] }): string => {
    const { groupKey, groupCfg, rows } = scanArgs;
    if (!groupKey || !groupCfg || !Array.isArray(rows) || !rows.length) return '';
    const scanFields = Array.isArray(groupCfg?.fields) ? groupCfg.fields : [];
    const scanSubs = Array.isArray(groupCfg?.subGroups) ? groupCfg.subGroups : [];

    for (const row of rows) {
      const rowId = (row?.id ?? '').toString();
      if (!rowId) continue;
      for (const field of scanFields) {
        const fieldId = (field?.id ?? '').toString();
        if (!fieldId) continue;
        const key = `${groupKey}__${fieldId}__${rowId}`;
        if (errors[key]) return key;
      }
      for (const sub of scanSubs) {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) continue;
        const subKey = buildSubgroupKey(groupKey, rowId, subId);
        const subRows = (lineItems[subKey] || []) as any[];
        const hit = scanGroup({ groupKey: subKey, groupCfg: sub, rows: subRows });
        if (hit) return hit;
      }
    }
    return '';
  };

  const hit = scanGroup({ groupKey: groupId, groupCfg: { fields, subGroups }, rows: rootRows });
  if (hit) return hit;

  // Fallback (only when the group has no configured fields/subgroups): return a deterministic matching key.
  // Important: do not fall back when the group is step-scoped/filtered; hidden fields must not block ordered entry.
  if (!fields.length && !subGroups.length) {
    const candidates = Object.keys(errors || {}).filter(
      k => k === groupId || k.startsWith(`${groupId}__`) || k.startsWith(`${groupId}::`)
    );
    if (!candidates.length) return '';
    candidates.sort();
    return candidates[0];
  }
  return '';
};

const findFirstErrorInTopQuestion = (args: {
  question: WebQuestionDefinition;
  errors: FormErrors;
  lineItems: LineItemState;
}): string => {
  const { question, errors, lineItems } = args;
  if (!question) return '';
  if (question.type !== 'LINE_ITEM_GROUP') {
    const key = question.id;
    return errors[key] ? key : '';
  }
  const groupId = question.id;
  if (!hasAnyErrorInLineItemGroup(errors, groupId)) return '';
  const groupCfg = (question as any)?.lineItemConfig;
  return findFirstErrorInGroup({ errors, lineItems, groupId, groupCfg });
};

const findTopOrderedEntryBlock = (args: {
  topQuestions: WebQuestionDefinition[];
  stopBeforeIndex: number;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  errors: FormErrors;
  collapsedRows?: Record<string, boolean>;
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): OrderedEntryBlock | null => {
  const { topQuestions, stopBeforeIndex, language, values, lineItems, errors, collapsedRows, resolveVisibilityValue, getTopValue } = args;
  if (!Array.isArray(topQuestions) || !topQuestions.length) return null;
  const upperBound = Math.max(0, Math.min(stopBeforeIndex, topQuestions.length));

  for (let idx = 0; idx < upperBound; idx += 1) {
    const question = topQuestions[idx];
    if (!question) continue;
    const missing = resolveTopQuestionMissing({
      question,
      language,
      values,
      lineItems,
      collapsedRows,
      resolveVisibilityValue,
      getTopValue
    });
    const errorPath = findFirstErrorInTopQuestion({ question, errors, lineItems });
    if (missing) {
      // For line groups, prefer the first concrete field error so users get actionable guidance.
      if (errorPath) {
        return { missingFieldPath: errorPath, scope: 'top', reason: 'missingRequired' };
      }
      // In guided-step row-scoped configurations, row-filtered validation defines completeness.
      // Skip generic group blocking when no in-scope error exists.
      if (question.type === 'LINE_ITEM_GROUP' && (question as any)?.lineItemConfig?._guidedRowFilter !== undefined) {
        continue;
      }
      return { missingFieldPath: question.id, scope: 'top', reason: 'missingRequired' };
    }
    if (errorPath) {
      return { missingFieldPath: errorPath, scope: 'top', reason: 'invalid' };
    }
  }
  return null;
};

export const findFirstOrderedEntryIssue = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  errors?: FormErrors | null;
  collapsedRows?: Record<string, boolean>;
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  orderedQuestions: WebQuestionDefinition[];
}): OrderedEntryBlock | null => {
  const {
    definition,
    language,
    values,
    lineItems,
    collapsedRows,
    resolveVisibilityValue,
    getTopValue,
    orderedQuestions
  } = args;
  const errors: FormErrors = (args.errors && typeof args.errors === 'object' ? args.errors : {}) as FormErrors;
  const topQuestions = orderedQuestions.length ? orderedQuestions : definition.questions || [];
  return findTopOrderedEntryBlock({
    topQuestions,
    stopBeforeIndex: topQuestions.length,
    language,
    values,
    lineItems,
    errors,
    collapsedRows,
    resolveVisibilityValue,
    getTopValue
  });
};

export const findOrderedEntryBlock = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  errors?: FormErrors | null;
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
  const errors: FormErrors = (args.errors && typeof args.errors === 'object' ? args.errors : {}) as FormErrors;
  const topQuestions = orderedQuestions.length ? orderedQuestions : definition.questions || [];
  const targetTopId = (() => {
    if (target.scope === 'top') return target.questionId;
    const parsed = parseSubgroupKey(target.groupId);
    return parsed?.rootGroupId || target.groupId;
  })();

  const targetIndex = topQuestions.findIndex((q: WebQuestionDefinition) => q.id === targetTopId);
  if (targetIndex > 0) {
    const topBlock = findTopOrderedEntryBlock({
      topQuestions,
      stopBeforeIndex: targetIndex,
      language,
      values,
      lineItems,
      errors,
      collapsedRows,
      resolveVisibilityValue,
      getTopValue
    });
    if (topBlock) return topBlock;
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
    const errorKey = `${target.groupId}__${field.id}__${rowId}`;
    if (errors[errorKey]) {
      return {
        missingFieldPath: errorKey,
        scope: 'line',
        reason: 'invalid'
      };
    }
  }

  return null;
};
