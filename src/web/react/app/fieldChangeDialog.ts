import {
  FieldChangeDialogConfig,
  FieldChangeDialogTarget,
  FieldValue,
  LineItemFieldConfig,
  WebFormDefinition,
  WebQuestionDefinition,
  WhenClause
} from '../../types';
import { LineItemState } from '../types';
import { matchesWhenClause } from '../../rules/visibility';
import { parseSubgroupKey, resolveSubgroupKey } from './lineItems';

export type FieldChangeDialogScope = 'top' | 'line';

export type FieldChangeDialogSource = {
  dialog?: FieldChangeDialogConfig;
  question?: WebQuestionDefinition;
  field?: LineItemFieldConfig;
  groupId?: string;
  subGroupId?: string;
};

export type FieldChangeDialogTargetUpdate = {
  target: FieldChangeDialogTarget;
  value: FieldValue;
};

export type FieldChangeDialogCancelAction = 'none' | 'discardDraftAndGoHome';

const normalizeId = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

export const resolveFieldChangeDialogCancelAction = (
  dialog?: FieldChangeDialogConfig
): FieldChangeDialogCancelAction => {
  const raw = (dialog as any)?.cancelAction;
  if (raw === undefined || raw === null) return 'none';
  const normalized = raw.toString().trim().toLowerCase();
  if (
    normalized === 'discarddraftandgohome' ||
    normalized === 'discard_draft_and_go_home' ||
    normalized === 'discard-draft-and-go-home'
  ) {
    return 'discardDraftAndGoHome';
  }
  return 'none';
};

const isDialogEmptyValue = (value: FieldValue): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  try {
    if (typeof FileList !== 'undefined' && value instanceof FileList) {
      return value.length === 0;
    }
  } catch (_) {
    // ignore FileList detection failures
  }
  return false;
};

const resolveLineItemFieldConfig = (
  definition: WebFormDefinition,
  groupId: string,
  fieldId: string
): { field?: LineItemFieldConfig; groupId?: string; subGroupId?: string } => {
  const parsed = parseSubgroupKey(groupId);
  if (!parsed) {
    const group = definition.questions.find(q => q.id === groupId);
    const field = group?.lineItemConfig?.fields?.find(f => normalizeId(f?.id) === fieldId);
    return { field, groupId };
  }
  const parent = definition.questions.find(q => q.id === parsed.parentGroupId);
  const subGroups = parent?.lineItemConfig?.subGroups || [];
  const sub = subGroups.find(entry => resolveSubgroupKey(entry) === parsed.subGroupId || normalizeId(entry?.id) === parsed.subGroupId);
  const field = sub?.fields?.find(f => normalizeId(f?.id) === fieldId);
  return { field, groupId: parsed.parentGroupId, subGroupId: parsed.subGroupId };
};

export const resolveFieldChangeDialogSource = (args: {
  definition: WebFormDefinition;
  scope: FieldChangeDialogScope;
  fieldId: string;
  groupId?: string;
}): FieldChangeDialogSource | null => {
  const { definition, scope, fieldId, groupId } = args;
  const normalizedFieldId = normalizeId(fieldId);
  if (!normalizedFieldId) return null;
  if (scope === 'top') {
    const question = definition.questions.find(q => normalizeId(q.id) === normalizedFieldId);
    return question ? { dialog: (question as any)?.changeDialog, question } : null;
  }
  const normalizedGroupId = normalizeId(groupId);
  if (!normalizedGroupId) return null;
  const { field, subGroupId } = resolveLineItemFieldConfig(definition, normalizedGroupId, normalizedFieldId);
  if (!field) return null;
  return { dialog: (field as any)?.changeDialog, field, groupId: normalizedGroupId, subGroupId };
};

const resolveRowValue = (args: {
  fieldId: string;
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  linePrefix?: string;
}): FieldValue | undefined => {
  const { fieldId, rowValues, parentValues, topValues, linePrefix } = args;
  const raw = normalizeId(fieldId);
  const prefix = linePrefix ? `${linePrefix}__` : '';
  const localId = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (Object.prototype.hasOwnProperty.call(rowValues, localId)) return rowValues[localId];
  if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, localId)) return parentValues[localId];
  if (Object.prototype.hasOwnProperty.call(rowValues, raw)) return rowValues[raw];
  if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, raw)) return parentValues[raw];
  if (Object.prototype.hasOwnProperty.call(topValues, raw)) return topValues[raw];
  return undefined;
};

export const evaluateFieldChangeDialogWhen = (args: {
  when: WhenClause | undefined;
  scope: FieldChangeDialogScope;
  fieldId: string;
  groupId?: string;
  rowId?: string;
  nextValue: FieldValue;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
}): boolean => {
  const { when, scope, fieldId, groupId, rowId, nextValue, values, lineItems } = args;
  if (!when) return false;
  const normalizedFieldId = normalizeId(fieldId);
  if (!normalizedFieldId) return false;
  if (isDialogEmptyValue(nextValue)) return false;
  if (scope === 'top') {
    const nextValues = { ...values, [normalizedFieldId]: nextValue };
    return matchesWhenClause(when, {
      getValue: (fid: string) => (nextValues as any)[normalizeId(fid)],
      getLineItems: (key: string) => lineItems[normalizeId(key)] || []
    });
  }
  const normalizedGroupId = normalizeId(groupId);
  const normalizedRowId = normalizeId(rowId);
  if (!normalizedGroupId || !normalizedRowId) return false;
  const rows = lineItems[normalizedGroupId] || [];
  const row = rows.find(r => normalizeId(r.id) === normalizedRowId);
  if (!row) return false;
  const rowValues: Record<string, FieldValue> = { ...row.values, [normalizedFieldId]: nextValue };
  const parsed = parseSubgroupKey(normalizedGroupId);
  const parentValues = (() => {
    if (!parsed) return undefined;
    const parentRows = lineItems[parsed.parentGroupId] || [];
    const parentRow = parentRows.find(r => normalizeId(r.id) === parsed.parentRowId);
    return parentRow?.values || undefined;
  })();
  const ctx = {
    getValue: (fid: string) =>
      resolveRowValue({ fieldId: fid, rowValues, parentValues, topValues: values, linePrefix: normalizedGroupId }),
    getLineItems: (key: string) => lineItems[normalizeId(key)] || [],
    getLineValue: (_rowId: string, fid: string) =>
      resolveRowValue({ fieldId: fid, rowValues, parentValues, topValues: values, linePrefix: normalizedGroupId })
  };
  return matchesWhenClause(when, ctx, { rowId: normalizedRowId, linePrefix: normalizedGroupId });
};

const updateRowField = (
  lineItems: LineItemState,
  groupKey: string,
  rowId: string,
  fieldId: string,
  value: FieldValue
): LineItemState => {
  const rows = lineItems[groupKey] || [];
  const idx = rows.findIndex(r => normalizeId(r.id) === rowId);
  if (idx < 0) return lineItems;
  const nextRows = [...rows];
  const row = nextRows[idx];
  const nextValues = { ...row.values };
  nextValues[fieldId] = value;
  nextRows[idx] = { ...row, values: nextValues };
  return { ...lineItems, [groupKey]: nextRows };
};

export const applyFieldChangeDialogTargets = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  updates: FieldChangeDialogTargetUpdate[];
  context: { scope: FieldChangeDialogScope; groupId?: string; rowId?: string };
}): { values: Record<string, FieldValue>; lineItems: LineItemState; effectOverrides: Record<string, Record<string, FieldValue>> } => {
  const { values, lineItems, updates, context } = args;
  let nextValues = values;
  let nextLineItems = lineItems;
  const effectOverrides: Record<string, Record<string, FieldValue>> = {};
  const normalizedGroupId = normalizeId(context.groupId);
  const normalizedRowId = normalizeId(context.rowId);
  const parsed = normalizedGroupId ? parseSubgroupKey(normalizedGroupId) : null;

  updates.forEach(update => {
    const target = update.target;
    const fieldId = normalizeId(target?.fieldId);
    if (!fieldId) return;
    const value = update.value;
    if (target.scope === 'effect') {
      const effectId = normalizeId(target.effectId);
      if (!effectId) return;
      if (!effectOverrides[effectId]) effectOverrides[effectId] = {};
      effectOverrides[effectId][fieldId] = value;
      return;
    }
    if (target.scope === 'top') {
      if (nextValues === values) nextValues = { ...values };
      (nextValues as any)[fieldId] = value;
      return;
    }
    if (target.scope === 'row') {
      if (!normalizedGroupId || !normalizedRowId) return;
      nextLineItems = updateRowField(nextLineItems, normalizedGroupId, normalizedRowId, fieldId, value);
      return;
    }
    if (target.scope === 'parent') {
      if (parsed?.parentGroupId && parsed?.parentRowId) {
        nextLineItems = updateRowField(nextLineItems, parsed.parentGroupId, parsed.parentRowId, fieldId, value);
      } else {
        if (nextValues === values) nextValues = { ...values };
        (nextValues as any)[fieldId] = value;
      }
    }
  });

  return { values: nextValues, lineItems: nextLineItems, effectOverrides };
};

export const resolveTargetFieldConfig = (args: {
  definition: WebFormDefinition;
  target: FieldChangeDialogTarget;
  context: { scope: FieldChangeDialogScope; groupId?: string };
  selectionEffects?: Array<{ id?: string; groupId: string }>;
}): { field?: LineItemFieldConfig; question?: WebQuestionDefinition } => {
  const { definition, target, context, selectionEffects } = args;
  const fieldId = normalizeId(target?.fieldId);
  if (!fieldId) return {};
  if (target.scope === 'top') {
    const question = definition.questions.find(q => normalizeId(q.id) === fieldId);
    return { question };
  }
  if (target.scope === 'row' || target.scope === 'parent') {
    const groupId = normalizeId(context.groupId);
    if (!groupId) return {};
    const parsed = parseSubgroupKey(groupId);
    const resolvedGroupId = target.scope === 'parent' && parsed ? parsed.parentGroupId : groupId;
    const resolved = resolveLineItemFieldConfig(definition, resolvedGroupId, fieldId);
    return { field: resolved.field };
  }
  if (target.scope === 'effect') {
    const effectId = normalizeId(target.effectId);
    if (!effectId) return {};
    const effect = (selectionEffects || []).find(entry => normalizeId(entry?.id) === effectId);
    if (!effect) return {};
    const resolved = resolveLineItemFieldConfig(definition, effect.groupId, fieldId);
    return { field: resolved.field };
  }
  return {};
};
