import React from 'react';

import { computeTotals } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type { LangCode, LineItemRowState, ValidationRule, WebQuestionDefinition } from '../../../../types';
import { ROW_NON_MATCH_OPTIONS_KEY } from '../../../app/lineItems';
import type { FormErrors } from '../../../types';

type UseLineItemGroupPresentationStateArgs = {
  q: WebQuestionDefinition;
  parentRows: LineItemRowState[];
  rowFlowEnabled: boolean;
  errors: FormErrors;
  language: LangCode;
  hideToolbars?: boolean;
  showAddTop: boolean;
  showAddBottom: boolean;
  showSelectorTop: boolean;
  showSelectorBottom: boolean;
  warningByField?: Record<string, string[]>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: line-items feature presentation.
 * Normalizes group warning, table, totals, and toolbar state for the renderer.
 */
export const useLineItemGroupPresentationState = ({
  q,
  parentRows,
  rowFlowEnabled,
  errors,
  language,
  hideToolbars,
  showAddTop,
  showAddBottom,
  showSelectorTop,
  showSelectorBottom,
  warningByField,
  onDiagnostic
}: UseLineItemGroupPresentationStateArgs) => {
  const warningModeLoggedRef = React.useRef<Set<string>>(new Set());
  const groupTotals = computeTotals({ config: q.lineItemConfig!, rows: parentRows, groupId: q.id, invalidFieldPaths: errors }, language);
  const liUi = q.lineItemConfig?.ui;
  const uiMode = (liUi?.mode || 'default').toString().trim().toLowerCase();
  const isTableMode = uiMode === 'table';
  const hideGroupLabel = q.ui?.hideLabel === true;

  React.useEffect(() => {
    if (!onDiagnostic) return;
    if (liUi?.addButtonPlacement && liUi.addButtonPlacement !== 'both') {
      onDiagnostic('ui.lineItems.addButtonPlacement', { groupId: q.id, value: liUi.addButtonPlacement });
    }
  }, [onDiagnostic, liUi?.addButtonPlacement, q.id]);

  const nonMatchWarningModeRaw = (liUi as any)?.nonMatchWarningMode;
  const nonMatchWarningModeCandidate =
    nonMatchWarningModeRaw !== undefined && nonMatchWarningModeRaw !== null
      ? nonMatchWarningModeRaw.toString().trim().toLowerCase()
      : '';
  const nonMatchWarningMode: 'descriptive' | 'validation' | 'both' =
    nonMatchWarningModeCandidate === 'validation' ||
    nonMatchWarningModeCandidate === 'rules' ||
    nonMatchWarningModeCandidate === 'rule' ||
    nonMatchWarningModeCandidate === 'generic'
      ? 'validation'
      : nonMatchWarningModeCandidate === 'both' || nonMatchWarningModeCandidate === 'all'
        ? 'both'
        : 'descriptive';
  const useValidationNonMatchWarnings = nonMatchWarningMode !== 'descriptive';
  const useDescriptiveNonMatchWarnings = nonMatchWarningMode !== 'validation';
  if (nonMatchWarningModeCandidate) {
    const warningKey = `${q.id}::nonMatchWarningMode`;
    if (!warningModeLoggedRef.current.has(warningKey)) {
      warningModeLoggedRef.current.add(warningKey);
      onDiagnostic?.('ui.lineItems.nonMatchWarningMode', { groupId: q.id, mode: nonMatchWarningMode });
    }
  }

  const messageFieldsAll = q.lineItemConfig?.fields || [];
  const tableColumnIdsRaw = isTableMode && Array.isArray(liUi?.tableColumns) ? liUi?.tableColumns : [];
  const tableColumnIds = tableColumnIdsRaw
    .map(id => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  const tableFieldsAll = messageFieldsAll;
  const tableFields = isTableMode
    ? (tableColumnIds.length ? tableColumnIds : tableFieldsAll.map(field => field.id))
        .map(fieldId => tableFieldsAll.find(field => field.id === fieldId))
        .filter((field): field is (typeof tableFieldsAll)[number] => Boolean(field))
    : [];
  const tableFieldIdSet = new Set(tableFields.map(field => field.id));
  const isSourceFirstAllocations = (() => {
    if (!rowFlowEnabled) return false;
    const dataSourceRowsCfg = Array.isArray((q.lineItemConfig as any)?.dataSourceRows)
      ? ((q.lineItemConfig as any).dataSourceRows as any[])
      : [];
    return dataSourceRowsCfg.some(cfg => ((cfg?.presentation || '').toString().trim().toLowerCase() === 'sourcefirstallocations'));
  })();
  const tableTotals =
    isTableMode && !rowFlowEnabled
      ? groupTotals.filter(total => {
          const key = (total.key || '').toString();
          return key ? tableFieldIdSet.has(key) : false;
        })
      : [];
  const toolbarTotals = isTableMode && !rowFlowEnabled ? [] : isSourceFirstAllocations ? [] : groupTotals;
  const genericNonMatchWarnings = (() => {
    const seen = new Set<string>();
    messageFieldsAll.forEach(field => {
      const rules = Array.isArray((field as any)?.validationRules)
        ? ((field as any).validationRules as ValidationRule[])
        : [];
      rules.forEach((rule: ValidationRule) => {
        if (!rule || (rule as any)?.level !== 'warning') return;
        const when = (rule as any)?.when;
        if (!when || typeof when !== 'object') return;
        if ((when as any)?.fieldId !== ROW_NON_MATCH_OPTIONS_KEY) return;
        const msg = resolveLocalizedString((rule as any)?.message, language, '');
        const text = msg ? msg.toString().trim() : '';
        if (text) seen.add(text);
      });
    });
    return seen;
  })();

  const shouldRenderTopToolbar = !hideToolbars && (showSelectorTop || showAddTop);
  const shouldRenderBottomToolbar =
    !hideToolbars && (parentRows.length > 0 || showAddBottom) && (showAddBottom || showSelectorBottom || toolbarTotals.length > 0);

  const warningsFor = React.useCallback(
    (fieldPath: string): string[] => {
      const key = (fieldPath || '').toString();
      const list = key && warningByField ? (warningByField as any)[key] : undefined;
      return Array.isArray(list) ? list.filter(Boolean).map(message => (message || '').toString()) : [];
    },
    [warningByField]
  );
  const filterWarnings = React.useCallback(
    (messages: string[]): string[] => {
      if (!messages.length) return messages;
      if (useValidationNonMatchWarnings) return messages;
      return messages.filter(message => !genericNonMatchWarnings.has(message));
    },
    [genericNonMatchWarnings, useValidationNonMatchWarnings]
  );
  const hasWarning = React.useCallback(
    (fieldPath: string): boolean => filterWarnings(warningsFor(fieldPath)).length > 0,
    [filterWarnings, warningsFor]
  );
  const renderWarnings = React.useCallback(
    (fieldPath: string): React.ReactNode => {
      const messages = filterWarnings(warningsFor(fieldPath));
      if (!messages.length) return null;
      return messages.map((message, index) => (
        <div key={`${fieldPath}-warning-${index}`} className="warning">
          {message}
        </div>
      ));
    },
    [filterWarnings, warningsFor]
  );

  return {
    groupTotals,
    liUi,
    uiMode,
    isTableMode,
    hideGroupLabel,
    messageFieldsAll,
    tableFieldsAll,
    tableFields,
    tableFieldIdSet,
    tableTotals,
    toolbarTotals,
    genericNonMatchWarnings,
    useValidationNonMatchWarnings,
    useDescriptiveNonMatchWarnings,
    shouldRenderTopToolbar,
    shouldRenderBottomToolbar,
    warningsFor,
    filterWarnings,
    hasWarning,
    renderWarnings
  };
};
