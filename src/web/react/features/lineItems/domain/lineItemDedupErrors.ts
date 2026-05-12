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
