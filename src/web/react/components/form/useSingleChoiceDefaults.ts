import type React from 'react';
import { useEffect } from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  toDependencyValue,
  toOptionSet
} from '../../../core';
import type { FieldValue, LangCode, LineItemRowState, OptionSet, WebQuestionDefinition } from '../../../types';
import type { FormErrors, LineItemState, OptionState } from '../../types';
import { isEmptyValue } from '../../utils/values';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

type UseSingleChoiceDefaultsArgs = {
  definitionQuestions: WebQuestionDefinition[];
  language: LangCode;
  optionState: OptionState;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  optionSortFor: (field: { optionSort?: any } | undefined) => 'alphabetical' | 'source';
  onSelectionEffect?: (
    q: WebQuestionDefinition,
    value: FieldValue,
    opts?: { lineItem?: { groupId: string; rowId: string; rowValues: Record<string, FieldValue> } }
  ) => void;
};

/**
 * Owner: automatic single-option defaults.
 * Applies top-level and line-item choice defaults when filters leave exactly
 * one eligible option, while preserving selection effects and error cleanup.
 */
export const useSingleChoiceDefaults = ({
  definitionQuestions,
  language,
  optionState,
  values,
  lineItems,
  setValues,
  setLineItems,
  setErrors,
  optionSortFor,
  onSelectionEffect
}: UseSingleChoiceDefaultsArgs): void => {
  useEffect(() => {
    const pendingDefaults: Array<{ question: WebQuestionDefinition; value: string }> = [];
    definitionQuestions.forEach(q => {
      if (q.type !== 'CHOICE') return;
      const optionSet = getOptionStateValue(optionState, q.id) || toOptionSet(q);
      const allowed = computeAllowedOptions(
        q.optionFilter,
        optionSet,
        (Array.isArray(q.optionFilter?.dependsOn) ? q.optionFilter?.dependsOn : [q.optionFilter?.dependsOn || ''])
          .filter(Boolean)
          .map(dep => toDependencyValue(values[dep as string]))
      );
      const opts = buildLocalizedOptions(optionSet, allowed, language, { sort: optionSortFor(q) });
      if (opts.length === 1 && isEmptyValue(values[q.id]) && values[q.id] !== opts[0].value) {
        pendingDefaults.push({ question: q, value: opts[0].value });
      }
    });
    if (!pendingDefaults.length) return;
    const applied: typeof pendingDefaults = [];
    setValues(prev => {
      let changed = false;
      const next = { ...prev };
      pendingDefaults.forEach(({ question, value }) => {
        if (isEmptyValue(prev[question.id]) && prev[question.id] !== value) {
          next[question.id] = value;
          applied.push({ question, value });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ question }) => {
        if (next[question.id]) {
          delete next[question.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ question, value }) => onSelectionEffect(question, value));
    }
  }, [definitionQuestions, language, onSelectionEffect, optionSortFor, optionState, setErrors, setValues, values]);

  useEffect(() => {
    const pendingLineDefaults: Array<{
      group: WebQuestionDefinition;
      field: any;
      rowId: string;
      value: string;
      rowValues: Record<string, FieldValue>;
    }> = [];
    definitionQuestions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(group => {
        const rows = lineItems[group.id] || [];
        rows.forEach(row => {
          (group.lineItemConfig?.fields || [])
            .filter(field => field.type === 'CHOICE')
            .forEach(field => {
              const optionSetField: OptionSet = resolveOptionSetForField(optionState, field, group.id);
              const dependencyIds = (
                Array.isArray(field.optionFilter?.dependsOn)
                  ? field.optionFilter?.dependsOn
                  : [field.optionFilter?.dependsOn || '']
              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
              const allowedField = computeAllowedOptions(
                field.optionFilter,
                optionSetField,
                dependencyIds.map(dep => toDependencyValue(row.values[dep] ?? values[dep]))
              );
              const optsField = buildLocalizedOptions(optionSetField, allowedField, language, { sort: optionSortFor(field) });
              const currentValue = row.values[field.id];
              if (optsField.length === 1 && isEmptyValue(currentValue) && currentValue !== optsField[0].value) {
                pendingLineDefaults.push({
                  group,
                  field,
                  rowId: row.id,
                  value: optsField[0].value,
                  rowValues: { ...(row.values || {}), [field.id]: optsField[0].value }
                });
              }
            });
        });
      });
    if (!pendingLineDefaults.length) return;
    const applied: typeof pendingLineDefaults = [];
    setLineItems(prev => {
      let changed = false;
      const next: LineItemState = { ...prev };
      pendingLineDefaults.forEach(({ group, rowId, field, value, rowValues }) => {
        const rows = next[group.id] || prev[group.id] || [];
        const rowIdx = rows.findIndex(r => r.id === rowId);
        if (rowIdx === -1) return;
        const row = rows[rowIdx];
        if (row.values[field.id] === value) return;
        const updatedRow: LineItemRowState = {
          ...row,
          values: { ...row.values, [field.id]: value }
        };
        const updatedRows = [...rows];
        updatedRows[rowIdx] = updatedRow;
        next[group.id] = updatedRows;
        applied.push({ group, field, rowId, value, rowValues });
        changed = true;
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ group, field, rowId }) => {
        const key = `${group.id}__${field.id}__${rowId}`;
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ field, value, group, rowId, rowValues }) => {
        onSelectionEffect(field as WebQuestionDefinition, value, { lineItem: { groupId: group.id, rowId, rowValues } });
      });
    }
  }, [definitionQuestions, language, lineItems, onSelectionEffect, optionSortFor, optionState, setErrors, setLineItems, values]);
};
