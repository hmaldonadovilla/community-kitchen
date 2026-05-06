import { useCallback, useMemo } from 'react';

import type { FieldValue, VisibilityContext } from '../../../types';
import type { SystemRecordMeta } from '../../../rules/systemFields';
import type { GuidedStepsVirtualState } from '../../features/steps/domain/resolveVirtualStepField';
import type { LineItemState } from '../../types';
import { resolveTopValueFromSources, resolveVisibilityValueFromSources } from './formVisibilityValues';

type UseFormVisibilityResolversArgs = {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  guidedVirtualState?: GuidedStepsVirtualState | null;
  resolveDataSourceCountValue: (fieldId: string) => FieldValue | undefined;
  recordMeta?: SystemRecordMeta | null;
};

type UseFormVisibilityResolversResult = {
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  topVisibilityCtx: VisibilityContext;
  resolveTopValueNoScan: (sourceValues: Record<string, FieldValue>, fieldId: string) => FieldValue | undefined;
  getTopValueNoScan: (fieldId: string) => FieldValue | undefined;
};

/**
 * Owner: form visibility value resolution.
 * Centralizes top-value and visibility-value source precedence so renderers
 * can consume stable callbacks without duplicating source lookup logic.
 */
export const useFormVisibilityResolvers = ({
  values,
  lineItems,
  guidedVirtualState,
  resolveDataSourceCountValue,
  recordMeta
}: UseFormVisibilityResolversArgs): UseFormVisibilityResolversResult => {
  const resolveVisibilityValue = useCallback(
    (fieldId: string): FieldValue | undefined =>
      resolveVisibilityValueFromSources({
        fieldId,
        sourceValues: values,
        guidedVirtualState,
        resolveDataSourceCountValue,
        recordMeta,
        lineItems
      }),
    [guidedVirtualState, lineItems, recordMeta, resolveDataSourceCountValue, values]
  );

  const topVisibilityCtx = useMemo(
    () => ({
      getValue: (fieldId: string) => resolveVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveVisibilityValue]
  );

  const resolveTopValueNoScan = useCallback(
    (sourceValues: Record<string, FieldValue>, fieldId: string): FieldValue | undefined =>
      resolveTopValueFromSources({
        fieldId,
        sourceValues,
        guidedVirtualState,
        resolveDataSourceCountValue,
        recordMeta
      }),
    [guidedVirtualState, recordMeta, resolveDataSourceCountValue]
  );

  const getTopValueNoScan = useCallback(
    (fieldId: string): FieldValue | undefined => resolveTopValueNoScan(values, fieldId),
    [resolveTopValueNoScan, values]
  );

  return {
    resolveVisibilityValue,
    topVisibilityCtx,
    resolveTopValueNoScan,
    getTopValueNoScan
  };
};
