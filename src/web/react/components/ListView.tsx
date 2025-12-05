import React, { useEffect, useMemo, useState } from 'react';
import { resolveLocalizedString } from '../../i18n';
import { LangCode, WebFormDefinition, WebFormSubmission } from '../../types';
import { fetchBatch, BatchResponse, ListItem, ListResponse } from '../api';

interface ListViewProps {
  formKey: string;
  definition: WebFormDefinition;
  language: LangCode;
  onSelect: (row: ListItem, record?: WebFormSubmission) => void;
  cachedResponse?: ListResponse | null;
  cachedRecords?: Record<string, WebFormSubmission>;
  refreshToken?: number;
  onCache?: (payload: { response: ListResponse; records: Record<string, WebFormSubmission> }) => void;
}

const ListView: React.FC<ListViewProps> = ({
  formKey,
  definition,
  language,
  onSelect,
  cachedResponse,
  cachedRecords,
  refreshToken = 0,
  onCache
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

  const fetchAllPages = async () => {
    setLoading(true);
    setError(null);
    try {
      let token: string | undefined;
      let aggregated: ListItem[] = [];
      const mergedRecords: Record<string, WebFormSubmission> = {};
      let lastResponse: ListResponse | null = null;
      do {
        const res: BatchResponse = await fetchBatch(formKey, undefined, pageSize, token, true);
        lastResponse = res.list || null;
        const items = res.list?.items || [];
        aggregated = aggregated.concat(items);
        Object.assign(mergedRecords, res.records || {});
        token = res.list?.nextPageToken;
        if (!token || aggregated.length >= (res.list?.totalCount || 200)) {
          token = undefined;
        }
      } while (token);
      setAllItems(aggregated);
      setRecords(mergedRecords);
      setTotalCount(lastResponse?.totalCount || aggregated.length);
      setPageIndex(0);
      if (lastResponse) {
        onCache?.({
          response: { ...lastResponse, items: aggregated, nextPageToken: undefined },
          records: mergedRecords
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load list');
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    if (cachedResponse?.items?.length) return;
    fetchAllPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, refreshToken]);

  useEffect(() => {
    setPageIndex(0);
    setSearchValue('');
    setSortField(defaultSortField);
    setSortDirection(defaultSortDirection);
  }, [formKey, refreshToken, defaultSortField, defaultSortDirection]);

  const columns = useMemo(
    () => definition.listView?.columns || definition.questions.map(q => ({ fieldId: q.id, label: q.label })),
    [definition]
  );

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
    const candidate = typeof value === 'number' ? value : `${value}`;
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  const renderCellValue = (row: ListItem, fieldId: string) => {
    const raw = (row as any)[fieldId];
    if (raw === undefined || raw === null || raw === '') return '—';
    const isScalar = typeof raw === 'string' || typeof raw === 'number';
    const dateText = isScalar ? formatDate(raw) : null;
    const text = dateText || (Array.isArray(raw) ? raw.join(', ') : `${raw}`);
    const title = dateText ? `${raw}` : text;
    const isLink = typeof raw === 'string' && /^https?:\/\//i.test(raw);
    if (isLink) {
      return (
        <a href={raw as string} target="_blank" rel="noopener noreferrer" className="truncate-link" title={title}>
          {text}
        </a>
      );
    }
    return (
      <span className="truncate-link" title={title}>
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
        <table className="list-table">
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
                    <td key={col.fieldId}>{renderCellValue(row, col.fieldId)}</td>
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
