import { PaginatedResult, WebFormSubmission } from '../../types';
import { DataSourceConfig, FollowupActionResult, WebFormDefinition } from '../../types';
import { LangCode } from '../types';

declare const google: any;

export interface SubmissionPayload {
  formKey: string;
  language: LangCode;
  values: Record<string, any>;
  id?: string;
  [fieldId: string]: any;
}

export interface SubmissionResult {
  success: boolean;
  message?: string;
  meta?: { id?: string; createdAt?: string; updatedAt?: string };
}

export interface ListItem {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  pdfUrl?: string;
  [fieldId: string]: any;
}

export interface ListResponse extends PaginatedResult<ListItem> {
  etag?: string;
}

export interface BatchResponse {
  list: ListResponse;
  records: Record<string, WebFormSubmission>;
}

export interface DataSourceRequest {
  source: DataSourceConfig;
  locale?: LangCode;
  projection?: string[];
  limit?: number;
  pageToken?: string;
}

export interface DataSourceResponse {
  items: any[];
  nextPageToken?: string;
  totalCount?: number;
}

type Runner = typeof google.script.run;

const getRunner = (): Runner | null => {
  const runner = google?.script?.run;
  return runner && typeof runner.withSuccessHandler === 'function' ? runner : null;
};

const runAppsScript = <T,>(fnName: string, ...args: any[]): Promise<T> => {
  return new Promise((resolve, reject) => {
    const runner = getRunner();
    if (!runner) {
      reject(new Error('google.script.run is unavailable.'));
      return;
    }
    try {
      runner
        .withSuccessHandler((res: T) => resolve(res))
        .withFailureHandler((err: any) =>
          reject(err?.message ? new Error(err.message) : err || new Error('Request failed'))
        )[fnName](...args);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Request failed'));
    }
  });
};

export const submit = (payload: SubmissionPayload): Promise<SubmissionResult> =>
  runAppsScript<SubmissionResult>('saveSubmissionWithId', payload);

export const fetchList = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string
): Promise<ListResponse> => runAppsScript<ListResponse>('fetchSubmissions', formKey, projection, pageSize, pageToken);

export const fetchBatch = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[]
): Promise<BatchResponse> =>
  runAppsScript<BatchResponse>('fetchSubmissionsBatch', formKey, projection, pageSize, pageToken, includePageRecords, recordIds);

export const fetchDataSourceApi = (req: DataSourceRequest): Promise<DataSourceResponse> =>
  runAppsScript<DataSourceResponse>('fetchDataSource', req.source, req.locale, req.projection, req.limit, req.pageToken);

export const triggerFollowup = (
  formKey: string,
  recordId: string,
  action: string
): Promise<FollowupActionResult> => runAppsScript<FollowupActionResult>('triggerFollowupAction', formKey, recordId, action);

export interface BootstrapContext {
  definition: WebFormDefinition;
  formKey: string;
  record?: WebFormSubmission;
}
