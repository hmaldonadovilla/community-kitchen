import React from 'react';
import {
  buildLocalizedOptions,
  computeAllowedOptions,
  shouldHideField,
  toDependencyValue
} from '../../../../core';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  OptionSet,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import { DateInput } from '../../../components/form/DateInput';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { RequiredStar, srOnly } from '../../../components/form/ui';
import {
  resolveFieldHelperText,
  toDateInputValue
} from '../../../components/form/utils';
import { LineFileUploadOverlayButtonField } from '../../uploads/components/LineFileUploadOverlayButtonField';
import { optionSortFor } from '../domain/lineItemPresentation';
import type { RowFlowResolvedRow } from '../../steps/domain/rowFlow';
import type { OpenFileOverlayArgs } from '../../../components/form/lineItemGroupQuestionTypes';

export type RowFlowFieldRendererProps = {
  field: any;
  groupDef: WebQuestionDefinition;
  rowEntry: RowFlowResolvedRow | null | undefined;
  parentValues?: Record<string, FieldValue>;
  showLabel?: boolean;
  labelOverride?: string;
  language: LangCode;
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  submitting: boolean;
  groupChoiceSearchDefault?: boolean;
  buildVisibilityContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  resolveFieldLabel: (field: any, language: LangCode, fallback: string) => string;
  resolveOptionSetForField: (field: any, groupKey: string) => OptionSet;
  ensureLineOptions: (groupKey: string, field: any) => void;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  renderChoiceControl: (args: any) => React.ReactNode;
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  isLineFieldInputDisabled: (field: any) => boolean;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  handleLineFileInputChange: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
};

export const RowFlowFieldRenderer: React.FC<RowFlowFieldRendererProps> = ({
  field,
  groupDef,
  rowEntry,
  parentValues,
  showLabel = true,
  labelOverride,
  language,
  values,
  errors,
  submitting,
  groupChoiceSearchDefault,
  buildVisibilityContext,
  resolveFieldLabel,
  resolveOptionSetForField,
  ensureLineOptions,
  renderWarnings,
  renderChoiceControl,
  handleLineFieldChange,
  setErrors,
  onDiagnostic,
  isLineFieldInputDisabled,
  isLineFieldInteractionBlocked,
  openFileOverlay,
  handleLineFileInputChange,
  fileInputsRef
}) => {
  if (!rowEntry) return null;

  const rowValues = (rowEntry.row?.values || {}) as Record<string, FieldValue>;
  const groupKey = rowEntry.groupKey;
  const fieldPath = `${groupKey}__${field.id}__${rowEntry.row.id}`;
  const labelStyle = showLabel ? undefined : srOnly;
  const labelText = labelOverride || resolveFieldLabel(field, language, field.id);
  const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
  const helperText = helperCfg.text;
  const supportsPlaceholder = field?.type === 'TEXT' || field?.type === 'PARAGRAPH' || field?.type === 'NUMBER';
  const effectivePlacement =
    helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
  const isEditableField =
    !submitting &&
    field?.readOnly !== true &&
    field?.ui?.renderAsLabel !== true &&
    (field as any)?.renderAsLabel !== true &&
    !field?.valueMap;
  const helperId =
    helperText && effectivePlacement === 'belowLabel'
      ? (isEditableField ? `ck-field-helper-${fieldPath.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined)
      : undefined;
  const helperNode =
    helperText && effectivePlacement === 'belowLabel' && isEditableField ? (
      <div id={helperId} className="ck-field-helper">
        {helperText}
      </div>
    ) : null;
  const placeholder =
    helperText && effectivePlacement === 'placeholder' && isEditableField ? helperText : undefined;
  const ctxForVisibility = buildVisibilityContext({ rowValues, parentValues });
  if (shouldHideField(field.visibility, ctxForVisibility, { rowId: rowEntry.row.id, linePrefix: groupKey })) return null;

  const renderAsLabel = field?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || field?.readOnly === true;
  const renderReadOnly = (display: React.ReactNode) => (
    <div className="field inline-field ck-readonly-field" data-field-path={fieldPath}>
      <label style={labelStyle}>
        {labelText}
        {field.required && <RequiredStar />}
      </label>
      <div className="ck-readonly-value">{display ?? <span className="muted">{'\u2014'}</span>}</div>
      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
      {renderWarnings(fieldPath)}
    </div>
  );

  ensureLineOptions(groupKey, field);
  const optionSetField = resolveOptionSetForField(field, groupKey);
  const dependencyIds = (
    Array.isArray(field.optionFilter?.dependsOn)
      ? field.optionFilter?.dependsOn
      : [field.optionFilter?.dependsOn || '']
  ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
  const depVals = dependencyIds.map((dep: string) =>
    toDependencyValue(rowValues[dep] ?? (parentValues as any)?.[dep] ?? values[dep])
  );
  const allowedField = computeAllowedOptions(field.optionFilter, optionSetField, depVals);
  const currentVal = rowValues[field.id];
  const allowedWithCurrent =
    currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
      ? [...allowedField, currentVal]
      : allowedField;
  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });

  switch (field.type) {
    case 'CHOICE': {
      const rawVal = rowValues[field.id];
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      const selected = optsField.find(opt => opt.value === choiceVal);
      const display = selected?.label || choiceVal || null;
      if (renderAsLabel) return renderReadOnly(display);
      return (
        <div className="field inline-field" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          <div className="ck-control-row">
            {renderChoiceControl({
              fieldPath,
              value: choiceVal || '',
              options: optsField,
              required: !!field.required,
              searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
              override: (field as any)?.ui?.control,
              disabled: submitting,
              onChange: (next: FieldValue) => handleLineFieldChange(groupDef, rowEntry.row.id, field, next)
            })}
          </div>
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'CHECKBOX': {
      const hasAnyOption =
        !!((optionSetField.en && optionSetField.en.length) ||
          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
          ((optionSetField as any).nl && (optionSetField as any).nl.length));
      const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
      const selected = Array.isArray(rowValues[field.id]) ? (rowValues[field.id] as string[]) : [];
      if (renderAsLabel) {
        const display = optsField
          .filter(opt => selected.includes(opt.value))
          .map(opt => opt.label)
          .filter(Boolean)
          .join(', ');
        return renderReadOnly(display || selected.join(', '));
      }
      return (
        <div className="field inline-field" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          {isConsentCheckbox ? (
            <label className="inline">
              <input
                type="checkbox"
                checked={selected.length > 0}
                disabled={submitting}
                onChange={e => {
                  const next = e.target.checked ? ['true'] : [];
                  handleLineFieldChange(groupDef, rowEntry.row.id, field, next);
                }}
              />
              <span>{labelText}</span>
            </label>
          ) : (
            <div className="inline-options">
              {optsField.map(opt => (
                <label key={opt.value} className="inline">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    disabled={submitting}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...selected, opt.value]
                        : selected.filter(v => v !== opt.value);
                      handleLineFieldChange(groupDef, rowEntry.row.id, field, next);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'NUMBER': {
      const raw = rowValues[field.id] as any;
      const numberText = raw === undefined || raw === null ? '' : raw.toString();
      if (renderAsLabel) return renderReadOnly(numberText || null);
      const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
      return (
        <div className="field inline-field" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          <NumberStepper
            value={numberText}
            disabled={isLineFieldInteractionBlocked(field)}
            readOnly={isLineFieldInputDisabled(field)}
            ariaLabel={labelText}
            ariaDescribedBy={helperId}
            placeholder={placeholder}
            onInvalidInput={({ reason, value }) => {
              setErrors(prev => {
                const next = { ...prev };
                const existing = next[fieldPath];
                if (existing && existing !== numericOnlyMessage) return prev;
                if (existing === numericOnlyMessage) return prev;
                next[fieldPath] = numericOnlyMessage;
                return next;
              });
              onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
            }}
            onChange={next => handleLineFieldChange(groupDef, rowEntry.row.id, field, next)}
          />
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'DATE': {
      const raw = rowValues[field.id] as any;
      const dateValue = toDateInputValue(raw) || (raw || '').toString();
      if (renderAsLabel) return renderReadOnly(dateValue || null);
      return (
        <div className="field inline-field" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          <DateInput
            value={dateValue}
            language={language}
            min={(field as any)?.ui?.minDate}
            max={(field as any)?.ui?.maxDate}
            correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
            iosNativeCommitMode="deferWhileFocused"
            readOnly={field?.readOnly === true}
            ariaLabel={labelText}
            ariaDescribedBy={helperId}
            onChange={next => handleLineFieldChange(groupDef, rowEntry.row.id, field, next)}
          />
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'PARAGRAPH': {
      const value = (rowValues[field.id] as any) || '';
      if (renderAsLabel) return renderReadOnly(value || null);
      return (
        <div className="field inline-field ck-full-width" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          <textarea
            className="ck-paragraph-input"
            value={value}
            onChange={e => handleLineFieldChange(groupDef, rowEntry.row.id, field, e.target.value)}
            readOnly={field?.readOnly === true}
            rows={(field as any)?.ui?.paragraphRows || 4}
            placeholder={placeholder}
            aria-describedby={helperId}
          />
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'FILE_UPLOAD':
      return (
        <LineFileUploadOverlayButtonField
          group={groupDef}
          rowId={rowEntry.row.id}
          field={field}
          fieldPath={fieldPath}
          value={rowValues[field.id] as FieldValue | undefined}
          label={labelText}
          language={language}
          submitting={submitting}
          labelStyle={labelStyle}
          helperNode={helperNode}
          errors={errors}
          renderWarnings={renderWarnings}
          openFileOverlay={openFileOverlay}
          handleFileInputChange={handleLineFileInputChange}
          fileInputsRef={fileInputsRef}
        />
      );
    default: {
      const value = rowValues[field.id] as any;
      if (renderAsLabel) return renderReadOnly(value || null);
      return (
        <div className="field inline-field" data-field-path={fieldPath}>
          <label style={labelStyle}>
            {labelText}
            {field.required && <RequiredStar />}
          </label>
          <input
            type="text"
            value={value || ''}
            onChange={e => handleLineFieldChange(groupDef, rowEntry.row.id, field, e.target.value)}
            readOnly={field?.readOnly === true}
            placeholder={placeholder}
            aria-describedby={helperId}
          />
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
  }
};
