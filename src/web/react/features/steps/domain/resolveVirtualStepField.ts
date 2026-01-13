import { FieldValue } from '../../../../types';
import { GuidedStepStatus } from './computeStepStatus';

export type GuidedStepsVirtualState = {
  prefix: string;
  activeStepId: string;
  activeStepIndex: number;
  maxValidIndex: number;
  maxCompleteIndex: number;
  steps: GuidedStepStatus[];
};

export function resolveVirtualStepField(fieldId: string, state: GuidedStepsVirtualState): FieldValue | undefined {
  const prefix = (state.prefix || '__ckStep').toString();
  const fid = (fieldId || '').toString();
  if (!fid) return undefined;

  if (fid === prefix) return state.activeStepId;
  if (fid === `${prefix}Index`) return state.activeStepIndex;
  if (fid === `${prefix}MaxValidIndex`) return state.maxValidIndex;
  if (fid === `${prefix}MaxCompleteIndex`) return state.maxCompleteIndex;

  const validPrefix = `${prefix}Valid_`;
  if (fid.startsWith(validPrefix)) {
    const stepId = fid.slice(validPrefix.length);
    const step = state.steps.find(s => s.id === stepId);
    return step && step.valid ? 'true' : 'false';
  }
  const completePrefix = `${prefix}Complete_`;
  if (fid.startsWith(completePrefix)) {
    const stepId = fid.slice(completePrefix.length);
    const step = state.steps.find(s => s.id === stepId);
    return step && step.complete ? 'true' : 'false';
  }

  return undefined;
}

