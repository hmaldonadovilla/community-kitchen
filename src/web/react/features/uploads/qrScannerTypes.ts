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

export type EndQrScannerInteraction = (reason: 'committed' | 'cancelled' | 'closed' | 'failed') => void;
