import type {
  GuidedStepReservationDraftSyncRequest,
  GuidedStepReservationDraftSyncResult,
  WebFormSubmission
} from '../../../../../types';
import { submit } from '../../../api';

export const buildGuidedReservationDraftSavePayload = (
  request: GuidedStepReservationDraftSyncRequest
): WebFormSubmission => ({
  ...(request.draftPayload || {}),
  __ckMutationPlan: {
    ...((request.draftPayload as any)?.__ckMutationPlan || {}),
    reservationPlan: {
      ...(request.reservationPlan || {}),
      refreshMode: 'none'
    },
    guidedReservationDraftSync: {
      stepId: request.stepId,
      clientMutationSeq: request.clientMutationSeq
    }
  }
});

export const saveGuidedReservationDraft = (
  request: GuidedStepReservationDraftSyncRequest
): Promise<GuidedStepReservationDraftSyncResult> =>
  submit(buildGuidedReservationDraftSavePayload(request) as any) as Promise<GuidedStepReservationDraftSyncResult>;
