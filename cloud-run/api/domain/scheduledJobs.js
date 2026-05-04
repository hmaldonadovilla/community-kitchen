/**
 * Owns Cloud Run scheduled job auth and allowlist checks.
 */
const ALLOWED_SCHEDULED_JOBS = new Set([
  'runQueuedAnalyticsPipelineJobs',
  'runDailyAnalyticsRecompute',
  'runDailyLifecycleRecompute'
]);

const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const schedulerSecretMatches = (headers = {}, env = process.env) => {
  const configured = toText(env.CK_SCHEDULER_SECRET);
  if (!configured) return false;
  const headerSecret = toText(headers['x-ck-scheduler-secret']);
  if (headerSecret && headerSecret === configured) return true;
  const auth = toText(headers.authorization);
  return auth === `Bearer ${configured}`;
};

const isScheduledJobAllowed = (jobName, rpcHandlers = {}) =>
  ALLOWED_SCHEDULED_JOBS.has(toText(jobName)) && typeof rpcHandlers[toText(jobName)] === 'function';

module.exports = {
  ALLOWED_SCHEDULED_JOBS,
  schedulerSecretMatches,
  isScheduledJobAllowed
};
