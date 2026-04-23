import type { WebFormSubmission } from '../../types';
import { fetchSortedBatch, type BatchResponse, type ListItem, type ListResponse, type ListSort } from '../api';

const mergeListItemsById = (existing: ListItem[], incoming: ListItem[]): ListItem[] => {
  const out = [...existing];
  const seen = new Set<string>();
  existing.forEach(item => {
    const id = (item?.id || '').toString();
    if (id) seen.add(id);
  });
  incoming.forEach(item => {
    const id = (item?.id || '').toString();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(item);
  });
  return out;
};

const isListResponse = (value: unknown): value is ListResponse => Boolean(value && Array.isArray((value as any).items));

type FetchFilteredSortedPagesArgs = {
  formKey: string;
  projection?: string[];
  pageSize?: number;
  includePageRecords?: boolean;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  dateFieldId: string;
  dateEquals?: string;
  dateFrom?: string;
  dateTo?: string;
  maxAttempts?: number;
  failureMessage: string;
  fetchSortedBatchImpl?: (
    formKey: string,
    projection?: string[],
    pageSize?: number,
    pageToken?: string,
    includePageRecords?: boolean,
    recordIds?: string[],
    sort?: ListSort | null
  ) => Promise<BatchResponse>;
  onRetry?: (args: { attempt: number; maxAttempts: number; token?: string; responseType: string }) => void;
  shouldAbort?: () => boolean;
  retryDelayMs?: (attempt: number) => number;
};

export type FetchFilteredSortedPagesResult = {
  items: ListItem[];
  response: ListResponse | null;
  records: Record<string, WebFormSubmission>;
  pages: number;
  aborted: boolean;
};

export async function fetchFilteredSortedPages(
  args: FetchFilteredSortedPagesArgs
): Promise<FetchFilteredSortedPagesResult> {
  const formKey = args.formKey;
  const fetchPage = args.fetchSortedBatchImpl || fetchSortedBatch;
  const maxAttempts = Math.max(1, Math.floor(Number(args.maxAttempts) || 5));
  const pageSize = Math.max(1, Math.min(Number(args.pageSize) || 50, 50));
  const delayForAttempt = args.retryDelayMs || ((attempt: number) => Math.min(2000, 250 * Math.pow(2, Math.max(0, attempt))));
  const shouldAbort = args.shouldAbort || (() => false);
  const projection = args.projection && args.projection.length ? args.projection : undefined;

  const fetchPageWithRetries = async (pageToken?: string): Promise<{ batch: BatchResponse; list: ListResponse; aborted: boolean }> => {
    let lastBatch: BatchResponse | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (shouldAbort()) {
        return {
          batch: { list: { items: [], totalCount: 0 }, records: {} },
          list: { items: [], totalCount: 0 },
          aborted: true
        };
      }

      lastBatch = await fetchPage(formKey, projection, pageSize, pageToken, Boolean(args.includePageRecords), undefined, {
        fieldId: args.sortField,
        direction: args.sortDirection,
        __dateFieldId: args.dateFieldId,
        ...(args.dateEquals ? { __dateEquals: args.dateEquals } : {}),
        ...(args.dateFrom ? { __dateFrom: args.dateFrom } : {}),
        ...(args.dateTo ? { __dateTo: args.dateTo } : {})
      } as ListSort);

      if (shouldAbort()) {
        return {
          batch: { list: { items: [], totalCount: 0 }, records: {} },
          list: { items: [], totalCount: 0 },
          aborted: true
        };
      }

      const list = (lastBatch as any)?.list as ListResponse | undefined;
      if (isListResponse(list)) {
        return { batch: lastBatch, list, aborted: false };
      }

      args.onRetry?.({
        attempt: attempt + 1,
        maxAttempts,
        token: pageToken,
        responseType: lastBatch === null ? 'null' : typeof lastBatch
      });

      if (attempt < maxAttempts - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, delayForAttempt(attempt)));
      }
    }

    throw new Error(args.failureMessage);
  };

  let token: string | undefined = undefined;
  let aggregatedItems: ListItem[] = [];
  const aggregatedRecords: Record<string, WebFormSubmission> = {};
  let lastResponse: ListResponse | null = null;
  let pages = 0;

  while (true) {
    const { batch, list, aborted } = await fetchPageWithRetries(token);
    if (aborted || shouldAbort()) {
      return {
        items: [],
        response: null,
        records: {},
        pages,
        aborted: true
      };
    }

    aggregatedItems = mergeListItemsById(aggregatedItems, (list.items || []) as ListItem[]);
    Object.assign(aggregatedRecords, (((batch as any)?.records || {}) as Record<string, WebFormSubmission>) || {});
    lastResponse = list;
    token = list.nextPageToken;
    pages += 1;
    if (!token || aggregatedItems.length >= (list.totalCount || aggregatedItems.length)) {
      break;
    }
  }

  return {
    items: aggregatedItems,
    response: lastResponse,
    records: aggregatedRecords,
    pages,
    aborted: false
  };
}
