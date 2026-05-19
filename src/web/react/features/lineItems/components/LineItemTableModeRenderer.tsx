import React from 'react';
import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  peekOptionsFromDataSource,
  shouldHideField,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  OptionSet,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import type { OptionState } from '../../../types';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource
} from '../../../app/lineItems';
import { resolveFieldLabel, resolveLabel } from '../../../utils/labels';
import { isEmptyValue } from '../../../utils/values';
import { DateInput } from '../../../components/form/DateInput';
import { LineItemTable, type LineItemTableColumn } from '../../../components/form/LineItemTable';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { srOnly } from '../../../components/form/ui';
import {
  formatOptionFilterNonMatchWarning,
  resolveFieldHelperText,
  resolveLineItemTableReadOnlyDisplay,
  toDateInputValue
} from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import { LineFileUploadTableControl } from '../../uploads/components/LineFileUploadTableControl';
import { optionSortFor } from '../domain/lineItemPresentation';
import { resolveTableColumnWidthStyle } from '../domain/tableColumnWidths';
import { LineItemRemoveButton } from './LineItemRemoveButton';
import { LineItemTableTotalsFooter } from './LineItemTableTotalsFooter';
import { LineItemTotals } from './LineItemTotals';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || peekOptionsFromDataSource(field.dataSource, 'EN') || toOptionSet(field);

export type LineItemTableModeRendererProps = {
  q: WebQuestionDefinition;
  liUi: any;
  tableFieldsAll: any[];
  tableFields: any[];
  tableFieldIdSet: Set<string>;
  messageFieldsAll: any[];
  parentRows: any[];
  lineItems: Record<string, any[]>;
  values: Record<string, FieldValue>;
  optionState: OptionState;
  language: LangCode;
  errors: Record<string, string>;
  groupHelperNode: React.ReactNode;
  supplementalHelperNode: React.ReactNode;
  hideGroupLabel: boolean;
  shouldRenderTopToolbar: boolean;
  shouldRenderBottomToolbar: boolean;
  showSelectorTop: boolean;
  showSelectorBottom: boolean;
  showAddTop: boolean;
  showAddBottom: boolean;
  selectorControl: React.ReactNode;
  toolbarTotals: any[];
  tableTotals: any[];
  useDescriptiveNonMatchWarnings: boolean;
  useValidationNonMatchWarnings: boolean;
  genericNonMatchWarnings: Set<string>;
  groupChoiceSearchDefault?: boolean;
  uploadAnnouncements: Record<string, string>;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  warningsFor: (fieldPath: string) => string[];
  renderAddButton: () => React.ReactNode;
  ensureLineOptions: (groupKey: string, field: any) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  isLineFieldInputDisabled: (field: any) => boolean;
  resolveTopValue: (fieldId: string) => FieldValue;
  removeLineRow: (groupId: string, rowId: string) => void;
  renderUploadFailure: (fieldPath: string, disabled?: boolean) => React.ReactNode;
  isFileUploadOrderedEntryBlocked: (args: any) => boolean;
  openFileOverlay: (args: any) => void;
  handleLineFileInputChange: (args: any) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

export const LineItemTableModeRenderer: React.FC<LineItemTableModeRendererProps> = ({
  q,
  liUi,
  tableFieldsAll,
  tableFields,
  tableFieldIdSet,
  messageFieldsAll,
  parentRows,
  lineItems,
  values,
  optionState,
  language,
  errors,
  groupHelperNode,
  supplementalHelperNode,
  hideGroupLabel,
  shouldRenderTopToolbar,
  shouldRenderBottomToolbar,
  showSelectorTop,
  showSelectorBottom,
  showAddTop,
  showAddBottom,
  selectorControl,
  toolbarTotals,
  tableTotals,
  useDescriptiveNonMatchWarnings,
  useValidationNonMatchWarnings,
  genericNonMatchWarnings,
  groupChoiceSearchDefault,
  uploadAnnouncements,
  fileInputsRef,
  hasWarning,
  renderWarnings,
  warningsFor,
  renderAddButton,
  ensureLineOptions,
  renderChoiceControl,
  handleLineFieldChange,
  isLineFieldInteractionBlocked,
  isLineFieldInputDisabled,
  resolveTopValue,
  removeLineRow,
  renderUploadFailure,
  isFileUploadOrderedEntryBlocked,
  openFileOverlay,
  handleLineFileInputChange,
  setErrors,
  onDiagnostic
}) => {
  const maxVisibleRowsRaw = Number((liUi as any)?.maxVisibleRows);
  const tableScrollStyle =
    Number.isFinite(maxVisibleRowsRaw) && maxVisibleRowsRaw > 0
      ? ({
          maxHeight: `${Math.max(1, Math.floor(maxVisibleRowsRaw)) * 56}px`,
          overflowY: 'auto' as const,
          overflowX: 'auto' as const,
          WebkitOverflowScrolling: 'touch' as const,
          overscrollBehavior: 'contain' as const,
          touchAction: 'pan-x pan-y' as const
        })
      : undefined;
  const hideRemoveColumn = (liUi as any)?.hideRemoveColumn === true;
  const messageFields = messageFieldsAll;
  const anchorFieldId =
    q.lineItemConfig?.anchorFieldId !== undefined && q.lineItemConfig?.anchorFieldId !== null
      ? q.lineItemConfig?.anchorFieldId.toString()
      : '';
  const hideUntilAnchor = liUi?.tableHideUntilAnchor !== false;
  const anchorField = anchorFieldId ? tableFieldsAll.find(field => field.id === anchorFieldId) : undefined;

  const resolveRowLabel = (row: any): string => {
    if (!anchorFieldId || !anchorField) return '';
    const rawVal = row.values?.[anchorFieldId];
    if (anchorField.type === 'CHOICE') {
      ensureLineOptions(q.id, anchorField);
      const optionSetField: OptionSet = resolveOptionSetForField(optionState, anchorField, q.id);
      const dependencyIds = (
        Array.isArray(anchorField.optionFilter?.dependsOn)
          ? anchorField.optionFilter?.dependsOn
          : [anchorField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
      const allowedField = computeAllowedOptions(
        anchorField.optionFilter,
        optionSetField,
        dependencyIds.map((dep: string) => toDependencyValue(row.values?.[dep] ?? values[dep]))
      );
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      const allowedWithCurrent =
        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
          ? [...allowedField, choiceVal]
          : allowedField;
      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(anchorField) });
      return (optsField.find(opt => opt.value === choiceVal)?.label || choiceVal || '').toString();
    }
    if (Array.isArray(rawVal)) {
      return rawVal
        .map(value => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''))
        .filter(Boolean)
        .join(', ');
    }
    return typeof rawVal === 'string' || typeof rawVal === 'number' || typeof rawVal === 'boolean'
      ? String(rawVal)
      : '';
  };

  const getRowNonMatchWarning = (row: any): string => {
    const rowNonMatchKeys = parseRowNonMatchOptions((row.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
    return rowNonMatchKeys.length ? formatOptionFilterNonMatchWarning({ language, keys: rowNonMatchKeys }) : '';
  };

  const collectRowErrors = (row: any): string[] => {
    const seen = new Set<string>();
    messageFields.forEach(field => {
      if (tableFieldIdSet.has(field.id)) return;
      const fieldPath = `${q.id}__${field.id}__${row.id}`;
      const msg = errors[fieldPath];
      if (msg) seen.add(msg);
    });
    return Array.from(seen);
  };

  const collectRowWarnings = (row: any): string[] => {
    const seen = new Set<string>();
    const rowNonMatchWarning = useDescriptiveNonMatchWarnings ? getRowNonMatchWarning(row) : '';
    let hasNonMatchWarning = false;
    messageFields.forEach(field => {
      const fieldPath = `${q.id}__${field.id}__${row.id}`;
      warningsFor(fieldPath).forEach(msg => {
        if (!useValidationNonMatchWarnings && genericNonMatchWarnings.has(msg)) return;
        seen.add(msg);
      });
      const showNonMatchWarning =
        !!rowNonMatchWarning &&
        useDescriptiveNonMatchWarnings &&
        typeof (field as any)?.optionFilter?.matchMode === 'string' &&
        (field as any).optionFilter.matchMode === 'or';
      if (showNonMatchWarning) {
        hasNonMatchWarning = true;
        seen.add(rowNonMatchWarning);
      }
    });
    let out = Array.from(seen);
    if (hasNonMatchWarning && genericNonMatchWarnings.size && useValidationNonMatchWarnings && useDescriptiveNonMatchWarnings) {
      out = out.filter(msg => !genericNonMatchWarnings.has(msg));
    }
    return out;
  };

  const buildWarningKey = (rowLabel: string, message: string, isGeneric: boolean): string => {
    if (isGeneric) return message;
    return rowLabel ? `${rowLabel}::${message}` : message;
  };

  const warningsLegend: Array<{ rowId: string; label: string; message: string; key: string }> = [];
  const seenRowMessage = new Set<string>();
  const seenGeneric = new Set<string>();
  parentRows.forEach(row => {
    const rowLabel = resolveRowLabel(row);
    const messages = collectRowWarnings(row);
    messages.forEach(message => {
      const isGeneric = genericNonMatchWarnings.has(message);
      if (isGeneric) {
        if (seenGeneric.has(message)) return;
        seenGeneric.add(message);
        warningsLegend.push({ rowId: row.id, label: '', message, key: buildWarningKey('', message, true) });
        return;
      }
      const dedupeKey = `${rowLabel || ''}::${message}`;
      if (seenRowMessage.has(dedupeKey)) return;
      seenRowMessage.add(dedupeKey);
      warningsLegend.push({ rowId: row.id, label: rowLabel, message, key: buildWarningKey(rowLabel, message, false) });
    });
  });
  const warningsLegendNumbered = warningsLegend.map((entry, idx) => ({ ...entry, index: idx + 1 }));
  const warningIndexByKey = new Map<string, number>();
  warningsLegendNumbered.forEach(entry => warningIndexByKey.set(entry.key, entry.index));
  const warningsLegendVisible = warningsLegendNumbered.length > 0;

  const resolveWarningKeysForField = (args: {
    fieldPath: string;
    rowLabel: string;
    rowNonMatchWarning: string;
    showNonMatchWarning: boolean;
  }): string[] => {
    const { fieldPath, rowLabel, rowNonMatchWarning, showNonMatchWarning } = args;
    const keys = new Set<string>();
    const shouldDropGeneric =
      showNonMatchWarning && useValidationNonMatchWarnings && useDescriptiveNonMatchWarnings && genericNonMatchWarnings.size > 0;
    warningsFor(fieldPath).forEach(msg => {
      if (!useValidationNonMatchWarnings && genericNonMatchWarnings.has(msg)) return;
      if (shouldDropGeneric && genericNonMatchWarnings.has(msg)) return;
      const isGeneric = genericNonMatchWarnings.has(msg);
      keys.add(buildWarningKey(rowLabel, msg, isGeneric));
    });
    if (showNonMatchWarning && rowNonMatchWarning) {
      keys.add(buildWarningKey(rowLabel, rowNonMatchWarning, false));
    }
    return Array.from(keys);
  };

  const renderWarningFootnote = (warningKeys: string[]): React.ReactNode => {
    if (!warningKeys.length) return null;
    const indices = warningKeys
      .map(key => warningIndexByKey.get(key))
      .filter((value): value is number => typeof value === 'number');
    if (!indices.length) return null;
    const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
    return (
      <span className="ck-line-item-table__warning-footnote" aria-hidden="true">
        {unique.join(',')}
      </span>
    );
  };

  const renderTableField = (field: any, row: any, _rowIdx: number) => {
    const groupCtx: VisibilityContext = {
      getValue: fieldId => resolveTopValue(fieldId),
      getLineValue: (_rowId, fieldId) => row.values[fieldId],
      getLineItems: groupId => lineItems?.[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    };
    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
    if (hideField) return <span className="muted">{'\u2014'}</span>;

    const anchorValue = anchorFieldId ? row.values[anchorFieldId] : undefined;
    if (hideUntilAnchor && anchorFieldId && field.id !== anchorFieldId && isEmptyValue(anchorValue as any)) {
      return <span className="muted">{'\u2014'}</span>;
    }

    ensureLineOptions(q.id, field);
    const optionSetField: OptionSet = resolveOptionSetForField(optionState, field, q.id);
    const dependencyIds = (
      Array.isArray(field.optionFilter?.dependsOn)
        ? field.optionFilter?.dependsOn
        : [field.optionFilter?.dependsOn || '']
    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const allowedField = computeAllowedOptions(
      field.optionFilter,
      optionSetField,
      dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
    );

    const fieldPath = `${q.id}__${field.id}__${row.id}`;
    const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
    const fieldInteractionBlocked = isLineFieldInteractionBlocked(field);
    const fieldInputDisabled = isLineFieldInputDisabled(field);
    const isEditableField =
      !fieldInteractionBlocked &&
      (field as any)?.readOnly !== true &&
      (field as any)?.ui?.renderAsLabel !== true &&
      (field as any)?.renderAsLabel !== true &&
      !!(field as any)?.valueMap === false;
    const placeholder =
      helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
    const renderAsLabel =
      (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;
    const rowNonMatchWarning = useDescriptiveNonMatchWarnings ? getRowNonMatchWarning(row) : '';
    const showNonMatchWarning =
      useDescriptiveNonMatchWarnings &&
      !!rowNonMatchWarning &&
      typeof (field as any)?.optionFilter?.matchMode === 'string' &&
      (field as any).optionFilter.matchMode === 'or';
    const fieldWarning = warningsFor(fieldPath);
    const hasFieldWarning = fieldWarning.length > 0 || showNonMatchWarning;
    const fieldErrorText = errors[fieldPath];
    const hasFieldError = !!fieldErrorText;
    const rowLabel = resolveRowLabel(row);
    const isEditable = !renderAsLabel && !(field as any)?.valueMap;
    const warningKeys = resolveWarningKeysForField({
      fieldPath,
      rowLabel,
      rowNonMatchWarning,
      showNonMatchWarning
    });
    const warningFootnote = !isEditable ? renderWarningFootnote(warningKeys) : null;
    const showWarningHighlight = hasFieldWarning && isEditable;
    const errorNode = fieldErrorText ? <div className="ck-line-item-table__cell-error error">{fieldErrorText}</div> : null;

    if (field.type === 'CHOICE') {
      const rawVal = row.values[field.id];
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      const allowedWithCurrent =
        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
          ? [...allowedField, choiceVal]
          : allowedField;
      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
      if (renderAsLabel) {
        const selected = optsField.find(opt => opt.value === choiceVal);
        return (
          <div
            className="ck-line-item-table__value"
            data-field-path={fieldPath}
            data-has-warning={showWarningHighlight ? 'true' : undefined}
            data-has-error={hasFieldError ? 'true' : undefined}
          >
            <span className="ck-line-item-table__value-text">
              {resolveLineItemTableReadOnlyDisplay({
                baseValue: selected?.label || choiceVal,
                field,
                rowValues: (row.values || {}) as Record<string, FieldValue>,
                language
              })}
              {warningFootnote}
            </span>
            {errorNode}
          </div>
        );
      }
      return (
        <div
          className="ck-line-item-table__control"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          {renderChoiceControl({
            fieldPath,
            value: choiceVal || '',
            options: optsField,
            required: !!field.required,
            placeholder,
            searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
            override: (field as any)?.ui?.control,
            disabled: fieldInputDisabled,
            onChange: (next: FieldValue) => handleLineFieldChange(q, row.id, field, next)
          })}
          {warningFootnote}
          {errorNode}
        </div>
      );
    }

    if (field.type === 'CHECKBOX') {
      const hasAnyOption =
        !!((optionSetField.en && optionSetField.en.length) ||
          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
          ((optionSetField as any).nl && (optionSetField as any).nl.length));
      const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
      const selected = Array.isArray(row.values[field.id]) ? (row.values[field.id] as string[]) : [];
      const allowedWithSelected = selected.reduce((acc, value) => {
        if (value && !acc.includes(value)) acc.push(value);
        return acc;
      }, [...allowedField]);
      const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
      if (renderAsLabel) {
        const labels = isConsentCheckbox
          ? [
              row.values[field.id]
                ? tSystem('common.yes', language, 'Yes')
                : tSystem('common.no', language, 'No')
            ]
          : selected.map(value => optsField.find(opt => opt.value === value)?.label || value).filter(Boolean);
        return (
          <div
            className="ck-line-item-table__value"
            data-field-path={fieldPath}
            data-has-warning={showWarningHighlight ? 'true' : undefined}
            data-has-error={hasFieldError ? 'true' : undefined}
          >
            <span className="ck-line-item-table__value-text">
              {resolveLineItemTableReadOnlyDisplay({
                baseValue: labels.length ? labels.join(', ') : '',
                field,
                rowValues: (row.values || {}) as Record<string, FieldValue>,
                language
              })}
              {warningFootnote}
            </span>
            {errorNode}
          </div>
        );
      }
      if (isConsentCheckbox) {
        return (
          <div
            className="ck-line-item-table__control ck-line-item-table__control--consent"
            data-field-path={fieldPath}
            data-has-warning={showWarningHighlight ? 'true' : undefined}
            data-has-error={hasFieldError ? 'true' : undefined}
          >
            <label className="inline">
              <input
                type="checkbox"
                className="ck-line-item-table__consent-checkbox"
                checked={!!row.values[field.id]}
                aria-label={resolveFieldLabel(field, language, field.id)}
                disabled={fieldInputDisabled}
                onChange={event => {
                  if (fieldInputDisabled) return;
                  handleLineFieldChange(q, row.id, field, event.target.checked);
                }}
              />
              <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
            </label>
            {warningFootnote}
            {errorNode}
          </div>
        );
      }
      const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
      const renderAsMultiSelect = controlOverride === 'select';
      return (
        <div
          className="ck-line-item-table__control"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          {renderAsMultiSelect ? (
            <select
              multiple
              value={selected}
              disabled={fieldInputDisabled}
              onChange={event => {
                if (fieldInputDisabled) return;
                const next = Array.from(event.currentTarget.selectedOptions)
                  .map(opt => opt.value)
                  .filter(Boolean);
                handleLineFieldChange(q, row.id, field, next);
              }}
            >
              {optsField.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="inline-options">
              {optsField.map(opt => (
                <label key={opt.value} className="inline">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    disabled={fieldInputDisabled}
                    onChange={event => {
                      if (fieldInputDisabled) return;
                      const next = event.target.checked ? [...selected, opt.value] : selected.filter(value => value !== opt.value);
                      handleLineFieldChange(q, row.id, field, next);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
          {warningFootnote}
          {errorNode}
        </div>
      );
    }

    if (field.type === 'FILE_UPLOAD') {
      return (
        <LineFileUploadTableControl
          group={q}
          rowId={row.id}
          field={field}
          fieldPath={fieldPath}
          value={row.values[field.id] as FieldValue | undefined}
          rowValues={(row.values || {}) as Record<string, FieldValue>}
          language={language}
          fieldInteractionBlocked={fieldInteractionBlocked}
          renderAsLabel={renderAsLabel}
          showWarningHighlight={showWarningHighlight}
          hasFieldError={hasFieldError}
          errorNode={errorNode}
          checkFileUploadOrderedEntry={isFileUploadOrderedEntryBlocked}
          openFileOverlay={openFileOverlay}
          handleFileInputChange={handleLineFileInputChange}
          fileInputsRef={fileInputsRef}
          uploadAnnouncements={uploadAnnouncements}
          renderUploadFailure={renderUploadFailure}
          onDiagnostic={onDiagnostic}
        />
      );
    }

    const mapped = field.valueMap
      ? resolveValueMapValue(
          field.valueMap,
          fieldId => {
            if (row.values.hasOwnProperty(fieldId)) return row.values[fieldId];
            return values[fieldId];
          },
          { language, targetOptions: toOptionSet(field) }
        )
      : undefined;
    const fieldValueRaw = field.valueMap ? mapped : ((row.values[field.id] as any) ?? '');
    const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
    const numberText =
      field.type === 'NUMBER'
        ? fieldValue === undefined || fieldValue === null
          ? ''
          : (fieldValue as any).toString()
        : '';
    if (renderAsLabel) {
      const display =
        field.type === 'NUMBER'
          ? numberText
          : field.type === 'DATE'
            ? fieldValue
            : fieldValue;
      return (
        <div
          className="ck-line-item-table__value"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          <span className="ck-line-item-table__value-text">
            {resolveLineItemTableReadOnlyDisplay({
              baseValue: display,
              field,
              rowValues: (row.values || {}) as Record<string, FieldValue>,
              language
            })}
            {warningFootnote}
          </span>
          {errorNode}
        </div>
      );
    }
    if (field.type === 'NUMBER') {
      const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
      return (
        <div
          className="ck-line-item-table__control"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          <NumberStepper
            value={numberText}
            disabled={fieldInteractionBlocked}
            readOnly={!!field.valueMap || fieldInputDisabled}
            ariaLabel={resolveFieldLabel(field, language, field.id)}
            placeholder={placeholder}
            onInvalidInput={({ reason, value }) => {
              const invalidMessage =
                reason === 'leadingZeros'
                  ? tSystem(
                      'validation.wholeNumberNoLeadingZeros',
                      language,
                      'Enter a valid whole number without leading zeros.'
                    )
                  : numericOnlyMessage;
              setErrors(prev => {
                const next = { ...prev };
                const existing = next[fieldPath];
                if (existing && existing !== invalidMessage && existing !== numericOnlyMessage) return prev;
                if (existing === invalidMessage) return prev;
                next[fieldPath] = invalidMessage;
                return next;
              });
              onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
            }}
            onChange={next => handleLineFieldChange(q, row.id, field, next)}
          />
          {warningFootnote}
          {errorNode}
        </div>
      );
    }
    if (field.type === 'PARAGRAPH') {
      return (
        <div
          className="ck-line-item-table__control"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          <textarea
            className="ck-paragraph-input"
            value={fieldValue}
            onChange={event => handleLineFieldChange(q, row.id, field, event.target.value)}
            readOnly={!!field.valueMap || fieldInputDisabled}
            rows={(field as any)?.ui?.paragraphRows || 3}
            placeholder={placeholder}
          />
          {warningFootnote}
          {errorNode}
        </div>
      );
    }
    if (field.type === 'DATE') {
      return (
        <div
          className="ck-line-item-table__control"
          data-field-path={fieldPath}
          data-has-warning={showWarningHighlight ? 'true' : undefined}
          data-has-error={hasFieldError ? 'true' : undefined}
        >
          <DateInput
            value={fieldValue}
            language={language}
            min={(field as any)?.ui?.minDate}
            max={(field as any)?.ui?.maxDate}
            correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
            iosNativeCommitMode="deferWhileFocused"
            readOnly={!!field.valueMap || fieldInputDisabled}
            ariaLabel={resolveFieldLabel(field, language, field.id)}
            onChange={next => handleLineFieldChange(q, row.id, field, next)}
          />
          {warningFootnote}
          {errorNode}
        </div>
      );
    }
    return (
      <div
        className="ck-line-item-table__control"
        data-field-path={fieldPath}
        data-has-warning={showWarningHighlight ? 'true' : undefined}
        data-has-error={hasFieldError ? 'true' : undefined}
      >
        <input
          type="text"
          value={fieldValue}
          onChange={event => handleLineFieldChange(q, row.id, field, event.target.value)}
          readOnly={!!field.valueMap || fieldInputDisabled}
          placeholder={placeholder}
        />
        {warningFootnote}
        {errorNode}
      </div>
    );
  };

  const removeColumn = {
    id: '__remove',
    label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
    className: 'ck-line-item-table__actions',
    renderCell: (row: any) => {
      const rowSource = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
      const hideRemoveButton = parseRowHideRemove((row.values as any)?.[ROW_HIDE_REMOVE_KEY]);
      if (hideRemoveButton) return null;
      if ((q.lineItemConfig as any)?.ui?.allowRemoveAutoRows === false && rowSource === 'auto') return null;
      return <LineItemRemoveButton language={language} onRemove={() => removeLineRow(q.id, row.id)} />;
    }
  };

  const tableColumnWidths = (q.lineItemConfig?.ui as any)?.tableColumnWidths;
  const resolveTableColumnStyle = (columnId: string): React.CSSProperties | undefined =>
    resolveTableColumnWidthStyle(tableColumnWidths, columnId);

  const tableColumns: LineItemTableColumn[] = [
    ...tableFields.map(field => ({
      id: field.id,
      className: field.type === 'CHECKBOX' ? 'ck-line-item-table__column--checkbox' : undefined,
      label: (() => {
        const labelText = resolveFieldLabel(field, language, field.id);
        const hideHeaderLabel = Boolean((field as any)?.hideLabel || (field as any)?.ui?.hideLabel);
        if (hideHeaderLabel) {
          return <span style={srOnly}>{labelText}</span>;
        }
        const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
        const isEditableField =
          !isLineFieldInteractionBlocked(field) && (field as any)?.readOnly !== true &&
          (field as any)?.ui?.renderAsLabel !== true &&
          (field as any)?.renderAsLabel !== true &&
          !!(field as any)?.valueMap === false;
        if (!helperCfg.text || helperCfg.placement !== 'belowLabel' || !isEditableField) return labelText;
        return (
          <div className="ck-line-item-table__header-wrap">
            <div>{labelText}</div>
            <div className="ck-line-item-table__header-helper">{helperCfg.text}</div>
          </div>
        );
      })(),
      style:
        field.type === 'CHECKBOX'
          ? { ...(resolveTableColumnStyle(field.id) || {}), textAlign: 'center' as const }
          : resolveTableColumnStyle(field.id),
      renderCell: (row: any, rowIdx: number) => renderTableField(field, row, rowIdx)
    })),
    ...(hideRemoveColumn ? [] : [{ ...removeColumn, style: resolveTableColumnStyle(removeColumn.id) }])
  ];
  const tableFooter = <LineItemTableTotalsFooter language={language} tableColumns={tableColumns} totals={tableTotals} />;

  return (
    <div
      key={q.id}
      className="ck-line-item-group ck-line-item-group--table ck-full-width"
      data-field-path={q.id}
      data-has-error={errors[q.id] ? 'true' : undefined}
      data-has-warning={hasWarning(q.id) ? 'true' : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h3 style={hideGroupLabel ? { ...srOnly, margin: 0 } : { margin: 0 }}>{resolveLabel(q, language)}</h3>
      </div>
      {groupHelperNode}
      {supplementalHelperNode}
      {errors[q.id] ? <div className="error">{errors[q.id]}</div> : null}
      {renderWarnings(q.id)}
      {shouldRenderTopToolbar ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
            {showSelectorTop ? selectorControl : null}
            {showAddTop ? renderAddButton() : null}
          </div>
        </div>
      ) : null}
      <div className="ck-line-item-table__scroll" style={tableScrollStyle}>
        <LineItemTable
          columns={tableColumns}
          rows={parentRows}
          emptyText={
            resolveLocalizedString((q.lineItemConfig as any)?.ui?.emptyText, language) ||
            tSystem('lineItems.noOptionsAvailable', language, 'No options available.')
          }
          rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
          renderRowMessage={row => {
            const rowErrors = collectRowErrors(row);
            if (!rowErrors.length) return null;
            return (
              <div className="ck-line-item-table__row-errors">
                {rowErrors.map((msg, idx) => (
                  <div key={`${row.id}-error-${idx}`} className="error">
                    {msg}
                  </div>
                ))}
              </div>
            );
          }}
          footer={tableFooter}
        />
      </div>
      {warningsLegendVisible ? (
        <div className="ck-line-item-table__legend">
          <div className="ck-line-item-table__legend-title">
            {tSystem('validation.warningTitle', language, 'Warning')}
          </div>
          <div className="ck-line-item-table__legend-items">
            {warningsLegendNumbered.map(entry => (
              <div key={`${entry.rowId}-legend-${entry.index}`} className="ck-line-item-table__legend-item">
                <span className="ck-line-item-table__legend-footnote" aria-hidden="true">
                  {entry.index}
                </span>
                <span className="ck-line-item-table__legend-text">
                  {entry.label ? (
                    <span className="ck-line-item-table__legend-label">{entry.label}: </span>
                  ) : null}
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {shouldRenderBottomToolbar ? (
        <div className="line-item-toolbar" style={{ marginTop: 12 }}>
          <div
            className="line-item-toolbar-actions"
            style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flex: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {showSelectorBottom ? selectorControl : null}
              {showAddBottom ? renderAddButton() : null}
            </div>
            <LineItemTotals totals={toolbarTotals} itemClassName="ck-line-item-table__total" />
          </div>
        </div>
      ) : null}
    </div>
  );
};
