import type { FieldValue } from '../../../../types';
import type { LineItemState } from '../../../types';
import { ROW_ID_KEY } from '../../../app/lineItems';

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

export const toUploadedFieldOverrideUrlString = (items: Array<string | File>): string => {
  const urls: string[] = [];
  const seen = new Set<string>();
  (items || []).forEach(item => {
    if (!item) return;
    if (typeof item === 'string') {
      item
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(url => {
          if (seen.has(url)) return;
          seen.add(url);
          urls.push(url);
        });
      return;
    }
    if (typeof item === 'object' && typeof (item as any).url === 'string') {
      const url = ((item as any).url as string).trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    }
  });
  return urls.join(', ');
};

export const applyUploadedFieldOverridesToPayload = (args: {
  payload: any;
  overrides: Map<string, UploadedFieldValueOverride>;
}): any => {
  const { payload, overrides } = args;
  if (!payload || !overrides.size) return payload;

  const nextPayload = {
    ...payload,
    values: {
      ...(((payload as any)?.values || {}) as Record<string, any>)
    }
  } as any;

  overrides.forEach(entry => {
    const nextValue = toUploadedFieldOverrideUrlString(entry.items);
    if (entry.scope === 'top' && entry.questionId) {
      nextPayload.values[entry.questionId] = nextValue;
      nextPayload[entry.questionId] = nextValue;
      return;
    }
    if (entry.scope === 'line' && entry.groupId && entry.rowId && entry.fieldId) {
      const rawRows = Array.isArray(nextPayload.values[entry.groupId]) ? nextPayload.values[entry.groupId] : [];
      const nextRows = rawRows.map((row: any) => {
        const rowId = ((row?.[ROW_ID_KEY] || row?.id || '') as any).toString();
        if (rowId !== entry.rowId) return row;
        return {
          ...(row || {}),
          [entry.fieldId as string]: nextValue
        };
      });
      const serializedRows = JSON.stringify(nextRows);
      nextPayload.values[entry.groupId] = nextRows;
      nextPayload.values[`${entry.groupId}_json`] = serializedRows;
      nextPayload[entry.groupId] = nextRows;
      nextPayload[`${entry.groupId}_json`] = serializedRows;
    }
  });

  return nextPayload;
};
