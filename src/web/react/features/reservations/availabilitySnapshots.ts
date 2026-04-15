import type { InventoryAvailabilitySnapshot } from '../../../../types';

const toTrimmedString = (value: unknown): string => (value === undefined || value === null ? '' : `${value}`.trim());

const numbersEqual = (left: unknown, right: unknown): boolean => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) || Number.isFinite(rightNumber)) {
    return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
  }
  return left === right;
};

const setWhenChanged = (
  next: Record<string, any>,
  key: string,
  value: unknown,
  changedRef: { changed: boolean }
): void => {
  if (!key) return;
  if (numbersEqual(next[key], value)) return;
  next[key] = value;
  changedRef.changed = true;
};

export const applyInventoryAvailabilitySnapshotToRow = (
  row: Record<string, any>,
  availability: InventoryAvailabilitySnapshot | null | undefined
): Record<string, any> => {
  if (!row || typeof row !== 'object' || !availability) return row;

  const next = { ...row };
  const changedRef = { changed: false };
  const statusFieldId = toTrimmedString(availability.statusFieldId);
  const quantityFieldId = toTrimmedString(availability.quantityFieldId);
  const reservedQuantityFieldId = toTrimmedString(availability.reservedQuantityFieldId);
  const unitFieldId = toTrimmedString(availability.unitFieldId);
  const status = toTrimmedString(availability.status);

  if (statusFieldId && status) {
    setWhenChanged(next, statusFieldId, status, changedRef);
  }
  if (quantityFieldId) {
    setWhenChanged(next, quantityFieldId, availability.remainingQuantity, changedRef);
  }
  if (reservedQuantityFieldId) {
    setWhenChanged(next, reservedQuantityFieldId, availability.reservedQuantity, changedRef);
  }
  if (unitFieldId) {
    const unit = toTrimmedString(availability.unit);
    if (unit) {
      setWhenChanged(next, unitFieldId, unit, changedRef);
    }
  }

  setWhenChanged(next, '__ckCurrentRecordReservedQuantity', availability.currentRecordReservedQuantity, changedRef);
  setWhenChanged(next, '__ckCurrentReservationQuantity', availability.currentReservationQuantity, changedRef);
  setWhenChanged(next, '__ckFreeQuantity', availability.freeQuantity, changedRef);

  return changedRef.changed ? next : row;
};
