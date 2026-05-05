import { buildLocalizedOptions, optionKey, toOptionSet } from '../../core';
import { resolveLocalizedString } from '../../i18n';
import type {
  FieldChangeDialogConfig,
  FieldValue,
  LangCode,
  SelectionEffect,
  WebFormDefinition
} from '../../types';
import type { FieldChangeDialogInputState } from '../features/fieldChangeDialog/useFieldChangeDialog';
import type { LineItemState, OptionState } from '../types';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { resolveTargetFieldConfig } from './fieldChangeDialog';
import { parseSubgroupKey } from './lineItems';

type FieldChangeDialogInputPending = {
  scope: 'top' | 'line';
  groupId?: string;
  rowId?: string;
  dialog: FieldChangeDialogConfig;
  selectionEffects?: SelectionEffect[];
};

type ResolveOptionGroupKey = (args: {
  targetScope: 'top' | 'row' | 'parent' | 'effect';
  contextGroupId?: string;
  effectGroupId?: string;
}) => string | undefined;

/**
 * Owner: field-change dialog input projection.
 * Converts configured dialog inputs into render-ready state and initial values
 * using the current form state snapshot supplied by App.
 */
export const buildFieldChangeDialogInputsAction = (args: {
  pending: FieldChangeDialogInputPending;
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
  resolveOptionGroupKey: ResolveOptionGroupKey;
}): { inputs: FieldChangeDialogInputState[]; values: Record<string, FieldValue> } => {
  const {
    pending,
    definition,
    values: currentValues,
    lineItems,
    optionState,
    language,
    resolveOptionGroupKey
  } = args;
  const inputs: FieldChangeDialogInputState[] = [];
  const values: Record<string, FieldValue> = {};
  const dialogInputs = pending.dialog?.inputs || [];
  const selectionEffects = (pending.selectionEffects || []).filter(
    (effect): effect is SelectionEffect & { groupId: string } => !!effect?.groupId
  );
  const context = { scope: pending.scope, groupId: pending.groupId };

  const resolveTargetValue = (target: any): FieldValue | undefined => {
    if (!target) return undefined;
    if (target.scope === 'top') return currentValues[target.fieldId];
    if (target.scope === 'row') {
      const rows = pending.groupId ? lineItems[pending.groupId] || [] : [];
      const row = rows.find(rowEntry => rowEntry.id === pending.rowId);
      return row?.values?.[target.fieldId] as FieldValue;
    }
    if (target.scope === 'parent') {
      const parsed = pending.groupId ? parseSubgroupKey(pending.groupId) : null;
      if (parsed) {
        const parentRows = lineItems[parsed.parentGroupId] || [];
        const parentRow = parentRows.find(rowEntry => rowEntry.id === parsed.parentRowId);
        return parentRow?.values?.[target.fieldId] as FieldValue;
      }
      return currentValues[target.fieldId];
    }
    return undefined;
  };

  dialogInputs.forEach(inputCfg => {
    const inputId = (inputCfg?.id || '').toString().trim();
    if (!inputId || !inputCfg?.target) return;
    const target = inputCfg.target as any;
    const effect =
      target.scope === 'effect'
        ? selectionEffects.find(effectEntry => (effectEntry?.id || '').toString().trim() === (target.effectId || '').toString().trim())
        : undefined;
    const { question, field } = resolveTargetFieldConfig({
      definition,
      target,
      context,
      selectionEffects
    });
    const typeRaw = ((inputCfg as any).type || (question as any)?.type || (field as any)?.type || 'TEXT')
      .toString()
      .trim()
      .toUpperCase();
    const type =
      typeRaw === 'PARAGRAPH'
        ? 'paragraph'
        : typeRaw === 'NUMBER'
          ? 'number'
          : typeRaw === 'CHOICE'
            ? 'choice'
            : typeRaw === 'CHECKBOX'
              ? 'checkbox'
              : typeRaw === 'DATE'
                ? 'date'
                : 'text';
    const fallbackLabel = question
      ? resolveLabel(question, language)
      : resolveFieldLabel(field, language, inputId);
    const label = resolveLocalizedString((inputCfg as any).label, language, fallbackLabel || inputId).toString();
    const placeholder = resolveLocalizedString((inputCfg as any).placeholder, language, '').toString().trim() || undefined;

    let options: FieldChangeDialogInputState['options'] = undefined;
    if (type === 'choice' || type === 'checkbox') {
      const optionGroupKey = resolveOptionGroupKey({
        targetScope: target.scope,
        contextGroupId: pending.groupId,
        effectGroupId: effect?.groupId
      });
      const optionSet = question
        ? optionState[optionKey(question.id)] || toOptionSet(question as any)
        : field
          ? optionState[optionKey(field.id, optionGroupKey)] || toOptionSet(field as any)
          : undefined;
      if (optionSet && optionSet.en) {
        const items = buildLocalizedOptions(optionSet as any, optionSet.en as any, language);
        options = items.map(item => ({ value: item.value, label: item.label }));
      }
    }

    inputs.push({
      id: inputId,
      label,
      placeholder,
      type,
      required: (inputCfg as any).required === true,
      options
    });
    const initial = resolveTargetValue(target);
    if (initial !== undefined) {
      values[inputId] = initial;
    }
  });

  return { inputs, values };
};
