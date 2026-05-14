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
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemRowState, OptionSet, RowFlowConfig, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { LineItemFieldConfig, LineItemOverlaySessionConfig, OverlayCloseConfirmLike } from '../../../../../types';
import { matchesWhenClause } from '../../../../rules/visibility';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { LineItemGroupQuestion } from '../../../components/form/LineItemGroupQuestion';
import { LineItemMultiAddSelect } from '../../../components/form/LineItemMultiAddSelect';
import { LineItemTable } from '../../../components/form/LineItemTable';
import { SearchableSelect } from '../../../components/form/SearchableSelect';
import { HtmlPreview } from '../../../components/app/HtmlPreview';
import { buildSelectorOptionSet, resolveSelectorHelperText, resolveSelectorLabel, resolveSelectorPlaceholder } from '../../../components/form/lineItemSelectors';
import { clearLineItemGroupErrors, toDateInputValue, toUploadItems } from '../../../components/form/utils';
import { buttonStyles, EyeIcon, PencilIcon, PlusIcon, RequiredStar, srOnly, TrashIcon, withDisabled } from '../../../components/form/ui';
import { resolveFieldLabel, resolveLabel } from '../../../utils/labels';
import { applyValueMapsToForm } from '../../../components/form/valueMaps';
import { isPrimaryActionLabel } from '../../../app/buttonTone';
import {
  buildSubgroupKey,
  isLineItemMaxRowsReached,
  parseRowHideRemove,
  parseRowSource,
  resolveLineItemRowLimits,
  resolveSubgroupKey,
  ROW_HIDE_REMOVE_KEY,
  ROW_SOURCE_KEY
} from '../../../app/lineItems';
import { resolveAddOverlayCopy } from '../domain/addOverlayCopy';
import { hasLineItemDedupErrorInScope } from '../domain/lineItemDedupErrors';
import { resolveTableColumnWidthStyle } from '../domain/tableColumnWidths';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';
import type { LineOverlayState } from '../../../components/form/overlays/LineSelectOverlay';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

interface LineItemGroupOverlayPortalState {
  open: boolean;
  groupId?: string;
  label?: string;
  contextHeader?: string;
  helperText?: string;
  overlaySession?: LineItemOverlaySessionConfig;
  rowFlow?: RowFlowConfig;
  source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  closeConfirm?: OverlayCloseConfirmLike;
  group?: WebQuestionDefinition;
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  hideInlineSubgroups?: boolean;
}

interface OverlayDetailSelectionState {
  groupId: string;
  rowId: string;
  mode: 'view' | 'edit';
}

interface LineItemGroupOverlayPortalProps {
  lineItemGroupOverlay: LineItemGroupOverlayPortalState;
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
  overlayDetailSelection: OverlayDetailSelectionState | null;
  setOverlayDetailSelection: React.Dispatch<React.SetStateAction<OverlayDetailSelectionState | null>>;
  overlayDetailEditSnapshotRef: React.MutableRefObject<{ key: string; values: Record<string, FieldValue>; lineItems: LineItemState } | null>;
  overlayDetailHtml: string;
  overlayDetailHtmlError: string;
  overlayDetailHtmlLoading: boolean;
  attemptCloseLineItemGroupOverlay: (source: 'button' | 'escape') => void;
  attemptSaveOverlayDetailEdit: (args: {
    detailGroupDef: WebQuestionDefinition;
    errorGroupKey: string;
    groupId: string;
    rowId: string;
    detailKey: string;
    canView: boolean;
  }) => boolean;
  handleLineItemGroupOverlaySessionCancel: () => void;
  handleLineItemGroupOverlaySessionSave: () => void;
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
  resolveTopValueNoScan: (values: Record<string, FieldValue>, fieldId: string) => FieldValue;
}

export const LineItemGroupOverlayPortal: React.FC<LineItemGroupOverlayPortalProps> = ({
  lineItemGroupOverlay,
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
  overlayDetailSelection,
  setOverlayDetailSelection,
  overlayDetailEditSnapshotRef,
  overlayDetailHtml,
  overlayDetailHtmlError,
  overlayDetailHtmlLoading,
  attemptCloseLineItemGroupOverlay,
  attemptSaveOverlayDetailEdit,
  handleLineItemGroupOverlaySessionCancel,
  handleLineItemGroupOverlaySessionSave,
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
  resolveTopValueNoScan
}) => {
  return (() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return null;
    if (typeof document === 'undefined') return null;

    const groupId = lineItemGroupOverlay.groupId;
    const overlayRowFilter = lineItemGroupOverlay.rowFilter || null;
    const overlayHideInlineSubgroups = lineItemGroupOverlay.hideInlineSubgroups === true;
    const overrideGroup = lineItemGroupOverlay.group;
    const group =
      overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
        ? overrideGroup
        : definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP');
    if (!group) {
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
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
	            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
	              <div style={{ fontWeight: 600, fontSize: 'var(--ck-font-control)' }}>{tSystem('common.error', language, 'Error')}</div>
	              <button type="button" onClick={() => attemptCloseLineItemGroupOverlay('button')} style={buttonStyles.primary}>
	                {tSystem('common.close', language, 'Close')}
	              </button>
	            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div className="error">
              Unable to load line item group editor (missing group configuration for <code>{groupId}</code>).
            </div>
          </div>
        </div>,
        document.body
      );
    }

    const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>): boolean => {
      if (!overlayRowFilter) return true;
      const includeWhen = (overlayRowFilter as any)?.includeWhen;
      const excludeWhen = (overlayRowFilter as any)?.excludeWhen;
      const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
      const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
      const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
      return includeOk && !excludeMatch;
    };

    const groupCfg = (group as any).lineItemConfig as any;
    const groupAddRowOptions = { configOverride: groupCfg, rowFilter: overlayRowFilter };
    const { maxRows: groupMaxRows } = resolveLineItemRowLimits(groupCfg as any);
    const rowsAll = lineItems[groupId] || [];
    const rows =
      overlayRowFilter && Array.isArray(rowsAll) ? rowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any)) : rowsAll;
    const limitCount = overlayRowFilter ? rows.length : rowsAll.length;
    const maxRowsReached = isLineItemMaxRowsReached(limitCount, groupMaxRows);
    const remainingSlots = groupMaxRows !== undefined && groupMaxRows !== null ? Math.max(0, groupMaxRows - limitCount) : undefined;
    const title = resolveLabel(group, language);
    const overlayHeaderLabel = lineItemGroupOverlay.label ? lineItemGroupOverlay.label.toString().trim() : '';
    const overlayContextHeader = lineItemGroupOverlay.contextHeader ? lineItemGroupOverlay.contextHeader.toString().trim() : '';
    const overlayHelperText = lineItemGroupOverlay.helperText ? lineItemGroupOverlay.helperText.toString().trim() : '';
    const overlayHideCloseButton = lineItemGroupOverlay.hideCloseButton === true;
    const overlayCloseButtonLabel =
      lineItemGroupOverlay.closeButtonLabel || tSystem('common.close', language, 'Close');
    const overlaySessionEnabled = lineItemGroupOverlay.overlaySession?.enabled === true;
    const overlaySessionSaveLabel = resolveLocalizedString(
      lineItemGroupOverlay.overlaySession?.saveLabel,
      language,
      tSystem('common.saveChanges', language, 'Save')
    );
    const overlaySessionCancelLabel = resolveLocalizedString(
      lineItemGroupOverlay.overlaySession?.cancelLabel,
      language,
      tSystem('common.cancel', language, 'Cancel')
    );
    const overlaySessionFillAvailableHeight = lineItemGroupOverlay.overlaySession?.fillAvailableHeight === true;
    const dedupOverlayActionsDisabled = hasLineItemDedupErrorInScope({
      errors,
      groupKey: groupId,
      groupConfig: groupCfg,
      language
    });
    const overlaySessionBulkSelectionFieldId = (
      lineItemGroupOverlay.overlaySession?.bulkSelection?.fieldId || ''
    )
      .toString()
      .trim();
    const overlaySessionBulkSelectionField = overlaySessionBulkSelectionFieldId
      ? ((groupCfg?.fields || []) as LineItemFieldConfig[]).find(field => field.id === overlaySessionBulkSelectionFieldId)
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
    const locked = submitting || isFieldLockedByDedup(groupId);
    const addModeRaw = groupCfg?.addMode;
    const addMode = addModeRaw ? addModeRaw.toString().trim().toLowerCase() : 'inline';
    const isOverlayAddMode = addMode === 'overlay';
    const isSelectorOverlayMode = addMode === 'selectoroverlay' || addMode === 'selector-overlay';
    const selectorOverlayAnchorFieldId =
      groupCfg?.anchorFieldId !== undefined && groupCfg?.anchorFieldId !== null ? groupCfg.anchorFieldId.toString() : '';
    const selectorOverlayAnchorField = selectorOverlayAnchorFieldId
      ? (groupCfg?.fields || []).find((f: any) => f.id === selectorOverlayAnchorFieldId)
      : undefined;
    const canUseSelectorOverlay =
      isSelectorOverlayMode && !!selectorOverlayAnchorField && selectorOverlayAnchorField.type === 'CHOICE';

    const selectorCfg = groupCfg?.sectionSelector;
    const selectorOptionSet = buildSelectorOptionSet(selectorCfg);
    const selectorValue = selectorCfg ? ((values as any)[selectorCfg.id] || '') : '';
    const selectorDepIds: string[] = Array.isArray(selectorCfg?.optionFilter?.dependsOn)
      ? selectorCfg?.optionFilter?.dependsOn
      : selectorCfg?.optionFilter?.dependsOn
        ? [selectorCfg.optionFilter.dependsOn]
        : [];
    const selectorDepVals = selectorCfg?.optionFilter
      ? selectorDepIds.map(depId =>
          toDependencyValue(depId === selectorCfg.id ? selectorValue : (values as any)[depId])
        )
      : [];
    const selectorAllowed = selectorCfg?.optionFilter && selectorOptionSet
      ? computeAllowedOptions(selectorCfg.optionFilter, selectorOptionSet, selectorDepVals)
      : null;
    const selectorAllowedWithCurrent =
      selectorAllowed !== null &&
      selectorValue &&
      typeof selectorValue === 'string' &&
      !selectorAllowed.includes(selectorValue)
        ? [...selectorAllowed, selectorValue]
        : selectorAllowed;
    const selectorOptions = selectorOptionSet
      ? buildLocalizedOptions(
          selectorOptionSet,
          selectorAllowedWithCurrent !== null ? selectorAllowedWithCurrent : (selectorOptionSet.en || []),
          language
        )
      : [];
    const selectorOverlayOptions = (() => {
      if (!canUseSelectorOverlay || !selectorOverlayAnchorField) return [];
      ensureLineOptions(groupId, selectorOverlayAnchorField);
      const optionSetField = resolveOptionSetForField(optionState, selectorOverlayAnchorField, groupId);
      const dependencyIds = (
        Array.isArray(selectorOverlayAnchorField.optionFilter?.dependsOn)
          ? selectorOverlayAnchorField.optionFilter?.dependsOn
          : [selectorOverlayAnchorField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
      const depVals = dependencyIds.map((dep: string) => toDependencyValue((values as any)[dep]));
      let allowed = computeAllowedOptions(selectorOverlayAnchorField.optionFilter, optionSetField, depVals);
      if (selectorCfg?.optionFilter) {
        const selectorAllowed = computeAllowedOptions(selectorCfg.optionFilter, optionSetField, selectorDepVals);
        if (selectorAllowed.length) {
          const selectorAllowedSet = new Set(selectorAllowed);
          allowed = allowed.filter(val => selectorAllowedSet.has(val));
        }
      }
      const localized = buildLocalizedOptions(optionSetField, allowed, language, { sort: optionSortFor(selectorOverlayAnchorField) });
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
    const selectorIsMissing = !canUseSelectorOverlay && !!selectorCfg?.required && !(selectorValue || '').toString().trim();

    const totals = groupCfg ? computeTotals({ config: groupCfg as any, rows }, language) : [];

    const overlayDetail = (groupCfg as any)?.ui?.overlayDetail as any;
    const overlayDetailEnabled = !!overlayDetail?.enabled && !!overlayDetail?.body?.subGroupId;
    const overlayDetailBodyPath = overlayDetail?.body?.subGroupId
      ? overlayDetail.body.subGroupId.toString().split('.').map((seg: string) => seg.trim()).filter(Boolean)
      : [];
    const overlayDetailSubId = overlayDetailBodyPath[0] || '';
    const overlayDetailSubConfig = overlayDetailSubId
      ? (groupCfg?.subGroups || []).find((sub: any) => resolveSubgroupKey(sub as any) === overlayDetailSubId)
      : undefined;
    const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
    const overlayDetailEditMode = (overlayDetail?.body?.edit?.mode || 'table').toString().trim().toLowerCase();
    const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
    const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
    const overlayDetailSelectionForGroup =
      overlayDetailSelection && overlayDetailSelection.groupId === groupId ? overlayDetailSelection : null;
    const overlayDetailViewLabel = resolveLocalizedString(overlayDetail?.rowActions?.viewLabel, language, 'View');
    const overlayDetailEditLabel = resolveLocalizedString(overlayDetail?.rowActions?.editLabel, language, 'Edit');
    const overlayDetailViewPlacement = (overlayDetail?.rowActions?.viewPlacement || 'header').toString().trim().toLowerCase();
    const overlayDetailEditPlacement = (overlayDetail?.rowActions?.editPlacement || 'header').toString().trim().toLowerCase();
    const showOverlayDetailViewInHeader =
      overlayDetailCanView && overlayDetailViewPlacement !== 'hidden' && overlayDetailViewPlacement !== 'body';
    const showOverlayDetailEditInHeader = overlayDetailEditPlacement !== 'hidden' && overlayDetailEditPlacement !== 'body';
    const overlayDetailHeaderExplicit = Array.isArray(overlayDetail?.header?.tableColumns);
    const overlayDetailHeaderColumns = (() => {
      if (!overlayDetailEnabled || !groupCfg) return [];
      const raw = overlayDetailHeaderExplicit ? overlayDetail.header.tableColumns : [];
      const fallback = Array.isArray((groupCfg as any)?.ui?.tableColumns) ? (groupCfg as any).ui.tableColumns : [];
      const ids = raw
        .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
        .filter(Boolean);
      if (overlayDetailHeaderExplicit && !ids.length) return [];
      const fallbackIds = fallback
        .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
        .filter(Boolean);
      const fields = (groupCfg.fields || []) as LineItemFieldConfig[];
      const finalIds = ids.length ? ids : fallbackIds.length ? fallbackIds : fields.map(f => f.id);
      return finalIds.map((id: string) => fields.find((f: LineItemFieldConfig) => f.id === id)).filter(Boolean);
    })();
    const overlayDetailHeaderHidden = overlayDetailHeaderExplicit && overlayDetail.header.tableColumns.length === 0;
    const overlayDetailHeaderWidths = overlayDetail?.header?.tableColumnWidths || (groupCfg as any)?.ui?.tableColumnWidths;
    const resolveOverlayDetailHeaderStyle = (columnId: string): React.CSSProperties | undefined =>
      resolveTableColumnWidthStyle(overlayDetailHeaderWidths, columnId);

    const renderAddButton = () => {
      if (((groupCfg?.ui as any)?.addButtonPlacement || '').toString().trim().toLowerCase() === 'hidden') {
        return null;
      }
      if (!groupCfg) {
        return (
          <button
            type="button"
            className="ck-list-row-action-btn"
            onClick={() => {
              if (locked || maxRowsReached) return;
              addLineItemRowManual(groupId, undefined, groupAddRowOptions);
            }}
            style={withListRowActionButtonStyle(locked || maxRowsReached, undefined, buttonStyles.secondary)}
            disabled={locked || maxRowsReached}
          >
            <PlusIcon />
            {tSystem('lineItems.addLine', language, 'Add line')}
          </button>
        );
      }
      if (isOverlayAddMode && groupCfg.anchorFieldId) {
        const addLinesLabel = resolveLocalizedString(groupCfg.addButtonLabel, language, tSystem('lineItems.addLines', language, 'Add lines'));
        const addLinesPrimary = isPrimaryActionLabel(addLinesLabel);
        return (
          <button
            type="button"
            className="ck-list-row-action-btn"
            disabled={locked || selectorIsMissing || maxRowsReached}
            style={withListRowActionButtonStyle(
              locked || selectorIsMissing || maxRowsReached,
              undefined,
              addLinesPrimary ? buttonStyles.primary : buttonStyles.secondary
            )}
            onClick={async () => {
              if (locked || selectorIsMissing || maxRowsReached) {
                if (maxRowsReached) {
                  onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                    groupId,
                    reason: 'maxRows',
                    maxRows: groupMaxRows ?? null,
                    currentCount: limitCount
                  });
                }
                return;
              }
              const anchorField = (groupCfg.fields || []).find((f: any) => f.id === groupCfg.anchorFieldId);
              if (!anchorField || anchorField.type !== 'CHOICE') {
                addLineItemRowManual(groupId, undefined, groupAddRowOptions);
                return;
              }
              const key = optionKey(anchorField.id, groupId);
              let opts = optionState[key];
              if (!opts && anchorField.dataSource) {
                const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                if (loaded) {
                  opts = loaded;
                  setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, groupId, loaded));
                }
              }
              if (!opts) opts = resolveOptionSetForField(optionState, anchorField, groupId);
              const dependencyIds = (
                Array.isArray(anchorField.optionFilter?.dependsOn)
                  ? anchorField.optionFilter?.dependsOn
                  : [anchorField.optionFilter?.dependsOn || '']
              ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
              const depVals = dependencyIds.map((dep: string) => toDependencyValue((values as any)[dep]));
              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
              const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
              const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
              const addOverlayCopy = resolveAddOverlayCopy(groupCfg, language);
              if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.searchHelperText || addOverlayCopy.placeholder) {
                onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                  groupId,
                  scope: 'lineItemGroup',
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
                groupId,
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
      if (canUseSelectorOverlay) {
        return null;
      }
      const addLineLabel = resolveLocalizedString(groupCfg.addButtonLabel, language, tSystem('lineItems.addLine', language, 'Add line'));
      const addLinePrimary = isPrimaryActionLabel(addLineLabel);
      return (
        <button
          type="button"
          className="ck-list-row-action-btn"
          disabled={locked || selectorIsMissing || maxRowsReached}
          onClick={() => {
            if (maxRowsReached) {
              onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                groupId,
                reason: 'maxRows',
                maxRows: groupMaxRows ?? null,
                currentCount: limitCount
              });
              return;
            }
            const anchorFieldId =
              groupCfg?.anchorFieldId !== undefined && groupCfg?.anchorFieldId !== null ? groupCfg.anchorFieldId.toString() : '';
            const selectorPreset =
              anchorFieldId && (selectorValue || '').toString().trim()
                ? { [anchorFieldId]: (selectorValue || '').toString().trim() }
                : undefined;
            addLineItemRowManual(groupId, selectorPreset, groupAddRowOptions);
          }}
          style={withListRowActionButtonStyle(
            locked || selectorIsMissing || maxRowsReached,
            undefined,
            addLinePrimary ? buttonStyles.primary : buttonStyles.secondary
          )}
        >
          <PlusIcon />
          {addLineLabel}
        </button>
      );
    };

    // Avoid duplicate titles inside the editor by hiding the group label + item pill in overlay context.
    const overlayGroup: WebQuestionDefinition = {
      ...(group as any),
      ui: { ...((group as any).ui || {}), hideLabel: true },
      lineItemConfig: {
        ...((group as any).lineItemConfig || {}),
        // Hide internal toolbars (selector + add + totals) so the overlay header owns those controls.
        totals: [],
        ui: {
          ...(((group as any).lineItemConfig || {})?.ui || {}),
          showItemPill: false,
          addButtonPlacement: 'hidden'
        }
      }
    } as any;
    const handleOverlaySessionBulkSelectionToggle = () => {
      if (!overlaySessionBulkSelectionEnabled || !overlaySessionBulkSelectionField) return;
      if (locked || overlaySessionBulkSelectionField.readOnly === true || isFieldLockedByDedup(overlaySessionBulkSelectionField.id)) return;
      const nextValue = !overlaySessionAllRowsSelected;
      const currentLineItems = lineItemsRef.current || {};
      const currentValues = valuesRef.current;
      const visibleRowIds = new Set(rows.map(row => row.id));
      const existingRows = currentLineItems[groupId] || [];
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
      const nextLineItems = { ...currentLineItems, [groupId]: nextRows };
      const synced = applyValueMapsToForm(definition, currentValues, nextLineItems, { mode: 'change' });
      guidedLastUserEditAtRef.current = Date.now();
      onUserEdit?.({
        scope: 'line',
        fieldPath: `${groupId}__${overlaySessionBulkSelectionField.id}__*`,
        fieldId: overlaySessionBulkSelectionField.id,
        groupId,
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
          delete next[`${groupId}__${overlaySessionBulkSelectionField.id}__${row.id}`];
        });
        return next;
      });
      onDiagnostic?.('lineItemGroup.overlay.session.bulkSelection.toggle', {
        groupId,
        fieldId: overlaySessionBulkSelectionField.id,
        rowCount: rows.length,
        nextValue
      });
    };

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
	                  onClick={() => attemptCloseLineItemGroupOverlay('button')}
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
                {overlayHeaderLabel ? (
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
                <div style={srOnly}>{title}</div>
              </div>
              {overlaySessionBulkSelectionEnabled ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '0 8px' }}>
                  <button
                    type="button"
                    style={buttonStyles.secondary}
                    disabled={
                      locked ||
                      overlaySessionBulkSelectionField?.readOnly === true ||
                      isFieldLockedByDedup(overlaySessionBulkSelectionField.id)
                    }
                    onClick={handleOverlaySessionBulkSelectionToggle}
                  >
                    {overlaySessionBulkSelectionLabel}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
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
                {selectorCfg && (canUseSelectorOverlay ? selectorOverlayOptions.length : selectorOptions.length) ? (
                  <div
                    className="section-selector"
                    data-field-path={selectorCfg.id}
                    style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label
                      style={
                        Boolean((selectorCfg as any)?.hideLabel || (selectorCfg as any)?.ui?.hideLabel)
                          ? srOnly
                          : { fontWeight: 500 }
                      }
                    >
                      {resolveSelectorLabel(selectorCfg, language)}
                      {selectorCfg.required &&
                        !Boolean((selectorCfg as any)?.hideLabel || (selectorCfg as any)?.ui?.hideLabel) && <RequiredStar />}
                    </label>
                    {canUseSelectorOverlay ? (
                      <LineItemMultiAddSelect
                        label={resolveSelectorLabel(selectorCfg, language)}
                        language={language}
                        options={selectorOverlayOptions}
                        disabled={locked || maxRowsReached}
                        placeholder={
                          resolveSelectorPlaceholder(selectorCfg, language) ||
                          tSystem('lineItems.selectLinesSearch', language, 'Search items')
                        }
                        helperText={resolveSelectorHelperText(selectorCfg, language) || undefined}
                        emptyText={tSystem('common.noMatches', language, 'No matches.')}
                        onDiagnostic={(event, payload) =>
                          onDiagnostic?.(event, {
                            scope: 'lineItems.selectorOverlay',
                            groupId,
                            fieldId: selectorCfg.id,
                            ...(payload || {})
                          })
                        }
                        onAddSelected={valuesToAdd => {
                          if (locked || maxRowsReached) {
                            if (maxRowsReached) {
                              onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                                groupId,
                                reason: 'maxRows',
                                maxRows: groupMaxRows ?? null,
                                currentCount: limitCount
                              });
                            }
                            return;
                          }
                          if (!selectorOverlayAnchorFieldId) return;
                          const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
                          if (!deduped.length) return;
                          const allowed =
                            remainingSlots !== undefined && remainingSlots !== null
                              ? deduped.slice(0, Math.max(0, remainingSlots))
                              : deduped;
                          if (!allowed.length) {
                            onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                              groupId,
                              reason: 'maxRows',
                              maxRows: groupMaxRows ?? null,
                              currentCount: limitCount
                            });
                            return;
                          }
                          if (allowed.length < deduped.length) {
                            onDiagnostic?.('lineItemGroup.overlay.add.truncated', {
                              groupId,
                              maxRows: groupMaxRows ?? null,
                              currentCount: limitCount,
                              requested: deduped.length,
                              applied: allowed.length
                            });
                          }
                          const duplicateValues: string[] = [];
                          let duplicateMessage = '';
                          allowed.forEach(val => {
                            const result = addLineItemRowManual(groupId, { [selectorOverlayAnchorFieldId]: val }, groupAddRowOptions);
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
                    ) : selectorOptions.length >= 20 ? (
                      <SearchableSelect
                        value={selectorValue || ''}
                        disabled={locked}
                        placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
                        emptyText={tSystem('common.noMatches', language, 'No matches.')}
                        options={selectorOptions.map(opt => ({
                          value: opt.value,
                          label: opt.label,
                          searchText: opt.searchText
                        }))}
                        onChange={nextValue => {
                          setValues(prev => {
                            if ((prev as any)[selectorCfg.id] === nextValue) return prev;
                            return { ...(prev as any), [selectorCfg.id]: nextValue };
                          });
                        }}
                      />
                    ) : (
                      <select
                        value={selectorValue}
                        onChange={e => {
                          const nextValue = e.target.value;
                          setValues(prev => {
                            if ((prev as any)[selectorCfg.id] === nextValue) return prev;
                            return { ...(prev as any), [selectorCfg.id]: nextValue };
                          });
                        }}
                      >
                        <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
                        {selectorOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : null}
                {!overlayRowFilter && !overlayDetailEnabled ? renderAddButton() : null}
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
            {overlayDetailEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {overlayDetailHeaderHidden
                    ? null
                    : (() => {
                        const placement = (overlayDetail?.header?.addButtonPlacement || 'top').toString().trim().toLowerCase();
                        const showTop = placement === 'top' || placement === 'both';
                        const showBottom = placement === 'bottom' || placement === 'both';
                        const headerFields = overlayDetailHeaderColumns.length
                          ? overlayDetailHeaderColumns
                          : ((groupCfg?.fields || []) as any[]);
                        const headerColumns = [
                          ...headerFields.map((field: any) => ({
                            id: field.id,
                            label: resolveFieldLabel(field, language, field.id),
                            style: resolveOverlayDetailHeaderStyle(field.id),
                            renderCell: (row: LineItemRowState) => {
                              const raw = row?.values?.[field.id];
                              if (raw === undefined || raw === null || raw === '') return '—';
                              if (field.type === 'FILE_UPLOAD') {
                                const items = toUploadItems(raw);
                                return items.length ? `${items.length}` : '—';
                              }
                              if (Array.isArray(raw)) return raw.join(', ');
                              if (field.type === 'DATE') return toDateInputValue(raw) || raw.toString();
                              return raw.toString();
                            }
                          })),
	                          ...(() => {
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
                                style: resolveOverlayDetailHeaderStyle('__view'),
                                renderCell: (row: LineItemRowState) => (
                                  <button
                                    type="button"
                                    aria-label={overlayDetailViewLabel}
                                    style={actionButtonStyle}
                                    onClick={() => {
                                      setOverlayDetailSelection({ groupId, rowId: row.id, mode: 'view' });
                                      onDiagnostic?.('lineItems.overlayDetail.select', { groupId, rowId: row.id, mode: 'view' });
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
                                style: resolveOverlayDetailHeaderStyle('__edit'),
                                renderCell: (row: LineItemRowState) => (
                                  <button
                                    type="button"
                                    aria-label={overlayDetailEditLabel}
                                    style={actionButtonStyle}
                                    onClick={() => {
                                      setOverlayDetailSelection({ groupId, rowId: row.id, mode: 'edit' });
                                      onDiagnostic?.('lineItems.overlayDetail.select', { groupId, rowId: row.id, mode: 'edit' });
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
                              style: resolveOverlayDetailHeaderStyle('__remove'),
                              renderCell: (row: LineItemRowState) => {
                                const rowValues = row?.values || {};
                                const rowSource = parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]);
                                const hideRemoveButton = parseRowHideRemove((rowValues as any)?.[ROW_HIDE_REMOVE_KEY]);
                                const allowRemoveAuto = (groupCfg?.ui as any)?.allowRemoveAutoRows !== false;
                                const canRemove = !hideRemoveButton && (rowSource !== 'auto' || allowRemoveAuto);
                                if (!canRemove) return null;
                                return (
                                  <button
                                    type="button"
                                    aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                    style={actionButtonStyle}
                                    onClick={() => removeLineRow(groupId, row.id)}
                                  >
                                    <TrashIcon size={40} />
                                  </button>
                                );
                              }
                            });
                            return actionColumns;
                          })()
                        ];
                        return (
                          <div>
                            {showTop ? <div style={{ marginBottom: 8 }}>{renderAddButton()}</div> : null}
                            <LineItemTable
                              columns={headerColumns}
                              rows={rows}
                              emptyText={tSystem('lineItems.empty', language, 'No items yet.')}
                            />
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
                          setOverlayDetailSelection({ groupId, rowId: overlayDetailSelectionForGroup.rowId, mode: nextMode as 'view' | 'edit' });
                          onDiagnostic?.('lineItems.overlayDetail.action', {
                            groupId,
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
                                    setOverlayDetailSelection({ groupId, rowId: overlayDetailSelectionForGroup.rowId, mode: 'edit' });
                                    onDiagnostic?.('lineItems.overlayDetail.action', {
                                      groupId,
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
                      const subKey =
                        overlayDetailSelectionForGroup && overlayDetailSubId
                          ? buildSubgroupKey(groupId, overlayDetailSelectionForGroup.rowId, overlayDetailSubId)
                          : '';
                      if (!subKey || !overlayDetailSubConfig) return null;
                      const detailRowValues =
                        overlayDetailSelectionForGroup && overlayDetailSelectionForGroup.rowId
                          ? rows.find(r => r.id === overlayDetailSelectionForGroup.rowId)?.values || {}
                          : {};
                      const detailContextValues = { ...values, ...(detailRowValues as Record<string, FieldValue>) };
                      const editCfg = overlayDetail?.body?.edit || {};
                      const subGroupDef: WebQuestionDefinition = {
                        ...(group as any),
                        id: subKey,
                        ui: { ...((group as any).ui || {}), hideLabel: true },
                        lineItemConfig: {
                          ...(overlayDetailSubConfig as any),
                          fields: overlayDetailSubConfig.fields || [],
                          subGroups: overlayDetailSubConfig.subGroups || [],
                          ui: {
                            ...((overlayDetailSubConfig as any)?.ui || {}),
                            mode: 'table',
                            tableColumns: Array.isArray(editCfg?.tableColumns) ? editCfg.tableColumns : (overlayDetailSubConfig as any)?.ui?.tableColumns,
                            tableColumnWidths: editCfg?.tableColumnWidths || (overlayDetailSubConfig as any)?.ui?.tableColumnWidths
                          }
                        }
                      } as any;
                      const detailRowId = overlayDetailSelectionForGroup?.rowId || '';
                      const detailKey = detailRowId ? `${groupId}::${detailRowId}` : '';
                      const handleDetailSave = () => {
                        if (!detailRowId) return;
                        attemptSaveOverlayDetailEdit({
                          detailGroupDef: subGroupDef,
                          errorGroupKey: subKey,
                          groupId,
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
                          setErrors(prev => clearLineItemGroupErrors(prev, groupId));
                          if (!overlayDetailCanView) {
                            overlayDetailEditSnapshotRef.current = {
                              key: detailKey,
                              values: snapshot.values,
                              lineItems: snapshot.lineItems
                            };
                          }
                        }
                        if (overlayDetailCanView) {
                          setOverlayDetailSelection({ groupId, rowId: detailRowId, mode: 'view' });
                        }
                        onDiagnostic?.('lineItems.overlayDetail.edit.cancel', {
                          groupId,
                          rowId: detailRowId,
                          restored,
                          mode: overlayDetailCanView ? 'view' : 'edit'
                        });
                        if (overlayDetailCanView) {
                          overlayDetailEditSnapshotRef.current = null;
                        }
                      };
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              style={withDisabled(buttonStyles.primary, dedupOverlayActionsDisabled)}
                              disabled={dedupOverlayActionsDisabled}
                              onClick={handleDetailSave}
                            >
                              {tSystem('common.saveChanges', language, 'Save')}
                            </button>
                            <button type="button" style={buttonStyles.secondary} onClick={handleDetailCancel}>
                              {tSystem('common.cancel', language, 'Cancel')}
                            </button>
                          </div>
                          <LineItemGroupQuestion
                            key={subGroupDef.id}
                            q={subGroupDef as any}
                            ctx={buildLineItemGroupQuestionContext({
                              values: detailContextValues,
                              getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                              submitting: submitting || isFieldLockedByDedup(groupId),
                              closeOverlay: () => attemptCloseLineItemGroupOverlay('button')
                            })}
                          />
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            ) : (
              <div className={overlaySessionFillAvailableHeight ? 'ck-line-item-overlay-fill-height' : undefined}>
                <LineItemGroupQuestion
                  key={overlayGroup.id}
                  q={overlayGroup as any}
                  rowFilter={overlayRowFilter}
                  hideInlineSubgroups={overlayHideInlineSubgroups}
                  hideToolbars
                  rowFlow={lineItemGroupOverlay.rowFlow}
                  ctx={buildLineItemGroupQuestionContext({
                    submitting: submitting || isFieldLockedByDedup(groupId),
                    closeOverlay: () => attemptCloseLineItemGroupOverlay('button')
                  })}
                />
              </div>
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
            <button type="button" style={buttonStyles.secondary} onClick={handleLineItemGroupOverlaySessionCancel}>
              {overlaySessionCancelLabel}
            </button>
            <button
              type="button"
              style={withDisabled(buttonStyles.primary, dedupOverlayActionsDisabled)}
              disabled={dedupOverlayActionsDisabled}
              onClick={handleLineItemGroupOverlaySessionSave}
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
