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
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  OptionSet,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../../types';
import {
  buildSubgroupKey,
  cascadeRemoveLineItemRows
} from '../../../app/lineItems';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import { DateInput } from '../../../components/form/DateInput';
import { InfoTooltip } from '../../../components/form/InfoTooltip';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { buttonStyles, RequiredStar, srOnly } from '../../../components/form/ui';
import {
  resolveFieldHelperText,
  toDateInputValue
} from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import { resolveFieldLabel } from '../../../utils/labels';
import { LineFileUploadQuestion } from '../../uploads/components/LineFileUploadQuestion';
import { optionSortFor } from '../domain/lineItemPresentation';
import { normalizeOverlayFlattenPlacementAction as normalizeOverlayFlattenPlacement } from '../domain/overlayFlattenedFields';
import {
  LineItemOverlayOpenInlineButton,
  LineItemOverlayOpenReplaceField,
  LineItemReadOnlyField
} from './LineItemFieldChrome';

export type LineItemBodyFieldRenderOptions = {
  showLabel?: boolean;
  forceStackedLabel?: boolean;
  inGrid?: boolean;
};

export type LineItemBodyFieldRendererDeps = {
  q: WebQuestionDefinition;
  row: { id: string; values: Record<string, FieldValue> };
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
  groupCtx: VisibilityContext;
  errors: FormErrors;
  submitting: boolean;
  isProgressive: boolean;
  rowCollapsed: boolean;
  rowLocked: boolean;
  collapsedLabelMap: Record<string, boolean>;
  subIds: string[];
  subIdToLabel: Record<string, string>;
  definition: WebFormDefinition;
  latestValuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  groupChoiceSearchDefault?: boolean;
  overlayActionCtx: any;
  ctx: any;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  ensureLineOptions: (groupId: string, field: any) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  resolveOverlayOpenActionForField: (field: any, row: any, context: any) => any;
  overlayOpenActionTargetsForField: (field: any) => string[];
  renderOverlayOpenFlattenedFieldsShared: (
    field: any,
    overlayOpenAction: any,
    placementOverride?: 'left' | 'right' | 'below',
    options?: { asGridItems?: boolean; forceStackedLabel?: boolean }
  ) => React.ReactNode;
  renderSubgroupOpenStack: (
    subIdsToRender: string[],
    opts?: { sourceFieldId?: string; variant?: 'stack' | 'inline' }
  ) => React.ReactNode;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  hasWarning: (fieldPath: string) => boolean;
  isLineFieldInputDisabled: (field: any) => boolean;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  isFileUploadOrderedEntryBlocked: (args: any) => boolean;
  openLineItemGroupOverlay?: (groupOrId: string | WebQuestionDefinition, options?: any) => void;
  openSubgroupOverlay: (subKey: string, options?: any) => void;
  openInfoOverlay: (title: string, text: string) => void;
  openFileOverlay: (args: any) => void;
  handleLineFieldChange: (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  handleLineFileInputChange: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => void;
  renderUploadFailure: (fieldPath: string) => React.ReactNode;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

type LineItemBodyFieldRendererArgs = LineItemBodyFieldRendererDeps & {
  field: any;
  opts?: LineItemBodyFieldRenderOptions;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

export const renderLineItemBodyField = ({
  field,
  opts,
  q,
  row,
  values,
  lineItems,
  optionState,
  language,
  groupCtx,
  errors,
  submitting,
  isProgressive,
  rowCollapsed,
  rowLocked,
  collapsedLabelMap,
  subIds,
  subIdToLabel,
  definition,
  latestValuesRef,
  fileInputsRef,
  uploadAnnouncements,
  groupChoiceSearchDefault,
  overlayActionCtx,
  ctx,
  setValues,
  setLineItems,
  setErrors,
  setSubgroupSelectors,
  ensureLineOptions,
  renderChoiceControl,
  resolveOverlayOpenActionForField,
  overlayOpenActionTargetsForField,
  renderOverlayOpenFlattenedFieldsShared,
  renderSubgroupOpenStack,
  renderWarnings,
  hasWarning,
  isLineFieldInputDisabled,
  isLineFieldInteractionBlocked,
  isFileUploadOrderedEntryBlocked,
  openLineItemGroupOverlay,
  openSubgroupOverlay,
  openInfoOverlay,
  openFileOverlay,
  handleLineFieldChange,
  handleLineFileInputChange,
  renderUploadFailure,
  onDiagnostic
}: LineItemBodyFieldRendererArgs): React.ReactNode => {
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
                      const currentVal = row.values[field.id];
                      const allowedWithCurrent =
                        currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                          ? [...allowedField, currentVal]
                          : allowedField;
                      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
                      const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                      if (hideField) return null;

                        const fieldPath = `${q.id}__${field.id}__${row.id}`;
                        const showLabelOverride = opts?.showLabel;
                        const forceStackedLabel = opts?.forceStackedLabel === true || (field as any)?.ui?.labelLayout === 'stacked';
                        const hideLabel =
                          showLabelOverride === false
                            ? true
                            : showLabelOverride === true
                              ? false
                              : Boolean((field as any)?.ui?.hideLabel) ||
                          (isProgressive && rowCollapsed && collapsedLabelMap[field.id] === false);
                        const inGrid = opts?.inGrid === true;
                        const labelStyle = hideLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
                        const renderAsLabel =
                          (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;
                        const overlayActionSuppressed = ctx.isOverlayOpenActionSuppressed?.(fieldPath) === true;
                        const overlayOpenAction = overlayActionSuppressed ? null : resolveOverlayOpenActionForField(field, row, overlayActionCtx);
                        const overlayOpenRenderMode = overlayOpenAction?.renderMode === 'inline' ? 'inline' : 'replace';
                        const overlayOpenDisabled = submitting || rowLocked;
                        const overlayActionTone =
                          (overlayOpenAction?.tone || 'primary').toString().trim().toLowerCase() === 'secondary'
                            ? 'secondary'
                            : 'primary';
                        const overlayActionButtonBaseStyle =
                          overlayActionTone === 'secondary' ? buttonStyles.secondary : buttonStyles.primary;
                        const overlayOpenButtonText = (displayValue?: string | null) => {
                          if (!overlayOpenAction) return '';
                          const baseLabel = overlayOpenAction.label || resolveFieldLabel(field, language, field.id);
                          const display = displayValue ? displayValue.toString().trim() : '';
                          return display ? `${display}: ${baseLabel}` : baseLabel;
                        };
                        const handleOverlayOpenAction = () => {
                          if (!overlayOpenAction || overlayOpenDisabled) return;
                          const hasOverride =
                            overlayOpenAction.targetKind === 'line' ? !!overlayOpenAction.overrideGroup : !!overlayOpenAction.groupOverride;
                          if (overlayOpenAction.targetKind === 'line') {
                            if (!openLineItemGroupOverlay) {
                              onDiagnostic?.('ui.overlayOpenAction.missingHandler', {
                                scope: 'line',
                                parentGroupId: q.id,
                                fieldId: field.id,
                                groupId: overlayOpenAction.groupId
                              });
                              return;
                            }
                            const groupOrId = overlayOpenAction.overrideGroup || overlayOpenAction.groupId;
                            openLineItemGroupOverlay(groupOrId as any, {
                              rowFilter: overlayOpenAction.rowFilter || null,
                              hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
                              hideCloseButton: overlayOpenAction.hideCloseButton,
                              closeButtonLabel: resolveLocalizedString(overlayOpenAction.closeButtonLabel as any, language, ''),
                              closeConfirm: overlayOpenAction.closeConfirm,
                              label: overlayOpenAction.label,
                              source: 'overlayOpenAction',
                              rowFlow: overlayOpenAction.rowFlow
                            });
                            onDiagnostic?.('lineItemGroup.overlay.open.action', {
                              parentGroupId: q.id,
                              rowId: row.id,
                              groupId: overlayOpenAction.groupId,
                              sourceFieldId: field.id,
                              hasRowFilter: !!overlayOpenAction.rowFilter,
                              hasOverride,
                              hideCloseButton: !!overlayOpenAction.hideCloseButton
                            });
                            return;
                          }
                          if (!overlayOpenAction.subKey) return;
                          openSubgroupOverlay(overlayOpenAction.subKey, {
                            rowFilter: overlayOpenAction.rowFilter || null,
                            groupOverride: overlayOpenAction.groupOverride,
                            hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
                            hideCloseButton: overlayOpenAction.hideCloseButton,
                            closeButtonLabel: resolveLocalizedString(overlayOpenAction.closeButtonLabel as any, language, ''),
                            closeConfirm: overlayOpenAction.closeConfirm,
                            label: overlayOpenAction.label,
                            source: 'overlayOpenAction',
                            rowFlow: overlayOpenAction.rowFlow
                          });
                          onDiagnostic?.('subgroup.overlay.open.action', {
                            groupId: q.id,
                            rowId: row.id,
                            subId: overlayOpenAction.groupId,
                            sourceFieldId: field.id,
                            hasRowFilter: !!overlayOpenAction.rowFilter,
                            hasOverride,
                            hideCloseButton: !!overlayOpenAction.hideCloseButton
                          });
                        };
                        const matchesOverlayRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
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
                        const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.subKey || '';
                        const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
                        const overlayOpenActionRowsFiltered =
                          overlayOpenAction && overlayOpenAction.rowFilter
                            ? overlayOpenActionRowsAll.filter(r =>
                                matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter)
                              )
                            : overlayOpenActionRowsAll;
                        const overlayOpenActionResetDisabled = overlayOpenDisabled || overlayOpenActionRowsFiltered.length === 0;
                        const handleOverlayOpenActionReset = (event?: React.MouseEvent | React.KeyboardEvent) => {
                          if (event) {
                            event.preventDefault();
                            event.stopPropagation();
                          }
                          if (!overlayOpenAction || overlayOpenActionResetDisabled) return;
                          if (!overlayOpenActionTargetKey) return;
                          const hasResetValue =
                            !!overlayOpenAction?.action &&
                            Object.prototype.hasOwnProperty.call(overlayOpenAction.action as any, 'resetValue');
                          const resetValue = hasResetValue ? (overlayOpenAction?.action as any)?.resetValue : undefined;
                          const runReset = () => {
                            const groupKey = overlayOpenActionTargetKey;
                            const prevLineItems = lineItems;
                            const rowsAll = prevLineItems[groupKey] || [];
                            const rowsToRemove =
                              overlayOpenAction && overlayOpenAction.rowFilter
                                ? rowsAll.filter(r =>
                                    matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter)
                                  )
                                : rowsAll;
                            if (!rowsToRemove.length) return;
                            const cascade = cascadeRemoveLineItemRows({
                              lineItems: prevLineItems,
                              roots: rowsToRemove.map(r => ({ groupId: groupKey, rowId: r.id }))
                            });
                            let nextLineItems = cascade.lineItems;
                            if (hasResetValue) {
                              const groupRows = nextLineItems[q.id] || [];
                              if (groupRows.length) {
                                nextLineItems = {
                                  ...nextLineItems,
                                  [q.id]: groupRows.map(r =>
                                    r.id === row.id ? { ...r, values: { ...r.values, [field.id]: resetValue } } : r
                                  )
                                };
                              }
                            }
                            if (cascade.removedSubgroupKeys.length) {
                              setSubgroupSelectors(prevSel => {
                                const nextSel = { ...prevSel };
                                cascade.removedSubgroupKeys.forEach(key => {
                                  delete (nextSel as any)[key];
                                });
                                return nextSel;
                              });
                            }
                            onDiagnostic?.('ui.lineItems.remove.cascade', {
                              groupId: groupKey,
                              removedCount: cascade.removed.length,
                              source: 'overlayOpenAction'
                            });
                            const latestValues = latestValuesRef.current || {};
                            const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(
                              definition,
                              latestValues,
                              nextLineItems,
                              {
                                mode: 'init'
                              }
                            );
                            latestValuesRef.current = nextValues;
                            setValues(nextValues);
                            setLineItems(recomputed);
                            ctx.runSelectionEffectsForAncestors?.(groupKey, prevLineItems, recomputed, {
                              mode: 'init',
                              topValues: nextValues
                            });
                            if (!hasResetValue) {
                              ctx.suppressOverlayOpenAction?.(fieldPath);
                            }
                          };
                          const title = tSystem('lineItems.removeRowsTitle', language, 'Remove rows?');
                          const message = tSystem('lineItems.removeRowsMessage', language, 'This will remove the matching rows.');
                          const confirmLabel = tSystem('lineItems.remove', language, 'Remove');
                          const cancelLabel = tSystem('common.cancel', language, 'Cancel');
                          if (!ctx.openConfirmDialog) {
                            onDiagnostic?.('ui.overlayOpenAction.confirm.missing', { fieldId: field.id, rowId: row.id });
                            return;
                          }
                          ctx.openConfirmDialog({
                            title,
                            message,
                            confirmLabel,
                            cancelLabel,
                            kind: 'overlayOpenAction',
                            refId: fieldPath,
                            onConfirm: runReset
                          });
                        };
                        const renderOverlayOpenReplaceLine = (displayValue?: string | null) => (
                          <LineItemOverlayOpenReplaceField
                            key={field.id}
                            field={field}
                            fieldPath={fieldPath}
                            language={language}
                            forceStackedLabel={forceStackedLabel}
                            labelStyle={labelStyle}
                            error={errors[fieldPath]}
                            hasWarning={hasWarning(fieldPath)}
                            renderWarnings={() => renderWarnings(fieldPath)}
                            buttonLabel={overlayOpenButtonText(displayValue)}
                            onOpen={handleOverlayOpenAction}
                            openDisabled={overlayOpenDisabled}
                            showResetButton={overlayOpenAction?.hideTrashIcon !== true}
                            onReset={handleOverlayOpenActionReset}
                            resetDisabled={overlayOpenActionResetDisabled}
                            baseStyle={overlayActionButtonBaseStyle}
                            flattenPlacement={normalizeOverlayFlattenPlacement(overlayOpenAction?.flattenPlacement)}
                            renderFlattenedFields={(placement, options) =>
                              renderOverlayOpenFlattenedFieldsShared(field, overlayOpenAction, placement, options)
                            }
                          />
                        );
  	                      const renderOverlayOpenInlineButton = (displayValue?: string | null) => {
  	                        if (!overlayOpenAction || overlayOpenRenderMode !== 'inline') return null;
  	                        return (
                            <LineItemOverlayOpenInlineButton
                              buttonLabel={overlayOpenButtonText(displayValue)}
                              onOpen={handleOverlayOpenAction}
                              disabled={overlayOpenDisabled}
                              baseStyle={overlayActionButtonBaseStyle}
                            />
                          );
  	                      };

                        const overlayOpenTargets = overlayOpenActionTargetsForField(field);
                        const triggeredSubgroupIds = (() => {
                          if (rowCollapsed) return [] as string[];
                          if (!subIds.length) return [] as string[];
                          const effects = Array.isArray((field as any).selectionEffects)
                            ? ((field as any).selectionEffects as any[])
                            : [];
                          const hits = effects
                            .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                            .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                          const sourceVal = row.values[field.id];
                          const hasSourceValue = !isEmptyValue(sourceVal as any);
                          const filtered = hits.filter(subId => {
                            const subKey = buildSubgroupKey(q.id, row.id, subId);
                            const subRows = lineItems[subKey] || [];
                            return (Array.isArray(subRows) && subRows.length > 0) || hasSourceValue;
                          });
                          const deduped = Array.from(new Set(filtered));
                          return overlayOpenTargets.length ? deduped.filter(id => !overlayOpenTargets.includes(id)) : deduped;
                        })();
                        const fieldIsStacked = forceStackedLabel && labelStyle !== srOnly;
                        const subgroupOpenStack = triggeredSubgroupIds.length && !fieldIsStacked
                          ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: field.id, variant: 'stack' })
                          : null;
                        const subgroupOpenInline = triggeredSubgroupIds.length && fieldIsStacked
                          ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: field.id, variant: 'inline' })
                          : null;

                        const renderReadOnlyLine = (display: React.ReactNode) => (
                          <LineItemReadOnlyField
                            key={field.id}
                            field={field}
                            fieldPath={fieldPath}
                            language={language}
                            forceStackedLabel={forceStackedLabel}
                            fieldIsStacked={fieldIsStacked}
                            labelStyle={labelStyle}
                            error={errors[fieldPath]}
                            hasWarning={hasWarning(fieldPath)}
                            renderWarnings={() => renderWarnings(fieldPath)}
                            display={display}
                            subgroupOpenInline={subgroupOpenInline}
                            subgroupOpenStack={subgroupOpenStack}
                            stackedInlinePlacement="labelRow"
                          />
                        );

                      switch (field.type) {
                        case 'CHOICE': {
                          const rawVal = row.values[field.id];
                          const choiceVal =
                            Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                          const selected = optsField.find(opt => opt.value === choiceVal);
                          const display = selected?.label || choiceVal || null;
                          if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
                            return renderOverlayOpenReplaceLine(display);
                          }
                          if (renderAsLabel) {
                            return renderReadOnlyLine(display);
                          }
                          return (
                              <div
                                key={field.id}
                                className={`field inline-field${fieldIsStacked ? ' ck-label-stacked' : ''}`}
                                data-field-path={fieldPath}
                                data-has-error={errors[fieldPath] ? 'true' : undefined}
                                data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                              >
                                {fieldIsStacked ? (
                                  <div className="ck-label-row">
                                    <label style={labelStyle}>
                                      {resolveFieldLabel(field, language, field.id)}
                                      {field.required && <RequiredStar />}
                                    </label>
                                    {subgroupOpenInline}
                                  </div>
                                ) : (
                                  <label style={labelStyle}>
                                    {resolveFieldLabel(field, language, field.id)}
                                    {field.required && <RequiredStar />}
                                  </label>
                                )}
                                <div className="ck-control-row">
                                  {renderChoiceControl({
                                    fieldPath,
                                    value: choiceVal || '',
                                    options: optsField,
                                    required: !!field.required,
                                    searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
                                    override: (field as any)?.ui?.control,
                                    disabled: isLineFieldInputDisabled(field),
                                    onChange: (next: FieldValue) => handleLineFieldChange(q, row.id, field, next)
                                  })}
                                  {renderOverlayOpenInlineButton(display)}
                                  {(() => {
                                    const tooltipNode = selected?.tooltip ? (
                                      <InfoTooltip
                                        text={selected.tooltip}
                                        label={resolveLocalizedString(
                                          field.dataSource?.tooltipLabel,
                                          language,
                                          resolveFieldLabel(field, language, field.id)
                                        )}
                                        onOpen={openInfoOverlay}
                                      />
                                    ) : null;
                                    if (!tooltipNode) return null;
                                    return <div className="ck-field-actions">{tooltipNode}</div>;
                                  })()}
                                </div>
                                {subgroupOpenStack}
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
                          const selected = Array.isArray(row.values[field.id]) ? (row.values[field.id] as string[]) : [];
                          const allowedWithSelected = selected.reduce((acc, val) => {
                            if (val && !acc.includes(val)) acc.push(val);
                            return acc;
                          }, [...allowedField]);
                          const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                          const display = (() => {
                            if (isConsentCheckbox) {
                              return row.values[field.id]
                                ? tSystem('common.yes', language, 'Yes')
                                : tSystem('common.no', language, 'No');
                            }
                            const labels = selected
                              .map(val => optsField.find(opt => opt.value === val)?.label || val)
                              .filter(Boolean);
                            return labels.length ? labels.join(', ') : null;
                          })();
                          if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
                            return renderOverlayOpenReplaceLine(display);
                          }
                          if (renderAsLabel) {
                            return renderReadOnlyLine(display);
                          }
                          if (isConsentCheckbox) {
                            return (
                              <div
                                key={field.id}
                                className={`field inline-field ck-consent-field${fieldIsStacked ? ' ck-label-stacked' : ''}`}
                                data-field-path={fieldPath}
                                data-has-error={errors[fieldPath] ? 'true' : undefined}
                                data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                              >
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={!!row.values[field.id]}
                                    disabled={isLineFieldInputDisabled(field)}
                                    onChange={e => {
                                      if (isLineFieldInputDisabled(field)) return;
                                      handleLineFieldChange(q, row.id, field, e.target.checked);
                                    }}
                                  />
                                  <span className="ck-consent-text" style={labelStyle}>
                                    {resolveFieldLabel(field, language, field.id)}
                                    {field.required && <RequiredStar />}
                                  </span>
                                </label>
                                {renderOverlayOpenInlineButton(display)}
                                {subgroupOpenStack}
                                {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                {renderWarnings(fieldPath)}
                              </div>
                            );
                          }
                          const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                          const renderAsMultiSelect = controlOverride === 'select';
                          return (
                              <div
                                key={field.id}
                                className={`field inline-field${fieldIsStacked ? ' ck-label-stacked' : ''}`}
                                data-field-path={fieldPath}
                                data-has-error={errors[fieldPath] ? 'true' : undefined}
                                data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                              >
                                <label style={labelStyle}>
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                              </label>
                              {renderAsMultiSelect ? (
                                <select
                                  multiple
                                  value={selected}
                                  disabled={isLineFieldInputDisabled(field)}
                                  aria-label={resolveFieldLabel(field, language, field.id)}
                                  onChange={e => {
                                    if (isLineFieldInputDisabled(field)) return;
                                    const next = Array.from(e.currentTarget.selectedOptions)
                                      .map(opt => opt.value)
                                      .filter(Boolean);
                                    onDiagnostic?.('ui.checkbox.select.change', { scope: 'line', fieldPath, selectedCount: next.length });
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
                                        disabled={isLineFieldInputDisabled(field)}
                                        onChange={e => {
                                          if (isLineFieldInputDisabled(field)) return;
                                          const next = e.target.checked
                                            ? [...selected, opt.value]
                                            : selected.filter(v => v !== opt.value);
                                          handleLineFieldChange(q, row.id, field, next);
                                        }}
                                      />
                                      <span>{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                                {subgroupOpenStack}
                              {(() => {
                                const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                                if (!withTooltips.length) return null;
                                const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                                return (
                                  <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {withTooltips.map(opt => (
                                      <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          {opt.label} <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
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
                                group={q}
                                rowId={row.id}
                                field={field}
                                fieldPath={fieldPath}
                                value={row.values[field.id] as FieldValue | undefined}
                                language={language}
                                submitting={submitting}
                                forceStackedLabel={(field as any)?.ui?.labelLayout === 'stacked'}
                                renderAsLabel={renderAsLabel}
                                renderReadOnly={renderReadOnlyLine}
                                labelStyle={labelStyle}
                                cameraButtonStyle={buttonStyles.primary}
                                progressButtonClassName="ck-list-row-action-btn"
                                afterProgressNode={subgroupOpenStack}
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
                                fid => {
                                  if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                  return values[fid];
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
                          const displayValue =
                            field.type === 'NUMBER'
                              ? numberText
                              : field.type === 'DATE'
                                ? fieldValue
                                : fieldValue;
                          const displayText = displayValue === undefined || displayValue === null ? '' : displayValue.toString();
                          const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                          const helperText = helperCfg.text;
                          const supportsPlaceholder = field.type === 'TEXT' || field.type === 'PARAGRAPH' || field.type === 'NUMBER';
                          const effectivePlacement =
                            helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
                          const isEditableField =
                            !isLineFieldInteractionBlocked(field) && (field as any)?.readOnly !== true &&
                            (field as any)?.ui?.renderAsLabel !== true &&
                            (field as any)?.renderAsLabel !== true &&
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
                          const placeholder =
                            helperText && effectivePlacement === 'placeholder' && isEditableField ? helperText : undefined;
                          if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
                            return renderOverlayOpenReplaceLine(displayText || null);
                          }
                          if (renderAsLabel) {
                            return renderReadOnlyLine(displayText || null);
                          }
                          return (
                              <div
                                key={field.id}
                                className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                  (field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''
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
                                          const numericOnlyMessage = tSystem(
                                            'validation.numberOnly',
                                            language,
                                            'Only numbers are allowed in this field.'
                                          );
                                          setErrors(prev => {
                                            const next = { ...prev };
                                            const existing = next[fieldPath];
                                            if (existing && existing !== numericOnlyMessage) return prev;
                                            if (existing === numericOnlyMessage) return prev;
                                            next[fieldPath] = numericOnlyMessage;
                                            return next;
                                          });
                                          onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                                        }
                                      : undefined
                                  }
                                  onChange={next => handleLineFieldChange(q, row.id, field, next)}
                                />
                              ) : field.type === 'PARAGRAPH' ? (
                                <textarea
                                  className="ck-paragraph-input"
                                  value={fieldValue}
                                  onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                  readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                                  rows={(field as any)?.ui?.paragraphRows || 4}
                                  placeholder={placeholder}
                                  aria-describedby={helperId}
                                />
                              ) : field.type === 'DATE' ? (
                                <DateInput
                                  value={fieldValue}
                                  language={language}
                                  min={(field as any)?.ui?.minDate}
                                  max={(field as any)?.ui?.maxDate}
                                  correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                                  iosNativeCommitMode="deferWhileFocused"
                                  readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                                  ariaLabel={resolveFieldLabel(field, language, field.id)}
                                  ariaDescribedBy={helperId}
                                  onChange={next => handleLineFieldChange(q, row.id, field, next)}
                                />
                              ) : (
                                <input
                                  type={field.type === 'DATE' ? 'date' : 'text'}
                                  value={fieldValue}
                                  onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                  readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                                  placeholder={placeholder}
                                  aria-describedby={helperId}
                                />
                              )}
                              {helperNode}
                                {renderOverlayOpenInlineButton(displayText || null)}
                                {subgroupOpenStack}
                                {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                {renderWarnings(fieldPath)}
                            </div>
                          );
                        }
                      }
};
