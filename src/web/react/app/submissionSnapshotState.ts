import type { WebFormSubmission } from '../../types';

export const buildSuccessfulSubmissionSnapshot = (args: {
  currentSnapshot: WebFormSubmission | null | undefined;
  recordId: string;
  values?: Record<string, unknown>;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pdfUrl?: string;
  dataVersion?: number;
  rowNumber?: number;
}): WebFormSubmission | null => {
  const current = args.currentSnapshot;
  const recordId = (args.recordId || '').toString().trim();
  if (!current || !recordId) return null;
  if (current.id && current.id !== recordId) return null;
  const hasValues = !!args.values && Object.keys(args.values).length > 0;
  return {
    ...current,
    id: recordId,
    createdAt: args.createdAt || current.createdAt,
    updatedAt: args.updatedAt || current.updatedAt,
    status: args.status || current.status,
    pdfUrl: args.pdfUrl || current.pdfUrl,
    dataVersion: Number.isFinite(args.dataVersion) ? args.dataVersion : (current as any).dataVersion,
    __rowNumber: Number.isFinite(args.rowNumber) ? args.rowNumber : (current as any).__rowNumber,
    values: hasValues ? { ...(current.values || {}), ...(args.values || {}) } : current.values
  } as WebFormSubmission;
};
