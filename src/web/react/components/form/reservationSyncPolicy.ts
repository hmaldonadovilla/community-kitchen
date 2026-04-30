import type { InventoryAvailabilitySnapshot } from '../../../../types';

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

export const buildReservationFieldPatch = (args: {
  fieldId: string;
  value: any;
  selectedFieldId?: string;
  selectedValue?: unknown;
  quantityFieldId?: string;
}): Record<string, any> => {
  const fieldId = (args.fieldId || '').toString().trim();
  if (!fieldId) return {};
  const patch: Record<string, any> = { [fieldId]: args.value };
  const selectedFieldId = (args.selectedFieldId || '').toString().trim();
  if (!selectedFieldId || selectedFieldId === fieldId) return patch;
  const quantityFieldId = (args.quantityFieldId || '').toString().trim();
  const isQuantityField = !!quantityFieldId && quantityFieldId === fieldId;
  if (isQuantityField && args.selectedValue === true) return patch;
  patch[selectedFieldId] = true;
  return patch;
};

const normalizeReservationValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = `${value}`.trim();
  return text ? text : null;
};

export const shouldImmediatelySyncStepReservationChange = (args: {
  patch: Record<string, any>;
  selectedFieldId?: string;
  quantityFieldId?: string;
  selectedValue?: unknown;
  quantityValue?: unknown;
  hasValidationErrors?: boolean;
}): boolean => {
  const patch = args.patch || {};
  if (!Object.keys(patch).length) return false;

  const selectedFieldId = (args.selectedFieldId || '').toString().trim();
  const quantityFieldId = (args.quantityFieldId || '').toString().trim();
  const touchesQuantity = !!quantityFieldId && Object.prototype.hasOwnProperty.call(patch, quantityFieldId);
  const selected = selectedFieldId
    ? (Object.prototype.hasOwnProperty.call(patch, selectedFieldId) ? patch[selectedFieldId] : args.selectedValue) === true
    : true;

  if (!selected) return true;
  if (!quantityFieldId) return !args.hasValidationErrors;

  const quantityText = normalizeReservationValue(
    touchesQuantity ? patch[quantityFieldId] : args.quantityValue
  );
  if (quantityText === null) return touchesQuantity;
  if (args.hasValidationErrors) return false;

  const quantity = Number(quantityText);
  return Number.isFinite(quantity) && quantity >= 0;
};

export const buildReservationFailureMessage = (
  rawMessage: string,
  fallback: string,
  lockFailureFallback?: string,
  context?: {
    availability?: InventoryAvailabilitySnapshot | null;
    itemId?: string | null;
    itemLabel?: string | null;
    unit?: string | null;
  }
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
  const availability = context?.availability || null;
  const shouldUseAvailabilityMessage =
    !!availability &&
    (!message ||
      normalized.startsWith('only ') ||
      normalized.includes('not available for reservation') ||
      normalized.includes('no longer available'));
  if (shouldUseAvailabilityMessage) {
    const itemId = `${context?.itemId || availability?.resourceItemId || ''}`.trim();
    const itemLabel = `${context?.itemLabel || ''}`.trim();
    const itemDescriptor =
      itemLabel && itemId && itemLabel !== itemId ? `${itemLabel} | ${itemId}` : itemLabel || itemId || 'This leftover item';
    const unit = `${context?.unit || availability?.unit || ''}`.trim();
    const remainingQuantity = Number(availability?.remainingQuantity);
    const reservedQuantity = Number(availability?.reservedQuantity);
    const currentRecordReservedQuantity = Number(availability?.currentRecordReservedQuantity);
    const availableQuantity = Number.isFinite(remainingQuantity) && Number.isFinite(reservedQuantity)
      ? Math.max(
          0,
          remainingQuantity - reservedQuantity + (Number.isFinite(currentRecordReservedQuantity) ? currentRecordReservedQuantity : 0)
        )
      : Math.max(
          0,
          (Number.isFinite(Number(availability?.freeQuantity)) ? Number(availability?.freeQuantity) : 0) +
            (Number.isFinite(currentRecordReservedQuantity) ? currentRecordReservedQuantity : 0)
        );
    const roundedQuantity =
      Math.abs(availableQuantity - Math.round(availableQuantity)) < 1e-9
        ? `${Math.round(availableQuantity)}`
        : availableQuantity.toFixed(2).replace(/\.?0+$/, '');
    const normalizedUnit = unit.toLowerCase();
    const unitLabel =
      roundedQuantity === '1' && normalizedUnit === 'portions'
        ? 'portion'
        : unit;
    const availableWithUnit = [roundedQuantity, unitLabel].filter(Boolean).join(' ').trim() || roundedQuantity;
    const status = `${availability?.status || ''}`.trim().toLowerCase();
    if (status && status !== 'available') {
      return `${itemDescriptor} is no longer available for reservation. Current remaining quantity: ${availableWithUnit}. Adjust the quantity or choose another leftover item.`
        .replace(/\s+/g, ' ')
        .trim();
    }
    return `${itemDescriptor} has only ${availableWithUnit} available. Adjust the quantity or choose another leftover item.`
      .replace(/\s+/g, ' ')
      .trim();
  }
  return message || fallback;
};
