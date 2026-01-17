import { FollowupStatusConfig } from '../../../types';
import { StatusTransitionKey, resolveStatusTransitionKey } from '../../../domain/statusTransitions';

/**
 * Status pill helpers (UI-only).
 * Responsibility: map a record status text to a known status transition key.
 */
const STATUS_PILL_KEYS: StatusTransitionKey[] = ['onClose', 'inProgress', 'reOpened'];

export const resolveStatusPillKey = (
  statusText: string | null | undefined,
  transitions: FollowupStatusConfig | undefined
): StatusTransitionKey | null => {
  return resolveStatusTransitionKey(statusText, transitions, {
    includeDefaultOnClose: true,
    keys: STATUS_PILL_KEYS
  });
};
