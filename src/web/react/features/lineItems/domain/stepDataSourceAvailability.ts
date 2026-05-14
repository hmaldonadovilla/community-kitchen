import {
  computeOptimisticFreeQuantity,
  resolveServerCurrentRecordUtilisedQuantity,
  toFiniteNumberValue
} from '../../../app/quantityConstraints';
import { resolveSourceFirstAllocationAvailabilityFieldPair } from '../../../app/sourceFirstAllocations';
import { resolveUtilisationSourceItemKey } from '../../utilisations/sourceFields';
import { resolveServerCurrentRecordUtilisedQuantityFromRow } from './virtualDataSourceRowValues';

type UtilisationStateResolver = (
  config: any,
  sourceKey: string,
  currentParentRowId?: string
) => { totalUtilisedQuantity: number; currentRowQuantity: number };

export type StepDataSourceAvailabilityMutation = {
  dataSourceConfig: any;
  updateItems: (items: Record<string, any>[]) => Record<string, any>[];
};

export const shouldApplyStepDataSourceAvailabilityOptimisticMutation = (args: {
  patchTouchesUtilisation: boolean;
  hasValidationErrors: boolean;
}): boolean => args.patchTouchesUtilisation && !args.hasValidationErrors;

/**
 * Owner: guided step data-source availability cache mutation.
 * Builds the optimistic cache updater after a local utilisation edit.
 */
export const buildStepDataSourceAvailabilityOptimisticMutationAction = (args: {
  config: any;
  sourceRow: Record<string, any>;
  sourceKey: string;
  parentRowId: string;
  serverCurrentRecordUtilisedQuantity?: number;
  localCurrentRecordUtilisedQuantity?: number;
  resolveCommittedUtilisationStateForSource: UtilisationStateResolver;
  resolveCurrentUtilisationStateForSource: UtilisationStateResolver;
}): StepDataSourceAvailabilityMutation | null => {
  const availabilityConfig =
    args.config?.availability && typeof args.config.availability === 'object'
      ? args.config.availability
      : null;
  const dataSourceConfig = args.config?.dataSource;
  if (!availabilityConfig || !dataSourceConfig || !args.sourceKey) return null;

  const committedUtilisationState = args.resolveCommittedUtilisationStateForSource(
    args.config,
    args.sourceKey,
    args.parentRowId
  );
  const localCurrentRecordUtilisedQuantity = Object.prototype.hasOwnProperty.call(
    args,
    'localCurrentRecordUtilisedQuantity'
  )
    ? Math.max(0, toFiniteNumberValue(args.localCurrentRecordUtilisedQuantity))
    : args.resolveCurrentUtilisationStateForSource(
        args.config,
        args.sourceKey,
        args.parentRowId
      ).totalUtilisedQuantity;
  const serverCurrentRecordUtilisedQuantity = Object.prototype.hasOwnProperty.call(
    args,
    'serverCurrentRecordUtilisedQuantity'
  )
    ? resolveServerCurrentRecordUtilisedQuantity({
        hasExplicitServerCurrentRecordUtilisedQuantity: true,
        serverCurrentRecordUtilisedQuantity: args.serverCurrentRecordUtilisedQuantity,
        fallbackCurrentRecordUtilisedQuantity: committedUtilisationState.totalUtilisedQuantity
      })
    : resolveServerCurrentRecordUtilisedQuantityFromRow(
        args.sourceRow,
        committedUtilisationState.totalUtilisedQuantity
      );
  const { remainingFieldId: sourceRemainingFieldId } = resolveSourceFirstAllocationAvailabilityFieldPair(
    availabilityConfig,
    args.sourceRow
  );
  if (!sourceRemainingFieldId) return null;

  const remainingQuantity = toFiniteNumberValue(args.sourceRow?.[sourceRemainingFieldId]);
  const nextRemainingQuantity = computeOptimisticFreeQuantity({
    remainingQuantity,
    serverCurrentRecordUtilisedQuantity,
    localCurrentRecordUtilisedQuantity
  });
  const sourceRecordId = `${args.sourceRow?.id ?? ''}`.trim();

  return {
    dataSourceConfig,
    updateItems: items =>
      items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const matchesRecord = `${item.id ?? ''}`.trim() === sourceRecordId;
        const matchesItem = resolveUtilisationSourceItemKey(args.config, item) === args.sourceKey;
        if (!matchesRecord || !matchesItem) return item;
        return {
          ...item,
          [sourceRemainingFieldId]: nextRemainingQuantity,
          __ckServerCurrentRecordUtilisedQuantity: localCurrentRecordUtilisedQuantity,
          __ckCurrentRecordUtilisedQuantity: localCurrentRecordUtilisedQuantity,
          __ckFreeQuantity: nextRemainingQuantity,
          __ckFreeQuantityAuthoritative: false
        };
      })
  };
};
