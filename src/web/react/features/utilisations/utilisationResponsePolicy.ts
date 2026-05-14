const normalizeText = (raw: unknown): string => (raw === undefined || raw === null ? '' : raw.toString().trim());

const normalizePositiveNumber = (raw: unknown): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const issueUtilisationRequestEpoch = (latestEpoch: unknown): number =>
  normalizePositiveNumber(latestEpoch) + 1;

export const shouldApplyUtilisationPlanResponse = (args: {
  requestEpoch?: number | null;
  latestEpoch: number;
  requestSessionId?: number | null;
  currentSessionId: number;
  requestRecordId?: string | null;
  currentRecordId?: string | null;
}): boolean => {
  const requestEpoch = normalizePositiveNumber(args.requestEpoch);
  const latestEpoch = normalizePositiveNumber(args.latestEpoch);
  if (requestEpoch && latestEpoch && requestEpoch !== latestEpoch) return false;

  const requestSessionId = normalizePositiveNumber(args.requestSessionId);
  const currentSessionId = normalizePositiveNumber(args.currentSessionId);
  if (requestSessionId && currentSessionId && requestSessionId !== currentSessionId) return false;

  const requestRecordId = normalizeText(args.requestRecordId);
  const currentRecordId = normalizeText(args.currentRecordId);
  if (requestRecordId && currentRecordId && requestRecordId !== currentRecordId) return false;

  return true;
};
