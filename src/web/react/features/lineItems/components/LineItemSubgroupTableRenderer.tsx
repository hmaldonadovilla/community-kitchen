import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  shouldHideField,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  OptionSet,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_SOURCE_KEY,
  parseRowHideRemove,
  parseRowSource
} from '../../../app/lineItems';
import { resolveFieldLabel } from '../../../utils/labels';
import { isEmptyValue } from '../../../utils/values';
import { DateInput } from '../../../components/form/DateInput';
import { LineItemTable } from '../../../components/form/LineItemTable';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { buttonStyles, srOnly } from '../../../components/form/ui';
import {
  resolveFieldHelperText,
  resolveLineItemTableReadOnlyDisplay,
  toDateInputValue,
  toUploadItems
} from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { OptionState } from '../../../types';
import { optionSortFor } from '../domain/lineItemPresentation';
import { resolveTableColumnWidthStyle } from '../domain/tableColumnWidths';
import { LineItemRemoveButton } from './LineItemRemoveButton';

type LineItemSubgroupTableRendererProps = {
  parentQuestion: WebQuestionDefinition;
  targetGroup: WebQuestionDefinition;
  sub: any;
  subKey: string;
  subUi: any;
  subRows: any[];
  parentRowValues: Record<string, FieldValue>;
  values: Record<string, FieldValue>;
  lineItems: Record<string, any[]>;
  optionState: OptionState;
  language: LangCode;
  errors: Record<string, string>;
  submitting: boolean;
  tableScrollStyle?: React.CSSProperties;
  anchorFieldId: string;
  hideUntilAnchor: boolean;
  hideRemoveColumn: boolean;
  ensureLineOptions: (groupKey: string, field: any) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  isLineFieldInputDisabled: (field: any) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  openFileOverlay: (args: any) => void;
  removeLineRow: (groupId: string, rowId: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

/**
 * Owner: line-items feature renderer.
 * Renders subgroup table mode while callers own subgroup row orchestration and
 * mutation callbacks.
 */
export const LineItemSubgroupTableRenderer: React.FC<LineItemSubgroupTableRendererProps> = ({
  parentQuestion,
  targetGroup,
  sub,
  subKey,
  subUi,
  subRows,
  parentRowValues,
  values,
  lineItems,
  optionState,
  language,
  errors,
  submitting,
  tableScrollStyle,
  anchorFieldId,
  hideUntilAnchor,
  hideRemoveColumn,
  ensureLineOptions,
  renderChoiceControl,
  handleLineFieldChange,
  isLineFieldInteractionBlocked,
  isLineFieldInputDisabled,
  renderWarnings,
  openFileOverlay,
  removeLineRow,
  setErrors,
  onDiagnostic
}) => {
  const subColumnWidths = subUi?.tableColumnWidths;
  const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined =>
    resolveTableColumnWidthStyle(subColumnWidths, columnId);
  const subColumnIdsRaw = Array.isArray(subUi?.tableColumns) ? subUi.tableColumns : [];
  const subColumnIds = subColumnIdsRaw
    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  const subFields = (sub.fields || []) as any[];
  const visibleFields = (subColumnIds.length ? subColumnIds : subFields.map(field => field.id))
    .map((fieldId: string) => subFields.find(field => field.id === fieldId))
    .filter(Boolean) as any[];

  const renderSubTableField = (field: any, subRow: any) => {
    const groupCtx: VisibilityContext = {
      getValue: fieldId => values[fieldId],
      getLineValue: (_rowId, fieldId) => subRow.values[fieldId],
      getLineItems: groupId => lineItems?.[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    };
    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: subRow.id, linePrefix: subKey });
    if (hideField) return <span className="muted">{'\u2014'}</span>;

    const anchorValue = anchorFieldId ? subRow.values[anchorFieldId] : undefined;
    if (hideUntilAnchor && anchorFieldId && field.id !== anchorFieldId && isEmptyValue(anchorValue as any)) {
      return <span className="muted">{'\u2014'}</span>;
    }

    ensureLineOptions(subKey, field);
    const optionSetField: OptionSet = resolveOptionSetForField(optionState, field, subKey);
    const dependencyIds = (
      Array.isArray(field.optionFilter?.dependsOn)
        ? field.optionFilter?.dependsOn
        : [field.optionFilter?.dependsOn || '']
    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const allowedField = computeAllowedOptions(
      field.optionFilter,
      optionSetField,
      dependencyIds.map((dep: string) => toDependencyValue(subRow.values[dep] ?? parentRowValues[dep] ?? values[dep]))
    );

    const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
    const renderAsLabel =
      field?.ui?.renderAsLabel === true || field?.renderAsLabel === true || field?.readOnly === true;
    const renderErrors = () => (
      <>
        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
        {renderWarnings(fieldPath)}
      </>
    );

    if (field.type === 'CHOICE') {
      const rawVal = subRow.values[field.id];
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      const allowedWithCurrent =
        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
          ? [...allowedField, choiceVal]
          : allowedField;
      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, {
        sort: optionSortFor(field)
      });
      if (renderAsLabel) {
        const selected = optsField.find(opt => opt.value === choiceVal);
        return (
          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
            {resolveLineItemTableReadOnlyDisplay({
              baseValue: selected?.label || choiceVal,
              field,
              rowValues: (subRow.values || {}) as Record<string, FieldValue>,
              language
            })}
          </div>
        );
      }
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          {renderChoiceControl({
            fieldPath,
            value: choiceVal || '',
            options: optsField,
            required: !!field.required,
            placeholder: resolveFieldHelperText({ ui: field?.ui, language }).placeholderText || undefined,
            searchEnabled: field?.ui?.choiceSearchEnabled ?? subUi?.choiceSearchEnabled,
            override: field?.ui?.control,
            disabled: isLineFieldInputDisabled(field),
            onChange: (next: FieldValue) => handleLineFieldChange(targetGroup, subRow.id, field, next)
          })}
          {renderErrors()}
        </div>
      );
    }

    if (field.type === 'CHECKBOX') {
      const hasAnyOption =
        !!((optionSetField.en && optionSetField.en.length) ||
          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
          ((optionSetField as any).nl && (optionSetField as any).nl.length));
      const isConsentCheckbox = !field.dataSource && !hasAnyOption;
      const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
      const allowedWithSelected = selected.reduce((acc, val) => {
        if (val && !acc.includes(val)) acc.push(val);
        return acc;
      }, [...allowedField]);
      const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
      if (renderAsLabel) {
        const labels = isConsentCheckbox
          ? [subRow.values[field.id] ? tSystem('common.yes', language, 'Yes') : tSystem('common.no', language, 'No')]
          : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
        return (
          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
            {resolveLineItemTableReadOnlyDisplay({
              baseValue: labels.length ? labels.join(', ') : '',
              field,
              rowValues: (subRow.values || {}) as Record<string, FieldValue>,
              language
            })}
          </div>
        );
      }
      if (isConsentCheckbox) {
        return (
          <div className="ck-line-item-table__control ck-line-item-table__control--consent" data-field-path={fieldPath}>
            <label className="inline">
              <input
                type="checkbox"
                className="ck-line-item-table__consent-checkbox"
                checked={!!subRow.values[field.id]}
                aria-label={resolveFieldLabel(field, language, field.id)}
                disabled={isLineFieldInputDisabled(field)}
                onChange={event => {
                  if (isLineFieldInputDisabled(field)) return;
                  handleLineFieldChange(targetGroup, subRow.id, field, event.target.checked);
                }}
              />
              <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
            </label>
            {renderErrors()}
          </div>
        );
      }
      const controlOverride = (field?.ui?.control || '').toString().trim().toLowerCase();
      const renderAsMultiSelect = controlOverride === 'select';
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          {renderAsMultiSelect ? (
            <select
              multiple
              value={selected}
              disabled={isLineFieldInputDisabled(field)}
              onChange={event => {
                if (isLineFieldInputDisabled(field)) return;
                const next = Array.from(event.currentTarget.selectedOptions)
                  .map(opt => opt.value)
                  .filter(Boolean);
                handleLineFieldChange(targetGroup, subRow.id, field, next);
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
                    disabled={isLineFieldInputDisabled(field)}
                    onChange={event => {
                      if (isLineFieldInputDisabled(field)) return;
                      const next = event.target.checked ? [...selected, opt.value] : selected.filter(value => value !== opt.value);
                      handleLineFieldChange(targetGroup, subRow.id, field, next);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
          {renderErrors()}
        </div>
      );
    }

    if (field.type === 'FILE_UPLOAD') {
      const items = toUploadItems(subRow.values[field.id]);
      const count = items.length;
      const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
      const helperNode = helperCfg.text ? <div className="ck-field-helper">{helperCfg.text}</div> : null;
      if (renderAsLabel) {
        return (
          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
            {resolveLineItemTableReadOnlyDisplay({
              baseValue: count ? `${count}` : '',
              field,
              rowValues: (subRow.values || {}) as Record<string, FieldValue>,
              language
            })}
          </div>
        );
      }
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              openFileOverlay({
                scope: 'line',
                title: resolveFieldLabel(field, language, field.id),
                group: parentQuestion,
                rowId: subRow.id,
                field,
                fieldPath
              });
            }}
            style={buttonStyles.secondary}
            disabled={submitting}
          >
            {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
          </button>
          {helperNode}
          {renderErrors()}
        </div>
      );
    }

    const mapped = field.valueMap
      ? resolveValueMapValue(
          field.valueMap,
          (fieldId: string) => {
            if (subRow.values.hasOwnProperty(fieldId)) return subRow.values[fieldId];
            return values[fieldId];
          },
          { language, targetOptions: toOptionSet(field) }
        )
      : undefined;
    const fieldValueRaw = field.valueMap ? mapped : ((subRow.values[field.id] as any) ?? '');
    const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
    const numberText =
      field.type === 'NUMBER'
        ? fieldValue === undefined || fieldValue === null
          ? ''
          : (fieldValue as any).toString()
        : '';
    if (renderAsLabel) {
      const display = field.type === 'NUMBER' ? numberText : field.type === 'DATE' ? fieldValue : fieldValue;
      return (
        <div className="ck-line-item-table__value" data-field-path={fieldPath}>
          {resolveLineItemTableReadOnlyDisplay({
            baseValue: display,
            field,
            rowValues: (subRow.values || {}) as Record<string, FieldValue>,
            language
          })}
        </div>
      );
    }

    const isEditableField =
      !isLineFieldInteractionBlocked(field) &&
      field?.readOnly !== true &&
      field?.ui?.renderAsLabel !== true &&
      field?.renderAsLabel !== true &&
      !!field?.valueMap === false;
    if (field.type === 'NUMBER') {
      const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
      const placeholder = helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          <NumberStepper
            value={numberText}
            disabled={isLineFieldInteractionBlocked(field)}
            readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
            ariaLabel={resolveFieldLabel(field, language, field.id)}
            placeholder={placeholder}
            onInvalidInput={
              isEditableField
                ? ({ reason, value }) => {
                    const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
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
                  }
                : undefined
            }
            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
          />
          {renderErrors()}
        </div>
      );
    }
    if (field.type === 'PARAGRAPH') {
      const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
      const placeholder = helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          <textarea
            className="ck-paragraph-input"
            value={fieldValue}
            onChange={event => handleLineFieldChange(targetGroup, subRow.id, field, event.target.value)}
            readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
            rows={field?.ui?.paragraphRows || 3}
            placeholder={placeholder}
          />
          {renderErrors()}
        </div>
      );
    }
    if (field.type === 'DATE') {
      return (
        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
          <DateInput
            value={fieldValue}
            language={language}
            min={field?.ui?.minDate}
            max={field?.ui?.maxDate}
            correctionMessages={field?.ui?.dateCorrectionMessages}
            iosNativeCommitMode="deferWhileFocused"
            readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
            ariaLabel={resolveFieldLabel(field, language, field.id)}
            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
          />
          {renderErrors()}
        </div>
      );
    }
    const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
    const placeholder = helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
    return (
      <div className="ck-line-item-table__control" data-field-path={fieldPath}>
        <input
          type="text"
          value={fieldValue}
          onChange={event => handleLineFieldChange(targetGroup, subRow.id, field, event.target.value)}
          readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
          placeholder={placeholder}
        />
        {renderErrors()}
      </div>
    );
  };

  return (
    <div className="ck-line-item-table__scroll" style={tableScrollStyle}>
      <LineItemTable
        columns={[
          ...visibleFields.map(field => ({
            id: field.id,
            label: (() => {
              const labelText = resolveFieldLabel(field, language, field.id);
              const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
              const isEditableField =
                !isLineFieldInteractionBlocked(field) &&
                field?.readOnly !== true &&
                field?.ui?.renderAsLabel !== true &&
                field?.renderAsLabel !== true &&
                !!field?.valueMap === false;
              if (!helperCfg.text || helperCfg.placement !== 'belowLabel' || !isEditableField) return labelText;
              return (
                <div className="ck-line-item-table__header-wrap">
                  <div>{labelText}</div>
                  <div className="ck-line-item-table__header-helper">{helperCfg.text}</div>
                </div>
              );
            })(),
            style: resolveSubColumnStyle(field.id),
            renderCell: (subRow: any) => renderSubTableField(field, subRow)
          })),
          ...(hideRemoveColumn
            ? []
            : [
                {
                  id: '__remove',
                  label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
                  className: 'ck-line-item-table__actions',
                  style: resolveSubColumnStyle('__remove'),
                  renderCell: (subRow: any) => {
                    const subRowSource = parseRowSource((subRow.values as any)?.[ROW_SOURCE_KEY]);
                    const subHideRemoveButton = parseRowHideRemove((subRow.values as any)?.[ROW_HIDE_REMOVE_KEY]);
                    const allowRemoveAutoSubRows = sub?.ui?.allowRemoveAutoRows !== false;
                    const canRemoveSubRow = !subHideRemoveButton && (allowRemoveAutoSubRows || subRowSource !== 'auto');
                    if (!canRemoveSubRow) return null;
                    return <LineItemRemoveButton language={language} onRemove={() => removeLineRow(subKey, subRow.id)} />;
                  }
                }
              ])
        ]}
        rows={subRows}
        emptyText={tSystem('lineItems.noOptionsAvailable', language, 'No options available.')}
        rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
      />
    </div>
  );
};
