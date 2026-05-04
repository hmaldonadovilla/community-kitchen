import type { ListResponse } from '../api';
import { resolveInitialListSearchValue } from './listViewSearch';

/**
 * Applies client-known initial list filters to Home list bootstrap responses.
 *
 * Boundary: this module is pure list-response normalization. It does not fetch,
 * cache, mutate React state, or decide list rendering.
 */
export const annotateListResponseWithInitialDateFilter = (
  response: ListResponse | null | undefined,
  listView: any
): ListResponse | null => {
  if (!response || !Array.isArray((response as any).items)) return response || null;
  if ((response.dateFilterFieldId || '').toString().trim() && (response.dateFilterEquals || '').toString().trim()) return response;
  const search = listView?.search;
  if ((search?.mode || '').toString().trim() !== 'date') return response;
  const dateFieldId = ((search as any)?.dateFieldId || '').toString().trim();
  const initialDate = resolveInitialListSearchValue(search);
  if (!dateFieldId || !initialDate) return response;
  return {
    ...response,
    dateFilterFieldId: dateFieldId,
    dateFilterEquals: initialDate
  };
};
