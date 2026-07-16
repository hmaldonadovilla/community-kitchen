import type { QrScanSessionLaunchResult } from '../../../../types';

export type PrepareQrScannerLaunch = (args: {
  fieldId: string;
  fieldPath: string;
}) => Promise<QrScanSessionLaunchResult>;

export type QrScannerCommittedUpdate = {
  fieldId: string;
  fieldPath: string;
  recordId: string;
  fieldValue: string;
  links: string[];
  linkedCount: number;
  dataVersion?: number;
};

export type ApplyQrScannerCommittedUpdate = (update: QrScannerCommittedUpdate) => void;

export type BeginQrScannerInteraction = () => void;

export type EndQrScannerInteraction = (reason: 'settled' | 'committed' | 'cancelled' | 'closed' | 'failed') => void;

export type UpdateQrScannerPendingWork = (pendingCount: number) => void;

export type QrScannerCandidateOutcome = {
  scanId: string;
  status: 'duplicate' | 'rejected' | 'error';
  code: string;
  message: string;
};

export type ReportQrScannerCandidateOutcome = (outcome: QrScannerCandidateOutcome) => void;
