import { extractDriveFileId } from '../../../src/services/webform/driveApi';

describe('extractDriveFileId', () => {
  it('extracts ids from common Drive URL shapes', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/abcDEF12345_-/view')).toBe('abcDEF12345_-');
    expect(extractDriveFileId('https://drive.google.com/open?id=abcDEF12345_-')).toBe('abcDEF12345_-');
    expect(extractDriveFileId('https://docs.google.com/document/d/abcDEF12345_-/edit')).toBe('abcDEF12345_-');
  });

  it('accepts raw ids and rejects unsupported values', () => {
    expect(extractDriveFileId('abcDEF12345_-')).toBe('abcDEF12345_-');
    expect(extractDriveFileId('https://example.com/not-drive')).toBe('');
  });
});
