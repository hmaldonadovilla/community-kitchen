import { useCallback, useEffect, type MutableRefObject } from 'react';

import type { WebFormSubmission } from '../../../types';
import type { ListItem } from '../../api';

export type AppRecordOpenView = 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';

export type AppRecordSelectHandler = (
  row: ListItem,
  fullRecord?: WebFormSubmission,
  opts?: { openView?: AppRecordOpenView; openButtonId?: string }
) => void;

const normalizePerfOpenView = (raw?: string): 'auto' | 'form' | 'summary' | 'submit' => {
  const lowered = (raw || 'auto').toString().trim().toLowerCase();
  if (lowered === 'form' || lowered === 'summary' || lowered === 'submit') return lowered;
  return 'auto';
};

export const useAppPerfOpenRecordBridge = (args: {
  enabled: boolean;
  listItems?: ListItem[];
  records: Record<string, WebFormSubmission | undefined>;
  onDiagnostic: (event: string, payload?: Record<string, unknown>) => void;
  recordSelectRef: MutableRefObject<AppRecordSelectHandler | null>;
}) => {
  const { enabled, listItems, records, onDiagnostic, recordSelectRef } = args;

  const openRecordByIdForPerf = useCallback(
    (recordId: string, openViewRaw?: string): boolean => {
      if (!enabled) return false;
      const id = (recordId || '').toString().trim();
      if (!id) return false;
      const items = (listItems || []) as ListItem[];
      if (!items.length) return false;
      const row = items.find(r => ((r as any)?.id || '').toString() === id);
      if (!row) return false;
      const openView = normalizePerfOpenView(openViewRaw);
      onDiagnostic('perf.openRecordById.attempt', { recordId: id, openView });
      recordSelectRef.current?.(row, records[id], { openView });
      return true;
    },
    [enabled, listItems, onDiagnostic, recordSelectRef, records]
  );

  useEffect(() => {
    if (!enabled) return;
    const globalAny = globalThis as any;
    const hook = (recordId: any, openView?: any) => openRecordByIdForPerf((recordId || '').toString(), (openView || '').toString());
    globalAny.__CK_PERF_OPEN_RECORD_BY_ID__ = hook;
    return () => {
      try {
        if (globalAny.__CK_PERF_OPEN_RECORD_BY_ID__ === hook) {
          delete globalAny.__CK_PERF_OPEN_RECORD_BY_ID__;
        }
      } catch {
        // ignore cleanup failures
      }
    };
  }, [enabled, openRecordByIdForPerf]);
};
