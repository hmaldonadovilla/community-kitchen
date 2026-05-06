import React from 'react';

import { peekCachedDataSource } from '../../../../data/dataSources';
import type { FieldValue, LineItemRowState } from '../../../../types';
import type { InventoryAvailabilitySnapshot } from '../../../../../types';
import { shouldRemoveSourceFirstAllocationOutputWhenExcluded } from '../../../app/sourceFirstAllocations';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import {
  GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
  type GuidedStepReservationAvailabilityEventDetail
} from '../../reservations/liveSyncEvents';
import { resolveReservationSourceItemKey } from '../../reservations/sourceFields';

type UseStepDataSourceAvailabilityReconciliationArgs = {
  groupId: string;
  recordId?: string | null;
  currentGuidedStepId?: string | null;
  activeStepDataSourceRows: any[];
  parentRows: LineItemRowState[];
  lineItems: LineItemState;
  language: string;
  stepDataSourceDraftsRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  reservationCommittedValuesRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  resolveDataSourceOutputGroup: (config: any, parentRowId: string) => { key: string; subConfig: any | null } | null;
  resolveStepDataSourceRowsForParent: (config: any, parentRow: LineItemRowState) => any[];
  isStepDataSourceLoading: (config: any) => boolean;
  applyStepDataSourceAvailabilitySnapshots: (snapshots: InventoryAvailabilitySnapshot[] | null | undefined) => void;
  queueStepReservationDraftSnapshotSync: (reason: string, snapshotLineItems?: LineItemState | null) => void;
  syncStepDataSourceOutputRow: (args: {
    config: any;
    parentRow: LineItemRowState;
    sourceRow: Record<string, any>;
    patch: Record<string, FieldValue>;
  }) => LineItemState | null;
  syncStepDataSourceOutputRowWithReservation: (
    args: {
      config: any;
      parentRow: LineItemRowState;
      sourceRow: Record<string, any>;
      patch: Record<string, FieldValue>;
    },
    options?: { skipReservation?: boolean }
  ) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: guided step data-source availability reconciliation.
 * Handles live availability events, stale allocation cleanup, and rejected
 * reservation rollback outside the line-item group renderer shell.
 */
export const useStepDataSourceAvailabilityReconciliation = ({
  groupId,
  recordId,
  currentGuidedStepId,
  activeStepDataSourceRows,
  parentRows,
  lineItems,
  language,
  stepDataSourceDraftsRef,
  reservationCommittedValuesRef,
  buildStepDataSourceDraftKey,
  resolveDataSourceOutputGroup,
  resolveStepDataSourceRowsForParent,
  isStepDataSourceLoading,
  applyStepDataSourceAvailabilitySnapshots,
  queueStepReservationDraftSnapshotSync,
  syncStepDataSourceOutputRow,
  syncStepDataSourceOutputRowWithReservation,
  onDiagnostic
}: UseStepDataSourceAvailabilityReconciliationArgs) => {
  const rollbackRejectedStepReservations = React.useCallback(
    (rejectedReservations: GuidedStepReservationAvailabilityEventDetail['rejectedReservations']): void => {
      const entries = Array.isArray(rejectedReservations) ? rejectedReservations.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length) return;
      const parentRowsForGroup = Array.isArray(lineItems[groupId]) ? lineItems[groupId] : [];
      if (!parentRowsForGroup.length) return;
      const handled = new Set<string>();

      entries.forEach(entry => {
        const sourceParentGroupId = `${entry?.sourceParentGroupId || ''}`.trim();
        if (sourceParentGroupId && sourceParentGroupId !== groupId) return;
        const sourceParentRowId = `${entry?.sourceParentRowId || ''}`.trim();
        const resourceRecordId = `${entry?.resourceRecordId || ''}`.trim();
        const resourceItemId = `${entry?.resourceItemId || ''}`.trim();
        if (!sourceParentRowId || !resourceRecordId) return;
        const parentRow = parentRowsForGroup.find(candidate => `${candidate?.id || ''}`.trim() === sourceParentRowId);
        if (!parentRow) return;

        activeStepDataSourceRows.forEach(config => {
          const outputGroupId = `${config?.outputGroupId || ''}`.trim();
          const rejectedOutputGroupId = `${entry?.sourceOutputGroupId || ''}`.trim();
          if (rejectedOutputGroupId && outputGroupId && rejectedOutputGroupId !== outputGroupId) return;

          const cached = peekCachedDataSource(config?.dataSource, language) as any;
          const items = Array.isArray(cached?.items) ? cached.items : Array.isArray(cached) ? cached : [];
          const sourceRow =
            items.find((item: Record<string, any>) => {
              if (!item || typeof item !== 'object') return false;
              if (`${item.id ?? ''}`.trim() !== resourceRecordId) return false;
              if (!resourceItemId) return true;
              return resolveReservationSourceItemKey(config, item) === resourceItemId;
            }) || null;
          if (!sourceRow) return;

          const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
          const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
          const modeFieldId = `${config?.modeFieldId || ''}`.trim();
          const patch: Record<string, FieldValue> = {};
          if (selectedFieldId) patch[selectedFieldId] = false;
          if (quantityFieldId) patch[quantityFieldId] = null;
          if (modeFieldId) patch[modeFieldId] = null;
          if (!Object.keys(patch).length) return;

          const rollbackKey = [
            outputGroupId,
            sourceParentRowId,
            resourceRecordId,
            resourceItemId
          ].join('::');
          if (handled.has(rollbackKey)) return;
          handled.add(rollbackKey);

          syncStepDataSourceOutputRowWithReservation(
            {
              config,
              parentRow,
              sourceRow,
              patch
            },
            { skipReservation: true }
          );
        });
      });
    },
    [activeStepDataSourceRows, groupId, language, lineItems, syncStepDataSourceOutputRowWithReservation]
  );

  const commitStepReservationValuesForAvailabilitySnapshots = React.useCallback(
    (snapshots: InventoryAvailabilitySnapshot[] | null | undefined): void => {
      const entries = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length || !parentRows.length) return;

      activeStepDataSourceRows.forEach(config => {
        const dataSourceFormKey = `${config?.dataSource?.formKey || ''}`.trim();
        const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
        const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
        const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
        const modeFieldId = `${config?.modeFieldId || ''}`.trim();
        if (!outputKeyFieldId || !quantityFieldId) return;

        entries.forEach(snapshot => {
          if (!snapshot) return;
          if (dataSourceFormKey && dataSourceFormKey !== `${snapshot.resourceFormKey || ''}`.trim()) return;
          const sourceKey = `${snapshot.resourceItemId || ''}`.trim();
          if (!sourceKey) return;

          parentRows.forEach(parentRow => {
            const output = resolveDataSourceOutputGroup(config, parentRow.id);
            if (!output) return;
            const outputRows = Array.isArray(lineItems[output.key]) ? lineItems[output.key] : [];
            const existingOutputRow =
              outputRows.find(row => `${(row.values as any)?.[outputKeyFieldId] ?? ''}`.trim() === sourceKey) || null;
            const draftKey = buildStepDataSourceDraftKey(config, parentRow.id, sourceKey);
            const draftValues = stepDataSourceDraftsRef.current[draftKey] || null;

            if (!existingOutputRow && !draftValues) {
              if (reservationCommittedValuesRef.current[draftKey]) {
                delete reservationCommittedValuesRef.current[draftKey];
              }
              return;
            }

            const outputValues = (existingOutputRow?.values || null) as Record<string, FieldValue> | null;
            const nextValues: Record<string, FieldValue> = {
              ...(outputValues || {}),
              ...(draftValues || {})
            };
            const selected = selectedFieldId
              ? draftValues && Object.prototype.hasOwnProperty.call(draftValues, selectedFieldId)
                ? draftValues[selectedFieldId] === true
                : Boolean(existingOutputRow)
              : true;
            const committedValues: Record<string, FieldValue> = {};
            if (selectedFieldId) committedValues[selectedFieldId] = selected;
            committedValues[quantityFieldId] =
              selected && !isEmptyValue(nextValues[quantityFieldId] as any)
                ? nextValues[quantityFieldId]
                : null;
            if (modeFieldId) {
              committedValues[modeFieldId] =
                selected && !isEmptyValue(nextValues[modeFieldId] as any)
                  ? nextValues[modeFieldId]
                  : null;
            }
            reservationCommittedValuesRef.current[draftKey] = committedValues;
          });
        });
      });
    },
    [
      activeStepDataSourceRows,
      buildStepDataSourceDraftKey,
      lineItems,
      parentRows,
      resolveDataSourceOutputGroup,
      reservationCommittedValuesRef,
      stepDataSourceDraftsRef
    ]
  );

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (!currentGuidedStepId) return;

    const parentRowsForGroup = Array.isArray(lineItems[groupId]) ? lineItems[groupId] : [];
    if (!parentRowsForGroup.length) return;

    const staleEntries: Array<{
      config: any;
      parentRow: LineItemRowState;
      keyFieldId: string;
      sourceKey: string;
    }> = [];
    const seen = new Set<string>();

    activeStepDataSourceRows.forEach(config => {
      if (!shouldRemoveSourceFirstAllocationOutputWhenExcluded(config)) return;
      if (isStepDataSourceLoading(config)) return;
      const cached = peekCachedDataSource(config?.dataSource, language);
      if (!cached) return;
      const keyFieldId = `${config?.rowKeyFieldId || ''}`.trim();
      const outputKeyFieldId = `${config?.outputKeyFieldId || keyFieldId}`.trim();
      if (!keyFieldId || !outputKeyFieldId) return;

      parentRowsForGroup.forEach(parentRow => {
        const output = resolveDataSourceOutputGroup(config, parentRow.id);
        if (!output) return;
        const outputRows = Array.isArray(lineItems[output.key]) ? lineItems[output.key] : [];
        if (!outputRows.length) return;

        const eligibleSourceKeys = new Set(
          resolveStepDataSourceRowsForParent(config, parentRow)
            .map(sourceRow => `${sourceRow?.[keyFieldId] ?? ''}`.trim())
            .filter(Boolean)
        );

        outputRows.forEach(outputRow => {
          const sourceKey = `${(outputRow?.values as any)?.[outputKeyFieldId] ?? ''}`.trim();
          if (!sourceKey || eligibleSourceKeys.has(sourceKey)) return;
          const staleKey = [`${config?.id || ''}`.trim(), `${parentRow.id || ''}`.trim(), sourceKey].join('::');
          if (seen.has(staleKey)) return;
          seen.add(staleKey);
          staleEntries.push({ config, parentRow, keyFieldId, sourceKey });
        });
      });
    });

    if (!staleEntries.length) return;

    let syncedLineItems: LineItemState | null = null;
    staleEntries.forEach(entry => {
      const selectedFieldId = `${entry.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${entry.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${entry.config?.modeFieldId || ''}`.trim();
      const patch: Record<string, FieldValue> = {};
      if (selectedFieldId) patch[selectedFieldId] = false;
      if (quantityFieldId) patch[quantityFieldId] = null;
      if (modeFieldId) patch[modeFieldId] = null;
      if (!Object.keys(patch).length) return;

      onDiagnostic?.('dataSourceRows.sourceFirst.outputRemovedWhenExcluded', {
        groupId,
        stepId: currentGuidedStepId,
        configId: `${entry.config?.id || ''}`.trim() || null,
        parentRowId: entry.parentRow.id,
        sourceKey: entry.sourceKey
      });

      const nextSyncedLineItems = syncStepDataSourceOutputRow({
        config: entry.config,
        parentRow: entry.parentRow,
        sourceRow: { [entry.keyFieldId]: entry.sourceKey },
        patch
      });
      if (nextSyncedLineItems) syncedLineItems = nextSyncedLineItems;
    });

    const reason = `sourceRowExcluded:${staleEntries.map(entry => entry.sourceKey).join(',')}`;
    queueStepReservationDraftSnapshotSync(reason, syncedLineItems);
  }, [
    activeStepDataSourceRows,
    currentGuidedStepId,
    groupId,
    isStepDataSourceLoading,
    language,
    lineItems,
    onDiagnostic,
    queueStepReservationDraftSnapshotSync,
    resolveDataSourceOutputGroup,
    resolveStepDataSourceRowsForParent,
    syncStepDataSourceOutputRow
  ]);

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const currentRecordId = `${recordId || ''}`.trim();
    const handleAvailability = (event: Event) => {
      const detail = (event as CustomEvent<GuidedStepReservationAvailabilityEventDetail>)?.detail;
      if (!detail || !Array.isArray(detail.availability) || !detail.availability.length) return;
      if (currentRecordId && `${detail.recordId || ''}`.trim() !== currentRecordId) return;
      if (currentGuidedStepId && `${detail.stepId || ''}`.trim() && `${detail.stepId || ''}`.trim() !== currentGuidedStepId) return;
      applyStepDataSourceAvailabilitySnapshots(detail.availability);
      if (!detail.rejectedReservations?.length) {
        commitStepReservationValuesForAvailabilitySnapshots(detail.availability);
      }
      rollbackRejectedStepReservations(detail.rejectedReservations);
    };
    window.addEventListener(
      GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
      handleAvailability as EventListener
    );
    return () => {
      window.removeEventListener(
        GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
        handleAvailability as EventListener
      );
    };
  }, [
    activeStepDataSourceRows.length,
    applyStepDataSourceAvailabilitySnapshots,
    commitStepReservationValuesForAvailabilitySnapshots,
    currentGuidedStepId,
    recordId,
    rollbackRejectedStepReservations
  ]);
};
