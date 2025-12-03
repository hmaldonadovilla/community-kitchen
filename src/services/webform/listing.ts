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

export class ListingService {
  private submissionService: SubmissionService;
  private cacheManager: CacheEtagManager;

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
    const result = this.fetchSubmissionsPageInternal(form, questions, projection, pageSize, pageToken);
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
    const page = this.fetchSubmissionsPageInternal(form, questions, projection, pageSize, pageToken);
    const records: Record<string, WebFormSubmission> = includePageRecords ? { ...page.records } : {};
    if (recordIds && recordIds.length) {
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
    const { sheet, headers, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const cached = this.cacheManager.getCachedRecord(form.configSheet, etag, id);
    if (cached) return cached;
    if (!columns.recordId) return null;
    const rows = sheet.getRange(2, columns.recordId, Math.max(0, sheet.getLastRow() - 1), 1).getValues();
    const matchIndex = rows.findIndex(r => (r[0] || '').toString() === id);
    if (matchIndex < 0) return null;
    const rowNumber = 2 + matchIndex;
    const data = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const record = this.submissionService.buildSubmissionRecord(form.configSheet, questions, columns, data, id);
    if (record) {
      this.cacheManager.cacheRecord(form.configSheet, etag, record);
    }
    return record;
  }

  private fetchSubmissionsPageInternal(
    form: FormConfig,
    questions: QuestionConfig[],
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string
  ): ListPageResult {
    const { sheet, headers, columns } = this.submissionService.ensureDestination(
      form.destinationTab || `${form.title} Responses`,
      questions
    );
    const etag = this.cacheManager.getSheetEtag(sheet, columns);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    const size = Math.max(1, Math.min(pageSize || 10, 10));
    const offset = decodePageToken(pageToken);
    if (offset >= cappedTotal) {
      const emptyList: PaginatedResult<Record<string, any>> = { items: [], totalCount: cappedTotal };
      return { list: emptyList, records: {}, etag };
    }

    const fieldIds = (projection && projection.length) ? projection : questions.map(q => q.id);
    const cacheKey = this.cacheManager.makeListCacheKey(form.configSheet, etag, fieldIds, size, pageToken);
    const cached = this.cacheManager.cacheGet<ListPageResult>(cacheKey);
    if (cached) {
      return { list: cached.list, records: cached.records || {}, etag };
    }

    const readCount = Math.min(size, cappedTotal - offset);
    const data = readCount > 0 ? sheet.getRange(2 + offset, 1, readCount, headers.length).getValues() : [];
    const records: Record<string, WebFormSubmission> = {};
    const items = data.map(row => {
      const item: Record<string, any> = {};
      const rowIdValue = columns.recordId ? row[columns.recordId - 1] : '';
      const rowId = rowIdValue ? rowIdValue.toString() : '';
      item.id = rowId;
      item.createdAt = columns.createdAt ? this.asIso(row[columns.createdAt - 1]) : undefined;
      item.updatedAt = columns.updatedAt ? this.asIso(row[columns.updatedAt - 1]) : undefined;
      item.status = columns.status ? row[columns.status - 1] : undefined;
      item.pdfUrl = columns.pdfUrl ? row[columns.pdfUrl - 1] : undefined;
      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        const colIdx = columns.fields[key];
        if (!colIdx) return;
        item[key] = row[colIdx - 1];
      });
      if (rowId) {
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
      totalCount: cappedTotal
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
}
