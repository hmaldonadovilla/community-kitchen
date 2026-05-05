import { useMemo } from 'react';

import type { FieldValue, WebFormDefinition } from '../../../types';
import type { LineItemState, View } from '../../types';
import {
  buildSystemActionGateContext,
  evaluateSystemActionGate,
  type SystemActionGateResult
} from '../../app/actionGates';

type GuidedUiState = {
  activeStepId: string | null;
  activeStepIndex: number;
} | null;

type RecordLike = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
  pdfUrl?: string;
} | null;

export type SystemActionGateState = {
  submit: SystemActionGateResult;
  summary: SystemActionGateResult;
  edit: SystemActionGateResult;
  copyCurrentRecord: SystemActionGateResult;
  create: SystemActionGateResult;
  home: SystemActionGateResult;
};

export const useSystemActionGateState = (args: {
  definition: WebFormDefinition;
  view: View;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  selectedRecordId?: string | null;
  selectedRecordSnapshot?: RecordLike;
  lastSubmissionMeta?: RecordLike;
  guidedUiState: GuidedUiState;
}): SystemActionGateState => {
  const {
    definition,
    view,
    values,
    lineItems,
    selectedRecordId,
    selectedRecordSnapshot,
    lastSubmissionMeta,
    guidedUiState
  } = args;
  const systemActionGates = definition.actionBars?.system?.gates;

  return useMemo(() => {
    const recordMeta = {
      id: (selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id || undefined) as any,
      createdAt: (selectedRecordSnapshot?.createdAt || lastSubmissionMeta?.createdAt || undefined) as any,
      updatedAt: (selectedRecordSnapshot?.updatedAt || lastSubmissionMeta?.updatedAt || undefined) as any,
      status: (selectedRecordSnapshot?.status || lastSubmissionMeta?.status || null) as any,
      pdfUrl: selectedRecordSnapshot?.pdfUrl || undefined
    };

    const guidedPrefix = (((definition as any)?.steps as any)?.stateFields?.prefix || '__ckStep').toString();
    const guidedVirtualState =
      guidedUiState && guidedUiState.activeStepId
        ? ({
            prefix: guidedPrefix,
            activeStepId: guidedUiState.activeStepId,
            activeStepIndex: guidedUiState.activeStepIndex || 0,
            maxValidIndex: -1,
            maxCompleteIndex: -1,
            steps: []
          } as any)
        : null;

    const evaluateFor = (actionId: keyof SystemActionGateState) => {
      const ctx = buildSystemActionGateContext({
        actionId,
        view,
        values,
        lineItems,
        recordMeta,
        guidedVirtualState
      });
      return evaluateSystemActionGate({ gates: systemActionGates, actionId, ctx });
    };

    return {
      submit: evaluateFor('submit'),
      summary: evaluateFor('summary'),
      edit: evaluateFor('edit'),
      copyCurrentRecord: evaluateFor('copyCurrentRecord'),
      create: evaluateFor('create'),
      home: evaluateFor('home')
    };
  }, [
    definition,
    guidedUiState,
    lastSubmissionMeta?.createdAt,
    lastSubmissionMeta?.id,
    lastSubmissionMeta?.status,
    lastSubmissionMeta?.updatedAt,
    lineItems,
    selectedRecordId,
    selectedRecordSnapshot,
    systemActionGates,
    values,
    view
  ]);
};
