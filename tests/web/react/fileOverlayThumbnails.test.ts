import {
  buildExistingFileThumbnailCandidates,
  buildLocalFileThumbnailKey,
  extractDriveFileId,
  isLikelyImageName
} from '../../../src/web/react/components/form/overlays/fileOverlayThumbnails';

describe('fileOverlayThumbnails', () => {
  it('builds Drive image fallback candidates for uploaded files', () => {
    const driveId = '11umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4K';
    const href = `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;

    expect(buildExistingFileThumbnailCandidates(href, 'receipt.jpg')).toEqual([
      `https://lh3.googleusercontent.com/d/${driveId}=w800`,
      `https://lh3.googleusercontent.com/d/${driveId}=w400`,
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`,
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`,
      href,
      `https://drive.google.com/uc?export=download&id=${driveId}`
    ]);
  });

  it('keeps non-Drive image URLs as thumbnail candidates', () => {
    expect(buildExistingFileThumbnailCandidates('https://example.test/photo.jpeg', 'photo.jpeg')).toEqual([
      'https://example.test/photo.jpeg'
    ]);
    expect(buildExistingFileThumbnailCandidates('https://example.test/file.pdf', 'file.pdf')).toEqual([]);
  });

  it('extracts Drive ids and local file keys consistently', () => {
    const driveId = '11umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4K';
    expect(extractDriveFileId(`https://drive.google.com/open?id=${driveId}`)).toBe(driveId);
    expect(extractDriveFileId(`https://lh3.googleusercontent.com/d/${driveId}=w512`)).toBe(driveId);
    expect(isLikelyImageName('scan.heic')).toBe(true);
    expect(buildLocalFileThumbnailKey({ name: 'receipt.jpg', size: 123, lastModified: 456, type: 'image/jpeg' }, 2)).toBe(
      'file-2-receipt.jpg-123-456-image/jpeg'
    );
  });
});
