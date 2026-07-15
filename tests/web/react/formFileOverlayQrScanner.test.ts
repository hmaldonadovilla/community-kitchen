import { matchesExternalQrScannerOverlayTarget } from '../../../src/web/react/features/uploads/domain/externalQrScanner';

describe('file overlay QR scanner reconciliation', () => {
  test('matches only the still-open overlay for the committed launch field', () => {
    expect(
      matchesExternalQrScannerOverlayTarget({
        open: true,
        scope: 'top',
        fieldId: 'ING_EVD'
      }, {
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD'
      })
    ).toBe(true);

    expect(
      matchesExternalQrScannerOverlayTarget({
        open: true,
        scope: 'top',
        fieldId: 'OTHER_FIELD'
      }, {
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD'
      })
    ).toBe(false);
    expect(
      matchesExternalQrScannerOverlayTarget(
        { open: false, scope: 'top', fieldId: 'ING_EVD' },
        { fieldId: 'ING_EVD', fieldPath: 'ING_EVD' }
      )
    ).toBe(false);
    expect(
      matchesExternalQrScannerOverlayTarget(
        { open: true, scope: 'line', fieldId: 'ING_EVD' },
        { fieldId: 'ING_EVD', fieldPath: 'ING_EVD' }
      )
    ).toBe(false);
  });
});
