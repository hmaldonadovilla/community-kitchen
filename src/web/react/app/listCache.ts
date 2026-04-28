import { LangCode, WebFormDefinition, WebFormSubmission } from '../../types';
import { ListItem, ListResponse } from '../api';
import { collectListViewRuleColumnDependencies } from './listViewRuleColumns';

export type ListCacheState = { response: ListResponse | null; records: Record<string, WebFormSubmission> };

export type UpsertListCacheArgs = {
  recordId: string;
  values?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
  pdfUrl?: string;
  dataVersion?: number | null;
  rowNumber?: number | null;
};

export type RemoveListCacheArgs = {
  recordId: string;
};

const metaKeys = new Set(['id', '__rowNumber', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);

const resolvePositiveNumber = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const resolveTimestampMs = (value: any): number | null => {
  const raw = (value || '').toString().trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

const mergeEqualSnapshotRevision = (
  cached: WebFormSubmission,
  incoming: WebFormSubmission
): WebFormSubmission => {
  const cachedValues = ((cached as any).values || {}) as Record<string, any>;
  const incomingValues = ((incoming as any).values || {}) as Record<string, any>;
  const cachedLineItems = ((cached as any).lineItems || {}) as Record<string, any>;
  const incomingLineItems = ((incoming as any).lineItems || {}) as Record<string, any>;
  return {
    ...incoming,
    ...cached,
    createdAt: cached.createdAt || incoming.createdAt,
    updatedAt: cached.updatedAt || incoming.updatedAt,
    status: cached.status !== undefined ? cached.status : incoming.status,
    pdfUrl: (cached as any).pdfUrl !== undefined ? (cached as any).pdfUrl : (incoming as any).pdfUrl,
    values: { ...incomingValues, ...cachedValues },
    lineItems: { ...incomingLineItems, ...cachedLineItems },
    dataVersion: (cached as any).dataVersion ?? (incoming as any).dataVersion,
    __rowNumber: (cached as any).__rowNumber ?? (incoming as any).__rowNumber
  } as any;
};

export const hasLoadedListResponse = (response: ListResponse | null | undefined): response is ListResponse =>
  Boolean(response && Array.isArray((response as any).items));

export const mergeListRecordSnapshot = (
  cached: WebFormSubmission | null | undefined,
  incoming: WebFormSubmission | null | undefined
): WebFormSubmission | null => {
  if (!incoming) return cached || null;
  if (!cached) return incoming;

  const cachedVersion = resolvePositiveNumber((cached as any).dataVersion);
  const incomingVersion = resolvePositiveNumber((incoming as any).dataVersion);
  if (cachedVersion !== null && incomingVersion !== null) {
    if (incomingVersion > cachedVersion) return incoming;
    if (incomingVersion < cachedVersion) return cached;
    return mergeEqualSnapshotRevision(cached, incoming);
  }
  if (cachedVersion !== null && incomingVersion === null) return cached;
  if (cachedVersion === null && incomingVersion !== null) return incoming;

  const cachedUpdatedAt = resolveTimestampMs((cached as any).updatedAt);
  const incomingUpdatedAt = resolveTimestampMs((incoming as any).updatedAt);
  if (cachedUpdatedAt !== null && incomingUpdatedAt !== null) {
    if (incomingUpdatedAt > cachedUpdatedAt) return incoming;
    if (incomingUpdatedAt < cachedUpdatedAt) return cached;
    return mergeEqualSnapshotRevision(cached, incoming);
  }

  return mergeEqualSnapshotRevision(cached, incoming);
};

export const mergeListRecordSnapshotCache = (
  cached: Record<string, WebFormSubmission> | null | undefined,
  incoming: Record<string, WebFormSubmission> | null | undefined
): Record<string, WebFormSubmission> => {
  const next: Record<string, WebFormSubmission> = { ...(cached || {}) };
  const incomingRecords = incoming || {};
  Object.keys(incomingRecords).forEach(recordId => {
    const merged = mergeListRecordSnapshot(next[recordId], incomingRecords[recordId]);
    if (merged) next[recordId] = merged;
  });
  return next;
};

export const mergeListItemsWithRecordCache = (
  items: ListItem[],
  records: Record<string, WebFormSubmission> | null | undefined
): ListItem[] => {
  if (!Array.isArray(items) || !items.length) return items || [];
  const cache = records || {};
  return items.map(row => {
    const recordId = (row?.id || '').toString();
    const record = recordId ? cache[recordId] : null;
    if (!record) return row;

    const recordUpdatedAt = resolveTimestampMs((record as any).updatedAt);
    const rowUpdatedAt = resolveTimestampMs((row as any).updatedAt);
    if (recordUpdatedAt !== null && rowUpdatedAt !== null && recordUpdatedAt < rowUpdatedAt) return row;

    const patched: ListItem = { ...row };
    const values = ((record as any).values || {}) as Record<string, any>;
    if ((record as any).__rowNumber !== undefined) patched.__rowNumber = (record as any).__rowNumber;
    if ((record as any).createdAt) patched.createdAt = (record as any).createdAt;
    if ((record as any).updatedAt) patched.updatedAt = (record as any).updatedAt;
    if ((record as any).status !== undefined) patched.status = (record as any).status;
    if ((record as any).pdfUrl !== undefined) patched.pdfUrl = (record as any).pdfUrl;
    Object.keys(patched).forEach(key => {
      if (metaKeys.has(key)) return;
      if (values[key] !== undefined) patched[key] = values[key];
    });
    return patched;
  });
};

const resolveFieldIdsForNewRow = (definition: WebFormDefinition): Set<string> => {
  const cols: any[] = Array.isArray((definition as any)?.listView?.columns) ? ((definition as any).listView.columns as any[]) : [];
  const dateSearchFieldId = (((definition as any)?.listView?.search as any)?.dateFieldId || '').toString().trim();
  const fieldIds = new Set<string>();
  cols.forEach(c => {
    const fid = (c?.fieldId || '').toString().trim();
    if (fid) fieldIds.add(fid);
    if ((c as any)?.type === 'rule') {
      collectListViewRuleColumnDependencies(c as any).forEach(dep => {
        const d = (dep || '').toString().trim();
        if (d) fieldIds.add(d);
      });
    }
  });
  if (dateSearchFieldId) fieldIds.add(dateSearchFieldId);
  return fieldIds;
};

export const upsertListCacheRowPure = (args: {
  prev: ListCacheState;
  update: UpsertListCacheArgs;
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
}): ListCacheState => {
  const { prev, update, definition, formKey, language } = args;
  const recordId = (update.recordId || '').toString();
  if (!recordId) return prev;

  const nextRecords = { ...(prev.records || {}) };
  const existing = nextRecords[recordId];
  const dv = Number(update.dataVersion);
  const dataVersion = Number.isFinite(dv) && dv > 0 ? dv : undefined;
  const rn = Number(update.rowNumber);
  const rowNumber = Number.isFinite(rn) && rn >= 2 ? rn : undefined;
  const values = (update.values || {}) as any;
  const valuesWithStatus =
    update.status !== undefined
      ? { ...values, status: update.status || '' }
      : values;
  const shouldUpdateValues = Boolean(update.values) || update.status !== undefined;

  if (existing) {
    const existingValues = (existing.values || {}) as Record<string, any>;
    nextRecords[recordId] = {
      ...existing,
      createdAt: update.createdAt || existing.createdAt,
      updatedAt: update.updatedAt || existing.updatedAt,
      status: update.status !== undefined ? (update.status as any) : existing.status,
      pdfUrl: update.pdfUrl !== undefined ? (update.pdfUrl as any) : (existing as any).pdfUrl,
      values:
        shouldUpdateValues
          ? { ...existingValues, ...valuesWithStatus }
          : existing.values,
      ...(dataVersion ? { dataVersion } : null),
      ...(rowNumber ? { __rowNumber: rowNumber } : null)
    } as any;
  } else {
    nextRecords[recordId] = {
      id: recordId,
      formKey,
      language,
      createdAt: update.createdAt,
      updatedAt: update.updatedAt,
      status: update.status || undefined,
      pdfUrl: update.pdfUrl,
      values: shouldUpdateValues ? valuesWithStatus : {},
      lineItems: {},
      submittedAt: undefined,
      ...(dataVersion ? { dataVersion } : null),
      ...(rowNumber ? { __rowNumber: rowNumber } : null)
    } as any;
  }

  const response = prev.response;
  if (!response || !Array.isArray((response as any).items)) {
    return { response: prev.response, records: nextRecords };
  }

  let found = false;
  const nextItems = (response.items || []).map((row: any) => {
    if (!row || row.id !== recordId) return row;
    found = true;
    const patched: any = { ...row };
    if (rowNumber) patched.__rowNumber = rowNumber;
    if (update.createdAt) patched.createdAt = update.createdAt;
    if (update.updatedAt) patched.updatedAt = update.updatedAt;
    if (update.status !== undefined) patched.status = update.status || undefined;
    if (update.pdfUrl !== undefined) patched.pdfUrl = update.pdfUrl;
    Object.keys(patched).forEach(k => {
      if (metaKeys.has(k)) return;
      if (values[k] !== undefined) patched[k] = values[k];
    });
    return patched;
  });

  if (!found) {
    const fieldIds = resolveFieldIdsForNewRow(definition);
    const row: any = { id: recordId };
    if (rowNumber) row.__rowNumber = rowNumber;
    if (update.createdAt) row.createdAt = update.createdAt;
    if (update.updatedAt) row.updatedAt = update.updatedAt;
    if (update.status !== undefined) row.status = update.status || undefined;
    if (update.pdfUrl !== undefined) row.pdfUrl = update.pdfUrl;
    Array.from(fieldIds).forEach(fid => {
      if (metaKeys.has(fid)) return;
      if (values[fid] !== undefined) row[fid] = values[fid];
    });
    nextItems.unshift(row);
  }

  const nextTotal = Math.max(Number((response as any).totalCount || 0) || 0, nextItems.length);
  return { response: { ...(response as any), items: nextItems, totalCount: nextTotal }, records: nextRecords };
};

export const removeListCacheRowPure = (args: {
  prev: ListCacheState;
  remove: RemoveListCacheArgs;
}): ListCacheState => {
  const { prev, remove } = args;
  const recordId = (remove.recordId || '').toString();
  if (!recordId) return prev;

  const hasRecord = Object.prototype.hasOwnProperty.call(prev.records || {}, recordId);
  const nextRecords = hasRecord ? { ...(prev.records || {}) } : (prev.records || {});
  if (hasRecord) {
    delete (nextRecords as any)[recordId];
  }

  const response = prev.response;
  if (!response || !Array.isArray((response as any).items)) {
    if (!hasRecord) return prev;
    return { response: prev.response, records: nextRecords };
  }

  const prevItems = (response.items || []) as any[];
  const nextItems = prevItems.filter((row: any) => !row || row.id !== recordId);
  const removedCount = Math.max(0, prevItems.length - nextItems.length);
  if (!removedCount && !hasRecord) return prev;

  const prevTotalRaw = Number((response as any).totalCount || 0);
  const prevTotal = Number.isFinite(prevTotalRaw) && prevTotalRaw > 0 ? prevTotalRaw : prevItems.length;
  const nextTotal = Math.max(nextItems.length, prevTotal - removedCount);

  return {
    response: { ...(response as any), items: nextItems, totalCount: nextTotal },
    records: nextRecords
  };
};
