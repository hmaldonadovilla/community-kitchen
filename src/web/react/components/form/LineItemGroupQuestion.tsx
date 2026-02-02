import React from 'react';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
  matchesWhen,
  matchesWhenClause,
  validateRules,
  computeTotals,
  loadOptionsFromDataSource,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../../core';
import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import {
  FieldValue,
  LangCode,
  LineItemGroupConfigOverride,
  LineItemRowState,
  OptionSet,
  RowFlowActionRef,
  RowFlowConfig,
  RowFlowOverlayContextHeaderConfig,
  ValidationRule,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../types';
import type { OverlayCloseConfirmLike } from '../../../../types';
import type { ConfirmDialogOpenArgs } from '../../features/overlays/useConfirmDialog';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { FormErrors, LineItemAddResult, LineItemState, OptionState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import {
  describeUploadItem,
  formatOptionFilterNonMatchWarning,
  getUploadMinRequired,
  isUploadValueComplete,
  resolveFieldHelperText,
  resolveRowDisclaimerText,
  toDateInputValue,
  toUploadItems
} from './utils';
import {
  buttonStyles,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  PaperclipIcon,
  PlusIcon,
  RequiredStar,
  XIcon,
  srOnly,
  withDisabled
} from './ui';
import { DateInput } from './DateInput';
import { GroupedPairedFields } from './GroupedPairedFields';
import { InfoTooltip } from './InfoTooltip';
import { LineItemTable, type LineItemTableColumn } from './LineItemTable';
import { LineOverlayState } from './overlays/LineSelectOverlay';
import { SearchableSelect } from './SearchableSelect';
import { LineItemMultiAddSelect } from './LineItemMultiAddSelect';
import { NumberStepper } from './NumberStepper';
import { PairedRowGrid } from './PairedRowGrid';
import { applyValueMapsToLineRow, resolveValueMapValue } from './valueMaps';
import { buildSelectorOptionSet, resolveSelectorHelperText, resolveSelectorLabel, resolveSelectorPlaceholder } from './lineItemSelectors';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_AUTO,
  ROW_SOURCE_KEY,
  cascadeRemoveLineItemRows,
  buildSubgroupKey,
  parseSubgroupKey,
  resolveLineItemRowLimits,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  resolveSubgroupKey
} from '../../app/lineItems';
import { applyValueMapsToForm } from '../../app/valueMaps';
import {
  resolveRowFlowActionPlan,
  resolveRowFlowFieldTarget,
  normalizeValueList,
  resolveRowFlowSegmentActionIds,
  resolveRowFlowState,
  type RowFlowResolvedEffect,
  type RowFlowResolvedPrompt,
  type RowFlowResolvedRow,
  type RowFlowResolvedSegment,
  type RowFlowResolvedState
} from '../../features/steps/domain/rowFlow';

export interface ErrorIndex {
  rowErrors: Set<string>;
  subgroupErrors: Set<string>;
}

export interface OpenFileOverlayArgs {
  open?: boolean;
  title?: string;
  scope?: 'top' | 'line';
  question?: WebQuestionDefinition;
  group?: WebQuestionDefinition;
  rowId?: string;
  field?: any;
  fieldPath?: string;
}

export interface ChoiceControlArgs {
  fieldPath: string;
  value: string;
  options: Array<{ value: string; label: string; tooltip?: string; searchText?: string }>;
  required: boolean;
  searchEnabled?: boolean;
  override?: string | null;
  disabled?: boolean;
  onChange: (next: string) => void;
}

export interface LineItemGroupQuestionCtx {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  /**
   * Optional shared visibility resolver from the parent FormView.
   * When provided, `visibility.showWhen/hideWhen` can reference system/meta fields (e.g. STATUS) reliably.
   */
  resolveVisibilityValue?: (fieldId: string) => FieldValue | undefined;
  /**
   * Optional top-level resolver that avoids scanning line items (row-scoped visibility).
   */
  getTopValue?: (fieldId: string) => FieldValue | undefined;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;

  submitting: boolean;

  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  warningByField?: Record<string, string[]>;

  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;

  ensureLineOptions: (groupId: string, field: any) => void;

  renderChoiceControl: (args: ChoiceControlArgs) => React.ReactNode;

  openInfoOverlay: (title: string, text: string) => void;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  openSubgroupOverlay: (
    subKey: string,
    options?: {
      source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
      rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
      groupOverride?: LineItemGroupConfigOverride;
      hideInlineSubgroups?: boolean;
      hideCloseButton?: boolean;
      closeButtonLabel?: string;
      closeConfirm?: OverlayCloseConfirmLike;
      label?: string;
      contextHeader?: string;
      helperText?: string;
      rowFlow?: RowFlowConfig;
    }
  ) => void;
  openLineItemGroupOverlay: (
    groupOrId: string | WebQuestionDefinition,
    options?: {
      rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
      hideInlineSubgroups?: boolean;
      source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
      hideCloseButton?: boolean;
      closeButtonLabel?: string;
      closeConfirm?: OverlayCloseConfirmLike;
      label?: string;
      contextHeader?: string;
      helperText?: string;
      rowFlow?: RowFlowConfig;
    }
  ) => void;

  addLineItemRowManual: (
    groupId: string,
    preset?: Record<string, any>,
    options?: { configOverride?: any; rowFilter?: { includeWhen?: any; excludeWhen?: any } | null }
  ) => LineItemAddResult | undefined;
  removeLineRow: (groupId: string, rowId: string) => void;
  runSelectionEffectsForAncestors?: (
    groupKey: string,
    prevLineItems: LineItemState,
    nextLineItems: LineItemState
  ) => void;
  handleLineFieldChange: (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;

  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (groupKey: string) => void;

  collapsedRows: Record<string, boolean>;
  setCollapsedRows: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  collapsedSubgroups: Record<string, boolean>;
  setCollapsedSubgroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  subgroupSelectors: Record<string, string>;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  subgroupBottomRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;

  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  dragState: Record<string, boolean>;
  incrementDrag: (key: string) => void;
  decrementDrag: (key: string) => void;
  resetDrag: (key: string) => void;
  uploadAnnouncements: Record<string, string>;

  openConfirmDialog?: (args: ConfirmDialogOpenArgs) => void;
  isOverlayOpenActionSuppressed?: (fieldPath: string) => boolean;
  suppressOverlayOpenAction?: (fieldPath: string) => void;
  closeOverlay?: () => void;

  handleLineFileInputChange: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => void;
  handleLineFileDrop: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    event: React.DragEvent<HTMLDivElement>;
  }) => void;
  removeLineFile: (args: { group: WebQuestionDefinition; rowId: string; field: any; fieldPath: string; index: number }) => void;
  clearLineFiles: (args: { group: WebQuestionDefinition; rowId: string; field: any; fieldPath: string }) => void;

  errorIndex: ErrorIndex;

  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;

  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}

export const LineItemGroupQuestion: React.FC<{
  q: WebQuestionDefinition;
  ctx: LineItemGroupQuestionCtx;
  /**
   * Optional step-scoped row flow configuration for progressive input/output.
   */
  rowFlow?: RowFlowConfig;
  /**
   * Optional rendering-only row filter for the parent group. Does not delete stored rows.
   */
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  /**
   * When true, hide the inline subgroup editor sections and rely on subgroup "open" pills/overlays instead.
   */
  hideInlineSubgroups?: boolean;
  /**
   * When true, suppress the top/bottom add/selector toolbars (used by overlay headers).
   */
  hideToolbars?: boolean;
}> = ({ q, ctx, rowFlow, rowFilter, hideInlineSubgroups, hideToolbars }) => {
  const {
    definition,
    language,
    values,
    resolveVisibilityValue,
    getTopValue: getTopValueFromCtx,
    setValues,
    lineItems,
    setLineItems,
    submitting,
    errors,
    setErrors,
    warningByField,
    optionState,
    setOptionState,
    ensureLineOptions,
    renderChoiceControl,
    openInfoOverlay,
    openFileOverlay,
    openSubgroupOverlay,
    openLineItemGroupOverlay,
    addLineItemRowManual,
    removeLineRow,
    handleLineFieldChange,
    collapsedGroups,
    toggleGroupCollapsed,
    collapsedRows,
    setCollapsedRows,
    collapsedSubgroups,
    setCollapsedSubgroups,
    subgroupSelectors,
    setSubgroupSelectors,
    subgroupBottomRefs,
    fileInputsRef,
    dragState,
    incrementDrag,
    decrementDrag,
    uploadAnnouncements,
    handleLineFileInputChange,
    handleLineFileDrop,
    removeLineFile,
    clearLineFiles,
    errorIndex,
    setOverlay,
    onDiagnostic
  } = ctx;

  const resolveTopValue = (fieldId: string): FieldValue | undefined => {
    if (getTopValueFromCtx) return getTopValueFromCtx(fieldId);
    if (resolveVisibilityValue) return resolveVisibilityValue(fieldId);
    return values[fieldId];
  };

  const isIncludedByRowFilter = React.useCallback(
    (rowValues: Record<string, FieldValue>): boolean => {
      if (!rowFilter) return true;
      const includeWhen = (rowFilter as any)?.includeWhen;
      const excludeWhen = (rowFilter as any)?.excludeWhen;
      const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
      const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
      const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
      return includeOk && !excludeMatch;
    },
    [rowFilter]
  );

  const renderRowsAll = lineItems[q.id] || [];
  const parentRows = rowFilter
    ? renderRowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any))
    : renderRowsAll;

  const groupChoiceSearchDefault = (q.lineItemConfig?.ui as any)?.choiceSearchEnabled;
  const groupHelperCfg = resolveFieldHelperText({ ui: q.ui, language });
  const groupHelperText = groupHelperCfg.text;
  const groupHelperNode =
    groupHelperText && !submitting && q.readOnly !== true && q.ui?.renderAsLabel !== true
      ? <div className="ck-field-helper">{groupHelperText}</div>
      : null;

  const AUTO_CONTEXT_PREFIX = '__autoAddMode__';
  // IMPORTANT: section selectors can commit their value on blur (e.g., SearchableSelect).
  // When the user clicks "Add" while the selector still has focus, the click handler can run
  // before React state has re-rendered with the committed value. These refs ensure we can
  // read the latest committed selector values synchronously in the Add handlers.
  const latestSectionSelectorValueRef = React.useRef<string>('');
  const latestSubgroupSelectorValueRef = React.useRef<Record<string, string>>({});
  const selectorSearchLoggedRef = React.useRef<Set<string>>(new Set());
  const selectorOverlayLoggedRef = React.useRef<Set<string>>(new Set());
  const selectorLabelLoggedRef = React.useRef<Set<string>>(new Set());
  const warningModeLoggedRef = React.useRef<Set<string>>(new Set());
  const overlayOpenActionLoggedRef = React.useRef<Set<string>>(new Set());
  const rowFlowLoggedRef = React.useRef<Set<string>>(new Set());
  const rowFlowPromptRef = React.useRef<Record<string, string>>({});
  const rowFlowPromptCompleteRef = React.useRef<Record<string, Record<string, boolean>>>({});
  const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
    const raw = (field as any)?.optionSort;
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'source' ? 'source' : 'alphabetical';
  };

  const rowFlowEnabled = Boolean(
    rowFlow &&
      ((rowFlow.mode || '').toString().trim().toLowerCase() === '' ||
        (rowFlow.mode || '').toString().trim().toLowerCase() === 'progressive')
  );
  const rowFlowSubGroupIds = (q.lineItemConfig?.subGroups || [])
    .map(sub => resolveSubgroupKey(sub as any))
    .filter(Boolean);
  const rowFlowActionById = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!rowFlow?.actions) return map;
    rowFlow.actions.forEach(action => {
      const id = (action?.id || '').toString().trim();
      if (!id) return;
      map.set(id, action);
    });
    return map;
  }, [rowFlow]);
  const parentRowById = React.useMemo(() => {
    const map = new Map<string, LineItemRowState>();
    parentRows.forEach(row => {
      map.set(row.id, row);
    });
    return map;
  }, [parentRows]);

  function parseFieldPath(path: string): { groupKey: string; fieldId: string; rowId: string } | null {
    if (!path) return null;
    const parts = path.split('__');
    if (parts.length < 3) return null;
    const groupKey = (parts[0] || '').toString().trim();
    const fieldId = (parts[1] || '').toString().trim();
    const rowId = (parts[2] || '').toString().trim();
    if (!groupKey || !fieldId || !rowId) return null;
    return { groupKey, fieldId, rowId };
  }

  const activeFieldMeta = (() => {
    if (typeof document === 'undefined') return { path: '', type: '' };
    const active = document.activeElement as HTMLElement | null;
    const path = ((active?.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath || '').toString();
    const parsed = parseFieldPath(path);
    if (!parsed) return { path: '', type: '' };
    const groupInfo = resolveRowFlowGroupConfig(parsed.groupKey);
    if (!groupInfo) return { path: '', type: '' };
    const field = resolveRowFlowFieldConfig(parsed.groupKey, parsed.fieldId);
    const type = field?.type ? field.type.toString().trim().toUpperCase() : '';
    return { path, type };
  })();
  const rowFlowStateByRowId = React.useMemo(() => {
    const map = new Map<string, RowFlowResolvedState>();
    if (!rowFlowEnabled) return map;
    parentRows.forEach(row => {
      const state = resolveRowFlowState({
        config: rowFlow as RowFlowConfig,
        groupId: q.id,
        rowId: row.id,
        rowValues: (row.values || {}) as Record<string, FieldValue>,
        lineItems,
        topValues: values,
        subGroupIds: rowFlowSubGroupIds,
        activeFieldPath: activeFieldMeta.path,
        activeFieldType: activeFieldMeta.type
      });
      if (state) map.set(row.id, state);
    });
    return map;
  }, [activeFieldMeta.path, activeFieldMeta.type, lineItems, parentRows, q.id, rowFlow, rowFlowEnabled, rowFlowSubGroupIds, values]);

  function resolveRowFlowGroupConfig(groupKey: string): { groupId: string; config: any } | null {
    if (!groupKey) return null;
    const baseParsed = parseSubgroupKey(q.id);
    const baseRootId = baseParsed?.rootGroupId || q.id;
    if (groupKey === q.id && q.lineItemConfig) {
      return { groupId: q.id, config: q.lineItemConfig };
    }
    const rootQuestion = definition.questions.find(question => question.id === baseRootId);
    const rootConfig =
      baseRootId === q.id && q.lineItemConfig
        ? q.lineItemConfig
        : rootQuestion?.lineItemConfig;
    if (!rootConfig) return null;

    const resolveFromRoot = (path: string[]): any | null => {
      if (!path.length) return rootConfig;
      let current: any = rootConfig;
      for (let i = 0; i < path.length; i += 1) {
        const subId = path[i];
        const next = (current?.subGroups || []).find((sub: any) => resolveSubgroupKey(sub as any) === subId);
        if (!next) return null;
        current = next;
      }
      return current;
    };

    if (groupKey === baseRootId) {
      return { groupId: baseRootId, config: rootConfig };
    }

    const parsed = parseSubgroupKey(groupKey);
    if (parsed && parsed.rootGroupId === baseRootId) {
      const cfg = resolveFromRoot(parsed.path);
      return cfg ? { groupId: groupKey, config: cfg } : null;
    }

    if (groupKey === q.id && baseParsed?.path?.length) {
      const cfg = resolveFromRoot(baseParsed.path);
      return cfg ? { groupId: q.id, config: cfg } : null;
    }

    if (groupKey === q.id && !baseParsed) {
      return { groupId: q.id, config: rootConfig };
    }

    return null;
  }

  function resolveRowFlowFieldConfig(groupKey: string, fieldId: string): any | null {
    if (!groupKey || !fieldId) return null;
    const info = resolveRowFlowGroupConfig(groupKey);
    if (!info?.config) return null;
    return (info.config.fields || []).find((field: any) => field?.id === fieldId) || null;
  }

  const buildRowFlowFieldCtx = React.useCallback(
    (args: { rowValues: Record<string, FieldValue>; parentValues?: Record<string, FieldValue> }): VisibilityContext => ({
      getValue: fid =>
        (args.rowValues as any)[fid] ??
        (args.parentValues as any)?.[fid] ??
        resolveTopValue(fid),
      getLineValue: (_rowId, fid) =>
        (args.rowValues as any)[fid] ??
        (args.parentValues as any)?.[fid] ??
        resolveTopValue(fid),
      getLineItems: groupId => lineItems?.[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    }),
    [lineItems, resolveTopValue]
  );

  const resolveRowFlowDisplayValue = React.useCallback(
    (
      segment: RowFlowResolvedSegment,
      targetGroupKey: string,
      field: any,
      parentValues?: Record<string, FieldValue>
    ): { text: string; hasValue: boolean } => {
      const valuesForField = segment.values;
      const formatType = segment.config?.format?.type === 'list' ? 'list' : 'text';
      const listDelimiter = segment.config?.format?.listDelimiter || ', ';
      const rowValues = segment.target?.primaryRow?.row?.values || {};
      const mapped = field?.valueMap
        ? resolveValueMapValue(
            field.valueMap,
            (fid: string) => (rowValues as any)[fid] ?? (parentValues as any)?.[fid] ?? resolveTopValue(fid),
            { language, targetOptions: toOptionSet(field as any) }
          )
        : undefined;
      const rawValues = field?.valueMap ? normalizeValueList(mapped as FieldValue) : valuesForField;
      if (!rawValues.length) return { text: '', hasValue: false };

      if (field?.type === 'CHOICE' || field?.type === 'CHECKBOX') {
        ensureLineOptions(targetGroupKey, field);
        const optionSetField: OptionSet =
          optionState[optionKey(field.id, targetGroupKey)] || {
            en: field.options || [],
            fr: (field as any).optionsFr || [],
            nl: (field as any).optionsNl || [],
            raw: (field as any).optionsRaw
          };
        const localized = buildLocalizedOptions(optionSetField, optionSetField.en || [], language, {
          sort: optionSortFor(field)
        });
        const labels = rawValues.map(val => {
          const raw = Array.isArray(val) ? val[0] : val;
          const match = localized.find(opt => opt.value === raw);
          return (match?.label || raw || '').toString();
        });
        const text = formatType === 'list' ? labels.filter(Boolean).join(listDelimiter) : labels[0] || '';
        return { text, hasValue: text.trim() !== '' };
      }

      const labels = rawValues.map(val => {
        if (val === undefined || val === null) return '';
        if (field?.type === 'DATE') return toDateInputValue(val) || val.toString();
        if (typeof val === 'boolean') {
          return val ? tSystem('common.yes', language, 'Yes') : tSystem('common.no', language, 'No');
        }
        return val.toString();
      });
      const text = formatType === 'list' ? labels.filter(Boolean).join(listDelimiter) : labels[0] || '';
      return { text, hasValue: text.trim() !== '' };
    },
    [ensureLineOptions, language, optionState, optionSortFor, resolveTopValue]
  );

  const buildRowFlowContextHeader = React.useCallback(
    (args: {
      config?: RowFlowOverlayContextHeaderConfig;
      rowId: string;
      rowValues: Record<string, FieldValue>;
      rowFlowState: RowFlowResolvedState;
    }): string => {
      const fields = args.config?.fields || [];
      if (!fields.length) return '';
      const parts = fields
        .map(entry => {
          const fieldRef = (entry?.fieldRef || '').toString().trim();
          if (!fieldRef) return '';
          const target = resolveRowFlowFieldTarget({
            fieldRef,
            groupId: q.id,
            rowId: args.rowId,
            rowValues: args.rowValues || {},
            references: args.rowFlowState.references
          });
          if (!target?.fieldId) return '';
          const valuesForField = (target.rows || []).flatMap(entry =>
            normalizeValueList((entry.row?.values || {})[target.fieldId])
          );
          if (!valuesForField.length) return '';
          const field = resolveRowFlowFieldConfig(target.groupKey, target.fieldId);
          const format =
            valuesForField.length > 1 ? { type: 'list' as const, listDelimiter: ', ' } : undefined;
          const display = field
            ? resolveRowFlowDisplayValue(
                {
                  id: fieldRef,
                  config: { fieldRef, format },
                  target,
                  values: valuesForField
                } as RowFlowResolvedSegment,
                target.groupKey,
                field,
                target.parentValues
              )
            : { text: valuesForField.map(val => (val ?? '').toString()).filter(Boolean).join(', '), hasValue: true };
          if (!display.text) return '';
          const label = resolveLocalizedString(entry?.label, language, '');
          if (!label) return display.text;
          return label.includes('{{value}}')
            ? label.replace('{{value}}', display.text)
            : `${label}: ${display.text}`;
        })
        .filter(Boolean);
      return parts.join(' ');
    },
    [language, q.id, resolveRowFlowDisplayValue, resolveRowFlowFieldConfig]
  );

  const mergeOverlayDetailConfig = (base: any, override: any) => {
    if (!base && !override) return undefined;
    if (!base) return override;
    if (!override) return base;
    return {
      ...base,
      ...override,
      header: { ...(base.header || {}), ...(override.header || {}) },
      body: {
        ...(base.body || {}),
        ...(override.body || {}),
        edit: { ...(base.body?.edit || {}), ...(override.body?.edit || {}) },
        view: { ...(base.body?.view || {}), ...(override.body?.view || {}) }
      },
      rowActions: { ...(base.rowActions || {}), ...(override.rowActions || {}) }
    };
  };

const applyLineItemGroupOverride = (baseConfig: any, override?: LineItemGroupConfigOverride) => {
  if (!baseConfig || !override || typeof override !== 'object') return baseConfig;
  const mergedConfig = { ...baseConfig, ...override } as any;
  mergedConfig.fields = Array.isArray(override.fields) && override.fields.length ? override.fields : baseConfig.fields;
  if (override.subGroups !== undefined) mergedConfig.subGroups = override.subGroups;
    const baseUi = baseConfig.ui || {};
    const overrideUi = (override as any).ui || {};
    const mergedUi = {
      ...baseUi,
      ...overrideUi
    };
  const mergedOverlayDetail = mergeOverlayDetailConfig(baseUi?.overlayDetail, overrideUi?.overlayDetail);
  if (mergedOverlayDetail) {
    (mergedUi as any).overlayDetail = mergedOverlayDetail;
  }
  mergedConfig.ui = Object.keys(mergedUi).length ? mergedUi : undefined;
  const baseAddOverlay = (baseConfig as any)?.addOverlay || {};
  const overrideAddOverlay = (override as any)?.addOverlay || {};
  if (Object.keys(baseAddOverlay).length || Object.keys(overrideAddOverlay).length) {
    (mergedConfig as any).addOverlay = { ...baseAddOverlay, ...overrideAddOverlay };
  }
  return mergedConfig;
};

const resolveAddOverlayCopy = (groupCfg: any, language: LangCode) => {
  const cfg = groupCfg?.addOverlay || {};
  const title = cfg.title ? resolveLocalizedString(cfg.title, language, '').trim() : '';
  const helperText = cfg.helperText ? resolveLocalizedString(cfg.helperText, language, '').trim() : '';
  const placeholder = cfg.placeholder ? resolveLocalizedString(cfg.placeholder, language, '').trim() : '';
  return { title, helperText, placeholder };
};

  const buildOverlayGroupOverride = (group: WebQuestionDefinition, override?: LineItemGroupConfigOverride) => {
    if (!override || typeof override !== 'object') return undefined;
    const baseConfig = group.lineItemConfig as any;
    if (!baseConfig) return undefined;
    const mergedConfig = applyLineItemGroupOverride(baseConfig, override);
    return {
      ...group,
      id: group.id,
      lineItemConfig: mergedConfig
    };
  };

  const runRowFlowActionWithContext = React.useCallback(
    (args: { actionId: string; row: LineItemRowState; rowFlowState: RowFlowResolvedState }) => {
      const { actionId, row, rowFlowState } = args;
      const plan = resolveRowFlowActionPlan({
        actionId,
        config: rowFlow as RowFlowConfig,
        state: rowFlowState,
        groupId: q.id,
        rowId: row.id,
        rowValues: row.values || {},
        lineItems,
        topValues: values,
        subGroupIds: rowFlowSubGroupIds
      });
      if (!plan) return;

      const resolveOverlayContextHeader = (effect: RowFlowResolvedEffect): string => {
        if (effect.type !== 'openOverlay') return '';
        const headerConfig = effect.overlayContextHeader || rowFlow?.overlayContextHeader;
        if (!headerConfig) return '';
        return buildRowFlowContextHeader({
          config: headerConfig,
          rowId: row.id,
          rowValues: (row.values || {}) as Record<string, FieldValue>,
          rowFlowState
        });
      };
      const resolveOverlayHelperText = (effect: RowFlowResolvedEffect): string => {
        if (effect.type !== 'openOverlay') return '';
        const helperConfig = effect.overlayHelperText;
        if (!helperConfig) return '';
        return buildRowFlowContextHeader({
          config: helperConfig,
          rowId: row.id,
          rowValues: (row.values || {}) as Record<string, FieldValue>,
          rowFlowState
        });
      };

      const logActionRun = () => {
        onDiagnostic?.('lineItems.rowFlow.action.run', {
          groupId: q.id,
          rowId: row.id,
          actionId: plan.action.id,
          effectCount: plan.effects.length
        });
      };
      const applyEffects = () => {
        const deleteRoots: Array<{ groupId: string; rowId: string }> = [];
        const setEffects = plan.effects.filter(effect => effect.type === 'setValue');
        const deleteEffects = plan.effects.filter(effect => effect.type === 'deleteLineItems');
        const deleteRowEffects = plan.effects.filter(effect => effect.type === 'deleteRow');
        const addEffects = plan.effects.filter(effect => effect.type === 'addLineItems');
        const openEffects = plan.effects.filter(effect => effect.type === 'openOverlay');
        const closeEffects = plan.effects.filter(effect => effect.type === 'closeOverlay');

        deleteEffects.forEach(effect => {
          effect.rowIds.forEach(rowId => deleteRoots.push({ groupId: effect.groupKey, rowId }));
        });
        deleteRowEffects.forEach(effect => {
          deleteRoots.push({ groupId: effect.groupKey, rowId: effect.rowId });
        });
        if (deleteRowEffects.length) {
          onDiagnostic?.('lineItems.rowFlow.action.deleteRow', {
            groupId: q.id,
            rowId: row.id,
            count: deleteRowEffects.length
          });
        }

        if (openEffects.length) {
          openEffects.forEach(effect => {
            const contextHeader = resolveOverlayContextHeader(effect);
            const hasContextHeader = Boolean(contextHeader);
            const helperText = resolveOverlayHelperText(effect);
            const hasHelperText = Boolean(helperText);
            if (effect.targetKind === 'line') {
              const baseGroup = definition.questions.find(q => q.id === effect.key && q.type === 'LINE_ITEM_GROUP') as
                | WebQuestionDefinition
                | undefined;
              const overrideGroup =
                baseGroup && effect.groupOverride ? buildOverlayGroupOverride(baseGroup, effect.groupOverride) : undefined;
              if (!baseGroup && effect.groupOverride) {
                onDiagnostic?.('lineItems.rowFlow.overlay.missingGroup', {
                  groupId: q.id,
                  rowId: row.id,
                  targetKey: effect.key
                });
              }
              const groupOrId = overrideGroup || effect.key;
              openLineItemGroupOverlay(groupOrId, {
                rowFilter: effect.rowFilter || null,
                hideInlineSubgroups: effect.hideInlineSubgroups,
                hideCloseButton: effect.hideCloseButton,
                closeButtonLabel: resolveLocalizedString(effect.closeButtonLabel as any, language, ''),
                closeConfirm: effect.closeConfirm,
                source: 'overlayOpenAction',
                label: resolveLocalizedString(effect.label as any, language, ''),
                contextHeader: contextHeader || undefined,
                helperText: helperText || undefined,
                rowFlow: effect.rowFlow
              });
              onDiagnostic?.('lineItems.rowFlow.overlay.open', {
                groupId: q.id,
                rowId: row.id,
                targetKey: effect.key,
                targetKind: effect.targetKind,
                hasOverride: !!effect.groupOverride,
                hasRowFlow: !!effect.rowFlow,
                hasContextHeader,
                hasHelperText,
                hideCloseButton: !!effect.hideCloseButton
              });
              return;
            }
            openSubgroupOverlay(effect.key, {
              rowFilter: effect.rowFilter || null,
              hideInlineSubgroups: effect.hideInlineSubgroups,
              groupOverride: effect.groupOverride,
              hideCloseButton: effect.hideCloseButton,
              closeButtonLabel: resolveLocalizedString(effect.closeButtonLabel as any, language, ''),
              closeConfirm: effect.closeConfirm,
              source: 'overlayOpenAction',
              label: resolveLocalizedString(effect.label as any, language, ''),
              contextHeader: contextHeader || undefined,
              helperText: helperText || undefined,
              rowFlow: effect.rowFlow
            });
            onDiagnostic?.('lineItems.rowFlow.overlay.open', {
              groupId: q.id,
              rowId: row.id,
              targetKey: effect.key,
              targetKind: effect.targetKind,
              hasOverride: !!effect.groupOverride,
              hasRowFlow: !!effect.rowFlow,
              hasContextHeader,
              hasHelperText,
              hideCloseButton: !!effect.hideCloseButton
            });
          });
        }

        if (addEffects.length) {
          addEffects.forEach(effect => {
            const count = effect.count || 1;
            for (let idx = 0; idx < count; idx += 1) {
              addLineItemRowManual(effect.groupKey, effect.preset as Record<string, any> | undefined);
            }
            onDiagnostic?.('lineItems.rowFlow.action.addLineItems', {
              groupId: q.id,
              rowId: row.id,
              targetKey: effect.groupKey,
              count,
              hasPreset: !!effect.preset
            });
          });
        }

        if (!setEffects.length && !deleteRoots.length) {
          if (closeEffects.length && ctx.closeOverlay) {
            ctx.closeOverlay();
            onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId: q.id, rowId: row.id });
          }
          logActionRun();
          return;
        }

        setLineItems(prev => {
          let next = prev;
          let changed = false;
          setEffects.forEach(effect => {
            const rows = next[effect.groupKey] || [];
            const idx = rows.findIndex(r => r.id === effect.rowId);
            if (idx < 0) return;
            const base = rows[idx];
            const nextRowValues = { ...(base.values || {}), [effect.fieldId]: effect.value };
            const nextRow = { ...base, values: nextRowValues };
            const nextRows = [...rows];
            nextRows[idx] = nextRow;
            if (next === prev) next = { ...prev };
            next[effect.groupKey] = nextRows;
            changed = true;
          });

          if (deleteRoots.length) {
            const cascade = cascadeRemoveLineItemRows({ lineItems: next, roots: deleteRoots });
            if (cascade.removedSubgroupKeys.length) {
              setSubgroupSelectors(prevSel => {
                const nextSel = { ...prevSel };
                cascade.removedSubgroupKeys.forEach(key => {
                  delete (nextSel as any)[key];
                });
                return nextSel;
              });
            }
            next = cascade.lineItems;
            changed = true;
          }

          if (!changed) return prev;
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next, {
            mode: 'init'
          });
          setValues(nextValues);
          const touchedKeys = new Set<string>();
          setEffects.forEach(effect => touchedKeys.add(effect.groupKey));
          deleteEffects.forEach(effect => touchedKeys.add(effect.groupKey));
          touchedKeys.forEach(groupKey => {
            ctx.runSelectionEffectsForAncestors?.(groupKey, prev, recomputed);
          });
          return recomputed;
        });
        if (closeEffects.length && ctx.closeOverlay) {
          ctx.closeOverlay();
          onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId: q.id, rowId: row.id });
        }
        logActionRun();
      };

      const confirm = plan.action.confirm;
      const confirmTiming = (() => {
        const rawTiming = (confirm as any)?.timing;
        const timing = (rawTiming === undefined || rawTiming === null ? '' : rawTiming.toString()).trim().toLowerCase();
        return timing === 'after' ? 'after' : 'before';
      })();
      if (confirm && confirmTiming === 'before' && ctx.openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));
        ctx.openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel,
          showCancel: confirm.showCancel !== false,
          kind: confirm.kind || 'rowFlow',
          refId: `${q.id}::${row.id}::${plan.action.id}`,
          onConfirm: applyEffects
        });
        return;
      }
      applyEffects();
      if (confirm && confirmTiming === 'after' && ctx.openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        ctx.openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel: '',
          showCancel: false,
          kind: confirm.kind || 'rowFlow.after',
          refId: `${q.id}::${row.id}::${plan.action.id}::after`,
          onConfirm: () => {}
        });
        onDiagnostic?.('lineItems.rowFlow.action.confirm.after', { groupId: q.id, rowId: row.id, actionId: plan.action.id });
      }
    },
    [
      buildOverlayGroupOverride,
      buildRowFlowContextHeader,
      definition,
      language,
      lineItems,
      onDiagnostic,
      openLineItemGroupOverlay,
      openSubgroupOverlay,
      q.id,
      rowFlow,
      rowFlowSubGroupIds,
      setLineItems,
      setSubgroupSelectors,
      setValues,
      values
    ]
  );

  const renderRowFlowActionControlWithContext = React.useCallback(
    (args: { actionId: string; row: LineItemRowState; rowFlowState: RowFlowResolvedState }) => {
      const action = rowFlowActionById.get(args.actionId);
      if (!action) return null;
      const label = resolveLocalizedString(action.label, language, action.id);
      const iconKey = (action.icon || '').toString().trim().toLowerCase();
      const variant = (action.variant || (iconKey ? 'icon' : 'button')).toString().trim().toLowerCase();
      const tone = (action.tone || 'secondary').toString().trim().toLowerCase();
      const disabled = submitting;
      const onClick = () => {
        if (disabled) return;
        runRowFlowActionWithContext({ actionId: action.id, row: args.row, rowFlowState: args.rowFlowState });
      };

      if (variant === 'icon' || iconKey) {
        const iconNode =
          iconKey === 'remove' ? (
            <TrashIcon size={20} />
          ) : iconKey === 'add' ? (
            <PlusIcon />
          ) : iconKey === 'back' ? (
            <XIcon size={20} />
          ) : (
            <PencilIcon size={20} />
          );
        return (
          <button
            key={action.id}
            type="button"
            aria-label={label || action.id}
            title={label || action.id}
            onClick={onClick}
            disabled={disabled}
            style={withDisabled(buttonStyles.secondary, disabled)}
          >
            {iconNode}
          </button>
        );
      }

      const buttonStyle = tone === 'primary' ? buttonStyles.primary : buttonStyles.secondary;
      return (
        <button key={action.id} type="button" onClick={onClick} disabled={disabled} style={withDisabled(buttonStyle, disabled)}>
          {label || action.id}
        </button>
      );
    },
    [language, rowFlowActionById, runRowFlowActionWithContext, submitting]
  );

  React.useEffect(() => {
    if (!rowFlowEnabled) return;
    rowFlowStateByRowId.forEach((state, rowId) => {
      const row = parentRowById.get(rowId);
      if (!row) return;
      state.prompts.forEach(prompt => {
        const autoActions = prompt.config.onCompleteActions || [];
        if (!autoActions.length) return;
        const tracker = rowFlowPromptCompleteRef.current[rowId] || {};
        const hasTracked = Object.prototype.hasOwnProperty.call(tracker, prompt.id);
        const wasComplete = tracker[prompt.id] === true;
        const nowComplete = prompt.complete && prompt.showWhenOk !== false;
        if (!hasTracked) {
          tracker[prompt.id] = nowComplete;
          rowFlowPromptCompleteRef.current[rowId] = tracker;
          if (nowComplete) {
            onDiagnostic?.('lineItems.rowFlow.prompt.autoAction.skipInit', {
              groupId: q.id,
              rowId,
              promptId: prompt.id,
              actionCount: autoActions.length
            });
          }
          return;
        }
        if (!wasComplete && nowComplete) {
          autoActions.forEach(actionId => {
            runRowFlowActionWithContext({ actionId, row, rowFlowState: state });
            onDiagnostic?.('lineItems.rowFlow.prompt.autoAction', {
              groupId: q.id,
              rowId,
              promptId: prompt.id,
              actionId
            });
          });
        }
        tracker[prompt.id] = nowComplete;
        rowFlowPromptCompleteRef.current[rowId] = tracker;
      });
    });
  }, [onDiagnostic, parentRowById, q.id, rowFlowEnabled, rowFlowStateByRowId, runRowFlowActionWithContext]);

  const buildRowFlowGroupDefinition = (groupKey: string, groupConfig: any): WebQuestionDefinition => ({
    ...(q as any),
    id: groupKey,
    lineItemConfig: {
      ...(groupConfig as any),
      fields: groupConfig?.fields || [],
      subGroups: groupConfig?.subGroups || []
    }
  });

  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = key && warningByField ? (warningByField as any)[key] : undefined;
    return Array.isArray(list) ? list.filter(Boolean).map(m => (m || '').toString()) : [];
  };
  const filterWarnings = (msgs: string[]): string[] => {
    if (!msgs.length) return msgs;
    if (useValidationNonMatchWarnings) return msgs;
    return msgs.filter(msg => !genericNonMatchWarnings.has(msg));
  };
  const hasWarning = (fieldPath: string): boolean => filterWarnings(warningsFor(fieldPath)).length > 0;
  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = filterWarnings(warningsFor(fieldPath));
    if (!msgs.length) return null;
    return msgs.map((m, idx) => (
      <div key={`${fieldPath}-warning-${idx}`} className="warning">
        {m}
      </div>
    ));
  };

  const normalizeAnchorKey = (raw: any): string => {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) {
      const first = raw[0];
      return first === undefined || first === null ? '' : first.toString().trim();
    }
    return raw.toString().trim();
  };

  const buildOptionSetForLineField = (field: any, groupKey: string): OptionSet => {
    const key = optionKey(field.id, groupKey);
    const fromState = optionState[key];
    if (fromState) return fromState;
    return {
      en: field.options || [],
      fr: (field as any).optionsFr || [],
      nl: (field as any).optionsNl || [],
      raw: (field as any).optionsRaw
    };
  };

  const resolveDependsOnIds = (field: any): string[] => {
    const raw = field?.optionFilter?.dependsOn;
    const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return ids.map((id: any) => (id ?? '').toString().trim()).filter(Boolean);
  };

  // Auto-add should only reconcile when the controlling dependency values change (or when anchor options arrive),
  // not when the user removes a row or edits unrelated fields.
  const autoCfg = q.lineItemConfig;
  const autoAnchorField =
    autoCfg?.addMode === 'auto' && autoCfg.anchorFieldId
      ? (autoCfg.fields || []).find((f: any) => f && f.id === autoCfg.anchorFieldId)
      : undefined;
  const autoAnchorIsChoice = !!autoAnchorField && (autoAnchorField as any).type === 'CHOICE';
  const autoDependencyIds = autoAnchorIsChoice ? resolveDependsOnIds(autoAnchorField) : [];
  const autoDepSignature = autoDependencyIds
    .map(depId => {
      const dep = toDependencyValue((values as any)[depId] as any);
      if (dep === undefined || dep === null) return '';
      return dep.toString();
    })
    .join('||');
  const autoAnchorOptionSetKey =
    autoAnchorIsChoice && autoAnchorField ? optionKey((autoAnchorField as any).id, q.id) : '';
  const autoAnchorOptionSet = autoAnchorOptionSetKey ? optionState[autoAnchorOptionSetKey] : undefined;

  const isValidDependencyValue = (raw: any): boolean => {
    const dep = toDependencyValue(raw as any);
    if (dep === undefined || dep === null) return false;
    if (typeof dep === 'number') return Number.isFinite(dep);
    return dep.toString().trim() !== '';
  };

  const computeAutoDesired = (args: {
    groupKey: string;
    anchorField: any;
    dependencyIds: string[];
    getDependencyRaw: (depId: string) => any;
  }): { valid: boolean; desired: string[]; depVals: (string | number | null | undefined)[] } => {
    const { groupKey, anchorField, dependencyIds, getDependencyRaw } = args;
    const depRawVals = dependencyIds.map(depId => getDependencyRaw(depId));
    const depVals = depRawVals.map(v => toDependencyValue(v as any));
    const valid = dependencyIds.length > 0 && depRawVals.every(isValidDependencyValue);
    if (!valid) return { valid: false, desired: [], depVals };
    const opts = buildOptionSetForLineField(anchorField, groupKey);
    const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
    const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
    const seen = new Set<string>();
    const desired: string[] = [];
    localized.forEach(opt => {
      const key = (opt?.value ?? '').toString().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      desired.push(key);
    });
    return { valid: true, desired, depVals };
  };

  const reconcileAutoRows = (args: {
    currentRows: any[];
    targetKey: string;
    anchorFieldId: string;
    desired: string[];
    depVals: (string | number | null | undefined)[];
    selectorId?: string;
    selectorValue?: FieldValue;
  }): {
    rows: any[];
    changed: boolean;
    contextId: string;
    desiredCount: number;
  } => {
    const { currentRows, targetKey, anchorFieldId, desired, depVals, selectorId, selectorValue } = args;
    const autoPrefix = `${AUTO_CONTEXT_PREFIX}:${targetKey}:`;
    const contextId = `${autoPrefix}${depVals.map(v => (v === undefined || v === null ? '' : v.toString())).join('||')}`;

    const remaining = new Set(desired);

    const nextRows: any[] = [];
    const addedRows: any[] = [];
    currentRows.forEach(row => {
      const isAutoContext =
        (typeof row.effectContextId === 'string' && row.effectContextId.startsWith(autoPrefix)) ||
        parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]) === 'auto';
      if (!isAutoContext) {
        nextRows.push(row);
        return;
      }

      const key = normalizeAnchorKey((row.values as any)?.[anchorFieldId]);
      if (!key || !remaining.has(key)) {
        // Drop auto rows that are no longer desired.
        return;
      }
      remaining.delete(key);

      const nextValues: Record<string, FieldValue> = { ...(row.values || {}) };
      let valuesChanged = false;
      if (normalizeAnchorKey((nextValues as any)[anchorFieldId]) !== key) {
        nextValues[anchorFieldId] = key;
        valuesChanged = true;
      }
      if (parseRowSource((nextValues as any)[ROW_SOURCE_KEY]) !== 'auto') {
        nextValues[ROW_SOURCE_KEY] = ROW_SOURCE_AUTO;
        valuesChanged = true;
      }
      if (
        selectorId &&
        selectorValue !== undefined &&
        selectorValue !== null &&
        (nextValues as any)[selectorId] === undefined
      ) {
        nextValues[selectorId] = selectorValue;
        valuesChanged = true;
      }

      const metaChanged = row.autoGenerated !== true || row.effectContextId !== contextId;
      if (valuesChanged || metaChanged) {
        nextRows.push({
          ...row,
          values: nextValues,
          autoGenerated: true,
          effectContextId: contextId
        });
      } else {
        nextRows.push(row);
      }
    });

    // Prepend missing desired keys so newest additions show first.
    desired.forEach(key => {
      if (!remaining.has(key)) return;
      remaining.delete(key);
      const nextValues: Record<string, FieldValue> = {
        [anchorFieldId]: key,
        [ROW_SOURCE_KEY]: ROW_SOURCE_AUTO
      };
      if (selectorId && selectorValue !== undefined && selectorValue !== null) {
        nextValues[selectorId] = selectorValue;
      }
      addedRows.unshift({
        id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
        values: nextValues,
        autoGenerated: true,
        effectContextId: contextId
      });
    });

    const combinedRows = addedRows.length ? [...addedRows, ...nextRows] : nextRows;
    const changed =
      combinedRows.length !== currentRows.length || combinedRows.some((row, idx) => row !== currentRows[idx]);
    return { rows: combinedRows, changed, contextId, desiredCount: desired.length };
  };

  // Auto addMode: when dependsOn fields are valid, auto-create one row per allowed anchor option.
  React.useEffect(() => {
    if (submitting) return;
    const cfg = q.lineItemConfig;
    if (!cfg || cfg.addMode !== 'auto' || !cfg.anchorFieldId) return;
    const anchorField = (cfg.fields || []).find(f => f.id === cfg.anchorFieldId);
    if (!anchorField || anchorField.type !== 'CHOICE') return;
    const dependencyIds = resolveDependsOnIds(anchorField);
    if (!dependencyIds.length) return;

    // Ensure anchor options are loaded so allowed values can be computed.
    ensureLineOptions(q.id, anchorField);

    const { valid, desired, depVals } = computeAutoDesired({
      groupKey: q.id,
      anchorField,
      dependencyIds,
      getDependencyRaw: depId => values[depId]
    });

    const selectorId = cfg.sectionSelector?.id;
    const selectorValue = selectorId ? (values as any)[selectorId] : undefined;

    const spec = {
      targetKey: q.id,
      anchorFieldId: anchorField.id,
      desired: valid ? desired : [],
      depVals,
      selectorId,
      selectorValue
    };

    setLineItems(prev => {
      const currentRows = prev[q.id] || [];
      const res = reconcileAutoRows({ currentRows, ...spec });
      if (!res.changed) return prev;
      const nextState = { ...prev, [q.id]: res.rows };
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextState, {
        mode: 'change'
      });
      setValues(nextValues);
      onDiagnostic?.('ui.lineItems.autoAdd.apply', {
        targetKey: q.id,
        anchorFieldId: anchorField.id,
        valid,
        desiredCount: res.desiredCount,
        nextRowCount: res.rows.length,
        contextId: res.contextId
      });
      return recomputed;
    });
  }, [
    submitting,
    q.id,
    q.lineItemConfig?.addMode,
    q.lineItemConfig?.anchorFieldId,
    // Only re-run when controlling dependency values change (or when the anchor options set changes)
    autoDepSignature,
    autoAnchorOptionSet,
    ensureLineOptions,
    setLineItems,
    setValues
  ]);

  // Auto addMode for subgroups (per parent row).
  React.useEffect(() => {
    if (submitting) return;
    const parentCfg = q.lineItemConfig;
    if (!parentCfg?.subGroups?.length) return;
    const parentRows = lineItems[q.id] || [];
    if (!parentRows.length) return;

    const autoSubs = parentCfg.subGroups.filter(sub => (sub as any).addMode === 'auto' && (sub as any).anchorFieldId);
    if (!autoSubs.length) return;
    const specs: Array<{
      targetKey: string;
      anchorFieldId: string;
      desired: string[];
      depVals: (string | number | null | undefined)[];
      selectorId?: string;
      selectorValue?: FieldValue;
    }> = [];

    autoSubs.forEach(sub => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      const anchorField = ((sub as any).fields || []).find((f: any) => f.id === (sub as any).anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const dependencyIds = resolveDependsOnIds(anchorField);
      if (!dependencyIds.length) return;

      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);

        const selectorId = (sub as any).sectionSelector?.id;
        const selectorValue = selectorId ? (subgroupSelectors as any)[subKey] : undefined;

        const { valid, desired, depVals } = computeAutoDesired({
          groupKey: subKey,
          anchorField,
          dependencyIds,
          getDependencyRaw: depId => {
            if (selectorId && depId === selectorId) return selectorValue;
            const fromRow = row.values ? (row.values as any)[depId] : undefined;
            if (fromRow !== undefined && fromRow !== null && fromRow !== '') return fromRow;
            return (values as any)[depId];
          }
        });

        specs.push({
          targetKey: subKey,
          anchorFieldId: anchorField.id,
          desired: valid ? desired : [],
          depVals,
          selectorId,
          selectorValue
        });
      });
    });

    if (!specs.length) return;

    setLineItems(prev => {
      let next: any = prev;
      let changedCount = 0;
      specs.forEach(spec => {
        const currentRows = (next[spec.targetKey] || prev[spec.targetKey] || []) as any[];
        const res = reconcileAutoRows({ currentRows, ...spec });
        if (!res.changed) return;
        if (next === prev) next = { ...prev };
        (next as any)[spec.targetKey] = res.rows;
        changedCount += 1;
      });
      if (next === prev) return prev;
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next as any, {
        mode: 'change'
      });
      setValues(nextValues);
      onDiagnostic?.('ui.lineItems.autoAdd.applyBatch', {
        parentGroupId: q.id,
        specCount: specs.length,
        changedCount
      });
      return recomputed;
    });
  }, [
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    setLineItems,
    setValues
  ]);

  // Autofill subgroup anchor choice when there is exactly 1 allowed option (avoid extra tap).
  // This covers cases where subgroup rows already exist (e.g., seeded minRows/defaults) and the anchor is still empty.
  React.useEffect(() => {
    if (submitting) return;
    const parentCfg = q.lineItemConfig;
    if (!parentCfg?.subGroups?.length) return;
    const parentRows = (lineItems[q.id] || []) as any[];
    if (!parentRows.length) return;

    const subgroupTargets = (parentCfg.subGroups || [])
      .map(sub => ({
        sub: sub as any,
        subId: resolveSubgroupKey(sub as any),
        anchorFieldId:
          (sub as any)?.anchorFieldId !== undefined && (sub as any)?.anchorFieldId !== null
            ? (sub as any).anchorFieldId.toString()
            : ''
      }))
      .filter(entry => entry.subId && entry.anchorFieldId && Array.isArray(entry.sub?.fields) && entry.sub.fields.length);
    if (!subgroupTargets.length) return;

    // Prime option loads for subgroup anchor fields.
    subgroupTargets.forEach(({ sub, subId, anchorFieldId }) => {
      const anchorField = (sub.fields || []).find((f: any) => f?.id === anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);
      });
    });

    const normalizeChoice = (raw: any): string => {
      if (raw === undefined || raw === null) return '';
      if (Array.isArray(raw)) {
        const first = raw[0];
        return first === undefined || first === null ? '' : first.toString().trim();
      }
      return raw.toString().trim();
    };

    setLineItems(prev => {
      const parentRowsPrev = (prev[q.id] || []) as any[];
      if (!parentRowsPrev.length) return prev;

      let next: any = prev;
      let didChange = false;

      subgroupTargets.forEach(({ sub, subId, anchorFieldId }) => {
        const anchorField = (sub.fields || []).find((f: any) => f?.id === anchorFieldId);
        if (!anchorField || anchorField.type !== 'CHOICE') return;
        const dependencyIds = resolveDependsOnIds(anchorField);
        const subSelectorId =
          sub?.sectionSelector?.id !== undefined && sub?.sectionSelector?.id !== null ? sub.sectionSelector.id.toString() : '';

        parentRowsPrev.forEach(parentRow => {
          const subKey = buildSubgroupKey(q.id, parentRow.id, subId);
          const subRows = (next[subKey] || prev[subKey] || []) as any[];
          if (!subRows.length) return;

          const optionSetField = buildOptionSetForLineField(anchorField, subKey);
          const depVals = dependencyIds.map((dep: string) => {
            const selectorFallback = subSelectorId && dep === subSelectorId ? (subgroupSelectors as any)[subKey] : undefined;
            return toDependencyValue(
              (subRows[0]?.values || {})[dep] ?? (values as any)[dep] ?? (parentRow?.values || {})[dep] ?? selectorFallback
            );
          });
          const allowed = computeAllowedOptions(anchorField.optionFilter, optionSetField, depVals);
          const localized = buildLocalizedOptions(optionSetField, allowed, language, { sort: optionSortFor(anchorField) });
          const uniqueVals = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
          if (uniqueVals.length !== 1) return;
          const only = uniqueVals[0];

          let changedRows: any[] | null = null;
          subRows.forEach((subRow, idx) => {
            const cur = normalizeChoice((subRow?.values || {})[anchorFieldId]);
            if (cur) return;
            if (!changedRows) changedRows = subRows.map(r => ({ ...r, values: { ...(r.values || {}) } }));
            (changedRows[idx].values as any)[anchorFieldId] = only;
            didChange = true;
            onDiagnostic?.('ui.subgroup.anchor.autofillSingleOption', {
              groupId: subKey,
              rowId: subRow?.id || null,
              fieldId: anchorFieldId,
              value: only
            });
          });
          if (changedRows) {
            if (next === prev) next = { ...prev };
            next[subKey] = changedRows;
          }
        });
      });

      if (!didChange || next === prev) return prev;
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next as any, { mode: 'change' });
      setValues(nextValues);
      return recomputed;
    });
  }, [
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    setLineItems,
    setValues
  ]);

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
        const selectorOverlayAnchorFieldId =
          q.lineItemConfig?.anchorFieldId !== undefined && q.lineItemConfig?.anchorFieldId !== null
            ? q.lineItemConfig.anchorFieldId.toString()
            : '';
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
            return (
              <button
                type="button"
                disabled={submitting || selectorIsMissing}
                style={withDisabled(buttonStyles.secondary, submitting || selectorIsMissing)}
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
                    const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                    if (loaded) {
                      opts = loaded;
                      setOptionState(prev => ({ ...prev, [key]: loaded }));
                    }
                  }
                  if (!opts) {
                    opts = {
                      en: anchorField.options || [],
                      fr: (anchorField as any).optionsFr || [],
                      nl: (anchorField as any).optionsNl || [],
                      raw: (anchorField as any).optionsRaw
                    };
                  }
                  const dependencyIds = (
                    Array.isArray(anchorField.optionFilter?.dependsOn)
                      ? anchorField.optionFilter?.dependsOn
                      : [anchorField.optionFilter?.dependsOn || '']
                  ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                  const depVals = dependencyIds.map(dep => toDependencyValue(values[dep]));
                  const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                  const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                  const deduped = Array.from(
                    new Set(localized.map(opt => opt.value).filter(Boolean))
                  );
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
                  if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.placeholder) {
                    onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                      groupId: q.id,
                      scope: 'lineItemGroup',
                      hasTitle: !!addOverlayCopy.title,
                      hasHelperText: !!addOverlayCopy.helperText,
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
                    placeholder: addOverlayCopy.placeholder
                  });
                }}
              >
                <PlusIcon />
                {resolveLocalizedString(
                  q.lineItemConfig?.addButtonLabel,
                  language,
                  tSystem('lineItems.addLines', language, 'Add lines')
                )}
              </button>
            );
          }
          return (
            <button
              type="button"
              disabled={submitting || selectorIsMissing}
              onClick={() => {
                const selectorNow = (latestSectionSelectorValueRef.current || selectorValue || '').toString().trim();
                const anchorFieldId =
                  q.lineItemConfig?.anchorFieldId !== undefined && q.lineItemConfig?.anchorFieldId !== null
                    ? q.lineItemConfig.anchorFieldId.toString()
                    : '';
                const selectorPreset =
                  anchorFieldId && selectorNow
                    ? { [anchorFieldId]: selectorNow }
                    : undefined;
                addLineItemRowManual(q.id, selectorPreset);
              }}
              style={withDisabled(buttonStyles.secondary, submitting || selectorIsMissing)}
            >
              <PlusIcon />
              {resolveLocalizedString(
                q.lineItemConfig?.addButtonLabel,
                language,
                tSystem('lineItems.addLine', language, 'Add line')
              )}
            </button>
          );
        };

        const groupTotals = computeTotals({ config: q.lineItemConfig!, rows: parentRows }, language);
        const parentCount = parentRows.length;
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
        }, [onDiagnostic, q.id, selectorCfg, selectorHideLabel]);

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
                    deduped.forEach(val => addLineItemRowManual(q.id, { [selectorOverlayAnchorFieldId]: val }));
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
                  onDiagnostic={(event, payload) => onDiagnostic?.(event, { scope: 'lineItems.selector', fieldId: selectorCfg.id, ...(payload || {}) })}
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
        const uiMode = (liUi?.mode || 'default').toString().trim().toLowerCase();
        const isTableMode = uiMode === 'table';
        const addButtonPlacement = (liUi?.addButtonPlacement || 'both').toString().toLowerCase();
        const showAddTop =
          !canUseSelectorOverlay &&
          addButtonPlacement !== 'hidden' &&
          (addButtonPlacement === 'both' || addButtonPlacement === 'top');
        const showAddBottom =
          !canUseSelectorOverlay &&
          addButtonPlacement !== 'hidden' &&
          (addButtonPlacement === 'both' || addButtonPlacement === 'bottom');
        // Keep the selector control aligned with addButtonPlacement so it doesn't appear at the "wrong" end of the group.
        const showSelectorTop =
          Boolean(selectorControl) &&
          (canUseSelectorOverlay
            ? addButtonPlacement !== 'hidden' && addButtonPlacement !== 'bottom'
            : showAddTop);
        const showSelectorBottom =
          Boolean(selectorControl) &&
          (canUseSelectorOverlay ? addButtonPlacement !== 'hidden' && addButtonPlacement === 'bottom' : showAddBottom);
        const hideGroupLabel = q.ui?.hideLabel === true;

        React.useEffect(() => {
          if (!onDiagnostic) return;
          if (liUi?.addButtonPlacement && liUi.addButtonPlacement !== 'both') {
            onDiagnostic('ui.lineItems.addButtonPlacement', { groupId: q.id, value: liUi.addButtonPlacement });
          }
        }, [onDiagnostic, liUi?.addButtonPlacement, q.id]);

        const nonMatchWarningModeRaw = (liUi as any)?.nonMatchWarningMode;
        const nonMatchWarningModeCandidate =
          nonMatchWarningModeRaw !== undefined && nonMatchWarningModeRaw !== null
            ? nonMatchWarningModeRaw.toString().trim().toLowerCase()
            : '';
        const nonMatchWarningMode: 'descriptive' | 'validation' | 'both' =
          nonMatchWarningModeCandidate === 'validation' ||
          nonMatchWarningModeCandidate === 'rules' ||
          nonMatchWarningModeCandidate === 'rule' ||
          nonMatchWarningModeCandidate === 'generic'
            ? 'validation'
            : nonMatchWarningModeCandidate === 'both' || nonMatchWarningModeCandidate === 'all'
              ? 'both'
              : 'descriptive';
        const useValidationNonMatchWarnings = nonMatchWarningMode !== 'descriptive';
        const useDescriptiveNonMatchWarnings = nonMatchWarningMode !== 'validation';
        if (nonMatchWarningModeCandidate) {
          const warningKey = `${q.id}::nonMatchWarningMode`;
          if (!warningModeLoggedRef.current.has(warningKey)) {
            warningModeLoggedRef.current.add(warningKey);
            onDiagnostic?.('ui.lineItems.nonMatchWarningMode', { groupId: q.id, mode: nonMatchWarningMode });
          }
        }

        const messageFieldsAll = q.lineItemConfig?.fields || [];
        const tableColumnIdsRaw = isTableMode && Array.isArray(liUi?.tableColumns) ? liUi?.tableColumns : [];
        const tableColumnIds = tableColumnIdsRaw
          .map(id => (id !== undefined && id !== null ? id.toString().trim() : ''))
          .filter(Boolean);
        const tableFieldsAll = messageFieldsAll;
        const tableFields = isTableMode
          ? (tableColumnIds.length ? tableColumnIds : tableFieldsAll.map(f => f.id))
              .map(fid => tableFieldsAll.find(f => f.id === fid))
              .filter((field): field is (typeof tableFieldsAll)[number] => Boolean(field))
          : [];
        const tableFieldIdSet = new Set(tableFields.map(field => field.id));
        const tableTotals =
          isTableMode && !rowFlowEnabled
            ? groupTotals.filter(total => {
                const key = (total.key || '').toString();
                return key ? tableFieldIdSet.has(key) : false;
              })
            : [];
        const toolbarTotals = isTableMode && !rowFlowEnabled ? [] : groupTotals;
        const genericNonMatchWarnings = (() => {
          const seen = new Set<string>();
          messageFieldsAll.forEach(field => {
            const rules = Array.isArray((field as any)?.validationRules)
              ? ((field as any).validationRules as ValidationRule[])
              : [];
            rules.forEach((rule: ValidationRule) => {
              if (!rule || (rule as any)?.level !== 'warning') return;
              const when = (rule as any)?.when;
              if (!when || typeof when !== 'object') return;
              if ((when as any)?.fieldId !== ROW_NON_MATCH_OPTIONS_KEY) return;
              const msg = resolveLocalizedString((rule as any)?.message, language, '');
              const text = msg ? msg.toString().trim() : '';
              if (text) seen.add(text);
            });
          });
          return seen;
        })();

        const shouldRenderTopToolbar = !hideToolbars && (showSelectorTop || showAddTop);
        const shouldRenderBottomToolbar =
          !hideToolbars && (parentRows.length > 0 || showAddBottom) && (showAddBottom || showSelectorBottom || toolbarTotals.length > 0);

        // UX: in progressive/collapsible groups, auto-expand the first row that still needs attention
        // (errors/warnings or incomplete required fields), as long as the row is expandable.
        const didAutoExpandAttentionRef = React.useRef(false);
        const attentionRowId = React.useMemo((): string => {
          if (didAutoExpandAttentionRef.current) return '';
          if (!parentRows.length) return '';

          const ui = q.lineItemConfig?.ui as any;
          const guidedCollapsedFieldsInHeader = Boolean(ui?.guidedCollapsedFieldsInHeader);
          const isProgressive =
            ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
          if (!isProgressive || guidedCollapsedFieldsInHeader) return '';

          const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
          const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
          const collapsedFieldConfigs = (ui?.collapsedFields || []) as any[];
          const allFields = (q.lineItemConfig?.fields || []) as any[];
          const subGroups = (q.lineItemConfig?.subGroups || []) as any[];

          // Don't fight the user: if any row in this group is explicitly expanded, don't auto-expand.
          const hasExplicitExpanded = parentRows.some(r => collapsedRows[`${q.id}::${r.id}`] === false);
          if (hasExplicitExpanded) return '';

          const rowHasAnyWarning = (rowId: string): boolean => {
            if (!warningByField) return false;
            const prefix = `${q.id}__`;
            const suffix = `__${rowId}`;
            return Object.entries(warningByField).some(([key, value]) => {
              if (!key.startsWith(prefix) || !key.endsWith(suffix)) return false;
              const msgs = Array.isArray(value) ? value.filter(Boolean).map(m => (m || '').toString()) : [];
              return filterWarnings(msgs).length > 0;
            });
          };

          const getTopValue = (fid: string): FieldValue | undefined => resolveTopValue(fid);

          const isRequiredFieldFilled = (field: any, raw: any): boolean => {
            if (field?.type === 'FILE_UPLOAD') {
              return isUploadValueComplete({
                value: raw as any,
                uploadConfig: (field as any).uploadConfig,
                required: true
              });
            }
            return !isEmptyValue(raw as any);
          };

          const canExpandRow = (row: any, rowCollapsed: boolean): boolean => {
            if (!rowCollapsed) return true;
            if (expandGate === 'always') return true;
            if (!collapsedFieldConfigs.length) return true;

            const groupCtx: VisibilityContext = {
              getValue: fid => getTopValue(fid),
              getLineValue: (_rowId, fid) => (row?.values || {})[fid],
              getLineItems: groupId => lineItems?.[groupId] || [],
              getLineItemKeys: () => Object.keys(lineItems || {})
            };
            const isHidden = (fieldId: string) => {
              const target = (allFields || []).find((f: any) => f?.id === fieldId) as any;
              if (!target) return false;
              return shouldHideField(target.visibility, groupCtx, { rowId: row?.id, linePrefix: q.id });
            };

            for (const cfg of collapsedFieldConfigs) {
              const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
              if (!fid) continue;
              const field = (allFields || []).find((f: any) => f?.id === fid) as any;
              if (!field) continue;

              const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row?.id, linePrefix: q.id });
              if (hideField) continue;

              const raw = (row?.values || {})[field.id];
              if (field.required && !isRequiredFieldFilled(field, raw)) return false;

              const rules = Array.isArray(field.validationRules)
                ? field.validationRules.filter((r: any) => r?.then?.fieldId === field.id)
                : [];
              if (rules.length) {
                const rulesCtx: any = {
                  ...groupCtx,
                  getValue: (fieldId: string) =>
                    Object.prototype.hasOwnProperty.call(row?.values || {}, fieldId)
                      ? (row?.values || {})[fieldId]
                      : getTopValue(fieldId),
                  language,
                  phase: 'submit',
                  isHidden
                };
                const errs = validateRules(rules, rulesCtx);
                if (errs.length) return false;
              }
            }

            return true;
          };

          const rowHasMissingRequired = (row: any): boolean => {
            const rowValues = (row?.values || {}) as Record<string, FieldValue>;
            const groupCtx: VisibilityContext = {
              getValue: fid => getTopValue(fid),
              getLineValue: (_rowId, fid) => rowValues[fid],
              getLineItems: groupId => lineItems?.[groupId] || [],
              getLineItemKeys: () => Object.keys(lineItems || {})
            };

            for (const field of allFields) {
              if (!field?.required) continue;
              const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
              if (hideField) continue;
              const mapped = field.valueMap
                ? resolveValueMapValue(
                    field.valueMap,
                    (fid: string) => {
                      if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                      return getTopValue(fid);
                    },
                    { language, targetOptions: toOptionSet(field as any) }
                  )
                : undefined;
              const raw = field.valueMap ? mapped : (rowValues as any)[field.id];
              if (!isRequiredFieldFilled(field, raw)) return true;
            }

            for (const sub of subGroups) {
              const subId = resolveSubgroupKey(sub as any);
              if (!subId) continue;
              const subKey = buildSubgroupKey(q.id, row.id, subId);
              const subRows = (lineItems[subKey] || []) as any[];
              if (!subRows.length) continue;
              const subFields = ((sub as any)?.fields || []) as any[];
              for (const subRow of subRows) {
                const subRowValues = ((subRow as any)?.values || {}) as Record<string, FieldValue>;
                const subCtx: VisibilityContext = {
                  getValue: (fid: string) => {
                    if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
                    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                    return getTopValue(fid);
                  },
                  getLineValue: (_rowId, fid) => subRowValues[fid],
                  getLineItems: groupId => lineItems?.[groupId] || [],
                  getLineItemKeys: () => Object.keys(lineItems || {})
                };
                for (const field of subFields) {
                  if (!field?.required) continue;
                  const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                  if (hideField) continue;
                  const mapped = field.valueMap
                    ? resolveValueMapValue(
                        field.valueMap,
                        (fid: string) => {
                          if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
                          if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                          return getTopValue(fid);
                        },
                        { language, targetOptions: toOptionSet(field as any) }
                      )
                    : undefined;
                  const raw = field.valueMap ? mapped : (subRowValues as any)[field.id];
                  if (!isRequiredFieldFilled(field, raw)) return true;
                }
              }
            }

            return false;
          };

          for (const row of parentRows) {
            const collapseKey = `${q.id}::${row.id}`;
            const rowCollapsed = collapsedRows[collapseKey] ?? defaultCollapsed;
            if (!rowCollapsed) continue;
            if (!canExpandRow(row, rowCollapsed)) continue;

            const rowHasError = errorIndex.rowErrors.has(collapseKey);
            const rowNeedsAttention = rowHasError || rowHasAnyWarning(row.id) || rowHasMissingRequired(row);
            if (rowNeedsAttention) return row.id;
          }
          return '';
        }, [
          q.id,
          q.lineItemConfig,
          parentRows,
          collapsedRows,
          warningByField,
          errorIndex,
          lineItems,
          values,
          resolveVisibilityValue,
          getTopValueFromCtx,
          language
        ]);
        React.useEffect(() => {
          if (!attentionRowId) return;
          if (didAutoExpandAttentionRef.current) return;
          didAutoExpandAttentionRef.current = true;
          const key = `${q.id}::${attentionRowId}`;
          setCollapsedRows(prev => {
            if (prev[key] === false) return prev;
            return { ...prev, [key]: false };
          });
          onDiagnostic?.('ui.lineItems.autoExpand.firstAttention', { groupId: q.id, rowId: attentionRowId });
        }, [attentionRowId, q.id, setCollapsedRows, onDiagnostic]);

        if (isTableMode && !rowFlowEnabled) {
          const messageFields = messageFieldsAll;
          const anchorFieldId =
            q.lineItemConfig?.anchorFieldId !== undefined && q.lineItemConfig?.anchorFieldId !== null
              ? q.lineItemConfig?.anchorFieldId.toString()
              : '';
          const hideUntilAnchor = liUi?.tableHideUntilAnchor !== false;
          const anchorField = anchorFieldId ? tableFieldsAll.find(f => f.id === anchorFieldId) : undefined;

          const resolveRowLabel = (row: any): string => {
            if (!anchorFieldId || !anchorField) return '';
            const rawVal = row.values?.[anchorFieldId];
            if (anchorField.type === 'CHOICE') {
              ensureLineOptions(q.id, anchorField);
              const optionSetField: OptionSet =
                optionState[optionKey(anchorField.id, q.id)] || {
                  en: anchorField.options || [],
                  fr: (anchorField as any).optionsFr || [],
                  nl: (anchorField as any).optionsNl || [],
                  raw: (anchorField as any).optionsRaw
                };
              const dependencyIds = (
                Array.isArray(anchorField.optionFilter?.dependsOn)
                  ? anchorField.optionFilter?.dependsOn
                  : [anchorField.optionFilter?.dependsOn || '']
              ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
              const allowedField = computeAllowedOptions(
                anchorField.optionFilter,
                optionSetField,
                dependencyIds.map((dep: string) => toDependencyValue(row.values?.[dep] ?? values[dep]))
              );
              const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
              const allowedWithCurrent =
                choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                  ? [...allowedField, choiceVal]
                  : allowedField;
              const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(anchorField) });
              return (optsField.find(opt => opt.value === choiceVal)?.label || choiceVal || '').toString();
            }
            if (Array.isArray(rawVal)) {
              return rawVal
                .map(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''))
                .filter(Boolean)
                .join(', ');
            }
            return typeof rawVal === 'string' || typeof rawVal === 'number' || typeof rawVal === 'boolean'
              ? String(rawVal)
              : '';
          };

          const getRowNonMatchWarning = (row: any): string => {
            const rowNonMatchKeys = parseRowNonMatchOptions((row.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
            return rowNonMatchKeys.length ? formatOptionFilterNonMatchWarning({ language, keys: rowNonMatchKeys }) : '';
          };

          const collectRowErrors = (row: any): string[] => {
            const seen = new Set<string>();
            messageFields.forEach(field => {
              if (tableFieldIdSet.has(field.id)) return;
              const fieldPath = `${q.id}__${field.id}__${row.id}`;
              const msg = errors[fieldPath];
              if (msg) seen.add(msg);
            });
            return Array.from(seen);
          };

          const collectRowWarnings = (row: any): string[] => {
            const seen = new Set<string>();
            const rowNonMatchWarning = useDescriptiveNonMatchWarnings ? getRowNonMatchWarning(row) : '';
            let hasNonMatchWarning = false;
            messageFields.forEach(field => {
              const fieldPath = `${q.id}__${field.id}__${row.id}`;
              warningsFor(fieldPath).forEach(msg => {
                if (!useValidationNonMatchWarnings && genericNonMatchWarnings.has(msg)) return;
                seen.add(msg);
              });
              const showNonMatchWarning =
                !!rowNonMatchWarning &&
                useDescriptiveNonMatchWarnings &&
                typeof (field as any)?.optionFilter?.matchMode === 'string' &&
                (field as any).optionFilter.matchMode === 'or';
              if (showNonMatchWarning) {
                hasNonMatchWarning = true;
                seen.add(rowNonMatchWarning);
              }
            });
            let out = Array.from(seen);
            if (hasNonMatchWarning && genericNonMatchWarnings.size && useValidationNonMatchWarnings && useDescriptiveNonMatchWarnings) {
              out = out.filter(msg => !genericNonMatchWarnings.has(msg));
            }
            return out;
          };

          const buildWarningKey = (rowLabel: string, message: string, isGeneric: boolean): string => {
            if (isGeneric) return message;
            return rowLabel ? `${rowLabel}::${message}` : message;
          };

          const resolveWarningKeysForField = (args: {
            fieldPath: string;
            rowLabel: string;
            rowNonMatchWarning: string;
            showNonMatchWarning: boolean;
          }): string[] => {
            const { fieldPath, rowLabel, rowNonMatchWarning, showNonMatchWarning } = args;
            const keys = new Set<string>();
            const shouldDropGeneric =
              showNonMatchWarning && useValidationNonMatchWarnings && useDescriptiveNonMatchWarnings && genericNonMatchWarnings.size > 0;
            warningsFor(fieldPath).forEach(msg => {
              if (!useValidationNonMatchWarnings && genericNonMatchWarnings.has(msg)) return;
              if (shouldDropGeneric && genericNonMatchWarnings.has(msg)) return;
              const isGeneric = genericNonMatchWarnings.has(msg);
              keys.add(buildWarningKey(rowLabel, msg, isGeneric));
            });
            if (showNonMatchWarning && rowNonMatchWarning) {
              keys.add(buildWarningKey(rowLabel, rowNonMatchWarning, false));
            }
            return Array.from(keys);
          };

          const renderTableField = (field: any, row: any, rowIdx: number) => {
            const groupCtx: VisibilityContext = {
              getValue: fid => resolveTopValue(fid),
              getLineValue: (_rowId, fid) => row.values[fid],
              getLineItems: groupId => lineItems?.[groupId] || [],
              getLineItemKeys: () => Object.keys(lineItems || {})
            };
            const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
            if (hideField) return <span className="muted">—</span>;

            const anchorValue = anchorFieldId ? row.values[anchorFieldId] : undefined;
            if (hideUntilAnchor && anchorFieldId && field.id !== anchorFieldId && isEmptyValue(anchorValue as any)) {
              return <span className="muted">—</span>;
            }

            ensureLineOptions(q.id, field);
            const optionSetField: OptionSet =
              optionState[optionKey(field.id, q.id)] || {
                en: field.options || [],
                fr: (field as any).optionsFr || [],
                nl: (field as any).optionsNl || [],
                raw: (field as any).optionsRaw
              };
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

            const fieldPath = `${q.id}__${field.id}__${row.id}`;
            const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
            const isEditableField =
              !submitting &&
              (field as any)?.readOnly !== true &&
              (field as any)?.ui?.renderAsLabel !== true &&
              (field as any)?.renderAsLabel !== true &&
              !!(field as any)?.valueMap === false;
            const placeholder =
              helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
            const renderAsLabel =
              (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;
            const rowNonMatchWarning = useDescriptiveNonMatchWarnings ? getRowNonMatchWarning(row) : '';
            const showNonMatchWarning =
              useDescriptiveNonMatchWarnings &&
              !!rowNonMatchWarning &&
              typeof (field as any)?.optionFilter?.matchMode === 'string' &&
              (field as any).optionFilter.matchMode === 'or';
            const fieldWarning = warningsFor(fieldPath);
            const hasFieldWarning = fieldWarning.length > 0 || showNonMatchWarning;
            const fieldErrorText = errors[fieldPath];
            const hasFieldError = !!fieldErrorText;
            const rowLabel = resolveRowLabel(row);
            const isEditable = !renderAsLabel && !(field as any)?.valueMap;
            const warningKeys = resolveWarningKeysForField({
              fieldPath,
              rowLabel,
              rowNonMatchWarning,
              showNonMatchWarning
            });
            const warningFootnote = !isEditable ? renderWarningFootnote(warningKeys) : null;
            const showWarningHighlight = hasFieldWarning && isEditable;
            const errorNode = fieldErrorText ? <div className="ck-line-item-table__cell-error error">{fieldErrorText}</div> : null;

            if (field.type === 'CHOICE') {
              const rawVal = row.values[field.id];
              const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
              const allowedWithCurrent =
                choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                  ? [...allowedField, choiceVal]
                  : allowedField;
              const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });
              if (renderAsLabel) {
                const selected = optsField.find(opt => opt.value === choiceVal);
                return (
                  <div
                    className="ck-line-item-table__value"
                    data-field-path={fieldPath}
                    data-has-warning={showWarningHighlight ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    <span className="ck-line-item-table__value-text">
                      {selected?.label || choiceVal || '—'}
                      {warningFootnote}
                    </span>
                    {errorNode}
                  </div>
                );
              }
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  {renderChoiceControl({
                    fieldPath,
                    value: choiceVal || '',
                    options: optsField,
                    required: !!field.required,
                    searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
                    override: (field as any)?.ui?.control,
                    disabled: submitting || (field as any)?.readOnly === true,
                    onChange: next => handleLineFieldChange(q, row.id, field, next)
                  })}
                  {warningFootnote}
                  {errorNode}
                </div>
              );
            }

            if (field.type === 'CHECKBOX') {
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
              if (renderAsLabel) {
                const labels = isConsentCheckbox
                  ? [
                      row.values[field.id]
                        ? tSystem('common.yes', language, 'Yes')
                        : tSystem('common.no', language, 'No')
                    ]
                  : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
                return (
                  <div
                    className="ck-line-item-table__value"
                    data-field-path={fieldPath}
                    data-has-warning={showWarningHighlight ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    <span className="ck-line-item-table__value-text">
                      {labels.length ? labels.join(', ') : '—'}
                      {warningFootnote}
                    </span>
                    {errorNode}
                  </div>
                );
              }
              if (isConsentCheckbox) {
                return (
                  <div
                    className="ck-line-item-table__control ck-line-item-table__control--consent"
                    data-field-path={fieldPath}
                    data-has-warning={showWarningHighlight ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    <label className="inline">
                      <input
                        type="checkbox"
                        className="ck-line-item-table__consent-checkbox"
                        checked={!!row.values[field.id]}
                        aria-label={resolveFieldLabel(field, language, field.id)}
                        disabled={submitting || (field as any)?.readOnly === true}
                        onChange={e => {
                          if (submitting || (field as any)?.readOnly === true) return;
                          handleLineFieldChange(q, row.id, field, e.target.checked);
                        }}
                      />
                      <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
                    </label>
                    {warningFootnote}
                    {errorNode}
                  </div>
                );
              }
              const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
              const renderAsMultiSelect = controlOverride === 'select';
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
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
                        handleLineFieldChange(q, row.id, field, next);
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
                              handleLineFieldChange(q, row.id, field, next);
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {warningFootnote}
                  {errorNode}
                </div>
              );
            }

            if (field.type === 'FILE_UPLOAD') {
              const items = toUploadItems(row.values[field.id]);
              const count = items.length;
              const uploadConfig = (field as any).uploadConfig || {};
              const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
              const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
                size?: number;
                style?: React.CSSProperties;
                className?: string;
              }>;
              const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
              const maxFiles = uploadConfig.maxFiles && uploadConfig.maxFiles > 0 ? uploadConfig.maxFiles : undefined;
              const denom = maxFiles ?? (minRequired > 0 ? minRequired : undefined);
              const displayCount = denom ? Math.min(items.length, denom) : items.length;
              const maxed = maxFiles ? items.length >= maxFiles : false;
              const isComplete = minRequired > 0 ? items.length >= minRequired : items.length > 0;
              const isEmpty = items.length === 0;
              const pillClass = isComplete ? 'ck-progress-good' : isEmpty ? 'ck-progress-neutral' : 'ck-progress-info';
              const pillText = denom ? `${displayCount}/${denom}` : `${items.length}`;
              const readOnly = (field as any)?.readOnly === true;
              const showEyeIcon = readOnly || maxed || items.length > 0;
              const LeftIcon = showEyeIcon ? EyeIcon : SlotIcon;
              const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
              );
              const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
                .map((v: any) => (v !== undefined && v !== null ? v.toString().trim() : ''))
                .filter(Boolean);
              const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;

              if (renderAsLabel) {
                return (
                  <div
                    className="ck-line-item-table__value"
                    data-field-path={fieldPath}
                    data-has-warning={showWarningHighlight ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    <span className="ck-line-item-table__value-text">{count ? `${count}` : '—'}</span>
                    {errorNode}
                  </div>
                );
              }
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <div className="ck-upload-row ck-upload-row--table">
                    <button
                      type="button"
                      className={`ck-progress-pill ck-upload-pill-btn ck-upload-pill-btn--table ${pillClass}`}
                      aria-disabled={submitting ? 'true' : undefined}
                      aria-label={`${tSystem('files.open', language, tSystem('common.open', language, 'Open'))} ${tSystem(
                        'files.title',
                        language,
                        'Photos'
                      )} ${pillText}`}
                      onClick={() => {
                        if (submitting) return;
                        onDiagnostic?.('upload.view.click', { scope: 'line', fieldPath, currentCount: items.length });
                        openFileOverlay({
                          scope: 'line',
                          title: resolveFieldLabel(field, language, field.id),
                          group: q,
                          rowId: row.id,
                          field,
                          fieldPath
                        });
                      }}
                    >
                      <LeftIcon style={{ width: '1.1em', height: '1.1em' }} />
                      <span>{pillText}</span>
                      <span className="ck-progress-label">
                        {tSystem('files.open', language, tSystem('common.open', language, 'Open'))}
                      </span>
                      <span className="ck-progress-caret">▸</span>
                    </button>
                  </div>
                  <div style={srOnly} aria-live="polite">
                    {uploadAnnouncements[fieldPath] || ''}
                  </div>
                  <input
                    ref={el => {
                      if (!el) return;
                      fileInputsRef.current[fieldPath] = el;
                    }}
                    type="file"
                    multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                    accept={acceptAttr}
                    style={{ display: 'none' }}
                    onChange={e => handleLineFileInputChange({ group: q, rowId: row.id, field, fieldPath, list: e.target.files })}
                  />
                  {errorNode}
                </div>
              );
            }

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
            if (renderAsLabel) {
              const display =
                field.type === 'NUMBER'
                  ? numberText
                  : field.type === 'DATE'
                    ? fieldValue
                    : fieldValue;
              return (
                <div
                  className="ck-line-item-table__value"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <span className="ck-line-item-table__value-text">
                    {display || '—'}
                    {warningFootnote}
                  </span>
                  {errorNode}
                </div>
              );
            }
            if (field.type === 'NUMBER') {
              const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <NumberStepper
                    value={numberText}
                    disabled={submitting}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    ariaLabel={resolveFieldLabel(field, language, field.id)}
                    placeholder={placeholder}
                    onInvalidInput={({ reason, value }) => {
                      setErrors(prev => {
                        const next = { ...prev };
                        const existing = next[fieldPath];
                        if (existing && existing !== numericOnlyMessage) return prev;
                        if (existing === numericOnlyMessage) return prev;
                        next[fieldPath] = numericOnlyMessage;
                        return next;
                      });
                      onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                    }}
                    onChange={next => handleLineFieldChange(q, row.id, field, next)}
                  />
                  {warningFootnote}
                  {errorNode}
                </div>
              );
            }
            if (field.type === 'PARAGRAPH') {
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <textarea
                    className="ck-paragraph-input"
                    value={fieldValue}
                    onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    rows={(field as any)?.ui?.paragraphRows || 3}
                    placeholder={placeholder}
                  />
                  {warningFootnote}
                  {errorNode}
                </div>
              );
            }
            if (field.type === 'DATE') {
              return (
                <div
                  className="ck-line-item-table__control"
                  data-field-path={fieldPath}
                  data-has-warning={showWarningHighlight ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <DateInput
                    value={fieldValue}
                    language={language}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    ariaLabel={resolveFieldLabel(field, language, field.id)}
                    onChange={next => handleLineFieldChange(q, row.id, field, next)}
                  />
                  {warningFootnote}
                  {errorNode}
                </div>
              );
            }
            return (
              <div
                className="ck-line-item-table__control"
                data-field-path={fieldPath}
                data-has-warning={showWarningHighlight ? 'true' : undefined}
                data-has-error={hasFieldError ? 'true' : undefined}
              >
                <input
                  type="text"
                  value={fieldValue}
                  onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                  readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                  placeholder={placeholder}
                />
                {warningFootnote}
                {errorNode}
              </div>
            );
          };

          const removeColumn = {
            id: '__remove',
            label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
            className: 'ck-line-item-table__actions',
            renderCell: (row: any) => {
              const rowSource = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
              const hideRemoveButton = parseRowHideRemove((row.values as any)?.[ROW_HIDE_REMOVE_KEY]);
              if (hideRemoveButton) return null;
              if ((q.lineItemConfig as any)?.ui?.allowRemoveAutoRows === false && rowSource === 'auto') return null;
              return (
                <button
                  type="button"
                  className="ck-line-item-table__remove-button"
                  onClick={() => removeLineRow(q.id, row.id)}
                  aria-label={tSystem('lineItems.remove', language, 'Remove')}
                  title={tSystem('lineItems.remove', language, 'Remove')}
                >
                  <TrashIcon size={40} />
                </button>
              );
            }
          };

          const tableColumnWidths = (q.lineItemConfig?.ui as any)?.tableColumnWidths;
          const resolveTableColumnStyle = (columnId: string): React.CSSProperties | undefined => {
            if (!tableColumnWidths || typeof tableColumnWidths !== 'object' || Array.isArray(tableColumnWidths)) return undefined;
            const widthCandidates =
              columnId === '__remove'
                ? [columnId, 'remove', '__actions', 'actions']
                : [columnId, columnId.toLowerCase()];
            const rawWidth = widthCandidates.reduce<any>(
              (acc, key) => (acc !== undefined ? acc : (tableColumnWidths as any)[key]),
              undefined
            );
            if (rawWidth === undefined || rawWidth === null) return undefined;
            if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
            const widthValue = rawWidth.toString().trim();
            return widthValue ? { width: widthValue } : undefined;
          };

          const tableColumns: LineItemTableColumn[] = [
            ...tableFields.map(field => ({
              id: field.id,
              label: (() => {
                const labelText = resolveFieldLabel(field, language, field.id);
                const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                const isEditableField =
                  !submitting &&
                  (field as any)?.readOnly !== true &&
                  (field as any)?.ui?.renderAsLabel !== true &&
                  (field as any)?.renderAsLabel !== true &&
                  !!(field as any)?.valueMap === false;
                if (!helperCfg.text || helperCfg.placement !== 'belowLabel' || !isEditableField) return labelText;
                return (
                  <div className="ck-line-item-table__header-wrap">
                    <div>{labelText}</div>
                    <div className="ck-line-item-table__header-helper">{helperCfg.text}</div>
                  </div>
                );
              })(),
              style: resolveTableColumnStyle(field.id),
              renderCell: (row: any, rowIdx: number) => renderTableField(field, row, rowIdx)
            })),
            { ...removeColumn, style: resolveTableColumnStyle(removeColumn.id) }
          ];
          const tableTotalsById = new Map(tableTotals.map(total => [total.key.toString(), total]));
          const tableFooter =
            tableTotals.length > 0 ? (
              <tr className="ck-line-item-table__totals-row">
                {tableColumns.map(col => {
                  const total = col.id !== '__remove' ? tableTotalsById.get(col.id.toString()) : undefined;
                  return (
                    <td key={`total-${col.id}`} className={col.className} style={col.style}>
                      {total ? (
                        <span className="ck-line-item-table__total">
                          {total.label}: {total.value.toFixed(total.decimalPlaces || 0)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ) : null;

          const warningsLegend: Array<{ rowId: string; label: string; message: string; key: string }> = [];
          const seenRowMessage = new Set<string>();
          const seenGeneric = new Set<string>();
          parentRows.forEach(row => {
            const rowLabel = resolveRowLabel(row);
            const messages = collectRowWarnings(row);
            messages.forEach(message => {
              const isGeneric = genericNonMatchWarnings.has(message);
              if (isGeneric) {
                if (seenGeneric.has(message)) return;
                seenGeneric.add(message);
                warningsLegend.push({ rowId: row.id, label: '', message, key: buildWarningKey('', message, true) });
                return;
              }
              const dedupeKey = `${rowLabel || ''}::${message}`;
              if (seenRowMessage.has(dedupeKey)) return;
              seenRowMessage.add(dedupeKey);
              warningsLegend.push({ rowId: row.id, label: rowLabel, message, key: buildWarningKey(rowLabel, message, false) });
            });
          });
          const warningsLegendNumbered = warningsLegend.map((entry, idx) => ({ ...entry, index: idx + 1 }));
          const warningIndexByKey = new Map<string, number>();
          warningsLegendNumbered.forEach(entry => warningIndexByKey.set(entry.key, entry.index));
          const warningsLegendVisible = warningsLegendNumbered.length > 0;
          const renderWarningFootnote = (warningKeys: string[]): React.ReactNode => {
            if (!warningKeys.length) return null;
            const indices = warningKeys
              .map(key => warningIndexByKey.get(key))
              .filter((val): val is number => typeof val === 'number');
            if (!indices.length) return null;
            const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
            return (
              <span className="ck-line-item-table__warning-footnote" aria-hidden="true">
                {unique.join(',')}
              </span>
            );
          };

          return (
            <div
              key={q.id}
              className="ck-line-item-group ck-line-item-group--table ck-full-width"
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h3 style={hideGroupLabel ? { ...srOnly, margin: 0 } : { margin: 0 }}>{resolveLabel(q, language)}</h3>
              </div>
              {groupHelperNode}
              {errors[q.id] ? <div className="error">{errors[q.id]}</div> : null}
              {renderWarnings(q.id)}
              {shouldRenderTopToolbar ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                    {showSelectorTop ? selectorControl : null}
                    {showAddTop ? renderAddButton() : null}
                  </div>
                </div>
              ) : null}
              <div className="ck-line-item-table__scroll">
                <LineItemTable
                  columns={tableColumns}
                  rows={parentRows}
                  emptyText={tSystem('lineItems.noOptionsAvailable', language, 'No options available.')}
                  rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
                  renderRowMessage={row => {
                    const rowErrors = collectRowErrors(row);
                    if (!rowErrors.length) return null;
                    return (
                      <div className="ck-line-item-table__row-errors">
                        {rowErrors.map((msg, idx) => (
                          <div key={`${row.id}-error-${idx}`} className="error">
                            {msg}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                  footer={tableFooter}
                />
              </div>
              {warningsLegendVisible ? (
                <div className="ck-line-item-table__legend">
                  <div className="ck-line-item-table__legend-title">
                    {tSystem('validation.warningTitle', language, 'Warning')}
                  </div>
                  <div className="ck-line-item-table__legend-items">
                    {warningsLegendNumbered.map(entry => (
                      <div key={`${entry.rowId}-legend-${entry.index}`} className="ck-line-item-table__legend-item">
                        <span className="ck-line-item-table__legend-footnote" aria-hidden="true">
                          {entry.index}
                        </span>
                        <span className="ck-line-item-table__legend-text">
                          {entry.label ? (
                            <span className="ck-line-item-table__legend-label">{entry.label}: </span>
                          ) : null}
                          {entry.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {shouldRenderBottomToolbar ? (
                <div className="line-item-toolbar" style={{ marginTop: 12 }}>
                  <div
                    className="line-item-toolbar-actions"
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flex: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      {showSelectorBottom ? selectorControl : null}
                      {showAddBottom ? renderAddButton() : null}
                    </div>
                    {toolbarTotals.length > 0 ? (
                      <div className="line-item-totals">
                        {toolbarTotals.map(t => (
                          <span key={t.key} className="ck-line-item-table__total">
                            {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        }

        const outputActionsLayout = rowFlow?.output?.actionsLayout === 'below' ? 'below' : 'inline';
        const defaultActionScope = rowFlow?.output?.actionsScope === 'group' ? 'group' : 'row';
        const resolveOutputActionScope = (action: RowFlowActionRef): 'row' | 'group' =>
          action.scope === 'group' || action.scope === 'row' ? action.scope : defaultActionScope;
        const hasGroupActions = (rowFlow?.output?.actions || []).some(action => resolveOutputActionScope(action) === 'group');
        const syntheticGroupRow =
          rowFlowEnabled && hasGroupActions && parentRows.length === 0
            ? ({ id: '__rowFlowGroup__', values: {} as Record<string, FieldValue> } as LineItemRowState)
            : null;
        const syntheticGroupState =
          syntheticGroupRow && rowFlow
            ? resolveRowFlowState({
                config: rowFlow as RowFlowConfig,
                groupId: q.id,
                rowId: syntheticGroupRow.id,
                rowValues: syntheticGroupRow.values,
                lineItems,
                topValues: values,
                subGroupIds: rowFlowSubGroupIds,
                activeFieldPath: activeFieldMeta.path,
                activeFieldType: activeFieldMeta.type
              })
            : null;
        const groupActionRow = hasGroupActions ? parentRows[0] || syntheticGroupRow : null;
        const groupActionState =
          groupActionRow && rowFlowEnabled
            ? parentRows.length
              ? rowFlowStateByRowId.get(groupActionRow.id) || null
              : syntheticGroupState
            : null;
        if (rowFlowEnabled && hasGroupActions) {
          const scopeLogKey = `${q.id}::rowFlow::actionsScope`;
          if (!rowFlowLoggedRef.current.has(scopeLogKey)) {
            rowFlowLoggedRef.current.add(scopeLogKey);
            onDiagnostic?.('lineItems.rowFlow.output.actionsScope', { groupId: q.id, scope: 'group' });
          }
        }
        if (rowFlowEnabled && (rowFlow?.output?.segments || []).length) {
          const segmentLogKey = `${q.id}::rowFlow::segmentActions`;
          if (!rowFlowLoggedRef.current.has(segmentLogKey)) {
            const segmentActions = (rowFlow?.output?.segments || []).map(segment =>
              resolveRowFlowSegmentActionIds(segment)
            );
            const segmentsWithActions = segmentActions.filter(ids => ids.length > 0);
            if (segmentsWithActions.length) {
              rowFlowLoggedRef.current.add(segmentLogKey);
              const multiActionSegments = segmentActions.filter(ids => ids.length > 1).length;
              onDiagnostic?.('lineItems.rowFlow.output.segmentActions', {
                groupId: q.id,
                segmentsWithActions: segmentsWithActions.length,
                multiActionSegments
              });
            }
          }
        }
        const renderGroupOutputActions = () => {
          if (!groupActionRow || !groupActionState) return null;
          const groupOutputActions = groupActionState.outputActions.filter(action => resolveOutputActionScope(action) === 'group');
          const outputActionsStart = groupOutputActions.filter(a => (a.position || 'start') !== 'end');
          const outputActionsEnd = groupOutputActions.filter(a => (a.position || 'start') === 'end');
          if (!outputActionsStart.length && !outputActionsEnd.length) return null;
          if (outputActionsLayout === 'inline') {
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {outputActionsStart.map(action =>
                    renderRowFlowActionControlWithContext({ actionId: action.id, row: groupActionRow, rowFlowState: groupActionState })
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {outputActionsEnd.map(action =>
                    renderRowFlowActionControlWithContext({ actionId: action.id, row: groupActionRow, rowFlowState: groupActionState })
                  )}
                </div>
              </div>
            );
          }
          return (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {outputActionsStart.map(action =>
                  renderRowFlowActionControlWithContext({ actionId: action.id, row: groupActionRow, rowFlowState: groupActionState })
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {outputActionsEnd.map(action =>
                  renderRowFlowActionControlWithContext({ actionId: action.id, row: groupActionRow, rowFlowState: groupActionState })
                )}
              </div>
            </div>
          );
        };

        return (
            <div
              key={q.id}
              className="card ck-full-width"
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h3 style={hideGroupLabel ? { ...srOnly, margin: 0 } : { margin: 0 }}>{resolveLabel(q, language)}</h3>
            </div>
              {groupHelperNode}
              {errors[q.id] ? <div className="error">{errors[q.id]}</div> : null}
              {renderWarnings(q.id)}
            {shouldRenderTopToolbar ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                  {showSelectorTop ? selectorControl : null}
                  {showAddTop ? renderAddButton() : null}
                </div>
              </div>
            ) : null}
            {parentRows.map((row, rowIdx) => {
              const isLeftoverGroup = q.id === 'MP_TYPE_LI';
              const isLastLeftoverRow = isLeftoverGroup && rowIdx === parentRows.length - 1;
              const groupCtx: VisibilityContext = {
                getValue: fid => resolveTopValue(fid),
                getLineValue: (_rowId, fid) => row.values[fid],
                getLineItems: groupId => lineItems?.[groupId] || [],
                getLineItemKeys: () => Object.keys(lineItems || {})
              };
              const rowFlowState = rowFlowEnabled ? rowFlowStateByRowId.get(row.id) || null : null;

              if (rowFlowEnabled && rowFlowState) {
                const flowLogKey = `${q.id}::rowFlow`;
                if (!rowFlowLoggedRef.current.has(flowLogKey)) {
                  rowFlowLoggedRef.current.add(flowLogKey);
                  onDiagnostic?.('lineItems.rowFlow.enabled', {
                    groupId: q.id,
                    promptCount: rowFlowState.prompts.length,
                    segmentCount: rowFlowState.segments.length
                  });
                }
                const activePromptId = rowFlowState.activePromptId || '';
                if (activePromptId && rowFlowPromptRef.current[row.id] !== activePromptId) {
                  rowFlowPromptRef.current[row.id] = activePromptId;
                  onDiagnostic?.('lineItems.rowFlow.prompt.active', {
                    groupId: q.id,
                    rowId: row.id,
                    promptId: activePromptId
                  });
                }

                const renderRowFlowActionControl = (actionId: string) =>
                  renderRowFlowActionControlWithContext({ actionId, row, rowFlowState });


                const resolvePromptTargets = (prompt: RowFlowResolvedPrompt) => {
                  const target = prompt.target;
                  if (!target || !target.primaryRow || !target.fieldId) return null;
                  const rowEntry = target.primaryRow;
                  const groupInfo = resolveRowFlowGroupConfig(rowEntry.groupKey);
                  if (!groupInfo?.config) return null;
                  const field = resolveRowFlowFieldConfig(rowEntry.groupKey, target.fieldId);
                  if (!field) return null;
                  const groupDef = buildRowFlowGroupDefinition(rowEntry.groupKey, groupInfo.config);
                  return { field, groupDef, rowEntry, parentValues: target.parentValues };
                };

                const renderRowFlowField = (args: {
                  field: any;
                  groupDef: WebQuestionDefinition;
                  rowEntry: RowFlowResolvedRow | null | undefined;
                  parentValues?: Record<string, FieldValue>;
                  showLabel?: boolean;
                  labelOverride?: string;
                }): React.ReactNode => {
                  if (!args.rowEntry) return null;
                  const rowValues = (args.rowEntry.row?.values || {}) as Record<string, FieldValue>;
                  const groupKey = args.rowEntry.groupKey;
                  const field = args.field;
                  const fieldPath = `${groupKey}__${field.id}__${args.rowEntry.row.id}`;
                  const showLabel = args.showLabel !== false;
                  const labelStyle = showLabel ? undefined : srOnly;
                  const labelText = args.labelOverride || resolveFieldLabel(field, language, field.id);
                  const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                  const helperText = helperCfg.text;
                  const supportsPlaceholder = field?.type === 'TEXT' || field?.type === 'PARAGRAPH' || field?.type === 'NUMBER';
                  const effectivePlacement =
                    helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
                  const isEditableField =
                    !submitting &&
                    field?.readOnly !== true &&
                    field?.ui?.renderAsLabel !== true &&
                    (field as any)?.renderAsLabel !== true &&
                    !field?.valueMap;
                  const helperId =
                    helperText && effectivePlacement === 'belowLabel'
                      ? (isEditableField ? `ck-field-helper-${fieldPath.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined)
                      : undefined;
                  const helperNode =
                    helperText && effectivePlacement === 'belowLabel' && isEditableField ? (
                      <div id={helperId} className="ck-field-helper">
                        {helperText}
                      </div>
                    ) : null;
                  const placeholder =
                    helperText && effectivePlacement === 'placeholder' && isEditableField ? helperText : undefined;
                  const ctxForVisibility = buildRowFlowFieldCtx({ rowValues, parentValues: args.parentValues });
                  if (shouldHideField(field.visibility, ctxForVisibility, { rowId: args.rowEntry.row.id, linePrefix: groupKey })) return null;

                  const renderAsLabel = field?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || field?.readOnly === true;
                  const renderReadOnly = (display: React.ReactNode) => (
                    <div className="field inline-field ck-readonly-field" data-field-path={fieldPath}>
                      <label style={labelStyle}>
                        {labelText}
                        {field.required && <RequiredStar />}
                      </label>
                      <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
                      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                      {renderWarnings(fieldPath)}
                    </div>
                  );

                  ensureLineOptions(groupKey, field);
                  const optionSetField: OptionSet =
                    optionState[optionKey(field.id, groupKey)] || {
                      en: field.options || [],
                      fr: (field as any).optionsFr || [],
                      nl: (field as any).optionsNl || [],
                      raw: (field as any).optionsRaw
                    };
                  const dependencyIds = (
                    Array.isArray(field.optionFilter?.dependsOn)
                      ? field.optionFilter?.dependsOn
                      : [field.optionFilter?.dependsOn || '']
                  ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                  const depVals = dependencyIds.map((dep: string) =>
                    toDependencyValue(rowValues[dep] ?? (args.parentValues as any)?.[dep] ?? values[dep])
                  );
                  const allowedField = computeAllowedOptions(field.optionFilter, optionSetField, depVals);
                  const currentVal = rowValues[field.id];
                  const allowedWithCurrent =
                    currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                      ? [...allowedField, currentVal]
                      : allowedField;
                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(field) });

                  switch (field.type) {
                    case 'CHOICE': {
                      const rawVal = rowValues[field.id];
                      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                      const selected = optsField.find(opt => opt.value === choiceVal);
                      const display = selected?.label || choiceVal || null;
                      if (renderAsLabel) return renderReadOnly(display);
                      return (
                        <div className="field inline-field" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <div className="ck-control-row">
                            {renderChoiceControl({
                              fieldPath,
                              value: choiceVal || '',
                              options: optsField,
                              required: !!field.required,
                              searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? groupChoiceSearchDefault,
                              override: (field as any)?.ui?.control,
                              disabled: submitting,
                              onChange: next => handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, next)
                            })}
                          </div>
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    case 'CHECKBOX': {
                      const hasAnyOption =
                        !!((optionSetField.en && optionSetField.en.length) ||
                          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                          ((optionSetField as any).nl && (optionSetField as any).nl.length));
                      const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                      const selected = Array.isArray(rowValues[field.id]) ? (rowValues[field.id] as string[]) : [];
                      if (renderAsLabel) {
                        const display = optsField
                          .filter(opt => selected.includes(opt.value))
                          .map(opt => opt.label)
                          .filter(Boolean)
                          .join(', ');
                        return renderReadOnly(display || selected.join(', '));
                      }
                      return (
                        <div className="field inline-field" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          {isConsentCheckbox ? (
                            <label className="inline">
                              <input
                                type="checkbox"
                                checked={selected.length > 0}
                                disabled={submitting}
                                onChange={e => {
                                  const next = e.target.checked ? ['true'] : [];
                                  handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, next);
                                }}
                              />
                              <span>{labelText}</span>
                            </label>
                          ) : (
                            <div className="inline-options">
                              {optsField.map(opt => (
                                <label key={opt.value} className="inline">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    disabled={submitting}
                                    onChange={e => {
                                      const next = e.target.checked
                                        ? [...selected, opt.value]
                                        : selected.filter(v => v !== opt.value);
                                      handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, next);
                                    }}
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    case 'NUMBER': {
                      const raw = rowValues[field.id] as any;
                      const numberText = raw === undefined || raw === null ? '' : raw.toString();
                      if (renderAsLabel) return renderReadOnly(numberText || null);
                      const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
                      return (
                        <div className="field inline-field" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <NumberStepper
                            value={numberText}
                            disabled={submitting}
                            readOnly={field?.readOnly === true}
                            ariaLabel={labelText}
                            ariaDescribedBy={helperId}
                            placeholder={placeholder}
                            onInvalidInput={({ reason, value }) => {
                              setErrors(prev => {
                                const next = { ...prev };
                                const existing = next[fieldPath];
                                if (existing && existing !== numericOnlyMessage) return prev;
                                if (existing === numericOnlyMessage) return prev;
                                next[fieldPath] = numericOnlyMessage;
                                return next;
                              });
                              onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                            }}
                            onChange={next => handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, next)}
                          />
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    case 'DATE': {
                      const raw = rowValues[field.id] as any;
                      const dateValue = toDateInputValue(raw) || (raw || '').toString();
                      if (renderAsLabel) return renderReadOnly(dateValue || null);
                      return (
                        <div className="field inline-field" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <DateInput
                            value={dateValue}
                            language={language}
                            readOnly={field?.readOnly === true}
                            ariaLabel={labelText}
                            ariaDescribedBy={helperId}
                            onChange={next => handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, next)}
                          />
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    case 'PARAGRAPH': {
                      const value = (rowValues[field.id] as any) || '';
                      if (renderAsLabel) return renderReadOnly(value || null);
                      return (
                        <div className="field inline-field ck-full-width" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <textarea
                            className="ck-paragraph-input"
                            value={value}
                            onChange={e => handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, e.target.value)}
                            readOnly={field?.readOnly === true}
                            rows={(field as any)?.ui?.paragraphRows || 4}
                            placeholder={placeholder}
                            aria-describedby={helperId}
                          />
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    case 'FILE_UPLOAD': {
                      const uploadConfig = (field as any).uploadConfig || {};
                      const items = toUploadItems(rowValues[field.id] as any);
                      const count = items.length;
                      const label = count
                        ? tSystem('files.view', language, 'View photos')
                        : tSystem('files.add', language, 'Add photo');
                      return (
                        <div className="field inline-field ck-full-width" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <button
                            type="button"
                            style={buttonStyles.secondary}
                            onClick={() => {
                              if (submitting) return;
                              openFileOverlay({
                                open: true,
                                scope: 'line',
                                group: args.groupDef,
                                rowId: args.rowEntry!.row.id,
                                field,
                                fieldPath
                              });
                            }}
                          >
                            {label}
                          </button>
                          {helperNode}
                          <input
                            ref={el => {
                              if (!el) return;
                              fileInputsRef.current[fieldPath] = el;
                            }}
                            type="file"
                            multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                            accept={uploadConfig.accept || undefined}
                            style={{ display: 'none' }}
                            onChange={e => handleLineFileInputChange({ group: args.groupDef, rowId: args.rowEntry!.row.id, field, fieldPath, list: e.target.files })}
                          />
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                    default: {
                      const value = rowValues[field.id] as any;
                      if (renderAsLabel) return renderReadOnly(value || null);
                      return (
                        <div className="field inline-field" data-field-path={fieldPath}>
                          <label style={labelStyle}>
                            {labelText}
                            {field.required && <RequiredStar />}
                          </label>
                          <input
                            type="text"
                            value={value || ''}
                            onChange={e => handleLineFieldChange(args.groupDef, args.rowEntry!.row.id, field, e.target.value)}
                            readOnly={field?.readOnly === true}
                            placeholder={placeholder}
                            aria-describedby={helperId}
                          />
                          {helperNode}
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      );
                    }
                  }
                };

                const renderRowFlowPrompt = (prompt: RowFlowResolvedPrompt) => {
                  if (!prompt.visible) return null;
                  const splitPromptLabel = (rawLabel: string) => {
                    const value = rawLabel || '';
                    const parts = value.split(/\r?\n/);
                    if (parts.length < 2) return { labelText: value, helperText: '' };
                    const labelText = parts[0].trim() || value.trim();
                    const helperText = parts.slice(1).join('\n').trim();
                    return { labelText, helperText };
                  };
                  const inputKind = (prompt.config.input?.kind || 'field').toString().trim().toLowerCase();
                  if (inputKind === 'selectoroverlay') {
                    const targetRef = prompt.config.input?.targetRef || '';
                    if (!targetRef) return null;
                    const target = resolveRowFlowFieldTarget({
                      fieldRef: `${targetRef}.`,
                      groupId: q.id,
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
                      (isSubgroupRef ? buildSubgroupKey(q.id, row.id, refGroupId) : refGroupId || target.groupKey);
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
                      ? (effectiveTargetConfig?.fields || []).find((f: any) => f.id === anchorFieldId)
                      : null;
                    if (!anchorField || anchorField.type !== 'CHOICE') return null;
                    ensureLineOptions(targetInfo.groupId, anchorField);
                    const optionSetField: OptionSet =
                      optionState[optionKey(anchorField.id, targetInfo.groupId)] || {
                        en: anchorField.options || [],
                        fr: (anchorField as any).optionsFr || [],
                        nl: (anchorField as any).optionsNl || [],
                        raw: (anchorField as any).optionsRaw
                      };
                    const depIds = (
                      Array.isArray(anchorField.optionFilter?.dependsOn)
                        ? anchorField.optionFilter?.dependsOn
                        : [anchorField.optionFilter?.dependsOn || '']
                    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                    const depVals = depIds.map((dep: string) =>
                      toDependencyValue(
                        (row.values as any)[dep] ?? (target.parentValues as any)?.[dep] ?? values[dep]
                      )
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
                    const { labelText, helperText: labelHelperText } = splitPromptLabel(resolvedLabel);
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
                            const addRowOptions = promptGroupOverride
                              ? { configOverride: effectiveTargetConfig }
                              : undefined;
                            deduped.forEach(val =>
                              addLineItemRowManual(targetInfo.groupId, { [anchorFieldId]: val }, addRowOptions)
                            );
                            const shouldOpenOverlay =
                              !!promptGroupOverride && !!(effectiveTargetConfig as any)?.ui?.openInOverlay;
                            if (shouldOpenOverlay) {
                              if (isSubgroupRef && targetGroupKey) {
                                openSubgroupOverlay?.(targetGroupKey, { groupOverride: promptGroupOverride, source: 'system' });
                              } else if (!isSubgroupRef) {
                                const baseGroup = definition.questions.find(
                                  question => question.id === targetInfo.groupId && question.type === 'LINE_ITEM_GROUP'
                                ) as WebQuestionDefinition | undefined;
                                const overrideGroup =
                                  baseGroup && promptGroupOverride
                                    ? buildOverlayGroupOverride(baseGroup, promptGroupOverride)
                                    : undefined;
                                if (overrideGroup) {
                                  openLineItemGroupOverlay?.(overrideGroup, { source: 'system' });
                                }
                              }
                            }
                            onDiagnostic?.('lineItems.rowFlow.selector.add', {
                              groupId: targetInfo.groupId,
                              rowId: row.id,
                              promptId: prompt.id,
                              count: deduped.length
                            });
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
                  const { labelText: promptLabel, helperText: promptHelperText } = splitPromptLabel(promptLabelRaw);
                  const labelLayout = (prompt.config.input?.labelLayout || 'stacked').toString().trim().toLowerCase();
                  const actionsLayout = (prompt.config.actionsLayout || 'below').toString().trim().toLowerCase();
                  const useInlineLabel = labelLayout === 'inline';
                  const hideLabel = labelLayout === 'hidden';
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
                  const startActions = prompt.config.actions.filter(a => (a.position || 'start') !== 'end');
                  const endActions = prompt.config.actions.filter(a => (a.position || 'start') === 'end');
                  const actionsInline = actionsLayout === 'inline';
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

                const outputSegments = rowFlowState.segments.filter(segment => {
                  const target = segment.target;
                  if (!target?.fieldId) return false;
                  const field = resolveRowFlowFieldConfig(target.groupKey, target.fieldId);
                  if (!field) return false;
                  const ctxForVisibility = buildRowFlowFieldCtx({
                    rowValues: target.primaryRow?.row?.values || {},
                    parentValues: target.parentValues
                  });
                  return !shouldHideField(field.visibility, ctxForVisibility, {
                    rowId: target.primaryRow?.row?.id || row.id,
                    linePrefix: target.groupKey
                  });
                });

                const renderOutputSegment = (segment: RowFlowResolvedSegment, idx: number, showSeparator: boolean) => {
                  const target = segment.target;
                  if (!target || !target.fieldId) return null;
                  const field = resolveRowFlowFieldConfig(target.groupKey, target.fieldId);
                  if (!field) return null;
                  const label = segment.config.label
                    ? resolveLocalizedString(segment.config.label, language, '')
                    : '';
                  const segmentActionIds = resolveRowFlowSegmentActionIds(segment.config);
                  const segmentActionNodes = segmentActionIds
                    .map(actionId => renderRowFlowActionControl(actionId))
                    .filter(Boolean) as React.ReactNode[];
                  const segmentActions = segmentActionNodes.length ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {segmentActionNodes}
                    </span>
                  ) : null;
                  const separatorNode = showSeparator ? (
                    <span aria-hidden="true" style={{ marginLeft: 6, flexShrink: 0 }}>
                      {separator}
                    </span>
                  ) : null;
                  if (segment.config.renderAs === 'control' && target.primaryRow) {
                    const groupInfo = resolveRowFlowGroupConfig(target.primaryRow.groupKey);
                    if (!groupInfo?.config) return null;
                    const groupDef = buildRowFlowGroupDefinition(target.primaryRow.groupKey, groupInfo.config);
                    return (
                      <span
                        key={`${segment.config.fieldRef}-${idx}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%', flex: '0 1 auto' }}
                      >
                        {label ? (
                          <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{label}:</span>
                        ) : null}
                        {renderRowFlowField({
                          field,
                          groupDef,
                          rowEntry: target.primaryRow,
                          parentValues: target.parentValues,
                          showLabel: false
                        })}
                        {segmentActions}
                        {separatorNode}
                      </span>
                    );
                  }
                  const display = resolveRowFlowDisplayValue(segment, target.groupKey, field, target.parentValues);
                  const text = display.text || '—';
                  const formatted = label
                    ? label.includes('{{value}}')
                      ? label.replace('{{value}}', text)
                      : `${label}: ${text}`
                    : text;
                  return (
                    <span
                      key={`${segment.config.fieldRef}-${idx}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flex: '0 1 auto' }}
                    >
                      <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{formatted}</span>
                      {segmentActions}
                      {separatorNode}
                    </span>
                  );
                };

                const separator = rowFlow?.output?.separator ?? ' | ';
                const rowOutputActions = rowFlowState.outputActions.filter(action => resolveOutputActionScope(action) === 'row');
                const outputActionsStart = rowOutputActions.filter(a => (a.position || 'start') !== 'end');
                const outputActionsEnd = rowOutputActions.filter(a => (a.position || 'start') === 'end');
                const hasOutputActions = outputActionsStart.length > 0 || outputActionsEnd.length > 0;
                const hasOutputSegments = outputSegments.length > 0;
                const promptsToRender = rowFlowState.prompts.filter(
                  prompt =>
                    prompt.visible &&
                    (prompt.id === activePromptId || (prompt.complete && prompt.config.keepVisibleWhenFilled === true))
                );

                return (
                  <div
                    key={row.id}
                    className={`line-item-row ck-row-flow${isLeftoverGroup ? ' ck-row-flow--leftover' : ''}`}
                    data-row-anchor={`${q.id}__${row.id}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      width: '100%',
                      padding: isLeftoverGroup ? '12px 0' : 0,
                      marginBottom: isLeftoverGroup ? 0 : 14
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, rowGap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
                        {outputActionsLayout === 'inline'
                          ? outputActionsStart.map(action => renderRowFlowActionControl(action.id))
                          : null}
                        {outputSegments.map((segment, idx) => renderOutputSegment(segment, idx, idx < outputSegments.length - 1))}
                      </div>
                      {outputActionsLayout === 'inline' && outputActionsEnd.length ? (
                        <div
                          className={isLeftoverGroup ? 'ck-row-flow-actions ck-row-flow-actions--leftover' : 'ck-row-flow-actions'}
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexShrink: 0,
                            ...(isLeftoverGroup ? { alignSelf: 'stretch', alignItems: 'flex-end' } : {})
                          }}
                        >
                          {outputActionsEnd.map(action => renderRowFlowActionControl(action.id))}
                        </div>
                      ) : null}
                    </div>
                    {outputActionsLayout === 'below' && hasOutputActions ? (
                      <div style={{ marginTop: hasOutputSegments ? 8 : 0, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {outputActionsStart.map(action => renderRowFlowActionControl(action.id))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {outputActionsEnd.map(action => renderRowFlowActionControl(action.id))}
                        </div>
                      </div>
                    ) : null}
                    {promptsToRender.length ? (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {promptsToRender.map(prompt => (
                          <div key={prompt.id}>{renderRowFlowPrompt(prompt)}</div>
                        ))}
                      </div>
                    ) : null}
                    {isLeftoverGroup && !isLastLeftoverRow ? (
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
                  </div>
                );
              }
              const ui = q.lineItemConfig?.ui;
              const guidedCollapsedFieldsInHeader = Boolean((ui as any)?.guidedCollapsedFieldsInHeader);
              const isProgressive =
                ui?.mode === 'progressive' && Array.isArray(ui.collapsedFields) && ui.collapsedFields.length > 0;
              const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsedBase = isProgressive ? (collapsedRows[collapseKey] ?? defaultCollapsed) : false;
              const rowCollapsed = guidedCollapsedFieldsInHeader ? false : rowCollapsedBase;
              const showRowHeader = isProgressive || guidedCollapsedFieldsInHeader;

              const collapsedFieldConfigs = isProgressive ? ui?.collapsedFields || [] : [];
              const collapsedLabelMap: Record<string, boolean> = {};
              const collapsedFieldOrder: string[] = [];
              collapsedFieldConfigs.forEach(cfg => {
                const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                if (!fid) return;
                collapsedFieldOrder.push(fid);
                collapsedLabelMap[fid] = cfg.showLabel !== undefined ? !!cfg.showLabel : true;
              });

              const allFields = q.lineItemConfig?.fields || [];
              const rowVisibilityValues = applyValueMapsToLineRow(allFields, row.values || {}, values, { mode: 'init' }, {
                groupKey: q.id,
                rowId: row.id,
                lineItems
              });
              const overlayActionCtx: VisibilityContext = {
                ...groupCtx,
                getLineValue: (_rowId, fid) => (rowVisibilityValues as any)[fid]
              };
              const subGroups = q.lineItemConfig?.subGroups || [];
              const subIdToLabel: Record<string, string> = {};
              subGroups.forEach(sub => {
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
              const normalizeOverlayFieldList = (raw: any): string[] => {
                if (raw === undefined || raw === null) return [];
                const list = Array.isArray(raw) ? raw : [raw];
                const seen = new Set<string>();
                return list
                  .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
                  .filter(entry => {
                    if (!entry || seen.has(entry)) return false;
                    seen.add(entry);
                    return true;
                  });
              };
              const normalizeOverlayFlattenPlacement = (raw: any): 'left' | 'right' | 'below' => {
                const placement = (raw || '').toString().trim().toLowerCase();
                if (placement === 'left' || placement === 'right') return placement;
                return 'below';
              };
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
                const topGroup = definition.questions.find(q => q.id === gid && q.type === 'LINE_ITEM_GROUP') as
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
              ): React.ReactNode => {
                if (!overlayOpenAction || !overlayOpenAction.flattenFields || overlayOpenAction.flattenFields.length === 0) return null;
                const targetKey = overlayOpenAction.targetKey || overlayOpenAction.subKey || '';
                if (!targetKey) return null;
                const flattenPlacement = normalizeOverlayFlattenPlacement(placementOverride ?? overlayOpenAction.flattenPlacement);
                const forceStackedLabel = options?.forceStackedLabel === true;

                const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
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

                const resolveTargetGroup = (): { group?: WebQuestionDefinition; config?: any; kind: 'line' | 'sub' } | null => {
                  if (overlayOpenAction.targetKind === 'line') {
                    const group =
                      overlayOpenAction.overrideGroup ||
                      (definition.questions.find(q => q.id === overlayOpenAction.groupId && q.type === 'LINE_ITEM_GROUP') as
                        | WebQuestionDefinition
                        | undefined);
                    if (!group) return null;
                    return { group, config: (group as any).lineItemConfig, kind: 'line' };
                  }
                  const subConfigBase = (subGroups || []).find(sub => resolveSubgroupKey(sub as any) === overlayOpenAction.groupId);
                  if (!subConfigBase) return null;
                  const subConfig = overlayOpenAction.groupOverride
                    ? applyLineItemGroupOverride(subConfigBase, overlayOpenAction.groupOverride)
                    : subConfigBase;
                  const group: WebQuestionDefinition = {
                    ...(q as any),
                    id: targetKey,
                    lineItemConfig: { ...(subConfig as any), fields: subConfig?.fields || [], subGroups: [] }
                  };
                  return { group, config: subConfig, kind: 'sub' };
                };

                const targetInfo = resolveTargetGroup();
                if (!targetInfo?.group || !targetInfo.config) return null;
                const { maxRows } = resolveLineItemRowLimits(targetInfo.config as any);
                if (maxRows !== 1) {
                  const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::maxRows`;
                  logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                    scope: 'line',
                    parentGroupId: q.id,
                    fieldId: field.id,
                    groupId: overlayOpenAction.groupId,
                    reason: 'maxRows',
                    maxRows: maxRows ?? null
                  });
                  return null;
                }

                const rowsAll = lineItems[targetKey] || [];
                const rowsFiltered = overlayOpenAction.rowFilter
                  ? rowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter))
                  : rowsAll;
                if (!rowsFiltered.length) {
                  const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::noRow`;
                  logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                    scope: 'line',
                    parentGroupId: q.id,
                    fieldId: field.id,
                    groupId: overlayOpenAction.groupId,
                    reason: 'noRow'
                  });
                  return null;
                }
                if (rowsFiltered.length > 1) {
                  const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::multiRow`;
                  logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                    scope: 'line',
                    parentGroupId: q.id,
                    fieldId: field.id,
                    groupId: overlayOpenAction.groupId,
                    reason: 'multipleRows',
                    count: rowsFiltered.length
                  });
                  return null;
                }

                const targetRow = rowsFiltered[0];
                const targetFieldsAll = (targetInfo.config?.fields || []) as any[];
                const targetFields = overlayOpenAction.flattenFields
                  .map((fid: string) => targetFieldsAll.find(f => f && f.id === fid))
                  .filter(Boolean) as any[];
                if (!targetFields.length) return null;

                const targetChoiceSearchDefault = (targetInfo.config?.ui as any)?.choiceSearchEnabled;
                const targetGroupCtx: VisibilityContext = {
                  getValue: fid => resolveTopValue(fid),
                  getLineValue: (_rowId, fid) => (targetRow?.values || {})[fid],
                  getLineItems: groupId => lineItems?.[groupId] || [],
                  getLineItemKeys: () => Object.keys(lineItems || {})
                };
                const resolveDependencyValue = (dep: string): FieldValue | undefined => {
                  if (Object.prototype.hasOwnProperty.call(targetRow?.values || {}, dep)) return (targetRow?.values || {})[dep];
                  if (targetInfo.kind === 'sub' && Object.prototype.hasOwnProperty.call(row.values || {}, dep)) return (row.values || {})[dep];
                  return values[dep];
                };
                const renderFlattenedField = (flatField: any) => {
                  const hideField = shouldHideField(flatField.visibility, targetGroupCtx, { rowId: targetRow.id, linePrefix: targetKey });
                  if (hideField) return null;
                  ensureLineOptions(targetKey, flatField);
                  const fieldPath = `${targetKey}__${flatField.id}__${targetRow.id}`;
                  const renderAsLabel =
                    flatField?.ui?.renderAsLabel === true || flatField?.renderAsLabel === true || flatField?.readOnly === true;
                  const hideLabel = Boolean(flatField?.ui?.hideLabel);
                  const useStackedLabel = forceStackedLabel || flatField.ui?.labelLayout === 'stacked';
                  const labelStyle = hideLabel ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : undefined;
                  const valueMapApplied = flatField.valueMap
                    ? resolveValueMapValue(
                        flatField.valueMap,
                        fid => {
                          if ((targetRow.values || {}).hasOwnProperty(fid)) return (targetRow.values || {})[fid];
                          return values[fid];
                        },
                        { language, targetOptions: toOptionSet(flatField) }
                      )
                    : undefined;
                  const fieldValueRaw = flatField.valueMap ? valueMapApplied : ((targetRow.values || {})[flatField.id] as any);
                  const fieldValue = flatField.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                  const numberText =
                    flatField.type === 'NUMBER'
                      ? fieldValue === undefined || fieldValue === null
                        ? ''
                        : (fieldValue as any).toString()
                      : '';
                  const displayValue =
                    flatField.type === 'NUMBER'
                      ? numberText
                      : flatField.type === 'DATE'
                        ? fieldValue
                        : fieldValue;
                  const displayText = displayValue === undefined || displayValue === null ? '' : displayValue.toString();
                  const renderErrors = () => (
                    <>
                      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                      {renderWarnings(fieldPath)}
                    </>
                  );
                  const readOnlyNode = <div className="ck-readonly-value">{displayText ? displayText : <span className="muted">—</span>}</div>;

                  if (flatField.type === 'CHOICE') {
                    const rawVal = (targetRow.values || {})[flatField.id];
                    const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                    const optionSetField: OptionSet =
                      optionState[optionKey(flatField.id, targetKey)] || {
                        en: flatField.options || [],
                        fr: (flatField as any).optionsFr || [],
                        nl: (flatField as any).optionsNl || [],
                        raw: (flatField as any).optionsRaw
                      };
                    const dependencyIds = (
                      Array.isArray(flatField.optionFilter?.dependsOn)
                        ? flatField.optionFilter?.dependsOn
                        : [flatField.optionFilter?.dependsOn || '']
                    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      flatField.optionFilter,
                      optionSetField,
                      dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
                    );
                    const allowedWithCurrent =
                      choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                        ? [...allowedField, choiceVal]
                        : allowedField;
                    const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(flatField) });
                    const selected = optsField.find(opt => opt.value === choiceVal);
                    return (
                      <div
                        key={fieldPath}
                        className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(flatField, language, flatField.id)}
                          {flatField.required && <RequiredStar />}
                        </label>
                        <div className="ck-control-row">
                          {renderAsLabel ? (
                            <div className="ck-readonly-value">{selected?.label || choiceVal || '—'}</div>
                          ) : (
                            renderChoiceControl({
                              fieldPath,
                              value: choiceVal || '',
                              options: optsField,
                              required: !!flatField.required,
                              searchEnabled: flatField.ui?.choiceSearchEnabled ?? targetChoiceSearchDefault,
                              override: flatField.ui?.control,
                              disabled: submitting || flatField.readOnly === true,
                              onChange: next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)
                            })
                          )}
                        </div>
                        {renderErrors()}
                      </div>
                    );
                  }

                  if (flatField.type === 'CHECKBOX') {
                    const optionSetField: OptionSet =
                      optionState[optionKey(flatField.id, targetKey)] || {
                        en: flatField.options || [],
                        fr: (flatField as any).optionsFr || [],
                        nl: (flatField as any).optionsNl || [],
                        raw: (flatField as any).optionsRaw
                      };
                    const dependencyIds = (
                      Array.isArray(flatField.optionFilter?.dependsOn)
                        ? flatField.optionFilter?.dependsOn
                        : [flatField.optionFilter?.dependsOn || '']
                    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      flatField.optionFilter,
                      optionSetField,
                      dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
                    );
                    const hasAnyOption =
                      !!((optionSetField.en && optionSetField.en.length) ||
                        ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                        ((optionSetField as any).nl && (optionSetField as any).nl.length));
                    const isConsentCheckbox = !(flatField as any).dataSource && !hasAnyOption;
                    const selected = Array.isArray(targetRow.values[flatField.id]) ? (targetRow.values[flatField.id] as string[]) : [];
                    const allowedWithSelected = selected.reduce((acc, val) => {
                      if (val && !acc.includes(val)) acc.push(val);
                      return acc;
                    }, [...allowedField]);
                    const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(flatField) });
                    if (isConsentCheckbox) {
                      return (
                        <div
                          key={fieldPath}
                          className={`field inline-field ck-consent-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                          data-field-path={fieldPath}
                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={!!targetRow.values[flatField.id]}
                              disabled={submitting || flatField.readOnly === true}
                              onChange={e => {
                                if (submitting || flatField.readOnly === true) return;
                                handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.checked);
                              }}
                            />
                            <span className="ck-consent-text" style={labelStyle}>
                              {resolveFieldLabel(flatField, language, flatField.id)}
                              {flatField.required && <RequiredStar />}
                            </span>
                          </label>
                          {renderErrors()}
                        </div>
                      );
                    }
                    const controlOverride = ((flatField as any)?.ui?.control || '').toString().trim().toLowerCase();
                    const renderAsMultiSelect = controlOverride === 'select';
                    return (
                      <div
                        key={fieldPath}
                        className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(flatField, language, flatField.id)}
                          {flatField.required && <RequiredStar />}
                        </label>
                        {renderAsLabel ? (
                          readOnlyNode
                        ) : renderAsMultiSelect ? (
                          <select
                            multiple
                            value={selected}
                            disabled={submitting || flatField.readOnly === true}
                            onChange={e => {
                              if (submitting || flatField.readOnly === true) return;
                              const next = Array.from(e.currentTarget.selectedOptions).map(o => o.value);
                              handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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
                                  disabled={submitting || flatField.readOnly === true}
                                  onChange={e => {
                                    if (submitting || flatField.readOnly === true) return;
                                    const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                                    handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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

                  if (flatField.type === 'FILE_UPLOAD') {
                    const items = toUploadItems((targetRow.values || {})[flatField.id]);
                    const count = items.length;
                    return (
                      <div
                        key={fieldPath}
                        className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(flatField, language, flatField.id)}
                          {flatField.required && <RequiredStar />}
                        </label>
                        {renderAsLabel ? (
                          <div className="ck-readonly-value">{count ? `${count}` : '—'}</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (submitting) return;
                              openFileOverlay({
                                scope: 'line',
                                title: resolveFieldLabel(flatField, language, flatField.id),
                                group: targetInfo.group as WebQuestionDefinition,
                                rowId: targetRow.id,
                                field: flatField,
                                fieldPath
                              });
                            }}
                            style={buttonStyles.secondary}
                            disabled={submitting}
                          >
                            {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
                          </button>
                        )}
                        {renderErrors()}
                      </div>
                    );
                  }

                  if (renderAsLabel) {
                    return (
                      <div
                        key={fieldPath}
                        className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(flatField, language, flatField.id)}
                          {flatField.required && <RequiredStar />}
                        </label>
                        <div className="ck-control-row">{readOnlyNode}</div>
                        {renderErrors()}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={fieldPath}
                      className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                      data-field-path={fieldPath}
                      data-has-error={errors[fieldPath] ? 'true' : undefined}
                      data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                    >
                      <label style={labelStyle}>
                        {resolveFieldLabel(flatField, language, flatField.id)}
                        {flatField.required && <RequiredStar />}
                      </label>
                      <div className="ck-control-row">
                        {flatField.type === 'PARAGRAPH' ? (
                          <textarea
                            className="ck-paragraph-input"
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            rows={(flatField as any)?.ui?.paragraphRows || 4}
                          />
                        ) : flatField.type === 'DATE' ? (
                          <DateInput
                            value={fieldValue}
                            language={language}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            ariaLabel={resolveFieldLabel(flatField, language, flatField.id)}
                            onChange={next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)}
                          />
                        ) : (
                          <input
                            type={flatField.type === 'DATE' ? 'date' : 'text'}
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                          />
                        )}
                        {renderErrors()}
                      </div>
                    </div>
                  );
                };

                const logKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::render`;
                logOverlayOpenActionOnce(logKey, 'ui.overlayOpenAction.flatten.render', {
                  scope: 'line',
                  parentGroupId: q.id,
                  fieldId: field.id,
                  groupId: overlayOpenAction.groupId,
                  targetKey,
                  fieldCount: targetFields.length,
                  flattenPlacement
                });

                const rendered = targetFields.map((flatField: any) => renderFlattenedField(flatField)).filter(Boolean);
                if (!rendered.length) return null;
                if (options?.asGridItems) return rendered;
                const gridClassName = `ck-pair-grid${rendered.length >= 3 ? ' ck-pair-grid--3' : ''}`;
                const grid = <PairedRowGrid className={gridClassName}>{rendered}</PairedRowGrid>;
                if (flattenPlacement === 'below') {
                  return <div style={{ marginTop: 8 }}>{grid}</div>;
                }
                return grid;
              };
              const fieldTriggeredSubgroupIdSet =
                !rowCollapsed && subIds.length > 0
                  ? allFields.reduce<Set<string>>((acc, field) => {
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
              const hasFieldTriggeredSubgroup = fieldTriggeredSubgroupIdSet.size > 0;
              const fallbackSubIds =
                !rowCollapsed && subIds.length ? subIds.filter(id => !fieldTriggeredSubgroupIdSet.has(id)) : [];

              const tapToOpenLabel = tSystem('common.tapToOpen', language, 'Tap to open');
              const renderSubgroupOpenStack = (
                subIdsToRender: string[],
                opts?: { sourceFieldId?: string; variant?: 'stack' | 'inline' }
              ) => {
                const variant = (opts?.variant || 'stack').toString().toLowerCase() === 'inline' ? 'inline' : 'stack';
                const list = Array.isArray(subIdsToRender) ? Array.from(new Set(subIdsToRender.filter(Boolean))) : [];
                if (!list.length) return null;
                const containerClass = variant === 'inline' ? 'ck-label-actions' : 'ck-subgroup-open-stack';
                return (
                  <div className={containerClass}>
                    {list.map(subId => {
                      const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                      const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                      const subRows = (lineItems[fullSubKey] || []) as any[];
                      const subCfg = (subGroups || []).find(s => resolveSubgroupKey(s) === subId) as any;
                      const subFields = ((subCfg as any)?.fields || []) as any[];
                      const label = subIdToLabel[subId] || subId;
                      const subUi = (subCfg as any)?.ui as any;
                      const isSubProgressive =
                        subUi?.mode === 'progressive' &&
                        Array.isArray(subUi?.collapsedFields) &&
                        (subUi?.collapsedFields || []).length > 0;
                      const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;
                      const subCollapsedFieldConfigs = isSubProgressive ? (subUi?.collapsedFields || []) : [];
                      const subExpandGate = (subUi?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';

                      const isSubRowDisabledByExpandGate = (subRow: any): boolean => {
                        if (!isSubProgressive) return false;
                        if (subExpandGate === 'always') return false;
                        if (!subCollapsedFieldConfigs.length) return false;
                        const subCollapseKey = `${fullSubKey}::${subRow.id}`;
                        const subRowCollapsed = collapsedRows[subCollapseKey] ?? subDefaultCollapsed;
                        if (!subRowCollapsed) return false;

                        const groupCtx2: VisibilityContext = {
                          getValue: fid => resolveTopValue(fid),
                          getLineValue: (_rowId, fid) => (subRow?.values || {})[fid],
                          getLineItems: groupId => lineItems?.[groupId] || [],
                          getLineItemKeys: () => Object.keys(lineItems || {})
                        };
                        const isHidden2 = (fieldId: string) => {
                          const target = (subFields || []).find((f: any) => f?.id === fieldId) as any;
                          if (!target) return false;
                          return shouldHideField(target.visibility, groupCtx2, { rowId: subRow?.id, linePrefix: fullSubKey });
                        };
                        const blocked: string[] = [];
                        (subCollapsedFieldConfigs || []).forEach((cfg: any) => {
                          const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                          if (!fid) return;
                          const field = (subFields || []).find((f: any) => f?.id === fid) as any;
                          if (!field) return;
                          const hideField = shouldHideField(field.visibility, groupCtx2, { rowId: subRow?.id, linePrefix: fullSubKey });
                          if (hideField) return;
                          const val = (subRow?.values || {})[field.id];
                          if (field.required && isEmptyValue(val as any)) {
                            blocked.push(field.id);
                            return;
                          }
                          const rules = Array.isArray(field.validationRules)
                            ? field.validationRules.filter((r: any) => r?.then?.fieldId === field.id)
                            : [];
                          if (!rules.length) return;
                          const rulesCtx: any = {
                            ...groupCtx2,
                            getValue: (fieldId: string) =>
                              Object.prototype.hasOwnProperty.call(subRow?.values || {}, fieldId)
                                ? (subRow?.values || {})[fieldId]
                                : (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId) ? (row.values || {})[fieldId] : values[fieldId]),
                            language,
                            phase: 'submit',
                            isHidden: isHidden2
                          };
                          const errs = validateRules(rules, rulesCtx);
                          if (errs.length) blocked.push(field.id);
                        });
                        return Array.from(new Set(blocked)).length > 0;
                      };

                      const subgroupIsComplete = (() => {
                        if (!subRows.length) return false;
                        if (!subFields.length) return true;
                        let hasAnyEnabledRow = false;
                        for (const subRow of subRows) {
                          if (isSubRowDisabledByExpandGate(subRow)) continue;
                          hasAnyEnabledRow = true;
                          const subCtx: VisibilityContext = {
                            getValue: fid => resolveTopValue(fid),
                            getLineValue: (_rowId, fid) => (subRow?.values || {})[fid],
                            getLineItems: groupId => lineItems?.[groupId] || [],
                            getLineItemKeys: () => Object.keys(lineItems || {})
                          };
                          for (const field of subFields) {
                            if (!field?.required) continue;
                            const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: fullSubKey });
                            if (hide) continue;
                            const mapped = field.valueMap
                              ? resolveValueMapValue(
                                  field.valueMap,
                                  (fid: string) => {
                                    if ((subRow?.values || {}).hasOwnProperty(fid)) return (subRow?.values || {})[fid];
                                    if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                                    return resolveTopValue(fid);
                                  },
                                  { language, targetOptions: toOptionSet(field) }
                                )
                              : undefined;
                            const raw = field.valueMap ? mapped : (subRow?.values || {})[field.id];
                            const filled =
                              field.type === 'FILE_UPLOAD'
                                ? isUploadValueComplete({
                                    value: raw as any,
                                    uploadConfig: (field as any).uploadConfig,
                                    required: true
                                  })
                                : !isEmptyValue(raw as any);
                            if (!filled) return false;
                          }
                        }
                        if (!hasAnyEnabledRow) return false;
                        return true;
                      })();

                      const pillClass = subHasError
                        ? 'ck-progress-bad'
                        : subgroupIsComplete
                          ? 'ck-progress-good'
                          : subRows.length
                            ? 'ck-progress-info'
                            : 'ck-progress-neutral';

                      const pillBaseClass =
                        variant === 'inline'
                          ? 'ck-progress-pill ck-subgroup-open-pill-inline'
                          : 'ck-progress-pill ck-upload-pill-btn ck-subgroup-open-pill';

                      return (
                        <button
                          key={`${fullSubKey}-open`}
                          type="button"
                          className={`${pillBaseClass} ${pillClass}`}
                          aria-label={`${tapToOpenLabel} ${label}`}
                          onClick={() => {
                            onDiagnostic?.('subgroup.open.tap', {
                              groupId: q.id,
                              rowId: row.id,
                              subId,
                              sourceFieldId: opts?.sourceFieldId || null
                            });
                            openSubgroupOverlay(fullSubKey);
                          }}
                        >
                          {pillClass === 'ck-progress-good' ? (
                            <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
                          ) : null}
                          <span>{label}</span>
                          <span className="ck-progress-label">{tapToOpenLabel}</span>
                          <span className="ck-progress-caret">▸</span>
                        </button>
                      );
                    })}
                  </div>
                );
              };
              const collapsedFieldsOrdered = collapsedFieldOrder
                .map(fid => allFields.find(f => f.id === fid))
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
              const anchorField = anchorFieldId ? (allFields.find(f => f.id === anchorFieldId) as any) : undefined;
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
                  const optionSetField: OptionSet =
                    optionState[optionKey(anchorField.id, q.id)] || {
                      en: anchorField.options || [],
                      fr: (anchorField as any).optionsFr || [],
                      nl: (anchorField as any).optionsNl || [],
                      raw: (anchorField as any).optionsRaw
                    };
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
                  .filter(cfg => cfg && cfg.showLabel === false)
                  .map(cfg => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
                  .filter(Boolean);
                return unlabeled.length === 1 ? unlabeled[0] : '';
              })();

              const titleField = titleFieldId ? (allFields.find(f => f.id === titleFieldId) as any) : undefined;
              const titleHidden = titleField
                ? shouldHideField(titleField.visibility, groupCtx, { rowId: row.id, linePrefix: q.id })
                : true;
              const showTitleControl = !!titleField && !titleHidden;
              const showAnchorTitleAsHeaderTitle =
                guidedCollapsedFieldsInHeader && isProgressive && showTitleControl && anchorHasValue && wantsAnchorTitle;
              const showAnchorTitleAsBodyTitle = !isProgressive && anchorHasValue && (anchorAsTitle || rowSource === 'auto');
              // Guided steps UX: when collapsed fields are rendered in the row header, don't render the special "title control"
              // separately. Instead, we keep all collapsed fields in the header grid so they can appear side-by-side.
              const showTitleControlInHeader = showTitleControl && !guidedCollapsedFieldsInHeader;
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
                (collapsedFieldConfigs || []).forEach(cfg => {
                  const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                  if (!fid) return;
                  const field = allFields.find(f => f.id === fid);
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
                    ? field.validationRules.filter(r => r?.then?.fieldId === field.id)
                    : [];
                  if (rules.length) {
                    const isHidden = (fieldId: string) => {
                      const target = allFields.find(f => f.id === fieldId);
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
              const requiredRowProgress = (() => {
                let hasAnyRequired = false;
                let allRequiredComplete = true;

                const isFilled = (field: any, raw: any): boolean => {
                  if (field?.type === 'FILE_UPLOAD') {
                    return isUploadValueComplete({
                      value: raw as any,
                      uploadConfig: (field as any).uploadConfig,
                      required: !!field.required
                    });
                  }
                  return !isEmptyValue(raw as any);
                };

                // 1) Required fields on the row itself
                (allFields || []).forEach((field: any) => {
                  const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                  if (hideField) return;
                  if (!field?.required) return;
                  hasAnyRequired = true;

                  const mapped = field.valueMap
                    ? resolveValueMapValue(
                        field.valueMap,
                        (fid: string) => {
                          if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                          return resolveTopValue(fid);
                        },
                        { language, targetOptions: toOptionSet(field) }
                      )
                    : undefined;
                  const raw = field.valueMap ? mapped : (row.values || {})[field.id];
                  if (!isFilled(field, raw)) allRequiredComplete = false;
                });

                // 2) Required fields in any EXISTING subgroup rows under this parent row
                (subGroups || []).forEach(sub => {
                  const subId = resolveSubgroupKey(sub);
                  if (!subId) return;
                  const subKey = buildSubgroupKey(q.id, row.id, subId);
                  const subRows = (lineItems[subKey] || []) as any[];
                  if (!subRows.length) return;
                  const subFields = ((sub as any)?.fields || []) as any[];
                  subRows.forEach(subRow => {
                    const subCtx: VisibilityContext = {
                      getValue: fid => resolveTopValue(fid),
                      getLineValue: (_rowId, fid) => (subRow?.values || {})[fid],
                      getLineItems: groupId => lineItems?.[groupId] || [],
                      getLineItemKeys: () => Object.keys(lineItems || {})
                    };
                    subFields.forEach((field: any) => {
                      const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                      if (hide) return;
                      if (!field?.required) return;
                      hasAnyRequired = true;

                      const mapped = field.valueMap
                        ? resolveValueMapValue(
                            field.valueMap,
                            (fid: string) => {
                              if ((subRow?.values || {}).hasOwnProperty(fid)) return (subRow?.values || {})[fid];
                              if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                              return resolveTopValue(fid);
                            },
                            { language, targetOptions: toOptionSet(field) }
                          )
                        : undefined;
                      const raw = field.valueMap ? mapped : (subRow?.values || {})[field.id];
                      if (!isFilled(field, raw)) allRequiredComplete = false;
                    });
                  });
                });

                return { hasAnyRequired, allRequiredComplete };
              })();
              let requiredRowProgressClass = requiredRowProgress.hasAnyRequired
                ? requiredRowProgress.allRequiredComplete
                  ? 'ck-progress-good'
                  : 'ck-progress-bad'
                : 'ck-progress-neutral';
              if (rowHasError) requiredRowProgressClass = 'ck-progress-bad';

              const tapExpandLabel = tSystem('common.tapToExpand', language, 'Tap to expand');
              const tapCollapseLabel = tSystem('common.tapToCollapse', language, 'Tap to collapse');
              const lockedLabel = tSystem('lineItems.locked', language, 'Locked');
              const pillActionLabel = rowLocked ? lockedLabel : rowCollapsed ? tapExpandLabel : tapCollapseLabel;
              const rowTogglePill = !guidedCollapsedFieldsInHeader ? (
                <button
                  type="button"
                  className="ck-row-toggle"
                  aria-label={pillActionLabel}
                  aria-expanded={!rowCollapsed}
                  aria-disabled={rowCollapsed && !canExpand}
                  title={rowCollapsed && !canExpand ? gateResult.reason : pillActionLabel}
                  onClick={() => {
                    if (rowCollapsed && !canExpand) {
                      onDiagnostic?.('edit.progressive.expand.blocked', {
                        groupId: q.id,
                        rowId: row.id,
                        reason: gateResult.reason
                      });
                      return;
                    }
                    setCollapsedRows(prev => ({ ...prev, [collapseKey]: !rowCollapsed }));
                    onDiagnostic?.('edit.progressive.toggle', { groupId: q.id, rowId: row.id, collapsed: !rowCollapsed });
                  }}
                >
                  {(() => {
                    const parts: string[] = [];
                    if (rowHasError) parts.push(tSystem('lineItems.needsAttention', language, 'Needs attention'));
                    if (rowLocked) parts.push(tSystem('lineItems.locked', language, 'Locked'));
                    const text = parts.join(' · ');
                    if (!text) return null;
                    return (
                      <span
                        className="muted"
                        style={{ fontSize: 'var(--ck-font-control)', fontWeight: 600, color: rowHasError ? 'var(--danger)' : undefined }}
                      >
                        {text}
                      </span>
                    );
                  })()}
                  <span
                    className={`ck-progress-pill ${requiredRowProgressClass}`}
                    data-has-error={rowHasError ? 'true' : undefined}
                    aria-disabled={rowCollapsed && !canExpand ? 'true' : undefined}
                  >
                    {requiredRowProgressClass === 'ck-progress-good' ? (
                      <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
                    ) : null}
                    <span className="ck-progress-label">{pillActionLabel}</span>
                    <span className="ck-progress-caret">{rowCollapsed ? '▸' : '▾'}</span>
                  </span>
                </button>
              ) : null;
              const buildHeaderRows = (fields: any[]): any[][] => {
                if (!fields.length) return [];
                if (fields.length <= 3) {
                  const seen = new Set<string>();
                  const unique = fields.filter(f => {
                    const id = (f?.id ?? '').toString();
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                  });
                  return unique.length ? [unique] : [];
                }
                const used = new Set<string>();
                const rows: any[][] = [];
                const isPairable = (field: any): boolean => {
                  if (!(field as any)?.pair) return false;
                  if ((field?.type || '').toString() === 'PARAGRAPH') return false;
                  return true;
                };

                for (let i = 0; i < fields.length; i += 1) {
                  const f = fields[i];
                  const fid = (f?.id ?? '').toString();
                  if (!fid || used.has(fid)) continue;

                  const pairKey = f?.pair ? f.pair.toString() : '';
                  if (pairKey && isPairable(f)) {
                    // Group all pairable fields with the same pairKey into the same header row (3-up supported).
                    const group: any[] = [f];
                    for (let j = i + 1; j < fields.length; j += 1) {
                      const cand = fields[j];
                      const candId = (cand?.id ?? '').toString();
                      if (!candId || used.has(candId)) continue;
                      if ((cand?.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
                        group.push(cand);
                      }
                    }
                    group.forEach(g => used.add((g?.id ?? '').toString()));
                    const maxPerRow = 3;
                    for (let k = 0; k < group.length; k += maxPerRow) {
                      rows.push(group.slice(k, k + maxPerRow));
                    }
                      continue;
                    }

                  // Fallback: try to keep 2-up layout by pairing with the next available field.
                  let partner: any | null = null;
                  for (let j = i + 1; j < fields.length; j += 1) {
                    const cand = fields[j];
                    const candId = (cand?.id ?? '').toString();
                    if (!candId || used.has(candId)) continue;
                    partner = cand;
                    break;
                  }
                  used.add(fid);
                  if (partner) {
                    used.add((partner.id ?? '').toString());
                    rows.push([f, partner]);
                  } else {
                    rows.push([f]);
                  }
                }
                return rows;
              };

              const headerCollapsedFieldsBase = guidedCollapsedFieldsInHeader
                ? ((collapsedFieldsOrdered.length ? collapsedFieldsOrdered : fieldsToRender) || []).filter((f: any) => {
                    const fid = f?.id !== undefined && f?.id !== null ? f.id.toString() : '';
                    if (!fid) return false;
                    // In guided-header mode we may show the anchor as a standalone row title. Don't also render it in the grid.
                    if (showAnchorTitleAsHeaderTitle && fid === anchorFieldId) return false;
                    if (showTitleControlInHeader && fid === titleFieldId) return false;
                    return true;
                  })
                : [];
              const headerCollapsedFieldsToRender = guidedCollapsedFieldsInHeader ? headerCollapsedFieldsBase.slice(0, 3) : [];
              const headerCollapsedFieldIdSet = new Set<string>(
                headerCollapsedFieldsToRender
                  .map((f: any) => (f?.id !== undefined && f?.id !== null ? f.id.toString() : ''))
                  .filter(Boolean)
              );
              const bodyFieldsToRenderBase =
                guidedCollapsedFieldsInHeader
                  ? (fieldsToRender || []).filter((f: any) => !headerCollapsedFieldIdSet.has((f?.id || '').toString()))
                  : fieldsToRender;
              const canHoistSingleBodyFieldIntoHeader =
                guidedCollapsedFieldsInHeader &&
                isProgressive &&
                headerCollapsedFieldsToRender.length === 2 &&
                headerCollapsedFieldsToRender.every((f: any) => (f as any)?.ui?.renderAsLabel === true) &&
                (bodyFieldsToRenderBase || []).length === 1 &&
                Boolean((bodyFieldsToRenderBase?.[0] as any)?.pair);
              const headerFieldsToRender = (() => {
                if (!canHoistSingleBodyFieldIntoHeader) return headerCollapsedFieldsToRender;
                const extra = (bodyFieldsToRenderBase?.[0] as any) || null;
                if (!extra) return headerCollapsedFieldsToRender;
                const seen = new Set<string>();
                return [...headerCollapsedFieldsToRender, extra].filter((f: any) => {
                  const id = (f?.id ?? '').toString();
                  if (!id || seen.has(id)) return false;
                  seen.add(id);
                  return true;
                });
              })();
              const bodyFieldsToRender = canHoistSingleBodyFieldIntoHeader ? [] : bodyFieldsToRenderBase;

              const renderLineItemField = (
                field: any,
                opts?: { forceHideLabel?: boolean; showLabel?: boolean; forceStackedLabel?: boolean; inGrid?: boolean }
              ) => {
                ensureLineOptions(q.id, field);
                const optionSetField: OptionSet =
                  optionState[optionKey(field.id, q.id)] || {
                    en: field.options || [],
                    fr: (field as any).optionsFr || [],
                    nl: (field as any).optionsNl || [],
                    raw: (field as any).optionsRaw
                  };
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
                ): React.ReactNode => {
                  if (!overlayOpenAction || !overlayOpenAction.flattenFields || overlayOpenAction.flattenFields.length === 0) return null;
                  const targetKey = overlayOpenAction.targetKey || overlayOpenAction.subKey || '';
                  if (!targetKey) return null;
                  const flattenPlacement = normalizeOverlayFlattenPlacement(placementOverride ?? overlayOpenAction.flattenPlacement);
                  const forceStackedLabel = options?.forceStackedLabel === true;

                  const resolveTargetGroup = (): { group?: WebQuestionDefinition; config?: any; kind: 'line' | 'sub' } | null => {
                    if (overlayOpenAction.targetKind === 'line') {
                      const group =
                        overlayOpenAction.overrideGroup ||
                        (definition.questions.find(q => q.id === overlayOpenAction.groupId && q.type === 'LINE_ITEM_GROUP') as
                          | WebQuestionDefinition
                          | undefined);
                      if (!group) return null;
                      return { group, config: (group as any).lineItemConfig, kind: 'line' };
                    }
                    const subConfigBase = (subGroups || []).find(sub => resolveSubgroupKey(sub as any) === overlayOpenAction.groupId);
                    if (!subConfigBase) return null;
                    const subConfig = overlayOpenAction.groupOverride
                      ? applyLineItemGroupOverride(subConfigBase, overlayOpenAction.groupOverride)
                      : subConfigBase;
                    const group: WebQuestionDefinition = {
                      ...(q as any),
                      id: targetKey,
                      lineItemConfig: { ...(subConfig as any), fields: subConfig?.fields || [], subGroups: [] }
                    };
                    return { group, config: subConfig, kind: 'sub' };
                  };

                  const targetInfo = resolveTargetGroup();
                  if (!targetInfo?.group || !targetInfo.config) return null;
                  const { maxRows } = resolveLineItemRowLimits(targetInfo.config as any);
                  if (maxRows !== 1) {
                    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::maxRows`;
                    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                      scope: 'line',
                      parentGroupId: q.id,
                      fieldId: field.id,
                      groupId: overlayOpenAction.groupId,
                      reason: 'maxRows',
                      maxRows: maxRows ?? null
                    });
                    return null;
                  }

                  const rowsAll = lineItems[targetKey] || [];
                  const rowsFiltered = overlayOpenAction.rowFilter
                    ? rowsAll.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter))
                    : rowsAll;
                  if (!rowsFiltered.length) {
                    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::noRow`;
                    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                      scope: 'line',
                      parentGroupId: q.id,
                      fieldId: field.id,
                      groupId: overlayOpenAction.groupId,
                      reason: 'noRow'
                    });
                    return null;
                  }
                  if (rowsFiltered.length > 1) {
                    const skipKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::multiRow`;
                    logOverlayOpenActionOnce(skipKey, 'ui.overlayOpenAction.flatten.skip', {
                      scope: 'line',
                      parentGroupId: q.id,
                      fieldId: field.id,
                      groupId: overlayOpenAction.groupId,
                      reason: 'multipleRows',
                      count: rowsFiltered.length
                    });
                    return null;
                  }

                  const targetRow = rowsFiltered[0];
                  const targetFieldsAll = (targetInfo.config?.fields || []) as any[];
                  const targetFields = overlayOpenAction.flattenFields
                    .map(fid => targetFieldsAll.find(f => f && f.id === fid))
                    .filter(Boolean) as any[];
                  if (!targetFields.length) return null;

                  const targetChoiceSearchDefault = (targetInfo.config?.ui as any)?.choiceSearchEnabled;
                  const targetGroupCtx: VisibilityContext = {
                    getValue: fid => resolveTopValue(fid),
                    getLineValue: (_rowId, fid) => (targetRow?.values || {})[fid],
                    getLineItems: groupId => lineItems?.[groupId] || [],
                    getLineItemKeys: () => Object.keys(lineItems || {})
                  };
                  const resolveDependencyValue = (dep: string): FieldValue | undefined => {
                    if (Object.prototype.hasOwnProperty.call(targetRow?.values || {}, dep)) return (targetRow?.values || {})[dep];
                    if (targetInfo.kind === 'sub' && Object.prototype.hasOwnProperty.call(row.values || {}, dep)) return (row.values || {})[dep];
                    return values[dep];
                  };
                  const renderFlattenedField = (flatField: any) => {
                    const hideField = shouldHideField(flatField.visibility, targetGroupCtx, { rowId: targetRow.id, linePrefix: targetKey });
                    if (hideField) return null;
                    ensureLineOptions(targetKey, flatField);
                    const fieldPath = `${targetKey}__${flatField.id}__${targetRow.id}`;
                    const renderAsLabel =
                      flatField?.ui?.renderAsLabel === true || flatField?.renderAsLabel === true || flatField?.readOnly === true;
                    const hideLabel = Boolean(flatField?.ui?.hideLabel);
                    const useStackedLabel = forceStackedLabel || flatField.ui?.labelLayout === 'stacked';
                    const labelStyle = hideLabel ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : undefined;
                    const valueMapApplied = flatField.valueMap
                      ? resolveValueMapValue(
                          flatField.valueMap,
                          fid => {
                            if ((targetRow.values || {}).hasOwnProperty(fid)) return (targetRow.values || {})[fid];
                            return values[fid];
                          },
                          { language, targetOptions: toOptionSet(flatField) }
                        )
                      : undefined;
                    const fieldValueRaw = flatField.valueMap ? valueMapApplied : ((targetRow.values || {})[flatField.id] as any);
                    const fieldValue = flatField.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                    const numberText =
                      flatField.type === 'NUMBER'
                        ? fieldValue === undefined || fieldValue === null
                          ? ''
                          : (fieldValue as any).toString()
                        : '';
                    const displayValue =
                      flatField.type === 'NUMBER'
                        ? numberText
                        : flatField.type === 'DATE'
                          ? fieldValue
                          : fieldValue;
                    const displayText = displayValue === undefined || displayValue === null ? '' : displayValue.toString();
                    const helperCfg = resolveFieldHelperText({ ui: (flatField as any)?.ui, language });
                    const helperText = helperCfg.text;
                    const supportsPlaceholder =
                      flatField.type === 'TEXT' || flatField.type === 'PARAGRAPH' || flatField.type === 'NUMBER';
                    const effectivePlacement =
                      helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
                    const isEditableField =
                      !submitting &&
                      flatField?.readOnly !== true &&
                      flatField?.ui?.renderAsLabel !== true &&
                      flatField?.renderAsLabel !== true &&
                      !flatField?.valueMap;
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
                    const renderErrors = () => (
                      <>
                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                        {renderWarnings(fieldPath)}
                      </>
                    );
                    const readOnlyNode = (
                      <div className="ck-readonly-value">{displayText ? displayText : <span className="muted">—</span>}</div>
                    );

                    if (flatField.type === 'CHOICE') {
                      const rawVal = (targetRow.values || {})[flatField.id];
                      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                      const optionSetField: OptionSet =
                        optionState[optionKey(flatField.id, targetKey)] || {
                          en: flatField.options || [],
                          fr: (flatField as any).optionsFr || [],
                          nl: (flatField as any).optionsNl || [],
                          raw: (flatField as any).optionsRaw
                        };
                      const dependencyIds = (
                        Array.isArray(flatField.optionFilter?.dependsOn)
                          ? flatField.optionFilter?.dependsOn
                          : [flatField.optionFilter?.dependsOn || '']
                      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                      const allowedField = computeAllowedOptions(
                        flatField.optionFilter,
                        optionSetField,
                        dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
                      );
                      const allowedWithCurrent =
                        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                          ? [...allowedField, choiceVal]
                          : allowedField;
                      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, { sort: optionSortFor(flatField) });
                      const selected = optsField.find(opt => opt.value === choiceVal);
                      return (
                        <div
                          key={fieldPath}
                          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                          data-field-path={fieldPath}
                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                        >
                          <label style={labelStyle}>
                            {resolveFieldLabel(flatField, language, flatField.id)}
                            {flatField.required && <RequiredStar />}
                          </label>
                          <div className="ck-control-row">
                            {renderAsLabel ? (
                              <div className="ck-readonly-value">{selected?.label || choiceVal || '—'}</div>
                            ) : (
                              renderChoiceControl({
                                fieldPath,
                                value: choiceVal || '',
                                options: optsField,
                                required: !!flatField.required,
                                searchEnabled: flatField.ui?.choiceSearchEnabled ?? targetChoiceSearchDefault,
                                override: flatField.ui?.control,
                                disabled: submitting || flatField.readOnly === true,
                                onChange: next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)
                              })
                            )}
                          </div>
                          {renderErrors()}
                        </div>
                      );
                    }

                    if (flatField.type === 'CHECKBOX') {
                      const optionSetField: OptionSet =
                        optionState[optionKey(flatField.id, targetKey)] || {
                          en: flatField.options || [],
                          fr: (flatField as any).optionsFr || [],
                          nl: (flatField as any).optionsNl || [],
                          raw: (flatField as any).optionsRaw
                        };
                      const dependencyIds = (
                        Array.isArray(flatField.optionFilter?.dependsOn)
                          ? flatField.optionFilter?.dependsOn
                          : [flatField.optionFilter?.dependsOn || '']
                      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                      const allowedField = computeAllowedOptions(
                        flatField.optionFilter,
                        optionSetField,
                        dependencyIds.map((dep: string) => toDependencyValue(resolveDependencyValue(dep)))
                      );
                      const hasAnyOption =
                        !!((optionSetField.en && optionSetField.en.length) ||
                          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                          ((optionSetField as any).nl && (optionSetField as any).nl.length));
                      const isConsentCheckbox = !(flatField as any).dataSource && !hasAnyOption;
                      const selected = Array.isArray(targetRow.values[flatField.id]) ? (targetRow.values[flatField.id] as string[]) : [];
                      const allowedWithSelected = selected.reduce((acc, val) => {
                        if (val && !acc.includes(val)) acc.push(val);
                        return acc;
                      }, [...allowedField]);
                      const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(flatField) });
                      if (isConsentCheckbox) {
                        return (
                          <div
                            key={fieldPath}
                            className={`field inline-field ck-consent-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                            data-field-path={fieldPath}
                            data-has-error={errors[fieldPath] ? 'true' : undefined}
                            data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                          >
                            <label>
                              <input
                                type="checkbox"
                                checked={!!targetRow.values[flatField.id]}
                                disabled={submitting || flatField.readOnly === true}
                                onChange={e => {
                                  if (submitting || flatField.readOnly === true) return;
                                  handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.checked);
                                }}
                              />
                              <span className="ck-consent-text" style={labelStyle}>
                                {resolveFieldLabel(flatField, language, flatField.id)}
                                {flatField.required && <RequiredStar />}
                              </span>
                            </label>
                            {renderErrors()}
                          </div>
                        );
                      }
                      const controlOverride = ((flatField as any)?.ui?.control || '').toString().trim().toLowerCase();
                      const renderAsMultiSelect = controlOverride === 'select';
                      return (
                        <div
                          key={fieldPath}
                          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                          data-field-path={fieldPath}
                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                        >
                          <label style={labelStyle}>
                            {resolveFieldLabel(flatField, language, flatField.id)}
                            {flatField.required && <RequiredStar />}
                          </label>
                          {renderAsLabel ? (
                            readOnlyNode
                          ) : renderAsMultiSelect ? (
                            <select
                              multiple
                              value={selected}
                              disabled={submitting || flatField.readOnly === true}
                              onChange={e => {
                                if (submitting || flatField.readOnly === true) return;
                                const next = Array.from(e.currentTarget.selectedOptions).map(o => o.value);
                                handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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
                                    disabled={submitting || flatField.readOnly === true}
                                    onChange={e => {
                                      if (submitting || flatField.readOnly === true) return;
                                      const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                                      handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next);
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

                    if (flatField.type === 'FILE_UPLOAD') {
                      const items = toUploadItems((targetRow.values || {})[flatField.id]);
                      const count = items.length;
                      return (
                      <div
                        key={fieldPath}
                          className={`field inline-field${useStackedLabel ? ' ck-label-stacked' : ''}`}
                          data-field-path={fieldPath}
                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                        >
                          <label style={labelStyle}>
                            {resolveFieldLabel(flatField, language, flatField.id)}
                            {flatField.required && <RequiredStar />}
                          </label>
                          {renderAsLabel ? (
                            <div className="ck-readonly-value">{count ? `${count}` : '—'}</div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (submitting) return;
                                openFileOverlay({
                                  scope: 'line',
                                  title: resolveFieldLabel(flatField, language, flatField.id),
                                  group: targetInfo.group as WebQuestionDefinition,
                                  rowId: targetRow.id,
                                  field: flatField,
                                  fieldPath
                                });
                              }}
                              style={buttonStyles.secondary}
                              disabled={submitting}
                            >
                              {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
                            </button>
                          )}
                          {renderErrors()}
                        </div>
                      );
                    }

                    if (renderAsLabel) {
                      return (
                        <div
                          key={fieldPath}
                          className={`${flatField.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                            useStackedLabel ? ' ck-label-stacked' : ''
                          }`}
                          data-field-path={fieldPath}
                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                        >
                          <label style={labelStyle}>
                            {resolveFieldLabel(flatField, language, flatField.id)}
                            {flatField.required && <RequiredStar />}
                          </label>
                          {readOnlyNode}
                          {renderErrors()}
                        </div>
                      );
                    }

                    return (
                        <div
                          key={fieldPath}
                        className={`${flatField.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                          useStackedLabel ? ' ck-label-stacked' : ''
                        }`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(flatField, language, flatField.id)}
                          {flatField.required && <RequiredStar />}
                        </label>
                        {flatField.type === 'NUMBER' ? (
                          <NumberStepper
                            value={numberText}
                            disabled={submitting}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            ariaLabel={resolveFieldLabel(flatField, language, flatField.id)}
                            ariaDescribedBy={helperId}
                            placeholder={placeholder}
                            onInvalidInput={({ reason, value }) => {
                              const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
                              setErrors(prev => {
                                const next = { ...prev };
                                const existing = next[fieldPath];
                                if (existing && existing !== numericOnlyMessage) return prev;
                                if (existing === numericOnlyMessage) return prev;
                                next[fieldPath] = numericOnlyMessage;
                                return next;
                              });
                              onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                            }}
                            onChange={next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)}
                          />
                        ) : flatField.type === 'PARAGRAPH' ? (
                          <textarea
                            className="ck-paragraph-input"
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            rows={(flatField as any)?.ui?.paragraphRows || 4}
                            placeholder={placeholder}
                            aria-describedby={helperId}
                          />
                        ) : flatField.type === 'DATE' ? (
                          <DateInput
                            value={fieldValue}
                            language={language}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            ariaLabel={resolveFieldLabel(flatField, language, flatField.id)}
                            ariaDescribedBy={helperId}
                            onChange={next => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, next)}
                          />
                        ) : (
                          <input
                            type={flatField.type === 'DATE' ? 'date' : 'text'}
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(targetInfo.group as WebQuestionDefinition, targetRow.id, flatField, e.target.value)}
                            readOnly={!!flatField.valueMap || flatField.readOnly === true}
                            placeholder={placeholder}
                            aria-describedby={helperId}
                          />
                        )}
                        {helperNode}
                        {renderErrors()}
                      </div>
                    );
                  };

                  const logKey = `${q.id}::${row.id}::${field.id}::overlayOpenAction::flatten::render`;
                  logOverlayOpenActionOnce(logKey, 'ui.overlayOpenAction.flatten.render', {
                    scope: 'line',
                    parentGroupId: q.id,
                    fieldId: field.id,
                    groupId: overlayOpenAction.groupId,
                    targetKey,
                    fieldCount: targetFields.length,
                    flattenPlacement
                  });

                  const rendered = targetFields.map(flatField => renderFlattenedField(flatField)).filter(Boolean);
                  if (!rendered.length) return null;
                  if (options?.asGridItems) return rendered;
                  const gridClassName = `ck-pair-grid${rendered.length >= 3 ? ' ck-pair-grid--3' : ''}`;
                  const grid = <PairedRowGrid className={gridClassName}>{rendered}</PairedRowGrid>;
                  if (flattenPlacement === 'below') {
                    return <div style={{ marginTop: 8 }}>{grid}</div>;
                  }
                  return grid;
                };
                const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.subKey || '';
                const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
                const overlayOpenActionRowsFiltered =
                  overlayOpenAction && overlayOpenAction.rowFilter
                    ? overlayOpenActionRowsAll.filter(r =>
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
                        ? rowsAll.filter(r =>
                            matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter)
                          )
                        : rowsAll;
                    if (!rowsToRemove.length) return;
                    const cascade = cascadeRemoveLineItemRows({
                      lineItems: prevLineItems,
                      roots: rowsToRemove.map(r => ({ groupId: groupKey, rowId: r.id }))
                    });
                    let nextLineItems = cascade.lineItems;
                    if (hasResetValue) {
                      const groupRows = nextLineItems[q.id] || [];
                      if (groupRows.length) {
                        nextLineItems = {
                          ...nextLineItems,
                          [q.id]: groupRows.map(r => (r.id === row.id ? { ...r, values: { ...r.values, [field.id]: resetValue } } : r))
                        };
                      }
                    }
                    if (cascade.removedSubgroupKeys.length) {
                      setSubgroupSelectors(prevSel => {
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
                    const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
                      mode: 'init'
                    });
                    setValues(nextValues);
                    setLineItems(recomputed);
                    ctx.runSelectionEffectsForAncestors?.(groupKey, prevLineItems, recomputed);
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
                const renderOverlayOpenReplaceLine = (displayValue?: string | null) => {
                  const showResetButton = overlayOpenAction?.hideTrashIcon !== true;
                  const flattenPlacement = normalizeOverlayFlattenPlacement(overlayOpenAction?.flattenPlacement);
                  const actionButtonStyle = showResetButton
                    ? { ...buttonStyles.secondary, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: '0' }
                    : buttonStyles.secondary;
                  const actionRow = (
                    <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                      <button
                        type="button"
                        onClick={handleOverlayOpenAction}
                        disabled={overlayOpenDisabled}
                        style={withDisabled(actionButtonStyle, overlayOpenDisabled)}
                      >
                        {overlayOpenButtonText(displayValue)}
                      </button>
                      {showResetButton ? (
                        <button
                          type="button"
                          onClick={handleOverlayOpenActionReset}
                          disabled={overlayOpenActionResetDisabled}
                          aria-label={tSystem('lineItems.remove', language, 'Remove')}
                          style={withDisabled(
                            {
                              ...buttonStyles.secondary,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                              padding: '0 14px',
                              minWidth: 44
                            },
                            overlayOpenActionResetDisabled
                          )}
                        >
                          <TrashIcon size={18} />
                        </button>
                      ) : null}
                    </div>
                  );
                  const flattenedGridItems =
                    flattenPlacement !== 'below'
                      ? renderOverlayOpenFlattenedFields(flattenPlacement, { asGridItems: true, forceStackedLabel: true })
                      : null;
                  const gridItems = Array.isArray(flattenedGridItems) ? flattenedGridItems : null;
                  if (gridItems && gridItems.length) {
                    const gridLabelStyle =
                      labelStyle === srOnly ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : labelStyle;
                    const actionField = (
                      <div
                        key={`${fieldPath}::overlayOpenAction`}
                        className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={gridLabelStyle}>
                          {resolveFieldLabel(field, language, field.id)}
                          {field.required && <RequiredStar />}
                        </label>
                        <div className="ck-control-row">{actionRow}</div>
                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                        {renderWarnings(fieldPath)}
                        {nonMatchWarningNode}
                      </div>
                    );
                    const items = flattenPlacement === 'left' ? [...gridItems, actionField] : [actionField, ...gridItems];
                    const gridClassName = `ck-pair-grid${items.length >= 3 ? ' ck-pair-grid--3' : ''}`;
                    return (
                      <div
                        key={field.id}
                        className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                          forceStackedLabel ? ' ck-label-stacked' : ''
                        }`}
                      >
                        <label style={srOnly} aria-hidden="true">
                          {resolveFieldLabel(field, language, field.id)}
                          {field.required && <RequiredStar />}
                        </label>
                        <PairedRowGrid className={gridClassName}>{items}</PairedRowGrid>
                      </div>
                    );
                  }
                  const flattenedFields = renderOverlayOpenFlattenedFields(flattenPlacement, { forceStackedLabel });
                  const actionBlock =
                    flattenPlacement !== 'below' && flattenedFields ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                          gap: 12,
                          alignItems: 'start'
                        }}
                      >
                        {flattenPlacement === 'left' ? flattenedFields : null}
                        <div>{actionRow}</div>
                        {flattenPlacement === 'right' ? flattenedFields : null}
                      </div>
                    ) : (
                      <>
                        {actionRow}
                        {flattenedFields}
                      </>
                    );
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
                      {actionBlock}
                      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                      {renderWarnings(fieldPath)}
                      {nonMatchWarningNode}
                    </div>
                  );
                };
                const renderOverlayOpenInlineButton = (displayValue?: string | null) => {
                  if (!overlayOpenAction || overlayOpenRenderMode !== 'inline') return null;
                  return (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={handleOverlayOpenAction}
                        disabled={overlayOpenDisabled}
                        style={withDisabled(buttonStyles.secondary, overlayOpenDisabled)}
                      >
                        {overlayOpenButtonText(displayValue)}
                      </button>
                    </div>
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
                const renderReadOnlyLine = (display: React.ReactNode) => {
                  const cls = `${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                    forceStackedLabel ? ' ck-label-stacked' : ''
                  } ck-readonly-field`;
                  return (
                    <div
                      key={field.id}
                      className={cls}
                      data-field-path={fieldPath}
                      data-has-error={errors[fieldPath] ? 'true' : undefined}
                      data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                    >
                      <label style={labelStyle}>
                        {resolveFieldLabel(field, language, field.id)}
                        {field.required && <RequiredStar />}
                      </label>
                      <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
                      {fieldIsStacked ? subgroupOpenInline : subgroupOpenStack}
                      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                      {renderWarnings(fieldPath)}
                      {nonMatchWarningNode}
                    </div>
                  );
                };

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
                            disabled: submitting || (field as any)?.readOnly === true,
                            onChange: next => handleLineFieldChange(q, row.id, field, next)
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
                              disabled={submitting || (field as any)?.readOnly === true}
                              onChange={e => {
                                if (submitting || (field as any)?.readOnly === true) return;
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
                              disabled={submitting || (field as any)?.readOnly === true}
                              onChange={e => {
                                if (submitting || (field as any)?.readOnly === true) return;
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
                                disabled={submitting || (field as any)?.readOnly === true}
                                onChange={e => {
                                  if (submitting || (field as any)?.readOnly === true) return;
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
                  case 'FILE_UPLOAD': {
                    const readOnly = (field as any)?.readOnly === true;
                    const uploadConfig: any = (field as any)?.uploadConfig || {};
                    const items = toUploadItems(row.values[field.id]);
                    if (renderAsLabel) {
                      const displayContent = items.length
                        ? items.map((item: any, idx: number) => (
                            <div key={`${field.id}-file-${idx}`} className="ck-readonly-file">
                              {describeUploadItem(item as any)}
                            </div>
                          ))
                        : null;
                      const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
                      return renderReadOnlyLine(displayNode);
                    }
                    const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;
                    const onAdd = () => {
                      if (submitting || readOnly) return;
                      if (maxed) return;
                      fileInputsRef.current[fieldPath]?.click();
                    };
                    const onClearAll = () => {
                      if (submitting || readOnly) return;
                      clearLineFiles({ group: q, rowId: row.id, field, fieldPath });
                    };
                    const onRemoveAt = (idx: number) => {
                      if (submitting || readOnly) return;
                      removeLineFile({ group: q, rowId: row.id, field, fieldPath, index: idx });
                    };
                    const acceptAttr = Array.isArray(uploadConfig?.accept) ? uploadConfig.accept.join(',') : uploadConfig?.accept || undefined;
                    const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
                    const helperText = minRequired
                      ? tSystem(
                          minRequired === 1 ? 'files.helper.min1' : 'files.helper.minMany',
                          language,
                          minRequired === 1 ? 'Required' : 'Required ({min})',
                          { min: minRequired }
                        )
                      : uploadConfig?.maxFiles
                        ? tSystem('files.helper.max', language, 'Max ({max})', { max: uploadConfig.maxFiles })
                        : '';
                    return (
                      <div
                        key={field.id}
                        className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
                        data-field-path={fieldPath}
                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                      >
                        <label style={labelStyle}>
                          {resolveFieldLabel(field, language, field.id)}
                          {field.required && <RequiredStar />}
                        </label>
                        <div className="ck-upload-row">
                          <div className="ck-upload-row__actions">
                            <button
                              type="button"
                              className="ck-progress-pill ck-upload-pill-btn"
                              aria-disabled={submitting || readOnly ? 'true' : undefined}
                              onClick={onAdd}
                            >
                              <span>{tSystem('files.add', language, 'Add')}</span>
                              <span className="ck-progress-caret">▸</span>
                            </button>
                            {items.length ? (
                              <button
                                type="button"
                                className="ck-progress-pill ck-upload-pill-btn"
                                aria-disabled={submitting || readOnly ? 'true' : undefined}
                                onClick={onClearAll}
                              >
                                <span>{tSystem('files.clearAll', language, 'Clear all')}</span>
                                <span className="ck-progress-caret">▸</span>
                              </button>
                            ) : null}
                          </div>
                          {!readOnly && helperText ? <div className="ck-upload-helper">{helperText}</div> : null}
                          <div className="ck-upload-items">
                            {items.map((item: any, idx: number) => (
                              <div key={`${field.id}-file-${idx}`} className="ck-upload-item">
                                <a href={item.url} target="_blank" rel="noreferrer">
                                  {item.label || item.url}
                                </a>
                                {!readOnly ? (
                                  <button type="button" className="ck-upload-remove" onClick={() => onRemoveAt(idx)}>
                                    ×
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          <div style={srOnly} aria-live="polite">
                            {uploadAnnouncements[fieldPath] || ''}
                          </div>
                          <input
                            ref={el => {
                              fileInputsRef.current[fieldPath] = el;
                            }}
                            type="file"
                            multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                            accept={acceptAttr}
                            style={{ display: 'none' }}
                            onChange={e => handleLineFileInputChange({ group: q, rowId: row.id, field, fieldPath, list: e.target.files })}
                          />
                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                          {renderWarnings(fieldPath)}
                        </div>
                      </div>
                    );
                  }
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
                      !submitting &&
                      (field as any)?.readOnly !== true &&
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
                            disabled={submitting}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                            ariaDescribedBy={helperId}
                            placeholder={placeholder}
                            onInvalidInput={
                              isEditableField
                                ? ({ reason, value }) => {
                              const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
                              setErrors(prev => {
                                const next = { ...prev };
                                const existing = next[fieldPath];
                                if (existing && existing !== numericOnlyMessage) return prev;
                                if (existing === numericOnlyMessage) return prev;
                                next[fieldPath] = numericOnlyMessage;
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
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                            rows={(field as any)?.ui?.paragraphRows || 4}
                            placeholder={placeholder}
                            aria-describedby={helperId}
                          />
                        ) : field.type === 'DATE' ? (
                          <DateInput
                            value={fieldValue}
                            language={language}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                            ariaDescribedBy={helperId}
                            onChange={next => handleLineFieldChange(q, row.id, field, next)}
                          />
                        ) : (
                          <input
                            type={field.type === 'DATE' ? 'date' : 'text'}
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
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
              return (
                <div
                  key={row.id}
                  className={`line-item-row${rowLocked ? ' ck-row-disabled' : ''}${isLeftoverGroup ? ' ck-line-item-row--leftover' : ''}`}
                  data-row-anchor={`${q.id}__${row.id}`}
                  data-anchor-field-id={anchorFieldId || undefined}
                  data-anchor-has-value={anchorHasValue ? 'true' : undefined}
                  data-row-disabled={rowLocked ? 'true' : undefined}
                  style={{
                    ...(isLeftoverGroup
                      ? {
                          background: 'transparent',
                          padding: '12px 0',
                          borderRadius: 0,
                          border: 'none',
                          borderBottom: isLastLeftoverRow ? 'none' : '1px solid var(--border)',
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
                    outline: rowHasError ? '2px solid var(--danger)' : undefined,
                    outlineOffset: rowHasError ? 2 : undefined
                  }}
                >
                  {showRowHeader ? (
                    <div className="ck-row-header">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {/* Row numbering intentionally hidden in all UI modes (requested by product). */}
                        {showTitleControlInHeader && titleField ? (
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
                                const optionSetField: OptionSet =
                                  optionState[optionKey(titleField.id, q.id)] || {
                                    en: titleField.options || [],
                                    fr: (titleField as any).optionsFr || [],
                                    nl: (titleField as any).optionsNl || [],
                                    raw: (titleField as any).optionsRaw
                                  };
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
                                        disabled: submitting || (titleField as any)?.readOnly === true,
                                        onChange: next => handleLineFieldChange(q, row.id, titleField, next)
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
                                const optionSetField: OptionSet =
                                  optionState[optionKey(titleField.id, q.id)] || {
                                    en: titleField.options || [],
                                    fr: (titleField as any).optionsFr || [],
                                    nl: (titleField as any).optionsNl || [],
                                    raw: (titleField as any).optionsRaw
                                  };
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
                        {guidedCollapsedFieldsInHeader && showAnchorTitleAsHeaderTitle ? (
                          <div style={{ marginBottom: 8 }}>
                            <div className="ck-row-title">{anchorTitleLabel || '—'}</div>
                          </div>
                        ) : null}
                        {guidedCollapsedFieldsInHeader && headerFieldsToRender.length ? (
                          <div
                            className="ck-row-header-collapsed-fields"
                            style={{
                              marginTop: showTitleControlInHeader ? 8 : 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12
                            }}
                          >
                            {buildHeaderRows(headerFieldsToRender).map((row, idx) => {
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
                        <div className={`ck-row-header-actions${isLeftoverGroup ? ' ck-row-header-actions--leftover' : ''}`}>
                          {rowTogglePill}
                          {canRemoveRow ? (
                            <button
                              type="button"
                              className="ck-line-item-table__remove-button"
                              onClick={() => removeLineRow(q.id, row.id)}
                              aria-label={tSystem('lineItems.remove', language, 'Remove')}
                              title={tSystem('lineItems.remove', language, 'Remove')}
                            >
                              <TrashIcon size={40} />
                            </button>
                          ) : null}
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
                  {(() => {
                    const renderLineItemField = (
                      field: any,
                      opts?: { showLabel?: boolean; forceStackedLabel?: boolean; inGrid?: boolean }
                    ) => {
                    ensureLineOptions(q.id, field);
                    const optionSetField: OptionSet =
                      optionState[optionKey(field.id, q.id)] || {
                        en: field.options || [],
                        fr: (field as any).optionsFr || [],
                        nl: (field as any).optionsNl || [],
                        raw: (field as any).optionsRaw
                      };
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
                      currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                        ? [...allowedField, currentVal]
                        : allowedField;
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
                      const labelStyle = hideLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
                      const renderAsLabel =
                        (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;
                      const overlayActionSuppressed = ctx.isOverlayOpenActionSuppressed?.(fieldPath) === true;
                      const overlayOpenAction = overlayActionSuppressed ? null : resolveOverlayOpenActionForField(field, row, overlayActionCtx);
                      const overlayOpenRenderMode = overlayOpenAction?.renderMode === 'inline' ? 'inline' : 'replace';
                      const overlayOpenDisabled = submitting || rowLocked;
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
                      const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.subKey || '';
                      const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
                      const overlayOpenActionRowsFiltered =
                        overlayOpenAction && overlayOpenAction.rowFilter
                          ? overlayOpenActionRowsAll.filter(r =>
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
                              ? rowsAll.filter(r =>
                                  matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayOpenAction.rowFilter)
                                )
                              : rowsAll;
                          if (!rowsToRemove.length) return;
                          const cascade = cascadeRemoveLineItemRows({
                            lineItems: prevLineItems,
                            roots: rowsToRemove.map(r => ({ groupId: groupKey, rowId: r.id }))
                          });
                          let nextLineItems = cascade.lineItems;
                          if (hasResetValue) {
                            const groupRows = nextLineItems[q.id] || [];
                            if (groupRows.length) {
                              nextLineItems = {
                                ...nextLineItems,
                                [q.id]: groupRows.map(r =>
                                  r.id === row.id ? { ...r, values: { ...r.values, [field.id]: resetValue } } : r
                                )
                              };
                            }
                          }
                          if (cascade.removedSubgroupKeys.length) {
                            setSubgroupSelectors(prevSel => {
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
                          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
                            mode: 'init'
                          });
                          setValues(nextValues);
                          setLineItems(recomputed);
                          ctx.runSelectionEffectsForAncestors?.(groupKey, prevLineItems, recomputed);
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
                      const renderOverlayOpenReplaceLine = (displayValue?: string | null) => {
                        const showResetButton = overlayOpenAction?.hideTrashIcon !== true;
                        const flattenPlacement = normalizeOverlayFlattenPlacement(overlayOpenAction?.flattenPlacement);
                        const actionButtonStyle = showResetButton
                          ? { ...buttonStyles.secondary, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: '0' }
                          : buttonStyles.secondary;
                        const actionRow = (
                          <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                            <button
                              type="button"
                              onClick={handleOverlayOpenAction}
                              disabled={overlayOpenDisabled}
                              style={withDisabled(actionButtonStyle, overlayOpenDisabled)}
                            >
                              {overlayOpenButtonText(displayValue)}
                            </button>
                            {showResetButton ? (
                              <button
                                type="button"
                                onClick={handleOverlayOpenActionReset}
                                disabled={overlayOpenActionResetDisabled}
                                aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                style={withDisabled(
                                  {
                                    ...buttonStyles.secondary,
                                    borderTopLeftRadius: 0,
                                    borderBottomLeftRadius: 0,
                                    padding: '0 14px',
                                    minWidth: 44
                                  },
                                  overlayOpenActionResetDisabled
                                )}
                              >
                                <TrashIcon size={18} />
                              </button>
                            ) : null}
                          </div>
                        );
                        const flattenedGridItems =
                          flattenPlacement !== 'below'
                            ? renderOverlayOpenFlattenedFieldsShared(field, overlayOpenAction, flattenPlacement, {
                                asGridItems: true,
                                forceStackedLabel: true
                              })
                            : null;
                        const gridItems = Array.isArray(flattenedGridItems) ? flattenedGridItems : null;
                        if (gridItems && gridItems.length) {
                          const gridLabelStyle =
                            labelStyle === srOnly ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : labelStyle;
                          const actionField = (
                            <div
                              key={`${fieldPath}::overlayOpenAction`}
                              className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                              <label style={gridLabelStyle}>
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                              </label>
                              <div className="ck-control-row">{actionRow}</div>
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                            </div>
                          );
                          const items = flattenPlacement === 'left' ? [...gridItems, actionField] : [actionField, ...gridItems];
                          const gridClassName = `ck-pair-grid${items.length >= 3 ? ' ck-pair-grid--3' : ''}`;
                          return (
                            <div
                              key={field.id}
                              className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                forceStackedLabel ? ' ck-label-stacked' : ''
                              }`}
                            >
                              <label style={srOnly} aria-hidden="true">
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                              </label>
                              <PairedRowGrid className={gridClassName}>{items}</PairedRowGrid>
                            </div>
                          );
                        }
                        const flattenedFields = renderOverlayOpenFlattenedFieldsShared(field, overlayOpenAction, flattenPlacement, {
                          forceStackedLabel
                        });
                        const actionBlock =
                          flattenPlacement !== 'below' && flattenedFields ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                                gap: 12,
                                alignItems: 'start'
                              }}
                            >
                              {flattenPlacement === 'left' ? flattenedFields : null}
                              <div>{actionRow}</div>
                              {flattenPlacement === 'right' ? flattenedFields : null}
                            </div>
                          ) : (
                            <>
                              {actionRow}
                              {flattenedFields}
                            </>
                          );
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
                            {actionBlock}
                            {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                            {renderWarnings(fieldPath)}
                          </div>
                        );
                      };
                      const renderOverlayOpenInlineButton = (displayValue?: string | null) => {
                        if (!overlayOpenAction || overlayOpenRenderMode !== 'inline') return null;
                        return (
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              onClick={handleOverlayOpenAction}
                              disabled={overlayOpenDisabled}
                              style={withDisabled(buttonStyles.secondary, overlayOpenDisabled)}
                            >
                              {overlayOpenButtonText(displayValue)}
                            </button>
                          </div>
                        );
                      };

                      const overlayOpenTargets = overlayOpenActionTargetsForField(field);
                      const triggeredSubgroupIds = (() => {
                        if (rowCollapsed) return [] as string[];
                        if (!subIds.length) return [] as string[];
                        const effects = Array.isArray((field as any).selectionEffects)
                          ? ((field as any).selectionEffects as any[])
                          : [];
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
                      const subgroupOpenStack = triggeredSubgroupIds.length && !fieldIsStacked
                        ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: field.id, variant: 'stack' })
                        : null;
                      const subgroupOpenInline = triggeredSubgroupIds.length && fieldIsStacked
                        ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: field.id, variant: 'inline' })
                        : null;

                      const renderReadOnlyLine = (display: React.ReactNode) => {
                        const cls = `${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                          forceStackedLabel ? ' ck-label-stacked' : ''
                        } ck-readonly-field`;
                        return (
                          <div
                            key={field.id}
                            className={cls}
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
                            <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
                            {subgroupOpenStack}
                            {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                            {renderWarnings(fieldPath)}
                          </div>
                        );
                      };

                    switch (field.type) {
                      case 'CHOICE': {
                        const rawVal = row.values[field.id];
                        const choiceVal =
                          Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
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
                                  disabled: submitting || (field as any)?.readOnly === true,
                                  onChange: next => handleLineFieldChange(q, row.id, field, next)
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
                              className={`field inline-field ck-consent-field${fieldIsStacked ? ' ck-label-stacked' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                              <label>
                                <input
                                  type="checkbox"
                                  checked={!!row.values[field.id]}
                                  disabled={submitting || (field as any)?.readOnly === true}
                                  onChange={e => {
                                    if (submitting || (field as any)?.readOnly === true) return;
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
                            </div>
                          );
                        }
                        const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                        const renderAsMultiSelect = controlOverride === 'select';
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
                            {renderAsMultiSelect ? (
                              <select
                                multiple
                                value={selected}
                                disabled={submitting || (field as any)?.readOnly === true}
                                aria-label={resolveFieldLabel(field, language, field.id)}
                                onChange={e => {
                                  if (submitting || (field as any)?.readOnly === true) return;
                                  const next = Array.from(e.currentTarget.selectedOptions)
                                    .map(opt => opt.value)
                                    .filter(Boolean);
                                  onDiagnostic?.('ui.checkbox.select.change', { scope: 'line', fieldPath, selectedCount: next.length });
                                  handleLineFieldChange(q, row.id, field, next);
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
                                        const next = e.target.checked
                                          ? [...selected, opt.value]
                                          : selected.filter(v => v !== opt.value);
                                        handleLineFieldChange(q, row.id, field, next);
                                      }}
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                              {subgroupOpenStack}
                            {(() => {
                              const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                              if (!withTooltips.length) return null;
                              const fallbackLabel = resolveFieldLabel(field, language, field.id);
                              const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                              return (
                                <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {withTooltips.map(opt => (
                                    <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {opt.label} <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                            </div>
                          );
                        }
                        case 'FILE_UPLOAD': {
                          const items = toUploadItems(row.values[field.id] as any);
                          const uploadConfig = (field as any).uploadConfig || {};
                          const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
                          const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
                            size?: number;
                            style?: React.CSSProperties;
                            className?: string;
                          }>;
                          const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
                          const maxFiles = uploadConfig.maxFiles && uploadConfig.maxFiles > 0 ? uploadConfig.maxFiles : undefined;
                          const denom = maxFiles ?? (minRequired > 0 ? minRequired : undefined);
                          const displayCount = denom ? Math.min(items.length, denom) : items.length;
                          const maxed = maxFiles ? items.length >= maxFiles : false;
                          const isComplete = minRequired > 0 ? items.length >= minRequired : items.length > 0;
                          const isEmpty = items.length === 0;
                          const missing = minRequired > 0 ? Math.max(0, minRequired - items.length) : 0;
                          const pillClass = isComplete ? 'ck-progress-good' : isEmpty ? 'ck-progress-neutral' : 'ck-progress-info';
                          const pillText = denom ? `${displayCount}/${denom}` : `${items.length}`;
                          const showMissingHelper = items.length > 0 && missing > 0 && !maxed;
                          const readOnly = (field as any)?.readOnly === true;
                          const hasFiles = items.length > 0;
                          const viewMode = readOnly || maxed || hasFiles;
                          const LeftIcon = viewMode ? EyeIcon : SlotIcon;
                          const leftLabel = viewMode
                            ? tSystem('files.view', language, 'View photos')
                            : tSystem('files.add', language, 'Add photo');
                          const cameraStyleBase = viewMode
                            ? buttonStyles.secondary
                            : isEmpty
                              ? buttonStyles.primary
                              : buttonStyles.secondary;
                          const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                            ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
                          );
                          const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
                            .map((v: any) => (v !== undefined && v !== null ? v.toString().trim() : ''))
                            .filter(Boolean);
                          const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
                          if (renderAsLabel) {
                            const displayContent = items.length
                              ? items.map((item: any, idx: number) => (
                                  <div key={`${field.id}-file-${idx}`} className="ck-readonly-file">
                                    {describeUploadItem(item as any)}
                                  </div>
                                ))
                              : null;
                            const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
                            return renderReadOnlyLine(displayNode);
                          }
                          return (
                            <div
                              key={field.id}
                              className={`field inline-field${(field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                              <label style={labelStyle}>
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                              </label>
                              <div className="ck-upload-row">
                                <button
                                  type="button"
                                  className="ck-upload-camera-btn"
                                  disabled={submitting}
                                  style={withDisabled(cameraStyleBase, submitting)}
                                  aria-label={leftLabel}
                                  title={leftLabel}
                                  onClick={() => {
                                    if (submitting) return;
                                    if (viewMode) {
                                      onDiagnostic?.('upload.view.click', { scope: 'line', fieldPath, currentCount: items.length });
                                      openFileOverlay({
                                        scope: 'line',
                                        title: resolveFieldLabel(field, language, field.id),
                                        group: q,
                                        rowId: row.id,
                                        field,
                                        fieldPath
                                      });
                                      return;
                                    }
                                    if (readOnly) return;
                                    onDiagnostic?.('upload.add.click', { scope: 'line', fieldPath, currentCount: items.length });
                                    fileInputsRef.current[fieldPath]?.click();
                                  }}
                                >
                                  <LeftIcon style={{ width: '62%', height: '62%' }} />
                                </button>
                                <button
                                  type="button"
                                  className={`ck-progress-pill ck-upload-pill-btn ${pillClass}`}
                                  aria-disabled={submitting ? 'true' : undefined}
                                  aria-label={`${tSystem('files.open', language, tSystem('common.open', language, 'Open'))} ${tSystem(
                                    'files.title',
                                    language,
                                    'Photos'
                                  )} ${pillText}`}
                                  onClick={() => {
                                    if (submitting) return;
                                    openFileOverlay({
                                      scope: 'line',
                                      title: resolveFieldLabel(field, language, field.id),
                                      group: q,
                                      rowId: row.id,
                                      field,
                                      fieldPath
                                    });
                                  }}
                                >
                                  {isComplete ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
                                  <span>{pillText}</span>
                                  <span className="ck-progress-label">
                                    {tSystem('files.open', language, tSystem('common.open', language, 'Open'))}
                                  </span>
                                  <span className="ck-progress-caret">▸</span>
                                </button>
                                {subgroupOpenStack}
                                {maxed ? (
                                  <div className="ck-upload-helper muted">{tSystem('files.maxReached', language, 'Required photos added.')}</div>
                                ) : showMissingHelper ? (
                                  <div className="ck-upload-helper muted" aria-live="polite">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                      <SlotIcon style={{ width: '1.05em', height: '1.05em' }} />
                                      {tSystem('common.more', language, '+{count} more', { count: missing })}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                              <div style={srOnly} aria-live="polite">
                                {uploadAnnouncements[fieldPath] || ''}
                              </div>
                              <input
                                ref={el => {
                                  fileInputsRef.current[fieldPath] = el;
                                }}
                                type="file"
                                multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                                accept={acceptAttr}
                                style={{ display: 'none' }}
                                onChange={e =>
                                  handleLineFileInputChange({ group: q, rowId: row.id, field, fieldPath, list: e.target.files })
                                }
                              />
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                          </div>
                        );
                      }
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
                        const displayText = displayValue === undefined || displayValue === null ? '' : displayValue.toString();
                        const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                        const helperText = helperCfg.text;
                        const supportsPlaceholder = field.type === 'TEXT' || field.type === 'PARAGRAPH' || field.type === 'NUMBER';
                        const effectivePlacement =
                          helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
                        const isEditableField =
                          !submitting &&
                          (field as any)?.readOnly !== true &&
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
                                (field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''
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
                                disabled={submitting}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                ariaLabel={resolveFieldLabel(field, language, field.id)}
                                ariaDescribedBy={helperId}
                                placeholder={placeholder}
                                onInvalidInput={
                                  isEditableField
                                    ? ({ reason, value }) => {
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
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                rows={(field as any)?.ui?.paragraphRows || 4}
                                placeholder={placeholder}
                                aria-describedby={helperId}
                              />
                            ) : field.type === 'DATE' ? (
                              <DateInput
                                value={fieldValue}
                                language={language}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                ariaLabel={resolveFieldLabel(field, language, field.id)}
                                ariaDescribedBy={helperId}
                                onChange={next => handleLineFieldChange(q, row.id, field, next)}
                              />
                            ) : (
                              <input
                                type={field.type === 'DATE' ? 'date' : 'text'}
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
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

                    if (isProgressive && rowCollapsed) {
                      return (
                        <div
                          className={`collapsed-fields-grid${bodyFieldsToRender.length > 1 ? ' ck-collapsed-stack' : ''}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              bodyFieldsToRender.length === 2
                                ? 'repeat(2, minmax(0, 1fr))'
                                : 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 12
                          }}
                        >
                          {bodyFieldsToRender.map(field => renderLineItemField(field, { inGrid: bodyFieldsToRender.length > 1 }))}
                        </div>
                      );
                    }

                    const visibleExpandedFields = bodyFieldsToRender.filter(field => {
                      const hide = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                      return !hide;
                    });
                    if (guidedCollapsedFieldsInHeader && isProgressive && !visibleExpandedFields.length) {
                      return null;
                    }

                    return (
                      <GroupedPairedFields
                        contextPrefix={`li:${q.id}`}
                        fields={visibleExpandedFields}
                        language={language}
                        collapsedGroups={collapsedGroups}
                        toggleGroupCollapsed={toggleGroupCollapsed}
                        renderField={renderLineItemField}
                        hasError={(field: any) => !!errors[`${q.id}__${field.id}__${row.id}`]}
                        isComplete={(field: any) => {
                          const mapped = field.valueMap
                            ? resolveValueMapValue(field.valueMap, (fid: string) => {
                                if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                                return values[fid];
                              }, { language, targetOptions: toOptionSet(field) })
                            : undefined;
                          const raw = field.valueMap ? mapped : (row.values || {})[field.id];
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
                      <button
                        type="button"
                        className="ck-line-item-table__remove-button"
                        onClick={() => removeLineRow(q.id, row.id)}
                        aria-label={tSystem('lineItems.remove', language, 'Remove')}
                        title={tSystem('lineItems.remove', language, 'Remove')}
                      >
                        <TrashIcon size={40} />
                      </button>
                    ) : null}
                  </div>
                  {isLeftoverGroup && !isLastLeftoverRow ? (
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
                  {!hideInlineSubgroups && !isProgressive && (q.lineItemConfig?.subGroups || []).map(sub => {
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
                    const collapsed = collapsedSubgroups[subKey] ?? true;
                    const subRows = lineItems[subKey] || [];
                    const orderedSubRows = [...subRows];
                    const subTotals = computeTotals({ config: { ...sub, fields: sub.fields || [] }, rows: orderedSubRows }, language);
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

                    const renderSubAddButton = () => {
                      if (isSubOverlayAddMode && sub.anchorFieldId) {
                        return (
                          <button
                            type="button"
                            style={buttonStyles.secondary}
                            disabled={submitting || subSelectorIsMissing}
                            onClick={async () => {
                              const subSelectorNow = (latestSubgroupSelectorValueRef.current[subKey] || subSelectorValue || '')
                                .toString()
                                .trim();
                              if (submitting) return;
                              if (subSelectorIsMissing) {
                                onDiagnostic?.('ui.addRow.blocked', { groupId: subKey, reason: 'sectionSelector.required', selectorId: subSelectorCfg?.id });
                                return;
                              }
                              const anchorField = (sub.fields || []).find(f => f.id === sub.anchorFieldId);
                              if (!anchorField || anchorField.type !== 'CHOICE') {
                                addLineItemRowManual(subKey);
                                return;
                              }
                              const key = optionKey(anchorField.id, subKey);
                              let opts = optionState[key];
                              if (!opts && anchorField.dataSource) {
                                const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                                if (loaded) {
                                  opts = loaded;
                                  setOptionState(prev => ({ ...prev, [key]: loaded }));
                                }
                              }
                              if (!opts) {
                                opts = {
                                  en: anchorField.options || [],
                                  fr: (anchorField as any).optionsFr || [],
                                  nl: (anchorField as any).optionsNl || [],
                                  raw: (anchorField as any).optionsRaw
                                };
                              }
                              const dependencyIds = (
                                Array.isArray(anchorField.optionFilter?.dependsOn)
                                  ? anchorField.optionFilter?.dependsOn
                                  : [anchorField.optionFilter?.dependsOn || '']
                              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                              const depVals = dependencyIds.map(dep =>
                                toDependencyValue(row.values[dep] ?? values[dep] ?? subSelectorNow)
                              );
                              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                              const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
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
                            {resolveLocalizedString(
                              sub.addButtonLabel,
                              language,
                              tSystem('lineItems.addLines', language, 'Add lines')
                            )}
                          </button>
                        );
                      }
                      if (canUseSubSelectorOverlay) {
                        return null;
                      }
                      return (
                        <button
                          type="button"
                          disabled={submitting || subSelectorIsMissing}
                          onClick={async () => {
                            const subSelectorNow = (latestSubgroupSelectorValueRef.current[subKey] || subSelectorValue || '')
                              .toString()
                              .trim();
                            const anchorFieldId =
                              (sub as any)?.anchorFieldId !== undefined && (sub as any)?.anchorFieldId !== null
                                ? (sub as any).anchorFieldId.toString()
                                : '';
                            const selectorPreset =
                              anchorFieldId && subSelectorNow
                                ? { [anchorFieldId]: subSelectorNow }
                                : undefined;
                            if (selectorPreset) {
                              addLineItemRowManual(subKey, selectorPreset);
                              return;
                            }
                            const anchorField = anchorFieldId ? (sub.fields || []).find(f => f.id === anchorFieldId) : undefined;
                            if (!anchorField || anchorField.type !== 'CHOICE') {
                              addLineItemRowManual(subKey);
                              return;
                            }
                            const key = optionKey(anchorField.id, subKey);
                            let opts = optionState[key];
                            if (!opts && anchorField.dataSource) {
                              const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                              if (loaded) {
                                opts = loaded;
                                setOptionState(prev => ({ ...prev, [key]: loaded }));
                              }
                            }
                            if (!opts) {
                              opts = {
                                en: anchorField.options || [],
                                fr: (anchorField as any).optionsFr || [],
                                nl: (anchorField as any).optionsNl || [],
                                raw: (anchorField as any).optionsRaw
                              };
                            }
                            const dependencyIds = (
                              Array.isArray(anchorField.optionFilter?.dependsOn)
                                ? anchorField.optionFilter?.dependsOn
                                : [anchorField.optionFilter?.dependsOn || '']
                            ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                            const depVals = dependencyIds.map(dep =>
                              toDependencyValue(row.values[dep] ?? values[dep] ?? subSelectorNow)
                            );
                            const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                            const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                            const uniqueVals = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                            if (uniqueVals.length === 1) {
                              onDiagnostic?.('ui.subgroup.addRow.autofillSingleOption', {
                                groupId: subKey,
                                anchorFieldId: anchorField.id,
                                value: uniqueVals[0]
                              });
                              addLineItemRowManual(subKey, { [anchorField.id]: uniqueVals[0] });
                              return;
                            }
                            addLineItemRowManual(subKey);
                          }}
                          style={withDisabled(buttonStyles.secondary, submitting || subSelectorIsMissing)}
                        >
                          <PlusIcon />
                          {resolveLocalizedString(sub.addButtonLabel, language, 'Add line')}
                        </button>
                      );
                    };
                    const subUi = (sub as any).ui as any;
                    const subCount = orderedSubRows.length;
                    const subUiMode = (subUi?.mode || 'default').toString().trim().toLowerCase();
                    const isSubTableMode = subUiMode === 'table';
                    const subAnchorFieldId =
                      sub.anchorFieldId !== undefined && sub.anchorFieldId !== null ? sub.anchorFieldId.toString() : '';
                    const subHideUntilAnchor = (subUi as any)?.tableHideUntilAnchor !== false;
                    const subGroupDef: WebQuestionDefinition = {
                      ...(q as any),
                      id: subKey,
                      lineItemConfig: { ...(sub as any), fields: sub.fields || [], subGroups: [] }
                    };
                    const targetGroup = subGroupDef;
                    const scrollSubgroupBottom = () => {
                      const el = subgroupBottomRefs.current[subKey];
                      if (!el) return;
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                      });
                    };
                    return (
                      <div key={subKey} className="card" style={{ marginTop: 12, background: 'var(--card)' }}>
                        <div
                          className="subgroup-header"
                          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                        >
                          <div style={{ textAlign: 'center', fontWeight: 600 }}>
                            {subLabelResolved || subId}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                              {(() => {
                                const subUi = (sub as any).ui as any;
                                const placement = (subUi?.addButtonPlacement || 'both').toString().toLowerCase();
                                const showTop = placement !== 'hidden' && (placement === 'both' || placement === 'top');
                                return (
                                  <>
                                    {subSelectorCfg && showTop ? (
                                      <div
                                        className="section-selector"
                                        data-field-path={subSelectorCfg.id}
                                        style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
                                      >
                                        <label style={{ fontWeight: 600 }}>
                                          {resolveSelectorLabel(subSelectorCfg, language)}
                                          {subSelectorCfg.required && <RequiredStar />}
                                        </label>
                                        {useSubSelectorSearch ? (
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
                                            onDiagnostic={(event, payload) =>
                                              onDiagnostic?.(event, { scope: 'subgroup.selector', fieldId: subSelectorCfg.id, subKey, ...(payload || {}) })
                                            }
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
                                            <option value="">
                                              {tSystem('common.selectPlaceholder', language, 'Select…')}
                                            </option>
                                            {subSelectorOptions.map(opt => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    ) : null}
                                    {showTop ? renderSubAddButton() : null}
                                  </>
                                );
                              })()}
                            </div>
                            <div style={{ marginLeft: 'auto' }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedSubgroups(prev => ({
                                    ...prev,
                                    [subKey]: !(prev[subKey] ?? true)
                                  }))
                                }
                                aria-expanded={!collapsed}
                                aria-controls={`${subKey}-body`}
                                style={buttonStyles.secondary}
                              >
                                {collapsed
                                  ? resolveLocalizedString({ en: 'Show', fr: 'Afficher', nl: 'Tonen' }, language, 'Show')
                                  : resolveLocalizedString({ en: 'Hide', fr: 'Masquer', nl: 'Verbergen' }, language, 'Hide')}
                              </button>
                            </div>
                          </div>
                        </div>
                        {collapsed ? null : (
                        <div id={`${subKey}-body`}>
                        <div style={{ marginTop: 8 }}>
                        {isSubTableMode ? (
                          <div className="ck-line-item-table__scroll">
                            <LineItemTable
                              columns={[
                                ...((() => {
                                  const subColumnWidths = (subUi as any)?.tableColumnWidths;
                                  const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined => {
                                    if (!subColumnWidths || typeof subColumnWidths !== 'object' || Array.isArray(subColumnWidths)) return undefined;
                                    const widthCandidates =
                                      columnId === '__remove'
                                        ? [columnId, 'remove', '__actions', 'actions']
                                        : [columnId, columnId.toLowerCase()];
                                    const rawWidth = widthCandidates.reduce<any>(
                                      (acc, key) => (acc !== undefined ? acc : (subColumnWidths as any)[key]),
                                      undefined
                                    );
                                    if (rawWidth === undefined || rawWidth === null) return undefined;
                                    if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
                                    const widthValue = rawWidth.toString().trim();
                                    return widthValue ? { width: widthValue } : undefined;
                                  };

                                  const subColumnIdsRaw = Array.isArray((subUi as any)?.tableColumns)
                                    ? (subUi as any).tableColumns
                                    : [];
                                  const subColumnIds = subColumnIdsRaw
                                    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
                                    .filter(Boolean);
                                  const subFields = (sub.fields || []) as any[];
                                  const visibleFields = (subColumnIds.length ? subColumnIds : subFields.map(f => f.id))
                                    .map((fid: string) => subFields.find(f => f.id === fid))
                                    .filter(Boolean) as any[];

                                  const renderSubTableField = (field: any, subRow: any) => {
                                    const groupCtx: VisibilityContext = {
                                      getValue: fid => values[fid],
                                      getLineValue: (_rowId, fid) => subRow.values[fid],
                                      getLineItems: groupId => lineItems?.[groupId] || [],
                                      getLineItemKeys: () => Object.keys(lineItems || {})
                                    };
                                    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: subRow.id, linePrefix: subKey });
                                    if (hideField) return <span className="muted">—</span>;

                                    const anchorValue = subAnchorFieldId ? subRow.values[subAnchorFieldId] : undefined;
                                    if (subHideUntilAnchor && subAnchorFieldId && field.id !== subAnchorFieldId && isEmptyValue(anchorValue as any)) {
                                      return <span className="muted">—</span>;
                                    }

                                    ensureLineOptions(subKey, field);
                                    const optionSetField: OptionSet =
                                      optionState[optionKey(field.id, subKey)] || {
                                        en: field.options || [],
                                        fr: (field as any).optionsFr || [],
                                        nl: (field as any).optionsNl || [],
                                        raw: (field as any).optionsRaw
                                      };
                                    const dependencyIds = (
                                      Array.isArray(field.optionFilter?.dependsOn)
                                        ? field.optionFilter?.dependsOn
                                        : [field.optionFilter?.dependsOn || '']
                                    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                    const allowedField = computeAllowedOptions(
                                      field.optionFilter,
                                      optionSetField,
                                      dependencyIds.map((dep: string) => toDependencyValue(subRow.values[dep] ?? row.values[dep] ?? values[dep]))
                                    );

                                    const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                                    const renderAsLabel =
                                      (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;
                                    const renderErrors = () => (
                                      <>
                                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                        {renderWarnings(fieldPath)}
                                      </>
                                    );

                                    if (field.type === 'CHOICE') {
                                      const rawVal = subRow.values[field.id];
                                      const choiceVal = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                      const allowedWithCurrent =
                                        choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                                          ? [...allowedField, choiceVal]
                                          : allowedField;
                                      const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language, {
                                        sort: optionSortFor(field)
                                      });
                                      if (renderAsLabel) {
                                        const selected = optsField.find(opt => opt.value === choiceVal);
                                        return (
                                          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
                                            {selected?.label || choiceVal || '—'}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                          {renderChoiceControl({
                                            fieldPath,
                                            value: choiceVal || '',
                                            options: optsField,
                                            required: !!field.required,
                                            searchEnabled: (field as any)?.ui?.choiceSearchEnabled ?? (subUi as any)?.choiceSearchEnabled,
                                            override: (field as any)?.ui?.control,
                                            disabled: submitting || (field as any)?.readOnly === true,
                                            onChange: next => handleLineFieldChange(targetGroup, subRow.id, field, next)
                                          })}
                                          {renderErrors()}
                                        </div>
                                      );
                                    }

                                    if (field.type === 'CHECKBOX') {
                                      const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                      const allowedWithSelected = selected.reduce((acc, val) => {
                                        if (val && !acc.includes(val)) acc.push(val);
                                        return acc;
                                      }, [...allowedField]);
                                      const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                                      if (renderAsLabel) {
                                        const labels = selected
                                          .map(val => optsField.find(opt => opt.value === val)?.label || val)
                                          .filter(Boolean);
                                        return (
                                          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
                                            {labels.length ? labels.join(', ') : '—'}
                                          </div>
                                        );
                                      }
                                      const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                                      const renderAsMultiSelect = controlOverride === 'select';
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
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
                                                handleLineFieldChange(targetGroup, subRow.id, field, next);
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
                                                      handleLineFieldChange(targetGroup, subRow.id, field, next);
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
                                      const items = toUploadItems(subRow.values[field.id]);
                                      const count = items.length;
                                      const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                      const helperText = helperCfg.text;
                                      const helperNode = helperText ? <div className="ck-field-helper">{helperText}</div> : null;
                                      if (renderAsLabel) {
                                        return (
                                          <div className="ck-line-item-table__value" data-field-path={fieldPath}>
                                            {count ? `${count}` : '—'}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (submitting) return;
                                              openFileOverlay({
                                                scope: 'line',
                                                title: resolveFieldLabel(field, language, field.id),
                                                group: q,
                                                rowId: subRow.id,
                                                field,
                                                fieldPath
                                              });
                                            }}
                                            style={buttonStyles.secondary}
                                            disabled={submitting}
                            >
                              {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
                            </button>
                            {helperNode}
                            {renderErrors()}
                          </div>
                      );
                    }

                                    const mapped = field.valueMap
                                      ? resolveValueMapValue(field.valueMap, fid => {
                                          if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                          return values[fid];
                                        }, { language, targetOptions: toOptionSet(field) })
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
                                        <div className="ck-line-item-table__value" data-field-path={fieldPath}>
                                          {display || '—'}
                                        </div>
                                      );
                                    }
                                    const isEditableField =
                                      !submitting &&
                                      (field as any)?.readOnly !== true &&
                                      (field as any)?.ui?.renderAsLabel !== true &&
                                      (field as any)?.renderAsLabel !== true &&
                                      !!(field as any)?.valueMap === false;
                                    if (field.type === 'NUMBER') {
                                      const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                      const placeholder =
                                        helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField
                                          ? helperCfg.text
                                          : undefined;
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                          <NumberStepper
                                            value={numberText}
                                            disabled={submitting}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            placeholder={placeholder}
                                            onInvalidInput={
                                              isEditableField
                                                ? ({ reason, value }) => {
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
                                                    onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                                                  }
                                                : undefined
                                            }
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                          {renderErrors()}
                                        </div>
                                      );
                                    }
                                    if (field.type === 'PARAGRAPH') {
                                      const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                      const placeholder =
                                        helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField
                                          ? helperCfg.text
                                          : undefined;
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                          <textarea
                                            className="ck-paragraph-input"
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            rows={(field as any)?.ui?.paragraphRows || 3}
                                            placeholder={placeholder}
                                          />
                                          {renderErrors()}
                                        </div>
                                      );
                                    }
                                    if (field.type === 'DATE') {
                                      return (
                                        <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                          <DateInput
                                            value={fieldValue}
                                            language={language}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                          {renderErrors()}
                                        </div>
                                      );
                                    }
                                    const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                    const placeholder =
                                      helperCfg.text && helperCfg.placement === 'placeholder' && isEditableField ? helperCfg.text : undefined;
                                    return (
                                      <div className="ck-line-item-table__control" data-field-path={fieldPath}>
                                        <input
                                          type="text"
                                          value={fieldValue}
                                          onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                          readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                          placeholder={placeholder}
                                        />
                                        {renderErrors()}
                                      </div>
                                    );
                                  };

                                  return [
                                    ...visibleFields.map(field => ({
                                      id: field.id,
                                      label: (() => {
                                        const labelText = resolveFieldLabel(field, language, field.id);
                                        const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                        const isEditableField =
                                          !submitting &&
                                          (field as any)?.readOnly !== true &&
                                          (field as any)?.ui?.renderAsLabel !== true &&
                                          (field as any)?.renderAsLabel !== true &&
                                          !!(field as any)?.valueMap === false;
                                        if (!helperCfg.text || helperCfg.placement !== 'belowLabel' || !isEditableField) return labelText;
                                        return (
                                          <div className="ck-line-item-table__header-wrap">
                                            <div>{labelText}</div>
                                            <div className="ck-line-item-table__header-helper">{helperCfg.text}</div>
                                          </div>
                                        );
                                      })(),
                                      style: resolveSubColumnStyle(field.id),
                                      renderCell: (subRow: any) => renderSubTableField(field, subRow)
                                    })),
                                    {
                                      id: '__remove',
                                      label: <span style={srOnly}>{tSystem('lineItems.remove', language, 'Remove')}</span>,
                                      className: 'ck-line-item-table__actions',
                                      style: resolveSubColumnStyle('__remove'),
                                      renderCell: (subRow: any) => {
                                        const subRowSource = parseRowSource((subRow.values as any)?.[ROW_SOURCE_KEY]);
                                        const subHideRemoveButton = parseRowHideRemove((subRow.values as any)?.[ROW_HIDE_REMOVE_KEY]);
                                        const allowRemoveAutoSubRows = (sub as any)?.ui?.allowRemoveAutoRows !== false;
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
                                  ];
                                })())
                              ]}
                              rows={orderedSubRows}
                              emptyText={tSystem('lineItems.noOptionsAvailable', language, 'No options available.')}
                              rowClassName={(_row, idx) => (idx % 2 === 0 ? 'ck-line-item-table__row--even' : 'ck-line-item-table__row--odd')}
                            />
                          </div>
                        ) : (
                        orderedSubRows.map((subRow, subIdx) => {
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
                          return (
                            <div
                              key={subRow.id}
                              className="line-item-row"
                              data-row-anchor={`${subKey}__${subRow.id}`}
                              style={{
                                background: 'transparent',
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                marginBottom: 10
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
                                const renderSubField = (field: any, opts?: { inGrid?: boolean }) => {
                                ensureLineOptions(subKey, field);
                                const optionSetField: OptionSet =
                                  optionState[optionKey(field.id, subKey)] || {
                                    en: field.options || [],
                                    fr: (field as any).optionsFr || [],
                                    nl: (field as any).optionsNl || [],
                                    raw: (field as any).optionsRaw
                                  };
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
                                    return toDependencyValue(
                                      subRow.values[dep] ?? values[dep] ?? row.values[dep] ?? selectorFallback
                                    );
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
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelection, language, { sort: optionSortFor(field) });
                                const hideField = shouldHideField(field.visibility, subCtx, {
                                  rowId: subRow.id,
                                  linePrefix: subKey
                                });
                                if (hideField) return null;
                                  const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                                  const hideLabel = Boolean((field as any)?.ui?.hideLabel);
                                  const inGrid = opts?.inGrid === true;
                                  const labelStyle = hideLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
                                  const renderAsLabel =
                                    (field as any)?.ui?.renderAsLabel === true || (field as any)?.renderAsLabel === true || (field as any)?.readOnly === true;

                                  const renderReadOnlyLine = (display: React.ReactNode) => {
                                    const cls = `${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                      (field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''
                                    } ck-readonly-field`;
                                    return (
                                      <div
                                        key={field.id}
                                        className={cls}
                                        data-field-path={fieldPath}
                                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                                      >
                                        <label style={labelStyle}>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                                        <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
                                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                        {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  };

                                  if (renderAsLabel) {
                                    switch (field.type) {
                                      case 'CHOICE': {
                                        const rawVal = subRow.values[field.id];
                                        const choiceVal =
                                          Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                        const selected = optsField.find(opt => opt.value === choiceVal);
                                        const display = selected?.label || choiceVal || null;
                                        return renderReadOnlyLine(display);
                                      }
                                      case 'CHECKBOX': {
                                        const hasAnyOption =
                                          !!((optionSetField.en && optionSetField.en.length) ||
                                            ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                                            ((optionSetField as any).nl && (optionSetField as any).nl.length));
                                        const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                                        if (isConsentCheckbox) {
                                          const display = subRow.values[field.id]
                                            ? tSystem('common.yes', language, 'Yes')
                                            : tSystem('common.no', language, 'No');
                                          return renderReadOnlyLine(display);
                                        }
                                        const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                        const labels = selected
                                          .map(val => optsField.find(opt => opt.value === val)?.label || val)
                                          .filter(Boolean);
                                        const display = labels.length ? labels.join(', ') : null;
                                        return renderReadOnlyLine(display);
                                      }
                                      case 'FILE_UPLOAD': {
                                        const items = toUploadItems(subRow.values[field.id] as any);
                                        const displayContent = items.length
                                          ? items.map((item: any, idx: number) => (
                                              <div key={`${field.id}-file-${idx}`} className="ck-readonly-file">
                                                {describeUploadItem(item as any)}
                                              </div>
                                            ))
                                          : null;
                                        const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
                                        return renderReadOnlyLine(displayNode);
                                      }
                                      default: {
                                        const mapped = field.valueMap
                                          ? resolveValueMapValue(field.valueMap, (fid: string) => {
                                              if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                              if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                              return values[fid];
                                            }, { language, targetOptions: toOptionSet(field) })
                                          : undefined;
                                        const fieldValueRaw = field.valueMap ? mapped : ((subRow.values[field.id] as any) ?? '');
                                        const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                                        const numberText =
                                          field.type === 'NUMBER'
                                            ? fieldValue === undefined || fieldValue === null
                                              ? ''
                                              : (fieldValue as any).toString()
                                            : '';
                                        const display =
                                          field.type === 'NUMBER'
                                            ? numberText
                                            : field.type === 'DATE'
                                              ? fieldValue
                                              : fieldValue;
                                        return renderReadOnlyLine(display || null);
                                      }
                                    }
                                  }

                                switch (field.type) {
                                  case 'CHOICE': {
                                    const rawVal = subRow.values[field.id];
                                    const choiceVal =
                                        Array.isArray(rawVal) && rawVal.length
                                          ? (rawVal as string[])[0]
                                          : (rawVal as string);
                                    return (
                                        <div
                                          key={field.id}
                                          className={`field inline-field${(field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
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
                                            searchEnabled:
                                              (field as any)?.ui?.choiceSearchEnabled ??
                                              (((targetGroup as any)?.lineItemConfig?.ui as any)?.choiceSearchEnabled),
                                            override: (field as any)?.ui?.control,
                                            disabled: submitting || (field as any)?.readOnly === true,
                                            onChange: next => handleLineFieldChange(targetGroup, subRow.id, field, next)
                                          })}
                                        {(() => {
                                          const selected = optsField.find(opt => opt.value === choiceVal);
                                          if (!selected?.tooltip) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                          const tooltipLabel = resolveLocalizedString(
                                            field.dataSource?.tooltipLabel,
                                            language,
                                            fallbackLabel
                                          );
                                            return (
                                              <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                            );
                                        })()}
                                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                          {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  }
                                  case 'CHECKBOX': {
                                      const hasAnyOption =
                                        !!((optionSetField.en && optionSetField.en.length) ||
                                          ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                                          ((optionSetField as any).nl && (optionSetField as any).nl.length));
                                      const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                                      const selected = Array.isArray(subRow.values[field.id])
                                        ? (subRow.values[field.id] as string[])
                                        : [];
                                    return (
                                        <div
                                          key={field.id}
                                          className={`field inline-field${(field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                                          data-field-path={fieldPath}
                                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                                        >
                                        <label style={labelStyle}>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                                          {isConsentCheckbox ? (
                                            <div className="ck-choice-control ck-consent-control">
                                              <label className="ck-consent">
                                                <input
                                                  type="checkbox"
                                                  checked={!!subRow.values[field.id]}
                                                  disabled={submitting || (field as any)?.readOnly === true}
                                                  onChange={e => {
                                                    if (submitting || (field as any)?.readOnly === true) return;
                                                    handleLineFieldChange(targetGroup, subRow.id, field, e.target.checked);
                                                  }}
                                                />
                                              </label>
                                            </div>
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
                                                  const next = e.target.checked
                                                    ? [...selected, opt.value]
                                                    : selected.filter(v => v !== opt.value);
                                                  handleLineFieldChange(targetGroup, subRow.id, field, next);
                                                }}
                                              />
                                              <span>{opt.label}</span>
                                            </label>
                                          ))}
                                        </div>
                                          )}
                                        {(() => {
                                          const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                                          if (!withTooltips.length) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                          const tooltipLabel = resolveLocalizedString(
                                            field.dataSource?.tooltipLabel,
                                            language,
                                            fallbackLabel
                                          );
                                          return (
                                            <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                              {withTooltips.map(opt => (
                                                  <span
                                                    key={opt.value}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
                                        </div>
                                      );
                                    }
                                    case 'FILE_UPLOAD': {
                                      const items = toUploadItems(subRow.values[field.id] as any);
                                      const uploadConfig = (field as any).uploadConfig || {};
                                      const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
                                      const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
                                        size?: number;
                                        style?: React.CSSProperties;
                                        className?: string;
                                      }>;
                                      const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
                                      const maxFiles = uploadConfig.maxFiles && uploadConfig.maxFiles > 0 ? uploadConfig.maxFiles : undefined;
                                      const denom = maxFiles ?? (minRequired > 0 ? minRequired : undefined);
                                      const displayCount = denom ? Math.min(items.length, denom) : items.length;
                                      const maxed = maxFiles ? items.length >= maxFiles : false;
                                      const isComplete = minRequired > 0 ? items.length >= minRequired : items.length > 0;
                                      const isEmpty = items.length === 0;
                                      const missing = minRequired > 0 ? Math.max(0, minRequired - items.length) : 0;
                                      const pillClass = isComplete ? 'ck-progress-good' : isEmpty ? 'ck-progress-neutral' : 'ck-progress-info';
                                      const pillText = denom ? `${displayCount}/${denom}` : `${items.length}`;
                                      const showMissingHelper = items.length > 0 && missing > 0 && !maxed;
                                      const readOnly = (field as any)?.readOnly === true;
                                      const hasFiles = items.length > 0;
                                      const viewMode = readOnly || maxed || hasFiles;
                                      const LeftIcon = viewMode ? EyeIcon : SlotIcon;
                                      const leftLabel = viewMode
                                        ? tSystem('files.view', language, 'View photos')
                                        : tSystem('files.add', language, 'Add photo');
                                      const cameraStyleBase = viewMode
                                        ? buttonStyles.secondary
                                        : isEmpty
                                          ? buttonStyles.primary
                                          : buttonStyles.secondary;
                                      const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                                        ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
                                      );
                                      const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
                                        .map((v: any) => (v !== undefined && v !== null ? v.toString().trim() : ''))
                                        .filter(Boolean);
                                      const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
                                      return (
                                        <div
                                          key={field.id}
                                          className={`field inline-field${(field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''}`}
                                          data-field-path={fieldPath}
                                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                                        >
                                          <label style={labelStyle}>
                                            {resolveFieldLabel(field, language, field.id)}
                                            {field.required && <RequiredStar />}
                                          </label>
                                          <div className="ck-upload-row">
                                            <button
                                              type="button"
                                              className="ck-upload-camera-btn"
                                              disabled={submitting}
                                              style={withDisabled(cameraStyleBase, submitting)}
                                              aria-label={leftLabel}
                                              title={leftLabel}
                                              onClick={() => {
                                                if (submitting) return;
                                                if (viewMode) {
                                                  onDiagnostic?.('upload.view.click', { scope: 'line', fieldPath, currentCount: items.length });
                                                  openFileOverlay({
                                                    scope: 'line',
                                                    title: resolveFieldLabel(field, language, field.id),
                                                    group: targetGroup,
                                                    rowId: subRow.id,
                                                    field,
                                                    fieldPath
                                                  });
                                                  return;
                                                }
                                                if (readOnly) return;
                                                onDiagnostic?.('upload.add.click', { scope: 'line', fieldPath, currentCount: items.length });
                                                fileInputsRef.current[fieldPath]?.click();
                                              }}
                                            >
                                              <LeftIcon style={{ width: '62%', height: '62%' }} />
                                            </button>
                                            <button
                                              type="button"
                                              className={`ck-progress-pill ck-upload-pill-btn ${pillClass}`}
                                              aria-disabled={submitting ? 'true' : undefined}
                                              aria-label={`${tSystem(
                                                'files.open',
                                                language,
                                                tSystem('common.open', language, 'Open')
                                              )} ${tSystem('files.title', language, 'Photos')} ${pillText}`}
                                              onClick={() => {
                                                if (submitting) return;
                                                openFileOverlay({
                                                  scope: 'line',
                                                  title: resolveFieldLabel(field, language, field.id),
                                                  group: targetGroup,
                                                  rowId: subRow.id,
                                                  field,
                                                  fieldPath
                                                });
                                              }}
                                            >
                                              {isComplete ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
                                              <span>{pillText}</span>
                                              <span className="ck-progress-label">
                                                {tSystem('files.open', language, tSystem('common.open', language, 'Open'))}
                                              </span>
                                              <span className="ck-progress-caret">▸</span>
                                            </button>
                                            {maxed ? (
                                              <div className="ck-upload-helper muted">{tSystem('files.maxReached', language, 'Required photos added.')}</div>
                                            ) : showMissingHelper ? (
                                              <div className="ck-upload-helper muted" aria-live="polite">
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                  <SlotIcon style={{ width: '1.05em', height: '1.05em' }} />
                                                  {tSystem('common.more', language, '+{count} more', { count: missing })}
                                                </span>
                                              </div>
                                            ) : null}
                                          </div>
                                          <div style={srOnly} aria-live="polite">
                                            {uploadAnnouncements[fieldPath] || ''}
                                          </div>
                                          <input
                                            ref={el => {
                                              fileInputsRef.current[fieldPath] = el;
                                            }}
                                            type="file"
                                            multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                                            accept={acceptAttr}
                                            style={{ display: 'none' }}
                                            onChange={e =>
                                              handleLineFileInputChange({
                                                group: targetGroup,
                                                rowId: subRow.id,
                                                field,
                                                fieldPath,
                                                list: e.target.files
                                              })
                                            }
                                          />
                                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                          {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  }
                                  default: {
                                    const mapped = field.valueMap
                                      ? resolveValueMapValue(field.valueMap, fid => {
                                          if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                          if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                          return values[fid];
                                        }, { language, targetOptions: toOptionSet(field) })
                                      : undefined;
                                      const fieldValueRaw = field.valueMap ? mapped : ((subRow.values[field.id] as any) ?? '');
                                      const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                                      const numberText =
                                        field.type === 'NUMBER'
                                          ? fieldValue === undefined || fieldValue === null
                                            ? ''
                                            : (fieldValue as any).toString()
                                          : '';
                                      const helperCfg = resolveFieldHelperText({ ui: (field as any)?.ui, language });
                                      const helperText = helperCfg.text;
                                      const supportsPlaceholder =
                                        field.type === 'TEXT' || field.type === 'PARAGRAPH' || field.type === 'NUMBER';
                                      const effectivePlacement =
                                        helperCfg.placement === 'placeholder' && supportsPlaceholder ? 'placeholder' : 'belowLabel';
                                      const isEditableField =
                                        !submitting &&
                                        (field as any)?.readOnly !== true &&
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
                                    return (
                                        <div
                                          key={field.id}
                                          className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                            (field as any)?.ui?.labelLayout === 'stacked' ? ' ck-label-stacked' : ''
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
                                            disabled={submitting}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            ariaDescribedBy={helperId}
                                            placeholder={placeholder}
                                            onInvalidInput={
                                              isEditableField
                                                ? ({ reason, value }) => {
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
                                                    onDiagnostic?.('field.number.invalidInput', { scope: 'line', fieldPath, reason, value });
                                                  }
                                                : undefined
                                            }
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                        ) : field.type === 'PARAGRAPH' ? (
                                          <textarea
                                            className="ck-paragraph-input"
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            rows={(field as any)?.ui?.paragraphRows || 4}
                                            placeholder={placeholder}
                                            aria-describedby={helperId}
                                          />
                                        ) : field.type === 'DATE' ? (
                                          <DateInput
                                            value={fieldValue}
                                            language={language}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            ariaDescribedBy={helperId}
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                        ) : (
                                          <input
                                            type={field.type === 'DATE' ? 'date' : 'text'}
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            placeholder={placeholder}
                                            aria-describedby={helperId}
                                          />
                                        )}
                                        {helperNode}
                                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                          {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  }
                                }
                                };

                                const visibleFields = (sub.fields || []).filter(field => {
                                  const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                                  return !hideField;
                                });

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
                                  <button
                                    type="button"
                                    className="ck-line-item-table__remove-button"
                                    onClick={() => removeLineRow(subKey, subRow.id)}
                                    aria-label={tSystem('lineItems.remove', language, 'Remove')}
                                    title={tSystem('lineItems.remove', language, 'Remove')}
                                  >
                                    <TrashIcon size={40} />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        }))} 
                        {(() => {
                          const subUi = (sub as any).ui as any;
                          const placement = (subUi?.addButtonPlacement || 'both').toString().toLowerCase();
                          const showBottom = placement !== 'hidden' && (placement === 'both' || placement === 'bottom');
                          const shouldRender = orderedSubRows.length > 0 || showBottom;
                          if (!shouldRender) return null;
                          return (
                        <div
                            ref={el => {
                              subgroupBottomRefs.current[subKey] = el;
                            }}
                            className="line-item-toolbar"
                            style={{ marginTop: 12 }}
                          >
                            <div
                              className="line-item-toolbar-actions"
                              style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'flex-end',
                                flex: 1,
                                flexWrap: 'wrap',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                              {subSelectorCfg && showBottom && (canUseSubSelectorOverlay ? subSelectorOverlayOptions.length : subSelectorOptions.length) ? (
                                  <div
                                    className="section-selector"
                                    data-field-path={subSelectorCfg.id}
                                    style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
                                  >
                                    <label>
                                      {resolveSelectorLabel(subSelectorCfg, language)}
                                      {subSelectorCfg.required && <RequiredStar />}
                                    </label>
                                    {canUseSubSelectorOverlay ? (
                                      <LineItemMultiAddSelect
                                        label={resolveSelectorLabel(subSelectorCfg, language)}
                                        language={language}
                                        options={subSelectorOverlayOptions}
                                        disabled={submitting}
                                        placeholder={
                                          resolveSelectorPlaceholder(subSelectorCfg, language) ||
                                          tSystem('lineItems.selectLinesSearch', language, 'Search items')
                                        }
                                        helperText={resolveSelectorHelperText(subSelectorCfg, language) || undefined}
                                        emptyText={tSystem('common.noMatches', language, 'No matches.')}
                                        onDiagnostic={(event, payload) =>
                                          onDiagnostic?.(event, {
                                            scope: 'subgroup.selectorOverlay',
                                            fieldId: subSelectorCfg.id,
                                            subKey,
                                            ...(payload || {})
                                          })
                                        }
                                        onAddSelected={valuesToAdd => {
                                          if (submitting) return;
                                          if (!subSelectorOverlayAnchorFieldId) return;
                                          const deduped = Array.from(new Set(valuesToAdd.filter(Boolean)));
                                          if (!deduped.length) return;
                                          deduped.forEach(val => addLineItemRowManual(subKey, { [subSelectorOverlayAnchorFieldId]: val }));
                                        }}
                                      />
                                    ) : useSubSelectorSearch ? (
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
                                        onDiagnostic={(event, payload) =>
                                          onDiagnostic?.(event, { scope: 'subgroup.selector', fieldId: subSelectorCfg.id, subKey, ...(payload || {}) })
                                        }
                                        onChange={nextValue => {
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
                                {showBottom ? renderSubAddButton() : null}
                                {subTotals.length ? (
                                  <div className="line-item-totals">
                                    {subTotals.map(t => (
                                      <span key={t.key} className="pill">
                                        {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ marginLeft: 'auto'}}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedSubgroups(prev => ({
                                      ...prev,
                                      [subKey]: !(prev[subKey] ?? true)
                                    }))
                                  }
                                  style={buttonStyles.secondary}
                                  aria-expanded={!collapsed}
                                  aria-controls={`${subKey}-body`}
                                >
                                  {collapsed
                                    ? resolveLocalizedString({ en: 'Show', fr: 'Afficher', nl: 'Tonen' }, language, 'Show')
                                    : resolveLocalizedString({ en: 'Hide', fr: 'Masquer', nl: 'Verbergen' }, language, 'Hide')}
                                </button>
                              </div>
                            </div>
                        </div>
                          );
                        })()}
                        </div>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {rowFlowEnabled && defaultActionScope === 'group' ? renderGroupOutputActions() : null}
            {shouldRenderBottomToolbar ? (
              <div className="line-item-toolbar">
                {showSelectorBottom && selectorCfg ? (
                  <div
                    className="section-selector"
                    data-field-path={selectorCfg.id}
                    style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label style={{ fontWeight: 600 }}>
                      {resolveSelectorLabel(selectorCfg, language)}
                      {selectorCfg.required && <RequiredStar />}
                    </label>
                    {useSelectorSearch ? (
                      <SearchableSelect
                        value={selectorValue || ''}
                        disabled={submitting}
                        placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
                        emptyText={tSystem('common.noMatches', language, 'No matches.')}
                        options={selectorOptions.map(opt => ({ value: opt.value, label: opt.label, searchText: opt.searchText }))}
                        onDiagnostic={(event, payload) => onDiagnostic?.(event, { scope: 'lineItems.selector', fieldId: selectorCfg.id, ...(payload || {}) })}
                        onChange={nextValue => {
                          setValues(prev => {
                            if (prev[selectorCfg.id] === nextValue) return prev;
                            return { ...prev, [selectorCfg.id]: nextValue };
                          });
                        }}
                      />
                    ) : (
                      <select
                        value={selectorValue}
                        onChange={e => {
                          const nextValue = e.target.value;
                          setValues(prev => {
                            if (prev[selectorCfg.id] === nextValue) return prev;
                            return { ...prev, [selectorCfg.id]: nextValue };
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
                <div className="line-item-toolbar-actions">
                  {showAddBottom ? renderAddButton() : null}
                  {groupTotals.length ? (
                    <div className="line-item-totals">
                      {groupTotals.map(t => (
                        <span key={t.key} className="pill">
                          {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
};
