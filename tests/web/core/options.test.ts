import {
  buildOptionSet,
  loadOptionsFromDataSource,
  normalizeLanguage,
  optionKey,
  toDependencyValue
} from '../../../src/web/core/options';
import { fetchDataSource } from '../../../src/web/data/dataSources';

jest.mock('../../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn()
}));

const fetchDataSourceMock = fetchDataSource as jest.Mock;

describe('core options helpers', () => {
  beforeEach(() => {
    fetchDataSourceMock.mockReset();
  });

  describe('optionKey', () => {
    it('concatenates parent id when provided', () => {
      expect(optionKey('field', 'group')).toBe('group.field');
    });

    it('returns id when no parent supplied', () => {
      expect(optionKey('field')).toBe('field');
    });
  });

  describe('toDependencyValue', () => {
    it('joins array values with pipes', () => {
      expect(toDependencyValue(['A', 'B', 'C'])).toBe('A|B|C');
    });

    it('returns primitive as-is', () => {
      expect(toDependencyValue('A')).toBe('A');
      expect(toDependencyValue(3)).toBe(3);
      expect(toDependencyValue(null)).toBeNull();
    });
  });

  describe('buildOptionSet', () => {
    it('returns null when values empty after normalization', () => {
      expect(buildOptionSet(['', ' ', '\t'])).toBeNull();
    });

    it('deduplicates and trims values', () => {
      const result = buildOptionSet([' Apple ', 'Banana', 'Apple', 'banana', 'carrot']);
      expect(result).toEqual({
        en: ['Apple', 'Banana', 'banana', 'carrot'],
        fr: ['Apple', 'Banana', 'banana', 'carrot'],
        nl: ['Apple', 'Banana', 'banana', 'carrot']
      });
    });
  });

  describe('loadOptionsFromDataSource', () => {
    it('returns null when no data source provided', async () => {
      await expect(loadOptionsFromDataSource(undefined as any, 'EN')).resolves.toBeNull();
    });

    it('normalizes primitive arrays', async () => {
      fetchDataSourceMock.mockResolvedValue({ items: ['Apple', 'Banana', 'Apple', null] });
      const result = await loadOptionsFromDataSource({ id: 'FRUIT' } as any, normalizeLanguage('en'));
      expect(result).toEqual({
        en: ['Apple', 'Banana'],
        fr: ['Apple', 'Banana'],
        nl: ['Apple', 'Banana']
      });
    });

    it('picks first scalar column when mapping missing', async () => {
      fetchDataSourceMock.mockResolvedValue({
        items: [
          { value: 'Alpha', meta: 1 },
          { value: 'Beta', meta: 2 }
        ]
      });
      const result = await loadOptionsFromDataSource({ id: 'SHAPES' } as any, 'EN');
      expect(result?.en).toEqual(['Alpha', 'Beta']);
    });

    it('uses mapping.value when provided', async () => {
      fetchDataSourceMock.mockResolvedValue({
        items: [
          { code: 'X', label: 'First' },
          { code: 'Y', label: 'Second' }
        ]
      });
      const result = await loadOptionsFromDataSource(
        { id: 'MAPPED', mapping: { value: 'label' } } as any,
        'EN'
      );
      expect(result?.en).toEqual(['First', 'Second']);
    });

    it('swallows fetch errors and returns null', async () => {
      fetchDataSourceMock.mockRejectedValue(new Error('boom'));
      await expect(loadOptionsFromDataSource({ id: 'ERR' } as any, 'EN')).resolves.toBeNull();
    });
  });
});

