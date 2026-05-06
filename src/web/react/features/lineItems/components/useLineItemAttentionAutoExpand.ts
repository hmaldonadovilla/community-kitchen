import React from 'react';

import { shouldHideField, toOptionSet, validateRules } from '../../../../core';
import type { FieldValue, LangCode, LineItemRowState, VisibilityContext, WebQuestionDefinition } from '../../../../types';
import type { LineItemState } from '../../../types';
import { buildSubgroupKey, resolveSubgroupKey } from '../../../app/lineItems';
import { isEmptyValue } from '../../../utils/values';
import { isUploadValueComplete } from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { ErrorIndex } from '../../../components/form/lineItemGroupQuestionTypes';

type UseLineItemAttentionAutoExpandArgs = {
  q: WebQuestionDefinition;
  parentRows: LineItemRowState[];
  collapsedRows: Record<string, boolean>;
  warningByField?: Record<string, string[]>;
  errorIndex: ErrorIndex;
  lineItems: LineItemState;
  language: LangCode;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
  filterWarnings: (messages: string[]) => string[];
  setCollapsedRows: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

const isRequiredFieldFilled = (field: any, raw: any): boolean => {
  if (field?.type === 'FILE_UPLOAD') {
    return isUploadValueComplete({
      value: raw as any,
      uploadConfig: (field as any).uploadConfig,
      required: true
    });
  }
  return !isEmptyValue(raw as any);
};

/**
 * Owner: line-items feature renderer.
 * Encapsulates progressive-row auto-expansion for the first row that needs
 * attention, keeping validation/navigation policy out of the main renderer.
 */
export const useLineItemAttentionAutoExpand = ({
  q,
  parentRows,
  collapsedRows,
  warningByField,
  errorIndex,
  lineItems,
  language,
  resolveTopValue,
  filterWarnings,
  setCollapsedRows,
  onDiagnostic
}: UseLineItemAttentionAutoExpandArgs): void => {
  const didAutoExpandAttentionRef = React.useRef(false);
  const attentionRowId = React.useMemo((): string => {
    if (didAutoExpandAttentionRef.current) return '';
    if (!parentRows.length) return '';

    const ui = q.lineItemConfig?.ui as any;
    const guidedCollapsedFieldsInHeader = Boolean(ui?.guidedCollapsedFieldsInHeader);
    const isProgressive =
      ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
    if (!isProgressive || guidedCollapsedFieldsInHeader) return '';

    const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
    const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
    const collapsedFieldConfigs = (ui?.collapsedFields || []) as any[];
    const allFields = (q.lineItemConfig?.fields || []) as any[];
    const subGroups = (q.lineItemConfig?.subGroups || []) as any[];

    const hasExplicitExpanded = parentRows.some(row => collapsedRows[`${q.id}::${row.id}`] === false);
    if (hasExplicitExpanded) return '';

    const rowHasAnyWarning = (rowId: string): boolean => {
      if (!warningByField) return false;
      const prefix = `${q.id}__`;
      const suffix = `__${rowId}`;
      return Object.entries(warningByField).some(([key, value]) => {
        if (!key.startsWith(prefix) || !key.endsWith(suffix)) return false;
        const messages = Array.isArray(value) ? value.filter(Boolean).map(message => (message || '').toString()) : [];
        return filterWarnings(messages).length > 0;
      });
    };

    const canExpandRow = (row: any, rowCollapsed: boolean): boolean => {
      if (!rowCollapsed) return true;
      if (expandGate === 'always') return true;
      if (!collapsedFieldConfigs.length) return true;

      const groupCtx: VisibilityContext = {
        getValue: fieldId => resolveTopValue(fieldId),
        getLineValue: (_rowId, fieldId) => (row?.values || {})[fieldId],
        getLineItems: groupId => lineItems?.[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };
      const isHidden = (fieldId: string) => {
        const target = (allFields || []).find((field: any) => field?.id === fieldId) as any;
        if (!target) return false;
        return shouldHideField(target.visibility, groupCtx, { rowId: row?.id, linePrefix: q.id });
      };

      for (const cfg of collapsedFieldConfigs) {
        const fieldId = cfg?.fieldId ? cfg.fieldId.toString() : '';
        if (!fieldId) continue;
        const field = (allFields || []).find((entry: any) => entry?.id === fieldId) as any;
        if (!field) continue;

        const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row?.id, linePrefix: q.id });
        if (hideField) continue;

        const raw = (row?.values || {})[field.id];
        if (field.required && !isRequiredFieldFilled(field, raw)) return false;

        const rules = Array.isArray(field.validationRules)
          ? field.validationRules.filter((rule: any) => rule?.then?.fieldId === field.id)
          : [];
        if (rules.length) {
          const rulesCtx: any = {
            ...groupCtx,
            getValue: (fieldIdForRule: string) =>
              Object.prototype.hasOwnProperty.call(row?.values || {}, fieldIdForRule)
                ? (row?.values || {})[fieldIdForRule]
                : resolveTopValue(fieldIdForRule),
            language,
            phase: 'submit',
            isHidden
          };
          const errors = validateRules(rules, rulesCtx);
          if (errors.length) return false;
        }
      }

      return true;
    };

    const rowHasMissingRequired = (row: any): boolean => {
      const rowValues = (row?.values || {}) as Record<string, FieldValue>;
      const groupCtx: VisibilityContext = {
        getValue: fieldId => resolveTopValue(fieldId),
        getLineValue: (_rowId, fieldId) => rowValues[fieldId],
        getLineItems: groupId => lineItems?.[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };

      for (const field of allFields) {
        if (!field?.required) continue;
        const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
        if (hideField) continue;
        const mapped = field.valueMap
          ? resolveValueMapValue(
              field.valueMap,
              (fieldId: string) => {
                if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
                return resolveTopValue(fieldId);
              },
              { language, targetOptions: toOptionSet(field as any) }
            )
          : undefined;
        const raw = field.valueMap ? mapped : (rowValues as any)[field.id];
        if (!isRequiredFieldFilled(field, raw)) return true;
      }

      for (const sub of subGroups) {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) continue;
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        const subRows = (lineItems[subKey] || []) as any[];
        if (!subRows.length) continue;
        const subFields = ((sub as any)?.fields || []) as any[];
        for (const subRow of subRows) {
          const subRowValues = ((subRow as any)?.values || {}) as Record<string, FieldValue>;
          const subCtx: VisibilityContext = {
            getValue: (fieldId: string) => {
              if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fieldId)) return (subRowValues as any)[fieldId];
              if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
              return resolveTopValue(fieldId);
            },
            getLineValue: (_rowId, fieldId) => subRowValues[fieldId],
            getLineItems: groupId => lineItems?.[groupId] || [],
            getLineItemKeys: () => Object.keys(lineItems || {})
          };
          for (const field of subFields) {
            if (!field?.required) continue;
            const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
            if (hideField) continue;
            const mapped = field.valueMap
              ? resolveValueMapValue(
                  field.valueMap,
                  (fieldId: string) => {
                    if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fieldId)) return (subRowValues as any)[fieldId];
                    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
                    return resolveTopValue(fieldId);
                  },
                  { language, targetOptions: toOptionSet(field as any) }
                )
              : undefined;
            const raw = field.valueMap ? mapped : (subRowValues as any)[field.id];
            if (!isRequiredFieldFilled(field, raw)) return true;
          }
        }
      }

      return false;
    };

    for (const row of parentRows) {
      const collapseKey = `${q.id}::${row.id}`;
      const rowCollapsed = collapsedRows[collapseKey] ?? defaultCollapsed;
      if (!rowCollapsed) continue;
      if (!canExpandRow(row, rowCollapsed)) continue;

      const rowHasError = errorIndex.rowErrors.has(collapseKey);
      const rowNeedsAttention = rowHasError || rowHasAnyWarning(row.id) || rowHasMissingRequired(row);
      if (rowNeedsAttention) return row.id;
    }
    return '';
  }, [
    q.id,
    q.lineItemConfig,
    parentRows,
    collapsedRows,
    warningByField,
    errorIndex,
    lineItems,
    language,
    resolveTopValue,
    filterWarnings
  ]);

  React.useEffect(() => {
    if (!attentionRowId) return;
    if (didAutoExpandAttentionRef.current) return;
    didAutoExpandAttentionRef.current = true;
    const key = `${q.id}::${attentionRowId}`;
    setCollapsedRows(prev => {
      if (prev[key] === false) return prev;
      return { ...prev, [key]: false };
    });
    onDiagnostic?.('ui.lineItems.autoExpand.firstAttention', { groupId: q.id, rowId: attentionRowId });
  }, [attentionRowId, q.id, setCollapsedRows, onDiagnostic]);
};
