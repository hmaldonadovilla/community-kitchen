import { createQrScannerSessionDispatcher } from '../../../src/services/webform/qrScannerAppsScript/facade';
import { AppsScriptQrScannerService } from '../../../src/services/webform/qrScannerAppsScript/service';

describe('Apps Script QR scanner RPC facade', () => {
  const authoritative = {
    fetchFormConfig: jest.fn(),
    fetchSubmissionById: jest.fn(),
    appendQrScannerUploadLinks: jest.fn()
  } as any;

  beforeEach(() => jest.clearAllMocks());

  test('rejects every method outside the fixed session allowlist before creating dependencies', () => {
    const dispatch = createQrScannerSessionDispatcher(authoritative);
    expect(dispatch({ method: 'qrScanner.deleteEverything', params: {} })).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'The scan session request is invalid.',
        retryable: false
      }
    });
    expect(authoritative.fetchFormConfig).not.toHaveBeenCalled();
  });

  test('returns a sanitized structured envelope for malformed allowed calls', () => {
    const dispatch = createQrScannerSessionDispatcher(authoritative, {
      sessions: { create: jest.fn(), get: jest.fn(() => null), mutate: jest.fn() } as any,
      driveRepository: { fetchMetadata: jest.fn() },
      crypto: {
        hash: jest.fn(() => 'digest'),
        deriveAccessToken: jest.fn(() => 'access'),
        matches: jest.fn(() => false),
        randomToken: jest.fn(() => 'opaque')
      },
      runtime: {
        now: () => new Date('2026-07-15T10:00:00.000Z'),
        getScriptProperty: () => null,
        getServiceUrl: () => 'https://script.google.com/macros/s/deployment/exec',
        getGeneratedAssetBaseUrl: () => 'https://stage-assets.web.app'
      }
    });
    const result = dispatch({ method: 'qrScanner.getSession', params: { accessToken: 'do-not-return-me' } });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'The scan session request is invalid.',
        retryable: false
      }
    });
    expect(JSON.stringify(result)).not.toContain('do-not-return-me');
  });

  test('routes addCandidates through the fixed dispatcher allowlist', () => {
    const expected = { results: [], session: { status: 'ACTIVE' } };
    const addCandidates = jest
      .spyOn(AppsScriptQrScannerService.prototype, 'addCandidates')
      .mockReturnValue(expected as any);
    const dispatch = createQrScannerSessionDispatcher(authoritative, {
      sessions: { create: jest.fn(), get: jest.fn(), mutate: jest.fn() } as any,
      driveRepository: { fetchMetadata: jest.fn() },
      crypto: {
        hash: jest.fn(() => 'digest'),
        deriveAccessToken: jest.fn(() => 'access'),
        matches: jest.fn(() => true),
        randomToken: jest.fn(() => 'opaque')
      },
      runtime: {
        now: () => new Date('2026-07-15T10:00:00.000Z'),
        getScriptProperty: () => null,
        getServiceUrl: () => 'https://script.google.com/macros/s/deployment/exec',
        getGeneratedAssetBaseUrl: () => 'https://stage-assets.web.app'
      }
    });
    const params = {
      sessionId: 'session-1',
      accessToken: 'access-1',
      requestId: 'batch-1',
      candidates: [{ scanId: 'scan-1', rawValue: 'https://drive.google.com/file/d/file123456/view' }]
    };

    expect(dispatch({ method: 'qrScanner.addCandidates', params })).toEqual({ ok: true, result: expected });
    expect(addCandidates).toHaveBeenCalledWith(params);
  });
});
