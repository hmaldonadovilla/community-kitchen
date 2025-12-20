import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../i18n';
import { LangCode, WebFormDefinition, WebFormSubmission } from '../../types';
import { fetchBatch, fetchList, ListItem, ListResponse } from '../api';

interface ListViewProps {
  formKey: string;
  definition: WebFormDefinition;
  language: LangCode;
  onSelect: (row: ListItem, record?: WebFormSubmission) => void;
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

  const columns = useMemo(
    () => definition.listView?.columns || definition.questions.map(q => ({ fieldId: q.id, label: q.label })),
    [definition]
  );

  const questionTypeById = useMemo(() => {
    const map: Record<string, string> = {};
    (definition.questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      map[id] = q.type;
    });
    return map;
  }, [definition.questions]);

  const projection = useMemo(() => {
    const meta = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const ids = new Set<string>();
    columns.forEach(col => {
      const fid = (col.fieldId || '').toString();
      if (!fid || meta.has(fid)) return;
      ids.add(fid);
    });
    return Array.from(ids);
  }, [columns]);

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

  const sortOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ id: string; label: string }> = [];
    const push = (id: string, label: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      options.push({ id, label });
    };
    columns.forEach(col => {
      push(col.fieldId, resolveLocalizedString(col.label, language, col.fieldId));
    });
    push('updatedAt', 'Updated');
    push('createdAt', 'Created');
    push('status', 'Status');
    return options;
  }, [columns, language]);

  const searchableFieldIds = useMemo(() => {
    const ids = new Set<string>();
    columns.forEach(col => ids.add(col.fieldId));
    ['status', 'pdfUrl', 'updatedAt', 'createdAt', 'id'].forEach(id => ids.add(id));
    return Array.from(ids);
  }, [columns]);

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
    const items = allItems || [];
    const keyword = searchValue.trim().toLowerCase();
    const filtered = keyword
      ? items.filter(row =>
          searchableFieldIds.some(fieldId => {
            const raw = (row as any)[fieldId];
            if (raw === undefined || raw === null) return false;
            const value = Array.isArray(raw) ? raw.join(' ') : `${raw}`;
            return value.toLowerCase().includes(keyword);
          })
        )
      : items;
    const field = sortField || 'updatedAt';
    const sorted = [...filtered].sort((rowA, rowB) => {
      const result = compareValues((rowA as any)[field], (rowB as any)[field]);
      return sortDirection === 'asc' ? result : -result;
    });
    return sorted;
  }, [allItems, searchValue, searchableFieldIds, sortField, sortDirection]);

  const pagedItems = useMemo(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return visibleItems.slice(start, end);
  }, [visibleItems, pageIndex, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const showPrev = pageIndex > 0;
  const showNext = pageIndex < totalPages - 1;

  const formatDate = (value: any): string | null => {
    if (value === undefined || value === null || value === '') return null;
    const pad2 = (n: number) => n.toString().padStart(2, '0');

    // Date-only: YYYY-MM-DD -> DD/MM/YYYY
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    }

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
    if (!raw.length) return '—';
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
    return preview ? `${preview}${suffix}` : `${raw.length} item${raw.length > 1 ? 's' : ''}`;
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

  const renderCellValue = (row: ListItem, fieldId: string) => {
    const raw = (row as any)[fieldId];
    if (raw === undefined || raw === null || raw === '') return '—';
    const parsed = typeof raw === 'string' ? tryParseJson(raw) : null;
    const value = parsed !== null ? parsed : raw;
    const isArray = Array.isArray(value);
    const isScalar = typeof value === 'string' || typeof value === 'number';
    const fieldType =
      fieldId === 'createdAt' || fieldId === 'updatedAt' ? 'DATETIME' : (questionTypeById[fieldId] || '');
    const dateText = isScalar && (fieldType === 'DATETIME' || fieldType === 'DATE') ? formatDate(raw) : null;
    const text = dateText || (isArray ? summarizeArray(value) : `${value}`);
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
              >
                {u.split('/').pop() || u}
              </a>
            ))}
            {urls.length > 3 && <span className="muted">+{urls.length - 3} more</span>}
          </div>
        );
      }
      if (urls.length === 1) {
        const href = urls[0];
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="truncate-link" title={title}>
            {text}
          </a>
        );
      }
    }
    const isLink = typeof value === 'string' && /^https?:\/\//i.test(value);
    if (isLink) {
      return (
        <a href={value as string} target="_blank" rel="noopener noreferrer" className="truncate-link" title={title}>
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
      <h3>{resolveLocalizedString(definition.listView?.title, language, 'Records')}</h3>
      <div className="list-toolbar">
        <input
          type="search"
          placeholder="Search records"
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
        />
        <label className="sort-control">
          Sort by
          <select value={sortField} onChange={e => setSortField(e.target.value)}>
            {sortOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => setSortDirection(dir => (dir === 'asc' ? 'desc' : 'asc'))}
        >
          {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>
      {loading && <div className="status">Loading…</div>}
      {error && <div className="error">{error}</div>}
      <div className="list-table-wrapper">
        <table className="list-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.fieldId}
                  onClick={() => {
                    const nextField = col.fieldId;
                    setSortField(nextField);
                    setSortDirection(prev =>
                      sortField === nextField ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'
                    );
                  }}
                  style={{ maxWidth: 180, whiteSpace: 'normal', wordBreak: 'break-word' }}
                >
                  {resolveLocalizedString(col.label, language, col.fieldId)}
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
                      {renderCellValue(row, col.fieldId)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="muted">
                  No records found.
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
          Previous
        </button>
        <div className="muted" style={{ alignSelf: 'center' }}>
          Page {totalPages ? pageIndex + 1 : 0} of {totalPages} • {visibleItems.length || totalCount} records
        </div>
        <button type="button" onClick={() => setPageIndex(prev => (showNext ? prev + 1 : prev))} disabled={!showNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default ListView;
