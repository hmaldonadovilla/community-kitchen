import type { LangCode, WebQuestionDefinition } from '../../types';
import { validateRules } from '../../rules/validation';
import type { LineItemState } from '../types';
import { collectRejectDedupKeyFieldIds, hasIncompleteRejectDedupKeys } from './dedupKeyUtils';

const normalizeId = (raw: any): string => (raw === undefined || raw === null ? '' : raw.toString().trim());

const getValueByFieldId = (valuesRaw: Record<string, any>, fieldIdRaw: string): any => {
  const fieldId = normalizeId(fieldIdRaw);
  if (!fieldId) return undefined;
  const values = valuesRaw || {};
  if (Object.prototype.hasOwnProperty.call(values, fieldId)) return (values as any)[fieldId];
  const lower = fieldId.toLowerCase();
  for (const [key, value] of Object.entries(values)) {
    if (normalizeId(key).toLowerCase() === lower) return value;
  }
  return undefined;
};

export const hasInvalidRejectDedupKeyValues = (args: {
  dedupRules?: any;
  questions?: WebQuestionDefinition[] | null;
  values?: Record<string, any> | null;
  lineItems?: LineItemState | null;
  language?: LangCode;
}): boolean => {
  const keyFieldIds = collectRejectDedupKeyFieldIds(args.dedupRules);
  if (!keyFieldIds.length) return false;
  const keySet = new Set(keyFieldIds.map(fieldId => fieldId.toLowerCase()));
  const questions = Array.isArray(args.questions) ? args.questions : [];
  const values = args.values || {};
  const lineItems = args.lineItems || {};

  return questions.some(question => {
    const fieldId = normalizeId(question?.id);
    if (!fieldId || !keySet.has(fieldId.toLowerCase())) return false;
    const rules = Array.isArray((question as any)?.validationRules) ? ((question as any).validationRules as any[]) : [];
    if (!rules.length) return false;
    const errors = validateRules(rules as any, {
      language: args.language || 'en',
      phase: 'submit',
      getValue: (targetFieldId: string) => getValueByFieldId(values, targetFieldId),
      getLineItems: (groupId: string) => (lineItems as any)[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {}),
      isHidden: () => false
    } as any);
    return errors.some(error => keySet.has(normalizeId(error.fieldId).toLowerCase()));
  });
};

export const shouldDeferCopiedDraftCreation = (args: {
  dedupRules?: any;
  questions?: WebQuestionDefinition[] | null;
  values?: Record<string, any> | null;
  lineItems?: LineItemState | null;
  language?: LangCode;
  existingRecordId?: string | null;
}): boolean => {
  const existingRecordId = (args.existingRecordId || '').toString().trim();
  if (existingRecordId) return false;
  return (
    hasIncompleteRejectDedupKeys(args.dedupRules, args.values || {}) ||
    hasInvalidRejectDedupKeyValues({
      dedupRules: args.dedupRules,
      questions: args.questions,
      values: args.values,
      lineItems: args.lineItems,
      language: args.language
    })
  );
};
