import {
  areReportFollowupActions,
  isReportFollowupAction,
  resolveOptimisticStatusTransitionForActions
} from '../../../src/web/react/app/followupParallel';

describe('followupParallel', () => {
  test('identifies report follow-up actions that can rely on server-side record lookups', () => {
    expect(isReportFollowupAction('create_pdf')).toBe(true);
    expect(areReportFollowupActions(['CREATE_PDF', 'SEND_EMAIL'])).toBe(true);
    expect(areReportFollowupActions(['CLOSE_RECORD', 'CREATE_PDF'])).toBe(false);
    expect(areReportFollowupActions([])).toBe(false);
  });

  test('optimistically shows pdf-created while email is only queued', () => {
    expect(resolveOptimisticStatusTransitionForActions(['CREATE_PDF', 'SEND_EMAIL'])).toBe('onPdf');
    expect(resolveOptimisticStatusTransitionForActions(['SEND_EMAIL'])).toBe('onEmail');
    expect(resolveOptimisticStatusTransitionForActions(['CLOSE_RECORD', 'SEND_EMAIL'])).toBe('onClose');
  });
});
