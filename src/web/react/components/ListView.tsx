import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../i18n';
import { LangCode, ListViewColumnConfig, ListViewRuleColumnConfig, WebFormDefinition, WebFormSubmission } from '../../types';
import { toOptionSet } from '../../core';
import { tSystem } from '../../systemStrings';
import { fetchBatch, fetchList, ListItem, ListResponse } from '../api';
import { EMPTY_DISPLAY, formatDateEeeDdMmmYyyy, formatDisplayText } from '../utils/valueDisplay';
import { collectListViewRuleColumnDependencies, evaluateListViewRuleColumnCell } from '../app/listViewRuleColumns';
import { filterItemsByAdvancedSearch, hasActiveAdvancedSearch } from '../app/listViewAdvancedSearch';
import { normalizeToIsoDateLocal } from '../app/listViewSearch';
import { paginateItemsForListViewUi } from '../app/listViewPagination';
import { ListViewIcon } from './ListViewIcon';
import { DateInput } from './form/DateInput';

interface ListViewProps {
  formKey: string;
  definition: WebFormDefinition;
  language: LangCode;
  disabled?: boolean;
  onSelect: (
    row: ListItem,
    record?: WebFormSubmission,
    opts?: { openView?: 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit'; openButtonId?: string }
  ) => void;
  cachedResponse?: ListResponse | null;
  cachedRecords?: Record<string, WebFormSubmission>;
  refreshToken?: number;
  onCache?: (payload: { response: ListResponse; records: Record<string, WebFormSubmission> }) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  /**
   * When false, ListView becomes presentational only and will NOT issue list fetch requests.
   * (Used when list fetching/prefetching is handled at the App level so it can continue across views.)
   */
  autoFetch?: boolean;
  loading?: boolean;
  prefetching?: boolean;
  error?: string | null;
}

const ListView: React.FC<ListViewProps> = ({
  formKey,
  definition,
  language,
  disabled,
  onSelect,
  cachedResponse,
  cachedRecords,
  refreshToken = 0,
  onCache,
  onDiagnostic,
  autoFetch = true,
  loading: loadingProp,
  prefetching: prefetchingProp,
  error: errorProp
}) => {
  const uiDisabled = Boolean(disabled);
  const pageSize = Math.max(1, Math.min(definition.listView?.pageSize || 10, 50));
  const paginationEnabled = definition.listView?.paginationControlsEnabled !== false;
  const [loading, setLoading] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, WebFormSubmission>>(cachedRecords || {});
  const [allItems, setAllItems] = useState<ListItem[]>(cachedResponse?.items || []);
  const [totalCount, setTotalCount] = useState<number>(cachedResponse?.totalCount || 0);
  const [pageIndex, setPageIndex] = useState(0);
  const defaultSortField = definition.listView?.defaultSort?.fieldId || 'updatedAt';
  const defaultSortDirection = (definition.listView?.defaultSort?.direction || 'desc') as 'asc' | 'desc';
  const [searchValue, setSearchValue] = useState('');
  const [sortField, setSortField] = useState<string>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

  const headerSortEnabled = definition.listView?.headerSortEnabled !== false;

  const listSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date' | 'advanced';
  const dateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
  const dateSearchEnabled = listSearchMode === 'date' && !!dateSearchFieldId;
  const advancedSearchEnabled = listSearchMode === 'advanced';
  const searchInputId = 'ck-list-search';

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFieldFilters, setAdvancedFieldFilters] = useState<Record<string, string | string[]>>({});
  const [advancedHasSearched, setAdvancedHasSearched] = useState(false);

  const viewToggleEnabled = Boolean(definition.listView?.view?.toggleEnabled);
  const viewModeConfigured: 'table' | 'cards' = definition.listView?.view?.mode === 'cards' ? 'cards' : 'table';
  const viewDefaultModeConfigured: 'table' | 'cards' =
    definition.listView?.view?.defaultMode === 'cards'
      ? 'cards'
      : definition.listView?.view?.defaultMode === 'table'
        ? 'table'
        : viewModeConfigured;
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() =>
    viewToggleEnabled ? viewDefaultModeConfigured : viewModeConfigured
  );

  const uiLoading = loadingProp !== undefined ? Boolean(loadingProp) : loading;
  const uiPrefetching = prefetchingProp !== undefined ? Boolean(prefetchingProp) : prefetching;
  const uiError = errorProp !== undefined ? errorProp : error;

  useEffect(() => {
    if (cachedResponse?.items?.length) {
      setAllItems(cachedResponse.items);
      setTotalCount(cachedResponse.totalCount || cachedResponse.items.length);
    }
  }, [cachedResponse]);

  useEffect(() => {
    if (cachedRecords) {
      setRecords(cachedRecords);
    }
  }, [cachedRecords]);

  const columnsAll = useMemo<ListViewColumnConfig[]>(
    () => (definition.listView?.columns as ListViewColumnConfig[]) || definition.questions.map(q => ({ fieldId: q.id, label: q.label })),
    [definition]
  );

  const isRuleColumn = (col: ListViewColumnConfig): col is ListViewRuleColumnConfig => (col as any)?.type === 'rule';
  const isSortableColumn = (col: ListViewColumnConfig): boolean =>
    headerSortEnabled && (!isRuleColumn(col) ? true : Boolean((col as any).sortable));

  const isColumnVisibleInMode = useCallback((col: ListViewColumnConfig, mode: 'table' | 'cards'): boolean => {
    const raw = (col as any)?.showIn;
    if (raw === undefined || raw === null) return true;
    if (Array.isArray(raw)) return raw.includes(mode);
    const s = raw.toString ? raw.toString().trim().toLowerCase() : `${raw}`.trim().toLowerCase();
    if (!s || s === 'both' || s === 'all') return true;
    if (s === 'list') return mode === 'cards';
    if (s === 'card') return mode === 'cards';
    if (s === 'cards') return mode === 'cards';
    if (s === 'table') return mode === 'table';
    return true;
  }, []);

  const questionTypeById = useMemo(() => {
    const map: Record<string, string> = {};
    (definition.questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      map[id] = q.type;
    });
    return map;
  }, [definition.questions]);

  const questionLabelById = useMemo(() => {
    const map: Record<string, any> = {};
    (definition.questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      map[id] = q.label;
    });
    return map;
  }, [definition.questions]);

  const fieldTypeById = useMemo<Record<string, string>>(() => {
    // Meta columns
    // Explicit Record typing ensures `fieldTypeById[fieldId]` is safe for arbitrary string fieldIds.
    return { ...questionTypeById, createdAt: 'DATETIME', updatedAt: 'DATETIME', status: 'TEXT', pdfUrl: 'TEXT', id: 'TEXT' };
  }, [questionTypeById]);

  const optionSetById = useMemo(() => {
    const map: Record<string, any> = {};
    (definition.questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      map[id] = toOptionSet(q as any);
    });
    return map;
  }, [definition.questions]);

  const projection = useMemo(() => {
    const meta = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const ids = new Set<string>();
    const add = (fid: string) => {
      const id = (fid || '').toString().trim();
      if (!id || meta.has(id)) return;
      ids.add(id);
    };
    columnsAll.forEach(col => {
      const fid = (col as any)?.fieldId;
      if (!fid) return;
      if (isRuleColumn(col)) {
        collectListViewRuleColumnDependencies(col).forEach(add);
        return;
      }
      add(fid);
    });
    if (dateSearchEnabled && dateSearchFieldId) {
      add(dateSearchFieldId);
    }
    return Array.from(ids);
  }, [columnsAll, dateSearchEnabled, dateSearchFieldId]);

  const activeFetchRef = useRef(0);

  const encodePageTokenClient = (offset: number): string => {
    const n = Math.max(0, Math.floor(Number(offset) || 0));
    const text = n.toString();
    try {
      // Apps Script uses Utilities.base64Encode(offset.toString()) for page tokens.
      // In the browser, btoa() matches that for ASCII strings.
      if (typeof globalThis !== 'undefined' && typeof (globalThis as any).btoa === 'function') {
        return (globalThis as any).btoa(text);
      }
    } catch (_) {
      // ignore
    }
    // Best-effort fallback: return the raw offset string (may not decode on server if base64 is required).
    return text;
  };

  const isResponseComplete = (res: ListResponse | null | undefined): boolean => {
    if (!res || !Array.isArray((res as any).items)) return false;
    if ((res as any).nextPageToken) return false;
    const total = Number((res as any).totalCount || 0);
    if (!Number.isFinite(total) || total <= 0) return (res.items || []).length > 0;
    return (res.items || []).length >= total;
  };

  const fetchListPage = async (args: {
    token?: string;
    pageSize: number;
    includePageRecords: boolean;
  }): Promise<{ list: ListResponse; records: Record<string, WebFormSubmission> }> => {
    // Primary path: use batch endpoint (more reliable in the presence of stale/duplicate `fetchSubmissions` functions).
    let listRes: ListResponse | null | undefined;
    let recordsRes: Record<string, WebFormSubmission> = {};
    try {
      const batch = await fetchBatch(
        formKey,
        projection.length ? projection : undefined,
        args.pageSize,
        args.token,
        args.includePageRecords
      );
      const list = (batch as any)?.list as ListResponse | undefined;
      if (list && Array.isArray((list as any).items)) {
        listRes = list;
      }
      if (args.includePageRecords && batch && typeof (batch as any).records === 'object') {
        recordsRes = ((batch as any).records || {}) as Record<string, WebFormSubmission>;
      }
    } catch (_) {
      listRes = undefined;
      recordsRes = {};
    }

    // Legacy fallback: attempt direct list endpoint if batch is unavailable.
    if (!listRes) {
      listRes = await fetchList(
        formKey,
        projection.length ? projection : undefined,
        args.pageSize,
        args.token
      );
      recordsRes = {};
    }

    return { list: listRes, records: recordsRes };
  };

  const fetchFirstPageThenPrefetch = async () => {
    const requestId = ++activeFetchRef.current;
    const startedAt = Date.now();
    const firstPageSize = Math.max(1, Math.min(pageSize, 50));
    const backgroundPageSize = Math.min(50, Math.max(pageSize, 25));

    const cachedHasItems = Boolean(cachedResponse?.items?.length);
    const cachedIsComplete = isResponseComplete(cachedResponse);
    const cachedToken = cachedResponse?.nextPageToken;

    // If we already have a complete cached list, do nothing.
    if (cachedHasItems && cachedIsComplete) {
      setLoading(false);
      setPrefetching(false);
      setError(null);
      onDiagnostic?.('list.cache.used', {
        formKey,
        items: cachedResponse?.items?.length || 0,
        totalCount: cachedResponse?.totalCount,
        complete: true
      });
      return;
    }

    // If we have a partial cached list, resume background prefetch from its page token.
    if (cachedHasItems && cachedToken) {
      setLoading(false);
      setPrefetching(true);
      setError(null);
      onDiagnostic?.('list.fetch.resume', {
        formKey,
        cachedItems: cachedResponse?.items?.length || 0,
        totalCount: cachedResponse?.totalCount,
        backgroundPageSize,
        projectionCount: projection.length
      });

      void (async () => {
        try {
          let token: string | undefined = cachedToken;
          let aggregated: ListItem[] = [...(cachedResponse?.items || [])];
          let lastResponse: ListResponse | null = null;
          let page = 0;

          onDiagnostic?.('list.fetch.background.start', {
            formKey,
            firstPageSize,
            backgroundPageSize,
            startOffsetItems: aggregated.length
          });

          while (token) {
            const { list } = await fetchListPage({ token, pageSize: backgroundPageSize, includePageRecords: false });
            if (requestId !== activeFetchRef.current) return;
            if (!list || !Array.isArray((list as any).items)) {
              const resType = list === null ? 'null' : typeof list;
              const keys = list && typeof list === 'object' ? Object.keys(list as any).slice(0, 12) : [];
              onDiagnostic?.('list.fetch.invalidResponse', { hasResponse: !!list, resType, keys, phase: 'background' });
              break;
            }
            lastResponse = list;
            const items = list.items || [];
            aggregated = aggregated.concat(items);
            token = list.nextPageToken;
            page += 1;

            setAllItems([...aggregated]);
            setTotalCount(list.totalCount || aggregated.length);
            onCache?.({ response: { ...list, items: aggregated }, records: {} });

            onDiagnostic?.('list.fetch.background.page', {
              page,
              pageItems: items.length,
              aggregated: aggregated.length,
              totalCount: list.totalCount,
              hasNext: !!token,
              durationMs: Date.now() - startedAt
            });

            if (!token || aggregated.length >= (list.totalCount || 200)) {
              token = undefined;
            }
          }

          if (requestId !== activeFetchRef.current) return;
          if (lastResponse) {
            onCache?.({ response: { ...lastResponse, items: aggregated, nextPageToken: undefined }, records: {} });
          }
          setPrefetching(false);
          onDiagnostic?.('list.fetch.background.done', {
            pages: page,
            items: aggregated.length,
            durationMs: Date.now() - startedAt
          });
        } catch (err: any) {
          if (requestId !== activeFetchRef.current) return;
          const message = (err?.message || err?.toString?.() || 'Failed to load records.').toString();
          setPrefetching(false);
          onDiagnostic?.('list.fetch.background.error', { message });
        }
      })();
      return;
    }

    // No cache (or cache empty): fetch just the first UI page ASAP, then prefetch the rest in the background.
    setLoading(true);
    setPrefetching(false);
    setError(null);
    setAllItems([]);
    setTotalCount(0);

    onDiagnostic?.('list.fetch.start', {
      formKey,
      uiPageSize: pageSize,
      firstPageSize,
      backgroundPageSize,
      projectionCount: projection.length
    });

    try {
      // Use listViewSort (defaultSort) to prioritize fetching the most relevant rows for the initial page.
      // Since the server list endpoint is paginated by sheet row order, we "tail-fetch" for desc date/datetime/meta sorts.
      const defaultSortIsRuleColumn = columnsAll.some(c => c.fieldId === defaultSortField && isRuleColumn(c));
      const sortType =
        defaultSortField === 'createdAt' || defaultSortField === 'updatedAt' ? 'DATETIME' : (questionTypeById[defaultSortField] || '');
      const shouldTailFetchFirst =
        !defaultSortIsRuleColumn &&
        defaultSortDirection === 'desc' &&
        (defaultSortField === 'createdAt' ||
          defaultSortField === 'updatedAt' ||
          sortType.toString().toUpperCase() === 'DATE' ||
          sortType.toString().toUpperCase() === 'DATETIME');

      let list: ListResponse | null = null;
      let pageRecords: Record<string, WebFormSubmission> = {};

      const firstPageStrategy: 'head' | 'tail' = shouldTailFetchFirst ? 'tail' : 'head';
      if (firstPageStrategy === 'tail') {
        onDiagnostic?.('list.fetch.firstPage.strategy', {
          formKey,
          strategy: 'tail',
          sortField: defaultSortField,
          sortDirection: defaultSortDirection,
          sortType
        });

        // Step 1: cheap meta fetch to learn totalCount, then fetch the last page-sized window.
        const meta = await fetchListPage({ token: undefined, pageSize: 1, includePageRecords: false });
        if (requestId !== activeFetchRef.current) return;
        const total = Number((meta?.list as any)?.totalCount || 0);
        const totalCount = Number.isFinite(total) ? total : 0;
        const lastOffset = Math.max(0, totalCount - firstPageSize);
        const token = lastOffset > 0 ? encodePageTokenClient(lastOffset) : undefined;

        onDiagnostic?.('list.fetch.firstPage.tail', { formKey, totalCount, lastOffset, firstPageSize });

        const tail = await fetchListPage({ token, pageSize: firstPageSize, includePageRecords: true });
        list = tail?.list || null;
        pageRecords = tail?.records || {};
      } else {
        onDiagnostic?.('list.fetch.firstPage.strategy', {
          formKey,
          strategy: 'head',
          sortField: defaultSortField,
          sortDirection: defaultSortDirection
        });

        onDiagnostic?.('list.fetch.firstPage.start', { formKey, firstPageSize });
        const first = await fetchListPage({
          token: undefined,
          pageSize: firstPageSize,
          includePageRecords: true
        });
        list = first?.list || null;
        pageRecords = first?.records || {};
      }

      if (requestId !== activeFetchRef.current) return;
      if (!list || !Array.isArray((list as any).items)) {
        const resType = list === null ? 'null' : typeof list;
        const keys = list && typeof list === 'object' ? Object.keys(list as any).slice(0, 12) : [];
        onDiagnostic?.('list.fetch.invalidResponse', { hasResponse: !!list, resType, keys, phase: 'firstPage' });
        setError(
          'The server returned no list data. This usually means your Apps Script project has an older `fetchSubmissions` function still present (or the latest dist/Code.js was not fully pasted). Open Apps Script → search for `function fetchSubmissions` and ensure there is only one definition, then redeploy.'
        );
        return;
      }

      const firstItems = list.items || [];
      setAllItems(firstItems);
      setTotalCount(list.totalCount || firstItems.length);
      setPageIndex(0);
      if (pageRecords && Object.keys(pageRecords).length) {
        setRecords(prev => ({ ...prev, ...pageRecords }));
      }
      onCache?.({ response: list, records: pageRecords || {} });

      onDiagnostic?.('list.fetch.firstPage.ok', {
        formKey,
        items: firstItems.length,
        totalCount: list.totalCount,
        hasNext: !!list.nextPageToken,
        hydratedRecords: pageRecords ? Object.keys(pageRecords).length : 0,
        durationMs: Date.now() - startedAt
      });

      // Unblock UI ASAP after the first page.
      setLoading(false);

      // Background prefetch: fetch remaining pages (list only) without blocking UI.
      const mergeUniqueItems = (existing: ListItem[], incoming: ListItem[]): ListItem[] => {
        const out = [...existing];
        const seen = new Set<string>();
        existing.forEach(i => {
          const id = (i?.id || '').toString();
          if (id) seen.add(id);
        });
        incoming.forEach(i => {
          const id = (i?.id || '').toString();
          if (!id || seen.has(id)) return;
          seen.add(id);
          out.push(i);
        });
        return out;
      };

      // For "tail" strategy we still want to prefetch the rest of the dataset from the start (head),
      // because the tail page has no nextPageToken even though there are older records.
      const initialBackgroundToken = firstPageStrategy === 'tail' ? undefined : list.nextPageToken;
      const totalCount = list.totalCount || 0;
      if (firstItems.length >= (totalCount || 200) || (firstPageStrategy === 'head' && !initialBackgroundToken)) {
        setPrefetching(false);
        onDiagnostic?.('list.fetch.done', { pages: 1, items: firstItems.length, durationMs: Date.now() - startedAt });
        return;
      }

      setPrefetching(true);
      onDiagnostic?.('list.fetch.background.start', {
        formKey,
        backgroundPageSize,
        startOffsetItems: firstItems.length
      });

      void (async () => {
        try {
          let token: string | undefined = initialBackgroundToken;
          let firstBackgroundFetch = firstPageStrategy === 'tail'; // tail strategy starts with head token=undefined
          let aggregated: ListItem[] = [...firstItems];
          let lastResponse: ListResponse | null = list;
          let page = 1;

          while (firstBackgroundFetch || token) {
            const pageToken = firstBackgroundFetch ? undefined : token;
            firstBackgroundFetch = false;
            const { list: pageList } = await fetchListPage({ token: pageToken, pageSize: backgroundPageSize, includePageRecords: false });
            if (requestId !== activeFetchRef.current) return;
            if (!pageList || !Array.isArray((pageList as any).items)) {
              const resType = pageList === null ? 'null' : typeof pageList;
              const keys = pageList && typeof pageList === 'object' ? Object.keys(pageList as any).slice(0, 12) : [];
              onDiagnostic?.('list.fetch.invalidResponse', { hasResponse: !!pageList, resType, keys, phase: 'background' });
              break;
            }

            lastResponse = pageList;
            const items = pageList.items || [];
            aggregated = mergeUniqueItems(aggregated, items);
            token = pageList.nextPageToken;
            page += 1;

            setAllItems([...aggregated]);
            setTotalCount(pageList.totalCount || aggregated.length);
            onCache?.({ response: { ...pageList, items: aggregated }, records: {} });

            onDiagnostic?.('list.fetch.background.page', {
              page,
              pageItems: items.length,
              aggregated: aggregated.length,
              totalCount: pageList.totalCount,
              hasNext: !!token,
              durationMs: Date.now() - startedAt
            });

            if (!token || aggregated.length >= (pageList.totalCount || 200)) {
              token = undefined;
            }
          }

          if (requestId !== activeFetchRef.current) return;
          if (lastResponse) {
            onCache?.({ response: { ...lastResponse, items: aggregated, nextPageToken: undefined }, records: {} });
          }
          setPrefetching(false);
          onDiagnostic?.('list.fetch.background.done', {
            pages: page,
            items: aggregated.length,
            durationMs: Date.now() - startedAt
          });
        } catch (err: any) {
          if (requestId !== activeFetchRef.current) return;
          const message = (err?.message || err?.toString?.() || 'Failed to load records.').toString();
          setPrefetching(false);
          onDiagnostic?.('list.fetch.background.error', { message });
        }
      })();
    } catch (err: any) {
      if (requestId !== activeFetchRef.current) return;
      const message = (err?.message || err?.toString?.() || 'Failed to load records.').toString();
      setError(message);
      onDiagnostic?.('list.fetch.error', { message });
    } finally {
      if (requestId === activeFetchRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!autoFetch) return;
    // If we already have cached items, never refetch on navigation. Users can explicitly Refresh.
    if (cachedResponse?.items?.length) {
      setLoading(false);
      setPrefetching(false);
      setError(null);
      onDiagnostic?.('list.cache.used', {
        formKey,
        items: cachedResponse.items.length,
        totalCount: cachedResponse.totalCount,
        complete: isResponseComplete(cachedResponse)
      });
      return;
    }

    fetchFirstPageThenPrefetch();
    return () => {
      // Cancel any in-flight list fetch when switching forms/refreshing/unmounting.
      activeFetchRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, formKey, refreshToken]);

  useEffect(() => {
    setPageIndex(0);
    setSearchValue('');
    setAdvancedOpen(false);
    setAdvancedFieldFilters({});
    setAdvancedHasSearched(false);
    setSortField(defaultSortField);
    setSortDirection(defaultSortDirection);
  }, [formKey, refreshToken, defaultSortField, defaultSortDirection]);

  useEffect(() => {
    setViewMode(viewToggleEnabled ? viewDefaultModeConfigured : viewModeConfigured);
  }, [formKey, refreshToken, viewDefaultModeConfigured, viewModeConfigured, viewToggleEnabled]);

  useEffect(() => {
    if (!onDiagnostic) return;
    onDiagnostic('list.view.config', {
      mode: viewModeConfigured,
      toggleEnabled: viewToggleEnabled,
      defaultMode: viewDefaultModeConfigured
    });
  }, [onDiagnostic, viewDefaultModeConfigured, viewModeConfigured, viewToggleEnabled]);

  useEffect(() => {
    if (!onDiagnostic) return;
    onDiagnostic('list.view.mode', { mode: viewMode });
  }, [onDiagnostic, viewMode]);

  useEffect(() => {
    // Reset paging when filtering changes to avoid landing on an empty page after narrowing results.
    setPageIndex(0);
  }, [searchValue]);

  useEffect(() => {
    if (!advancedSearchEnabled) return;
    if (!advancedHasSearched) return;
    setPageIndex(0);
  }, [advancedFieldFilters, advancedHasSearched, advancedSearchEnabled]);

  useEffect(() => {
    if (!onDiagnostic) return;
    if (listSearchMode === 'date') {
      onDiagnostic('list.search.mode', { mode: 'date', dateFieldId: dateSearchFieldId });
      if (!dateSearchFieldId) {
        onDiagnostic('list.search.invalidConfig', { mode: 'date', dateFieldId: dateSearchFieldId });
      }
      return;
    }
    if (listSearchMode === 'advanced') {
      const fields = Array.isArray((definition.listView?.search as any)?.fields) ? ((definition.listView?.search as any)?.fields || []) : [];
      onDiagnostic('list.search.mode', { mode: 'advanced', fields });
      return;
    }
    onDiagnostic('list.search.mode', { mode: 'text' });
  }, [dateSearchFieldId, listSearchMode, onDiagnostic]);

  const searchableFieldIds = useMemo(() => {
    const ids = new Set<string>();
    columnsAll.forEach(col => ids.add(col.fieldId));
    ['status', 'pdfUrl', 'updatedAt', 'createdAt', 'id'].forEach(id => ids.add(id));
    return Array.from(ids);
  }, [columnsAll]);

  const ruleColumns = useMemo(() => columnsAll.filter(isRuleColumn) as ListViewRuleColumnConfig[], [columnsAll]);

  const columnsForTable = useMemo(
    () => columnsAll.filter(col => isColumnVisibleInMode(col, 'table')),
    [columnsAll, isColumnVisibleInMode]
  );
  const columnsForCards = useMemo(
    () => columnsAll.filter(col => isColumnVisibleInMode(col, 'cards')),
    [columnsAll, isColumnVisibleInMode]
  );
  const ruleColumnsForCards = useMemo(
    () => columnsForCards.filter(isRuleColumn) as ListViewRuleColumnConfig[],
    [columnsForCards]
  );

  const advancedSearchFieldIds = useMemo(() => {
    const raw = (definition.listView?.search as any)?.fields;
    const normalized: string[] = (() => {
      if (raw === undefined || raw === null || raw === '') return [];
      if (Array.isArray(raw)) return raw.map(v => (v === undefined || v === null ? '' : `${v}`.trim())).filter(Boolean);
      const str = `${raw}`.trim();
      if (!str) return [];
      return str
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    })();
    if (normalized.length) return normalized;
    // Safe fallback: expose all non-rule columns as filter inputs.
    return columnsAll.filter(col => !isRuleColumn(col)).map(col => col.fieldId);
  }, [columnsAll, definition.listView?.search]);

  const keywordSearchFieldIds = useMemo(() => {
    const ids = new Set<string>(searchableFieldIds);
    advancedSearchFieldIds.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [advancedSearchFieldIds, searchableFieldIds]);

  useEffect(() => {
    if (!onDiagnostic) return;
    if (!ruleColumns.length) return;
    const deps = ruleColumns.map(c => ({
      columnId: c.fieldId,
      openView:
        typeof (c as any).openView === 'object' && (c as any).openView
          ? (((c as any).openView as any).target || 'auto')
          : ((c as any).openView || 'auto'),
      rowClick:
        typeof (c as any).openView === 'object' && (c as any).openView ? Boolean(((c as any).openView as any).rowClick) : false,
      dependencies: collectListViewRuleColumnDependencies(c)
    }));
    onDiagnostic('list.ruleColumns.enabled', { columns: deps });
  }, [onDiagnostic, ruleColumns]);

  const defaultDirectionForField = (fieldId: string): 'asc' | 'desc' => {
    if (fieldId === 'createdAt' || fieldId === 'updatedAt') return 'desc';
    const t = (questionTypeById[fieldId] || '').toString().toUpperCase();
    if (t === 'DATE' || t === 'DATETIME') return 'desc';
    return 'asc';
  };

  const compareValues = (a: any, b: any): number => {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (!Number.isNaN(dateA.getTime()) && !Number.isNaN(dateB.getTime())) {
      return dateA.getTime() - dateB.getTime();
    }
    return `${a}`.localeCompare(`${b}`);
  };

  const visibleItems = useMemo(() => {
    const baseItems = allItems || [];
    const items: ListItem[] =
      ruleColumns.length
        ? baseItems.map(row => {
            let next: any = null;
            ruleColumns.forEach(col => {
              const cell = evaluateListViewRuleColumnCell(col, row);
              const text = cell ? resolveLocalizedString(cell.text, language, '') : '';
              if (next === null) next = { ...row };
              next[col.fieldId] = text;
            });
            return (next || row) as ListItem;
          })
        : baseItems;
    const trimmed = searchValue.trim();
    const advancedQuery = { keyword: searchValue, fieldFilters: advancedFieldFilters };
    const applyAdvanced = advancedSearchEnabled && advancedHasSearched && hasActiveAdvancedSearch(advancedQuery);
    const filtered =
      dateSearchEnabled && trimmed
        ? items.filter(row => normalizeToIsoDateLocal((row as any)[dateSearchFieldId]) === trimmed)
        : dateSearchEnabled
          ? items
          : applyAdvanced
            ? filterItemsByAdvancedSearch(items, advancedQuery, { keywordFieldIds: keywordSearchFieldIds, fieldTypeById })
            : !advancedSearchEnabled && trimmed
            ? (() => {
                const keyword = trimmed.toLowerCase();
                return items.filter(row =>
                  searchableFieldIds.some(fieldId => {
                    const raw = (row as any)[fieldId];
                    if (raw === undefined || raw === null) return false;
                    const value = Array.isArray(raw) ? raw.join(' ') : `${raw}`;
                    return value.toLowerCase().includes(keyword);
                  })
                );
              })()
            : items;
    const field = sortField || 'updatedAt';
    const sorted = [...filtered].sort((rowA, rowB) => {
      const result = compareValues((rowA as any)[field], (rowB as any)[field]);
      return sortDirection === 'asc' ? result : -result;
    });
    return sorted;
  }, [
    advancedFieldFilters,
    advancedHasSearched,
    advancedSearchEnabled,
    allItems,
    dateSearchEnabled,
    dateSearchFieldId,
    fieldTypeById,
    keywordSearchFieldIds,
    language,
    ruleColumns,
    searchValue,
    searchableFieldIds,
    sortField,
    sortDirection
  ]);

  const pagedItems = useMemo(() => {
    return paginateItemsForListViewUi({ items: visibleItems, pageIndex, pageSize, paginationControlsEnabled: paginationEnabled });
  }, [paginationEnabled, pageIndex, pageSize, visibleItems]);

  const totalPages = paginationEnabled ? Math.max(1, Math.ceil(visibleItems.length / pageSize)) : 1;
  const showPrev = paginationEnabled && pageIndex > 0;
  const showNext = paginationEnabled && pageIndex < totalPages - 1;
  const loadedCount = (allItems || []).length;
  const activeSearch =
    listSearchMode === 'date'
      ? Boolean(searchValue.trim())
      : listSearchMode === 'advanced'
        ? advancedHasSearched && hasActiveAdvancedSearch({ keyword: searchValue, fieldFilters: advancedFieldFilters })
        : Boolean(searchValue.trim());
  const showLoadedOfTotal = !activeSearch && totalCount > 0 && loadedCount > 0 && loadedCount < totalCount;

  const formatDateOnly = (value: any): string | null => {
    if (value === undefined || value === null || value === '') return null;
    const out = formatDateEeeDdMmmYyyy(value, language);
    return out === EMPTY_DISPLAY ? null : out;
  };

  const formatDateTime = (value: any): string | null => {
    if (value === undefined || value === null || value === '') return null;
    const pad2 = (n: number) => n.toString().padStart(2, '0');

    // Date-time: keep user's timezone but force dd/mm/yyyy display
    const candidate = typeof value === 'number' ? value : `${value}`;
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) return null;
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(
      date.getMinutes()
    )}:${pad2(date.getSeconds())}`;
  };

  const splitUrlList = (raw: string): string[] => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return [];
    const commaParts = trimmed
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (commaParts.length > 1) return commaParts;
    const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
    if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
    return [trimmed];
  };

  const summarizeArray = (raw: any[]): string => {
    if (!raw.length) return EMPTY_DISPLAY;
    const scalarOnly = raw.every(v => typeof v === 'string' || typeof v === 'number');
    if (scalarOnly) return raw.join(', ');
    const firstObject = raw.find(v => v && typeof v === 'object');
    if (!firstObject) return raw.map(v => `${v}`).join(', ');
    const keys = Object.keys(firstObject || {}).slice(0, 3);
    const preview = raw
      .slice(0, 3)
      .map(item => {
        if (!item || typeof item !== 'object') return `${item}`;
        const parts = keys
          .map(k => item[k])
          .filter(Boolean)
          .map(v => `${v}`);
        return parts.join(' / ');
      })
      .filter(Boolean)
      .join(' · ');
    const suffix = raw.length > 3 ? ` … +${raw.length - 3}` : '';
    if (preview) return `${preview}${suffix}`;
    const key = raw.length === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany';
    const fallback = raw.length === 1 ? `${raw.length} item` : `${raw.length} items`;
    return tSystem(key, language, fallback, { count: raw.length });
  };

  const tryParseJson = (raw: string): unknown | null => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  };

  const renderRuleCell = (row: ListItem, col: ListViewRuleColumnConfig) => {
    const cell = evaluateListViewRuleColumnCell(col, row);
    if (!cell) return null;
    const text = resolveLocalizedString(cell.text, language, EMPTY_DISPLAY);
    const style = (cell?.style || 'link').toString();
    const icon = cell?.icon ? <ListViewIcon name={cell.icon} /> : null;
    const openButtonId = ((cell as any).openButtonId || '').toString().trim();
    const openViewRaw = ((cell as any).openView || 'auto') as 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';
    const openView = openViewRaw === 'button' && !openButtonId ? 'auto' : openViewRaw;
    const className =
      style === 'warning'
        ? 'ck-list-nav ck-list-nav--warning'
        : style === 'muted'
        ? 'ck-list-nav ck-list-nav--muted'
        : 'ck-list-nav';

    if (uiDisabled) {
      return (
        <span className={className} aria-disabled="true" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
          {icon}
          <span>{text}</span>
        </span>
      );
    }

    const hrefFieldId = (cell.hrefFieldId || '').toString().trim();
    const hrefRaw = hrefFieldId ? (row as any)[hrefFieldId] : null;
    const href = (() => {
      if (!hrefRaw) return '';
      const str = Array.isArray(hrefRaw) ? hrefRaw.join(' ') : hrefRaw.toString();
      const urls = splitUrlList(str).filter(u => /^https?:\/\//i.test(u));
      return urls[0] || '';
    })();

    if (style === 'link' && hrefFieldId) {
      // URL-driven link: open the URL stored in the target field (e.g. pdfUrl).
      if (!href) {
        onDiagnostic?.('list.ruleColumn.link.missingUrl', { columnId: col.fieldId, hrefFieldId });
        return (
          <span className="ck-list-nav ck-list-nav--muted">
            {icon}
            <span>{text}</span>
          </span>
        );
      }
      return (
        <a
          className={className}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => {
            e.stopPropagation();
            onDiagnostic?.('list.ruleColumn.link.open', { columnId: col.fieldId, hrefFieldId, href });
          }}
        >
          {icon}
          <span>{text}</span>
        </a>
      );
    }

    return (
      <button
        type="button"
        className={className}
        disabled={uiDisabled}
        onClick={e => {
          e.stopPropagation();
          onDiagnostic?.('list.ruleColumn.click', {
            columnId: col.fieldId,
            openView,
            openButtonId: openView === 'button' ? openButtonId : null,
            text
          });
          onSelect(row, row?.id ? records[row.id] : undefined, {
            openView,
            openButtonId: openView === 'button' ? openButtonId : undefined
          });
        }}
      >
        {icon}
        <span>{text}</span>
      </button>
    );
  };

  const renderCellValue = (row: ListItem, fieldId: string) => {
    const raw = (row as any)[fieldId];
    if (raw === undefined || raw === null || raw === '') return EMPTY_DISPLAY;
    const parsed = typeof raw === 'string' ? tryParseJson(raw) : null;
    const value = parsed !== null ? parsed : raw;
    const isArray = Array.isArray(value);
    const isScalar = typeof value === 'string' || typeof value === 'number';
    const fieldType =
      fieldId === 'createdAt' || fieldId === 'updatedAt' ? 'DATETIME' : (questionTypeById[fieldId] || '');
    const optionSet = optionSetById[fieldId];
    const dateText =
      isScalar && fieldType === 'DATETIME'
        ? formatDateTime(raw)
        : isScalar && fieldType === 'DATE'
        ? formatDateOnly(raw)
        : null;
    const text = (() => {
      if (dateText) return dateText;
      if (isArray) {
        // Localize scalar arrays (checkbox / multi-select).
        if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
          return formatDisplayText(value, { language, optionSet, fieldType });
        }
        return summarizeArray(value);
      }
      if (typeof value === 'boolean') {
        return formatDisplayText(value, { language, optionSet, fieldType });
      }
      if (typeof value === 'string') {
        return formatDisplayText(value, { language, optionSet, fieldType });
      }
      return `${value}`;
    })();
    const title = dateText ? `${raw}` : text;
    if (typeof value === 'string') {
      const urls = splitUrlList(value).filter(u => /^https?:\/\//i.test(u));
      if (urls.length > 1) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {urls.slice(0, 3).map((u, idx) => (
              <a
                key={`${u}-${idx}`}
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate-link"
                title={u}
                onClick={e => e.stopPropagation()}
              >
                {u.split('/').pop() || u}
              </a>
            ))}
            {urls.length > 3 && (
              <span className="muted">
                {tSystem('common.more', language, '+{count} more', { count: urls.length - 3 })}
              </span>
            )}
          </div>
        );
      }
      if (urls.length === 1) {
        const href = urls[0];
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate-link"
            title={title}
            onClick={e => e.stopPropagation()}
          >
            {text}
          </a>
        );
      }
    }
    const isLink = typeof value === 'string' && /^https?:\/\//i.test(value);
    if (isLink) {
      return (
        <a
          href={value as string}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate-link"
          title={title}
          onClick={e => e.stopPropagation()}
        >
          {text}
        </a>
      );
    }
    return (
      <span className="truncate-link" title={title} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
        {text}
      </span>
    );
  };

  const handleRowClick = useCallback(
    (row: ListItem) => {
      if (uiDisabled) {
        onDiagnostic?.('list.row.click.disabled', { recordId: row.id });
        return;
      }
      const record = row?.id ? records[row.id] : undefined;
      const rowOpen = (() => {
        for (const col of ruleColumns) {
          const cell = evaluateListViewRuleColumnCell(col, row);
          if (!cell || !cell.rowClick) continue;
          const openButtonId = (cell.openButtonId || '').toString().trim();
          const openViewRaw = (cell.openView || 'auto') as 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';
          const openView = openViewRaw === 'button' && !openButtonId ? 'auto' : openViewRaw;
          return {
            columnId: col.fieldId,
            openView,
            openButtonId: openView === 'button' ? openButtonId : undefined
          };
        }
        return null;
      })();
      onDiagnostic?.('list.row.click', {
        recordId: row.id,
        columnId: rowOpen?.columnId || null,
        openView: rowOpen?.openView || 'auto',
        openButtonId: rowOpen?.openView === 'button' ? rowOpen?.openButtonId || null : null
      });
      if (rowOpen) {
        onSelect(row, record, { openView: rowOpen.openView, openButtonId: rowOpen.openButtonId });
      } else {
        onSelect(row, record);
      }
    },
    [onDiagnostic, onSelect, records, ruleColumns, uiDisabled]
  );

  const clearSearch = useCallback(() => {
    if (advancedSearchEnabled) {
      setSearchValue('');
      setAdvancedFieldFilters({});
      setAdvancedHasSearched(false);
      setAdvancedOpen(false);
      onDiagnostic?.('list.search.clear', { mode: 'advanced' });
      return;
    }
    setSearchValue('');
    onDiagnostic?.('list.search.clear', { mode: dateSearchEnabled ? 'date' : 'text' });
  }, [advancedSearchEnabled, dateSearchEnabled, onDiagnostic]);

  const applyAdvancedSearchNow = useCallback(() => {
    if (!advancedSearchEnabled) return;
    const query = { keyword: searchValue, fieldFilters: advancedFieldFilters };
    if (!hasActiveAdvancedSearch(query)) {
      onDiagnostic?.('list.search.advanced.empty', {});
      return;
    }
    setAdvancedHasSearched(true);
    setAdvancedOpen(false);
    setPageIndex(0);
    const activeFilters = Object.entries(advancedFieldFilters)
      .map(([fieldId, value]) => ({
        fieldId,
        value: Array.isArray(value) ? value.map(v => (v || '').trim()).filter(Boolean).join(',') : (value || '').trim()
      }))
      .filter(v => Boolean(v.value));
    onDiagnostic?.('list.search.advanced.apply', {
      keyword: (searchValue || '').trim() || null,
      filters: activeFilters.map(f => f.fieldId),
      filterCount: activeFilters.length
    });
  }, [advancedFieldFilters, advancedSearchEnabled, onDiagnostic, searchValue]);

  const showClearSearch = useMemo(() => {
    if (advancedSearchEnabled) {
      return (
        Boolean(searchValue.trim()) ||
        Object.values(advancedFieldFilters).some(v => (Array.isArray(v) ? v.some(item => (item || '').trim().length > 0) : (v || '').trim().length > 0)) ||
        advancedHasSearched
      );
    }
    return Boolean(searchValue.trim());
  }, [advancedFieldFilters, advancedHasSearched, advancedSearchEnabled, searchValue]);

  const cardTitleFieldId = useMemo(() => {
    const firstNonRule = columnsForCards.find(col => !isRuleColumn(col));
    return (firstNonRule?.fieldId || 'id').toString();
  }, [columnsForCards]);

  const getFieldLabel = (fieldId: string): string => {
    const fromColumns = columnsAll.find(c => c.fieldId === fieldId)?.label;
    if (fromColumns) return resolveLocalizedString(fromColumns, language, fieldId);
    const fromQuestions = questionLabelById[fieldId];
    if (fromQuestions) return resolveLocalizedString(fromQuestions, language, fieldId);
    if (fieldId === 'createdAt') return tSystem('list.meta.createdAt', language, 'Created');
    if (fieldId === 'updatedAt') return tSystem('list.meta.updatedAt', language, 'Updated');
    if (fieldId === 'status') return tSystem('list.meta.status', language, 'Status');
    if (fieldId === 'pdfUrl') return tSystem('list.meta.pdfUrl', language, 'PDF URL');
    return fieldId;
  };

  const statusFilterOptions = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (value: any) => {
      const s = value !== undefined && value !== null ? value.toString().trim() : '';
      if (!s) return;
      if (seen.has(s)) return;
      seen.add(s);
      out.push(s);
    };

    const transitions = definition.followup?.statusTransitions || {};
    add((transitions as any).onPdf);
    add((transitions as any).onEmail);
    add((transitions as any).onClose);

    add(definition.autoSave?.status);

    (definition.questions || []).forEach(q => {
      if ((q as any).type !== 'BUTTON') return;
      const btn = (q as any).button;
      if (!btn || typeof btn !== 'object') return;
      if ((btn as any).action !== 'updateRecord') return;
      add((btn as any)?.set?.status);
    });

    // Include any statuses already present in the fetched list results (covers legacy/hand-edited statuses).
    (allItems || []).forEach(row => add((row as any)?.status));

    return out;
  }, [allItems, definition.autoSave?.status, definition.followup?.statusTransitions, definition.questions]);

  const buildSelectOptionsForField = useCallback(
    (fieldId: string): Array<{ value: string; label: string }> => {
      const lower = (fieldId || '').toString().trim().toLowerCase();
      if (lower === 'status') {
        return statusFilterOptions.map(v => ({ value: v, label: v }));
      }

      const optionSet = optionSetById[fieldId];
      const base = optionSet?.en;
      if (!Array.isArray(base) || !base.length) return [];

      const lang = (language || 'EN').toString().toUpperCase();
      const labels = (lang === 'FR' ? optionSet.fr : lang === 'NL' ? optionSet.nl : optionSet.en) || optionSet.en || base;
      const labelList = Array.isArray(labels) ? labels : base;

      return base
        .map((raw, idx) => {
          const value = raw !== undefined && raw !== null ? raw.toString() : '';
          const labelRaw = labelList[idx] !== undefined && labelList[idx] !== null ? labelList[idx].toString() : value;
          const label = labelRaw || value;
          return value ? { value, label } : null;
        })
        .filter(Boolean) as Array<{ value: string; label: string }>;
    },
    [language, optionSetById, statusFilterOptions]
  );

  const showResults = viewMode === 'table' || activeSearch;

  const titleNode = (() => {
    const configured = definition.listView?.title;
    // When `title` is explicitly provided as empty string, hide the title entirely.
    if (typeof configured === 'string' && configured.trim() === '') {
      onDiagnostic?.('list.title.hidden', { reason: 'explicitEmpty' });
      return null;
    }
    const titleText =
      configured === undefined
        ? tSystem('list.title', language, 'Records')
        : resolveLocalizedString(configured, language, tSystem('list.title', language, 'Records'));
    if (!titleText || !titleText.toString().trim()) {
      onDiagnostic?.('list.title.hidden', { reason: 'resolvedEmpty' });
      return null;
    }
    return <h3>{titleText}</h3>;
  })();

  const configuredPlaceholder = (definition.listView?.search as any)?.placeholder;
  const placeholderIsExplicitlyEmpty = typeof configuredPlaceholder === 'string' && configuredPlaceholder.trim() === '';
  const searchPlaceholder = placeholderIsExplicitlyEmpty
    ? ''
    : resolveLocalizedString(configuredPlaceholder, language, tSystem('list.searchPlaceholder', language, 'Search records'));

  const searchControlClass = `ck-list-search-control${
    (advancedSearchEnabled ? ' ck-has-advanced' : '') + (showClearSearch ? ' ck-has-clear' : '') + ((advancedSearchEnabled || showClearSearch) ? ' ck-has-icons' : '')
  }`;

  return (
    <div className="card" style={{ position: 'relative' }} aria-disabled={uiDisabled}>
      {uiDisabled ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            cursor: 'wait'
          }}
        />
      ) : null}
      {titleNode}

      <div className="list-toolbar">
        <label className="ck-list-search-label" htmlFor={searchInputId}>
          {dateSearchEnabled ? tSystem('list.searchByDate', language, '🔍 by date') : tSystem('list.searchByText', language, '🔍')}
        </label>

        <div className={searchControlClass}>
          {dateSearchEnabled ? (
            <DateInput
              id={searchInputId}
              value={searchValue}
              language={language}
              ariaLabel={tSystem('list.searchDateLabel', language, 'Filter by date')}
              onChange={next => setSearchValue(next)}
            />
          ) : (
            <input
              id={searchInputId}
              type="search"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder || tSystem('list.searchPlaceholder', language, 'Search records')}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={e => {
                if (!advancedSearchEnabled) return;
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyAdvancedSearchNow();
              }}
            />
          )}

          {advancedSearchEnabled ? (
            <button
              type="button"
              className="ck-list-search-advanced-icon"
              aria-label={tSystem('list.advancedSearch', language, 'Advanced search')}
              onClick={() => {
                setAdvancedOpen(prev => {
                  const next = !prev;
                  onDiagnostic?.('list.search.advanced.toggle', { open: next });
                  return next;
                });
              }}
            >
              <span aria-hidden="true">⚙︎</span>
            </button>
          ) : null}

          {showClearSearch ? (
            <button
              type="button"
              className="ck-list-search-clear-icon"
              aria-label={tSystem('list.clearSearch', language, 'Clear')}
              onClick={clearSearch}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>

        {viewToggleEnabled ? (
          <div className="ck-list-view-toggle" role="group" aria-label={tSystem('list.viewToggle', language, 'View')}>
            <button
              type="button"
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => {
                setViewMode('table');
                onDiagnostic?.('list.view.toggle', { mode: 'table' });
              }}
            >
              {tSystem('list.view.table', language, 'Table')}
            </button>
            <button
              type="button"
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => {
                setViewMode('cards');
                onDiagnostic?.('list.view.toggle', { mode: 'cards' });
              }}
            >
              {tSystem('list.view.cards', language, 'List')}
            </button>
          </div>
          ) : null}
        </div>

      {advancedSearchEnabled && advancedOpen ? (
        <div className="ck-list-advanced-panel" role="dialog" aria-label={tSystem('list.advancedSearch', language, 'Advanced search')}>
          <div className="ck-list-advanced-grid">
            {advancedSearchFieldIds.map(fieldId => {
              const id = `ck-list-adv-${fieldId}`;
              const filterRaw = advancedFieldFilters[fieldId];
              const value = Array.isArray(filterRaw) ? '' : (filterRaw || '').toString();
              const fieldType = (fieldTypeById[fieldId] || '').toString().toUpperCase();
              const isDate = fieldType === 'DATE' || fieldType === 'DATETIME';
              const isChoice = fieldType === 'CHOICE';
              const isCheckbox = fieldType === 'CHECKBOX';
              const isStatus = (fieldId || '').toString().trim().toLowerCase() === 'status';
              const selectOptions = (isStatus || isChoice || isCheckbox) ? buildSelectOptionsForField(fieldId) : [];
              const hasSelectOptions = Boolean(selectOptions.length);
              const useSelect = isStatus || isChoice || (isCheckbox && hasSelectOptions);
              const checkboxIsConsent = isCheckbox && !hasSelectOptions;
              const checkboxSelected = Array.isArray(filterRaw)
                ? (filterRaw as string[])
                : filterRaw
                  ? [`${filterRaw}`]
                  : [];
              return (
                <div className="ck-list-advanced-row" key={fieldId}>
                  <label className="ck-list-advanced-label" htmlFor={id}>
                    {getFieldLabel(fieldId)}
                  </label>
                  <div className="ck-list-advanced-control">
                    {useSelect ? (
                      isCheckbox ? (
                        <select
                          id={id}
                          multiple
                          aria-label={getFieldLabel(fieldId)}
                          value={checkboxSelected}
                          onChange={e => {
                            const next = Array.from(e.currentTarget.selectedOptions)
                              .map(opt => opt.value)
                              .filter(Boolean);
                            setAdvancedFieldFilters(prev => ({ ...prev, [fieldId]: next }));
                          }}
                        >
                          {selectOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          id={id}
                          aria-label={getFieldLabel(fieldId)}
                          value={value}
                          onChange={e => setAdvancedFieldFilters(prev => ({ ...prev, [fieldId]: e.target.value }))}
                        >
                          <option value="">{tSystem('list.any', language, 'Any')}</option>
                          {selectOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )
                    ) : checkboxIsConsent ? (
                      <input
                        id={id}
                        type="checkbox"
                        aria-label={getFieldLabel(fieldId)}
                        checked={Boolean(filterRaw) && `${filterRaw}`.toLowerCase() === 'true'}
                        onChange={e =>
                          setAdvancedFieldFilters(prev => ({ ...prev, [fieldId]: e.target.checked ? 'true' : '' }))
                        }
                      />
                    ) : isDate ? (
                      <DateInput
                        id={id}
                        value={value}
                        language={language}
                        ariaLabel={getFieldLabel(fieldId)}
                        onChange={next => setAdvancedFieldFilters(prev => ({ ...prev, [fieldId]: next }))}
                      />
                    ) : (
                      <input
                        id={id}
                        type="search"
                        placeholder={getFieldLabel(fieldId)}
                        aria-label={getFieldLabel(fieldId)}
                        value={value}
                        onChange={e => setAdvancedFieldFilters(prev => ({ ...prev, [fieldId]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          applyAdvancedSearchNow();
                        }}
                      />
                    )}
      </div>
                </div>
              );
            })}
          </div>

          <div className="actions ck-list-advanced-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setAdvancedOpen(false);
                onDiagnostic?.('list.search.advanced.toggle', { open: false });
              }}
            >
              {tSystem('common.close', language, 'Close')}
            </button>
            <button type="button" className="secondary" onClick={clearSearch}>
              {tSystem('list.clearSearch', language, 'Clear')}
            </button>
            <button type="button" onClick={applyAdvancedSearchNow}>
              {tSystem('list.search', language, 'Search')}
            </button>
          </div>
        </div>
      ) : null}

      {uiLoading ? (
        <div className="status">{tSystem('common.loading', language, 'Loading…')}</div>
      ) : uiPrefetching ? (
        <div className="status muted" style={{ opacity: 0.9 }}>
          {tSystem('list.loadingMore', language, 'Loading more…')}
        </div>
      ) : null}

      {uiError && <div className="error">{uiError}</div>}

      {viewMode === 'table' ? (
      <div className="list-table-wrapper">
        <table className="list-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
                {columnsForTable.map(col => (
                <th
                  key={col.fieldId}
                  scope="col"
                  aria-sort={
                    sortField === col.fieldId ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  style={{
                    maxWidth: 180,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    cursor: isSortableColumn(col) ? 'pointer' : 'default'
                  }}
                >
                  {isSortableColumn(col) ? (
                    <button
                      type="button"
                      className="ck-list-sort-header"
                      onClick={() => {
                        const nextField = col.fieldId;
                        if (sortField === nextField) {
                          setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortField(nextField);
                          setSortDirection(defaultDirectionForField(nextField));
                        }
                        setPageIndex(0);
                      }}
                    >
                      <span>{resolveLocalizedString(col.label, language, col.fieldId)}</span>
                      {sortField === col.fieldId ? (
                        <span className="ck-list-sort-indicator" aria-hidden="true">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    resolveLocalizedString(col.label, language, col.fieldId)
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedItems.length ? (
              pagedItems.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => handleRowClick(row)}
                    style={{ cursor: uiDisabled ? 'default' : 'pointer' }}
                    aria-disabled={uiDisabled}
                  >
                    {columnsForTable.map(col => (
                    <td
                      key={col.fieldId}
                      style={{ maxWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top' }}
                    >
                      {isRuleColumn(col) ? renderRuleCell(row, col) : renderCellValue(row, col.fieldId)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                  <td colSpan={columnsForTable.length} className="muted">
                  {tSystem('list.noRecords', language, 'No records found.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : !showResults ? null : (
        <div className="ck-list-cards">
          {pagedItems.length ? (
            pagedItems.map(row => (
              <div
                key={row.id}
                className="ck-list-card"
                role="button"
                tabIndex={uiDisabled ? -1 : 0}
                aria-disabled={uiDisabled}
                onClick={() => handleRowClick(row)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  handleRowClick(row);
                }}
              >
                <div className="ck-list-card-title">{renderCellValue(row, cardTitleFieldId)}</div>
                {ruleColumnsForCards.length ? (
                  <div className="ck-list-card-footer">
                    {ruleColumnsForCards.map(col => {
                      const node = renderRuleCell(row, col);
                      if (node === null || node === undefined) return null;
                      return (
                        <div key={col.fieldId} className="ck-list-card-action">
                          {node}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="muted">{tSystem('list.noRecords', language, 'No records found.')}</div>
          )}
        </div>
      )}

      {paginationEnabled && showResults ? (
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
            disabled={!showPrev}
            aria-label={tSystem('list.previous', language, 'Previous')}
            title={tSystem('list.previous', language, 'Previous')}
          >
            {'<'}
          </button>
          <div className="muted" style={{ alignSelf: 'center' }}>
            {tSystem('list.pageOf', language, 'Page {page} of {total}', {
              page: totalPages ? pageIndex + 1 : 0,
              total: totalPages
            })}{' '}
            •{' '}
            {showLoadedOfTotal
              ? tSystem('list.recordsLoadedOfTotal', language, '{loaded} / {total} records', { loaded: loadedCount, total: totalCount })
              : tSystem(
                  (visibleItems.length || totalCount) === 1 ? 'list.recordsCountOne' : 'list.recordsCountMany',
                  language,
                  (visibleItems.length || totalCount) === 1 ? '{count} record' : '{count} records',
                  { count: visibleItems.length || totalCount }
                )}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setPageIndex(prev => (showNext ? prev + 1 : prev))}
            disabled={!showNext}
            aria-label={tSystem('list.next', language, 'Next')}
            title={tSystem('list.next', language, 'Next')}
          >
            {'>'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ListView;
