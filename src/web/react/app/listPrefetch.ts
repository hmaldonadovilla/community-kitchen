import { ListItem } from '../api';

const DEFAULT_CLIENT_LIST_CAP = 200;

export const aggregatePrefetchedPageItems = (itemsByPage: Map<number, ListItem[]>, totalPages: number): ListItem[] => {
  const aggregated: ListItem[] = [];
  for (let page = 0; page < totalPages; page += 1) {
    if (!itemsByPage.has(page)) continue;
    aggregated.push(...(itemsByPage.get(page) || []));
  }
  return aggregated;
};

export const aggregateContiguousPrefetchedPageItems = (itemsByPage: Map<number, ListItem[]>, totalPages: number): ListItem[] => {
  const contiguous: ListItem[] = [];
  for (let page = 0; page < totalPages; page += 1) {
    if (!itemsByPage.has(page)) break;
    contiguous.push(...(itemsByPage.get(page) || []));
  }
  return contiguous;
};

export const isCompletePrefetchedListResponse = (
  response: { items?: ListItem[]; totalCount?: number; nextPageToken?: string; completeData?: boolean } | null | undefined,
  clientCap: number = DEFAULT_CLIENT_LIST_CAP
): boolean => {
  if (!response || !Array.isArray(response.items)) return false;
  if (response.completeData === true) return true;
  const items = response.items || [];
  const totalRaw = Number(response.totalCount || 0);
  const cappedTotal =
    Number.isFinite(totalRaw) && totalRaw > 0
      ? Math.min(totalRaw, Math.max(1, Math.floor(clientCap || DEFAULT_CLIENT_LIST_CAP)))
      : response.nextPageToken
        ? Math.max(1, Math.floor(clientCap || DEFAULT_CLIENT_LIST_CAP))
        : items.length;
  if (items.length >= cappedTotal) return true;
  return !response.nextPageToken && (!Number.isFinite(totalRaw) || totalRaw <= 0 || items.length >= totalRaw);
};
