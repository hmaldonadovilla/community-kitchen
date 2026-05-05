export type OverlayFlattenPlacement = 'left' | 'right' | 'below';

export type OverlayFlattenedFieldTargetsResolution =
  | {
      ok: true;
      targetRow: any;
      targetFields: any[];
      rowsFiltered: any[];
    }
  | {
      ok: false;
      reason: 'noRow' | 'multipleRows' | 'noFields';
      rowsFiltered: any[];
      count: number;
    };

export const normalizeOverlayFieldListAction = (raw: unknown): string[] => {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  return list
    .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
    .filter(entry => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};

export const normalizeOverlayFlattenPlacementAction = (raw: unknown): OverlayFlattenPlacement => {
  const placement = (raw || '').toString().trim().toLowerCase();
  if (placement === 'left' || placement === 'right') return placement;
  return 'below';
};

export const resolveOverlayFlattenedFieldTargetsAction = (args: {
  rows: any[];
  rowFilter?: any;
  flattenFields?: string[] | null;
  targetFieldsAll: any[];
  matchesRowFilter: (rowValues: any, filter?: any) => boolean;
}): OverlayFlattenedFieldTargetsResolution => {
  const rowsAll = Array.isArray(args.rows) ? args.rows : [];
  const rowsFiltered = args.rowFilter
    ? rowsAll.filter(row => args.matchesRowFilter(((row as any)?.values || {}) as any, args.rowFilter))
    : rowsAll;

  if (!rowsFiltered.length) {
    return { ok: false, reason: 'noRow', rowsFiltered, count: 0 };
  }
  if (rowsFiltered.length > 1) {
    return { ok: false, reason: 'multipleRows', rowsFiltered, count: rowsFiltered.length };
  }

  const targetRow = rowsFiltered[0];
  const targetFields = (args.flattenFields || [])
    .map(fieldId => args.targetFieldsAll.find(field => field && field.id === fieldId))
    .filter(Boolean);

  if (!targetFields.length) {
    return { ok: false, reason: 'noFields', rowsFiltered, count: 0 };
  }

  return {
    ok: true,
    targetRow,
    targetFields,
    rowsFiltered
  };
};
