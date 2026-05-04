import type { FieldValue } from '../../../../types';
import type { LineItemState } from '../../../types';

export type UploadedFieldValueOverride = {
  scope: 'top' | 'line';
  questionId?: string;
  groupId?: string;
  rowId?: string;
  fieldId?: string;
  items: Array<string | File>;
};

export type UploadedFieldOverrideState = {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
};

/**
 * Projects completed upload values into form state snapshots before business
 * rules evaluate field-change dialogs.
 *
 * Boundary: this module is pure upload/domain logic. It does not know React
 * state, dialog rendering, upload transport, or persistence.
 */
export const applyUploadedFieldOverridesToState = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  overrides: Map<string, UploadedFieldValueOverride>;
}): UploadedFieldOverrideState => {
  const overrides = args.overrides;
  if (!overrides.size) return { values: args.values, lineItems: args.lineItems };
  let nextValues = args.values;
  let nextLineItems = args.lineItems;
  overrides.forEach(entry => {
    if (entry.scope === 'top' && entry.questionId) {
      nextValues = {
        ...nextValues,
        [entry.questionId]: entry.items as unknown as FieldValue
      };
      return;
    }
    if (entry.scope === 'line' && entry.groupId && entry.rowId && entry.fieldId) {
      const rows = nextLineItems[entry.groupId] || [];
      const nextRows = rows.map(row => {
        if (row.id !== entry.rowId) return row;
        return {
          ...row,
          values: {
            ...(row.values || {}),
            [entry.fieldId as string]: entry.items
          }
        };
      });
      nextLineItems = {
        ...nextLineItems,
        [entry.groupId]: nextRows
      };
    }
  });
  return { values: nextValues, lineItems: nextLineItems };
};
