/**
 * Owns pure planning helpers for Cloud Run follow-up action batches.
 */
const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeFollowupAction = action => toText(action).toUpperCase();

const normalizeFollowupActions = actions =>
  (Array.isArray(actions) ? actions : [])
    .map(entry => toText(entry))
    .filter(Boolean);

const buildFollowupBatchFailureResult = (actions, message) => {
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

const buildSkippedFollowupActionResults = (actions, failedIndex, failedAction) =>
  (Array.isArray(actions) ? actions : []).slice(failedIndex + 1).map(action => ({
    action,
    result: {
      success: false,
      message: `Skipped because ${toText(failedAction)} failed.`
    }
  }));

const isFollowupBatchSuccess = results =>
  Array.isArray(results) && results.length > 0 && results.every(entry => !!entry.result && !!entry.result.success);

module.exports = {
  normalizeFollowupAction,
  normalizeFollowupActions,
  buildFollowupBatchFailureResult,
  buildSkippedFollowupActionResults,
  isFollowupBatchSuccess
};
