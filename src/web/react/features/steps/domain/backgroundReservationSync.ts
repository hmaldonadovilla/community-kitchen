import type { StepNavigationConfig } from '../../../../../types';

export const shouldQueueBackgroundReservationSyncOnAdvance = (
  navigation?: StepNavigationConfig | null
): boolean => navigation?.backgroundReservationSyncOnAdvance !== false;
