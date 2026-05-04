import { FollowupActionResult } from '../../../types';

/**
 * Owns pure planning helpers for follow-up action batches.
 */
export type FollowupBatchResult = {
  success: boolean;
  results: Array<{ action: string; result: FollowupActionResult }>;
};

const toText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

export const normalizeFollowupAction = (action: unknown): string => toText(action).toUpperCase();

export const normalizeFollowupActions = (actions: unknown): string[] =>
  (Array.isArray(actions) ? actions : [])
    .map(entry => toText(entry))
    .filter(Boolean);

export const buildFollowupBatchFailureResult = (actions: string[], message: string): FollowupBatchResult => {
  const normalizedMessage = toText(message) || 'Failed to run follow-up actions.';
  const effectiveActions = Array.isArray(actions) && actions.length ? actions : [''];
  return {
    success: false,
    results: effectiveActions.map(action => ({
      action,
      result: {
        success: false,
        message: normalizedMessage
      }
    }))
  };
};

export const buildSkippedFollowupActionResults = (
  actions: string[],
  failedIndex: number,
  failedAction: string
): Array<{ action: string; result: FollowupActionResult }> => {
  const normalizedFailedAction = toText(failedAction);
  return (Array.isArray(actions) ? actions : []).slice(failedIndex + 1).map(action => ({
    action,
    result: {
      success: false,
      message: `Skipped because ${normalizedFailedAction} failed.`
    }
  }));
};

export const isFollowupBatchSuccess = (results: Array<{ result?: FollowupActionResult | null }>): boolean =>
  Array.isArray(results) && results.length > 0 && results.every(entry => !!entry.result?.success);
