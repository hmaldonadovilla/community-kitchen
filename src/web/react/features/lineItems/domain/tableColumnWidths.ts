export type TableColumnStyle = { width: string };

const ACTION_COLUMN_IDS = new Set(['view', 'edit', 'remove', 'actions']);

/**
 * Owns pure table-column width lookup for line-item and overlay tables.
 *
 * Keep this boundary free of React and DOM state. Components pass the configured
 * widths and receive a style-compatible width object when a matching key exists.
 */
export const resolveTableColumnWidthStyle = (
  columnWidths: unknown,
  columnId: string
): TableColumnStyle | undefined => {
  if (!columnWidths || typeof columnWidths !== 'object' || Array.isArray(columnWidths)) return undefined;

  const candidates: string[] = [];
  const pushCandidate = (value?: string) => {
    if (!value) return;
    if (candidates.includes(value)) return;
    candidates.push(value);
  };

  const id = (columnId || '').toString();
  const lower = id.toLowerCase();
  const normalized = id.replace(/^_+/, '');
  const normalizedLower = normalized.toLowerCase();

  pushCandidate(id);
  pushCandidate(lower);
  if (ACTION_COLUMN_IDS.has(normalizedLower)) {
    pushCandidate(`__${normalizedLower}`);
    pushCandidate(`_${normalizedLower}`);
    pushCandidate(normalizedLower);
    pushCandidate('__actions');
    pushCandidate('actions');
  } else {
    pushCandidate(normalized);
    pushCandidate(normalizedLower);
  }

  const rawWidth = candidates.reduce<any>(
    (acc, key) => (acc !== undefined ? acc : (columnWidths as any)[key]),
    undefined
  );
  if (rawWidth === undefined || rawWidth === null) return undefined;
  if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
  const widthValue = rawWidth.toString().trim();
  return widthValue ? { width: widthValue } : undefined;
};
