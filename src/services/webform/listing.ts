import {
  FormConfig,
  PaginatedResult,
  QuestionConfig,
  SubmissionBatchResult,
  WebFormSubmission
} from '../../types';
import { CacheEtagManager } from './cache';
import { decodePageToken, encodePageToken } from './pagination';
import { HeaderColumns, ListPageResult } from './types';
import { SubmissionService } from './submissions';
import { debugLog } from './debug';

const LIST_CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h max supported by CacheService

export class ListingService {
  private readonly submissionService: SubmissionService;
  private readonly cacheManager: CacheEtagManager;

  constructor(submissionService: SubmissionService, cacheManager: CacheEtagManager) {
    this.submissionService = submissionService;
    this.cacheManager = cacheManager;
  }

  fetchSubmissions(
    form: FormConfig,
    questions: QuestionConfig[],
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string
  ): PaginatedResult<Record<string, any>> {
    const result = this.fetchSubmissionsPageInternal(form, questions, projection, pageSize, pageToken, false);
    return result.list;
  }

  fetchSubmissionsBatch(
    form: FormConfig,
    questions: QuestionConfig[],
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[]
  ): SubmissionBatchResult<Record<string, any>> {
    const page = this.fetchSubmissionsPageInternal(form, questions, projection, pageSize, pageToken, includePageRecords);
    const records: Record<string, WebFormSubmission> = includePageRecords ? { ...page.records } : {};
    if (recordIds?.length) {
      recordIds.forEach(id => {
        const key = (id || '').toString();
        if (!key || records[key]) return;
        const fetched = this.fetchSubmissionById(form, questions, key);
        if (fetched) {
          records[key] = fetched;
        }
      });
    }
    return { list: page.list, records };
  }

  /**
   * Fetch submissions in a deterministic, server-sorted order.
   *
   * Why:
   * - The default list endpoint returns rows in sheet order; the React client sorts locally.
   * - When loading pages progressively, local sorting can cause the "first page" to shift as more rows arrive.
   * - This endpoint sorts on the server (within the 200-row cap) so page 1 is stable from the first response.
   *
   * Notes:
   * - Sorting is limited to a single field (fieldId) + direction.
   * - Total results are capped to 200 rows (same as other list endpoints).
   */
  fetchSubmissionsSortedBatch(
    form: FormConfig,
    questions: QuestionConfig[],
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[],
    sort?: { fieldId?: string; direction?: string; __ifNoneMatch?: boolean; __clientEtag?: string }
  ): SubmissionBatchResult<Record<string, any>> {
    const startedAt = Date.now();
    const sortFieldOverride = (sort?.fieldId || '').toString().trim();
    const sortDirRaw = (sort?.direction || '').toString().trim().toLowerCase();
    const sortDirectionOverride = sortDirRaw === 'desc' ? 'desc' : 'asc';
    const clientEtag = (((sort as any)?.__clientEtag ?? (sort as any)?.clientEtag ?? '') || '').toString().trim();
    const ifNoneMatchRaw = (sort as any)?.__ifNoneMatch ?? (sort as any)?.ifNoneMatch;
    const ifNoneMatch = ifNoneMatchRaw === true || ifNoneMatchRaw === 'true' || ifNoneMatchRaw === '1' || ifNoneMatchRaw === 1;

    const { sheet, headers, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);

    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    const size = Math.max(1, Math.min(pageSize || 10, 50));
    const offset = decodePageToken(pageToken);
    const canReturnNotModified =
      ifNoneMatch &&
      !!clientEtag &&
      offset <= 0 &&
      !includePageRecords &&
      (!recordIds || !recordIds.length);
    if (canReturnNotModified && clientEtag === etag) {
      const notModifiedList: PaginatedResult<Record<string, any>> = {
        items: [],
        totalCount: cappedTotal,
        etag
      };
      (notModifiedList as any).notModified = true;
      return { list: notModifiedList, records: {} };
    }
    if (offset >= cappedTotal) {
      const emptyList: PaginatedResult<Record<string, any>> = { items: [], totalCount: cappedTotal, etag };
      return { list: emptyList, records: {} };
    }

    const fieldIds = projection && projection.length ? projection : questions.map(q => q.id);

    // Multi-key sorting:
    // - Primary is the caller-provided `sort` (when present)
    // - Tie-breakers come from `question.listViewSort` in increasing priority order
    const listViewSorts = (questions || [])
      .filter(q => q && q.listViewSort && q.listView)
      .map(q => {
        const fieldId = (q.id || '').toString().trim();
        const dir = ((q.listViewSort as any)?.direction || '').toString().trim().toLowerCase();
        const direction = dir === 'desc' ? 'desc' : 'asc';
        const priorityRaw = (q.listViewSort as any)?.priority;
        const priority =
          priorityRaw !== undefined && priorityRaw !== null && Number.isFinite(Number(priorityRaw))
            ? Number(priorityRaw)
            : Number.MAX_SAFE_INTEGER;
        return { fieldId, direction, priority };
      })
      .filter(s => Boolean(s.fieldId))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.fieldId.localeCompare(b.fieldId);
      });

    const primarySort = sortFieldOverride
      ? { fieldId: sortFieldOverride, direction: sortDirectionOverride }
      : listViewSorts.length
        ? { fieldId: listViewSorts[0].fieldId, direction: listViewSorts[0].direction }
        : null;

    const effectiveSorts: Array<{ fieldId: string; direction: 'asc' | 'desc' }> = [];
    if (primarySort?.fieldId) {
      effectiveSorts.push(primarySort as any);
    }
    listViewSorts.forEach(s => {
      if (!s.fieldId) return;
      if (primarySort?.fieldId && s.fieldId === primarySort.fieldId) return;
      effectiveSorts.push({ fieldId: s.fieldId, direction: s.direction as any });
    });

    // Always include stable system tie-breakers when sorting is enabled.
    //
    // Why:
    // - Many listViewSort keys can collide (e.g., same DATE), and using sheet order as the final tie-breaker
    //   makes list ordering feel "random" to users and can shift when rows are appended.
    // - System fields exist even when not shown as visible columns; they are ideal tie-breakers.
    //
    // Notes:
    // - `updatedAt` is preferred so the most recently modified records appear first among ties.
    // - `id` ensures deterministic ordering when timestamps also collide.
    if (effectiveSorts.length) {
      const ensure = (fieldId: string, direction: 'asc' | 'desc') => {
        const id = (fieldId || '').toString().trim();
        if (!id) return;
        if (effectiveSorts.some(s => (s.fieldId || '').toString() === id)) return;
        effectiveSorts.push({ fieldId: id, direction });
      };
      ensure('updatedAt', 'desc');
      ensure('id', 'asc');
    }

    const sortKey = effectiveSorts.length
      ? effectiveSorts.map(s => `${s.fieldId}:${s.direction}`).join('|')
      : '';
    const cacheKey = this.cacheManager.makeCacheKey('LIST_SORT', [
      form.configSheet || '',
      etag || '',
      fieldIds.join('|'),
      size.toString(),
      pageToken || '',
      includePageRecords ? 'R1' : 'R0',
      sortKey
    ]);
    const cached = this.cacheManager.cacheGet<SubmissionBatchResult<Record<string, any>>>(cacheKey);
    if (cached && cached.list && Array.isArray((cached.list as any).items)) {
      const cachedList = { ...(cached.list as any), etag: (cached.list as any).etag || etag };
      return { list: cachedList, records: cached.records || {} };
    }

    const questionTypeById: Record<string, string> = {};
    (questions || []).forEach(q => {
      const id = (q?.id || '').toString();
      if (!id) return;
      questionTypeById[id] = (q.type || '').toString();
    });

    const colIndexByKey: Record<string, number> = {};
    const addColumnIndex = (key: string, colIdx?: number) => {
      const idx = Number(colIdx || 0);
      if (!key || !Number.isFinite(idx) || idx <= 0) return;
      colIndexByKey[key] = idx;
    };

    addColumnIndex('__id', columns.recordId);
    addColumnIndex('__createdAt', columns.createdAt);
    addColumnIndex('__updatedAt', columns.updatedAt);
    addColumnIndex('__status', columns.status);
    addColumnIndex('__pdfUrl', columns.pdfUrl);

    // Projection fields (list columns)
    fieldIds.forEach(fid => {
      const key = (fid || '').toString();
      if (!key) return;
      addColumnIndex(key, columns.fields[key]);
    });

    // Sorting fields (may not be part of projection)
    effectiveSorts.forEach(s => {
      const f = (s?.fieldId || '').toString().trim();
      if (!f) return;
      const metaSort = f === 'id' || f === 'createdAt' || f === 'updatedAt' || f === 'status' || f === 'pdfUrl';
      if (metaSort) return;
      addColumnIndex(f, columns.fields[f]);
    });
    const columnReadStartedAt = Date.now();
    const columnRead = this.readColumnsForRows(sheet, 2, cappedTotal, Object.values(colIndexByKey));
    const colValuesByKey: Record<string, any[]> = {};
    Object.keys(colIndexByKey).forEach(key => {
      const idx = colIndexByKey[key];
      colValuesByKey[key] = columnRead.valuesByColumn[idx] || new Array(cappedTotal).fill(undefined);
    });
    debugLog('listing.sorted.readColumns', {
      formKey: form.configSheet,
      rows: cappedTotal,
      columns: Object.keys(colIndexByKey).length,
      segments: columnRead.segmentCount,
      durationMs: Date.now() - columnReadStartedAt
    });

    const asIso = (value: any): string | undefined => {
      if (value instanceof Date) return value.toISOString();
      if (value === undefined || value === null || value === '') return undefined;
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch (_) {
        // ignore
      }
      return value.toString();
    };

    const parseYmdAsLocalMs = (s: string): number | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
      const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
      return isNaN(dt.getTime()) ? null : dt.getTime();
    };

    const normalizeSortValue = (raw: any, typeHint?: string): { kind: 'num' | 'str'; n: number; s: string } => {
      if (raw === undefined || raw === null || raw === '') return { kind: 'num', n: Number.NEGATIVE_INFINITY, s: '' };
      const t = (typeHint || '').toString().trim().toUpperCase();
      if (t === 'DATE' || t === 'DATETIME') {
        if (raw instanceof Date) return { kind: 'num', n: raw.getTime(), s: '' };
        if (typeof raw === 'number') return { kind: 'num', n: raw, s: '' };
        const str = raw?.toString?.() || '';
        const ymd = parseYmdAsLocalMs(str);
        if (ymd !== null) return { kind: 'num', n: ymd, s: '' };
        const d = new Date(str);
        return !isNaN(d.getTime()) ? { kind: 'num', n: d.getTime(), s: '' } : { kind: 'str', n: 0, s: str.toLowerCase() };
      }
      if (typeof raw === 'number') return { kind: 'num', n: raw, s: '' };
      const str = raw?.toString?.() || '';
      const asNum = Number(str);
      if (str.trim() && Number.isFinite(asNum) && !Number.isNaN(asNum)) {
        return { kind: 'num', n: asNum, s: '' };
      }
      return { kind: 'str', n: 0, s: str.toLowerCase() };
    };

    const compareNormalized = (a: { kind: 'num' | 'str'; n: number; s: string }, b: { kind: 'num' | 'str'; n: number; s: string }): number => {
      if (a.kind === 'num' && b.kind === 'num') return a.n - b.n;
      if (a.kind === 'str' && b.kind === 'str') return a.s.localeCompare(b.s);
      // Prefer numbers over strings for mixed content.
      return a.kind === 'num' ? -1 : 1;
    };

    const metaSortType = (fieldId: string): string => {
      if (fieldId === 'createdAt' || fieldId === 'updatedAt') return 'DATETIME';
      return questionTypeById[fieldId] || '';
    };

    // Build list rows for all items (up to 200) so we can sort deterministically.
    const entries: Array<{ idx: number; rowNumber: number; item: Record<string, any> }> = [];
    for (let idx = 0; idx < cappedTotal; idx += 1) {
      const rowNumber = 2 + idx;
      const rowIdValue = colValuesByKey.__id ? colValuesByKey.__id[idx] : '';
      const rowId = rowIdValue !== undefined && rowIdValue !== null ? rowIdValue.toString() : '';
      if (!rowId) continue;
      const item: Record<string, any> = {};
      item.__rowNumber = rowNumber;
      item.id = rowId;

      const createdAtRaw = colValuesByKey.__createdAt ? colValuesByKey.__createdAt[idx] : undefined;
      const updatedAtRaw = colValuesByKey.__updatedAt ? colValuesByKey.__updatedAt[idx] : undefined;
      item.createdAt = createdAtRaw !== undefined ? asIso(createdAtRaw) : undefined;
      item.updatedAt = updatedAtRaw !== undefined ? asIso(updatedAtRaw) : undefined;
      item.status = colValuesByKey.__status ? colValuesByKey.__status[idx] : undefined;
      item.pdfUrl = colValuesByKey.__pdfUrl ? colValuesByKey.__pdfUrl[idx] : undefined;

      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        if (!key) return;
        const col = colValuesByKey[key];
        if (!col) return;
        item[key] = col[idx];
      });

      entries.push({ idx, rowNumber, item });
    }

    if (effectiveSorts.length) {
      const rawSortValueForEntry = (
        entry: { idx: number; rowNumber: number; item: Record<string, any> },
        fieldId: string
      ): any => {
        // Meta sort fields
        if (fieldId === 'id') return entry.item.id;
        if (fieldId === 'createdAt') return entry.item.createdAt || '';
        if (fieldId === 'updatedAt') return entry.item.updatedAt || '';
        if (fieldId === 'status') return entry.item.status || '';
        if (fieldId === 'pdfUrl') return entry.item.pdfUrl || '';
        // Question sort fields (may not be part of the projection)
        const col = colValuesByKey[fieldId];
        if (col && entry.idx >= 0 && entry.idx < col.length) return col[entry.idx];
        return (entry.item as any)[fieldId];
      };

      entries.sort((a, b) => {
        for (const s of effectiveSorts) {
          const fieldId = (s.fieldId || '').toString();
          if (!fieldId) continue;
          const dirMul = s.direction === 'desc' ? -1 : 1;
          const sortType = metaSortType(fieldId);
          const av = normalizeSortValue(rawSortValueForEntry(a as any, fieldId), sortType);
          const bv = normalizeSortValue(rawSortValueForEntry(b as any, fieldId), sortType);
          const c = compareNormalized(av, bv);
          if (c !== 0) return c * dirMul;
        }
        // Stable tie-breaker: keep sheet order when all sort keys match.
        return a.idx - b.idx;
      });
    }

    const readCount = Math.min(size, entries.length - offset);
    const pageEntries = entries.slice(offset, offset + readCount);
    const nextOffset = offset + readCount;
    const nextPageTokenValue = nextOffset < entries.length ? encodePageToken(nextOffset) : undefined;

    const listResult: PaginatedResult<Record<string, any>> = {
      items: pageEntries.map(e => e.item),
      nextPageToken: nextPageTokenValue,
      totalCount: entries.length,
      etag
    };

    const records: Record<string, WebFormSubmission> = {};
    if (includePageRecords) {
      // Full record hydration requires reading the row; use the existing row-number fetch (and cache).
      pageEntries.forEach(e => {
        const rowNumber = Number((e as any).rowNumber);
        if (!Number.isFinite(rowNumber) || rowNumber < 2) return;
        const record = this.fetchSubmissionByRowNumber(form, questions, rowNumber);
        if (record && record.id) {
          records[record.id] = record;
        }
      });
    }

    if (recordIds?.length) {
      recordIds.forEach(id => {
        const key = (id || '').toString();
        if (!key || records[key]) return;
        const fetched = this.fetchSubmissionById(form, questions, key);
        if (fetched) {
          records[key] = fetched;
        }
      });
    }

    const result: SubmissionBatchResult<Record<string, any>> = { list: listResult, records };
    this.cacheManager.cachePut(cacheKey, result, LIST_CACHE_TTL_SECONDS);
    debugLog('listing.sorted.completed', {
      formKey: form.configSheet,
      totalRows: cappedTotal,
      pageSize: size,
      pageOffset: offset,
      returnedItems: listResult.items.length,
      sortKey: sortKey || null,
      durationMs: Date.now() - startedAt
    });
    return result;
  }

  fetchSubmissionById(
    form: FormConfig,
    questions: QuestionConfig[],
    id: string
  ): WebFormSubmission | null {
    if (!id) return null;
    const { sheet, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const cached = this.cacheManager.getCachedRecord(form.configSheet, etag, id);
    if (cached) return cached;
    if (!columns.recordId) return null;
    const totalRows = Math.max(0, sheet.getLastRow() - 1);
    if (totalRows <= 0) return null;
    let rowNumber = -1;
    try {
      const range = sheet.getRange(2, columns.recordId, totalRows, 1);
      const finder = (range as any).createTextFinder ? (range as any).createTextFinder(id) : null;
      if (finder && typeof finder.matchEntireCell === 'function') {
        const match = finder.matchEntireCell(true).findNext();
        if (match && typeof match.getRow === 'function') {
          rowNumber = match.getRow();
        }
      }
    } catch (_) {
      rowNumber = -1;
    }
    if (rowNumber < 2) {
      // Fallback for environments without TextFinder (tests) or if it fails
      const rows = sheet.getRange(2, columns.recordId, totalRows, 1).getValues();
      const matchIndex = rows.findIndex(r => (r[0] || '').toString() === id);
      if (matchIndex < 0) {
        debugLog('listing.fetchSubmissionById.notFound', {
          formKey: form.configSheet,
          destinationTab: form.destinationTab || `${form.title} Responses`,
          id,
          recordIdColumn: columns.recordId,
          lastRow: sheet.getLastRow()
        });
        return null;
      }
      rowNumber = 2 + matchIndex;
    }
    const data = this.readRowForRecord(sheet, rowNumber, columns, questions);
    const record = this.submissionService.buildSubmissionRecord(form.configSheet, questions, columns, data, id);
    if (record) {
      this.cacheManager.cacheRecord(form.configSheet, etag, record);
    }
    return record;
  }

  fetchSubmissionByRowNumber(
    form: FormConfig,
    questions: QuestionConfig[],
    rowNumber: number
  ): WebFormSubmission | null {
    const targetRow = Number(rowNumber);
    if (!Number.isFinite(targetRow) || targetRow < 2) return null;
    const { sheet, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const lastRow = sheet.getLastRow();
    if (targetRow > lastRow) return null;

    const data = this.readRowForRecord(sheet, targetRow, columns, questions);
    let recordId = columns.recordId ? (data[columns.recordId - 1] || '').toString() : '';

    // If the row is missing a record id (legacy data), assign one on-demand so the record can be opened reliably.
    if (!recordId && columns.recordId) {
      recordId = this.generateUuid();
      try {
        sheet.getRange(targetRow, columns.recordId, 1, 1).setValue(recordId);
      } catch (_) {
        // ignore
      }
      data[columns.recordId - 1] = recordId;

      const now = new Date();
      if (columns.createdAt && !data[columns.createdAt - 1]) {
        try {
          sheet.getRange(targetRow, columns.createdAt, 1, 1).setValue(now);
        } catch (_) {
          // ignore
        }
        data[columns.createdAt - 1] = now;
      }
      if (columns.updatedAt && !data[columns.updatedAt - 1]) {
        try {
          sheet.getRange(targetRow, columns.updatedAt, 1, 1).setValue(now);
        } catch (_) {
          // ignore
        }
        data[columns.updatedAt - 1] = now;
      }

      this.cacheManager.bumpSheetEtag(sheet, columns, 'fetchSubmissionByRowNumber.assignId');
      debugLog('listing.fetchSubmissionByRowNumber.assignedId', {
        formKey: form.configSheet,
        destinationTab: form.destinationTab || `${form.title} Responses`,
        rowNumber: targetRow,
        id: recordId
      });
    }

    if (!recordId) return null;
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const cached = this.cacheManager.getCachedRecord(form.configSheet, etag, recordId);
    if (cached) return cached;
    const record = this.submissionService.buildSubmissionRecord(form.configSheet, questions, columns, data, recordId);
    if (record) {
      this.cacheManager.cacheRecord(form.configSheet, etag, record);
    }
    return record;
  }

  fetchSubmissionsByRowNumbers(
    form: FormConfig,
    questions: QuestionConfig[],
    rowNumbers: number[]
  ): Record<string, WebFormSubmission> {
    const startedAt = Date.now();
    const uniqueRows = Array.from(
      new Set(
        (Array.isArray(rowNumbers) ? rowNumbers : [])
          .map(v => Number(v))
          .filter(v => Number.isFinite(v) && v >= 2)
          .map(v => Math.floor(v))
      )
    ).sort((a, b) => a - b);
    const out: Record<string, WebFormSubmission> = {};
    if (!uniqueRows.length) return out;

    const { sheet, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const lastRow = sheet.getLastRow();
    const validRows = uniqueRows.filter(rowNumber => rowNumber <= lastRow);
    if (!validRows.length) return out;

    const colSet = new Set<number>();
    const add = (idx: number | undefined) => {
      if (!idx || idx <= 0) return;
      colSet.add(idx);
    };

    add(columns.timestamp);
    add(columns.language);
    add(columns.recordId);
    add(columns.dataVersion);
    add(columns.createdAt);
    add(columns.updatedAt);
    add(columns.status);
    add(columns.pdfUrl);
    questions.forEach(q => add(columns.fields[q.id]));

    const cols = Array.from(colSet).sort((a, b) => a - b);
    const maxCol = cols.length ? Math.max(...cols) : 1;
    const minRow = validRows[0];
    const maxRow = validRows[validRows.length - 1];
    const rowCount = maxRow - minRow + 1;
    const read = this.readColumnsForRows(sheet, minRow, rowCount, cols);

    validRows.forEach(rowNumber => {
      const offset = rowNumber - minRow;
      const rowValues = new Array(maxCol).fill(undefined);
      cols.forEach(col => {
        const values = read.valuesByColumn[col];
        rowValues[col - 1] = values && offset >= 0 && offset < values.length ? values[offset] : undefined;
      });

      const recordId = columns.recordId ? (rowValues[columns.recordId - 1] || '').toString() : '';
      if (!recordId) {
        // Preserve legacy behavior for rows missing record ids.
        const fallback = this.fetchSubmissionByRowNumber(form, questions, rowNumber);
        if (fallback?.id) out[fallback.id] = fallback;
        return;
      }

      const cached = this.cacheManager.getCachedRecord(form.configSheet, etag, recordId);
      if (cached?.id) {
        out[cached.id] = cached;
        return;
      }

      const record = this.submissionService.buildSubmissionRecord(form.configSheet, questions, columns, rowValues, recordId);
      if (!record?.id) return;
      out[record.id] = record;
      this.cacheManager.cacheRecord(form.configSheet, etag, record);
    });

    debugLog('listing.fetchSubmissionsByRowNumbers.done', {
      formKey: form.configSheet,
      requestedRows: uniqueRows.length,
      validRows: validRows.length,
      returnedRecords: Object.keys(out).length,
      durationMs: Date.now() - startedAt
    });
    return out;
  }

  private readRowForRecord(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    rowNumber: number,
    columns: HeaderColumns,
    questions: QuestionConfig[]
  ): any[] {
    const colSet = new Set<number>();
    const add = (idx: number | undefined) => {
      if (!idx || idx <= 0) return;
      colSet.add(idx);
    };

    add(columns.timestamp);
    add(columns.language);
    add(columns.recordId);
    add(columns.dataVersion);
    add(columns.createdAt);
    add(columns.updatedAt);
    add(columns.status);
    add(columns.pdfUrl);

    questions.forEach(q => {
      const colIdx = columns.fields[q.id];
      add(colIdx);
    });

    const cols = Array.from(colSet).sort((a, b) => a - b);
    const maxCol = cols.length ? Math.max(...cols) : 1;
    const rowValues = new Array(maxCol).fill(undefined);
    if (!cols.length) return rowValues;

    const read = this.readColumnsForRows(sheet, rowNumber, 1, cols);
    cols.forEach(col => {
      const values = read.valuesByColumn[col];
      rowValues[col - 1] = values && values.length ? values[0] : undefined;
    });

    return rowValues;
  }

  private fetchSubmissionsPageInternal(
    form: FormConfig,
    questions: QuestionConfig[],
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includeRecords: boolean = true
  ): ListPageResult {
    const { sheet, headers, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    const size = Math.max(1, Math.min(pageSize || 10, 50));
    const offset = decodePageToken(pageToken);
    if (offset >= cappedTotal) {
      const emptyList: PaginatedResult<Record<string, any>> = { items: [], totalCount: cappedTotal };
      return { list: emptyList, records: {}, etag };
    }

    const fieldIds = (projection && projection.length) ? projection : questions.map(q => q.id);
    const cacheKey = this.cacheManager.makeListCacheKey(form.configSheet, etag, fieldIds, size, pageToken, includeRecords);
    const cached = this.cacheManager.cacheGet<ListPageResult>(cacheKey);
    if (cached) {
      const cachedList = { ...cached.list, etag: cached.list.etag || etag };
      return { list: cachedList, records: cached.records || {}, etag };
    }

    const readCount = Math.min(size, cappedTotal - offset);
    const startRow = 2 + offset;
    // When we don't need full record hydration, read only the required columns to keep calls snappy.
    const data = includeRecords && readCount > 0 ? sheet.getRange(startRow, 1, readCount, headers.length).getValues() : [];
    const colValuesByKey: Record<string, any[]> = includeRecords ? {} : (() => {
      const colIndexByKey: Record<string, number> = {};
      const addColumnIndex = (key: string, colIdx?: number) => {
        const idx = Number(colIdx || 0);
        if (!key || !Number.isFinite(idx) || idx <= 0) return;
        colIndexByKey[key] = idx;
      };

      addColumnIndex('__id', columns.recordId);
      addColumnIndex('__createdAt', columns.createdAt);
      addColumnIndex('__updatedAt', columns.updatedAt);
      addColumnIndex('__status', columns.status);
      addColumnIndex('__pdfUrl', columns.pdfUrl);
      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        if (!key) return;
        addColumnIndex(key, columns.fields[key]);
      });
      const read = this.readColumnsForRows(sheet, startRow, readCount, Object.values(colIndexByKey));
      const map: Record<string, any[]> = {};
      Object.keys(colIndexByKey).forEach(key => {
        const idx = colIndexByKey[key];
        map[key] = read.valuesByColumn[idx] || new Array(readCount).fill(undefined);
      });
      return map;
    })();

    const records: Record<string, WebFormSubmission> = {};
    const items = (includeRecords ? data : new Array(readCount).fill(null)).map((row, idx) => {
      const item: Record<string, any> = {};
      item.__rowNumber = startRow + idx;
      const rowIdValue = includeRecords
        ? (columns.recordId ? (row as any[])[columns.recordId - 1] : '')
        : (colValuesByKey.__id ? colValuesByKey.__id[idx] : '');
      const rowId = rowIdValue ? rowIdValue.toString() : '';
      item.id = rowId;
      const createdAtRaw = includeRecords
        ? (columns.createdAt ? (row as any[])[columns.createdAt - 1] : undefined)
        : (colValuesByKey.__createdAt ? colValuesByKey.__createdAt[idx] : undefined);
      const updatedAtRaw = includeRecords
        ? (columns.updatedAt ? (row as any[])[columns.updatedAt - 1] : undefined)
        : (colValuesByKey.__updatedAt ? colValuesByKey.__updatedAt[idx] : undefined);
      item.createdAt = createdAtRaw !== undefined ? this.asIso(createdAtRaw) : undefined;
      item.updatedAt = updatedAtRaw !== undefined ? this.asIso(updatedAtRaw) : undefined;
      item.status = includeRecords
        ? (columns.status ? (row as any[])[columns.status - 1] : undefined)
        : (colValuesByKey.__status ? colValuesByKey.__status[idx] : undefined);
      item.pdfUrl = includeRecords
        ? (columns.pdfUrl ? (row as any[])[columns.pdfUrl - 1] : undefined)
        : (colValuesByKey.__pdfUrl ? colValuesByKey.__pdfUrl[idx] : undefined);
      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        if (!key) return;
        if (includeRecords) {
          const colIdx = columns.fields[key];
          if (!colIdx) return;
          item[key] = (row as any[])[colIdx - 1];
          return;
        }
        if (colValuesByKey[key]) {
          item[key] = colValuesByKey[key][idx];
        }
      });
      if (includeRecords && rowId) {
        const record = this.submissionService.buildSubmissionRecord(form.configSheet, questions, columns, row, rowId);
        if (record) {
          records[rowId] = record;
          this.cacheManager.cacheRecord(form.configSheet, etag, record);
        }
      }
      return item;
    });

    const nextOffset = offset + readCount;
    const hasMore = nextOffset < cappedTotal;
    const nextPageTokenValue = hasMore ? encodePageToken(nextOffset) : undefined;
    const listResult: PaginatedResult<Record<string, any>> = {
      items,
      nextPageToken: nextPageTokenValue,
      totalCount: cappedTotal,
      etag
    };

    this.cacheManager.cachePut(cacheKey, { list: listResult, records }, LIST_CACHE_TTL_SECONDS);
    return { list: listResult, records, etag };
  }

  private readColumnsForRows(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    startRow: number,
    rowCount: number,
    colIndexes: number[]
  ): { valuesByColumn: Record<number, any[]>; segmentCount: number } {
    const normalizedCols = Array.from(
      new Set(
        (Array.isArray(colIndexes) ? colIndexes : [])
          .map(col => Number(col))
          .filter(col => Number.isFinite(col) && col > 0)
      )
    ).sort((a, b) => a - b);

    const valuesByColumn: Record<number, any[]> = {};
    normalizedCols.forEach(col => {
      valuesByColumn[col] = rowCount > 0 ? new Array(rowCount).fill(undefined) : [];
    });

    if (!normalizedCols.length || rowCount <= 0) {
      return { valuesByColumn, segmentCount: 0 };
    }

    const segments: Array<{ start: number; end: number }> = [];
    let segStart = normalizedCols[0];
    let prev = normalizedCols[0];
    for (let i = 1; i < normalizedCols.length; i += 1) {
      const col = normalizedCols[i];
      if (col === prev + 1) {
        prev = col;
        continue;
      }
      segments.push({ start: segStart, end: prev });
      segStart = col;
      prev = col;
    }
    segments.push({ start: segStart, end: prev });

    segments.forEach(seg => {
      const width = seg.end - seg.start + 1;
      let rows: any[][] = [];
      try {
        rows = sheet.getRange(startRow, seg.start, rowCount, width).getValues() || [];
      } catch (_) {
        rows = [];
      }
      for (let rowIdx = 0; rowIdx < rowCount; rowIdx += 1) {
        const row = rows[rowIdx] || [];
        for (let rel = 0; rel < width; rel += 1) {
          const col = seg.start + rel;
          const column = valuesByColumn[col];
          if (!column) continue;
          column[rowIdx] = row[rel];
        }
      }
    });

    return { valuesByColumn, segmentCount: segments.length };
  }

  private asIso(value: any): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (!value) return undefined;
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (_) {
      // ignore
    }
    return value.toString();
  }

  private generateUuid(): string {
    try {
      if (typeof Utilities !== 'undefined' && (Utilities as any).getUuid) {
        return (Utilities as any).getUuid();
      }
    } catch (_) {
      // ignore
    }
    return 'uuid-' + Math.random().toString(16).slice(2);
  }
}
