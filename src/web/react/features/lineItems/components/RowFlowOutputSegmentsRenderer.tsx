import React from 'react';
import { buildLocalizedOptions, toOptionSet } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type {
  FieldValue,
  LangCode,
  RowFlowActionRef,
  WebQuestionDefinition
} from '../../../../types';
import { AutoWidthInput } from '../../../components/form/AutoWidthInput';
import { AutoWidthSelect } from '../../../components/form/AutoWidthSelect';
import { resolveCompactTextControlDisplayValue } from '../../../components/form/compactControlValue';
import { sanitizeNumericDraft } from '../../../components/form/quantityConstraints';
import { resolveFieldLabel } from '../../../utils/labels';
import {
  resolveRowFlowSegmentActionIds,
  type RowFlowResolvedRow,
  type RowFlowResolvedSegment
} from '../../steps/domain/rowFlow';
import { optionSortFor } from '../domain/lineItemPresentation';
import { resolveRowFlowOutputSegmentPresentationAction } from '../domain/rowFlowDisplayValue';

export type RowFlowOutputSegmentsRendererProps = {
  segments: RowFlowResolvedSegment[];
  separator: string;
  rowOutputActions: RowFlowActionRef[];
  outputActionsLayout: 'inline' | 'below';
  language: LangCode;
  activeFieldPath: string;
  errors: Record<string, string>;
  renderRowFlowActionControl: (actionId: string) => React.ReactNode;
  resolveRowFlowFieldConfig: (groupKey: string, fieldId: string) => any;
  resolveRowFlowGroupConfig: (groupKey: string) => { config: any } | null;
  buildRowFlowGroupDefinition: (groupKey: string, groupConfig: any) => WebQuestionDefinition;
  renderRowFlowField: (args: {
    field: any;
    groupDef: WebQuestionDefinition;
    rowEntry: RowFlowResolvedRow | null | undefined;
    parentValues?: Record<string, FieldValue>;
    showLabel?: boolean;
    labelOverride?: string;
  }) => React.ReactNode;
  resolveRowFlowDisplayValue: (
    segment: RowFlowResolvedSegment,
    targetGroupKey: string,
    field: any,
    parentValues?: Record<string, FieldValue>,
    fallbackGroupKey?: string,
    fallbackField?: any,
    fallbackParentValues?: Record<string, FieldValue>
  ) => { text: string; hasValue: boolean };
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  isLineFieldInputDisabled: (field: any) => boolean;
  isLineFieldInteractionBlocked: (field: any) => boolean;
};

export const RowFlowOutputSegmentsRenderer: React.FC<RowFlowOutputSegmentsRendererProps> = ({
  segments,
  separator,
  rowOutputActions,
  outputActionsLayout,
  language,
  activeFieldPath,
  errors,
  renderRowFlowActionControl,
  resolveRowFlowFieldConfig,
  resolveRowFlowGroupConfig,
  buildRowFlowGroupDefinition,
  renderRowFlowField,
  resolveRowFlowDisplayValue,
  handleLineFieldChange,
  isLineFieldInputDisabled,
  isLineFieldInteractionBlocked
}) => {
  const outputActionsStart = rowOutputActions.filter(action => (action.position || 'start') !== 'end');
  const outputActionsEnd = rowOutputActions.filter(action => (action.position || 'start') === 'end');
  const hasOutputActions = outputActionsStart.length > 0 || outputActionsEnd.length > 0;
  const hasOutputSegments = segments.length > 0;

  const renderOutputSegment = (segment: RowFlowResolvedSegment, idx: number, showSeparator: boolean) => {
    const {
      segmentType,
      isBlockLayout,
      segmentTextStyle,
      segmentContainerStyle,
      spacerStyle
    } = resolveRowFlowOutputSegmentPresentationAction(segment.config);
    if (segmentType === 'spacer') {
      return (
        <span
          key={`${segment.id}-${idx}`}
          aria-hidden="true"
          style={spacerStyle}
        />
      );
    }
    if (segmentType === 'text') {
      const text = resolveLocalizedString(segment.config?.text, language, '');
      if (!text) return null;
      const separatorNode = showSeparator && separator ? (
        <span aria-hidden="true" style={{ marginLeft: 6, flexShrink: 0 }}>
          {separator}
        </span>
      ) : null;
      return (
        <span key={`${segment.id}-${idx}`} style={segmentContainerStyle}>
          <span
            style={{
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: text.includes('\n') ? 'pre-wrap' : undefined,
              ...segmentTextStyle
            }}
          >
            {text}
          </span>
          {separatorNode}
        </span>
      );
    }

    const target = segment.target;
    const fallbackTarget = segment.fallbackTarget;
    const field = target?.fieldId ? resolveRowFlowFieldConfig(target.groupKey, target.fieldId) : null;
    const fallbackField =
      fallbackTarget?.fieldId ? resolveRowFlowFieldConfig(fallbackTarget.groupKey, fallbackTarget.fieldId) : null;
    const displayTarget = target?.fieldId ? target : fallbackTarget;
    const displayField = field || fallbackField;
    if (!displayTarget || !displayField) return null;
    const label = segment.config.label
      ? resolveLocalizedString(segment.config.label, language, '')
      : '';
    const segmentActionIds = resolveRowFlowSegmentActionIds(segment.config);
    const segmentActionNodes = segmentActionIds
      .map(actionId => renderRowFlowActionControl(actionId))
      .filter(Boolean) as React.ReactNode[];
    const segmentActions = segmentActionNodes.length ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {segmentActionNodes}
      </span>
    ) : null;
    const separatorNode = showSeparator && separator ? (
      <span aria-hidden="true" style={{ marginLeft: 6, flexShrink: 0 }}>
        {separator}
      </span>
    ) : null;

    if (segment.config.renderAs === 'control' && target?.primaryRow && field) {
      const groupInfo = resolveRowFlowGroupConfig(target.primaryRow.groupKey);
      if (!groupInfo?.config) return null;
      const groupDef = buildRowFlowGroupDefinition(target.primaryRow.groupKey, groupInfo.config);
      const controlStyle = ((segment.config.controlStyle || 'default').toString() || 'default').trim().toLowerCase();
      if (controlStyle === 'compact') {
        const fieldPath = `${target.primaryRow.groupKey}__${field.id}__${target.primaryRow.row.id}`;
        const segmentHasError = Boolean((errors as any)?.[fieldPath]);
        if (field.type === 'NUMBER') {
          const rawValue = (target.primaryRow.row?.values || {})[field.id];
          const valueText = rawValue === undefined || rawValue === null ? '' : `${rawValue}`;
          const allowsIntegerOnly = Array.isArray(field?.validationRules)
            ? field.validationRules.some((rule: any) => rule?.then?.integer === true)
            : false;
          return (
            <span
              key={`${segment.config.fieldRef}-${idx}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                minWidth: 0,
                maxWidth: '100%',
                ...(isBlockLayout ? { flex: '1 0 100%', width: '100%' } : { flex: '0 0 auto' })
              }}
              data-field-path={fieldPath}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flex: '0 0 auto' }}>
                <AutoWidthInput
                  className="ck-compact-control ck-compact-control--number"
                  value={valueText}
                  disabled={isLineFieldInteractionBlocked(field)}
                  readOnly={field?.readOnly === true}
                  inputMode={allowsIntegerOnly ? 'numeric' : 'decimal'}
                  pattern={allowsIntegerOnly ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
                  ariaLabel={resolveFieldLabel(field, language, field.id)}
                  selectAllOnFocus
                  sanitize={raw =>
                    sanitizeNumericDraft(raw, {
                      integerOnly: allowsIntegerOnly,
                      rejectLeadingZeros: allowsIntegerOnly
                    })
                  }
                  minWidth={Number.isFinite(Number(segment.config.minWidth)) ? Number(segment.config.minWidth) : 48}
                  maxWidth={Number.isFinite(Number(segment.config.maxWidth)) ? Number(segment.config.maxWidth) : 132}
                  extraWidth={Math.max(
                    24,
                    Math.ceil((Number.isFinite(Number(segment.config.paddingChars)) ? Number(segment.config.paddingChars) : 2.2) * 8)
                  )}
                  onChange={next => handleLineFieldChange(groupDef, target.primaryRow!.row.id, field, next === '' ? null : next)}
                  inputStyle={{
                    boxSizing: 'border-box',
                    minHeight: 34,
                    paddingInlineStart: 8,
                    paddingInlineEnd: 8,
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 'var(--ck-font-control)',
                    fontWeight: 500,
                    lineHeight: 1,
                    ...(segmentHasError
                      ? {
                          borderColor: 'var(--danger)',
                          boxShadow: '0 0 0 1px var(--danger)'
                        }
                      : {})
                  }}
                />
                {segmentActions}
                {separatorNode}
              </span>
              {segmentHasError && (errors as any)?.[fieldPath] ? (
                <div className="error" style={{ marginTop: 0 }}>
                  {(errors as any)[fieldPath]}
                </div>
              ) : null}
            </span>
          );
        }
        if (field.type === 'CHOICE') {
          const rawValue = (target.primaryRow.row?.values || {})[field.id];
          const valueText =
            Array.isArray(rawValue) && rawValue.length ? `${rawValue[0] ?? ''}` : `${rawValue ?? ''}`;
          const options = buildLocalizedOptions(toOptionSet(field), toOptionSet(field).en || [], language, {
            sort: optionSortFor(field)
          }).map(option => ({
            value: option.value,
            label: option.label
          }));
          return (
            <span
              key={`${segment.config.fieldRef}-${idx}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                minWidth: 0,
                maxWidth: '100%',
                ...(isBlockLayout ? { flex: '1 0 100%', width: '100%' } : { flex: '0 0 auto' })
              }}
              data-field-path={fieldPath}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flex: '0 0 auto' }}>
                <AutoWidthSelect
                  className="ck-compact-control ck-compact-control--choice"
                  value={valueText}
                  options={options}
                  ariaLabel={resolveFieldLabel(field, language, field.id)}
                  minWidth={Number.isFinite(Number(segment.config.minWidth)) ? Number(segment.config.minWidth) : 76}
                  maxWidth={Number.isFinite(Number(segment.config.maxWidth)) ? Number(segment.config.maxWidth) : 180}
                  extraWidth={34}
                  disabled={isLineFieldInputDisabled(field)}
                  onChange={next => handleLineFieldChange(groupDef, target.primaryRow!.row.id, field, next)}
                  selectStyle={{
                    minHeight: 34,
                    fontSize: 'var(--ck-font-control)',
                    fontWeight: 500,
                    lineHeight: 1,
                    ...(segmentHasError
                      ? {
                          borderColor: 'var(--danger)',
                          boxShadow: '0 0 0 1px var(--danger)'
                        }
                      : {})
                  }}
                />
                {segmentActions}
                {separatorNode}
              </span>
              {segmentHasError && (errors as any)?.[fieldPath] ? (
                <div className="error" style={{ marginTop: 0 }}>
                  {(errors as any)[fieldPath]}
                </div>
              ) : null}
            </span>
          );
        }
        if (field.type === 'TEXT' || field.type === 'PARAGRAPH') {
          const rawValue = (target.primaryRow.row?.values || {})[field.id];
          const fallbackDisplay = resolveRowFlowDisplayValue(
            segment,
            target.groupKey,
            field,
            target.parentValues,
            fallbackTarget?.groupKey,
            fallbackField,
            fallbackTarget?.parentValues
          ).text;
          const displayValue = resolveCompactTextControlDisplayValue({
            explicitValue: rawValue as FieldValue,
            fallbackValue: fallbackDisplay,
            preserveEmptyWhileEditing: activeFieldPath === fieldPath
          });
          return (
            <span
              key={`${segment.config.fieldRef}-${idx}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
                minWidth: 0,
                maxWidth: '100%',
                ...(isBlockLayout ? { flex: '1 0 100%', width: '100%' } : { flex: '1 1 220px' })
              }}
              data-field-path={fieldPath}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  maxWidth: '100%',
                  width: '100%',
                  flex: '1 1 auto'
                }}
              >
                <AutoWidthInput
                  className="ck-compact-control ck-compact-control--text"
                  value={displayValue}
                  disabled={isLineFieldInteractionBlocked(field)}
                  readOnly={field?.readOnly === true}
                  ariaLabel={resolveFieldLabel(field, language, field.id)}
                  selectAllOnFocus
                  constrainToContainer
                  minWidth={Number.isFinite(Number(segment.config.minWidth)) ? Number(segment.config.minWidth) : 120}
                  maxWidth={Number.isFinite(Number(segment.config.maxWidth)) ? Number(segment.config.maxWidth) : 320}
                  extraWidth={Math.max(
                    32,
                    Math.ceil((Number.isFinite(Number(segment.config.paddingChars)) ? Number(segment.config.paddingChars) : 3) * 8)
                  )}
                  onChange={next => handleLineFieldChange(groupDef, target.primaryRow!.row.id, field, next === '' ? null : next)}
                  onBlur={next => {
                    if (next !== '') return;
                    handleLineFieldChange(groupDef, target.primaryRow!.row.id, field, null);
                  }}
                  inputStyle={{
                    boxSizing: 'border-box',
                    minHeight: 34,
                    paddingInlineStart: 8,
                    paddingInlineEnd: 8,
                    textAlign: 'left',
                    fontSize: 'var(--ck-font-control)',
                    fontWeight: 500,
                    lineHeight: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    ...(segmentHasError
                      ? {
                          borderColor: 'var(--danger)',
                          boxShadow: '0 0 0 1px var(--danger)'
                        }
                      : {})
                  }}
                />
                {segmentActions}
                {separatorNode}
              </span>
              {segmentHasError && (errors as any)?.[fieldPath] ? (
                <div className="error" style={{ marginTop: 0 }}>
                  {(errors as any)[fieldPath]}
                </div>
              ) : null}
            </span>
          );
        }
        if (field.type === 'CHECKBOX') {
          const optionSet = toOptionSet(field);
          const hasAnyOption =
            !!((optionSet.en && optionSet.en.length) ||
              ((optionSet as any).fr && (optionSet as any).fr.length) ||
              ((optionSet as any).nl && (optionSet as any).nl.length));
          const isConsentCheckbox = !(field as any)?.dataSource && !hasAnyOption;
          if (!isConsentCheckbox) return null;
          const checked = !!(target.primaryRow.row?.values || {})[field.id];
          return (
            <span
              key={`${segment.config.fieldRef}-${idx}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                minWidth: 0,
                maxWidth: '100%',
                ...(isBlockLayout ? { flex: '1 0 100%', width: '100%' } : { flex: '0 0 auto' })
              }}
              data-field-path={fieldPath}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flex: '0 0 auto' }}>
                <label
                  className="ck-row-flow__consent-toggle"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 32,
                    minHeight: 32,
                    marginInlineStart: 4,
                    cursor: isLineFieldInputDisabled(field) ? 'default' : 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    className="ck-row-flow__consent-checkbox"
                    checked={checked}
                    disabled={isLineFieldInputDisabled(field)}
                    aria-label={resolveFieldLabel(field, language, field.id)}
                    onChange={event => {
                      if (isLineFieldInputDisabled(field)) return;
                      handleLineFieldChange(groupDef, target.primaryRow!.row.id, field, event.target.checked);
                    }}
                    style={{ margin: 0 }}
                  />
                </label>
                {segmentActions}
                {separatorNode}
              </span>
              {segmentHasError && (errors as any)?.[fieldPath] ? (
                <div className="error" style={{ marginTop: 0 }}>
                  {(errors as any)[fieldPath]}
                </div>
              ) : null}
            </span>
          );
        }
      }
      return (
        <span key={`${segment.config.fieldRef}-${idx}`} style={{ ...segmentContainerStyle, gap: 8 }}>
          {label ? (
            <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{label}:</span>
          ) : null}
          {renderRowFlowField({
            field,
            groupDef,
            rowEntry: target.primaryRow,
            parentValues: target.parentValues,
            showLabel: false
          })}
          {segmentActions}
          {separatorNode}
        </span>
      );
    }

    const display = resolveRowFlowDisplayValue(
      segment,
      displayTarget.groupKey,
      displayField,
      displayTarget.parentValues,
      fallbackTarget?.groupKey,
      fallbackField,
      fallbackTarget?.parentValues
    );
    const text = display.text || '—';
    const formatted = label
      ? label.includes('{{value}}')
        ? label.replace('{{value}}', text)
        : `${label}: ${text}`
      : text;
    return (
      <span key={`${segment.config.fieldRef}-${idx}`} style={segmentContainerStyle}>
        <span
          style={{
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: formatted.includes('\n') ? 'pre-wrap' : undefined,
            ...segmentTextStyle
          }}
        >
          {formatted}
        </span>
        {segmentActions}
        {separatorNode}
      </span>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, rowGap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
          {outputActionsLayout === 'inline'
            ? outputActionsStart.map(action => renderRowFlowActionControl(action.id))
            : null}
          {segments.map((segment, idx) => renderOutputSegment(segment, idx, idx < segments.length - 1))}
          {outputActionsLayout === 'inline'
            ? outputActionsEnd.map(action => renderRowFlowActionControl(action.id))
            : null}
        </div>
      </div>
      {outputActionsLayout === 'below' && hasOutputActions ? (
        <div style={{ marginTop: hasOutputSegments ? 8 : 0, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {outputActionsStart.map(action => renderRowFlowActionControl(action.id))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {outputActionsEnd.map(action => renderRowFlowActionControl(action.id))}
          </div>
        </div>
      ) : null}
    </>
  );
};
