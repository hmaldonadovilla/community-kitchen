import { matchesWhenClause, validateRules } from '../../../core';
import type { FieldValue, LangCode, ValidationRule, VisibilityContext } from '../../../types';
import type { LineItemState } from '../../types';

/**
 * Owner: guided virtual row visibility and validation context.
 * Builds row-scoped rule contexts without depending on React state or render
 * lifecycle.
 */
export const buildVirtualRowWhenContext = (args: {
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  lineItems: LineItemState;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): VisibilityContext => ({
  getValue: (fieldId: string) => {
    if (Object.prototype.hasOwnProperty.call(args.rowValues || {}, fieldId)) return (args.rowValues as any)[fieldId];
    if (args.parentValues && Object.prototype.hasOwnProperty.call(args.parentValues, fieldId)) return (args.parentValues as any)[fieldId];
    return args.resolveTopValue(fieldId);
  },
  getLineItems: (groupId: string) => args.lineItems[groupId] || [],
  getLineItemKeys: () => Object.keys(args.lineItems)
});

export const validateVirtualFieldRulesAction = (args: {
  field: any;
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  language: LangCode;
  lineItems: LineItemState;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): string[] => {
  const rules = Array.isArray(args.field?.validationRules)
    ? (args.field.validationRules as ValidationRule[]).filter(rule => rule?.then?.fieldId === args.field?.id)
    : [];
  if (!rules.length) return [];
  const ctx = {
    ...buildVirtualRowWhenContext({
      rowValues: args.rowValues,
      parentValues: args.parentValues,
      lineItems: args.lineItems,
      resolveTopValue: args.resolveTopValue
    }),
    language: args.language,
    phase: 'submit',
    isHidden: () => false
  } as any;
  return validateRules(rules, ctx)
    .map(issue => (issue?.message || '').toString().trim())
    .filter(Boolean);
};

export const resolveVirtualMaxFieldIdAction = (args: {
  field: any;
  rowValues: Record<string, FieldValue>;
  parentValues: Record<string, FieldValue>;
  lineItems: LineItemState;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): string => {
  const rules = Array.isArray(args.field?.validationRules) ? (args.field.validationRules as any[]) : [];
  const fieldId = `${args.field?.id || ''}`.trim();
  if (!fieldId) return '';
  const ctx = buildVirtualRowWhenContext({
    rowValues: args.rowValues,
    parentValues: args.parentValues,
    lineItems: args.lineItems,
    resolveTopValue: args.resolveTopValue
  });
  return rules.reduce<string>((matched, rule) => {
    if (matched) return matched;
    const thenCfg = rule?.then && typeof rule.then === 'object' ? rule.then : null;
    if (!thenCfg) return '';
    const targetFieldId = (thenCfg.fieldId || fieldId).toString().trim();
    if (targetFieldId !== fieldId) return '';
    const candidateMaxFieldId = (thenCfg.maxFieldId || '').toString().trim();
    if (!candidateMaxFieldId) return '';
    if (rule?.when && !matchesWhenClause(rule.when as any, ctx)) return '';
    return candidateMaxFieldId;
  }, '');
};

export const allowsVirtualIntegerOnlyAction = (args: {
  field: any;
  rowValues: Record<string, FieldValue>;
  parentValues: Record<string, FieldValue>;
  lineItems: LineItemState;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): boolean => {
  const rules = Array.isArray(args.field?.validationRules) ? (args.field.validationRules as any[]) : [];
  const fieldId = `${args.field?.id || ''}`.trim();
  if (!fieldId) return false;
  const ctx = buildVirtualRowWhenContext({
    rowValues: args.rowValues,
    parentValues: args.parentValues,
    lineItems: args.lineItems,
    resolveTopValue: args.resolveTopValue
  });
  return rules.some((rule: any) => {
    const thenCfg = rule?.then && typeof rule.then === 'object' ? rule.then : null;
    if (!thenCfg) return false;
    const targetFieldId = (thenCfg.fieldId || fieldId).toString().trim();
    if (targetFieldId !== fieldId) return false;
    if (thenCfg.integer !== true) return false;
    if (!rule?.when) return true;
    return matchesWhenClause(rule.when as any, ctx);
  });
};
