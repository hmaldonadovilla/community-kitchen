import { matchesWhenClause } from '../../../../rules/visibility';
import type { VisibilityContext, WhenClause } from '../../../../types';

type StepVisibilityConfig = {
  includeWhen?: WhenClause;
  excludeWhen?: WhenClause;
};

export const isGuidedStepVisible = (
  step: StepVisibilityConfig | null | undefined,
  ctx: VisibilityContext
): boolean => {
  if (!step) return false;
  const includeOk = step.includeWhen ? matchesWhenClause(step.includeWhen as WhenClause, ctx) : true;
  const excludeMatch = step.excludeWhen ? matchesWhenClause(step.excludeWhen as WhenClause, ctx) : false;
  return includeOk && !excludeMatch;
};

export const filterVisibleGuidedSteps = <T extends StepVisibilityConfig>(
  steps: T[] | null | undefined,
  ctx: VisibilityContext
): T[] => {
  const list = Array.isArray(steps) ? steps : [];
  return list.filter(step => isGuidedStepVisible(step, ctx));
};
