import { useEffect, type MutableRefObject } from 'react';
import type {
  StepMilestoneActionConfig,
  SystemActionGateDialogActionConfig,
  WebFormDefinition
} from '../../../../types';
import {
  CONFIGURED_DIALOG_ACTION_FORM_SUBMIT,
  resolveConfiguredDialogGuidedStepMilestone
} from '../domain/configuredDialogActions';

type StatusLevel = 'info' | 'success' | 'error' | null;

export type ConfiguredDialogActionRunnerMeta = {
  source: 'confirm' | 'cancel';
  kind: string;
  refId: string;
};

export type ConfiguredDialogActionRunner = (
  action: SystemActionGateDialogActionConfig,
  meta: ConfiguredDialogActionRunnerMeta
) => Promise<void>;

type GuidedStepMilestoneResult = {
  success?: boolean;
  message?: unknown;
};

export const useConfiguredDialogActionRunner = (args: {
  runnerRef: MutableRefObject<ConfiguredDialogActionRunner | null>;
  definition: WebFormDefinition;
  handleGuidedStepMilestone: (args: {
    stepId: string;
    action: StepMilestoneActionConfig;
  }) => Promise<GuidedStepMilestoneResult | void>;
  runFormSubmit: () => void | Promise<void>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  setStatus: (message: string) => void;
  setStatusLevel: (level: StatusLevel) => void;
}) => {
  const { definition, handleGuidedStepMilestone, logEvent, runFormSubmit, runnerRef, setStatus, setStatusLevel } = args;

  useEffect(() => {
    const runner: ConfiguredDialogActionRunner = async (action, meta) => {
      const actionType = (action?.type || '').toString().trim();
      const actionId = (action?.id || '').toString().trim();
      if (actionType === CONFIGURED_DIALOG_ACTION_FORM_SUBMIT) {
        logEvent('configuredDialog.action.formSubmit.begin', {
          actionId: actionId || null,
          source: meta.source,
          kind: meta.kind,
          refId: meta.refId
        });
        await runFormSubmit();
        logEvent('configuredDialog.action.formSubmit.done', {
          actionId: actionId || null,
          source: meta.source,
          kind: meta.kind,
          refId: meta.refId
        });
        return;
      }

      const resolution = resolveConfiguredDialogGuidedStepMilestone({ definition, action });
      if (!resolution.ok) {
        if (resolution.reason === 'unsupportedAction') {
          logEvent('configuredDialog.action.unsupported', {
            actionType: resolution.actionType || null,
            actionId: resolution.actionId || null,
            source: meta.source,
            kind: meta.kind,
            refId: meta.refId
          });
          return;
        }

        const message = 'This action is not available.';
        logEvent('configuredDialog.action.guidedStepMilestone.missing', {
          actionId: resolution.actionId || null,
          stepId: resolution.stepId || null,
          source: meta.source,
          kind: meta.kind,
          refId: meta.refId
        });
        setStatus(message);
        setStatusLevel('error');
        return;
      }

      logEvent('configuredDialog.action.guidedStepMilestone.begin', {
        actionId: resolution.actionId || null,
        stepId: resolution.stepId,
        source: meta.source,
        kind: meta.kind,
        refId: meta.refId
      });

      const outcome = await handleGuidedStepMilestone({
        stepId: resolution.stepId,
        action: resolution.milestoneAction
      });

      if (!outcome?.success) {
        const message = (outcome?.message || 'Could not complete the action.').toString();
        logEvent('configuredDialog.action.guidedStepMilestone.failed', {
          actionId: resolution.actionId || null,
          stepId: resolution.stepId,
          source: meta.source,
          kind: meta.kind,
          refId: meta.refId,
          message
        });
        if (message !== 'cancelled') {
          setStatus(message);
          setStatusLevel('error');
        }
        return;
      }

      logEvent('configuredDialog.action.guidedStepMilestone.done', {
        actionId: resolution.actionId || null,
        stepId: resolution.stepId,
        source: meta.source,
        kind: meta.kind,
        refId: meta.refId
      });
    };

    runnerRef.current = runner;
    return () => {
      if (runnerRef.current === runner) {
        runnerRef.current = null;
      }
    };
  }, [definition, handleGuidedStepMilestone, logEvent, runFormSubmit, runnerRef, setStatus, setStatusLevel]);
};
