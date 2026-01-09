import { paginateItems, paginateItemsForListViewUi } from '../../../src/web/react/app/listViewPagination';

describe('listViewPagination.paginateItems', () => {
  test('returns all items when paging is disabled', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const out = paginateItems({ items, pageIndex: 0, pageSize: 10, enabled: false });
    expect(out).toEqual(items);
  });

  test('slices items when paging is enabled', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(paginateItems({ items, pageIndex: 0, pageSize: 10, enabled: true })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(paginateItems({ items, pageIndex: 1, pageSize: 10, enabled: true })).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(paginateItems({ items, pageIndex: 2, pageSize: 10, enabled: true })).toEqual([21, 22, 23, 24, 25]);
  });
});

describe('listViewPagination.paginateItemsForListViewUi', () => {
  test('caps items to first page when pagination controls are hidden', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const out = paginateItemsForListViewUi({ items, pageIndex: 3, pageSize: 10, paginationControlsEnabled: false });
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('honors pageIndex when pagination controls are enabled', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const out = paginateItemsForListViewUi({ items, pageIndex: 1, pageSize: 10, paginationControlsEnabled: true });
    expect(out).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

