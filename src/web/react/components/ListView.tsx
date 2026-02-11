import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../i18n';
import { collectStatusTransitionValues } from '../../../domain/statusTransitions';
import { LangCode, ListViewColumnConfig, ListViewRuleColumnConfig, WebFormDefinition, WebFormSubmission } from '../../types';
import { toOptionSet } from '../../core';
import { tSystem } from '../../systemStrings';
import { fetchBatch, fetchList, ListItem, ListResponse, resolveUserFacingErrorMessage } from '../api';
import { EMPTY_DISPLAY, formatDateEeeDdMmmYyyy, formatDisplayText } from '../utils/valueDisplay';
import { collectListViewRuleColumnDependencies, evaluateListViewRuleColumnCell } from '../app/listViewRuleColumns';
import { filterItemsByAdvancedSearch, hasActiveAdvancedSearch } from '../app/listViewAdvancedSearch';
import { collectListViewMetricDependencies, computeListViewMetricValue } from '../app/listViewMetric';
import { normalizeToIsoDateLocal, shouldClearAppliedQueryOnInputClear } from '../app/listViewSearch';
import { paginateItemsForListViewUi } from '../app/listViewPagination';
import { resolveListViewUiState } from '../app/listViewUiState';
import { ListViewIcon } from './ListViewIcon';
import { DateInput } from './form/DateInput';
import { resolveStatusPillKey } from '../utils/statusPill';

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
  notice?: string | null;
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
  notice: noticeProp,
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
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQueryValue, setSearchQueryValue] = useState('');
  const [sortField, setSortField] = useState<string>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

  const headerSortEnabled = definition.listView?.headerSortEnabled !== false;
  const hideHeaderRow = definition.listView?.hideHeaderRow === true;
  const rowClickEnabled = definition.listView?.rowClickEnabled !== false;

  const listSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date' | 'advanced';
  const dateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
  const dateSearchEnabled = listSearchMode === 'date' && !!dateSearchFieldId;
  const advancedSearchEnabled = listSearchMode === 'advanced';
  const searchInputId = 'ck-list-search';

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFieldFilters, setAdvancedFieldFilters] = useState<Record<string, string | string[]>>({});
  const [advancedHasSearched, setAdvancedHasSearched] = useState(false);
  const [advancedKeyword, setAdvancedKeyword] = useState('');

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
  const uiNotice = noticeProp !== undefined ? noticeProp : null;
  const hasExternalLoadingSignal = loadingProp !== undefined;
  const assumeInitialLoad = autoFetch || hasExternalLoadingSignal;
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(() => (cachedResponse !== undefined ? cachedResponse !== null : false));
  const prevUiLoadingRef = useRef<boolean>(uiLoading);

  useEffect(() => {
    if (cachedResponse === undefined || cachedResponse === null) return;
    const items = Array.isArray(cachedResponse.items) ? cachedResponse.items : [];
    setAllItems(items);
    setTotalCount(cachedResponse.totalCount || items.length);
  }, [cachedResponse]);

  useEffect(() => {
    if (cachedRecords) {
      setRecords(cachedRecords);
    }
  }, [cachedRecords]);

  useEffect(() => {
    setHasLoadedOnce(cachedResponse !== undefined ? cachedResponse !== null : false);
  }, [cachedResponse, formKey, refreshToken]);

  useEffect(() => {
    const prev = prevUiLoadingRef.current;
    prevUiLoadingRef.current = uiLoading;
    if (prev && !uiLoading) {
      setHasLoadedOnce(true);
    }
  }, [uiLoading]);

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

  const metricDependencies = useMemo(
    () => collectListViewMetricDependencies(definition.listView?.metric),
    [definition.listView?.metric]
  );

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
    metricDependencies.forEach(add);
    return Array.from(ids);
  }, [columnsAll, dateSearchEnabled, dateSearchFieldId, metricDependencies]);

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
          const message = resolveUserFacingErrorMessage(err, 'Failed to load records.');
          const logMessage = (err?.message || err?.toString?.() || 'Failed to load records.').toString();
          setPrefetching(false);
          onDiagnostic?.('list.fetch.background.error', { message: logMessage });
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
      const message = resolveUserFacingErrorMessage(err, 'Failed to load records.');
      const logMessage = (err?.message || err?.toString?.() || 'Failed to load records.').toString();
      if (message) {
        setError(message);
      } else {
        setError(null);
      }
      onDiagnostic?.('list.fetch.error', { message: logMessage });
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
    setSearchInputValue('');
    setSearchQueryValue('');
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
  }, [searchQueryValue]);

  useEffect(() => {
    if (!advancedHasSearched) return;
    setPageIndex(0);
  }, [advancedFieldFilters, advancedHasSearched]);

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
    columnsAll.forEach(col => {
      if (isRuleColumn(col)) return;
      ids.add(col.fieldId);
    });
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
    const trimmed = searchQueryValue.trim();
    const advancedQuery = { keyword: advancedKeyword, fieldFilters: advancedFieldFilters };
    const advancedActive = advancedHasSearched && hasActiveAdvancedSearch(advancedQuery);
    const applyAdvanced = advancedActive;
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
    advancedKeyword,
    advancedSearchEnabled,
    allItems,
    dateSearchEnabled,
    dateSearchFieldId,
    fieldTypeById,
    keywordSearchFieldIds,
    language,
    ruleColumns,
    searchQueryValue,
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
  const advancedActive =
    advancedHasSearched && hasActiveAdvancedSearch({ keyword: advancedKeyword, fieldFilters: advancedFieldFilters });
  const activeSearch =
    listSearchMode === 'date'
      ? Boolean(searchQueryValue.trim())
      : listSearchMode === 'advanced'
        ? advancedActive
        : advancedActive || Boolean(searchQueryValue.trim());
  const showLoadedOfTotal = !activeSearch && totalCount > 0 && loadedCount > 0 && loadedCount < totalCount;
  const { showNoRecords, showLoadingStatus } = resolveListViewUiState({
    visibleCount: pagedItems.length,
    hasLoadedOnce,
    loading: uiLoading,
    prefetching: uiPrefetching,
    error: uiError,
    assumeInitialLoad
  });

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
    return raw.length === 1
      ? tSystem('overlay.itemsOne', language, 'Item')
      : tSystem('overlay.itemsMany', language, 'Items');
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

  const iconAriaLabel = (icon?: string): string => {
    switch (icon) {
      case 'warning':
        return tSystem('list.legend.warning', language, 'Warning');
      case 'check':
        return tSystem('list.legend.check', language, 'OK');
      case 'error':
        return tSystem('list.legend.error', language, 'Error');
      case 'info':
        return tSystem('list.legend.info', language, 'Info');
      case 'external':
        return tSystem('list.legend.external', language, 'External link');
      case 'lock':
        return tSystem('list.legend.lock', language, 'Locked');
      case 'edit':
        return tSystem('list.legend.edit', language, 'Edit');
      case 'view':
        return tSystem('list.legend.view', language, 'View');
      case 'copy':
        return tSystem('list.legend.copy', language, 'Copy');
      default:
        return '';
    }
  };

  const getRuleHref = (row: ListItem, hrefFieldIdRaw: any): string => {
    const hrefFieldId = (hrefFieldIdRaw || '').toString().trim();
    if (!hrefFieldId) return '';
    const hrefRaw = (row as any)[hrefFieldId];
    if (!hrefRaw) return '';
    const str = Array.isArray(hrefRaw) ? hrefRaw.join(' ') : hrefRaw.toString();
    const urls = splitUrlList(str).filter(u => /^https?:\/\//i.test(u));
    return urls[0] || '';
  };

  const renderSingleRuleAction = (
    row: ListItem,
    col: ListViewRuleColumnConfig,
    action: {
      text?: any;
      hideText?: boolean;
      style?: any;
      icon?: any;
      hrefFieldId?: any;
      openView?: any;
      openButtonId?: any;
    },
    keySuffix?: string
  ) => {
    const text = resolveLocalizedString(action.text, language, '').toString().trim();
    const style = (action?.style || 'link').toString();
    const iconName = (action as any)?.icon;
    const icon = iconName ? <ListViewIcon name={iconName} /> : null;
    const hideText = Boolean((action as any)?.hideText);
    const showText = Boolean(text) && (!hideText || !icon);
    const ariaLabel = text || iconAriaLabel(iconName) || tSystem('actions.actions', language, 'Actions');
    const openButtonId = ((action as any)?.openButtonId || '').toString().trim();
    const openViewRaw = ((action as any)?.openView || 'auto') as 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';
    const openView = openViewRaw === 'button' && !openButtonId ? 'auto' : openViewRaw;
    const classNameBase =
      style === 'warning'
        ? 'ck-list-nav ck-list-nav--warning'
        : style === 'muted'
        ? 'ck-list-nav ck-list-nav--muted'
        : 'ck-list-nav';
    const className = hideText && icon ? `${classNameBase} ck-list-nav--iconOnly` : classNameBase;
    const hrefFieldId = ((action as any)?.hrefFieldId || '').toString().trim();
    const href = getRuleHref(row, hrefFieldId);

    if (uiDisabled) {
      return (
        <span
          key={`rule-action-disabled-${col.fieldId}-${keySuffix || 'base'}`}
          className={className}
          aria-disabled="true"
          aria-label={ariaLabel}
          style={{ opacity: 0.6, cursor: 'not-allowed' }}
          title={ariaLabel}
        >
          {icon}
          {showText ? <span>{text}</span> : null}
        </span>
      );
    }

    if (style === 'link' && hrefFieldId) {
      if (!href) {
        onDiagnostic?.('list.ruleColumn.link.missingUrl', { columnId: col.fieldId, hrefFieldId });
        return (
          <span key={`rule-action-missing-${col.fieldId}-${keySuffix || 'base'}`} className="ck-list-nav ck-list-nav--muted">
            {icon}
            {showText ? <span>{text || EMPTY_DISPLAY}</span> : null}
          </span>
        );
      }
      return (
        <a
          key={`rule-action-link-${col.fieldId}-${keySuffix || 'base'}`}
          className={className}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          title={ariaLabel}
          onClick={e => {
            e.stopPropagation();
            onDiagnostic?.('list.ruleColumn.link.open', { columnId: col.fieldId, hrefFieldId, href });
          }}
        >
          {icon}
          {showText ? <span>{text}</span> : null}
        </a>
      );
    }

    return (
      <button
        key={`rule-action-btn-${col.fieldId}-${keySuffix || 'base'}`}
        type="button"
        className={className}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={uiDisabled}
        onClick={e => {
          e.stopPropagation();
          onDiagnostic?.('list.ruleColumn.click', {
            columnId: col.fieldId,
            openView,
            openButtonId: openView === 'button' ? openButtonId : null,
            text: ariaLabel
          });
          onSelect(row, row?.id ? records[row.id] : undefined, {
            openView,
            openButtonId: openView === 'button' ? openButtonId : undefined
          });
        }}
      >
        {icon}
        {showText ? <span>{text}</span> : null}
      </button>
    );
  };

  const renderRuleCell = (row: ListItem, col: ListViewRuleColumnConfig) => {
    const cell = evaluateListViewRuleColumnCell(col, row);
    if (!cell) return null;

    if (Array.isArray((cell as any).actions) && (cell as any).actions.length) {
      return (
        <span className="ck-list-nav-group">
          {(cell as any).actions.map((action: any, idx: number) => renderSingleRuleAction(row, col, action, `${idx}`))}
        </span>
      );
    }

    return renderSingleRuleAction(
      row,
      col,
      {
        text: cell.text,
        hideText: (cell as any).hideText,
        style: cell.style,
        icon: cell.icon,
        hrefFieldId: cell.hrefFieldId,
        openView: cell.openView,
        openButtonId: cell.openButtonId
      },
      'single'
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
    const textClassName = rowClickEnabled ? 'truncate-link' : 'truncate-text';
    if (typeof value === 'string') {
      const urls = splitUrlList(value).filter(u => /^https?:\/\//i.test(u));
      if (urls.length > 1) {
        if (!rowClickEnabled) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {urls.slice(0, 3).map((u, idx) => (
                <span key={`${u}-${idx}`} className="truncate-text" title={u} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {u.split('/').pop() || u}
                </span>
              ))}
              {urls.length > 3 && (
                <span className="muted">
                  {tSystem('common.more', language, '+{count} more', { count: urls.length - 3 })}
                </span>
              )}
            </div>
          );
        }
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
        if (!rowClickEnabled) {
          return (
            <span className="truncate-text" title={title} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {text}
            </span>
          );
        }
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
      if (!rowClickEnabled) {
        return (
          <span className="truncate-text" title={title} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
            {text}
          </span>
        );
      }
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
      <span className={textClassName} title={title} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
        {text}
      </span>
    );
  };

  const handleRowClick = useCallback(
    (row: ListItem) => {
      if (!rowClickEnabled) {
        onDiagnostic?.('list.row.click.disabledByConfig', { recordId: row.id });
        return;
      }
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
    [onDiagnostic, onSelect, records, rowClickEnabled, ruleColumns, uiDisabled]
  );

  const clearSearchInputOnly = useCallback(() => {
    setSearchInputValue('');
    if (shouldClearAppliedQueryOnInputClear(listSearchMode)) {
      setSearchQueryValue('');
    }
    onDiagnostic?.('list.search.clearInput', { mode: listSearchMode });
  }, [listSearchMode, onDiagnostic]);

  const clearSearchResults = useCallback(() => {
    setSearchInputValue('');
    setSearchQueryValue('');
    if (advancedSearchEnabled) {
      setAdvancedFieldFilters({});
      setAdvancedHasSearched(false);
      setAdvancedKeyword('');
      setAdvancedOpen(false);
    }
    onDiagnostic?.('list.search.clearResults', { mode: listSearchMode });
  }, [advancedSearchEnabled, listSearchMode, onDiagnostic]);

  const applyAdvancedSearchNow = useCallback(() => {
    if (!advancedSearchEnabled) return;
    const query = { keyword: searchInputValue, fieldFilters: advancedFieldFilters };
    if (!hasActiveAdvancedSearch(query)) {
      onDiagnostic?.('list.search.advanced.empty', {});
      return;
    }
    setAdvancedKeyword(searchInputValue);
    setSearchQueryValue(searchInputValue);
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
      keyword: (searchInputValue || '').trim() || null,
      filters: activeFilters.map(f => f.fieldId),
      filterCount: activeFilters.length
    });
  }, [advancedFieldFilters, advancedSearchEnabled, onDiagnostic, searchInputValue]);

  const showClearSearch = useMemo(() => {
    return Boolean(searchInputValue.trim());
  }, [searchInputValue]);

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

  const resolveStatusKey = useCallback(
    (raw: any) => resolveStatusPillKey(raw !== undefined && raw !== null ? raw.toString().trim() : '', definition.followup?.statusTransitions),
    [definition.followup?.statusTransitions]
  );

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

    const transitions = definition.followup?.statusTransitions;
    collectStatusTransitionValues(transitions, { includeDefaultOnClose: true }).forEach(add);

    add(definition.autoSave?.status);

    // Include any statuses already present in the fetched list results (covers legacy/hand-edited statuses).
    (allItems || []).forEach(row => add((row as any)?.status));

    return out;
  }, [allItems, definition.autoSave?.status, definition.followup?.statusTransitions]);

  useEffect(() => {
    if (!onDiagnostic) return;
    onDiagnostic('list.search.statusOptions', {
      count: statusFilterOptions.length,
      sample: statusFilterOptions.slice(0, 12)
    });
  }, [onDiagnostic, statusFilterOptions]);

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

  const listSearchPresetButtons = useMemo(() => {
    const out: Array<{ q: any; cfg: any }> = [];
    (definition.questions || []).forEach(q => {
      if ((q as any)?.type !== 'BUTTON') return;
      const cfg = (q as any)?.button;
      if (!cfg || typeof cfg !== 'object') return;
      if ((cfg as any).action !== 'listViewSearchPreset') return;
      out.push({ q, cfg });
    });
    return out;
  }, [definition.questions]);

  const applySearchPreset = useCallback(
    (preset: {
      mode?: 'text' | 'date' | 'advanced';
      keyword?: string;
      dateValue?: string;
      fieldFilters?: Record<string, string | string[]>;
    }) => {
      const requestedMode = preset.mode || listSearchMode;
      const mode = requestedMode === 'date' && !dateSearchEnabled ? 'text' : requestedMode;
      const nextKeyword = (preset.keyword || '').toString();
      const nextDateValue = (preset.dateValue || '').toString();
      const nextFieldFilters = (preset.fieldFilters || {}) as Record<string, string | string[]>;
      const nextValue = mode === 'date' ? nextDateValue : nextKeyword;
      const usesAdvancedOverride = mode === 'advanced' && !advancedSearchEnabled;

      setSearchInputValue('');
      setSearchQueryValue(mode === 'advanced' ? '' : nextValue);

      if (mode === 'advanced') {
        setAdvancedFieldFilters(nextFieldFilters);
        setAdvancedKeyword(nextKeyword);
        setAdvancedHasSearched(hasActiveAdvancedSearch({ keyword: nextKeyword, fieldFilters: nextFieldFilters }));
        setAdvancedOpen(false);
      } else {
        setAdvancedFieldFilters({});
        setAdvancedHasSearched(false);
        setAdvancedKeyword('');
        setAdvancedOpen(false);
      }

      setPageIndex(0);
      onDiagnostic?.('list.search.preset.apply', {
        mode,
        keyword: nextKeyword || null,
        dateValue: nextDateValue || null,
        filterCount: Object.keys(nextFieldFilters || {}).length,
        advancedOverride: usesAdvancedOverride
      });
    },
    [advancedSearchEnabled, dateSearchEnabled, listSearchMode, onDiagnostic]
  );

  const showResults = viewMode === 'table' || activeSearch;
  const listMetricCfg = definition.listView?.metric;
  const listMetricLabelText = useMemo(() => {
    if (!listMetricCfg?.label) return '';
    return resolveLocalizedString(listMetricCfg.label, language, '');
  }, [language, listMetricCfg?.label]);
  const listMetricComputed = useMemo(
    () => computeListViewMetricValue(allItems || [], listMetricCfg),
    [allItems, listMetricCfg]
  );
  const listMetricMaximumFractionDigits = useMemo(() => {
    const raw = Number((listMetricCfg as any)?.maximumFractionDigits);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(6, Math.round(raw)));
  }, [listMetricCfg]);
  const listMetricNumberFormatter = useMemo(() => {
    const locale = language === 'FR' ? 'fr-BE' : language === 'NL' ? 'nl-BE' : 'en-US';
    return new Intl.NumberFormat(locale, { maximumFractionDigits: listMetricMaximumFractionDigits });
  }, [language, listMetricMaximumFractionDigits]);
  const listMetricCompleteData =
    !!listMetricCfg && !uiLoading && !uiPrefetching && (totalCount <= 0 || loadedCount >= totalCount);
  const listMetricDisplayText = useMemo(() => {
    if (!listMetricCfg) return '';
    const valueText = listMetricCompleteData ? listMetricNumberFormatter.format(listMetricComputed.value) : '…';
    const suffix = (listMetricLabelText || '').toString().trim();
    return suffix ? `${valueText} ${suffix}` : valueText;
  }, [listMetricCfg, listMetricCompleteData, listMetricLabelText, listMetricNumberFormatter, listMetricComputed.value]);

  useEffect(() => {
    if (!onDiagnostic || !listMetricCfg) return;
    onDiagnostic('list.metric.config', {
      groupId: (listMetricCfg as any).groupId || null,
      fieldId: (listMetricCfg as any).fieldId || null,
      hasWhen: Boolean((listMetricCfg as any).when),
      maximumFractionDigits: listMetricMaximumFractionDigits
    });
  }, [listMetricCfg, listMetricMaximumFractionDigits, onDiagnostic]);

  useEffect(() => {
    if (!onDiagnostic || !listMetricCfg) return;
    onDiagnostic('list.metric.value', {
      value: listMetricComputed.value,
      matchedRecords: listMetricComputed.matchedRecords,
      matchedLineItems: listMetricComputed.matchedLineItems,
      completeData: listMetricCompleteData,
      loadedCount,
      totalCount
    });
  }, [listMetricCfg, listMetricCompleteData, listMetricComputed, loadedCount, onDiagnostic, totalCount]);

  const metricNode = listMetricCfg ? (
    <div className="ck-list-metric" aria-live="polite">
      {listMetricDisplayText}
    </div>
  ) : null;

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
  const presetsTitleConfig = (definition.listView?.search as any)?.presetsTitle;
  const presetsTitleText = useMemo(() => {
    if (presetsTitleConfig === undefined || presetsTitleConfig === null) return '';
    if (typeof presetsTitleConfig === 'string' && presetsTitleConfig.trim() === '') return '';
    return resolveLocalizedString(presetsTitleConfig, language, '');
  }, [language, presetsTitleConfig]);
  const showPresetsTitle = Boolean(presetsTitleText && presetsTitleText.toString().trim());

  useEffect(() => {
    if (!onDiagnostic) return;
    onDiagnostic('list.search.presets.config', {
      count: listSearchPresetButtons.length,
      title: showPresetsTitle ? presetsTitleText : null
    });
  }, [listSearchPresetButtons.length, onDiagnostic, presetsTitleText, showPresetsTitle]);

  const searchControlClass = `ck-list-search-control${
    (advancedSearchEnabled ? ' ck-has-advanced' : '') + (showClearSearch ? ' ck-has-clear' : '') + ((advancedSearchEnabled || showClearSearch) ? ' ck-has-icons' : '')
  }`;

  return (
    <div className="card" style={{ position: 'relative' }} aria-disabled={uiDisabled} aria-busy={uiDisabled}>
      {uiDisabled ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            cursor: 'wait',
            background: 'transparent',
            pointerEvents: 'auto'
          }}
        />
      ) : null}
        <div style={{ pointerEvents: uiDisabled ? 'none' : 'auto' }}>
        {titleNode || metricNode ? (
          <div className="ck-list-title-row">
            <div className="ck-list-title-main">{titleNode}</div>
            {metricNode}
          </div>
        ) : null}

        <div className="list-toolbar">
          <label className="ck-list-search-label" htmlFor={searchInputId}>
            {dateSearchEnabled
              ? tSystem('list.searchByDate', language, 'Search by date')
              : tSystem('list.searchByText', language, 'Search')}
          </label>

          <div className={searchControlClass}>
            {dateSearchEnabled ? (
              <DateInput
                id={searchInputId}
                value={searchInputValue}
                language={language}
                ariaLabel={tSystem('list.searchDateLabel', language, 'Filter by date')}
                onChange={next => {
                  setSearchInputValue(next);
                  setSearchQueryValue(next);
                  if (!advancedSearchEnabled && advancedHasSearched) {
                    setAdvancedFieldFilters({});
                    setAdvancedHasSearched(false);
                    setAdvancedKeyword('');
                  }
                }}
              />
            ) : (
              <input
                id={searchInputId}
                type="search"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder || tSystem('list.searchPlaceholder', language, 'Search records')}
                value={searchInputValue}
                onChange={e => {
                  setSearchInputValue(e.target.value);
                  setSearchQueryValue(e.target.value);
                  if (!advancedSearchEnabled && advancedHasSearched) {
                    setAdvancedFieldFilters({});
                    setAdvancedHasSearched(false);
                    setAdvancedKeyword('');
                  }
                }}
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
                {tSystem('list.advancedSearch', language, 'Advanced')}
              </button>
            ) : null}

            {showClearSearch ? (
              <button
                type="button"
                className="ck-list-search-clear-icon"
                aria-label={tSystem('list.clearSearchInput', language, 'Clear search text')}
                onClick={clearSearchInputOnly}
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

        {viewMode === 'cards' && listSearchPresetButtons.length ? (
          <div className="ck-list-search-presets" aria-label={tSystem('list.predefinedSearches', language, 'Quick filters')}>
            {showPresetsTitle ? <span className="ck-list-search-presets-title">{presetsTitleText}</span> : null}
            {listSearchPresetButtons.map(({ q, cfg }) => {
              const labelNode = resolveLocalizedString((q as any)?.label ?? q?.id ?? cfg.action ?? '', language, q?.id ?? '');
              const mode = (cfg.mode || listSearchMode) as 'text' | 'date' | 'advanced';
              const keyword = (cfg.keyword || '').toString();
              const dateValue = (cfg.dateValue || '').toString();
              const fieldFilters = (cfg.fieldFilters || {}) as Record<string, string | string[]>;
              return (
                <button
                  key={(q as any)?.id || cfg.action}
                  type="button"
                  className="secondary"
                  onClick={() => {
                    applySearchPreset({ mode, keyword, dateValue, fieldFilters });
                    onDiagnostic?.('list.search.preset.click', { buttonId: (q as any)?.id || null, mode });
                  }}
                >
                  {labelNode}
                </button>
              );
            })}
          </div>
        ) : null}

        {advancedSearchEnabled && advancedOpen ? (
          <div
            className="ck-list-advanced-panel"
            role="dialog"
            aria-label={tSystem('list.advancedSearch', language, 'Advanced search')}
          >
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
            <button type="button" className="secondary" onClick={clearSearchResults}>
                {tSystem('list.clearSearch', language, 'Clear')}
              </button>
              <button type="button" onClick={applyAdvancedSearchNow}>
                {tSystem('list.search', language, 'Search')}
              </button>
            </div>
          </div>
        ) : null}

        {showLoadingStatus ? (
          <div className="status">{tSystem('common.loading', language, 'Loading…')}</div>
        ) : uiPrefetching ? (
          <div className="status muted" style={{ opacity: 0.9 }}>
            {tSystem('list.loadingMore', language, 'Loading more…')}
          </div>
        ) : uiNotice ? (
          <div className="status muted" style={{ opacity: 0.9 }} role="note">
            {uiNotice}
          </div>
        ) : null}

        {uiError && <div className="error">{uiError}</div>}

        {viewMode === 'table' ? (
          <div className="list-table-wrapper">
            <table className="list-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              {!hideHeaderRow ? (
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
                          background: 'var(--card)',
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
              ) : null}
              <tbody>
                {pagedItems.length ? (
                  pagedItems.map(row => (
                    <tr
                      key={row.id}
                      onClick={rowClickEnabled ? () => handleRowClick(row) : undefined}
                      style={{ cursor: rowClickEnabled && !uiDisabled ? 'pointer' : 'default' }}
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
                ) : showNoRecords ? (
                  <tr>
                    <td colSpan={columnsForTable.length} className="muted">
                      {tSystem('list.noRecords', language, 'No records found.')}
                    </td>
                  </tr>
                ) : null}
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
                  role={rowClickEnabled ? 'button' : undefined}
                  tabIndex={rowClickEnabled ? (uiDisabled ? -1 : 0) : undefined}
                  aria-disabled={rowClickEnabled ? uiDisabled : undefined}
                  onClick={rowClickEnabled ? () => handleRowClick(row) : undefined}
                  onKeyDown={
                    rowClickEnabled
                      ? e => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          handleRowClick(row);
                        }
                      : undefined
                  }
                  style={{ cursor: rowClickEnabled && !uiDisabled ? 'pointer' : 'default' }}
                >
                  <div className="ck-list-card-title-row">
                    <div className="ck-list-card-title">{renderCellValue(row, cardTitleFieldId)}</div>
                    {(() => {
                      const statusText = (row.status || '').toString().trim();
                      if (!statusText) return null;
                      const statusKey = resolveStatusKey(statusText);
                      return (
                        <span
                          className="ck-status-pill"
                          title={statusText}
                          aria-label={`Status: ${statusText}`}
                          data-status-key={statusKey || undefined}
                        >
                          {statusText}
                        </span>
                      );
                    })()}
                  </div>
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
            ) : showNoRecords ? (
              <div className="muted">{tSystem('list.noRecords', language, 'No records found.')}</div>
            ) : null}
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
                ? tSystem('list.recordsLoadedOfTotal', language, '{loaded} / {total} records', {
                    loaded: loadedCount,
                    total: totalCount
                  })
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
    </div>
  );
};

export default ListView;
