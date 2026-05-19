import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  matchesWhen,
  matchesWhenClause,
  peekOptionsFromDataSource,
  shouldHideField,
  toDependencyValue,
  toOptionSet,
  validateRules
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  OptionSet,
  RowFlowConfig,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import type { OverlayCloseConfirmLike } from '../../../../../types';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  resolveSubgroupKey
} from '../../../app/lineItems';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import { LineFileUploadListQuestion } from '../../../features/uploads/components/LineFileUploadListQuestion';
import { resolveFieldLabel } from '../../../utils/labels';
import { isEmptyValue } from '../../../utils/values';
import { DateInput } from '../../../components/form/DateInput';
import { InfoTooltip } from '../../../components/form/InfoTooltip';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { PairedRowGrid } from '../../../components/form/PairedRowGrid';
import { buttonStyles, RequiredStar, srOnly } from '../../../components/form/ui';
import {
  formatOptionFilterNonMatchWarning,
  isUploadValueComplete,
  resolveFieldHelperText,
  resolveLineItemTableReadOnlyDisplay,
  resolveRowDisclaimerText,
  toDateInputValue
} from '../../../components/form/utils';
import { applyValueMapsToLineRow, resolveValueMapValue } from '../../../components/form/valueMaps';
import { normalizeOverlayFieldListAction, normalizeOverlayFlattenPlacementAction } from '../domain/overlayFlattenedFields';
import { buildGuidedHeaderRows, resolveGuidedHeaderLayout } from '../domain/guidedHeaderLayout';
import { optionSortFor } from '../domain/lineItemPresentation';
import { LineItemBodyFieldsSection } from './LineItemBodyFieldsSection';
import {
  LineItemOverlayOpenInlineButton,
  LineItemOverlayOpenReplaceField,
  LineItemReadOnlyField
} from './LineItemFieldChrome';
import { LineItemInlineSubgroupsRenderer } from './LineItemInlineSubgroupsRenderer';
import { LineItemRemoveButton } from './LineItemRemoveButton';
import { LineItemRowTogglePill } from './LineItemRowTogglePill';
import { RowFlowRowRenderer } from './RowFlowRowRenderer';
import { SourceFirstInlineDataSourceRows } from './SourceFirstInlineDataSourceRows';
import { SubgroupOpenStackRenderer } from './SubgroupOpenStackRenderer';
import { renderLineItemOverlayFlattenedFields } from './LineItemOverlayFlattenedFieldsRenderer';

type LineItemGroupRowsRendererProps = Record<string, any>;

const resolveOptionSetForField = (optionState: any, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || peekOptionsFromDataSource(field.dataSource, 'EN') || toOptionSet(field);

/**
 * Owner: line-items feature renderer.
 * Renders parent line-item rows for standard and row-flow modes. The parent
 * still owns stateful data-source/utilisation wiring and passes callbacks in.
 */
export const LineItemGroupRowsRenderer: React.FC<LineItemGroupRowsRendererProps> = props => {
  const {
    q,
    parentRows,
    sourceFirstDataSourceRows,
    hideParentRowsForSourceFirst,
    rowFlowEnabled,
    rowFlowStateByRowId,
    rowFlowSubGroupIds,
    definition,
    language,
    values,
    errors,
    submitting,
    groupChoiceSearchDefault,
    activeFieldMeta,
    rowFlow,
    outputActionsLayout,
    rowFlowLoggedRef,
    rowFlowPromptRef,
    onDiagnostic,
    renderRowFlowActionControlWithContext,
    resolveOutputActionScope,
    resolveRowFlowGroupConfig,
    resolveRowFlowFieldConfig,
    buildRowFlowGroupDefinition,
    buildRowFlowFieldCtx,
    resolveRowFlowDisplayValue,
    optionState,
    ensureLineOptions,
    renderWarnings,
    renderChoiceControl,
    handleLineFieldChange,
    setErrors,
    isLineFieldInputDisabled,
    isLineFieldInteractionBlocked,
    openFileOverlay,
    handleLineFileInputChange,
    fileInputsRef,
    addLineItemRowManual,
    buildOverlayGroupOverride,
    openSubgroupOverlay,
    openLineItemGroupOverlay,
    resolveTopValue,
    lineItems,
    collapsedRows,
    setCollapsedRows,
    errorIndex,
    overlayOpenActionLoggedRef,
    hasWarning,
    useDescriptiveNonMatchWarnings,
    latestValuesRef,
    setValues,
    setLineItems,
    ctx,
    setSubgroupSelectors,
    removeLineFile,
    clearLineFiles,
    isFileUploadOrderedEntryBlocked,
    uploadAnnouncements,
    renderUploadFailure,
    removeLineRow,
    collapsedGroups,
    toggleGroupCollapsed,
    activeStepDataSourceRows,
    stepDataSourceDrafts,
    resolveStepDataSourceRowsForParent,
    resolveDataSourceOutputGroup,
    buildStepDataSourceDraftKey,
    buildVirtualDataSourceRowValues,
    resolveVirtualRowWhenContext,
    validateVirtualFieldRules,
    allowsVirtualIntegerOnly,
    resolveVirtualMaxFieldId,
    toFiniteNumber,
    seedUtilisationCommittedValues,
    queueDeferredStepUtilisationSync,
    hasPendingDeferredUtilisationChange,
    cancelDeferredStepUtilisationSync,
    syncStepDataSourceOutputRowWithUtilisation,
    hideInlineSubgroups,
    collapsedSubgroups,
    subgroupSelectors,
    latestSubgroupSelectorValueRef,
    selectorSearchLoggedRef,
    selectorOverlayLoggedRef,
    subgroupBottomRefs,
    buildOptionSetForLineField,
    setOptionState,
    setOverlay,
    setCollapsedSubgroups,
    openInfoOverlay
  } = props;

  if (sourceFirstDataSourceRows.length && hideParentRowsForSourceFirst) return null;

  return <>{(parentRows as any[]).map((row: any, rowIdx: number) => {
              const useEdgeToEdgeRowChrome = q.id === 'MP_TYPE_LI' || (q as any)?.ui?.edgeToEdgeRows === true;
              const groupCtx: VisibilityContext = {
                getValue: fid => resolveTopValue(fid),
                getLineValue: (_rowId, fid) => row.values[fid],
                getLineItems: groupId => lineItems?.[groupId] || [],
                getLineItemKeys: () => Object.keys(lineItems || {})
              };
              const rowFlowState = rowFlowEnabled ? rowFlowStateByRowId.get(row.id) || null : null;

              if (rowFlowEnabled && rowFlowState) {
                return (
                  <RowFlowRowRenderer
                    key={row.id}
                    groupId={q.id}
                    row={row}
                    rowIdx={rowIdx}
                    rowCount={parentRows.length}
                    useEdgeToEdgeRowChrome={useEdgeToEdgeRowChrome}
                    rowFlowState={rowFlowState}
                    rowFlowSubGroupIds={rowFlowSubGroupIds}
                    definition={definition}
                    language={language}
                    values={values}
                    errors={errors}
                    submitting={submitting}
                    groupChoiceSearchDefault={groupChoiceSearchDefault}
                    activeFieldPath={activeFieldMeta.path}
                    outputSeparator={rowFlow?.output?.separator ?? ' | '}
                    outputActionsLayout={outputActionsLayout}
                    rowFlowLoggedRef={rowFlowLoggedRef}
                    rowFlowPromptRef={rowFlowPromptRef}
                    onDiagnostic={onDiagnostic}
                    renderRowFlowActionControlWithContext={renderRowFlowActionControlWithContext}
                    resolveOutputActionScope={resolveOutputActionScope}
                    resolveRowFlowGroupConfig={resolveRowFlowGroupConfig}
                    resolveRowFlowFieldConfig={resolveRowFlowFieldConfig}
                    buildRowFlowGroupDefinition={buildRowFlowGroupDefinition}
                    buildRowFlowFieldContext={buildRowFlowFieldCtx}
                    resolveRowFlowDisplayValue={resolveRowFlowDisplayValue}
                    resolveOptionSetForField={(field, groupKey) => resolveOptionSetForField(optionState, field, groupKey)}
                    ensureLineOptions={ensureLineOptions}
                    renderWarnings={renderWarnings}
                    renderChoiceControl={renderChoiceControl}
                    handleLineFieldChange={handleLineFieldChange}
                    setErrors={setErrors}
                    isLineFieldInputDisabled={isLineFieldInputDisabled}
                    isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
                    openFileOverlay={openFileOverlay}
                    handleLineFileInputChange={handleLineFileInputChange}
                    fileInputsRef={fileInputsRef}
                    addLineItemRowManual={addLineItemRowManual}
                    buildOverlayGroupOverride={buildOverlayGroupOverride}
                    openSubgroupOverlay={openSubgroupOverlay}
                    openLineItemGroupOverlay={openLineItemGroupOverlay}
                  />
                );
              }
              const isLastEdgeToEdgeRow = useEdgeToEdgeRowChrome && rowIdx === parentRows.length - 1;
              const ui = q.lineItemConfig?.ui;
              const guidedCollapsedFieldsInHeader = Boolean((ui as any)?.guidedCollapsedFieldsInHeader);
              const isProgressive =
                ui?.mode === 'progressive' && Array.isArray(ui.collapsedFields) && ui.collapsedFields.length > 0;
              const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsedBase = isProgressive ? (collapsedRows[collapseKey] ?? defaultCollapsed) : false;
              const rowCollapsed = guidedCollapsedFieldsInHeader ? false : rowCollapsedBase;
              const showRowHeader = isProgressive || guidedCollapsedFieldsInHeader;

              const collapsedFieldConfigs: any[] = isProgressive ? ui?.collapsedFields || [] : [];
              const collapsedLabelMap: Record<string, boolean> = {};
              const collapsedFieldOrder: string[] = [];
              collapsedFieldConfigs.forEach(cfg => {
                const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                if (!fid) return;
                collapsedFieldOrder.push(fid);
                collapsedLabelMap[fid] = cfg.showLabel !== undefined ? !!cfg.showLabel : true;
              });

              const allFields: any[] = q.lineItemConfig?.fields || [];
              const rowVisibilityValues = applyValueMapsToLineRow(allFields, row.values || {}, values, { mode: 'init' }, {
                groupKey: q.id,
                rowId: row.id,
                lineItems
              });
              const overlayActionCtx: VisibilityContext = {
                ...groupCtx,
                getLineValue: (_rowId, fid) => (rowVisibilityValues as any)[fid]
              };
              const subGroups: any[] = q.lineItemConfig?.subGroups || [];
              const subIdToLabel: Record<string, string> = {};
              subGroups.forEach((sub: any) => {
                const id = resolveSubgroupKey(sub);
                if (!id) return;
                const label = resolveLocalizedString(sub.label, language, id);
                subIdToLabel[id] = label || id;
              });
              const subIds = Object.keys(subIdToLabel);
              const normalizeOverlayOpenActions = (field: any): any[] => {
                const raw =
                  (field as any)?.ui?.overlayOpenActions ??
                  (field as any)?.overlayOpenActions ??
                  (field as any)?.ui?.overlayOpenAction ??
                  (field as any)?.overlayOpenAction;
                if (!raw) return [];
                return Array.isArray(raw) ? raw : [raw];
              };
              const normalizeOverlayFieldList = normalizeOverlayFieldListAction;
              const normalizeOverlayFlattenPlacement = normalizeOverlayFlattenPlacementAction;
              const overlayOpenActionTargetsForField = (field: any): string[] => {
                const actions = normalizeOverlayOpenActions(field);
                return actions
                  .map(action =>
                    action?.groupId !== undefined && action?.groupId !== null ? action.groupId.toString() : ''
                  )
                  .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
              };
              const logOverlayOpenActionOnce = (key: string, event: string, payload?: Record<string, unknown>) => {
                if (!onDiagnostic || !key) return;
                if (overlayOpenActionLoggedRef.current.has(key)) return;
                overlayOpenActionLoggedRef.current.add(key);
                onDiagnostic(event, payload);
              };
              const resolveOverlayOpenActionTarget = (gid: string) => {
                if (!gid) return null;
                if (subIdToLabel[gid] !== undefined) return { kind: 'sub' as const };
                const topGroup = definition.questions.find((question: any) => question.id === gid && question.type === 'LINE_ITEM_GROUP') as
                  | WebQuestionDefinition
                  | undefined;
                if (topGroup) return { kind: 'line' as const, group: topGroup };
                return null;
              };
              const resolveOverlayOpenActionForField = (field: any, row: any, groupCtx: VisibilityContext) => {
                const actions = normalizeOverlayOpenActions(field);
                if (!actions.length) return null;
                const extractSelfWhen = (when: any, fieldId: string): any | null => {
                  if (!when || typeof when !== 'object') return null;
                  if (Array.isArray(when)) return null;
                  const list = (when as any).all ?? (when as any).and ?? (when as any).any ?? (when as any).or;
                  if (Array.isArray(list)) {
                    if (list.length !== 1) return null;
                    return extractSelfWhen(list[0], fieldId);
                  }
                  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) return null;
                  if ((when as any).lineItems || (when as any).lineItem) return null;
                  const whenFieldId = (when as any).fieldId;
                  if (whenFieldId === undefined || whenFieldId === null) return null;
                  return whenFieldId.toString().trim() === fieldId ? when : null;
                };
                const resolveSelfWhenValue = (fieldId: string): unknown => {
                  const fromRowValues = (row?.values || {})[fieldId];
                  const fromRowValuesScoped = (row?.values || {})[`${q.id}__${fieldId}`];
                  const fromComputed = (rowVisibilityValues as any)[fieldId];
                  const fromTop = values[fieldId];
                  const candidates = [fromComputed, fromRowValues, fromRowValuesScoped, fromTop];
                  const pick = candidates.find(val => val !== undefined && val !== null && !isEmptyValue(val as any));
                  const chosen = pick !== undefined ? pick : candidates[0];
                  if (typeof chosen === 'string') {
                    const trimmed = chosen.trim();
                    if (trimmed.includes(',') && !trimmed.includes('.')) {
                      return trimmed.replace(',', '.');
                    }
                    return trimmed;
                  }
                  return chosen;
                };
                const match = actions.find(action => {
                  const gid = action?.groupId !== undefined && action?.groupId !== null ? action.groupId.toString() : '';
                  if (!gid) return false;
                  const target = resolveOverlayOpenActionTarget(gid);
                  if (!target) {
                    const missKey = `${q.id}::${field?.id || ''}::overlayOpenAction::missing::${gid}`;
                    logOverlayOpenActionOnce(missKey, 'ui.overlayOpenAction.missingGroup', {
                      scope: 'line',
                      parentGroupId: q.id,
                      fieldId: field?.id,
                      rowId: row?.id,
                      groupId: gid
                    });
                    return false;
                  }
                  if (!action?.when) return true;
                  const selfWhen = extractSelfWhen(action.when as any, (field?.id ?? '').toString());
                  if (selfWhen) {
                    const selfValue = resolveSelfWhenValue(field.id);
                    return matchesWhen(selfValue, selfWhen);
                  }
                  return action?.when
                    ? matchesWhenClause(action.when as any, groupCtx, { rowId: row.id, linePrefix: q.id })
                    : true;
                });
                if (!match) return null;
                const groupId = match.groupId.toString();
                const target = resolveOverlayOpenActionTarget(groupId);
                if (!target) return null;
                const targetKind = target.kind;
                const targetKey = targetKind === 'sub' ? buildSubgroupKey(q.id, row.id, groupId) : groupId;
                const rowFilterRaw = (match as any).rowFilter ?? (match as any).rows ?? null;
                const rowFilter = rowFilterRaw && typeof rowFilterRaw === 'object' ? rowFilterRaw : null;
                const renderMode =
                  (match.renderMode || 'replace').toString().trim().toLowerCase() === 'inline' ? 'inline' : 'replace';
                const label = resolveLocalizedString(match.label, language, resolveFieldLabel(field, language, field.id));
                const flattenFields = normalizeOverlayFieldList((match as any).flattenFields);
                const flattenPlacement = normalizeOverlayFlattenPlacement((match as any).flattenPlacement);
                const overrideGroup =
                  targetKind === 'line' && target.group ? buildOverlayGroupOverride(target.group, (match as any).groupOverride) : undefined;
                const hasOverride = targetKind === 'line' ? !!overrideGroup : !!(match as any).groupOverride;
                const hasRowFlow = !!(match as any).rowFlow;
                const logKey = `${q.id}::${field?.id || ''}::overlayOpenAction::${groupId}::${renderMode}::${targetKind}`;
                logOverlayOpenActionOnce(logKey, 'ui.overlayOpenAction.available', {
                  scope: 'line',
                  parentGroupId: q.id,
                  fieldId: field?.id,
                  groupId,
                  targetKind,
                  renderMode,
                  hasRowFilter: !!rowFilter,
                  hasOverride,
                  hasRowFlow,
                  hasFlattenFields: flattenFields.length > 0,
                  flattenPlacement,
                  hideTrashIcon: (match as any).hideTrashIcon === true,
                  hideCloseButton: (match as any).hideCloseButton === true,
                  hasCloseConfirm: !!(match as any).closeConfirm,
                  hasCloseLabel: !!(match as any).closeButtonLabel
                });
                return {
                  action: match,
                  groupId,
                  targetKind,
                  targetKey,
                  subKey: targetKind === 'sub' ? targetKey : '',
                  rowFilter,
                  groupOverride: (match as any).groupOverride,
                  overrideGroup,
                  hideInlineSubgroups: (match as any).hideInlineSubgroups === true,
                  hideCloseButton: (match as any).hideCloseButton === true,
                  closeButtonLabel: (match as any).closeButtonLabel,
                  closeConfirm: (match as any).closeConfirm as OverlayCloseConfirmLike | undefined,
                  renderMode,
                  label,
                  tone: ((match as any).tone || 'primary').toString().trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary',
                  flattenFields,
                  flattenPlacement,
                  hideTrashIcon: (match as any).hideTrashIcon === true,
                  rowFlow: (match as any).rowFlow as RowFlowConfig | undefined
                };
              };
              const renderOverlayOpenFlattenedFieldsShared = (
                field: any,
                overlayOpenAction: any,
                placementOverride?: 'left' | 'right' | 'below',
                options?: { asGridItems?: boolean; forceStackedLabel?: boolean }
              ): React.ReactNode =>
                renderLineItemOverlayFlattenedFields({
                  field,
                  overlayOpenAction,
                  placementOverride,
                  options,
                  q,
                  row,
                  definition,
                  subGroups: subGroups || [],
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
                });

              const fieldTriggeredSubgroupIdSet =
                !rowCollapsed && subIds.length > 0
                  ? (allFields as any[]).reduce<Set<string>>((acc: Set<string>, field: any) => {
                      const effects = Array.isArray((field as any).selectionEffects)
                        ? ((field as any).selectionEffects as any[])
                        : [];
                      effects.forEach(e => {
                        const gid = e?.groupId ? e.groupId.toString() : '';
                        if (gid && subIdToLabel[gid] !== undefined) acc.add(gid);
                      });
                      overlayOpenActionTargetsForField(field).forEach(gid => acc.add(gid));
                      return acc;
                    }, new Set<string>())
                  : new Set<string>();
              const fallbackSubIds =
                !rowCollapsed && subIds.length
                  ? (ui?.inlineSubgroupsWhenExpanded === true
                      ? []
                      : subIds.filter(id => !fieldTriggeredSubgroupIdSet.has(id)))
                  : [];

              const renderSubgroupOpenStack = (
                subIdsToRender: string[],
                opts?: { sourceFieldId?: string; variant?: 'stack' | 'inline' }
              ) => (
                <SubgroupOpenStackRenderer
                  parentGroupId={q.id}
                  parentRow={row}
                  subIdsToRender={subIdsToRender}
                  subIdToLabel={subIdToLabel}
                  subGroups={subGroups || []}
                  lineItems={lineItems}
                  values={values}
                  collapsedRows={collapsedRows}
                  errorIndex={errorIndex}
                  language={language}
                  sourceFieldId={opts?.sourceFieldId}
                  variant={opts?.variant}
                  resolveTopValue={resolveTopValue}
                  openSubgroupOverlay={openSubgroupOverlay}
                  onDiagnostic={onDiagnostic}
                />
              );
              const collapsedFieldsOrdered = collapsedFieldOrder
                .map((fid: string) => allFields.find((field: any) => field.id === fid))
                .filter(Boolean) as any[];
              const fieldsToRenderBase =
                isProgressive && rowCollapsed
                  ? collapsedFieldsOrdered.length
                    ? collapsedFieldsOrdered
                    : allFields
                  : allFields;

              const addMode = (q.lineItemConfig as any)?.addMode;
              const anchorFieldId =
                q.lineItemConfig?.anchorFieldId !== undefined && q.lineItemConfig?.anchorFieldId !== null
                  ? q.lineItemConfig?.anchorFieldId.toString()
                  : '';
              const anchorField = anchorFieldId ? (allFields.find((field: any) => field.id === anchorFieldId) as any) : undefined;
              const anchorRawValue = anchorFieldId ? (row.values || {})[anchorFieldId] : undefined;
              const anchorHasValue = !!anchorFieldId && !isEmptyValue(anchorRawValue as any);
              const rowSource = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
              const hideRemoveButton = parseRowHideRemove((row.values as any)?.[ROW_HIDE_REMOVE_KEY]);
              const allowRemoveAutoRows = (q.lineItemConfig as any)?.ui?.allowRemoveAutoRows !== false;
              const canRemoveRow = !hideRemoveButton && (allowRemoveAutoRows || rowSource !== 'auto');
              const expandGateCandidate = ((ui?.expandGate || 'collapsedFieldsValid') as any) || 'collapsedFieldsValid';
              // For addMode:auto we show the anchor as the row title when expandGate is collapsedFieldsValid
              // (manual rows can still edit it). For selectionEffect-generated auto rows
              // (e.g., addLineItemsFromDataSource), we apply the same title+lock behavior regardless of expandGate,
              // as long as the group declares anchorFieldId and the row is marked auto.
              const allowAnchorTitle = !(guidedCollapsedFieldsInHeader && isProgressive);
              const anchorAsTitle =
                !!anchorField &&
                allowAnchorTitle &&
                (((anchorField as any)?.ui?.renderAsLabel === true) || ((anchorField as any)?.readOnly === true));
              const anchorTitleLabel = (() => {
                if (!anchorFieldId || !anchorField || !anchorHasValue) return '';
                const rawVal = (row.values || {})[anchorFieldId];
                if ((anchorField as any).type === 'CHOICE') {
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
                    dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                  );
                  const choiceVal =
                    Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                  const allowedWithCurrent =
                    choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                      ? [...allowedField, choiceVal]
                      : allowedField;
                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, {
                    sort: optionSortFor(anchorField)
                  });
                  const selectedOpt = optsField.find(opt => opt.value === choiceVal);
                  return (selectedOpt?.label || choiceVal || '').toString();
                }
                if (Array.isArray(rawVal)) {
                  return rawVal
                    .map(v =>
                      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
                    )
                    .filter(Boolean)
                    .join(', ');
                }
                return typeof rawVal === 'string' || typeof rawVal === 'number' || typeof rawVal === 'boolean'
                  ? String(rawVal)
                  : '';
              })();
              const wantsAnchorTitle =
                !!anchorField &&
                isProgressive &&
                allowAnchorTitle &&
                (anchorAsTitle || (addMode === 'auto' && expandGateCandidate === 'collapsedFieldsValid') || rowSource === 'auto');
              const lockAnchor = wantsAnchorTitle && rowSource === 'auto';
              const rowDisclaimerText = resolveRowDisclaimerText({
                ui,
                language,
                rowValues: (row.values || {}) as any,
                autoGenerated: !!row.autoGenerated,
                getValue: groupCtx?.getValue
              });
              const rowNonMatchKeys = parseRowNonMatchOptions((row.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
              const rowNonMatchWarning =
                useDescriptiveNonMatchWarnings && rowNonMatchKeys.length
                  ? formatOptionFilterNonMatchWarning({ language, keys: rowNonMatchKeys })
                  : '';

              const titleFieldId = (() => {
                if (!isProgressive) return '';
                if (wantsAnchorTitle) return anchorFieldId;
                const unlabeled = (collapsedFieldConfigs || [])
                  .filter((cfg: any) => cfg && cfg.showLabel === false)
                  .map((cfg: any) => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
                  .filter(Boolean);
                return unlabeled.length === 1 ? unlabeled[0] : '';
              })();

              const titleField = titleFieldId ? (allFields.find((field: any) => field.id === titleFieldId) as any) : undefined;
              const titleHidden = titleField
                ? shouldHideField(titleField.visibility, groupCtx, { rowId: row.id, linePrefix: q.id })
                : true;
              const showTitleControl = !!titleField && !titleHidden;
              const resolveCompactHeaderDisplayText = (field: any): string => {
                const displayRowValues = (rowVisibilityValues || row.values || {}) as Record<string, FieldValue>;
                const rawValue = displayRowValues[field.id];
                if (field.type === 'CHOICE') {
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
                    dependencyIds.map((dep: string) => toDependencyValue(displayRowValues[dep] ?? values[dep]))
                  );
                  const choiceVal = Array.isArray(rawValue) && rawValue.length ? (rawValue as string[])[0] : (rawValue as string);
                  const allowedWithCurrent =
                    choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                      ? [...allowedField, choiceVal]
                      : allowedField;
                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
                  const selectedOpt = optsField.find(opt => opt.value === choiceVal);
                  return resolveLineItemTableReadOnlyDisplay({
                    baseValue: selectedOpt?.label || choiceVal,
                    field,
                    rowValues: displayRowValues,
                    language
                  });
                }
                return resolveLineItemTableReadOnlyDisplay({
                  baseValue: rawValue,
                  field,
                  rowValues: displayRowValues,
                  language
                });
              };
              const rowHeaderSummaryTemplateRaw =
                (ui as any)?.rowHeaderSummaryTemplate ??
                (ui as any)?.row_header_summary_template ??
                (ui as any)?.headerSummaryTemplate ??
                (ui as any)?.header_summary_template;
              const rowHeaderSummaryTemplate =
                rowHeaderSummaryTemplateRaw !== undefined && rowHeaderSummaryTemplateRaw !== null
                  ? rowHeaderSummaryTemplateRaw.toString().trim()
                  : '';
              const explicitRowHeaderSummaryText = (() => {
                if (!rowHeaderSummaryTemplate) return '';
                const displayRowValues = (rowVisibilityValues || row.values || {}) as Record<string, FieldValue>;
                return rowHeaderSummaryTemplate
                  .replace(/\{([^}]+)\}/g, (_match: string, rawFieldId: string) => {
                    const fieldId = rawFieldId.toString().trim();
                    if (!fieldId) return '';
                    const field = allFields.find((field: any) => field.id === fieldId) as any;
                    if (field) return resolveCompactHeaderDisplayText(field);
                    const rawValue = displayRowValues[fieldId];
                    if (rawValue === undefined || rawValue === null) return '';
                    if (Array.isArray(rawValue)) return rawValue.map(v => (v == null ? '' : String(v))).filter(Boolean).join(', ');
                    return String(rawValue);
                  })
                  .replace(/\s+/g, ' ')
                  .trim();
              })();
              const compactHeaderSummaryText = (() => {
                if (guidedCollapsedFieldsInHeader || !isProgressive || !rowCollapsed) return '';
                const compactFields = (collapsedFieldConfigs || [])
                  .filter((cfg: any) => cfg && cfg.showLabel === false)
                  .map((cfg: any) => {
                    const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                    return fid ? (allFields.find((field: any) => field.id === fid) as any) : null;
                  })
                  .filter(Boolean)
                  .filter((field: any) => !shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id }));
                if (!compactFields.length) return '';

                return compactFields
                  .map((field: any) => resolveCompactHeaderDisplayText(field))
                  .map((text: string) => text.trim())
                  .filter((text: string) => !!text && text !== '—')
                  .join(' | ');
              })();
              const guidedCompactHeaderSummaryFieldIdSet = new Set<string>(
                guidedCollapsedFieldsInHeader && isProgressive
                  ? (collapsedFieldConfigs || [])
                      .filter((cfg: any) => cfg && cfg.showLabel === false)
                      .map((cfg: any) => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
                      .filter(Boolean)
                  : []
              );
              const guidedCompactHeaderSummaryFields =
                guidedCompactHeaderSummaryFieldIdSet.size > 0
                  ? (Array.from(guidedCompactHeaderSummaryFieldIdSet) as string[])
                      .map(fid => allFields.find((field: any) => field.id === fid) as any)
                      .filter(Boolean)
                      .filter((field: any) => !shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id }))
                  : [];
              const guidedCompactHeaderSummaryText =
                guidedCollapsedFieldsInHeader && isProgressive && guidedCompactHeaderSummaryFields.length
                  ? guidedCompactHeaderSummaryFields
                      .map((field: any) => resolveCompactHeaderDisplayText(field))
                      .map((text: string) => text.trim())
                      .filter((text: string) => !!text && text !== '—')
                      .join(' | ')
                  : '';
              const hasExplicitRowHeaderSummary = !!explicitRowHeaderSummaryText;
              const renderGuidedCompactSummaryOnly =
                hasExplicitRowHeaderSummary || (guidedCollapsedFieldsInHeader && !!guidedCompactHeaderSummaryText);
              const showAnchorTitleAsHeaderTitle =
                guidedCollapsedFieldsInHeader &&
                isProgressive &&
                !hasExplicitRowHeaderSummary &&
                !guidedCompactHeaderSummaryText &&
                showTitleControl &&
                anchorHasValue &&
                wantsAnchorTitle;
              const showAnchorTitleAsBodyTitle = !isProgressive && anchorHasValue && (anchorAsTitle || rowSource === 'auto');
              // Guided steps UX: when collapsed fields are rendered in the row header, don't render the special "title control"
              // separately. Instead, we keep all collapsed fields in the header grid so they can appear side-by-side.
              const showTitleControlInHeader = showTitleControl && !guidedCollapsedFieldsInHeader && !hasExplicitRowHeaderSummary;
              const isAnchorTitle = wantsAnchorTitle && !!titleField && titleField.id === anchorFieldId;
              const titleLocked = isAnchorTitle && lockAnchor;

              const fieldsToRender = (() => {
                const base = showTitleControl ? fieldsToRenderBase.filter((f: any) => f?.id !== titleFieldId) : fieldsToRenderBase;
                if (!showAnchorTitleAsBodyTitle || !anchorFieldId) return base;
                return (base || []).filter((f: any) => (f?.id || '').toString() !== anchorFieldId);
              })();

              const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
              const gateResult = (() => {
                if (!isProgressive || !rowCollapsed) return { canExpand: true, reason: '' };
                if (expandGate === 'always') return { canExpand: true, reason: '' };

                const missing: string[] = [];
                const invalid: string[] = [];
                (collapsedFieldConfigs || []).forEach((cfg: any) => {
                  const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                  if (!fid) return;
                  const field = allFields.find((field: any) => field.id === fid);
                  if (!field) return;
                  const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                  if (hideField) return;

                  const val = row.values[field.id];
                  const filled =
                    field.type === 'FILE_UPLOAD'
                      ? isUploadValueComplete({
                          value: val as any,
                          uploadConfig: (field as any).uploadConfig,
                          required: !!field.required
                        })
                      : !isEmptyValue(val as any);
                  if (field.required && !filled) {
                    missing.push(field.id);
                  }

                  const rules = Array.isArray(field.validationRules)
                    ? field.validationRules.filter((rule: any) => rule?.then?.fieldId === field.id)
                    : [];
                  if (rules.length) {
                    const isHidden = (fieldId: string) => {
                      const target = allFields.find((field: any) => field.id === fieldId);
                      if (!target) return false;
                      return shouldHideField(target.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                    };
                    const ctx: any = {
                      ...groupCtx,
                      getValue: (fieldId: string) =>
                        Object.prototype.hasOwnProperty.call(row.values || {}, fieldId) ? row.values[fieldId] : values[fieldId],
                      language,
                      phase: 'submit',
                      isHidden
                    };
                    const errs = validateRules(rules, ctx);
                    if (errs.length) {
                      invalid.push(field.id);
                    }
                  }
                });

                const blocked = Array.from(new Set([...missing, ...invalid]));
                if (!blocked.length) return { canExpand: true, reason: '' };
                return {
                  canExpand: false,
                  reason: tSystem('lineItems.completeRequiredToExpand', language, 'Complete required fields to expand: {fields}', {
                    fields: blocked.join(', ')
                  })
                };
              })();
              const canExpand = gateResult.canExpand;
              const rowLocked = isProgressive && rowCollapsed && !canExpand;
              const rowHasError = errorIndex.rowErrors.has(collapseKey);
              const rowTogglePill = (
                <LineItemRowTogglePill
                  hidden={guidedCollapsedFieldsInHeader}
                  groupId={q.id}
                  row={row}
                  fields={allFields}
                  subGroups={subGroups || []}
                  lineItems={lineItems}
                  groupCtx={groupCtx}
                  language={language}
                  rowHasError={rowHasError}
                  rowLocked={rowLocked}
                  rowCollapsed={rowCollapsed}
                  canExpand={canExpand}
                  gateReason={gateResult.reason}
                  resolveTopValue={resolveTopValue}
                  onBlockedExpand={reason => {
                    onDiagnostic?.('edit.progressive.expand.blocked', {
                      groupId: q.id,
                      rowId: row.id,
                      reason
                    });
                  }}
                  onToggle={nextCollapsed => {
                    setCollapsedRows((prev: Record<string, boolean>) => ({ ...prev, [collapseKey]: nextCollapsed }));
                    onDiagnostic?.('edit.progressive.toggle', { groupId: q.id, rowId: row.id, collapsed: nextCollapsed });
                  }}
                />
              );
              const { headerFieldsToRender, bodyFieldsToRender } = resolveGuidedHeaderLayout({
                guidedCollapsedFieldsInHeader,
                collapsedFieldsOrdered,
                fieldsToRender,
                showAnchorTitleAsHeaderTitle,
                anchorFieldId,
                showTitleControlInHeader,
                titleFieldId,
                guidedCompactHeaderSummaryFieldIdSet,
                collapsedFieldConfigs,
                guidedCompactHeaderSummaryText,
                hasExplicitRowHeaderSummary,
                isProgressive,
                rowCollapsed
              });

              const renderLineItemField = (
                field: any,
                opts?: { forceHideLabel?: boolean; showLabel?: boolean; forceStackedLabel?: boolean; inGrid?: boolean }
              ) => {
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
                  currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal) ? [...allowedField, currentVal] : allowedField;
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
                // In grids (2-up/3-up), we must keep the label in layout to preserve row alignment.
                // Using `srOnly` (position:absolute) would remove the label from the grid and shift controls upward.
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
                const renderOverlayOpenFlattenedFields = (
                  placementOverride?: 'left' | 'right' | 'below',
                  options?: { asGridItems?: boolean; forceStackedLabel?: boolean }
                ): React.ReactNode =>
                  renderOverlayOpenFlattenedFieldsShared(field, overlayOpenAction, placementOverride, options);
                const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.subKey || '';
                const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
                const overlayOpenActionRowsFiltered =
                  overlayOpenAction && overlayOpenAction.rowFilter
                    ? overlayOpenActionRowsAll.filter((r: any) =>
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
                        ? rowsAll.filter((r: any) =>
                            matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter)
                          )
                        : rowsAll;
                    if (!rowsToRemove.length) return;
                    const cascade = cascadeRemoveLineItemRows({
                      lineItems: prevLineItems,
                      roots: rowsToRemove.map((r: any) => ({ groupId: groupKey, rowId: r.id }))
                    });
                    let nextLineItems = cascade.lineItems;
                    if (hasResetValue) {
                      const groupRows = nextLineItems[q.id] || [];
                      if (groupRows.length) {
                        nextLineItems = {
                          ...nextLineItems,
                          [q.id]: groupRows.map((r: any) => (r.id === row.id ? { ...r, values: { ...r.values, [field.id]: resetValue } } : r))
                        };
                      }
                    }
                    if (cascade.removedSubgroupKeys.length) {
                      setSubgroupSelectors((prevSel: Record<string, string>) => {
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
                    nonMatchWarningNode={nonMatchWarningNode}
                    buttonLabel={overlayOpenButtonText(displayValue)}
                    onOpen={handleOverlayOpenAction}
                    openDisabled={overlayOpenDisabled}
                    showResetButton={overlayOpenAction?.hideTrashIcon !== true}
                    onReset={handleOverlayOpenActionReset}
                    resetDisabled={overlayOpenActionResetDisabled}
                    baseStyle={overlayActionButtonBaseStyle}
                    flattenPlacement={normalizeOverlayFlattenPlacement(overlayOpenAction?.flattenPlacement)}
                    renderFlattenedFields={(placement, options) => renderOverlayOpenFlattenedFields(placement, options)}
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
                const showNonMatchWarning =
                  useDescriptiveNonMatchWarnings &&
                  !!rowNonMatchWarning &&
                  typeof (field as any)?.optionFilter?.matchMode === 'string' &&
                  (field as any).optionFilter.matchMode === 'or';
                const nonMatchWarningNode = showNonMatchWarning ? <div className="warning">{rowNonMatchWarning}</div> : null;

                const overlayOpenTargets = overlayOpenActionTargetsForField(field);
                const triggeredSubgroupIds = (() => {
                  if (rowCollapsed) return [] as string[];
                  if (!subIds.length) return [] as string[];
                  const effects = Array.isArray((field as any).selectionEffects) ? ((field as any).selectionEffects as any[]) : [];
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
                const subgroupOpenStack =
                  triggeredSubgroupIds.length && !fieldIsStacked
                    ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: field.id, variant: 'stack' })
                    : null;
                const subgroupOpenInline =
                  triggeredSubgroupIds.length && fieldIsStacked
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
                    nonMatchWarningNode={nonMatchWarningNode}
                    display={display}
                    subgroupOpenInline={subgroupOpenInline}
                    subgroupOpenStack={subgroupOpenStack}
                    stackedInlinePlacement="afterValue"
                  />
                );

                switch (field.type) {
                  case 'CHOICE': {
                    const rawVal = row.values[field.id];
                    const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
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
                            onChange: (next: any) => handleLineFieldChange(q, row.id, field, next)
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
                        {nonMatchWarningNode}
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
                          className={`field inline-field ck-consent-field${(field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
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
                          {nonMatchWarningNode}
                        </div>
                      );
                    }
                    const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                    const renderAsMultiSelect = controlOverride === 'select';
                    if (renderAsMultiSelect) {
                      const selectedStr = selected.length ? selected.join(', ') : '';
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
                          <div className="ck-control-row">
                            <select
                              multiple
                              value={selected}
                              disabled={isLineFieldInputDisabled(field)}
                              onChange={e => {
                                if (isLineFieldInputDisabled(field)) return;
                                const next = Array.from(e.target.selectedOptions).map(o => o.value);
                                handleLineFieldChange(q, row.id, field, next);
                              }}
                            >
                              {optsField.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {selectedStr ? <span className="muted">{selectedStr}</span> : null}
                          </div>
                          {renderOverlayOpenInlineButton(display)}
                          {subgroupOpenStack}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                          {nonMatchWarningNode}
                        </div>
                      );
                    }
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
                        <div className="inline-options">
                          {optsField.map(opt => (
                            <label key={opt.value} className="inline">
                              <input
                                type="checkbox"
                                checked={selected.includes(opt.value)}
                                disabled={isLineFieldInputDisabled(field)}
                                onChange={e => {
                                  if (isLineFieldInputDisabled(field)) return;
                                  const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                                  handleLineFieldChange(q, row.id, field, next);
                                }}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        {renderOverlayOpenInlineButton(display)}
                        {subgroupOpenStack}
                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                        {renderWarnings(fieldPath)}
                        {nonMatchWarningNode}
                      </div>
                    );
                  }
                  case 'FILE_UPLOAD':
                    return (
                      <LineFileUploadListQuestion
                        key={field.id}
                        group={q}
                        rowId={row.id}
                        field={field}
                        fieldPath={fieldPath}
                        value={row.values[field.id] as FieldValue | undefined}
                        language={language}
                        submitting={submitting}
                        renderAsLabel={renderAsLabel}
                        forceStackedLabel={forceStackedLabel}
                        labelStyle={labelStyle}
                        errors={errors}
                        hasWarning={hasWarning}
                        renderWarnings={renderWarnings}
                        renderReadOnlyLine={renderReadOnlyLine}
                        checkFileUploadOrderedEntry={isFileUploadOrderedEntryBlocked}
                        handleFileInputChange={handleLineFileInputChange}
                        removeFile={removeLineFile}
                        clearFiles={clearLineFiles}
                        fileInputsRef={fileInputsRef}
                        uploadAnnouncements={uploadAnnouncements}
                        renderUploadFailure={renderUploadFailure}
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
                    const displayText =
                      displayValue === undefined || displayValue === null ? '' : displayValue.toString();
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
                          forceStackedLabel ? ' ck-label-stacked' : ''
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
                              setErrors((prev: Record<string, string>) => {
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
              const isGuidedInlineRow = guidedCollapsedFieldsInHeader && isProgressive;
              return (
                <div
                  key={row.id}
                  className={`line-item-row${rowLocked ? ' ck-row-disabled' : ''}${useEdgeToEdgeRowChrome ? ' ck-line-item-row--edge' : ''}`}
                  data-row-anchor={`${q.id}__${row.id}`}
                  data-anchor-field-id={anchorFieldId || undefined}
                  data-anchor-has-value={anchorHasValue ? 'true' : undefined}
                  data-row-disabled={rowLocked ? 'true' : undefined}
                  style={{
                    ...(useEdgeToEdgeRowChrome || isGuidedInlineRow
                      ? {
                          background: 'transparent',
                          padding: '12px 0',
                          borderRadius: 0,
                          border: 'none',
                          borderBottom: isLastEdgeToEdgeRow ? 'none' : '1px solid var(--border)',
                          marginBottom: 0
                        }
                      : {
                          background: 'transparent',
                          padding: 12,
                          borderRadius: 10,
                          border: rowLocked ? '2px dashed var(--border)' : '1px solid var(--border)',
                          marginBottom: 10
                        }),
                    opacity: rowLocked ? 0.86 : 1,
                    outline: rowHasError && !useEdgeToEdgeRowChrome ? '2px solid var(--danger)' : undefined,
                    outlineOffset: rowHasError && !useEdgeToEdgeRowChrome ? 2 : undefined
                  }}
                >
                  {showRowHeader ? (
                    <div className="ck-row-header">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {/* Row numbering intentionally hidden in all UI modes (requested by product). */}
                        {!renderGuidedCompactSummaryOnly && showTitleControlInHeader && titleField ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {(() => {
                              ensureLineOptions(q.id, titleField);
                              const errorKey = `${q.id}__${titleField.id}__${row.id}`;
                              const hideLabel = true;
                              const labelStyle = hideLabel ? srOnly : undefined;
                              // The title field (rendered in the row header) historically showed disabled controls.
                              // For consistency with edit rendering elsewhere, treat readOnly/renderAsLabel as "show plain text".
                              const titleAsLabel =
                                titleLocked ||
                                (titleField as any)?.ui?.renderAsLabel === true ||
                                (titleField as any)?.renderAsLabel === true ||
                                (titleField as any)?.readOnly === true;
                              const overlayOpenTargets = overlayOpenActionTargetsForField(titleField);
                              const triggeredSubgroupIds = (() => {
                                if (rowCollapsed) return [] as string[];
                                if (!subIds.length) return [] as string[];
                                const effects = Array.isArray((titleField as any).selectionEffects)
                                  ? ((titleField as any).selectionEffects as any[])
                                  : [];
                                const hits = effects
                                  .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                                  .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                                const sourceVal = row.values[titleField.id];
                                const hasSourceValue = !isEmptyValue(sourceVal as any);
                                const filtered = hits.filter(subId => {
                                  const subKey = buildSubgroupKey(q.id, row.id, subId);
                                  const subRows = lineItems[subKey] || [];
                                  return (Array.isArray(subRows) && subRows.length > 0) || hasSourceValue;
                                });
                                const deduped = Array.from(new Set(filtered));
                                return overlayOpenTargets.length ? deduped.filter(id => !overlayOpenTargets.includes(id)) : deduped;
                              })();
                              const subgroupOpenStack = triggeredSubgroupIds.length
                                ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: titleField.id })
                                : null;
                              const titleFieldPath = errorKey;
                              const titleOverlayActionSuppressed = ctx.isOverlayOpenActionSuppressed?.(titleFieldPath) === true;
                              const titleOverlayOpenAction = titleOverlayActionSuppressed
                                ? null
                                : resolveOverlayOpenActionForField(titleField, row, overlayActionCtx);
                              if (titleOverlayOpenAction) {
                                return renderLineItemField(titleField, { showLabel: false, forceStackedLabel: true });
                              }

                              if (titleField.type === 'CHOICE') {
                                const optionSetField: OptionSet = resolveOptionSetForField(optionState, titleField, q.id);
                                const dependencyIds = (
                                  Array.isArray(titleField.optionFilter?.dependsOn)
                                    ? titleField.optionFilter?.dependsOn
                                    : [titleField.optionFilter?.dependsOn || '']
                                ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  titleField.optionFilter,
                                  optionSetField,
                                  dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                                );
                                const rawVal = row.values[titleField.id];
                                const choiceVal =
                                  Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                const allowedWithCurrent =
                                  choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                                    ? [...allowedField, choiceVal]
                                    : allowedField;
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(titleField) });
                                const selectedOpt = optsField.find(opt => opt.value === choiceVal);
                                const displayLabel = (selectedOpt?.label || choiceVal || '').toString();
                              return (
                                <div
                                  className={`field inline-field${titleField.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                                  style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                  data-field-path={errorKey}
                                  data-has-error={errors[errorKey] ? 'true' : undefined}
                                  data-has-warning={hasWarning(errorKey) ? 'true' : undefined}
                                >
                                  <label style={labelStyle}>
                                    {resolveFieldLabel(titleField, language, titleField.id)}
                                    {titleField.required && <RequiredStar />}
                                  </label>
                                  <div className="ck-control-row">
                                    {titleAsLabel ? (
                                      <div className="ck-row-title">{displayLabel || '—'}</div>
                                    ) : (
                                      renderChoiceControl({
                                        fieldPath: errorKey,
                                        value: choiceVal || '',
                                        options: optsField,
                                        required: !!titleField.required,
                                        searchEnabled: titleField.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
                                        override: titleField.ui?.control,
                                        disabled: isLineFieldInputDisabled(titleField),
                                        onChange: (next: any) => handleLineFieldChange(q, row.id, titleField, next)
                                      })
                                    )}
                                    {(() => {
                                      const tooltipNode = selectedOpt?.tooltip ? (
                                        <InfoTooltip
                                          text={selectedOpt.tooltip}
                                          label={resolveLocalizedString(
                                            titleField.dataSource?.tooltipLabel,
                                            language,
                                            resolveFieldLabel(titleField, language, titleField.id)
                                          )}
                                          onOpen={openInfoOverlay}
                                        />
                                      ) : null;
                                      if (!tooltipNode) return null;
                                      return <div className="ck-field-actions">{tooltipNode}</div>;
                                    })()}
                                  </div>
                                  {subgroupOpenStack}
                                  {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                  {renderWarnings(errorKey)}
                                </div>
                              );
                            }

                              if (titleField.type === 'CHECKBOX') {
                                const optionSetField: OptionSet = resolveOptionSetForField(optionState, titleField, q.id);
                                const dependencyIds = (
                                  Array.isArray(titleField.optionFilter?.dependsOn)
                                    ? titleField.optionFilter?.dependsOn
                                    : [titleField.optionFilter?.dependsOn || '']
                                ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  titleField.optionFilter,
                                  optionSetField,
                                  dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                                );
                                const selected = Array.isArray(row.values[titleField.id]) ? (row.values[titleField.id] as string[]) : [];
                                const allowedWithSelected = selected.reduce((acc, val) => {
                                  if (val && !acc.includes(val)) acc.push(val);
                                  return acc;
                                }, [...allowedField]);
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(titleField) });
                                return (
                                  <div
                                    className={`field inline-field${titleField.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                                    style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                    data-field-path={errorKey}
                                    data-has-error={errors[errorKey] ? 'true' : undefined}
                                    data-has-warning={hasWarning(errorKey) ? 'true' : undefined}
                                  >
                                    <label style={labelStyle}>
                                      {resolveFieldLabel(titleField, language, titleField.id)}
                                      {titleField.required && <RequiredStar />}
                                    </label>
                                    {titleAsLabel ? (
                                      <div className="ck-control-row">
                                        <div className="ck-row-title">
                                        {optsField
                                          .filter(opt => selected.includes(opt.value))
                                          .map(opt => opt.label)
                                          .filter(Boolean)
                                          .join(', ') ||
                                          selected.join(', ') ||
                                          '—'}
                                        </div>
                                      </div>
                                    ) : (
                                    <div className="inline-options">
                                      {optsField.map(opt => (
                                        <label key={opt.value} className="inline">
                                          <input
                                            type="checkbox"
                                            checked={selected.includes(opt.value)}
                                            disabled={titleLocked || (titleField as any)?.readOnly === true}
                                            onChange={e => {
                                              if (titleLocked || (titleField as any)?.readOnly === true) return;
                                              const next = e.target.checked
                                                ? [...selected, opt.value]
                                                : selected.filter(v => v !== opt.value);
                                              handleLineFieldChange(q, row.id, titleField, next);
                                            }}
                                          />
                                          <span>{opt.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                    )}
                                    {subgroupOpenStack}
                                    {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                    {renderWarnings(errorKey)}
                                  </div>
                                );
                              }

                              const mapped = titleField.valueMap
                                ? resolveValueMapValue(titleField.valueMap, fid => {
                                    if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                    return values[fid];
                                  }, { language, targetOptions: toOptionSet(titleField) })
                                : undefined;
                              const fieldValueRaw = titleField.valueMap ? mapped : ((row.values[titleField.id] as any) ?? '');
                              const fieldValue = titleField.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                              const display = fieldValue === undefined || fieldValue === null ? '' : fieldValue.toString();
                              return (
                                <div
                                  className={`field inline-field${titleField.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                                  style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                  data-field-path={errorKey}
                                  data-has-error={errors[errorKey] ? 'true' : undefined}
                                  data-has-warning={hasWarning(errorKey) ? 'true' : undefined}
                                >
                                  <label style={labelStyle}>
                                    {resolveFieldLabel(titleField, language, titleField.id)}
                                    {titleField.required && <RequiredStar />}
                                  </label>
                                  {titleAsLabel ? (
                                    <div className="ck-control-row">
                                      <div className="ck-row-title">{display || '—'}</div>
                                    </div>
                                  ) : (
                                  <input
                                    type={
                                      titleField.type === 'NUMBER'
                                        ? 'number'
                                        : titleField.type === 'DATE'
                                        ? 'date'
                                        : 'text'
                                    }
                                    value={fieldValue}
                                    onChange={e => handleLineFieldChange(q, row.id, titleField, e.target.value)}
                                    readOnly={!!titleField.valueMap || titleLocked}
                                    disabled={titleLocked}
                                  />
                                  )}
                                  {subgroupOpenStack}
                                  {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                  {renderWarnings(errorKey)}
                                </div>
                              );
                            })()}
                            </div>
                          </div>
                        ) : null}
                        {explicitRowHeaderSummaryText ? (
                          <div style={{ marginBottom: rowDisclaimerText ? 6 : 0 }}>
                            <div
                              className="ck-row-title"
                              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {explicitRowHeaderSummaryText}
                            </div>
                          </div>
                        ) : null}
                        {!explicitRowHeaderSummaryText && !guidedCollapsedFieldsInHeader && compactHeaderSummaryText ? (
                          <div style={{ marginBottom: rowDisclaimerText ? 6 : 0 }}>
                            <div
                              className="ck-row-title"
                              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {compactHeaderSummaryText}
                            </div>
                          </div>
                        ) : null}
                        {!explicitRowHeaderSummaryText && guidedCompactHeaderSummaryText ? (
                          <div style={{ marginBottom: rowDisclaimerText ? 6 : 0 }}>
                            <div
                              className="ck-row-title"
                              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {guidedCompactHeaderSummaryText}
                            </div>
                          </div>
                        ) : null}
                        {guidedCollapsedFieldsInHeader && !renderGuidedCompactSummaryOnly && showAnchorTitleAsHeaderTitle ? (
                          <div style={{ marginBottom: 8 }}>
                            <div className="ck-row-title">{anchorTitleLabel || '—'}</div>
                          </div>
                        ) : null}
                        {guidedCollapsedFieldsInHeader && !renderGuidedCompactSummaryOnly && headerFieldsToRender.length ? (
                          <div
                            className="ck-row-header-collapsed-fields"
                            style={{
                              marginTop: showTitleControlInHeader ? 8 : 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12
                            }}
                          >
                            {buildGuidedHeaderRows(headerFieldsToRender).map((row, idx) => {
                              const renderHeaderField = (f: any, opts?: { inGrid?: boolean }) => {
                                  const fid = (f?.id ?? '').toString();
                                  const showLabel = collapsedLabelMap[fid] !== false;
                                const forceAsLabel = guidedCollapsedFieldsInHeader && lockAnchor && fid === anchorFieldId;
                                const fToRender = forceAsLabel
                                  ? ({ ...(f as any), ui: { ...((f as any).ui || {}), renderAsLabel: true } } as any)
                                  : f;
                                return renderLineItemField(fToRender, {
                                  showLabel,
                                  forceStackedLabel: showLabel,
                                  inGrid: opts?.inGrid === true
                                });
                              };

                              const inGrid = row.length > 1;
                              if (row.length > 1) {
                                const hasDate = row.some((f: any) => (f?.type || '').toString() === 'DATE');
                                const colsClass = row.length === 3 ? ' ck-pair-grid--3' : '';
                                return (
                                  <PairedRowGrid
                                    key={`${collapseKey}-header-${idx}`}
                                    className={`ck-pair-grid ck-row-header-collapsed-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}
                                  >
                                    {row.map((f: any) => renderHeaderField(f, { inGrid }))}
                              </PairedRowGrid>
                                );
                              }

                              return (
                                <div key={`${collapseKey}-header-${idx}`} className="ck-full-width">
                                  {row.map((f: any) => renderHeaderField(f, { inGrid }))}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {!guidedCollapsedFieldsInHeader && rowCollapsed && !canExpand ? (
                          <div
                            className="muted"
                            style={{ fontSize: 'var(--ck-font-control)', fontWeight: 600, color: rowHasError ? 'var(--danger)' : undefined }}
                          >
                            {rowHasError ? `${tSystem('lineItems.needsAttention', language, 'Needs attention')} · ` : ''}
                            {tSystem(
                              'lineItems.lockedUntilComplete',
                              language,
                              'Locked until complete · Fill the collapsed fields to unlock expand.'
                            )}
                          </div>
                        ) : null}
                      </div>
                      {canRemoveRow || rowTogglePill ? (
                        <div className={`ck-row-header-actions${useEdgeToEdgeRowChrome ? ' ck-row-header-actions--edge' : ''}`}>
                          {rowTogglePill}
                          {canRemoveRow ? <LineItemRemoveButton language={language} onRemove={() => removeLineRow(q.id, row.id)} /> : null}
                        </div>
                      ) : null}
                      {!guidedCollapsedFieldsInHeader && rowDisclaimerText ? (
                        <div className="ck-row-disclaimer ck-row-disclaimer--full">{rowDisclaimerText}</div>
                      ) : null}
                    </div>
                  ) : null}
                  {!isProgressive && showAnchorTitleAsBodyTitle ? (
                    <div style={{ marginBottom: rowDisclaimerText ? 6 : 10 }}>
                      <div className="ck-row-title">{anchorTitleLabel || '—'}</div>
                    </div>
                  ) : null}
                  {!isProgressive && rowDisclaimerText ? (
                    <div className="ck-row-disclaimer" style={{ marginBottom: 10 }}>
                      {rowDisclaimerText}
                    </div>
                  ) : null}
                  <LineItemBodyFieldsSection
                    bodyFieldsToRender={bodyFieldsToRender}
                    guidedCollapsedFieldsInHeader={guidedCollapsedFieldsInHeader}
                    guidedCompactHeaderSummaryFieldIdSet={guidedCompactHeaderSummaryFieldIdSet}
                    collapsedGroups={collapsedGroups}
                    toggleGroupCollapsed={toggleGroupCollapsed}
                    q={q}
                    row={row}
                    values={values}
                    lineItems={lineItems}
                    optionState={optionState}
                    language={language}
                    groupCtx={groupCtx}
                    errors={errors}
                    submitting={submitting}
                    isProgressive={isProgressive}
                    rowCollapsed={rowCollapsed}
                    rowLocked={rowLocked}
                    collapsedLabelMap={collapsedLabelMap}
                    subIds={subIds}
                    subIdToLabel={subIdToLabel}
                    definition={definition}
                    latestValuesRef={latestValuesRef}
                    fileInputsRef={fileInputsRef}
                    uploadAnnouncements={uploadAnnouncements}
                    groupChoiceSearchDefault={groupChoiceSearchDefault}
                    overlayActionCtx={overlayActionCtx}
                    ctx={ctx}
                    setValues={setValues}
                    setLineItems={setLineItems}
                    setErrors={setErrors}
                    setSubgroupSelectors={setSubgroupSelectors}
                    ensureLineOptions={ensureLineOptions}
                    renderChoiceControl={renderChoiceControl}
                    resolveOverlayOpenActionForField={resolveOverlayOpenActionForField}
                    overlayOpenActionTargetsForField={overlayOpenActionTargetsForField}
                    renderOverlayOpenFlattenedFieldsShared={renderOverlayOpenFlattenedFieldsShared}
                    renderSubgroupOpenStack={renderSubgroupOpenStack}
                    renderWarnings={renderWarnings}
                    hasWarning={hasWarning}
                    isLineFieldInputDisabled={isLineFieldInputDisabled}
                    isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
                    isFileUploadOrderedEntryBlocked={isFileUploadOrderedEntryBlocked}
                    openLineItemGroupOverlay={openLineItemGroupOverlay}
                    openSubgroupOverlay={openSubgroupOverlay}
                    openInfoOverlay={openInfoOverlay}
                    openFileOverlay={openFileOverlay}
                    handleLineFieldChange={handleLineFieldChange}
                    handleLineFileInputChange={handleLineFileInputChange}
                    renderUploadFailure={renderUploadFailure}
                    onDiagnostic={onDiagnostic}
                  />
                  {guidedCollapsedFieldsInHeader && isProgressive && rowDisclaimerText ? (
                    <div className="ck-row-disclaimer" style={{ marginTop: 10 }}>
                      {rowDisclaimerText}
                    </div>
                  ) : null}
                  {!rowCollapsed && fallbackSubIds.length ? (
                    <div style={{ marginTop: 10 }}>{renderSubgroupOpenStack(fallbackSubIds)}</div>
                  ) : null}
                  <div
                    className="line-actions"
                    style={
                      isProgressive
                        ? { justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
                        : undefined
                    }
                  >
                    {!isProgressive && canRemoveRow ? (
                      <LineItemRemoveButton language={language} onRemove={() => removeLineRow(q.id, row.id)} />
                    ) : null}
                  </div>
                  {useEdgeToEdgeRowChrome && !isLastEdgeToEdgeRow ? (
                    <div
                      className="ck-line-item-row-separator"
                      aria-hidden="true"
                      style={{
                        width: '100%',
                        marginTop: 12,
                        height: 1,
                        background: 'var(--border)',
                        borderBottom: '1px solid var(--border)'
                      }}
                    />
                  ) : null}
                  <SourceFirstInlineDataSourceRows
                    activeStepDataSourceRows={activeStepDataSourceRows}
                    row={row}
                    rowCollapsed={rowCollapsed}
                    hideInlineSubgroups={hideInlineSubgroups}
                    language={language}
                    lineItems={lineItems}
                    stepDataSourceDrafts={stepDataSourceDrafts}
                    resolveTopValue={resolveTopValue}
                    resolveStepDataSourceRowsForParent={resolveStepDataSourceRowsForParent}
                    resolveDataSourceOutputGroup={resolveDataSourceOutputGroup}
                    buildStepDataSourceDraftKey={buildStepDataSourceDraftKey}
                    buildVirtualDataSourceRowValues={buildVirtualDataSourceRowValues}
                    resolveVirtualRowWhenContext={resolveVirtualRowWhenContext}
                    validateVirtualFieldRules={validateVirtualFieldRules}
                    isLineFieldInputDisabled={isLineFieldInputDisabled}
                    allowsVirtualIntegerOnly={allowsVirtualIntegerOnly}
                    resolveVirtualMaxFieldId={resolveVirtualMaxFieldId}
                    toFiniteNumber={toFiniteNumber}
                    seedUtilisationCommittedValues={seedUtilisationCommittedValues}
                    queueDeferredStepUtilisationSync={queueDeferredStepUtilisationSync}
                    hasPendingDeferredUtilisationChange={hasPendingDeferredUtilisationChange}
                    cancelDeferredStepUtilisationSync={cancelDeferredStepUtilisationSync}
                    syncStepDataSourceOutputRowWithUtilisation={syncStepDataSourceOutputRowWithUtilisation}
                    setLineItems={setLineItems}
                    openInfoOverlay={openInfoOverlay}
                    openLineItemGroupOverlay={openLineItemGroupOverlay}
                  />
                  <LineItemInlineSubgroupsRenderer
                    q={q}
                    row={row as any}
                    parentUi={ui}
                    hideInlineSubgroups={hideInlineSubgroups}
                    isProgressive={isProgressive}
                    rowCollapsed={rowCollapsed}
                    values={values}
                    lineItems={lineItems}
                    collapsedSubgroups={collapsedSubgroups}
                    subgroupSelectors={subgroupSelectors}
                    optionState={optionState}
                    language={language}
                    errors={errors}
                    submitting={submitting}
                    collapsedGroups={collapsedGroups}
                    fileInputsRef={fileInputsRef}
                    uploadAnnouncements={uploadAnnouncements}
                    latestSubgroupSelectorValueRef={latestSubgroupSelectorValueRef}
                    selectorSearchLoggedRef={selectorSearchLoggedRef}
                    selectorOverlayLoggedRef={selectorOverlayLoggedRef}
                    subgroupBottomRefs={subgroupBottomRefs}
                    buildOptionSetForLineField={buildOptionSetForLineField}
                    ensureLineOptions={ensureLineOptions}
                    renderChoiceControl={renderChoiceControl}
                    handleLineFieldChange={handleLineFieldChange}
                    handleLineFileInputChange={handleLineFileInputChange}
                    isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
                    isLineFieldInputDisabled={isLineFieldInputDisabled}
                    isFileUploadOrderedEntryBlocked={isFileUploadOrderedEntryBlocked}
                    hasWarning={hasWarning}
                    renderWarnings={renderWarnings}
                    renderUploadFailure={renderUploadFailure}
                    openInfoOverlay={openInfoOverlay}
                    openFileOverlay={openFileOverlay}
                    openSubgroupOverlay={openSubgroupOverlay}
                    setLineItems={setLineItems}
                    setOptionState={setOptionState}
                    setOverlay={setOverlay}
                    setCollapsedSubgroups={setCollapsedSubgroups}
                    setSubgroupSelectors={setSubgroupSelectors}
                    addLineItemRowManual={addLineItemRowManual}
                    removeLineRow={removeLineRow}
                    setErrors={setErrors}
                    toggleGroupCollapsed={toggleGroupCollapsed}
                    onDiagnostic={onDiagnostic}
                  />
                </div>
              );
            })}</>;
};
