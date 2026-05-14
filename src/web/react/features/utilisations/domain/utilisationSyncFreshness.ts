export type GuidedUtilisationSyncFreshness = {
  recordId: string;
  stepId?: string | null;
  dataSourceIds: string[];
  updatedRows: number;
  availabilityCount: number;
  completedAtMs: number;
  source?: string;
};

export type GuidedUtilisationSyncWaitResult = {
  ok: boolean;
  message?: string;
  waitedForSync?: boolean;
  freshness?: GuidedUtilisationSyncFreshness | null;
};

const normalize = (value: unknown): string => `${value ?? ''}`.trim();

const normalizeComparison = (value: unknown): string => normalize(value).toLowerCase();

export const shouldUseUtilisationSyncFreshnessForDataSource = (args: {
  freshness?: GuidedUtilisationSyncFreshness | null;
  recordId?: string | null;
  stepId?: string | null;
  dataSource?: any;
  cachedDataSource?: unknown;
}): boolean => {
  const freshness = args.freshness;
  if (!freshness || !args.cachedDataSource) return false;
  if (Number(freshness.updatedRows || 0) <= 0) return false;
  if (Number(freshness.availabilityCount || 0) <= 0) return false;

  const expectedRecordId = normalize(args.recordId);
  if (expectedRecordId && normalize(freshness.recordId) !== expectedRecordId) return false;

  const expectedStepId = normalize(args.stepId);
  if (expectedStepId && normalize(freshness.stepId) && normalize(freshness.stepId) !== expectedStepId) {
    return false;
  }

  const dataSourceId = normalizeComparison(args.dataSource?.id || 'default');
  if (!dataSourceId) return false;
  const freshnessIds = new Set((freshness.dataSourceIds || []).map(normalizeComparison).filter(Boolean));
  return freshnessIds.has(dataSourceId);
};

export const shouldRefreshDataSourcesAfterUtilisationPlan = (args: {
  availabilityCount?: number | null;
  updatedRows?: number | null;
  utilisationsReleased?: number | null;
}): boolean => {
  const availabilityCount = Number(args.availabilityCount || 0);
  const updatedRows = Number(args.updatedRows || 0);
  if (availabilityCount > 0) return updatedRows <= 0;
  return Number(args.utilisationsReleased || 0) > 0;
};
