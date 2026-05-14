import React from 'react';

import { matchesWhenClause } from '../../../../core';
import type { FieldValue, LangCode, LineItemRowState, VisibilityContext } from '../../../../types';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import {
  resolveSourceFirstRowSortMode,
  shouldShowSourceFirstAllocationLabel
} from '../../../app/sourceFirstAllocations';
import {
  buildUtilisationFieldPatch,
  shouldDeferUtilisationSync
} from '../../../components/form/utilisationSyncPolicy';
import {
  buildSourceFirstSelectionTogglePatch,
  collectSourceFirstSentenceFieldErrorMap,
  collectSourceFirstSentenceFieldErrors,
  resolveSourceFirstAllocationDisplayValue,
  resolveSourceFirstCompactTextParts,
  resolveSourceFirstListScrollStyle,
  sortSourceFirstVisibleSourceRows
} from '../domain/lineItemPresentation';
import { shouldKeepInvalidSourceFirstQuantityDraft } from '../domain/sourceFirstUtilisationDraftDecision';
import { SourceFirstAllocationRow } from './SourceFirstAllocationRow';
import { SourceFirstSentenceParts } from './SourceFirstSentenceParts';

type SourceFirstPresentationEntry = {
  config: any;
  sourceRows: any[];
  visibleSourceRows: Array<{
    sourceRow: Record<string, any>;
    eligibleParents: LineItemRowState[];
  }>;
  emptyStateMessage: string;
};

type SourceFirstSyncArgs = {
  config: any;
  parentRow: LineItemRowState;
  sourceRow: Record<string, any>;
  patch: Record<string, FieldValue>;
};

/**
 * Renders the source-first allocation list for a line-item group. Data loading and
 * utilisation persistence stay injected by LineItemGroupQuestion through callbacks.
 */
export const SourceFirstAllocationList: React.FC<{
  entries: SourceFirstPresentationEntry[];
  language: LangCode;
  parentRows: LineItemRowState[];
  lineItems: LineItemState;
  stepDataSourceDrafts: Record<string, Record<string, FieldValue>>;
  buildVirtualDataSourceRowValues: (args: {
    config: any;
    sourceRow: Record<string, any>;
    outputRow?: LineItemRowState | null;
    draftValues?: Record<string, FieldValue> | null;
    parentRowId?: string;
  }) => Record<string, FieldValue>;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  resolveDataSourceOutputGroup: (config: any, parentRowId: string) => { key: string; subConfig: any | null } | null;
  resolveVirtualRowWhenContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  validateVirtualFieldRules: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => string[];
  isLineFieldInteractionBlocked: (field: any) => boolean;
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
  seedUtilisationCommittedValues: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    virtualValues: Record<string, FieldValue>;
  }) => void;
  stageStepDataSourceDraftPatch: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    virtualValues: Record<string, FieldValue>;
    patch: Record<string, FieldValue>;
  }) => void;
  queueDeferredStepUtilisationSync: (args: {
    config: any;
    parentRow: LineItemRowState;
    sourceRow: Record<string, any>;
    sourceKey: string;
    patch: Record<string, FieldValue>;
  }) => void;
  hasPendingDeferredUtilisationChange: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    patch: Record<string, FieldValue>;
  }) => boolean;
  cancelDeferredStepUtilisationSync: (args: { parentRowId: string; sourceKey: string }) => void;
  scheduleDeferredStepUtilisationAutoSaveHoldRelease: () => void;
  syncStepDataSourceOutputRowWithUtilisation: (
    args: SourceFirstSyncArgs,
    options?: { skipUtilisation?: boolean }
  ) => void;
}> = ({
  entries,
  language,
  parentRows,
  lineItems,
  stepDataSourceDrafts,
  buildVirtualDataSourceRowValues,
  buildStepDataSourceDraftKey,
  resolveDataSourceOutputGroup,
  resolveVirtualRowWhenContext,
  validateVirtualFieldRules,
  isLineFieldInteractionBlocked,
  allowsVirtualIntegerOnly,
  resolveVirtualMaxFieldId,
  toFiniteNumber,
  seedUtilisationCommittedValues,
  stageStepDataSourceDraftPatch,
  queueDeferredStepUtilisationSync,
  hasPendingDeferredUtilisationChange,
  cancelDeferredStepUtilisationSync,
  scheduleDeferredStepUtilisationAutoSaveHoldRelease,
  syncStepDataSourceOutputRowWithUtilisation
}) => {
  if (!entries.length) return null;

  const resolveDisplayValue = (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ): string => resolveSourceFirstAllocationDisplayValue({ field, virtualValues, parentValues, language });

  const resolveCompactTextParts = (
    parts: any[],
    virtualValues: Record<string, FieldValue>,
    sourceRow: Record<string, any>,
    fieldById: Map<string, any>,
    parentValues: Record<string, FieldValue>
  ): string =>
    resolveSourceFirstCompactTextParts({
      parts,
      virtualValues,
      sourceRow,
      fieldById,
      parentValues,
      language
    });

  const renderAllocationSentenceParts = (args: {
    config: any;
    parentRow: LineItemRowState;
    sourceRow: Record<string, any>;
    virtualValues: Record<string, FieldValue>;
    fieldById: Map<string, any>;
    selectedFieldId: string;
    sentenceParts: any[];
    fieldErrors?: Record<string, string>;
  }): React.ReactNode => (
    <SourceFirstSentenceParts
      idBase={args.parentRow.id}
      language={language}
      parentRow={args.parentRow}
      sourceRow={args.sourceRow}
      virtualValues={args.virtualValues}
      fieldById={args.fieldById}
      sentenceParts={args.sentenceParts}
      disabledForField={isLineFieldInteractionBlocked}
      resolveDisplayValue={resolveDisplayValue}
      resolveIntegerOnly={allowsVirtualIntegerOnly}
      resolveMaxFieldId={resolveVirtualMaxFieldId}
      toFiniteNumber={toFiniteNumber}
      fieldErrors={args.fieldErrors}
      onNumberChange={({ fieldId, value, virtualValues, sourceRow }) => {
        const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
        const patch = buildUtilisationFieldPatch({
          fieldId,
          value,
          selectedFieldId: args.selectedFieldId,
          selectedValue: args.selectedFieldId ? virtualValues[args.selectedFieldId] : true,
          quantityFieldId
        }) as Record<string, FieldValue>;
        const deferUtilisation = shouldDeferUtilisationSync({
          patch,
          selectedFieldId: args.selectedFieldId,
          quantityFieldId
        });
        const sourceKey = `${sourceRow?.[(args.config?.rowKeyFieldId || '').toString().trim()] ?? ''}`.trim();
        if (deferUtilisation) {
          seedUtilisationCommittedValues({
            config: args.config,
            parentRowId: args.parentRow.id,
            sourceKey,
            virtualValues
          });
        }
        const quantityNumber = Number(value);
        const shouldStageDeferredQuantityEdit =
          deferUtilisation &&
          !!quantityFieldId &&
          fieldId === quantityFieldId &&
          (isEmptyValue(value as any) || (Number.isFinite(quantityNumber) && quantityNumber <= 0));
        if (shouldStageDeferredQuantityEdit) {
          stageStepDataSourceDraftPatch({
            config: args.config,
            parentRowId: args.parentRow.id,
            sourceKey,
            virtualValues,
            patch
          });
          queueDeferredStepUtilisationSync({
            config: args.config,
            parentRow: args.parentRow,
            sourceRow,
            sourceKey,
            patch
          });
          return;
        }
        syncStepDataSourceOutputRowWithUtilisation({
          config: args.config,
          parentRow: args.parentRow,
          sourceRow,
          patch
        }, {
          skipUtilisation: deferUtilisation
        });
        if (deferUtilisation) {
          queueDeferredStepUtilisationSync({
            config: args.config,
            parentRow: args.parentRow,
            sourceRow,
            sourceKey,
            patch
          });
        }
      }}
      onNumberBlur={({ fieldId, value, virtualValues, sourceRow }) => {
        const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
        const patch = buildUtilisationFieldPatch({
          fieldId,
          value,
          selectedFieldId: args.selectedFieldId,
          selectedValue: args.selectedFieldId ? virtualValues[args.selectedFieldId] : true,
          quantityFieldId
        }) as Record<string, FieldValue>;
        const sourceKey = `${sourceRow?.[(args.config?.rowKeyFieldId || '').toString().trim()] ?? ''}`.trim();
        if (!sourceKey) {
          scheduleDeferredStepUtilisationAutoSaveHoldRelease();
          return;
        }
        const deferUtilisation = shouldDeferUtilisationSync({
          patch,
          selectedFieldId: args.selectedFieldId,
          quantityFieldId
        });
        if (!deferUtilisation) return;
        if (
          shouldKeepInvalidSourceFirstQuantityDraft({
            fieldId,
            quantityFieldId,
            value: value as FieldValue
          })
        ) {
          cancelDeferredStepUtilisationSync({
            parentRowId: args.parentRow.id,
            sourceKey
          });
          scheduleDeferredStepUtilisationAutoSaveHoldRelease();
          return;
        }
        if (deferUtilisation) {
          if (!hasPendingDeferredUtilisationChange({
            config: args.config,
            parentRowId: args.parentRow.id,
            sourceKey,
            patch
          })) {
            scheduleDeferredStepUtilisationAutoSaveHoldRelease();
            return;
          }
        }
        cancelDeferredStepUtilisationSync({
          parentRowId: args.parentRow.id,
          sourceKey
        });
        syncStepDataSourceOutputRowWithUtilisation({
          config: args.config,
          parentRow: args.parentRow,
          sourceRow,
          patch
        });
        if (deferUtilisation) {
          scheduleDeferredStepUtilisationAutoSaveHoldRelease();
        }
      }}
      onChoiceChange={({ fieldId, value, virtualValues, sourceRow }) => {
        if (`${value ?? ''}` === `${virtualValues[fieldId] ?? ''}`) return;
        syncStepDataSourceOutputRowWithUtilisation({
          config: args.config,
          parentRow: args.parentRow,
          sourceRow,
          patch: {
            ...(args.selectedFieldId ? { [args.selectedFieldId]: true } : {}),
            [fieldId]: value
          }
        });
      }}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
      {entries.map((entry, configIndex: number) => {
        const { config, sourceRows, visibleSourceRows, emptyStateMessage } = entry;
        if (!sourceRows.length && !emptyStateMessage) return null;
        const uiCfg = config?.ui && typeof config.ui === 'object' ? config.ui : {};
        const fields = Array.isArray(config?.fields) ? (config.fields as any[]) : [];
        const fieldById = new Map<string, any>();
        fields.forEach(field => {
          const id = field?.id ? field.id.toString() : '';
          if (id) fieldById.set(id, field);
        });
        const compactHeadlineRows = Array.isArray(uiCfg.compactHeadlineRows) ? (uiCfg.compactHeadlineRows as any[]) : [];
        const compactDetailRows = Array.isArray(uiCfg.compactDetailRows) ? (uiCfg.compactDetailRows as any[]) : [];
        const compactSentenceRows = Array.isArray(uiCfg.compactSentenceRows) ? (uiCfg.compactSentenceRows as any[]) : [];
        const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
        const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
        const allocationLabelFieldId = `${config?.allocationLabelFieldId || uiCfg?.allocationLabelFieldId || ''}`.trim();
        const showAllocationLabel = shouldShowSourceFirstAllocationLabel({
          allocationLabelFieldId,
          allocationLabelVisibility: config?.allocationLabelVisibility ?? uiCfg?.allocationLabelVisibility,
          parentRows
        });
        const listScrollStyle = resolveSourceFirstListScrollStyle(uiCfg?.maxVisibleRows);
        if (!visibleSourceRows.length) {
          return emptyStateMessage ? (
            <div key={`source-first:${config.id || configIndex}`} style={listScrollStyle}>
              <div
                style={{
                  padding: '12px 0',
                  lineHeight: 1.4,
                  color: 'var(--muted)'
                }}
              >
                {emptyStateMessage}
              </div>
            </div>
          ) : null;
        }
        const sourceFirstRowSortMode = resolveSourceFirstRowSortMode(
          config?.sourceFirstRowSort ?? uiCfg?.sourceFirstRowSort
        );
        const sortedVisibleSourceRows = sortSourceFirstVisibleSourceRows({
          rows: visibleSourceRows,
          sortMode: sourceFirstRowSortMode,
          config,
          compactHeadlineRows,
          fieldById,
          language,
          buildVirtualValues: ({ sourceRow, parentRow }) =>
            buildVirtualDataSourceRowValues({
              config,
              sourceRow,
              parentRowId: parentRow?.id
            }),
          matchesRule: ({ rule, virtualValues, parentValues }) =>
            !rule?.when ||
            matchesWhenClause(
              rule.when as any,
              resolveVirtualRowWhenContext({
                rowValues: virtualValues,
                parentValues
              })
            )
        });
        return (
          <div key={`source-first:${config.id || configIndex}`} style={listScrollStyle}>
            {sortedVisibleSourceRows.map(({ sourceRow, eligibleParents }, sourceIndex) => {
              const sourceKeyFieldId = `${config?.rowKeyFieldId || ''}`.trim();
              const sourceKey = sourceKeyFieldId ? `${sourceRow?.[sourceKeyFieldId] ?? ''}`.trim() : '';
              if (!sourceKey) return null;
              const anchorParentRow = eligibleParents[0];
              const headlineVirtualValues = buildVirtualDataSourceRowValues({
                config,
                sourceRow,
                parentRowId: anchorParentRow?.id
              });
              const headlineRule = compactHeadlineRows.find(rule =>
                !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                  rowValues: headlineVirtualValues,
                  parentValues: anchorParentRow?.values as Record<string, FieldValue>
                }))
              );
              const detailRule = compactDetailRows.find(rule =>
                !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                  rowValues: headlineVirtualValues,
                  parentValues: anchorParentRow?.values as Record<string, FieldValue>
                }))
              );
              const headlineText = headlineRule
                ? resolveCompactTextParts(
                    Array.isArray(headlineRule.parts) ? headlineRule.parts : [],
                    headlineVirtualValues,
                    sourceRow,
                    fieldById,
                    anchorParentRow?.values as Record<string, FieldValue>
                  )
                : '';
              const detailText = detailRule
                ? resolveCompactTextParts(
                    Array.isArray(detailRule.parts) ? detailRule.parts : [],
                    headlineVirtualValues,
                    sourceRow,
                    fieldById,
                    anchorParentRow?.values as Record<string, FieldValue>
                  )
                : '';
              return (
                <div
                  key={`source-first-row:${sourceKey}`}
                  style={{
                    padding: '12px 0',
                    borderBottom:
                      sourceIndex < sortedVisibleSourceRows.length - 1 ? '1px solid var(--border)' : undefined
                  }}
                >
                  {headlineText ? (
                    <div style={{ fontSize: 'calc(var(--ck-font-control) * 1.08)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                      {headlineText}
                    </div>
                  ) : null}
                  {detailText ? (
                    <div style={{ marginTop: 4, color: 'var(--muted)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                      {detailText}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {eligibleParents.map(parentRow => {
                      const output = resolveDataSourceOutputGroup(config, parentRow.id);
                      const outputRows = output ? lineItems[output.key] || [] : [];
                      const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
                      const existingOutputRow =
                        outputRows.find(candidate => `${(candidate.values as any)?.[outputKeyFieldId] ?? ''}`.trim() === sourceKey) || null;
                      const draftKey = buildStepDataSourceDraftKey(config, parentRow.id, sourceKey);
                      const virtualValues = buildVirtualDataSourceRowValues({
                        config,
                        sourceRow,
                        outputRow: existingOutputRow,
                        draftValues: stepDataSourceDrafts[draftKey] || null,
                        parentRowId: parentRow.id
                      });
                      const isSelected = selectedFieldId ? virtualValues[selectedFieldId] === true : true;
                      const sentenceRule = compactSentenceRows.find(rule =>
                        !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                          rowValues: virtualValues,
                          parentValues: parentRow.values as Record<string, FieldValue>
                        }))
                      );
                      const sentenceParts = Array.isArray(sentenceRule?.parts) ? (sentenceRule.parts as any[]) : [];
                      const sentenceFieldErrors = collectSourceFirstSentenceFieldErrors({
                        parts: sentenceParts,
                        fieldById,
                        virtualValues,
                        parentValues: parentRow.values as Record<string, FieldValue>,
                        validateFieldRules: validateVirtualFieldRules
                      });
                      const sentenceFieldErrorMap = collectSourceFirstSentenceFieldErrorMap({
                        parts: sentenceParts,
                        fieldById,
                        virtualValues,
                        parentValues: parentRow.values as Record<string, FieldValue>,
                        validateFieldRules: validateVirtualFieldRules
                      });
                      const buildSelectionTogglePatch = (checked: boolean): Record<string, any> =>
                        buildSourceFirstSelectionTogglePatch({
                          checked,
                          selectedFieldId,
                          virtualValues,
                          quantityFieldId,
                          modeFieldId: config?.modeFieldId,
                          defaultModeValue: config?.defaultModeValue,
                          fieldById,
                          parentValues: parentRow.values as Record<string, FieldValue>,
                          resolveMaxFieldId: resolveVirtualMaxFieldId
                        });
                      const allocationLabel = allocationLabelFieldId
                        ? `${parentRow.values[allocationLabelFieldId] ?? ''}`.trim()
                        : '';
                      return (
                        <SourceFirstAllocationRow
                          key={`allocation:${sourceKey}:${parentRow.id}`}
                          rowKey={`allocation:${sourceKey}:${parentRow.id}`}
                          showAllocationLabel={showAllocationLabel}
                          allocationLabel={allocationLabel}
                          showSelectionCheckbox={!!selectedFieldId}
                          selected={isSelected}
                          errors={Object.keys(sentenceFieldErrorMap).length ? [] : sentenceFieldErrors}
                          onSelectionChange={checked =>
                            syncStepDataSourceOutputRowWithUtilisation({
                              config,
                              parentRow,
                              sourceRow,
                              patch: buildSelectionTogglePatch(checked)
                            })
                          }
                        >
                          {renderAllocationSentenceParts({
                            config,
                            parentRow,
                            sourceRow,
                            virtualValues,
                            fieldById,
                            selectedFieldId,
                            sentenceParts,
                            fieldErrors: sentenceFieldErrorMap
                          })}
                        </SourceFirstAllocationRow>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
