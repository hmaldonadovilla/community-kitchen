import type { LangCode, LineItemDedupRule } from '../../../../types';
import { normalizeLineItemDedupRules } from '../../../app/lineItems';
import { resolveLineItemDedupMessage } from './formViewHelpers';

const SENTINEL = '__CK_DEDUP_VALUE__';

const matchesTemplateMessage = (template: string, message: string): boolean => {
  if (!template) return false;
  if (!template.includes(SENTINEL)) return template === message;
  const [prefix, ...rest] = template.split(SENTINEL);
  const suffix = rest.join(SENTINEL);
  return message.startsWith(prefix) && message.endsWith(suffix) && message.length >= prefix.length + suffix.length;
};

export const isLineItemDedupErrorMessage = (args: {
  rules: LineItemDedupRule[];
  language: LangCode;
  message?: string | null;
}): boolean => {
  const message = (args.message || '').toString();
  if (!message) return false;
  return (args.rules || []).some(rule => {
    const template = resolveLineItemDedupMessage(rule, args.language, { value: SENTINEL });
    return matchesTemplateMessage(template, message);
  });
};

export const shouldPreserveLineItemDedupError = (args: {
  groupConfig?: any;
  language: LangCode;
  message?: string | null;
}): boolean => {
  const rules = normalizeLineItemDedupRules(args.groupConfig?.dedupRules);
  if (!rules.length) return false;
  return isLineItemDedupErrorMessage({ rules, language: args.language, message: args.message });
};

export const applyLineItemDedupConflictErrors = (args: {
  errors: Record<string, string>;
  groupId: string;
  rowId: string;
  changedFieldId: string;
  conflictFieldId: string;
  conflictFields: string[];
  conflictMessage: string;
  dedupErrorFieldIds: string[];
  rules: LineItemDedupRule[];
  language: LangCode;
}): Record<string, string> => {
  const next = { ...(args.errors || {}) };
  const changedFieldPath = `${args.groupId}__${args.changedFieldId}__${args.rowId}`;
  if ((args.conflictFields || []).includes(args.changedFieldId)) {
    delete next[changedFieldPath];
  }
  (args.dedupErrorFieldIds || []).forEach(fieldId => {
    const key = `${args.groupId}__${fieldId}__${args.rowId}`;
    if (isLineItemDedupErrorMessage({ rules: args.rules, language: args.language, message: next[key] })) {
      delete next[key];
    }
  });
  next[`${args.groupId}__${args.conflictFieldId}__${args.rowId}`] = args.conflictMessage;
  return next;
};

const collectLineItemDedupRules = (groupConfig?: any): LineItemDedupRule[] => {
  if (!groupConfig || typeof groupConfig !== 'object') return [];
  const rules = normalizeLineItemDedupRules(groupConfig.dedupRules);
  const nestedRules = (Array.isArray(groupConfig.subGroups) ? groupConfig.subGroups : []).flatMap((subGroup: any) =>
    collectLineItemDedupRules(subGroup)
  );
  return [...rules, ...nestedRules];
};

const isLineItemErrorKeyInScope = (key: string, groupKey: string): boolean => {
  if (!groupKey) return false;
  return key === groupKey || key.startsWith(`${groupKey}__`) || key.startsWith(`${groupKey}::`);
};

export const hasLineItemDedupErrorInScope = (args: {
  errors?: Record<string, string> | null;
  groupKey: string;
  groupConfig?: any;
  language: LangCode;
}): boolean => {
  const groupKey = (args.groupKey || '').toString().trim();
  if (!groupKey) return false;
  const rules = collectLineItemDedupRules(args.groupConfig);
  if (!rules.length) return false;
  return Object.entries(args.errors || {}).some(([key, message]) => {
    if (!isLineItemErrorKeyInScope(key, groupKey)) return false;
    return isLineItemDedupErrorMessage({ rules, language: args.language, message });
  });
};
