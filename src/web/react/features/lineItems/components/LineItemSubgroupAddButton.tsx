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
import type { FieldValue, LangCode, OptionSet } from '../../../../types';
import type { OptionState } from '../../../types';
import { buttonStyles, PlusIcon } from '../../../components/form/ui';
import { resolveAddOverlayCopy } from '../domain/addOverlayCopy';
import { optionSortFor } from '../domain/lineItemPresentation';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';

type LineItemSubgroupAddButtonProps = {
  sub: any;
  subKey: string;
  rowValues: Record<string, FieldValue>;
  values: Record<string, FieldValue>;
  language: LangCode;
  submitting: boolean;
  optionState: OptionState;
  isOverlayAddMode: boolean;
  canUseSelectorOverlay: boolean;
  selectorIsMissing: boolean;
  selectorCfg?: any;
  getCurrentSelectorValue: () => string;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  addLineItemRowManual: (groupId: string, preset?: Record<string, FieldValue>) => void;
  setOverlay: (overlay: any) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

const normalizeAnchorFieldId = (sub: any): string =>
  sub?.anchorFieldId !== undefined && sub?.anchorFieldId !== null ? sub.anchorFieldId.toString() : '';

/**
 * Owner: line-items feature renderer.
 * Handles subgroup add-row button behavior, including anchor-option autofill
 * and overlay add mode, while callers own line-item state mutation callbacks.
 */
export const LineItemSubgroupAddButton: React.FC<LineItemSubgroupAddButtonProps> = ({
  sub,
  subKey,
  rowValues,
  values,
  language,
  submitting,
  optionState,
  isOverlayAddMode,
  canUseSelectorOverlay,
  selectorIsMissing,
  selectorCfg,
  getCurrentSelectorValue,
  setOptionState,
  addLineItemRowManual,
  setOverlay,
  onDiagnostic
}) => {
  const loadAnchorOptions = async (anchorField: any): Promise<OptionSet> => {
    const key = optionKey(anchorField.id, subKey);
    let opts = optionState[key];
    if (!opts && anchorField.dataSource) {
      const loaded =
        peekOptionsFromDataSource(anchorField.dataSource, language) ||
        (await loadOptionsFromDataSource(anchorField.dataSource, language));
      if (loaded) {
        opts = loaded;
        setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, subKey, loaded));
      }
    }
    return opts || resolveOptionSetForField(optionState, anchorField, subKey);
  };

  const resolveAnchorOptions = async (anchorField: any, selectorValue: string) => {
    const opts = await loadAnchorOptions(anchorField);
    const dependencyIds = (
      Array.isArray(anchorField.optionFilter?.dependsOn)
        ? anchorField.optionFilter?.dependsOn
        : [anchorField.optionFilter?.dependsOn || '']
    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
    const depVals = dependencyIds.map((dep: string) => toDependencyValue(rowValues[dep] ?? values[dep] ?? selectorValue));
    const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
    return buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
  };

  if (isOverlayAddMode && sub.anchorFieldId) {
    return (
      <button
        type="button"
        style={buttonStyles.secondary}
        disabled={submitting || selectorIsMissing}
        onClick={async () => {
          const selectorValue = getCurrentSelectorValue();
          if (submitting) return;
          if (selectorIsMissing) {
            onDiagnostic?.('ui.addRow.blocked', {
              groupId: subKey,
              reason: 'sectionSelector.required',
              selectorId: selectorCfg?.id
            });
            return;
          }
          const anchorField = (sub.fields || []).find((field: any) => field.id === sub.anchorFieldId);
          if (!anchorField || anchorField.type !== 'CHOICE') {
            addLineItemRowManual(subKey);
            return;
          }
          const localized = await resolveAnchorOptions(anchorField, selectorValue);
          const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
          const optionsForOverlay = localized
            .filter(opt => deduped.includes(opt.value))
            .map(opt => ({ value: opt.value, label: opt.label, searchText: opt.searchText }));
          if (optionsForOverlay.length === 1) {
            onDiagnostic?.('ui.subgroup.addRow.autofillSingleOption', {
              groupId: subKey,
              anchorFieldId: anchorField.id,
              value: optionsForOverlay[0].value
            });
            addLineItemRowManual(subKey, { [anchorField.id]: optionsForOverlay[0].value });
            return;
          }
          onDiagnostic?.('ui.lineItems.overlay.open', {
            groupId: subKey,
            optionCount: optionsForOverlay.length,
            indexedCount: optionsForOverlay.filter(opt => opt.searchText).length
          });
          const addOverlayCopy = resolveAddOverlayCopy(sub, language);
          if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.placeholder) {
            onDiagnostic?.('ui.lineItems.overlay.copy.override', {
              groupId: subKey,
              scope: 'subgroup',
              hasTitle: !!addOverlayCopy.title,
              hasHelperText: !!addOverlayCopy.helperText,
              hasPlaceholder: !!addOverlayCopy.placeholder
            });
          }
          setOverlay({
            open: true,
            options: optionsForOverlay,
            groupId: subKey,
            anchorFieldId: anchorField.id,
            selected: [],
            title: addOverlayCopy.title,
            helperText: addOverlayCopy.helperText,
            placeholder: addOverlayCopy.placeholder
          });
        }}
      >
        <PlusIcon />
        {resolveLocalizedString(sub.addButtonLabel, language, tSystem('lineItems.addLines', language, 'Add lines'))}
      </button>
    );
  }

  if (canUseSelectorOverlay) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={submitting || selectorIsMissing}
      onClick={async () => {
        const selectorValue = getCurrentSelectorValue();
        const anchorFieldId = normalizeAnchorFieldId(sub);
        const selectorPreset = anchorFieldId && selectorValue ? { [anchorFieldId]: selectorValue } : undefined;
        if (selectorPreset) {
          addLineItemRowManual(subKey, selectorPreset);
          return;
        }
        const anchorField = anchorFieldId ? (sub.fields || []).find((field: any) => field.id === anchorFieldId) : undefined;
        if (!anchorField || anchorField.type !== 'CHOICE') {
          addLineItemRowManual(subKey);
          return;
        }
        const localized = await resolveAnchorOptions(anchorField, selectorValue);
        const uniqueValues = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
        if (uniqueValues.length === 1) {
          onDiagnostic?.('ui.subgroup.addRow.autofillSingleOption', {
            groupId: subKey,
            anchorFieldId: anchorField.id,
            value: uniqueValues[0]
          });
          addLineItemRowManual(subKey, { [anchorField.id]: uniqueValues[0] });
          return;
        }
        addLineItemRowManual(subKey);
      }}
      className="ck-list-row-action-btn"
      style={withListRowActionButtonStyle(submitting || selectorIsMissing)}
    >
      <PlusIcon />
      {resolveLocalizedString(sub.addButtonLabel, language, 'Add line')}
    </button>
  );
};
