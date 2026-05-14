import type { BankAvailabilitySnapshot } from '../../../../types';

export const GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT = 'ck:guidedStepUtilisationAvailability';

export interface GuidedStepRejectedUtilisationDetail {
  sourceParentGroupId?: string;
  sourceParentRowId?: string;
  sourceOutputGroupId?: string;
  sourceOutputRowId?: string;
  sourceOutputKeyFieldId?: string;
  resourceRecordId: string;
  resourceItemId?: string;
}

export interface GuidedStepUtilisationAvailabilityEventDetail {
  stepId: string;
  recordId: string;
  availability: BankAvailabilitySnapshot[];
  rejectedUtilisations?: GuidedStepRejectedUtilisationDetail[];
}
