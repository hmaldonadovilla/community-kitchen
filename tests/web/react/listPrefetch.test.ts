import {
  aggregateContiguousPrefetchedPageItems,
  aggregatePrefetchedPageItems,
  isCompletePrefetchedListResponse
} from '../../../src/web/react/app/listPrefetch';

describe('listPrefetch', () => {
  test('keeps successfully fetched later pages even when an intermediate page is missing', () => {
    const itemsByPage = new Map<number, any[]>([
      [0, [{ id: 'page-1-a' }, { id: 'page-1-b' }]],
      [2, [{ id: 'page-3-a' }]],
      [3, [{ id: 'page-4-a' }]]
    ]);

    expect(aggregatePrefetchedPageItems(itemsByPage, 4).map(item => item.id)).toEqual([
      'page-1-a',
      'page-1-b',
      'page-3-a',
      'page-4-a'
    ]);
  });

  test('computes the guaranteed contiguous prefix independently from later recovered pages', () => {
    const itemsByPage = new Map<number, any[]>([
      [0, [{ id: 'page-1-a' }, { id: 'page-1-b' }]],
      [1, [{ id: 'page-2-a' }]],
      [3, [{ id: 'page-4-a' }]]
    ]);

    expect(aggregateContiguousPrefetchedPageItems(itemsByPage, 4).map(item => item.id)).toEqual([
      'page-1-a',
      'page-1-b',
      'page-2-a'
    ]);
  });

  test('treats a bootstrap response at the client cap as complete for home rendering', () => {
    const items = Array.from({ length: 200 }, (_, idx) => ({ id: `item-${idx}` }));

    expect(isCompletePrefetchedListResponse({ items, totalCount: 350, nextPageToken: 'next' }, 200)).toBe(true);
  });

  test('keeps partial bootstrap responses eligible for background fetch', () => {
    const items = Array.from({ length: 50 }, (_, idx) => ({ id: `item-${idx}` }));

    expect(isCompletePrefetchedListResponse({ items, totalCount: 75, nextPageToken: 'next' }, 200)).toBe(false);
  });
});
