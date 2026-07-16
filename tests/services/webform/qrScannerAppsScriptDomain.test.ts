import {
  buildScannerLaunchUrl,
  buildScannerReturnUrl,
  candidateCounts,
  canonicalizeQrScannerCommitLinks,
  dedupeUploadLinksByFileId,
  fileTypeMatches,
  linkCaptureFileTypeMatches,
  parseDriveQrPayload,
  resolveQrScannerInstruction,
  splitUploadLinks
} from '../../../src/services/webform/qrScannerAppsScript/domain';

describe('Apps Script QR scanner domain', () => {
  test.each([
    ['https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view', '1AbCdEfGhIjKlMnOpQrStUvWxYz'],
    ['https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz', '1AbCdEfGhIjKlMnOpQrStUvWxYz'],
    ['https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit', '1AbCdEfGhIjKlMnOpQrStUvWxYz'],
    ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0', '1AbCdEfGhIjKlMnOpQrStUvWxYz']
  ])('accepts a supported exact Drive URL', (raw, expectedId) => {
    expect(parseDriveQrPayload(raw)).toEqual(expect.objectContaining({ ok: true, fileId: expectedId }));
  });

  test.each([
    '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    'http://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
    'https://drive.google.com.evil.test/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
    'https://user@drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
    'https://drive.google.com:8443/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
    'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz',
    'https://example.test/?id=1AbCdEfGhIjKlMnOpQrStUvWxYz',
    '',
    `https://drive.google.com/file/d/${'a'.repeat(2050)}/view`
  ])('rejects an unsupported or ambiguous payload', raw => {
    expect(parseDriveQrPayload(raw)).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  test('uses MIME-or-extension parity when both policies are configured', () => {
    const config = { allowedMimeTypes: ['application/pdf'], allowedExtensions: ['jpg'] };
    expect(fileTypeMatches('receipt.bin', 'application/pdf', config)).toBe(true);
    expect(fileTypeMatches('receipt.jpg', 'application/octet-stream', config)).toBe(true);
    expect(fileTypeMatches('receipt.png', 'image/png', config)).toBe(false);
  });

  test('uses a link-capture MIME policy independently from upload file types', () => {
    const config = {
      allowedMimeTypes: ['image/*'],
      allowedExtensions: ['jpg'],
      linkCapture: { allowedMimeTypes: ['application/pdf'] }
    };
    expect(linkCaptureFileTypeMatches('receipt.pdf', 'application/pdf', config)).toBe(true);
    expect(linkCaptureFileTypeMatches('receipt.jpg', 'image/jpeg', config)).toBe(false);
    expect(
      linkCaptureFileTypeMatches('receipt.txt', 'text/plain', {
        ...config,
        linkCapture: { allowedMimeTypes: ['*/*'] }
      })
    ).toBe(true);
  });

  test('resolves localized scanner instructions with English fallback and a bounded projection', () => {
    const instruction = {
      en: 'Point the camera at each receipt QR code.',
      fr: 'French scanner instruction.'
    };
    expect(resolveQrScannerInstruction(instruction, 'FR')).toBe('French scanner instruction.');
    expect(resolveQrScannerInstruction(instruction, 'NL')).toBe('Point the camera at each receipt QR code.');
    expect(resolveQrScannerInstruction(`  ${'x'.repeat(350)}  `, 'EN')).toHaveLength(300);
    expect(resolveQrScannerInstruction(undefined, 'EN')).toBe('');
  });

  test('deduplicates stored upload links without accepting arbitrary objects', () => {
    expect(
      splitUploadLinks([
        'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
        { url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view' },
        { value: 'ignored' },
        'https://drive.google.com/file/d/2AbCdEfGhIjKlMnOpQrStUvWxYz/view'
      ])
    ).toEqual([
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
      'https://drive.google.com/file/d/2AbCdEfGhIjKlMnOpQrStUvWxYz/view'
    ]);
  });

  test('deduplicates stored URL variants by Drive file ID and canonicalizes commit input', () => {
    const canonical = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view';
    const openVariant = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz';
    const second = 'https://drive.google.com/file/d/2AbCdEfGhIjKlMnOpQrStUvWxYz/view';

    expect(dedupeUploadLinksByFileId([openVariant, canonical, second])).toEqual([openVariant, second]);
    expect(canonicalizeQrScannerCommitLinks([openVariant, canonical, second])).toEqual([canonical, second]);
    expect(canonicalizeQrScannerCommitLinks([canonical, 'https://example.test/not-drive'])).toBeNull();
  });

  test('projects an in-flight incremental append as pending rather than rejected', () => {
    const counts = candidateCounts({
      maxFiles: 10,
      existingCount: 1,
      candidates: [
        {
          status: 'RETRYABLE_ERROR',
          incremental: { state: 'PENDING' }
        },
        {
          status: 'RETRYABLE_ERROR',
          incremental: { state: 'RETRYABLE' }
        },
        { status: 'AUTHORISED' }
      ]
    } as any);

    expect(counts).toMatchObject({
      authorised: 1,
      pending: 1,
      retryable: 1,
      rejected: 1,
      total: 3,
      remaining: 8
    });
  });

  test('keeps credentials in the launch fragment and constructs navigation-only return state', () => {
    expect(
      buildScannerLaunchUrl(
        'https://stage-assets.web.app/qr-scanner.html',
        'session-1',
        'one-time-token',
        'Point the camera at each receipt QR code.'
      )
    ).toBe(
      'https://stage-assets.web.app/qr-scanner.html#sessionId=session-1&launchToken=one-time-token&instruction=Point%20the%20camera%20at%20each%20receipt%20QR%20code.'
    );

    const returnUrl = buildScannerReturnUrl(
      'https://script.google.com/macros/s/deployment/exec?ignored=1',
      {
        id: 'session-1',
        formKey: 'Config: Receipts',
        recordId: 'REC-1',
        fieldId: 'RECEIPTS',
        returnContext: { app: 'meal-production', stepId: 'production', overlay: 'files' }
      },
      { result: 'success', linkedCount: 2 }
    );
    expect(returnUrl).toContain('form=Config%3A%20Receipts');
    expect(returnUrl).toContain('qrResult=success');
    expect(returnUrl).toContain('qrLinked=2');
    expect(returnUrl).not.toContain('ignored=1');
  });
});
