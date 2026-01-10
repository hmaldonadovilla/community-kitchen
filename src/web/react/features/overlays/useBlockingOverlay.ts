import { useCallback, useRef, useState } from 'react';

export type BlockingOverlayState = {
  open: boolean;
  title: string;
  message: string;
  seq: number;
  kind?: string;
};

export type BlockingOverlayLockArgs = {
  title: string;
  message: string;
  kind?: string;
  diagnosticMeta?: Record<string, unknown>;
};

/**
 * useBlockingOverlay
 * ------------------
 * Small UI-state hook that coordinates a full-screen blocking overlay.
 * Uses a monotonically increasing `seq` token so async callers can safely
 * unlock only if they are the latest operation (prevents race flicker).
 *
 * Owner: WebForm UI (React)
 */
export const useBlockingOverlay = (opts?: {
  eventPrefix?: string;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const eventPrefix = (opts?.eventPrefix || 'ui.blockingOverlay').toString();
  const seqRef = useRef(0);
  const [state, setState] = useState<BlockingOverlayState>({
    open: false,
    title: '',
    message: '',
    seq: 0,
    kind: undefined
  });

  const lock = useCallback(
    (args: BlockingOverlayLockArgs): number => {
      const seq = ++seqRef.current;
      const title = (args?.title || '').toString();
      const message = (args?.message || '').toString();
      const kind = (args?.kind || '').toString() || undefined;
      setState({ open: true, title, message, seq, kind });
      opts?.onDiagnostic?.(`${eventPrefix}.lock`, { seq, kind: kind || null, ...(args?.diagnosticMeta || {}) });
      return seq;
    },
    [eventPrefix, opts]
  );

  const setMessage = useCallback(
    (seq: number, messageRaw: string) => {
      const message = (messageRaw || '').toString();
      setState(prev => (prev.open && prev.seq === seq ? { ...prev, message } : prev));
    },
    []
  );

  const setTitle = useCallback(
    (seq: number, titleRaw: string) => {
      const title = (titleRaw || '').toString();
      setState(prev => (prev.open && prev.seq === seq ? { ...prev, title } : prev));
    },
    []
  );

  const unlock = useCallback(
    (seq: number, diagnosticMeta?: Record<string, unknown>) => {
      setState(prev => {
        if (!prev.open) return prev;
        if (prev.seq !== seq) return prev;
        return { open: false, title: '', message: '', seq: prev.seq, kind: undefined };
      });
      opts?.onDiagnostic?.(`${eventPrefix}.unlock`, { seq, ...(diagnosticMeta || {}) });
    },
    [eventPrefix, opts]
  );

  const forceUnlock = useCallback(() => {
    const seq = seqRef.current;
    setState({ open: false, title: '', message: '', seq, kind: undefined });
    opts?.onDiagnostic?.(`${eventPrefix}.forceUnlock`, { seq });
  }, [eventPrefix, opts]);

  return { state, lock, setMessage, setTitle, unlock, forceUnlock } as const;
};

