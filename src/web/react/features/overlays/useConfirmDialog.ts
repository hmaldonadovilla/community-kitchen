import { useCallback, useEffect, useRef, useState } from 'react';

export type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  primaryAction?: 'confirm' | 'cancel';
  showCancel?: boolean;
  showConfirm?: boolean;
  dismissOnBackdrop?: boolean;
  showCloseButton?: boolean;
  kind?: string;
  refId?: string;
};

export type ConfirmDialogOpenArgs = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  primaryAction?: 'confirm' | 'cancel';
  showCancel?: boolean;
  showConfirm?: boolean;
  dismissOnBackdrop?: boolean;
  showCloseButton?: boolean;
  kind?: string;
  refId?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

/**
 * useConfirmDialog
 * ----------------
 * Small UI-state hook for confirm/cancel dialogs.
 *
 * - Stores the confirm callback in a ref to avoid stale closure issues.
 * - Supports auto-close when `closeOnKey` changes (e.g., navigation/view changes).
 * - Supports Escape-to-close.
 *
 * Owner: WebForm UI (React)
 */
export const useConfirmDialog = (opts?: {
  closeOnKey?: unknown;
  eventPrefix?: string;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const eventPrefix = (opts?.eventPrefix || 'ui.confirmDialog').toString();
  const [state, setState] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    primaryAction: 'confirm',
    showCancel: true,
    showConfirm: true,
    dismissOnBackdrop: true,
    showCloseButton: true,
    kind: undefined,
    refId: undefined
  });
  const confirmRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const openedOnKeyRef = useRef<unknown>(undefined);

  const cancel = useCallback(() => {
    const handler = cancelRef.current;
    setState(prev => (prev.open ? { ...prev, open: false } : prev));
    confirmRef.current = null;
    cancelRef.current = null;
    openedOnKeyRef.current = undefined;
    opts?.onDiagnostic?.(`${eventPrefix}.cancel`, { kind: state.kind || null, refId: state.refId || null });
    try {
      handler?.();
    } catch (_) {
      // ignore
    }
  }, [eventPrefix, opts, state.kind, state.refId]);

  const confirm = useCallback(() => {
    const fn = confirmRef.current;
    const meta = { kind: state.kind || null, refId: state.refId || null };
    setState(prev => (prev.open ? { ...prev, open: false } : prev));
    confirmRef.current = null;
    cancelRef.current = null;
    openedOnKeyRef.current = undefined;
    opts?.onDiagnostic?.(`${eventPrefix}.confirm`, meta);
    try {
      fn?.();
    } catch (err: any) {
      opts?.onDiagnostic?.(`${eventPrefix}.confirm.exception`, { ...meta, message: err?.message || err || 'unknown' });
    }
  }, [eventPrefix, opts, state.kind, state.refId]);

  const openConfirm = useCallback(
    (args: ConfirmDialogOpenArgs) => {
      const title = (args?.title || '').toString();
      const message = (args?.message || '').toString();
      const confirmLabel = (args?.confirmLabel || '').toString();
      const cancelLabel = (args?.cancelLabel || '').toString();
      const primaryAction = args?.primaryAction === 'cancel' ? 'cancel' : 'confirm';
      const showCancel = args?.showCancel !== false;
      const showConfirm = args?.showConfirm !== false;
      const dismissOnBackdrop = args?.dismissOnBackdrop !== false;
      const showCloseButton = args?.showCloseButton !== false;
      const kind = (args?.kind || '').toString() || undefined;
      const refId = (args?.refId || '').toString() || undefined;
      confirmRef.current = args?.onConfirm || null;
      cancelRef.current = args?.onCancel || null;
      openedOnKeyRef.current = opts?.closeOnKey;
      setState({
        open: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        primaryAction,
        showCancel,
        showConfirm,
        dismissOnBackdrop,
        showCloseButton,
        kind,
        refId
      });
      opts?.onDiagnostic?.(`${eventPrefix}.open`, { kind: kind || null, refId: refId || null });
    },
    [eventPrefix, opts]
  );

  // Escape closes the dialog.
  useEffect(() => {
    if (!state.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        opts?.onDiagnostic?.(`${eventPrefix}.escape`, { kind: state.kind || null, refId: state.refId || null });
        cancel();
      }
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [cancel, eventPrefix, opts, state.kind, state.open, state.refId]);

  // Auto-close when the key changes (e.g., view navigation).
  useEffect(() => {
    if (!state.open) return;
    if (openedOnKeyRef.current === undefined) return;
    if (opts?.closeOnKey === openedOnKeyRef.current) return;
    opts?.onDiagnostic?.(`${eventPrefix}.autoClose`, { kind: state.kind || null, refId: state.refId || null });
    cancel();
  }, [cancel, eventPrefix, opts?.closeOnKey, opts, state.kind, state.open, state.refId]);

  return { state, openConfirm, cancel, confirm } as const;
};
