import { matchesWhenClause } from '../../rules/visibility';
import { FieldValue, VisibilityContext } from '../../types';
import {
  computeOptimisticFreeQuantity,
  resolveServerCurrentRecordUtilisedQuantity,
  toFiniteNumberValue
} from './quantityConstraints';

export type SourceFirstAllocationLabelVisibility = 'multiple' | 'always';
export type SourceFirstRowSortMode = 'source' | 'alphabetical';

type SourceFirstAllocationRow = Record<string, any>;
type SourceFirstAllocationParentRow = { values?: Record<string, FieldValue> };

const normalizeIdValue = (raw: any): string => (raw === undefined || raw === null ? '' : String(raw).trim());

const toExplicitFiniteNumberValue = (raw: unknown): number | null => {
  if (typeof raw === 'string' && !raw.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};

const numericValuesMatch = (left: unknown, right: unknown): boolean =>
  Math.abs(toFiniteNumberValue(left) - toFiniteNumberValue(right)) < 1e-9;

const hasStructuredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

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

export const resolveSourceFirstRowSortMode = (raw: any): SourceFirstRowSortMode => {
  const normalized = (raw ?? '').toString().trim().toLowerCase();
  return normalized === 'alphabetical' ? 'alphabetical' : 'source';
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

export const resolveSourceFirstAllocationAvailabilityFieldPair = (
  availabilityConfig: any,
  sourceRow: Record<string, any> | null | undefined
): { remainingFieldId: string } => {
  const candidates = [
    {
      remainingFieldId: normalizeIdValue(availabilityConfig?.sourcePortionsFieldId)
    },
    {
      remainingFieldId: normalizeIdValue(availabilityConfig?.sourceQuantityFieldId)
    }
  ].filter(candidate => candidate.remainingFieldId);

  if (!candidates.length) {
    return { remainingFieldId: '' };
  }

  return (
    candidates.find(candidate =>
      hasStructuredValue(sourceRow?.[candidate.remainingFieldId])
    ) || candidates[0]
  );
};

export const resolveSourceFirstAllocationDisplayFreeQuantity = (args: {
  remainingQuantity: unknown;
  serverCurrentRecordUtilisedQuantity?: unknown;
  localCurrentRecordUtilisedQuantity?: unknown;
  explicitFreeQuantity?: unknown;
  allowExplicitFreeQuantity?: boolean;
  forceExplicitFreeQuantity?: boolean;
}): number => {
  const explicitFreeQuantity = toExplicitFiniteNumberValue(args.explicitFreeQuantity);
  if (args.forceExplicitFreeQuantity === true && explicitFreeQuantity !== null) {
    return explicitFreeQuantity;
  }
  if (
    args.allowExplicitFreeQuantity !== false &&
    explicitFreeQuantity !== null &&
    numericValuesMatch(args.localCurrentRecordUtilisedQuantity, args.serverCurrentRecordUtilisedQuantity)
  ) {
    return explicitFreeQuantity;
  }
  return computeOptimisticFreeQuantity({
    remainingQuantity: args.remainingQuantity,
    serverCurrentRecordUtilisedQuantity: args.serverCurrentRecordUtilisedQuantity,
    localCurrentRecordUtilisedQuantity: args.localCurrentRecordUtilisedQuantity
  });
};

export const decorateSourceFirstAllocationRowForVisibility = (args: {
  row: SourceFirstAllocationRow;
  availabilityConfig?: any;
  localCurrentRecordUtilisedQuantity?: unknown;
  committedCurrentRecordUtilisedQuantity?: unknown;
  serverCurrentRecordUtilisedQuantityOverride?: unknown;
}): SourceFirstAllocationRow => {
  const row = args.row;
  if (!row || typeof row !== 'object') return row;

  const localCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.localCurrentRecordUtilisedQuantity));
  const committedCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.committedCurrentRecordUtilisedQuantity));
  const hasServerOverride =
    args.serverCurrentRecordUtilisedQuantityOverride !== undefined &&
    args.serverCurrentRecordUtilisedQuantityOverride !== null;
  const hasServerCurrentRecordUtilisedQuantity = Object.prototype.hasOwnProperty.call(
    row,
    '__ckServerCurrentRecordUtilisedQuantity'
  );
  const serverCurrentRecordUtilisedQuantity = hasServerOverride
    ? Math.max(0, toFiniteNumberValue(args.serverCurrentRecordUtilisedQuantityOverride))
    : resolveServerCurrentRecordUtilisedQuantity({
        hasExplicitServerCurrentRecordUtilisedQuantity:
          hasServerCurrentRecordUtilisedQuantity ||
          Object.prototype.hasOwnProperty.call(row, '__ckCurrentRecordUtilisedQuantity'),
        serverCurrentRecordUtilisedQuantity: hasServerCurrentRecordUtilisedQuantity
          ? row.__ckServerCurrentRecordUtilisedQuantity
          : row.__ckCurrentRecordUtilisedQuantity,
        fallbackCurrentRecordUtilisedQuantity: committedCurrentRecordUtilisedQuantity
      });

  const availabilityConfig =
    args.availabilityConfig && typeof args.availabilityConfig === 'object' ? args.availabilityConfig : null;
  const { remainingFieldId } = resolveSourceFirstAllocationAvailabilityFieldPair(availabilityConfig, row);
  const forceExplicitFreeQuantity = row.__ckFreeQuantityAuthoritative === true;
  const nextFreeQuantity =
    remainingFieldId
      ? resolveSourceFirstAllocationDisplayFreeQuantity({
          remainingQuantity: row[remainingFieldId],
          serverCurrentRecordUtilisedQuantity,
          localCurrentRecordUtilisedQuantity,
          explicitFreeQuantity: row.__ckFreeQuantity,
          forceExplicitFreeQuantity
        })
      : row.__ckFreeQuantity;

  const currentUtilisationUnchanged = toFiniteNumberValue(row.__ckCurrentRecordUtilisedQuantity) === localCurrentRecordUtilisedQuantity;
  const serverUtilisationUnchanged =
    toFiniteNumberValue(row.__ckServerCurrentRecordUtilisedQuantity) === serverCurrentRecordUtilisedQuantity;
  const nextFreeUnchanged =
    nextFreeQuantity === undefined
      ? row.__ckFreeQuantity === undefined
      : toFiniteNumberValue(row.__ckFreeQuantity) === toFiniteNumberValue(nextFreeQuantity);
  if (currentUtilisationUnchanged && serverUtilisationUnchanged && nextFreeUnchanged) return row;

  return {
    ...row,
    __ckServerCurrentRecordUtilisedQuantity: serverCurrentRecordUtilisedQuantity,
    __ckCurrentRecordUtilisedQuantity: localCurrentRecordUtilisedQuantity,
    ...(nextFreeQuantity === undefined ? {} : { __ckFreeQuantity: nextFreeQuantity })
  };
};

export const resolveSourceFirstAllocationUtilisationVisibilityScope = (args: {
  localTotalUtilisedQuantity?: unknown;
  committedTotalUtilisedQuantity?: unknown;
}): {
  localCurrentRecordUtilisedQuantity: number;
  committedCurrentRecordUtilisedQuantity: number;
} => ({
  localCurrentRecordUtilisedQuantity: Math.max(0, toFiniteNumberValue(args.localTotalUtilisedQuantity)),
  committedCurrentRecordUtilisedQuantity: Math.max(0, toFiniteNumberValue(args.committedTotalUtilisedQuantity))
});

export const shouldRemoveSourceFirstAllocationOutputWhenExcluded = (config: any): boolean =>
  Boolean(config?.sourceRows && typeof config.sourceRows === 'object' && (config.sourceRows as any).removeOutputWhenExcluded === true);

const inferSourceFirstUtilisationFieldId = (outputKeyFieldId: string, suffix: 'RECORD_ID'): string => {
  const base = outputKeyFieldId.endsWith('_ID') ? outputKeyFieldId.slice(0, -3) : outputKeyFieldId;
  return base ? `${base}_${suffix}` : '';
};

/**
 * Active utilisation output rows must survive datasource visibility churn.
 * A later explicit user deselect removes the row through the normal mutation
 * path; source-row cleanup must not silently release a server utilisation.
 */
export const shouldPreserveSourceFirstAllocationOutputWhenExcluded = (args: {
  config: any;
  outputRow?: { values?: Record<string, any> } | null;
}): boolean => {
  const config = args.config || {};
  const utilisationConfig =
    config?.utilisation && typeof config.utilisation === 'object'
      ? config.utilisation
      : null;
  if (!utilisationConfig || utilisationConfig.enabled === false) return false;

  const values = (args.outputRow?.values || {}) as Record<string, any>;
  const selectedFieldId = normalizeIdValue(config?.selectedFieldId);
  if (
    selectedFieldId &&
    Object.prototype.hasOwnProperty.call(values, selectedFieldId) &&
    values[selectedFieldId] === false
  ) {
    return false;
  }

  const outputKeyFieldId = normalizeIdValue(config?.outputKeyFieldId || config?.rowKeyFieldId);
  const quantityFieldId = normalizeIdValue(config?.quantityFieldId);
  const resourceRecordIdFieldId = normalizeIdValue(
    utilisationConfig.resourceRecordIdFieldId || inferSourceFirstUtilisationFieldId(outputKeyFieldId, 'RECORD_ID')
  );
  const outputKey = outputKeyFieldId ? normalizeIdValue(values[outputKeyFieldId]) : '';
  const resourceRecordId = resourceRecordIdFieldId ? normalizeIdValue(values[resourceRecordIdFieldId]) : '';
  const quantity = quantityFieldId ? toFiniteNumberValue(values[quantityFieldId]) : 0;

  return Boolean(outputKey && resourceRecordId && quantity > 0);
};
