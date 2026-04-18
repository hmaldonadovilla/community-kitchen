import { matchesWhenClause } from '../../../../rules/visibility';
import type { VisibilityContext } from '../../../../types';

type StepBarAccessConfig = {
  navigation?: {
    stepBarAccessWhen?: any;
  } | null;
};

export const isGuidedStepBarAccessAllowed = (
  step: StepBarAccessConfig | null | undefined,
  ctx: VisibilityContext
): boolean => {
  const when = step?.navigation?.stepBarAccessWhen;
  if (!when) return true;
  return matchesWhenClause(when, ctx);
};
