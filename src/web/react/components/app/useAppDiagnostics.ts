import { useCallback, useState } from 'react';

import { detectDebug, shouldAlwaysLogDiagnosticEvent } from '../../app/utils';

/**
 * Owns App-level diagnostic logging policy; UI components receive the stable logger
 * instead of knowing how debug mode and production-safe diagnostic prefixes are gated.
 */
export const useAppDiagnostics = () => {
  const [debugEnabled] = useState<boolean>(() => detectDebug());
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      const alwaysLog = shouldAlwaysLogDiagnosticEvent(event);
      if ((!debugEnabled && !alwaysLog) || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm]', event, payload || {});
      } catch {
        // ignore logging failures
      }
    },
    [debugEnabled]
  );

  return { debugEnabled, logEvent };
};
