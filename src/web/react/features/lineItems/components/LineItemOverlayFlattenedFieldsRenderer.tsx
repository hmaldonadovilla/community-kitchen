import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  matchesWhenClause,
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
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../../types';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import {
  resolveLineItemRowLimits,
  resolveSubgroupKey
} from '../../../app/lineItems';
import { DateInput } from '../../../components/form/DateInput';
import { PairedRowGrid } from '../../../components/form/PairedRowGrid';
import { buttonStyles, RequiredStar } from '../../../components/form/ui';
import {
  toDateInputValue,
  toUploadItems
} from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { optionSortFor } from '../domain/lineItemPresentation';
import {
  normalizeOverlayFlattenPlacementAction as normalizeOverlayFlattenPlacement,
  resolveOverlayFlattenedFieldTargetsAction
} from '../domain/overlayFlattenedFields';

type RenderLineItemOverlayFlattenedFieldsArgs = {
  field: any;
  overlayOpenAction: any;
  placementOverride?: 'left' | 'right' | 'below';
  options?: { asGridItems?: boolean; forceStackedLabel?: boolean };
  q: WebQuestionDefinition;
  row: { id: string; values: Record<string, FieldValue> };
  definition: WebFormDefinition;
  subGroups: any[];
  lineItems: LineItemState;
  values: Record<string, FieldValue>;
  optionState: OptionState;
  language: LangCode;
  errors: FormErrors;
  submitting: boolean;
  resolveTopValue: (fieldId: string) => FieldValue;
  ensureLineOptions: (groupId: string, field: any) => void;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  hasWarning: (fieldPath: string) => boolean;
  renderChoiceControl: (args: any) => React.ReactNode;
  isLineFieldInputDisabled: (field: any) => boolean;
  handleLineFieldChange: (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  openFileOverlay: (args: any) => void;
  logOverlayOpenActionOnce: (key: string, event: string, payload: Record<string, unknown>) => void;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

export const renderLineItemOverlayFlattenedFields = ({
  field,
  overlayOpenAction,
  placementOverride,
  options,
  q,
  row,
  definition,
  subGroups,
  lineItems,
  values,
  optionState,
  language,
  errors,
  submitting,
  resolveTopValue,
  ensureLineOptions,
  renderWarnings,
  hasWarning,
  renderChoiceControl,
  isLineFieldInputDisabled,
  handleLineFieldChange,
  openFileOverlay,
  logOverlayOpenActionOnce
}: RenderLineItemOverlayFlattenedFieldsArgs): React.ReactNode => {
  if (!overlayOpenAction || !overlayOpenAction.flattenFields || overlayOpenAction.flattenFields.length === 0) return null;
  const targetKey = overlayOpenAction.targetKey || overlayOpenAction.subKey || '';
  if (!targetKey) return null;
  const flattenPlacement = normalizeOverlayFlattenPlacement(placementOverride ?? overlayOpenAction.flattenPlacement);
  const forceStackedLabel = options?.forceStackedLabel === true;

  const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
    if (!filter) return true;
    const includeWhen = (filter as any)?.includeWhen;
    const excludeWhen = (filter as any)?.excludeWhen;
    const rowCtx: VisibilityContext = {
      getValue: fid => (rowValues as any)[fid],
      getLineItems: groupId => lineItems?.[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    };
    const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
    const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
    return includeOk && !excludeMatch;
  };

  const resolveTargetGroup = (): { group?: WebQuestionDefinition; config?: any; kind: 'line' | 'sub' } | null => {
    if (overlayOpenAction.targetKind === 'line') {
      const group =
        overlayOpenAction.overrideGroup ||
        (definition.questions.find(q => q.id === overlayOpenAction.groupId && q.type === 'LINE_ITEM_GROUP') as
          | WebQuestionDefinition
          | undefined);
      if (!group) return null;
      return { group, config: (group as any).lineItemConfig, kind: 'line' };
    }
    const subConfigBase = (subGroups || []).find(sub => resolveSubgroupKey(sub as any) === overlayOpenAction.groupId);
    if (!subConfigBase) return null;
    const subConfig = overlayOpenAction.groupOverride
      ? applyLineItemGroupOverride(subConfigBase, overlayOpenAction.groupOverride)
      : subConfigBase;
    const group: WebQuestionDefinition = {
      ...(q as any),
      id: targetKey,
      lineItemConfig: { ...(subConfig as any), fields: subConfig?.fields || [], subGroups: [] }
    };
    return { group, config: subConfig, kind: 'sub' };
  };

  const targetInfo = resolveTargetGroup();
  if (!targetInfo?.group || !targetInfo.config) return null;
  const { maxRows } = resolveLineItemRowLimits(targetInfo.config as any);
  if (maxRows !== 1) {
    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::maxRows`;
    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
      scope: 'line',
      parentGroupId: q.id,
      fieldId: field.id,
      groupId: overlayOpenAction.groupId,
      reason: 'maxRows',
      maxRows: maxRows ?? null
    });
    return null;
  }

  const flattenedTargets = resolveOverlayFlattenedFieldTargetsAction({
    rows: lineItems[targetKey] || [],
    rowFilter: overlayOpenAction.rowFilter,
    flattenFields: overlayOpenAction.flattenFields,
    targetFieldsAll: (targetInfo.config?.fields || []) as any[],
    matchesRowFilter: isIncludedByRowFilter
  });
  if (!flattenedTargets.ok && flattenedTargets.reason === 'noRow') {
    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::noRow`;
    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
      scope: 'line',
      parentGroupId: q.id,
      fieldId: field.id,
      groupId: overlayOpenAction.groupId,
      reason: 'noRow'
    });
    return null;
  }
  if (!flattenedTargets.ok && flattenedTargets.reason === 'multipleRows') {
    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::multiRow`;
    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
      scope: 'line',
      parentGroupId: q.id,
      fieldId: field.id,
      groupId: overlayOpenAction.groupId,
      reason: 'multipleRows',
      count: flattenedTargets.count
    });
    return null;
  }
  if (!flattenedTargets.ok) return null;

  const { targetRow, targetFields } = flattenedTargets;

  const targetChoiceSearchDefault = (targetInfo.config?.ui as any)?.choiceSearchEnabled;
  const targetGroupCtx: VisibilityContext = {
    getValue: fid => resolveTopValue(fid),
    getLineValue: (_rowId, fid) => (targetRow?.values || {})[fid],
    getLineItems: groupId => lineItems?.[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  };
  const resolveDependencyValue = (dep: string): FieldValue | undefined => {
    if (Object.prototype.hasOwnProperty.call(targetRow?.values || {}, dep)) return (targetRow?.values || {})[dep];
    if (targetInfo.kind === 'sub' && Object.prototype.hasOwnProperty.call(row.values || {}, dep)) return (row.values || {})[dep];
    return values[dep];
  };
  const renderFlattenedField = (flatField: any) => {
    const hideField = shouldHideField(flatField.visibility, targetGroupCtx, { rowId: targetRow.id, linePrefix: targetKey });
    if (hideField) return null;
    ensureLineOptions(targetKey, flatField);
    const fieldPath = `${targetKey}__${flatField.id}__${targetRow.id}`;
    const renderAsLabel =
      flatField?.ui?.renderAsLabel === true || flatField?.renderAsLabel === true || flatField?.readOnly === true;
    const hideLabel = Boolean(flatField?.ui?.hideLabel);
    const useStackedLabel = forceStackedLabel || flatField.ui?.labelLayout === 'stacked';
    const labelStyle = hideLabel ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : undefined;
    const valueMapApplied = flatField.valueMap
      ? resolveValueMapValue(
          flatField.valueMap,
          fid => {
            if ((targetRow.values || {}).hasOwnProperty(fid)) return (targetRow.values || {})[fid];
            return values[fid];
          },
          { language, targetOptions: toOptionSet(flatField) }
        )
      : undefined;
    const fieldValueRaw = flatField.valueMap ? valueMapApplied : ((targetRow.values || {})[flatField.id] as any);
    const fieldValue = flatField.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
    const numberText =
      flatField.type === 'NUMBER'
        ? fieldValue === undefined || fieldValue === null
          ? ''
          : (fieldValue as any).toString()
        : '';
    const displayValue =
      flatField.type === 'NUMBER'
        ? numberText
        : flatField.type === 'DATE'
          ? fieldValue
          : fieldValue;
    const displayText = displayValue === undefined || displayValue === null ? '' : displayValue.toString();
    const renderErrors = () => (
      <>
        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
        {renderWarnings(fieldPath)}
      </>
    );
    const readOnlyNode = <div className="ck-readonly-value">{displayText ? displayText : <span className="muted">—</span>}</div>;

    if (flatField.type === 'CHOICE') {
      const rawVal = (targetRow.values || {})[flatField.id];
      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
      const optionSetField: OptionSet = resolveOptionSetForField(optionState, flatField, targetKey);
      const dependencyIds = (
        Array.isArray(flatField.optionFilter?.dependsOn)
          ? flatField.optionFilter?.dependsOn
          : [flatField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
      const allowedField = computeAllowedOptions(
        flatField.optionFilter,
        optionSetField,
        dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
      );
      const allowedWithCurrent =
        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
          ? [...allowedField, choiceVal]
          : allowedField;
      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(flatField) });
      const selected = optsField.find(opt => opt.value === choiceVal);
      return (
        <div
          key={fieldPath}
          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(flatField, language, flatField.id)}
            {flatField.required && <RequiredStar />}
          </label>
          <div className="ck-control-row">
            {renderAsLabel ? (
              <div className="ck-readonly-value">{selected?.label || choiceVal || '—'}</div>
            ) : (
              renderChoiceControl({
                fieldPath,
                value: choiceVal || '',
                options: optsField,
                required: !!flatField.required,
                searchEnabled: flatField.ui?.choiceSearchEnabled ?? targetChoiceSearchDefault,
                override: flatField.ui?.control,
                disabled: isLineFieldInputDisabled(flatField),
                onChange: (next: FieldValue) => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)
              })
            )}
          </div>
          {renderErrors()}
        </div>
      );
    }

    if (flatField.type === 'CHECKBOX') {
      const optionSetField: OptionSet = resolveOptionSetForField(optionState, flatField, targetKey);
      const dependencyIds = (
        Array.isArray(flatField.optionFilter?.dependsOn)
          ? flatField.optionFilter?.dependsOn
          : [flatField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
      const allowedField = computeAllowedOptions(
        flatField.optionFilter,
        optionSetField,
        dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
      );
      const hasAnyOption =
        !!((optionSetField.en && optionSetField.en.length) ||
          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
          ((optionSetField as any).nl && (optionSetField as any).nl.length));
      const isConsentCheckbox = !(flatField as any).dataSource && !hasAnyOption;
      const selected = Array.isArray(targetRow.values[flatField.id]) ? (targetRow.values[flatField.id] as string[]) : [];
      const allowedWithSelected = selected.reduce((acc, val) => {
        if (val && !acc.includes(val)) acc.push(val);
        return acc;
      }, [...allowedField]);
      const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(flatField) });
      if (isConsentCheckbox) {
        return (
          <div
            key={fieldPath}
            className={`field inline-field ck-consent-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={fieldPath}
            data-has-error={errors[fieldPath] ? 'true' : undefined}
            data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
          >
            <label>
              <input
                type="checkbox"
                checked={!!targetRow.values[flatField.id]}
                disabled={isLineFieldInputDisabled(flatField)}
                onChange={e => {
                  if (isLineFieldInputDisabled(flatField)) return;
                  handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.checked);
                }}
              />
              <span className="ck-consent-text" style={labelStyle}>
                {resolveFieldLabel(flatField, language, flatField.id)}
                {flatField.required && <RequiredStar />}
              </span>
            </label>
            {renderErrors()}
          </div>
        );
      }
      const controlOverride = ((flatField as any)?.ui?.control || '').toString().trim().toLowerCase();
      const renderAsMultiSelect = controlOverride === 'select';
      return (
        <div
          key={fieldPath}
          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(flatField, language, flatField.id)}
            {flatField.required && <RequiredStar />}
          </label>
          {renderAsLabel ? (
            readOnlyNode
          ) : renderAsMultiSelect ? (
            <select
              multiple
              value={selected}
              disabled={isLineFieldInputDisabled(flatField)}
              onChange={e => {
                if (isLineFieldInputDisabled(flatField)) return;
                const next = Array.from(e.currentTarget.selectedOptions).map(o => o.value);
                handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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
                    disabled={isLineFieldInputDisabled(flatField)}
                    onChange={e => {
                      if (isLineFieldInputDisabled(flatField)) return;
                      const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                      handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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

    if (flatField.type === 'FILE_UPLOAD') {
      const items = toUploadItems((targetRow.values || {})[flatField.id]);
      const count = items.length;
      return (
        <div
          key={fieldPath}
          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(flatField, language, flatField.id)}
            {flatField.required && <RequiredStar />}
          </label>
          {renderAsLabel ? (
            <div className="ck-readonly-value">{count ? `${count}` : '—'}</div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (submitting) return;
                openFileOverlay({
                  scope: 'line',
                  title: resolveFieldLabel(flatField, language, flatField.id),
                  group: targetInfo.group as WebQuestionDefinition,
                  rowId: targetRow.id,
                  field: flatField,
                  fieldPath
                });
              }}
              style={buttonStyles.secondary}
              disabled={submitting}
            >
              {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
            </button>
          )}
          {renderErrors()}
        </div>
      );
    }

    if (renderAsLabel) {
      return (
        <div
          key={fieldPath}
          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
          data-field-path={fieldPath}
          data-has-error={errors[fieldPath] ? 'true' : undefined}
          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveFieldLabel(flatField, language, flatField.id)}
            {flatField.required && <RequiredStar />}
          </label>
          <div className="ck-control-row">{readOnlyNode}</div>
          {renderErrors()}
        </div>
      );
    }

    return (
      <div
        key={fieldPath}
        className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
        data-field-path={fieldPath}
        data-has-error={errors[fieldPath] ? 'true' : undefined}
        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
      >
        <label style={labelStyle}>
          {resolveFieldLabel(flatField, language, flatField.id)}
          {flatField.required && <RequiredStar />}
        </label>
        <div className="ck-control-row">
          {flatField.type === 'PARAGRAPH' ? (
            <textarea
              className="ck-paragraph-input"
              value={fieldValue}
              onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
              readOnly={!!flatField.valueMap || isLineFieldInputDisabled(flatField)}
              rows={(flatField as any)?.ui?.paragraphRows || 4}
            />
          ) : flatField.type === 'DATE' ? (
            <DateInput
              value={fieldValue}
              language={language}
              min={(flatField as any)?.ui?.minDate}
              max={(flatField as any)?.ui?.maxDate}
              correctionMessages={(flatField as any)?.ui?.dateCorrectionMessages}
              iosNativeCommitMode="deferWhileFocused"
              readOnly={!!flatField.valueMap || isLineFieldInputDisabled(flatField)}
              ariaLabel={resolveFieldLabel(flatField, language, flatField.id)}
              onChange={next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)}
            />
          ) : (
            <input
              type={flatField.type === 'DATE' ? 'date' : 'text'}
              value={fieldValue}
              onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
              readOnly={!!flatField.valueMap || isLineFieldInputDisabled(flatField)}
            />
          )}
          {renderErrors()}
        </div>
      </div>
    );
  };

  const logKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::render`;
  logOverlayOpenActionOnce(logKey, 'ui.overlayOpenAction.flatten.render', {
    scope: 'line',
    parentGroupId: q.id,
    fieldId: field.id,
    groupId: overlayOpenAction.groupId,
    targetKey,
    fieldCount: targetFields.length,
    flattenPlacement
  });

  const rendered = targetFields.map((flatField: any) => renderFlattenedField(flatField)).filter(Boolean);
  if (!rendered.length) return null;
  if (options?.asGridItems) return rendered;
  const gridClassName = `ck-pair-grid${rendered.length >= 3 ? ' ck-pair-grid--3' : ''}`;
  const grid = <PairedRowGrid className={gridClassName}>{rendered}</PairedRowGrid>;
  if (flattenPlacement === 'below') {
    return <div style={{ marginTop: 8 }}>{grid}</div>;
  }
  return grid;
};
