import {
  buildFollowupBatchFailureResult,
  buildSkippedFollowupActionResults,
  isFollowupBatchSuccess,
  normalizeFollowupAction,
  normalizeFollowupActions
} from '../../../src/services/webform/followup/actionPlan';

describe('follow-up action plan domain', () => {
  test('normalizes batch actions without changing returned action labels', () => {
    expect(normalizeFollowupAction(' send_email ')).toBe('SEND_EMAIL');
    expect(normalizeFollowupActions([' CREATE_PDF ', '', null, 'SEND_EMAIL'])).toEqual(['CREATE_PDF', 'SEND_EMAIL']);
  });

  test('builds failure results for empty and populated batches', () => {
    expect(buildFollowupBatchFailureResult([], 'No actions')).toEqual({
      success: false,
      results: [{ action: '', result: { success: false, message: 'No actions' } }]
    });
    expect(buildFollowupBatchFailureResult(['CREATE_PDF', 'SEND_EMAIL'], 'Record ID is required.').results).toEqual([
      { action: 'CREATE_PDF', result: { success: false, message: 'Record ID is required.' } },
      { action: 'SEND_EMAIL', result: { success: false, message: 'Record ID is required.' } }
    ]);
  });

  test('builds skipped results after the failed action and resolves batch success', () => {
    expect(buildSkippedFollowupActionResults(['CREATE_PDF', 'SEND_EMAIL', 'CLOSE_RECORD'], 0, 'CREATE_PDF')).toEqual([
      { action: 'SEND_EMAIL', result: { success: false, message: 'Skipped because CREATE_PDF failed.' } },
      { action: 'CLOSE_RECORD', result: { success: false, message: 'Skipped because CREATE_PDF failed.' } }
    ]);
    expect(isFollowupBatchSuccess([{ result: { success: true } }, { result: { success: true } }])).toBe(true);
    expect(isFollowupBatchSuccess([{ result: { success: true } }, { result: { success: false } }])).toBe(false);
  });

});
