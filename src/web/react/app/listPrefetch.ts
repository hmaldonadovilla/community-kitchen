import { ListItem } from '../api';

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
