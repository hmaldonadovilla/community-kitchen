import {
  getUploadFileSignature,
  mergeSavedUploadUrlItems,
  mergeUploadedFieldItems,
  type UploadComparableFile
} from '../../../src/web/react/app/uploadFieldMerge';

const fileA: UploadComparableFile = {
  name: 'first.jpg',
  size: 5_000_000,
  lastModified: 101
};

const fileB: UploadComparableFile = {
  name: 'second.jpg',
  size: 5_100_000,
  lastModified: 202
};

describe('uploadFieldMerge', () => {
  it('keeps an explicitly cleared field empty when an older upload completes', () => {
    const merged = mergeUploadedFieldItems({
      currentItems: [],
      hasCurrentValue: true,
      fallbackItems: [fileA],
      uploadedFiles: [fileA],
      uploadedUrls: ['https://example.com/a']
    });

    expect(merged).toEqual([]);
  });

  it('preserves a replacement file that the user selected before the older upload finished', () => {
    const merged = mergeUploadedFieldItems({
      currentItems: [fileB],
      hasCurrentValue: true,
      fallbackItems: [fileA],
      uploadedFiles: [fileA],
      uploadedUrls: ['https://example.com/a']
    });

    expect(merged).toEqual([fileB]);
  });

  it('replaces only the uploaded files that still exist in the current field value', () => {
    const merged = mergeUploadedFieldItems({
      currentItems: [fileA, fileB, 'https://example.com/existing'],
      hasCurrentValue: true,
      fallbackItems: [fileA],
      uploadedFiles: [fileA],
      uploadedUrls: ['https://example.com/a']
    });

    expect(merged).toEqual(['https://example.com/a', fileB, 'https://example.com/existing']);
  });

  it('falls back to the original upload items when the current ref has not been populated yet', () => {
    const merged = mergeUploadedFieldItems({
      currentItems: [],
      hasCurrentValue: false,
      fallbackItems: [fileA],
      uploadedFiles: [fileA],
      uploadedUrls: ['https://example.com/a']
    });

    expect(merged).toEqual(['https://example.com/a']);
  });

  it('builds stable signatures from file identity', () => {
    expect(getUploadFileSignature(fileA)).toBe('first.jpg|5000000|101');
  });

  it('preserves later QR link additions when an earlier URL-only save completes', () => {
    const firstQueuedUrl = 'https://drive.google.com/open?id=first';
    const secondQueuedUrl = 'https://drive.google.com/open?id=second';
    const firstSavedUrl = 'https://drive.google.com/file/d/first/view?usp=drivesdk';

    const merged = mergeSavedUploadUrlItems({
      currentItems: [firstQueuedUrl, secondQueuedUrl],
      hasCurrentValue: true,
      fallbackItems: [firstQueuedUrl],
      previousUrls: [firstQueuedUrl],
      savedUrls: [firstSavedUrl]
    });

    expect(merged).toEqual([firstSavedUrl, secondQueuedUrl]);
  });

  it('preserves an explicit URL-only clear while a save is completing', () => {
    const merged = mergeSavedUploadUrlItems({
      currentItems: [],
      hasCurrentValue: true,
      fallbackItems: ['https://drive.google.com/open?id=first'],
      previousUrls: ['https://drive.google.com/open?id=first'],
      savedUrls: ['https://drive.google.com/file/d/first/view?usp=drivesdk']
    });

    expect(merged).toEqual([]);
  });

  it('canonicalizes queued URL-only values when no newer local edit exists', () => {
    const queuedUrl = 'https://drive.google.com/open?id=first';
    const savedUrl = 'https://drive.google.com/file/d/first/view?usp=drivesdk';

    const merged = mergeSavedUploadUrlItems({
      currentItems: [queuedUrl],
      hasCurrentValue: true,
      fallbackItems: [queuedUrl],
      previousUrls: [queuedUrl],
      savedUrls: [savedUrl]
    });

    expect(merged).toEqual([savedUrl]);
  });
});
