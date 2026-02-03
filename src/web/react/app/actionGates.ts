import { matchesWhenClause } from '../../core';
import { getSystemFieldValue, type SystemRecordMeta } from '../../rules/systemFields';
import type { SystemActionGatesConfig, SystemActionGateRule, SystemActionId } from '../../../types';
import type { FieldValue, VisibilityContext } from '../../types';
import type { LineItemState } from '../types';
import { resolveVirtualStepField, type GuidedStepsVirtualState } from '../features/steps/domain/resolveVirtualStepField';

export type SystemActionGateResult = {
  hidden: boolean;
  disabled: boolean;
  matchedRuleId?: string;
  matchedRule?: SystemActionGateRule;
};

const normalizeRules = (raw: SystemActionGateRule | SystemActionGateRule[] | undefined): SystemActionGateRule[] => {
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [raw];
};

export const buildSystemActionGateContext = (args: {
  actionId: SystemActionId;
  view: string;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  recordMeta?: SystemRecordMeta | null;
  guidedVirtualState?: GuidedStepsVirtualState | null;
}): VisibilityContext => {
  const { actionId, view, values, lineItems, recordMeta, guidedVirtualState } = args;

  const resolveValue = (fieldId: string): FieldValue | undefined => {
    const fid = (fieldId || '').toString();
    if (!fid) return undefined;

    if (fid === '__ckView') return (view || '').toString();
    if (fid === '__ckAction') return (actionId || '').toString();

    if (guidedVirtualState) {
      const virtual = resolveVirtualStepField(fid, guidedVirtualState);
      if (virtual !== undefined) return virtual as any;
    }

    const direct = (values as any)[fid];
    if (direct !== undefined && direct !== null && direct !== '') return direct as any;

    const sys = getSystemFieldValue(fid, recordMeta || null);
    if (sys !== undefined) return sys as any;

    // Best-effort: scan current line item rows for the first non-empty occurrence.
    for (const rows of Object.values(lineItems || {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows as any[]) {
        const v = (row as any)?.values?.[fid];
        if (v !== undefined && v !== null && v !== '') return v as any;
      }
    }

    return undefined;
  };

  return {
    getValue: (fieldId: string) => resolveValue(fieldId),
    getLineItems: (groupId: string) => (lineItems as any)[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  } as any;
};

export const evaluateSystemActionGate = (args: {
  gates?: SystemActionGatesConfig;
  actionId: SystemActionId;
  ctx: VisibilityContext;
}): SystemActionGateResult => {
  const rules = normalizeRules(args.gates?.[args.actionId]);
  for (const rule of rules) {
    const when = (rule as any)?.when;
    if (!when) continue;
    if (!matchesWhenClause(when as any, args.ctx as any)) continue;

    if (rule.hide === true) {
      return { hidden: true, disabled: false, matchedRuleId: rule.id || undefined, matchedRule: rule };
    }
    if (rule.disable === true) {
      return { hidden: false, disabled: true, matchedRuleId: rule.id || undefined, matchedRule: rule };
    }
  }
  return { hidden: false, disabled: false };
};
