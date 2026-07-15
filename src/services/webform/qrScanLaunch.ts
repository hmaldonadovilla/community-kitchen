import {
  QrScanSessionLaunchRequest,
  QrScanSessionLaunchResult,
  QrScanSessionReturnContext
} from '../../types';
import {
  createAppsScriptQrScannerService,
  QrScannerServiceDependencies
} from './qrScannerAppsScript/facade';
import { QrScannerAuthoritativeService } from './qrScannerAppsScript/types';

type NormalizedLaunchRequest = {
  formKey: string;
  recordId: string;
  fieldId: string;
  expectedDataVersion?: number;
  language?: 'EN' | 'FR' | 'NL';
  returnContext?: QrScanSessionReturnContext;
};

const launchFailure = (): Extract<QrScanSessionLaunchResult, { success: false }> => ({
  success: false,
  code: 'INVALID_REQUEST',
  message: 'The scanner request is incomplete or invalid.'
});

const normalizeIdentifier = (value: unknown, maxLength = 256): string => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return '';
  if (Array.from(normalized).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return '';
  return normalized;
};

const normalizeReturnContext = (value: unknown): { valid: boolean; value?: QrScanSessionReturnContext } => {
  if (value === undefined || value === null) return { valid: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false };
  const source = value as Record<string, unknown>;
  const context: QrScanSessionReturnContext = {};
  for (const key of ['app', 'page', 'stepId'] as const) {
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    const normalized = normalizeIdentifier(source[key], 80);
    if (!normalized || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) return { valid: false };
    context[key] = normalized;
  }
  if (source.overlay !== undefined && source.overlay !== null && source.overlay !== '') {
    if (source.overlay !== 'files') return { valid: false };
    context.overlay = 'files';
  }
  return { valid: true, ...(Object.keys(context).length ? { value: context } : {}) };
};

export const validateQrScanSessionLaunchRequest = (
  request: unknown
): { request?: NormalizedLaunchRequest; error?: QrScanSessionLaunchResult } => {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { error: launchFailure() };
  const source = request as Record<string, unknown>;
  const formKey = normalizeIdentifier(source.formKey);
  const recordId = normalizeIdentifier(source.recordId);
  const fieldId = normalizeIdentifier(source.fieldId);
  if (!formKey || !recordId || !fieldId) return { error: launchFailure() };

  let expectedDataVersion: number | undefined;
  if (source.expectedDataVersion !== undefined && source.expectedDataVersion !== null) {
    if (!Number.isSafeInteger(source.expectedDataVersion) || Number(source.expectedDataVersion) < 1) {
      return { error: launchFailure() };
    }
    expectedDataVersion = Number(source.expectedDataVersion);
  }

  let language: 'EN' | 'FR' | 'NL' | undefined;
  if (source.language !== undefined && source.language !== null && source.language !== '') {
    const normalized = typeof source.language === 'string' ? source.language.trim().toUpperCase() : '';
    if (normalized !== 'EN' && normalized !== 'FR' && normalized !== 'NL') return { error: launchFailure() };
    language = normalized;
  }
  const context = normalizeReturnContext(source.returnContext);
  if (!context.valid) return { error: launchFailure() };

  return {
    request: {
      formKey,
      recordId,
      fieldId,
      ...(expectedDataVersion ? { expectedDataVersion } : {}),
      ...(language ? { language } : {}),
      ...(context.value ? { returnContext: context.value } : {})
    }
  };
};

/** Creates a billing-free QR session entirely inside Apps Script. */
export const prepareQrScanSessionLaunch = (
  service: QrScannerAuthoritativeService,
  request: QrScanSessionLaunchRequest,
  dependencies: QrScannerServiceDependencies = {}
): QrScanSessionLaunchResult => {
  const validated = validateQrScanSessionLaunchRequest(request);
  if (!validated.request) return validated.error || launchFailure();
  return createAppsScriptQrScannerService(service, dependencies).createLaunch(validated.request);
};
