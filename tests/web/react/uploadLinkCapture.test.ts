import {
  appendCapturedUploadLink,
  canonicalDriveFileUrl,
  extractDriveFileIdFromLink,
  formatDriveFileDisplayName,
  normalizeCapturedUploadLink,
  shouldRetryDuplicateCapturedUploadLink
} from '../../../src/web/react/features/uploads/domain/linkCapture';

describe('upload link capture', () => {
  const driveId = '11umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4K';
  const validFixtureDriveId = '1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu';
  const wrongFolderFixtureDriveId = '1g52g7XOLZHIVkBWPPYKgAPZUGwbU0vIQ';
  const uploadConfig = {
    maxFiles: 10,
    linkCapture: {
      enabled: true,
      mode: 'driveQr',
      dedupeBy: 'driveFileId'
    }
  };

  it('extracts Drive file ids from supported QR values', () => {
    expect(extractDriveFileIdFromLink(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`)).toBe(driveId);
    expect(extractDriveFileIdFromLink(`https://drive.google.com/open?id=${driveId}`)).toBe(driveId);
    expect(extractDriveFileIdFromLink(`https://docs.google.com/document/d/${driveId}/edit`)).toBe(driveId);
    expect(extractDriveFileIdFromLink(`https://lh3.googleusercontent.com/d/${driveId}=w800`)).toBe(driveId);
    expect(
      extractDriveFileIdFromLink(
        `https://www.google.com/url?q=${encodeURIComponent(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`)}`
      )
    ).toBe(driveId);
    expect(extractDriveFileIdFromLink(`https://drive.google.com/file/d/${validFixtureDriveId}/view`)).toBe(
      validFixtureDriveId
    );
    expect(extractDriveFileIdFromLink(`https://drive.google.com/file/d/${wrongFolderFixtureDriveId}/view`)).toBe(
      wrongFolderFixtureDriveId
    );
    expect(extractDriveFileIdFromLink(driveId)).toBe(driveId);
  });

  it('extracts Drive file ids from escaped scanner payloads', () => {
    expect(extractDriveFileIdFromLink(`https:\\/\\/drive.google.com\\/file\\/d\\/${driveId}\\/view`)).toBe(driveId);
    expect(extractDriveFileIdFromLink(JSON.stringify({ value: `https://drive.google.com/file/d/${driveId}/view` }))).toBe(
      driveId
    );
  });

  it('canonicalizes captured Drive links for storage', () => {
    expect(canonicalDriveFileUrl(driveId)).toBe(`https://drive.google.com/open?id=${driveId}`);
    expect(formatDriveFileDisplayName(`https://docs.google.com/document/d/${driveId}/edit`)).toBe('Drive file 11umQRK-');
    expect(normalizeCapturedUploadLink(`https://docs.google.com/document/d/${driveId}/edit`, uploadConfig)).toEqual({
      ok: true,
      mode: 'driveQr',
      url: `https://drive.google.com/open?id=${driveId}`,
      driveFileId: driveId
    });
  });

  it('rejects non-Drive QR content in driveQr mode', () => {
    expect(normalizeCapturedUploadLink('https://example.test/invoice.pdf', uploadConfig)).toEqual({
      ok: false,
      mode: 'driveQr',
      reason: 'invalidDriveLink'
    });
    expect(normalizeCapturedUploadLink(`https://example.test/file/d/${driveId}/view`, uploadConfig)).toEqual({
      ok: false,
      mode: 'driveQr',
      reason: 'invalidDriveLink'
    });
  });

  it('deduplicates multiple QR scans for the same Drive document', () => {
    const first = appendCapturedUploadLink({
      existing: [],
      rawValue: `https://docs.google.com/document/d/${driveId}/edit`,
      uploadConfig
    });
    expect(first.status).toBe('added');
    expect(first.items).toEqual([`https://drive.google.com/open?id=${driveId}`]);

    const duplicate = appendCapturedUploadLink({
      existing: first.items,
      rawValue: `https://drive.google.com/file/d/${driveId}/view?usp=sharing`,
      uploadConfig
    });
    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.items).toEqual(first.items);
  });

  it('retries a duplicate scan only when a blocking upload has a visible failure', () => {
    expect(shouldRetryDuplicateCapturedUploadLink({ blockUntilSaved: true, hasUploadFailure: true })).toBe(true);
    expect(shouldRetryDuplicateCapturedUploadLink({ blockUntilSaved: true, hasUploadFailure: false })).toBe(false);
    expect(shouldRetryDuplicateCapturedUploadLink({ blockUntilSaved: false, hasUploadFailure: true })).toBe(false);
  });

  it('preserves different Drive documents and respects maxFiles', () => {
    const otherId = '22umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4L';
    const added = appendCapturedUploadLink({
      existing: [`https://drive.google.com/open?id=${driveId}`],
      rawValue: otherId,
      uploadConfig
    });
    expect(added.status).toBe('added');
    expect(added.items).toEqual([
      `https://drive.google.com/open?id=${driveId}`,
      `https://drive.google.com/open?id=${otherId}`
    ]);

    const maxed = appendCapturedUploadLink({
      existing: [`https://drive.google.com/open?id=${driveId}`],
      rawValue: otherId,
      uploadConfig: { ...uploadConfig, maxFiles: 1 }
    });
    expect(maxed.status).toBe('maxed');
  });
});
