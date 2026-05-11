import type {
  StepMilestoneActionConfig,
  SystemActionGateDialogActionConfig,
  WebFormDefinition
} from '../../../../types';

export const CONFIGURED_DIALOG_ACTION_GUIDED_STEP_MILESTONE = 'guidedStepMilestone';
export const CONFIGURED_DIALOG_ACTION_FORM_SUBMIT = 'formSubmit';

export type ConfiguredDialogGuidedStepMilestoneResolution =
  | {
      ok: true;
      actionType: 'guidedStepMilestone';
      actionId: string;
      stepId: string;
      milestoneAction: StepMilestoneActionConfig;
    }
  | {
      ok: false;
      reason: 'unsupportedAction' | 'missingMilestone';
      actionType: string;
      actionId: string;
      stepId: string;
    };

const trimString = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

export const resolveConfiguredDialogGuidedStepMilestone = (args: {
  definition: WebFormDefinition;
  action: SystemActionGateDialogActionConfig;
}): ConfiguredDialogGuidedStepMilestoneResolution => {
  const actionType = trimString(args.action?.type);
  const actionId = trimString(args.action?.id);
  const stepId = trimString(args.action?.stepId);
  if (actionType !== CONFIGURED_DIALOG_ACTION_GUIDED_STEP_MILESTONE) {
    return {
      ok: false,
      reason: 'unsupportedAction',
      actionType,
      actionId,
      stepId
    };
  }

  const stepItems = Array.isArray((args.definition as any)?.steps?.items)
    ? ((args.definition as any).steps.items as any[])
    : [];
  const targetStep = stepItems.find(step => trimString(step?.id) === stepId);
  const milestoneAction = targetStep?.navigation?.milestoneAction as StepMilestoneActionConfig | undefined;
  if (!stepId || !milestoneAction) {
    return {
      ok: false,
      reason: 'missingMilestone',
      actionType,
      actionId,
      stepId
    };
  }

  return {
    ok: true,
    actionType: CONFIGURED_DIALOG_ACTION_GUIDED_STEP_MILESTONE,
    actionId,
    stepId,
    milestoneAction
  };
};
