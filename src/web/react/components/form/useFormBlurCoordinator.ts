import { useEffect } from 'react';

import type { FieldValue, WebQuestionDefinition } from '../../../types';
import type { LineItemState } from '../../types';
import { parseLineFieldPath } from '../../features/lineItems/domain/formViewHelpers';

type UserEditBlurHandler = (event: {
  scope: 'line' | 'top';
  fieldPath: string;
  fieldId: string;
  groupId?: string;
  rowId?: string;
  event: 'blur';
  tag?: string;
  inputType?: string;
}) => void;

/**
 * Coordinates form-wide blur side effects. Rendering remains in FormView; this hook
 * owns DOM focusout subscription, deferred validation, paragraph disclaimer flushes,
 * derived blur recomputation, and overlay-detail auto-open attempts.
 */
export const useFormBlurCoordinator = (args: {
  hasBlurDerived: boolean;
  blurDerivedDependencyIds: Set<string>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onUserEdit?: UserEditBlurHandler;
  recomputeDerivedOnBlur: (args: { fieldPath?: string; tag?: string }) => void;
  validateErrorsOnBlur: (fieldPath: string, meta?: { tag?: string; inputType?: string }) => void;
  blurRecomputeTimerRef: React.MutableRefObject<number | null>;
  overlayDetailBlurTimerRef: React.MutableRefObject<number | null>;
  paragraphDisclaimerTimerRef: React.MutableRefObject<number | null>;
  paragraphDisclaimerPendingRef: React.MutableRefObject<boolean>;
  paragraphDisclaimerSyncRef: React.MutableRefObject<((source?: string) => void) | null>;
  resolveLineItemGroupForKey: (groupKey: string) => WebQuestionDefinition | null | undefined;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  valuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  attemptOverlayDetailAutoOpen: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    rowValues: Record<string, FieldValue>;
    nextValues: Record<string, FieldValue>;
    nextLineItems: LineItemState;
    triggerFieldId: string;
    source: 'change' | 'blur';
  }) => void;
}) => {
  const {
    hasBlurDerived,
    blurDerivedDependencyIds,
    onDiagnostic,
    onUserEdit,
    recomputeDerivedOnBlur,
    validateErrorsOnBlur,
    blurRecomputeTimerRef,
    overlayDetailBlurTimerRef,
    paragraphDisclaimerTimerRef,
    paragraphDisclaimerPendingRef,
    paragraphDisclaimerSyncRef,
    resolveLineItemGroupForKey,
    lineItemsRef,
    valuesRef,
    attemptOverlayDetailAutoOpen
  } = args;

  useEffect(() => {
    const handler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const role = (target.getAttribute('role') || '').toString().trim().toLowerCase();
      const isInputLike = tag === 'input' || tag === 'textarea' || tag === 'select';
      const isButtonLike =
        tag === 'button' || role === 'button' || role === 'radio' || role === 'option' || role === 'combobox';
      if (!isInputLike && !isButtonLike) return;
      const root = target.closest('.ck-form-sections') || target.closest('.webform-overlay') || target.closest('.form-card');
      if (!root) return;
      const fieldPath = (target.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
      const inputType = (target as any)?.type !== undefined && (target as any)?.type !== null ? String((target as any).type) : undefined;

      if (onUserEdit && fieldPath) {
        const fp = fieldPath.toString();
        const parts = fp.split('__');
        const isLine = parts.length >= 3;
        onUserEdit({
          scope: isLine ? 'line' : 'top',
          fieldPath: fp,
          fieldId: isLine ? parts[1] : fp,
          groupId: isLine ? parts[0] : undefined,
          rowId: isLine ? parts[2] : undefined,
          event: 'blur',
          tag,
          inputType
        });
      }

      const blurredFieldId = (() => {
        if (!fieldPath) return '';
        const parts = fieldPath.split('__');
        if (parts.length >= 2) return (parts[1] || '').toString().trim();
        return fieldPath.toString().trim();
      })();
      const shouldRecomputeBlurDerived =
        !!fieldPath && hasBlurDerived && (!blurDerivedDependencyIds.size || (blurredFieldId ? blurDerivedDependencyIds.has(blurredFieldId) : true));

      if (fieldPath && !shouldRecomputeBlurDerived) {
        validateErrorsOnBlur(fieldPath, { tag, inputType });
      }

      if (paragraphDisclaimerTimerRef.current !== null) {
        window.clearTimeout(paragraphDisclaimerTimerRef.current);
      }
      paragraphDisclaimerTimerRef.current = window.setTimeout(() => {
        paragraphDisclaimerTimerRef.current = null;
        if (!paragraphDisclaimerPendingRef.current) return;
        paragraphDisclaimerSyncRef.current?.('blur');
      }, 0);

      const lineField = fieldPath ? parseLineFieldPath(fieldPath.toString()) : null;
      if (lineField) {
        if (overlayDetailBlurTimerRef.current !== null) {
          window.clearTimeout(overlayDetailBlurTimerRef.current);
        }
        overlayDetailBlurTimerRef.current = window.setTimeout(() => {
          overlayDetailBlurTimerRef.current = null;
          const groupDef = resolveLineItemGroupForKey(lineField.groupId);
          if (!groupDef) return;
          const rows = lineItemsRef.current[lineField.groupId] || [];
          const row = rows.find(r => r.id === lineField.rowId);
          if (!row) return;
          attemptOverlayDetailAutoOpen({
            group: groupDef,
            rowId: lineField.rowId,
            rowValues: (row.values || {}) as Record<string, FieldValue>,
            nextValues: valuesRef.current,
            nextLineItems: lineItemsRef.current,
            triggerFieldId: lineField.fieldId,
            source: 'blur'
          });
        }, 0);
      }

      if (hasBlurDerived) {
        if (!shouldRecomputeBlurDerived) {
          onDiagnostic?.('derived.blur.skip', { fieldPath, blurredFieldId });
          return;
        }
        if (blurRecomputeTimerRef.current !== null) {
          window.clearTimeout(blurRecomputeTimerRef.current);
        }
        blurRecomputeTimerRef.current = window.setTimeout(() => {
          blurRecomputeTimerRef.current = null;
          recomputeDerivedOnBlur({ fieldPath, tag });
          if (fieldPath) {
            validateErrorsOnBlur(fieldPath, { tag, inputType });
          }
        }, 0);
      }
    };
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusout', handler, true);
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
        blurRecomputeTimerRef.current = null;
      }
      if (overlayDetailBlurTimerRef.current !== null) {
        window.clearTimeout(overlayDetailBlurTimerRef.current);
        overlayDetailBlurTimerRef.current = null;
      }
      if (paragraphDisclaimerTimerRef.current !== null) {
        window.clearTimeout(paragraphDisclaimerTimerRef.current);
        paragraphDisclaimerTimerRef.current = null;
      }
    };
  }, [
    attemptOverlayDetailAutoOpen,
    blurDerivedDependencyIds,
    blurRecomputeTimerRef,
    hasBlurDerived,
    lineItemsRef,
    onDiagnostic,
    onUserEdit,
    overlayDetailBlurTimerRef,
    paragraphDisclaimerPendingRef,
    paragraphDisclaimerSyncRef,
    paragraphDisclaimerTimerRef,
    recomputeDerivedOnBlur,
    resolveLineItemGroupForKey,
    validateErrorsOnBlur,
    valuesRef
  ]);
};
