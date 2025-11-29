import { PaginatedResult } from '../types';

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
  const runner = (typeof google !== 'undefined' && google.script && google.script.run) ? google.script.run : null;
  if (!runner || typeof runner.withSuccessHandler !== 'function') {
    return { items: [], totalCount: 0, nextPageToken: undefined };
  }

  return new Promise(resolve => {
    try {
      runner
        .withSuccessHandler((res: any) => resolve(res || { items: [], totalCount: 0 }))
        .withFailureHandler(() => resolve({ items: [], totalCount: 0 }))
        .fetchSubmissions(formKey || '', projection || undefined, pageSize, pageToken);
    } catch (_) {
      resolve({ items: [], totalCount: 0 });
    }
  });
}
