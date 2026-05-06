import {
  computeAvailableFromAggregate,
  computeOptimisticAggregateReservedQuantity,
  resolveServerCurrentRecordReservedQuantity,
  toFiniteNumberValue
} from '../../../app/quantityConstraints';
import { resolveSourceFirstAllocationAvailabilityFieldPair } from '../../../app/sourceFirstAllocations';
import { resolveReservationSourceItemKey } from '../../reservations/sourceFields';
import { resolveServerCurrentRecordReservedQuantityFromRow } from './virtualDataSourceRowValues';

type ReservationStateResolver = (
  config: any,
  sourceKey: string,
  currentParentRowId?: string
) => { totalReservedQuantity: number; currentRowQuantity: number };

export type StepDataSourceAvailabilityMutation = {
  dataSourceConfig: any;
  updateItems: (items: Record<string, any>[]) => Record<string, any>[];
};

/**
 * Owner: guided step data-source availability cache mutation.
 * Builds the optimistic cache updater after a local reservation edit.
 */
export const buildStepDataSourceAvailabilityOptimisticMutationAction = (args: {
  config: any;
  sourceRow: Record<string, any>;
  sourceKey: string;
  parentRowId: string;
  serverCurrentRecordReservedQuantity?: number;
  localCurrentRecordReservedQuantity?: number;
  resolveCommittedReservationStateForSource: ReservationStateResolver;
  resolveCurrentReservationStateForSource: ReservationStateResolver;
}): StepDataSourceAvailabilityMutation | null => {
  const availabilityConfig =
    args.config?.availability && typeof args.config.availability === 'object'
      ? args.config.availability
      : null;
  const dataSourceConfig = args.config?.dataSource;
  if (!availabilityConfig || !dataSourceConfig || !args.sourceKey) return null;

  const committedReservationState = args.resolveCommittedReservationStateForSource(
    args.config,
    args.sourceKey,
    args.parentRowId
  );
  const localCurrentRecordReservedQuantity = Object.prototype.hasOwnProperty.call(
    args,
    'localCurrentRecordReservedQuantity'
  )
    ? Math.max(0, toFiniteNumberValue(args.localCurrentRecordReservedQuantity))
    : args.resolveCurrentReservationStateForSource(
        args.config,
        args.sourceKey,
        args.parentRowId
      ).totalReservedQuantity;
  const serverCurrentRecordReservedQuantity = Object.prototype.hasOwnProperty.call(
    args,
    'serverCurrentRecordReservedQuantity'
  )
    ? resolveServerCurrentRecordReservedQuantity({
        hasExplicitServerCurrentRecordReservedQuantity: true,
        serverCurrentRecordReservedQuantity: args.serverCurrentRecordReservedQuantity,
        fallbackCurrentRecordReservedQuantity: committedReservationState.totalReservedQuantity
      })
    : resolveServerCurrentRecordReservedQuantityFromRow(
        args.sourceRow,
        committedReservationState.totalReservedQuantity
      );
  const { remainingFieldId: sourceRemainingFieldId, reservedFieldId: sourceReservedFieldId } =
    resolveSourceFirstAllocationAvailabilityFieldPair(availabilityConfig, args.sourceRow);
  if (!sourceRemainingFieldId || !sourceReservedFieldId) return null;

  const remainingQuantity = toFiniteNumberValue(args.sourceRow?.[sourceRemainingFieldId]);
  const currentReservedQuantity = toFiniteNumberValue(args.sourceRow?.[sourceReservedFieldId]);
  const nextReservedQuantity = computeOptimisticAggregateReservedQuantity({
    reservedQuantity: currentReservedQuantity,
    serverCurrentRecordReservedQuantity,
    localCurrentRecordReservedQuantity
  });
  const nextFreeQuantity = computeAvailableFromAggregate(remainingQuantity, nextReservedQuantity);
  const sourceRecordId = `${args.sourceRow?.id ?? ''}`.trim();

  return {
    dataSourceConfig,
    updateItems: items =>
      items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const matchesRecord = `${item.id ?? ''}`.trim() === sourceRecordId;
        const matchesItem = resolveReservationSourceItemKey(args.config, item) === args.sourceKey;
        if (!matchesRecord || !matchesItem) return item;
        return {
          ...item,
          [sourceReservedFieldId]: nextReservedQuantity,
          // The optimistic aggregate now includes the local current-record reservation.
          // Keep this marker aligned with the aggregate component to avoid subtracting
          // the current record twice on the next visibility render.
          __ckServerCurrentRecordReservedQuantity: localCurrentRecordReservedQuantity,
          __ckCurrentRecordReservedQuantity: localCurrentRecordReservedQuantity,
          __ckFreeQuantity: nextFreeQuantity
        };
      })
  };
};
