import type { FieldValue, LineItemRowState } from '../../../../types';
import { resolveSourceFirstAllocationDisplayFreeQuantity } from '../../../app/sourceFirstAllocations';
import { resolveUtilisationSourceItemKey } from '../../utilisations/sourceFields';
import { hasAvailabilityValue } from './lineItemPresentation';
import {
  computeOptimisticRowMaxQuantity,
  resolveServerCurrentRecordUtilisedQuantity,
  toFiniteNumberValue
} from '../../../app/quantityConstraints';

const hasAuthoritativeFreeQuantity = (row: Record<string, any> | null | undefined): boolean =>
  row?.__ckFreeQuantityAuthoritative === true;

const computeAvailabilityDisplayFreeQuantity = (args: {
  sourceRow: Record<string, any>;
  sourceFieldId: string;
  serverCurrentRecordUtilisedQuantity: number;
  localCurrentRecordUtilisedQuantity: number;
}): number =>
  resolveSourceFirstAllocationDisplayFreeQuantity({
    remainingQuantity: args.sourceRow?.[args.sourceFieldId],
    serverCurrentRecordUtilisedQuantity: args.serverCurrentRecordUtilisedQuantity,
    localCurrentRecordUtilisedQuantity: args.localCurrentRecordUtilisedQuantity,
    explicitFreeQuantity: args.sourceRow?.__ckFreeQuantity,
    allowExplicitFreeQuantity: hasAvailabilityValue(args.sourceRow, args.sourceFieldId),
    forceExplicitFreeQuantity: hasAuthoritativeFreeQuantity(args.sourceRow)
  });

const computeAvailabilityEditableMaxQuantity = (args: {
  sourceRow: Record<string, any>;
  sourceFieldId: string;
  serverCurrentRecordUtilisedQuantity: number;
  localCurrentRecordUtilisedQuantity: number;
  currentRowQuantity: number;
}): number => {
  if (hasAuthoritativeFreeQuantity(args.sourceRow)) {
    const currentUtilisationQuantity = Object.prototype.hasOwnProperty.call(
      args.sourceRow,
      '__ckCurrentUtilisationQuantity'
    )
      ? toFiniteNumberValue(args.sourceRow.__ckCurrentUtilisationQuantity)
      : args.currentRowQuantity;
    return Math.max(0, toFiniteNumberValue(args.sourceRow.__ckFreeQuantity) + currentUtilisationQuantity);
  }
  return computeOptimisticRowMaxQuantity({
    remainingQuantity: args.sourceRow?.[args.sourceFieldId],
    serverCurrentRecordUtilisedQuantity: args.serverCurrentRecordUtilisedQuantity,
    localCurrentRecordUtilisedQuantity: args.localCurrentRecordUtilisedQuantity,
    currentRowQuantity: args.currentRowQuantity
  });
};

export const resolveServerCurrentRecordUtilisedQuantityFromRow = (
  row: Record<string, any> | null | undefined,
  fallbackCurrentRecordUtilisedQuantity: unknown
): number => {
  const hasServerCurrentRecordUtilisedQuantity =
    !!row && Object.prototype.hasOwnProperty.call(row, '__ckServerCurrentRecordUtilisedQuantity');
  return resolveServerCurrentRecordUtilisedQuantity({
    hasExplicitServerCurrentRecordUtilisedQuantity:
      hasServerCurrentRecordUtilisedQuantity ||
      (!!row && Object.prototype.hasOwnProperty.call(row, '__ckCurrentRecordUtilisedQuantity')),
    serverCurrentRecordUtilisedQuantity: hasServerCurrentRecordUtilisedQuantity
      ? row?.__ckServerCurrentRecordUtilisedQuantity
      : row?.__ckCurrentRecordUtilisedQuantity,
    fallbackCurrentRecordUtilisedQuantity
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
  resolveCurrentUtilisationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalUtilisedQuantity: number; currentRowQuantity: number };
  resolveCommittedUtilisationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalUtilisedQuantity: number; currentRowQuantity: number };
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

  const sourceKey = resolveUtilisationSourceItemKey(args.config, args.sourceRow);
  const localUtilisationState = sourceKey
    ? args.resolveCurrentUtilisationStateForSource(args.config, sourceKey, args.parentRowId)
    : { totalUtilisedQuantity: 0, currentRowQuantity: 0 };
  const committedUtilisationState = sourceKey
    ? args.resolveCommittedUtilisationStateForSource(args.config, sourceKey, args.parentRowId)
    : { totalUtilisedQuantity: 0, currentRowQuantity: 0 };
  const localCurrentRecordUtilisedQuantity = localUtilisationState.totalUtilisedQuantity;
  const serverCurrentRecordUtilisedQuantity = resolveServerCurrentRecordUtilisedQuantityFromRow(
    args.sourceRow,
    committedUtilisationState.totalUtilisedQuantity
  );
  const currentRowQuantity = Math.max(
    localUtilisationState.currentRowQuantity,
    toFiniteNumberValue(next[`${args.config?.quantityFieldId || ''}`.trim()])
  );

  const sourceQuantityFieldId = `${availabilityConfig.sourceQuantityFieldId || ''}`.trim();
  const targetQuantityFieldId = `${availabilityConfig.targetQuantityFieldId || ''}`.trim();
  const targetMaxQuantityFieldId = `${availabilityConfig.targetMaxQuantityFieldId || ''}`.trim();
  const resolvedQuantityMaxFieldId = targetMaxQuantityFieldId || targetQuantityFieldId;
  const resolvedQuantityDisplayFieldId = targetMaxQuantityFieldId ? targetQuantityFieldId : '';
  const resolvedQuantityFreeValue = sourceQuantityFieldId
    ? computeAvailabilityDisplayFreeQuantity({
        sourceRow: args.sourceRow,
        sourceFieldId: sourceQuantityFieldId,
        serverCurrentRecordUtilisedQuantity,
        localCurrentRecordUtilisedQuantity
      })
    : 0;
  if (sourceQuantityFieldId && resolvedQuantityMaxFieldId) {
    next[resolvedQuantityMaxFieldId] = computeAvailabilityEditableMaxQuantity({
      sourceRow: args.sourceRow,
      sourceFieldId: sourceQuantityFieldId,
      serverCurrentRecordUtilisedQuantity,
      localCurrentRecordUtilisedQuantity,
      currentRowQuantity
    });
  }
  if (sourceQuantityFieldId && resolvedQuantityDisplayFieldId) {
    next[resolvedQuantityDisplayFieldId] = resolvedQuantityFreeValue;
  }

  const sourcePortionsFieldId = `${availabilityConfig.sourcePortionsFieldId || ''}`.trim();
  const targetPortionsFieldId = `${availabilityConfig.targetPortionsFieldId || ''}`.trim();
  const targetMaxPortionsFieldId = `${availabilityConfig.targetMaxPortionsFieldId || ''}`.trim();
  const resolvedPortionsMaxFieldId = targetMaxPortionsFieldId || targetPortionsFieldId;
  const resolvedPortionsDisplayFieldId = targetMaxPortionsFieldId ? targetPortionsFieldId : '';
  const resolvedPortionsFreeValue = sourcePortionsFieldId
    ? computeAvailabilityDisplayFreeQuantity({
        sourceRow: args.sourceRow,
        sourceFieldId: sourcePortionsFieldId,
        serverCurrentRecordUtilisedQuantity,
        localCurrentRecordUtilisedQuantity
      })
    : 0;
  if (sourcePortionsFieldId && resolvedPortionsMaxFieldId) {
    next[resolvedPortionsMaxFieldId] = computeAvailabilityEditableMaxQuantity({
      sourceRow: args.sourceRow,
      sourceFieldId: sourcePortionsFieldId,
      serverCurrentRecordUtilisedQuantity,
      localCurrentRecordUtilisedQuantity,
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
