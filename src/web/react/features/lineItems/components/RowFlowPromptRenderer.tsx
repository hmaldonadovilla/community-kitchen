import React from 'react';
import {
  buildLocalizedOptions,
  computeAllowedOptions,
  toDependencyValue
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  LineItemRowState,
  OptionSet,
  WebQuestionDefinition
} from '../../../../types';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import { buildSubgroupKey } from '../../../app/lineItems';
import { LineItemMultiAddSelect } from '../../../components/form/LineItemMultiAddSelect';
import { resolveFieldLabel } from '../../../utils/labels';
import {
  resolveRowFlowFieldTarget,
  type RowFlowResolvedPrompt,
  type RowFlowResolvedRow,
  type RowFlowResolvedState
} from '../../steps/domain/rowFlow';
import { optionSortFor } from '../domain/lineItemPresentation';
import {
  partitionRowFlowPromptActionsAction,
  resolveRowFlowPromptLayoutAction,
  splitRowFlowPromptLabelAction
} from '../domain/rowFlowPromptPresentation';

export type RowFlowPromptTarget = {
  field: any;
  groupDef: WebQuestionDefinition;
  rowEntry: RowFlowResolvedRow;
  parentValues?: Record<string, FieldValue>;
};

export type RowFlowPromptRendererProps = {
  prompt: RowFlowResolvedPrompt;
  groupId: string;
  row: LineItemRowState;
  rowFlowState: RowFlowResolvedState;
  rowFlowSubGroupIds: string[];
  definition: { questions: WebQuestionDefinition[] };
  language: LangCode;
  values: Record<string, FieldValue>;
  submitting: boolean;
  resolvePromptTargets: (prompt: RowFlowResolvedPrompt) => RowFlowPromptTarget | null;
  renderRowFlowField: (args: {
    field: any;
    groupDef: WebQuestionDefinition;
    rowEntry: RowFlowResolvedRow | null | undefined;
    parentValues?: Record<string, FieldValue>;
    showLabel?: boolean;
    labelOverride?: string;
  }) => React.ReactNode;
  renderRowFlowActionControl: (actionId: string) => React.ReactNode;
  resolveRowFlowGroupConfig: (groupKey: string) => { groupId: string; config: any } | null;
  ensureLineOptions: (groupKey: string, field: any) => void;
  resolveOptionSetForPromptField: (field: any, groupKey: string) => OptionSet;
  addLineItemRowManual: (groupId: string, initialValues?: Record<string, FieldValue>, options?: any) => unknown;
  buildOverlayGroupOverride: (group: WebQuestionDefinition, override?: any) => WebQuestionDefinition | undefined;
  openSubgroupOverlay?: (key: string, options?: any) => void;
  openLineItemGroupOverlay?: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

export const RowFlowPromptRenderer: React.FC<RowFlowPromptRendererProps> = ({
  prompt,
  groupId,
  row,
  rowFlowState,
  rowFlowSubGroupIds,
  definition,
  language,
  values,
  submitting,
  resolvePromptTargets,
  renderRowFlowField,
  renderRowFlowActionControl,
  resolveRowFlowGroupConfig,
  ensureLineOptions,
  resolveOptionSetForPromptField,
  addLineItemRowManual,
  buildOverlayGroupOverride,
  openSubgroupOverlay,
  openLineItemGroupOverlay,
  onDiagnostic
}) => {
  if (!prompt.visible) return null;
  const inputKind = (prompt.config.input?.kind || 'field').toString().trim().toLowerCase();
  if (inputKind === 'selectoroverlay') {
    const targetRef = prompt.config.input?.targetRef || '';
    if (!targetRef) return null;
    const target = resolveRowFlowFieldTarget({
      fieldRef: `${targetRef}.`,
      groupId,
      rowId: row.id,
      rowValues: row.values || {},
      references: rowFlowState.references
    });
    if (!target?.refId) return null;
    const ref = rowFlowState.references[target.refId];
    const refGroupId = (ref?.groupId || target.groupId || '').toString().trim();
    const isSubgroupRef = !!refGroupId && rowFlowSubGroupIds.includes(refGroupId);
    const targetGroupKey =
      target.primaryRow?.groupKey ||
      (isSubgroupRef ? buildSubgroupKey(groupId, row.id, refGroupId) : refGroupId || target.groupKey);
    const targetInfo = targetGroupKey ? resolveRowFlowGroupConfig(targetGroupKey) : null;
    if (!targetInfo?.config) return null;
    const promptGroupOverride = prompt.config.input?.groupOverride;
    const effectiveTargetConfig = promptGroupOverride
      ? applyLineItemGroupOverride(targetInfo.config, promptGroupOverride)
      : targetInfo.config;
    const anchorFieldId =
      effectiveTargetConfig?.anchorFieldId !== undefined && effectiveTargetConfig?.anchorFieldId !== null
        ? effectiveTargetConfig.anchorFieldId.toString()
        : '';
    const anchorField = anchorFieldId
      ? (effectiveTargetConfig?.fields || []).find((field: any) => field.id === anchorFieldId)
      : null;
    if (!anchorField || anchorField.type !== 'CHOICE') return null;
    ensureLineOptions(targetInfo.groupId, anchorField);
    const optionSetField = resolveOptionSetForPromptField(anchorField, targetInfo.groupId);
    const depIds = (
      Array.isArray(anchorField.optionFilter?.dependsOn)
        ? anchorField.optionFilter?.dependsOn
        : [anchorField.optionFilter?.dependsOn || '']
    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const depVals = depIds.map((dep: string) =>
      toDependencyValue((row.values as any)[dep] ?? (target.parentValues as any)?.[dep] ?? values[dep])
    );
    const allowed = computeAllowedOptions(anchorField.optionFilter, optionSetField, depVals);
    const localized = buildLocalizedOptions(optionSetField, allowed, language, { sort: optionSortFor(anchorField) });
    const seen = new Set<string>();
    const options = localized
      .map(opt => ({ value: opt.value, label: opt.label, searchText: opt.searchText }))
      .filter(opt => {
        const key = (opt.value || '').toString();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const resolvedLabel = resolveLocalizedString(
      prompt.config.input?.label,
      language,
      resolveLocalizedString(anchorField.label, language, anchorField.id)
    );
    const { labelText, helperText: labelHelperText } = splitRowFlowPromptLabelAction(resolvedLabel);
    const helperOverride = resolveLocalizedString(prompt.config.input?.helperText, language, '').trim();
    const helperText = helperOverride || labelHelperText;
    const placeholder =
      resolveLocalizedString(prompt.config.input?.placeholder, language, '') ||
      tSystem('lineItems.selectLinesSearch', language, 'Search items');
    return (
      <div className="field inline-field ck-full-width">
        <label>{labelText}</label>
        <LineItemMultiAddSelect
          label={labelText}
          language={language}
          options={options}
          disabled={submitting}
          placeholder={placeholder}
          helperText={helperOverride || undefined}
          emptyText={tSystem('common.noMatches', language, 'No matches.')}
          onDiagnostic={(event, payload) =>
            onDiagnostic?.(event, {
              scope: 'lineItems.rowFlow.selector',
              groupId: targetInfo.groupId,
              rowId: row.id,
              promptId: prompt.id,
              ...(payload || {})
            })
          }
          onAddSelected={valuesToAdd => {
            if (submitting) return;
            const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
            if (!deduped.length) return;
            const addRowOptions = promptGroupOverride ? { configOverride: effectiveTargetConfig } : undefined;
            const duplicateValues: string[] = [];
            let duplicateMessage = '';
            deduped.forEach(value => {
              const result = addLineItemRowManual(targetInfo.groupId, { [anchorFieldId]: value }, addRowOptions) as any;
              if (result?.status === 'duplicate') {
                duplicateValues.push(value);
                if (!duplicateMessage && result.message) duplicateMessage = result.message;
              }
            });
            if (duplicateValues.length) {
              return { duplicateValues, message: duplicateMessage };
            }
            const shouldOpenOverlay = !!promptGroupOverride && !!(effectiveTargetConfig as any)?.ui?.openInOverlay;
            if (shouldOpenOverlay) {
              const promptCloseButtonLabel = resolveLocalizedString(
                prompt.config?.input?.closeButtonLabel as any,
                language,
                ''
              ).trim();
              if (isSubgroupRef && targetGroupKey) {
                openSubgroupOverlay?.(targetGroupKey, {
                  groupOverride: promptGroupOverride,
                  source: 'system',
                  closeButtonLabel: promptCloseButtonLabel || undefined
                });
              } else if (!isSubgroupRef) {
                const baseGroup = definition.questions.find(
                  question => question.id === targetInfo.groupId && question.type === 'LINE_ITEM_GROUP'
                ) as WebQuestionDefinition | undefined;
                const overrideGroup =
                  baseGroup && promptGroupOverride
                    ? buildOverlayGroupOverride(baseGroup, promptGroupOverride)
                    : undefined;
                if (overrideGroup) {
                  openLineItemGroupOverlay?.(overrideGroup, {
                    source: 'system',
                    closeButtonLabel: promptCloseButtonLabel || undefined
                  });
                }
              }
            }
            onDiagnostic?.('lineItems.rowFlow.selector.add', {
              groupId: targetInfo.groupId,
              rowId: row.id,
              promptId: prompt.id,
              count: deduped.length
            });
            return { addedValues: deduped };
          }}
        />
        {helperText && !helperOverride ? (
          <div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>
            {helperText}
          </div>
        ) : null}
      </div>
    );
  }

  const promptTarget = resolvePromptTargets(prompt);
  if (!promptTarget) return null;
  const promptLabelRaw = resolveLocalizedString(
    prompt.config.input?.label,
    language,
    resolveFieldLabel(promptTarget.field, language, promptTarget.field.id)
  );
  const { labelText: promptLabel, helperText: promptHelperText } =
    splitRowFlowPromptLabelAction(promptLabelRaw);
  const { useInlineLabel, hideLabel, actionsInline } = resolveRowFlowPromptLayoutAction(prompt.config);
  const fieldNode = renderRowFlowField({
    field: promptTarget.field,
    groupDef: promptTarget.groupDef,
    rowEntry: promptTarget.rowEntry,
    parentValues: promptTarget.parentValues,
    showLabel: !useInlineLabel && !hideLabel,
    labelOverride: promptLabel
  });
  const inlineLabelNode = useInlineLabel ? (
    <span style={{ fontWeight: 600 }}>{promptLabel}</span>
  ) : null;
  const inlineFieldRow = useInlineLabel ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
      {inlineLabelNode}
      <div style={{ flex: 1, minWidth: 0 }}>{fieldNode}</div>
    </div>
  ) : (
    <div style={{ flex: 1, minWidth: 0 }}>{fieldNode}</div>
  );
  const helperNode = promptHelperText ? (
    <div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>
      {promptHelperText}
    </div>
  ) : null;
  if (!prompt.config.actions?.length) {
    if (!helperNode) return useInlineLabel ? inlineFieldRow : fieldNode;
    return (
      <div className="ck-full-width" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {useInlineLabel ? inlineFieldRow : fieldNode}
        {helperNode}
      </div>
    );
  }
  const { startActions, endActions } = partitionRowFlowPromptActionsAction(prompt.config.actions);
  if (actionsInline) {
    return (
      <div className="ck-full-width" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {startActions.map(action => renderRowFlowActionControl(action.id))}
          {inlineFieldRow}
          {endActions.map(action => renderRowFlowActionControl(action.id))}
        </div>
        {helperNode}
      </div>
    );
  }
  return (
    <div className="ck-full-width" style={{ display: 'flex', flexDirection: 'column', gap: helperNode ? 6 : 10 }}>
      {useInlineLabel ? inlineFieldRow : fieldNode}
      {helperNode}
      {(startActions.length || endActions.length) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {startActions.map(action => renderRowFlowActionControl(action.id))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {endActions.map(action => renderRowFlowActionControl(action.id))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
