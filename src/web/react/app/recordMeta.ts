export const resolveUiRecordStatus = (args: {
  persistedStatus?: unknown;
  autoSaveDefaultStatus?: unknown;
  guidedForwardGateSatisfied?: boolean;
}): string | null => {
  const persisted = args.persistedStatus === undefined || args.persistedStatus === null
    ? ''
    : args.persistedStatus.toString().trim();
  if (persisted) return persisted;

  const fallback = args.autoSaveDefaultStatus === undefined || args.autoSaveDefaultStatus === null
    ? ''
    : args.autoSaveDefaultStatus.toString().trim();
  if (!fallback) return null;

  return args.guidedForwardGateSatisfied ? fallback : null;
};
