const {
  ALLOWED_SCHEDULED_JOBS,
  isScheduledJobAllowed,
  schedulerSecretMatches
} = require('../cloud-run/api/domain/scheduledJobs');

describe('Cloud Run scheduled job domain', () => {
  test('authenticates scheduler requests with header or bearer secret', () => {
    const env = { CK_SCHEDULER_SECRET: 'secret' };

    expect(schedulerSecretMatches({ 'x-ck-scheduler-secret': 'secret' }, env)).toBe(true);
    expect(schedulerSecretMatches({ authorization: 'Bearer secret' }, env)).toBe(true);
    expect(schedulerSecretMatches({ authorization: 'Bearer other' }, env)).toBe(false);
    expect(schedulerSecretMatches({ 'x-ck-scheduler-secret': 'secret' }, {})).toBe(false);
  });

  test('allows only implemented scheduled RPC handlers', () => {
    expect(Array.from(ALLOWED_SCHEDULED_JOBS)).toEqual([
      'runQueuedAnalyticsPipelineJobs',
      'runDailyAnalyticsRecompute',
      'runDailyLifecycleRecompute'
    ]);
    expect(isScheduledJobAllowed('runDailyLifecycleRecompute', { runDailyLifecycleRecompute: jest.fn() })).toBe(true);
    expect(isScheduledJobAllowed('runDailyLifecycleRecompute', {})).toBe(false);
    expect(isScheduledJobAllowed('unknownJob', { unknownJob: jest.fn() })).toBe(false);
  });
});
