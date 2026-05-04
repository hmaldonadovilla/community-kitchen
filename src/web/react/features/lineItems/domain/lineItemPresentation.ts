export type LineItemSortMode = 'alphabetical' | 'source';

/**
 * Owns pure line-item display helpers used by row/list renderers.
 *
 * Keep this boundary free of React, DOM state, transport calls, and mutable
 * component state. Components pass raw config/data in and receive display-ready
 * values back.
 */
export const getByPath = (root: any, path: string): any => {
  if (!root || !path) return undefined;
  return path.split('.').reduce((acc: any, segment: string) => {
    if (acc === undefined || acc === null || typeof acc !== 'object') return undefined;
    if (acc[segment] !== undefined) return acc[segment];
    const normalized = segment.toLowerCase();
    const fallbackKey = Object.keys(acc).find(key => key.toLowerCase() === normalized);
    return fallbackKey ? acc[fallbackKey] : undefined;
  }, root);
};

export const normalizeIdValue = (raw: unknown): string => (raw === undefined || raw === null ? '' : String(raw).trim());

export const formatLineItemTotalValue = (total: { value: number; decimalPlaces?: number; pending?: boolean }): string =>
  total.pending ? '' : total.value.toFixed(total.decimalPlaces || 0);

export const hasAvailabilityPairValue = (
  sourceRow: Record<string, any>,
  remainingFieldId: string,
  reservedFieldId: string
): boolean => {
  const hasValue = (raw: unknown): boolean => {
    if (raw === undefined || raw === null) return false;
    if (typeof raw === 'string') return raw.trim().length > 0;
    return true;
  };
  return hasValue(sourceRow?.[remainingFieldId]) || hasValue(sourceRow?.[reservedFieldId]);
};

export const fieldByIdSafe = (fields: any, fieldId: string): any | null => {
  if (!Array.isArray(fields) || !fieldId) return null;
  return fields.find((field: any) => `${field?.id || ''}`.trim() === fieldId) || null;
};

export const optionSortFor = (field: { optionSort?: any } | undefined): LineItemSortMode => {
  const raw = (field as any)?.optionSort;
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return normalized === 'source' ? 'source' : 'alphabetical';
};

export const listSortFor = (raw: any): LineItemSortMode => {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return normalized === 'alphabetical' ? 'alphabetical' : 'source';
};

export const sortVisibleTextValues = (values: string[], sortMode: LineItemSortMode): string[] => {
  if (sortMode !== 'alphabetical' || values.length < 2) return values;
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  );
};

export const resolveCompactPartType = (part: any): string => {
  if (!part || typeof part !== 'object') return 'text';
  const explicit = (part.type || '').toString().trim().toLowerCase();
  if (explicit) return explicit;
  if (part.fieldId || part.sourcePath) return 'field';
  if (Array.isArray(part.sourcePathAlternatives) && part.sourcePathAlternatives.some((value: any) => `${value || ''}`.trim())) {
    return 'field';
  }
  if (Array.isArray(part.fieldIdAlternatives) && part.fieldIdAlternatives.some((value: any) => `${value || ''}`.trim())) {
    return 'field';
  }
  return 'text';
};
