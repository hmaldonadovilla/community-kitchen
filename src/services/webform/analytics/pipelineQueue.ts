import { normalizeToIsoDate } from '../followup/utils';

/**
 * Owns pure queue/request helpers for Analytics pipeline export jobs.
 */
export const DEFAULT_ANALYTICS_PIPELINE_NOTICE = 'The report has been queued. The spreadsheet will be sent by email.';

export interface AnalyticsPipelineRunRequestLike {
  ownerFormKey?: unknown;
  pipelineId?: unknown;
  startDate?: unknown;
}

export interface NormalizedAnalyticsPipelineRunRequest {
  ownerFormKey: string;
  pipelineId: string;
  startDate: string;
}

export interface AnalyticsPipelineJob {
  id: string;
  ownerFormKey: string;
  pipelineId: string;
  startDate: string;
  queuedAt: string;
}

const toText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const resolveDisplayText = (value: unknown, fallback = ''): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value !== 'object') return toText(value) || fallback;
  const record = value as Record<string, unknown>;
  return (
    toText(record.en) ||
    toText(record.EN) ||
    toText(record.fr) ||
    toText(record.FR) ||
    toText(record.nl) ||
    toText(record.NL) ||
    Object.keys(record)
      .map(key => toText(record[key]))
      .find(Boolean) ||
    fallback
  );
};

export const normalizeAnalyticsPipelineRunRequest = (
  request: AnalyticsPipelineRunRequestLike | null | undefined
): NormalizedAnalyticsPipelineRunRequest => ({
  ownerFormKey: toText(request?.ownerFormKey),
  pipelineId: toText(request?.pipelineId),
  startDate: normalizeToIsoDate(request?.startDate) || ''
});

export const validateAnalyticsPipelineRunRequest = (
  request: NormalizedAnalyticsPipelineRunRequest,
  todayIso: string
): string => {
  if (!request.ownerFormKey || !request.pipelineId || !request.startDate) return 'Invalid analytics pipeline request.';
  if (request.startDate > todayIso) return 'The selected date must be today or earlier.';
  return '';
};

export const resolveAnalyticsPipelineQueuedNotice = (
  pipeline: { ui?: { queuedNotice?: unknown } } | null | undefined,
  fallback = DEFAULT_ANALYTICS_PIPELINE_NOTICE
): string => resolveDisplayText(pipeline?.ui?.queuedNotice, fallback);

export const buildAnalyticsPipelineJob = (args: {
  id: string;
  request: NormalizedAnalyticsPipelineRunRequest;
  queuedAt: string;
}): AnalyticsPipelineJob => ({
  id: toText(args.id),
  ownerFormKey: args.request.ownerFormKey,
  pipelineId: args.request.pipelineId,
  startDate: args.request.startDate,
  queuedAt: toText(args.queuedAt)
});

export const parseAnalyticsPipelineQueue = (raw: unknown, fallbackQueuedAt?: string): AnalyticsPipelineJob[] => {
  const text = toText(raw);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const queuedAtFallback = toText(fallbackQueuedAt) || new Date().toISOString();
    return parsed
      .map(entry => {
        const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
        const id = toText(item.id);
        const request = normalizeAnalyticsPipelineRunRequest({
          ownerFormKey: item.ownerFormKey,
          pipelineId: item.pipelineId,
          startDate: item.startDate
        });
        if (!id || !request.ownerFormKey || !request.pipelineId || !request.startDate) return null;
        return buildAnalyticsPipelineJob({
          id,
          request,
          queuedAt: toText(item.queuedAt) || queuedAtFallback
        });
      })
      .filter(Boolean) as AnalyticsPipelineJob[];
  } catch {
    return [];
  }
};

export const serializeAnalyticsPipelineQueue = (queue: AnalyticsPipelineJob[]): string => JSON.stringify(Array.isArray(queue) ? queue : []);

export const formatAnalyticsPipelineJobError = (job: Pick<AnalyticsPipelineJob, 'ownerFormKey' | 'pipelineId'>, message: unknown): string =>
  `${toText(job.ownerFormKey)}/${toText(job.pipelineId)}: ${toText(message) || 'Unknown analytics pipeline error'}`;
