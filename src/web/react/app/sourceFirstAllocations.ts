import { matchesWhenClause } from '../../rules/visibility';
import { FieldValue, VisibilityContext } from '../../types';

export type SourceFirstAllocationLabelVisibility = 'multiple' | 'always';

type SourceFirstAllocationRow = Record<string, any>;
type SourceFirstAllocationParentRow = { values?: Record<string, FieldValue> };

const buildSourceFirstAllocationVisibilityContext = (args: {
  sourceRow: SourceFirstAllocationRow;
  parentValues?: Record<string, FieldValue>;
  topValues?: Record<string, FieldValue>;
  lineItems?: Record<string, any[]>;
}): VisibilityContext => ({
  getValue: (fieldId: string) => {
    const normalizedFieldId = (fieldId || '').toString().trim();
    if (!normalizedFieldId) return undefined;
    if (Object.prototype.hasOwnProperty.call(args.sourceRow || {}, normalizedFieldId)) {
      return args.sourceRow[normalizedFieldId];
    }
    if (args.parentValues && Object.prototype.hasOwnProperty.call(args.parentValues, normalizedFieldId)) {
      return args.parentValues[normalizedFieldId];
    }
    if (args.topValues && Object.prototype.hasOwnProperty.call(args.topValues, normalizedFieldId)) {
      return args.topValues[normalizedFieldId];
    }
    return undefined;
  },
  getLineItems: (groupId: string) => (args.lineItems && Array.isArray(args.lineItems[groupId]) ? args.lineItems[groupId] : []),
  getLineItemKeys: () => (args.lineItems ? Object.keys(args.lineItems) : [])
});

export const resolveSourceFirstAllocationLabelVisibility = (
  raw: any
): SourceFirstAllocationLabelVisibility => {
  const normalized = (raw ?? '').toString().trim().toLowerCase();
  return normalized === 'always' ? 'always' : 'multiple';
};

export const shouldShowSourceFirstAllocationLabel = (args: {
  allocationLabelFieldId?: string | null;
  allocationLabelVisibility?: any;
  parentRows: Array<SourceFirstAllocationParentRow>;
}): boolean => {
  const allocationLabelFieldId = (args.allocationLabelFieldId ?? '').toString().trim();
  if (!allocationLabelFieldId) return false;

  const distinctAllocationLabels = Array.from(
    new Set(
      (Array.isArray(args.parentRows) ? args.parentRows : [])
        .map(parentRow => `${parentRow?.values?.[allocationLabelFieldId] ?? ''}`.trim())
        .filter(Boolean)
    )
  );
  if (!distinctAllocationLabels.length) return false;

  const visibility = resolveSourceFirstAllocationLabelVisibility(args.allocationLabelVisibility);
  if (visibility === 'always') return true;
  return distinctAllocationLabels.length > 1;
};

export const filterSourceFirstAllocationRows = (args: {
  rows: SourceFirstAllocationRow[];
  sourceRowsConfig?: {
    includeWhen?: any;
    excludeWhen?: any;
  } | null;
  parentValues?: Record<string, FieldValue>;
  topValues?: Record<string, FieldValue>;
  lineItems?: Record<string, any[]>;
}): SourceFirstAllocationRow[] => {
  const rows = Array.isArray(args.rows) ? args.rows.filter(Boolean) : [];
  if (!rows.length) return [];
  const includeWhen = args.sourceRowsConfig && typeof args.sourceRowsConfig === 'object'
    ? (args.sourceRowsConfig as any).includeWhen
    : null;
  const excludeWhen = args.sourceRowsConfig && typeof args.sourceRowsConfig === 'object'
    ? (args.sourceRowsConfig as any).excludeWhen
    : null;
  if (!includeWhen && !excludeWhen) return rows;

  return rows.filter(sourceRow => {
    const ctx = buildSourceFirstAllocationVisibilityContext({
      sourceRow,
      parentValues: args.parentValues,
      topValues: args.topValues,
      lineItems: args.lineItems
    });
    if (includeWhen && !matchesWhenClause(includeWhen, ctx)) return false;
    if (excludeWhen && matchesWhenClause(excludeWhen, ctx)) return false;
    return true;
  });
};

export const shouldRemoveSourceFirstAllocationOutputWhenExcluded = (config: any): boolean =>
  Boolean(config?.sourceRows && typeof config.sourceRows === 'object' && (config.sourceRows as any).removeOutputWhenExcluded === true);
