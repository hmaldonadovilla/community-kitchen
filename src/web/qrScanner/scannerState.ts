import type { QrScannerCandidateMessage, QrScannerCandidateStatus } from './openerProtocol';

export type ScannerCandidateViewStatus = 'checking' | QrScannerCandidateStatus;

export interface ScannerCandidateView {
  scanId: string;
  status: ScannerCandidateViewStatus;
  code?: string;
  displayName?: string;
  message: string;
}

export interface ScannerCandidateCounts {
  checking: number;
  accepted: number;
  notAdded: number;
}

export const DEFAULT_MAX_SCANNER_CANDIDATES = 20;

const candidateFallbackMessage = (status: QrScannerCandidateStatus): string => {
  if (status === 'accepted') return 'Receipt checked and ready to add.';
  if (status === 'duplicate') return 'This receipt was already scanned or linked.';
  if (status === 'rejected') return 'This receipt cannot be added.';
  return 'This receipt could not be checked. Try again.';
};

export const appendCheckingCandidate = (
  candidates: ScannerCandidateView[],
  scanId: string,
  maxCandidates = DEFAULT_MAX_SCANNER_CANDIDATES
): ScannerCandidateView[] => {
  if (!scanId || candidates.some(candidate => candidate.scanId === scanId)) return candidates;
  const next = [
    ...candidates,
    {
      scanId,
      status: 'checking' as const,
      message: 'Checking receipt...'
    }
  ];
  return next.slice(-Math.max(1, maxCandidates));
};

export const applyCandidateResult = (
  candidates: ScannerCandidateView[],
  result: QrScannerCandidateMessage
): ScannerCandidateView[] => {
  const replacement: ScannerCandidateView = {
    scanId: result.scanId,
    status: result.status,
    ...(result.code ? { code: result.code } : {}),
    ...(result.displayName ? { displayName: result.displayName } : {}),
    message: result.message || candidateFallbackMessage(result.status)
  };
  const index = candidates.findIndex(candidate => candidate.scanId === result.scanId);
  if (index < 0) return [...candidates, replacement].slice(-DEFAULT_MAX_SCANNER_CANDIDATES);
  return candidates.map((candidate, candidateIndex) => (candidateIndex === index ? replacement : candidate));
};

/** Resolves pending rows when the scanner session can no longer authorise them. */
export const failCheckingCandidates = (
  candidates: ScannerCandidateView[],
  message: string,
  code = 'SESSION_UNAVAILABLE'
): ScannerCandidateView[] =>
  candidates.map(candidate =>
    candidate.status === 'checking'
      ? {
          ...candidate,
          status: 'error',
          code,
          message
        }
      : candidate
  );

export const countScannerCandidates = (candidates: ScannerCandidateView[]): ScannerCandidateCounts =>
  candidates.reduce<ScannerCandidateCounts>(
    (counts, candidate) => {
      if (candidate.status === 'checking') counts.checking += 1;
      else if (candidate.status === 'accepted') counts.accepted += 1;
      else counts.notAdded += 1;
      return counts;
    },
    { checking: 0, accepted: 0, notAdded: 0 }
  );

/** Keeps one commit id across retries so an uncertain server write can reconcile. */
export const retainScannerCommitRequestId = (
  currentRequestId: string,
  createRequestId: () => string
): string => currentRequestId || createRequestId();

/** Non-reversible, in-memory key used only to suppress repeated camera frames. */
export const fingerprintQrValue = (rawValue: string): string => {
  const value = (rawValue || '').toString();
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16)}`;
};
