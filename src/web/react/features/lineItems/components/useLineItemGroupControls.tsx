import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  loadOptionsFromDataSource,
  mergeOptionStateValue,
  optionKey,
  peekOptionsFromDataSource,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, OptionSet, WebQuestionDefinition } from '../../../../types';
import type { LineItemAddResult, OptionState } from '../../../types';
import { LineItemMultiAddSelect } from '../../../components/form/LineItemMultiAddSelect';
import { SearchableSelect } from '../../../components/form/SearchableSelect';
import { PlusIcon, RequiredStar, srOnly } from '../../../components/form/ui';
import type { LineOverlayState } from '../../../components/form/overlays/LineSelectOverlay';
import {
  buildSelectorOptionSet,
  resolveSelectorHelperText,
  resolveSelectorLabel,
  resolveSelectorPlaceholder
} from '../../../components/form/lineItemSelectors';
import { resolveAddOverlayCopy } from '../domain/addOverlayCopy';
import { optionSortFor } from '../domain/lineItemPresentation';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';

type SelectorOption = {
  value: string;
  label: string;
  searchText?: string;
};

type UseLineItemGroupControlsArgs = {
  q: WebQuestionDefinition;
  values: Record<string, FieldValue>;
  language: LangCode;
  submitting: boolean;
  optionState: OptionState;
  latestSectionSelectorValueRef: React.MutableRefObject<string>;
  selectorSearchLoggedRef: React.MutableRefObject<Set<string>>;
  selectorOverlayLoggedRef: React.MutableRefObject<Set<string>>;
  selectorLabelLoggedRef: React.MutableRefObject<Set<string>>;
  buildOptionSetForLineField: (field: any, groupKey: string) => OptionSet;
  ensureLineOptions: (groupId: string, field: any) => void;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;
  addLineItemRowManual: (
    groupId: string,
    preset?: Record<string, any>,
    options?: { configOverride?: any; rowFilter?: { includeWhen?: any; excludeWhen?: any } | null }
  ) => LineItemAddResult | undefined;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

type UseLineItemGroupControlsResult = {
  selectorCfg: any;
  selectorValue: string;
  selectorOptions: SelectorOption[];
  selectorControl: React.ReactNode;
  renderAddButton: () => React.ReactNode;
  canUseSelectorOverlay: boolean;
  showAddTop: boolean;
  showAddBottom: boolean;
  showSelectorTop: boolean;
  showSelectorBottom: boolean;
  useSelectorSearch: boolean;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

const normalizeAnchorFieldId = (config: any): string =>
  config?.anchorFieldId !== undefined && config?.anchorFieldId !== null ? config.anchorFieldId.toString() : '';

/**
 * Owner: line-items feature renderer.
 * Owns group-level selector/add controls, including selector-overlay option
 * resolution and diagnostics. The parent renderer owns placement and totals.
 */
export const useLineItemGroupControls = ({
  q,
  values,
  language,
  submitting,
  optionState,
  latestSectionSelectorValueRef,
  selectorSearchLoggedRef,
  selectorOverlayLoggedRef,
  selectorLabelLoggedRef,
  buildOptionSetForLineField,
  ensureLineOptions,
  setValues,
  setOptionState,
  setOverlay,
  addLineItemRowManual,
  onDiagnostic
}: UseLineItemGroupControlsArgs): UseLineItemGroupControlsResult => {
  const selectorCfg = q.lineItemConfig?.sectionSelector;
  const selectorOptionSet = buildSelectorOptionSet(selectorCfg);
  const selectorValue = selectorCfg ? ((values[selectorCfg.id] as string) || '') : '';
  latestSectionSelectorValueRef.current = selectorValue || '';
  const selectorDepIds = Array.isArray(selectorCfg?.optionFilter?.dependsOn)
    ? selectorCfg?.optionFilter?.dependsOn
    : selectorCfg?.optionFilter?.dependsOn
      ? [selectorCfg.optionFilter.dependsOn]
      : [];
  const selectorDepVals = selectorCfg?.optionFilter
    ? selectorDepIds.map(depId => toDependencyValue(depId === selectorCfg.id ? selectorValue : values[depId]))
    : [];
  const selectorAllowed = selectorCfg?.optionFilter && selectorOptionSet
    ? computeAllowedOptions(selectorCfg.optionFilter, selectorOptionSet, selectorDepVals)
    : null;
  const selectorOptions = selectorOptionSet
    ? buildLocalizedOptions(
        selectorOptionSet,
        selectorAllowed !== null ? selectorAllowed : (selectorOptionSet.en || []),
        language
      )
    : [];
  const addModeRaw = q.lineItemConfig?.addMode;
  const addMode = addModeRaw ? addModeRaw.toString().trim().toLowerCase() : 'inline';
  const isOverlayAddMode = addMode === 'overlay';
  const isSelectorOverlayMode = addMode === 'selectoroverlay' || addMode === 'selector-overlay';
  const selectorOverlayAnchorFieldId = normalizeAnchorFieldId(q.lineItemConfig);
  const selectorOverlayAnchorField = selectorOverlayAnchorFieldId
    ? (q.lineItemConfig?.fields || []).find(f => f.id === selectorOverlayAnchorFieldId)
    : undefined;
  const canUseSelectorOverlay =
    isSelectorOverlayMode && !!selectorCfg && !!selectorOverlayAnchorField && selectorOverlayAnchorField.type === 'CHOICE';

  const selectorSearchEnabled = selectorCfg?.choiceSearchEnabled;
  const useSelectorSearch = (() => {
    if (selectorSearchEnabled === true) return true;
    if (selectorSearchEnabled === false) return false;
    return selectorOptions.length >= 20;
  })();

  const selectorIsMissing = !canUseSelectorOverlay && !!selectorCfg?.required && !selectorValue;

  const renderAddButton = () => {
    if (isOverlayAddMode && q.lineItemConfig?.anchorFieldId) {
      const addLinesLabel = resolveLocalizedString(
        q.lineItemConfig?.addButtonLabel,
        language,
        tSystem('lineItems.addLines', language, 'Add lines')
      );
      return (
        <button
          type="button"
          className="ck-list-row-action-btn"
          disabled={submitting || selectorIsMissing}
          style={withListRowActionButtonStyle(submitting || selectorIsMissing)}
          onClick={async () => {
            if (submitting) return;
            if (selectorIsMissing) {
              onDiagnostic?.('ui.addRow.blocked', { groupId: q.id, reason: 'sectionSelector.required', selectorId: selectorCfg?.id });
              return;
            }
            const anchorField = (q.lineItemConfig?.fields || []).find(f => f.id === q.lineItemConfig?.anchorFieldId);
            if (!anchorField || anchorField.type !== 'CHOICE') {
              addLineItemRowManual(q.id);
              return;
            }
            const key = optionKey(anchorField.id, q.id);
            let opts = optionState[key];
            if (!opts && anchorField.dataSource) {
              const loaded =
                peekOptionsFromDataSource(anchorField.dataSource, language) ||
                (await loadOptionsFromDataSource(anchorField.dataSource, language));
              if (loaded) {
                opts = loaded;
                setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, q.id, loaded));
              }
            }
            if (!opts) opts = resolveOptionSetForField(optionState, anchorField, q.id);
            const dependencyIds = (
              Array.isArray(anchorField.optionFilter?.dependsOn)
                ? anchorField.optionFilter?.dependsOn
                : [anchorField.optionFilter?.dependsOn || '']
            ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
            const depVals = dependencyIds.map(dep => toDependencyValue(values[dep]));
            const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
            const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
            const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
            const overlayOptions = localized
              .filter(opt => deduped.includes(opt.value))
              .map(opt => ({
                value: opt.value,
                label: opt.label,
                searchText: opt.searchText
              }));
            const indexedCount = overlayOptions.filter(opt => opt.searchText).length;
            onDiagnostic?.('ui.lineItems.overlay.open', {
              groupId: q.id,
              optionCount: overlayOptions.length,
              indexedCount
            });
            const addOverlayCopy = resolveAddOverlayCopy(q.lineItemConfig, language);
            if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.searchHelperText || addOverlayCopy.placeholder) {
              onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                groupId: q.id,
                scope: 'lineItemGroup',
                hasTitle: !!addOverlayCopy.title,
                hasHelperText: !!addOverlayCopy.helperText,
                hasSearchHelperText: !!addOverlayCopy.searchHelperText,
                hasPlaceholder: !!addOverlayCopy.placeholder
              });
            }
            setOverlay({
              open: true,
              options: overlayOptions,
              groupId: q.id,
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
    const addLineLabel = resolveLocalizedString(
      q.lineItemConfig?.addButtonLabel,
      language,
      tSystem('lineItems.addLine', language, 'Add line')
    );
    return (
      <button
        type="button"
        className="ck-list-row-action-btn"
        disabled={submitting || selectorIsMissing}
        onClick={() => {
          const selectorNow = (latestSectionSelectorValueRef.current || selectorValue || '').toString().trim();
          const anchorFieldId = normalizeAnchorFieldId(q.lineItemConfig);
          const selectorPreset = anchorFieldId && selectorNow ? { [anchorFieldId]: selectorNow } : undefined;
          addLineItemRowManual(q.id, selectorPreset);
        }}
        style={withListRowActionButtonStyle(submitting || selectorIsMissing)}
      >
        <PlusIcon />
        {addLineLabel}
      </button>
    );
  };

  const selectorSearchKey = selectorCfg ? `${q.id}::${selectorCfg.id}` : '';
  if (selectorCfg && useSelectorSearch) {
    const indexedCount = selectorOptions.filter(opt => !!opt.searchText).length;
    if (indexedCount && selectorSearchKey && !selectorSearchLoggedRef.current.has(selectorSearchKey)) {
      selectorSearchLoggedRef.current.add(selectorSearchKey);
      onDiagnostic?.('ui.lineItems.selector.search.multiField', {
        groupId: q.id,
        selectorId: selectorCfg.id,
        optionCount: selectorOptions.length,
        indexedCount
      });
    }
  }
  if (isSelectorOverlayMode && !canUseSelectorOverlay) {
    const invalidKey = `${q.id}::selectorOverlay:invalid`;
    if (!selectorOverlayLoggedRef.current.has(invalidKey)) {
      selectorOverlayLoggedRef.current.add(invalidKey);
      onDiagnostic?.('ui.lineItems.selectorOverlay.invalidConfig', {
        groupId: q.id,
        selectorId: selectorCfg?.id || null,
        anchorFieldId: selectorOverlayAnchorFieldId || null
      });
    }
  }
  const selectorOverlayOptions = (() => {
    if (!canUseSelectorOverlay || !selectorOverlayAnchorField) return [];
    ensureLineOptions(q.id, selectorOverlayAnchorField);
    const optionSetField = buildOptionSetForLineField(selectorOverlayAnchorField, q.id);
    const dependencyIds = (
      Array.isArray(selectorOverlayAnchorField.optionFilter?.dependsOn)
        ? selectorOverlayAnchorField.optionFilter?.dependsOn
        : [selectorOverlayAnchorField.optionFilter?.dependsOn || '']
    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const depVals = dependencyIds.map(dep => toDependencyValue(values[dep]));
    let allowed = computeAllowedOptions(selectorOverlayAnchorField.optionFilter, optionSetField, depVals);
    if (selectorCfg?.optionFilter) {
      const selectorAllowed = computeAllowedOptions(selectorCfg.optionFilter, optionSetField, selectorDepVals);
      if (selectorAllowed.length) {
        const selectorAllowedSet = new Set(selectorAllowed);
        allowed = allowed.filter(val => selectorAllowedSet.has(val));
      }
    }
    const localized = buildLocalizedOptions(optionSetField, allowed, language, {
      sort: optionSortFor(selectorOverlayAnchorField)
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
  if (canUseSelectorOverlay && selectorOverlayOptions.length) {
    const overlayKey = `${q.id}::selectorOverlay`;
    const indexedCount = selectorOverlayOptions.filter(opt => opt.searchText).length;
    if (!selectorOverlayLoggedRef.current.has(overlayKey)) {
      selectorOverlayLoggedRef.current.add(overlayKey);
      onDiagnostic?.('ui.lineItems.selectorOverlay.enabled', {
        groupId: q.id,
        anchorFieldId: selectorOverlayAnchorFieldId,
        optionCount: selectorOverlayOptions.length,
        indexedCount
      });
    }
  }
  const selectorHideLabel = Boolean((selectorCfg as any)?.hideLabel || (selectorCfg as any)?.ui?.hideLabel);
  React.useEffect(() => {
    if (!onDiagnostic || !selectorCfg || !selectorHideLabel) return;
    const key = `${q.id}::${selectorCfg.id}::selectorLabelHidden`;
    if (selectorLabelLoggedRef.current.has(key)) return;
    selectorLabelLoggedRef.current.add(key);
    onDiagnostic('ui.lineItems.selector.hideLabel', { groupId: q.id, selectorId: selectorCfg.id });
  }, [onDiagnostic, q.id, selectorCfg, selectorHideLabel, selectorLabelLoggedRef]);

  const selectorControl =
    selectorCfg && (canUseSelectorOverlay ? selectorOverlayOptions.length : selectorOptions.length) ? (
      <div
        className="section-selector"
        data-field-path={selectorCfg.id}
        style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <label style={selectorHideLabel ? srOnly : { fontWeight: 600 }}>
          {resolveSelectorLabel(selectorCfg, language)}
          {selectorCfg.required && !selectorHideLabel && <RequiredStar />}
        </label>
        {canUseSelectorOverlay ? (
          <LineItemMultiAddSelect
            label={resolveSelectorLabel(selectorCfg, language)}
            language={language}
            options={selectorOverlayOptions}
            disabled={submitting}
            placeholder={
              resolveSelectorPlaceholder(selectorCfg, language) ||
              tSystem('lineItems.selectLinesSearch', language, 'Search items')
            }
            helperText={resolveSelectorHelperText(selectorCfg, language) || undefined}
            emptyText={tSystem('common.noMatches', language, 'No matches.')}
            onDiagnostic={(event, payload) =>
              onDiagnostic?.(event, {
                scope: 'lineItems.selectorOverlay',
                groupId: q.id,
                fieldId: selectorCfg.id,
                ...(payload || {})
              })
            }
            onAddSelected={valuesToAdd => {
              if (submitting) return;
              if (!selectorOverlayAnchorFieldId) return;
              const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
              if (!deduped.length) return;
              const duplicateValues: string[] = [];
              let duplicateMessage = '';
              deduped.forEach(val => {
                const result = addLineItemRowManual(q.id, { [selectorOverlayAnchorFieldId]: val });
                if (result?.status === 'duplicate') {
                  duplicateValues.push(val);
                  if (!duplicateMessage && result.message) duplicateMessage = result.message;
                }
              });
              if (duplicateValues.length) {
                return { duplicateValues, message: duplicateMessage };
              }
              return { addedValues: deduped };
            }}
          />
        ) : useSelectorSearch ? (
          <SearchableSelect
            value={selectorValue || ''}
            disabled={submitting}
            placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
            emptyText={tSystem('common.noMatches', language, 'No matches.')}
            options={selectorOptions.map(opt => ({
              value: opt.value,
              label: opt.label,
              searchText: opt.searchText
            }))}
            onDiagnostic={(event, payload) =>
              onDiagnostic?.(event, { scope: 'lineItems.selector', fieldId: selectorCfg.id, ...(payload || {}) })
            }
            onChange={nextVal => {
              latestSectionSelectorValueRef.current = nextVal;
              setValues(prev => {
                if (prev[selectorCfg.id] === nextVal) return prev;
                return { ...prev, [selectorCfg.id]: nextVal };
              });
            }}
          />
        ) : (
          <select
            value={selectorValue}
            onChange={e => {
              const nextVal = e.target.value;
              latestSectionSelectorValueRef.current = nextVal;
              setValues(prev => {
                if (prev[selectorCfg.id] === nextVal) return prev;
                return { ...prev, [selectorCfg.id]: nextVal };
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
    ) : null;
  const liUi = q.lineItemConfig?.ui;
  const addButtonPlacement = (liUi?.addButtonPlacement || 'both').toString().toLowerCase();
  const showAddTop =
    !canUseSelectorOverlay &&
    addButtonPlacement !== 'hidden' &&
    (addButtonPlacement === 'both' || addButtonPlacement === 'top');
  const showAddBottom =
    !canUseSelectorOverlay &&
    addButtonPlacement !== 'hidden' &&
    (addButtonPlacement === 'both' || addButtonPlacement === 'bottom');
  const showSelectorTop =
    Boolean(selectorControl) &&
    (canUseSelectorOverlay
      ? addButtonPlacement !== 'hidden' && addButtonPlacement !== 'bottom'
      : showAddTop);
  const showSelectorBottom =
    Boolean(selectorControl) &&
    (canUseSelectorOverlay ? addButtonPlacement !== 'hidden' && addButtonPlacement === 'bottom' : showAddBottom);

  return {
    selectorCfg,
    selectorValue,
    selectorOptions,
    selectorControl,
    renderAddButton,
    canUseSelectorOverlay,
    showAddTop,
    showAddBottom,
    showSelectorTop,
    showSelectorBottom,
    useSelectorSearch
  };
};
