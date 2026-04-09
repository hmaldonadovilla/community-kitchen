import { matchesWhenClause } from '../../core';
import type { LineItemState } from '../types';
import type { FieldValue, VisibilityContext } from '../../types';
import type { WhenClause } from '../../../types';
import type { GuidedStepsVirtualState } from '../features/steps/domain/resolveVirtualStepField';
import type { SystemRecordMeta } from '../../rules/systemFields';
import { buildSystemActionGateContext } from './actionGates';

export const isGuidedStepAutoAdvanceAllowed = (args: {
  when?: WhenClause | null;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  recordMeta?: SystemRecordMeta | null;
  guidedVirtualState?: GuidedStepsVirtualState | null;
}): boolean => {
  const { when, values, lineItems, recordMeta, guidedVirtualState } = args;
  if (!when) return true;

  const ctx = buildSystemActionGateContext({
    actionId: 'submit',
    view: 'form',
    values,
    lineItems,
    recordMeta,
    guidedVirtualState
  }) as VisibilityContext;

  return matchesWhenClause(when as any, ctx as any);
};
