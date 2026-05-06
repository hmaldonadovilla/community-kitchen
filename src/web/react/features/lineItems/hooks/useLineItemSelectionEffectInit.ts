import React from 'react';

import type { FieldValue, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { LineItemState } from '../../../types';
import {
  collectComputedSelectionEffectInitTargets,
  collectSelectionEffectInitTargets,
  collectSubgroupSeedInitTargets
} from '../domain/selectionEffectInit';

type RecordMetaForSelectionInit = {
  id?: FieldValue;
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
  status?: FieldValue;
  pdfUrl?: FieldValue;
};

type UseLineItemSelectionEffectInitArgs = {
  q: WebQuestionDefinition;
  definition: WebFormDefinition;
  submitting: boolean;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  recordMeta?: RecordMetaForSelectionInit;
  handleLineFieldChange: (
    group: WebQuestionDefinition,
    rowId: string,
    field: any,
    value: FieldValue,
    options?: { source?: 'user' | 'selectionEffectInit' }
  ) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: line-items feature workflow.
 * Runs initial selection effects for hydrated rows while keeping the renderer
 * shell free of mutation orchestration.
 */
export const useLineItemSelectionEffectInit = ({
  q,
  definition,
  submitting,
  values,
  lineItems,
  recordMeta,
  handleLineFieldChange,
  onDiagnostic
}: UseLineItemSelectionEffectInitArgs): void => {
  const initializedSelectionEffectsRef = React.useRef<Set<string>>(new Set());
  const initSourceQuestion = React.useMemo(
    () => definition.questions.find(entry => entry.id === q.id) || q,
    [definition, q]
  );
  const selectionEffectInitTopValues = React.useMemo(
    () =>
      ({
        ...(values as Record<string, FieldValue>),
        ...(recordMeta?.id !== undefined ? { id: recordMeta.id as FieldValue } : {}),
        ...(recordMeta?.createdAt !== undefined ? { createdAt: recordMeta.createdAt as FieldValue } : {}),
        ...(recordMeta?.updatedAt !== undefined ? { updatedAt: recordMeta.updatedAt as FieldValue } : {}),
        ...(recordMeta?.status !== undefined ? { status: recordMeta.status as FieldValue, STATUS: recordMeta.status as FieldValue } : {}),
        ...(recordMeta?.pdfUrl !== undefined ? { pdfUrl: recordMeta.pdfUrl as FieldValue } : {})
      }) as Record<string, FieldValue>,
    [recordMeta?.createdAt, recordMeta?.id, recordMeta?.pdfUrl, recordMeta?.status, recordMeta?.updatedAt, values]
  );

  React.useEffect(() => {
    if (submitting) return;
    const targets = [
      ...collectSelectionEffectInitTargets(initSourceQuestion, lineItems, selectionEffectInitTopValues),
      ...collectSubgroupSeedInitTargets(initSourceQuestion, lineItems),
      ...collectComputedSelectionEffectInitTargets(initSourceQuestion, lineItems, selectionEffectInitTopValues)
    ];
    if (!targets.length) {
      initializedSelectionEffectsRef.current.clear();
      return;
    }

    const nextKeys = new Set<string>();
    targets.forEach(target => {
      nextKeys.add(target.signature);
      if (initializedSelectionEffectsRef.current.has(target.signature)) return;

      initializedSelectionEffectsRef.current.add(target.signature);
      onDiagnostic?.('selectionEffects.initRowValue', {
        groupId: target.groupKey,
        rowId: target.rowId || null,
        fieldId: target.field.id
      });
      const initField =
        target.field && typeof target.field === 'object' && target.field.readOnly === true
          ? { ...target.field, readOnly: false }
          : target.field;
      handleLineFieldChange(target.group as any, target.rowId, initField, target.rawValue as any, {
        source: 'selectionEffectInit'
      });
    });

    initializedSelectionEffectsRef.current.forEach(signature => {
      if (!nextKeys.has(signature)) initializedSelectionEffectsRef.current.delete(signature);
    });
  }, [submitting, initSourceQuestion, lineItems, selectionEffectInitTopValues, handleLineFieldChange, onDiagnostic]);
};
