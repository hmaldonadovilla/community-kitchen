import type {
  GuidedStepUtilisationDraftSyncRequest,
  GuidedStepUtilisationDraftSyncResult,
  WebFormSubmission
} from '../../../../../types';
import { submit } from '../../../api';

export const buildGuidedUtilisationDraftSavePayload = (
  request: GuidedStepUtilisationDraftSyncRequest
): WebFormSubmission => ({
  ...(request.draftPayload || {}),
  __ckMutationPlan: {
    ...((request.draftPayload as any)?.__ckMutationPlan || {}),
    utilisationPlan: {
      ...(request.utilisationPlan || {}),
      refreshMode: 'none'
    },
    guidedUtilisationDraftSync: {
      stepId: request.stepId,
      clientMutationSeq: request.clientMutationSeq
    }
  }
});

export const saveGuidedUtilisationDraft = (
  request: GuidedStepUtilisationDraftSyncRequest
): Promise<GuidedStepUtilisationDraftSyncResult> =>
  submit(buildGuidedUtilisationDraftSavePayload(request) as any) as Promise<GuidedStepUtilisationDraftSyncResult>;
