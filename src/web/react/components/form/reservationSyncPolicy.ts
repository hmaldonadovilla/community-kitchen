export const getReservationCommitMode = (reservationConfig: any): 'immediate' | 'step' => {
  const raw = (reservationConfig?.commitMode || '').toString().trim().toLowerCase();
  return raw === 'step' ? 'step' : 'immediate';
};

export const isStepReservationCommitEnabled = (reservationConfig: any): boolean =>
  getReservationCommitMode(reservationConfig) === 'step';

export const shouldDeferReservationSync = (args: {
  patch: Record<string, any>;
  selectedFieldId?: string;
  quantityFieldId?: string;
}): boolean => {
  const selectedFieldId = (args.selectedFieldId || '').toString().trim();
  const quantityFieldId = (args.quantityFieldId || '').toString().trim();
  if (!quantityFieldId) return false;
  const patch = args.patch || {};
  const touchesQuantity = Object.prototype.hasOwnProperty.call(patch, quantityFieldId);
  const touchesSelection = !!selectedFieldId && Object.prototype.hasOwnProperty.call(patch, selectedFieldId);
  return touchesQuantity && !touchesSelection;
};

export const buildReservationFailureMessage = (
  rawMessage: string,
  fallback: string,
  lockFailureFallback?: string
): string => {
  const message = (rawMessage || '').toString().trim();
  const normalized = message.toLowerCase();
  const isLockFailure =
    normalized.includes('reservation transaction lock') ||
    normalized.includes('record save lock') ||
    normalized.includes('please retry');
  if (isLockFailure) {
    return (lockFailureFallback || fallback || message).toString().trim();
  }
  return message || fallback;
};
