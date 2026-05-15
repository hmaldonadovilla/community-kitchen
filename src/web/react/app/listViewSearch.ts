import type { ListViewSearchConfig } from '../../types';

/**
 * List view search helpers (pure functions).
 *
 * Keep this logic outside React components so it is easy to unit test.
 */
export const normalizeToIsoDateLocal = (value: any): string | null => {
  if (value === undefined || value === null || value === '') return null;

  // Apps Script often returns actual Date objects for DATE cells.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = (value.getMonth() + 1).toString().padStart(2, '0');
    const day = value.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = value.toString ? value.toString().trim() : `${value}`.trim();
  if (!raw) return null;

  // Canonical date-only string: YYYY-MM-DD (treat as local date to avoid timezone shifts).
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // Fall back to parsing arbitrary date strings.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
  const day = parsed.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * The list search clear icon clears the input box only.
 *
 * In date mode we intentionally keep the applied query until the user selects a new
 * date or explicitly clears results, so the list does not suddenly expand to "all records"
 * while the user is preparing the next date search.
 */
export const shouldClearAppliedQueryOnInputClear = (mode: string | null | undefined): boolean => {
  void mode;
  return false;
};

export const resolveOldestPrefetchedIsoDate = (items: Array<Record<string, any>> | undefined | null, fieldId: string): string | null => {
  if (!Array.isArray(items) || !items.length) return null;
  const targetFieldId = (fieldId || '').toString().trim();
  if (!targetFieldId) return null;

  let oldest: string | null = null;
  items.forEach(item => {
    const next = normalizeToIsoDateLocal((item as any)?.[targetFieldId]);
    if (!next) return;
    if (!oldest || next < oldest) oldest = next;
  });
  return oldest;
};

export const isPastIsoDate = (value: any, now: Date = new Date()): boolean => {
  const queryDate = normalizeToIsoDateLocal(value);
  const today = normalizeToIsoDateLocal(now);
  return Boolean(queryDate && today && queryDate < today);
};

export const shouldHydrateRecordsForServerDateSearch = (queryDate: any, now: Date = new Date()): boolean =>
  isPastIsoDate(queryDate, now);

export const shouldUseServerDateSearch = (args: {
  queryDate: string | null | undefined;
  fieldId: string | null | undefined;
  items: Array<Record<string, any>> | undefined | null;
  loadedCount: number;
  totalCount: number;
  completeData?: boolean;
}): boolean => {
  const queryDate = normalizeToIsoDateLocal(args.queryDate);
  const fieldId = (args.fieldId || '').toString().trim();
  return Boolean(queryDate && fieldId);
};

export const shouldHideBaseItemsForServerDateSearch = (args: {
  dateSearchEnabled: boolean;
  dateSearchUsesServer: boolean;
  queryDate: string | null | undefined;
  serverQueryDate: string | null | undefined;
  hasServerResponse: boolean;
}): boolean => {
  if (!args.dateSearchEnabled || !args.dateSearchUsesServer) return false;
  const queryDate = normalizeToIsoDateLocal(args.queryDate);
  if (!queryDate) return false;
  const serverQueryDate = normalizeToIsoDateLocal(args.serverQueryDate);
  return serverQueryDate !== queryDate || !args.hasServerResponse;
};

export const resolvePreservedInlineListSearchState = (
  inputValue: string | null | undefined,
  queryValue: string | null | undefined
): { inputValue: string; queryValue: string } | null => {
  const input = (inputValue || '').toString();
  const query = (queryValue || '').toString();
  if (!input.trim() || !query.trim()) return null;
  return { inputValue: input, queryValue: query };
};

export const resolveInitialListSearchValue = (
  search: ListViewSearchConfig | undefined,
  now: Date = new Date()
): string => {
  const initial = search?.initialValue;
  if (initial === undefined || initial === null) return '';

  if (typeof initial === 'string') {
    const trimmed = initial.trim();
    if (!trimmed) return '';
    return search?.mode === 'date' ? normalizeToIsoDateLocal(trimmed) || '' : trimmed;
  }

  const relativeDate = (initial.relativeDate || '').toString().trim().toLowerCase();
  if ((search?.mode || 'text') === 'date' && relativeDate === 'today') {
    return normalizeToIsoDateLocal(now) || '';
  }

  const rawValue = (initial.value || '').toString().trim();
  if (!rawValue) return '';
  return search?.mode === 'date' ? normalizeToIsoDateLocal(rawValue) || '' : rawValue;
};
