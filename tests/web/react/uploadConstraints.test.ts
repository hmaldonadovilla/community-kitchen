import { applyUploadConstraints } from '../../../src/web/react/components/form/utils';

describe('applyUploadConstraints', () => {
  const makeFile = (name: string, type = 'image/jpeg') => ({ name, type, size: 1 } as File);

  it('keeps accepted files valid and warns when a multi-select exceeds maxFiles', () => {
    const result = applyUploadConstraints(
      { id: 'PHOTOS', type: 'FILE_UPLOAD', uploadConfig: { maxFiles: 10 } } as any,
      [],
      Array.from({ length: 12 }, (_, idx) => makeFile(`photo-${idx + 1}.jpg`)),
      'EN' as any
    );

    expect(result.items).toHaveLength(10);
    expect(result.errorMessage).toBeUndefined();
    expect(result.warningMessage).toBe('Only 10 of 12 selected photos were added. Maximum: 10.');
  });

  it('counts remaining slots when existing files are already present', () => {
    const result = applyUploadConstraints(
      { id: 'PHOTOS', type: 'FILE_UPLOAD', uploadConfig: { maxFiles: 10 } } as any,
      Array.from({ length: 8 }, (_, idx) => `https://example.com/existing-${idx + 1}.jpg`),
      Array.from({ length: 4 }, (_, idx) => makeFile(`photo-${idx + 1}.jpg`)),
      'EN' as any
    );

    expect(result.items).toHaveLength(10);
    expect(result.errorMessage).toBeUndefined();
    expect(result.warningMessage).toBe('Only 2 of 4 selected photos were added. Maximum: 10.');
  });

  it('returns a blocking error only when no selected files can be accepted', () => {
    const result = applyUploadConstraints(
      { id: 'PHOTOS', type: 'FILE_UPLOAD', uploadConfig: { maxFiles: 10 } } as any,
      Array.from({ length: 10 }, (_, idx) => `https://example.com/existing-${idx + 1}.jpg`),
      [makeFile('extra.jpg')],
      'EN' as any
    );

    expect(result.items).toHaveLength(10);
    expect(result.warningMessage).toBeUndefined();
    expect(result.errorMessage).toBe('Maximum of 10 photos allowed.');
  });

  it('warns instead of blocking when valid files are accepted alongside rejected files', () => {
    const result = applyUploadConstraints(
      {
        id: 'PHOTOS',
        type: 'FILE_UPLOAD',
        uploadConfig: { allowedMimeTypes: ['image/*'] }
      } as any,
      [],
      [makeFile('photo.jpg', 'image/jpeg'), makeFile('notes.txt', 'text/plain')],
      'EN' as any
    );

    expect(result.items).toHaveLength(1);
    expect(result.errorMessage).toBeUndefined();
    expect(result.warningMessage).toContain('1 photo added.');
    expect(result.warningMessage).toContain('notes.txt is not an allowed photo type.');
  });
});
