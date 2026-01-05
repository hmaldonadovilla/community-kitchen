import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../i18n';
import { LangCode, ListViewColumnConfig, ListViewRuleColumnConfig, WebFormDefinition, WebFormSubmission } from '../../types';
import { toOptionSet } from '../../core';
import { tSystem } from '../../systemStrings';
import { fetchBatch, fetchList, ListItem, ListResponse } from '../api';
import { EMPTY_DISPLAY, formatDateEeeDdMmmYyyy, formatDisplayText } from '../utils/valueDisplay';
import { collectListViewRuleColumnDependencies, evaluateListViewRuleColumnCell } from '../app/listViewRuleColumns';
import { normalizeToIsoDateLocal } from '../app/listViewSearch';
import { ListViewIcon } from './ListViewIcon';
import { DateInput } from './form/DateInput';

interface ListViewProps {
  formKey: string;
  definition: WebFormDefinition;
  language: LangCode;
  onSelect: (row: ListItem, record?: WebFormSubmission, opts?: { openView?: 'auto' | 'form' | 'summary' }) => void;
  cachedResponse?: ListResponse | null;
  cachedRecords?: Record<string, WebFormSubmission>;
  refreshToken?: number;
  onCache?: (payload: { response: ListResponse; records: Record<string, WebFormSubmission> }) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}

const ListView: React.FC<ListViewProps> = ({
  formKey,
  definition,
  language,
  onSelect,
  cachedResponse,
  cachedRecords,
  refreshToken = 0,
  onCache,
  onDiagnostic
}) => {
  const pageSize = Math.max(1, Math.min(definition.listView?.pageSize || 10, 50));
  const [loading, setLoading] = useState(false);
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

  const listSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date';
  const dateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
  const dateSearchEnabled = listSearchMode === 'date' && !!dateSearchFieldId;
  const searchInputId = 'ck-list-search';

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

  const columns = useMemo<ListViewColumnConfig[]>(
    () => (definition.listView?.columns as ListViewColumnConfig[]) || definition.questions.map(q => ({ fieldId: q.id, label: q.label })),
    [definition]
  );

  const isRuleColumn = (col: ListViewColumnConfig): col is ListViewRuleColumnConfig => (col as any)?.type === 'rule';
  const isSortableColumn = (col: ListViewColumnConfig): boolean => (!isRuleColumn(col) ? true : Boolean((col as any).sortable));

  const questionTypeById = useMemo(() => {
    const map: Record<string, string> = {};
    (definition.questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      map[id] = q.type;
    });
    return map;
  }, [definition.questions]);

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
    columns.forEach(col => {
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
  }, [columns, dateSearchEnabled, dateSearchFieldId]);

  const activeFetchRef = useRef(0);

  const fetchAllPages = async () => {
    const requestId = ++activeFetchRef.current;
    const startedAt = Date.now();
    const fetchPageSize = Math.min(50, Math.max(pageSize, 25));

    setLoading(true);
    setError(null);
    setAllItems([]);
    setTotalCount(0);

    onDiagnostic?.('list.fetch.start', {
      formKey,
      uiPageSize: pageSize,
      fetchPageSize,
      projectionCount: projection.length
    });

    try {
      let token: string | undefined;
      let aggregated: ListItem[] = [];
      let lastResponse: ListResponse | null = null;
      let page = 0;

      do {
        // Primary path: use batch endpoint (more reliable in the presence of stale/duplicate `fetchSubmissions` functions).
        let res: ListResponse | null | undefined;
        try {
          const batch = await fetchBatch(
            formKey,
            projection.length ? projection : undefined,
            fetchPageSize,
            token,
            false
          );
          const list = (batch as any)?.list as ListResponse | undefined;
          if (list && Array.isArray((list as any).items)) {
            res = list;
          }
        } catch (_) {
          res = undefined;
        }

        // Legacy fallback: attempt direct list endpoint if batch is unavailable.
        if (!res) {
          res = await fetchList(
            formKey,
            projection.length ? projection : undefined,
            fetchPageSize,
            token
          );
        }
        if (requestId !== activeFetchRef.current) return;
        if (!res || !Array.isArray((res as any).items)) {
          const resType = res === null ? 'null' : typeof res;
          const keys = res && typeof res === 'object' ? Object.keys(res as any).slice(0, 12) : [];
          onDiagnostic?.('list.fetch.invalidResponse', { hasResponse: !!res, resType, keys });
          setError(
            'The server returned no list data. This usually means your Apps Script project has an older `fetchSubmissions` function still present (or the latest dist/Code.js was not fully pasted). Open Apps Script → search for `function fetchSubmissions` and ensure there is only one definition, then redeploy.'
          );
          break;
        }
        lastResponse = res;
        const items = res.items || [];
        aggregated = aggregated.concat(items);
        token = res.nextPageToken;
        page += 1;

        setAllItems([...aggregated]);
        setTotalCount(res.totalCount || aggregated.length);

        onDiagnostic?.('list.fetch.page', {
          page,
          pageItems: items.length,
          aggregated: aggregated.length,
          totalCount: res.totalCount,
          hasNext: !!token,
          durationMs: Date.now() - startedAt
        });

        if (!token || aggregated.length >= (res.totalCount || 200)) {
          token = undefined;
        }
      } while (token);

      setPageIndex(0);
      if (lastResponse) {
        onCache?.({
          response: { ...lastResponse, items: aggregated, nextPageToken: undefined },
          records: {}
        });
      }

      onDiagnostic?.('list.fetch.done', {
        pages: page,
        items: aggregated.length,
        durationMs: Date.now() - startedAt
      });
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
    if (cachedResponse?.items?.length) {
      onDiagnostic?.('list.bootstrap.used', {
        items: cachedResponse.items.length,
        totalCount: cachedResponse.totalCount
      });
      return;
    }
    fetchAllPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, refreshToken]);

  useEffect(() => {
    setPageIndex(0);
    setSearchValue('');
    setSortField(defaultSortField);
    setSortDirection(defaultSortDirection);
  }, [formKey, refreshToken, defaultSortField, defaultSortDirection]);

  useEffect(() => {
    // Reset paging when filtering changes to avoid landing on an empty page after narrowing results.
    setPageIndex(0);
  }, [searchValue]);

  useEffect(() => {
    if (!onDiagnostic) return;
    if (listSearchMode === 'date') {
      onDiagnostic('list.search.mode', { mode: 'date', dateFieldId: dateSearchFieldId });
      if (!dateSearchFieldId) {
        onDiagnostic('list.search.invalidConfig', { mode: 'date', dateFieldId: dateSearchFieldId });
      }
      return;
    }
    onDiagnostic('list.search.mode', { mode: 'text' });
  }, [dateSearchFieldId, listSearchMode, onDiagnostic]);

  const searchableFieldIds = useMemo(() => {
    const ids = new Set<string>();
    columns.forEach(col => ids.add(col.fieldId));
    ['status', 'pdfUrl', 'updatedAt', 'createdAt', 'id'].forEach(id => ids.add(id));
    return Array.from(ids);
  }, [columns]);

  const ruleColumns = useMemo(() => columns.filter(isRuleColumn) as ListViewRuleColumnConfig[], [columns]);

  useEffect(() => {
    if (!onDiagnostic) return;
    if (!ruleColumns.length) return;
    const deps = ruleColumns.map(c => ({
      columnId: c.fieldId,
      openView: (c as any).openView || 'auto',
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
    const filtered =
      dateSearchEnabled && trimmed
        ? items.filter(row => normalizeToIsoDateLocal((row as any)[dateSearchFieldId]) === trimmed)
        : dateSearchEnabled
          ? items
          : trimmed
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
  }, [allItems, dateSearchEnabled, dateSearchFieldId, language, ruleColumns, searchValue, searchableFieldIds, sortField, sortDirection]);

  const pagedItems = useMemo(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return visibleItems.slice(start, end);
  }, [visibleItems, pageIndex, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const showPrev = pageIndex > 0;
  const showNext = pageIndex < totalPages - 1;

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
    if (!cell) return EMPTY_DISPLAY;
    const text = resolveLocalizedString(cell.text, language, EMPTY_DISPLAY);
    const style = (cell?.style || 'link').toString();
    const icon = cell?.icon ? <ListViewIcon name={cell.icon} /> : null;
    const openView = (col.openView || 'auto') as 'auto' | 'form' | 'summary';
    const className =
      style === 'warning'
        ? 'ck-list-nav ck-list-nav--warning'
        : style === 'muted'
        ? 'ck-list-nav ck-list-nav--muted'
        : 'ck-list-nav';

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
        onClick={e => {
          e.stopPropagation();
          onDiagnostic?.('list.ruleColumn.click', { columnId: col.fieldId, openView, text });
          onSelect(row, row?.id ? records[row.id] : undefined, { openView });
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

  return (
    <div className="card">
      <h3>{resolveLocalizedString(definition.listView?.title, language, tSystem('list.title', language, 'Records'))}</h3>
      <div className="list-toolbar">
        <label className="ck-list-search-label" htmlFor={searchInputId}>
          {dateSearchEnabled
            ? tSystem('list.searchByDate', language, '🔍 Search by date')
            : tSystem('list.searchByText', language, '🔍 Search')}
        </label>
        <div className="ck-list-search-control">
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
              placeholder={tSystem('list.searchPlaceholder', language, 'Search records')}
              aria-label={tSystem('list.searchPlaceholder', language, 'Search records')}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
            />
          )}
          {searchValue.trim() ? (
            <button
              type="button"
              className="ck-list-search-clear-icon"
              aria-label={tSystem('list.clearSearch', language, 'Clear')}
              onClick={() => {
                setSearchValue('');
                onDiagnostic?.('list.search.clear', { mode: dateSearchEnabled ? 'date' : 'text' });
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </div>
      {loading && <div className="status">{tSystem('common.loading', language, 'Loading…')}</div>}
      {error && <div className="error">{error}</div>}
      <div className="list-table-wrapper">
        <table className="list-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              {columns.map(col => (
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
                  onClick={() => onSelect(row, row?.id ? records[row.id] : undefined)}
                  style={{ cursor: 'pointer' }}
                >
                  {columns.map(col => (
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
                <td colSpan={columns.length} className="muted">
                  {tSystem('list.noRecords', language, 'No records found.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <button
          type="button"
          className="secondary"
          onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
          disabled={!showPrev}
        >
          {tSystem('list.previous', language, 'Previous')}
        </button>
        <div className="muted" style={{ alignSelf: 'center' }}>
          {tSystem('list.pageOf', language, 'Page {page} of {total}', { page: totalPages ? pageIndex + 1 : 0, total: totalPages })}{' '}
          •{' '}
          {tSystem(
            (visibleItems.length || totalCount) === 1 ? 'list.recordsCountOne' : 'list.recordsCountMany',
            language,
            (visibleItems.length || totalCount) === 1 ? '{count} record' : '{count} records',
            { count: visibleItems.length || totalCount }
          )}
        </div>
        <button type="button" onClick={() => setPageIndex(prev => (showNext ? prev + 1 : prev))} disabled={!showNext}>
          {tSystem('list.next', language, 'Next')}
        </button>
      </div>
    </div>
  );
};

export default ListView;
