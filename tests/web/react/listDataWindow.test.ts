import {
  encodeClientPageToken,
  isListResponseComplete,
  mergeListItemsById,
  resolveListSortDefaultDirection
} from '../../../src/web/react/features/list/domain/listDataWindow';

describe('list data window domain', () => {
  test('merges incoming list items by first-seen id', () => {
    const first = { id: '1', label: 'first' };
    const duplicate = { id: '1', label: 'duplicate' };
    const second = { id: '2', label: 'second' };

    expect(mergeListItemsById([first], [duplicate, second, { id: '', label: 'blank' }])).toEqual([first, second]);
  });

  test('encodes client page tokens from valid non-negative integer offsets', () => {
    const originalBtoa = (globalThis as any).btoa;
    (globalThis as any).btoa = (value: string) => Buffer.from(value, 'binary').toString('base64');
    try {
      expect(encodeClientPageToken(25)).toBe('MjU=');
      expect(encodeClientPageToken(25.9)).toBe('MjU=');
      expect(encodeClientPageToken(-10)).toBe('MA==');
    } finally {
      (globalThis as any).btoa = originalBtoa;
    }
  });

  test('evaluates list response completeness from item count, total count, and page token', () => {
    expect(isListResponseComplete(null)).toBe(false);
    expect(isListResponseComplete({ items: [] })).toBe(false);
    expect(isListResponseComplete({ items: [{ id: '1' }], totalCount: 0 })).toBe(true);
    expect(isListResponseComplete({ items: [{ id: '1' }], totalCount: 2 })).toBe(false);
    expect(isListResponseComplete({ items: [{ id: '1' }, { id: '2' }], totalCount: 2 })).toBe(true);
    expect(isListResponseComplete({ items: [{ id: '1' }, { id: '2' }], totalCount: 2, nextPageToken: 'next' })).toBe(false);
  });

  test('resolves default sort direction from meta and date field types', () => {
    expect(resolveListSortDefaultDirection('updatedAt', {})).toBe('desc');
    expect(resolveListSortDefaultDirection('prepDate', { prepDate: 'DATE' })).toBe('desc');
    expect(resolveListSortDefaultDirection('name', { name: 'TEXT' })).toBe('asc');
  });
});
