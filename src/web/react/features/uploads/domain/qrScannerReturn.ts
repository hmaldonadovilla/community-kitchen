export type NativeQrScannerReturnAction = 'none' | 'commit' | 'cancel';

export interface NativeQrScannerReturnSession {
  status?: string;
  counts?: { authorised?: unknown };
  candidates?: Array<{ status?: unknown }>;
}

/** Decides how the foreground form should finish an iOS scanner session. */
export const resolveNativeQrScannerReturnAction = (
  session: NativeQrScannerReturnSession,
  options: { allowEmptyCancel?: boolean } = {}
): NativeQrScannerReturnAction => {
  if (session.status !== 'ACTIVE') return 'none';
  const projectedCount = Number(session.counts?.authorised);
  const authorised = Number.isSafeInteger(projectedCount) && projectedCount >= 0
    ? projectedCount
    : (session.candidates || []).filter(candidate => candidate.status === 'AUTHORISED').length;
  if (authorised > 0) return 'commit';
  return options.allowEmptyCancel ? 'cancel' : 'none';
};
