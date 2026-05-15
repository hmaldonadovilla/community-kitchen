import type { LineItemFieldConfig, LineItemRowState } from '../../types';

export type LineItemRowSortDirection = 'asc' | 'desc';
export type LineItemRowSortEmptyPlacement = 'first' | 'last';
export type LineItemRowSortMode = 'auto' | 'text' | 'number';
export type LineItemRowSortNewRows = 'sort' | 'firstUntilSave';

export interface LineItemRowSortConfig {
  fieldId?: string;
  direction?: LineItemRowSortDirection;
  empty?: LineItemRowSortEmptyPlacement;
  mode?: LineItemRowSortMode;
  newRows?: LineItemRowSortNewRows;
}

const normalizeText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ');
  return value.toString().trim();
};

const isNumericField = (field: LineItemFieldConfig | undefined, mode: LineItemRowSortMode): boolean =>
  mode === 'number' || (mode === 'auto' && field?.type === 'NUMBER');

export const applyLineItemRowSort = (args: {
  rows: LineItemRowState[];
  fields?: LineItemFieldConfig[];
  config?: LineItemRowSortConfig | null;
}): LineItemRowState[] => {
  const { rows, fields = [], config } = args;
  const fieldId = normalizeText(config?.fieldId);
  if (!fieldId || rows.length < 2) return rows;

  const field = fields.find(candidate => candidate.id === fieldId);
  const direction = config?.direction === 'desc' ? -1 : 1;
  const emptyPlacement = config?.empty === 'first' ? 'first' : 'last';
  const mode = config?.mode === 'number' || config?.mode === 'text' ? config.mode : 'auto';
  const numeric = isNumericField(field, mode);
  const keepNewRowsFirst = config?.newRows === 'firstUntilSave';

  const decorated = rows.map((row, index) => {
    const raw = (row.values || {})[fieldId];
    const text = normalizeText(raw);
    const numberValue = numeric ? Number(text) : NaN;
    return {
      row,
      index,
      text,
      empty: text === '',
      numberValue
    };
  });

  decorated.sort((left, right) => {
    if (left.empty || right.empty) {
      if (left.empty && right.empty) return left.index - right.index;
      return left.empty === (emptyPlacement === 'first') ? -1 : 1;
    }

    if (numeric && Number.isFinite(left.numberValue) && Number.isFinite(right.numberValue)) {
      const delta = left.numberValue - right.numberValue;
      if (delta !== 0) return delta * direction;
    }

    const labelCompare = left.text.localeCompare(right.text, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
    if (labelCompare !== 0) return labelCompare * direction;
    return left.index - right.index;
  });

  if (!keepNewRowsFirst) return decorated.map(entry => entry.row);

  const localAdded = decorated
    .filter(entry => Number.isFinite(entry.row.localAddedAtMs))
    .sort((left, right) => {
      const delta = (right.row.localAddedAtMs || 0) - (left.row.localAddedAtMs || 0);
      return delta !== 0 ? delta : left.index - right.index;
    });
  if (!localAdded.length) return decorated.map(entry => entry.row);

  const localAddedIds = new Set(localAdded.map(entry => entry.row.id));
  return localAdded.map(entry => entry.row).concat(decorated.filter(entry => !localAddedIds.has(entry.row.id)).map(entry => entry.row));
};
