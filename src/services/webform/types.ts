import { PaginatedResult, WebFormSubmission } from '../../types';

export interface HeaderColumns {
  timestamp?: number;
  language?: number;
  recordId?: number;
  createdAt?: number;
  updatedAt?: number;
  status?: number;
  pdfUrl?: number;
  fields: Record<string, number>;
}

export interface CachedListPage {
  list: PaginatedResult<Record<string, any>>;
  records: Record<string, WebFormSubmission>;
}

export interface ListPageResult extends CachedListPage {
  etag: string;
}

export interface RecordContext {
  sheet: GoogleAppsScript.Spreadsheet.Sheet;
  headers: string[];
  columns: HeaderColumns;
  rowIndex: number;
  rowValues: any[];
  record: WebFormSubmission | null;
}
