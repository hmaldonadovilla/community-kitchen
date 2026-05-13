import type { FieldValue, LineItemRowState } from '../../../../types';
import { resolveSourceFirstAllocationDisplayFreeQuantity } from '../../../app/sourceFirstAllocations';
import { resolveReservationSourceItemKey } from '../../reservations/sourceFields';
import { hasAvailabilityPairValue } from './lineItemPresentation';
import {
  computeOptimisticRowMaxQuantity,
  resolveServerCurrentRecordReservedQuantity,
  toFiniteNumberValue
} from '../../../app/quantityConstraints';

export const resolveServerCurrentRecordReservedQuantityFromRow = (
  row: Record<string, any> | null | undefined,
  fallbackCurrentRecordReservedQuantity: unknown
): number => {
  const hasServerCurrentRecordReservedQuantity =
    !!row && Object.prototype.hasOwnProperty.call(row, '__ckServerCurrentRecordReservedQuantity');
  return resolveServerCurrentRecordReservedQuantity({
    hasExplicitServerCurrentRecordReservedQuantity:
      hasServerCurrentRecordReservedQuantity ||
      (!!row && Object.prototype.hasOwnProperty.call(row, '__ckCurrentRecordReservedQuantity')),
    serverCurrentRecordReservedQuantity: hasServerCurrentRecordReservedQuantity
      ? row?.__ckServerCurrentRecordReservedQuantity
      : row?.__ckCurrentRecordReservedQuantity,
    fallbackCurrentRecordReservedQuantity
  });
};

/**
 * Owner: guided source-first virtual row values.
 * Projects a data-source row, existing output row, draft values, and availability
 * metadata into the virtual row consumed by line-item controls.
 */
export const buildVirtualDataSourceRowValuesAction = (args: {
  config: any;
  sourceRow: Record<string, any>;
  outputRow?: LineItemRowState | null;
  draftValues?: Record<string, FieldValue> | null;
  parentRowId?: string;
  resolveCurrentReservationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalReservedQuantity: number; currentRowQuantity: number };
  resolveCommittedReservationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalReservedQuantity: number; currentRowQuantity: number };
}): Record<string, FieldValue> => {
  const sourceFieldMapping =
    args.config?.sourceFieldMapping && typeof args.config.sourceFieldMapping === 'object'
      ? (args.config.sourceFieldMapping as Record<string, string>)
      : {};
  const next: Record<string, FieldValue> = {};
  Object.entries(sourceFieldMapping).forEach(([targetFieldId, sourceFieldId]) => {
    next[targetFieldId] = (args.sourceRow as any)?.[sourceFieldId];
  });
  Object.entries(args.sourceRow || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Object.prototype.hasOwnProperty.call(next, key)) return;
    next[key] = value as FieldValue;
  });
  if (args.outputRow?.values) {
    Object.entries(args.outputRow.values).forEach(([key, value]) => {
      if (value === undefined) return;
      next[key] = value as FieldValue;
    });
  }
  if (args.draftValues) {
    Object.entries(args.draftValues).forEach(([key, value]) => {
      if (value === undefined) return;
      next[key] = value as FieldValue;
    });
  }
  const selectedFieldId = (args.config?.selectedFieldId || '').toString().trim();
  if (selectedFieldId) {
    if (args.draftValues && Object.prototype.hasOwnProperty.call(args.draftValues, selectedFieldId)) {
      next[selectedFieldId] = Boolean((args.draftValues as any)[selectedFieldId]);
    } else {
      next[selectedFieldId] = Boolean(args.outputRow);
    }
  }
  const availabilityConfig =
    args.config?.availability && typeof args.config.availability === 'object'
      ? args.config.availability
      : null;
  if (!availabilityConfig) return next;

  const sourceKey = resolveReservationSourceItemKey(args.config, args.sourceRow);
  const localReservationState = sourceKey
    ? args.resolveCurrentReservationStateForSource(args.config, sourceKey, args.parentRowId)
    : { totalReservedQuantity: 0, currentRowQuantity: 0 };
  const committedReservationState = sourceKey
    ? args.resolveCommittedReservationStateForSource(args.config, sourceKey, args.parentRowId)
    : { totalReservedQuantity: 0, currentRowQuantity: 0 };
  const localCurrentRecordReservedQuantity = localReservationState.totalReservedQuantity;
  const serverCurrentRecordReservedQuantity = resolveServerCurrentRecordReservedQuantityFromRow(
    args.sourceRow,
    committedReservationState.totalReservedQuantity
  );
  const currentRowQuantity = Math.max(
    localReservationState.currentRowQuantity,
    toFiniteNumberValue(next[`${args.config?.quantityFieldId || ''}`.trim()])
  );

  const sourceQuantityFieldId = `${availabilityConfig.sourceQuantityFieldId || ''}`.trim();
  const sourceReservedQuantityFieldId = `${availabilityConfig.sourceReservedQuantityFieldId || ''}`.trim();
  const targetQuantityFieldId = `${availabilityConfig.targetQuantityFieldId || ''}`.trim();
  const targetMaxQuantityFieldId = `${availabilityConfig.targetMaxQuantityFieldId || ''}`.trim();
  const resolvedQuantityMaxFieldId = targetMaxQuantityFieldId || targetQuantityFieldId;
  const resolvedQuantityDisplayFieldId = targetMaxQuantityFieldId ? targetQuantityFieldId : '';
  const resolvedQuantityFreeValue = sourceQuantityFieldId
    ? resolveSourceFirstAllocationDisplayFreeQuantity({
        remainingQuantity: (args.sourceRow as any)?.[sourceQuantityFieldId],
        reservedQuantity: sourceReservedQuantityFieldId ? (args.sourceRow as any)?.[sourceReservedQuantityFieldId] : 0,
        serverCurrentRecordReservedQuantity,
        localCurrentRecordReservedQuantity,
        explicitFreeQuantity: (args.sourceRow as any)?.__ckFreeQuantity,
        allowExplicitFreeQuantity: hasAvailabilityPairValue(
          args.sourceRow,
          sourceQuantityFieldId,
          sourceReservedQuantityFieldId
        )
      })
    : 0;
  if (sourceQuantityFieldId && resolvedQuantityMaxFieldId) {
    next[resolvedQuantityMaxFieldId] = computeOptimisticRowMaxQuantity({
      remainingQuantity: (args.sourceRow as any)?.[sourceQuantityFieldId],
      reservedQuantity: sourceReservedQuantityFieldId ? (args.sourceRow as any)?.[sourceReservedQuantityFieldId] : 0,
      serverCurrentRecordReservedQuantity,
      localCurrentRecordReservedQuantity,
      currentRowQuantity
    });
  }
  if (sourceQuantityFieldId && resolvedQuantityDisplayFieldId) {
    next[resolvedQuantityDisplayFieldId] = resolvedQuantityFreeValue;
  }

  const sourcePortionsFieldId = `${availabilityConfig.sourcePortionsFieldId || ''}`.trim();
  const sourceReservedPortionsFieldId = `${availabilityConfig.sourceReservedPortionsFieldId || ''}`.trim();
  const targetPortionsFieldId = `${availabilityConfig.targetPortionsFieldId || ''}`.trim();
  const targetMaxPortionsFieldId = `${availabilityConfig.targetMaxPortionsFieldId || ''}`.trim();
  const resolvedPortionsMaxFieldId = targetMaxPortionsFieldId || targetPortionsFieldId;
  const resolvedPortionsDisplayFieldId = targetMaxPortionsFieldId ? targetPortionsFieldId : '';
  const resolvedPortionsFreeValue = sourcePortionsFieldId
    ? resolveSourceFirstAllocationDisplayFreeQuantity({
        remainingQuantity: (args.sourceRow as any)?.[sourcePortionsFieldId],
        reservedQuantity: sourceReservedPortionsFieldId ? (args.sourceRow as any)?.[sourceReservedPortionsFieldId] : 0,
        serverCurrentRecordReservedQuantity,
        localCurrentRecordReservedQuantity,
        explicitFreeQuantity: (args.sourceRow as any)?.__ckFreeQuantity,
        allowExplicitFreeQuantity: hasAvailabilityPairValue(
          args.sourceRow,
          sourcePortionsFieldId,
          sourceReservedPortionsFieldId
        )
      })
    : 0;
  if (sourcePortionsFieldId && resolvedPortionsMaxFieldId) {
    next[resolvedPortionsMaxFieldId] = computeOptimisticRowMaxQuantity({
      remainingQuantity: (args.sourceRow as any)?.[sourcePortionsFieldId],
      reservedQuantity: sourceReservedPortionsFieldId ? (args.sourceRow as any)?.[sourceReservedPortionsFieldId] : 0,
      serverCurrentRecordReservedQuantity,
      localCurrentRecordReservedQuantity,
      currentRowQuantity
    });
  }
  if (sourcePortionsFieldId && resolvedPortionsDisplayFieldId) {
    next[resolvedPortionsDisplayFieldId] = resolvedPortionsFreeValue;
  }
  const targetFreeQuantityFieldId = `${availabilityConfig.targetFreeQuantityFieldId || ''}`.trim();
  if (sourceQuantityFieldId && targetFreeQuantityFieldId) {
    next[targetFreeQuantityFieldId] = resolvedQuantityFreeValue;
  }
  const targetFreePortionsFieldId = `${availabilityConfig.targetFreePortionsFieldId || ''}`.trim();
  if (sourcePortionsFieldId && targetFreePortionsFieldId) {
    next[targetFreePortionsFieldId] = resolvedPortionsFreeValue;
  }
  return next;
};
