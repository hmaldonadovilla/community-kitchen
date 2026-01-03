import { getUploadMinRequired, isUploadValueComplete } from '../../../src/web/react/components/form/utils';

describe('upload completion (minFiles aware)', () => {
  it('treats required FILE_UPLOAD as complete when at least 1 item exists (default)', () => {
    expect(getUploadMinRequired({ uploadConfig: {}, required: true })).toBe(1);
    expect(isUploadValueComplete({ value: undefined as any, uploadConfig: {}, required: true })).toBe(false);
    expect(isUploadValueComplete({ value: ['https://example.com/a.jpg'] as any, uploadConfig: {}, required: true })).toBe(true);
  });

  it('treats FILE_UPLOAD as complete only when items >= minFiles', () => {
    expect(getUploadMinRequired({ uploadConfig: { minFiles: 3 }, required: true })).toBe(3);
    expect(isUploadValueComplete({ value: ['a'] as any, uploadConfig: { minFiles: 3 }, required: true })).toBe(false);
    expect(isUploadValueComplete({ value: ['a', 'b', 'c'] as any, uploadConfig: { minFiles: 3 }, required: true })).toBe(true);
  });

  it('treats optional FILE_UPLOAD as complete when any item exists (unless minFiles is set)', () => {
    expect(getUploadMinRequired({ uploadConfig: {}, required: false })).toBe(0);
    expect(isUploadValueComplete({ value: undefined as any, uploadConfig: {}, required: false })).toBe(false);
    expect(isUploadValueComplete({ value: ['a'] as any, uploadConfig: {}, required: false })).toBe(true);

    expect(getUploadMinRequired({ uploadConfig: { minFiles: 2 }, required: false })).toBe(2);
    expect(isUploadValueComplete({ value: ['a'] as any, uploadConfig: { minFiles: 2 }, required: false })).toBe(false);
  });
});


