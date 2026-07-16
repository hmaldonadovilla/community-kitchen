import {
  AppsScriptQrScannerSessionStore,
  MAX_QR_SCANNER_SESSION_BYTES,
  MAX_QR_SCANNER_STORED_SESSIONS,
  QrScannerPropertyStore
} from '../../../src/services/webform/qrScannerAppsScript/sessionStore';
import { StoredQrScannerSession } from '../../../src/services/webform/qrScannerAppsScript/types';

const NOW = Date.parse('2026-07-15T10:00:00.000Z');

const makeProperties = () => {
  const values: Record<string, string> = {};
  const getProperties = jest.fn(() => ({ ...values }));
  const properties: QrScannerPropertyStore = {
    getProperty: key => values[key] ?? null,
    setProperty: (key, value) => {
      values[key] = value;
    },
    deleteProperty: key => {
      delete values[key];
    },
    getProperties
  };
  return { values, properties, getProperties };
};

const session = (id: string, overrides: Partial<StoredQrScannerSession> = {}): StoredQrScannerSession => ({
  schemaVersion: 1,
  id,
  formKey: 'Config: Receipts',
  recordId: 'REC-1',
  fieldId: 'RECEIPTS',
  fieldLabel: 'Receipts',
  displayTitle: 'Receipts',
  language: 'EN',
  expectedDataVersion: 7,
  maxFiles: 10,
  existingCount: 0,
  existingFileIds: [],
  returnUrl: 'https://script.google.com/macros/s/deployment/exec',
  status: 'ACTIVE',
  candidates: [],
  attempts: 0,
  maxAttempts: 20,
  launchTokenHash: `launch-hash-${id}`,
  launchExpiresAt: '2026-07-15T10:05:00.000Z',
  createdAt: '2026-07-15T10:00:00.000Z',
  updatedAt: '2026-07-15T10:00:00.000Z',
  expiresAt: '2026-07-15T10:15:00.000Z',
  revision: 1,
  ...overrides
});

describe('Apps Script QR scanner session store', () => {
  test('serializes every operation with ScriptLock and isolates returned values', () => {
    const { properties } = makeProperties();
    const lock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    const store = new AppsScriptQrScannerSessionStore({ properties, lock, nowMs: () => NOW });

    const created = store.create(session('one'));
    created.formKey = 'tampered';
    expect(store.get('one')?.formKey).toBe('Config: Receipts');

    const updated = store.mutate('one', current => ({ ...current, status: 'CANCELLED' }));
    expect(updated.status).toBe('CANCELLED');
    expect(updated.revision).toBe(2);
    expect(lock.tryLock).toHaveBeenCalledTimes(3);
    expect(lock.releaseLock).toHaveBeenCalledTimes(3);
  });

  test('fails retryably when ScriptLock cannot be acquired', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({
      properties,
      lock: { tryLock: () => false, releaseLock: jest.fn() },
      nowMs: () => NOW
    });
    expect(() => store.create(session('one'))).toThrow(expect.objectContaining({ code: 'TEMPORARY_ERROR' }));
  });

  test('sanitizes ScriptLock acquisition failures as retryable', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({
      properties,
      lock: {
        tryLock: () => {
          throw new Error('runtime lock failure');
        },
        releaseLock: jest.fn()
      },
      nowMs: () => NOW
    });
    expect(() => store.create(session('one'))).toThrow(
      expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
    );
  });

  test('fails closed when the production ScriptLock service is unavailable', () => {
    const previousLockService = (globalThis as any).LockService;
    delete (globalThis as any).LockService;
    try {
      const { properties } = makeProperties();
      const store = new AppsScriptQrScannerSessionStore({ properties, nowMs: () => NOW });
      expect(() => store.create(session('one'))).toThrow(
        expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
      );
    } finally {
      if (previousLockService === undefined) delete (globalThis as any).LockService;
      else (globalThis as any).LockService = previousLockService;
    }
  });

  test('enforces the per-property serialized byte limit before writing', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    const oversized = session('large', { displayTitle: 'x'.repeat(MAX_QR_SCANNER_SESSION_BYTES) });
    expect(() => store.create(oversized)).toThrow(expect.objectContaining({ code: 'LIMIT_REACHED' }));
    expect(store.get('large')).toBeNull();
  });

  test('bounds the global session count and evicts a terminal session first', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    for (let index = 0; index < MAX_QR_SCANNER_STORED_SESSIONS; index += 1) {
      store.create(session(`session-${index}`));
    }
    store.mutate('session-5', current => ({ ...current, status: 'CANCELLED' }));
    expect(store.create(session('replacement')).id).toBe('replacement');
    expect(store.get('session-5')).toBeNull();
    expect(store.get('session-0')).not.toBeNull();
  });

  test('reclaims the oldest idle ACTIVE session when native close left it non-terminal', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    for (let index = 0; index < MAX_QR_SCANNER_STORED_SESSIONS; index += 1) {
      store.create(
        session(`session-${index}`, {
          updatedAt: new Date(index === 0 ? NOW - 3 * 60 * 1000 : NOW).toISOString()
        })
      );
    }

    expect(store.create(session('replacement')).id).toBe('replacement');
    expect(store.get('session-0')).toBeNull();
    expect(store.get('session-1')).not.toBeNull();
  });

  test('does not reclaim a recently active session between scans', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    for (let index = 0; index < MAX_QR_SCANNER_STORED_SESSIONS; index += 1) {
      store.create(session(`session-${index}`, { updatedAt: new Date(NOW - 30_000).toISOString() }));
    }

    expect(() => store.create(session('overflow'))).toThrow(
      expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
    );
  });

  test('never evicts an ACTIVE session with an incremental append pending', () => {
    const { properties } = makeProperties();
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    for (let index = 0; index < MAX_QR_SCANNER_STORED_SESSIONS; index += 1) {
      store.create(
        session(`session-${index}`, {
          candidates: [
            {
              id: `candidate-${index}`,
              scanIdHash: `scan-${index}`,
              payloadHash: `payload-${index}`,
              status: 'RETRYABLE_ERROR',
              code: 'TEMPORARY_ERROR',
              retryable: true,
              incremental: { state: 'PENDING', updatedAt: new Date(NOW).toISOString() },
              checkedAt: new Date(NOW).toISOString()
            }
          ]
        })
      );
    }

    expect(() => store.create(session('overflow'))).toThrow(
      expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
    );
  });

  test('cleans malformed and long-expired values while retaining recently expired state for clear errors', () => {
    const { values, properties, getProperties } = makeProperties();
    values.CK_QR_SESSION_V1_invalid = '{bad json';
    values.CK_QR_SESSION_V1_old = JSON.stringify(
      session('old', { status: 'EXPIRED', expiresAt: '2026-07-15T09:40:00.000Z' })
    );
    values.CK_QR_SESSION_V1_recent = JSON.stringify(
      session('recent', { status: 'EXPIRED', expiresAt: '2026-07-15T09:55:00.000Z' })
    );
    const store = new AppsScriptQrScannerSessionStore({ properties, lock: null, nowMs: () => NOW });
    store.create(session('new'));

    expect(getProperties).toHaveBeenCalledTimes(1);
    expect(values.CK_QR_SESSION_V1_invalid).toBeUndefined();
    expect(values.CK_QR_SESSION_V1_old).toBeUndefined();
    expect(store.get('recent')).not.toBeNull();
  });
});
