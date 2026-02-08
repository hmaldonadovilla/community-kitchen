import { LangCode, WebFormDefinition, WebFormSubmission } from '../../types';
import { ListResponse } from '../api';
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

  if (existing) {
    nextRecords[recordId] = {
      ...existing,
      createdAt: update.createdAt || existing.createdAt,
      updatedAt: update.updatedAt || existing.updatedAt,
      status: update.status !== undefined ? (update.status as any) : existing.status,
      pdfUrl: update.pdfUrl !== undefined ? (update.pdfUrl as any) : (existing as any).pdfUrl,
      values: update.values ? { ...(existing.values as any), ...(update.values as any) } : existing.values,
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
      values: update.values || {},
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
