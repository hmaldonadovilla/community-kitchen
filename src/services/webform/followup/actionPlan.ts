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

export type ParallelReconcileFollowupPlan = {
  actions: string[];
  reconcileAction: string;
  createPdfAction: string;
  sendEmailAction?: string;
};

export const resolveParallelReconcileFollowupPlan = (actions: unknown): ParallelReconcileFollowupPlan | null => {
  const normalizedActions = normalizeFollowupActions(actions);
  if (normalizedActions.length < 2) return null;
  const normalized = normalizedActions.map(normalizeFollowupAction);
  const reconcileIndexes = normalized
    .map((action, index) => (action === 'RECONCILE_RESERVATIONS' ? index : -1))
    .filter(index => index >= 0);
  if (reconcileIndexes.length !== 1 || reconcileIndexes[0] !== 0) return null;
  if (normalized.includes('CLOSE_RECORD')) return null;
  const createPdfIndex = normalized.indexOf('CREATE_PDF');
  if (createPdfIndex < 1) return null;
  const sendEmailIndex = normalized.indexOf('SEND_EMAIL');
  const supported = normalized.every(
    action => action === 'RECONCILE_RESERVATIONS' || action === 'CREATE_PDF' || action === 'SEND_EMAIL'
  );
  if (!supported) return null;
  if (normalized.filter(action => action === 'CREATE_PDF').length !== 1) return null;
  if (normalized.filter(action => action === 'SEND_EMAIL').length > 1) return null;
  if (sendEmailIndex >= 0 && sendEmailIndex < createPdfIndex) return null;
  return {
    actions: normalizedActions,
    reconcileAction: normalizedActions[reconcileIndexes[0]],
    createPdfAction: normalizedActions[createPdfIndex],
    sendEmailAction: sendEmailIndex >= 0 ? normalizedActions[sendEmailIndex] : undefined
  };
};
