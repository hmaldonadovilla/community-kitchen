import type { PaginatedResult } from '../types';

declare global {
  const google: {
    script?: {
      run?: {
        withSuccessHandler: (cb: (res: any) => void) => any;
        withFailureHandler: (cb: (err: any) => void) => any;
        fetchSubmissions?: (formKey: string, projection?: string[], pageSize?: number, pageToken?: string) => void;
      };
    };
  } | undefined;
}

export interface FetchSubmissionsOptions {
  formKey?: string;
  projection?: string[];
  pageSize?: number;
  pageToken?: string;
}

/**
  * Fetch submissions via Apps Script endpoint with pagination.
  * Falls back to empty data when google.script.run is unavailable (e.g., local preview).
  */
export async function fetchSubmissionsPage(
  opts: FetchSubmissionsOptions
): Promise<PaginatedResult<Record<string, any>>> {
  const { formKey, projection, pageSize = 10, pageToken } = opts;
  const runner = google?.script?.run;
  if (!runner || typeof runner.withSuccessHandler !== 'function') {
    return { items: [], totalCount: 0, nextPageToken: undefined };
  }

  return new Promise(resolve => {
    runner
      .withSuccessHandler((res: any) => resolve(res || { items: [], totalCount: 0 }))
      .withFailureHandler(() => resolve({ items: [], totalCount: 0 }))
      ?.fetchSubmissions?.(formKey || '', projection || undefined, pageSize, pageToken);
  });
}
