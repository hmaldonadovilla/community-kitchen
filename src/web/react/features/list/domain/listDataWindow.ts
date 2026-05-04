/**
 * Owns ListView client-side data window helpers for paging and sort defaults.
 */
export interface IdentifiableListItem {
  id?: unknown;
}

export interface ListResponseLike {
  items?: unknown[];
  nextPageToken?: unknown;
  totalCount?: unknown;
}

export const mergeListItemsById = <T extends IdentifiableListItem>(existing: T[], incoming: T[]): T[] => {
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

export const encodeClientPageToken = (offset: number): string => {
  const n = Math.max(0, Math.floor(Number(offset) || 0));
  const text = n.toString();
  try {
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any).btoa === 'function') {
      return (globalThis as any).btoa(text);
    }
  } catch {
    // Fall through to the raw offset fallback.
  }
  return text;
};

export const isListResponseComplete = (res: ListResponseLike | null | undefined): boolean => {
  if (!res || !Array.isArray(res.items)) return false;
  if (res.nextPageToken) return false;
  const total = Number(res.totalCount || 0);
  if (!Number.isFinite(total) || total <= 0) return (res.items || []).length > 0;
  return (res.items || []).length >= total;
};

export const resolveListSortDefaultDirection = (
  fieldId: string,
  questionTypeById: Record<string, unknown>
): 'asc' | 'desc' => {
  if (fieldId === 'createdAt' || fieldId === 'updatedAt') return 'desc';
  const questionType = (questionTypeById[fieldId] || '').toString().toUpperCase();
  if (questionType === 'DATE' || questionType === 'DATETIME') return 'desc';
  return 'asc';
};
