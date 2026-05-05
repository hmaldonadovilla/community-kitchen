import { useCallback, useMemo } from 'react';

import { isPerfInstrumentationEnv } from '../../perfInstrumentation';

export type AppPerfMeasurePayload = Record<string, unknown>;

export const useAppPerfTools = (envTag?: string | null) => {
  const perfEnabled = useMemo(() => {
    return isPerfInstrumentationEnv(envTag || undefined);
  }, [envTag]);

  const perfMark = useCallback(
    (name: string) => {
      if (!perfEnabled) return;
      try {
        if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
          performance.mark(name);
        }
      } catch {
        // ignore mark failures
      }
    },
    [perfEnabled]
  );

  const perfMeasure = useCallback(
    (name: string, startMark: string, endMark: string, payload?: AppPerfMeasurePayload) => {
      if (!perfEnabled) return;
      let durationMs: number | null = null;
      try {
        if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
          performance.measure(name, startMark, endMark);
          const entries = performance.getEntriesByName(name, 'measure');
          const duration = entries.length ? entries[entries.length - 1].duration : null;
          durationMs = typeof duration === 'number' ? Math.round(duration) : null;
          if (typeof performance.clearMarks === 'function') {
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
          }
          if (typeof performance.clearMeasures === 'function') {
            performance.clearMeasures(name);
          }
        }
      } catch {
        // ignore measure failures
      }
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        try {
          console.info('[ReactForm][perf]', name, { durationMs, ...(payload || {}) });
        } catch {
          // ignore perf log failures
        }
      }
    },
    [perfEnabled]
  );

  return { perfEnabled, perfMark, perfMeasure };
};
