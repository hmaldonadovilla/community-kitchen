const EXECUTION_DOCUMENT_LOCK_STATE_KEY = '__CK_EXECUTION_DOCUMENT_LOCK_STATE__';

type ExecutionDocumentLockState = {
  depth: number;
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
  busyMessage = DOCUMENT_LOCK_BUSY_MESSAGE
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

  const lock = (() => {
    try {
      return typeof LockService !== 'undefined' && (LockService as any).getDocumentLock
        ? (LockService as any).getDocumentLock()
        : null;
    } catch {
      return null;
    }
  })();

  let hasLock = false;
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
    state.depth = 1;
    return fn();
  } finally {
    state.depth = 0;
    if (lock && hasLock && typeof lock.releaseLock === 'function') {
      lock.releaseLock();
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
