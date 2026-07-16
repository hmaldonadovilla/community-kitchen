import {
  buildQrScannerCandidateMessage,
  buildQrScannerCommitMessage,
  buildQrScannerFinishMessage,
  buildQrScannerScanMessage,
  buildQrScannerSetupMessage,
  parseQrScannerFromOpenerMessage,
  parseQrScannerToOpenerMessage,
  QR_SCANNER_MESSAGE_TYPES,
  QR_SCANNER_PROTOCOL_VERSION
} from '../../../src/web/qrScanner/openerProtocol';

describe('QR scanner opener protocol', () => {
  const requestId = 'request-123';

  it('builds and validates scan and finish messages sent to the exact opener request', () => {
    const scan = buildQrScannerScanMessage(
      requestId,
      'scan-123',
      'https://drive.google.com/file/d/1234567890abcdefghij/view'
    );
    expect(parseQrScannerToOpenerMessage(scan, requestId)).toEqual(scan);

    const finish = buildQrScannerFinishMessage(requestId, 'commit-123');
    expect(parseQrScannerToOpenerMessage(finish, requestId)).toEqual(finish);
    expect(parseQrScannerToOpenerMessage(scan, 'different-request')).toBeNull();
  });

  it('rejects unknown versions, unbounded QR values, and malformed ids', () => {
    expect(
      parseQrScannerToOpenerMessage({
        version: QR_SCANNER_PROTOCOL_VERSION + 1,
        type: QR_SCANNER_MESSAGE_TYPES.scan,
        requestId,
        scanId: 'scan-123',
        value: 'https://drive.google.com/open?id=1234567890'
      })
    ).toBeNull();
    expect(
      parseQrScannerToOpenerMessage({
        version: QR_SCANNER_PROTOCOL_VERSION,
        type: QR_SCANNER_MESSAGE_TYPES.scan,
        requestId,
        scanId: 'scan-123',
        value: 'x'.repeat(2049)
      })
    ).toBeNull();
    expect(
      parseQrScannerToOpenerMessage({
        version: QR_SCANNER_PROTOCOL_VERSION,
        type: QR_SCANNER_MESSAGE_TYPES.finish,
        requestId,
        commitRequestId: 'invalid\nrequest'
      })
    ).toBeNull();
  });

  it('validates bounded setup and authoritative candidate responses', () => {
    const setup = buildQrScannerSetupMessage(requestId, {
      instruction: 'Point the camera at each QR code on the ingredient receipts.',
      maxFiles: 10,
      existingCount: 2,
      hideCloseOnIos: true,
      commitOnReturnOnIos: true
    });
    expect(parseQrScannerFromOpenerMessage(setup, requestId)).toEqual(setup);

    const candidate = buildQrScannerCandidateMessage(requestId, {
      scanId: 'scan-123',
      status: 'accepted',
      code: 'ACCEPTED',
      fileId: '1234567890abcdefghij',
      canonicalUrl: 'https://drive.google.com/file/d/1234567890abcdefghij/view',
      displayName: 'Ingredient receipt 24',
      message: 'Receipt checked and ready to add.'
    });
    expect(parseQrScannerFromOpenerMessage(candidate, requestId)).toEqual(candidate);
  });

  it('rejects unsafe candidate URLs and invalid response states', () => {
    expect(
      parseQrScannerFromOpenerMessage({
        ...buildQrScannerCandidateMessage(requestId, {
          scanId: 'scan-123',
          status: 'accepted'
        }),
        canonicalUrl: 'https://example.test/file/1234567890'
      })
    ).toBeNull();
    expect(
      parseQrScannerFromOpenerMessage({
        version: QR_SCANNER_PROTOCOL_VERSION,
        type: QR_SCANNER_MESSAGE_TYPES.candidate,
        requestId,
        scanId: 'scan-123',
        status: 'checking'
      })
    ).toBeNull();
  });

  it('validates committing, committed, and error commit responses', () => {
    const committing = buildQrScannerCommitMessage(requestId, {
      status: 'committing',
      message: 'Adding checked receipts...'
    });
    const committed = buildQrScannerCommitMessage(requestId, {
      status: 'committed',
      linkedCount: 3,
      message: '3 receipts added.'
    });
    const failed = buildQrScannerCommitMessage(requestId, {
      status: 'error',
      message: 'The receipts could not be added.'
    });
    expect(parseQrScannerFromOpenerMessage(committing, requestId)).toEqual(committing);
    expect(parseQrScannerFromOpenerMessage(committed, requestId)).toEqual(committed);
    expect(parseQrScannerFromOpenerMessage(failed, requestId)).toEqual(failed);
  });
});
