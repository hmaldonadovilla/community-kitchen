import { getGeneratedReactAssetBaseUrl } from '../bundles';
import { debugLog } from '../debug';
import { QrScannerFileAuthorizationService } from './authorization';
import { createAppsScriptQrScannerCrypto } from './crypto';
import { AppsScriptQrScannerDriveRepository } from './driveRepository';
import { toQrScannerRpcFailure } from './errors';
import { AppsScriptQrScannerService } from './service';
import { AppsScriptQrScannerSessionStore } from './sessionStore';
import {
  QrScannerAuthoritativeService,
  QrScannerCrypto,
  QrScannerDriveRepository,
  QrScannerRpcEnvelope,
  QrScannerRuntime,
  QrScannerSessionStore
} from './types';

export type QrScannerSessionMethod =
  | 'qrScanner.redeem'
  | 'qrScanner.getSession'
  | 'qrScanner.addCandidate'
  | 'qrScanner.commit'
  | 'qrScanner.cancel';

export interface QrScannerSessionRequest {
  method: QrScannerSessionMethod;
  params: Record<string, unknown>;
}

export interface QrScannerServiceDependencies {
  sessions?: QrScannerSessionStore;
  driveRepository?: QrScannerDriveRepository;
  crypto?: QrScannerCrypto;
  runtime?: QrScannerRuntime;
}

export const createDefaultQrScannerRuntime = (): QrScannerRuntime => ({
  now: () => new Date(),
  getScriptProperty: (key: string): string | null => {
    try {
      if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) return null;
      return PropertiesService.getScriptProperties().getProperty(key);
    } catch {
      return null;
    }
  },
  getServiceUrl: (): string => {
    try {
      if (typeof ScriptApp === 'undefined' || !(ScriptApp as any).getService) return '';
      return ((ScriptApp as any).getService()?.getUrl?.() || '').toString().trim();
    } catch {
      return '';
    }
  },
  getGeneratedAssetBaseUrl: (): string => getGeneratedReactAssetBaseUrl()
});

export const createAppsScriptQrScannerService = (
  authoritative: QrScannerAuthoritativeService,
  dependencies: QrScannerServiceDependencies = {}
): AppsScriptQrScannerService => {
  const driveRepository = dependencies.driveRepository || new AppsScriptQrScannerDriveRepository();
  return new AppsScriptQrScannerService(
    authoritative,
    dependencies.sessions || new AppsScriptQrScannerSessionStore(),
    new QrScannerFileAuthorizationService(driveRepository),
    dependencies.crypto || createAppsScriptQrScannerCrypto(),
    dependencies.runtime || createDefaultQrScannerRuntime()
  );
};

const normalizeSessionRequest = (request: unknown): QrScannerSessionRequest | null => {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
  const source = request as Record<string, unknown>;
  const allowed = new Set<QrScannerSessionMethod>([
    'qrScanner.redeem',
    'qrScanner.getSession',
    'qrScanner.addCandidate',
    'qrScanner.commit',
    'qrScanner.cancel'
  ]);
  if (typeof source.method !== 'string' || !allowed.has(source.method as QrScannerSessionMethod)) return null;
  if (!source.params || typeof source.params !== 'object' || Array.isArray(source.params)) return null;
  return { method: source.method as QrScannerSessionMethod, params: source.params as Record<string, unknown> };
};

/** Creates the whitelisted Apps Script RPC dispatcher used by the retained origin tab. */
export const createQrScannerSessionDispatcher = (
  authoritative: QrScannerAuthoritativeService,
  dependencies: QrScannerServiceDependencies = {}
) => (request: unknown): QrScannerRpcEnvelope<unknown> => {
  const normalized = normalizeSessionRequest(request);
  if (!normalized) return toQrScannerRpcFailure({ code: 'INVALID_REQUEST', retryable: false });
  try {
    const service = createAppsScriptQrScannerService(authoritative, dependencies);
    let result: unknown;
    switch (normalized.method) {
      case 'qrScanner.redeem':
        result = service.redeem(normalized.params as any);
        break;
      case 'qrScanner.getSession':
        result = service.getSession(normalized.params as any);
        break;
      case 'qrScanner.addCandidate':
        result = service.addCandidate(normalized.params as any);
        break;
      case 'qrScanner.commit':
        result = service.commit(normalized.params as any);
        break;
      case 'qrScanner.cancel':
        result = service.cancel(normalized.params as any);
        break;
      default:
        return toQrScannerRpcFailure({ code: 'INVALID_REQUEST', retryable: false });
    }
    return { ok: true, result };
  } catch (error) {
    const failure = toQrScannerRpcFailure(error);
    debugLog('qrScanner.appsScript.rpc.failed', {
      method: normalized.method,
      code: failure.ok ? 'INTERNAL_ERROR' : failure.error.code,
      retryable: failure.ok ? false : failure.error.retryable
    });
    return failure;
  }
};
