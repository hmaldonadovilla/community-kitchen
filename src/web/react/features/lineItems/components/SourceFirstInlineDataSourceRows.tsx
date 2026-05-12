import React from 'react';

import { buildLocalizedOptions, matchesWhenClause, toOptionSet } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type { FieldValue, LangCode, LineItemRowState, VisibilityContext } from '../../../../types';
import { buildReservationFieldPatch, shouldDeferReservationSync } from '../../../components/form/reservationSyncPolicy';
import { toDateInputValue } from '../../../components/form/utils';
import type { LineItemState } from '../../../types';
import {
  buildSourceFirstSelectionTogglePatch,
  collectSourceFirstSentenceFieldErrorMap,
  collectSourceFirstSentenceFieldErrors,
  getByPath,
  optionSortFor,
  resolveSourceFirstListScrollStyle
} from '../domain/lineItemPresentation';
import { SourceFirstDataSourceActions } from './SourceFirstDataSourceActions';
import { SourceFirstDataSourceRowShell } from './SourceFirstDataSourceRowShell';
import { SourceFirstSentenceParts } from './SourceFirstSentenceParts';

type SourceFirstSyncArgs = {
  config: any;
  parentRow: LineItemRowState;
  sourceRow: Record<string, any>;
  patch: Record<string, FieldValue>;
};

type SourceFirstInlineDataSourceRowsProps = {
  activeStepDataSourceRows: any[];
  row: LineItemRowState;
  rowCollapsed: boolean;
  hideInlineSubgroups?: boolean;
  language: LangCode;
  lineItems: LineItemState;
  stepDataSourceDrafts: Record<string, Record<string, FieldValue>>;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
  resolveStepDataSourceRowsForParent: (config: any, parentRow: LineItemRowState) => any[];
  resolveDataSourceOutputGroup: (config: any, parentRowId: string) => { key: string; subConfig: any | null } | null;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  buildVirtualDataSourceRowValues: (args: {
    config: any;
    sourceRow: Record<string, any>;
    outputRow?: LineItemRowState | null;
    draftValues?: Record<string, FieldValue> | null;
    parentRowId?: string;
  }) => Record<string, FieldValue>;
  resolveVirtualRowWhenContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  validateVirtualFieldRules: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => string[];
  isLineFieldInputDisabled: (field: any) => boolean;
  allowsVirtualIntegerOnly: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => boolean;
  resolveVirtualMaxFieldId: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => string;
  toFiniteNumber: (value: any) => number;
  seedReservationCommittedValues: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    virtualValues: Record<string, FieldValue>;
  }) => void;
  queueDeferredStepReservationSync: (args: {
    config: any;
    parentRow: LineItemRowState;
    sourceRow: Record<string, any>;
    sourceKey: string;
    patch: Record<string, FieldValue>;
  }) => void;
  hasPendingDeferredReservationChange: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    patch: Record<string, FieldValue>;
  }) => boolean;
  cancelDeferredStepReservationSync: (args: { parentRowId: string; sourceKey: string }) => void;
  syncStepDataSourceOutputRowWithReservation: (
    args: SourceFirstSyncArgs,
    options?: { skipReservation?: boolean }
  ) => void;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  openInfoOverlay: React.ComponentProps<typeof SourceFirstDataSourceActions>['openInfoOverlay'];
  openLineItemGroupOverlay: React.ComponentProps<typeof SourceFirstDataSourceActions>['openLineItemGroupOverlay'];
};

export const SourceFirstInlineDataSourceRows: React.FC<SourceFirstInlineDataSourceRowsProps> = ({
  activeStepDataSourceRows,
  row,
  rowCollapsed,
  hideInlineSubgroups,
  language,
  lineItems,
  stepDataSourceDrafts,
  resolveTopValue,
  resolveStepDataSourceRowsForParent,
  resolveDataSourceOutputGroup,
  buildStepDataSourceDraftKey,
  buildVirtualDataSourceRowValues,
  resolveVirtualRowWhenContext,
  validateVirtualFieldRules,
  isLineFieldInputDisabled,
  allowsVirtualIntegerOnly,
  resolveVirtualMaxFieldId,
  toFiniteNumber,
  seedReservationCommittedValues,
  queueDeferredStepReservationSync,
  hasPendingDeferredReservationChange,
  cancelDeferredStepReservationSync,
  syncStepDataSourceOutputRowWithReservation,
  setLineItems,
  openInfoOverlay,
  openLineItemGroupOverlay
}) => {
  if (hideInlineSubgroups || rowCollapsed || !activeStepDataSourceRows.length) return null;

  const parentValues = (row.values || {}) as Record<string, FieldValue>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      {activeStepDataSourceRows.map((config: any, configIndex: number) => {
        const sourceRows = resolveStepDataSourceRowsForParent(config, row);
        if (!sourceRows.length) return null;
        const output = resolveDataSourceOutputGroup(config, row.id);
        const outputRows = output ? lineItems[output.key] || [] : [];
        const fields = Array.isArray(config?.fields) ? (config.fields as any[]) : [];
        const fieldById = new Map<string, any>();
        fields.forEach(field => {
          const id = field?.id ? field.id.toString() : '';
          if (id) fieldById.set(id, field);
        });
        const uiCfg = config?.ui && typeof config.ui === 'object' ? config.ui : {};
        const compactHeadlineRows = Array.isArray(uiCfg.compactHeadlineRows) ? (uiCfg.compactHeadlineRows as any[]) : [];
        const compactSentenceRows = Array.isArray(uiCfg.compactSentenceRows) ? (uiCfg.compactSentenceRows as any[]) : [];
        const compactActionRules = Array.isArray(uiCfg.compactActions) ? (uiCfg.compactActions as any[]) : [];
        const selectedFieldId = (config?.selectedFieldId || '').toString().trim();
        const outputKeyFieldId = (config?.outputKeyFieldId || config?.rowKeyFieldId || '').toString().trim();
        const listScrollStyle = resolveSourceFirstListScrollStyle(uiCfg?.maxVisibleRows);

        const resolveVirtualValue = (virtualValues: Record<string, FieldValue>, fieldId: string): FieldValue | undefined => {
          if (Object.prototype.hasOwnProperty.call(virtualValues, fieldId)) return virtualValues[fieldId];
          if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values as any)[fieldId];
          return resolveTopValue(fieldId);
        };

        const resolveVirtualDisplay = (virtualValues: Record<string, FieldValue>, field: any): string => {
          if (!field) return '';
          const raw = resolveVirtualValue(virtualValues, field.id);
          if (raw === undefined || raw === null || raw === '') return '';
          if (field.type === 'DATE') return toDateInputValue(raw);
          if (field.type === 'CHOICE' || field.type === 'CHECKBOX') {
            const optionSet = toOptionSet(field);
            const options = buildLocalizedOptions(optionSet, optionSet.en || [], language, {
              sort: optionSortFor(field)
            });
            const rawList = Array.isArray(raw) ? raw : [raw];
            return rawList
              .map(value => `${value ?? ''}`)
              .filter(Boolean)
              .map(value => options.find(option => option.value === value)?.label || value)
              .join(', ');
          }
          return `${raw}`;
        };

        const renderHeadlinePart = (
          part: any,
          virtualValues: Record<string, FieldValue>,
          sourceRow: Record<string, any>
        ): React.ReactNode => {
          if (!part || typeof part !== 'object') return null;
          if (((part.type || '').toString() || 'field') === 'text') {
            const text = resolveLocalizedString(part.text, language, '');
            return text ? <span key={`text:${text}`}>{text}</span> : null;
          }
          const fieldId = (part.fieldId || '').toString().trim();
          const sourcePath = (part.sourcePath || '').toString().trim();
          if (!fieldId && !sourcePath) return null;
          const field = fieldId ? fieldById.get(fieldId) : null;
          const display = (() => {
            if (sourcePath) {
              const raw = getByPath(sourceRow, sourcePath);
              if (raw !== undefined && raw !== null && `${raw}`.trim() !== '') return `${raw}`.trim();
            }
            if (!fieldId) return '';
            return field
              ? resolveVirtualDisplay(virtualValues, field)
              : `${resolveVirtualValue(virtualValues, fieldId) ?? ''}`.trim();
          })();
          const suffix = (() => {
            if (part.suffixFieldId) {
              const suffixField = fieldById.get((part.suffixFieldId || '').toString().trim());
              return suffixField ? resolveVirtualDisplay(virtualValues, suffixField) : `${resolveVirtualValue(virtualValues, part.suffixFieldId) ?? ''}`.trim();
            }
            if (part.suffixSourcePath) {
              return `${sourceRow?.[(part.suffixSourcePath || '').toString().trim()] ?? ''}`.trim();
            }
            return '';
          })();
          const combined = [display, suffix].filter(Boolean).join(' ');
          const keyId = fieldId || sourcePath || 'headline';
          return combined ? <span key={`field:${keyId}`}>{combined}</span> : null;
        };

        return (
          <div key={`ds:${config.id || configIndex}`} style={listScrollStyle}>
            {sourceRows.map((sourceRow: any, sourceIndex: number) => {
              const sourceKey = `${sourceRow?.[(config?.rowKeyFieldId || '').toString().trim()] ?? ''}`.trim();
              if (!sourceKey) return null;
              const existingOutputRow =
                outputRows.find(candidate => `${(candidate.values as any)?.[outputKeyFieldId] ?? ''}` === sourceKey) || null;
              const draftKey = buildStepDataSourceDraftKey(config, row.id, sourceKey);
              const virtualValues = buildVirtualDataSourceRowValues({
                config,
                sourceRow,
                outputRow: existingOutputRow,
                draftValues: stepDataSourceDrafts[draftKey] || null,
                parentRowId: row.id
              });
              const headlineRule = compactHeadlineRows.find(rule =>
                !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                  rowValues: virtualValues,
                  parentValues
                }))
              );
              const headlineNodes = Array.isArray(headlineRule?.parts)
                ? headlineRule.parts
                    .map((part: any) => renderHeadlinePart(part, virtualValues, sourceRow))
                    .filter(Boolean)
                : [];
              const sentenceRule = compactSentenceRows.find(rule =>
                !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                  rowValues: virtualValues,
                  parentValues
                }))
              );
              const sentenceParts = Array.isArray(sentenceRule?.parts) ? (sentenceRule.parts as any[]) : [];
              const isSelected = selectedFieldId ? virtualValues[selectedFieldId] === true : true;
              const sentenceFieldErrors = collectSourceFirstSentenceFieldErrors({
                parts: sentenceParts,
                fieldById,
                virtualValues,
                parentValues,
                validateFieldRules: validateVirtualFieldRules
              });
              const sentenceFieldErrorMap = collectSourceFirstSentenceFieldErrorMap({
                parts: sentenceParts,
                fieldById,
                virtualValues,
                parentValues,
                validateFieldRules: validateVirtualFieldRules
              });
              const buildSelectionTogglePatch = (checked: boolean): Record<string, any> =>
                buildSourceFirstSelectionTogglePatch({
                  checked,
                  selectedFieldId,
                  virtualValues,
                  quantityFieldId: config?.quantityFieldId,
                  modeFieldId: config?.modeFieldId,
                  defaultModeValue: config?.defaultModeValue,
                  fieldById,
                  parentValues,
                  resolveMaxFieldId: resolveVirtualMaxFieldId
                });
              const actionNodes = (
                <SourceFirstDataSourceActions
                  rules={compactActionRules}
                  config={config}
                  configIndex={configIndex}
                  row={row}
                  sourceRow={sourceRow}
                  sourceKey={sourceKey}
                  virtualValues={virtualValues}
                  language={language}
                  resolveVirtualRowWhenContext={resolveVirtualRowWhenContext}
                  resolveVirtualValue={resolveVirtualValue}
                  setLineItems={setLineItems}
                  openInfoOverlay={openInfoOverlay}
                  openLineItemGroupOverlay={openLineItemGroupOverlay}
                />
              );
              return (
                <SourceFirstDataSourceRowShell
                  key={`ds-row:${sourceKey}`}
                  rowKey={`ds-row:${sourceKey}`}
                  last={sourceIndex >= sourceRows.length - 1}
                  showSelectionCheckbox={!!selectedFieldId}
                  selected={isSelected}
                  headline={headlineNodes}
                  actions={actionNodes}
                  showSentence={!!sentenceParts.length && isSelected}
                  errors={Object.keys(sentenceFieldErrorMap).length ? [] : sentenceFieldErrors}
                  onSelectionChange={checked =>
                    syncStepDataSourceOutputRowWithReservation({
                      config,
                      parentRow: row,
                      sourceRow,
                      patch: buildSelectionTogglePatch(checked)
                    })
                  }
                >
                  <SourceFirstSentenceParts
                    idBase={sourceKey}
                    language={language}
                    parentRow={row}
                    sourceRow={sourceRow}
                    virtualValues={virtualValues}
                    fieldById={fieldById}
                    sentenceParts={sentenceParts}
                    disabledForField={isLineFieldInputDisabled}
                    resolveDisplayValue={(field, currentVirtualValues) =>
                      resolveVirtualDisplay(currentVirtualValues, field)
                    }
                    resolveIntegerOnly={allowsVirtualIntegerOnly}
                    resolveMaxFieldId={resolveVirtualMaxFieldId}
                    toFiniteNumber={toFiniteNumber}
                    clustered
                    compactChoicePlaceholder
                    onNumberChange={({ fieldId, value, virtualValues: currentVirtualValues }) => {
                      const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
                      const patch = buildReservationFieldPatch({
                        fieldId,
                        value,
                        selectedFieldId,
                        selectedValue: selectedFieldId ? currentVirtualValues[selectedFieldId] : true,
                        quantityFieldId
                      }) as Record<string, FieldValue>;
                      const deferReservation = shouldDeferReservationSync({
                        patch,
                        selectedFieldId,
                        quantityFieldId
                      });
                      if (deferReservation) {
                        seedReservationCommittedValues({
                          config,
                          parentRowId: row.id,
                          sourceKey,
                          virtualValues: currentVirtualValues
                        });
                      }
                      syncStepDataSourceOutputRowWithReservation({
                        config,
                        parentRow: row,
                        sourceRow,
                        patch
                      }, {
                        skipReservation: deferReservation
                      });
                      if (deferReservation) {
                        queueDeferredStepReservationSync({
                          config,
                          parentRow: row,
                          sourceRow,
                          sourceKey,
                          patch
                        });
                      }
                    }}
                    onNumberBlur={({ fieldId, value, virtualValues: currentVirtualValues }) => {
                      const patch = buildReservationFieldPatch({
                        fieldId,
                        value,
                        selectedFieldId,
                        selectedValue: selectedFieldId ? currentVirtualValues[selectedFieldId] : true,
                        quantityFieldId: `${config?.quantityFieldId || ''}`.trim()
                      }) as Record<string, FieldValue>;
                      if (
                        !hasPendingDeferredReservationChange({
                          config,
                          parentRowId: row.id,
                          sourceKey,
                          patch
                        })
                      ) {
                        return;
                      }
                      cancelDeferredStepReservationSync({
                        parentRowId: row.id,
                        sourceKey
                      });
                      syncStepDataSourceOutputRowWithReservation({
                        config,
                        parentRow: row,
                        sourceRow,
                        patch
                      });
                    }}
                    onChoiceChange={({ fieldId, value }) =>
                      syncStepDataSourceOutputRowWithReservation({
                        config,
                        parentRow: row,
                        sourceRow,
                        patch: {
                          ...(selectedFieldId ? { [selectedFieldId]: true } : {}),
                          [fieldId]: value
                        }
                      })
                    }
                    fieldErrors={sentenceFieldErrorMap}
                  />
                </SourceFirstDataSourceRowShell>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
