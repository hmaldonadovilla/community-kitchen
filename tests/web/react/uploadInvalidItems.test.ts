import {
  findUploadItemByDriveFileId,
  filterInvalidUploadItems,
  getUploadInvalidItemError,
  getUploadInvalidItemKey,
  markUploadInvalidDriveFileId,
  markUploadInvalidItem
} from '../../../src/web/react/app/uploadInvalidItems';

describe('uploadInvalidItems', () => {
  it('keys Drive links by Drive file id', () => {
    expect(getUploadInvalidItemKey('https://drive.google.com/file/d/1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu/view')).toBe(
      'drive:1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu'
    );
    expect(getUploadInvalidItemKey('https://drive.google.com/open?id=1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu')).toBe(
      'drive:1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu'
    );
  });

  it('filters invalid upload items while preserving valid links', () => {
    const invalidLink = 'https://drive.google.com/open?id=1g52g7XOLZHIVkBWPPYKgAPZUGwbU0vIQ';
    const validLink = 'https://drive.google.com/open?id=1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu';
    const errors = markUploadInvalidItem({
      item: invalidLink,
      message: 'Invalid QR code, the item will be removed'
    });

    expect(getUploadInvalidItemError(errors, invalidLink)).toBe('Invalid QR code, the item will be removed');
    expect(filterInvalidUploadItems([invalidLink, validLink], errors)).toEqual([validLink]);
  });

  it('marks server validation failures by Drive file id instead of stale fallback scan order', () => {
    const firstValidLink = 'https://drive.google.com/open?id=1Xpveq0_ValidReceipt000000000';
    const secondValidLink = 'https://drive.google.com/open?id=1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu';
    const invalidLink = 'https://drive.google.com/open?id=1g52g7XOLZHIVkBWPPYKgAPZUGwbU0vIQ';
    const staleQueuedRequestItems = [firstValidLink, secondValidLink];
    const latestOverlayItems = [firstValidLink, secondValidLink, invalidLink];
    const invalidFileId = '1g52g7XOLZHIVkBWPPYKgAPZUGwbU0vIQ';

    expect(findUploadItemByDriveFileId(staleQueuedRequestItems, invalidFileId)).toBeNull();
    expect(findUploadItemByDriveFileId(latestOverlayItems, invalidFileId)).toBe(invalidLink);

    const errors = markUploadInvalidDriveFileId({
      fileId: invalidFileId,
      message: 'Invalid QR code, the item will be removed'
    });

    expect(getUploadInvalidItemError(errors, firstValidLink)).toBe('');
    expect(getUploadInvalidItemError(errors, secondValidLink)).toBe('');
    expect(getUploadInvalidItemError(errors, invalidLink)).toBe('Invalid QR code, the item will be removed');
  });
});
