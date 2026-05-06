import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  shouldHideField,
  toDependencyValue,
  toOptionSet
} from '../../../core';
import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, OptionSet, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import type { FormErrors, LineItemState, OptionState } from '../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { DateInput } from './DateInput';
import { InfoTooltip } from './InfoTooltip';
import { LineItemGroupQuestion } from './LineItemGroupQuestion';
import { NumberStepper } from './NumberStepper';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import {
  TopOverlayOpenInlineButton,
  TopOverlayOpenReplaceButton,
  TopReadOnlyField
} from './TopFieldChrome';
import {
  buttonStyles,
  RequiredStar,
  srOnly,
  withDisabled
} from './ui';
import {
  buildParagraphDisclaimerSection,
  buildParagraphDisclaimerValue,
  resolveParagraphUserText
} from '../../app/paragraphDisclaimer';
import { resolveButtonTonePrimary } from '../../app/buttonTone';
import { cascadeRemoveLineItemRows } from '../../app/lineItems';
import { applyValueMapsToForm, resolveValueMapValue } from './valueMaps';
import { resolveFieldHelperText, toDateInputValue } from './utils';
import { LineItemGroupOverlayPill } from '../../features/lineItems/components/LineItemGroupOverlayPill';
import { TopFileUploadQuestion } from '../../features/uploads/components/TopFileUploadQuestion';

export type TopQuestionRendererDeps = {
  renderOptions: (q: WebQuestionDefinition) => OptionSet;
  values: Record<string, FieldValue>;
  language: LangCode;
  optionSortFor: (field: { optionSort?: any } | undefined) => 'alphabetical' | 'source';
  topVisibilityCtx: VisibilityContext;
  errors: FormErrors;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  resolveOverlayOpenActionForQuestion: (q: WebQuestionDefinition) => any;
  submitting: boolean;
  isFieldLockedByDedup: (fieldPath: string) => boolean;
  lineItems: LineItemState;
  matchesOverlayRowFilter: (rowValues: Record<string, FieldValue>, filter?: any) => boolean;
  openSubgroupOverlay: (subKey: string, options?: any) => void;
  openLineItemGroupOverlay: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  definition: WebFormDefinition;
  clearSelectionEffectsForRow: (groupQuestion: WebQuestionDefinition, row: any) => void;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  runSelectionEffectsForAncestorRows: (
    groupKey: string,
    previousLineItems: LineItemState,
    nextLineItems: LineItemState,
    options?: { mode?: 'init' | 'change'; topValues?: Record<string, FieldValue> }
  ) => void;
  suppressOverlayOpenAction: (key: string) => void;
  openConfirmDialogResolved: (args: any) => void;
  reportBusy?: boolean;
  reportBusyId?: string | null;
  onReportButton?: (buttonId: string) => void;
  onReportButtonPointerDown?: (buttonId: string) => void;
  isDedupKeyField: (fieldId: string) => boolean;
  optionState: OptionState;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  handleFieldChange: (q: WebQuestionDefinition, value: FieldValue) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  openInfoOverlay: (title: string, text: string) => void;
  checkFileUploadOrderedEntry: (args: any) => boolean;
  openFileOverlay: (args: any) => void;
  handleFileInputChange: (question: WebQuestionDefinition, list: FileList | null) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  renderUploadFailure: (fieldPath: string, disabled?: boolean) => React.ReactNode;
  collapsedRows: Record<string, boolean>;
  getTopValueNoScan: (fieldId: string) => FieldValue | undefined;
  buildLineItemGroupQuestionContext: (overrides?: Record<string, any>) => any;
  overlayOpenActionTargetGroups: Set<string>;
};

/**
 * Owner: top-level question rendering.
 * Keeps field-type rendering branches outside FormView while FormView retains
 * state ownership and mutation callbacks.
 */
export const buildTopQuestionRenderer = (deps: TopQuestionRendererDeps) => {
  const {
    renderOptions,
    values,
    language,
    optionSortFor,
    topVisibilityCtx,
    errors,
    hasWarning,
    renderWarnings,
    resolveOverlayOpenActionForQuestion,
    submitting,
    isFieldLockedByDedup,
    lineItems,
    matchesOverlayRowFilter,
    openSubgroupOverlay,
    openLineItemGroupOverlay,
    onDiagnostic,
    definition,
    clearSelectionEffectsForRow,
    setSubgroupSelectors,
    setValues,
    setLineItems,
    runSelectionEffectsForAncestorRows,
    suppressOverlayOpenAction,
    openConfirmDialogResolved,
    reportBusy,
    reportBusyId,
    onReportButton,
    onReportButtonPointerDown,
    isDedupKeyField,
    optionState,
    setErrors,
    handleFieldChange,
    renderChoiceControl,
    openInfoOverlay,
    checkFileUploadOrderedEntry,
    openFileOverlay,
    handleFileInputChange,
    fileInputsRef,
    uploadAnnouncements,
    renderUploadFailure,
    collapsedRows,
    getTopValueNoScan,
    buildLineItemGroupQuestionContext,
    overlayOpenActionTargetGroups
  } = deps;

  return (q: WebQuestionDefinition, renderOpts?: { inGrid?: boolean }) => {
    const optionSet = renderOptions(q);
    const dependencyValues = (dependsOn: string | string[]) => {
      const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
      return ids.map(id => toDependencyValue(values[id]));
    };
    const allowed = computeAllowedOptions(q.optionFilter, optionSet, dependencyValues(q.optionFilter?.dependsOn || []));
    const currentVal = values[q.id];
    const allowedWithCurrent =
      currentVal && typeof currentVal === 'string' && !allowed.includes(currentVal) ? [...allowed, currentVal] : allowed;
    const opts = buildLocalizedOptions(optionSet, allowedWithCurrent, language, { sort: optionSortFor(q) });
    const hidden = shouldHideField(q.visibility, topVisibilityCtx);
    if (hidden) return null;
    const hideFieldLabel = q.ui?.hideLabel === true;
    const inGrid = renderOpts?.inGrid === true;
    const labelLayoutRaw = (((q.ui as any)?.labelLayout || '') as string).toString().trim().toLowerCase();
    const forceStackedLabel = labelLayoutRaw === 'stacked';
    const forceInlineLabel = labelLayoutRaw === 'inline';
    const labelLayoutClass = forceStackedLabel ? ' ck-label-stacked' : forceInlineLabel ? ' ck-label-inline' : '';
    // In paired grids, keep the label in layout so control rows align even when a label is hidden/missing.
    const labelStyle = hideFieldLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
    const renderAsLabel = q.ui?.renderAsLabel === true || q.readOnly === true;
    const renderReadOnly = (display: React.ReactNode, opts?: { stacked?: boolean; inline?: boolean }) => (
      <TopReadOnlyField
        q={q}
        language={language}
        labelStyle={labelStyle}
        errors={errors}
        hasWarning={hasWarning}
        renderWarnings={renderWarnings}
        display={display}
        stacked={opts?.stacked}
        inline={opts?.inline}
      />
    );

    const overlayOpenAction = resolveOverlayOpenActionForQuestion(q);
    const overlayOpenRenderMode = overlayOpenAction?.renderMode === 'inline' ? 'inline' : 'replace';
    const overlayOpenDisabled = submitting || isFieldLockedByDedup(q.id);
    const overlayOpenButtonText = (displayValue?: string | null) => {
      if (!overlayOpenAction) return '';
      const baseLabel = overlayOpenAction.label || resolveLabel(q, language);
      const display = displayValue ? displayValue.toString().trim() : '';
      return display ? `${display}: ${baseLabel}` : baseLabel;
    };
    const handleOverlayOpenAction = () => {
      if (!overlayOpenAction || overlayOpenDisabled) return;
      if (overlayOpenAction.targetKind === 'sub' && overlayOpenAction.targetKey) {
        openSubgroupOverlay(overlayOpenAction.targetKey, {
          rowFilter: overlayOpenAction.rowFilter || null,
          groupOverride: overlayOpenAction.groupOverride,
          hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
          label: overlayOpenAction.label,
          source: 'overlayOpenAction'
        });
      } else {
        const groupOrId = overlayOpenAction.overrideGroup || overlayOpenAction.groupId;
        openLineItemGroupOverlay(groupOrId as any, {
          rowFilter: overlayOpenAction.rowFilter || null,
          hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
          label: overlayOpenAction.label,
          source: 'overlayOpenAction'
        });
      }
      onDiagnostic?.('ui.overlayOpenAction.open', {
        questionId: q.id,
        groupId: overlayOpenAction.groupId,
        targetKind: overlayOpenAction.targetKind,
        hasRowFilter: !!overlayOpenAction.rowFilter,
        hasOverride: !!overlayOpenAction.overrideGroup
      });
    };
    const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.groupId || '';
    const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
    const overlayOpenActionRowsFiltered =
      overlayOpenAction && overlayOpenAction.rowFilter
        ? overlayOpenActionRowsAll.filter(row =>
            matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayOpenAction.rowFilter)
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
        const groupQuestion = definition.questions.find(qDef => qDef.id === groupKey);
        const prevLineItems = lineItems;
        const rowsAll = prevLineItems[groupKey] || [];
        const rowsToRemove =
          overlayOpenAction && overlayOpenAction.rowFilter
            ? rowsAll.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayOpenAction.rowFilter))
            : rowsAll;
        if (!rowsToRemove.length) return;
        if (groupQuestion) {
          rowsToRemove.forEach(row => clearSelectionEffectsForRow(groupQuestion, row as any));
        }
        const cascade = cascadeRemoveLineItemRows({
          lineItems: prevLineItems,
          roots: rowsToRemove.map(row => ({ groupId: groupKey, rowId: row.id }))
        });
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
        const baseValues = hasResetValue ? { ...values, [q.id]: resetValue } : values;
        const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, baseValues, cascade.lineItems, {
          mode: 'init'
        });
        setValues(nextValues);
        setLineItems(recomputed);
        runSelectionEffectsForAncestorRows(groupKey, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
        if (!hasResetValue) {
          suppressOverlayOpenAction(q.id);
        }
      };
      const title = tSystem('lineItems.removeRowsTitle', language, 'Remove rows?');
      const message = tSystem('lineItems.removeRowsMessage', language, 'This will remove the matching rows.');
      const confirmLabel = tSystem('lineItems.remove', language, 'Remove');
      const cancelLabel = tSystem('common.cancel', language, 'Cancel');
      openConfirmDialogResolved({
        title,
        message,
        confirmLabel,
        cancelLabel,
        kind: 'overlayOpenAction',
        refId: q.id,
        onConfirm: runReset
      });
	    };
    const renderOverlayOpenReplaceButton = (displayValue?: string | null) => (
      <TopOverlayOpenReplaceButton
        q={q}
        language={language}
        labelStyle={labelStyle}
        errors={errors}
        hasWarning={hasWarning}
        renderWarnings={renderWarnings}
        labelLayoutClass={labelLayoutClass}
        showResetButton={overlayOpenAction?.hideTrashIcon !== true}
        tone={overlayOpenAction?.tone === 'secondary' ? 'secondary' : 'primary'}
        displayValue={displayValue}
        disabled={overlayOpenDisabled}
        resetDisabled={overlayOpenActionResetDisabled}
        buttonText={overlayOpenButtonText}
        onOpen={handleOverlayOpenAction}
        onReset={handleOverlayOpenActionReset}
      />
    );
    const renderOverlayOpenInlineButton = (displayValue?: string | null) => {
      if (!overlayOpenAction || overlayOpenRenderMode !== 'inline') return null;
      return (
        <TopOverlayOpenInlineButton
          tone={overlayOpenAction.tone === 'secondary' ? 'secondary' : 'primary'}
          displayValue={displayValue}
          disabled={overlayOpenDisabled}
          buttonText={overlayOpenButtonText}
          onOpen={handleOverlayOpenAction}
        />
      );
    };

    switch (q.type) {
      case 'BUTTON': {
        const action = ((q as any)?.button?.action || '').toString().trim();
        const placementsRaw = (q as any)?.button?.placements;
        const placements = Array.isArray(placementsRaw) && placementsRaw.length ? placementsRaw : ['form'];
        const showInForm = placements.includes('form');
        // Inline BUTTON fields are currently only used for report rendering.
        if (
          !showInForm ||
          (action !== 'renderDocTemplate' &&
            action !== 'renderMarkdownTemplate' &&
            action !== 'renderHtmlTemplate' &&
            action !== 'updateRecord' &&
            action !== 'openUrlField')
        )
          return null;
        if (action === 'openUrlField' && !(q as any)?.button?.fieldId) return null;

        const label = resolveLabel(q, language);
        const primary = resolveButtonTonePrimary(label, (q as any)?.button?.tone);
        const busyThis = !!reportBusy && reportBusyId === q.id;
        const disabled = submitting || isFieldLockedByDedup(q.id) || !onReportButton || !!reportBusy;
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const helperNode = helperText ? <div className="ck-field-helper">{helperText}</div> : null;
        const buttonLabelStyle = inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly;
        return (
          <div
            key={q.id}
            className={`field inline-field${inGrid ? '' : ' ck-full-width'}`}
            data-field-path={q.id}
          >
            <label style={buttonLabelStyle}>{label}</label>
            <button
              type="button"
              onPointerDown={() => onReportButtonPointerDown?.(q.id)}
              onClick={() => onReportButton?.(q.id)}
              disabled={disabled}
              style={withDisabled(primary ? buttonStyles.primary : buttonStyles.secondary, disabled)}
            >
              {busyThis ? tSystem('common.loading', language, 'Loading…') : label}
            </button>
            {helperNode}
          </div>
        );
      }
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE': {
        const useValueMap = !!q.valueMap && !isDedupKeyField(q.id);
        const mappedValue =
          useValueMap && q.valueMap
            ? resolveValueMapValue(q.valueMap, fieldId => values[fieldId], { language, targetOptions: toOptionSet(q) })
            : undefined;
        const inputValueRaw = useValueMap ? (mappedValue || '') : ((values[q.id] as any) ?? '');
        const paragraphDisclaimerCfg = q.type === 'PARAGRAPH' ? (q.ui as any)?.paragraphDisclaimer : undefined;
        const paragraphEditable = !!paragraphDisclaimerCfg?.editable;
        const paragraphDisclaimer = paragraphDisclaimerCfg
          ? buildParagraphDisclaimerSection({
              config: paragraphDisclaimerCfg,
              definition,
              lineItems,
              optionState,
              language
            })
          : null;
        const paragraphUserText = paragraphDisclaimer
          ? resolveParagraphUserText({ rawValue: inputValueRaw, config: paragraphDisclaimerCfg })
          : inputValueRaw;
        const paragraphCombined = paragraphDisclaimer
          ? paragraphEditable
            ? (inputValueRaw as any)
            : buildParagraphDisclaimerValue({
                userText: paragraphUserText?.toString?.() || '',
                sectionText: paragraphDisclaimer.sectionText,
                separator: paragraphDisclaimer.separator
              })
          : (paragraphUserText as any);
        const inputValue =
          q.type === 'DATE'
            ? toDateInputValue(inputValueRaw)
            : q.type === 'PARAGRAPH'
              ? (paragraphEditable ? inputValueRaw : paragraphUserText)
              : inputValueRaw;
        const numberText =
          q.type === 'NUMBER' ? (inputValue === undefined || inputValue === null ? '' : (inputValue as any).toString()) : null;
        const displayValue =
          q.type === 'NUMBER'
            ? numberText
            : q.type === 'PARAGRAPH'
              ? paragraphCombined
              : inputValue;
        const displayText =
          displayValue === undefined || displayValue === null ? '' : displayValue.toString();
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperTextBelowLabel = helperCfg.belowLabelText;
        const helperTextPlaceholder = helperCfg.placeholderText;
        const supportsPlaceholder = q.type === 'TEXT' || q.type === 'PARAGRAPH' || q.type === 'NUMBER';
        const isEditableField =
          !renderAsLabel && !useValueMap && !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const helperId = helperTextBelowLabel && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode =
          helperTextBelowLabel && isEditableField ? (
            <div id={helperId} className="ck-field-helper">
              {helperTextBelowLabel}
            </div>
          ) : null;
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(displayText || null);
        }
        if (renderAsLabel) {
          return renderReadOnly(displayValue || null, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        if (q.type === 'NUMBER') {
          const placeholder = supportsPlaceholder && helperTextPlaceholder && isEditableField ? helperTextPlaceholder : undefined;
          const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
          return (
            <div
              key={q.id}
              className={`field inline-field${labelLayoutClass}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label style={labelStyle}>
                {resolveFieldLabel(q, language, q.id)}
                {(q as any).required && <RequiredStar />}
              </label>
              <NumberStepper
                value={numberText}
                disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                readOnly={useValueMap || q.readOnly === true}
                ariaLabel={resolveFieldLabel(q, language, q.id)}
                ariaDescribedBy={helperId}
                placeholder={placeholder}
                onInvalidInput={
                  isEditableField
                    ? ({ reason, value }) => {
                  setErrors(prev => {
                    const next = { ...prev };
                    const existing = next[q.id];
                    if (existing && existing !== numericOnlyMessage) return prev;
                    if (existing === numericOnlyMessage) return prev;
                    next[q.id] = numericOnlyMessage;
                    return next;
                  });
                  onDiagnostic?.('field.number.invalidInput', { scope: 'top', fieldId: q.id, reason, value });
                }
                    : undefined
                }
                onChange={next => handleFieldChange(q, next)}
              />
              {helperNode}
              {renderOverlayOpenInlineButton(displayText || null)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        const placeholder = supportsPlaceholder && helperTextPlaceholder && isEditableField ? helperTextPlaceholder : undefined;
        return (
          <div
            key={q.id}
            className={`${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
              labelLayoutClass
            }${q.type === 'DATE' && !forceStackedLabel ? ' ck-date-inline' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {q.type === 'PARAGRAPH' ? (
              paragraphDisclaimer?.sectionText && !paragraphEditable ? (
                <div className="ck-paragraph-shell">
                  <textarea
                    className="ck-paragraph-input"
                    value={inputValue}
                    onChange={e => {
                      const nextUserText = e.target.value;
                      const nextCombined = buildParagraphDisclaimerValue({
                        userText: nextUserText,
                        sectionText: paragraphDisclaimer.sectionText,
                        separator: paragraphDisclaimer.separator
                      });
                      handleFieldChange(q, nextCombined);
                    }}
                    readOnly={useValueMap || q.readOnly === true}
                    disabled={submitting || isFieldLockedByDedup(q.id)}
                    rows={((q as any)?.ui as any)?.paragraphRows || 4}
                    placeholder={placeholder}
                    aria-describedby={helperId}
                  />
                  <div className="ck-paragraph-disclaimer">{`${paragraphDisclaimer.separator}\n${paragraphDisclaimer.sectionText}`}</div>
                </div>
              ) : (
                <textarea
                  className="ck-paragraph-input"
                  value={inputValue}
                  onChange={e => {
                    const nextUserText = e.target.value;
                    handleFieldChange(q, nextUserText);
                  }}
                  readOnly={useValueMap || q.readOnly === true}
                  disabled={submitting || isFieldLockedByDedup(q.id)}
                  rows={((q as any)?.ui as any)?.paragraphRows || 4}
                  placeholder={placeholder}
                  aria-describedby={helperId}
                />
              )
            ) : q.type === 'DATE' ? (
              <DateInput
                value={inputValue}
                language={language}
                min={(q as any)?.ui?.minDate}
                max={(q as any)?.ui?.maxDate}
                correctionMessages={(q as any)?.ui?.dateCorrectionMessages}
                iosNativeCommitMode="deferWhileFocused"
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                ariaLabel={resolveLabel(q, language)}
                ariaDescribedBy={helperId}
                onChange={next => handleFieldChange(q, next)}
              />
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                placeholder={placeholder}
                aria-describedby={helperId}
              />
            )}
            {helperNode}
            {renderOverlayOpenInlineButton(displayText || null)}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'CHOICE': {
        const rawVal = values[q.id];
        const choiceValue = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        const selected = opts.find(opt => opt.value === choiceValue);
        const display = selected?.label || choiceValue || null;
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const isEditableField = !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const placeholder = helperCfg.placeholderText && isEditableField ? helperCfg.placeholderText : undefined;
        const helperId = helperText && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode = helperText && isEditableField ? (
          <div id={helperId} className="ck-field-helper">
            {helperText}
          </div>
        ) : null;
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(display);
        }
        if (renderAsLabel) {
          return renderReadOnly(display, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        return (
          <div
            key={q.id}
            className={`field inline-field ck-full-width${labelLayoutClass}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderChoiceControl({
              fieldPath: q.id,
              value: choiceValue || '',
              options: opts,
              required: !!q.required,
              placeholder,
              searchEnabled: q.ui?.choiceSearchEnabled,
              override: q.ui?.control,
              disabled: submitting || q.readOnly === true || isFieldLockedByDedup(q.id),
              onChange: (next: FieldValue) => handleFieldChange(q, next)
            })}
            {helperNode}
            {renderOverlayOpenInlineButton(display)}
            {(() => {
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
              return <InfoTooltip text={selected?.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
            })()}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'CHECKBOX': {
        const hasAnyOption = !!((optionSet.en && optionSet.en.length) || (optionSet.fr && optionSet.fr.length) || (optionSet.nl && optionSet.nl.length));
        const isConsentCheckbox = !q.dataSource && !hasAnyOption;
        const selected = Array.isArray(values[q.id]) ? (values[q.id] as string[]) : [];
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const isEditableField = !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const placeholder =
          helperCfg.placeholderText || tSystem('common.selectPlaceholder', language, 'Select…');
        const helperId = helperText && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode = helperText && isEditableField ? (
          <div id={helperId} className="ck-field-helper">
            {helperText}
          </div>
        ) : null;
        const display = (() => {
          if (isConsentCheckbox) {
            return values[q.id]
              ? tSystem('common.yes', language, 'Yes')
              : tSystem('common.no', language, 'No');
          }
          const labels = selected
            .map(val => opts.find(opt => opt.value === val)?.label || val)
            .filter(Boolean);
          return labels.length ? labels.join(', ') : null;
        })();
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(display);
        }
        if (renderAsLabel) {
          return renderReadOnly(display, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        if (isConsentCheckbox) {
          const consentLabel = resolveLabel(q, language);
          return (
            <div
              key={q.id}
              className={`field inline-field ck-consent-field${labelLayoutClass}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label>
                <input
                  type="checkbox"
                  checked={!!values[q.id]}
                  aria-label={hideFieldLabel ? consentLabel : undefined}
                  disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                  onChange={e => {
                    if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                    handleFieldChange(q, e.target.checked);
                  }}
                />
                {!hideFieldLabel ? (
                <span className="ck-consent-text">
                    {consentLabel}
                  {q.required && <RequiredStar />}
                </span>
                ) : null}
              </label>
              {helperNode}
              {renderOverlayOpenInlineButton(display)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        const controlOverride = (q.ui?.control || '').toString().trim().toLowerCase();
        const renderAsMultiSelect = controlOverride === 'select';
        const multiSelectCheckboxSizePx = (() => {
          const raw = q.ui?.multiSelectCheckboxSizePx;
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return undefined;
          return Math.max(16, Math.min(40, Math.round(parsed)));
        })();
        return (
          <div
            key={q.id}
            className={`field inline-field${labelLayoutClass}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderAsMultiSelect ? (
              <SearchableMultiSelect
                value={selected}
                options={opts.map(opt => ({
                  value: opt.value,
                  label: opt.label,
                  searchText: opt.searchText
                }))}
                disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                placeholder={placeholder}
                aria-label={resolveLabel(q, language)}
                checkboxSizePx={multiSelectCheckboxSizePx}
                onChange={next => {
                  if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                  onDiagnostic?.('ui.checkbox.select.change', { fieldPath: q.id, selectedCount: next.length });
                  handleFieldChange(q, next);
                }}
              />
            ) : (
              <div className="inline-options">
                {opts.map(opt => (
                  <label key={opt.value} className="inline">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                      onChange={e => {
                        if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                        const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                        handleFieldChange(q, next);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
            {helperNode}
            {renderOverlayOpenInlineButton(display)}
            {(() => {
              const withTooltips = opts.filter(opt => opt.tooltip && selected.includes(opt.value));
              if (!withTooltips.length) return null;
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
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
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'FILE_UPLOAD':
        return (
          <TopFileUploadQuestion
            key={q.id}
            q={q}
            language={language}
            value={values[q.id]}
            submitting={submitting}
            renderAsLabel={renderAsLabel}
            forceStackedLabel={forceStackedLabel}
            forceInlineLabel={forceInlineLabel}
            labelLayoutClass={labelLayoutClass}
            labelStyle={labelStyle}
            errors={errors}
            hasWarning={hasWarning}
            renderWarnings={renderWarnings}
            isFieldLockedByDedup={isFieldLockedByDedup}
            checkFileUploadOrderedEntry={checkFileUploadOrderedEntry}
            openFileOverlay={openFileOverlay}
            handleFileInputChange={handleFileInputChange}
            fileInputsRef={fileInputsRef}
            uploadAnnouncements={uploadAnnouncements}
            renderUploadFailure={renderUploadFailure}
            renderReadOnly={renderReadOnly}
            onDiagnostic={onDiagnostic}
          />
        );
      case 'LINE_ITEM_GROUP': {
        const groupOverlayEnabled = !!q.lineItemConfig?.ui?.openInOverlay;
        const locked = submitting || isFieldLockedByDedup(q.id);

        if (groupOverlayEnabled) {
          return (
            <LineItemGroupOverlayPill
              key={q.id}
              q={q}
              language={language}
              values={values}
              lineItems={lineItems}
              collapsedRows={collapsedRows}
              errors={errors}
              locked={locked}
              labelLayoutClass={labelLayoutClass}
              labelStyle={labelStyle}
              suppressOverlayPill={overlayOpenActionTargetGroups.has(q.id)}
              hasWarning={hasWarning}
              renderWarnings={renderWarnings}
              getTopValue={getTopValueNoScan}
              openLineItemGroupOverlay={openLineItemGroupOverlay}
            />
          );
        }

        return (
          <LineItemGroupQuestion
            key={q.id}
            q={q}
            ctx={buildLineItemGroupQuestionContext({ submitting: locked })}
          />
        );
      }
      default:
        return null;
    }
  };
};
