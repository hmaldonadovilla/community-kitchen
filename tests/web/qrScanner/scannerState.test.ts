import { buildQrScannerCandidateMessage } from '../../../src/web/qrScanner/openerProtocol';
import {
  appendCheckingCandidate,
  applyCandidateResult,
  countScannerCandidates,
  failCheckingCandidates,
  fingerprintQrValue,
  retainScannerCommitRequestId
} from '../../../src/web/qrScanner/scannerState';

describe('continuous QR scanner candidate state', () => {
  it('shows a checking row immediately and replaces it with the authoritative result', () => {
    const checking = appendCheckingCandidate([], 'scan-1');
    expect(checking).toEqual([
      {
        scanId: 'scan-1',
        status: 'checking',
        message: 'Checking receipt...'
      }
    ]);

    const accepted = applyCandidateResult(
      checking,
      buildQrScannerCandidateMessage('request-1', {
        scanId: 'scan-1',
        status: 'accepted',
        displayName: 'Receipt 17',
        message: 'Receipt checked and ready to add.'
      })
    );
    expect(accepted[0]).toEqual({
      scanId: 'scan-1',
      status: 'accepted',
      displayName: 'Receipt 17',
      message: 'Receipt checked and ready to add.'
    });
  });

  it('counts accepted, checking, and all not-added results', () => {
    const candidates = [
      ...appendCheckingCandidate([], 'checking'),
      {
        scanId: 'accepted',
        status: 'accepted' as const,
        message: 'Ready'
      },
      {
        scanId: 'duplicate',
        status: 'duplicate' as const,
        message: 'Duplicate'
      },
      {
        scanId: 'error',
        status: 'error' as const,
        message: 'Try again'
      }
    ];
    expect(countScannerCandidates(candidates)).toEqual({ checking: 1, accepted: 1, notAdded: 2 });
  });

  it('marks only pending checks as failed when the session becomes unavailable', () => {
    const candidates = [
      ...appendCheckingCandidate([], 'checking'),
      {
        scanId: 'accepted',
        status: 'accepted' as const,
        message: 'Ready'
      }
    ];

    expect(failCheckingCandidates(candidates, 'Open a fresh scanner session.')).toEqual([
      {
        scanId: 'checking',
        status: 'error',
        code: 'SESSION_UNAVAILABLE',
        message: 'Open a fresh scanner session.'
      },
      candidates[1]
    ]);
  });

  it('keeps the queue bounded and uses a non-raw frame fingerprint', () => {
    let candidates = appendCheckingCandidate([], 'scan-0', 3);
    candidates = appendCheckingCandidate(candidates, 'scan-1', 3);
    candidates = appendCheckingCandidate(candidates, 'scan-2', 3);
    candidates = appendCheckingCandidate(candidates, 'scan-3', 3);
    expect(candidates.map(candidate => candidate.scanId)).toEqual(['scan-1', 'scan-2', 'scan-3']);

    const raw = 'https://drive.google.com/file/d/1234567890abcdefghij/view';
    expect(fingerprintQrValue(raw)).toBe(fingerprintQrValue(raw));
    expect(fingerprintQrValue(raw)).not.toContain('drive.google.com');
  });

  it('reuses one commit request id after an uncertain response', () => {
    const createRequestId = jest.fn(() => 'commit-1');
    const first = retainScannerCommitRequestId('', createRequestId);
    const retry = retainScannerCommitRequestId(first, createRequestId);

    expect(first).toBe('commit-1');
    expect(retry).toBe('commit-1');
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });
});
