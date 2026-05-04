const {
  buildFollowupBatchFailureResult,
  buildSkippedFollowupActionResults,
  isFollowupBatchSuccess,
  normalizeFollowupAction,
  normalizeFollowupActions
} = require('../cloud-run/api/domain/followupActionPlan');

describe('Cloud Run follow-up action plan domain', () => {
  test('matches Apps Script follow-up action planning behavior', () => {
    expect(normalizeFollowupAction(' send_email ')).toBe('SEND_EMAIL');
    expect(normalizeFollowupActions([' CREATE_PDF ', '', null, 'SEND_EMAIL'])).toEqual(['CREATE_PDF', 'SEND_EMAIL']);
    expect(buildFollowupBatchFailureResult([], 'No actions')).toEqual({
      success: false,
      results: [{ action: '', result: { success: false, message: 'No actions' } }]
    });
    expect(buildSkippedFollowupActionResults(['CREATE_PDF', 'SEND_EMAIL'], 0, 'CREATE_PDF')).toEqual([
      { action: 'SEND_EMAIL', result: { success: false, message: 'Skipped because CREATE_PDF failed.' } }
    ]);
    expect(isFollowupBatchSuccess([{ result: { success: true } }])).toBe(true);
  });
});
