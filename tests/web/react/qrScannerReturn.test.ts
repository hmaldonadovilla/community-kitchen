import { resolveNativeQrScannerReturnAction } from '../../../src/web/react/features/uploads/domain/qrScannerReturn';

describe('native iOS QR scanner return', () => {
  test('commits an active session containing authorised receipts', () => {
    expect(
      resolveNativeQrScannerReturnAction({
        status: 'ACTIVE',
        counts: { authorised: 2 }
      })
    ).toBe('commit');
  });

  test('cancels an active session without authorised receipts', () => {
    expect(
      resolveNativeQrScannerReturnAction({
        status: 'ACTIVE',
        counts: { authorised: 0 }
      }, { allowEmptyCancel: true })
    ).toBe('cancel');
  });

  test('does not cancel an empty session after an ambiguous blur and focus', () => {
    expect(
      resolveNativeQrScannerReturnAction({
        status: 'ACTIVE',
        counts: { authorised: 0 }
      })
    ).toBe('none');
  });

  test('falls back to projected candidates and leaves non-active sessions alone', () => {
    expect(
      resolveNativeQrScannerReturnAction({
        status: 'ACTIVE',
        candidates: [{ status: 'REJECTED' }, { status: 'AUTHORISED' }]
      })
    ).toBe('commit');
    expect(resolveNativeQrScannerReturnAction({ status: 'COMPLETED', counts: { authorised: 1 } })).toBe('none');
  });
});
