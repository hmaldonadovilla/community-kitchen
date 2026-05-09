import { FieldValue } from '../../types';
import { LineItemState } from '../types';
import { ROW_ID_KEY } from './lineItems';
import type { UploadDraftPayloadTarget } from './submission';

export type UploadTransactionTarget = UploadDraftPayloadTarget;

export type UploadValuesMeta = {
  top?: Record<string, string>;
  line?: Array<{ groupId?: string; rowId?: string; fieldId?: string; value?: string }>;
};

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return String(raw).trim();
  } catch {
    return '';
  }
};

export const resolveUploadTransactionTarget = (args: {
  scope?: 'top' | 'line' | string | null;
  questionId?: string | null;
  groupId?: string | null;
  rowId?: string | null;
  fieldId?: string | null;
}): UploadTransactionTarget | null => {
  if (args.scope === 'top' && args.questionId) {
    return { scope: 'top', questionId: args.questionId };
  }
  if (args.scope === 'line' && args.groupId && args.rowId && args.fieldId) {
    return { scope: 'line', groupId: args.groupId, rowId: args.rowId, fieldId: args.fieldId };
  }
  return null;
};

export const splitUploadValue = (raw: unknown): string[] => {
  const trimmed = normalizeString(raw);
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return Array.from(new Set(commaParts));
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return Array.from(new Set(matches.map(match => match.trim()).filter(Boolean)));
  return [trimmed];
};

export const extractUploadValueFromMeta = (
  uploadValues: UploadValuesMeta | null | undefined,
  target: UploadTransactionTarget
): string | null => {
  if (!uploadValues) return null;
  if (target.scope === 'top') {
    const value = uploadValues.top?.[target.questionId];
    return value === undefined || value === null ? null : normalizeString(value);
  }
  const match = (uploadValues.line || []).find(
    entry =>
      normalizeString(entry.groupId) === target.groupId &&
      normalizeString(entry.rowId) === target.rowId &&
      normalizeString(entry.fieldId) === target.fieldId
  );
  return match ? normalizeString(match.value) : null;
};

export const applyUploadValueToFormState = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  target: UploadTransactionTarget;
  value: string;
  items?: Array<string | File>;
}): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  const items = (args.items || splitUploadValue(args.value)) as unknown as FieldValue;
  const target = args.target;
  if (target.scope === 'top') {
    return {
      values: {
        ...args.values,
        [target.questionId]: items
      },
      lineItems: args.lineItems
    };
  }

  const rows = args.lineItems[target.groupId] || [];
  const nextRows = rows.map(row => {
    if (row.id !== target.rowId) return row;
    return {
      ...row,
      values: {
        ...(row.values || {}),
        [target.fieldId]: items
      }
    };
  });
  return {
    values: args.values,
    lineItems: {
      ...args.lineItems,
      [target.groupId]: nextRows
    }
  };
};

const cloneRows = (rows: any[]): any[] => (Array.isArray(rows) ? rows.map(row => ({ ...(row || {}) })) : []);

const rowIdMatches = (row: any, rowId: string): boolean =>
  normalizeString(row?.[ROW_ID_KEY] || row?.id) === normalizeString(rowId);

export const applyUploadValueToPayloadValues = (args: {
  payloadValues: Record<string, any>;
  target: UploadTransactionTarget;
  value: string;
}): Record<string, any> => {
  const nextValues = { ...(args.payloadValues || {}) };
  if (args.target.scope === 'top') {
    nextValues[args.target.questionId] = args.value;
    return nextValues;
  }

  const parts = args.target.groupId.split('::').filter(Boolean);
  const rootGroupId = parts[0] || args.target.groupId;
  const rootRows = cloneRows(nextValues[rootGroupId] || []);
  let currentRows = rootRows;

  for (let index = 1; index < parts.length; index += 2) {
    const parentRowId = parts[index] || '';
    const subGroupId = parts[index + 1] || '';
    if (!parentRowId || !subGroupId) break;
    const parentIndex = currentRows.findIndex(row => rowIdMatches(row, parentRowId));
    if (parentIndex < 0) {
      currentRows = [];
      break;
    }
    const parentRow = { ...(currentRows[parentIndex] || {}) };
    parentRow[subGroupId] = cloneRows(parentRow[subGroupId] || []);
    currentRows[parentIndex] = parentRow;
    currentRows = parentRow[subGroupId];
  }

  const targetIndex = currentRows.findIndex(row => rowIdMatches(row, args.target.scope === 'line' ? args.target.rowId : ''));
  if (targetIndex >= 0 && args.target.scope === 'line') {
    currentRows[targetIndex] = {
      ...(currentRows[targetIndex] || {}),
      [args.target.fieldId]: args.value
    };
  }
  nextValues[rootGroupId] = rootRows;
  nextValues[`${rootGroupId}_json`] = JSON.stringify(rootRows);
  return nextValues;
};

const normalizeForFingerprint = (raw: any): any => {
  if (raw === undefined) return null;
  if (raw === null) return null;
  if (typeof File !== 'undefined' && raw instanceof File) {
    return {
      __file: true,
      name: raw.name,
      size: raw.size,
      lastModified: raw.lastModified,
      type: raw.type || ''
    };
  }
  if (Array.isArray(raw)) return raw.map(item => normalizeForFingerprint(item));
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeForFingerprint(raw[key]);
        return acc;
      }, {} as Record<string, any>);
  }
  return raw;
};

export const buildUploadNonTargetFingerprint = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  target: UploadTransactionTarget;
}): string => {
  const values = { ...(args.values || {}) } as Record<string, any>;
  const lineItems = Object.keys(args.lineItems || {}).reduce((acc, key) => {
    acc[key] = (args.lineItems[key] || []).map(row => ({ ...row, values: { ...(row.values || {}) } }));
    return acc;
  }, {} as LineItemState);

  const target = args.target;
  if (target.scope === 'top') {
    values[target.questionId] = '__ckUploadTarget';
  } else {
    lineItems[target.groupId] = (lineItems[target.groupId] || []).map(row => {
      if (row.id !== target.rowId) return row;
      return {
        ...row,
        values: {
          ...(row.values || {}),
          [target.fieldId]: '__ckUploadTarget'
        }
      };
    });
  }

  return JSON.stringify({
    values: normalizeForFingerprint(values),
    lineItems: normalizeForFingerprint(lineItems)
  });
};

export const uploadCompletionMatchesCurrentDraft = (args: {
  completedDraftFingerprint?: { recordId?: string | null; fingerprint?: string | null } | null;
  currentDraftFingerprint?: { recordId?: string | null; fingerprint?: string | null } | null;
}): boolean => {
  const completedRecordId = normalizeString(args.completedDraftFingerprint?.recordId);
  const currentRecordId = normalizeString(args.currentDraftFingerprint?.recordId);
  const completedFingerprint = normalizeString(args.completedDraftFingerprint?.fingerprint);
  const currentFingerprint = normalizeString(args.currentDraftFingerprint?.fingerprint);
  return Boolean(
    completedRecordId &&
      currentRecordId &&
      completedRecordId === currentRecordId &&
      completedFingerprint &&
      currentFingerprint &&
      completedFingerprint === currentFingerprint
  );
};
