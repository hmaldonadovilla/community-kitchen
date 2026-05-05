import type { FieldValue, LangCode, LineItemRowState } from '../../../types';
import type { LineItemState } from '../../types';
import { peekCachedDataSource } from '../../../data/dataSources';
import {
  decorateSourceFirstAllocationRowForVisibility,
  filterSourceFirstAllocationRows,
  resolveSourceFirstAllocationReservationVisibilityScope
} from '../../app/sourceFirstAllocations';
import { buildSubgroupKey } from '../../app/lineItems';
import { resolveReservationSourceItemKey } from '../../features/reservations/sourceFields';
import { matchesDataSourceRowToParent } from './dataSourceRowMatching';

/**
 * Owner: guided source-first data-source rows.
 * Builds display-ready data-source rows and parent-scoped filtering without
 * coupling the row projection logic to the LineItemGroupQuestion render body.
 */
export const decorateStepDataSourceRowForVisibilityAction = (args: {
  config: any;
  sourceRow: Record<string, any>;
  groupId: string;
  parentRows: LineItemRowState[];
  lineItems: LineItemState;
  stepDataSourceDrafts: Record<string, Record<string, FieldValue> | null | undefined>;
  reservationCommittedValues: Record<string, Record<string, FieldValue> | null | undefined>;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  resolveLocalReservationQuantityForVisibility: (args: {
    draftValues?: Record<string, FieldValue> | null;
    outputValues?: Record<string, FieldValue> | null;
    committedValues?: Record<string, FieldValue> | null;
    selectedFieldId: string;
    quantityFieldId: string;
  }) => number;
  resolveReservationQuantityFromValues: (
    values: Record<string, FieldValue> | null | undefined,
    selectedFieldId: string,
    quantityFieldId: string
  ) => number;
}): Record<string, any> => {
  const {
    config,
    sourceRow,
    groupId,
    parentRows,
    lineItems,
    stepDataSourceDrafts,
    reservationCommittedValues,
    buildStepDataSourceDraftKey,
    resolveLocalReservationQuantityForVisibility,
    resolveReservationQuantityFromValues
  } = args;
  const availabilityConfig =
    config?.availability && typeof config.availability === 'object'
      ? config.availability
      : null;
  if (!availabilityConfig) return sourceRow;

  const outputGroupId = `${config?.outputGroupId || ''}`.trim();
  const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
  const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
  const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
  const sourceKey = resolveReservationSourceItemKey(config, sourceRow);
  if (!outputGroupId || !outputKeyFieldId || !quantityFieldId || !sourceKey) {
    return decorateSourceFirstAllocationRowForVisibility({
      row: sourceRow,
      availabilityConfig
    });
  }

  let localTotalReservedQuantity = 0;
  let committedTotalReservedQuantity = 0;

  parentRows.forEach(parentRow => {
    const outputKey = buildSubgroupKey(groupId, parentRow.id, outputGroupId);
    const outputRows = Array.isArray(lineItems[outputKey]) ? lineItems[outputKey] : [];
    const existingOutputRow =
      outputRows.find(candidate => `${(candidate.values as any)?.[outputKeyFieldId] ?? ''}`.trim() === sourceKey) || null;
    const outputValues = existingOutputRow?.values as Record<string, FieldValue> | undefined;
    const draftKey = buildStepDataSourceDraftKey(config, parentRow.id, sourceKey);
    const draftValues = stepDataSourceDrafts[draftKey] || null;
    const committedValues = reservationCommittedValues[draftKey] || null;
    const localQuantity = resolveLocalReservationQuantityForVisibility({
      draftValues,
      outputValues: outputValues || null,
      committedValues,
      selectedFieldId,
      quantityFieldId
    });
    const committedQuantity = resolveReservationQuantityFromValues(
      committedValues || outputValues || null,
      selectedFieldId,
      quantityFieldId
    );

    localTotalReservedQuantity += localQuantity;
    committedTotalReservedQuantity += committedQuantity;
  });

  const visibilityScope = resolveSourceFirstAllocationReservationVisibilityScope({
    localTotalReservedQuantity,
    committedTotalReservedQuantity
  });

  return decorateSourceFirstAllocationRowForVisibility({
    row: sourceRow,
    availabilityConfig,
    localCurrentRecordReservedQuantity: visibilityScope.localCurrentRecordReservedQuantity,
    committedCurrentRecordReservedQuantity: visibilityScope.committedCurrentRecordReservedQuantity
  });
};

export const resolveStepDataSourceRowsAction = (args: {
  config: any;
  currentParentRowId?: string;
  refreshTick: number;
  isStepDataSourceLoading: (config: any) => boolean;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  decorateStepDataSourceRowForVisibility: (
    config: any,
    sourceRow: Record<string, any>,
    currentParentRowId?: string
  ) => Record<string, any>;
}): any[] => {
  const {
    config,
    currentParentRowId,
    refreshTick,
    isStepDataSourceLoading,
    language,
    values,
    lineItems,
    decorateStepDataSourceRowForVisibility
  } = args;
  void refreshTick;
  if (!config?.dataSource || typeof config.dataSource !== 'object') return [];
  if (isStepDataSourceLoading(config)) return [];
  const cached = peekCachedDataSource(config.dataSource, language);
  const items = Array.isArray((cached as any)?.items) ? (cached as any).items : Array.isArray(cached) ? cached : [];
  if (!items.length) return [];
  const rows = items.map((item: any) => decorateStepDataSourceRowForVisibility(config, item, currentParentRowId));
  return filterSourceFirstAllocationRows({
    rows,
    sourceRowsConfig: config?.sourceRows,
    topValues: values,
    lineItems
  });
};

export const resolveStepDataSourceRowsForParentAction = (args: {
  config: any;
  parentRow: LineItemRowState;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  resolveStepDataSourceRows: (config: any, currentParentRowId?: string) => any[];
}): any[] => {
  const { config, parentRow, values, lineItems, resolveStepDataSourceRows } = args;
  const items = resolveStepDataSourceRows(config, parentRow.id);
  if (!items.length) return [];
  const sourceMatchFieldId = (config?.sourceMatchFieldId || '').toString().trim();
  const sourceMatchFieldIds = Array.isArray(config?.sourceMatchFieldIds)
    ? (config.sourceMatchFieldIds as any[]).map(value => `${value || ''}`.trim()).filter(Boolean)
    : [];
  const parentMatchFieldId = (config?.parentMatchFieldId || '').toString().trim();
  const parentMatchValue = parentMatchFieldId ? (parentRow.values as any)?.[parentMatchFieldId] : undefined;
  return filterSourceFirstAllocationRows({
    rows: items,
    sourceRowsConfig: config?.sourceRows,
    parentValues: (parentRow.values || {}) as Record<string, FieldValue>,
    topValues: values,
    lineItems
  }).filter((item: any) => {
    if ((!sourceMatchFieldId && !sourceMatchFieldIds.length) || !parentMatchFieldId) return true;
    return matchesDataSourceRowToParent({
      item,
      sourceMatchFieldId,
      sourceMatchFieldIds,
      parentValue: parentMatchValue,
      mode: (config?.sourceMatchMode || 'equals') as string,
      delimiter: (config?.sourceMatchDelimiter || '').toString()
    });
  });
};
