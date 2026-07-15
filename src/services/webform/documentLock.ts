const EXECUTION_DOCUMENT_LOCK_STATE_KEY = '__CK_EXECUTION_DOCUMENT_LOCK_STATE__';

type ExecutionDocumentLockState = {
  depth: number;
};

type SharedDocumentLock = {
  tryLock?: (timeoutMs: number) => boolean;
  waitLock?: (timeoutMs: number) => void;
  releaseLock: () => void;
};

export type SharedDocumentLockOptions = {
  /** Explicit test injection. Passing null is the only supported lockless mode. */
  lock?: SharedDocumentLock | null;
};

export const DOCUMENT_LOCK_BUSY_MESSAGE = 'Could not acquire the record save lock. Please retry.';

const getExecutionDocumentLockState = (): ExecutionDocumentLockState => {
  const root = globalThis as typeof globalThis & {
    [EXECUTION_DOCUMENT_LOCK_STATE_KEY]?: ExecutionDocumentLockState;
  };
  const existing = root[EXECUTION_DOCUMENT_LOCK_STATE_KEY];
  if (existing && typeof existing === 'object' && Number.isFinite(Number(existing.depth))) {
    return existing;
  }
  const next: ExecutionDocumentLockState = { depth: 0 };
  root[EXECUTION_DOCUMENT_LOCK_STATE_KEY] = next;
  return next;
};

export const withSharedDocumentLock = <T>(
  _label: string,
  timeoutMs: number,
  fn: () => T,
  busyMessage = DOCUMENT_LOCK_BUSY_MESSAGE,
  options: SharedDocumentLockOptions = {}
): T => {
  const state = getExecutionDocumentLockState();
  if (state.depth > 0) {
    state.depth += 1;
    try {
      return fn();
    } finally {
      state.depth = Math.max(0, state.depth - 1);
    }
  }

  const resolveRuntimeLock = (): SharedDocumentLock | null => {
    try {
      if (typeof LockService === 'undefined') return null;
      const documentLock = (LockService as any).getDocumentLock
        ? (LockService as any).getDocumentLock()
        : null;
      if (
        documentLock &&
        typeof documentLock.releaseLock === 'function' &&
        (typeof documentLock.tryLock === 'function' || typeof documentLock.waitLock === 'function')
      ) {
        return documentLock;
      }
      const scriptLock = (LockService as any).getScriptLock ? (LockService as any).getScriptLock() : null;
      if (
        scriptLock &&
        typeof scriptLock.releaseLock === 'function' &&
        (typeof scriptLock.tryLock === 'function' || typeof scriptLock.waitLock === 'function')
      ) {
        return scriptLock;
      }
      return null;
    } catch {
      return null;
    }
  };
  const hasInjectedLock = Object.prototype.hasOwnProperty.call(options, 'lock');
  const lock = hasInjectedLock ? options.lock || null : resolveRuntimeLock();
  if (!lock && !(hasInjectedLock && options.lock === null)) {
    throw new Error(busyMessage);
  }

  let hasLock = false;
  try {
    try {
      if (lock && typeof lock.tryLock === 'function') {
        hasLock = !!lock.tryLock(timeoutMs);
        if (!hasLock) {
          throw new Error(busyMessage);
        }
      } else if (lock && typeof lock.waitLock === 'function') {
        lock.waitLock(timeoutMs);
        hasLock = true;
      }
    } catch {
      throw new Error(busyMessage);
    }
    state.depth = 1;
    return fn();
  } finally {
    state.depth = 0;
    if (lock && hasLock && typeof lock.releaseLock === 'function') {
      try {
        lock.releaseLock();
      } catch {
        // The operation result remains authoritative; Apps Script locks expire automatically.
      }
    }
  }
};

export const isRetryableMutationLockErrorMessage = (value: any): boolean => {
  const message = (value || '').toString().trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes('please retry') ||
    message.includes('record save lock') ||
    message.includes('record mutation queue is busy') ||
    message.includes('another record mutation is still running') ||
    message.includes('could not queue record mutation') ||
    message.includes('timed out acquiring script lock') ||
    message.includes('follow-up queue is busy') ||
    message.includes('another follow-up batch is still running') ||
    message.includes('could not queue follow-up actions') ||
    message.includes('utilisation transaction lock')
  );
};

export const sleepWithUtilities = (durationMs: number): void => {
  if (!(Number.isFinite(durationMs) && durationMs > 0)) return;
  if (typeof Utilities !== 'undefined' && typeof (Utilities as any).sleep === 'function') {
    (Utilities as any).sleep(durationMs);
  }
};
