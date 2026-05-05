import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import type { FieldValue, LineItemOverlaySessionConfig } from '../../../types';
import type { FormErrors, LineItemState } from '../../types';
import { clearLineItemGroupErrors } from '../../components/form/utils';

type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;
type OverlaySessionKind = 'subgroup' | 'lineItem';

type OverlaySessionSnapshot = {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
};

export const buildOverlaySessionSnapshotKey = (kind: OverlaySessionKind, targetKey: string): string => {
  const normalized = (targetKey || '').toString().trim();
  return normalized ? `${kind}::${normalized}` : '';
};

export const useOverlaySessionSnapshots = (args: {
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  onDiagnostic?: DiagnosticHandler;
}) => {
  const { valuesRef, lineItemsRef, setValues, setLineItems, setErrors, onDiagnostic } = args;
  const overlaySessionSnapshotsRef = useRef<Record<string, OverlaySessionSnapshot>>({});

  const ensureOverlaySessionSnapshot = useCallback(
    (kind: OverlaySessionKind, targetKey: string, session?: LineItemOverlaySessionConfig) => {
      if (!session?.enabled) return;
      const snapshotKey = buildOverlaySessionSnapshotKey(kind, targetKey);
      if (!snapshotKey) return;
      if (overlaySessionSnapshotsRef.current[snapshotKey]) return;
      overlaySessionSnapshotsRef.current[snapshotKey] = {
        values: valuesRef.current,
        lineItems: lineItemsRef.current
      };
      onDiagnostic?.('overlay.session.snapshot.capture', {
        kind,
        targetKey,
        snapshotKey
      });
    },
    [lineItemsRef, onDiagnostic, valuesRef]
  );

  const clearOverlaySessionSnapshot = useCallback(
    (kind: OverlaySessionKind, targetKey: string) => {
      const snapshotKey = buildOverlaySessionSnapshotKey(kind, targetKey);
      if (!snapshotKey) return;
      if (!overlaySessionSnapshotsRef.current[snapshotKey]) return;
      delete overlaySessionSnapshotsRef.current[snapshotKey];
      onDiagnostic?.('overlay.session.snapshot.clear', {
        kind,
        targetKey,
        snapshotKey
      });
    },
    [onDiagnostic]
  );

  const restoreOverlaySessionSnapshot = useCallback(
    (restoreArgs: { kind: OverlaySessionKind; targetKey: string; errorGroupKey?: string }) => {
      const snapshotKey = buildOverlaySessionSnapshotKey(restoreArgs.kind, restoreArgs.targetKey);
      if (!snapshotKey) return false;
      const snapshot = overlaySessionSnapshotsRef.current[snapshotKey];
      if (!snapshot) return false;
      setValues(snapshot.values);
      setLineItems(snapshot.lineItems);
      valuesRef.current = snapshot.values;
      lineItemsRef.current = snapshot.lineItems;
      if (restoreArgs.errorGroupKey) {
        setErrors(prev => clearLineItemGroupErrors(prev, restoreArgs.errorGroupKey || ''));
      }
      delete overlaySessionSnapshotsRef.current[snapshotKey];
      onDiagnostic?.('overlay.session.snapshot.restore', {
        kind: restoreArgs.kind,
        targetKey: restoreArgs.targetKey,
        snapshotKey
      });
      return true;
    },
    [lineItemsRef, onDiagnostic, setErrors, setLineItems, setValues, valuesRef]
  );

  return {
    ensureOverlaySessionSnapshot,
    clearOverlaySessionSnapshot,
    restoreOverlaySessionSnapshot
  };
};

export const useScopedAutoSaveHold = (args: {
  setAutoSaveHold?: (hold: boolean, meta?: { reason?: string }) => void;
  onDiagnostic?: DiagnosticHandler;
}) => {
  const { setAutoSaveHold, onDiagnostic } = args;
  const autoSaveHoldReasonsRef = useRef<Record<string, true>>({});

  return useCallback(
    (hold: boolean, meta?: { reason?: string }) => {
      if (!setAutoSaveHold) return;
      const reason = (meta?.reason || 'formInteraction').toString().trim() || 'formInteraction';
      const previous = autoSaveHoldReasonsRef.current;
      const nextReasons = { ...previous };
      if (hold) {
        nextReasons[reason] = true;
      } else {
        delete nextReasons[reason];
      }
      const previousSignature = Object.keys(previous).sort().join(',');
      const nextSignature = Object.keys(nextReasons).sort().join(',');
      if (previousSignature === nextSignature) return;
      autoSaveHoldReasonsRef.current = nextReasons;
      const activeReasons = Object.keys(nextReasons).sort();
      setAutoSaveHold(activeReasons.length > 0, {
        reason: activeReasons.join(',') || undefined
      });
      onDiagnostic?.('autosave.hold.request', {
        hold: activeReasons.length > 0,
        reason,
        activeReasons
      });
    },
    [onDiagnostic, setAutoSaveHold]
  );
};

export const useOverlayEditingAutoSaveHold = (args: {
  lineSelectOpen: boolean;
  lineItemOverlayOpen: boolean;
  subgroupOverlayOpen: boolean;
  setScopedAutoSaveHold: (hold: boolean, meta?: { reason?: string }) => void;
  onDiagnostic?: DiagnosticHandler;
}) => {
  const { lineSelectOpen, lineItemOverlayOpen, subgroupOverlayOpen, setScopedAutoSaveHold, onDiagnostic } = args;

  useEffect(() => {
    const hold = lineSelectOpen || lineItemOverlayOpen || subgroupOverlayOpen;
    setScopedAutoSaveHold(hold, { reason: 'overlayEditing' });
    onDiagnostic?.('autosave.hold.request', {
      hold,
      reason: 'overlayEditing',
      lineSelectOpen,
      lineItemOverlayOpen,
      subgroupOverlayOpen
    });
  }, [lineItemOverlayOpen, lineSelectOpen, onDiagnostic, setScopedAutoSaveHold, subgroupOverlayOpen]);
};
