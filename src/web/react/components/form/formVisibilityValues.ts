import type { FieldValue, LineItemRowState } from '../../../types';
import { getSystemFieldValue, type SystemRecordMeta } from '../../../rules/systemFields';
import { resolveVirtualStepField, type GuidedStepsVirtualState } from '../../features/steps/domain/resolveVirtualStepField';
import type { LineItemState } from '../../types';

type ResolveTopValueArgs = {
  fieldId: string;
  sourceValues: Record<string, FieldValue>;
  guidedVirtualState?: GuidedStepsVirtualState | null;
  resolveDataSourceCountValue: (fieldId: string) => FieldValue | undefined;
  recordMeta?: SystemRecordMeta | null;
};

type ResolveVisibilityValueArgs = ResolveTopValueArgs & {
  lineItems: LineItemState;
};

const isFilledValue = (value: FieldValue | undefined): value is FieldValue =>
  value !== undefined && value !== null && value !== '';

export const resolveTopValueFromSources = ({
  fieldId,
  sourceValues,
  guidedVirtualState,
  resolveDataSourceCountValue,
  recordMeta
}: ResolveTopValueArgs): FieldValue | undefined => {
  if (guidedVirtualState) {
    const virtual = resolveVirtualStepField(fieldId, guidedVirtualState as any);
    if (virtual !== undefined) return virtual as FieldValue;
  }
  const dataSourceCount = resolveDataSourceCountValue(fieldId);
  if (dataSourceCount !== undefined) return dataSourceCount;
  const direct = sourceValues[fieldId];
  if (isFilledValue(direct)) return direct;
  const sys = getSystemFieldValue(fieldId, recordMeta);
  if (sys !== undefined) return sys as FieldValue;
  return undefined;
};

export const resolveVisibilityValueFromSources = ({
  lineItems,
  ...args
}: ResolveVisibilityValueArgs): FieldValue | undefined => {
  const topValue = resolveTopValueFromSources(args);
  if (topValue !== undefined) return topValue;
  for (const rows of Object.values(lineItems)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const value = (row as LineItemRowState).values[args.fieldId];
      if (isFilledValue(value)) return value;
    }
  }
  return undefined;
};
