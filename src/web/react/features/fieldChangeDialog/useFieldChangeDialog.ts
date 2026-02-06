import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldValue } from '../../../types';

export type FieldChangeDialogInputOption = { value: string; label: string };

export type FieldChangeDialogInputState = {
  id: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'paragraph' | 'number' | 'choice' | 'checkbox' | 'date';
  required?: boolean;
  options?: FieldChangeDialogInputOption[];
  multiple?: boolean;
};

export type FieldChangeDialogState = {
  open: boolean;
  busy: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  inputs: FieldChangeDialogInputState[];
  values: Record<string, FieldValue>;
  kind?: string;
  refId?: string;
};

export type FieldChangeDialogOpenArgs = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  inputs: FieldChangeDialogInputState[];
  values?: Record<string, FieldValue>;
  kind?: string;
  refId?: string;
  onConfirm: (values: Record<string, FieldValue>) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export const useFieldChangeDialog = (opts?: {
  closeOnKey?: unknown;
  eventPrefix?: string;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const eventPrefix = (opts?.eventPrefix || 'ui.fieldChangeDialog').toString();
  const [state, setState] = useState<FieldChangeDialogState>({
    open: false,
    busy: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    inputs: [],
    values: {},
    kind: undefined,
    refId: undefined
  });
  const confirmRef = useRef<((values: Record<string, FieldValue>) => void | Promise<void>) | null>(null);
  const cancelRef = useRef<(() => void | Promise<void>) | null>(null);
  const openedOnKeyRef = useRef<unknown>(undefined);

  const setInputValue = useCallback((id: string, value: FieldValue) => {
    setState(prev => {
      if (!prev.open) return prev;
      const next = { ...prev.values, [id]: value };
      return { ...prev, values: next };
    });
  }, []);

  const cancel = useCallback(() => {
    if (state.busy) return;
    const handler = cancelRef.current;
    setState(prev => (prev.open ? { ...prev, open: false, busy: false } : prev));
    opts?.onDiagnostic?.(`${eventPrefix}.cancel`, { kind: state.kind || null, refId: state.refId || null });
    try {
      void handler?.();
    } catch (err: any) {
      opts?.onDiagnostic?.(`${eventPrefix}.cancel.exception`, {
        kind: state.kind || null,
        refId: state.refId || null,
        message: err?.message || err || 'unknown'
      });
    }
    confirmRef.current = null;
    cancelRef.current = null;
    openedOnKeyRef.current = undefined;
  }, [eventPrefix, opts, state.busy, state.kind, state.refId]);

  const confirm = useCallback(async () => {
    if (state.busy) return;
    const handler = confirmRef.current;
    const values = state.values;
    const meta = { kind: state.kind || null, refId: state.refId || null };
    setState(prev => (prev.open ? { ...prev, busy: true } : prev));
    opts?.onDiagnostic?.(`${eventPrefix}.confirm.start`, meta);
    try {
      await handler?.(values);
      setState(prev => (prev.open ? { ...prev, open: false, busy: false } : prev));
      confirmRef.current = null;
      cancelRef.current = null;
      openedOnKeyRef.current = undefined;
      opts?.onDiagnostic?.(`${eventPrefix}.confirm`, meta);
    } catch (err: any) {
      setState(prev => (prev.open ? { ...prev, busy: false } : prev));
      opts?.onDiagnostic?.(`${eventPrefix}.confirm.exception`, { ...meta, message: err?.message || err || 'unknown' });
    }
  }, [eventPrefix, opts, state.busy, state.kind, state.refId, state.values]);

  const open = useCallback(
    (args: FieldChangeDialogOpenArgs) => {
      const title = (args?.title || '').toString();
      const message = (args?.message || '').toString();
      const confirmLabel = (args?.confirmLabel || '').toString();
      const cancelLabel = (args?.cancelLabel || '').toString();
      const kind = (args?.kind || '').toString() || undefined;
      const refId = (args?.refId || '').toString() || undefined;
      const values = args?.values ? { ...args.values } : {};
      confirmRef.current = args?.onConfirm || null;
      cancelRef.current = args?.onCancel || null;
      openedOnKeyRef.current = opts?.closeOnKey;
      setState({
        open: true,
        busy: false,
        title,
        message,
        confirmLabel,
        cancelLabel,
        inputs: Array.isArray(args.inputs) ? args.inputs : [],
        values,
        kind,
        refId
      });
      opts?.onDiagnostic?.(`${eventPrefix}.open`, { kind: kind || null, refId: refId || null });
    },
    [eventPrefix, opts]
  );

  useEffect(() => {
    if (!state.open) return;
    if (state.busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        opts?.onDiagnostic?.(`${eventPrefix}.escape`, { kind: state.kind || null, refId: state.refId || null });
        cancel();
      }
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [cancel, eventPrefix, opts, state.busy, state.kind, state.open, state.refId]);

  useEffect(() => {
    if (!state.open) return;
    if (state.busy) return;
    if (openedOnKeyRef.current === undefined) return;
    if (opts?.closeOnKey === openedOnKeyRef.current) return;
    opts?.onDiagnostic?.(`${eventPrefix}.autoClose`, { kind: state.kind || null, refId: state.refId || null });
    cancel();
  }, [cancel, eventPrefix, opts?.closeOnKey, opts, state.busy, state.kind, state.open, state.refId]);

  return { state, open, cancel, confirm, setInputValue } as const;
};
