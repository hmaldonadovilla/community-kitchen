import React from 'react';
import { createPortal } from 'react-dom';
import {
  buildLocalizedOptions,
  computeAllowedOptions,
  computeTotals,
  getOptionStateValue,
  loadOptionsFromDataSource,
  mergeOptionStateValue,
  optionKey,
  shouldHideField,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, OptionSet, RowFlowConfig, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { LineItemFieldConfig, LineItemGroupConfigOverride, LineItemOverlaySessionConfig, OverlayCloseConfirmLike } from '../../../../../types';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { DateInput } from '../../../components/form/DateInput';
import { GroupedPairedFields } from '../../../components/form/GroupedPairedFields';
import { InfoTooltip } from '../../../components/form/InfoTooltip';
import { LineItemGroupQuestion } from '../../../components/form/LineItemGroupQuestion';
import { LineItemMultiAddSelect } from '../../../components/form/LineItemMultiAddSelect';
import { LineItemTable } from '../../../components/form/LineItemTable';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { SearchableSelect } from '../../../components/form/SearchableSelect';
import { HtmlPreview } from '../../../components/app/HtmlPreview';
import { buildSelectorOptionSet, resolveSelectorHelperText, resolveSelectorLabel, resolveSelectorPlaceholder } from '../../../components/form/lineItemSelectors';
import {
  buttonStyles,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  RequiredStar,
  srOnly,
  TrashIcon,
  withDisabled
} from '../../../components/form/ui';
import {
  clearLineItemGroupErrors,
  formatOptionFilterNonMatchWarning,
  isUploadValueComplete,
  resolveLineItemTableReadOnlyDisplay,
  resolveRowDisclaimerText,
  toDateInputValue
} from '../../../components/form/utils';
import { applyValueMapsToForm, resolveValueMapValue } from '../../../components/form/valueMaps';
import { resolveFieldLabel, resolveLabel } from '../../../utils/labels';
import { isEmptyValue } from '../../../utils/values';
import { isPrimaryActionLabel } from '../../../app/buttonTone';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import { applyLineItemRowSort } from '../../../app/lineItemRowSort';
import {
  buildSubgroupKey,
  isLineItemMaxRowsReached,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  parseSubgroupKey,
  resolveLineItemRowLimits,
  resolveSubgroupKey,
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY
} from '../../../app/lineItems';
import { matchesWhenClause } from '../../../../rules/visibility';
import { LineFileUploadQuestion } from '../../uploads/components/LineFileUploadQuestion';
import { LineFileUploadTableOpenControl } from '../../uploads/components/LineFileUploadTableOpenControl';
import { resolveAddOverlayCopy } from '../domain/addOverlayCopy';
import { hasLineItemDedupErrorInScope } from '../domain/lineItemDedupErrors';
import { resolveTableColumnWidthStyle } from '../domain/tableColumnWidths';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';
import type { LineOverlayState } from '../../../components/form/overlays/LineSelectOverlay';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

interface SubgroupOverlayPortalState {
  open: boolean;
  subKey?: string;
  label?: string;
  contextHeader?: string;
  helperText?: string;
  overlaySession?: LineItemOverlaySessionConfig;
  rowFlow?: RowFlowConfig;
  source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  closeConfirm?: OverlayCloseConfirmLike;
  groupOverride?: LineItemGroupConfigOverride;
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  hideInlineSubgroups?: boolean;
}

interface OverlayDetailSelectionState {
  groupId: string;
  rowId: string;
  mode: 'view' | 'edit';
}

interface SubgroupOverlayPortalProps {
  subgroupOverlay: SubgroupOverlayPortalState;
  resolveSubgroupDefs: (subKey: string) => any;
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  valuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  submitting: boolean;
  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  subgroupSelectors: Record<string, string>;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  latestSubgroupSelectorValueRef: React.MutableRefObject<Record<string, string>>;
  overlayDetailSelection: OverlayDetailSelectionState | null;
  setOverlayDetailSelection: React.Dispatch<React.SetStateAction<OverlayDetailSelectionState | null>>;
  overlayDetailEditSnapshotRef: React.MutableRefObject<{ key: string; values: Record<string, FieldValue>; lineItems: LineItemState } | null>;
  overlayDetailHtml: string;
  overlayDetailHtmlError: string;
  overlayDetailHtmlLoading: boolean;
  attemptCloseSubgroupOverlay: (source: 'button' | 'escape') => void;
  closeSubgroupOverlay: () => void;
  attemptSaveOverlayDetailEdit: (args: {
    detailGroupDef: WebQuestionDefinition;
    errorGroupKey: string;
    groupId: string;
    rowId: string;
    detailKey: string;
    canView: boolean;
  }) => boolean;
  handleSubgroupOverlaySessionCancel: () => void;
  handleSubgroupOverlaySessionSave: () => void;
  isFieldLockedByDedup: (fieldId: string) => boolean;
  addLineItemRowManual: (groupId: string, preset?: Record<string, FieldValue>, options?: any) => any;
  removeLineRow: (groupId: string, rowId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onStatusClear?: () => void;
  onUserEdit?: (args: {
    scope: 'top' | 'line';
    fieldPath: string;
    fieldId?: string;
    groupId?: string;
    rowId?: string;
    event?: 'change' | 'blur';
    tag?: string;
    inputType?: string;
    nextValue?: FieldValue;
  }) => { deferMutation?: boolean; skipSelectionEffects?: boolean } | void;
  guidedLastUserEditAtRef: React.MutableRefObject<number>;
  ensureLineOptions: (groupId: string, field: any) => void;
  optionSortFor: (field: { optionSort?: any } | undefined) => 'alphabetical' | 'source';
  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;
  buildLineItemGroupQuestionContext: (overrides?: Record<string, any>) => any;
  getTopValueNoScan: (fieldId: string) => FieldValue;
  resolveTopValueNoScan: (values: Record<string, FieldValue>, fieldId: string) => FieldValue;
  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (key: string) => void;
  renderChoiceControl: (args: any) => React.ReactNode;
  openFileOverlay: (args: any) => void;
  openInfoOverlay: (...args: any[]) => void;
  handleLineFieldChange: (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  handleLineFileInputChange: (args: any) => void;
  checkLineFileUploadOrderedEntry: (args: any) => boolean;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  renderUploadFailure: (fieldPath: string) => React.ReactNode;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  resolveRequiredValue: (field: any, value: FieldValue) => FieldValue;
  resolveVisibilityValue: (fieldId: string) => FieldValue;
}

export const SubgroupOverlayPortal: React.FC<SubgroupOverlayPortalProps> = ({
  subgroupOverlay,
  resolveSubgroupDefs,
  definition,
  language,
  values,
  setValues,
  valuesRef,
  lineItems,
  setLineItems,
  lineItemsRef,
  optionState,
  setOptionState,
  submitting,
  errors,
  setErrors,
  subgroupSelectors,
  setSubgroupSelectors,
  latestSubgroupSelectorValueRef,
  overlayDetailSelection,
  setOverlayDetailSelection,
  overlayDetailEditSnapshotRef,
  overlayDetailHtml,
  overlayDetailHtmlError,
  overlayDetailHtmlLoading,
  attemptCloseSubgroupOverlay,
  closeSubgroupOverlay,
  attemptSaveOverlayDetailEdit,
  handleSubgroupOverlaySessionCancel,
  handleSubgroupOverlaySessionSave,
  isFieldLockedByDedup,
  addLineItemRowManual,
  removeLineRow,
  onDiagnostic,
  onStatusClear,
  onUserEdit,
  guidedLastUserEditAtRef,
  ensureLineOptions,
  optionSortFor,
  setOverlay,
  buildLineItemGroupQuestionContext,
  getTopValueNoScan,
  resolveTopValueNoScan,
  collapsedGroups,
  toggleGroupCollapsed,
  renderChoiceControl,
  openFileOverlay,
  openInfoOverlay,
  handleLineFieldChange,
  handleLineFileInputChange,
  checkLineFileUploadOrderedEntry,
  fileInputsRef,
  uploadAnnouncements,
  renderUploadFailure,
  hasWarning,
  renderWarnings,
  resolveRequiredValue,
  resolveVisibilityValue
}) => {
  return (() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return null;
    if (typeof document === 'undefined') return null;

    const subKey = subgroupOverlay.subKey;
    const overlayRowFilter = subgroupOverlay.rowFilter || null;
    const overlayHideInlineSubgroups = subgroupOverlay.hideInlineSubgroups === true;
    const overlayRowFlow = subgroupOverlay.rowFlow;
    const subgroupDefs = resolveSubgroupDefs(subKey);
    const parsed = subgroupDefs.info;
    const parentGroup = subgroupDefs.root;
    const parentRows = parsed ? lineItems[parsed.parentGroupKey] || [] : [];
    const parentRow = parsed ? parentRows.find(r => r.id === parsed.parentRowId) : undefined;
    const parentRowValues: Record<string, FieldValue> = parentRow?.values || {};
    const ancestorValues: Record<string, FieldValue> = (() => {
      const merged: Record<string, FieldValue> = { ...parentRowValues };
      const mergeMissing = (source?: Record<string, FieldValue>) => {
        if (!source) return;
        Object.entries(source).forEach(([key, val]) => {
          if (Object.prototype.hasOwnProperty.call(merged, key)) return;
          merged[key] = val;
        });
      };
      let currentKey = parsed?.parentGroupKey || '';
      let info = currentKey ? parseSubgroupKey(currentKey) : null;
      while (info) {
        const currentInfo = info;
        const parentRows = lineItems[currentInfo.parentGroupKey] || [];
        const row = parentRows.find(r => r.id === currentInfo.parentRowId);
        mergeMissing((row?.values || {}) as Record<string, FieldValue>);
        currentKey = currentInfo.parentGroupKey;
        info = currentKey ? parseSubgroupKey(currentKey) : null;
      }
      return merged;
    })();

    const subConfigBase = subgroupDefs.sub;
    const subConfig = subConfigBase ? applyLineItemGroupOverride(subConfigBase, subgroupOverlay.groupOverride) : subConfigBase;
    const subAddRowOptions = { configOverride: subConfig, rowFilter: overlayRowFilter };
    const subUi = (subConfig as any)?.ui as any;
    const subUiMode = (subUi?.mode || 'default').toString().trim().toLowerCase();
    const subHideLabel = subUi?.hideLabel === true;
    const subAddButtonPlacement = (
      (subgroupOverlay.groupOverride as any)?.ui?.addButtonPlacement ||
      subUi?.addButtonPlacement ||
      'both'
    )
      .toString()
      .trim()
      .toLowerCase();
    const isSubTableMode = subUiMode === 'table';
    const subAnchorFieldId =
      subConfig?.anchorFieldId !== undefined && subConfig?.anchorFieldId !== null ? subConfig.anchorFieldId.toString() : '';
    const subHideUntilAnchor = subUi?.tableHideUntilAnchor !== false;
    const subLabel = parsed
      ? resolveLocalizedString(subConfig?.label, language, parsed.subGroupId)
      : resolveLocalizedString({ en: 'Subgroup', fr: 'Sous-groupe', nl: 'Subgroep' }, language, 'Subgroup');
    const overlayHeaderLabel = subgroupOverlay.label ? subgroupOverlay.label.toString().trim() : '';
    const overlayContextHeader = subgroupOverlay.contextHeader ? subgroupOverlay.contextHeader.toString().trim() : '';
    const overlayHelperText = subgroupOverlay.helperText ? subgroupOverlay.helperText.toString().trim() : '';
    const overlayHideCloseButton = subgroupOverlay.hideCloseButton === true;
    const overlayCloseButtonLabel =
      subgroupOverlay.closeButtonLabel || tSystem('common.close', language, 'Close');
    const overlaySessionEnabled = subgroupOverlay.overlaySession?.enabled === true;
    const overlaySessionSaveLabel = resolveLocalizedString(
      subgroupOverlay.overlaySession?.saveLabel,
      language,
      tSystem('common.saveChanges', language, 'Save changes')
    );
    const overlaySessionCancelLabel = resolveLocalizedString(
      subgroupOverlay.overlaySession?.cancelLabel,
      language,
      tSystem('common.cancel', language, 'Cancel')
    );
    const overlaySessionFillAvailableHeight = subgroupOverlay.overlaySession?.fillAvailableHeight === true;
    const dedupOverlayActionsDisabled = hasLineItemDedupErrorInScope({
      errors,
      groupKey: subKey,
      groupConfig: subConfig,
      language
    });
    const overlaySessionBulkSelectionFieldId = (
      subgroupOverlay.overlaySession?.bulkSelection?.fieldId || ''
    )
      .toString()
      .trim();
    const parentLabel = parentGroup ? resolveLabel(parentGroup, language) : (parsed?.rootGroupId || 'Group');
    const _breadcrumbText = [parentLabel, subLabel].filter(Boolean).join(' / ');

    const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>): boolean => {
      if (!overlayRowFilter) return true;
      const includeWhen = (overlayRowFilter as any)?.includeWhen;
      const excludeWhen = (overlayRowFilter as any)?.excludeWhen;
      const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
      const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
      const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
      return includeOk && !excludeMatch;
    };

    const rowsAll = lineItems[subKey] || [];
    const rows =
      overlayRowFilter && Array.isArray(rowsAll) ? rowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any)) : rowsAll;
    const overlaySessionBulkSelectionField = overlaySessionBulkSelectionFieldId
      ? ((subConfig?.fields || []) as LineItemFieldConfig[]).find(field => field.id === overlaySessionBulkSelectionFieldId)
      : undefined;
    const overlaySessionBulkSelectionEnabled =
      overlaySessionEnabled &&
      !!overlaySessionBulkSelectionField &&
      overlaySessionBulkSelectionField.type === 'CHECKBOX' &&
      rows.length > 0;
    const overlaySessionAllRowsSelected =
      overlaySessionBulkSelectionEnabled &&
      rows.every(row => Boolean(((row as any)?.values || {})[overlaySessionBulkSelectionFieldId]));
    const overlaySessionBulkSelectionLabel = overlaySessionAllRowsSelected
      ? tSystem('common.deselectAll', language, 'Deselect all')
      : tSystem('common.selectAll', language, 'Select all');
    const orderedRows = applyLineItemRowSort({
      rows,
      fields: subConfig?.fields || [],
      config: subUi?.rowSort
    });
    const { maxRows: subMaxRows } = resolveLineItemRowLimits(subConfig as any);
    const subLimitCount = overlayRowFilter ? rows.length : rowsAll.length;
    const subMaxRowsReached = isLineItemMaxRowsReached(subLimitCount, subMaxRows);
    const subRemainingSlots =
      subMaxRows !== undefined && subMaxRows !== null ? Math.max(0, subMaxRows - subLimitCount) : undefined;

    const totalsCfg = subConfig ? { ...subConfig, fields: subConfig.fields || [] } : undefined;
    const totals = totalsCfg ? computeTotals({ config: totalsCfg as any, rows: orderedRows }, language) : [];

    const overlayDetail = subUi?.overlayDetail as any;
    const overlayDetailEnabled = !!overlayDetail?.enabled && !!overlayDetail?.body?.subGroupId;
    const overlayDetailBodyPath = overlayDetail?.body?.subGroupId
      ? overlayDetail.body.subGroupId.toString().split('.').map((seg: string) => seg.trim()).filter(Boolean)
      : [];
    const overlayDetailSubId = overlayDetailBodyPath[0] || '';
    const overlayDetailSubConfig = overlayDetailSubId
      ? (subConfig?.subGroups || []).find((sub: any) => resolveSubgroupKey(sub as any) === overlayDetailSubId)
      : undefined;
    const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
    const overlayDetailEditMode = (overlayDetail?.body?.edit?.mode || 'table').toString().trim().toLowerCase();
    const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
    const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
    const overlayDetailSelectionForGroup =
      overlayDetailSelection && overlayDetailSelection.groupId === subKey ? overlayDetailSelection : null;
    const overlayDetailViewLabel = resolveLocalizedString(overlayDetail?.rowActions?.viewLabel, language, 'View');
    const overlayDetailEditLabel = resolveLocalizedString(overlayDetail?.rowActions?.editLabel, language, 'Edit');
    const overlayDetailViewPlacement = (overlayDetail?.rowActions?.viewPlacement || 'header').toString().trim().toLowerCase();
    const overlayDetailEditPlacement = (overlayDetail?.rowActions?.editPlacement || 'header').toString().trim().toLowerCase();
    const showOverlayDetailViewInHeader =
      overlayDetailCanView && overlayDetailViewPlacement !== 'hidden' && overlayDetailViewPlacement !== 'body';
    const showOverlayDetailEditInHeader = overlayDetailEditPlacement !== 'hidden' && overlayDetailEditPlacement !== 'body';
    const overlayDetailHeaderExplicit = Array.isArray(overlayDetail?.header?.tableColumns);
    const overlayDetailHeaderColumns = (() => {
      if (!overlayDetailEnabled || !subConfig) return [];
      const raw = overlayDetailHeaderExplicit ? overlayDetail.header.tableColumns : [];
      const fallback = Array.isArray((subUi as any)?.tableColumns) ? (subUi as any).tableColumns : [];
      const ids = raw
        .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
        .filter(Boolean);
      if (overlayDetailHeaderExplicit && !ids.length) return [];
      const fallbackIds = fallback
        .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
        .filter(Boolean);
      const fields = (subConfig.fields || []) as LineItemFieldConfig[];
      const finalIds = ids.length ? ids : fallbackIds.length ? fallbackIds : fields.map(f => f.id);
      return finalIds.map((id: string) => fields.find((f: LineItemFieldConfig) => f.id === id)).filter(Boolean);
    })();
    const overlayDetailHeaderHidden = overlayDetailHeaderExplicit && overlayDetail.header.tableColumns.length === 0;
    const overlayDetailHeaderWidths = overlayDetail?.header?.tableColumnWidths || (subUi as any)?.tableColumnWidths;

    const subSelectorCfg = subConfig?.sectionSelector;
                    const subSelectorValue = subgroupSelectors[subKey] || '';
                    latestSubgroupSelectorValueRef.current[subKey] = subSelectorValue || '';
                    const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
    const subSelectorDepIds = (
      Array.isArray(subSelectorCfg?.optionFilter?.dependsOn)
        ? subSelectorCfg?.optionFilter?.dependsOn
        : subSelectorCfg?.optionFilter?.dependsOn
          ? [subSelectorCfg.optionFilter.dependsOn]
          : []
    ).filter((depId: unknown): depId is string => typeof depId === 'string' && !!depId);
                    const subSelectorDepVals = subSelectorCfg?.optionFilter
      ? subSelectorDepIds.map((depId: string) =>
                          toDependencyValue(depId === subSelectorCfg.id ? subSelectorValue : (ancestorValues as any)[depId] ?? (values as any)[depId])
                        )
                      : [];
                    const subSelectorAllowed = subSelectorCfg?.optionFilter && subSelectorOptionSet
                      ? computeAllowedOptions(subSelectorCfg.optionFilter, subSelectorOptionSet, subSelectorDepVals)
                      : null;
                    const subSelectorAllowedWithCurrent =
                      subSelectorAllowed !== null &&
                      subSelectorValue &&
                      typeof subSelectorValue === 'string' &&
                      !subSelectorAllowed.includes(subSelectorValue)
                        ? [...subSelectorAllowed, subSelectorValue]
                        : subSelectorAllowed;
                    const subSelectorOptions = subSelectorOptionSet
                      ? buildLocalizedOptions(
                          subSelectorOptionSet,
                          subSelectorAllowedWithCurrent !== null ? subSelectorAllowedWithCurrent : (subSelectorOptionSet.en || []),
                          language
                        )
                      : [];
    const subAddModeRaw = (subConfig as any)?.addMode;
    const subAddMode = subAddModeRaw ? subAddModeRaw.toString().trim().toLowerCase() : 'inline';
    const isSubOverlayAddMode = subAddMode === 'overlay';
    const isSubSelectorOverlayMode = subAddMode === 'selectoroverlay' || subAddMode === 'selector-overlay';
    const subSelectorOverlayAnchorFieldId =
      (subConfig as any)?.anchorFieldId !== undefined && (subConfig as any)?.anchorFieldId !== null
        ? (subConfig as any).anchorFieldId.toString()
        : '';
    const subSelectorOverlayAnchorField = subSelectorOverlayAnchorFieldId
      ? (subConfig?.fields || []).find((f: LineItemFieldConfig) => f.id === subSelectorOverlayAnchorFieldId)
      : undefined;
    const canUseSubSelectorOverlay =
      isSubSelectorOverlayMode && !!subSelectorOverlayAnchorField && subSelectorOverlayAnchorField.type === 'CHOICE';
    const subSelectorIsMissing = !canUseSubSelectorOverlay && !!subSelectorCfg?.required && !(subSelectorValue || '').toString().trim();
    const subSelectorOverlayOptions = (() => {
      if (!canUseSubSelectorOverlay || !subSelectorOverlayAnchorField) return [];
      ensureLineOptions(subKey, subSelectorOverlayAnchorField);
      const optionSetField = resolveOptionSetForField(optionState, subSelectorOverlayAnchorField, subKey);
      const dependencyIds = (
        Array.isArray(subSelectorOverlayAnchorField.optionFilter?.dependsOn)
          ? subSelectorOverlayAnchorField.optionFilter?.dependsOn
          : [subSelectorOverlayAnchorField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const depVals = dependencyIds.map((dep: string) =>
        toDependencyValue(ancestorValues[dep] ?? values[dep] ?? subSelectorValue)
      );
      let allowed = computeAllowedOptions(subSelectorOverlayAnchorField.optionFilter, optionSetField, depVals);
      if (subSelectorCfg?.optionFilter) {
        const selectorAllowed = computeAllowedOptions(subSelectorCfg.optionFilter, optionSetField, subSelectorDepVals);
        if (selectorAllowed.length) {
          const selectorAllowedSet = new Set(selectorAllowed);
          allowed = allowed.filter(val => selectorAllowedSet.has(val));
        }
      }
      const localized = buildLocalizedOptions(optionSetField, allowed, language, { sort: optionSortFor(subSelectorOverlayAnchorField) });
      const seen = new Set<string>();
      return localized
        .map(opt => ({ value: opt.value, label: opt.label, searchText: opt.searchText }))
        .filter(opt => {
          const key = (opt.value || '').toString();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    })();

    const renderAddButton = () => {
      if (subAddButtonPlacement === 'hidden') return null;
      if (!subConfig) {
        return (
          <button
            type="button"
            className="ck-list-row-action-btn"
            onClick={() => {
              if (subMaxRowsReached) return;
              addLineItemRowManual(subKey, undefined, subAddRowOptions);
            }}
            style={withListRowActionButtonStyle(subMaxRowsReached, undefined, buttonStyles.secondary)}
            disabled={subMaxRowsReached}
          >
            <PlusIcon />
            Add line
          </button>
        );
      }
      if (isSubOverlayAddMode && subConfig.anchorFieldId) {
        const addLinesLabel = resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines');
        const addLinesPrimary = isPrimaryActionLabel(addLinesLabel);
                        return (
	                          <button
	                            type="button"
	                            className="ck-list-row-action-btn"
	            style={withListRowActionButtonStyle(
                submitting || subSelectorIsMissing || subMaxRowsReached,
                undefined,
                addLinesPrimary ? buttonStyles.primary : buttonStyles.secondary
              )}
	            disabled={submitting || subSelectorIsMissing || subMaxRowsReached}
	                            onClick={async () => {
              if (subMaxRowsReached) {
                onDiagnostic?.('subgroup.overlay.add.blocked', {
                  groupId: subKey,
                  reason: 'maxRows',
                  maxRows: subMaxRows ?? null,
                  currentCount: subLimitCount
                });
                return;
              }
              const selectorNow = (latestSubgroupSelectorValueRef.current[subKey] || subSelectorValue || '').toString().trim();
              const anchorField = (subConfig.fields || []).find((f: LineItemFieldConfig) => f.id === subConfig.anchorFieldId);
                              if (!anchorField || anchorField.type !== 'CHOICE') {
                addLineItemRowManual(subKey, undefined, subAddRowOptions);
                                return;
                              }
                              const key = optionKey(anchorField.id, subKey);
                              let opts = optionState[key];
                              if (!opts && anchorField.dataSource) {
                                const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                                if (loaded) {
                                  opts = loaded;
                                  setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, subKey, loaded));
                                }
                              }
                              if (!opts) opts = resolveOptionSetForField(optionState, anchorField, subKey);
                              const dependencyIds = (
                                Array.isArray(anchorField.optionFilter?.dependsOn)
                                  ? anchorField.optionFilter?.dependsOn
                                  : [anchorField.optionFilter?.dependsOn || '']
                              ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
              const depVals = dependencyIds.map((dep: string) => toDependencyValue(ancestorValues[dep] ?? values[dep] ?? selectorNow));
                              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                              const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                              const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                              const addOverlayCopy = resolveAddOverlayCopy(subConfig, language);
                              if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.searchHelperText || addOverlayCopy.placeholder) {
                                onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                                  groupId: subKey,
                                  scope: 'subgroup',
                                  hasTitle: !!addOverlayCopy.title,
                                  hasHelperText: !!addOverlayCopy.helperText,
                                  hasSearchHelperText: !!addOverlayCopy.searchHelperText,
                                  hasPlaceholder: !!addOverlayCopy.placeholder
                                });
                              }
                              setOverlay({
                                open: true,
                                options: localized
                                  .filter(opt => deduped.includes(opt.value))
                                  .map(opt => ({ value: opt.value, label: opt.label })),
                                groupId: subKey,
                                anchorFieldId: anchorField.id,
                                selected: [],
                                title: addOverlayCopy.title,
                                helperText: addOverlayCopy.helperText,
                                searchHelperText: addOverlayCopy.searchHelperText,
                                placeholder: addOverlayCopy.placeholder
                              });
                            }}
                          >
            <PlusIcon />
            {addLinesLabel}
                          </button>
                        );
                      }
      if (canUseSubSelectorOverlay) {
        return null;
      }
      const addLineLabel = resolveLocalizedString(subConfig.addButtonLabel, language, 'Add line');
      const addLinePrimary = isPrimaryActionLabel(addLineLabel);
                      return (
	        <button
	          type="button"
          className="ck-list-row-action-btn"
	          disabled={subSelectorIsMissing || subMaxRowsReached}
	          onClick={() => {
            if (subMaxRowsReached) {
              onDiagnostic?.('subgroup.overlay.add.blocked', {
                groupId: subKey,
                reason: 'maxRows',
                maxRows: subMaxRows ?? null,
                  currentCount: subLimitCount
              });
              return;
            }
            const selectorNow = (latestSubgroupSelectorValueRef.current[subKey] || subSelectorValue || '').toString().trim();
            const anchorFieldId =
              subConfig?.anchorFieldId !== undefined && subConfig?.anchorFieldId !== null ? subConfig.anchorFieldId.toString() : '';
            const selectorId = subSelectorCfg?.id !== undefined && subSelectorCfg?.id !== null ? subSelectorCfg.id.toString() : '';
            const preset: Record<string, any> = {};
            if (selectorNow) {
              if (selectorId) preset[selectorId] = selectorNow;
              if (anchorFieldId) preset[anchorFieldId] = selectorNow;
            }
            addLineItemRowManual(subKey, Object.keys(preset).length ? preset : undefined, subAddRowOptions);
          }}
	          style={withListRowActionButtonStyle(
              subSelectorIsMissing || subMaxRowsReached,
              undefined,
              addLinePrimary ? buttonStyles.primary : buttonStyles.secondary
            )}
	        >
          <PlusIcon />
          {addLineLabel}
                        </button>
                      );
                    };

    const handleSubgroupOverlaySessionBulkSelectionToggle = () => {
      if (!overlaySessionBulkSelectionEnabled || !overlaySessionBulkSelectionField) return;
      if (submitting || overlaySessionBulkSelectionField.readOnly === true) return;
      const nextValue = !overlaySessionAllRowsSelected;
      const currentLineItems = lineItemsRef.current || {};
      const currentValues = valuesRef.current;
      const visibleRowIds = new Set(rows.map(row => row.id));
      const existingRows = currentLineItems[subKey] || [];
      const nextRows = existingRows.map(row =>
        visibleRowIds.has(row.id)
          ? {
              ...row,
              values: {
                ...((row as any)?.values || {}),
                [overlaySessionBulkSelectionField.id]: nextValue
              }
            }
          : row
      );
      const nextLineItems = { ...currentLineItems, [subKey]: nextRows };
      const synced = applyValueMapsToForm(definition, currentValues, nextLineItems, { mode: 'change' });
      guidedLastUserEditAtRef.current = Date.now();
      onUserEdit?.({
        scope: 'line',
        fieldPath: `${subKey}__${overlaySessionBulkSelectionField.id}__*`,
        fieldId: overlaySessionBulkSelectionField.id,
        groupId: subKey,
        rowId: '*',
        event: 'change',
        nextValue
      });
      if (onStatusClear) onStatusClear();
      setLineItems(synced.lineItems);
      setValues(synced.values);
      lineItemsRef.current = synced.lineItems;
      valuesRef.current = synced.values;
      setErrors(prev => {
        const next = { ...prev };
        rows.forEach(row => {
          delete next[`${subKey}__${overlaySessionBulkSelectionField.id}__${row.id}`];
        });
        return next;
      });
      onDiagnostic?.('subgroup.overlay.session.bulkSelection.toggle', {
        groupId: subKey,
        fieldId: overlaySessionBulkSelectionField.id,
        rowCount: rows.length,
        nextValue
      });
    };

    const subGroupDef: WebQuestionDefinition | null =
      parentGroup && subConfig
        ? ({
            ...(parentGroup as any),
            id: subKey,
            ui: { ...(((parentGroup as any)?.ui || {}) as any), hideLabel: true },
            lineItemConfig: { ...(subConfig as any), fields: subConfig.fields || [], subGroups: subConfig.subGroups || [] }
          } as WebQuestionDefinition)
        : null;

    return createPortal(
      <div
        className="webform-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--card)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: 'none'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
	              {!overlayHideCloseButton ? (
	                <button
	                  type="button"
	                  onClick={() => attemptCloseSubgroupOverlay('button')}
	                  disabled={dedupOverlayActionsDisabled}
	                  style={withDisabled(buttonStyles.primary, dedupOverlayActionsDisabled)}
	                >
	                  {overlayCloseButtonLabel}
	                </button>
	              ) : null}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'flex-start',
                width: '100%'
              }}
            >
              <div style={{ flex: '1 1 280px', minWidth: 0, padding: '0 8px', overflowWrap: 'anywhere' }}>
                {!subHideLabel && overlayHeaderLabel ? (
                  <div style={{ fontWeight: 600, marginBottom: overlayContextHeader || overlayHelperText ? 6 : 0 }}>
                    {overlayHeaderLabel}
                  </div>
                ) : null}
                {overlayContextHeader ? <div style={{ whiteSpace: 'pre-line' }}>{overlayContextHeader}</div> : null}
                {overlayHelperText ? (
                  <div className="muted" style={{ marginTop: overlayContextHeader ? 6 : 0, whiteSpace: 'pre-line' }}>
                    {overlayHelperText}
                  </div>
                ) : null}
                <div style={srOnly}>{subLabel}</div>
              </div>
              {overlaySessionBulkSelectionEnabled ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '0 8px' }}>
                  <button
                    type="button"
                    style={buttonStyles.secondary}
                    disabled={submitting || overlaySessionBulkSelectionField?.readOnly === true}
                    onClick={handleSubgroupOverlaySessionBulkSelectionToggle}
                  >
                    {overlaySessionBulkSelectionLabel}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', flex: 1, minWidth: 0 }}>
                {subSelectorCfg && (canUseSubSelectorOverlay ? subSelectorOverlayOptions.length : subSelectorOptions.length) ? (
                                <div
                                  className="section-selector"
                                  data-field-path={subSelectorCfg.id}
                                  style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
                                >
                    <label
                      style={
                        Boolean((subSelectorCfg as any)?.hideLabel || (subSelectorCfg as any)?.ui?.hideLabel)
                          ? srOnly
                          : { fontWeight: 500 }
                      }
                    >
                      {resolveSelectorLabel(subSelectorCfg, language)}
                    </label>
                                  {canUseSubSelectorOverlay ? (
                                    <LineItemMultiAddSelect
                                      label={resolveSelectorLabel(subSelectorCfg, language)}
                                      language={language}
                                      options={subSelectorOverlayOptions}
                                      disabled={submitting || subMaxRowsReached}
                                      placeholder={
                                        resolveSelectorPlaceholder(subSelectorCfg, language) ||
                                        tSystem('lineItems.selectLinesSearch', language, 'Search items')
                                      }
                                      helperText={resolveSelectorHelperText(subSelectorCfg, language) || undefined}
                                      emptyText={tSystem('common.noMatches', language, 'No matches.')}
                                      onDiagnostic={(event, payload) =>
                                        onDiagnostic?.(event, { scope: 'subgroup.selectorOverlay', fieldId: subSelectorCfg.id, subKey, ...(payload || {}) })
                                      }
                                      onAddSelected={valuesToAdd => {
                                        if (submitting || subMaxRowsReached) {
                                          if (subMaxRowsReached) {
                                            onDiagnostic?.('subgroup.overlay.add.blocked', {
                                              groupId: subKey,
                                              reason: 'maxRows',
                                              maxRows: subMaxRows ?? null,
                                            currentCount: subLimitCount
                                            });
                                          }
                                          return;
                                        }
                                        if (!subSelectorOverlayAnchorFieldId) return;
                                        const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
                                        if (!deduped.length) return;
                                        const allowed =
                                          subRemainingSlots !== undefined && subRemainingSlots !== null
                                            ? deduped.slice(0, Math.max(0, subRemainingSlots))
                                            : deduped;
                                        if (!allowed.length) {
                                          onDiagnostic?.('subgroup.overlay.add.blocked', {
                                            groupId: subKey,
                                            reason: 'maxRows',
                                            maxRows: subMaxRows ?? null,
                                          currentCount: subLimitCount
                                          });
                                          return;
                                        }
                                        if (allowed.length < deduped.length) {
                                          onDiagnostic?.('subgroup.overlay.add.truncated', {
                                            groupId: subKey,
                                            maxRows: subMaxRows ?? null,
                                            currentCount: subLimitCount,
                                            requested: deduped.length,
                                            applied: allowed.length
                                          });
                                        }
                                        const duplicateValues: string[] = [];
                                        let duplicateMessage = '';
                                        allowed.forEach(val => {
                                          const result = addLineItemRowManual(subKey, { [subSelectorOverlayAnchorFieldId]: val }, subAddRowOptions);
                                          if (result?.status === 'duplicate') {
                                            duplicateValues.push(val);
                                            if (!duplicateMessage && result.message) duplicateMessage = result.message;
                                          }
                                        });
                                        if (duplicateValues.length) {
                                          return { duplicateValues, message: duplicateMessage };
                                        }
                                        return { addedValues: allowed };
                                      }}
                                    />
                                  ) : subSelectorOptions.length >= 20 ? (
                                    <SearchableSelect
                                      value={subSelectorValue || ''}
                                      disabled={submitting}
                                      placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
                                      emptyText={tSystem('common.noMatches', language, 'No matches.')}
                                      options={subSelectorOptions.map(opt => ({
                                        value: opt.value,
                                        label: opt.label,
                                        searchText: opt.searchText
                                      }))}
                                      onChange={nextValue => {
                                        latestSubgroupSelectorValueRef.current[subKey] = nextValue;
                                        setSubgroupSelectors(prev => {
                                          if (prev[subKey] === nextValue) return prev;
                                          return { ...prev, [subKey]: nextValue };
                                        });
                                      }}
                                    />
                                  ) : (
                                    <select
                                      value={subSelectorValue}
                                      onChange={e => {
                                        const nextValue = e.target.value;
                                        latestSubgroupSelectorValueRef.current[subKey] = nextValue;
                                        setSubgroupSelectors(prev => {
                                          if (prev[subKey] === nextValue) return prev;
                                          return { ...prev, [subKey]: nextValue };
                                        });
                                      }}
                                    >
                                      <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
                                      {subSelectorOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                ) : null}
                {!overlayDetailEnabled && !overlayRowFilter ? renderAddButton() : null}
                            </div>
              {totals.length ? (
                <div className="line-item-totals" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {totals.map(t => (
                    <span key={t.key} className="pill">
                      {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                    </span>
                  ))}
                            </div>
              ) : null}
                          </div>
          </fieldset>
                        </div>
        <fieldset
          className={overlaySessionFillAvailableHeight ? 'ck-line-item-overlay-fill-height' : undefined}
          disabled={submitting}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minInlineSize: 0,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
        <div data-overlay-scroll-container="true" style={{ padding: '0 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {!subGroupDef ? (
            <div className="error">
              Unable to load subgroup editor (missing group/subgroup configuration for <code>{subKey}</code>).
            </div>
          ) : overlayRowFlow ? (
            <LineItemGroupQuestion
              key={subGroupDef.id}
              q={
                {
                  ...(subGroupDef as any),
                  ui: {
                    ...(((subGroupDef as any)?.ui || {}) as any),
                    hideLabel: true
                  }
                } as any
              }
              rowFilter={overlayRowFilter}
              hideInlineSubgroups={overlayHideInlineSubgroups}
              hideToolbars
              rowFlow={overlayRowFlow}
              ctx={buildLineItemGroupQuestionContext({
                values: { ...values, ...ancestorValues },
                getTopValue: (fieldId: string) =>
                  (ancestorValues as any)[fieldId] !== undefined ? (ancestorValues as any)[fieldId] : getTopValueNoScan(fieldId),
                submitting: submitting || isFieldLockedByDedup(subKey),
                closeOverlay: closeSubgroupOverlay
              })}
            />
          ) : overlayDetailEnabled ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {overlayDetailHeaderHidden
                  ? null
                  : (() => {
                  const placement = (overlayDetail?.header?.addButtonPlacement || 'top').toString().trim().toLowerCase();
                  const showTop = placement === 'top' || placement === 'both';
                  const showBottom = placement === 'bottom' || placement === 'both';
                  return (
                    <div>
                      {showTop ? <div style={{ marginBottom: 8 }}>{renderAddButton()}</div> : null}
                      <div className="ck-line-item-table__scroll">
                        <LineItemTable
                          columns={[
                            ...((() => {
                              const subColumnWidths = overlayDetailEnabled ? overlayDetailHeaderWidths : subUi?.tableColumnWidths;
                              const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined =>
                                resolveTableColumnWidthStyle(subColumnWidths, columnId);

                              const subColumnIdsRaw = overlayDetailEnabled
                                ? overlayDetailHeaderColumns.map((field: LineItemFieldConfig) => field.id)
                                : Array.isArray(subUi?.tableColumns)
                                  ? subUi.tableColumns
                                  : [];
                              const subColumnIds = subColumnIdsRaw
                                .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
                                .filter(Boolean);
                              const subFields = (subConfig?.fields || []) as LineItemFieldConfig[];
                              const visibleFields = overlayDetailEnabled && overlayDetailHeaderColumns.length
                                ? overlayDetailHeaderColumns
                                : (subColumnIds.length ? subColumnIds : subFields.map(f => f.id))
                                    .map((fid: string) => subFields.find(f => f.id === fid))
                                    .filter(Boolean) as LineItemFieldConfig[];

                              const renderSubTableField = (field: any, subRow: any) => {
                                const groupCtx: VisibilityContext = {
                                  getValue: fid => values[fid],
                                  getLineValue: (_rowId, fid) => subRow.values[fid]
                                };
                                const hideField = shouldHideField(field.visibility, groupCtx, { rowId: subRow.id, linePrefix: subKey });
                                if (hideField) return <span className="muted">—</span>;

                                const anchorValue = subAnchorFieldId ? subRow.values[subAnchorFieldId] : undefined;
                                if (subHideUntilAnchor && subAnchorFieldId && field.id !== subAnchorFieldId && isEmptyValue(anchorValue as any)) {
                                  return <span className="muted">—</span>;
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
                                  dependencyIds.map((dep: string) => {
                                    const selectorFallback = subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                                    return toDependencyValue(subRow.values[dep] ?? ancestorValues[dep] ?? values[dep] ?? selectorFallback);
                                  })
                                );

                                const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                                const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;
                                const renderErrors = () => (
                                  <>
                                    {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                    {renderWarnings(fieldPath)}
                                  </>
                                );
                                const controlAttrs = {
                                  'data-field-path': fieldPath,
                                  'data-has-error': errors[fieldPath] ? 'true' : undefined,
                                  'data-has-warning': hasWarning(fieldPath) ? 'true' : undefined
                                };

                                if (field.type === 'CHOICE') {
                                  const rawVal = subRow.values[field.id];
                                  const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                  const allowedWithCurrent =
                                    choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                                      ? [...allowedField, choiceVal]
                                      : allowedField;
                                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
                                  if (renderAsLabel) {
                                    const selected = optsField.find(opt => opt.value === choiceVal);
                                    return (
                                      <div className="ck-line-item-table__value">
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
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      {renderChoiceControl({
                                        fieldPath,
                                        value: choiceVal || '',
                                        options: optsField,
                                        required: !!field.required,
                                        searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? subUi?.choiceSearchEnabled,
                                        override: (field as any)?.ui?.control,
                                        disabled: submitting || (field as any)?.readOnly === true,
                                        onChange: (next: FieldValue) => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                                  const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                                  const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                  const allowedWithSelected = selected.reduce((acc, val) => {
                                    if (val && !acc.includes(val)) acc.push(val);
                                    return acc;
                                  }, [...allowedField]);
                                  const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                                  if (renderAsLabel) {
                                    const labels = isConsentCheckbox
                                      ? [
                                          subRow.values[field.id]
                                            ? tSystem('common.yes', language, 'Yes')
                                            : tSystem('common.no', language, 'No')
                                        ]
                                      : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
                                    return (
                                      <div className="ck-line-item-table__value">
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
                                      <div className="ck-line-item-table__control ck-line-item-table__control--consent" {...controlAttrs}>
                                        <label className="inline">
                                          <input
                                            type="checkbox"
                                            className="ck-line-item-table__consent-checkbox"
                                            checked={!!subRow.values[field.id]}
                                            aria-label={resolveFieldLabel(field, language, field.id)}
                                            disabled={submitting || (field as any)?.readOnly === true}
                                            onChange={e => {
                                              if (submitting || (field as any)?.readOnly === true) return;
                                              handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked);
                                            }}
                                          />
                                          <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
                                        </label>
                                        {renderErrors()}
                                      </div>
                                    );
                                  }
                                  const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                                  const renderAsMultiSelect = controlOverride === 'select';
                                  return (
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      {renderAsMultiSelect ? (
                                        <select
                                          multiple
                                          value={selected}
                                          disabled={submitting || (field as any)?.readOnly === true}
                                          onChange={e => {
                                            if (submitting || (field as any)?.readOnly === true) return;
                                            const next = Array.from(e.currentTarget.selectedOptions)
                                              .map(opt => opt.value)
                                              .filter(Boolean);
                                            handleLineFieldChange(subGroupDef, subRow.id, field, next);
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
                                                disabled={submitting || (field as any)?.readOnly === true}
                                                onChange={e => {
                                                  if (submitting || (field as any)?.readOnly === true) return;
                                                  const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                                                  handleLineFieldChange(subGroupDef, subRow.id, field, next);
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
                                  return (
                                    <LineFileUploadTableOpenControl
                                      group={subGroupDef}
                                      rowId={subRow.id}
                                      field={field}
                                      fieldPath={fieldPath}
                                      value={subRow.values[field.id] as FieldValue | undefined}
                                      rowValues={(subRow.values || {}) as Record<string, FieldValue>}
                                      language={language}
                                      submitting={submitting}
                                      renderAsLabel={renderAsLabel}
                                      hasError={!!errors[fieldPath]}
                                      hasWarning={hasWarning(fieldPath)}
                                      errorNode={renderErrors()}
                                      openFileOverlay={openFileOverlay}
                                    />
                                  );
                                }

                                const mapped = field.valueMap
                                  ? resolveValueMapValue(
                                      field.valueMap,
                                      fid => {
                                        if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fid)) return subRow.values[fid];
                                        if (Object.prototype.hasOwnProperty.call(ancestorValues || {}, fid)) return ancestorValues[fid];
                                        return values[fid];
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
                                  const display =
                                    field.type === 'NUMBER'
                                      ? numberText
                                      : field.type === 'DATE'
                                        ? fieldValue
                                        : fieldValue;
                                  return (
                                    <div className="ck-line-item-table__value">
                                      {resolveLineItemTableReadOnlyDisplay({
                                        baseValue: display,
                                        field,
                                        rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                        language
                                      })}
                                    </div>
                                  );
                                }
                                if (field.type === 'NUMBER') {
                                  return (
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      <NumberStepper
                                        value={numberText}
                                        disabled={submitting}
                                        readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                        ariaLabel={resolveFieldLabel(field, language, field.id)}
                                        onChange={next => handleLineFieldChange(subGroupDef, subRow.id, field, next)}
                                      />
                                      {renderErrors()}
                                    </div>
                                  );
                                }
                                if (field.type === 'PARAGRAPH') {
                                  return (
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      <textarea
                                        className="ck-paragraph-input"
                                        value={fieldValue}
                                        onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                                        readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                        rows={(field as any)?.ui?.paragraphRows || 3}
                                      />
                                      {renderErrors()}
                                    </div>
                                  );
                                }
                                if (field.type === 'DATE') {
                                  return (
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      <DateInput
                                        value={fieldValue}
                                        language={language}
                                        min={(field as any)?.ui?.minDate}
                                        max={(field as any)?.ui?.maxDate}
                                        correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                                        iosNativeCommitMode="deferWhileFocused"
                                        readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                        ariaLabel={resolveFieldLabel(field, language, field.id)}
                                        onChange={next => handleLineFieldChange(subGroupDef, subRow.id, field, next)}
                                      />
                                      {renderErrors()}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="ck-line-item-table__control" {...controlAttrs}>
                                    <input
                                      type="text"
                                      value={fieldValue}
                                      onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                                      readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                    />
                                    {renderErrors()}
                                  </div>
                                );
                              };

                              return [
                                ...visibleFields.map((field: LineItemFieldConfig) => ({
                                  id: field.id,
                                  label: resolveFieldLabel(field, language, field.id),
                                  style: resolveSubColumnStyle(field.id),
                                  renderCell: (subRow: any) => renderSubTableField(field, subRow)
                                })),
                                ...(overlayDetailEnabled
                                  ? (() => {
	                                      const actionButtonStyle: React.CSSProperties = {
	                                        ...buttonStyles.primary,
	                                        padding: 6,
	                                        minHeight: 36,
	                                        minWidth: 36,
	                                        width: '100%'
	                                      };
                                      const actionColumns: Array<any> = [];
                                      if (showOverlayDetailViewInHeader) {
                                        actionColumns.push({
                                          id: '__view',
                                          label: <span style={srOnly}>{overlayDetailViewLabel}</span>,
                                          className: 'ck-line-item-table__actions',
                                          style: resolveSubColumnStyle('__view'),
                                          renderCell: (subRow: any) => (
                                            <button
                                              type="button"
                                              aria-label={overlayDetailViewLabel}
                                              style={actionButtonStyle}
                                              onClick={() => {
                                                setOverlayDetailSelection({ groupId: subKey, rowId: subRow.id, mode: 'view' });
                                                onDiagnostic?.('lineItems.overlayDetail.select', { groupId: subKey, rowId: subRow.id, mode: 'view' });
                                              }}
                                            >
                                              <EyeIcon size={40} />
                                            </button>
                                          )
                                        });
                                      }
                                      if (showOverlayDetailEditInHeader) {
                                        actionColumns.push({
                                          id: '__edit',
                                          label: <span style={srOnly}>{overlayDetailEditLabel}</span>,
                                          className: 'ck-line-item-table__actions',
                                          style: resolveSubColumnStyle('__edit'),
                                          renderCell: (subRow: any) => (
                                            <button
                                              type="button"
                                              aria-label={overlayDetailEditLabel}
                                              style={actionButtonStyle}
                                              onClick={() => {
                                                setOverlayDetailSelection({ groupId: subKey, rowId: subRow.id, mode: 'edit' });
                                                onDiagnostic?.('lineItems.overlayDetail.select', { groupId: subKey, rowId: subRow.id, mode: 'edit' });
                                              }}
                                            >
                                              <PencilIcon size={40} />
                                            </button>
                                          )
                                        });
                                      }
                                      actionColumns.push({
                                        id: '__remove',
                                        label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
                                        className: 'ck-line-item-table__actions',
                                        style: resolveSubColumnStyle('__remove'),
                                        renderCell: (subRow: any) => {
                                          const subRowValues = subRow?.values || {};
                                          const subRowSource = parseRowSource((subRowValues as any)?.[ROW_SOURCE_KEY]);
                                          const hideRemoveButton = parseRowHideRemove((subRowValues as any)?.[ROW_HIDE_REMOVE_KEY]);
                                          const allowRemoveAuto = (subUi as any)?.allowRemoveAutoRows !== false;
                                          const canRemove = !hideRemoveButton && (subRowSource !== 'auto' || allowRemoveAuto);
                                          if (!canRemove) return null;
                                          return (
                                            <button
                                              type="button"
                                              aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                              style={actionButtonStyle}
                                              onClick={() => removeLineRow(subKey, subRow.id)}
                                            >
                                              <TrashIcon size={40} />
                                            </button>
                                          );
                                        }
                                      });
                                      return actionColumns;
                                    })()
                                  : []),
                                ...(overlayDetailEnabled
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
                                          const allowRemoveAutoSubRows = subUi?.allowRemoveAutoRows !== false;
                                          const canRemoveSubRow = !subHideRemoveButton && (allowRemoveAutoSubRows || subRowSource !== 'auto');
                                          if (!canRemoveSubRow) return null;
                                          return (
                                            <button
                                              type="button"
                                              className="ck-line-item-table__remove-button"
                                              onClick={() => removeLineRow(subKey, subRow.id)}
                                              aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                              title={tSystem('lineItems.remove', language, 'Remove')}
                                            >
                                              <TrashIcon size={40} />
                                            </button>
                                          );
                                        }
                                      }
                                    ])
                              ];
                            })())
                          ]}
                          rows={orderedRows}
                          emptyText={'No items yet. Use "Add line(s)" to start.'}
                          rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
                          renderRowMessage={row => {
                            const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
                            const isAutoRow = !!(row as any)?.autoGenerated || parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]) === 'auto';
                            const rowDisclaimerText = resolveRowDisclaimerText({
                              ui: subConfig?.ui as any,
                              language,
                              rowValues,
                              autoGenerated: isAutoRow,
                              getValue: (fid: string) => {
                                if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                                if (Object.prototype.hasOwnProperty.call(ancestorValues || {}, fid)) return (ancestorValues as any)[fid];
                                return resolveVisibilityValue(fid);
                              }
                            });
                            if (!rowDisclaimerText) return null;
                            return <div className="ck-row-disclaimer">{rowDisclaimerText}</div>;
                          }}
                        />
                      </div>
                      {showBottom ? <div style={{ marginTop: 8 }}>{renderAddButton()}</div> : null}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {overlayDetailBodyPath.length > 1 ? (
                  <div>{tSystem('overlay.detail.pathUnsupported', language, 'Nested paths beyond one level are not supported yet.')}</div>
                ) : !overlayDetailSubConfig ? (
                  <div>{tSystem('overlay.detail.subgroupMissing', language, 'Subgroup configuration not found.')}</div>
                ) : !overlayDetailSelectionForGroup ? null : overlayDetailSelectionForGroup.mode === 'view' ? (
                  overlayDetailViewMode !== 'html' ? (
                    <div>{tSystem('overlay.detail.viewModeUnsupported', language, 'View mode is not supported.')}</div>
                  ) : overlayDetailHtmlLoading ? (
                    <div>{tSystem('overlay.detail.loading', language, 'Loading…')}</div>
                  ) : overlayDetailHtmlError ? (
                    <div className="error">{overlayDetailHtmlError}</div>
                  ) : overlayDetailHtml ? (
                    (() => {
                      const hideTabTargets = Array.isArray(overlayDetail?.body?.view?.hideTabTargets)
                        ? overlayDetail.body.view.hideTabTargets
                        : [];
                      const canShowBodyEdit = overlayDetailEditPlacement === 'body';
                      const hasTemplateEditAction = /data-ck-action\s*=\s*["']edit["']/.test(overlayDetailHtml);
                      const showBodyEdit = canShowBodyEdit && !hasTemplateEditAction;
                      const handleAction = (actionId: string) => {
                        if (!overlayDetailSelectionForGroup) return;
                        const nextMode = actionId === 'edit' ? 'edit' : actionId === 'view' ? 'view' : '';
                        if (!nextMode) return;
                        setOverlayDetailSelection({ groupId: subKey, rowId: overlayDetailSelectionForGroup.rowId, mode: nextMode as 'view' | 'edit' });
                        onDiagnostic?.('lineItems.overlayDetail.action', {
                          groupId: subKey,
                          rowId: overlayDetailSelectionForGroup.rowId,
                          actionId,
                          mode: nextMode
                        });
                      };
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {showBodyEdit ? (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
	                              <button
	                                type="button"
	                                style={isPrimaryActionLabel(overlayDetailEditLabel) ? buttonStyles.primary : buttonStyles.secondary}
	                                onClick={() => {
	                                  if (!overlayDetailSelectionForGroup) return;
	                                  setOverlayDetailSelection({ groupId: subKey, rowId: overlayDetailSelectionForGroup.rowId, mode: 'edit' });
	                                  onDiagnostic?.('lineItems.overlayDetail.action', {
                                    groupId: subKey,
                                    rowId: overlayDetailSelectionForGroup.rowId,
                                    actionId: 'edit',
                                    mode: 'edit'
                                  });
                                }}
                              >
                                <PencilIcon size={20} />
                                {overlayDetailEditLabel}
                              </button>
                            </div>
                          ) : null}
                          <HtmlPreview
                            html={overlayDetailHtml}
                            allowScripts
                            onDiagnostic={onDiagnostic}
                            onAction={handleAction}
                            hideTabTargets={hideTabTargets}
                          />
                        </div>
                      );
                    })()
                  ) : (
                    <div>{tSystem('overlay.detail.empty', language, 'No preview available.')}</div>
                  )
                ) : overlayDetailEditMode !== 'table' ? (
                  <div>{tSystem('overlay.detail.editModeUnsupported', language, 'Edit mode is not supported.')}</div>
                ) : (
                  (() => {
                    const detailSubKey =
                      overlayDetailSelectionForGroup && overlayDetailSubId
                        ? buildSubgroupKey(subKey, overlayDetailSelectionForGroup.rowId, overlayDetailSubId)
                        : '';
                    if (!detailSubKey || !overlayDetailSubConfig) return null;
                    const editCfg = overlayDetail?.body?.edit || {};
                    const detailRowValues =
                      overlayDetailSelectionForGroup && overlayDetailSelectionForGroup.rowId
                        ? rows.find(r => r.id === overlayDetailSelectionForGroup.rowId)?.values || {}
                        : {};
                    const detailContextValues = { ...values, ...ancestorValues, ...(detailRowValues as Record<string, FieldValue>) };
                    const detailGroupDef: WebQuestionDefinition = {
                      ...(subGroupDef as any),
                      id: detailSubKey,
                      ui: { ...((subGroupDef as any).ui || {}), hideLabel: true },
                      lineItemConfig: {
                        ...(overlayDetailSubConfig as any),
                        fields: overlayDetailSubConfig.fields || [],
                        subGroups: overlayDetailSubConfig.subGroups || [],
                        ui: {
                          ...((overlayDetailSubConfig as any)?.ui || {}),
                          mode: 'table',
                          tableColumns: Array.isArray(editCfg?.tableColumns) ? editCfg.tableColumns : (overlayDetailSubConfig as any)?.ui?.tableColumns,
                          tableColumnWidths: editCfg?.tableColumnWidths || (overlayDetailSubConfig as any)?.ui?.tableColumnWidths,
                          ...(overlayDetailCanView ? { addButtonPlacement: 'hidden' } : {})
                        }
                      }
                    } as any;
                    const detailRowId = overlayDetailSelectionForGroup?.rowId || '';
                    const detailKey = detailRowId ? `${subKey}::${detailRowId}` : '';
                    const handleDetailSave = () => {
                      if (!detailRowId) return;
                      attemptSaveOverlayDetailEdit({
                        detailGroupDef,
                        errorGroupKey: detailSubKey,
                        groupId: subKey,
                        rowId: detailRowId,
                        detailKey,
                        canView: overlayDetailCanView
                      });
                    };
                    const handleDetailCancel = () => {
                      if (!detailRowId) return;
                      const snapshot = overlayDetailEditSnapshotRef.current;
                      const restored = !!snapshot && snapshot.key === detailKey;
                      if (restored && snapshot) {
                        setValues(snapshot.values);
                        setLineItems(snapshot.lineItems);
                        setErrors(prev => clearLineItemGroupErrors(prev, subKey));
                        if (!overlayDetailCanView) {
                          overlayDetailEditSnapshotRef.current = {
                            key: detailKey,
                            values: snapshot.values,
                            lineItems: snapshot.lineItems
                          };
                        }
                      }
                      if (overlayDetailCanView) {
                        setOverlayDetailSelection({ groupId: subKey, rowId: detailRowId, mode: 'view' });
                      }
                      onDiagnostic?.('lineItems.overlayDetail.edit.cancel', {
                        groupId: subKey,
                        rowId: detailRowId,
                        restored,
                        mode: overlayDetailCanView ? 'view' : 'edit'
                      });
                      if (overlayDetailCanView) {
                        overlayDetailEditSnapshotRef.current = null;
                      }
                    };
                    const detailGroupCfg = (detailGroupDef as any)?.lineItemConfig;
                    const detailAddModeRaw = detailGroupCfg?.addMode !== undefined && detailGroupCfg?.addMode !== null ? detailGroupCfg.addMode.toString() : '';
                    const detailAddMode = detailAddModeRaw.trim().toLowerCase();
                    const detailAnchorFieldId =
                      detailGroupCfg?.anchorFieldId !== undefined && detailGroupCfg?.anchorFieldId !== null
                        ? detailGroupCfg.anchorFieldId.toString()
                        : '';
                    const detailLocked = submitting || isFieldLockedByDedup(parsed?.rootGroupId || subKey);
                    const { maxRows: detailMaxRows } = resolveLineItemRowLimits(detailGroupCfg as any);
                    const detailCurrentCount = (lineItems[detailSubKey] || []).length;
                    const detailMaxRowsReached = isLineItemMaxRowsReached(detailCurrentCount, detailMaxRows);
                    const canShowDetailAddButton = overlayDetailCanView;
                    const openDetailAddOverlay = async () => {
                      if (detailLocked || detailMaxRowsReached) {
                        if (detailMaxRowsReached) {
                          onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                            groupId: detailSubKey,
                            reason: 'maxRows',
                            maxRows: detailMaxRows ?? null,
                            currentCount: detailCurrentCount
                          });
                        }
                        return;
                      }

                      if (detailAddMode === 'overlay' && detailAnchorFieldId) {
                        const anchorField = (detailGroupCfg?.fields || []).find((f: any) => f.id === detailAnchorFieldId);
                        if (!anchorField || anchorField.type !== 'CHOICE') {
                          addLineItemRowManual(detailSubKey, undefined, { configOverride: detailGroupCfg });
                          return;
                        }

                        ensureLineOptions(detailSubKey, anchorField);
                        const key = optionKey(anchorField.id, detailSubKey);
                        let opts = optionState[key];
                        if (!opts && anchorField.dataSource) {
                          const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                          if (loaded) {
                            opts = loaded;
                            setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, detailSubKey, loaded));
                          }
                        }
                        if (!opts) opts = resolveOptionSetForField(optionState, anchorField, detailSubKey);

                        const dependencyIds = (
                          Array.isArray(anchorField.optionFilter?.dependsOn)
                            ? anchorField.optionFilter?.dependsOn
                            : [anchorField.optionFilter?.dependsOn || '']
                        ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                        const depVals = dependencyIds.map((dep: string) =>
                          toDependencyValue((detailContextValues as any)[dep])
                        );
                        const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                        const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                        const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                        const addOverlayCopy = resolveAddOverlayCopy(detailGroupCfg, language);

                        setOverlay({
                          open: true,
                          options: localized
                            .filter(opt => deduped.includes(opt.value))
                            .map(opt => ({ value: opt.value, label: opt.label })),
                          groupId: detailSubKey,
                          anchorFieldId: anchorField.id,
                          selected: [],
                          title: addOverlayCopy.title,
                          helperText: addOverlayCopy.helperText,
                          searchHelperText: addOverlayCopy.searchHelperText,
                          placeholder: addOverlayCopy.placeholder
                        });
                        return;
                      }

                      addLineItemRowManual(detailSubKey, undefined, { configOverride: detailGroupCfg });
                    };
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {canShowDetailAddButton ? (
                            <button
                              type="button"
                              style={withDisabled(buttonStyles.primary, detailLocked || detailMaxRowsReached)}
                              disabled={detailLocked || detailMaxRowsReached}
                              onClick={openDetailAddOverlay}
                            >
                              <PlusIcon />
                              {resolveLocalizedString(
                                detailGroupCfg?.addButtonLabel,
                                language,
                                tSystem('lineItems.addLines', language, 'Add lines')
                              )}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            style={withDisabled(buttonStyles.primary, dedupOverlayActionsDisabled)}
                            disabled={dedupOverlayActionsDisabled}
                            onClick={handleDetailSave}
                          >
                            {tSystem('common.saveChanges', language, 'Save changes')}
                          </button>
                          {!overlayDetailCanView ? (
                            <button type="button" style={buttonStyles.secondary} onClick={handleDetailCancel}>
                              {tSystem('common.cancel', language, 'Cancel')}
                            </button>
                          ) : null}
                        </div>
                        <LineItemGroupQuestion
                          key={detailGroupDef.id}
                          q={detailGroupDef as any}
                          ctx={buildLineItemGroupQuestionContext({
                            values: detailContextValues,
                            getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                            submitting: submitting || isFieldLockedByDedup(parsed?.rootGroupId || subKey)
                          })}
                        />
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          ) : isSubTableMode ? (
            <div
              className="ck-line-item-table__scroll"
              style={(() => {
                const maxVisibleRowsRaw = Number((subUi as any)?.maxVisibleRows);
                if (!Number.isFinite(maxVisibleRowsRaw) || maxVisibleRowsRaw <= 0) return undefined;
                return { maxHeight: `${Math.max(1, Math.floor(maxVisibleRowsRaw)) * 56}px`, overflowY: 'auto' as const };
              })()}
            >
              <LineItemTable
                columns={[
                  ...((() => {
                    const hideRemoveColumn = (subUi as any)?.hideRemoveColumn === true;
                    const subColumnWidths = overlayDetailEnabled ? overlayDetailHeaderWidths : subUi?.tableColumnWidths;
                    const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined =>
                      resolveTableColumnWidthStyle(subColumnWidths, columnId);

                    const subColumnIdsRaw = overlayDetailEnabled
                      ? overlayDetailHeaderColumns.map((field: LineItemFieldConfig) => field.id)
                      : Array.isArray(subUi?.tableColumns)
                        ? subUi.tableColumns
                        : [];
                    const subColumnIds = subColumnIdsRaw
                      .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
                      .filter(Boolean);
                    const subFields = (subConfig?.fields || []) as LineItemFieldConfig[];
                    const visibleFields = overlayDetailEnabled && overlayDetailHeaderColumns.length
                      ? overlayDetailHeaderColumns
                      : (subColumnIds.length ? subColumnIds : subFields.map(f => f.id))
                          .map((fid: string) => subFields.find(f => f.id === fid))
                          .filter(Boolean) as LineItemFieldConfig[];

                    const renderSubTableField = (field: any, subRow: any) => {
                      const groupCtx: VisibilityContext = {
                        getValue: fid => values[fid],
                        getLineValue: (_rowId, fid) => subRow.values[fid]
                      };
                      const hideField = shouldHideField(field.visibility, groupCtx, { rowId: subRow.id, linePrefix: subKey });
                      if (hideField) return <span className="muted">—</span>;

                      const anchorValue = subAnchorFieldId ? subRow.values[subAnchorFieldId] : undefined;
                      if (subHideUntilAnchor && subAnchorFieldId && field.id !== subAnchorFieldId && isEmptyValue(anchorValue as any)) {
                        return <span className="muted">—</span>;
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
                        dependencyIds.map((dep: string) => {
                          const selectorFallback = subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                          return toDependencyValue(subRow.values[dep] ?? ancestorValues[dep] ?? values[dep] ?? selectorFallback);
                        })
                      );

                      const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                      const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;
                      const renderErrors = () => (
                        <>
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </>
                      );
                      const controlAttrs = {
                        'data-field-path': fieldPath,
                        'data-has-error': errors[fieldPath] ? 'true' : undefined,
                        'data-has-warning': hasWarning(fieldPath) ? 'true' : undefined
                      };

                      if (field.type === 'CHOICE') {
                        const rawVal = subRow.values[field.id];
                        const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                        const allowedWithCurrent =
                          choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                            ? [...allowedField, choiceVal]
                            : allowedField;
                        const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
                        if (renderAsLabel) {
                          const selected = optsField.find(opt => opt.value === choiceVal);
                          return (
                            <div className="ck-line-item-table__value">
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
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            {renderChoiceControl({
                              fieldPath,
                              value: choiceVal || '',
                              options: optsField,
                              required: !!field.required,
                              searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? subUi?.choiceSearchEnabled,
                              override: (field as any)?.ui?.control,
                              disabled: submitting || (field as any)?.readOnly === true,
                              onChange: (next: FieldValue) => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                        const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                        const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                        const allowedWithSelected = selected.reduce((acc, val) => {
                          if (val && !acc.includes(val)) acc.push(val);
                          return acc;
                        }, [...allowedField]);
                        const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                        if (renderAsLabel) {
                          const labels = isConsentCheckbox
                            ? [
                                subRow.values[field.id]
                                  ? tSystem('common.yes', language, 'Yes')
                                  : tSystem('common.no', language, 'No')
                              ]
                            : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
                          return (
                            <div className="ck-line-item-table__value">
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
                            <div className="ck-line-item-table__control ck-line-item-table__control--consent" {...controlAttrs}>
                              <label className="inline">
                                <input
                                  type="checkbox"
                                  className="ck-line-item-table__consent-checkbox"
                                  checked={!!subRow.values[field.id]}
                                  aria-label={resolveFieldLabel(field, language, field.id)}
                                  disabled={submitting || (field as any)?.readOnly === true}
                                  onChange={e => {
                                    if (submitting || (field as any)?.readOnly === true) return;
                                    handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked);
                                  }}
                                />
                                <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
                              </label>
                              {renderErrors()}
                            </div>
                          );
                        }
                        const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                        const renderAsMultiSelect = controlOverride === 'select';
                        return (
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            {renderAsMultiSelect ? (
                              <select
                                multiple
                                value={selected}
                                disabled={submitting || (field as any)?.readOnly === true}
                                onChange={e => {
                                  if (submitting || (field as any)?.readOnly === true) return;
                                  const next = Array.from(e.currentTarget.selectedOptions)
                                    .map(opt => opt.value)
                                    .filter(Boolean);
                                  handleLineFieldChange(subGroupDef, subRow.id, field, next);
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
                                      disabled={submitting || (field as any)?.readOnly === true}
                                      onChange={e => {
                                        if (submitting || (field as any)?.readOnly === true) return;
                                        const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                                        handleLineFieldChange(subGroupDef, subRow.id, field, next);
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
                        return (
                          <LineFileUploadTableOpenControl
                            group={subGroupDef}
                            rowId={subRow.id}
                            field={field}
                            fieldPath={fieldPath}
                            value={subRow.values[field.id] as FieldValue | undefined}
                            rowValues={(subRow.values || {}) as Record<string, FieldValue>}
                            language={language}
                            submitting={submitting}
                            renderAsLabel={renderAsLabel}
                            hasError={!!errors[fieldPath]}
                            hasWarning={hasWarning(fieldPath)}
                            errorNode={renderErrors()}
                            openFileOverlay={openFileOverlay}
                          />
                        );
                      }

                      const mapped = field.valueMap
                        ? resolveValueMapValue(
                            field.valueMap,
                            fid => {
                              if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fid)) return subRow.values[fid];
                              if (Object.prototype.hasOwnProperty.call(ancestorValues || {}, fid)) return ancestorValues[fid];
                              return values[fid];
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
                        const display =
                          field.type === 'NUMBER'
                            ? numberText
                            : field.type === 'DATE'
                              ? fieldValue
                              : fieldValue;
                        return (
                          <div className="ck-line-item-table__value">
                            {resolveLineItemTableReadOnlyDisplay({
                              baseValue: display,
                              field,
                              rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                              language
                            })}
                          </div>
                        );
                      }
                      if (field.type === 'NUMBER') {
                        return (
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            <NumberStepper
                              value={numberText}
                              disabled={submitting}
                              readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                              ariaLabel={resolveFieldLabel(field, language, field.id)}
                              onChange={next => handleLineFieldChange(subGroupDef, subRow.id, field, next)}
                            />
                            {renderErrors()}
                          </div>
                        );
                      }
                      if (field.type === 'PARAGRAPH') {
                        return (
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            <textarea
                              className="ck-paragraph-input"
                              value={fieldValue}
                              onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                              readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                              rows={(field as any)?.ui?.paragraphRows || 3}
                            />
                            {renderErrors()}
                          </div>
                        );
                      }
                      if (field.type === 'DATE') {
                        return (
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            <DateInput
                              value={fieldValue}
                              language={language}
                              min={(field as any)?.ui?.minDate}
                              max={(field as any)?.ui?.maxDate}
                              correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                              iosNativeCommitMode="deferWhileFocused"
                              readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                              ariaLabel={resolveFieldLabel(field, language, field.id)}
                              onChange={next => handleLineFieldChange(subGroupDef, subRow.id, field, next)}
                            />
                            {renderErrors()}
                          </div>
                        );
                      }
                      return (
                        <div className="ck-line-item-table__control" {...controlAttrs}>
                          <input
                            type="text"
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                          />
                          {renderErrors()}
                        </div>
                      );
                    };

                    return [
                      ...visibleFields.map((field: LineItemFieldConfig) => ({
                        id: field.id,
                        label: (() => {
                          const labelText = resolveFieldLabel(field, language, field.id);
                          const hideHeaderLabel = Boolean((field as any)?.hideLabel || (field as any)?.ui?.hideLabel);
                          return hideHeaderLabel ? <span style={srOnly}>{labelText}</span> : labelText;
                        })(),
                        style: resolveSubColumnStyle(field.id),
                        renderCell: (subRow: any) => renderSubTableField(field, subRow)
                      })),
                      ...(overlayDetailEnabled
	                        ? (() => {
	                            const actionButtonStyle: React.CSSProperties = {
	                              ...buttonStyles.primary,
	                              padding: 6,
	                              minHeight: 36,
	                              minWidth: 36,
	                              width: '100%'
	                            };
                            const actionColumns: Array<any> = [];
                            if (overlayDetailCanView) {
                              actionColumns.push({
                                id: '__view',
                                label: <span style={srOnly}>{overlayDetailViewLabel}</span>,
                                className: 'ck-line-item-table__actions',
                                style: resolveSubColumnStyle('__view'),
                                renderCell: (subRow: any) => (
                                  <button
                                    type="button"
                                    aria-label={overlayDetailViewLabel}
                                    style={actionButtonStyle}
                                    onClick={() => {
                                      setOverlayDetailSelection({ groupId: subKey, rowId: subRow.id, mode: 'view' });
                                      onDiagnostic?.('lineItems.overlayDetail.select', { groupId: subKey, rowId: subRow.id, mode: 'view' });
                                    }}
                                  >
                                    <EyeIcon size={40} />
                                  </button>
                                )
                              });
                            }
                            actionColumns.push({
                              id: '__edit',
                              label: <span style={srOnly}>{overlayDetailEditLabel}</span>,
                              className: 'ck-line-item-table__actions',
                              style: resolveSubColumnStyle('__edit'),
                              renderCell: (subRow: any) => (
                                <button
                                  type="button"
                                  aria-label={overlayDetailEditLabel}
                                  style={actionButtonStyle}
                                  onClick={() => {
                                    setOverlayDetailSelection({ groupId: subKey, rowId: subRow.id, mode: 'edit' });
                                    onDiagnostic?.('lineItems.overlayDetail.select', { groupId: subKey, rowId: subRow.id, mode: 'edit' });
                                  }}
                                >
                                  <PencilIcon size={40} />
                                </button>
                              )
                            });
                            if (!hideRemoveColumn) {
                              actionColumns.push({
                                id: '__remove',
                                label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
                                className: 'ck-line-item-table__actions',
                                style: resolveSubColumnStyle('__remove'),
                                renderCell: (subRow: any) => {
                                  const subRowValues = subRow?.values || {};
                                  const subRowSource = parseRowSource((subRowValues as any)?.[ROW_SOURCE_KEY]);
                                  const hideRemoveButton = parseRowHideRemove((subRowValues as any)?.[ROW_HIDE_REMOVE_KEY]);
                                  const allowRemoveAuto = (subUi as any)?.allowRemoveAutoRows !== false;
                                  const canRemove = !hideRemoveButton && (subRowSource !== 'auto' || allowRemoveAuto);
                                  if (!canRemove) return null;
                                  return (
                                    <button
                                      type="button"
                                      aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                      style={actionButtonStyle}
                                      onClick={() => removeLineRow(subKey, subRow.id)}
                                    >
                                      <TrashIcon size={40} />
                                    </button>
                                  );
                                }
                              });
                            }
                            return actionColumns;
                          })()
                        : []),
                      ...(overlayDetailEnabled || hideRemoveColumn
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
                                const allowRemoveAutoSubRows = subUi?.allowRemoveAutoRows !== false;
                                const canRemoveSubRow = !subHideRemoveButton && (allowRemoveAutoSubRows || subRowSource !== 'auto');
                                if (!canRemoveSubRow) return null;
                                return (
                                  <button
                                    type="button"
                                    className="ck-line-item-table__remove-button"
                                    onClick={() => removeLineRow(subKey, subRow.id)}
                                    aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                    title={tSystem('lineItems.remove', language, 'Remove')}
                                  >
                                    <TrashIcon size={40} />
                                  </button>
                                );
                              }
                            }
                          ])
                    ];
                  })())
                ]}
                rows={orderedRows}
                emptyText={'No items yet. Use "Add line(s)" to start.'}
                rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
                renderRowMessage={row => {
                  const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
                  const isAutoRow = !!(row as any)?.autoGenerated || parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]) === 'auto';
                  const rowDisclaimerText = resolveRowDisclaimerText({
                    ui: subConfig?.ui as any,
                    language,
                    rowValues,
                    autoGenerated: isAutoRow,
                    getValue: (fid: string) => {
                      if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                      if (Object.prototype.hasOwnProperty.call(ancestorValues || {}, fid)) return (ancestorValues as any)[fid];
                      return resolveVisibilityValue(fid);
                    }
                  });
                  if (!rowDisclaimerText) return null;
                  return <div className="ck-row-disclaimer">{rowDisclaimerText}</div>;
                }}
              />
            </div>
          ) : orderedRows.length ? (
            orderedRows.map(subRow => {
              const isAutoRow =
                !!subRow.autoGenerated || (subRow.values && (subRow.values as any)[ROW_SOURCE_KEY] === 'auto');
              const anchorFieldId = subAnchorFieldId;
              const anchorField = anchorFieldId
                ? (subConfig?.fields || []).find((f: LineItemFieldConfig) => f.id === anchorFieldId)
                : undefined;
              const anchorRawValue = anchorFieldId ? (subRow.values || {})[anchorFieldId] : undefined;
              const anchorHasValue = !!anchorFieldId && !isEmptyValue(anchorRawValue as any);
              const anchorAsTitle =
                !!anchorField && (((anchorField as any)?.readOnly === true) || ((anchorField as any)?.renderAsLabel === true));
              const showAnchorTitle = !!anchorField && anchorHasValue && (isAutoRow || anchorAsTitle);
              const rowDisclaimerText = resolveRowDisclaimerText({
                ui: subConfig?.ui as any,
                language,
                rowValues: (subRow.values || {}) as any,
                autoGenerated: isAutoRow,
                getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
              });
              const rowNonMatchKeys = parseRowNonMatchOptions((subRow.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
              const rowNonMatchWarning = rowNonMatchKeys.length
                ? formatOptionFilterNonMatchWarning({ language, keys: rowNonMatchKeys })
                : '';

              const anchorTitleLabel = (() => {
                if (!showAnchorTitle || !anchorField) return '';
                const rawVal = (subRow.values || {})[anchorField.id];
                if (anchorField.type === 'CHOICE') {
                  ensureLineOptions(subKey, anchorField);
                  const optionSetField: OptionSet = resolveOptionSetForField(optionState, anchorField, subKey);
                  const dependencyIds = (
                    Array.isArray((anchorField as any).optionFilter?.dependsOn)
                      ? (anchorField as any).optionFilter?.dependsOn
                      : [(anchorField as any).optionFilter?.dependsOn || '']
                  ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                  const allowedField = computeAllowedOptions(
                    (anchorField as any).optionFilter,
                    optionSetField,
                    dependencyIds.map((dep: string) => {
                      const selectorFallback = subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                      return toDependencyValue(subRow.values?.[dep] ?? ancestorValues[dep] ?? values[dep] ?? selectorFallback);
                    })
                  );
                  const choiceVal =
                    Array.isArray(rawVal) && rawVal.length ? (rawVal as any[])[0]?.toString?.() : (rawVal as any)?.toString?.();
                  const choiceValStr = (choiceVal || '').toString();
                  const allowedWithCurrent =
                    choiceValStr && !allowedField.includes(choiceValStr) ? [...allowedField, choiceValStr] : allowedField;
                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(anchorField) });
                  const selectedOpt = optsField.find(opt => opt.value === choiceValStr);
                  return (selectedOpt?.label || choiceValStr || '').toString();
                }
                if (Array.isArray(rawVal)) return rawVal.map(v => (v ?? '').toString()).filter(Boolean).join(', ');
                return rawVal === undefined || rawVal === null ? '' : rawVal.toString();
              })();

                          const subCtx: VisibilityContext = {
                            getValue: fid => values[fid],
                            getLineValue: (_rowId, fid) => subRow.values[fid]
                          };
                          return (
                            <div
                              key={subRow.id}
                              className="line-item-row"
                  data-row-anchor={`${subKey}__${subRow.id}`}
                  data-anchor-field-id={anchorFieldId || undefined}
                  data-anchor-has-value={anchorHasValue ? 'true' : undefined}
                              style={{
                    background: 'transparent',
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                marginBottom: 10
                              }}
                            >
                  {showAnchorTitle ? (
                    <div style={{ marginBottom: rowDisclaimerText ? 6 : 10 }}>
                      <div className="ck-row-title">{anchorTitleLabel || '—'}</div>
                    </div>
                  ) : null}
                  {rowDisclaimerText ? (
                    <div className="ck-row-disclaimer" style={{ marginBottom: 10 }}>
                      {rowDisclaimerText}
                    </div>
                  ) : null}
                  {!isAutoRow && !rowDisclaimerText && (
                                <div style={{ marginBottom: 8 }}>
                                  <span className="pill">
                        {resolveLocalizedString({ en: 'Manual', fr: 'Manuel', nl: 'Handmatig' }, language, 'Manual')}
                                  </span>
                                </div>
                              )}
                  {(() => {
                    const renderSubField = (field: any) => {
                      // If we’re showing the anchor as the row title, don’t render the anchor control/label too.
                      if (showAnchorTitle && anchorFieldId && field?.id === anchorFieldId) return null;
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
                                    const selectorFallback =
                                      subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                          return toDependencyValue(subRow.values[dep] ?? ancestorValues[dep] ?? values[dep] ?? selectorFallback);
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
                      const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                                if (hideField) return null;
                      const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                      const forceStackedSubFieldLabel = (field as any)?.ui?.labelLayout === 'stacked';
                      const hideLabel = Boolean((field as any)?.ui?.hideLabel);
                      const labelStyle = hideLabel ? srOnly : undefined;
                      const showNonMatchWarning =
                        !!rowNonMatchWarning && typeof (field as any)?.optionFilter?.matchMode === 'string' && (field as any).optionFilter.matchMode === 'or';
                      const nonMatchWarningNode = showNonMatchWarning ? <div className="warning">{rowNonMatchWarning}</div> : null;

                                switch (field.type) {
                                  case 'CHOICE': {
                                    const rawVal = subRow.values[field.id];
                                    const choiceVal =
                                      Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                    return (
                            <div
                              key={field.id}
                              className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
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
                                searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? (subConfig?.ui as any)?.choiceSearchEnabled,
                                override: (field as any)?.ui?.control,
                                disabled: submitting || (field as any)?.readOnly === true,
                                onChange: (next: FieldValue) => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                                    const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                    if (isConsentCheckbox) {
                                      return (
                                        <div
                                          key={field.id}
                                          className={`field inline-field ck-consent-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
                                          data-field-path={fieldPath}
                                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                                        >
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={!!subRow.values[field.id]}
                                              disabled={submitting || (field as any)?.readOnly === true}
                                              onChange={e => {
                                                if (submitting || (field as any)?.readOnly === true) return;
                                                handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked);
                                              }}
                                            />
                                            <span className="ck-consent-text" style={labelStyle}>
                                              {resolveFieldLabel(field, language, field.id)}
                                              {field.required && <RequiredStar />}
                                            </span>
                                          </label>
                                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                          {renderWarnings(fieldPath)}
                                          {nonMatchWarningNode}
                                        </div>
                                      );
                                    }
                                    return (
                                      <div
                                        key={field.id}
                                        className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
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
                                                disabled={submitting || (field as any)?.readOnly === true}
                                                onChange={e => {
                                                  if (submitting || (field as any)?.readOnly === true) return;
                                                  const next = e.target.checked
                                                    ? [...selected, opt.value]
                                                    : selected.filter(v => v !== opt.value);
                                                  handleLineFieldChange(subGroupDef, subRow.id, field, next);
                                                }}
                                              />
                                              <span>{opt.label}</span>
                                            </label>
                                          ))}
                                        </div>
                                        {(() => {
                                          const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                                          if (!withTooltips.length) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                          const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                                          return (
                                            <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                              {withTooltips.map(opt => (
                                                <span
                                                  key={opt.value}
                                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                >
                                                  {opt.label}{' '}
                                                  <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                                </span>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                        {renderWarnings(fieldPath)}
                                        {nonMatchWarningNode}
                                      </div>
                                    );
                                  }
                        case 'FILE_UPLOAD':
                          return (
                            <LineFileUploadQuestion
                              key={field.id}
                              group={subGroupDef}
                              rowId={subRow.id}
                              field={field}
                              fieldPath={fieldPath}
                              value={subRow.values[field.id] as FieldValue | undefined}
                              language={language}
                              submitting={submitting}
                              forceStackedLabel={forceStackedSubFieldLabel}
                              labelStyle={labelStyle}
                              errors={errors}
                              hasWarning={hasWarning}
                              renderWarnings={renderWarnings}
                              checkFileUploadOrderedEntry={checkLineFileUploadOrderedEntry}
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
                                  if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                  if (ancestorValues.hasOwnProperty(fid)) return ancestorValues[fid];
                                  return values[fid];
                                },
                                { language, targetOptions: toOptionSet(field) }
                              )
                            : undefined;
                          const fieldValueRaw = field.valueMap ? mapped : ((subRow.values[field.id] as any) ?? '');
                          const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                          return (
                            <div
                              key={field.id}
                              className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                forceStackedSubFieldLabel ? ' ck-label-stacked' : ''
                              }${field.type === 'DATE' && !forceStackedSubFieldLabel ? ' ck-date-inline' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                              <label style={labelStyle}>
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                    </label>
                              {field.type === 'DATE' ? (
                                <DateInput
                                  value={fieldValue}
                                  language={language}
                                  min={(field as any)?.ui?.minDate}
                                  max={(field as any)?.ui?.maxDate}
                                  correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                                  iosNativeCommitMode="deferWhileFocused"
                                  readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                  ariaLabel={resolveFieldLabel(field, language, field.id)}
                                  onChange={next => handleLineFieldChange(subGroupDef, subRow.id, field, next)}
                                />
                              ) : (
                              <input
                                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                                  readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                  disabled={submitting || (field as any)?.readOnly === true}
                              />
                              )}
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
          </div>
        );
      }
                      }
                    };

                    const visibleFields = (subConfig?.fields || [])
                      .filter((field: LineItemFieldConfig) => {
                      const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                      return !hideField;
                      })
                      .filter((field: LineItemFieldConfig) => !(showAnchorTitle && anchorFieldId && field.id === anchorFieldId));

                    const contextPrefix = parsed
                      ? `sub:${parsed.rootGroupId}:${parsed.path.join('.') || parsed.subGroupId}`
                      : `sub:${subKey}`;

                    return (
                      <GroupedPairedFields
                        contextPrefix={contextPrefix}
                        fields={visibleFields}
                        language={language}
                        collapsedGroups={collapsedGroups}
                        toggleGroupCollapsed={toggleGroupCollapsed}
                        renderField={renderSubField}
                        hasError={(field: any) => !!errors[`${subKey}__${field.id}__${subRow.id}`]}
                        isComplete={(field: any) => {
                          const mapped = field.valueMap
                            ? resolveValueMapValue(
                                field.valueMap,
                                (fid: string) => {
                                  if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fid)) return subRow.values[fid];
                                  if (Object.prototype.hasOwnProperty.call(ancestorValues || {}, fid)) return ancestorValues[fid];
                                  return values[fid];
                                },
                                { language, targetOptions: toOptionSet(field) }
                              )
                            : undefined;
                          const raw = field.valueMap ? mapped : (subRow.values || {})[field.id];
                          if (field.type === 'FILE_UPLOAD') {
                            return isUploadValueComplete({
                              value: raw as any,
                              uploadConfig: (field as any).uploadConfig,
                              required: !!field.required
                            });
                          }
                          const requiredVal = resolveRequiredValue(field, raw as any);
                          return !isEmptyValue(requiredVal as any);
                        }}
                      />
                    );
                  })()}
                  <div className="line-actions">
                    <button type="button" onClick={() => removeLineRow(subKey, subRow.id)} style={buttonStyles.negative}>
                      {tSystem('lineItems.remove', language, 'Remove')}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="muted">No items yet. Use “Add line(s)” to start.</div>
          )}
          </div>
        </fieldset>
        {overlaySessionEnabled ? (
          <div
            style={{
              padding:
                '12px 40px calc(max(64px, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 28px)) + var(--vv-bottom, 0px))',
              borderTop: '1px solid var(--border)',
              background: 'var(--card)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap'
            }}
          >
            <button type="button" style={buttonStyles.secondary} onClick={handleSubgroupOverlaySessionCancel}>
              {overlaySessionCancelLabel}
            </button>
            <button
              type="button"
              style={withDisabled(buttonStyles.primary, dedupOverlayActionsDisabled)}
              disabled={dedupOverlayActionsDisabled}
              onClick={handleSubgroupOverlaySessionSave}
            >
              {overlaySessionSaveLabel}
            </button>
          </div>
        ) : null}
      </div>,
      document.body
    );
  })();
};
