import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
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
import { DateInput } from '../../../components/form/DateInput';
import { InfoTooltip } from '../../../components/form/InfoTooltip';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { buttonStyles, RequiredStar, srOnly } from '../../../components/form/ui';
import {
  describeUploadItem,
  resolveFieldHelperText,
  toDateInputValue,
  toUploadItems
} from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { FormErrors, OptionState } from '../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { LineFileUploadQuestion } from '../../uploads/components/LineFileUploadQuestion';
import { optionSortFor } from '../domain/lineItemPresentation';
import { LineItemReadOnlyField } from './LineItemFieldChrome';

type LineItemSubgroupFieldRenderOptions = {
  inGrid?: boolean;
};

export type LineItemSubgroupFieldRendererDeps = {
  subKey: string;
  subRow: { id: string; values: Record<string, FieldValue>; [key: string]: any };
  parentRowValues: Record<string, FieldValue>;
  values: Record<string, FieldValue>;
  selectorCfg?: any;
  selectorValue?: string;
  targetGroup: WebQuestionDefinition;
  optionState: OptionState;
  language: LangCode;
  errors: FormErrors;
  submitting: boolean;
  subCtx: VisibilityContext;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  ensureLineOptions: (groupKey: string, field: any) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  handleLineFileInputChange: (args: any) => void;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  isLineFieldInputDisabled: (field: any) => boolean;
  isFileUploadOrderedEntryBlocked: (args: any) => boolean;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  renderUploadFailure: (fieldPath: string, disabled?: boolean) => React.ReactNode;
  openInfoOverlay: (title: string, text: string) => void;
  openFileOverlay: (args: any) => void;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

type LineItemSubgroupFieldRendererArgs = LineItemSubgroupFieldRendererDeps & {
  field: any;
  opts?: LineItemSubgroupFieldRenderOptions;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

/**
 * Owner: line-items feature renderer.
 * Renders one non-table subgroup field while the parent owns row layout,
 * compact-row composition, and state mutation callbacks.
 */
export const renderLineItemSubgroupField = ({
  field,
  opts,
  subKey,
  subRow,
  parentRowValues,
  values,
  selectorCfg,
  selectorValue,
  targetGroup,
  optionState,
  language,
  errors,
  submitting,
  subCtx,
  fileInputsRef,
  uploadAnnouncements,
  ensureLineOptions,
  renderChoiceControl,
  handleLineFieldChange,
  handleLineFileInputChange,
  isLineFieldInteractionBlocked,
  isLineFieldInputDisabled,
  isFileUploadOrderedEntryBlocked,
  hasWarning,
  renderWarnings,
  renderUploadFailure,
  openInfoOverlay,
  openFileOverlay,
  setErrors,
  onDiagnostic
}: LineItemSubgroupFieldRendererArgs): React.ReactNode => {
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
    dependencyIds.map((dep: string) => {
      const selectorFallback = selectorCfg && dep === selectorCfg.id ? selectorValue : undefined;
      return toDependencyValue(subRow.values[dep] ?? values[dep] ?? parentRowValues[dep] ?? selectorFallback);
    })
  );
  const currentVal = subRow.values[field.id];
  const allowedWithCurrent =
    currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
      ? [...allowedField, currentVal]
      : allowedField;
  const selectedSub = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : null;
  const allowedWithSelection =
    selectedSub && selectedSub.length
      ? selectedSub.reduce((acc, val) => {
          if (val && !acc.includes(val)) acc.push(val);
          return acc;
        }, [...allowedWithCurrent])
      : allowedWithCurrent;
  const optsField = buildLocalizedOptions(optionSetField, allowedWithSelection, language, { sort: optionSortFor(field) });
  const hideField = shouldHideField(field.visibility, subCtx, {
    rowId: subRow.id,
    linePrefix: subKey
  });
  if (hideField) return null;

  const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
  const hideLabel = Boolean(field?.ui?.hideLabel);
  const inGrid = opts?.inGrid === true;
  const labelStyle = hideLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
  const renderAsLabel = field?.ui?.renderAsLabel === true || field?.renderAsLabel === true || field?.readOnly === true;
  const renderReadOnlyLine = (display: React.ReactNode) => (
    <LineItemReadOnlyField
      key={field.id}
      field={field}
      fieldPath={fieldPath}
      language={language}
      forceStackedLabel={field?.ui?.labelLayout === 'stacked'}
      fieldIsStacked={false}
      labelStyle={labelStyle}
      error={errors[fieldPath]}
      hasWarning={hasWarning(fieldPath)}
      renderWarnings={() => renderWarnings(fieldPath)}
      display={display}
    />
  );

  if (renderAsLabel) {
    switch (field.type) {
      case 'CHOICE': {
        const rawVal = subRow.values[field.id];
        const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        const selected = optsField.find(opt => opt.value === choiceVal);
        return renderReadOnlyLine(selected?.label || choiceVal || null);
      }
      case 'CHECKBOX': {
        const hasAnyOption =
          !!((optionSetField.en && optionSetField.en.length) ||
            ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
            ((optionSetField as any).nl && (optionSetField as any).nl.length));
        const isConsentCheckbox = !field.dataSource && !hasAnyOption;
        if (isConsentCheckbox) {
          return renderReadOnlyLine(
            subRow.values[field.id] ? tSystem('common.yes', language, 'Yes') : tSystem('common.no', language, 'No')
          );
        }
        const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
        const labels = selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
        return renderReadOnlyLine(labels.length ? labels.join(', ') : null);
      }
      case 'FILE_UPLOAD': {
        const items = toUploadItems(subRow.values[field.id] as any);
        const displayContent = items.length
          ? items.map((item: any, idx: number) => (
              <div key={`${field.id}-file-${idx}`} className="ck-readonly-file">
                {describeUploadItem(item as any)}
              </div>
            ))
          : null;
        return renderReadOnlyLine(displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null);
      }
      default: {
        const mapped = field.valueMap
          ? resolveValueMapValue(
              field.valueMap,
              (fieldId: string) => {
                if (subRow.values.hasOwnProperty(fieldId)) return subRow.values[fieldId];
                if (parentRowValues.hasOwnProperty(fieldId)) return parentRowValues[fieldId];
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
        const display = field.type === 'NUMBER' ? numberText : field.type === 'DATE' ? fieldValue : fieldValue;
        return renderReadOnlyLine(display || null);
      }
    }
  }

  switch (field.type) {
    case 'CHOICE': {
      const rawVal = subRow.values[field.id];
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      return (
        <div
          key={field.id}
          className={`field inline-field${field?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(field, language, field.id)}
            {field.required && <RequiredStar />}
          </label>
          {renderChoiceControl({
            fieldPath,
            value: choiceVal || '',
            options: optsField,
            required: !!field.required,
            placeholder: resolveFieldHelperText({ ui: field?.ui, language }).placeholderText || undefined,
            searchEnabled: field?.ui?.choiceSearchEnabled ?? targetGroup?.lineItemConfig?.ui?.choiceSearchEnabled,
            override: field?.ui?.control,
            disabled: isLineFieldInputDisabled(field),
            onChange: (next: FieldValue) => handleLineFieldChange(targetGroup, subRow.id, field, next)
          })}
          {(() => {
            const selected = optsField.find(opt => opt.value === choiceVal);
            if (!selected?.tooltip) return null;
            const fallbackLabel = resolveFieldLabel(field, language, field.id);
            const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
            return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
          })()}
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
      const isConsentCheckbox = !field.dataSource && !hasAnyOption;
      const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
      return (
        <div
          key={field.id}
          className={`field inline-field${field?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(field, language, field.id)}
            {field.required && <RequiredStar />}
          </label>
          {isConsentCheckbox ? (
            <div className="ck-choice-control ck-consent-control">
              <label className="ck-consent">
                <input
                  type="checkbox"
                  checked={!!subRow.values[field.id]}
                  disabled={isLineFieldInputDisabled(field)}
                  onChange={event => {
                    if (isLineFieldInputDisabled(field)) return;
                    handleLineFieldChange(targetGroup, subRow.id, field, event.target.checked);
                  }}
                />
              </label>
            </div>
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
          {(() => {
            const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
            if (!withTooltips.length) return null;
            const fallbackLabel = resolveFieldLabel(field, language, field.id);
            const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
            return (
              <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {withTooltips.map(opt => (
                  <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {opt.label}{' '}
                    <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                  </span>
                ))}
              </div>
            );
          })()}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
    case 'FILE_UPLOAD':
      return (
        <LineFileUploadQuestion
          key={field.id}
          group={targetGroup}
          rowId={subRow.id}
          field={field}
          fieldPath={fieldPath}
          value={subRow.values[field.id] as FieldValue | undefined}
          language={language}
          submitting={submitting}
          forceStackedLabel={field?.ui?.labelLayout === 'stacked'}
          labelStyle={labelStyle}
          cameraButtonStyle={buttonStyles.primary}
          progressButtonClassName="ck-list-row-action-btn"
          errors={errors}
          hasWarning={hasWarning}
          renderWarnings={renderWarnings}
          checkFileUploadOrderedEntry={isFileUploadOrderedEntryBlocked}
          openFileOverlay={openFileOverlay}
          handleFileInputChange={handleLineFileInputChange}
          fileInputsRef={fileInputsRef}
          uploadAnnouncements={uploadAnnouncements}
          renderUploadFailure={renderUploadFailure}
          onDiagnostic={onDiagnostic}
        />
      );
    default: {
      const mapped = field.valueMap
        ? resolveValueMapValue(
            field.valueMap,
            (fieldId: string) => {
              if (subRow.values.hasOwnProperty(fieldId)) return subRow.values[fieldId];
              if (parentRowValues.hasOwnProperty(fieldId)) return parentRowValues[fieldId];
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
      const helperCfg = resolveFieldHelperText({ ui: field?.ui, language });
      const helperText = helperCfg.text;
      const supportsPlaceholder = field.type === 'TEXT' || field.type === 'PARAGRAPH' || field.type === 'NUMBER';
      const effectivePlacement = helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
      const isEditableField =
        !isLineFieldInteractionBlocked(field) &&
        field?.readOnly !== true &&
        field?.ui?.renderAsLabel !== true &&
        field?.renderAsLabel !== true &&
        !field.valueMap;
      const helperId =
        helperText && effectivePlacement === 'belowLabel' && isEditableField
          ? `ck-field-helper-${fieldPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
          : undefined;
      const helperNode =
        helperText && effectivePlacement === 'belowLabel' && isEditableField ? (
          <div id={helperId} className="ck-field-helper">
            {helperText}
          </div>
        ) : null;
      const placeholder = helperText && effectivePlacement === 'placeholder' && isEditableField ? helperText : undefined;
      return (
        <div
          key={field.id}
          className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
            field?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''
          }`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(field, language, field.id)}
            {field.required && <RequiredStar />}
          </label>
          {field.type === 'NUMBER' ? (
            <NumberStepper
              value={numberText}
              disabled={isLineFieldInteractionBlocked(field)}
              readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
              ariaLabel={resolveFieldLabel(field, language, field.id)}
              ariaDescribedBy={helperId}
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
          ) : field.type === 'PARAGRAPH' ? (
            <textarea
              className="ck-paragraph-input"
              value={fieldValue}
              onChange={event => handleLineFieldChange(targetGroup, subRow.id, field, event.target.value)}
              readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
              rows={field?.ui?.paragraphRows || 4}
              placeholder={placeholder}
              aria-describedby={helperId}
            />
          ) : field.type === 'DATE' ? (
            <DateInput
              value={fieldValue}
              language={language}
              min={field?.ui?.minDate}
              max={field?.ui?.maxDate}
              correctionMessages={field?.ui?.dateCorrectionMessages}
              iosNativeCommitMode="deferWhileFocused"
              readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
              ariaLabel={resolveFieldLabel(field, language, field.id)}
              ariaDescribedBy={helperId}
              onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
            />
          ) : (
            <input
              type="text"
              value={fieldValue}
              onChange={event => handleLineFieldChange(targetGroup, subRow.id, field, event.target.value)}
              readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
              placeholder={placeholder}
              aria-describedby={helperId}
            />
          )}
          {helperNode}
          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
          {renderWarnings(fieldPath)}
        </div>
      );
    }
  }
};
