import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  matchesWhenClause,
  shouldHideField,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { peekCachedDataSource } from '../../../../data/dataSources';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  LineItemGroupConfigOverride,
  OptionSet,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_SOURCE_KEY,
  buildSubgroupKey,
  parseRowHideRemove,
  parseRowSource,
  resolveSubgroupKey
} from '../../../app/lineItems';
import { deriveCompactLineItemLayout } from '../../../app/compactLineItemLayout';
import { AutoWidthInput } from '../../../components/form/AutoWidthInput';
import { AutoWidthSelect } from '../../../components/form/AutoWidthSelect';
import { DateInput } from '../../../components/form/DateInput';
import { GroupedPairedFields } from '../../../components/form/GroupedPairedFields';
import { NumberStepper } from '../../../components/form/NumberStepper';
import { buttonStyles } from '../../../components/form/ui';
import {
  isUploadValueComplete,
  resolveFieldHelperText,
  toDateInputValue
} from '../../../components/form/utils';
import { resolveDerivedValue, resolveValueMapValue } from '../../../components/form/valueMaps';
import type { FormErrors, OptionState } from '../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { isEmptyValue } from '../../../utils/values';
import {
  coerceCompactItemsCollectionAction,
  getCompactSourceValueAction,
  mapCompactActionEntriesAction,
  normalizeCompactLookupValueAction
} from '../domain/compactLineItemRows';
import { optionSortFor } from '../domain/lineItemPresentation';
import { LineItemRemoveButton } from './LineItemRemoveButton';
import { renderLineItemSubgroupField } from './LineItemSubgroupFieldRenderer';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

type LineItemSubgroupRowsRendererProps = {
  q: WebQuestionDefinition;
  sub: any;
  subId: string;
  subKey: string;
  subUi: any;
  orderedSubRows: any[];
  row: { id: string; values: Record<string, FieldValue>; [key: string]: any };
  values: Record<string, FieldValue>;
  lineItems: Record<string, any[]>;
  subgroupSelectors: Record<string, string>;
  selectorCfg?: any;
  optionState: OptionState;
  language: LangCode;
  errors: FormErrors;
  submitting: boolean;
  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (key: string) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
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
  setLineItems: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  addLineItemRowManual: (groupId: string, preset?: Record<string, FieldValue>, options?: any) => void;
  removeLineRow: (groupId: string, rowId: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: line-items feature renderer.
 * Renders non-table subgroup rows, including compact row composition. Parent
 * components own subgroup selection, row ordering, and toolbar orchestration.
 */
export const LineItemSubgroupRowsRenderer: React.FC<LineItemSubgroupRowsRendererProps> = ({
  q,
  sub,
  subId,
  subKey,
  subUi,
  orderedSubRows,
  row,
  values,
  lineItems,
  subgroupSelectors,
  selectorCfg,
  optionState,
  language,
  errors,
  submitting,
  collapsedGroups,
  toggleGroupCollapsed,
  fileInputsRef,
  uploadAnnouncements,
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
  addLineItemRowManual,
  removeLineRow,
  setErrors,
  onDiagnostic
}) => (
  <>
    {orderedSubRows.map((subRow, subIdx) => {
      const subCtx: VisibilityContext = {
        getValue: fid => values[fid],
        getLineValue: (_rowId, fid) => subRow.values[fid],
        getLineItems: groupId => lineItems?.[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };
      const subGroupDef: WebQuestionDefinition = {
        ...(q as any),
        id: subKey,
        lineItemConfig: { ...(sub as any), fields: sub.fields || [], subGroups: [] }
      };
      const targetGroup = subGroupDef;
      const subRowSource = parseRowSource((subRow.values as any)?.[ROW_SOURCE_KEY]);
      const subHideRemoveButton = parseRowHideRemove((subRow.values as any)?.[ROW_HIDE_REMOVE_KEY]);
      const allowRemoveAutoSubRows = (sub as any)?.ui?.allowRemoveAutoRows !== false;
      const canRemoveSubRow = !subHideRemoveButton && (allowRemoveAutoSubRows || subRowSource !== 'auto');
      const useCompactSubRows = (subUi as any)?.compactRows === true;
      return (
        <div
          key={subRow.id}
          className="line-item-row"
          data-row-anchor={`${subKey}__${subRow.id}`}
          style={{
            background: 'transparent',
            padding: useCompactSubRows ? '10px 0' : 12,
            borderRadius: useCompactSubRows ? 0 : 10,
            border: useCompactSubRows ? 'none' : '1px solid var(--border)',
            borderBottom:
              useCompactSubRows && subIdx < orderedSubRows.length - 1 ? '1px solid var(--border)' : undefined,
            marginBottom: useCompactSubRows ? 0 : 10
          }}
        >
          {!subRow.autoGenerated && (
            <div style={{ marginBottom: 8 }}>
              <span className="pill">
                Manual
              </span>
            </div>
          )}
          {(() => {
            const renderSubField = (field: any, opts?: { inGrid?: boolean }) =>
              renderLineItemSubgroupField({
                field,
                opts,
                subKey,
                subRow,
                parentRowValues: row.values as Record<string, FieldValue>,
                values,
                selectorCfg,
                selectorValue: subgroupSelectors[subKey],
                targetGroup,
                optionState,
                language,
                errors,
                submitting,
                subCtx,
                fileInputsRef,
                uploadAnnouncements,
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
                setErrors,
                onDiagnostic
              });

            const visibleFields = (sub.fields || []).filter((field: any) => {
              const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
              return !hideField;
            });

            const compactLayout = useCompactSubRows ? deriveCompactLineItemLayout(visibleFields) : null;
            const allFieldById = new Map<string, any>(
              ((sub.fields || []) as any[]).map(field => [field.id.toString(), field] as const)
            );
            const visibleFieldById = new Map<string, any>(
              visibleFields.map((field: any) => [field.id.toString(), field] as const)
            );

            const resolveCompactFieldValue = (fieldId: string): any => {
              if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fieldId)) return (subRow.values || {})[fieldId];
              if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
              return values[fieldId];
            };
            const compactMappedValueCache = new Map<string, any>();
            const normalizeCompactLookupValue = normalizeCompactLookupValueAction;
            const getCompactSourceValue = getCompactSourceValueAction;
            const resolveCompactMappedValue = (fieldId: string): any => {
              if (compactMappedValueCache.has(fieldId)) return compactMappedValueCache.get(fieldId);
              const localValue = resolveCompactFieldValue(fieldId);
              if (localValue !== undefined && localValue !== null && `${localValue}` !== '') {
                compactMappedValueCache.set(fieldId, localValue);
                return localValue;
              }
              for (const candidateField of allFieldById.values()) {
                const effects = Array.isArray((candidateField as any)?.selectionEffects)
                  ? ((candidateField as any).selectionEffects as any[])
                  : [];
                if (!effects.length) continue;
                const matchedEffect = effects.find(effect => {
                  if (!effect || effect.type !== 'setValuesFromDataSource') return false;
                  const mapping = effect.fieldMapping && typeof effect.fieldMapping === 'object' ? effect.fieldMapping : {};
                  return Object.prototype.hasOwnProperty.call(mapping, fieldId);
                });
                if (!matchedEffect) continue;
                const mapping = matchedEffect.fieldMapping && typeof matchedEffect.fieldMapping === 'object'
                  ? matchedEffect.fieldMapping
                  : {};
                const sourcePath = mapping[fieldId];
                if (!sourcePath) continue;
                const selectedValue = resolveCompactFieldValue(candidateField.id);
                const normalizedSelected = normalizeCompactLookupValue(selectedValue);
                if (!normalizedSelected) continue;
                ensureLineOptions(subKey, candidateField);
                const optionSet = resolveOptionSetForField(optionState, candidateField, subKey) as any;
                const cachedDataSource = (candidateField as any)?.dataSource
                  ? peekCachedDataSource((candidateField as any).dataSource, language)
                  : null;
                const rawRows = Array.isArray(optionSet?.raw)
                  ? optionSet.raw
                  : Array.isArray((cachedDataSource as any)?.items)
                    ? (cachedDataSource as any).items
                    : Array.isArray(cachedDataSource)
                      ? cachedDataSource
                      : [];
                if (!rawRows.length) continue;
                const lookupField = `${matchedEffect.lookupField || candidateField.id}`.trim();
                if (!lookupField) continue;
                const matchedRow = rawRows.find((sourceRow: any) => {
                  const candidateValue =
                    getCompactSourceValue(sourceRow, lookupField) ??
                    getCompactSourceValue(sourceRow, '__ckOptionValue');
                  return normalizeCompactLookupValue(candidateValue) === normalizedSelected;
                });
                if (!matchedRow) continue;
                const mappedValue = getCompactSourceValue(matchedRow, sourcePath);
                if (mappedValue !== undefined && mappedValue !== null && `${mappedValue}` !== '') {
                  compactMappedValueCache.set(fieldId, mappedValue);
                  return mappedValue;
                }
              }
              compactMappedValueCache.set(fieldId, localValue);
              return localValue;
            };
            const resolveCompactSourceRows = (sourceField: any): any[] => {
              if (!sourceField) return [];
              ensureLineOptions(subKey, sourceField);
              const optionSet = resolveOptionSetForField(optionState, sourceField, subKey) as any;
              if (Array.isArray(optionSet?.raw) && optionSet.raw.length) return optionSet.raw;
              const cachedDataSource = (sourceField as any)?.dataSource
                ? peekCachedDataSource((sourceField as any).dataSource, language)
                : null;
              if (Array.isArray((cachedDataSource as any)?.items)) return (cachedDataSource as any).items;
              if (Array.isArray(cachedDataSource)) return cachedDataSource;
              return [];
            };
            const resolveCompactSourceRow = (
              sourceField: any,
              opts?: { lookupField?: string; selectedValue?: any }
            ): any | null => {
              if (!sourceField) return null;
              const selectedValue =
                opts && Object.prototype.hasOwnProperty.call(opts, 'selectedValue')
                  ? opts.selectedValue
                  : resolveCompactFieldValue(sourceField.id);
              const normalizedSelected = normalizeCompactLookupValue(selectedValue);
              if (!normalizedSelected) return null;
              const rawRows = resolveCompactSourceRows(sourceField);
              if (!rawRows.length) return null;
              const lookupField = `${opts?.lookupField || sourceField.id}`.trim();
              if (!lookupField) return null;
              return (
                rawRows.find((sourceRow: any) => {
                  const candidateValue =
                    getCompactSourceValue(sourceRow, lookupField) ??
                    getCompactSourceValue(sourceRow, '__ckOptionValue');
                  return normalizeCompactLookupValue(candidateValue) === normalizedSelected;
                }) || null
              );
            };
            const resolveCompactValueMapFallback = (field: any): any => {
              const valueMap = field?.valueMap;
              if (!valueMap || typeof valueMap !== 'object') return undefined;
              const optionMapRef = (valueMap as any).optionMapRef;
              if (!optionMapRef || typeof optionMapRef !== 'object') return undefined;
              const dependsOnRaw = (valueMap as any).dependsOn;
              const dependsOn = Array.isArray(dependsOnRaw)
                ? `${dependsOnRaw[0] || ''}`.trim()
                : `${dependsOnRaw || ''}`.trim();
              if (!dependsOn) return undefined;
              const sourceField = allFieldById.get(dependsOn);
              if (!sourceField) return undefined;
              const lookupField = `${(optionMapRef as any).keyColumn || sourceField.id || ''}`.trim();
              const lookupColumn = `${(optionMapRef as any).lookupColumn || ''}`.trim();
              if (!lookupField || !lookupColumn) return undefined;
              const sourceRow = resolveCompactSourceRow(sourceField, { lookupField });
              if (!sourceRow) return undefined;
              return getCompactSourceValue(sourceRow, lookupColumn);
            };

            const resolveCompactDisplay = (field: any): React.ReactNode => {
              if (!field) return null;
              switch (field.type) {
                case 'CHOICE': {
                  const rawVal = resolveCompactMappedValue(field.id);
                  const choiceVal =
                    Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                  const selected = optsFieldForCompact(field).find(opt => opt.value === choiceVal);
                  return selected?.label || choiceVal || null;
                }
                case 'CHECKBOX': {
                  const hasAnyOption =
                    !!((resolveOptionSetForField(optionState, field, subKey).en || []).length ||
                      (((resolveOptionSetForField(optionState, field, subKey) as any).fr || []).length) ||
                      (((resolveOptionSetForField(optionState, field, subKey) as any).nl || []).length));
                  const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                  if (isConsentCheckbox) {
                    return subRow.values[field.id]
                      ? tSystem('common.yes', language, 'Yes')
                      : tSystem('common.no', language, 'No');
                  }
                  const rawVal = resolveCompactMappedValue(field.id);
                  const selected = Array.isArray(rawVal) ? (rawVal as string[]) : [];
                  const localized = optsFieldForCompact(field);
                  const labels = selected
                    .map(val => localized.find(opt => opt.value === val)?.label || val)
                    .filter(Boolean);
                  return labels.length ? labels.join(', ') : null;
                }
                default: {
                  const mapped = field.valueMap
                    ? resolveValueMapValue(
                        field.valueMap,
                        (fid: string) => {
                          return resolveCompactMappedValue(fid);
                        },
                        { language, targetOptions: toOptionSet(field) }
                      )
                    : undefined;
                  const derived =
                    !field.valueMap && field.derivedValue
                      ? resolveDerivedValue(field.derivedValue, (fid: string) => {
                          return resolveCompactMappedValue(fid);
                        })
                      : undefined;
                  const fieldValueRaw =
                    field.valueMap
                      ? (mapped !== undefined && mapped !== null && mapped !== ''
                          ? mapped
                          : resolveCompactValueMapFallback(field))
                      : derived !== undefined && derived !== null && derived !== ''
                        ? derived
                        : resolveCompactMappedValue(field.id);
                  const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                  if (field.type === 'NUMBER') {
                    return fieldValue === undefined || fieldValue === null || fieldValue === '' ? null : `${fieldValue}`;
                  }
                  return fieldValue || null;
                }
              }
            };

            function optsFieldForCompact(field: any) {
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
                    selectorCfg && dep === selectorCfg.id ? subgroupSelectors[subKey] : undefined;
                  return toDependencyValue(subRow.values[dep] ?? values[dep] ?? row.values[dep] ?? selectorFallback);
                })
              );
              const currentVal = subRow.values[field.id];
              const allowedWithCurrent =
                currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                  ? [...allowedField, currentVal]
                  : allowedField;
              const selectedSub = Array.isArray(subRow.values[field.id])
                ? (subRow.values[field.id] as string[])
                : null;
              const allowedWithSelection =
                selectedSub && selectedSub.length
                  ? selectedSub.reduce((acc, val) => {
                      if (val && !acc.includes(val)) acc.push(val);
                      return acc;
                    }, [...allowedWithCurrent])
                  : allowedWithCurrent;
              return buildLocalizedOptions(optionSetField, allowedWithSelection, language, {
                sort: optionSortFor(field)
              });
            }

            const renderCompactControlField = (
              field: any,
              opts?: { compactInline?: boolean }
            ): React.ReactNode => {
              if (!field) return null;
              const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
              const labelText = resolveFieldLabel(field, language, field.id);
              const attachedDisplayIds = compactLayout?.attachedDisplayFieldIdsByControl[field.id] || [];
              const attachedDisplay = attachedDisplayIds
                .map(fid => resolveCompactDisplay(visibleFieldById.get(fid)))
                .filter(Boolean)
                .join(' ');
              const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
              const helperText = helperCfg.text;
              const supportsPlaceholder =
                field.type === 'TEXT' || field.type === 'PARAGRAPH' || field.type === 'NUMBER';
              const effectivePlacement =
                helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
              const helperId =
                helperText && effectivePlacement === 'belowLabel'
                  ? `ck-field-helper-${fieldPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                  : undefined;
              const helperNode =
                helperText && effectivePlacement === 'belowLabel' ? (
                  <div id={helperId} className="ck-field-helper">
                    {helperText}
                  </div>
                ) : null;
              const placeholder = helperText && effectivePlacement === 'placeholder' ? helperText : undefined;

              let controlNode: React.ReactNode = null;
              const isCompactInline = !!opts?.compactInline;
              const compactControlWidth =
                field.type === 'CHOICE'
                  ? 132
                  : field.type === 'NUMBER'
                    ? 92
                    : undefined;
              switch (field.type) {
                case 'CHOICE': {
                  const rawVal = subRow.values[field.id];
                  const choiceVal =
                    Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                  controlNode = renderChoiceControl({
                    fieldPath,
                    value: choiceVal || '',
                    options: optsFieldForCompact(field),
                    required: !!field.required,
                    placeholder,
                    searchEnabled:
                      (field as any)?.ui?.choiceSearchEnabled ??
                      (((targetGroup as any)?.lineItemConfig?.ui as any)?.choiceSearchEnabled),
                    override: (field as any)?.ui?.control,
                    disabled: isLineFieldInputDisabled(field),
                  onChange: (next: FieldValue) => handleLineFieldChange(targetGroup, subRow.id, field, next)
                  });
                  break;
                }
                case 'NUMBER': {
                  const fieldValue = (subRow.values[field.id] as any) ?? '';
                  const numberText =
                    fieldValue === undefined || fieldValue === null ? '' : fieldValue.toString();
                  controlNode = (
                    <NumberStepper
                      value={numberText}
                      disabled={isLineFieldInteractionBlocked(field)}
                      readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                      ariaLabel={labelText}
                      ariaDescribedBy={helperId}
                      placeholder={placeholder}
                      onInvalidInput={({ value }) => {
                        const numericOnlyMessage = tSystem(
                          'validation.numberOnly',
                          language,
                          'Only numbers are allowed in this field.'
                        );
                        setErrors(prev => {
                          const next = { ...prev };
                          const existing = next[fieldPath];
                          if (existing && existing !== numericOnlyMessage) return prev;
                          if (existing === numericOnlyMessage) return prev;
                          next[fieldPath] = numericOnlyMessage;
                          return next;
                        });
                        onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, value });
                      }}
                      onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                    />
                  );
                  break;
                }
                case 'DATE': {
                  controlNode = (
                    <DateInput
                      value={toDateInputValue((subRow.values[field.id] as any) ?? '')}
                      language={language}
                      min={(field as any)?.ui?.minDate}
                      max={(field as any)?.ui?.maxDate}
                      correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                      iosNativeCommitMode="deferWhileFocused"
                      readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                      ariaLabel={labelText}
                      ariaDescribedBy={helperId}
                      onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                    />
                  );
                  break;
                }
                case 'PARAGRAPH': {
                  controlNode = (
                    <textarea
                      className="ck-paragraph-input"
                      value={(subRow.values[field.id] as any) ?? ''}
                      onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                      readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                      rows={(field as any)?.ui?.paragraphRows || 3}
                      placeholder={placeholder}
                      aria-describedby={helperId}
                    />
                  );
                  break;
                }
                default: {
                  controlNode = (
                    <input
                      type="text"
                      value={(subRow.values[field.id] as any) ?? ''}
                      onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                      readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                      placeholder={placeholder}
                      aria-describedby={helperId}
                    />
                  );
                }
              }

              return (
                <div
                  key={field.id}
                  data-field-path={fieldPath}
                  data-has-error={errors[fieldPath] ? 'true' : undefined}
                  data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCompactInline ? 2 : 4,
                    minWidth: 0
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      minWidth: 0,
                      rowGap: isCompactInline ? 4 : 8
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--muted)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        lineHeight: 1.25
                      }}
                    >
                      {labelText}
                    </span>
                    <div
                      style={{
                        minWidth: compactControlWidth,
                        maxWidth: compactControlWidth,
                        flex: compactControlWidth ? '0 0 auto' : '0 1 auto'
                      }}
                    >
                      {controlNode}
                    </div>
                    {attachedDisplay ? (
                      <span style={{ whiteSpace: 'nowrap' }}>{attachedDisplay}</span>
                    ) : null}
                  </div>
                  {helperNode}
                  {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                  {renderWarnings(fieldPath)}
                </div>
              );
            };

            if (useCompactSubRows && compactLayout) {
              const primaryDisplay = compactLayout.primaryFieldId
                ? resolveCompactDisplay(visibleFieldById.get(compactLayout.primaryFieldId))
                : null;
              const derivedMetaDisplays = compactLayout.metaFieldIds
                .map(fid => resolveCompactDisplay(visibleFieldById.get(fid)))
                .filter(Boolean);
              const metaDisplays = derivedMetaDisplays;
              const combinedHeadline =
                primaryDisplay && metaDisplays.length
                  ? `${primaryDisplay} | ${metaDisplays.join(' • ')}`
                  : primaryDisplay || metaDisplays.join(' • ');
              const compactHeadlineRows = Array.isArray((sub as any)?.ui?.compactHeadlineRows)
                ? ((sub as any).ui.compactHeadlineRows as any[])
                : [];
              const compactSentenceRows = Array.isArray((sub as any)?.ui?.compactSentenceRows)
                ? ((sub as any).ui.compactSentenceRows as any[])
                : [];
              const compactActionRules = Array.isArray((sub as any)?.ui?.compactActions)
                ? ((sub as any).ui.compactActions as any[])
                : [];
              const compactRowCtx: VisibilityContext = {
                getValue: fid => {
                  return resolveCompactMappedValue(fid);
                },
                getLineItems: groupId => lineItems?.[groupId] || [],
                getLineItemKeys: () => Object.keys(lineItems || {})
              };
              const pickCompactRule = (rules: any[]): any | null =>
                rules.find(rule => {
                  if (!rule || typeof rule !== 'object') return false;
                  if (!(rule as any).when) return true;
                  return matchesWhenClause((rule as any).when, compactRowCtx);
                }) || null;
              const coerceCompactItemsCollection = coerceCompactItemsCollectionAction;
              const mapCompactActionEntries = mapCompactActionEntriesAction;
              const renderCompactNumberControl = (
                field: any,
                opts?: {
                  suffixText?: string;
                  minWidth?: number;
                  maxWidth?: number;
                  paddingChars?: number;
                  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
                  selectAllOnFocus?: boolean;
                }
              ): React.ReactNode => {
                const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                const placeholder =
                  helperCfg.text && helperCfg.placement === 'placeholder' ? helperCfg.text : undefined;
                const allowsIntegerOnly =
                  Array.isArray(field?.validationRules) &&
                  field.validationRules.some((rule: any) => rule?.then?.integer === true);
                const sanitizeNumericValue = (raw: string): string => {
                  const text = (raw || '').toString();
                  if (!text.trim()) return '';
                  if (allowsIntegerOnly) return text.replace(/[^\d]/g, '');
                  let seenSeparator = false;
                  let sanitized = '';
                  for (const char of text) {
                    if (/\d/.test(char)) {
                      sanitized += char;
                      continue;
                    }
                    if ((char === '.' || char === ',') && !seenSeparator) {
                      sanitized += char;
                      seenSeparator = true;
                    }
                  }
                  return sanitized;
                };
                return (
                  <div
                    data-field-path={fieldPath}
                    data-has-error={errors[fieldPath] ? 'true' : undefined}
                    data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 'var(--ck-font-control)',
                      minWidth: 0,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      verticalAlign: 'middle'
                    }}
                  >
                    <AutoWidthInput
                      className="ck-compact-control ck-compact-control--number"
                      value={((subRow.values[field.id] as any) ?? '').toString()}
                      disabled={isLineFieldInteractionBlocked(field)}
                      readOnly={!!field.valueMap || isLineFieldInputDisabled(field)}
                      inputMode={opts?.inputMode || 'numeric'}
                      pattern={allowsIntegerOnly ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
                      selectAllOnFocus={opts?.selectAllOnFocus !== false}
                      ariaLabel={resolveFieldLabel(field, language, field.id)}
                      placeholder={placeholder}
                      sanitize={sanitizeNumericValue}
                      minWidth={Number.isFinite(opts?.minWidth) ? opts?.minWidth : 42}
                      maxWidth={Number.isFinite(opts?.maxWidth) ? opts?.maxWidth : 88}
                      extraWidth={Number.isFinite(opts?.paddingChars)
                        ? Math.max(16, Math.ceil(opts!.paddingChars! * 6))
                        : 20}
                      style={{
                        flex: '0 0 auto',
                        marginInlineEnd: 0
                      }}
                      inputStyle={{
                        boxSizing: 'border-box',
                        minHeight: 34,
                        height: 34,
                        paddingInlineStart: 8,
                        paddingInlineEnd: 8,
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 'var(--ck-font-control)',
                        fontWeight: 500,
                        lineHeight: 1,
                        appearance: 'textfield',
                        MozAppearance: 'textfield',
                        WebkitAppearance: 'none'
                      }}
                      onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                    />
                    {opts?.suffixText ? <span style={{ whiteSpace: 'nowrap' }}>{opts.suffixText}</span> : null}
                  </div>
                );
              };
              const renderCompactChoiceControl = (
                field: any,
                opts?: { minWidth?: number; maxWidth?: number; paddingChars?: number }
              ): React.ReactNode => {
                const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                const currentValue =
                  (Array.isArray(subRow.values[field.id]) && (subRow.values[field.id] as string[]).length
                    ? (subRow.values[field.id] as string[])[0]
                    : (subRow.values[field.id] as string)) || '';
                const optionSet = optsFieldForCompact(field);
                return (
                  <div
                    data-field-path={fieldPath}
                    data-has-error={errors[fieldPath] ? 'true' : undefined}
                    data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 'var(--ck-font-control)',
                      minWidth: 0,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      verticalAlign: 'middle'
                    }}
                  >
                    <AutoWidthSelect
                      value={currentValue}
                      options={optionSet}
                      disabled={isLineFieldInputDisabled(field)}
                      ariaLabel={resolveFieldLabel(field, language, field.id)}
                      className="ck-compact-control ck-compact-control--choice"
                      minWidth={Number.isFinite(opts?.minWidth) ? opts?.minWidth : 72}
                      maxWidth={Number.isFinite(opts?.maxWidth) ? opts?.maxWidth : 140}
                      extraWidth={Number.isFinite(opts?.paddingChars)
                        ? Math.max(28, Math.ceil(opts!.paddingChars! * 6))
                        : 34}
                      placeholder="Select…"
                      style={{
                        flex: '0 0 auto',
                        marginInlineEnd: 0
                      }}
                      selectStyle={{
                        boxSizing: 'border-box',
                        minHeight: 34,
                        height: 34,
                        paddingInlineStart: 12,
                        paddingInlineEnd: 28,
                        fontSize: 'var(--ck-font-control)',
                        fontWeight: 500,
                        lineHeight: 1
                      }}
                      onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                    />
                  </div>
                );
              };
              const renderCompactHeadlineFromConfig = (): React.ReactNode => {
                if (!compactHeadlineRows.length) return null;
                const matchedRule = pickCompactRule(compactHeadlineRows);
                if (!matchedRule || !Array.isArray((matchedRule as any).parts)) return null;
                const nodes = (matchedRule as any).parts
                  .map((part: any, idx: number) => {
                    if (!part || typeof part !== 'object') return null;
                    if (part.type === 'text' || (!part.type && part.text !== undefined)) {
                      const textValue = resolveLocalizedString(part.text, language, '');
                      if (!textValue) return null;
                      return <span key={`headline:text:${idx}`}>{textValue}</span>;
                    }
                    if (part.type === 'primary') {
                      if (!primaryDisplay) return null;
                      return (
                        <span key={`headline:primary:${idx}`} style={{ fontWeight: 600 }}>
                          {primaryDisplay}
                        </span>
                      );
                    }
                    if (part.type === 'meta') {
                      if (!metaDisplays.length) return null;
                      return (
                        <span key={`headline:meta:${idx}`} style={{ color: 'var(--muted)' }}>
                          {metaDisplays.join(' • ')}
                        </span>
                      );
                    }
                    const fieldId = typeof part.fieldId === 'string' ? part.fieldId.trim() : '';
                    const sourceFieldId =
                      typeof (part as any).sourceFieldId === 'string'
                        ? (part as any).sourceFieldId.trim()
                        : '';
                    const sourceField = sourceFieldId ? allFieldById.get(sourceFieldId) : null;
                    const sourceRow = sourceField
                      ? resolveCompactSourceRow(sourceField, {
                          lookupField:
                            typeof (part as any).lookupField === 'string'
                              ? (part as any).lookupField.trim()
                              : undefined
                        })
                      : null;
                    const field = fieldId ? allFieldById.get(fieldId) : null;
                    const displayText = (() => {
                      const sourcePath =
                        typeof (part as any).sourcePath === 'string' ? (part as any).sourcePath.trim() : '';
                      if (sourcePath) {
                        const localRaw = resolveCompactMappedValue(sourcePath);
                        if (localRaw !== undefined && localRaw !== null && localRaw !== '') {
                          return `${localRaw}`;
                        }
                      }
                      if (sourceRow && sourcePath) {
                        const raw = getCompactSourceValue(sourceRow, sourcePath);
                        return raw === undefined || raw === null || raw === '' ? '' : `${raw}`;
                      }
                      if (!field) return '';
                      return (resolveCompactDisplay(field) || '').toString();
                    })();
                    const suffixText = (() => {
                      if (part.suffix !== undefined) {
                        return resolveLocalizedString(part.suffix, language, '');
                      }
                      const suffixSourcePath =
                        typeof (part as any).suffixSourcePath === 'string'
                          ? (part as any).suffixSourcePath.trim()
                          : '';
                      if (suffixSourcePath) {
                        const localRaw = resolveCompactMappedValue(suffixSourcePath);
                        if (localRaw !== undefined && localRaw !== null && localRaw !== '') {
                          return `${localRaw}`;
                        }
                      }
                      if (sourceRow && suffixSourcePath) {
                        const raw = getCompactSourceValue(sourceRow, suffixSourcePath);
                        return raw === undefined || raw === null || raw === '' ? '' : `${raw}`;
                      }
                      const suffixFieldId =
                        typeof part.suffixFieldId === 'string' ? part.suffixFieldId.trim() : '';
                      if (!suffixFieldId) return '';
                      const suffixField = allFieldById.get(suffixFieldId);
                      return resolveCompactDisplay(suffixField) || (((subRow.values[suffixFieldId] as any) ?? '') || '').toString();
                    })();
                    const combinedText = [displayText, suffixText].filter(Boolean).join(' ');
                    if (!combinedText) return null;
                    const sourceKey = [sourceFieldId, (part as any).sourcePath || '', (part as any).suffixSourcePath || '']
                      .filter(Boolean)
                      .join(':');
                    return <span key={`headline:field:${fieldId || sourceKey || idx}:${idx}`}>{combinedText}</span>;
                  })
                  .filter(Boolean);
                if (!nodes.length) return null;
                return nodes;
              };
              const renderCompactActionsFromConfig = (): React.ReactNode => {
                if (!compactActionRules.length) return null;
                const matchedRule = pickCompactRule(compactActionRules);
                const actions = Array.isArray((matchedRule as any)?.actions) ? ((matchedRule as any).actions as any[]) : [];
                if (!actions.length) return null;
                const nodes = actions
                  .map((action: any, idx: number) => {
                    if (!action || typeof action !== 'object' || action.type !== 'openSubgroupOverlay') return null;
                    if ((action as any).showWhen && !matchesWhenClause((action as any).showWhen, compactRowCtx)) return null;
                    const subGroupId = ((action as any).subGroupId || '').toString().trim();
                    if (!subGroupId) return null;
                    const normalizedCompactRowId =
                      typeof subRow.id === 'string'
                        ? (subRow.id.split('::').pop() || subRow.id)
                        : subRow.id;
                    const targetKey = buildSubgroupKey(subKey, normalizedCompactRowId, subGroupId);
                    const targetRows = lineItems[targetKey] || [];
                    const targetConfig = Array.isArray((sub as any)?.subGroups)
                      ? ((sub as any).subGroups as any[]).find(
                          (candidate: any) => resolveSubgroupKey(candidate as any) === subGroupId
                        ) || null
                      : null;
                    const readOnly = (action as any).readOnly === true;
                    const groupOverrideFromConfig = (action as any).groupOverride as LineItemGroupConfigOverride | undefined;
                    const groupOverride: LineItemGroupConfigOverride | undefined =
                      targetConfig || groupOverrideFromConfig
                        ? {
                            ...(groupOverrideFromConfig || {}),
                            fields:
                              readOnly && Array.isArray(targetConfig?.fields)
                                ? targetConfig.fields.map((field: any) => ({ ...field, readOnly: true }))
                                : groupOverrideFromConfig?.fields,
                            ui: {
                              ...((targetConfig as any)?.ui || {}),
                              ...((groupOverrideFromConfig as any)?.ui || {}),
                              addButtonPlacement:
                                (((groupOverrideFromConfig as any)?.ui || {}) as any)?.addButtonPlacement || 'hidden'
                            }
                          }
                        : undefined;
                    const buttonLabel = resolveLocalizedString((action as any).label, language, '').trim();
                    if (!buttonLabel) return null;
                    const overlayLabel = resolveLocalizedString((action as any).overlayLabel, language, '').trim();
                    const closeButtonLabel = resolveLocalizedString(
                      (action as any).closeButtonLabel,
                      language,
                      tSystem('actions.back', language, 'Back')
                    ).trim();
                    const emptyMessage = resolveLocalizedString((action as any).emptyMessage, language, '').trim();
                    const contextHeaderFieldId = ((action as any).contextHeaderFieldId || '').toString().trim();
                    const contextHeader =
                      (contextHeaderFieldId && resolveCompactDisplay(allFieldById.get(contextHeaderFieldId))) ||
                      primaryDisplay ||
                      combinedHeadline ||
                      '';
                    const sourceFieldId = ((action as any).sourceFieldId || '').toString().trim();
                    const sourcePath = ((action as any).sourcePath || '').toString().trim();
                    const tone = ((action as any).tone || 'secondary').toString() === 'primary' ? 'primary' : 'secondary';
                    return (
                      <button
                        key={`compact-action:${subGroupId}:${idx}`}
                        type="button"
                        style={{
                          ...(tone === 'primary' ? buttonStyles.primary : buttonStyles.secondary),
                          minHeight: 36,
                          padding: '6px 12px',
                          whiteSpace: 'nowrap',
                          flex: '0 0 auto'
                        }}
                        onClick={() => {
                          if (sourcePath) {
                            const sourceField = sourceFieldId ? allFieldById.get(sourceFieldId) : null;
                            const sourceRow =
                              sourceField && sourceFieldId
                                ? resolveCompactSourceRow(sourceField, {
                                    lookupField:
                                      typeof (action as any).lookupField === 'string'
                                        ? (action as any).lookupField.trim()
                                        : undefined
                                  })
                                : null;
                            const localEntries = coerceCompactItemsCollection(
                              resolveCompactMappedValue(sourcePath)
                            );
                            const sourceEntriesRaw = sourceRow
                              ? coerceCompactItemsCollection(getCompactSourceValue(sourceRow, sourcePath))
                              : [];
                            const sourceEntries = mapCompactActionEntries(
                              localEntries.length ? localEntries : sourceEntriesRaw,
                              action
                            );
                            if (sourceEntries.length) {
                              setLineItems(prev => ({ ...prev, [targetKey]: [] }));
                              globalThis.setTimeout(() => {
                                sourceEntries.forEach(entry => {
                                  addLineItemRowManual(targetKey, entry, { configOverride: groupOverride });
                                });
                                globalThis.setTimeout(() => {
                                  openSubgroupOverlay(targetKey, {
                                    source: 'user',
                                    groupOverride,
                                    hideInlineSubgroups: true,
                                    closeButtonLabel,
                                    label: overlayLabel || undefined,
                                    contextHeader
                                  });
                                }, 0);
                              }, 0);
                              return;
                            }
                          }
                          if (!targetRows.length && emptyMessage) {
                            openInfoOverlay(buttonLabel, emptyMessage);
                            return;
                          }
                          openSubgroupOverlay(targetKey, {
                            source: 'user',
                            groupOverride,
                            hideInlineSubgroups: true,
                            closeButtonLabel,
                            label: overlayLabel || undefined,
                            contextHeader
                          });
                        }}
                      >
                        {buttonLabel}
                      </button>
                    );
                  })
                  .filter(Boolean);
                if (!nodes.length) return null;
                return nodes;
              };
              const renderCompactSentenceFromConfig = (): React.ReactNode => {
                if (!compactSentenceRows.length) return null;
                const matchedRule = pickCompactRule(compactSentenceRows);
                const parts = Array.isArray((matchedRule as any)?.parts) ? ((matchedRule as any).parts as any[]) : [];
                if (!parts.length) return null;
                const feedbackFieldPaths = new Set<string>();
                const resolveCompactFieldError = (fieldId: string): string => {
                  const directPath = `${subKey}__${fieldId}__${subRow.id}`;
                  const directMessage = errors[directPath];
                  if (directMessage) return directMessage;
                  const suffix = `__${fieldId}__${subRow.id}`;
                  const matchingKey = Object.keys(errors || {}).find(key => key === directPath || key.endsWith(suffix));
                  return matchingKey ? errors[matchingKey] : '';
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'nowrap',
                        alignItems: 'center',
                        columnGap: 8,
                        rowGap: 8,
                        minWidth: 0,
                        lineHeight: 1.35,
                        overflowX: 'auto'
                      }}
                    >
                      {parts.map((part, idx) => {
                        if (!part || typeof part !== 'object') return null;
                        const partType = ((part as any).type || ((part as any).fieldId ? 'field' : 'text')).toString();
                        if (partType === 'text') {
                          const label = resolveLocalizedString((part as any).text, language, '');
                          if (!label) return null;
                          return (
                            <span
                              key={`text:${idx}`}
                              style={{
                                color: 'var(--muted)',
                                fontWeight: 600,
                                fontSize: 'var(--ck-font-control)',
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                minHeight: 40,
                                flex: '0 0 auto'
                              }}
                            >
                              {label}
                            </span>
                          );
                        }
                        const fieldId = ((part as any).fieldId || '').toString().trim();
                        if (!fieldId) return null;
                        const field = allFieldById.get(fieldId);
                        if (!field) return null;
                        feedbackFieldPaths.add(`${subKey}__${field.id}__${subRow.id}`);
                        const suffixText = ((): string => {
                          const localizedSuffix = resolveLocalizedString((part as any).suffix, language, '');
                          if (localizedSuffix) return localizedSuffix;
                          const suffixFieldId = ((part as any).suffixFieldId || '').toString().trim();
                          if (!suffixFieldId) return '';
                          const suffixField = allFieldById.get(suffixFieldId);
                          return resolveCompactDisplay(suffixField) || (((subRow.values[suffixFieldId] as any) ?? '') || '').toString();
                        })();
                        const minWidth = Number((part as any).minWidth);
                        const maxWidth = Number((part as any).maxWidth);
                        const paddingChars = Number((part as any).paddingChars);
                        if (field.type === 'NUMBER') {
                          return (
                            <React.Fragment key={`field:${fieldId}:${idx}`}>
                              {renderCompactNumberControl(field, {
                                suffixText,
                                minWidth: Number.isFinite(minWidth) ? minWidth : undefined,
                                maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined,
                                paddingChars: Number.isFinite(paddingChars) ? paddingChars : undefined,
                                inputMode:
                                  Array.isArray(field?.validationRules) &&
                                  field.validationRules.some(
                                    (rule: any) => rule?.then?.integer === true
                                  )
                                    ? 'numeric'
                                    : 'decimal',
                                selectAllOnFocus: true
                              })}
                            </React.Fragment>
                          );
                        }
                        if (field.type === 'CHOICE') {
                          return (
                            <React.Fragment key={`field:${fieldId}:${idx}`}>
                              {renderCompactChoiceControl(field, {
                                minWidth: Number.isFinite(minWidth) ? minWidth : undefined,
                                maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined,
                                paddingChars: Number.isFinite(paddingChars) ? paddingChars : undefined
                              })}
                            </React.Fragment>
                          );
                        }
                        const displayText = resolveCompactDisplay(field) || '';
                        if (!displayText && !suffixText) return null;
                        return (
                          <span
                            key={`field:${fieldId}:${idx}`}
                            style={{
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              minHeight: 40,
                              flex: '0 0 auto'
                            }}
                          >
                            {[displayText, suffixText].filter(Boolean).join(' ')}
                          </span>
                        );
                      })}
                    </div>
                    {Array.from(feedbackFieldPaths).map(fieldPath => (
                      <React.Fragment key={`feedback:${fieldPath}`}>
                        {(() => {
                          const rawParts = fieldPath.split('__').filter(Boolean);
                          const fieldId = rawParts.length >= 2 ? rawParts[rawParts.length - 2] : '';
                          const message = fieldId ? resolveCompactFieldError(fieldId) : (errors[fieldPath] || '');
                          return message ? <div className="error">{message}</div> : null;
                        })()}
                        {renderWarnings(fieldPath)}
                      </React.Fragment>
                    ))}
                  </div>
                );
              };
              const compactSentenceNode = renderCompactSentenceFromConfig();
              const compactActionNodes = renderCompactActionsFromConfig();
              const leadingFields = compactLayout.leadingFieldIds
                .map(fid => visibleFieldById.get(fid))
                .filter((field): field is any => !!field);
              const inlineCheckboxField =
                leadingFields.length === 1 && leadingFields[0]?.type === 'CHECKBOX'
                  ? leadingFields[0]
                  : null;
              const inlineCheckboxFieldPath = inlineCheckboxField
                ? `${subKey}__${inlineCheckboxField.id}__${subRow.id}`
                : '';
              const isSentenceVisible = inlineCheckboxField
                ? !!subRow.values[inlineCheckboxField.id]
                : true;
              const controlLayoutStyle: React.CSSProperties = compactSentenceNode
                ? {
                    display: 'flex',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: 8,
                    rowGap: 8,
                    minWidth: 0,
                    overflowX: 'auto'
                  }
                : {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minWidth: 0
                  };

              return (
                <div
                  className="ck-compact-line-item-row"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    alignItems: 'start'
                  }}
                >
                  {compactLayout.leadingFieldIds.length && !inlineCheckboxField ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 15 }}>
                      {compactLayout.leadingFieldIds.map(fid => {
                        const field = visibleFieldById.get(fid);
                        const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                        return (
                          <label
                            key={fid}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: 32,
                              minWidth: 32
                            }}
                            data-field-path={fieldPath}
                          >
                            <input
                              type="checkbox"
                              checked={!!subRow.values[field.id]}
                              disabled={isLineFieldInputDisabled(field)}
                              onChange={e => {
                                if (isLineFieldInputDisabled(field)) return;
                                handleLineFieldChange(targetGroup, subRow.id, field, e.target.checked);
                              }}
                              style={{
                                width: 36,
                                height: 36,
                                margin: 0,
                                flex: '0 0 auto',
                                accentColor: 'var(--accent)',
                                transform: 'scale(1.2)',
                                transformOrigin: 'center'
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    {(combinedHeadline || compactHeadlineRows.length) ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                          minWidth: 0
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            flex: '1 1 280px',
                            minWidth: 0
                          }}
                        >
                          <div
                            style={{
                              fontSize: 'calc(var(--ck-font-control) * 1.16)',
                              lineHeight: 1.35,
                              overflowWrap: 'anywhere',
                              flex: '1 1 280px',
                              minWidth: 0
                            }}
                          >
                            {inlineCheckboxField ? (
                              <label
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minHeight: 32,
                                  minWidth: 32,
                                  flex: '0 0 auto',
                                  paddingTop: 2
                                }}
                                data-field-path={inlineCheckboxFieldPath}
                              >
                                <input
                                  type="checkbox"
                                  checked={!!subRow.values[inlineCheckboxField.id]}
                                  disabled={isLineFieldInputDisabled(inlineCheckboxField)}
                                  onChange={e => {
                                    if (isLineFieldInputDisabled(inlineCheckboxField)) return;
                                    handleLineFieldChange(
                                      targetGroup,
                                      subRow.id,
                                      inlineCheckboxField,
                                      e.target.checked
                                    );
                                  }}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    margin: 0,
                                    flex: '0 0 auto',
                                    accentColor: 'var(--accent)',
                                    transform: 'scale(1.2)',
                                    transformOrigin: 'center'
                                  }}
                                />
                              </label>
                            ) : null}
                            {renderCompactHeadlineFromConfig() || (
                              <>
                                {primaryDisplay ? (
                                  <span style={{ fontWeight: 600 }}>{primaryDisplay}</span>
                                ) : null}
                                {primaryDisplay && metaDisplays.length ? (
                                  <span style={{ color: 'var(--muted)', fontSize: 'calc(var(--ck-font-control) * 1.16)' }}>
                                    {` | ${metaDisplays.join(' • ')}`}
                                  </span>
                                ) : null}
                                {!primaryDisplay && metaDisplays.length ? (
                                  <span style={{ color: 'var(--muted)', fontSize: 'calc(var(--ck-font-control) * 1.16)' }}>
                                    {metaDisplays.join(' • ')}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                        {compactActionNodes ? (
                          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>{compactActionNodes}</div>
                        ) : null}
                      </div>
                    ) : null}
                    {isSentenceVisible ? compactSentenceNode : null}
                    {isSentenceVisible && !compactSentenceNode && compactLayout.inlineFieldIds.length ? (
                      <div style={controlLayoutStyle}>
                        {compactLayout.inlineFieldIds.map(fid =>
                          renderCompactControlField(visibleFieldById.get(fid), {
                            compactInline: false
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }

            return (
              <GroupedPairedFields
                contextPrefix={`sub:${q.id}:${subId}`}
                fields={visibleFields}
                language={language}
                collapsedGroups={collapsedGroups}
                toggleGroupCollapsed={toggleGroupCollapsed}
                renderField={renderSubField}
                hasError={(field: any) => !!errors[`${subKey}__${field.id}__${subRow.id}`]}
                isComplete={(field: any) => {
                  const mapped = field.valueMap
                    ? resolveValueMapValue(field.valueMap, (fid: string) => {
                        if ((subRow.values || {}).hasOwnProperty(fid)) return (subRow.values || {})[fid];
                        if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                        return values[fid];
                      }, { language, targetOptions: toOptionSet(field) })
                    : undefined;
                  const raw = field.valueMap ? mapped : (subRow.values || {})[field.id];
                  if (field.type === 'FILE_UPLOAD') {
                    return isUploadValueComplete({
                      value: raw as any,
                      uploadConfig: (field as any).uploadConfig,
                      required: !!field.required
                    });
                  }
                  return !isEmptyValue(raw as any);
                }}
              />
            );
          })()}
          {canRemoveSubRow ? (
            <div className="line-actions">
              <LineItemRemoveButton language={language} onRemove={() => removeLineRow(subKey, subRow.id)} />
            </div>
          ) : null}
        </div>
      );
    })}
  </>
);
