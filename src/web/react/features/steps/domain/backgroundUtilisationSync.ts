import type { StepNavigationConfig } from '../../../../../types';

export const shouldQueueBackgroundUtilisationSyncOnAdvance = (
  navigation?: StepNavigationConfig | null
): boolean => navigation?.backgroundUtilisationSyncOnAdvance !== false;
