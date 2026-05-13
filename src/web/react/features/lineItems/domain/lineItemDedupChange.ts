import type { FieldValue, LangCode, LineItemDedupRule, LineItemRowState } from '../../../../types';
import { findLineItemDedupConflict } from '../../../app/lineItems';
import { resolveLineItemDedupMessage, resolveLineItemDedupValueToken } from './formViewHelpers';

export const resolveLineItemDedupChange = (args: {
  rows: LineItemRowState[];
  rowId: string;
  fieldId: string;
  value: FieldValue;
  rowValues?: Record<string, FieldValue>;
  rules: LineItemDedupRule[];
  language: LangCode;
}): {
  nextRowValues: Record<string, FieldValue>;
  nextRows: LineItemRowState[];
  conflict: { fieldId: string; message: string; fields: string[]; matchRowId: string } | null;
} => {
  const currentRow = args.rows.find(row => row.id === args.rowId);
  const nextRowValues: Record<string, FieldValue> = { ...(args.rowValues || currentRow?.values || {}), [args.fieldId]: args.value };
  const conflict = findLineItemDedupConflict({
    rules: args.rules,
    rows: args.rows,
    rowValues: nextRowValues,
    excludeRowId: args.rowId
  });
  const nextRows = args.rows.map(row => (row.id === args.rowId ? { ...row, values: nextRowValues } : row));
  if (!conflict) return { nextRowValues, nextRows, conflict: null };

  const conflictFieldId = conflict.fields[0];
  const valueToken = resolveLineItemDedupValueToken(nextRowValues, conflictFieldId);
  return {
    nextRowValues,
    nextRows,
    conflict: {
      fieldId: conflictFieldId,
      message: resolveLineItemDedupMessage(conflict.rule, args.language, valueToken ? { value: valueToken } : undefined),
      fields: conflict.fields,
      matchRowId: conflict.matchRow.id
    }
  };
};
