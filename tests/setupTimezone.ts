process.env.TZ = 'Europe/Paris';

// Apps Script always supplies LockService in deployed executions. Unit tests
// inject a deterministic no-contention implementation explicitly; individual
// lock-failure tests delete or replace it for their scenario.
if (!(globalThis as any).LockService) {
  (globalThis as any).LockService = {
    getDocumentLock: () => null,
    getScriptLock: () => ({
      tryLock: () => true,
      waitLock: () => undefined,
      releaseLock: () => undefined
    })
  };
}
