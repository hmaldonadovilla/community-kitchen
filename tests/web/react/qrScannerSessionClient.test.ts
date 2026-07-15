jest.mock('../../../src/web/react/api', () => ({
  qrScannerSessionRpcApi: jest.fn()
}));

import { qrScannerSessionRpcApi } from '../../../src/web/react/api';
import {
  addQrScannerCandidate,
  QrScannerSessionError,
  readQrScannerLaunchCredentials
} from '../../../src/web/react/features/uploads/services/qrScannerSessionClient';

const rpcMock = qrScannerSessionRpcApi as jest.MockedFunction<typeof qrScannerSessionRpcApi>;

describe('QR scanner session client', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  test('reads matching session credentials only from the launch URL fragment', () => {
    expect(
      readQrScannerLaunchCredentials({
        success: true,
        sessionId: 'session-1',
        launchUrl:
          'https://scanner.example.test/qr-scanner.html?sessionId=query-session&launchToken=query-token#sessionId=session-1&launchToken=fragment-token',
        expiresAt: '2026-07-15T10:15:00.000Z'
      })
    ).toEqual({ sessionId: 'session-1', launchToken: 'fragment-token' });
  });

  test.each([
    ['not a URL', 'session-1'],
    ['https://scanner.example.test/qr-scanner.html#sessionId=other&launchToken=token', 'session-1'],
    ['https://scanner.example.test/qr-scanner.html#sessionId=session-1', 'session-1'],
    ['https://scanner.example.test/qr-scanner.html?sessionId=session-1&launchToken=query-only', 'session-1']
  ])('rejects malformed or mismatched launch credentials', (launchUrl, sessionId) => {
    expect(() =>
      readQrScannerLaunchCredentials({
        success: true,
        sessionId,
        launchUrl,
        expiresAt: '2026-07-15T10:15:00.000Z'
      })
    ).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });

  test('unwraps structured RPC failures without losing code or retryability', async () => {
    rpcMock.mockResolvedValue({
      ok: false,
      error: {
        code: 'TEMPORARY_ERROR',
        message: 'Drive is temporarily unavailable.',
        retryable: true
      }
    } as never);

    await expect(
      addQrScannerCandidate(
        { sessionId: 'session-1', accessToken: 'access-1' },
        { scanId: 'scan-1', rawValue: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view' }
      )
    ).rejects.toEqual(
      expect.objectContaining<QrScannerSessionError>({
        name: 'QrScannerSessionError',
        code: 'TEMPORARY_ERROR',
        message: 'Drive is temporarily unavailable.',
        retryable: true
      })
    );
    expect(rpcMock).toHaveBeenCalledWith({
      method: 'qrScanner.addCandidate',
      params: {
        sessionId: 'session-1',
        accessToken: 'access-1',
        scanId: 'scan-1',
        rawValue: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view'
      }
    });
  });

  test('fails closed when an RPC failure envelope is malformed', async () => {
    rpcMock.mockResolvedValue({ ok: false, error: {} } as never);

    await expect(
      addQrScannerCandidate(
        { sessionId: 'session-1', accessToken: 'access-1' },
        { scanId: 'scan-1', rawValue: 'value' }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'The scanner request failed.',
        retryable: false
      })
    );
  });
});
