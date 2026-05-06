import type { FieldValue } from '../../../../types';
import { isEmptyValue } from '../../../utils/values';
import { toFiniteNumberValue } from '../../../app/quantityConstraints';

/**
 * Owner: guided reservation quantity visibility.
 * Resolves local and committed reservation quantities from draft/output values
 * without depending on React state or data-source IO.
 */
export const resolveReservationQuantityFromValues = (
  values: Record<string, FieldValue> | null | undefined,
  selectedFieldId: string,
  quantityFieldId: string
): number => {
  if (!values || !quantityFieldId) return 0;
  const selected =
    !selectedFieldId ||
    !Object.prototype.hasOwnProperty.call(values, selectedFieldId) ||
    values[selectedFieldId] === true;
  return selected ? toFiniteNumberValue(values[quantityFieldId]) : 0;
};

export const resolveLocalReservationQuantityForVisibility = (args: {
  draftValues?: Record<string, FieldValue> | null;
  outputValues?: Record<string, FieldValue> | null;
  committedValues?: Record<string, FieldValue> | null;
  selectedFieldId: string;
  quantityFieldId: string;
}): number => {
  const localQuantity = resolveReservationQuantityFromValues(
    args.draftValues || args.outputValues || null,
    args.selectedFieldId,
    args.quantityFieldId
  );
  if (!args.draftValues || localQuantity > 0 || !args.quantityFieldId) return localQuantity;
  if (!Object.prototype.hasOwnProperty.call(args.draftValues, args.quantityFieldId)) return localQuantity;
  if (!isEmptyValue(args.draftValues[args.quantityFieldId] as any)) return localQuantity;
  const selected =
    !args.selectedFieldId ||
    !Object.prototype.hasOwnProperty.call(args.draftValues, args.selectedFieldId) ||
    args.draftValues[args.selectedFieldId] === true;
  if (!selected) return localQuantity;
  return resolveReservationQuantityFromValues(
    args.committedValues || args.outputValues || null,
    args.selectedFieldId,
    args.quantityFieldId
  );
};
