import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  computeTotals,
  toDependencyValue
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type { FieldValue, LangCode, OptionSet, WebQuestionDefinition } from '../../../../types';
import { buildSubgroupKey } from '../../../app/lineItems';
import { applyLineItemRowSort } from '../../../app/lineItemRowSort';
import { shouldRenderCompactLineItemRow } from '../../../app/compactLineItemLayout';
import {
  buildSelectorOptionSet
} from '../../../components/form/lineItemSelectors';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { optionSortFor } from '../domain/lineItemPresentation';
import { LineItemSectionSelectorControl } from './LineItemSectionSelectorControl';
import { LineItemSubgroupAddButton } from './LineItemSubgroupAddButton';
import {
  LineItemSubgroupHeader,
  LineItemSubgroupToolbar
} from './LineItemSubgroupChrome';
import { LineItemSubgroupRowsRenderer } from './LineItemSubgroupRowsRenderer';
import { LineItemSubgroupTableRenderer } from './LineItemSubgroupTableRenderer';

type LineItemInlineSubgroupsRendererProps = {
  q: WebQuestionDefinition;
  row: { id: string; values: Record<string, FieldValue>; [key: string]: any };
  parentUi: any;
  hideInlineSubgroups?: boolean;
  isProgressive: boolean;
  rowCollapsed: boolean;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedSubgroups: Record<string, boolean>;
  subgroupSelectors: Record<string, string>;
  optionState: OptionState;
  language: LangCode;
  errors: FormErrors;
  submitting: boolean;
  collapsedGroups: Record<string, boolean>;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  latestSubgroupSelectorValueRef: React.MutableRefObject<Record<string, string>>;
  selectorSearchLoggedRef: React.MutableRefObject<Set<string>>;
  selectorOverlayLoggedRef: React.MutableRefObject<Set<string>>;
  subgroupBottomRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  buildOptionSetForLineField: (field: any, groupKey: string) => OptionSet;
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
  openSubgroupOverlay: (subKey: string, options?: any) => void;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  setOverlay: (overlay: any) => void;
  setCollapsedSubgroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addLineItemRowManual: (groupId: string, preset?: Record<string, FieldValue>, options?: any) => void;
  removeLineRow: (groupId: string, rowId: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  toggleGroupCollapsed: (key: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: line-items feature renderer.
 * Renders the inline subgroup sections for a standard line-item row, including
 * selector/add controls, table/list mode selection, ordering, totals, and
 * subgroup collapse chrome.
 */
export const LineItemInlineSubgroupsRenderer: React.FC<LineItemInlineSubgroupsRendererProps> = ({
  q,
  row,
  parentUi,
  hideInlineSubgroups,
  isProgressive,
  rowCollapsed,
  values,
  lineItems,
  collapsedSubgroups,
  subgroupSelectors,
  optionState,
  language,
  errors,
  submitting,
  collapsedGroups,
  fileInputsRef,
  uploadAnnouncements,
  latestSubgroupSelectorValueRef,
  selectorSearchLoggedRef,
  selectorOverlayLoggedRef,
  subgroupBottomRefs,
  buildOptionSetForLineField,
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
  openSubgroupOverlay,
  setLineItems,
  setOptionState,
  setOverlay,
  setCollapsedSubgroups,
  setSubgroupSelectors,
  addLineItemRowManual,
  removeLineRow,
  setErrors,
  toggleGroupCollapsed,
  onDiagnostic
}) => {
  if (hideInlineSubgroups || (isProgressive && rowCollapsed)) return null;

  return (
    <>
      {(q.lineItemConfig?.subGroups || []).map(sub => {
        const subLabelResolved = resolveLocalizedString(
          sub.label,
          language,
          sub.id ||
            (typeof sub.label === 'string'
              ? sub.label
              : sub.label?.en || sub.label?.fr || sub.label?.nl || '')
        );
        const subId = sub.id || subLabelResolved;
        if (!subId) return null;
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        const collapsed =
          collapsedSubgroups[subKey] ?? ((sub as any)?.ui?.defaultCollapsed !== undefined ? !!(sub as any)?.ui?.defaultCollapsed : true);
        const subRows = lineItems[subKey] || [];
        const filteredSubRows = subRows.filter(subRow => {
          const hideRowsWithoutAnchor = (sub as any)?.ui?.hideRowsWithoutAnchor === true;
          const anchorFieldId =
            (sub as any)?.anchorFieldId !== undefined && (sub as any)?.anchorFieldId !== null
              ? (sub as any).anchorFieldId.toString()
              : '';
          return shouldRenderCompactLineItemRow({
            rowValues: (subRow as any)?.values as Record<string, any> | undefined,
            anchorFieldId,
            hideRowsWithoutAnchor
          });
        });
        const orderedSubRows = applyLineItemRowSort({
          rows: filteredSubRows,
          fields: sub.fields || [],
          config: ((sub as any)?.ui as any)?.rowSort
        });
        const subTotals = computeTotals(
          { config: { ...sub, fields: sub.fields || [] }, rows: orderedSubRows, groupId: subKey, invalidFieldPaths: errors },
          language
        );
        const subSelectorCfg = sub.sectionSelector;
        const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
        const subSelectorValue = subgroupSelectors[subKey] || '';
        latestSubgroupSelectorValueRef.current[subKey] = subSelectorValue || '';
        const subSelectorDepIds = Array.isArray(subSelectorCfg?.optionFilter?.dependsOn)
          ? subSelectorCfg?.optionFilter?.dependsOn
          : subSelectorCfg?.optionFilter?.dependsOn
            ? [subSelectorCfg.optionFilter.dependsOn]
            : [];
        const subSelectorDepVals = subSelectorCfg?.optionFilter
          ? subSelectorDepIds.map(depId =>
              toDependencyValue(
                depId === subSelectorCfg.id
                  ? subSelectorValue
                  : (row.values[depId] ?? values[depId])
              )
            )
          : [];
        const subSelectorAllowed = subSelectorCfg?.optionFilter && subSelectorOptionSet
          ? computeAllowedOptions(subSelectorCfg.optionFilter, subSelectorOptionSet, subSelectorDepVals)
          : null;
        const subSelectorOptions = subSelectorOptionSet
          ? buildLocalizedOptions(
              subSelectorOptionSet,
              subSelectorAllowed !== null ? subSelectorAllowed : (subSelectorOptionSet.en || []),
              language
            )
          : [];
        const subAddModeRaw = (sub as any)?.addMode;
        const subAddMode = subAddModeRaw ? subAddModeRaw.toString().trim().toLowerCase() : 'inline';
        const isSubOverlayAddMode = subAddMode === 'overlay';
        const isSubSelectorOverlayMode = subAddMode === 'selectoroverlay' || subAddMode === 'selector-overlay';
        const subSelectorOverlayAnchorFieldId =
          (sub as any)?.anchorFieldId !== undefined && (sub as any)?.anchorFieldId !== null
            ? (sub as any).anchorFieldId.toString()
            : '';
        const subSelectorOverlayAnchorField = subSelectorOverlayAnchorFieldId
          ? (sub.fields || []).find(f => f.id === subSelectorOverlayAnchorFieldId)
          : undefined;
        const canUseSubSelectorOverlay =
          isSubSelectorOverlayMode &&
          !!subSelectorCfg &&
          !!subSelectorOverlayAnchorField &&
          subSelectorOverlayAnchorField.type === 'CHOICE';

        const subSelectorSearchEnabled = subSelectorCfg?.choiceSearchEnabled;
        const useSubSelectorSearch = (() => {
          if (subSelectorSearchEnabled === true) return true;
          if (subSelectorSearchEnabled === false) return false;
          return subSelectorOptions.length >= 20;
        })();

        const subSelectorIsMissing = !canUseSubSelectorOverlay && !!subSelectorCfg?.required && !subSelectorValue;
        const subSelectorSearchKey = subSelectorCfg ? `${subKey}::${subSelectorCfg.id}` : '';
        if (subSelectorCfg && useSubSelectorSearch) {
          const indexedCount = subSelectorOptions.filter(opt => !!opt.searchText).length;
          if (indexedCount && subSelectorSearchKey && !selectorSearchLoggedRef.current.has(subSelectorSearchKey)) {
            selectorSearchLoggedRef.current.add(subSelectorSearchKey);
            onDiagnostic?.('ui.lineItems.selector.search.multiField', {
              groupId: subKey,
              selectorId: subSelectorCfg.id,
              optionCount: subSelectorOptions.length,
              indexedCount
            });
          }
        }
        if (isSubSelectorOverlayMode && !canUseSubSelectorOverlay) {
          const invalidKey = `${subKey}::selectorOverlay:invalid`;
          if (!selectorOverlayLoggedRef.current.has(invalidKey)) {
            selectorOverlayLoggedRef.current.add(invalidKey);
            onDiagnostic?.('ui.lineItems.selectorOverlay.invalidConfig', {
              groupId: subKey,
              selectorId: subSelectorCfg?.id || null,
              anchorFieldId: subSelectorOverlayAnchorFieldId || null
            });
          }
        }
        const subSelectorOverlayOptions = (() => {
          if (!canUseSubSelectorOverlay || !subSelectorOverlayAnchorField) return [];
          ensureLineOptions(subKey, subSelectorOverlayAnchorField);
          const optionSetField = buildOptionSetForLineField(subSelectorOverlayAnchorField, subKey);
          const dependencyIds = (
            Array.isArray(subSelectorOverlayAnchorField.optionFilter?.dependsOn)
              ? subSelectorOverlayAnchorField.optionFilter?.dependsOn
              : [subSelectorOverlayAnchorField.optionFilter?.dependsOn || '']
          ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
          const depVals = dependencyIds.map(dep =>
            toDependencyValue(row.values[dep] ?? values[dep] ?? subSelectorValue)
          );
          let allowed = computeAllowedOptions(subSelectorOverlayAnchorField.optionFilter, optionSetField, depVals);
          if (subSelectorCfg?.optionFilter) {
            const selectorAllowed = computeAllowedOptions(subSelectorCfg.optionFilter, optionSetField, subSelectorDepVals);
            if (selectorAllowed.length) {
              const selectorAllowedSet = new Set(selectorAllowed);
              allowed = allowed.filter(val => selectorAllowedSet.has(val));
            }
          }
          const localized = buildLocalizedOptions(optionSetField, allowed, language, {
            sort: optionSortFor(subSelectorOverlayAnchorField)
          });
          const seen = new Set<string>();
          return localized
            .map(opt => ({
              value: opt.value,
              label: opt.label,
              searchText: opt.searchText
            }))
            .filter(opt => {
              const key = (opt.value || '').toString();
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
        })();
        if (canUseSubSelectorOverlay && subSelectorOverlayOptions.length) {
          const overlayKey = `${subKey}::selectorOverlay`;
          const indexedCount = subSelectorOverlayOptions.filter(opt => opt.searchText).length;
          if (!selectorOverlayLoggedRef.current.has(overlayKey)) {
            selectorOverlayLoggedRef.current.add(overlayKey);
            onDiagnostic?.('ui.lineItems.selectorOverlay.enabled', {
              groupId: subKey,
              anchorFieldId: subSelectorOverlayAnchorFieldId,
              optionCount: subSelectorOverlayOptions.length,
              indexedCount
            });
          }
        }

        const renderSubAddButton = () => (
          <LineItemSubgroupAddButton
            sub={sub}
            subKey={subKey}
            rowValues={row.values as Record<string, FieldValue>}
            values={values}
            language={language}
            submitting={submitting}
            optionState={optionState}
            isOverlayAddMode={isSubOverlayAddMode}
            canUseSelectorOverlay={canUseSubSelectorOverlay}
            selectorIsMissing={subSelectorIsMissing}
            selectorCfg={subSelectorCfg}
            getCurrentSelectorValue={() =>
              (latestSubgroupSelectorValueRef.current[subKey] || subSelectorValue || '').toString().trim()
            }
            setOptionState={setOptionState}
            addLineItemRowManual={addLineItemRowManual}
            setOverlay={setOverlay}
            onDiagnostic={onDiagnostic}
          />
        );
        const subUi = (sub as any).ui as any;
        const subAddButtonPlacement = (subUi?.addButtonPlacement || 'both').toString().toLowerCase();
        const showSubAddTop =
          subAddButtonPlacement !== 'hidden' &&
          (subAddButtonPlacement === 'both' || subAddButtonPlacement === 'top');
        const showSubAddBottom =
          subAddButtonPlacement !== 'hidden' &&
          (subAddButtonPlacement === 'both' || subAddButtonPlacement === 'bottom');
        const toggleSubgroupCollapsed = () =>
          setCollapsedSubgroups(prev => ({
            ...prev,
            [subKey]: !(prev[subKey] ?? true)
          }));
        const renderSubSelectorControl = (opts?: { multiAdd?: boolean; labelStyle?: React.CSSProperties }) =>
          subSelectorCfg ? (
            <LineItemSectionSelectorControl
              selectorCfg={subSelectorCfg}
              value={subSelectorValue}
              language={language}
              options={subSelectorOptions}
              disabled={submitting}
              searchEnabled={useSubSelectorSearch}
              labelStyle={opts?.labelStyle}
              diagnosticPayload={{ scope: 'subgroup.selector', fieldId: subSelectorCfg.id, subKey }}
              onDiagnostic={onDiagnostic}
              onChange={nextValue => {
                latestSubgroupSelectorValueRef.current[subKey] = nextValue;
                setSubgroupSelectors(prev => {
                  if (prev[subKey] === nextValue) return prev;
                  return { ...prev, [subKey]: nextValue };
                });
              }}
              multiAdd={
                opts?.multiAdd && canUseSubSelectorOverlay
                  ? {
                      enabled: true,
                      options: subSelectorOverlayOptions,
                      diagnosticPayload: {
                        scope: 'subgroup.selectorOverlay',
                        fieldId: subSelectorCfg.id,
                        subKey
                      },
                      onAddSelected: valuesToAdd => {
                        if (submitting) return;
                        if (!subSelectorOverlayAnchorFieldId) return;
                        const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
                        if (!deduped.length) return;
                        deduped.forEach(val => addLineItemRowManual(subKey, { [subSelectorOverlayAnchorFieldId]: val }));
                      }
                    }
                  : undefined
              }
            />
          ) : null;
        const subUiMode = (subUi?.mode || 'default').toString().trim().toLowerCase();
        const isSubTableMode = subUiMode === 'table';
        const subMaxVisibleRowsRaw = Number((subUi as any)?.maxVisibleRows);
        const subTableScrollStyle =
          Number.isFinite(subMaxVisibleRowsRaw) && subMaxVisibleRowsRaw > 0
            ? ({
                maxHeight: `${Math.max(1, Math.floor(subMaxVisibleRowsRaw)) * 56}px`,
                overflowY: 'auto' as const,
                overflowX: 'auto' as const,
                WebkitOverflowScrolling: 'touch' as const,
                overscrollBehavior: 'contain' as const,
                touchAction: 'pan-x pan-y' as const
              })
            : undefined;
        const subListScrollStyle =
          Number.isFinite(subMaxVisibleRowsRaw) && subMaxVisibleRowsRaw > 0
            ? ({
                maxHeight: `${Math.max(1, Math.floor(subMaxVisibleRowsRaw)) * ((subUi as any)?.compactRows === true ? 132 : 108)}px`,
                overflowY: 'auto' as const,
                overflowX: 'hidden' as const,
                WebkitOverflowScrolling: 'touch' as const,
                overscrollBehavior: 'contain' as const,
                touchAction: 'pan-y' as const
              })
            : undefined;
        const subHideRemoveColumn = (subUi as any)?.hideRemoveColumn === true;
        const inlineSubgroupChromeHidden = parentUi?.inlineSubgroupsWhenExpanded === true;
        const subAnchorFieldId =
          sub.anchorFieldId !== undefined && sub.anchorFieldId !== null ? sub.anchorFieldId.toString() : '';
        const subHideUntilAnchor = (subUi as any)?.tableHideUntilAnchor !== false;
        const subGroupDef: WebQuestionDefinition = {
          ...(q as any),
          id: subKey,
          lineItemConfig: { ...(sub as any), fields: sub.fields || [], subGroups: [] }
        };
        const targetGroup = subGroupDef;
        return (
          <div
            key={subKey}
            className={inlineSubgroupChromeHidden ? '' : 'card'}
            style={
              inlineSubgroupChromeHidden
                ? { marginTop: 8, background: 'transparent' }
                : { marginTop: 12, background: 'var(--card)' }
            }
          >
            <LineItemSubgroupHeader
              subKey={subKey}
              label={subLabelResolved || subId}
              collapsed={collapsed}
              inlineChromeHidden={inlineSubgroupChromeHidden}
              language={language}
              selectorControl={showSubAddTop && subSelectorCfg ? renderSubSelectorControl({ labelStyle: { fontWeight: 600 } }) : null}
              addButton={showSubAddTop ? renderSubAddButton() : null}
              onToggleCollapsed={toggleSubgroupCollapsed}
            />
            {collapsed ? null : (
              <div id={`${subKey}-body`}>
                <div style={isSubTableMode ? { marginTop: 8 } : { marginTop: 8, ...(subListScrollStyle || {}) }}>
                  {isSubTableMode ? (
                    <LineItemSubgroupTableRenderer
                      parentQuestion={q}
                      targetGroup={targetGroup}
                      sub={sub}
                      subKey={subKey}
                      subUi={subUi}
                      subRows={orderedSubRows}
                      parentRowValues={row.values as Record<string, FieldValue>}
                      values={values}
                      lineItems={lineItems}
                      optionState={optionState}
                      language={language}
                      errors={errors}
                      submitting={submitting}
                      tableScrollStyle={subTableScrollStyle}
                      anchorFieldId={subAnchorFieldId}
                      hideUntilAnchor={subHideUntilAnchor}
                      hideRemoveColumn={subHideRemoveColumn}
                      ensureLineOptions={ensureLineOptions}
                      renderChoiceControl={renderChoiceControl}
                      handleLineFieldChange={handleLineFieldChange}
                      isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
                      isLineFieldInputDisabled={isLineFieldInputDisabled}
                      renderWarnings={renderWarnings}
                      openFileOverlay={openFileOverlay}
                      removeLineRow={removeLineRow}
                      setErrors={setErrors}
                      onDiagnostic={onDiagnostic}
                    />
                  ) : (
                    <LineItemSubgroupRowsRenderer
                      q={q}
                      sub={sub}
                      subId={subId}
                      subKey={subKey}
                      subUi={subUi}
                      orderedSubRows={orderedSubRows}
                      row={row as any}
                      values={values}
                      lineItems={lineItems}
                      subgroupSelectors={subgroupSelectors}
                      selectorCfg={subSelectorCfg}
                      optionState={optionState}
                      language={language}
                      errors={errors}
                      submitting={submitting}
                      collapsedGroups={collapsedGroups}
                      toggleGroupCollapsed={toggleGroupCollapsed}
                      fileInputsRef={fileInputsRef}
                      uploadAnnouncements={uploadAnnouncements}
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
                      addLineItemRowManual={addLineItemRowManual}
                      removeLineRow={removeLineRow}
                      setErrors={setErrors}
                      onDiagnostic={onDiagnostic}
                    />
                  )}
                  {(() => {
                    const shouldRender = orderedSubRows.length > 0 || showSubAddBottom;
                    if (!shouldRender) return null;
                    const selectorControl =
                      subSelectorCfg &&
                      showSubAddBottom &&
                      (canUseSubSelectorOverlay ? subSelectorOverlayOptions.length : subSelectorOptions.length)
                        ? renderSubSelectorControl({ multiAdd: canUseSubSelectorOverlay })
                        : null;
                    return (
                      <LineItemSubgroupToolbar
                        subKey={subKey}
                        collapsed={collapsed}
                        inlineChromeHidden={inlineSubgroupChromeHidden}
                        language={language}
                        totals={subTotals}
                        selectorControl={selectorControl}
                        addButton={showSubAddBottom ? renderSubAddButton() : null}
                        setBottomRef={el => {
                          subgroupBottomRefs.current[subKey] = el;
                        }}
                        onToggleCollapsed={toggleSubgroupCollapsed}
                      />
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
