import {
  isReusableQrScannerOutcome,
  qrScannerCandidateIdentity
} from '../../../src/web/react/features/uploads/domain/qrScannerBatching';

const fileId = '1AbCdEfGhIjKlMnOpQrStUvWxYz';

describe('QR scanner client batching rules', () => {
  test.each([
    `https://drive.google.com/file/d/${fileId}/view`,
    `https://drive.google.com/open?id=${fileId}`,
    `https://docs.google.com/document/d/${fileId}/edit`,
    `https://docs.google.com/spreadsheets/d/${fileId}/edit`
  ])('uses canonical Drive identity for a server-supported QR URL', value => {
    expect(qrScannerCandidateIdentity(value)).toBe(`drive:${fileId}`);
  });

  test.each([
    fileId,
    `http://drive.google.com/file/d/${fileId}/view`,
    `https://example.test/redirect?url=${encodeURIComponent(`https://drive.google.com/file/d/${fileId}/view`)}`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com:443/file/d/${fileId}/view`,
    `https://user@drive.google.com/file/d/${fileId}/view`
  ])('does not coalesce a QR value rejected by the server grammar', value => {
    expect(qrScannerCandidateIdentity(value)).toBeNull();
  });

  test('caches accepted and permanent outcomes but not retryable outcomes', () => {
    expect(isReusableQrScannerOutcome({ candidate: { status: 'AUTHORISED' } })).toBe(true);
    expect(isReusableQrScannerOutcome({ candidate: { status: 'REJECTED' } })).toBe(true);
    expect(isReusableQrScannerOutcome({ candidate: { status: 'RETRYABLE_ERROR', retryable: true } })).toBe(false);
    expect(isReusableQrScannerOutcome({ candidate: { status: 'REJECTED', retryable: true } })).toBe(false);
  });
});
