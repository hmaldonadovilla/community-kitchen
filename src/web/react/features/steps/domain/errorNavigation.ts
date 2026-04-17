export const shouldSuppressGuidedErrorStepNavigationAfterBack = (args: {
  guidedStepIds: string[];
  activeStepId?: string | null;
  desiredStepId?: string | null;
  suppressedStepId?: string | null;
  suppressUntil?: number | null;
  now?: number | null;
}): boolean => {
  const guidedStepIds = Array.isArray(args.guidedStepIds) ? args.guidedStepIds.filter(Boolean) : [];
  if (!guidedStepIds.length) return false;

  const activeStepId = `${args.activeStepId || ''}`.trim();
  const desiredStepId = `${args.desiredStepId || ''}`.trim();
  const suppressedStepId = `${args.suppressedStepId || ''}`.trim();
  if (!activeStepId || !desiredStepId || !suppressedStepId) return false;
  if (activeStepId !== suppressedStepId) return false;

  const rawSuppressUntil = Number(args.suppressUntil);
  if (!Number.isFinite(rawSuppressUntil) || rawSuppressUntil <= 0) return false;
  const now = Number.isFinite(Number(args.now)) ? Number(args.now) : Date.now();
  if (rawSuppressUntil < now) return false;

  const activeIdx = guidedStepIds.indexOf(activeStepId);
  const desiredIdx = guidedStepIds.indexOf(desiredStepId);
  if (activeIdx < 0 || desiredIdx < 0) return false;

  return desiredIdx > activeIdx;
};
