import type { InventoryAvailabilitySnapshot } from '../../../../types';

export const GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT = 'ck:guidedStepReservationAvailability';

export interface GuidedStepRejectedReservationDetail {
  sourceParentGroupId?: string;
  sourceParentRowId?: string;
  sourceOutputGroupId?: string;
  sourceOutputRowId?: string;
  sourceOutputKeyFieldId?: string;
  resourceRecordId: string;
  resourceItemId?: string;
}

export interface GuidedStepReservationAvailabilityEventDetail {
  stepId: string;
  recordId: string;
  availability: InventoryAvailabilitySnapshot[];
  rejectedReservations?: GuidedStepRejectedReservationDetail[];
}
