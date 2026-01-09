/**
 * Client-side list view paging helpers.
 *
 * Note: The server list endpoints are still paginated for performance. This module only controls
 * whether the *UI* slices rows into pages (Previous/Next controls) or renders all matching rows.
 */

export function paginateItems<T>(args: {
  items: T[];
  pageIndex: number;
  pageSize: number;
  enabled: boolean;
}): T[] {
  const items = Array.isArray(args.items) ? args.items : [];
  if (!args.enabled) return items;
  const size = Math.max(1, Math.floor(Number(args.pageSize) || 1));
  const page = Math.max(0, Math.floor(Number(args.pageIndex) || 0));
  const start = page * size;
  if (start <= 0) return items.slice(0, size);
  return items.slice(start, start + size);
}

/**
 * ListView UI paging helper.
 *
 * - When pagination controls are enabled, honor `pageIndex`.
 * - When controls are hidden, still cap the rendered rows to `pageSize` (pageIndex forced to 0).
 *
 * This keeps the list compact while still allowing search/filter to run against the fully-prefetched dataset.
 */
export function paginateItemsForListViewUi<T>(args: {
  items: T[];
  pageIndex: number;
  pageSize: number;
  paginationControlsEnabled: boolean;
}): T[] {
  const effectivePageIndex = args.paginationControlsEnabled ? args.pageIndex : 0;
  return paginateItems({ items: args.items, pageIndex: effectivePageIndex, pageSize: args.pageSize, enabled: true });
}

