export interface GuidedExternalSyncSignal {
  token: number;
  recordId: string;
  recordSessionId: number;
  reason: string;
}

const normalizeId = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const toPositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const shouldApplyGuidedExternalSyncSignal = (args: {
  signal?: GuidedExternalSyncSignal | null;
  handledToken?: number | null;
  currentRecordId?: string | null;
  currentRecordSessionId?: number | null;
}): boolean => {
  const signal = args.signal || null;
  if (!signal) return false;

  const token = toPositiveNumber(signal.token);
  if (token === null) return false;
  if (token === Number(args.handledToken)) return false;

  const signalRecordId = normalizeId(signal.recordId);
  const currentRecordId = normalizeId(args.currentRecordId);
  if (!signalRecordId || !currentRecordId || signalRecordId !== currentRecordId) return false;

  const signalSessionId = toPositiveNumber(signal.recordSessionId);
  const currentSessionId = toPositiveNumber(args.currentRecordSessionId);
  if (signalSessionId === null || currentSessionId === null) return false;

  return signalSessionId === currentSessionId;
};
