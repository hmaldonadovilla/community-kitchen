import {
  buildOptionSet,
  getOptionStateValue,
  loadOptionsFromDataSource,
  mergeOptionStateValue,
  normalizeLanguage,
  optionKey,
  optionKeysWithAliases,
  optionParentAliases,
  toOptionSet,
  toDependencyValue
} from '../../../src/web/core/options';
import { fetchDataSource, peekCachedDataSourcesById } from '../../../src/web/data/dataSources';

jest.mock('../../../src/web/data/dataSources', () => ({
  fetchDataSource: jest.fn(),
  peekCachedDataSourcesById: jest.fn()
}));

const fetchDataSourceMock = fetchDataSource as jest.Mock;
const peekCachedDataSourcesByIdMock = peekCachedDataSourcesById as jest.Mock;

describe('core options helpers', () => {
  beforeEach(() => {
    fetchDataSourceMock.mockReset();
    peekCachedDataSourcesByIdMock.mockReset();
  });

  describe('optionKey', () => {
    it('concatenates parent id when provided', () => {
      expect(optionKey('field', 'group')).toBe('group.field');
    });

    it('returns id when no parent supplied', () => {
      expect(optionKey('field')).toBe('field');
    });
  });

  describe('optionParentAliases', () => {
    it('returns exact parent id when not dynamic', () => {
      expect(optionParentAliases('MP_TYPE_LI')).toEqual(['MP_TYPE_LI']);
    });

    it('adds the base subgroup id for dynamic parent keys', () => {
      expect(optionParentAliases('MP_MEALS_REQUEST::row-1::MP_TYPE_LI')).toEqual([
        'MP_MEALS_REQUEST::row-1::MP_TYPE_LI',
        'MP_MEALS_REQUEST::MP_TYPE_LI',
        'MP_TYPE_LI'
      ]);
    });
  });

  describe('optionKeysWithAliases', () => {
    it('builds keys for both dynamic and base parent ids', () => {
      expect(optionKeysWithAliases('LEFTOVER_ID', 'MP_MEALS_REQUEST::row-1::MP_TYPE_LI')).toEqual([
        'MP_MEALS_REQUEST::row-1::MP_TYPE_LI.LEFTOVER_ID',
        'MP_MEALS_REQUEST::MP_TYPE_LI.LEFTOVER_ID',
        'MP_TYPE_LI.LEFTOVER_ID'
      ]);
    });
  });

  describe('option state alias helpers', () => {
    it('stores option state under dynamic and base keys', () => {
      const next = mergeOptionStateValue({}, 'LEFTOVER_ID', 'MP_MEALS_REQUEST::row-1::MP_TYPE_LI', { en: ['LE-1'] });
      expect(next).toEqual({
        'MP_MEALS_REQUEST::row-1::MP_TYPE_LI.LEFTOVER_ID': { en: ['LE-1'] },
        'MP_MEALS_REQUEST::MP_TYPE_LI.LEFTOVER_ID': { en: ['LE-1'] },
        'MP_TYPE_LI.LEFTOVER_ID': { en: ['LE-1'] }
      });
    });

    it('reads option state from alias keys', () => {
      const state = {
        'MP_MEALS_REQUEST::MP_TYPE_LI.LEFTOVER_ID': { en: ['LE-1', 'LE-2'] }
      } as any;
      expect(getOptionStateValue(state, 'LEFTOVER_ID', 'MP_MEALS_REQUEST::row-1::MP_TYPE_LI')).toEqual({
        en: ['LE-1', 'LE-2']
      });
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

  describe('toOptionSet', () => {
    it('derives a base option set from optionFilter maps when explicit options are missing', () => {
      const result = toOptionSet({
        optionFilter: {
          optionMap: {
            Tomato: ['kg', 'gr'],
            Cheese: ['kg', 'piece'],
            '*': ['Tbsp']
          }
        }
      });

      expect(result).toEqual({
        en: ['kg', 'gr', 'piece', 'Tbsp'],
        fr: ['kg', 'gr', 'piece', 'Tbsp'],
        nl: ['kg', 'gr', 'piece', 'Tbsp']
      });
    });

    it('derives a base option set from optionMapRef using cached datasource rows', () => {
      peekCachedDataSourcesByIdMock.mockReturnValue([
        {
          items: [
            { INGREDIENT_NAME: 'Courgette', ALLOWED_UNIT: 'kg, gr, bucket' },
            { INGREDIENT_NAME: 'Courgette - frozen', ALLOWED_UNIT: 'kg, gr, bag' }
          ]
        }
      ]);

      const result = toOptionSet({
        optionFilter: {
          optionMapRef: {
            ref: 'REF:Ingredients Data',
            keyColumn: 'INGREDIENT_NAME',
            lookupColumn: 'ALLOWED_UNIT'
          }
        }
      });

      expect(peekCachedDataSourcesByIdMock).toHaveBeenCalled();
      expect(result).toEqual({
        en: ['kg', 'gr', 'bucket', 'bag'],
        fr: ['kg', 'gr', 'bucket', 'bag'],
        nl: ['kg', 'gr', 'bucket', 'bag']
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

    it('stores the mapped label on raw option rows when mapping.label is provided', async () => {
      fetchDataSourceMock.mockResolvedValue({
        items: [
          { nickname: 'LP', fullName: 'Le Phare' },
          { nickname: 'BEL', fullName: 'Belliard' }
        ]
      });
      const result = await loadOptionsFromDataSource(
        { id: 'CUSTOMERS', mapping: { value: 'nickname', label: 'fullName' } } as any,
        'EN'
      );
      expect(result?.en).toEqual(['LP', 'BEL']);
      expect(result?.raw).toEqual([
        expect.objectContaining({ __ckOptionValue: 'LP', __ckOptionLabel: 'Le Phare' }),
        expect.objectContaining({ __ckOptionValue: 'BEL', __ckOptionLabel: 'Belliard' })
      ]);
    });

    it('swallows fetch errors and returns null', async () => {
      fetchDataSourceMock.mockRejectedValue(new Error('boom'));
      await expect(loadOptionsFromDataSource({ id: 'ERR' } as any, 'EN')).resolves.toBeNull();
    });
  });
});
