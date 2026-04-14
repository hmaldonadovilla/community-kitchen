import type { InventoryAvailabilitySnapshot } from '../../../../types';

export const GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT = 'ck:guidedStepReservationAvailability';

export interface GuidedStepReservationAvailabilityEventDetail {
  stepId: string;
  recordId: string;
  availability: InventoryAvailabilitySnapshot[];
}
