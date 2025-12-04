import { isEmptyValue, toFileArray } from '../../../../src/web/react/utils/values';

describe('React value helpers', () => {
  describe('isEmptyValue', () => {
    it('treats undefined, null, and blank strings as empty', () => {
      expect(isEmptyValue(undefined as any)).toBe(true);
      expect(isEmptyValue(null as any)).toBe(true);
      expect(isEmptyValue('')).toBe(true);
      expect(isEmptyValue('   ' as any)).toBe(true);
    });

    it('considers arrays empty only when length is zero', () => {
      expect(isEmptyValue([])).toBe(true);
      expect(isEmptyValue(['value'] as any)).toBe(false);
    });

    it('returns false for numbers and populated strings', () => {
      expect(isEmptyValue(0 as any)).toBe(false);
      expect(isEmptyValue(42 as any)).toBe(false);
      expect(isEmptyValue('hello' as any)).toBe(false);
    });
  });

  describe('toFileArray', () => {
    const originalFile = (globalThis as any).File;

    afterEach(() => {
      if (originalFile) {
        (globalThis as any).File = originalFile;
      } else {
        delete (globalThis as any).File;
      }
    });

    it('returns empty array when File constructor is unavailable', () => {
      delete (globalThis as any).File;
      expect(toFileArray(['not files'] as any)).toEqual([]);
    });

    it('filters for File instances when constructor exists', () => {
      class FakeFile {}
      (globalThis as any).File = FakeFile as any;
      const file = new FakeFile();
      const result = toFileArray([file, { nope: true }] as any);
      expect(result).toEqual([file]);
    });
  });
});

