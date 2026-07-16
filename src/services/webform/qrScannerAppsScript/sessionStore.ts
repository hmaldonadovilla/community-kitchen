import { qrScannerError } from './errors';
import { QrScannerSessionStore, StoredQrScannerSession } from './types';

export const QR_SCANNER_SESSION_PROPERTY_PREFIX = 'CK_QR_SESSION_V1_';
export const MAX_QR_SCANNER_SESSION_BYTES = 8500;
export const MAX_QR_SCANNER_STORED_SESSIONS = 30;
const EXPIRED_SESSION_RETENTION_MS = 10 * 60 * 1000;
const ACTIVE_SESSION_EVICTION_GRACE_MS = 2 * 60 * 1000;
const LOCK_TIMEOUT_MS = 8000;

export interface QrScannerPropertyStore {
  getProperty(key: string): string | null;
  setProperty(key: string, value: string): void;
  deleteProperty(key: string): void;
  getProperties(): Record<string, string>;
}

export interface QrScannerScriptLock {
  tryLock(timeoutMs: number): boolean;
  releaseLock(): void;
}

interface QrScannerSessionStoreOptions {
  properties?: QrScannerPropertyStore;
  lock?: QrScannerScriptLock | null;
  nowMs?: () => number;
}

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

const defaultProperties = (): QrScannerPropertyStore => {
  if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  return PropertiesService.getScriptProperties();
};

const defaultLock = (): QrScannerScriptLock | null => {
  try {
    if (typeof LockService === 'undefined' || !(LockService as any).getScriptLock) return null;
    return (LockService as any).getScriptLock() as QrScannerScriptLock;
  } catch {
    return null;
  }
};

const parseSession = (raw: string | null): StoredQrScannerSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1 || !parsed.id) return null;
    return parsed as StoredQrScannerSession;
  } catch {
    return null;
  }
};

const sessionKey = (sessionId: string): string => `${QR_SCANNER_SESSION_PROPERTY_PREFIX}${sessionId}`;

/**
 * ScriptProperties repository. All read-modify-write operations use ScriptLock
 * because document locks are unavailable in standalone Apps Script web apps.
 */
export class AppsScriptQrScannerSessionStore implements QrScannerSessionStore {
  private readonly properties: QrScannerPropertyStore;
  private readonly lock: QrScannerScriptLock | null;
  private readonly allowLockless: boolean;
  private readonly nowMs: () => number;

  constructor(options: QrScannerSessionStoreOptions = {}) {
    this.properties = options.properties || defaultProperties();
    this.allowLockless = options.lock === null;
    this.lock = options.lock === undefined ? defaultLock() : options.lock;
    this.nowMs = options.nowMs || (() => Date.now());
  }

  create(session: StoredQrScannerSession): StoredQrScannerSession {
    return this.withLock(() => {
      const sessionProperties = this.cleanupLocked(true);
      const key = sessionKey(session.id);
      if (sessionProperties.some(entry => entry.key === key)) throw qrScannerError('INVALID_REQUEST');
      if (sessionProperties.length >= MAX_QR_SCANNER_STORED_SESSIONS) {
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      this.writeLocked(key, session);
      return this.clone(session);
    });
  }

  get(sessionId: string): StoredQrScannerSession | null {
    return this.withLock(() => {
      this.cleanupLocked();
      return this.cloneNullable(parseSession(this.properties.getProperty(sessionKey(sessionId))));
    });
  }

  mutate(
    sessionId: string,
    update: (current: StoredQrScannerSession) => StoredQrScannerSession | null
  ): StoredQrScannerSession {
    return this.withLock(() => {
      const key = sessionKey(sessionId);
      const current = parseSession(this.properties.getProperty(key));
      if (!current) throw qrScannerError('NOT_FOUND');
      const proposed = update(this.clone(current));
      if (!proposed) return this.clone(current);
      const next: StoredQrScannerSession = {
        ...proposed,
        id: current.id,
        schemaVersion: 1,
        revision: Math.max(1, Number(current.revision) || 1) + 1
      };
      this.writeLocked(key, next);
      return this.clone(next);
    });
  }

  private withLock<T>(operation: () => T): T {
    let acquired = false;
    try {
      if (!this.lock) {
        if (!this.allowLockless) throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      } else {
        if (typeof this.lock.tryLock !== 'function' || typeof this.lock.releaseLock !== 'function') {
          throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
        }
        try {
          acquired = this.lock.tryLock(LOCK_TIMEOUT_MS);
        } catch {
          throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
        }
        if (!acquired) throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      return operation();
    } finally {
      if (this.lock && acquired) {
        try {
          this.lock.releaseLock();
        } catch {
          // The operation result remains authoritative; a later invocation can acquire the expiring lock.
        }
      }
    }
  }

  private sessionPropertiesLocked(): Array<{ key: string; session: StoredQrScannerSession | null }> {
    const all = this.properties.getProperties() || {};
    return Object.keys(all)
      .filter(key => key.startsWith(QR_SCANNER_SESSION_PROPERTY_PREFIX))
      .map(key => ({ key, session: parseSession(all[key]) }));
  }

  private cleanupLocked(reclaimCapacity = false): Array<{ key: string; session: StoredQrScannerSession | null }> {
    const deleteBefore = this.nowMs() - EXPIRED_SESSION_RETENTION_MS;
    const entries = this.sessionPropertiesLocked();
    const remaining = entries.filter(entry => {
      const expiresAt = entry.session ? Date.parse(entry.session.expiresAt || '') : Number.NaN;
      if (!entry.session || !Number.isFinite(expiresAt) || expiresAt <= deleteBefore) {
        this.properties.deleteProperty(entry.key);
        return false;
      }
      return true;
    });

    if (!reclaimCapacity || remaining.length < MAX_QR_SCANNER_STORED_SESSIONS) return remaining;
    const terminal = remaining
      .filter(entry => entry.session && ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(entry.session.status))
      .sort((left, right) => Date.parse(left.session!.updatedAt) - Date.parse(right.session!.updatedAt));
    while (remaining.length >= MAX_QR_SCANNER_STORED_SESSIONS && terminal.length) {
      const evicted = terminal.shift();
      if (!evicted) break;
      this.properties.deleteProperty(evicted.key);
      const index = remaining.findIndex(entry => entry.key === evicted.key);
      if (index >= 0) remaining.splice(index, 1);
    }

    // Incremental sessions intentionally remain ACTIVE when the camera UI is
    // closed: native browser controls do not provide a reliable close signal.
    // Under global property pressure, reclaim the oldest ACTIVE session that
    // has no durable append in progress. A PENDING session is never evicted.
    const idleBefore = this.nowMs() - ACTIVE_SESSION_EVICTION_GRACE_MS;
    const idleActive = remaining
      .filter(
        entry => {
          const updatedAt = entry.session ? Date.parse(entry.session.updatedAt || '') : Number.NaN;
          return Boolean(
            entry.session?.status === 'ACTIVE' &&
            Number.isFinite(updatedAt) &&
            updatedAt <= idleBefore &&
            !entry.session.candidates.some(candidate => candidate.incremental?.state === 'PENDING')
          );
        }
      )
      .sort((left, right) => Date.parse(left.session!.updatedAt) - Date.parse(right.session!.updatedAt));
    while (remaining.length >= MAX_QR_SCANNER_STORED_SESSIONS && idleActive.length) {
      const evicted = idleActive.shift();
      if (!evicted) break;
      this.properties.deleteProperty(evicted.key);
      const index = remaining.findIndex(entry => entry.key === evicted.key);
      if (index >= 0) remaining.splice(index, 1);
    }
    return remaining;
  }

  private writeLocked(key: string, session: StoredQrScannerSession): void {
    const serialized = JSON.stringify(session);
    if (utf8ByteLength(serialized) > MAX_QR_SCANNER_SESSION_BYTES) {
      throw qrScannerError('LIMIT_REACHED');
    }
    this.properties.setProperty(key, serialized);
  }

  private clone(session: StoredQrScannerSession): StoredQrScannerSession {
    return JSON.parse(JSON.stringify(session)) as StoredQrScannerSession;
  }

  private cloneNullable(session: StoredQrScannerSession | null): StoredQrScannerSession | null {
    return session ? this.clone(session) : null;
  }
}
