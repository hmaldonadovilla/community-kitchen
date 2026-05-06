import React from 'react';

import type {
  FieldValue,
  LineItemRowState,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import type { LineItemState } from '../../../types';
import { shouldHideSupplementalHelperTextForDataSourceRows } from '../../../components/form/lineItemGroupQuestionHelperText';
import { buildSourceFirstPresentationEntries } from '../domain/sourceFirstPresentationEntries';
import {
  resolveVirtualPresetAction,
  resolveVirtualPresetValueAction
} from '../domain/virtualPreset';
import {
  allowsVirtualIntegerOnlyAction,
  buildVirtualRowWhenContext,
  resolveVirtualMaxFieldIdAction,
  validateVirtualFieldRulesAction
} from '../domain/virtualRowContext';
import {
  resolveLocalReservationQuantityForVisibility,
  resolveReservationQuantityFromValues
} from '../domain/reservationQuantity';
import {
  buildVirtualDataSourceRowValuesAction
} from '../domain/virtualDataSourceRowValues';
import {
  decorateStepDataSourceRowForVisibilityAction,
  resolveDataSourceOutputGroupAction,
  resolveStepDataSourceReservationStateForSourceAction,
  resolveStepDataSourceRowsAction,
  resolveStepDataSourceRowsForParentAction
} from '../domain/stepDataSourceRows';
import { toFiniteNumberValue } from '../../../components/form/quantityConstraints';

type UseStepDataSourceRowProjectionArgs = {
  q: WebQuestionDefinition;
  language: string;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  parentRows: LineItemRowState[];
  sourceFirstDataSourceRows: any[];
  stepDataSourceDrafts: Record<string, Record<string, FieldValue>>;
  stepDataSourceDraftsRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  reservationCommittedValuesRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  stepDataSourceRefreshTick: number;
  isStepDataSourceLoading: (config: any) => boolean;
  hideSupplementalHelperWhenNoSourceRows?: boolean;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: guided step data-source row projection.
 * Resolves source-first row visibility, virtual row values, reservation views,
 * and related datasource callbacks outside the line-item renderer shell.
 */
export const useStepDataSourceRowProjection = ({
  q,
  language,
  values,
  lineItems,
  parentRows,
  sourceFirstDataSourceRows,
  stepDataSourceDrafts,
  stepDataSourceDraftsRef,
  reservationCommittedValuesRef,
  stepDataSourceRefreshTick,
  isStepDataSourceLoading,
  hideSupplementalHelperWhenNoSourceRows,
  resolveTopValue,
  onDiagnostic
}: UseStepDataSourceRowProjectionArgs) => {
  const toFiniteNumber = React.useCallback((value: any): number => toFiniteNumberValue(value), []);

  const resolveVirtualRowWhenContext = React.useCallback(
    (args: {
      rowValues: Record<string, FieldValue>;
      parentValues?: Record<string, FieldValue>;
    }): VisibilityContext => buildVirtualRowWhenContext({ ...args, lineItems, resolveTopValue }),
    [lineItems, resolveTopValue]
  );

  const validateVirtualFieldRules = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues?: Record<string, FieldValue>
    ): string[] => {
      return validateVirtualFieldRulesAction({
        field,
        rowValues,
        parentValues,
        language,
        lineItems,
        resolveTopValue
      });
    },
    [language, lineItems, resolveTopValue]
  );

  const resolveVirtualPresetValue = React.useCallback(
    (
      raw: any,
      args: {
        rowValues: Record<string, FieldValue>;
        parentValues?: Record<string, FieldValue>;
        sourceRow?: Record<string, any>;
      }
    ): FieldValue | undefined => {
      return resolveVirtualPresetValueAction({ raw, context: args, resolveTopValue });
    },
    [resolveTopValue]
  );

  const resolveVirtualPreset = React.useCallback(
    (
      preset: Record<string, any> | undefined,
      args: {
        rowValues: Record<string, FieldValue>;
        parentValues?: Record<string, FieldValue>;
        sourceRow?: Record<string, any>;
      }
    ): Record<string, FieldValue> => {
      return resolveVirtualPresetAction({ preset, context: args, resolveTopValue });
    },
    [resolveTopValue]
  );

  const buildStepDataSourceDraftKey = React.useCallback(
    (config: any, parentRowId: string, sourceKey: string): string => {
      const configId = `${config?.id || 'datasourceRows'}`.trim();
      return `${q.id}::${configId}::${parentRowId}::${sourceKey}`;
    },
    [q.id]
  );

  const resolveDataSourceOutputGroup = React.useCallback(
    (config: any, parentRowId: string): { key: string; subConfig: any | null } | null =>
      resolveDataSourceOutputGroupAction({
        config,
        groupId: q.id,
        subGroups: q.lineItemConfig?.subGroups || [],
        parentRowId
      }),
    [q.id, q.lineItemConfig?.subGroups]
  );

  const resolveReservationStateForSource = React.useCallback(
    (
      config: any,
      sourceKey: string,
      currentParentRowId?: string,
      mode: 'local' | 'committed' = 'local'
    ): { totalReservedQuantity: number; currentRowQuantity: number } => {
      return resolveStepDataSourceReservationStateForSourceAction({
        config,
        sourceKey,
        currentParentRowId,
        mode,
        parentRows,
        lineItems,
        stepDataSourceDrafts: stepDataSourceDraftsRef.current,
        reservationCommittedValues: reservationCommittedValuesRef.current,
        buildStepDataSourceDraftKey,
        resolveDataSourceOutputGroup,
        resolveLocalReservationQuantityForVisibility,
        resolveReservationQuantityFromValues
      });
    },
    [
      buildStepDataSourceDraftKey,
      lineItems,
      parentRows,
      resolveDataSourceOutputGroup,
      reservationCommittedValuesRef,
      stepDataSourceDraftsRef
    ]
  );

  const resolveCurrentReservationStateForSource = React.useCallback(
    (config: any, sourceKey: string, currentParentRowId?: string): { totalReservedQuantity: number; currentRowQuantity: number } =>
      resolveReservationStateForSource(config, sourceKey, currentParentRowId, 'local'),
    [resolveReservationStateForSource]
  );

  const resolveCommittedReservationStateForSource = React.useCallback(
    (config: any, sourceKey: string, currentParentRowId?: string): { totalReservedQuantity: number; currentRowQuantity: number } =>
      resolveReservationStateForSource(config, sourceKey, currentParentRowId, 'committed'),
    [resolveReservationStateForSource]
  );

  const buildVirtualDataSourceRowValues = React.useCallback(
    (args: {
      config: any;
      sourceRow: Record<string, any>;
      outputRow?: LineItemRowState | null;
      draftValues?: Record<string, FieldValue> | null;
      parentRowId?: string;
    }): Record<string, FieldValue> =>
      buildVirtualDataSourceRowValuesAction({
        ...args,
        resolveCurrentReservationStateForSource,
        resolveCommittedReservationStateForSource
      }),
    [resolveCommittedReservationStateForSource, resolveCurrentReservationStateForSource]
  );

  const decorateStepDataSourceRowForVisibility = React.useCallback(
    (config: any, sourceRow: Record<string, any>, _currentParentRowId?: string): Record<string, any> => {
      return decorateStepDataSourceRowForVisibilityAction({
        config,
        sourceRow,
        groupId: q.id,
        parentRows,
        lineItems,
        stepDataSourceDrafts: stepDataSourceDraftsRef.current,
        reservationCommittedValues: reservationCommittedValuesRef.current,
        buildStepDataSourceDraftKey,
        resolveLocalReservationQuantityForVisibility,
        resolveReservationQuantityFromValues
      });
    },
    [buildStepDataSourceDraftKey, lineItems, parentRows, q.id, reservationCommittedValuesRef, stepDataSourceDraftsRef]
  );

  const resolveStepDataSourceRows = React.useCallback(
    (config: any, currentParentRowId?: string): any[] => {
      return resolveStepDataSourceRowsAction({
        config,
        currentParentRowId,
        refreshTick: stepDataSourceRefreshTick,
        isStepDataSourceLoading,
        language,
        values,
        lineItems,
        decorateStepDataSourceRowForVisibility
      });
    },
    [decorateStepDataSourceRowForVisibility, isStepDataSourceLoading, language, lineItems, stepDataSourceRefreshTick, values]
  );

  const resolveStepDataSourceRowsForParent = React.useCallback(
    (config: any, parentRow: LineItemRowState): any[] => {
      return resolveStepDataSourceRowsForParentAction({
        config,
        parentRow,
        values,
        lineItems,
        resolveStepDataSourceRows
      });
    },
    [lineItems, resolveStepDataSourceRows, values]
  );

  const sourceFirstPresentationEntries = React.useMemo(
    () =>
      buildSourceFirstPresentationEntries({
        sourceFirstDataSourceRows,
        stepDataSourceDrafts,
        parentRows,
        values,
        lineItems,
        language,
        isStepDataSourceLoading,
        resolveStepDataSourceRows,
        decorateStepDataSourceRowForVisibility
      }),
    [
      decorateStepDataSourceRowForVisibility,
      isStepDataSourceLoading,
      language,
      lineItems,
      parentRows,
      resolveStepDataSourceRows,
      sourceFirstDataSourceRows,
      stepDataSourceDrafts,
      values
    ]
  );

  const hideSupplementalHelper = React.useMemo(
    () =>
      shouldHideSupplementalHelperTextForDataSourceRows({
        hideWhenNoSourceRows: hideSupplementalHelperWhenNoSourceRows,
        entries: sourceFirstPresentationEntries
      }),
    [hideSupplementalHelperWhenNoSourceRows, sourceFirstPresentationEntries]
  );

  React.useEffect(() => {
    if (!sourceFirstPresentationEntries.length) return;
    sourceFirstPresentationEntries.forEach(entry => {
      if (entry.loading || entry.visibleSourceRows.length || !entry.sourceRows.length) return;
      onDiagnostic?.('dataSourceRows.sourceFirst.empty', {
        groupId: q.id,
        configId: `${entry.config?.id || ''}`.trim(),
        sourceRowCount: entry.sourceRows.length,
        parentRowCount: parentRows.length,
        reason: 'noEligibleParentMatches'
      });
    });
  }, [onDiagnostic, parentRows.length, q.id, sourceFirstPresentationEntries]);

  const resolveVirtualMaxFieldId = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues: Record<string, FieldValue>
    ): string => {
      return resolveVirtualMaxFieldIdAction({ field, rowValues, parentValues, lineItems, resolveTopValue });
    },
    [lineItems, resolveTopValue]
  );

  const allowsVirtualIntegerOnly = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues: Record<string, FieldValue>
    ): boolean => {
      return allowsVirtualIntegerOnlyAction({ field, rowValues, parentValues, lineItems, resolveTopValue });
    },
    [lineItems, resolveTopValue]
  );

  return {
    toFiniteNumber,
    resolveVirtualRowWhenContext,
    validateVirtualFieldRules,
    resolveVirtualPresetValue,
    resolveVirtualPreset,
    buildStepDataSourceDraftKey,
    resolveDataSourceOutputGroup,
    resolveCurrentReservationStateForSource,
    resolveCommittedReservationStateForSource,
    buildVirtualDataSourceRowValues,
    resolveStepDataSourceRowsForParent,
    sourceFirstPresentationEntries,
    hideSupplementalHelper,
    resolveVirtualMaxFieldId,
    allowsVirtualIntegerOnly
  };
};
