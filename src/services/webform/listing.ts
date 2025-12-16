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

    // Merge consecutive columns into segments to minimize Apps Script calls.
    const segments: Array<{ start: number; end: number }> = [];
    let segStart = cols[0];
    let prev = cols[0];
    for (let i = 1; i < cols.length; i += 1) {
      const col = cols[i];
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
      let values: any[] = [];
      try {
        values = sheet.getRange(rowNumber, seg.start, 1, width).getValues()[0] || [];
      } catch (_) {
        values = [];
      }
      for (let i = 0; i < width; i += 1) {
        rowValues[seg.start - 1 + i] = values[i];
      }
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
    const readColumn = (colIdx: number | undefined): any[] => {
      if (!colIdx || readCount <= 0) return new Array(readCount).fill(undefined);
      try {
        return sheet.getRange(startRow, colIdx, readCount, 1).getValues().map(r => r[0]);
      } catch (_) {
        return new Array(readCount).fill(undefined);
      }
    };

    // When we don't need full record hydration, read only the required columns to keep calls snappy.
    const data = includeRecords && readCount > 0 ? sheet.getRange(startRow, 1, readCount, headers.length).getValues() : [];
    const colValuesByKey: Record<string, any[]> = includeRecords ? {} : (() => {
      const map: Record<string, any[]> = {};
      map.__id = readColumn(columns.recordId);
      map.__createdAt = readColumn(columns.createdAt);
      map.__updatedAt = readColumn(columns.updatedAt);
      map.__status = readColumn(columns.status);
      map.__pdfUrl = readColumn(columns.pdfUrl);
      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        const colIdx = columns.fields[key];
        if (!key || !colIdx) return;
        map[key] = readColumn(colIdx);
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

    this.cacheManager.cachePut(cacheKey, { list: listResult, records });
    return { list: listResult, records, etag };
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
