import { useCallback, useEffect, useRef, useState } from 'react';

import type { View } from '../../types';

export type DedupProgressPhase = 'checking' | 'available' | 'duplicate';

export type DedupProgressState = {
  open: boolean;
  phase: DedupProgressPhase;
  title: string;
  message: string;
};

/**
 * Owner: App shell.
 * Owns the duplicate-check progress dialog state, timer cleanup, and visibility
 * policy while the dedup check effect remains responsible for server requests.
 */
export const useDedupProgressDialog = (args: {
  view: View;
  dedupCheckDialogEnabled: boolean;
  dedupChecking: boolean;
}) => {
  const { view, dedupCheckDialogEnabled, dedupChecking } = args;
  const dedupProgressTimerRef = useRef<number | null>(null);
  const [dedupProgress, setDedupProgress] = useState<DedupProgressState>({
    open: false,
    phase: 'checking',
    title: '',
    message: ''
  });

  const hideDedupProgressDialog = useCallback(() => {
    if (dedupProgressTimerRef.current) {
      globalThis.clearTimeout(dedupProgressTimerRef.current);
      dedupProgressTimerRef.current = null;
    }
    setDedupProgress(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const showDedupProgressDialog = useCallback(
    (progressArgs: { phase: DedupProgressPhase; title: string; message: string; autoCloseMs?: number }) => {
      if (dedupProgressTimerRef.current) {
        globalThis.clearTimeout(dedupProgressTimerRef.current);
        dedupProgressTimerRef.current = null;
      }
      setDedupProgress({
        open: true,
        phase: progressArgs.phase,
        title: progressArgs.title,
        message: progressArgs.message
      });
      if (progressArgs.autoCloseMs !== undefined && progressArgs.autoCloseMs >= 0) {
        dedupProgressTimerRef.current = globalThis.setTimeout(() => {
          setDedupProgress(prev => (prev.open ? { ...prev, open: false } : prev));
          dedupProgressTimerRef.current = null;
        }, progressArgs.autoCloseMs) as any;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (!dedupProgressTimerRef.current) return;
      globalThis.clearTimeout(dedupProgressTimerRef.current);
      dedupProgressTimerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (view === 'form' && dedupCheckDialogEnabled) return;
    hideDedupProgressDialog();
  }, [dedupCheckDialogEnabled, hideDedupProgressDialog, view]);

  useEffect(() => {
    if (!dedupProgress.open) return;
    if (dedupProgress.phase !== 'checking') return;
    if (dedupChecking) return;
    hideDedupProgressDialog();
  }, [dedupChecking, dedupProgress.open, dedupProgress.phase, hideDedupProgressDialog]);

  return {
    dedupProgress,
    hideDedupProgressDialog,
    showDedupProgressDialog
  };
};
