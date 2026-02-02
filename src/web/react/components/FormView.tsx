import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
  matchesWhen,
  computeTotals,
  loadOptionsFromDataSource,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../core';
import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';
import {
  FieldValue,
  LangCode,
  LineItemDedupRule,
  LineItemRowState,
  LocalizedString,
  OptionSet,
  QuestionGroupConfig,
  RowFlowConfig,
  RowFlowOutputSegmentConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import type {
  LineItemFieldConfig,
  LineItemGroupConfigOverride,
  LineItemOverlayOpenActionConfig,
  RowFlowActionConfirmConfig
} from '../../../types';
import { ConfirmDialogOverlay } from '../features/overlays/ConfirmDialogOverlay';
import { useConfirmDialog } from '../features/overlays/useConfirmDialog';
import type { ConfirmDialogOpenArgs } from '../features/overlays/useConfirmDialog';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { resolveStatusPillKey } from '../utils/statusPill';
import { FormErrors, LineItemAddResult, LineItemState, OptionState } from '../types';
import { isEmptyValue } from '../utils/values';
import {
  applyUploadConstraints,
  clearLineItemGroupErrors,
  describeUploadItem,
  formatOptionFilterNonMatchWarning,
  getUploadMinRequired,
  isUploadValueComplete,
  resolveRowDisclaimerText,
  toDateInputValue,
  toUploadItems
} from './form/utils';
import {
  buttonStyles,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  PaperclipIcon,
  PlusIcon,
  RequiredStar,
  srOnly,
  TrashIcon,
  withDisabled
} from './form/ui';
import { FileOverlay } from './form/overlays/FileOverlay';
import { InfoOverlay } from './form/overlays/InfoOverlay';
import { LineOverlayState, LineSelectOverlay } from './form/overlays/LineSelectOverlay';
import { InfoTooltip } from './form/InfoTooltip';
import { DateInput } from './form/DateInput';
import { SearchableSelect } from './form/SearchableSelect';
import { LineItemMultiAddSelect } from './form/LineItemMultiAddSelect';
import { LineItemGroupQuestion } from './form/LineItemGroupQuestion';
import { LineItemTable } from './form/LineItemTable';
import { HtmlPreview } from './app/HtmlPreview';
import { GroupedPairedFields } from './form/GroupedPairedFields';
import { PairedRowGrid } from './form/PairedRowGrid';
import { PageSection } from './form/PageSection';
import { buildPageSectionBlocks, resolveGroupSectionKey, resolvePageSectionKey } from './form/grouping';
import { computeChoiceControlVariant, resolveNoneLabel, type OptionLike } from './form/choiceControls';
import { buildSelectorOptionSet, resolveSelectorHelperText, resolveSelectorLabel, resolveSelectorPlaceholder } from './form/lineItemSelectors';
import { NumberStepper } from './form/NumberStepper';
import { applyValueMapsToForm, applyValueMapsToLineRow, coerceDefaultValue, resolveValueMapValue } from './form/valueMaps';
import { isLineItemGroupQuestionComplete } from './form/completeness';
import { findOrderedEntryBlock, type OrderedEntryTarget } from './form/orderedEntry';
import { resolveRowFlowSegmentActionIds } from '../features/steps/domain/rowFlow';
import {
  buildLineContextId,
  buildSubgroupKey,
  buildLineItemDedupKey,
  cascadeRemoveLineItemRows,
  computeRowNonMatchOptions,
  findLineItemDedupConflict,
  formatLineItemDedupValue,
  normalizeLineItemDedupRules,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  parseSubgroupKey,
  recomputeLineItemNonMatchOptions,
  resolveLineItemRowLimits,
  isLineItemMaxRowsReached,
  ROW_ID_KEY,
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY,
  resolveSubgroupKey,
  seedSubgroupDefaults
} from '../app/lineItems';
import { runSelectionEffectsForAncestors } from '../app/runSelectionEffectsForAncestors';
import { renderBundledHtmlTemplateClient, isBundledHtmlTemplateId } from '../app/bundledHtmlClientRenderer';
import { resolveTemplateIdForRecord } from '../app/templateId';
import { reconcileOverlayAutoAddModeGroups, reconcileOverlayAutoAddModeSubgroups } from '../app/autoAddModeOverlay';
import { applyClearOnChange } from '../app/clearOnChange';
import {
  buildParagraphDisclaimerSection,
  buildParagraphDisclaimerValue,
  resolveParagraphUserText,
  splitParagraphDisclaimerValue
} from '../app/paragraphDisclaimer';
import { getSystemFieldValue, type SystemRecordMeta } from '../../rules/systemFields';
import { validateRules } from '../../rules/validation';
import { containsLineItemsClause, containsParentLineItemsClause, matchesWhenClause } from '../../rules/visibility';
import { buildDraftPayload, validateForm, validateUploadCounts } from '../app/submission';
import { StepsBar } from '../features/steps/components/StepsBar';
import { computeGuidedStepsStatus } from '../features/steps/domain/computeStepStatus';
import { resolveVirtualStepField } from '../features/steps/domain/resolveVirtualStepField';

const formatTemplate = (value: string, vars?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

const lineItemDedupDefaultMessage: LocalizedString = {
  en: 'This entry already exists in this list.',
  fr: 'Cette entrée existe déjà dans cette liste.',
  nl: 'Deze invoer bestaat al in deze lijst.'
};

interface SubgroupOverlayState {
  open: boolean;
  subKey?: string;
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  groupOverride?: LineItemGroupConfigOverride;
  hideInlineSubgroups?: boolean;
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  closeConfirm?: RowFlowActionConfirmConfig;
  label?: string;
  contextHeader?: string;
  helperText?: string;
  rowFlow?: RowFlowConfig;
  source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
}

interface LineItemGroupOverlayState {
  open: boolean;
  groupId?: string;
  label?: string;
  contextHeader?: string;
  helperText?: string;
  rowFlow?: RowFlowConfig;
  source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  closeConfirm?: RowFlowActionConfirmConfig;
  /**
   * Optional override for rendering the group inside the overlay (used by guided steps to
   * restrict fields/subgroups without mutating the base definition).
   */
  group?: WebQuestionDefinition;
  /**
   * Optional rendering-only row filter for the parent group. Does not delete stored rows.
   */
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  /**
   * When true, hide the inline subgroup editor sections and rely on subgroup "open" pills/overlays instead.
   */
  hideInlineSubgroups?: boolean;
}

interface InfoOverlayState {
  open: boolean;
  title?: string;
  text?: string;
}

interface FileOverlayState {
  open: boolean;
  title?: string;
  scope?: 'top' | 'line';
  // Top-level upload field
  question?: WebQuestionDefinition;
  // Line-item / subgroup upload field
  group?: WebQuestionDefinition;
  rowId?: string;
  field?: any;
  fieldPath?: string;
}

type OverlayStackEntry =
  | { kind: 'subgroup'; state: SubgroupOverlayState }
  | { kind: 'lineItem'; state: LineItemGroupOverlayState };

// keep context ids consistent with App.tsx so auto-generated rows from selection effects
// can be reconciled when loading existing records

type StatusTone = 'info' | 'success' | 'error';

const hasSelectionEffects = (field: any): boolean =>
  Array.isArray(field?.selectionEffects) && field.selectionEffects.length > 0;

const areFieldValuesEqual = (a: FieldValue, b: FieldValue): boolean => {
  if (a === b) return true;
  const arrayA = Array.isArray(a) ? a : null;
  const arrayB = Array.isArray(b) ? b : null;
  if (arrayA || arrayB) {
    const arrA = arrayA || [];
    const arrB = arrayB || [];
    if (arrA.length !== arrB.length) return false;
    return arrA.every((val, idx) => val === arrB[idx]);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (!a || !b) return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }
  return false;
};

const getSelectionEffects = (field: any): any[] =>
  Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];

const extractCalcExpressionDeps = (expression?: string): string[] => {
  if (!expression) return [];
  const matches = expression.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  return matches
    .map(raw => raw.replace(/[{}]/g, '').trim())
    .filter(token => {
      if (!token || token.includes('.')) return false;
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
};

const isBlurDerivedValue = (derived?: any): boolean => {
  if (!derived) return false;
  const raw = (derived.applyOn || '').toString().trim().toLowerCase();
  if (raw === 'blur') return true;
  if (raw === 'change') return false;
  return (derived.op || '').toString() === 'copy';
};

const normalizeDerivedTokenToFieldId = (token: string): string => {
  const raw = (token || '').toString().trim();
  if (!raw) return '';
  const parts = raw.replace(/\s+/g, '').split('.').filter(Boolean);
  return (parts[parts.length - 1] || raw).toString().trim();
};

const collectWhenFieldIds = (when: any, out: Set<string>) => {
  if (!when) return;
  if (Array.isArray(when)) {
    when.forEach(entry => collectWhenFieldIds(entry, out));
    return;
  }
  if (typeof when !== 'object') return;
  const allRaw = (when as any).all ?? (when as any).and;
  if (Array.isArray(allRaw)) {
    allRaw.forEach(entry => collectWhenFieldIds(entry, out));
  }
  const anyRaw = (when as any).any ?? (when as any).or;
  if (Array.isArray(anyRaw)) {
    anyRaw.forEach(entry => collectWhenFieldIds(entry, out));
  }
  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
    collectWhenFieldIds((when as any).not, out);
  }
  const lineItemsClause = (when as any).lineItems ?? (when as any).lineItem;
  if (lineItemsClause && typeof lineItemsClause === 'object') {
    collectWhenFieldIds((lineItemsClause as any).when, out);
    collectWhenFieldIds((lineItemsClause as any).parentWhen, out);
  }
  const fieldId = (when as any).fieldId;
  if (fieldId !== undefined && fieldId !== null) {
    const fid = fieldId.toString().trim();
    if (fid) out.add(fid);
  }
};

const collectExpressionFieldIds = (expression: any, out: Set<string>) => {
  const expr = expression !== undefined && expression !== null ? expression.toString() : '';
  if (!expr) return;
  expr.replace(/\{([^}]+)\}/g, (_match: string, raw: string) => {
    const fid = normalizeDerivedTokenToFieldId(raw);
    if (fid) out.add(fid);
    return '';
  });
  expr.replace(/SUM\s*\(([^)]+)\)/gi, (_match: string, raw: string) => {
    const fid = normalizeDerivedTokenToFieldId(raw);
    if (fid) out.add(fid);
    return '';
  });
};

const collectDerivedBlurDependencies = (derived: any, out: Set<string>) => {
  if (!derived || !isBlurDerivedValue(derived)) return;
  const dependsOn = derived.dependsOn !== undefined && derived.dependsOn !== null ? derived.dependsOn.toString().trim() : '';
  if (dependsOn) {
    out.add(normalizeDerivedTokenToFieldId(dependsOn));
  }
  collectExpressionFieldIds(derived.expression ?? derived.formula ?? derived.expr, out);
  const filters = derived.lineItemFilters ?? derived.aggregateFilters ?? derived.filters;
  if (Array.isArray(filters)) {
    filters.forEach(filter => {
      if (!filter || typeof filter !== 'object') return;
      const ref = filter.ref ?? filter.path ?? filter.target;
      if (ref !== undefined && ref !== null) {
        const fid = normalizeDerivedTokenToFieldId(ref.toString());
        if (fid) out.add(fid);
      }
      collectWhenFieldIds((filter as any).when, out);
    });
  }
};

const parseLineFieldPath = (
  fieldPath: string
): { groupId: string; fieldId: string; rowId: string } | null => {
  const raw = (fieldPath || '').toString().trim();
  if (!raw || !raw.includes('__')) return null;
  const parts = raw.split('__');
  if (parts.length < 3) return null;
  const [groupId, fieldId, rowId] = parts;
  if (!groupId || !fieldId || !rowId) return null;
  return { groupId, fieldId, rowId };
};

const whenClauseDependsOnField = (when: any, targetFieldId: string): boolean => {
  if (!when) return false;
  if (Array.isArray(when)) return when.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  if (typeof when !== 'object') return false;
  const allRaw = (when as any).all ?? (when as any).and;
  if (Array.isArray(allRaw)) return allRaw.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  const anyRaw = (when as any).any ?? (when as any).or;
  if (Array.isArray(anyRaw)) return anyRaw.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
    return whenClauseDependsOnField((when as any).not, targetFieldId);
  }
  const lineItems = (when as any).lineItems ?? (when as any).lineItem;
  if (lineItems && typeof lineItems === 'object') {
    if (whenClauseDependsOnField((lineItems as any).when, targetFieldId)) return true;
    if (whenClauseDependsOnField((lineItems as any).parentWhen, targetFieldId)) return true;
  }
  const fidRaw = (when as any).fieldId ?? (when as any).field ?? (when as any).id;
  const fid = fidRaw !== undefined && fidRaw !== null ? fidRaw.toString().trim() : '';
  return fid === targetFieldId;
};

const selectionEffectDependsOnField = (field: any, targetFieldId: string): boolean => {
  const derived = field?.derivedValue;
  if (derived) {
    const dependsOnRaw = derived.dependsOn;
    const dependsOn = Array.isArray(dependsOnRaw) ? dependsOnRaw : dependsOnRaw ? [dependsOnRaw] : [];
    if (dependsOn.some((dep: any) => dep !== undefined && dep !== null && dep.toString().trim() === targetFieldId)) {
      return true;
    }
    if (derived.op === 'calc') {
      const deps = extractCalcExpressionDeps(derived.expression);
      if (deps.includes(targetFieldId)) return true;
    }
  }
  return getSelectionEffects(field).some(effect => {
    if (!effect) return false;
    if (effect.when && whenClauseDependsOnField(effect.when, targetFieldId)) {
      return true;
    }
    if (effect.rowMultiplierFieldId && effect.rowMultiplierFieldId === targetFieldId) {
      return true;
    }
    if (effect.lineItemMapping) {
      return Object.values(effect.lineItemMapping).some(value => {
        if (typeof value !== 'string' || !value.startsWith('$row.')) return false;
        const referencedField = value.slice(5).split('.')[0];
        return referencedField === targetFieldId;
      });
    }
    return false;
  });
};

const resolveRequiredValue = (field: any, rawValue: FieldValue): FieldValue => {
  if (!field || field?.type !== 'PARAGRAPH') return rawValue;
  const cfg = (field?.ui as any)?.paragraphDisclaimer;
  if (!cfg) return rawValue;
  return resolveParagraphUserText({ rawValue, config: cfg });
};

const isLineRowComplete = (group: WebQuestionDefinition, rowValues: Record<string, FieldValue>): boolean => {
  const fields = group.lineItemConfig?.fields || [];
  return fields.every(field => {
    if (!field.required) return true;
    const val = resolveRequiredValue(field, rowValues[field.id]);
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim() !== '';
    return val !== undefined && val !== null;
  });
};

const resolveOverlayHeaderFields = (groupCfg: any, overlayDetail: any): LineItemFieldConfig[] => {
  if (!groupCfg) return [];
  const headerColumnsExplicit = Array.isArray(overlayDetail?.header?.tableColumns);
  const raw = headerColumnsExplicit ? overlayDetail.header.tableColumns : [];
  const fallback = Array.isArray(groupCfg?.ui?.tableColumns) ? groupCfg.ui.tableColumns : [];
  const ids = raw
    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  if (headerColumnsExplicit && !ids.length) return [];
  const fallbackIds = fallback
    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  const fields = (groupCfg.fields || []) as LineItemFieldConfig[];
  const finalIds = ids.length ? ids : fallbackIds.length ? fallbackIds : fields.map(f => f.id);
  return finalIds.map((id: string) => fields.find((f: LineItemFieldConfig) => f.id === id)).filter(Boolean);
};

const areOverlayHeaderFieldsComplete = (args: {
  fields: LineItemFieldConfig[];
  rowValues: Record<string, FieldValue>;
  ctx: VisibilityContext;
  rowId: string;
  linePrefix: string;
}): boolean => {
  const { fields, rowValues, ctx, rowId, linePrefix } = args;
  if (!fields.length) return false;
  return fields.every(field => {
    if (shouldHideField(field.visibility, ctx, { rowId, linePrefix })) return true;
    const val = resolveRequiredValue(field, rowValues[field.id]);
    return !isEmptyValue(val as any);
  });
};

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

const collectLineItemConfigEntries = (questions: WebQuestionDefinition[]) => {
  const entries: Array<{ id: string; config: any }> = [];
  const visit = (id: string, config: any, parentPath?: string) => {
    if (!id || !config) return;
    const key = parentPath ? `${parentPath}.${id}` : id;
    entries.push({ id: key, config });
    const subs = Array.isArray(config.subGroups) ? config.subGroups : [];
    subs.forEach((sub: any) => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      visit(subId, sub, key);
    });
  };
  (questions || []).forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    visit(q.id, (q as any).lineItemConfig);
  });
  return entries;
};

interface FormViewProps {
  definition: WebFormDefinition;
  /**
   * Optional map of dedup key field ids (used to keep dedup keys editable even if valueMap is present).
   */
  dedupKeyFieldIdMap?: Record<string, true>;
  language: LangCode;
  values: Record<string, FieldValue>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  onSubmit: (ctx: { collapsedRows: Record<string, boolean>; collapsedSubgroups: Record<string, boolean> }) => Promise<void>;
  /**
   * Allows the app shell (bottom action bar) to trigger submit while preserving
   * FormView-specific behavior (e.g., validation navigation).
   */
  submitActionRef?: React.MutableRefObject<(() => void) | null>;
  summarySubmitIntentRef?: React.MutableRefObject<boolean>;
  /**
   * Optional back navigation hook for guided steps.
   */
  guidedBackActionRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * Optional imperative navigation hook so the app shell can scroll to an error/warning field
   * (expanding groups/rows/overlays as needed).
   */
  navigateToFieldRef?: React.MutableRefObject<((fieldKey: string) => void) | null>;
  submitting: boolean;
  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  status?: string | null;
  statusTone?: StatusTone | null;
  /**
   * Optional system/meta values for the current record (not stored in `values`).
   * Used so `visibility.showWhen/hideWhen` can reference system fields like STATUS / pdfUrl.
   */
  recordMeta?: SystemRecordMeta;
  warningTop?: Array<{ message: string; fieldPath: string }>;
  warningByField?: Record<string, string[]>;
  /**
   * When false, do not render the top "Warnings" banner inside the form body.
   * (Used when warnings are surfaced in the sticky header instead.)
   */
  showWarningsBanner?: boolean;
  onStatusClear?: () => void;
  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  ensureOptions: (q: WebQuestionDefinition) => void;
  ensureLineOptions: (groupId: string, field: any) => void;
  /**
   * External request to scroll to a newly added row (e.g., selectionEffects-created rows).
   * Format matches internal anchors: `${groupKey}__${rowId}`.
   */
  externalScrollAnchor?: string | null;
  onExternalScrollConsumed?: () => void;
  onSelectionEffect?: (
    q: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    }
  ) => void;
  /**
   * Optional immediate upload hook. Used to upload FILE_UPLOAD fields as soon as the user adds files.
   * The handler should:
   * - ensure the record exists (create draft if needed),
   * - upload the File(s) to Drive,
   * - update the field value to the resulting URL(s),
   * - and persist the URL(s) (draft save).
   */
  onUploadFiles?: (args: {
    scope: 'top' | 'line';
    fieldPath: string;
    questionId?: string;
    groupId?: string;
    rowId?: string;
    fieldId?: string;
    items: Array<string | File>;
    uploadConfig?: any;
  }) => Promise<{ success: boolean; message?: string }>;
  /**
   * Optional handler for BUTTON fields (Doc template preview / report rendering).
   */
  onReportButton?: (buttonId: string) => void;
  reportBusy?: boolean;
  reportBusyId?: string | null;
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
  }) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onFormValidityChange?: (isValid: boolean) => void;
  onGuidedUiChange?: (state: {
    activeStepId: string | null;
    activeStepIndex: number;
    stepCount: number;
    isFirst: boolean;
    isFinal: boolean;
    forwardGateSatisfied: boolean;
    backAllowed: boolean;
    backVisible: boolean;
    backLabel: string;
    stepSubmitLabel?: string | LocalizedString;
  } | null) => void;
  dedupNavigationBlocked?: boolean;
  openConfirmDialog?: (args: ConfirmDialogOpenArgs) => void;
}

const FormView: React.FC<FormViewProps> = ({
  definition,
  dedupKeyFieldIdMap,
  language,
  values,
  setValues,
  lineItems,
  setLineItems,
  onSubmit,
  submitActionRef,
  summarySubmitIntentRef,
  guidedBackActionRef,
  navigateToFieldRef,
  submitting,
  errors,
  setErrors,
  status,
  statusTone,
  recordMeta,
  warningTop,
  warningByField,
  showWarningsBanner = true,
  onStatusClear,
  optionState,
  setOptionState,
  ensureOptions,
  ensureLineOptions,
  externalScrollAnchor,
  onExternalScrollConsumed,
  onSelectionEffect,
  onUploadFiles,
  onReportButton,
  reportBusy,
  reportBusyId,
  onUserEdit,
  onDiagnostic,
  onFormValidityChange,
  onGuidedUiChange,
  dedupNavigationBlocked,
  openConfirmDialog
}) => {
  const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
    const raw = (field as any)?.optionSort;
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'source' ? 'source' : 'alphabetical';
  };
  const orderedEntryEnabled = definition.submitValidation?.enforceFieldOrder === true;
  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = key && warningByField ? (warningByField as any)[key] : undefined;
    return Array.isArray(list) ? list.filter(Boolean).map(m => (m || '').toString()) : [];
  };
  const hasWarning = (fieldPath: string): boolean => warningsFor(fieldPath).length > 0;
  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = warningsFor(fieldPath);
    if (!msgs.length) return null;
    return msgs.map((m, idx) => (
      <div key={`${fieldPath}-warning-${idx}`} className="warning">
        {m}
      </div>
    ));
  };
  const resolveLineItemDedupMessage = (
    rule: LineItemDedupRule,
    vars?: Record<string, string | number | boolean | null | undefined>
  ): string => {
    const base = resolveLocalizedString(rule.message || lineItemDedupDefaultMessage, language, 'This entry already exists in this list.');
    return formatTemplate(base, vars);
  };
  const resolveLineItemDedupValueToken = (rowValues: Record<string, FieldValue>, fieldId: string): string => {
    const raw = (rowValues || {})[fieldId];
    return formatLineItemDedupValue(raw);
  };
  const recordStatusText = (recordMeta?.status || '').toString().trim();
  const recordStatusKey = useMemo(
    () => resolveStatusPillKey(recordStatusText, definition.followup?.statusTransitions),
    [definition.followup?.statusTransitions, recordStatusText]
  );
  const isFieldLockedByDedup = (_fieldId: string): boolean => false;
  const dedupKeyFieldIds = useMemo(() => {
    if (dedupKeyFieldIdMap) {
      return new Set<string>(Object.keys(dedupKeyFieldIdMap || {}));
    }
    const rules = Array.isArray(definition?.dedupRules) ? definition.dedupRules : [];
    const keys = new Set<string>();
    rules.forEach(rule => {
      if (!rule) return;
      const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
      if (onConflict !== 'reject') return;
      const ruleKeys = Array.isArray(rule.keys) ? rule.keys : [];
      ruleKeys.forEach(raw => {
        const id = (raw ?? '').toString().trim().toLowerCase();
        if (!id) return;
        keys.add(id);
      });
    });
    return keys;
  }, [definition, dedupKeyFieldIdMap]);
  const isDedupKeyField = useCallback(
    (fieldId: string): boolean => {
      const id = (fieldId || '').toString().trim();
      if (!id) return false;
      const lower = id.toLowerCase();
      if (dedupKeyFieldIdMap) {
        return Boolean(dedupKeyFieldIdMap[id] || dedupKeyFieldIdMap[lower]);
      }
      return dedupKeyFieldIds.has(lower) || dedupKeyFieldIds.has(id);
    },
    [dedupKeyFieldIdMap, dedupKeyFieldIds]
  );
  const [overlay, setOverlay] = useState<LineOverlayState>({ open: false, options: [], selected: [] });
  const [lineItemGroupOverlay, setLineItemGroupOverlay] = useState<LineItemGroupOverlayState>({ open: false });
  const [overlayDetailSelection, setOverlayDetailSelection] = useState<{
    groupId: string;
    rowId: string;
    mode: 'view' | 'edit';
  } | null>(null);
  const overlayDetailEditSnapshotRef = useRef<{
    key: string;
    values: Record<string, FieldValue>;
    lineItems: LineItemState;
  } | null>(null);
  const overlayDetailHeaderCompleteRef = useRef<Map<string, boolean>>(new Map());
  const [overlayDetailHtml, setOverlayDetailHtml] = useState('');
  const [overlayDetailHtmlError, setOverlayDetailHtmlError] = useState('');
  const [overlayDetailHtmlLoading, setOverlayDetailHtmlLoading] = useState(false);
  const orderedEntryGateRef = useRef<(args: { targetQuestionId: string; source: string }) => boolean>(() => false);
  const [subgroupOverlay, setSubgroupOverlay] = useState<SubgroupOverlayState>({ open: false });
  const overlayStackRef = useRef<OverlayStackEntry[]>([]);
  const [infoOverlay, setInfoOverlay] = useState<InfoOverlayState>({ open: false });
  const [fileOverlay, setFileOverlay] = useState<FileOverlayState>({ open: false });
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<string | null>(null);
  const [subgroupSelectors, setSubgroupSelectors] = useState<Record<string, string>>({});
  // Mobile/touch UX: section selectors (SearchableSelect) can commit on blur and click ordering can vary by browser.
  // Keep a ref of the latest selector values so "Add" handlers can reliably seed presets.
  const latestSubgroupSelectorValueRef = useRef<Record<string, string>>({});
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});
  const subgroupBottomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const subgroupPrevCountsRef = useRef<Record<string, number>>({});
  const statusRef = useRef<HTMLDivElement | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragState, setDragState] = useState<Record<string, boolean>>({});
  const dragCounterRef = useRef<Record<string, number>>({});
  const [uploadAnnouncements, setUploadAnnouncements] = useState<Record<string, string>>({});
  const firstErrorRef = useRef<string | null>(null);
  const errorNavRequestRef = useRef(0);
  const errorNavConsumedRef = useRef(0);
  const errorNavModeRef = useRef<'focus' | 'scroll'>('focus');
  const choiceVariantLogRef = useRef<Record<string, string>>({});
  const choiceSearchLoggedRef = useRef<Set<string>>(new Set());
  const choiceSearchIndexLoggedRef = useRef<Set<string>>(new Set());
  const hideLabelLoggedRef = useRef<Set<string>>(new Set());
  const overlayOpenActionLoggedRef = useRef<Set<string>>(new Set());
  const foodSafetyDiagnosticLoggedRef = useRef(false);
  const [overlayOpenActionSuppressed, setOverlayOpenActionSuppressed] = useState<Record<string, boolean>>({});
  const fallbackConfirm = useConfirmDialog({ eventPrefix: 'ui.formConfirm', onDiagnostic });
  const openConfirmDialogResolved = openConfirmDialog || fallbackConfirm.openConfirm;
  const showFallbackConfirmOverlay = !openConfirmDialog;
  const groupScrollAnimRafRef = useRef(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const valuesRef = useRef(values);
  const lineItemsRef = useRef(lineItems);
  const collapsedRowsRef = useRef(collapsedRows);
  const collapsedSubgroupsRef = useRef(collapsedSubgroups);
  const optionStateRef = useRef(optionState);
  const paragraphDisclaimerPendingRef = useRef(false);
  const paragraphDisclaimerSyncRef = useRef<((source?: string) => void) | null>(null);
  const paragraphDisclaimerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    valuesRef.current = values;
    lineItemsRef.current = lineItems;
  }, [values, lineItems]);

  useEffect(() => {
    if (!overlayDetailSelection || overlayDetailSelection.mode !== 'edit') {
      overlayDetailEditSnapshotRef.current = null;
      return;
    }
    const key = `${overlayDetailSelection.groupId}::${overlayDetailSelection.rowId}`;
    if (overlayDetailEditSnapshotRef.current?.key === key) return;
    overlayDetailEditSnapshotRef.current = {
      key,
      values: valuesRef.current,
      lineItems: lineItemsRef.current
    };
  }, [overlayDetailSelection]);

  useEffect(() => {
    collapsedRowsRef.current = collapsedRows;
    collapsedSubgroupsRef.current = collapsedSubgroups;
  }, [collapsedRows, collapsedSubgroups]);

  useEffect(() => {
    optionStateRef.current = optionState;
  }, [optionState]);

  const isOverlayOpenActionSuppressed = useCallback(
    (key: string) => Boolean(key && overlayOpenActionSuppressed[key]),
    [overlayOpenActionSuppressed]
  );
  const suppressOverlayOpenAction = useCallback((key: string) => {
    if (!key) return;
    setOverlayOpenActionSuppressed(prev => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }, []);
  const clearOverlayOpenActionSuppression = useCallback((key: string) => {
    if (!key) return;
    setOverlayOpenActionSuppressed(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const guidedStepsCfg = definition.steps?.mode === 'guided' ? definition.steps : undefined;
  const guidedEnabled = Boolean(guidedStepsCfg && Array.isArray(guidedStepsCfg.items) && guidedStepsCfg.items.length > 0);
  const guidedPrefix = (guidedStepsCfg?.stateFields?.prefix || '__ckStep').toString();

  const guidedStatus = useMemo(() => {
    if (!guidedEnabled) return { steps: [], maxCompleteIndex: -1, maxValidIndex: -1 };
    return computeGuidedStepsStatus({ definition, language, values, lineItems });
  }, [definition, guidedEnabled, language, lineItems, values]);

  const guidedStepIds = useMemo(() => {
    if (!guidedEnabled) return [] as string[];
    return (guidedStepsCfg!.items || [])
      .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
      .filter(Boolean);
  }, [guidedEnabled, guidedStepsCfg]);

  const [activeGuidedStepId, setActiveGuidedStepId] = useState<string>(() => {
    const first = guidedStepIds[0];
    return first ? first : '';
  });

  const activeGuidedStepIndex = Math.max(0, guidedStepIds.indexOf(activeGuidedStepId));
  const normalizeForwardGate = useCallback(
    (raw: any, fallback: 'free' | 'whenComplete' | 'whenValid'): 'free' | 'whenComplete' | 'whenValid' => {
      const v = (raw ?? '').toString().trim().toLowerCase();
      if (v === 'free') return 'free';
      if (v === 'whencomplete') return 'whenComplete';
      if (v === 'whenvalid') return 'whenValid';
      // Accept common mis-typed aliases to reduce config footguns.
      if (v === 'oncomplete') return 'whenComplete';
      if (v === 'onvalid') return 'whenValid';
      return fallback;
    },
    []
  );
  const normalizeAutoAdvance = useCallback(
    (raw: any, fallback: 'off' | 'onComplete' | 'onValid'): 'off' | 'onComplete' | 'onValid' => {
      const v = (raw ?? '').toString().trim().toLowerCase();
      if (v === 'off') return 'off';
      if (v === 'oncomplete') return 'onComplete';
      if (v === 'onvalid') return 'onValid';
      // Accept common mis-typed aliases to reduce config footguns.
      if (v === 'whencomplete') return 'onComplete';
      if (v === 'whenvalid') return 'onValid';
      return fallback;
    },
    []
  );
  const guidedDefaultForwardGate = normalizeForwardGate((guidedStepsCfg as any)?.defaultForwardGate, 'whenValid');
  const guidedDefaultAutoAdvance = normalizeAutoAdvance((guidedStepsCfg as any)?.defaultAutoAdvance, 'onValid');
  const maxReachableGuidedIndexBase = (() => {
    if (!guidedEnabled) return -1;
    if (!guidedStepIds.length) return -1;
    if (!guidedStepsCfg) return -1;

    const stepCfgById = new Map<string, any>();
    (guidedStepsCfg.items || []).forEach((s: any) => {
      const id = (s?.id ?? '').toString().trim();
      if (!id) return;
      if (!stepCfgById.has(id)) stepCfgById.set(id, s);
    });
    const statusById = new Map<string, any>();
    (guidedStatus.steps || []).forEach((s: any) => {
      const id = (s?.id ?? '').toString().trim();
      if (!id) return;
      statusById.set(id, s);
    });

    let reachable = 0;
    for (let idx = 0; idx < guidedStepIds.length - 1; idx++) {
      const stepId = guidedStepIds[idx];
      const cfg = stepCfgById.get(stepId);
      const gate = normalizeForwardGate(cfg?.navigation?.forwardGate ?? cfg?.forwardGate, guidedDefaultForwardGate);
      if (gate === 'free') {
        reachable = idx + 1;
        continue;
      }
      const st = statusById.get(stepId);
      const ok = gate === 'whenComplete' ? !!st?.complete : !!st?.valid;
      if (!ok) break;
      reachable = idx + 1;
    }
    return reachable;
  })();
  const maxReachableGuidedIndex =
    dedupNavigationBlocked && activeGuidedStepIndex >= 0
      ? Math.min(activeGuidedStepIndex, maxReachableGuidedIndexBase)
      : maxReachableGuidedIndexBase;

  // Emit a one-time diagnostic when guided steps are enabled for this form.
  useEffect(() => {
    if (!guidedEnabled) return;
    onDiagnostic?.('steps.enabled', { mode: 'guided', stepCount: guidedStepIds.length });
    onDiagnostic?.('steps.validation.noticeMode', { mode: 'fieldOnly' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedEnabled]);

  useEffect(() => {
    if (!orderedEntryEnabled) return;
    onDiagnostic?.('validation.ordered.enabled', { mode: guidedEnabled ? 'guided' : 'standard' });
  }, [guidedEnabled, onDiagnostic, orderedEntryEnabled]);

  useEffect(() => {
    if (!onDiagnostic || foodSafetyDiagnosticLoggedRef.current) return;
    const stepCfg = (definition.steps?.items || []).find(step => (step?.id || '').toString() === 'foodSafety');
    if (!stepCfg) return;
    const group = (definition.questions || []).find(q => q.id === 'MP_MEALS_REQUEST' && q.type === 'LINE_ITEM_GROUP');
    const fields = (group?.lineItemConfig?.fields || []) as any[];
    const tempField = fields.find(field => field?.id === 'MP_COOK_TEMP');
    const leftoverField = fields.find(field => field?.id === 'LEFTOVER_VAL');
    const hasConsentOptions = Array.isArray(tempField?.options) ? tempField.options.length > 0 : false;
    const isConsentCheckbox = tempField?.type === 'CHECKBOX' && !tempField?.dataSource && !hasConsentOptions;

    onDiagnostic('form.foodSafety.helperText', {
      stepId: stepCfg.id,
      enabled: Boolean(stepCfg.helpText),
      length: (stepCfg.helpText ? resolveLocalizedString(stepCfg.helpText, language, '') : '').length
    });
    onDiagnostic('form.foodSafety.fields', {
      groupId: group?.id || null,
      leftoverField: Boolean(leftoverField),
      tempFieldType: tempField?.type || null,
      tempConsent: isConsentCheckbox
    });
    foodSafetyDiagnosticLoggedRef.current = true;
  }, [definition.questions, definition.steps, language, onDiagnostic]);

  const selectorOverlayGroups = useMemo(() => {
    return (definition.questions || [])
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .map(q => ({ id: q.id, addMode: (q.lineItemConfig as any)?.addMode }))
      .filter(entry => {
        const mode = (entry.addMode || '').toString().trim().toLowerCase();
        return mode === 'selectoroverlay' || mode === 'selector-overlay';
      })
      .map(entry => entry.id);
  }, [definition.questions]);

  useEffect(() => {
    if (!selectorOverlayGroups.length) return;
    onDiagnostic?.('form.lineItems.selectorOverlay.enabled', { groupIds: selectorOverlayGroups });
  }, [onDiagnostic, selectorOverlayGroups]);

  const lineItemConfigEntries = useMemo(
    () => collectLineItemConfigEntries(definition.questions || []),
    [definition.questions]
  );

  const selectorOverlayHelperGroups = useMemo(() => {
    return lineItemConfigEntries
      .filter(entry => {
        const selector = entry.config?.sectionSelector;
        if (!selector) return false;
        return Boolean(
          selector.helperText ||
          selector.helperTextEn ||
          selector.helperTextFr ||
          selector.helperTextNl
        );
      })
      .map(entry => entry.id);
  }, [lineItemConfigEntries]);

  useEffect(() => {
    if (!selectorOverlayHelperGroups.length) return;
    onDiagnostic?.('form.lineItems.selectorOverlay.helperText.enabled', { groupIds: selectorOverlayHelperGroups });
  }, [onDiagnostic, selectorOverlayHelperGroups]);

  const addOverlayCopyGroups = useMemo(() => {
    return lineItemConfigEntries
      .filter(entry => {
        const cfg = entry.config?.addOverlay;
        return Boolean(cfg && (cfg.title || cfg.helperText || cfg.placeholder));
      })
      .map(entry => entry.id);
  }, [lineItemConfigEntries]);

  useEffect(() => {
    if (!addOverlayCopyGroups.length) return;
    onDiagnostic?.('form.lineItems.addOverlayCopy.enabled', { groupIds: addOverlayCopyGroups });
  }, [addOverlayCopyGroups, onDiagnostic]);

  const nonMatchWarningModeGroups = useMemo(() => {
    return (definition.questions || [])
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .map(q => {
        const raw = (q.lineItemConfig?.ui as any)?.nonMatchWarningMode;
        if (raw === undefined || raw === null || raw === '') return null;
        const candidate = raw.toString().trim().toLowerCase();
        const mode =
          candidate === 'validation' || candidate === 'rules' || candidate === 'rule' || candidate === 'generic'
            ? 'validation'
            : candidate === 'both' || candidate === 'all'
              ? 'both'
              : 'descriptive';
        return { id: q.id, mode };
      })
      .filter(Boolean) as Array<{ id: string; mode: string }>;
  }, [definition.questions]);

  useEffect(() => {
    if (!nonMatchWarningModeGroups.length) return;
    onDiagnostic?.('form.lineItems.nonMatchWarningMode.enabled', { groups: nonMatchWarningModeGroups });
  }, [nonMatchWarningModeGroups, onDiagnostic]);

  const lineItemDedupGroups = useMemo(() => {
    return (definition.questions || [])
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .map(q => {
        const rules = normalizeLineItemDedupRules((q.lineItemConfig as any)?.dedupRules);
        if (!rules.length) return null;
        return {
          id: q.id,
          rules: rules.map(rule => rule.fields)
        };
      })
      .filter(Boolean) as Array<{ id: string; rules: string[][] }>;
  }, [definition.questions]);

  const overlayDetailGroups = useMemo(() => {
    return (definition.questions || [])
      .filter(q => q.type === 'LINE_ITEM_GROUP' && (q as any)?.lineItemConfig?.ui?.overlayDetail?.enabled === true)
      .map(q => q.id);
  }, [definition.questions]);

  useEffect(() => {
    if (!lineItemDedupGroups.length) return;
    onDiagnostic?.('form.lineItems.dedupRules.enabled', { groups: lineItemDedupGroups });
  }, [lineItemDedupGroups, onDiagnostic]);

  useEffect(() => {
    if (!overlayDetailGroups.length) return;
    onDiagnostic?.('form.lineItems.overlayDetail.enabled', { groups: overlayDetailGroups });
  }, [onDiagnostic, overlayDetailGroups]);

  const rowFlowTargets = useMemo(() => {
    if (!guidedStepsCfg) return [];
    const targets: Array<{ stepId: string; groupId: string; mode: string }> = [];
    (guidedStepsCfg.items || []).forEach(step => {
      const stepId = (step?.id || '').toString();
      const includes = Array.isArray(step?.include) ? step.include : [];
      includes.forEach((target: any) => {
        if (!target || typeof target !== 'object') return;
        const kind = (target.kind || '').toString().trim();
        if (kind !== 'lineGroup') return;
        const groupId = (target.id || '').toString().trim();
        if (!groupId || !target.rowFlow) return;
        const mode = (target.rowFlow?.mode || 'progressive').toString();
        targets.push({ stepId, groupId, mode });
      });
    });
    return targets;
  }, [guidedStepsCfg]);

  const rowFlowSegmentActionTargets = useMemo(() => {
    if (!guidedStepsCfg) return [];
    const targets: Array<{ stepId: string; groupId: string; segmentsWithActions: number; multiActionSegments: number }> = [];
    (guidedStepsCfg.items || []).forEach(step => {
      const stepId = (step?.id || '').toString();
      const includes = Array.isArray(step?.include) ? step.include : [];
      includes.forEach((target: any) => {
        if (!target || typeof target !== 'object') return;
        const kind = (target.kind || '').toString().trim();
        if (kind !== 'lineGroup') return;
        const groupId = (target.id || '').toString().trim();
        if (!groupId || !target.rowFlow) return;
        const segments = (target.rowFlow?.output?.segments || []) as RowFlowOutputSegmentConfig[];
        if (!segments.length) return;
        const segmentActions: string[][] = segments.map(segment => resolveRowFlowSegmentActionIds(segment));
        const segmentsWithActions = segmentActions.filter(ids => ids.length > 0);
        if (!segmentsWithActions.length) return;
        const multiActionSegments = segmentActions.filter(ids => ids.length > 1).length;
        targets.push({ stepId, groupId, segmentsWithActions: segmentsWithActions.length, multiActionSegments });
      });
    });
    return targets;
  }, [guidedStepsCfg]);

  useEffect(() => {
    if (!rowFlowTargets.length) return;
    onDiagnostic?.('form.rowFlow.enabled', { targets: rowFlowTargets });
  }, [onDiagnostic, rowFlowTargets]);

  useEffect(() => {
    if (!rowFlowSegmentActionTargets.length) return;
    onDiagnostic?.('form.rowFlow.output.segmentActions.enabled', { targets: rowFlowSegmentActionTargets });
  }, [onDiagnostic, rowFlowSegmentActionTargets]);

  // Clamp/initialize the active step when step config or validity changes.
  useEffect(() => {
    if (!guidedEnabled) return;
    if (!guidedStepIds.length) return;
    const currentIdx = guidedStepIds.indexOf(activeGuidedStepId);
    const maxReach = Math.min(guidedStepIds.length - 1, Math.max(0, maxReachableGuidedIndex));
    if (currentIdx >= 0 && currentIdx <= maxReach) return;
    const nextId = guidedStepIds[Math.max(0, Math.min(maxReach, guidedStepIds.length - 1))] || guidedStepIds[0];
    if (!nextId) return;
    setActiveGuidedStepId(nextId);
    onDiagnostic?.('steps.step.change', { from: currentIdx >= 0 ? guidedStepIds[currentIdx] : null, to: nextId, reason: 'load' });
  }, [activeGuidedStepId, guidedEnabled, guidedStepIds, maxReachableGuidedIndex, onDiagnostic]);

  const guidedVirtualState = useMemo(() => {
    if (!guidedEnabled) return null;
    const idx = Math.max(0, guidedStepIds.indexOf(activeGuidedStepId));
    return {
      prefix: guidedPrefix,
      activeStepId: activeGuidedStepId,
      activeStepIndex: idx,
      maxValidIndex: guidedStatus.maxValidIndex,
      maxCompleteIndex: guidedStatus.maxCompleteIndex,
      steps: guidedStatus.steps
    };
  }, [activeGuidedStepId, guidedEnabled, guidedPrefix, guidedStatus.maxCompleteIndex, guidedStatus.maxValidIndex, guidedStatus.steps, guidedStepIds]);

  const guidedInlineLineGroupIds = useMemo(() => {
    const out = new Set<string>();
    if (!guidedEnabled || !guidedStepsCfg) return out;
    const steps = guidedStepsCfg.items || [];
    if (!steps.length) return out;
    const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
    const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [];
    const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];
    const stepLineGroupsDefaultMode = (stepCfg?.render?.lineGroups?.mode || '') as 'inline' | 'overlay' | '';

    [...headerTargets, ...stepTargets].forEach(target => {
      if (!target || typeof target !== 'object') return;
      const kind = (target.kind || '').toString().trim();
      const id = (target.id || '').toString().trim();
      if (kind !== 'lineGroup' || !id) return;
      const groupQ = definition.questions.find(q => q.id === id && q.type === 'LINE_ITEM_GROUP');
      if (!groupQ) return;

      const presentationRaw = (target.presentation || 'groupEditor').toString().trim().toLowerCase();
      const presentation: 'groupEditor' | 'liftedRowFields' =
        presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';

      const targetModeRaw = (target.displayMode || 'inherit').toString().trim().toLowerCase();
      const stepModeRaw = stepLineGroupsDefaultMode ? stepLineGroupsDefaultMode.toString().trim().toLowerCase() : '';
      const inheritedOverlay = !!(groupQ.lineItemConfig as any)?.ui?.openInOverlay;
      const resolvedLineMode =
        targetModeRaw === 'inline' || targetModeRaw === 'overlay'
          ? (targetModeRaw as 'inline' | 'overlay')
          : stepModeRaw === 'inline' || stepModeRaw === 'overlay'
            ? (stepModeRaw as 'inline' | 'overlay')
            : inheritedOverlay
              ? 'overlay'
              : 'inline';
      const effectiveLineMode: 'inline' | 'overlay' = presentation === 'liftedRowFields' ? 'inline' : resolvedLineMode;
      if (effectiveLineMode === 'inline') out.add(id);
    });

    return out;
  }, [activeGuidedStepId, definition.questions, guidedEnabled, guidedStepsCfg]);

  const orderedEntryQuestions = useMemo(() => {
    if (!orderedEntryEnabled) return [] as WebQuestionDefinition[];
    if (!guidedEnabled || !guidedStepsCfg || !guidedStepIds.length) return definition.questions || [];
    const steps = guidedStepsCfg.items || [];
    const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
    const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [];
    const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];
    const ordered: WebQuestionDefinition[] = [];
    const seen = new Set<string>();
    const questionById = new Map<string, WebQuestionDefinition>();
    (definition.questions || []).forEach(q => questionById.set(q.id, q));
    [...headerTargets, ...stepTargets].forEach(target => {
      if (!target || typeof target !== 'object') return;
      const kind = (target.kind || '').toString().trim();
      const id = (target.id || '').toString().trim();
      if (!id || (kind !== 'question' && kind !== 'lineGroup')) return;
      if (seen.has(id)) return;
      const q = questionById.get(id);
      if (!q) return;
      seen.add(id);
      ordered.push(q);
    });
    return ordered.length ? ordered : definition.questions || [];
  }, [activeGuidedStepId, definition.questions, guidedEnabled, guidedStepIds, guidedStepsCfg, orderedEntryEnabled]);

  const buildGuidedStepDefinition = useCallback(
    (stepId?: string): WebFormDefinition | null => {
      if (!guidedEnabled || !guidedStepsCfg || !guidedStepIds.length) return null;
      const steps = guidedStepsCfg.items || [];
      const resolvedStepId = (stepId || activeGuidedStepId || '').toString().trim();
      const stepCfg =
        (steps.find(s => (s?.id || '').toString().trim() === resolvedStepId) || steps[0]) as any;
      if (!stepCfg) return null;

      const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [];
      const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];

      const topQuestionIds = new Set<string>();
      const renderQuestionAsLabel = new Set<string>();
      const lineTargetsById = new Map<string, any>();
      const addTarget = (t: any) => {
        if (!t || typeof t !== 'object') return;
        const kind = (t.kind || '').toString().trim();
        const id = (t.id || '').toString().trim();
        if (!kind || !id) return;
        if (kind === 'question') {
          topQuestionIds.add(id);
          if ((t as any)?.renderAsLabel === true) renderQuestionAsLabel.add(id);
          return;
        }
        if (kind === 'lineGroup') {
          if (!lineTargetsById.has(id)) lineTargetsById.set(id, t);
        }
      };
      [...headerTargets, ...stepTargets].forEach(addTarget);

      const normalizeLineFieldId = (groupId: string, rawId: any): string => {
        const s = rawId !== undefined && rawId !== null ? rawId.toString().trim() : '';
        if (!s) return '';
        const underscorePrefix = `${groupId}__`;
        if (s.startsWith(underscorePrefix)) return s.slice(underscorePrefix.length);
        const dotPrefix = `${groupId}.`;
        if (s.startsWith(dotPrefix)) return s.slice(dotPrefix.length);
        if (s.includes('.')) return s.split('.').pop() || s;
        return s;
      };

      const parseStepFieldEntries = (
        groupId: string,
        raw: any
      ): { allowed: Set<string> | null; renderAsLabel: Set<string> } => {
        if (!raw) return { allowed: null, renderAsLabel: new Set() };

        const entries: Array<{ id: string; renderAsLabel: boolean }> = [];
        const pushEntry = (v: any) => {
          if (v === undefined || v === null) return;
          if (typeof v === 'object') {
            const id = normalizeLineFieldId(groupId, (v as any).id ?? (v as any).fieldId ?? (v as any).field);
            if (!id) return;
            entries.push({ id, renderAsLabel: Boolean((v as any).renderAsLabel) });
            return;
          }
          const id = normalizeLineFieldId(groupId, v);
          if (!id) return;
          entries.push({ id, renderAsLabel: false });
        };

        if (Array.isArray(raw)) {
          raw.forEach(pushEntry);
        } else {
          raw
            .toString()
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
            .forEach(pushEntry);
        }

        const ids = entries.map(e => e.id).filter(Boolean);
        const roIds = entries.filter(e => e.renderAsLabel).map(e => e.id).filter(Boolean);
        return { allowed: ids.length ? new Set(ids) : null, renderAsLabel: new Set(roIds) };
      };

      const scopedQuestions: WebQuestionDefinition[] = [];
      (definition.questions || []).forEach(q => {
        if (!q) return;
        if (q.type !== 'LINE_ITEM_GROUP') {
          if (topQuestionIds.has(q.id)) {
            const asLabel = renderQuestionAsLabel.has(q.id);
            scopedQuestions.push(
              asLabel
                ? ({ ...(q as any), ui: { ...((q as any).ui || {}), renderAsLabel: true } } as WebQuestionDefinition)
                : q
            );
          }
          return;
        }

        const t = lineTargetsById.get(q.id);
        if (!t) return;
        const groupId = q.id;
        const lineCfg = (q as any).lineItemConfig || {};

        const { allowed: allowedFieldIds, renderAsLabel: renderAsLabelFieldIdsFromFields } = parseStepFieldEntries(
          groupId,
          (t as any).fields
        );
        const readOnlyFieldIds = (() => {
          const raw = (t as any).readOnlyFields;
          const parsed = parseStepFieldEntries(groupId, raw);
          const ids = parsed.allowed ? Array.from(parsed.allowed) : [];
          const merged = new Set<string>([...ids, ...Array.from(renderAsLabelFieldIdsFromFields)]);
          return merged.size ? merged : null;
        })();
        const filteredFieldsBase = allowedFieldIds
          ? ((lineCfg.fields || []) as any[]).filter((f: any) => {
              const fid = normalizeLineFieldId(groupId, (f as any)?.id);
              return fid && allowedFieldIds.has(fid);
            })
          : lineCfg.fields || [];
        const filteredFields = (filteredFieldsBase as any[]).map((f: any) => {
          const fid = normalizeLineFieldId(groupId, (f as any)?.id);
          if (readOnlyFieldIds && fid && readOnlyFieldIds.has(fid)) {
            return { ...(f as any), readOnly: true, ui: { ...((f as any).ui || {}), renderAsLabel: true } };
          }
          return f;
        });

        const presentationRaw = ((t as any).presentation || 'groupEditor').toString().trim().toLowerCase();
        const presentation: 'groupEditor' | 'liftedRowFields' =
          presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';

        const subGroupsCfgPresent = !!(t as any).subGroups && typeof (t as any).subGroups === 'object';
        const subIncludeRaw = subGroupsCfgPresent ? (t as any)?.subGroups?.include : undefined;
        const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
        const allowedSubIds = subIncludeList
          .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
          .filter(Boolean);
        const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;
        const filteredSubGroups = (() => {
          const subs = (lineCfg.subGroups || []) as any[];
          if (!subs.length) return subs;
          // In guided steps, `liftedRowFields` should not validate subgroups unless explicitly configured.
          if (!subGroupsCfgPresent && presentation === 'liftedRowFields') return [];
          const kept = allowedSubSet
            ? subs.filter(sub => {
                const subId = resolveSubgroupKey(sub as any);
                return subId && allowedSubSet.has(subId);
              })
            : subs;
          return kept.map(sub => {
            const subId = resolveSubgroupKey(sub as any);
            const subTarget = subIncludeList.find(
              s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : '') === subId
            );
            const allowedSubFieldsRaw = subTarget?.fields;
            const {
              allowed: allowedSubFields,
              renderAsLabel: renderAsLabelSubFieldIdsFromFields
            } = parseStepFieldEntries(subId, allowedSubFieldsRaw);
            const readOnlySubFieldsRaw = subTarget?.readOnlyFields;
            const readOnlySubFields = (() => {
              const parsed = parseStepFieldEntries(subId, readOnlySubFieldsRaw);
              const ids = parsed.allowed ? Array.from(parsed.allowed) : [];
              const merged = new Set<string>([...ids, ...Array.from(renderAsLabelSubFieldIdsFromFields)]);
              return merged.size ? merged : null;
            })();

            const nextSub: any = { ...(sub as any) };
            // Guided-step validation needs row filters + expandGate metadata even when we filter fields.
            nextSub._guidedRowFilter = subTarget?.validationRows ?? subTarget?.rows;
            nextSub._expandGateFields = (sub as any).fields || [];

            if (allowedSubFields && allowedSubFields.size) {
              nextSub.fields = ((sub as any).fields || []).filter((f: any) => {
                const fid = normalizeLineFieldId(subId, (f as any)?.id);
                return fid && allowedSubFields.has(fid);
              });
            }
            if (readOnlySubFields && readOnlySubFields.size) {
              nextSub.fields = (nextSub.fields || (sub as any).fields || []).map((f: any) => {
                const fid = normalizeLineFieldId(subId, (f as any)?.id);
                if (fid && readOnlySubFields.has(fid)) {
                  return { ...(f as any), readOnly: true, ui: { ...((f as any).ui || {}), renderAsLabel: true } };
                }
                return f;
              });
            }
            return nextSub;
          });
        })();

        const stepLineCfg: any = { ...(lineCfg as any), fields: filteredFields, subGroups: filteredSubGroups };
        // Guided-step validation needs row filters + expandGate metadata even when we filter fields.
        stepLineCfg._guidedRowFilter = (t as any).validationRows ?? (t as any).rows;
        stepLineCfg._expandGateFields = (lineCfg as any).fields || [];
        if ((t as any).collapsedFieldsInHeader === true) {
          stepLineCfg.ui = { ...(stepLineCfg.ui || {}), guidedCollapsedFieldsInHeader: true };
        }
        scopedQuestions.push({ ...(q as any), lineItemConfig: stepLineCfg } as WebQuestionDefinition);
      });

      return { ...(definition as any), questions: scopedQuestions } as WebFormDefinition;
    },
    [activeGuidedStepId, definition, guidedEnabled, guidedStepIds, guidedStepsCfg]
  );

  const guidedStepBodyRef = useRef<HTMLDivElement | null>(null);
  const guidedAutoAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const guidedAutoAdvanceStateRef = useRef<{ stepId: string; lastSatisfied: boolean; armed: boolean } | null>(null);
  const guidedAutoAdvanceAttemptRef = useRef<(() => void) | null>(null);
  const guidedLastUserEditAtRef = useRef<number>(0);

  const selectGuidedStep = useCallback(
    (nextStepId: string, reason: 'user' | 'auto' = 'user') => {
      if (!guidedEnabled) return;
      const nextId = (nextStepId || '').toString().trim();
      if (!nextId) return;
      const nextIdx = guidedStepIds.indexOf(nextId);
      const currentIdx = guidedStepIds.indexOf(activeGuidedStepId);
      if (nextIdx < 0) return;
      if (nextIdx === currentIdx) return;

      // Back navigation
      if (nextIdx < currentIdx) {
        const currentCfg = (guidedStepsCfg as any)?.items?.[Math.max(0, currentIdx)] as any;
        const allowBack = (currentCfg?.navigation?.allowBack ?? currentCfg?.allowBack) !== false;
        if (!allowBack) {
          onDiagnostic?.('steps.step.blocked', { from: activeGuidedStepId, to: nextId, gate: 'allowBack', reason: 'allowBack=false' });
          return;
        }
        setActiveGuidedStepId(nextId);
        onDiagnostic?.('steps.step.change', { from: activeGuidedStepId, to: nextId, reason });
        return;
      }

      if (dedupNavigationBlocked) {
        onDiagnostic?.('steps.step.blocked', {
          from: activeGuidedStepId,
          to: nextId,
          gate: 'dedup',
          reason: 'dedupGate'
        });
        return;
      }

      // Forward navigation: use computed reachability (contiguous gating).
      if (nextIdx > maxReachableGuidedIndex) {
        if (submitActionRef?.current) {
          submitActionRef.current();
        }
        onDiagnostic?.('steps.step.blocked', {
          from: activeGuidedStepId,
          to: nextId,
          gate: guidedDefaultForwardGate,
          reason: 'notReachable',
          maxReachableIndex: maxReachableGuidedIndex
        });
        return;
      }

      setActiveGuidedStepId(nextId);
      onDiagnostic?.('steps.step.change', { from: activeGuidedStepId, to: nextId, reason });
    },
    [
      activeGuidedStepId,
      guidedDefaultForwardGate,
      guidedEnabled,
      guidedStepIds,
      guidedStepsCfg,
      maxReachableGuidedIndex,
      dedupNavigationBlocked,
      onDiagnostic,
      submitActionRef
    ]
  );

  // Auto-advance (default: onValid) while avoiding jumps mid-typing.
  useEffect(() => {
    if (!guidedEnabled) return;
    if (!guidedStepIds.length) return;
    if (!guidedStepsCfg) return;
    if (activeGuidedStepIndex >= guidedStepIds.length - 1) return;

    const stepCfg = guidedStepsCfg.items.find(s => (s?.id || '').toString() === activeGuidedStepId) as any;
    const forwardGate = normalizeForwardGate(stepCfg?.navigation?.forwardGate ?? stepCfg?.forwardGate, guidedDefaultForwardGate);
    const autoAdvance = normalizeAutoAdvance(
      stepCfg?.navigation?.autoAdvance ?? stepCfg?.autoAdvance ?? (guidedStepsCfg as any)?.defaultAutoAdvance,
      guidedDefaultAutoAdvance
    );
    if (autoAdvance === 'off') {
      guidedAutoAdvanceAttemptRef.current = null;
      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
      guidedAutoAdvanceStateRef.current = null;
      return;
    }

    const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
    const satisfied = autoAdvance === 'onValid' ? !!stepStatus?.valid : !!stepStatus?.complete;

    const state = guidedAutoAdvanceStateRef.current;
    // On step change: record current satisfied state but never auto-advance immediately.
    if (!state || state.stepId !== activeGuidedStepId) {
      guidedAutoAdvanceAttemptRef.current = null;
      guidedAutoAdvanceStateRef.current = { stepId: activeGuidedStepId, lastSatisfied: satisfied, armed: false };
      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
      if (satisfied) {
        const nextId = guidedStepIds[activeGuidedStepIndex + 1];
        onDiagnostic?.('steps.step.autoAdvance.skipImmediate', {
          from: activeGuidedStepId,
          to: nextId || null,
          gate: forwardGate,
          mode: autoAdvance,
          reason: 'stepChangeAlreadySatisfied'
        });
      }
      return;
    }

    // Disarm when the step is not satisfied.
    if (!satisfied) {
      guidedAutoAdvanceAttemptRef.current = null;
      guidedAutoAdvanceStateRef.current = { stepId: activeGuidedStepId, lastSatisfied: false, armed: false };
      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
      return;
    }

    // Arm when we transition from not-satisfied -> satisfied.
    const shouldArm = !state.lastSatisfied && satisfied;
    const nextState = { stepId: activeGuidedStepId, lastSatisfied: satisfied, armed: state.armed || shouldArm };
    guidedAutoAdvanceStateRef.current = nextState;
    if (shouldArm) {
      const nextId = guidedStepIds[activeGuidedStepIndex + 1];
      onDiagnostic?.('steps.step.autoAdvance.armed', {
        from: activeGuidedStepId,
        to: nextId || null,
        gate: forwardGate,
        mode: autoAdvance
      });
    }
    if (!nextState.armed) {
      guidedAutoAdvanceAttemptRef.current = null;
      return;
    }

    // Even when auto-advance is armed, never bypass the forward-gate reachability.
    // NOTE: We still track/arm while not reachable, so we don't lose the transition moment.
    const nextReachable = maxReachableGuidedIndex >= activeGuidedStepIndex + 1;
    if (!nextReachable) {
      guidedAutoAdvanceAttemptRef.current = null;
      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
      return;
    }

    if (guidedAutoAdvanceTimerRef.current) {
      globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
      guidedAutoAdvanceTimerRef.current = null;
    }

    let deferLogged = false;
    const attemptAdvance = () => {
      guidedAutoAdvanceTimerRef.current = null;
      const nextId = guidedStepIds[activeGuidedStepIndex + 1];
      if (!nextId) return;

      // If the user is actively editing inside the step, keep waiting (do not steal focus).
      try {
        const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
        const isTextEntryEl = (el: any): boolean => {
          if (!el) return false;
          const tag = (el.tagName || '').toString().toLowerCase();
          if (tag === 'textarea') return true;
          if (tag === 'input') {
            const type = ((el as any).type || 'text').toString().toLowerCase();
            // These input types are not "typing" contexts where auto-advance would feel like it steals focus.
            if (['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(type)) return false;
            return true;
          }
          return Boolean((el as any).isContentEditable);
        };
        if (
          activeEl &&
          guidedStepBodyRef.current &&
          guidedStepBodyRef.current.contains(activeEl) &&
          isTextEntryEl(activeEl)
        ) {
          if (!deferLogged) {
            const tag = (activeEl as any)?.tagName ? (activeEl as any).tagName.toString().toLowerCase() : null;
            const inputType = tag === 'input' ? (((activeEl as any).type || 'text').toString().toLowerCase() as any) : null;
            onDiagnostic?.('steps.step.autoAdvance.defer', {
              from: activeGuidedStepId,
              to: nextId,
              mode: autoAdvance,
              tag,
              inputType
            });
            deferLogged = true;
          }
          guidedAutoAdvanceTimerRef.current = globalThis.setTimeout(attemptAdvance, 220);
          return;
        }
      } catch (_) {
        // ignore focus detection failures
      }

      // Disarm for this satisfaction cycle and advance.
      const st = guidedAutoAdvanceStateRef.current;
      if (st && st.stepId === activeGuidedStepId) {
        guidedAutoAdvanceStateRef.current = { ...st, armed: false };
      }

      onDiagnostic?.('steps.step.autoAdvance', { from: activeGuidedStepId, to: nextId, gate: forwardGate, mode: autoAdvance });
      selectGuidedStep(nextId, 'auto');
    };

    guidedAutoAdvanceAttemptRef.current = attemptAdvance;
    guidedAutoAdvanceTimerRef.current = globalThis.setTimeout(attemptAdvance, 220);

    return () => {
      guidedAutoAdvanceAttemptRef.current = null;
      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
    };
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    guidedDefaultAutoAdvance,
    guidedDefaultForwardGate,
    guidedEnabled,
    guidedStepIds,
    guidedStatus.steps,
    guidedStepsCfg,
    maxReachableGuidedIndex,
    normalizeAutoAdvance,
    normalizeForwardGate,
    onDiagnostic,
    selectGuidedStep
  ]);

  // When auto-advance is armed and we're waiting for focus to leave a text entry element, kick an immediate re-check on blur.
  // This avoids relying solely on polling timers (especially on mobile browsers).
  useEffect(() => {
    if (!guidedEnabled) return;
    const handler = () => {
      if (!guidedAutoAdvanceAttemptRef.current) return;
      try {
        globalThis.setTimeout(() => {
          guidedAutoAdvanceAttemptRef.current?.();
        }, 0);
      } catch (_) {
        // ignore
      }
    };
    try {
      if (typeof document === 'undefined') return;
      document.addEventListener('focusout', handler, true);
      return () => {
        document.removeEventListener('focusout', handler, true);
      };
    } catch (_) {
      return;
    }
  }, [guidedEnabled]);

  useEffect(() => {
    if (!externalScrollAnchor) return;
    setPendingScrollAnchor(externalScrollAnchor);
    onExternalScrollConsumed?.();
    onDiagnostic?.('ui.autoscroll.external', { anchor: externalScrollAnchor });
  }, [externalScrollAnchor, onDiagnostic, onExternalScrollConsumed]);

  // Expose an imperative submit action so the bottom action bar can trigger the same submit
  // behavior (including the "scroll to first error" flow) without duplicating logic in App.tsx.
  useEffect(() => {
    if (!submitActionRef) return;
    submitActionRef.current = () => {
      if (submitting) return;
      const forceFinalSubmit = summarySubmitIntentRef?.current === true;
      if (summarySubmitIntentRef && summarySubmitIntentRef.current) {
        summarySubmitIntentRef.current = false;
      }
      const isGuidedFinalStep = guidedEnabled && guidedStepIds.length && activeGuidedStepIndex >= guidedStepIds.length - 1;

      // In guided steps, the bottom "Submit" action behaves like "Next" until the final step.
      // It should validate only the current step's visible targets (not the full form).
      if (guidedEnabled && guidedStepsCfg && guidedStepIds.length && !isGuidedFinalStep && !forceFinalSubmit) {
        const steps = guidedStepsCfg.items || [];
        const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
        const forwardGate = normalizeForwardGate(stepCfg?.navigation?.forwardGate ?? stepCfg?.forwardGate, guidedDefaultForwardGate);
        const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);

        // Step submission should never trigger guided auto-advance; keep the user on the step while we validate.
        if (guidedAutoAdvanceTimerRef.current) {
          globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
          guidedAutoAdvanceTimerRef.current = null;
        }
        guidedAutoAdvanceStateRef.current = { stepId: activeGuidedStepId, lastSatisfied: true, armed: false };

        const stepDefinition = buildGuidedStepDefinition(activeGuidedStepId) || definition;

        // For `whenComplete` steps: block advancement ONLY on missing step fields, but show inline errors.
        if (forwardGate === 'whenComplete' && !stepStatus?.complete) {
          const nextErrors = validateForm({
            definition: stepDefinition,
            language,
            values,
            lineItems,
            collapsedRows,
            collapsedSubgroups,
            requiredMode: 'stepComplete'
          });
          setErrors(nextErrors);
          const errorCount = Object.keys(nextErrors).length;
          onDiagnostic?.('steps.gate.blocked', {
            stepId: activeGuidedStepId,
            gate: forwardGate,
            errorCount,
            requiredMode: 'stepComplete'
          });
          if (errorCount) {
            errorNavRequestRef.current += 1;
            errorNavModeRef.current = 'focus';
            onDiagnostic?.('validation.navigate.request', {
              attempt: errorNavRequestRef.current,
              scope: 'guidedStep',
              mode: errorNavModeRef.current
            });
            return;
          }
          const firstTarget = (Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [])
            .concat(Array.isArray(stepCfg?.include) ? stepCfg.include : [])
            .find(
              (t: any) =>
                t && typeof t === 'object' && (t.kind || '').toString() === 'question' && (t.id || '').toString().trim()
            );
          if (firstTarget?.id) {
            try {
              navigateToFieldKey(firstTarget.id.toString());
            } catch (_) {
              // ignore
            }
          }
          return;
        }

        const nextErrors = validateForm({
          definition: stepDefinition,
          language,
          values,
          lineItems,
          collapsedRows,
          collapsedSubgroups
        });
        setErrors(nextErrors);
        // For `whenValid` steps: block advancement until the step has no validation errors.
        if (forwardGate !== 'whenComplete' && Object.keys(nextErrors).length) {
          onDiagnostic?.('steps.gate.blocked', {
            stepId: activeGuidedStepId,
            gate: forwardGate,
            errorCount: Object.keys(nextErrors).length,
            requiredMode: 'configured'
          });
          errorNavRequestRef.current += 1;
          errorNavModeRef.current = 'focus';
          onDiagnostic?.('validation.navigate.request', {
            attempt: errorNavRequestRef.current,
            scope: 'guidedStep',
            mode: errorNavModeRef.current
          });
          return;
        }

        const nextId = guidedStepIds[activeGuidedStepIndex + 1];
        if (nextId) {
          setErrors({});
          onDiagnostic?.('steps.step.change', { from: activeGuidedStepId, to: nextId, reason: 'submitNext' });
          selectGuidedStep(nextId, 'user');
        }
        return;
      }

      // Submitting should never trigger guided auto-advance; keep the user on the step while we validate.
      if (guidedEnabled) {
        if (guidedAutoAdvanceTimerRef.current) {
          globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
          guidedAutoAdvanceTimerRef.current = null;
        }
        guidedAutoAdvanceStateRef.current = { stepId: activeGuidedStepId, lastSatisfied: true, armed: false };
      }
      // Ensure status/progress messages are visible immediately when submit starts.
      try {
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (_) {
        // ignore
      }
      errorNavRequestRef.current += 1;
      errorNavModeRef.current = 'focus';
      onDiagnostic?.('validation.navigate.request', { attempt: errorNavRequestRef.current, mode: errorNavModeRef.current });
      void onSubmit({ collapsedRows, collapsedSubgroups }).catch((err: any) => {
        onDiagnostic?.('submit.exception', { message: err?.message || err || 'unknown' });
      });
    };
    return () => {
      submitActionRef.current = null;
    };
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    buildGuidedStepDefinition,
    collapsedRows,
    collapsedSubgroups,
    definition,
    guidedDefaultForwardGate,
    guidedEnabled,
    guidedStepIds,
    guidedStepsCfg,
    language,
    lineItems,
    onDiagnostic,
    onSubmit,
    selectGuidedStep,
    summarySubmitIntentRef,
    submitActionRef,
    submitting,
    values
  ]);

  useEffect(() => {
    if (!guidedBackActionRef) return;
    guidedBackActionRef.current = () => {
      if (!guidedEnabled) return;
      if (!guidedStepsCfg || !guidedStepIds.length) return;
      if (activeGuidedStepIndex <= 0) return;
      const stepCfg = (guidedStepsCfg.items || [])[activeGuidedStepIndex] as any;
      const allowBack = (stepCfg?.navigation?.allowBack ?? stepCfg?.allowBack) !== false;
      const showBackGlobal = (guidedStepsCfg as any)?.showBackButton !== false;
      const showBackStep = (stepCfg?.navigation?.showBackButton ?? stepCfg?.showBackButton) !== false;
      if (!allowBack || !showBackGlobal || !showBackStep) {
        onDiagnostic?.('steps.step.blocked', { from: activeGuidedStepId, to: activeGuidedStepIndex - 1, gate: 'allowBack', reason: 'backAction' });
        return;
      }
      const prevId = guidedStepIds[activeGuidedStepIndex - 1];
      if (!prevId) return;
      selectGuidedStep(prevId, 'user');
    };
    return () => {
      guidedBackActionRef.current = null;
    };
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    guidedBackActionRef,
    guidedEnabled,
    guidedStepIds,
    guidedStepsCfg,
    onDiagnostic,
    selectGuidedStep
  ]);

  useEffect(() => {
    if (!onGuidedUiChange) return;
    if (!guidedEnabled || !guidedStepsCfg || !guidedStepIds.length) {
      onGuidedUiChange(null);
      return;
    }
    const stepCfg = (guidedStepsCfg.items || [])[activeGuidedStepIndex] as any;
    const isFinal = activeGuidedStepIndex >= guidedStepIds.length - 1;
    const forwardGate = normalizeForwardGate(stepCfg?.navigation?.forwardGate ?? stepCfg?.forwardGate, guidedDefaultForwardGate);
    const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
    const forwardGateSatisfiedBase =
      forwardGate === 'free' ? true : forwardGate === 'whenComplete' ? !!stepStatus?.complete : !!stepStatus?.valid;
    const forwardGateSatisfied = forwardGateSatisfiedBase && !dedupNavigationBlocked;
    const allowBack = (stepCfg?.navigation?.allowBack ?? stepCfg?.allowBack) !== false;
    const showBackGlobal = (guidedStepsCfg as any)?.showBackButton !== false;
    const showBackStep = (stepCfg?.navigation?.showBackButton ?? stepCfg?.showBackButton) !== false;
    const backVisible = activeGuidedStepIndex > 0 && allowBack && showBackGlobal && showBackStep;
    const backLabel = resolveLocalizedString(
      (stepCfg?.navigation?.backLabel as any) || (guidedStepsCfg as any)?.backButtonLabel,
      language,
      tSystem('actions.back', language, 'Back')
    );
    const submitLabel = !isFinal
      ? resolveLocalizedString(
          (stepCfg?.navigation?.submitLabel as any) || (guidedStepsCfg as any)?.stepSubmitLabel,
          language,
          tSystem('steps.next', language, 'Next')
        )
      : null;
    onGuidedUiChange({
      activeStepId: activeGuidedStepId || null,
      activeStepIndex: activeGuidedStepIndex,
      stepCount: guidedStepIds.length,
      isFirst: activeGuidedStepIndex <= 0,
      isFinal,
      forwardGateSatisfied,
      backAllowed: allowBack,
      backVisible,
      backLabel: backLabel?.toString?.() || '',
      stepSubmitLabel: submitLabel || undefined
    });
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    guidedEnabled,
    guidedStepIds,
    guidedStepsCfg,
    guidedDefaultForwardGate,
    guidedStatus.steps,
    language,
    dedupNavigationBlocked,
    onGuidedUiChange
  ]);

  const hasBlurDerived = useMemo(() => {
    const hasInFields = (fields: any[]): boolean =>
      Array.isArray(fields) && fields.some(f => f && f.derivedValue && isBlurDerivedValue(f.derivedValue));
    return (definition.questions || []).some(q => {
      if ((q as any).derivedValue && isBlurDerivedValue((q as any).derivedValue)) return true;
      if (q.type !== 'LINE_ITEM_GROUP') return false;
      if (hasInFields(q.lineItemConfig?.fields || [])) return true;
      const subs = q.lineItemConfig?.subGroups || [];
      return subs.some(sub => hasInFields(((sub as any).fields || []) as any[]));
    });
  }, [definition.questions]);

  const blurDerivedDependencyIds = useMemo(() => {
    const deps = new Set<string>();
    const collectFromFields = (fields: any[]) => {
      (fields || []).forEach(field => {
        if (field?.id && isBlurDerivedValue(field?.derivedValue)) {
          deps.add(field.id.toString().trim());
        }
        collectDerivedBlurDependencies(field?.derivedValue, deps);
      });
    };
    const walkSubGroups = (subGroups: any[]) => {
      (subGroups || []).forEach(sub => {
        collectFromFields((sub as any)?.fields || []);
        if (Array.isArray((sub as any)?.subGroups) && (sub as any).subGroups.length) {
          walkSubGroups((sub as any).subGroups);
        }
      });
    };
    (definition.questions || []).forEach(q => {
      if (q.id && isBlurDerivedValue((q as any).derivedValue)) {
        deps.add(q.id.toString().trim());
      }
      collectDerivedBlurDependencies((q as any).derivedValue, deps);
      if (q.type !== 'LINE_ITEM_GROUP') return;
      collectFromFields(q.lineItemConfig?.fields || []);
      walkSubGroups(q.lineItemConfig?.subGroups || []);
    });
    return deps;
  }, [definition.questions]);

  const hideLabelQuestionIds = useMemo(() => {
    return (definition.questions || []).filter(q => q.ui?.hideLabel === true).map(q => q.id);
  }, [definition.questions]);

  const paragraphDisclaimerFieldIds = useMemo(() => {
    const ids = new Set<string>();
    (definition.questions || []).forEach(q => {
      if (q.type !== 'PARAGRAPH') return;
      const cfg = (q.ui as any)?.paragraphDisclaimer;
      if (!cfg) return;
      const id = (q.id || '').toString().trim();
      if (id) ids.add(id);
    });
    return ids;
  }, [definition.questions]);

  useEffect(() => {
    if (!onDiagnostic) return;
    (hideLabelQuestionIds || []).forEach(id => {
      const fieldId = (id || '').toString().trim();
      if (!fieldId) return;
      if (hideLabelLoggedRef.current.has(fieldId)) return;
      hideLabelLoggedRef.current.add(fieldId);
      onDiagnostic('ui.field.hideLabel', { fieldId });
    });
  }, [hideLabelQuestionIds, onDiagnostic]);

  const isParagraphDisclaimerFocused = useCallback((): boolean => {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    const tag = (active.tagName || '').toString().toLowerCase();
    if (tag !== 'textarea') return false;
    const root = active.closest('.ck-form-sections') || active.closest('.webform-overlay') || active.closest('.form-card');
    if (!root) return false;
    const fieldPath = (active.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
    if (!fieldPath) return false;
    if (fieldPath.includes('__')) return false;
    return paragraphDisclaimerFieldIds.has(fieldPath);
  }, [paragraphDisclaimerFieldIds]);

  const blurRecomputeTimerRef = useRef<number | null>(null);
  const overlayDetailBlurTimerRef = useRef<number | null>(null);

  const shallowEqualFieldValue = (a: FieldValue, b: FieldValue): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      const aa = Array.isArray(a) ? a : [a];
      const bb = Array.isArray(b) ? b : [b];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i += 1) {
        if ((aa[i] as any) !== (bb[i] as any)) return false;
      }
      return true;
    }
    return false;
  };

  const diffValues = (a: Record<string, FieldValue>, b: Record<string, FieldValue>): string[] => {
    const changed: string[] = [];
    const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
    keys.forEach(k => {
      if (!shallowEqualFieldValue((a as any)[k], (b as any)[k])) changed.push(k);
    });
    return changed;
  };

  const lineItemsEqual = (a: LineItemState, b: LineItemState): boolean => {
    if (a === b) return true;
    const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
    for (const key of keys) {
      const ra = (a as any)[key] || [];
      const rb = (b as any)[key] || [];
      if (ra.length !== rb.length) return false;
      for (let i = 0; i < ra.length; i += 1) {
        const rowA = ra[i];
        const rowB = rb[i];
        if (!rowA || !rowB) return false;
        if (rowA.id !== rowB.id) return false;
        const va = rowA.values || {};
        const vb = rowB.values || {};
        const vKeys = Array.from(new Set([...Object.keys(va), ...Object.keys(vb)]));
        for (const fid of vKeys) {
          if (!shallowEqualFieldValue((va as any)[fid], (vb as any)[fid])) return false;
        }
      }
    }
    return true;
  };

  const recomputeDerivedOnBlur = useCallback(
    (meta?: { fieldPath?: string; tag?: string }) => {
      if (!hasBlurDerived) return;
      const currentValues = valuesRef.current;
      const currentLineItems = lineItemsRef.current;
      const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, currentValues, currentLineItems, {
        mode: 'blur'
      });

      const changedFields = diffValues(currentValues, nextValues);
      const lineChanged = !lineItemsEqual(currentLineItems, nextLineItems);
      if (!changedFields.length && !lineChanged) return;

      if (changedFields.length) {
        valuesRef.current = nextValues;
        setValues(nextValues);
      }
      if (lineChanged) {
        lineItemsRef.current = nextLineItems;
        setLineItems(nextLineItems);
      }
      const sourceGroupKey = (() => {
        const fp = meta?.fieldPath || '';
        if (!fp.includes('__')) return '';
        return fp.split('__')[0] || '';
      })();
      if (sourceGroupKey) {
        runSelectionEffectsForAncestorRows(sourceGroupKey, currentLineItems, nextLineItems, {
          mode: 'blur',
          topValues: nextValues
        });
      }
      onDiagnostic?.('derived.blur.apply', {
        fieldPath: meta?.fieldPath,
        tag: meta?.tag,
        changedCount: changedFields.length,
        changedFields: changedFields.slice(0, 12),
        lineItemsChanged: lineChanged
      });
    },
    [definition, hasBlurDerived, onDiagnostic, setLineItems, setValues]
  );

  const buildLineItemGroupOverlayValidationDefinition = (): WebFormDefinition | null => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return null;
    const overrideGroup = lineItemGroupOverlay.group;
    const baseGroup =
      overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
        ? overrideGroup
        : definition.questions.find(q => q.id === lineItemGroupOverlay.groupId && q.type === 'LINE_ITEM_GROUP');
    if (!baseGroup) return null;
    const baseConfig = (baseGroup as any).lineItemConfig;
    if (!baseConfig) return null;
    const rowFilter = lineItemGroupOverlay.rowFilter || null;
    const nextConfig = rowFilter ? { ...baseConfig, _guidedRowFilter: rowFilter } : baseConfig;
    const validationGroup =
      nextConfig === baseConfig ? baseGroup : ({ ...(baseGroup as any), lineItemConfig: nextConfig } as WebQuestionDefinition);
    return { ...(definition as any), questions: [validationGroup] } as WebFormDefinition;
  };

  const buildSubgroupOverlayValidationDefinition = (): WebFormDefinition | null => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return null;
    const subKey = subgroupOverlay.subKey;
    const subgroupDefs = resolveSubgroupDefs(subKey);
    const parentGroup = subgroupDefs.root;
    const subConfigBase = subgroupDefs.sub;
    if (!parentGroup || !subConfigBase) return null;
    const overlayRowFilter = subgroupOverlay.rowFilter || null;
    const subConfig = subgroupOverlay.groupOverride
      ? applyLineItemGroupOverride(subConfigBase, subgroupOverlay.groupOverride)
      : subConfigBase;
    const nextConfig = overlayRowFilter ? { ...subConfig, _guidedRowFilter: overlayRowFilter } : subConfig;
    const validationGroup: WebQuestionDefinition = {
      ...(parentGroup as any),
      id: subKey,
      lineItemConfig: { ...(nextConfig as any), fields: nextConfig.fields || [], subGroups: nextConfig.subGroups || [] }
    };
    return { ...(definition as any), questions: [validationGroup] } as WebFormDefinition;
  };

  const validateErrorsOnBlur = useCallback(
    (fieldPath?: string, meta?: { tag?: string; inputType?: string }) => {
      const fp = (fieldPath || '').toString();
      if (!fp) return;
      try {
        const parts = fp.split('__');
        const isLine = parts.length >= 3;
        const groupId = isLine ? parts[0] : '';
        const rowId = isLine ? parts[2] : '';
        const overlayDefinition =
          isLine && lineItemGroupOverlay.open && lineItemGroupOverlay.groupId === groupId
            ? buildLineItemGroupOverlayValidationDefinition()
            : isLine && subgroupOverlay.open && subgroupOverlay.subKey === groupId
              ? buildSubgroupOverlayValidationDefinition()
              : null;
        const stepDefinition = !overlayDefinition && guidedEnabled ? buildGuidedStepDefinition(activeGuidedStepId) : null;
        const validationDefinition = overlayDefinition || stepDefinition || definition;
        const requiredMode = (() => {
          if (overlayDefinition || !guidedEnabled || !guidedStepsCfg || !stepDefinition) return 'configured';
          const steps = guidedStepsCfg.items || [];
          const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
          const gate = normalizeForwardGate(stepCfg?.navigation?.forwardGate ?? stepCfg?.forwardGate, guidedDefaultForwardGate);
          return gate === 'whenComplete' ? 'stepComplete' : 'configured';
        })();
        const nextErrors = validateForm({
          definition: validationDefinition,
          language,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          collapsedRows: collapsedRowsRef.current,
          collapsedSubgroups: collapsedSubgroupsRef.current,
          requiredMode
        });
        const nextMessage = nextErrors[fp];
        setErrors(prev => {
          if (isLine && groupId && rowId) {
            const rowPrefix = `${groupId}__`;
            const rowSuffix = `__${rowId}`;
            const next = { ...prev };
            let changed = false;
            const nextRowKeys = Object.keys(nextErrors).filter(key => key.startsWith(rowPrefix) && key.endsWith(rowSuffix));
            const nextRowKeySet = new Set(nextRowKeys);
            Object.keys(prev).forEach(key => {
              if (key.startsWith(rowPrefix) && key.endsWith(rowSuffix) && !nextRowKeySet.has(key)) {
                delete next[key];
                changed = true;
              }
            });
            nextRowKeys.forEach(key => {
              const message = nextErrors[key];
              if (next[key] !== message) {
                next[key] = message;
                changed = true;
              }
            });
            if (!changed) return prev;
            return next;
          }
          const currentMessage = prev[fp];
          if (!nextMessage && !currentMessage) return prev;
          if (nextMessage === currentMessage) return prev;
          const next = { ...prev };
          if (nextMessage) {
            next[fp] = nextMessage;
          } else {
            delete next[fp];
          }
          return next;
        });
        onDiagnostic?.('validation.errors.blur', {
          fieldPath: fp,
          tag: meta?.tag || null,
          inputType: meta?.inputType || null,
          hasError: Boolean(nextMessage)
        });
      } catch (err: any) {
        onDiagnostic?.('validation.errors.blur.failed', {
          fieldPath: fp,
          message: err?.message || err || 'unknown'
        });
      }
    },
    [
      buildLineItemGroupOverlayValidationDefinition,
      buildSubgroupOverlayValidationDefinition,
      buildGuidedStepDefinition,
      activeGuidedStepId,
      definition,
      guidedDefaultForwardGate,
      guidedEnabled,
      guidedStepsCfg,
      language,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      onDiagnostic,
      setErrors,
      subgroupOverlay.open,
      subgroupOverlay.subKey
    ]
  );

  const groupSections = useMemo(() => {
    type GroupSection = {
      key: string;
      title?: string;
      collapsible: boolean;
      defaultCollapsed: boolean;
      isHeader: boolean;
      pageSectionKey?: string;
      pageSectionTitle?: string;
      pageSectionInfoText?: string;
      questions: WebQuestionDefinition[];
      order: number;
    };

    const resolveGroupKey = (group?: QuestionGroupConfig): string => {
      if (!group) return '__default__';
      if (group.id) return group.id.toString();
      if (group.header) return '__header__';
      const rawTitle: any = group.title;
      if (typeof rawTitle === 'string') {
        const t = rawTitle.trim();
        if (t) return `title:${t}`;
      }
      if (rawTitle && typeof rawTitle === 'object') {
        const t = (rawTitle.en || rawTitle.fr || rawTitle.nl || '').toString().trim();
        if (t) return `title:${t}`;
      }
      return '__default__';
    };

    const map = new Map<string, GroupSection>();
    let order = 0;

    (definition.questions || []).forEach(q => {
      const legacyHeader = !!(q as any).header;
      const group: QuestionGroupConfig | undefined =
        (q as any).group ||
        (legacyHeader
          ? {
              header: true,
              title: { en: 'Header', fr: 'Header', nl: 'Header' },
              collapsible: true
            }
          : undefined);

      const isHeader = !!group?.header;
      const key = resolveGroupKey(group);
      const title = group?.title ? resolveLocalizedString(group.title as any, language, isHeader ? 'Header' : '') : undefined;
      const collapsible = group?.collapsible !== undefined ? !!group.collapsible : !!title;
      const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;
      const pageSectionKey = !isHeader ? resolvePageSectionKey(group) : '__none__';
      const pageSectionTitle =
        !isHeader && group?.pageSection?.title ? resolveLocalizedString(group.pageSection.title as any, language, '') : undefined;
      const pageSectionInfoText =
        !isHeader && group?.pageSection?.infoText ? resolveLocalizedString(group.pageSection.infoText as any, language, '') : undefined;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          title,
          collapsible,
          defaultCollapsed,
          isHeader,
          pageSectionKey,
          pageSectionTitle,
          pageSectionInfoText,
          questions: [q],
          order: order++
        });
        return;
      }

      existing.questions.push(q);
      if (!existing.title && title) existing.title = title;
      existing.isHeader = existing.isHeader || isHeader;
      existing.collapsible = existing.collapsible || collapsible;
      existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
      if (!existing.pageSectionKey && pageSectionKey) existing.pageSectionKey = pageSectionKey;
      if (!existing.pageSectionTitle && pageSectionTitle) existing.pageSectionTitle = pageSectionTitle;
      if (!existing.pageSectionInfoText && pageSectionInfoText) existing.pageSectionInfoText = pageSectionInfoText;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.isHeader !== b.isHeader) return a.isHeader ? -1 : 1;
      return a.order - b.order;
    });
  }, [definition.questions, language]);

  const groupSectionBlocks = useMemo(() => buildPageSectionBlocks(groupSections), [groupSections]);

  useEffect(() => {
    const pageSectionBlocks = groupSectionBlocks.filter(b => b.kind === 'pageSection');
    if (!pageSectionBlocks.length) {
      onDiagnostic?.('ui.pageSections.disabled', { reason: 'noPageSectionConfig' });
      return;
    }
    const groupedCount = pageSectionBlocks.reduce((acc, b) => acc + (b.kind === 'pageSection' ? b.groups.length : 0), 0);
    onDiagnostic?.('ui.pageSections.enabled', {
      blockCount: groupSectionBlocks.length,
      pageSectionBlockCount: pageSectionBlocks.length,
      groupedGroupCount: groupedCount
    });
  }, [groupSectionBlocks, onDiagnostic]);

  const questionIdToGroupKey = useMemo(() => {
    const map: Record<string, string> = {};
    groupSections.forEach(section => {
      section.questions.forEach(q => {
        map[q.id] = section.key;
      });
    });
    return map;
  }, [groupSections]);

  const nestedGroupMeta = useMemo(() => {
    const collapsibleDefaults: Array<{ key: string; defaultCollapsed: boolean }> = [];
    const lineFieldToGroupKey: Record<string, string> = {};
    const subgroupFieldToGroupKey: Record<string, string> = {};

    const pushSectionDefaults = (prefix: string, fields: any[]) => {
      const sectionMeta = new Map<string, { defaultCollapsed: boolean; collapsible: boolean; titlePresent: boolean }>();
      (fields || []).forEach(field => {
        const group: QuestionGroupConfig | undefined = (field as any)?.group;
        const sectionKey = resolveGroupSectionKey(group);
        const titlePresent = !!(group && (group as any).title !== undefined && (group as any).title !== null && `${(group as any).title}`.trim());
        const collapsible = group?.collapsible !== undefined ? !!group.collapsible : titlePresent;
        const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;
        const existing = sectionMeta.get(sectionKey);
        if (!existing) {
          sectionMeta.set(sectionKey, { collapsible, defaultCollapsed, titlePresent });
        } else {
          existing.collapsible = existing.collapsible || collapsible;
          existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
          existing.titlePresent = existing.titlePresent || titlePresent;
        }
      });
      sectionMeta.forEach((meta, sectionKey) => {
        if (!meta.collapsible) return;
        collapsibleDefaults.push({ key: `${prefix}:${sectionKey}`, defaultCollapsed: meta.defaultCollapsed });
      });
    };

    (definition.questions || []).forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;

      const fields = q.lineItemConfig?.fields || [];
      fields.forEach(field => {
        const sectionKey = resolveGroupSectionKey((field as any)?.group);
        lineFieldToGroupKey[`${q.id}__${field.id}`] = `li:${q.id}:${sectionKey}`;
      });
      pushSectionDefaults(`li:${q.id}`, fields);

      const walkSubGroups = (subs: any[], path: string[]) => {
        (subs || []).forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const nextPath = [...path, subId];
          const pathKey = nextPath.join('.');
          const subFields = (sub as any).fields || [];
          subFields.forEach((field: any) => {
            const sectionKey = resolveGroupSectionKey((field as any)?.group);
            subgroupFieldToGroupKey[`${q.id}::${pathKey}__${field.id}`] = `sub:${q.id}:${pathKey}:${sectionKey}`;
          });
          pushSectionDefaults(`sub:${q.id}:${pathKey}`, subFields);
          const deeper = (sub as any)?.subGroups || [];
          if (deeper.length) walkSubGroups(deeper, nextPath);
        });
      };

      walkSubGroups(q.lineItemConfig?.subGroups || [], []);
    });

    return { collapsibleDefaults, lineFieldToGroupKey, subgroupFieldToGroupKey };
  }, [definition.questions]);

  const resolveSubgroupDefs = useCallback(
    (subKey: string): { info: ReturnType<typeof parseSubgroupKey>; root?: WebQuestionDefinition; parent?: any; sub?: any } => {
      const info = parseSubgroupKey(subKey);
      if (!info) return { info: null };
      const root = definition.questions.find(q => q.id === info.rootGroupId);
      if (!root || root.type !== 'LINE_ITEM_GROUP') return { info, root };
      let parent: any = root;
      let sub: any;
      for (let i = 0; i < info.path.length; i += 1) {
        const subId = info.path[i];
        const subs = (parent?.lineItemConfig?.subGroups || parent?.subGroups || []) as any[];
        const match = subs.find(s => resolveSubgroupKey(s) === subId);
        if (!match) break;
        if (i === info.path.length - 1) {
          sub = match;
          break;
        }
        parent = match;
      }
      return { info, root, parent, sub };
    },
    [definition.questions]
  );

  const resolveLineItemGroupForKey = useCallback(
    (groupKey: string): WebQuestionDefinition | null => {
      if (!groupKey) return null;
      const parsed = parseSubgroupKey(groupKey);
      if (!parsed) {
        const root = definition.questions.find(q => q.id === groupKey && q.type === 'LINE_ITEM_GROUP');
        return root || null;
      }
      const defs = resolveSubgroupDefs(groupKey);
      if (!defs.root || defs.root.type !== 'LINE_ITEM_GROUP') return null;
      const subCfg = defs.sub;
      if (!subCfg) return null;
      return {
        ...defs.root,
        id: groupKey,
        lineItemConfig: {
          ...(subCfg as any),
          fields: subCfg?.fields || [],
          subGroups: subCfg?.subGroups || []
        }
      } as WebQuestionDefinition;
    },
    [definition.questions, resolveSubgroupDefs]
  );

  const attemptOverlayDetailAutoOpen = useCallback(
    (args: {
      group: WebQuestionDefinition;
      rowId: string;
      rowValues: Record<string, FieldValue>;
      nextValues: Record<string, FieldValue>;
      nextLineItems: LineItemState;
      triggerFieldId?: string;
      source: 'change' | 'blur';
    }) => {
      const { group, rowId, rowValues, nextValues, nextLineItems, triggerFieldId, source } = args;
      if (!group?.id || !rowId) return;
      const overlayTarget =
        lineItemGroupOverlay.open &&
        lineItemGroupOverlay.groupId === group.id &&
        lineItemGroupOverlay.source === 'overlayOpenAction'
          ? {
              groupKey: lineItemGroupOverlay.groupId,
              rowFilter: lineItemGroupOverlay.rowFilter || null,
              groupCfg: group.lineItemConfig
            }
          : subgroupOverlay.open && subgroupOverlay.subKey === group.id && subgroupOverlay.source === 'overlayOpenAction'
            ? {
                groupKey: subgroupOverlay.subKey,
                rowFilter: subgroupOverlay.rowFilter || null,
                groupCfg: group.lineItemConfig
              }
            : null;
      if (!overlayTarget?.groupCfg) return;
      const overlayDetail = (overlayTarget.groupCfg as any)?.ui?.overlayDetail as any;
      const overlayDetailEnabled = !!overlayDetail?.enabled && !!overlayDetail?.body?.subGroupId;
      if (!overlayDetailEnabled) return;
      const isIncluded = overlayTarget.rowFilter ? matchesOverlayRowFilter(rowValues, overlayTarget.rowFilter) : true;
      if (!isIncluded) {
        overlayDetailHeaderCompleteRef.current.set(`${overlayTarget.groupKey}::${rowId}`, false);
        return;
      }
      const groupCtx: VisibilityContext = {
        getValue: fid => (nextValues as any)[fid],
        getLineValue: (_rowId, fid) => (rowValues as any)[fid],
        getLineItems: groupId => nextLineItems[groupId] || [],
        getLineItemKeys: () => Object.keys(nextLineItems)
      };
      const headerFields = resolveOverlayHeaderFields(overlayTarget.groupCfg, overlayDetail);
      if (!headerFields.length) return;
      const headerComplete = areOverlayHeaderFieldsComplete({
        fields: headerFields,
        rowValues,
        ctx: groupCtx,
        rowId,
        linePrefix: group.id
      });
      const rowKey = `${overlayTarget.groupKey}::${rowId}`;
      const prevComplete = overlayDetailHeaderCompleteRef.current.get(rowKey) === true;
      overlayDetailHeaderCompleteRef.current.set(rowKey, headerComplete);
      if (!headerComplete) return;
      const headerFieldIds = headerFields.map(field => field.id);
      const triggerIsHeaderField = !!triggerFieldId && headerFieldIds.includes(triggerFieldId);
      if (!prevComplete && source === 'change' && triggerIsHeaderField) {
        onDiagnostic?.('lineItems.overlayDetail.autoOpen.defer', {
          groupId: overlayTarget.groupKey,
          rowId,
          triggerFieldId,
          source
        });
        return;
      }
      const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
      const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
      const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
      const mode: 'view' | 'edit' = overlayDetailCanView ? 'view' : 'edit';
      setOverlayDetailSelection(prev => {
        if (prev && prev.groupId === overlayTarget.groupKey && prev.rowId === rowId && prev.mode === mode) return prev;
        return { groupId: overlayTarget.groupKey, rowId, mode };
      });
      onDiagnostic?.('lineItems.overlayDetail.autoOpen', {
        groupId: overlayTarget.groupKey,
        rowId,
        mode,
        source: source === 'blur' ? 'headerComplete.blur' : 'headerComplete'
      });
    },
    [lineItemGroupOverlay, onDiagnostic, subgroupOverlay]
  );

  useEffect(() => {
    const handler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const role = (target.getAttribute('role') || '').toString().trim().toLowerCase();
      const isInputLike = tag === 'input' || tag === 'textarea' || tag === 'select';
      const isButtonLike =
        tag === 'button' || role === 'button' || role === 'radio' || role === 'option' || role === 'combobox';
      if (!isInputLike && !isButtonLike) return;
      // Derived-value blur recompute should run for any field blur within the form content, including guided steps.
      // Note: guided step content is not always wrapped in `.form-card`, so use `.ck-form-sections` as a stable root.
      const root = target.closest('.ck-form-sections') || target.closest('.webform-overlay') || target.closest('.form-card');
      if (!root) return;
      const fieldPath = (target.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
      const inputType = (target as any)?.type !== undefined && (target as any)?.type !== null ? String((target as any).type) : undefined;

      // Surface blur events to the app shell (used for warning UX + telemetry).
      if (onUserEdit && fieldPath) {
        const fp = fieldPath.toString();
        const parts = fp.split('__');
        const isLine = parts.length >= 3;
        onUserEdit({
          scope: isLine ? 'line' : 'top',
          fieldPath: fp,
          fieldId: isLine ? parts[1] : fp,
          groupId: isLine ? parts[0] : undefined,
          rowId: isLine ? parts[2] : undefined,
          event: 'blur',
          tag,
          inputType
        });
      }

      const blurredFieldId = (() => {
        if (!fieldPath) return '';
        const parts = fieldPath.split('__');
        if (parts.length >= 2) return (parts[1] || '').toString().trim();
        return fieldPath.toString().trim();
      })();
      const shouldRecomputeBlurDerived =
        !!fieldPath && hasBlurDerived && (!blurDerivedDependencyIds.size || (blurredFieldId ? blurDerivedDependencyIds.has(blurredFieldId) : true));

      if (fieldPath && !shouldRecomputeBlurDerived) {
        validateErrorsOnBlur(fieldPath, { tag, inputType });
      }

      if (paragraphDisclaimerTimerRef.current !== null) {
        window.clearTimeout(paragraphDisclaimerTimerRef.current);
      }
      paragraphDisclaimerTimerRef.current = window.setTimeout(() => {
        paragraphDisclaimerTimerRef.current = null;
        if (!paragraphDisclaimerPendingRef.current) return;
        paragraphDisclaimerSyncRef.current?.('blur');
      }, 0);

      const lineField = fieldPath ? parseLineFieldPath(fieldPath.toString()) : null;
      if (lineField) {
        if (overlayDetailBlurTimerRef.current !== null) {
          window.clearTimeout(overlayDetailBlurTimerRef.current);
        }
        overlayDetailBlurTimerRef.current = window.setTimeout(() => {
          overlayDetailBlurTimerRef.current = null;
          const groupDef = resolveLineItemGroupForKey(lineField.groupId);
          if (!groupDef) return;
          const rows = lineItemsRef.current[lineField.groupId] || [];
          const row = rows.find(r => r.id === lineField.rowId);
          if (!row) return;
          attemptOverlayDetailAutoOpen({
            group: groupDef,
            rowId: lineField.rowId,
            rowValues: (row.values || {}) as Record<string, FieldValue>,
            nextValues: valuesRef.current,
            nextLineItems: lineItemsRef.current,
            triggerFieldId: lineField.fieldId,
            source: 'blur'
          });
        }, 0);
      }

      if (hasBlurDerived) {
        if (!shouldRecomputeBlurDerived) {
          onDiagnostic?.('derived.blur.skip', { fieldPath, blurredFieldId });
          return;
        }
        if (blurRecomputeTimerRef.current !== null) {
          window.clearTimeout(blurRecomputeTimerRef.current);
        }
        blurRecomputeTimerRef.current = window.setTimeout(() => {
          blurRecomputeTimerRef.current = null;
          recomputeDerivedOnBlur({ fieldPath, tag });
          if (fieldPath) {
            validateErrorsOnBlur(fieldPath, { tag, inputType });
          }
        }, 0);
      }
    };
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusout', handler, true);
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
        blurRecomputeTimerRef.current = null;
      }
      if (overlayDetailBlurTimerRef.current !== null) {
        window.clearTimeout(overlayDetailBlurTimerRef.current);
        overlayDetailBlurTimerRef.current = null;
      }
      if (paragraphDisclaimerTimerRef.current !== null) {
        window.clearTimeout(paragraphDisclaimerTimerRef.current);
        paragraphDisclaimerTimerRef.current = null;
      }
    };
  }, [
    attemptOverlayDetailAutoOpen,
    blurDerivedDependencyIds,
    hasBlurDerived,
    onDiagnostic,
    onUserEdit,
    recomputeDerivedOnBlur,
    resolveLineItemGroupForKey,
    validateErrorsOnBlur
  ]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      groupSections.forEach(section => {
        if (!section.collapsible) return;
        if (next[section.key] === undefined) {
          next[section.key] = !!section.defaultCollapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groupSections]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      (nestedGroupMeta.collapsibleDefaults || []).forEach(entry => {
        if (next[entry.key] === undefined) {
          next[entry.key] = !!entry.defaultCollapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [nestedGroupMeta.collapsibleDefaults]);

  const autoCollapseGroups = Boolean(definition.groupBehavior?.autoCollapseOnComplete);
  const autoOpenNextIncomplete = Boolean(definition.groupBehavior?.autoOpenNextIncomplete);
  const autoScrollOnExpand =
    definition.groupBehavior?.autoScrollOnExpand !== undefined
      ? Boolean(definition.groupBehavior.autoScrollOnExpand)
      : autoCollapseGroups;

  const topLevelGroupKeySet = useMemo(() => {
    // Only top-level groups (exclude header group).
    return new Set(groupSections.filter(s => !s.isHeader).map(s => s.key));
  }, [groupSections]);

  const scrollGroupToTop = useCallback(
    (groupKey: string, args?: { behavior?: ScrollBehavior; reason?: string }) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const reason = (args?.reason || 'expand').toString();
      const escaped = (groupKey || '').toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = document.querySelector<HTMLElement>(`[data-group-key="${escaped}"]`);
      if (!el) {
        onDiagnostic?.('ui.group.scrollIntoView.miss', { groupKey, reason });
        return;
      }

      const header = document.querySelector<HTMLElement>('.ck-app-header');
      const topBar = document.querySelector<HTMLElement>('.ck-top-action-bar');
      const headerRect = header?.getBoundingClientRect();
      const topBarRect = topBar?.getBoundingClientRect();
      // Use the bottom edge of the sticky stack (header + top action bar) for a reliable offset.
      const stickyBottom = Math.max(0, headerRect?.bottom || 0, topBarRect?.bottom || 0);
      const offset = Math.round(stickyBottom + 16);
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport || null;
      const scrollEl = document.scrollingElement as HTMLElement | null;
      const docEl = document.documentElement as HTMLElement | null;
      const bodyEl = document.body as HTMLElement | null;
      const vvPageTop = vv && typeof vv.pageTop === 'number' ? vv.pageTop : null;

      const snapshotScroll = () => {
        const win = typeof window.scrollY === 'number' ? window.scrollY : 0;
        const se = scrollEl && typeof scrollEl.scrollTop === 'number' ? scrollEl.scrollTop : null;
        const doc = docEl && typeof docEl.scrollTop === 'number' ? docEl.scrollTop : null;
        const body = bodyEl && typeof bodyEl.scrollTop === 'number' ? bodyEl.scrollTop : null;
        return { win, se, doc, body };
      };

      const before = snapshotScroll();
      const baseScrollTop = Math.max(
        0,
        before.win || 0,
        before.se || 0,
        before.doc || 0,
        before.body || 0,
        vvPageTop || 0
      );
      const targetTop = Math.max(0, baseScrollTop + rect.top - offset);
      const behavior: ScrollBehavior =
        args?.behavior || (reason.toLowerCase().startsWith('auto') ? 'auto' : 'smooth');

      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
          // iPadOS 13+ reports as MacIntel but has touch points.
          (navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1));
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const computeStickyOffset = () => {
        const headerNow = document.querySelector<HTMLElement>('.ck-app-header');
        const topBarNow = document.querySelector<HTMLElement>('.ck-top-action-bar');
        const headerRectNow = headerNow?.getBoundingClientRect();
        const topBarRectNow = topBarNow?.getBoundingClientRect();
        const stickyBottomNow = Math.max(0, headerRectNow?.bottom || 0, topBarRectNow?.bottom || 0);
        const offsetNow = Math.round(stickyBottomNow + 16);
        return { offsetNow, stickyBottomNow, headerRectNow, topBarRectNow };
      };

      const setScrollTop = (top: number) => {
        const next = Math.max(0, top);
        try {
          window.scrollTo(0, next);
        } catch (_) {
          // ignore
        }
        try {
          if (scrollEl) scrollEl.scrollTop = next;
          if (docEl) docEl.scrollTop = next;
          if (bodyEl) bodyEl.scrollTop = next;
        } catch (_) {
          // ignore
        }
      };

      // iOS smooth scrolling can drift while the browser chrome animates, which makes any single
      // precomputed target land slightly under the sticky header. For manual expand/collapse we
      // run a single custom smooth animation that re-applies the intended target each frame, so
      // there's no visible "correction jump" at the end.
      if (isIOS && behavior === 'smooth' && !prefersReducedMotion && typeof window.requestAnimationFrame === 'function') {
        // Cancel any in-flight scroll animation.
        if (groupScrollAnimRafRef.current) {
          try {
            window.cancelAnimationFrame(groupScrollAnimRafRef.current);
          } catch (_) {
            // ignore
          }
          groupScrollAnimRafRef.current = 0;
        }

        const absoluteTop = baseScrollTop + rect.top;
        const initialTargetTop = Math.max(0, absoluteTop - offset);
        const distance = Math.abs(initialTargetTop - baseScrollTop);
        const durationMs = Math.min(420, Math.max(200, Math.round(distance * 0.15 + 180)));
        const startTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

        const easeInOutCubic = (t: number) => {
          const p = Math.max(0, Math.min(1, t));
          return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        };

        const step = (ts: number) => {
          const now = ts || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
          const p = Math.min(1, Math.max(0, (now - startTime) / durationMs));
          const eased = easeInOutCubic(p);

          const { offsetNow } = computeStickyOffset();
          const targetNow = Math.max(0, absoluteTop - offsetNow);
          const nextTop = baseScrollTop + (targetNow - baseScrollTop) * eased;
          setScrollTop(nextTop);

          if (p < 1) {
            groupScrollAnimRafRef.current = window.requestAnimationFrame(step);
            return;
          }
          groupScrollAnimRafRef.current = 0;
          setScrollTop(targetNow);

          const after = snapshotScroll();
          const rectAfter = el.getBoundingClientRect();
          onDiagnostic?.('ui.group.scrollIntoView', {
            groupKey,
            reason,
            mode: 'customSmooth',
            durationMs,
            offsetPx: offset,
            stickyBottomPx: Math.round(stickyBottom),
            headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
            topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
            rectTopPx: Math.round(rectAfter.top),
            baseScrollTopPx: Math.round(baseScrollTop),
            targetTopPx: Math.round(targetNow),
            scrollYPx: Math.round(window.scrollY),
            scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
            docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
            bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
            vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
            vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
          });
        };

        groupScrollAnimRafRef.current = window.requestAnimationFrame(step);
        return;
      }

      const finalizeAlignment = () => {
        try {
          const { offsetNow } = computeStickyOffset();
          const vvNow = window.visualViewport || null;
          const vvNowPageTop = vvNow && typeof vvNow.pageTop === 'number' ? vvNow.pageTop : null;
          const rectNow = el.getBoundingClientRect();
          const now = snapshotScroll();
          const baseNow = Math.max(
            0,
            now.win || 0,
            now.se || 0,
            now.doc || 0,
            now.body || 0,
            vvNowPageTop || 0
          );
          const targetNow = Math.max(0, baseNow + rectNow.top - offsetNow);
          const misaligned = Math.abs(rectNow.top - offsetNow) > 2;
          if (!misaligned) return;
          if (Math.abs(targetNow - baseNow) < 2) return;

          // Use non-smooth scrolling for the correction pass (smooth can drift on iOS during viewport changes).
          try {
            window.scrollTo({ top: targetNow, behavior: 'auto' });
          } catch (_) {
            window.scrollTo(0, targetNow);
          }
          try {
            scrollEl?.scrollTo?.({ top: targetNow, behavior: 'auto' });
          } catch (_) {
            // ignore
          }
          try {
            if (scrollEl) scrollEl.scrollTop = targetNow;
            if (docEl) docEl.scrollTop = targetNow;
            if (bodyEl) bodyEl.scrollTop = targetNow;
          } catch (_) {
            // ignore
          }

          onDiagnostic?.('ui.group.scrollIntoView.adjust', {
            groupKey,
            reason,
            rectTopPx: Math.round(rectNow.top),
            offsetPx: Math.round(offsetNow),
            baseScrollTopPx: Math.round(baseNow),
            targetTopPx: Math.round(targetNow),
            vvPageTopPx: vvNow && typeof vvNow.pageTop === 'number' ? Math.round(vvNow.pageTop) : null,
            scrollYPx: Math.round(window.scrollY)
          });
        } catch (_) {
          // ignore
        }
      };

      try {
        // Try the browser's preferred scrolling mechanism first.
        window.scrollTo({ top: targetTop, behavior });
        // Some iOS webviews ignore window.scrollTo but respect scrollingElement.
        try {
          scrollEl?.scrollTo?.({ top: targetTop, behavior });
        } catch (_) {
          // ignore
        }

        // For non-smooth scroll, also assign common scrollTop targets directly.
        if (behavior !== 'smooth') {
          try {
            if (scrollEl) scrollEl.scrollTop = targetTop;
            if (docEl) docEl.scrollTop = targetTop;
            if (bodyEl) bodyEl.scrollTop = targetTop;
          } catch (_) {
            // ignore
          }
        }

        const after = snapshotScroll();
        onDiagnostic?.('ui.group.scrollIntoView', {
          groupKey,
          reason,
          offsetPx: offset,
          stickyBottomPx: Math.round(stickyBottom),
          headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
          topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
          rectTopPx: Math.round(rect.top),
          baseScrollTopPx: Math.round(baseScrollTop),
          targetTopPx: Math.round(targetTop),
          scrollYPx: Math.round(window.scrollY),
          scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
          docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
          bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
          vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
          vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
        });

        // Verify and force-scroll if nothing moved (common iOS/webview failure mode).
        if (Math.abs(targetTop - baseScrollTop) > 2) {
          window.setTimeout(() => {
            const check = snapshotScroll();
            const moved =
              Math.abs((check.win || 0) - (before.win || 0)) > 2 ||
              Math.abs((check.se || 0) - (before.se || 0)) > 2 ||
              Math.abs((check.doc || 0) - (before.doc || 0)) > 2 ||
              Math.abs((check.body || 0) - (before.body || 0)) > 2;
            if (moved) return;

            try {
              if (scrollEl) scrollEl.scrollTop = targetTop;
              if (docEl) docEl.scrollTop = targetTop;
              if (bodyEl) bodyEl.scrollTop = targetTop;
              window.scrollTo(0, targetTop);
            } catch (_) {
              // ignore
            }
            const forced = snapshotScroll();
            onDiagnostic?.('ui.group.scrollIntoView.force', {
              groupKey,
              reason,
              targetTopPx: Math.round(targetTop),
              scrollYPx: Math.round(window.scrollY),
              scrollElTopPx: forced.se !== null ? Math.round(forced.se) : null,
              docScrollTopPx: forced.doc !== null ? Math.round(forced.doc) : null,
              bodyScrollTopPx: forced.body !== null ? Math.round(forced.body) : null
            });
          }, behavior === 'smooth' ? 260 : 80);
        }

        // Post-scroll alignment pass: iOS can drift during smooth scroll (viewport chrome/safe area changes).
        window.setTimeout(() => finalizeAlignment(), behavior === 'smooth' ? 420 : 120);
      } catch (_) {
        try {
          window.scrollTo(0, targetTop);
          onDiagnostic?.('ui.group.scrollIntoView', {
            groupKey,
            reason,
            offsetPx: offset,
            stickyBottomPx: Math.round(stickyBottom),
            headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
            topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
            rectTopPx: Math.round(rect.top),
            baseScrollTopPx: Math.round(baseScrollTop),
            targetTopPx: Math.round(targetTop),
            scrollYPx: Math.round(window.scrollY),
            scrollElTopPx: scrollEl && typeof scrollEl.scrollTop === 'number' ? Math.round(scrollEl.scrollTop) : null,
            docScrollTopPx: docEl && typeof docEl.scrollTop === 'number' ? Math.round(docEl.scrollTop) : null,
            bodyScrollTopPx: bodyEl && typeof bodyEl.scrollTop === 'number' ? Math.round(bodyEl.scrollTop) : null,
            vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
            vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
          });
          window.setTimeout(() => finalizeAlignment(), 120);
        } catch (_) {
          // ignore
        }
      }
    },
    [onDiagnostic]
  );

  const scheduleScrollGroupToTop = useCallback(
    (groupKey: string, args?: { behavior?: ScrollBehavior; reason?: string }) => {
      if (!autoScrollOnExpand) return;
      if (!topLevelGroupKeySet.has(groupKey)) return;
      if (typeof window === 'undefined') return;
      // Double rAF to allow the DOM to reflow after expanding/collapsing.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollGroupToTop(groupKey, args));
      });
    },
    [autoScrollOnExpand, scrollGroupToTop, topLevelGroupKeySet]
  );

  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      setCollapsedGroups(prev => {
        const nextCollapsed = !prev[groupKey];
        onDiagnostic?.('ui.group.toggle', { groupKey, collapsed: nextCollapsed });
        if (!nextCollapsed) {
          scheduleScrollGroupToTop(groupKey, { reason: 'toggle' });
        }
        return { ...prev, [groupKey]: nextCollapsed };
      });
    },
    [onDiagnostic, scheduleScrollGroupToTop]
  );

  const renderChoiceControl = useCallback(
    (args: {
      fieldPath: string;
      value: string;
      options: OptionLike[];
      required: boolean;
      searchEnabled?: boolean;
      override?: string | null;
      disabled?: boolean;
      onChange: (next: string) => void;
    }) => {
      const { fieldPath, value, options, required, searchEnabled, override, disabled, onChange } = args;
      const decision = computeChoiceControlVariant(options, required, override);

      const prev = choiceVariantLogRef.current[fieldPath];
      if (prev !== decision.variant) {
        choiceVariantLogRef.current[fieldPath] = decision.variant;
        onDiagnostic?.('ui.choiceControl.variant', {
          fieldPath,
          variant: decision.variant,
          optionCount: options.length,
          required,
          override: (override || 'auto').toString(),
          booleanDetected: decision.booleanDetected
        });
      }

      const placeholder = tSystem('common.selectPlaceholder', language, 'Select…');
      const shouldUseSearchableSelect = (() => {
        if (decision.variant !== 'select') return false;
        if (searchEnabled === true) return true;
        if (searchEnabled === false) return false;
        // Auto: only for "large" option sets.
        return options.length >= 20;
      })();

      const renderSelectControl = () => {
        if (shouldUseSearchableSelect) {
          if (!choiceSearchLoggedRef.current.has(fieldPath)) {
            choiceSearchLoggedRef.current.add(fieldPath);
            onDiagnostic?.('ui.choiceControl.search.enabled', {
              fieldPath,
              optionCount: options.length,
              enabled: searchEnabled === true ? 'forced' : 'auto'
            });
          }
          const searchableCount = options.filter(opt => !!opt.searchText).length;
          if (searchableCount && !choiceSearchIndexLoggedRef.current.has(fieldPath)) {
            choiceSearchIndexLoggedRef.current.add(fieldPath);
            onDiagnostic?.('ui.choiceControl.search.multiField', {
              fieldPath,
              optionCount: options.length,
              indexedCount: searchableCount
            });
          }
          return (
            <SearchableSelect
              value={value || ''}
              options={options.map(o => ({
                value: o.value,
                label: o.label,
                tooltip: (o as any).tooltip,
                searchText: o.searchText
              }))}
              disabled={!!disabled}
              placeholder={placeholder}
              emptyText={tSystem('common.noMatches', language, 'No matches.')}
              onDiagnostic={(event, payload) => onDiagnostic?.(event, { fieldPath, ...(payload || {}) })}
              onChange={next => {
                if (disabled) return;
                onDiagnostic?.('ui.choiceControl.search.select', { fieldPath, value: next });
                onChange(next);
              }}
            />
          );
        }
        return (
          <select
            value={value || ''}
            disabled={!!disabled}
            onChange={e => {
              if (disabled) return;
              onChange(e.target.value);
            }}
          >
            <option value="">{placeholder}</option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      };

      switch (decision.variant) {
        case 'segmented': {
          return (
            <div className="ck-choice-control ck-segmented" role="radiogroup" aria-label="Options">
              {options.map(opt => {
                const active = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={active ? 'active' : undefined}
                    role="radio"
                    aria-checked={active}
                    title={opt.label}
                    disabled={!!disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (!required && active) {
                        onChange('');
                        return;
                      }
                      onChange(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          );
        }
        case 'radio': {
          const name = `ck-radio-${fieldPath}`;
          const noneLabel = resolveNoneLabel(language);
          const radioOptions = required ? options : [{ value: '', label: noneLabel }, ...options];
          return (
            <div className="ck-choice-control ck-radio-list" role="radiogroup" aria-label="Options">
              {radioOptions.map(opt => (
                <label key={opt.value || '__none__'} className="ck-radio-row">
                  <input
                    type="radio"
                    name={name}
                    value={opt.value}
                    checked={(value || '') === (opt.value || '')}
                    disabled={!!disabled}
                    onChange={e => {
                      if (disabled) return;
                      onChange(e.target.value);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          );
        }
        case 'switch': {
          const map = decision.booleanMap;
          if (!map) {
            // fallback
            return renderSelectControl();
          }
          const checked = value === map.trueValue;
          return (
            <div className="ck-choice-control ck-switch-control">
              <label className="ck-switch" aria-label="Toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!!disabled}
                  onChange={e => {
                    if (disabled) return;
                    onChange(e.target.checked ? map.trueValue : map.falseValue);
                  }}
                />
                <span className="ck-switch-track" aria-hidden="true" />
              </label>
            </div>
          );
        }
        case 'select':
        default:
          return renderSelectControl();
      }
    },
    [language, onDiagnostic]
  );

  const closeSubgroupOverlay = useCallback(() => {
    const previous = overlayStackRef.current.pop();
    if (previous) {
      if (previous.kind === 'subgroup') {
        setLineItemGroupOverlay({ open: false });
        setSubgroupOverlay({ ...previous.state, open: true });
      } else {
        setSubgroupOverlay({ open: false });
        setLineItemGroupOverlay({ ...previous.state, open: true });
      }
      onDiagnostic?.('overlay.stack.restore', { source: 'subgroup.close', kind: previous.kind });
      return;
    }
    overlayStackRef.current = [];
    setSubgroupOverlay({ open: false });
    onDiagnostic?.('subgroup.overlay.close');
  }, [onDiagnostic]);

  const attemptCloseSubgroupOverlay = useCallback(
    (source: 'button' | 'escape') => {
      if (!subgroupOverlay.open) return;
      if (overlayStackRef.current.length) {
        closeSubgroupOverlay();
        return;
      }
      const confirm = subgroupOverlay.closeConfirm;
      if (confirm && openConfirmDialogResolved) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));
        openConfirmDialogResolved({
          title,
          message,
          confirmLabel,
          cancelLabel,
          showCancel: confirm.showCancel !== false,
          kind: confirm.kind || 'overlayClose',
          refId: `${subgroupOverlay.subKey || ''}::close`,
          onConfirm: closeSubgroupOverlay
        });
        onDiagnostic?.('subgroup.overlay.close.confirm.open', { source });
        return;
      }
      closeSubgroupOverlay();
    },
    [
      closeSubgroupOverlay,
      language,
      onDiagnostic,
      openConfirmDialogResolved,
      subgroupOverlay.closeConfirm,
      subgroupOverlay.open,
      subgroupOverlay.subKey
    ]
  );

  const closeLineItemGroupOverlay = useCallback(() => {
    const previous = overlayStackRef.current.pop();
    if (previous) {
      if (previous.kind === 'subgroup') {
        setLineItemGroupOverlay({ open: false });
        setSubgroupOverlay({ ...previous.state, open: true });
      } else {
        setSubgroupOverlay({ open: false });
        setLineItemGroupOverlay({ ...previous.state, open: true });
      }
      onDiagnostic?.('overlay.stack.restore', { source: 'lineItem.close', kind: previous.kind });
      return;
    }
    overlayStackRef.current = [];
    setLineItemGroupOverlay({ open: false });
    onDiagnostic?.('lineItemGroup.overlay.close');
  }, [onDiagnostic]);

  const validateLineItemGroupOverlay = useCallback((): FormErrors | null => {
    const validationDefinition = buildLineItemGroupOverlayValidationDefinition();
    if (!validationDefinition) return null;
    try {
      return validateForm({
        definition: validationDefinition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups
      });
    } catch (err: any) {
      onDiagnostic?.('validation.lineItemOverlay.error', {
        message: err?.message || err || 'unknown',
        groupId: lineItemGroupOverlay.groupId
      });
      return null;
    }
  }, [
    buildLineItemGroupOverlayValidationDefinition,
    collapsedRows,
    collapsedSubgroups,
    language,
    lineItemGroupOverlay.groupId,
    lineItems,
    onDiagnostic,
    values
  ]);

  const attemptCloseLineItemGroupOverlay = useCallback(
    (source: 'button' | 'escape') => {
      if (!lineItemGroupOverlay.open) return;
      if (source === 'button' && overlayDetailSelection?.mode === 'edit') {
        const overlayGroupId = lineItemGroupOverlay.groupId || '';
        if (overlayGroupId && overlayDetailSelection.groupId === overlayGroupId) {
          const groupCfg = resolveLineItemGroupForKey(overlayGroupId);
          const overlayDetail = (groupCfg?.lineItemConfig as any)?.ui?.overlayDetail as any;
          const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
          const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
          const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
          if (overlayDetailCanView) {
            setOverlayDetailSelection({
              groupId: overlayDetailSelection.groupId,
              rowId: overlayDetailSelection.rowId,
              mode: 'view'
            });
            onDiagnostic?.('lineItems.overlayDetail.action', {
              groupId: overlayDetailSelection.groupId,
              rowId: overlayDetailSelection.rowId,
              actionId: 'view',
              mode: 'view',
              source: 'overlayClose'
            });
            return;
          }
        }
      }
      if (overlayStackRef.current.length) {
        closeLineItemGroupOverlay();
        setErrors(prev => clearLineItemGroupErrors(prev, lineItemGroupOverlay.groupId || ''));
        return;
      }
      const nextErrors = validateLineItemGroupOverlay();
      if (!nextErrors || Object.keys(nextErrors).length === 0) {
        const confirm = lineItemGroupOverlay.closeConfirm;
        if (confirm && openConfirmDialogResolved) {
          const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
          const message = resolveLocalizedString(confirm.body, language, '');
          const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
          const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));
          openConfirmDialogResolved({
            title,
            message,
            confirmLabel,
            cancelLabel,
            showCancel: confirm.showCancel !== false,
            kind: confirm.kind || 'overlayClose',
            refId: `${lineItemGroupOverlay.groupId || ''}::close`,
            onConfirm: () => {
              closeLineItemGroupOverlay();
              setErrors(prev => clearLineItemGroupErrors(prev, lineItemGroupOverlay.groupId || ''));
            }
          });
          onDiagnostic?.('lineItemGroup.overlay.close.confirm.open', { source });
          return;
        }
        closeLineItemGroupOverlay();
        setErrors(prev => clearLineItemGroupErrors(prev, lineItemGroupOverlay.groupId || ''));
        return;
      }
      setErrors(nextErrors);
      errorNavRequestRef.current += 1;
      errorNavModeRef.current = 'focus';
      onDiagnostic?.('validation.navigate.request', {
        attempt: errorNavRequestRef.current,
        scope: 'lineItemOverlay',
        mode: errorNavModeRef.current
      });
      onDiagnostic?.('lineItemGroup.overlay.close.blocked', {
        groupId: lineItemGroupOverlay.groupId,
        source,
        errorCount: Object.keys(nextErrors).length
      });
    },
    [
      closeLineItemGroupOverlay,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      onDiagnostic,
      overlayDetailSelection,
      resolveLineItemGroupForKey,
      setErrors,
      setOverlayDetailSelection,
      validateLineItemGroupOverlay
    ]
  );

  const openSubgroupOverlay = useCallback(
    (
      subKey: string,
      options?: {
        source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
        rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
        groupOverride?: LineItemGroupConfigOverride;
        hideInlineSubgroups?: boolean;
        hideCloseButton?: boolean;
        closeButtonLabel?: LocalizedString;
        closeConfirm?: RowFlowActionConfirmConfig;
        label?: string;
        contextHeader?: string;
        helperText?: string;
        rowFlow?: RowFlowConfig;
      }
    ) => {
      if (!subKey) return;
      const source = options?.source || 'user';
      if (source === 'user') {
        const rootGroupId = parseSubgroupKey(subKey)?.rootGroupId || subKey;
        if (orderedEntryGateRef.current({ targetQuestionId: rootGroupId, source })) {
          onDiagnostic?.('subgroup.overlay.open.blocked', { subKey, parentGroupId: rootGroupId, source });
          return;
        }
      }
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      overlayDetailHeaderCompleteRef.current.clear();
      const shouldPushSubgroup = subgroupOverlay.open && subgroupOverlay.subKey && subgroupOverlay.subKey !== subKey;
      if (lineItemGroupOverlay.open) {
        overlayStackRef.current.push({ kind: 'lineItem', state: { ...lineItemGroupOverlay } });
        setLineItemGroupOverlay({ open: false });
        onDiagnostic?.('overlay.stack.push', { source: 'openSubgroupOverlay', kind: 'lineItem' });
      } else if (shouldPushSubgroup) {
        overlayStackRef.current.push({ kind: 'subgroup', state: { ...subgroupOverlay } });
        onDiagnostic?.('overlay.stack.push', { source: 'openSubgroupOverlay', kind: 'subgroup' });
      }
      const rowFilter = options?.rowFilter || null;
      const groupOverride = options?.groupOverride;
      const hideInlineSubgroups = options?.hideInlineSubgroups === true;
      const hideCloseButton = options?.hideCloseButton === true;
      const closeButtonLabel = resolveLocalizedString(options?.closeButtonLabel, language, '').trim();
      const closeConfirm = options?.closeConfirm;
      const label = options?.label;
      const contextHeader = options?.contextHeader;
      const helperText = options?.helperText;
      const rowFlow = options?.rowFlow;
      setSubgroupOverlay({
        open: true,
        subKey,
        rowFilter,
        groupOverride,
        hideInlineSubgroups,
        hideCloseButton,
        closeButtonLabel: closeButtonLabel || undefined,
        closeConfirm: closeConfirm || undefined,
        source,
        label,
        contextHeader,
        helperText,
        rowFlow
      });
      onDiagnostic?.('subgroup.overlay.open', {
        subKey,
        hasRowFilter: !!rowFilter,
        hasOverride: !!groupOverride,
        hideInlineSubgroups,
        hideCloseButton,
        hasCloseConfirm: !!closeConfirm,
        hasCloseLabel: !!closeButtonLabel,
        hasHelperText: !!helperText
      });
      if (hideCloseButton) {
        onDiagnostic?.('form.overlay.closeButton.hidden', { scope: 'subgroup', source });
      }
    },
    [language, lineItemGroupOverlay, onDiagnostic, overlay.open, subgroupOverlay]
  );

  const openLineItemGroupOverlay = useCallback(
    (
      groupOrId: string | WebQuestionDefinition,
      options?: {
        rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
        hideInlineSubgroups?: boolean;
        source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
        hideCloseButton?: boolean;
        closeButtonLabel?: LocalizedString;
        closeConfirm?: RowFlowActionConfirmConfig;
        label?: string;
        contextHeader?: string;
        helperText?: string;
        rowFlow?: RowFlowConfig;
      }
    ) => {
      const id = (typeof groupOrId === 'string' ? groupOrId : groupOrId?.id || '').toString();
      if (!id) return;
      const source = options?.source || 'user';
      if (source === 'user' && orderedEntryGateRef.current({ targetQuestionId: id, source })) {
        onDiagnostic?.('lineItemGroup.overlay.open.blocked', { groupId: id, source });
        return;
      }
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      overlayDetailHeaderCompleteRef.current.clear();
      // Avoid stacking full-page overlays.
      if (subgroupOverlay.open) {
        overlayStackRef.current.push({ kind: 'subgroup', state: { ...subgroupOverlay } });
        onDiagnostic?.('overlay.stack.push', { source: 'openLineItemGroupOverlay', kind: 'subgroup' });
        setSubgroupOverlay({ open: false });
      }
      if (lineItemGroupOverlay.open && lineItemGroupOverlay.groupId && lineItemGroupOverlay.groupId !== id) {
        overlayStackRef.current.push({ kind: 'lineItem', state: { ...lineItemGroupOverlay } });
        onDiagnostic?.('overlay.stack.push', { source: 'openLineItemGroupOverlay', kind: 'lineItem' });
      }
      const group = typeof groupOrId === 'string' ? undefined : (groupOrId as WebQuestionDefinition);
      const rowFilter = options?.rowFilter || null;
      const hideInlineSubgroups = options?.hideInlineSubgroups === true;
      const hideCloseButton = options?.hideCloseButton === true;
      const closeButtonLabel = resolveLocalizedString(options?.closeButtonLabel, language, '').trim();
      const closeConfirm = options?.closeConfirm;
      const label = options?.label;
      const contextHeader = options?.contextHeader;
      const helperText = options?.helperText;
      const rowFlow = options?.rowFlow;
      setLineItemGroupOverlay({
        open: true,
        groupId: id,
        group,
        rowFilter,
        hideInlineSubgroups,
        hideCloseButton,
        closeButtonLabel: closeButtonLabel || undefined,
        closeConfirm: closeConfirm || undefined,
        source,
        label,
        contextHeader,
        helperText,
        rowFlow
      });
      onDiagnostic?.('lineItemGroup.overlay.open', {
        groupId: id,
        mode: group ? 'override' : 'default',
        hasRowFilter: !!rowFilter,
        hideCloseButton,
        hasCloseConfirm: !!closeConfirm,
        hasCloseLabel: !!closeButtonLabel,
        hasHelperText: !!helperText
      });
      if (hideCloseButton) {
        onDiagnostic?.('form.overlay.closeButton.hidden', { scope: 'lineItemGroup', source });
      }
    },
    [language, lineItemGroupOverlay, onDiagnostic, overlay.open, subgroupOverlay]
  );

  const buildOverlayGroupOverride = (
    group: WebQuestionDefinition,
    override?: LineItemGroupConfigOverride
  ): WebQuestionDefinition | undefined => {
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

  const subgroupPathIndex = useMemo(() => {
    const map = new Map<string, Array<{ rootId: string; path: string[] }>>();
    const walk = (rootId: string, subGroups: any[], path: string[]) => {
      (subGroups || []).forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const nextPath = [...path, subId];
        const existing = map.get(subId) || [];
        existing.push({ rootId, path: nextPath });
        map.set(subId, existing);
        if (Array.isArray(sub?.subGroups) && sub.subGroups.length) {
          walk(rootId, sub.subGroups, nextPath);
        }
      });
    };
    (definition.questions || []).forEach(q => {
      if (q?.type !== 'LINE_ITEM_GROUP') return;
      walk(q.id, (q.lineItemConfig?.subGroups || []) as any[], []);
    });
    return map;
  }, [definition.questions]);

  const normalizeOverlayFlattenPlacement = (raw: any): 'left' | 'right' | 'below' => {
    const placement = (raw || '').toString().trim().toLowerCase();
    if (placement === 'left' || placement === 'right') return placement;
    return 'below';
  };

  const resolveOverlayOpenActionForQuestion = (question: WebQuestionDefinition) => {
    if (isOverlayOpenActionSuppressed(question.id)) return null;
    const rawActions =
      (question.ui as any)?.overlayOpenActions ??
      (question as any)?.overlayOpenActions ??
      (question.ui as any)?.overlayOpenAction ??
      (question as any)?.overlayOpenAction;
    const actions: LineItemOverlayOpenActionConfig[] = Array.isArray(rawActions)
      ? rawActions
      : rawActions
        ? [rawActions]
        : [];
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
    const match = actions.find((action: LineItemOverlayOpenActionConfig) => {
      if (!action || typeof action !== 'object') return false;
      if (!action.groupId) return false;
      if (!action.when) return true;
      const selfWhen = extractSelfWhen(action.when as any, question.id);
      if (selfWhen) {
        return matchesWhen(values[question.id], selfWhen);
      }
      return matchesWhenClause(action.when as any, topVisibilityCtx);
    });
    if (!match) return null;
    const groupId = (match.groupId || '').toString();
    if (!groupId) return null;
    let group = definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP') as
      | WebQuestionDefinition
      | undefined;
    let targetKind: 'line' | 'sub' = 'line';
    let targetKey = groupId;
    let rootGroupId = groupId;
    let parentRowId: string | null = null;
    if (!group) {
      const subgroupMatches = subgroupPathIndex.get(groupId) || [];
      if (!subgroupMatches.length) {
        const missKey = `${question.id}::overlayOpenAction::missing::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(missKey)) {
          overlayOpenActionLoggedRef.current.add(missKey);
          onDiagnostic('ui.overlayOpenAction.missingGroup', { questionId: question.id, groupId });
        }
        return null;
      }
      if (subgroupMatches.length > 1) {
        const ambiguousKey = `${question.id}::overlayOpenAction::ambiguous::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(ambiguousKey)) {
          overlayOpenActionLoggedRef.current.add(ambiguousKey);
          onDiagnostic('ui.overlayOpenAction.ambiguousGroup', {
            questionId: question.id,
            groupId,
            rootIds: subgroupMatches.map(entry => entry.rootId)
          });
        }
      }
      const [matchEntry] = subgroupMatches;
      const path = Array.isArray(matchEntry?.path) ? matchEntry.path : [];
      if (!path.length) {
        const pathKey = `${question.id}::overlayOpenAction::pathMissing::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(pathKey)) {
          overlayOpenActionLoggedRef.current.add(pathKey);
          onDiagnostic('ui.overlayOpenAction.pathMissing', { questionId: question.id, groupId });
        }
        return null;
      }
      if (path.length > 1) {
        const pathKey = `${question.id}::overlayOpenAction::pathUnsupported::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(pathKey)) {
          overlayOpenActionLoggedRef.current.add(pathKey);
          onDiagnostic('ui.overlayOpenAction.pathUnsupported', { questionId: question.id, groupId, path });
        }
        return null;
      }
      const parentRows = (lineItems as any)[matchEntry.rootId] || [];
      if (!parentRows.length) {
        const rowKey = `${question.id}::overlayOpenAction::missingParent::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(rowKey)) {
          overlayOpenActionLoggedRef.current.add(rowKey);
          onDiagnostic('ui.overlayOpenAction.missingParentRow', {
            questionId: question.id,
            groupId,
            rootGroupId: matchEntry.rootId
          });
        }
        return null;
      }
      const parentRow = parentRows[0];
      rootGroupId = matchEntry.rootId;
      parentRowId = parentRow?.id || null;
      targetKey = parentRowId ? buildSubgroupKey(rootGroupId, parentRowId, path[0]) : '';
      targetKind = 'sub';
    }
    const rowFilterRaw = (match as any).rowFilter ?? (match as any).rows ?? null;
    const rowFilter = rowFilterRaw && typeof rowFilterRaw === 'object' ? rowFilterRaw : null;
    const overrideGroup = group ? buildOverlayGroupOverride(group, match.groupOverride) : undefined;
    const renderMode = (match.renderMode || 'replace').toString().trim().toLowerCase();
    const label = resolveLocalizedString(match.label, language, resolveFieldLabel(question, language, question.id));
    const flattenPlacement = normalizeOverlayFlattenPlacement((match as any).flattenPlacement);
    const logKey = `${question.id}::overlayOpenAction::${groupId}::${renderMode}`;
    if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(logKey)) {
      overlayOpenActionLoggedRef.current.add(logKey);
      onDiagnostic('ui.overlayOpenAction.available', {
        questionId: question.id,
        groupId,
        renderMode,
        hasRowFilter: !!rowFilter,
        hasOverride: !!overrideGroup,
        flattenPlacement,
        hideTrashIcon: (match as any).hideTrashIcon === true
      });
    }
    return {
      action: match,
      groupId,
      group,
      overrideGroup,
      groupOverride: match.groupOverride,
      rowFilter,
      hideInlineSubgroups: match.hideInlineSubgroups === true,
      renderMode,
      label,
      flattenPlacement,
      hideTrashIcon: (match as any).hideTrashIcon === true,
      targetKind,
      targetKey,
      rootGroupId,
      parentRowId
    };
  };

  const overlayOpenActionTargetGroups = useMemo(() => {
    const targets = new Set<string>();
    const topLevelGroupIds = new Set(
      (definition.questions || [])
        .filter(q => q?.type === 'LINE_ITEM_GROUP')
        .map(q => (q?.id !== undefined && q?.id !== null ? q.id.toString().trim() : ''))
        .filter(Boolean)
    );
    (definition.questions || []).forEach(question => {
      const rawActions =
        (question.ui as any)?.overlayOpenActions ??
        (question as any)?.overlayOpenActions ??
        (question.ui as any)?.overlayOpenAction ??
        (question as any)?.overlayOpenAction;
      const actions: LineItemOverlayOpenActionConfig[] = Array.isArray(rawActions)
        ? rawActions
        : rawActions
          ? [rawActions]
          : [];
      actions.forEach(action => {
        const groupId =
          action?.groupId !== undefined && action?.groupId !== null ? action.groupId.toString().trim() : '';
        if (!groupId) return;
        if (topLevelGroupIds.has(groupId)) {
          targets.add(groupId);
          return;
        }
        const subgroupMatches = subgroupPathIndex.get(groupId) || [];
        subgroupMatches.forEach(entry => {
          if (entry?.rootId) targets.add(entry.rootId);
        });
      });
    });
    return targets;
  }, [definition.questions, subgroupPathIndex]);

  const matchesOverlayRowFilter = useCallback((rowValues: Record<string, FieldValue>, filter?: any): boolean => {
    if (!filter) return true;
    const includeWhen = (filter as any)?.includeWhen;
    const excludeWhen = (filter as any)?.excludeWhen;
    const rowCtx: VisibilityContext = { getValue: fid => (rowValues as any)[fid] };
    const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
    const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
    return includeOk && !excludeMatch;
  }, []);

  useEffect(() => {
    const activeGroupKey =
      lineItemGroupOverlay.open && lineItemGroupOverlay.groupId
        ? lineItemGroupOverlay.groupId
        : subgroupOverlay.open && subgroupOverlay.subKey
          ? subgroupOverlay.subKey
          : '';
    if (!activeGroupKey) {
      setOverlayDetailSelection(null);
      return;
    }
    if (overlayDetailSelection && overlayDetailSelection.groupId !== activeGroupKey) {
      setOverlayDetailSelection(null);
    }
  }, [lineItemGroupOverlay.groupId, lineItemGroupOverlay.open, overlayDetailSelection, subgroupOverlay.open, subgroupOverlay.subKey]);

  const selectOverlayDetailFirstRow = useCallback(
    (groupKey: string, rows: LineItemRowState[], canView: boolean) => {
      if (!rows.length) return;
      const mode: 'view' | 'edit' = canView ? 'view' : 'edit';
      const rowId = rows[0].id;
      setOverlayDetailSelection({ groupId: groupKey, rowId, mode });
      onDiagnostic?.('lineItems.overlayDetail.select', { groupId: groupKey, rowId, mode, source: 'auto' });
    },
    [onDiagnostic]
  );

  useEffect(() => {
    const activeLine =
      lineItemGroupOverlay.open && lineItemGroupOverlay.groupId
        ? {
            type: 'line' as const,
            key: lineItemGroupOverlay.groupId,
            source: lineItemGroupOverlay.source,
            rowFilter: lineItemGroupOverlay.rowFilter,
            group: lineItemGroupOverlay.group
          }
        : null;
    const activeSub =
      !activeLine && subgroupOverlay.open && subgroupOverlay.subKey
        ? {
            type: 'sub' as const,
            key: subgroupOverlay.subKey,
            source: subgroupOverlay.source,
            rowFilter: subgroupOverlay.rowFilter,
            groupOverride: subgroupOverlay.groupOverride
          }
        : null;
    const active = activeLine || activeSub;
    if (!active || active.source !== 'overlayOpenAction') return;
    if (overlayDetailSelection && overlayDetailSelection.groupId === active.key) return;

    if (active.type === 'line') {
      const groupId = active.key;
      const overrideGroup = active.group;
      const group =
        overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
          ? overrideGroup
          : definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP');
      const groupCfg = (group as any)?.lineItemConfig as any;
      const overlayDetail = groupCfg?.ui?.overlayDetail as any;
      const overlayDetailEnabled = !!overlayDetail?.enabled && !!overlayDetail?.body?.subGroupId;
      if (!groupCfg || !overlayDetailEnabled) return;
      const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
      const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
      const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
      const rowsAll = lineItems[groupId] || [];
      const rows = active.rowFilter
        ? rowsAll.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, active.rowFilter))
        : rowsAll;
      if (!rows.length) return;
      selectOverlayDetailFirstRow(groupId, rows, overlayDetailCanView);
      return;
    }

    if (active.type === 'sub') {
      const subKey = active.key;
      const subgroupDefs = resolveSubgroupDefs(subKey);
      const subConfigBase = subgroupDefs.sub;
      const subConfig = subConfigBase ? applyLineItemGroupOverride(subConfigBase, active.groupOverride) : subConfigBase;
      const overlayDetail = (subConfig as any)?.ui?.overlayDetail as any;
      const overlayDetailEnabled = !!overlayDetail?.enabled && !!overlayDetail?.body?.subGroupId;
      if (!subConfig || !overlayDetailEnabled) return;
      const overlayDetailViewMode = (overlayDetail?.body?.view?.mode || 'html').toString().trim().toLowerCase();
      const overlayDetailHasViewTemplate = !!overlayDetail?.body?.view?.templateId;
      const overlayDetailCanView = overlayDetailViewMode === 'html' && overlayDetailHasViewTemplate;
      const rowsAll = lineItems[subKey] || [];
      const rows = active.rowFilter
        ? rowsAll.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, active.rowFilter))
        : rowsAll;
      if (!rows.length) return;
      selectOverlayDetailFirstRow(subKey, rows, overlayDetailCanView);
    }
  }, [
    applyLineItemGroupOverride,
    definition.questions,
    lineItemGroupOverlay.group,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.rowFilter,
    lineItemGroupOverlay.source,
    lineItems,
    matchesOverlayRowFilter,
    overlayDetailSelection,
    resolveSubgroupDefs,
    selectOverlayDetailFirstRow,
    subgroupOverlay.groupOverride,
    subgroupOverlay.open,
    subgroupOverlay.rowFilter,
    subgroupOverlay.source,
    subgroupOverlay.subKey
  ]);

  useEffect(() => {
    const activeGroupKey =
      lineItemGroupOverlay.open && lineItemGroupOverlay.groupId
        ? lineItemGroupOverlay.groupId
        : subgroupOverlay.open && subgroupOverlay.subKey
          ? subgroupOverlay.subKey
          : '';
    if (!activeGroupKey) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlError('');
      setOverlayDetailHtmlLoading(false);
      return;
    }
    if (!overlayDetailSelection || overlayDetailSelection.mode !== 'view' || overlayDetailSelection.groupId !== activeGroupKey) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlError('');
      setOverlayDetailHtmlLoading(false);
      return;
    }

    const context = (() => {
      if (lineItemGroupOverlay.open && lineItemGroupOverlay.groupId === activeGroupKey) {
        const groupId = lineItemGroupOverlay.groupId;
        const group = definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP');
        const overlayDetail = (group as any)?.lineItemConfig?.ui?.overlayDetail;
        return { type: 'line', groupId, overlayDetail };
      }
      if (subgroupOverlay.open && subgroupOverlay.subKey === activeGroupKey) {
        const subgroupDefs = resolveSubgroupDefs(subgroupOverlay.subKey);
        const info = subgroupDefs.info;
        const sub = subgroupDefs.sub;
        const overlayDetail = (sub as any)?.ui?.overlayDetail;
        return {
          type: 'sub',
          groupId: info?.rootGroupId || '',
          parentRowId: info?.parentRowId || '',
          path: info?.path || [],
          overlayDetail
        };
      }
      return null;
    })();

    if (!context || !context.groupId) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlError('');
      setOverlayDetailHtmlLoading(false);
      return;
    }

    const templateIdMap = context.overlayDetail?.body?.view?.templateId;
    if (!templateIdMap) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.templateMissing', language, 'Template not configured.'));
      return;
    }
    if (context.type === 'sub' && Array.isArray(context.path) && context.path.length > 1) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.pathUnsupported', language, 'Nested paths beyond one level are not supported yet.'));
      return;
    }

    const payload = buildDraftPayload({
      definition,
      formKey: (definition.destinationTab || definition.title || 'draft').toString(),
      language,
      values,
      lineItems,
      existingRecordId: recordMeta?.id
    });

    if (context.type === 'line') {
      const rawRows = Array.isArray((payload.values as any)[context.groupId]) ? ((payload.values as any)[context.groupId] as any[]) : [];
      const filtered = rawRows.filter(row => (row as any)?.[ROW_ID_KEY] === overlayDetailSelection.rowId);
      (payload.values as any)[context.groupId] = filtered;
      (payload.values as any)[`${context.groupId}_json`] = JSON.stringify(filtered);
    } else {
      const subPath = Array.isArray((context as any).path) ? ((context as any).path as string[]) : [];
      const rootRows = Array.isArray((payload.values as any)[context.groupId])
        ? ((payload.values as any)[context.groupId] as any[])
        : [];
      const filteredParents = context.parentRowId
        ? rootRows.filter(row => (row as any)?.[ROW_ID_KEY] === context.parentRowId)
        : rootRows;
      if (subPath.length === 1) {
        const subId = subPath[0];
        filteredParents.forEach(parentRow => {
          const children = Array.isArray((parentRow as any)[subId]) ? (parentRow as any)[subId] : [];
          (parentRow as any)[subId] = children.filter((child: any) => (child as any)?.[ROW_ID_KEY] === overlayDetailSelection.rowId);
        });
      }
      (payload.values as any)[context.groupId] = filteredParents;
      (payload.values as any)[`${context.groupId}_json`] = JSON.stringify(filteredParents);
    }

    const resolvedTemplateId = resolveTemplateIdForRecord(templateIdMap, payload.values as any, language);
    if (!resolvedTemplateId || !isBundledHtmlTemplateId(resolvedTemplateId)) {
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(
        tSystem('overlay.detail.templateBundleRequired', language, 'Template must be a bundled (bundle:...) HTML template.')
      );
      return;
    }

    setOverlayDetailHtmlLoading(true);
    setOverlayDetailHtmlError('');
    renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap,
      buttonId: `overlay:${activeGroupKey}:${overlayDetailSelection.rowId}`
    })
      .then(res => {
        if (res?.success && res?.html) {
          setOverlayDetailHtml(res.html);
          setOverlayDetailHtmlError('');
          onDiagnostic?.('lineItems.overlayDetail.view.rendered', {
            groupId: context.groupId,
            rowId: overlayDetailSelection.rowId,
            templateId: resolvedTemplateId
          });
          return;
        }
        setOverlayDetailHtml('');
        const message = (res?.message || tSystem('overlay.detail.templateFailed', language, 'Unable to render template.')).toString();
        setOverlayDetailHtmlError(message);
        onDiagnostic?.('lineItems.overlayDetail.view.failed', {
          groupId: context.groupId,
          rowId: overlayDetailSelection.rowId,
          message
        });
      })
      .catch(err => {
        setOverlayDetailHtml('');
        const message = (err?.message || tSystem('overlay.detail.templateFailed', language, 'Unable to render template.')).toString();
        setOverlayDetailHtmlError(message);
        onDiagnostic?.('lineItems.overlayDetail.view.failed', {
          groupId: context.groupId,
          rowId: overlayDetailSelection.rowId,
          message
        });
      })
      .finally(() => {
        setOverlayDetailHtmlLoading(false);
      });
  }, [
    definition,
    language,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItems,
    onDiagnostic,
    overlayDetailSelection,
    recordMeta,
    resolveSubgroupDefs,
    subgroupOverlay.open,
    subgroupOverlay.subKey,
    values
  ]);

  // NOTE: Must be declared AFTER `questionIdToGroupKey`, `nestedGroupMeta`, and `openSubgroupOverlay` are initialized.
  // Otherwise production bundles can hit a TDZ "Cannot access X before initialization" when evaluating hook deps.
  const navigateToFieldKey = useCallback(
    (fieldKey: string) => {
      const key = (fieldKey || '').toString();
      if (!key) return;
      if (typeof document === 'undefined') return;

      const expandGroupForQuestionId = (questionId: string): boolean => {
        const groupKey = questionIdToGroupKey[questionId];
        if (!groupKey) return false;
        setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
        return true;
      };

      const ensureMountedForKey = (): boolean => {
        const parts = key.split('__');
        if (parts.length !== 3) {
          // Top-level question key: ensure its group card is expanded.
          return expandGroupForQuestionId(key);
        }
        const prefix = parts[0];
        const fieldId = parts[1];
        const rowId = parts[2];
        const subgroupInfo = parseSubgroupKey(prefix);
        if (subgroupInfo) {
          expandGroupForQuestionId(subgroupInfo.rootGroupId);
          const collapseKey = `${subgroupInfo.parentGroupKey}::${subgroupInfo.parentRowId}`;
          setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
          const nestedKey =
            nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.rootGroupId}::${subgroupInfo.path.join('.') || subgroupInfo.subGroupId}__${fieldId}`];
          if (nestedKey) {
            setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
          }
          if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
            openSubgroupOverlay(prefix, { source: 'navigate' });
            onDiagnostic?.('validation.navigate.openSubgroup', { key, subKey: prefix, source: 'click' });
          }
          return true;
        }

        // If this is a line-item group configured to open in a full-page overlay, open it so the row/fields can mount.
        const groupCfg = definition.questions.find(q => q.id === prefix && q.type === 'LINE_ITEM_GROUP');
        const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
        const suppressOverlayForGuidedInline = guidedEnabled && guidedInlineLineGroupIds.has(prefix);
        if (groupOverlayEnabled && !suppressOverlayForGuidedInline) {
          if (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== prefix) {
            openLineItemGroupOverlay(prefix, { source: 'navigate' });
            onDiagnostic?.('validation.navigate.openLineItemGroupOverlay', { key, groupId: prefix, source: 'click' });
          }
        }

        expandGroupForQuestionId(prefix);
        const collapseKey = `${prefix}::${rowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        return true;
      };

      const scrollToKey = (): boolean => {
        const target = document.querySelector<HTMLElement>(`[data-field-path="${key}"]`);
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
        try {
          focusable?.focus({ preventScroll: true } as any);
        } catch (_) {
          // ignore
        }
        return true;
      };

      const requestedMount = ensureMountedForKey();
      requestAnimationFrame(() => {
        const found = scrollToKey();
        if (!found && requestedMount) {
          // wait for state-driven DOM mount (expanded row / subgroup overlay)
          requestAnimationFrame(() => scrollToKey());
          setTimeout(() => scrollToKey(), 80);
        }
      });
    },
    [
      nestedGroupMeta.lineFieldToGroupKey,
      nestedGroupMeta.subgroupFieldToGroupKey,
      definition.questions,
      guidedEnabled,
      guidedInlineLineGroupIds,
      onDiagnostic,
      openLineItemGroupOverlay,
      openSubgroupOverlay,
      questionIdToGroupKey,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      subgroupOverlay.open,
      subgroupOverlay.subKey
    ]
  );

  useEffect(() => {
    if (!navigateToFieldRef) return;
    navigateToFieldRef.current = navigateToFieldKey;
    return () => {
      navigateToFieldRef.current = null;
    };
  }, [navigateToFieldKey, navigateToFieldRef]);

  const closeInfoOverlay = useCallback(() => {
    setInfoOverlay({ open: false });
    onDiagnostic?.('tooltip.overlay.close');
  }, [onDiagnostic]);

  const openInfoOverlay = useCallback(
    (title: string, text: string) => {
      if (!text) return;
      if (submitting) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setInfoOverlay({ open: true, title, text });
      onDiagnostic?.('tooltip.overlay.open', { title });
    },
    [onDiagnostic, overlay.open, submitting]
  );

  const closeFileOverlay = useCallback(() => {
    setFileOverlay({ open: false });
    onDiagnostic?.('upload.overlay.close');
  }, [onDiagnostic]);

  const openFileOverlay = useCallback(
    (next: Omit<FileOverlayState, 'open'>) => {
      if (submitting) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setFileOverlay({ open: true, ...next });
      onDiagnostic?.('upload.overlay.open', { scope: next.scope, title: next.title });
    },
    [onDiagnostic, overlay.open, submitting]
  );

  useEffect(() => {
    if (!pendingScrollAnchor) return;
    if (typeof document === 'undefined') return;
    const anchor = pendingScrollAnchor;
    const sep = anchor.lastIndexOf('__');
    const targetGroupKey = sep >= 0 ? anchor.slice(0, sep) : anchor;
    const targetRowId = sep >= 0 ? anchor.slice(sep + 2) : '';
    const targetSubgroupInfo = parseSubgroupKey(targetGroupKey);

    // Ensure the target row is actually rendered before attempting to scroll to it.
    // This makes selectionEffect-created rows discoverable even when their parent group is collapsed,
    // or when the target is a subgroup that requires the full-page overlay to be opened.
    try {
      if (targetSubgroupInfo) {
        const groupCardKey =
          (questionIdToGroupKey as any)[targetSubgroupInfo.rootGroupId] || targetSubgroupInfo.rootGroupId;
        if (groupCardKey) {
          setCollapsedGroups(prev => (prev[groupCardKey] === false ? prev : { ...prev, [groupCardKey]: false }));
        }
        const rowCollapseKey = `${targetSubgroupInfo.parentGroupKey}::${targetSubgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[rowCollapseKey] === false ? prev : { ...prev, [rowCollapseKey]: false }));
        // Expand inline subgroup if present; if not present (progressive mode), we'll fall back to opening the overlay
        // after a few retries below.
        setCollapsedSubgroups(prev => (prev[targetGroupKey] === false ? prev : { ...prev, [targetGroupKey]: false }));
      } else {
        const groupCardKey = (questionIdToGroupKey as any)[targetGroupKey] || targetGroupKey;
        if (groupCardKey) {
          setCollapsedGroups(prev => (prev[groupCardKey] === false ? prev : { ...prev, [groupCardKey]: false }));
        }
      }
    } catch (_) {
      // ignore visibility preparation failures
    }

    let cancelled = false;
    let tries = 0;
    const maxTries = 20;
    const attempt = () => {
      if (cancelled) return false;
      const el = document.querySelector(`[data-row-anchor="${anchor}"]`) as HTMLElement | null;
      if (!el) return false;
      // Prefer scrolling the nearest scroll container, because scrollIntoView can be inconsistent in sandboxed iframes.
      const overlayRoot = el.closest('.webform-overlay');
      const overlayScroller =
        (el.closest('[data-overlay-scroll-container="true"]') as HTMLElement | null) ||
        (overlayRoot ? (overlayRoot.querySelector('[data-overlay-scroll-container="true"]') as HTMLElement | null) : null);
      if (overlayScroller) {
        const containerRect = overlayScroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const topGap = 12;
        const bottomGap = 12;
        const above = elRect.top < containerRect.top + topGap;
        const below = elRect.bottom > containerRect.bottom - bottomGap;
        if (above || below) {
          const delta = above
            ? elRect.top - (containerRect.top + topGap)
            : elRect.bottom - (containerRect.bottom - bottomGap);
          const target = overlayScroller.scrollTop + delta;
          overlayScroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }
      } else if (!overlayRoot) {
        const scrollingEl = (document.scrollingElement || document.documentElement) as HTMLElement | null;
        if (scrollingEl) {
          const rect = el.getBoundingClientRect();
          const offset = 120; // account for sticky header and breathing room
          const top = scrollingEl.scrollTop + rect.top - offset;
          scrollingEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      const focusables = Array.from(
        el.querySelectorAll(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
      ) as HTMLElement[];

      const shouldSkipAnchorFocus = el.getAttribute('data-anchor-has-value') === 'true';
      const anchorFieldId = (el.getAttribute('data-anchor-field-id') || '').toString().trim();

      let focusable: HTMLElement | null = focusables[0] || null;

      // When a row is created with its anchor already set (e.g., via sectionSelector preset),
      // focusing the anchor can open the searchable select and feel like an extra “confirm” step.
      // Prefer the next field instead.
      if (shouldSkipAnchorFocus && anchorFieldId && targetRowId) {
        const anchorFieldPath = `${targetGroupKey}__${anchorFieldId}__${targetRowId}`;
        const anchorContainer = el.querySelector(`[data-field-path="${anchorFieldPath}"]`) as HTMLElement | null;
        if (anchorContainer) {
          focusable = focusables.find(node => !anchorContainer.contains(node)) || focusables[0] || null;
        } else if (focusables.length > 1) {
          focusable = focusables[1] || focusables[0] || null;
        }
      }
      try {
        focusable?.focus();
      } catch (_) {
        // ignore focus failures
      }
      return true;
    };
    const schedule = () => {
      if (cancelled) return;
      // If we're trying to scroll to a subgroup row and it's not mounted (common in progressive mode),
      // open the full-page subgroup overlay after a short delay.
      if (
        targetSubgroupInfo &&
        tries === 4 &&
        (!subgroupOverlay.open || subgroupOverlay.subKey !== targetGroupKey)
      ) {
        openSubgroupOverlay(targetGroupKey, { source: 'autoscroll' });
        onDiagnostic?.('ui.autoscroll.openSubgroupOverlay', { anchor, subKey: targetGroupKey });
      }
      // If we're trying to scroll to a line-item group row that is rendered only in an overlay,
      // open the full-page group overlay after a short delay so the row can mount.
      if (!targetSubgroupInfo && tries === 4) {
        const groupCfg = definition.questions.find(q => q.id === targetGroupKey && q.type === 'LINE_ITEM_GROUP');
        const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
        if (groupOverlayEnabled && (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== targetGroupKey)) {
          openLineItemGroupOverlay(targetGroupKey, { source: 'autoscroll' });
          onDiagnostic?.('ui.autoscroll.openLineItemGroupOverlay', { anchor, groupId: targetGroupKey });
        }
      }
      if (attempt()) {
        setPendingScrollAnchor(null);
        onDiagnostic?.('ui.autoscroll.success', { anchor, tries });
        return;
      }
      tries += 1;
      if (tries >= maxTries) {
        setPendingScrollAnchor(null);
        onDiagnostic?.('ui.autoscroll.miss', { anchor, tries });
        return;
      }
      setTimeout(schedule, 50);
    };
    onDiagnostic?.('ui.autoscroll.request', { anchor });
    requestAnimationFrame(schedule);
    return () => {
      cancelled = true;
    };
  }, [
    definition.questions,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    pendingScrollAnchor,
    subgroupOverlay.open,
    subgroupOverlay.subKey
  ]);

  // visualViewport bottom inset is handled globally in App.tsx so the bottom action bar works across views.

  useEffect(() => {
    const anyOpen = lineItemGroupOverlay.open || subgroupOverlay.open || infoOverlay.open || fileOverlay.open;
    if (!anyOpen) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fileOverlay.open) {
          closeFileOverlay();
          return;
        }
        if (infoOverlay.open) {
          closeInfoOverlay();
          return;
        }
        if (subgroupOverlay.open) {
          attemptCloseSubgroupOverlay('escape');
          return;
        }
        attemptCloseLineItemGroupOverlay('escape');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [
    closeFileOverlay,
    closeInfoOverlay,
    attemptCloseLineItemGroupOverlay,
    attemptCloseSubgroupOverlay,
    fileOverlay.open,
    infoOverlay.open,
    lineItemGroupOverlay.open,
    subgroupOverlay.open
  ]);
  useEffect(() => {
    if (!status || !statusRef.current) return;
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;

    const el = statusRef.current;
    const headerEl = document.querySelector<HTMLElement>('.ck-app-header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const minTop = Math.max(0, headerH + 8);
    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top >= minTop && rect.bottom >= minTop && rect.top <= window.innerHeight - 12;
    if (alreadyVisible) return;

    try {
      el.focus();
    } catch (_) {
      // ignore
    }
    // Respect sticky header by using scroll-margin-top on the element.
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [status]);

  const setDragActive = useCallback((questionId: string, active: boolean) => {
    setDragState(prev => {
      if (prev[questionId] === active) return prev;
      return { ...prev, [questionId]: active };
    });
  }, []);

  const incrementDrag = useCallback(
    (questionId: string) => {
      const next = (dragCounterRef.current[questionId] || 0) + 1;
      dragCounterRef.current[questionId] = next;
      setDragActive(questionId, true);
    },
    [setDragActive]
  );

  const decrementDrag = useCallback(
    (questionId: string) => {
      const next = Math.max(0, (dragCounterRef.current[questionId] || 0) - 1);
      dragCounterRef.current[questionId] = next;
      if (next === 0) {
        setDragActive(questionId, false);
      }
    },
    [setDragActive]
  );

  const resetDrag = useCallback(
    (questionId: string) => {
      dragCounterRef.current[questionId] = 0;
      setDragActive(questionId, false);
    },
    [setDragActive]
  );

  const announceUpload = useCallback((questionId: string, message: string) => {
    setUploadAnnouncements(prev => ({ ...prev, [questionId]: message }));
  }, []);

  const resetNativeFileInput = (questionId: string) => {
    const input = fileInputsRef.current[questionId];
    if (input) {
      input.value = '';
    }
  };

  // Auto-scroll when subgroup rows increase (works for inline add and overlay add)
  useEffect(() => {
    Object.entries(lineItems).forEach(([key, rows]) => {
      const info = parseSubgroupKey(key);
      if (!info) return; // only subgroups
      const prevCount = subgroupPrevCountsRef.current[key] ?? 0;
      const nextCount = Array.isArray(rows) ? rows.length : 0;
      subgroupPrevCountsRef.current[key] = nextCount;
      if (nextCount > prevCount) {
        const isCollapsed = collapsedSubgroups[key] ?? true;
        if (isCollapsed) return;
        const el = subgroupBottomRefs.current[key];
        if (!el) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
      }
    });
  }, [lineItems, collapsedSubgroups]);

  useEffect(() => {
    Object.keys(lineItems).forEach(key => {
      const rows = lineItems[key] || [];
      const prev = subgroupPrevCountsRef.current[key] || 0;
      const next = Array.isArray(rows) ? rows.length : 0;
      subgroupPrevCountsRef.current[key] = next;
      if (next > prev) {
        const isCollapsed = collapsedSubgroups[key] ?? true;
        if (!isCollapsed) {
          const el = subgroupBottomRefs.current[key];
          if (el) {
            requestAnimationFrame(() => {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }
        }
      }
    });
  }, [lineItems, collapsedSubgroups]);

  const handleFileFieldChange = (
    question: WebQuestionDefinition,
    items: Array<string | File>,
    errorMessage?: string
  ) => {
    if (onStatusClear) onStatusClear();
    setValues(prev => ({ ...prev, [question.id]: items as unknown as FieldValue }));
    const fieldLabel = resolveFieldLabel(question as any, language, question.id);
    const validationMessage = errorMessage
      ? ''
      : validateUploadCounts({
          value: items,
          uploadConfig: (question as any)?.uploadConfig,
          required: !!(question as any)?.required,
          requiredMessage: (question as any)?.requiredMessage,
          language,
          fieldLabel
        });
    setErrors(prev => {
      const next = { ...prev };
      const nextMessage = errorMessage || validationMessage;
      if (nextMessage) {
        next[question.id] = nextMessage;
      } else {
        delete next[question.id];
      }
      return next;
    });
  };

  const processIncomingFiles = (question: WebQuestionDefinition, incoming: File[]) => {
    if (!incoming.length) return;
    const existing = toUploadItems(values[question.id]);
    const { items, errorMessage } = applyUploadConstraints(question, existing, incoming, language);
    handleFileFieldChange(question, items, errorMessage);
    const accepted = Math.max(0, items.length - existing.length);
    if (errorMessage) {
      announceUpload(question.id, errorMessage);
      onDiagnostic?.('upload.error', { questionId: question.id, error: errorMessage });
    } else if (accepted > 0) {
      announceUpload(
        question.id,
        accepted === 1
          ? tSystem('files.selectedOne', language, '1 photo added')
          : tSystem('files.selectedMany', language, '{count} photos added', { count: accepted })
      );
    } else {
      announceUpload(question.id, tSystem('common.noChange', language, 'No change.'));
    }
    onDiagnostic?.('upload.add', {
      questionId: question.id,
      attempted: incoming.length,
      accepted: accepted,
      total: items.length,
      error: Boolean(errorMessage)
    });

    // Immediate upload: upload accepted files now, then persist URLs via draft save (handled by App).
    if (onUploadFiles && accepted > 0) {
      announceUpload(question.id, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: 'top',
        fieldPath: question.id,
        questionId: question.id,
        items,
        uploadConfig: (question as any)?.uploadConfig
      }).then(res => {
        if (!res?.success) {
          announceUpload(question.id, (res?.message || tSystem('files.error.uploadFailed', language, 'Could not add photos.')).toString());
          return;
        }
        announceUpload(question.id, tSystem('files.uploaded', language, 'Added'));
      });
    }
  };

  const handleFileInputChange = (question: WebQuestionDefinition, list: FileList | null) => {
    if (!list || !list.length) {
      resetNativeFileInput(question.id);
      return;
    }
    if (submitting || question.readOnly === true) {
      onDiagnostic?.('upload.add.blocked', { scope: 'top', questionId: question.id, reason: submitting ? 'submitting' : 'readOnly' });
      resetNativeFileInput(question.id);
      return;
    }
    processIncomingFiles(question, Array.from(list));
    resetNativeFileInput(question.id);
  };

  const handleFileDrop = (question: WebQuestionDefinition, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (question.readOnly === true) return;
    if (!event.dataTransfer?.files?.length) return;
    processIncomingFiles(question, Array.from(event.dataTransfer.files));
    onDiagnostic?.('upload.drop', { questionId: question.id, count: event.dataTransfer.files.length });
    resetDrag(question.id);
  };

  const removeFile = (question: WebQuestionDefinition, index: number) => {
    if (submitting) return;
    if (question.readOnly === true) return;
    const existing = toUploadItems(values[question.id]);
    if (!existing.length) return;
    const removed = existing[index];
    const next = existing.filter((_, idx) => idx !== index);
    handleFileFieldChange(question, next);
    onDiagnostic?.('upload.remove', { questionId: question.id, removed: describeUploadItem(removed as any), remaining: next.length });
    announceUpload(
      question.id,
      removed
        ? `${tSystem('lineItems.remove', language, 'Remove')} ${describeUploadItem(removed as any)}.`
        : tSystem('lineItems.remove', language, 'Remove')
    );
  };

  const clearFiles = (question: WebQuestionDefinition) => {
    if (submitting) return;
    if (question.readOnly === true) return;
    handleFileFieldChange(question, []);
    resetDrag(question.id);
    resetNativeFileInput(question.id);
    announceUpload(question.id, tSystem('files.clearAll', language, 'Remove all'));
    onDiagnostic?.('upload.clear', { questionId: question.id });
  };

  const sanitizePreset = (input?: Record<string, any>): Record<string, any> => {
    if (!input) return {};
    const next: Record<string, any> = { ...input };
    Object.keys(next).forEach(key => {
      const v = next[key];
      if (Array.isArray(v)) {
        next[key] = v[0];
      }
    });
    return next;
  };

  const computeRowNonMatchKeys = useCallback(
    (args: {
      group: WebQuestionDefinition;
      rowValues: Record<string, FieldValue>;
      lineItemsSnapshot?: LineItemState;
      valuesSnapshot?: Record<string, FieldValue>;
      subgroupSelectorsSnapshot?: Record<string, string>;
    }): string[] => {
      const {
        group,
        rowValues,
        lineItemsSnapshot = lineItems,
        valuesSnapshot = values,
        subgroupSelectorsSnapshot = subgroupSelectors
      } = args;
      const cfg = group.lineItemConfig;
      if (!cfg || !Array.isArray(cfg.fields) || !cfg.fields.length) return [];
      const subgroupInfo = parseSubgroupKey(group.id);
      const anchorFieldId =
        cfg.anchorFieldId !== undefined && cfg.anchorFieldId !== null ? cfg.anchorFieldId.toString() : undefined;
      const selectorId =
        cfg.sectionSelector?.id !== undefined && cfg.sectionSelector?.id !== null ? cfg.sectionSelector.id.toString() : undefined;
      const selectorValue = selectorId
        ? subgroupInfo
          ? (subgroupSelectorsSnapshot as any)[group.id]
          : (valuesSnapshot as any)[selectorId]
        : undefined;
      const parentValues = subgroupInfo
        ? (lineItemsSnapshot[subgroupInfo.parentGroupKey] || []).find(r => r.id === subgroupInfo.parentRowId)?.values
        : undefined;
      return computeRowNonMatchOptions({
        fields: cfg.fields,
        rowValues,
        topValues: valuesSnapshot,
        parentValues,
        selectorId,
        selectorValue,
        anchorFieldId
      });
    },
    [lineItems, subgroupSelectors, values]
  );

  const addLineItemRow = (
    groupId: string,
    preset?: Record<string, any>,
    rowIdOverride?: string,
    options?: { configOverride?: any }
  ) => {
    const applyLineDefaults = (fields: any[], rowValues: Record<string, FieldValue>): Record<string, FieldValue> => {
      if (!Array.isArray(fields) || !fields.length) return rowValues;
      const nextValues = { ...rowValues };
      fields.forEach(field => {
        if (!field || field.defaultValue === undefined) return;
        if (Object.prototype.hasOwnProperty.call(nextValues, field.id)) return;
        const hasAnyOption =
          Array.isArray(field.options) ? field.options.length > 0 : !!(field.optionsEn?.length || field.optionsFr?.length || field.optionsNl?.length);
        const coerced = coerceDefaultValue({
          type: (field.type || '').toString(),
          raw: field.defaultValue,
          hasAnyOption,
          hasDataSource: !!field.dataSource
        });
        if (coerced !== undefined) {
          nextValues[field.id] = coerced;
        }
      });
      return nextValues;
    };

    setLineItems(prev => {
      const subgroupInfo = parseSubgroupKey(groupId);
      const subgroupDefs = subgroupInfo ? resolveSubgroupDefs(groupId) : null;
      const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
      const parentDef = subgroupInfo ? subgroupDefs?.parent : undefined;
      const rootDef = subgroupInfo ? subgroupDefs?.root : undefined;
      const subDef = subgroupInfo ? subgroupDefs?.sub : undefined;
      const baseConfig = subgroupInfo ? subDef : groupDef?.lineItemConfig;
      const effectiveConfig = options?.configOverride || baseConfig;
      const current = prev[groupId] || [];

      // resolve selector for top-level or subgroup
      let selectorId: string | undefined;
      let selectorValue: FieldValue | undefined;
      if (subgroupInfo) {
        selectorId = effectiveConfig?.sectionSelector?.id;
        selectorValue = subgroupSelectors[groupId];
      } else {
        selectorId = effectiveConfig?.sectionSelector?.id;
        selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      }

      const rowValuesBase: Record<string, FieldValue> = sanitizePreset(preset);
      if (selectorId && selectorValue !== undefined && selectorValue !== null && rowValuesBase[selectorId] === undefined) {
        rowValuesBase[selectorId] = selectorValue;
      }
      const rowValues = applyLineDefaults(effectiveConfig?.fields || [], rowValuesBase);
      const rowIdPrefix = subgroupInfo?.subGroupId || groupId;
      const rowId = rowIdOverride || `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`;
      const baseGroupForNonMatch: WebQuestionDefinition | undefined = subgroupInfo
        ? effectiveConfig
          ? ({
              ...(rootDef as any),
              id: groupId,
              lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [], subGroups: [] }
            } as WebQuestionDefinition)
          : undefined
        : groupDef;
      const groupForNonMatch: WebQuestionDefinition | undefined =
        !subgroupInfo && effectiveConfig && groupDef
          ? ({
              ...(groupDef as any),
              lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [] }
            } as WebQuestionDefinition)
          : baseGroupForNonMatch;
      if (groupForNonMatch?.lineItemConfig?.fields?.length) {
        const nonMatchKeys = computeRowNonMatchKeys({
          group: groupForNonMatch,
          rowValues,
          lineItemsSnapshot: prev,
          valuesSnapshot: values,
          subgroupSelectorsSnapshot: subgroupSelectors
        });
        if (nonMatchKeys.length) {
          rowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
          onDiagnostic?.('optionFilter.nonMatch.seed', { groupId, rowId, keys: nonMatchKeys });
        } else {
          delete rowValues[ROW_NON_MATCH_OPTIONS_KEY];
        }
      }
      const row: LineItemRowState = {
        id: rowId,
        values: rowValues,
        parentId: subgroupInfo?.parentRowId,
        parentGroupId: subgroupInfo?.parentGroupKey
      };
      const nextWithRow = { ...prev, [groupId]: [row, ...current] };
      const groupDefForDefaults =
        !subgroupInfo && groupDef && effectiveConfig
          ? ({
              ...(groupDef as any),
              lineItemConfig: {
                ...(effectiveConfig as any),
                fields: effectiveConfig.fields || [],
                subGroups: effectiveConfig.subGroups || []
              }
            } as WebQuestionDefinition)
          : groupDef;
      const nextLineItems = groupDefForDefaults ? seedSubgroupDefaults(nextWithRow, groupDefForDefaults, row.id) : nextWithRow;
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
        mode: 'init'
      });
      setValues(nextValues);
      return recomputed;
    });
  };

  const addLineItemRowManual = (
    groupId: string,
    preset?: Record<string, any>,
    options?: {
      configOverride?: any;
      rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
    }
  ): LineItemAddResult | undefined => {
    const isEmptySelectorValue = (value: FieldValue | undefined): boolean => {
      if (value === undefined || value === null) return true;
      if (Array.isArray(value)) return value.length === 0;
      return value.toString().trim() === '';
    };

    const subgroupInfo = parseSubgroupKey(groupId);
    const subgroupDefs = subgroupInfo ? resolveSubgroupDefs(groupId) : null;
    const parentDef = subgroupInfo ? subgroupDefs?.parent : undefined;
    const subDef = subgroupInfo ? subgroupDefs?.sub : undefined;
    const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
    const rowFilter = options?.rowFilter || null;
    const baseConfig = subgroupInfo ? subDef : groupDef?.lineItemConfig;
    const effectiveConfig = options?.configOverride || baseConfig;
    const limitsCfg = effectiveConfig;
    const { maxRows: maxRowsLimit } = resolveLineItemRowLimits(limitsCfg as any);
    const currentRows = lineItems[groupId] || [];
    const currentCount = rowFilter
      ? currentRows.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, rowFilter)).length
      : currentRows.length;
    if (isLineItemMaxRowsReached(currentCount, maxRowsLimit)) {
      onDiagnostic?.('ui.addRow.blocked', {
        groupId,
        scope: subgroupInfo ? 'sub' : 'line',
        reason: 'maxRows',
        maxRows: maxRowsLimit,
        currentCount
      });
      return { status: 'blocked' };
    }

    // Enforce required section selector before allowing manual inline adds.
    // (The selector control is not a formal question, so we guard here in addition to disabling the UI button.)
    let addMode: any;
    let selectorCfg: any;
    let selectorId: string | undefined;
    let selectorValue: FieldValue | undefined;
    let anchorFieldId: string | undefined;
    if (subgroupInfo) {
      addMode = (effectiveConfig as any)?.addMode;
      selectorCfg = (effectiveConfig as any)?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId ? ((subgroupSelectors[groupId] as any) as FieldValue) : undefined;
      anchorFieldId =
        (effectiveConfig as any)?.anchorFieldId !== undefined && (effectiveConfig as any)?.anchorFieldId !== null
          ? (effectiveConfig as any).anchorFieldId.toString()
          : undefined;
    } else {
      addMode = (effectiveConfig as any)?.addMode;
      selectorCfg = (effectiveConfig as any)?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      anchorFieldId =
        (effectiveConfig as any)?.anchorFieldId !== undefined && (effectiveConfig as any)?.anchorFieldId !== null
          ? (effectiveConfig as any).anchorFieldId.toString()
          : undefined;
    }
    const baseGroupForNonMatch: WebQuestionDefinition | undefined = subgroupInfo
      ? effectiveConfig
        ? ({
            ...(parentDef as any),
            id: groupId,
            lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [], subGroups: [] }
          } as WebQuestionDefinition)
        : undefined
      : groupDef;
    const groupForNonMatch: WebQuestionDefinition | undefined =
      !subgroupInfo && effectiveConfig && groupDef
        ? ({
            ...(groupDef as any),
            lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [] }
          } as WebQuestionDefinition)
        : baseGroupForNonMatch;
    const inlineMode = addMode === undefined || addMode === null || addMode === 'inline';
    if (inlineMode && selectorCfg?.required && selectorId) {
      const presetSelector =
        preset && Object.prototype.hasOwnProperty.call(preset, selectorId) ? ((preset as any)[selectorId] as FieldValue) : undefined;
      const effectiveSelector = presetSelector !== undefined ? presetSelector : selectorValue;
      if (isEmptySelectorValue(effectiveSelector)) {
        onDiagnostic?.('ui.addRow.blocked', { groupId, reason: 'sectionSelector.required', selectorId });
        return { status: 'blocked' };
      }
    }

    const dedupRules = normalizeLineItemDedupRules((effectiveConfig as any)?.dedupRules);
    if (dedupRules.length) {
      const candidateValues: Record<string, FieldValue> = sanitizePreset(preset);
      const dedupConflict = findLineItemDedupConflict({
        rules: dedupRules,
        rows: currentRows,
        rowValues: candidateValues
      });
      if (dedupConflict) {
        const conflictFieldId = dedupConflict.fields[0];
        const valueToken = resolveLineItemDedupValueToken(candidateValues, conflictFieldId);
        const message = resolveLineItemDedupMessage(dedupConflict.rule, valueToken ? { value: valueToken } : undefined);
        onDiagnostic?.('lineItems.dedup.add.blocked', {
          groupId,
          fields: dedupConflict.fields,
          matchRowId: dedupConflict.matchRow.id
        });
        return {
          status: 'duplicate',
          message,
          fieldId: conflictFieldId,
          matchRowId: dedupConflict.matchRow.id
        };
      }
    }

    // When the inline Add button provides a preset (e.g. set ING from ITEM_FILTER), reuse the first empty
    // seeded row instead of creating a new blank row. This avoids ending up with an extra empty row
    // when minRows seeds one or more rows.
    if (inlineMode && anchorFieldId && preset && Object.prototype.hasOwnProperty.call(preset, anchorFieldId)) {
      const presetVal = (preset as any)[anchorFieldId] as FieldValue;
      if (!isEmptyValue(presetVal as any)) {
        const currentRows = lineItems[groupId] || [];
        const selectorStr = selectorId ? (selectorValue || '').toString().trim() : '';
        const emptyRow = currentRows.find(row => {
          const rowVals = (row as any)?.values || {};
          const keys = Object.keys(rowVals).filter(k => k !== ROW_SOURCE_KEY);
          if (!keys.length) return true;
          if (selectorId && keys.length === 1 && keys[0] === selectorId) {
            const existing = (rowVals as any)[selectorId];
            if (existing === undefined || existing === null || existing === '') return true;
            return existing.toString().trim() === selectorStr;
          }
          return false;
        });

        if (emptyRow) {
          if (subgroupInfo) {
            setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
          }
          const anchor = `${groupId}__${emptyRow.id}`;
          onDiagnostic?.('ui.addRow.manual.fillEmpty', { groupId, rowId: emptyRow.id, anchor, anchorFieldId });
          setPendingScrollAnchor(anchor);
          setLineItems(prev => {
            const rows = prev[groupId] || [];
            const idx = rows.findIndex(r => r.id === emptyRow.id);
            if (idx < 0) return prev;

            const base = rows[idx];
            const nextRowValues: Record<string, FieldValue> = {
              ...(base.values || {}),
              ...sanitizePreset(preset),
              [ROW_SOURCE_KEY]: 'manual'
            };
            if (selectorId && selectorValue !== undefined && selectorValue !== null && nextRowValues[selectorId] === undefined) {
              nextRowValues[selectorId] = selectorValue;
            }
            if (groupForNonMatch?.lineItemConfig?.fields?.length) {
              const nonMatchKeys = computeRowNonMatchKeys({
                group: groupForNonMatch,
                rowValues: nextRowValues,
                lineItemsSnapshot: prev,
                valuesSnapshot: values,
                subgroupSelectorsSnapshot: subgroupSelectors
              });
              if (nonMatchKeys.length) {
                nextRowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
                onDiagnostic?.('optionFilter.nonMatch.seed', { groupId, rowId: emptyRow.id, keys: nonMatchKeys });
              } else {
                delete nextRowValues[ROW_NON_MATCH_OPTIONS_KEY];
              }
            }

            const nextRow: LineItemRowState = { ...base, values: nextRowValues };
            const nextRows = [...rows];
            nextRows[idx] = nextRow;
            const nextLineItems = { ...prev, [groupId]: nextRows };
            const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
              mode: 'init'
            });
            setValues(nextValues);
            return recomputed;
          });
          return { status: 'added' };
        }
      }
    }

    const rowIdPrefix = subgroupInfo?.subGroupId || groupId;
    const rowId = `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`;

    if (subgroupInfo) {
      setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
    }
    const anchor = `${groupId}__${rowId}`;
    onDiagnostic?.('ui.addRow.manual', { groupId, rowId, anchor, presetKeys: preset ? Object.keys(preset).slice(0, 10) : [] });
    setPendingScrollAnchor(anchor);
    addLineItemRow(groupId, { ...(preset || {}), [ROW_SOURCE_KEY]: 'manual' }, rowId, { configOverride: effectiveConfig });
    return { status: 'added' };
  };

  useEffect(() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return;
    const overrideGroup = lineItemGroupOverlay.group;
    const overlayRowFilter = lineItemGroupOverlay.rowFilter || null;
    const group =
      overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
        ? overrideGroup
        : definition.questions.find(q => q.id === lineItemGroupOverlay.groupId && q.type === 'LINE_ITEM_GROUP');
    if (!group) return;
    const groupCfg = (group as any).lineItemConfig;
    if (!groupCfg) return;
    const { minRows, maxRows } = resolveLineItemRowLimits(groupCfg as any);
    if (minRows === undefined || minRows === null || minRows <= 0) return;
    const appliedMinRows = maxRows !== undefined && maxRows !== null ? Math.min(minRows, maxRows) : minRows;
    const rowsAll = lineItems[group.id] || [];
    const rowsMatching = overlayRowFilter
      ? rowsAll.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayRowFilter))
      : rowsAll;
    if (rowsMatching.length >= appliedMinRows) return;
    const addCount = appliedMinRows - rowsMatching.length;
    onDiagnostic?.('lineItemGroup.overlay.minRows.seed', {
      groupId: group.id,
      minRows: appliedMinRows,
      maxRows: maxRows ?? null,
      addCount
    });
    for (let i = 0; i < addCount; i += 1) {
      addLineItemRow(group.id, undefined, undefined, { configOverride: groupCfg });
    }
  }, [
    addLineItemRow,
    definition.questions,
    lineItemGroupOverlay.group,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.rowFilter,
    lineItems,
    matchesOverlayRowFilter,
    onDiagnostic
  ]);

  useEffect(() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return;
    const subKey = subgroupOverlay.subKey;
    const subgroupDefs = resolveSubgroupDefs(subKey);
    const subConfigBase = subgroupDefs.sub;
    if (!subConfigBase) return;
    const overlayRowFilter = subgroupOverlay.rowFilter || null;
    const subConfig = subgroupOverlay.groupOverride
      ? applyLineItemGroupOverride(subConfigBase, subgroupOverlay.groupOverride)
      : subConfigBase;
    const { minRows, maxRows } = resolveLineItemRowLimits(subConfig as any);
    if (minRows === undefined || minRows === null || minRows <= 0) return;
    const appliedMinRows = maxRows !== undefined && maxRows !== null ? Math.min(minRows, maxRows) : minRows;
    const rowsAll = lineItems[subKey] || [];
    const rowsMatching = overlayRowFilter
      ? rowsAll.filter(r => matchesOverlayRowFilter(((r as any)?.values || {}) as any, overlayRowFilter))
      : rowsAll;
    if (rowsMatching.length >= appliedMinRows) return;
    const addCount = appliedMinRows - rowsMatching.length;
    const parsed = parseSubgroupKey(subKey);
    onDiagnostic?.('subgroup.overlay.minRows.seed', {
      groupId: subKey,
      rootGroupId: parsed?.rootGroupId || null,
      subGroupId: parsed?.subGroupId || null,
      minRows: appliedMinRows,
      maxRows: maxRows ?? null,
      addCount
    });
    for (let i = 0; i < addCount; i += 1) {
      addLineItemRow(subKey, undefined, undefined, { configOverride: subConfig });
    }
  }, [
    addLineItemRow,
    lineItems,
    matchesOverlayRowFilter,
    onDiagnostic,
    subgroupOverlay.groupOverride,
    subgroupOverlay.open,
    subgroupOverlay.rowFilter,
    subgroupOverlay.subKey
  ]);

  // Fix: `addMode: "auto"` reconciliation previously lived only inside `LineItemGroupQuestion`.
  // For groups with `ui.openInOverlay: true`, the question component isn't mounted until the overlay is opened,
  // so auto rows could look stale in the top-level form / summary view until then.
  const overlayAutoGroupConfigs = useMemo(() => {
    const cfgs: Array<{
      groupId: string;
      anchorField: any;
      dependencyIds: string[];
      selectorId?: string;
    }> = [];
    (definition.questions || []).forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const groupCfg = q.lineItemConfig;
      if (!groupCfg) return;
      const overlayEnabled = !!(groupCfg as any)?.ui?.openInOverlay;
      if (!overlayEnabled) return;
      if ((groupCfg as any)?.addMode !== 'auto') return;
      if (!groupCfg.anchorFieldId) return;

      const anchorFieldId =
        groupCfg.anchorFieldId !== undefined && groupCfg.anchorFieldId !== null ? groupCfg.anchorFieldId.toString() : '';
      const anchorField = anchorFieldId ? (groupCfg.fields || []).find((f: any) => f && f.id === anchorFieldId) : undefined;
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const rawDependsOn = (anchorField as any)?.optionFilter?.dependsOn;
      const dependencyIds = (Array.isArray(rawDependsOn) ? rawDependsOn : rawDependsOn ? [rawDependsOn] : [])
        .map((id: any) => (id ?? '').toString().trim())
        .filter(Boolean);
      if (!dependencyIds.length) return;

      cfgs.push({
        groupId: q.id,
        anchorField,
        dependencyIds,
        selectorId: groupCfg.sectionSelector?.id
      });
    });
    return cfgs;
  }, [definition.questions]);

  const overlayAutoAddSignature = useMemo(() => {
    if (!overlayAutoGroupConfigs.length) return '';
    return overlayAutoGroupConfigs
      .map(cfg => {
        const depSig = cfg.dependencyIds
          .map(depId => {
            const dep = toDependencyValue((values as any)[depId] as any);
            if (dep === undefined || dep === null) return '';
            return dep.toString();
          })
          .join('||');
        return `${cfg.groupId}:${depSig}`;
      })
      .join('##');
  }, [overlayAutoGroupConfigs, values]);

  useEffect(() => {
    if (submitting) return;
    if (!overlayAutoGroupConfigs.length) return;
    setLineItems(prev => {
      const skipGroupId = lineItemGroupOverlay.open ? (lineItemGroupOverlay.groupId || undefined) : undefined;
      const res = reconcileOverlayAutoAddModeGroups({
        definition,
        values,
        lineItems: prev,
        optionState,
        language,
        ensureLineOptions,
        skipGroupId
      });
      if (!res.changed) return prev;
      setValues(res.values);
      onDiagnostic?.('ui.lineItems.autoAdd.overlay.applyBatch', {
        specCount: res.specCount,
        changedCount: res.changedCount
      });
      return res.lineItems;
    });
  }, [
    submitting,
    overlayAutoGroupConfigs,
    overlayAutoAddSignature,
    optionState,
    language,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    setLineItems,
    setValues
  ]);

  useEffect(() => {
    if (submitting) return;

    setLineItems(prev => {
      const skipParentGroupId = lineItemGroupOverlay.open ? (lineItemGroupOverlay.groupId || undefined) : undefined;
      const res = reconcileOverlayAutoAddModeSubgroups({
        definition,
        values,
        lineItems: prev,
        optionState,
        language,
        subgroupSelectors,
        ensureLineOptions,
        skipParentGroupId
      });
      if (!res.changed) return prev;
      setValues(res.values);
      onDiagnostic?.('ui.lineItems.autoAdd.overlaySubgroups.applyBatch', {
        specCount: res.specCount,
        changedCount: res.changedCount
      });
      return res.lineItems;
    });
  }, [
    submitting,
    definition.questions,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    setLineItems,
    setValues
  ]);

  const removeLineRow = (groupId: string, rowId: string) => {
    if (onSelectionEffect) {
      const groupQuestion = definition.questions.find(q => q.id === groupId);
      const rows = lineItems[groupId] || [];
      const targetRow = rows.find(r => r.id === rowId);
      if (groupQuestion && targetRow) {
        clearSelectionEffectsForRow(groupQuestion, targetRow);
      }
    }
    const prevLineItems = lineItems;
    const cascade = cascadeRemoveLineItemRows({ lineItems: prevLineItems, roots: [{ groupId, rowId }] });
    if (cascade.removedSubgroupKeys.length) {
      setSubgroupSelectors(prevSel => {
        const nextSel = { ...prevSel };
        cascade.removedSubgroupKeys.forEach(key => {
          delete (nextSel as any)[key];
        });
        return nextSel;
      });
    }
    onDiagnostic?.('ui.lineItems.remove.cascade', { groupId, rowId, removedCount: cascade.removed.length });
    const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, cascade.lineItems, {
      mode: 'init'
    });
    setValues(nextValues);
    setLineItems(recomputed);
    runSelectionEffectsForAncestorRows(groupId, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
  };

  const clearSelectionEffectsForRow = (groupQuestion: WebQuestionDefinition, row: LineItemRowState) => {
    if (!onSelectionEffect) return;
    const effectFields = (groupQuestion.lineItemConfig?.fields || []).filter(field => Array.isArray((field as any).selectionEffects) && (field as any).selectionEffects.length);
    if (!effectFields.length) return;
    effectFields.forEach(field => {
      const contextId = buildLineContextId(groupQuestion.id, row.id, field.id);
      onSelectionEffect(field as unknown as WebQuestionDefinition, null, {
        contextId,
        lineItem: { groupId: groupQuestion.id, rowId: row.id, rowValues: row.values },
        forceContextReset: true
      });
    });
  };

  const resolveVisibilityValue = useCallback(
    (fieldId: string): FieldValue | undefined => {
    if (guidedVirtualState) {
      const virtual = resolveVirtualStepField(fieldId, guidedVirtualState as any);
      if (virtual !== undefined) return virtual as FieldValue;
    }
    const direct = values[fieldId];
    if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
    const sys = getSystemFieldValue(fieldId, recordMeta);
    if (sys !== undefined) return sys as FieldValue;
    // scan all line item groups for the first non-empty occurrence
    for (const rows of Object.values(lineItems)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const v = (row as LineItemRowState).values[fieldId];
        if (v !== undefined && v !== null && v !== '') return v as FieldValue;
      }
    }
    return undefined;
    },
    [guidedVirtualState, lineItems, recordMeta, values]
  );

  const topVisibilityCtx = useMemo(
    () => ({
      getValue: (fieldId: string) => resolveVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveVisibilityValue]
  );

  const resolveTopValueNoScan = useCallback(
    (sourceValues: Record<string, FieldValue>, fieldId: string): FieldValue | undefined => {
      if (guidedVirtualState) {
        const virtual = resolveVirtualStepField(fieldId, guidedVirtualState as any);
        if (virtual !== undefined) return virtual as FieldValue;
      }
      const direct = sourceValues[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      const sys = getSystemFieldValue(fieldId, recordMeta);
      if (sys !== undefined) return sys as FieldValue;
      return undefined;
    },
    [guidedVirtualState, recordMeta]
  );

  const getTopValueNoScan = useCallback(
    (fieldId: string): FieldValue | undefined => resolveTopValueNoScan(values, fieldId),
    [resolveTopValueNoScan, values]
  );

  const lineItemVisibilityTargets = useMemo(() => {
    const questions = definition.questions || [];
    return questions
      .filter(q => q?.visibility && (containsLineItemsClause(q.visibility.showWhen) || containsLineItemsClause(q.visibility.hideWhen)))
      .map(q => ({ id: q.id, visibility: q.visibility }));
  }, [definition.questions]);

  const parentScopedVisibilityTargets = useMemo(() => {
    const questions = definition.questions || [];
    return questions
      .filter(
        q =>
          q?.visibility &&
          (containsParentLineItemsClause(q.visibility.showWhen) || containsParentLineItemsClause(q.visibility.hideWhen))
      )
      .map(q => q.id)
      .filter(Boolean);
  }, [definition.questions]);

  useEffect(() => {
    if (!onDiagnostic || !lineItemVisibilityTargets.length) return;
    const fields = lineItemVisibilityTargets.map(target => target.id).filter(Boolean);
    onDiagnostic('visibility.lineItems.enabled', { count: fields.length, fields: fields.slice(0, 10) });
  }, [lineItemVisibilityTargets, onDiagnostic]);

  useEffect(() => {
    if (!onDiagnostic || !parentScopedVisibilityTargets.length) return;
    onDiagnostic('visibility.lineItems.parentScope.enabled', {
      count: parentScopedVisibilityTargets.length,
      fields: parentScopedVisibilityTargets.slice(0, 10)
    });
  }, [onDiagnostic, parentScopedVisibilityTargets]);

  const lineItemVisibilityState = useMemo<Record<string, boolean>>(() => {
    if (!lineItemVisibilityTargets.length) return {};
    const next: Record<string, boolean> = {};
    lineItemVisibilityTargets.forEach(target => {
      next[target.id] = shouldHideField(target.visibility, topVisibilityCtx);
    });
    return next;
  }, [lineItemVisibilityTargets, topVisibilityCtx]);

  const lineItemVisibilityRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!onDiagnostic || !lineItemVisibilityTargets.length) return;
    const prev = lineItemVisibilityRef.current || {};
    const isInit = Object.keys(prev).length === 0;
    lineItemVisibilityTargets.forEach(target => {
      const hidden = lineItemVisibilityState[target.id];
      if (hidden === undefined) return;
      if (isInit || prev[target.id] !== hidden) {
        onDiagnostic('visibility.lineItems.state', { fieldId: target.id, hidden, reason: isInit ? 'init' : 'update' });
      }
    });
    lineItemVisibilityRef.current = lineItemVisibilityState;
  }, [lineItemVisibilityState, lineItemVisibilityTargets, onDiagnostic]);

  const orderedEntryErrors = useMemo(() => {
    if (!orderedEntryEnabled) return null;
    if (!definition?.questions?.length) return null;
    try {
      return validateForm({
        definition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups
      });
    } catch (err: any) {
      onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      return null;
    }
  }, [collapsedRows, collapsedSubgroups, definition, language, lineItems, onDiagnostic, orderedEntryEnabled, values]);

  const orderedEntryValid = useMemo(() => {
    if (!orderedEntryEnabled) return true;
    return !orderedEntryErrors || Object.keys(orderedEntryErrors).length === 0;
  }, [orderedEntryEnabled, orderedEntryErrors]);

  const buildOrderedEntryErrors = useCallback(
    (missingFieldPath: string, allErrors: FormErrors): FormErrors => {
      if (!missingFieldPath) return allErrors || {};
      const fromAll = allErrors?.[missingFieldPath];
      if (fromAll) return { [missingFieldPath]: fromAll };
      const parts = missingFieldPath.split('__').filter(Boolean);
      let label = '';
      if (parts.length >= 2) {
        const [groupId, fieldId] = parts;
        const group = (definition.questions || []).find(q => q.id === groupId);
        const field = group?.lineItemConfig?.fields?.find((f: any) => (f?.id ?? '').toString() === fieldId);
        if (field) label = resolveFieldLabel(field, language, fieldId);
      } else {
        const q = (definition.questions || []).find(q => q.id === missingFieldPath);
        if (q) label = resolveFieldLabel(q, language, q.id);
      }
      const fallbackLabel = label || missingFieldPath;
      return {
        [missingFieldPath]: tSystem('validation.fieldRequired', language, '{field} is required.', { field: fallbackLabel })
      };
    },
    [definition.questions, language]
  );

  useEffect(() => {
    if (!onFormValidityChange) return;
    onFormValidityChange(orderedEntryValid);
  }, [onFormValidityChange, orderedEntryValid]);

  const resolveOrderedEntryBlock = useCallback(
    (target: OrderedEntryTarget, targetGroup?: WebQuestionDefinition) => {
      if (!orderedEntryEnabled) return null;
      return findOrderedEntryBlock({
        definition,
        language,
        values,
        lineItems,
        collapsedRows,
        resolveVisibilityValue,
        getTopValue: getTopValueNoScan,
        orderedQuestions: orderedEntryQuestions,
        target,
        targetGroup
      });
    },
    [
      collapsedRows,
      definition,
      getTopValueNoScan,
      language,
      lineItems,
      orderedEntryEnabled,
      orderedEntryQuestions,
      resolveVisibilityValue,
      values
    ]
  );

  const triggerOrderedEntryValidation = useCallback(
    (
      target: OrderedEntryTarget,
      missingFieldPath: string,
      options?: { navigate?: boolean; source?: string; scrollOnly?: boolean }
    ) => {
      let nextErrors: FormErrors = {};
      try {
        nextErrors = validateForm({
          definition,
          language,
          values,
          lineItems,
          collapsedRows,
          collapsedSubgroups
        });
      } catch (err: any) {
        onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      }
      setErrors(buildOrderedEntryErrors(missingFieldPath, nextErrors));
      const shouldNavigate = options?.navigate !== false || options?.scrollOnly === true;
      if (shouldNavigate) {
        errorNavRequestRef.current += 1;
        errorNavModeRef.current = options?.scrollOnly ? 'scroll' : 'focus';
        onDiagnostic?.('validation.navigate.request', {
          attempt: errorNavRequestRef.current,
          scope: 'orderedEntry',
          mode: errorNavModeRef.current
        });
      } else {
        onDiagnostic?.('validation.ordered.blocked.noNavigate', {
          scope: target.scope,
          missingFieldPath,
          source: options?.source || null
        });
      }
      onDiagnostic?.('validation.ordered.blocked', {
        targetScope: target.scope,
        targetFieldPath:
          target.scope === 'top'
            ? target.questionId
            : `${target.groupId}__${target.fieldId}__${target.rowId}`,
        missingFieldPath
      });
    },
    [buildOrderedEntryErrors, collapsedRows, collapsedSubgroups, definition, language, lineItems, onDiagnostic, setErrors, values]
  );

  useEffect(() => {
    orderedEntryGateRef.current = ({ targetQuestionId }) => {
      if (!orderedEntryEnabled) return false;
      const orderedBlock = resolveOrderedEntryBlock({ scope: 'top', questionId: targetQuestionId });
      if (!orderedBlock) return false;
      triggerOrderedEntryValidation({ scope: 'top', questionId: targetQuestionId }, orderedBlock.missingFieldPath);
      return true;
    };
  }, [orderedEntryEnabled, resolveOrderedEntryBlock, triggerOrderedEntryValidation]);

  useEffect(() => {
    if (submitting) return;
    const res = recomputeLineItemNonMatchOptions({
      definition,
      values,
      lineItems,
      subgroupSelectors
    });
    if (!res.changed) return;
    setLineItems(res.lineItems);
    onDiagnostic?.('optionFilter.nonMatch.reconcile', {
      updatedRows: res.updatedRows
    });
  }, [definition, values, lineItems, subgroupSelectors, submitting, setLineItems, onDiagnostic]);

  const computeParagraphDisclaimerUpdates = useCallback(
    (
      currentValues: Record<string, FieldValue>,
      currentLineItems: LineItemState,
      currentOptionState: OptionState
    ): {
      updates: Record<string, FieldValue>;
      updatedCount: number;
      fieldUpdates: Array<{ fieldId: string; keyCount: number; itemCount: number }>;
    } => {
      const updates: Record<string, FieldValue> = {};
      const fieldUpdates: Array<{ fieldId: string; keyCount: number; itemCount: number }> = [];
      (definition.questions || []).forEach(q => {
        if (q.type !== 'PARAGRAPH') return;
        const disclaimerCfg = (q.ui as any)?.paragraphDisclaimer;
        if (!disclaimerCfg) return;
        const { sectionText, separator, keyCount, itemCount } = buildParagraphDisclaimerSection({
          config: disclaimerCfg,
          definition,
          lineItems: currentLineItems,
          optionState: currentOptionState,
          language
        });
        const current = currentValues[q.id] === undefined || currentValues[q.id] === null ? '' : currentValues[q.id]?.toString?.() || '';
        const { userText, sectionText: storedSection, hasDisclaimer, marker } = splitParagraphDisclaimerValue({
          rawValue: current,
          separator
        });
        const editable = !!disclaimerCfg?.editable;
        if (editable) {
          if (!sectionText) return;
          const combined = buildParagraphDisclaimerValue({
            userText,
            sectionText,
            separator,
            markerOverride: hasDisclaimer ? marker : undefined
          });
          if (combined !== current) {
            updates[q.id] = combined;
            fieldUpdates.push({ fieldId: q.id, keyCount, itemCount });
          }
          return;
        }
        const combined = buildParagraphDisclaimerValue({
          userText,
          sectionText,
          separator,
          markerOverride: hasDisclaimer ? marker : undefined
        });
        if (combined !== current) {
          updates[q.id] = combined;
          fieldUpdates.push({ fieldId: q.id, keyCount, itemCount });
        }
      });
      return { updates, updatedCount: fieldUpdates.length, fieldUpdates };
    },
    [definition, language]
  );

  const syncParagraphDisclaimers = useCallback(
    (source?: string) => {
      if (submitting) return false;
      const { updates, updatedCount, fieldUpdates } = computeParagraphDisclaimerUpdates(
        valuesRef.current,
        lineItemsRef.current,
        optionStateRef.current as OptionState
      );
      if (!updatedCount) return false;
      setValues(prev => ({ ...prev, ...updates }));
      fieldUpdates.forEach(meta => {
        onDiagnostic?.('paragraphDisclaimer.sync.field', meta);
      });
      onDiagnostic?.('paragraphDisclaimer.sync', { updatedCount, source });
      return true;
    },
    [computeParagraphDisclaimerUpdates, onDiagnostic, setValues, submitting]
  );

  const requestParagraphDisclaimerSync = useCallback(
    (source?: string) => {
      if (submitting) return;
      if (isParagraphDisclaimerFocused()) {
        paragraphDisclaimerPendingRef.current = true;
        return;
      }
      paragraphDisclaimerPendingRef.current = false;
      syncParagraphDisclaimers(source);
    },
    [isParagraphDisclaimerFocused, syncParagraphDisclaimers, submitting]
  );

  useEffect(() => {
    paragraphDisclaimerSyncRef.current = (source?: string) => requestParagraphDisclaimerSync(source);
  }, [requestParagraphDisclaimerSync]);

  useEffect(() => {
    if (submitting) return;
    const { updatedCount } = computeParagraphDisclaimerUpdates(
      valuesRef.current,
      lineItemsRef.current,
      optionStateRef.current as OptionState
    );
    if (!updatedCount) {
      paragraphDisclaimerPendingRef.current = false;
      return;
    }
    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const tag = active?.tagName ? active.tagName.toLowerCase() : '';
    const isFormInput = active && (tag === 'input' || tag === 'textarea' || tag === 'select');
    if (isFormInput) {
      paragraphDisclaimerPendingRef.current = true;
      return;
    }
    paragraphDisclaimerPendingRef.current = false;
    syncParagraphDisclaimers('change');
  }, [definition, lineItems, optionState, language, submitting, computeParagraphDisclaimerUpdates, syncParagraphDisclaimers]);

  const overlayOpenStateRef = useRef({ line: false, sub: false });

  useEffect(() => {
    const prev = overlayOpenStateRef.current;
    const next = { line: lineItemGroupOverlay.open, sub: subgroupOverlay.open };
    overlayOpenStateRef.current = next;
    const closedLine = prev.line && !next.line;
    const closedSub = prev.sub && !next.sub;
    if (!closedLine && !closedSub) return;
    if (!paragraphDisclaimerPendingRef.current) return;
    if (isParagraphDisclaimerFocused()) return;
    paragraphDisclaimerPendingRef.current = false;
    syncParagraphDisclaimers('overlayClose');
  }, [lineItemGroupOverlay.open, subgroupOverlay.open, isParagraphDisclaimerFocused, syncParagraphDisclaimers]);

  const blurActiveElement = useCallback(
    (reason: string, meta?: Record<string, any>) => {
      try {
        const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        if (el && typeof (el as any).blur === 'function') {
          (el as any).blur();
          onDiagnostic?.('ui.blur', { reason, ...(meta || {}) });
        }
      } catch (_) {
        // ignore blur failures
      }
    },
    [onDiagnostic]
  );

  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (submitting) return;
    // Allow edits to proceed; readOnly/valueMap are enforced at the input level.
    if (q.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup(q.id)) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'dedupConflict' });
      return;
    }
    const orderedBlock = resolveOrderedEntryBlock({ scope: 'top', questionId: q.id });
    if (orderedBlock) {
      blurActiveElement('orderedEntry.blocked', { scope: 'top', fieldId: q.id });
      triggerOrderedEntryValidation({ scope: 'top', questionId: q.id }, orderedBlock.missingFieldPath, {
        navigate: false,
        scrollOnly: true,
        source: 'change'
      });
      return;
    }
    guidedLastUserEditAtRef.current = Date.now();
    onUserEdit?.({ scope: 'top', fieldPath: q.id, fieldId: q.id, event: 'change', nextValue: value });
    clearOverlayOpenActionSuppression(q.id);
    if (onStatusClear) onStatusClear();
    const currentValues = valuesRef.current;
    const currentLineItems = lineItemsRef.current;
    if (
      q.clearOnChange === true &&
      !isEmptyValue(currentValues[q.id]) &&
      !isEmptyValue(value) &&
      !areFieldValuesEqual(currentValues[q.id], value)
    ) {
      const cleared = applyClearOnChange({
        definition,
        values: currentValues,
        lineItems: currentLineItems,
        fieldId: q.id,
        nextValue: value
      });
      onDiagnostic?.('field.clearOnChange', {
        fieldId: q.id,
        clearedFieldCount: cleared.clearedFieldIds.length,
        clearedGroupCount: cleared.clearedGroupKeys.length
      });
      setValues(cleared.values);
      setLineItems(cleared.lineItems);
      valuesRef.current = cleared.values;
      lineItemsRef.current = cleared.lineItems;
      setErrors({});
      if (onSelectionEffect) {
        onSelectionEffect(q, value);
      }
      return;
    }
    const baseValues = { ...currentValues, [q.id]: value };
    const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(
      definition,
      baseValues,
      currentLineItems,
      {
        mode: 'change',
        lockedTopFields: [q.id]
      }
    );
    setValues(nextValues);
    if (nextLineItems !== currentLineItems) {
      setLineItems(nextLineItems);
    }
    valuesRef.current = nextValues;
    lineItemsRef.current = nextLineItems;
    setErrors(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    if (onSelectionEffect) {
      onSelectionEffect(q, value);
    }
  };

  function runSelectionEffectsForAncestorRows(
    sourceGroupKey: string,
    prevLineItems: LineItemState,
    nextLineItems: LineItemState,
    options?: { mode?: 'init' | 'change' | 'blur'; topValues?: Record<string, FieldValue> }
  ) {
    if (!onSelectionEffect) return;
    runSelectionEffectsForAncestors({
      definition,
      values,
      onSelectionEffect,
      sourceGroupKey,
      prevLineItems,
      nextLineItems,
      options
    });
  }

  const handleLineFieldChange = (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => {
    if (submitting) return;
    // Allow edits to proceed; readOnly/valueMap are enforced at the input level.
    if (field?.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'line', fieldPath: `${group.id}__${field?.id || ''}__${rowId}`, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup((field?.id || '').toString())) {
      onDiagnostic?.('field.change.blocked', {
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        reason: 'dedupConflict'
      });
      return;
    }
    const orderedBlock = resolveOrderedEntryBlock(
      {
        scope: 'line',
        groupId: group.id,
        rowId,
        fieldId: (field?.id || '').toString()
      },
      group
    );
    if (orderedBlock) {
      blurActiveElement('orderedEntry.blocked', {
        scope: 'line',
        groupId: group.id,
        fieldId: (field?.id || '').toString(),
        rowId
      });
      triggerOrderedEntryValidation(
        {
          scope: 'line',
          groupId: group.id,
          rowId,
          fieldId: (field?.id || '').toString()
        },
        orderedBlock.missingFieldPath,
        { navigate: false, scrollOnly: true, source: 'change' }
      );
      return;
    }
    guidedLastUserEditAtRef.current = Date.now();
    onUserEdit?.({
      scope: 'line',
      fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
      fieldId: (field?.id || '').toString(),
      groupId: group.id,
      rowId,
      event: 'change',
      nextValue: value
    });
    clearOverlayOpenActionSuppression(`${group.id}__${field?.id || ''}__${rowId}`);
    if (onStatusClear) onStatusClear();
    const currentLineItems = lineItemsRef.current;
    const currentValues = valuesRef.current;
    const existingRows = currentLineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const nextRowValues: Record<string, FieldValue> = { ...(currentRow?.values || {}), [field.id]: value };
    const dedupRules = normalizeLineItemDedupRules((group.lineItemConfig as any)?.dedupRules);
    const dedupRuleMessages = dedupRules
      .map(rule => {
        const fieldId = (rule.fields || []).map(fid => (fid ?? '').toString().trim()).filter(Boolean)[0];
        if (!fieldId) return null;
        const valueToken = resolveLineItemDedupValueToken(nextRowValues, fieldId);
        return {
          fieldId,
          message: resolveLineItemDedupMessage(rule, valueToken ? { value: valueToken } : undefined),
          fields: rule.fields
        };
      })
      .filter(Boolean) as Array<{ fieldId: string; message: string; fields: string[] }>;
    const dedupConflict = findLineItemDedupConflict({
      rules: dedupRules,
      rows: existingRows,
      rowValues: nextRowValues,
      excludeRowId: rowId
    });
    if (dedupConflict) {
      const conflictFieldId = dedupConflict.fields[0];
      const valueToken = resolveLineItemDedupValueToken(nextRowValues, conflictFieldId);
      const conflictMessage = resolveLineItemDedupMessage(
        dedupConflict.rule,
        valueToken ? { value: valueToken } : undefined
      );
      const conflictPath = `${group.id}__${conflictFieldId}__${rowId}`;
      setErrors(prev => {
        const next = { ...prev };
        dedupRuleMessages.forEach(entry => {
          const key = `${group.id}__${entry.fieldId}__${rowId}`;
          if (next[key] === entry.message) delete next[key];
        });
        next[conflictPath] = conflictMessage;
        return next;
      });
      onDiagnostic?.('lineItems.dedup.blocked', {
        groupId: group.id,
        rowId,
        fields: dedupConflict.fields,
        matchRowId: dedupConflict.matchRow.id
      });
      return;
    }
    const nonMatchKeys = computeRowNonMatchKeys({ group, rowValues: nextRowValues });
    const existingNonMatchKeys = parseRowNonMatchOptions((currentRow?.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
    const nonMatchSame =
      nonMatchKeys.length === existingNonMatchKeys.length &&
      nonMatchKeys.every((val, idx) => val === existingNonMatchKeys[idx]);
    if (nonMatchKeys.length) {
      nextRowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
      if (!nonMatchSame) {
        onDiagnostic?.('optionFilter.nonMatch.update', {
          groupId: group.id,
          rowId,
          fieldId: (field?.id || '').toString(),
          keys: nonMatchKeys
        });
      }
    } else {
      delete nextRowValues[ROW_NON_MATCH_OPTIONS_KEY];
    }
    const nextRows = existingRows.map(row =>
      row.id === rowId ? { ...row, values: nextRowValues } : row
    );
    let updatedLineItems: LineItemState = { ...currentLineItems, [group.id]: nextRows };
    const { values: nextValues, lineItems: finalLineItems } = applyValueMapsToForm(
      definition,
      currentValues,
      updatedLineItems,
      {
        mode: 'change'
      }
    );
    const syncedLineItems = finalLineItems;
    setLineItems(syncedLineItems);
    setValues(nextValues);
    valuesRef.current = nextValues;
    lineItemsRef.current = syncedLineItems;
    const updatedRow = (syncedLineItems[group.id] || []).find(r => r.id === rowId);
    const updatedRowValues = ((updatedRow?.values || nextRowValues) as Record<string, FieldValue>) || nextRowValues;
    attemptOverlayDetailAutoOpen({
      group,
      rowId,
      rowValues: updatedRowValues,
      nextValues,
      nextLineItems: syncedLineItems,
      triggerFieldId: (field?.id || '').toString(),
      source: 'change'
    });
    setErrors(prev => {
      const next = { ...prev };
      delete next[group.id];
      delete next[`${group.id}__${field.id}__${rowId}`];
      dedupRuleMessages.forEach(entry => {
        const key = `${group.id}__${entry.fieldId}__${rowId}`;
        if (next[key] === entry.message) delete next[key];
      });
      return next;
    });
    if (onSelectionEffect) {
      const selectionEffectRowValues = (() => {
        const merged: Record<string, FieldValue> = { ...updatedRowValues };
        const mergeMissing = (source?: Record<string, FieldValue>) => {
          if (!source) return;
          Object.entries(source).forEach(([key, val]) => {
            if (Object.prototype.hasOwnProperty.call(merged, key)) return;
            merged[key] = val;
          });
        };
        let currentKey = group.id;
        let info = parseSubgroupKey(currentKey);
        while (info) {
          const currentInfo = info;
          const parentRows = syncedLineItems[currentInfo.parentGroupKey] || [];
          const parentRow = parentRows.find(r => r.id === currentInfo.parentRowId);
          mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
          currentKey = currentInfo.parentGroupKey;
          info = parseSubgroupKey(currentKey);
        }
        return merged;
      })();
      const effectFields = (group.lineItemConfig?.fields || []).filter(hasSelectionEffects);
      if (effectFields.length) {
        const rowComplete = isLineRowComplete(group, updatedRowValues);
        effectFields.forEach(effectField => {
          const isSourceField = effectField.id === field.id;
          const dependsOnChangedField = !isSourceField && selectionEffectDependsOnField(effectField, field.id);
          if (!isSourceField && !dependsOnChangedField) {
            return;
          }
          const contextId = buildLineContextId(group.id, rowId, effectField.id);
          const currentValue = updatedRowValues[effectField.id] as FieldValue;
          const effectQuestion = effectField as unknown as WebQuestionDefinition;
          if (!isSourceField && dependsOnChangedField) {
            // Re-run effect with current value and force context reset so dependent fields (e.g., multipliers) refresh aggregates,
            // even if other fields in the row are still empty.
            onSelectionEffect(effectQuestion, currentValue ?? null, {
              contextId,
              lineItem: { groupId: group.id, rowId, rowValues: selectionEffectRowValues },
              forceContextReset: true
            });
            return;
          }
          const isClearingSource = isSourceField && isEmptyValue(value as FieldValue);
          const payloadValue = isSourceField
            ? isClearingSource
              ? null
              : currentValue ?? null
            : currentValue ?? null;
          onSelectionEffect(effectQuestion, payloadValue, {
            contextId,
            lineItem: { groupId: group.id, rowId, rowValues: selectionEffectRowValues },
            forceContextReset: true
          });
        });
      }

      runSelectionEffectsForAncestorRows(group.id, currentLineItems, syncedLineItems, { mode: 'change', topValues: nextValues });
    }
  };

  const processIncomingFilesForLineField = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    incoming: File[];
  }) => {
    const { group, rowId, field, fieldPath, incoming } = args;
    if (!incoming.length) return;
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    const pseudo = { uploadConfig: field.uploadConfig } as unknown as WebQuestionDefinition;
    const { items: files, errorMessage } = applyUploadConstraints(pseudo, existingFiles, incoming, language);

    handleLineFieldChange(group, rowId, field, files as unknown as FieldValue);
    setErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[fieldPath] = errorMessage;
      } else {
        delete next[fieldPath];
      }
      return next;
    });

    const accepted = Math.max(0, files.length - existingFiles.length);
    if (errorMessage) {
      announceUpload(fieldPath, errorMessage);
      onDiagnostic?.('upload.error', { fieldPath, error: errorMessage, scope: 'line' });
    } else if (accepted > 0) {
      announceUpload(
        fieldPath,
        accepted === 1
          ? tSystem('files.selectedOne', language, '1 photo added')
          : tSystem('files.selectedMany', language, '{count} photos added', { count: accepted })
      );
    } else {
      announceUpload(fieldPath, tSystem('common.noChange', language, 'No change.'));
    }
    onDiagnostic?.('upload.add', {
      fieldPath,
      attempted: incoming.length,
      accepted,
      total: files.length,
      error: Boolean(errorMessage),
      scope: 'line'
    });

    // Immediate upload: upload accepted files now, then persist URLs via draft save (handled by App).
    if (onUploadFiles && accepted > 0) {
      announceUpload(fieldPath, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: 'line',
        fieldPath,
        groupId: group.id,
        rowId,
        fieldId: field.id,
        items: files,
        uploadConfig: field.uploadConfig
      }).then(res => {
        if (!res?.success) {
          announceUpload(fieldPath, (res?.message || tSystem('files.error.uploadFailed', language, 'Could not add photos.')).toString());
          return;
        }
        announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
      });
    }
  };

  const handleLineFileInputChange = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => {
    const { group, rowId, field, fieldPath, list } = args;
    if (!list || !list.length) {
      resetNativeFileInput(fieldPath);
      return;
    }
    if (submitting || field?.readOnly === true) {
      onDiagnostic?.('upload.add.blocked', { scope: 'line', fieldPath, reason: submitting ? 'submitting' : 'readOnly' });
      resetNativeFileInput(fieldPath);
      return;
    }
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(list) });
    resetNativeFileInput(fieldPath);
  };

  const handleLineFileDrop = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    event: React.DragEvent<HTMLDivElement>;
  }) => {
    const { group, rowId, field, fieldPath, event } = args;
    event.preventDefault();
    if (submitting) return;
    if (field?.readOnly === true) return;
    if (!event.dataTransfer?.files?.length) return;
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(event.dataTransfer.files) });
    onDiagnostic?.('upload.drop', { fieldPath, count: event.dataTransfer.files.length, scope: 'line' });
    resetDrag(fieldPath);
  };

  const removeLineFile = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    index: number;
  }) => {
    const { group, rowId, field, fieldPath, index } = args;
    if (submitting) return;
    if (field?.readOnly === true) return;
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    if (!existingFiles.length) return;
    const removed = existingFiles[index];
    const next = existingFiles.filter((_, idx) => idx !== index);
    handleLineFieldChange(group, rowId, field, next as unknown as FieldValue);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    onDiagnostic?.('upload.remove', { fieldPath, removed: describeUploadItem(removed as any), remaining: next.length, scope: 'line' });
    announceUpload(
      fieldPath,
      removed
        ? `${tSystem('lineItems.remove', language, 'Remove')} ${describeUploadItem(removed as any)}.`
        : tSystem('lineItems.remove', language, 'Remove')
    );
  };

  const clearLineFiles = (args: { group: WebQuestionDefinition; rowId: string; field: any; fieldPath: string }) => {
    const { group, rowId, field, fieldPath } = args;
    if (submitting) return;
    if (field?.readOnly === true) return;
    handleLineFieldChange(group, rowId, field, [] as unknown as FieldValue);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    resetDrag(fieldPath);
    resetNativeFileInput(fieldPath);
    announceUpload(fieldPath, tSystem('files.clearAll', language, 'Remove all'));
    onDiagnostic?.('upload.clear', { fieldPath, scope: 'line' });
  };

  const renderOptions = (q: WebQuestionDefinition): OptionSet => {
    ensureOptions(q);
    return optionState[optionKey(q.id)] || toOptionSet(q);
  };

  const topLevelGroupProgress = useMemo(() => {
    // Mirror the progress logic used in the group header UI.
    const isQuestionComplete = (q: WebQuestionDefinition): boolean => {
      if (q.type === 'LINE_ITEM_GROUP') {
        if (!q.lineItemConfig) return false;
        return isLineItemGroupQuestionComplete({
          groupId: q.id,
          lineItemConfig: q.lineItemConfig,
          values,
          lineItems,
          collapsedRows,
          language,
          getTopValue: getTopValueNoScan
        });
      }
      const mappedValue = (q as any).valueMap
        ? resolveValueMapValue((q as any).valueMap, (fieldId: string) => values[fieldId], {
            language,
            targetOptions: toOptionSet(q as any)
          })
        : undefined;
      const raw = (q as any).valueMap ? mappedValue : (values[q.id] as any);
      if (q.type === 'FILE_UPLOAD') {
        return isUploadValueComplete({ value: raw as any, uploadConfig: (q as any).uploadConfig, required: !!q.required });
      }
      if (q.type === 'PARAGRAPH') {
        const cfg = (q.ui as any)?.paragraphDisclaimer;
        if (cfg && !cfg.editable) {
          const userText = resolveParagraphUserText({ rawValue: raw as any, config: cfg });
          return !isEmptyValue(userText as any);
        }
      }
      return !isEmptyValue(raw as any);
    };

    const groups = (groupSections || []).filter(s => s && !s.isHeader && s.collapsible);
    return groups
      .map(section => {
        const visible = (section.questions || []).filter(q => !shouldHideField(q.visibility, topVisibilityCtx));
        if (!visible.length) return null;

        const requiredQs = visible.filter(q => !!q.required);
        const totalRequired = requiredQs.length;
        const requiredComplete = requiredQs.reduce((acc, q) => (isQuestionComplete(q) ? acc + 1 : acc), 0);
        const complete = totalRequired > 0 && requiredComplete >= totalRequired;
        return { key: section.key, complete, totalRequired, requiredComplete };
      })
      .filter(Boolean) as Array<{ key: string; complete: boolean; totalRequired: number; requiredComplete: number }>;
  }, [collapsedRows, groupSections, language, lineItems, recordMeta, topVisibilityCtx, values]);

  const prevGroupCompleteRef = useRef<Record<string, boolean>>({});
  const pendingAutoCollapseRef = useRef<string[]>([]);
  const autoCollapseFlushTimerRef = useRef<number | null>(null);

  const flushPendingAutoCollapse = useCallback(
    (reason?: string) => {
      if (!autoCollapseGroups) return;
      const pending = Array.from(new Set(pendingAutoCollapseRef.current || [])).filter(Boolean);
      if (!pending.length) return;

      const completeSet = new Set(topLevelGroupProgress.filter(g => g.complete).map(g => g.key));
      const stillComplete = pending.filter(k => completeSet.has(k));
      pendingAutoCollapseRef.current = [];
      if (!stillComplete.length) return;

      const order = topLevelGroupProgress.map(g => g.key);
      const anchorIdx = stillComplete.reduce((acc, key) => Math.max(acc, order.indexOf(key)), -1);
      const anchorKey = anchorIdx >= 0 ? order[anchorIdx] : stillComplete[stillComplete.length - 1];

      const findNextIncomplete = (): string | undefined => {
        if (!autoOpenNextIncomplete) return undefined;
        const baseIdx = anchorKey ? order.indexOf(anchorKey) : -1;
        if (baseIdx < 0) return undefined;
        const n = topLevelGroupProgress.length;
        for (let step = 1; step <= n; step += 1) {
          const idx = (baseIdx + step) % n;
          const cand = topLevelGroupProgress[idx];
          if (!cand) continue;
          if (cand.totalRequired <= 0) continue;
          if (!cand.complete) return cand.key;
        }
        return undefined;
      };

      const nextOpenKey = findNextIncomplete();

      setCollapsedGroups(prev => {
        let changed = false;
        const next = { ...prev };
        stillComplete.forEach(key => {
          if (next[key] !== true) {
            next[key] = true;
            changed = true;
          }
        });
        if (nextOpenKey) {
          if (next[nextOpenKey] !== false) {
            next[nextOpenKey] = false;
            changed = true;
          }
        }
        if (changed) {
          onDiagnostic?.('ui.group.autoCollapse', {
            completed: stillComplete,
            opened: nextOpenKey || null,
            deferred: true,
            reason: reason || 'flush'
          });
        }
        return changed ? next : prev;
      });

      if (nextOpenKey) {
        scheduleScrollGroupToTop(nextOpenKey, { reason: 'autoOpenNext' });
      }
    },
    [autoCollapseGroups, autoOpenNextIncomplete, onDiagnostic, scheduleScrollGroupToTop, topLevelGroupProgress]
  );

  useEffect(() => {
    if (!autoCollapseGroups) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handler = () => {
      if (!pendingAutoCollapseRef.current.length) return;
      if (autoCollapseFlushTimerRef.current !== null) {
        window.clearTimeout(autoCollapseFlushTimerRef.current);
      }
      autoCollapseFlushTimerRef.current = window.setTimeout(() => {
        autoCollapseFlushTimerRef.current = null;
        const active = document.activeElement as HTMLElement | null;
        const activeGroupKey = (active?.closest('[data-group-key]') as HTMLElement | null)?.dataset?.groupKey || '';
        if (activeGroupKey && pendingAutoCollapseRef.current.includes(activeGroupKey)) {
          return;
        }
        flushPendingAutoCollapse('focus');
      }, 0);
    };

    document.addEventListener('focusin', handler, true);
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusin', handler, true);
      document.removeEventListener('focusout', handler, true);
      if (autoCollapseFlushTimerRef.current !== null) {
        window.clearTimeout(autoCollapseFlushTimerRef.current);
        autoCollapseFlushTimerRef.current = null;
      }
    };
  }, [autoCollapseGroups, flushPendingAutoCollapse]);

  useEffect(() => {
    if (!autoCollapseGroups) return;
    if (!topLevelGroupProgress.length) return;

    const prevComplete = prevGroupCompleteRef.current || {};
    const nextComplete: Record<string, boolean> = {};
    topLevelGroupProgress.forEach(g => {
      nextComplete[g.key] = g.complete;
    });
    prevGroupCompleteRef.current = nextComplete;

    const completedNow = topLevelGroupProgress
      .filter(g => g.complete && !prevComplete[g.key])
      .map(g => g.key);
    if (!completedNow.length) return;

    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const tag = active?.tagName ? active.tagName.toLowerCase() : '';
    const isEditable =
      tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean((active as any)?.isContentEditable);
    const activeGroupKey = (active?.closest('[data-group-key]') as HTMLElement | null)?.dataset?.groupKey || '';
    if (isEditable && activeGroupKey && completedNow.includes(activeGroupKey)) {
      // Avoid collapsing the group while the user is mid-edit (e.g., first keystroke of the last required field).
      // We'll flush after focus leaves the group.
      pendingAutoCollapseRef.current = Array.from(new Set([...(pendingAutoCollapseRef.current || []), ...completedNow]));
      onDiagnostic?.('ui.group.autoCollapse.defer', { activeGroupKey, completed: completedNow });
      return;
    }

    // Choose the last group (in visual order) that just completed as the anchor for "open next".
    const anchorKey = completedNow[completedNow.length - 1];
    const anchorIdx = topLevelGroupProgress.findIndex(g => g.key === anchorKey);

    const findNextIncomplete = (): string | undefined => {
      if (!autoOpenNextIncomplete) return undefined;
      if (anchorIdx < 0) return undefined;

      const n = topLevelGroupProgress.length;
      for (let step = 1; step <= n; step += 1) {
        const idx = (anchorIdx + step) % n;
        const cand = topLevelGroupProgress[idx];
        if (!cand) continue;
        if (cand.totalRequired <= 0) continue;
        if (!cand.complete) return cand.key;
      }
      return undefined;
    };

    const nextOpenKey = findNextIncomplete();

    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      completedNow.forEach(key => {
        if (next[key] !== true) {
          next[key] = true;
          changed = true;
        }
      });
      if (nextOpenKey) {
        if (next[nextOpenKey] !== false) {
          next[nextOpenKey] = false;
          changed = true;
        }
      }

      if (changed) {
        onDiagnostic?.('ui.group.autoCollapse', {
          completed: completedNow,
          opened: nextOpenKey || null
        });
      }
      return changed ? next : prev;
    });

    if (nextOpenKey) {
      scheduleScrollGroupToTop(nextOpenKey, { reason: 'autoOpenNext' });
    }
  }, [autoCollapseGroups, autoOpenNextIncomplete, onDiagnostic, scheduleScrollGroupToTop, topLevelGroupProgress]);

  const renderQuestion = (q: WebQuestionDefinition, renderOpts?: { inGrid?: boolean }) => {
    const optionSet = renderOptions(q);
    const dependencyValues = (dependsOn: string | string[]) => {
      const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
      return ids.map(id => toDependencyValue(values[id]));
    };
    const firstLineValue = (groupId: string, fieldId: string): FieldValue | undefined => {
      const rows = lineItems[groupId] || [];
      for (const row of rows) {
        const v = row.values[fieldId];
        if (v !== undefined && v !== null && v !== '') return v as FieldValue;
      }
      return undefined;
    };
    const allowed = computeAllowedOptions(q.optionFilter, optionSet, dependencyValues(q.optionFilter?.dependsOn || []));
    const currentVal = values[q.id];
    const allowedWithCurrent =
      currentVal && typeof currentVal === 'string' && !allowed.includes(currentVal) ? [...allowed, currentVal] : allowed;
    const opts = buildLocalizedOptions(optionSet, allowedWithCurrent, language, { sort: optionSortFor(q) });
    const hidden = shouldHideField(q.visibility, topVisibilityCtx);
    if (hidden) return null;
    const forceStackedLabel = q.ui?.labelLayout === 'stacked';
    const hideFieldLabel = q.ui?.hideLabel === true;
    const inGrid = renderOpts?.inGrid === true;
    // In paired grids, keep the label in layout so control rows align even when a label is hidden/missing.
    const labelStyle = hideFieldLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
    const renderAsLabel = q.ui?.renderAsLabel === true || q.readOnly === true;
    const renderReadOnly = (display: React.ReactNode, opts?: { stacked?: boolean }) => {
      const cls = `${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
        opts?.stacked ? ' ck-label-stacked' : ''
      } ck-readonly-field`;
      const label = resolveFieldLabel(q, language, q.id);
      return (
        <div
          key={q.id}
          className={cls}
          data-field-path={q.id}
          data-has-error={errors[q.id] ? 'true' : undefined}
          data-has-warning={hasWarning(q.id) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {label}
            {q.required && <RequiredStar />}
          </label>
          <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
          {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          {renderWarnings(q.id)}
        </div>
      );
    };

    const overlayOpenAction = resolveOverlayOpenActionForQuestion(q);
    const overlayOpenRenderMode = overlayOpenAction?.renderMode === 'inline' ? 'inline' : 'replace';
    const overlayOpenDisabled = submitting || isFieldLockedByDedup(q.id);
    const overlayOpenButtonText = (displayValue?: string | null) => {
      if (!overlayOpenAction) return '';
      const baseLabel = overlayOpenAction.label || resolveLabel(q, language);
      const display = displayValue ? displayValue.toString().trim() : '';
      return display ? `${display}: ${baseLabel}` : baseLabel;
    };
    const handleOverlayOpenAction = () => {
      if (!overlayOpenAction || overlayOpenDisabled) return;
      if (overlayOpenAction.targetKind === 'sub' && overlayOpenAction.targetKey) {
        openSubgroupOverlay(overlayOpenAction.targetKey, {
          rowFilter: overlayOpenAction.rowFilter || null,
          groupOverride: overlayOpenAction.groupOverride,
          hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
          label: overlayOpenAction.label,
          source: 'overlayOpenAction'
        });
      } else {
        const groupOrId = overlayOpenAction.overrideGroup || overlayOpenAction.groupId;
        openLineItemGroupOverlay(groupOrId as any, {
          rowFilter: overlayOpenAction.rowFilter || null,
          hideInlineSubgroups: overlayOpenAction.hideInlineSubgroups,
          label: overlayOpenAction.label,
          source: 'overlayOpenAction'
        });
      }
      onDiagnostic?.('ui.overlayOpenAction.open', {
        questionId: q.id,
        groupId: overlayOpenAction.groupId,
        targetKind: overlayOpenAction.targetKind,
        hasRowFilter: !!overlayOpenAction.rowFilter,
        hasOverride: !!overlayOpenAction.overrideGroup
      });
    };
    const overlayOpenActionTargetKey = overlayOpenAction?.targetKey || overlayOpenAction?.groupId || '';
    const overlayOpenActionRowsAll = overlayOpenActionTargetKey ? (lineItems[overlayOpenActionTargetKey] || []) : [];
    const overlayOpenActionRowsFiltered =
      overlayOpenAction && overlayOpenAction.rowFilter
        ? overlayOpenActionRowsAll.filter(row =>
            matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayOpenAction.rowFilter)
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
        const groupQuestion = definition.questions.find(qDef => qDef.id === groupKey);
        const prevLineItems = lineItems;
        const rowsAll = prevLineItems[groupKey] || [];
        const rowsToRemove =
          overlayOpenAction && overlayOpenAction.rowFilter
            ? rowsAll.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayOpenAction.rowFilter))
            : rowsAll;
        if (!rowsToRemove.length) return;
        if (groupQuestion) {
          rowsToRemove.forEach(row => clearSelectionEffectsForRow(groupQuestion, row as any));
        }
        const cascade = cascadeRemoveLineItemRows({
          lineItems: prevLineItems,
          roots: rowsToRemove.map(row => ({ groupId: groupKey, rowId: row.id }))
        });
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
        const baseValues = hasResetValue ? { ...values, [q.id]: resetValue } : values;
        const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, baseValues, cascade.lineItems, {
          mode: 'init'
        });
        setValues(nextValues);
        setLineItems(recomputed);
        runSelectionEffectsForAncestorRows(groupKey, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
        if (!hasResetValue) {
          suppressOverlayOpenAction(q.id);
        }
      };
      const title = tSystem('lineItems.removeRowsTitle', language, 'Remove rows?');
      const message = tSystem('lineItems.removeRowsMessage', language, 'This will remove the matching rows.');
      const confirmLabel = tSystem('lineItems.remove', language, 'Remove');
      const cancelLabel = tSystem('common.cancel', language, 'Cancel');
      openConfirmDialogResolved({
        title,
        message,
        confirmLabel,
        cancelLabel,
        kind: 'overlayOpenAction',
        refId: q.id,
        onConfirm: runReset
      });
    };
    const renderOverlayOpenReplaceButton = (displayValue?: string | null) => {
      const showResetButton = overlayOpenAction?.hideTrashIcon !== true;
      const actionButtonStyle = showResetButton
        ? { ...buttonStyles.secondary, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: '0' }
        : buttonStyles.secondary;
      return (
        <div
          key={q.id}
          className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
          data-field-path={q.id}
          data-has-error={errors[q.id] ? 'true' : undefined}
          data-has-warning={hasWarning(q.id) ? 'true' : undefined}
        >
          <label style={labelStyle}>
            {resolveLabel(q, language)}
            {q.required && <RequiredStar />}
          </label>
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
                <TrashIcon size={40} />
              </button>
            ) : null}
          </div>
          {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          {renderWarnings(q.id)}
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

    switch (q.type) {
      case 'BUTTON': {
        const action = ((q as any)?.button?.action || '').toString().trim();
        const placementsRaw = (q as any)?.button?.placements;
        const placements = Array.isArray(placementsRaw) && placementsRaw.length ? placementsRaw : ['form'];
        const showInForm = placements.includes('form');
        // Inline BUTTON fields are currently only used for report rendering.
        if (
          !showInForm ||
          (action !== 'renderDocTemplate' &&
            action !== 'renderMarkdownTemplate' &&
            action !== 'renderHtmlTemplate' &&
            action !== 'updateRecord' &&
            action !== 'openUrlField')
        )
          return null;
        if (action === 'openUrlField' && !(q as any)?.button?.fieldId) return null;

        const label = resolveLabel(q, language);
        const busyThis = !!reportBusy && reportBusyId === q.id;
        const disabled = submitting || !onReportButton || !!reportBusy;
        const buttonLabelStyle = inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly;
        return (
          <div
            key={q.id}
            className={`field inline-field${inGrid ? '' : ' ck-full-width'}`}
            data-field-path={q.id}
          >
            <label style={buttonLabelStyle}>{label}</label>
            <button
              type="button"
              onClick={() => onReportButton?.(q.id)}
              disabled={disabled}
              style={withDisabled(buttonStyles.secondary, disabled)}
            >
              {busyThis ? tSystem('common.loading', language, 'Loading…') : label}
            </button>
          </div>
        );
      }
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE': {
        const useValueMap = !!q.valueMap && !isDedupKeyField(q.id);
        const mappedValue =
          useValueMap && q.valueMap
            ? resolveValueMapValue(q.valueMap, fieldId => values[fieldId], { language, targetOptions: toOptionSet(q) })
            : undefined;
        const inputValueRaw = useValueMap ? (mappedValue || '') : ((values[q.id] as any) ?? '');
        const paragraphDisclaimerCfg = q.type === 'PARAGRAPH' ? (q.ui as any)?.paragraphDisclaimer : undefined;
        const paragraphEditable = !!paragraphDisclaimerCfg?.editable;
        const paragraphDisclaimer = paragraphDisclaimerCfg
          ? buildParagraphDisclaimerSection({
              config: paragraphDisclaimerCfg,
              definition,
              lineItems,
              optionState,
              language
            })
          : null;
        const paragraphUserText = paragraphDisclaimer
          ? resolveParagraphUserText({ rawValue: inputValueRaw, config: paragraphDisclaimerCfg })
          : inputValueRaw;
        const paragraphCombined = paragraphDisclaimer
          ? paragraphEditable
            ? (inputValueRaw as any)
            : buildParagraphDisclaimerValue({
                userText: paragraphUserText?.toString?.() || '',
                sectionText: paragraphDisclaimer.sectionText,
                separator: paragraphDisclaimer.separator
              })
          : (paragraphUserText as any);
        const inputValue =
          q.type === 'DATE'
            ? toDateInputValue(inputValueRaw)
            : q.type === 'PARAGRAPH'
              ? (paragraphEditable ? inputValueRaw : paragraphUserText)
              : inputValueRaw;
        const numberText =
          q.type === 'NUMBER' ? (inputValue === undefined || inputValue === null ? '' : (inputValue as any).toString()) : null;
        const displayValue =
          q.type === 'NUMBER'
            ? numberText
            : q.type === 'PARAGRAPH'
              ? paragraphCombined
              : inputValue;
        const displayText =
          displayValue === undefined || displayValue === null ? '' : displayValue.toString();
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(displayText || null);
        }
        if (renderAsLabel) {
          return renderReadOnly(displayValue || null, { stacked: forceStackedLabel });
        }
        if (q.type === 'NUMBER') {
          return (
            <div
              key={q.id}
              className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label style={labelStyle}>
                {resolveFieldLabel(q, language, q.id)}
                {(q as any).required && <RequiredStar />}
              </label>
              <NumberStepper
                value={numberText}
                disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                readOnly={useValueMap || q.readOnly === true}
                ariaLabel={resolveFieldLabel(q, language, q.id)}
                onChange={next => handleFieldChange(q, next)}
              />
              {renderOverlayOpenInlineButton(displayText || null)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        return (
          <div
            key={q.id}
            className={`${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
              forceStackedLabel ? ' ck-label-stacked' : ''
            }${q.type === 'DATE' && !forceStackedLabel ? ' ck-date-inline' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {q.type === 'PARAGRAPH' ? (
              paragraphDisclaimer?.sectionText && !paragraphEditable ? (
                <div className="ck-paragraph-shell">
                  <textarea
                    className="ck-paragraph-input"
                    value={inputValue}
                    onChange={e => {
                      const nextUserText = e.target.value;
                      const nextCombined = buildParagraphDisclaimerValue({
                        userText: nextUserText,
                        sectionText: paragraphDisclaimer.sectionText,
                        separator: paragraphDisclaimer.separator
                      });
                      handleFieldChange(q, nextCombined);
                    }}
                    readOnly={useValueMap || q.readOnly === true}
                    disabled={submitting || isFieldLockedByDedup(q.id)}
                    rows={((q as any)?.ui as any)?.paragraphRows || 4}
                  />
                  <div className="ck-paragraph-disclaimer">{`${paragraphDisclaimer.separator}\n${paragraphDisclaimer.sectionText}`}</div>
                </div>
              ) : (
                <textarea
                  className="ck-paragraph-input"
                  value={inputValue}
                  onChange={e => {
                    const nextUserText = e.target.value;
                    handleFieldChange(q, nextUserText);
                  }}
                  readOnly={useValueMap || q.readOnly === true}
                  disabled={submitting || isFieldLockedByDedup(q.id)}
                  rows={((q as any)?.ui as any)?.paragraphRows || 4}
                />
              )
            ) : q.type === 'DATE' ? (
              <DateInput
                value={inputValue}
                language={language}
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                ariaLabel={resolveLabel(q, language)}
                onChange={next => handleFieldChange(q, next)}
              />
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
              />
            )}
            {renderOverlayOpenInlineButton(displayText || null)}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'CHOICE': {
        const rawVal = values[q.id];
        const choiceValue = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        const selected = opts.find(opt => opt.value === choiceValue);
        const display = selected?.label || choiceValue || null;
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(display);
        }
        if (renderAsLabel) {
          return renderReadOnly(display, { stacked: forceStackedLabel });
        }
        return (
          <div
            key={q.id}
            className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderChoiceControl({
              fieldPath: q.id,
              value: choiceValue || '',
              options: opts,
              required: !!q.required,
              searchEnabled: q.ui?.choiceSearchEnabled,
              override: q.ui?.control,
              disabled: submitting || q.readOnly === true || isFieldLockedByDedup(q.id),
              onChange: next => handleFieldChange(q, next)
            })}
            {renderOverlayOpenInlineButton(display)}
            {(() => {
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
              return <InfoTooltip text={selected?.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
            })()}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'CHECKBOX': {
        const hasAnyOption = !!((optionSet.en && optionSet.en.length) || (optionSet.fr && optionSet.fr.length) || (optionSet.nl && optionSet.nl.length));
        const isConsentCheckbox = !q.dataSource && !hasAnyOption;
        const selected = Array.isArray(values[q.id]) ? (values[q.id] as string[]) : [];
        const display = (() => {
          if (isConsentCheckbox) {
            return values[q.id]
              ? tSystem('common.yes', language, 'Yes')
              : tSystem('common.no', language, 'No');
          }
          const labels = selected
            .map(val => opts.find(opt => opt.value === val)?.label || val)
            .filter(Boolean);
          return labels.length ? labels.join(', ') : null;
        })();
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(display);
        }
        if (renderAsLabel) {
          return renderReadOnly(display, { stacked: forceStackedLabel });
        }
        if (isConsentCheckbox) {
          const consentLabel = resolveLabel(q, language);
          return (
            <div
              key={q.id}
              className={`field inline-field ck-consent-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label>
                <input
                  type="checkbox"
                  checked={!!values[q.id]}
                  aria-label={hideFieldLabel ? consentLabel : undefined}
                  disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                  onChange={e => {
                    if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                    handleFieldChange(q, e.target.checked);
                  }}
                />
                {!hideFieldLabel ? (
                <span className="ck-consent-text">
                    {consentLabel}
                  {q.required && <RequiredStar />}
                </span>
                ) : null}
              </label>
              {renderOverlayOpenInlineButton(display)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        const controlOverride = (q.ui?.control || '').toString().trim().toLowerCase();
        const renderAsMultiSelect = controlOverride === 'select';
        return (
          <div
            key={q.id}
            className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderAsMultiSelect ? (
              <select
                multiple
                value={selected}
                disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                aria-label={resolveLabel(q, language)}
                onChange={e => {
                  if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                  const next = Array.from(e.currentTarget.selectedOptions)
                    .map(opt => opt.value)
                    .filter(Boolean);
                  onDiagnostic?.('ui.checkbox.select.change', { fieldPath: q.id, selectedCount: next.length });
                  handleFieldChange(q, next);
                }}
              >
                {opts.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="inline-options">
                {opts.map(opt => (
                  <label key={opt.value} className="inline">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                      onChange={e => {
                        if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                        const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
                        handleFieldChange(q, next);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
            {renderOverlayOpenInlineButton(display)}
            {(() => {
              const withTooltips = opts.filter(opt => opt.tooltip && selected.includes(opt.value));
              if (!withTooltips.length) return null;
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
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
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'FILE_UPLOAD': {
        const items = toUploadItems(values[q.id]);
        const uploadConfig = q.uploadConfig || {};
        const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
        const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
          size?: number;
          style?: React.CSSProperties;
          className?: string;
        }>;
        const minRequired = getUploadMinRequired({ uploadConfig, required: !!q.required });
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
        const allowedDisplay = (uploadConfig.allowedExtensions || []).map(ext =>
          ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
        );
        const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
          .map(v => (v !== undefined && v !== null ? v.toString().trim() : ''))
          .filter(Boolean);
        const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
        const readOnly = q.readOnly === true;
        const locked = isFieldLockedByDedup(q.id);
        const hasFiles = items.length > 0;
        const viewMode = readOnly || locked || maxed || hasFiles;
        const LeftIcon = viewMode ? EyeIcon : SlotIcon;
        const leftLabel = viewMode
          ? tSystem('files.view', language, 'View photos')
          : tSystem('files.add', language, 'Add photo');
        const cameraStyleBase = viewMode ? buttonStyles.secondary : isEmpty ? buttonStyles.primary : buttonStyles.secondary;
        if (renderAsLabel) {
          const displayContent =
            items.length === 0
              ? null
              : items.map((item: any, idx: number) => (
                  <div key={`${q.id}-file-${idx}`} className="ck-readonly-file">
                    {describeUploadItem(item as any)}
                  </div>
                ));
          const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
          return renderReadOnly(displayNode, { stacked: forceStackedLabel });
        }
        return (
          <div
            key={q.id}
            className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
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
                    onDiagnostic?.('upload.view.click', { scope: 'top', fieldPath: q.id, currentCount: items.length });
                    openFileOverlay({
                      scope: 'top',
                      title: resolveLabel(q, language),
                      question: q,
                      fieldPath: q.id
                    });
                    return;
                  }
                  if (readOnly) return;
                  onDiagnostic?.('upload.add.click', { scope: 'top', fieldPath: q.id, currentCount: items.length });
                fileInputsRef.current[q.id]?.click();
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
                    scope: 'top',
                    title: resolveLabel(q, language),
                    question: q,
                    fieldPath: q.id
                  });
                }}
              >
                {isComplete ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
                <span>{pillText}</span>
                <span className="ck-progress-label">{tSystem('files.open', language, tSystem('common.open', language, 'Open'))}</span>
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
              {uploadAnnouncements[q.id] || ''}
            </div>
            <input
              ref={el => {
                fileInputsRef.current[q.id] = el;
              }}
              type="file"
              multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
              accept={acceptAttr}
                disabled={submitting || locked || readOnly}
              style={{ display: 'none' }}
              onChange={e => handleFileInputChange(q, e.target.files)}
            />
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'LINE_ITEM_GROUP': {
        const groupOverlayEnabled = !!q.lineItemConfig?.ui?.openInOverlay;
        const groupCount = (lineItems[q.id] || []).length;
        const locked = submitting || isFieldLockedByDedup(q.id);

        if (groupOverlayEnabled) {
          const suppressOverlayPill = overlayOpenActionTargetGroups.has(q.id);
          const hideGroupLabel = q.ui?.hideLabel === true;
          const tapToOpenLabel = tSystem('common.tapToOpen', language, 'Tap to open');
          const needsAttentionMessage = resolveLocalizedString(
            q.lineItemConfig?.ui?.needsAttentionMessage,
            language,
            ''
          )
            .toString()
            .trim();
          const groupHasAnyError = (() => {
            if (errors[q.id]) return true;
            const prefix = `${q.id}__`;
            const subPrefix = `${q.id}::`;
            return Object.keys(errors || {}).some(k => k === q.id || k.startsWith(prefix) || k.startsWith(subPrefix));
          })();
          const groupIsComplete = (() => {
            const rows = (lineItems[q.id] || []) as any[];
            if (!rows.length) return false;
            const lineFields = (q.lineItemConfig?.fields || []) as any[];
            const subGroups = (q.lineItemConfig?.subGroups || []) as any[];
            const ui = (q.lineItemConfig as any)?.ui as any;
            const isProgressive =
              ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
            const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
            const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
            const collapsedFieldConfigs = isProgressive ? (ui?.collapsedFields || []) : [];

            const isRowDisabledByExpandGate = (args: {
              ui: any;
              fields: any[];
              row: { id: string; values: Record<string, FieldValue> };
              topValues: Record<string, FieldValue>;
              language: LangCode;
              linePrefix: string;
              rowCollapsed: boolean;
            }): boolean => {
              const { ui, fields, row, topValues, language, linePrefix, rowCollapsed } = args;
              const isProg =
                ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
              const gate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
              const cfgs = isProg ? (ui?.collapsedFields || []) : [];
              if (!isProg) return false;
              if (gate === 'always') return false;
              if (!cfgs.length) return false;
              if (!rowCollapsed) return false;

              const groupCtx: VisibilityContext = {
                getValue: fid => (topValues as any)[fid],
                getLineValue: (_rowId, fid) => (row?.values || {})[fid]
              };
              const isHidden = (fieldId: string) => {
                const target = (fields || []).find((f: any) => f?.id === fieldId) as any;
                if (!target) return false;
                return shouldHideField(target.visibility, groupCtx, { rowId: row?.id, linePrefix });
              };

              const blocked: string[] = [];
              cfgs.forEach((cfg: any) => {
                const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                if (!fid) return;
                const field = (fields || []).find((f: any) => f?.id === fid) as any;
                if (!field) return;
                const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row?.id, linePrefix });
                if (hideField) return;
                const val = resolveRequiredValue(field, (row?.values || {})[field.id]);
                if (field.required && isEmptyValue(val as any)) {
                  blocked.push(field.id);
                  return;
                }
                const rules = Array.isArray(field.validationRules)
                  ? field.validationRules.filter((r: any) => r?.then?.fieldId === field.id)
                  : [];
                if (!rules.length) return;
                const rulesCtx: any = {
                  ...groupCtx,
                  getValue: (fieldId: string) =>
                    Object.prototype.hasOwnProperty.call(row?.values || {}, fieldId)
                      ? (row?.values || {})[fieldId]
                      : (topValues as any)[fieldId],
                  language,
                  phase: 'submit',
                  isHidden
                };
                const errs = validateRules(rules, rulesCtx);
                if (errs.length) blocked.push(field.id);
              });
              return Array.from(new Set(blocked)).length > 0;
            };

            const getTopValueNoScan = (fieldId: string): FieldValue | undefined => {
              const direct = (values as any)[fieldId];
              if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
              const sys = getSystemFieldValue(fieldId, recordMeta);
              if (sys !== undefined) return sys as FieldValue;
              return undefined;
            };

            let hasAnyEnabledRow = false;

            for (const row of rows) {
              const rowValues = (row as any)?.values || {};
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsed = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
              if (
                isProgressive &&
                expandGate !== 'always' &&
                collapsedFieldConfigs.length > 0 &&
                isRowDisabledByExpandGate({
                  ui,
                  fields: lineFields,
                  row: row as any,
                  topValues: values,
                  language,
                  linePrefix: q.id,
                  rowCollapsed
                })
              ) {
                continue;
              }
              hasAnyEnabledRow = true;

              const groupCtx: VisibilityContext = {
                getValue: fid => getTopValueNoScan(fid),
                getLineValue: (_rowId, fid) => rowValues[fid]
              };
              for (const field of lineFields) {
                if (!field?.required) continue;
                const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                if (hideField) continue;
                const mapped = field.valueMap
                  ? resolveValueMapValue(
                      field.valueMap,
                      (fid: string) => {
                        if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                        return getTopValueNoScan(fid);
                      },
                      { language, targetOptions: toOptionSet(field as any) }
                    )
                  : undefined;
                const raw = field.valueMap ? mapped : (rowValues as any)[field.id];
                if ((field as any).type === 'FILE_UPLOAD') {
                  const ok = isUploadValueComplete({
                    value: raw as any,
                    uploadConfig: (field as any).uploadConfig,
                    required: true
                  });
                  if (!ok) return false;
                  continue;
                }
                const requiredVal = resolveRequiredValue(field, raw as any);
                if (isEmptyValue(requiredVal as any)) return false;
              }

              for (const sub of subGroups) {
                const subId = resolveSubgroupKey(sub as any);
                if (!subId) continue;
                const subKey = buildSubgroupKey(q.id, row.id, subId);
                const subRows = (lineItems[subKey] || []) as any[];
                if (!subRows.length) continue;
                const subFields = ((sub as any).fields || []) as any[];
                const subUi = (sub as any)?.ui as any;
                const isSubProgressive =
                  subUi?.mode === 'progressive' && Array.isArray(subUi?.collapsedFields) && (subUi?.collapsedFields || []).length > 0;
                const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;
                for (const subRow of subRows) {
                  const subRowValues = (subRow as any)?.values || {};
                  const subCollapseKey = `${subKey}::${subRow.id}`;
                  const subRowCollapsed = isSubProgressive ? (collapsedRows?.[subCollapseKey] ?? subDefaultCollapsed) : false;
                  if (
                    isRowDisabledByExpandGate({
                      ui: subUi,
                      fields: subFields,
                      row: subRow as any,
                      topValues: { ...(values as any), ...(rowValues as any) },
                      language,
                      linePrefix: subKey,
                      rowCollapsed: subRowCollapsed
                    })
                  ) {
                    continue;
                  }
                  const subCtx: VisibilityContext = {
                    getValue: (fid: string) => {
                      if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
                      if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                      return getTopValueNoScan(fid);
                    },
                    getLineValue: (_rowId, fid) => subRowValues[fid]
                  };
                  for (const field of subFields) {
                    if (!field?.required) continue;
                    const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                    if (hide) continue;
                    const mapped = field.valueMap
                      ? resolveValueMapValue(
                          field.valueMap,
                          (fid: string) => {
                            if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
                            if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                            return getTopValueNoScan(fid);
                          },
                          { language, targetOptions: toOptionSet(field as any) }
                        )
                      : undefined;
                    const raw = field.valueMap ? mapped : (subRowValues as any)[field.id];
                    if ((field as any).type === 'FILE_UPLOAD') {
                      const ok = isUploadValueComplete({
                        value: raw as any,
                        uploadConfig: (field as any).uploadConfig,
                        required: true
                      });
                      if (!ok) return false;
                      continue;
                    }
                    const requiredVal = resolveRequiredValue(field, raw as any);
                    if (isEmptyValue(requiredVal as any)) return false;
                  }
                }
              }
            }
            return hasAnyEnabledRow;
          })();
          const groupLabel = resolveLabel(q, language);
          const pillText = groupLabel;
          const pillAriaLabel = pillText ? `${tapToOpenLabel} ${pillText}` : tapToOpenLabel;
          const pillClass = groupHasAnyError
            ? 'ck-progress-bad'
            : groupIsComplete
              ? 'ck-progress-good'
              : groupCount > 0
                ? 'ck-progress-info'
                : 'ck-progress-neutral';
          return (
            <div
              key={q.id}
              className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
              data-field-path={q.id}
              data-has-error={groupHasAnyError ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label style={hideGroupLabel ? srOnly : labelStyle}>
                {groupLabel}
                {q.required && <RequiredStar />}
              </label>
              {!suppressOverlayPill ? (
                <button
                  type="button"
                  className={`ck-progress-pill ck-upload-pill-btn ck-open-overlay-pill ${pillClass}`}
                  aria-disabled={locked ? 'true' : undefined}
                  aria-label={pillAriaLabel}
                  onClick={() => {
                    if (locked) return;
                    openLineItemGroupOverlay(q.id);
                  }}
                >
                  {pillClass === 'ck-progress-good' ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
                  {pillText ? <span>{pillText}</span> : null}
                  <span className="ck-progress-label">{tapToOpenLabel}</span>
                  <span className="ck-progress-caret">▸</span>
                </button>
              ) : null}
              {renderWarnings(q.id)}
              {errors[q.id] ? (
                <div className="error">{errors[q.id]}</div>
              ) : groupHasAnyError ? (
                <div className="error">
                  {needsAttentionMessage || tSystem('validation.needsAttention', language, 'Needs attention')}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <LineItemGroupQuestion
            key={q.id}
            q={q}
            ctx={{
              definition,
              language,
              values,
              resolveVisibilityValue,
              getTopValue: getTopValueNoScan,
              setValues,
              lineItems,
              setLineItems,
              submitting: locked,
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
              resetDrag,
              uploadAnnouncements,
              handleLineFileInputChange,
              handleLineFileDrop,
              removeLineFile,
              clearLineFiles,
              errorIndex,
              setOverlay,
              onDiagnostic,
              openConfirmDialog: openConfirmDialogResolved,
              isOverlayOpenActionSuppressed,
              suppressOverlayOpenAction,
              runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows
            }}
          />
        );
      }
      default:
        return null;
    }
  };

  useEffect(() => {
    const pendingDefaults: Array<{ question: WebQuestionDefinition; value: string }> = [];
    definition.questions.forEach(q => {
      if (q.type !== 'CHOICE') return;
      const optionSet = optionState[optionKey(q.id)] || toOptionSet(q);
      const allowed = computeAllowedOptions(
        q.optionFilter,
        optionSet,
        (Array.isArray(q.optionFilter?.dependsOn) ? q.optionFilter?.dependsOn : [q.optionFilter?.dependsOn || ''])
          .filter(Boolean)
          .map(dep => toDependencyValue(values[dep as string]))
      );
      const opts = buildLocalizedOptions(optionSet, allowed, language, { sort: optionSortFor(q) });
      if (opts.length === 1 && isEmptyValue(values[q.id]) && values[q.id] !== opts[0].value) {
        pendingDefaults.push({ question: q, value: opts[0].value });
      }
    });
    if (!pendingDefaults.length) return;
    const applied: typeof pendingDefaults = [];
                  setValues(prev => {
      let changed = false;
      const next = { ...prev };
      pendingDefaults.forEach(({ question, value }) => {
        if (isEmptyValue(prev[question.id]) && prev[question.id] !== value) {
          next[question.id] = value;
          applied.push({ question, value });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ question }) => {
        if (next[question.id]) {
          delete next[question.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ question, value }) => onSelectionEffect(question, value));
    }
  }, [definition, language, optionState, setValues, setErrors, values, onSelectionEffect]);

  useEffect(() => {
    const pendingLineDefaults: Array<{
      group: WebQuestionDefinition;
      field: any;
      rowId: string;
      value: string;
      rowValues: Record<string, FieldValue>;
    }> = [];
    definition.questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(group => {
        const rows = lineItems[group.id] || [];
        rows.forEach(row => {
          (group.lineItemConfig?.fields || [])
            .filter(field => field.type === 'CHOICE')
            .forEach(field => {
                    const optionSetField: OptionSet =
                optionState[optionKey(field.id, group.id)] || {
                        en: field.options || [],
                        fr: (field as any).optionsFr || [],
                        nl: (field as any).optionsNl || []
                      };
                    const dependencyIds = (
                      Array.isArray(field.optionFilter?.dependsOn)
                        ? field.optionFilter?.dependsOn
                        : [field.optionFilter?.dependsOn || '']
                    ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      field.optionFilter,
                      optionSetField,
                      dependencyIds.map(dep => toDependencyValue(row.values[dep] ?? values[dep]))
                    );
              const optsField = buildLocalizedOptions(optionSetField, allowedField, language, { sort: optionSortFor(field) });
              const currentValue = row.values[field.id];
              if (optsField.length === 1 && isEmptyValue(currentValue) && currentValue !== optsField[0].value) {
                pendingLineDefaults.push({
                  group,
                  field,
                  rowId: row.id,
                  value: optsField[0].value,
                  rowValues: { ...(row.values || {}), [field.id]: optsField[0].value }
                });
              }
            });
        });
      });
    if (!pendingLineDefaults.length) return;
    const applied: typeof pendingLineDefaults = [];
    setLineItems(prev => {
      let changed = false;
      const next: LineItemState = { ...prev };
      pendingLineDefaults.forEach(({ group, rowId, field, value, rowValues }) => {
        const rows = next[group.id] || prev[group.id] || [];
        const rowIdx = rows.findIndex(r => r.id === rowId);
        if (rowIdx === -1) return;
        const row = rows[rowIdx];
        if (row.values[field.id] === value) return;
        const updatedRow: LineItemRowState = {
          ...row,
          values: { ...row.values, [field.id]: value }
        };
        const updatedRows = [...rows];
        updatedRows[rowIdx] = updatedRow;
        next[group.id] = updatedRows;
        applied.push({ group, field, rowId, value, rowValues });
        changed = true;
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ group, field, rowId }) => {
        const key = `${group.id}__${field.id}__${rowId}`;
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ field, value, group, rowId, rowValues }) => {
        onSelectionEffect(field as WebQuestionDefinition, value, { lineItem: { groupId: group.id, rowId, rowValues } });
      });
    }
  }, [definition, language, lineItems, optionState, setErrors, setLineItems, values, onSelectionEffect]);

  const errorIndex = useMemo(() => {
    const rowErrors = new Set<string>();
    const subgroupErrors = new Set<string>();
    const keys = Object.keys(errors || {});
    keys.forEach(key => {
      const parts = key.split('__');
      if (parts.length !== 3) return;
      const prefix = parts[0];
      const rowId = parts[2];
      const info = parseSubgroupKey(prefix);
      if (info) {
        subgroupErrors.add(prefix);
        rowErrors.add(`${info.parentGroupKey}::${info.parentRowId}`);
        return;
      }
      rowErrors.add(`${prefix}::${rowId}`);
    });
    return { rowErrors, subgroupErrors };
  }, [errors]);

  useEffect(() => {
    const keys = Object.keys(errors || {});
    if (!keys.length) {
      firstErrorRef.current = null;
      return;
    }
    // Only auto-navigate to the next errored field on submit attempt.
    // While the user is typing, errors will change (as fields are fixed) and we should not steal focus.
    if (errorNavConsumedRef.current === errorNavRequestRef.current) return;
    let firstKey = keys[0];
    if (typeof document === 'undefined') return;
    const chooseGuidedKey = (): { key: string; stepId?: string } => {
      if (!guidedEnabled || !guidedStepsCfg || !guidedStepIds.length) return { key: firstKey };

      const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [];
      const steps = guidedStepsCfg.items || [];
      const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
      const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];
      const stepLineGroupsDefaultMode = (stepCfg?.render?.lineGroups?.mode || '') as 'inline' | 'overlay' | '';
      const stepSubGroupsDefaultMode = (stepCfg?.render?.subGroups?.mode || '') as 'inline' | 'overlay' | '';

      const normalizeLineFieldId = (groupId: string, rawId: any): string => {
        const s = rawId !== undefined && rawId !== null ? rawId.toString().trim() : '';
        if (!s) return '';
        const underscorePrefix = `${groupId}__`;
        if (s.startsWith(underscorePrefix)) return s.slice(underscorePrefix.length);
        const dotPrefix = `${groupId}.`;
        if (s.startsWith(dotPrefix)) return s.slice(dotPrefix.length);
        // If the config uses dotted paths, take the last segment.
        if (s.includes('.')) return s.split('.').pop() || s;
        return s;
      };

      const normalizeRowFilterForGroup = (groupId: string, filter?: any): any => {
        if (!filter) return null;
        const includeWhen = (filter as any)?.includeWhen;
        const excludeWhen = (filter as any)?.excludeWhen;
        const next: any = { ...(filter as any) };

        const normalizeWhen = (when: any): any => {
          if (!when) return undefined;
          if (Array.isArray(when)) {
            const list = when.map(entry => normalizeWhen(entry)).filter(Boolean);
            return list.length ? list : undefined;
          }
          if (typeof when !== 'object') return when;
          const all = (when as any).all ?? (when as any).and;
          if (Array.isArray(all)) {
            const list = all.map((entry: any) => normalizeWhen(entry)).filter(Boolean);
            return list.length ? { ...(when as any), all: list } : undefined;
          }
          const anyList = (when as any).any ?? (when as any).or;
          if (Array.isArray(anyList)) {
            const list = anyList.map((entry: any) => normalizeWhen(entry)).filter(Boolean);
            return list.length ? { ...(when as any), any: list } : undefined;
          }
          if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
            const nested = normalizeWhen((when as any).not);
            return nested ? { ...(when as any), not: nested } : undefined;
          }
          if ((when as any).fieldId) {
            return { ...(when as any), fieldId: normalizeLineFieldId(groupId, (when as any).fieldId) };
          }
          return when;
        };

        if (includeWhen) next.includeWhen = normalizeWhen(includeWhen);
        if (excludeWhen) next.excludeWhen = normalizeWhen(excludeWhen);
        return next;
      };

      const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
        if (!filter) return true;
        const includeWhen = (filter as any)?.includeWhen;
        const excludeWhen = (filter as any)?.excludeWhen;
        const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
        const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
        const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
        return includeOk && !excludeMatch;
      };

      const isKeyVisibleInTargets = (targets: any[], stepCfgLocal: any, key: string): boolean => {
        const raw = (key || '').toString();
        if (!raw) return false;
        const parts = raw.split('__');
        const isLineKey = parts.length === 3;

        for (const t of targets) {
          if (!t || typeof t !== 'object') continue;
          const kind = (t.kind || '').toString().trim();
          const id = (t.id || '').toString().trim();
          if (!kind || !id) continue;

          if (kind === 'question') {
            if (!isLineKey && raw === id) return true;
            continue;
          }

          if (kind !== 'lineGroup') continue;
          const groupId = id;

          // Group-level error
          if (!isLineKey && raw === groupId) return true;

          if (isLineKey) {
            const [prefix, fieldIdRaw, rowId] = parts;
            const subgroupInfo = parseSubgroupKey(prefix);
            if (subgroupInfo) {
              if (subgroupInfo.rootGroupId !== groupId) continue;

              const subTargetModeRaw = ((t.subGroups as any)?.displayMode || 'inherit').toString().trim().toLowerCase();
              const subStepModeRaw = stepSubGroupsDefaultMode ? stepSubGroupsDefaultMode.toString().trim().toLowerCase() : '';
              const resolvedSubMode =
                subTargetModeRaw === 'inline' || subTargetModeRaw === 'overlay'
                  ? (subTargetModeRaw as 'inline' | 'overlay')
                  : subStepModeRaw === 'inline' || subStepModeRaw === 'overlay'
                    ? (subStepModeRaw as 'inline' | 'overlay')
                    : 'inline';
              const hideInlineSubgroups = resolvedSubMode === 'overlay';

              // If subgroups are only shown via overlay, they are still "reachable" (error navigation will open the overlay).
              // Determine whether this step includes the subgroup at all.
              const subIncludeRaw = (t.subGroups as any)?.include;
              const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
              const allowedSubIds = subIncludeList
                .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
                .filter(Boolean);
              const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;
              if (allowedSubSet && !allowedSubSet.has(subgroupInfo.subGroupId)) continue;

              // Parent row filter applies to subgroups too.
              const parentRows = (lineItems as any)[subgroupInfo.parentGroupKey] || [];
              const parentRow = parentRows.find((r: any) => r && r.id === subgroupInfo.parentRowId);
              const parentRowValues = (parentRow?.values || {}) as any;
              const normalizedRowFilter = normalizeRowFilterForGroup(groupId, (t as any).validationRows ?? (t as any).rows);
              if (!isIncludedByRowFilter(parentRowValues, normalizedRowFilter)) continue;

              // Subgroup errors are visible in this step (inline or overlay).
              void hideInlineSubgroups;
              void rowId;
              return true;
            }

            if (prefix !== groupId) continue;

            const rowValues = ((lineItems as any)[groupId] || []).find((r: any) => r && r.id === rowId)?.values || {};
            const normalizedRowFilter = normalizeRowFilterForGroup(groupId, (t as any).validationRows ?? (t as any).rows);
            if (!isIncludedByRowFilter(rowValues as any, normalizedRowFilter)) continue;

            const allowedFieldIds = (() => {
              const rawFields = (t as any).fields;
              if (!rawFields) return null;
              const ids: string[] = [];
              const pushEntry = (v: any) => {
                if (v === undefined || v === null) return;
                if (typeof v === 'object') {
                  const id = normalizeLineFieldId(groupId, (v as any).id ?? (v as any).fieldId ?? (v as any).field);
                  if (id) ids.push(id);
                  return;
                }
                const id = normalizeLineFieldId(groupId, v);
                if (id) ids.push(id);
              };
              if (Array.isArray(rawFields)) {
                rawFields.forEach(pushEntry);
              } else {
                rawFields
                    .toString()
                    .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
                  .forEach(pushEntry);
              }
              return ids.length ? new Set(ids) : null;
            })();
            if (allowedFieldIds && !allowedFieldIds.has(fieldIdRaw)) continue;
            return true;
          }
        }

        return false;
      };

      // Prefer navigating to an error already visible in the current step (header + step targets).
      const combinedCurrentTargets = [...headerTargets, ...stepTargets];
      const inCurrent = keys.find(k => isKeyVisibleInTargets(combinedCurrentTargets, stepCfg, k));
      if (inCurrent) return { key: inCurrent, stepId: activeGuidedStepId };

      // Otherwise, navigate to the earliest reachable step that contains an error.
      const stepIdByIndex = guidedStepIds;
      for (let idx = 0; idx < stepIdByIndex.length; idx++) {
        if (idx > maxReachableGuidedIndex) break;
        const stepId = stepIdByIndex[idx];
        const cfg = (steps.find((s: any) => (s?.id || '').toString() === stepId) || null) as any;
        const stepTargetsLocal: any[] = Array.isArray(cfg?.include) ? cfg.include : [];
        const combined = [...headerTargets, ...stepTargetsLocal];
        const stepKey = keys.find(k => isKeyVisibleInTargets(combined, cfg, k));
        if (stepKey) return { key: stepKey, stepId };
      }

      return { key: firstKey };
    };

    const guidedPick = chooseGuidedKey();
    firstKey = guidedPick.key;
    const desiredStepId = guidedPick.stepId;
    if (desiredStepId && guidedEnabled && desiredStepId !== activeGuidedStepId) {
      // Switch steps first, then re-run this navigation effect to scroll once the field is mounted.
      selectGuidedStep(desiredStepId, 'auto');
      onDiagnostic?.('validation.navigate.step', { from: activeGuidedStepId, to: desiredStepId, key: firstKey });
      return;
    }

    const wasSame = firstErrorRef.current === firstKey;
    firstErrorRef.current = firstKey;

    const expandGroupForQuestionId = (questionId: string): boolean => {
      const groupKey = questionIdToGroupKey[questionId];
      if (!groupKey) return false;
      setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
      return true;
    };

    const ensureMountedForError = (): boolean => {
      const parts = firstKey.split('__');
      if (parts.length !== 3) {
        // Top-level question error: ensure its group card is expanded.
        return expandGroupForQuestionId(firstKey);
      }
      const prefix = parts[0];
      const fieldId = parts[1];
      const rowId = parts[2];
      const subgroupInfo = parseSubgroupKey(prefix);
      if (subgroupInfo) {
        expandGroupForQuestionId(subgroupInfo.rootGroupId);
        const collapseKey = `${subgroupInfo.parentGroupKey}::${subgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey =
          nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.rootGroupId}::${subgroupInfo.path.join('.') || subgroupInfo.subGroupId}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
          openSubgroupOverlay(prefix, { source: 'navigate' });
          onDiagnostic?.('validation.navigate.openSubgroup', { key: firstKey, subKey: prefix });
        }
        return true;
      }

      // If this is a line-item group configured to open in a full-page overlay, open it so the row/fields can mount.
      const groupCfg = definition.questions.find(q => q.id === prefix && q.type === 'LINE_ITEM_GROUP');
      const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
      const suppressOverlayForGuidedInline = guidedEnabled && guidedInlineLineGroupIds.has(prefix);
        if (groupOverlayEnabled && !suppressOverlayForGuidedInline) {
          if (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== prefix) {
            openLineItemGroupOverlay(prefix, { source: 'navigate' });
          onDiagnostic?.('validation.navigate.openLineItemGroupOverlay', { key: firstKey, groupId: prefix, source: 'submit' });
        }
      }

      expandGroupForQuestionId(prefix);
      const collapseKey = `${prefix}::${rowId}`;
      setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
      const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
      if (nestedKey) {
        setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
      }
      return true;
    };

    const scrollToError = (): boolean => {
      const target = document.querySelector<HTMLElement>(`[data-field-path="${firstKey}"]`);
      if (!target) return false;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (errorNavModeRef.current !== 'scroll') {
        const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
        try {
          focusable?.focus({ preventScroll: true } as any);
        } catch (_) {
          // ignore focus issues
        }
      }
      return true;
    };

    const requestedMount = ensureMountedForError();
    const attempt = () => scrollToError();

    requestAnimationFrame(() => {
      const found = attempt();
      if (found && wasSame) return;
      if (!found && requestedMount) {
        // wait for state-driven DOM mount (expanded row / subgroup overlay)
        requestAnimationFrame(() => attempt());
        setTimeout(() => attempt(), 80);
      }
    });
    errorNavConsumedRef.current = errorNavRequestRef.current;
  }, [
    errors,
    nestedGroupMeta.lineFieldToGroupKey,
    nestedGroupMeta.subgroupFieldToGroupKey,
    definition.questions,
    activeGuidedStepId,
    guidedEnabled,
    guidedInlineLineGroupIds,
    guidedStepIds,
    guidedStepsCfg,
    lineItems,
    maxReachableGuidedIndex,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    selectGuidedStep,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    subgroupOverlay.open,
    subgroupOverlay.subKey
  ]);

  const subgroupOverlayPortal = (() => {
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
    const parentRowIdx = parsed ? parentRows.findIndex(r => r.id === parsed.parentRowId) : -1;
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
    const parentLabel = parentGroup ? resolveLabel(parentGroup, language) : (parsed?.rootGroupId || 'Group');
    const breadcrumbText = [parentLabel, subLabel].filter(Boolean).join(' / ');

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
    const orderedRows = [...rows];
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
    const overlayDetailSelectedRowIndex = overlayDetailSelectionForGroup
      ? rows.findIndex(r => r.id === overlayDetailSelectionForGroup.rowId)
      : -1;
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
    const resolveOverlayDetailHeaderStyle = (columnId: string): React.CSSProperties | undefined => {
      if (!overlayDetailHeaderWidths || typeof overlayDetailHeaderWidths !== 'object' || Array.isArray(overlayDetailHeaderWidths)) return undefined;
      const candidates: string[] = [];
      const pushCandidate = (val?: string) => {
        if (!val) return;
        if (candidates.includes(val)) return;
        candidates.push(val);
      };
      const lower = columnId.toLowerCase();
      const normalized = columnId.replace(/^_+/, '');
      const normalizedLower = normalized.toLowerCase();
      pushCandidate(columnId);
      pushCandidate(lower);
      if (['view', 'edit', 'remove', 'actions'].includes(normalizedLower)) {
        pushCandidate(`__${normalizedLower}`);
        pushCandidate(`_${normalizedLower}`);
        pushCandidate(normalizedLower);
        pushCandidate('__actions');
        pushCandidate('actions');
      } else {
        pushCandidate(normalized);
        pushCandidate(normalizedLower);
      }
      const rawWidth = candidates.reduce<any>(
        (acc, key) => (acc !== undefined ? acc : (overlayDetailHeaderWidths as any)[key]),
        undefined
      );
      if (rawWidth === undefined || rawWidth === null) return undefined;
      if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
      const widthValue = rawWidth.toString().trim();
      return widthValue ? { width: widthValue } : undefined;
    };

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
      const optionSetField =
        optionState[optionKey(subSelectorOverlayAnchorField.id, subKey)] || {
          en: subSelectorOverlayAnchorField.options || [],
          fr: (subSelectorOverlayAnchorField as any).optionsFr || [],
          nl: (subSelectorOverlayAnchorField as any).optionsNl || [],
          raw: (subSelectorOverlayAnchorField as any).optionsRaw
        };
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
      if (!subConfig) {
        return (
          <button
            type="button"
            onClick={() => {
              if (subMaxRowsReached) return;
              addLineItemRowManual(subKey, undefined, subAddRowOptions);
            }}
            style={withDisabled(buttonStyles.secondary, subMaxRowsReached)}
            disabled={subMaxRowsReached}
          >
            <PlusIcon />
            Add line
          </button>
        );
      }
      if (isSubOverlayAddMode && subConfig.anchorFieldId) {
                        return (
                          <button
                            type="button"
            style={withDisabled(buttonStyles.secondary, submitting || subSelectorIsMissing || subMaxRowsReached)}
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
                                  setOptionState(prev => ({ ...prev, [key]: loaded }));
                                }
                              }
                              if (!opts) {
                                opts = {
                                  en: anchorField.options || [],
                                  fr: (anchorField as any).optionsFr || [],
                                  nl: (anchorField as any).optionsNl || []
                                };
                              }
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
                                options: localized
                                  .filter(opt => deduped.includes(opt.value))
                                  .map(opt => ({ value: opt.value, label: opt.label })),
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
            {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines')}
                          </button>
                        );
                      }
      if (canUseSubSelectorOverlay) {
        return null;
      }
                      return (
        <button
          type="button"
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
          style={withDisabled(buttonStyles.secondary, subSelectorIsMissing || subMaxRowsReached)}
        >
          <PlusIcon />
          {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add line')}
                        </button>
                      );
                    };

    const subGroupDef: WebQuestionDefinition | null =
      parentGroup && subConfig
        ? ({
            ...(parentGroup as any),
            id: subKey,
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
                <button type="button" onClick={() => attemptCloseSubgroupOverlay('button')} style={buttonStyles.secondary}>
                  {overlayCloseButtonLabel}
                </button>
              ) : null}
            </div>
            <div style={{ textAlign: 'center', padding: '0 8px', overflowWrap: 'anywhere' }}>
              {overlayContextHeader ? <div style={{ whiteSpace: 'pre-line' }}>{overlayContextHeader}</div> : null}
              {overlayHeaderLabel ? <div>{overlayHeaderLabel}</div> : null}
              <div style={srOnly}>{subLabel}</div>
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
                                        allowed.forEach(val =>
                                          addLineItemRowManual(subKey, { [subSelectorOverlayAnchorFieldId]: val }, subAddRowOptions)
                                        );
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
              q={subGroupDef as any}
              rowFilter={overlayRowFilter}
              hideInlineSubgroups={overlayHideInlineSubgroups}
              hideToolbars
              rowFlow={overlayRowFlow}
              ctx={{
                definition,
                language,
                values: { ...values, ...ancestorValues },
                resolveVisibilityValue,
                getTopValue: (fieldId: string) =>
                  (ancestorValues as any)[fieldId] !== undefined ? (ancestorValues as any)[fieldId] : getTopValueNoScan(fieldId),
                setValues,
                lineItems,
                setLineItems,
                submitting: submitting || isFieldLockedByDedup(subKey),
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
                resetDrag,
                uploadAnnouncements,
                handleLineFileInputChange,
                handleLineFileDrop,
                removeLineFile,
                clearLineFiles,
                errorIndex,
                setOverlay,
                onDiagnostic,
                openConfirmDialog: openConfirmDialogResolved,
                isOverlayOpenActionSuppressed,
                suppressOverlayOpenAction,
                runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows,
                closeOverlay: closeSubgroupOverlay
              }}
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
                              const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined => {
                                if (!subColumnWidths || typeof subColumnWidths !== 'object' || Array.isArray(subColumnWidths)) return undefined;
                                const candidates: string[] = [];
                                const pushCandidate = (val?: string) => {
                                  if (!val) return;
                                  if (candidates.includes(val)) return;
                                  candidates.push(val);
                                };
                                const lower = columnId.toLowerCase();
                                const normalized = columnId.replace(/^_+/, '');
                                const normalizedLower = normalized.toLowerCase();
                                pushCandidate(columnId);
                                pushCandidate(lower);
                                if (['view', 'edit', 'remove', 'actions'].includes(normalizedLower)) {
                                  pushCandidate(`__${normalizedLower}`);
                                  pushCandidate(`_${normalizedLower}`);
                                  pushCandidate(normalizedLower);
                                  pushCandidate('__actions');
                                  pushCandidate('actions');
                                } else {
                                  pushCandidate(normalized);
                                  pushCandidate(normalizedLower);
                                }
                                const rawWidth = candidates.reduce<any>(
                                  (acc, key) => (acc !== undefined ? acc : (subColumnWidths as any)[key]),
                                  undefined
                                );
                                if (rawWidth === undefined || rawWidth === null) return undefined;
                                if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
                                const widthValue = rawWidth.toString().trim();
                                return widthValue ? { width: widthValue } : undefined;
                              };

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
                                    return <div className="ck-line-item-table__value">{selected?.label || choiceVal || '—'}</div>;
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
                                        onChange: next => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                                    return <div className="ck-line-item-table__value">{labels.length ? labels.join(', ') : '—'}</div>;
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
                                  const items = toUploadItems(subRow.values[field.id]);
                                  const count = items.length;
                                  if (renderAsLabel) {
                                    return <div className="ck-line-item-table__value">{count ? `${count}` : '—'}</div>;
                                  }
                                  return (
                                    <div className="ck-line-item-table__control" {...controlAttrs}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (submitting) return;
                                          openFileOverlay({
                                            scope: 'line',
                                            title: resolveFieldLabel(field, language, field.id),
                                            group: subGroupDef,
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
                                      {renderErrors()}
                                    </div>
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
                                  return <div className="ck-line-item-table__value">{display || '—'}</div>;
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
                                        ...buttonStyles.secondary,
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
                                style={buttonStyles.secondary}
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
                          tableColumnWidths: editCfg?.tableColumnWidths || (overlayDetailSubConfig as any)?.ui?.tableColumnWidths
                        }
                      }
                    } as any;
                    const detailRowId = overlayDetailSelectionForGroup?.rowId || '';
                    const detailKey = detailRowId ? `${subKey}::${detailRowId}` : '';
                    const handleDetailSave = () => {
                      if (!detailRowId) return;
                      if (overlayDetailCanView) {
                        setOverlayDetailSelection({ groupId: subKey, rowId: detailRowId, mode: 'view' });
                      } else if (overlayDetailEditSnapshotRef.current?.key === detailKey) {
                        overlayDetailEditSnapshotRef.current = {
                          key: detailKey,
                          values: valuesRef.current,
                          lineItems: lineItemsRef.current
                        };
                      }
                      onDiagnostic?.('lineItems.overlayDetail.edit.save', {
                        groupId: subKey,
                        rowId: detailRowId,
                        mode: overlayDetailCanView ? 'view' : 'edit'
                      });
                      if (overlayDetailCanView) {
                        overlayDetailEditSnapshotRef.current = null;
                      }
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
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button type="button" style={buttonStyles.primary} onClick={handleDetailSave}>
                            {tSystem('common.saveChanges', language, 'Save changes')}
                          </button>
                          <button type="button" style={buttonStyles.secondary} onClick={handleDetailCancel}>
                            {tSystem('common.cancel', language, 'Cancel')}
                          </button>
                        </div>
                        <LineItemGroupQuestion
                          key={detailGroupDef.id}
                          q={detailGroupDef as any}
                          ctx={{
                              definition,
                              language,
                              values: detailContextValues,
                              resolveVisibilityValue,
                              getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                              setValues,
                            lineItems,
                            setLineItems,
                            submitting: submitting || isFieldLockedByDedup(parsed?.rootGroupId || subKey),
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
                            resetDrag,
                            uploadAnnouncements,
                            handleLineFileInputChange,
                            handleLineFileDrop,
                            removeLineFile,
                            clearLineFiles,
                            errorIndex,
                            setOverlay,
                            onDiagnostic,
                            openConfirmDialog: openConfirmDialogResolved,
                            isOverlayOpenActionSuppressed,
                            suppressOverlayOpenAction,
                            runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows
                          }}
                        />
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          ) : isSubTableMode ? (
            <div className="ck-line-item-table__scroll">
              <LineItemTable
                columns={[
                  ...((() => {
                    const subColumnWidths = overlayDetailEnabled ? overlayDetailHeaderWidths : subUi?.tableColumnWidths;
                    const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined => {
                      if (!subColumnWidths || typeof subColumnWidths !== 'object' || Array.isArray(subColumnWidths)) return undefined;
                      const candidates: string[] = [];
                      const pushCandidate = (val?: string) => {
                        if (!val) return;
                        if (candidates.includes(val)) return;
                        candidates.push(val);
                      };
                      const lower = columnId.toLowerCase();
                      const normalized = columnId.replace(/^_+/, '');
                      const normalizedLower = normalized.toLowerCase();
                      pushCandidate(columnId);
                      pushCandidate(lower);
                      if (['view', 'edit', 'remove', 'actions'].includes(normalizedLower)) {
                        pushCandidate(`__${normalizedLower}`);
                        pushCandidate(`_${normalizedLower}`);
                        pushCandidate(normalizedLower);
                        pushCandidate('__actions');
                        pushCandidate('actions');
                      } else {
                        pushCandidate(normalized);
                        pushCandidate(normalizedLower);
                      }
                      const rawWidth = candidates.reduce<any>(
                        (acc, key) => (acc !== undefined ? acc : (subColumnWidths as any)[key]),
                        undefined
                      );
                      if (rawWidth === undefined || rawWidth === null) return undefined;
                      if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
                      const widthValue = rawWidth.toString().trim();
                      return widthValue ? { width: widthValue } : undefined;
                    };

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
                          return <div className="ck-line-item-table__value">{selected?.label || choiceVal || '—'}</div>;
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
                              onChange: next => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                          return <div className="ck-line-item-table__value">{labels.length ? labels.join(', ') : '—'}</div>;
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
                        const items = toUploadItems(subRow.values[field.id]);
                        const count = items.length;
                        if (renderAsLabel) {
                          return <div className="ck-line-item-table__value">{count ? `${count}` : '—'}</div>;
                        }
                        return (
                          <div className="ck-line-item-table__control" {...controlAttrs}>
                            <button
                              type="button"
                              onClick={() => {
                                if (submitting) return;
                                openFileOverlay({
                                  scope: 'line',
                                  title: resolveFieldLabel(field, language, field.id),
                                  group: subGroupDef,
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
                            {renderErrors()}
                          </div>
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
                        return <div className="ck-line-item-table__value">{display || '—'}</div>;
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
                              ...buttonStyles.secondary,
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
          ) : orderedRows.length ? (
            orderedRows.map((subRow, subIdx) => {
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
                  const optionSetField: OptionSet =
                    optionState[optionKey(anchorField.id, subKey)] || {
                      en: anchorField.options || [],
                      fr: (anchorField as any).optionsFr || [],
                      nl: (anchorField as any).optionsNl || []
                    };
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
                                const optionSetField: OptionSet =
                                  optionState[optionKey(field.id, subKey)] || {
                                    en: field.options || [],
                                    fr: (field as any).optionsFr || [],
                                    nl: (field as any).optionsNl || []
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
                                onChange: next => handleLineFieldChange(subGroupDef, subRow.id, field, next)
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
                              className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
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
                                        group: subGroupDef,
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
                                      group: subGroupDef,
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
                                    group: subGroupDef,
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
          {overlayHelperText ? (
            <div className="muted" style={{ margin: '12px 6px', whiteSpace: 'pre-line' }}>
              {overlayHelperText}
            </div>
          ) : null}
          </div>
        </fieldset>
      </div>,
      document.body
    );
  })();

  const lineItemGroupOverlayPortal = (() => {
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
              <button type="button" onClick={() => attemptCloseLineItemGroupOverlay('button')} style={buttonStyles.secondary}>
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
    const count = rows.length;
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
    const overlayBreadcrumb = tSystem('lineItems.breadcrumbRoot', language, 'Line items');
    const breadcrumbText = `${overlayBreadcrumb} / ${title}`;

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
      const optionSetField =
        optionState[optionKey(selectorOverlayAnchorField.id, groupId)] || {
          en: selectorOverlayAnchorField.options || [],
          fr: (selectorOverlayAnchorField as any).optionsFr || [],
          nl: (selectorOverlayAnchorField as any).optionsNl || [],
          raw: (selectorOverlayAnchorField as any).optionsRaw
        };
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
    const overlayDetailSelectedRowIndex = overlayDetailSelectionForGroup
      ? rows.findIndex(r => r.id === overlayDetailSelectionForGroup.rowId)
      : -1;
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
    const resolveOverlayDetailHeaderStyle = (columnId: string): React.CSSProperties | undefined => {
      if (!overlayDetailHeaderWidths || typeof overlayDetailHeaderWidths !== 'object' || Array.isArray(overlayDetailHeaderWidths)) return undefined;
      const candidates: string[] = [];
      const pushCandidate = (val?: string) => {
        if (!val) return;
        if (candidates.includes(val)) return;
        candidates.push(val);
      };
      const lower = columnId.toLowerCase();
      const normalized = columnId.replace(/^_+/, '');
      const normalizedLower = normalized.toLowerCase();
      pushCandidate(columnId);
      pushCandidate(lower);
      if (['view', 'edit', 'remove', 'actions'].includes(normalizedLower)) {
        pushCandidate(`__${normalizedLower}`);
        pushCandidate(`_${normalizedLower}`);
        pushCandidate(normalizedLower);
        pushCandidate('__actions');
        pushCandidate('actions');
      } else {
        pushCandidate(normalized);
        pushCandidate(normalizedLower);
      }
      const rawWidth = candidates.reduce<any>(
        (acc, key) => (acc !== undefined ? acc : (overlayDetailHeaderWidths as any)[key]),
        undefined
      );
      if (rawWidth === undefined || rawWidth === null) return undefined;
      if (typeof rawWidth === 'number') return { width: `${rawWidth}%` };
      const widthValue = rawWidth.toString().trim();
      return widthValue ? { width: widthValue } : undefined;
    };

    const renderAddButton = () => {
      if (!groupCfg) {
        return (
          <button
            type="button"
            onClick={() => {
              if (locked || maxRowsReached) return;
              addLineItemRowManual(groupId, undefined, groupAddRowOptions);
            }}
            style={withDisabled(buttonStyles.secondary, locked || maxRowsReached)}
            disabled={locked || maxRowsReached}
          >
            <PlusIcon />
            {tSystem('lineItems.addLine', language, 'Add line')}
          </button>
        );
      }
      if (isOverlayAddMode && groupCfg.anchorFieldId) {
        return (
          <button
            type="button"
            disabled={locked || selectorIsMissing || maxRowsReached}
            style={withDisabled(buttonStyles.secondary, locked || selectorIsMissing || maxRowsReached)}
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
                  setOptionState(prev => ({ ...prev, [key]: loaded }));
                }
              }
              if (!opts) {
                opts = {
                  en: anchorField.options || [],
                  fr: (anchorField as any).optionsFr || [],
                  nl: (anchorField as any).optionsNl || []
                };
              }
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
              if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.placeholder) {
                onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                  groupId,
                  scope: 'lineItemGroup',
                  hasTitle: !!addOverlayCopy.title,
                  hasHelperText: !!addOverlayCopy.helperText,
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
                placeholder: addOverlayCopy.placeholder
              });
            }}
          >
            <PlusIcon />
            {resolveLocalizedString(groupCfg.addButtonLabel, language, tSystem('lineItems.addLines', language, 'Add lines'))}
          </button>
        );
      }
      if (canUseSelectorOverlay) {
        return null;
      }
      return (
        <button
          type="button"
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
          style={withDisabled(buttonStyles.secondary, locked || selectorIsMissing || maxRowsReached)}
        >
          <PlusIcon />
          {resolveLocalizedString(groupCfg.addButtonLabel, language, tSystem('lineItems.addLine', language, 'Add line'))}
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
                <button type="button" onClick={() => attemptCloseLineItemGroupOverlay('button')} style={buttonStyles.secondary}>
                  {overlayCloseButtonLabel}
                </button>
              ) : null}
            </div>
            <div style={{ textAlign: 'center', padding: '0 8px', overflowWrap: 'anywhere' }}>
              {overlayContextHeader ? <div style={{ whiteSpace: 'pre-line' }}>{overlayContextHeader}</div> : null}
              {overlayHeaderLabel ? <div>{overlayHeaderLabel}</div> : null}
              <div style={srOnly}>{title}</div>
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
                          allowed.forEach(val =>
                            addLineItemRowManual(groupId, { [selectorOverlayAnchorFieldId]: val }, groupAddRowOptions)
                          );
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
                              ...buttonStyles.secondary,
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
                                  style={buttonStyles.secondary}
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
                        if (overlayDetailCanView) {
                          setOverlayDetailSelection({ groupId, rowId: detailRowId, mode: 'view' });
                        } else if (overlayDetailEditSnapshotRef.current?.key === detailKey) {
                          overlayDetailEditSnapshotRef.current = {
                            key: detailKey,
                            values: valuesRef.current,
                            lineItems: lineItemsRef.current
                          };
                        }
                        onDiagnostic?.('lineItems.overlayDetail.edit.save', {
                          groupId,
                          rowId: detailRowId,
                          mode: overlayDetailCanView ? 'view' : 'edit'
                        });
                        if (overlayDetailCanView) {
                          overlayDetailEditSnapshotRef.current = null;
                        }
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
                            <button type="button" style={buttonStyles.primary} onClick={handleDetailSave}>
                              {tSystem('common.saveChanges', language, 'Save changes')}
                            </button>
                            <button type="button" style={buttonStyles.secondary} onClick={handleDetailCancel}>
                              {tSystem('common.cancel', language, 'Cancel')}
                            </button>
                          </div>
                          <LineItemGroupQuestion
                            key={subGroupDef.id}
                            q={subGroupDef as any}
                            ctx={{
                              definition,
                              language,
                              values: detailContextValues,
                              resolveVisibilityValue,
                              getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                              setValues,
                              lineItems,
                              setLineItems,
                              submitting: submitting || isFieldLockedByDedup(groupId),
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
                              resetDrag,
                              uploadAnnouncements,
                              handleLineFileInputChange,
                              handleLineFileDrop,
                              removeLineFile,
                              clearLineFiles,
                              errorIndex,
                              setOverlay,
                              onDiagnostic,
                              openConfirmDialog: openConfirmDialogResolved,
                              isOverlayOpenActionSuppressed,
                              suppressOverlayOpenAction,
                              runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows,
                              closeOverlay: () => attemptCloseLineItemGroupOverlay('button')
                            }}
                          />
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            ) : (
              <LineItemGroupQuestion
                key={overlayGroup.id}
                q={overlayGroup as any}
                rowFilter={overlayRowFilter}
                hideInlineSubgroups={overlayHideInlineSubgroups}
                hideToolbars
                rowFlow={lineItemGroupOverlay.rowFlow}
                ctx={{
                  definition,
                  language,
                  values,
                  resolveVisibilityValue,
                  getTopValue: getTopValueNoScan,
                  setValues,
                  lineItems,
                  setLineItems,
                  submitting: submitting || isFieldLockedByDedup(groupId),
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
                  resetDrag,
                  uploadAnnouncements,
                  handleLineFileInputChange,
                  handleLineFileDrop,
                  removeLineFile,
                  clearLineFiles,
                  errorIndex,
                  setOverlay,
                  onDiagnostic,
                  openConfirmDialog: openConfirmDialogResolved,
                  isOverlayOpenActionSuppressed,
                  suppressOverlayOpenAction,
                  runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows,
                  closeOverlay: () => attemptCloseLineItemGroupOverlay('button')
                }}
              />
            )}
            {overlayHelperText ? (
              <div className="muted" style={{ margin: '12px 6px', whiteSpace: 'pre-line' }}>
                {overlayHelperText}
              </div>
            ) : null}
          </div>
        </fieldset>
      </div>,
      document.body
    );
  })();

  const fileOverlayPortal = (() => {
    if (!fileOverlay.open) return null;
    if (typeof document === 'undefined') return null;

    const title = fileOverlay.title || tSystem('files.title', language, 'Photos');
    const isTop = fileOverlay.scope === 'top' && !!fileOverlay.question;
    const isLine =
      fileOverlay.scope === 'line' &&
      !!fileOverlay.group &&
      !!fileOverlay.rowId &&
      !!fileOverlay.field &&
      !!fileOverlay.fieldPath;

    if (!isTop && !isLine) return null;

    const fieldPath = isTop ? (fileOverlay.question!.id || '') : (fileOverlay.fieldPath || '');
    const uploadConfig: any = isTop ? (fileOverlay.question as any)?.uploadConfig || {} : (fileOverlay.field as any)?.uploadConfig || {};
    const readOnly = Boolean(isTop ? (fileOverlay.question as any)?.readOnly : (fileOverlay.field as any)?.readOnly);
    const items = (() => {
      if (isTop) return toUploadItems(values[(fileOverlay.question as any).id]);
      const groupId = (fileOverlay.group as any).id;
      const rowId = fileOverlay.rowId as string;
      const fieldId = (fileOverlay.field as any).id;
      const existingRows = lineItems[groupId] || [];
      const row = existingRows.find(r => r.id === rowId);
      return toUploadItems((row?.values || {})[fieldId] as any);
    })();

    const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;

    const onAdd = () => {
      if (submitting || readOnly) return;
      if (maxed) return;
      fileInputsRef.current[fieldPath]?.click();
    };

    const onClearAll = () => {
      if (submitting || readOnly) return;
      if (isTop) {
        clearFiles(fileOverlay.question!);
      } else {
        clearLineFiles({
          group: fileOverlay.group!,
          rowId: fileOverlay.rowId as string,
          field: fileOverlay.field,
          fieldPath: fileOverlay.fieldPath as string
        });
      }
    };

    const onRemoveAt = (idx: number) => {
      if (submitting || readOnly) return;
      if (isTop) {
        removeFile(fileOverlay.question!, idx);
      } else {
        removeLineFile({
          group: fileOverlay.group!,
          rowId: fileOverlay.rowId as string,
          field: fileOverlay.field,
          fieldPath: fileOverlay.fieldPath as string,
          index: idx
        });
      }
    };

    return (
      <FileOverlay
        open={fileOverlay.open}
        language={language}
        title={title}
        submitting={submitting}
        readOnly={readOnly}
        items={items}
        uploadConfig={uploadConfig}
        onAdd={onAdd}
        onClearAll={onClearAll}
        onRemoveAt={onRemoveAt}
        onClose={closeFileOverlay}
      />
    );
  })();

  const infoOverlayPortal = (
    <InfoOverlay
      open={infoOverlay.open}
      language={language}
      title={infoOverlay.title || ''}
      text={infoOverlay.text || ''}
      onClose={closeInfoOverlay}
    />
  );

  const renderGuidedContent = (): React.ReactNode => {
    if (!guidedEnabled || !guidedStepsCfg) return null;
    const steps = guidedStepsCfg.items || [];
    if (!steps.length) return null;

    const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
    const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? (guidedStepsCfg.header!.include as any[]) : [];
    const stepTargets: any[] = Array.isArray(stepCfg?.include) ? (stepCfg.include as any[]) : [];

    const stepHelpText = stepCfg?.helpText ? resolveLocalizedString(stepCfg.helpText, language, '') : '';
    const stepLineGroupsDefaultMode = (stepCfg?.render?.lineGroups?.mode || '') as 'inline' | 'overlay' | '';
    const stepSubGroupsDefaultMode = (stepCfg?.render?.subGroups?.mode || '') as 'inline' | 'overlay' | '';

    const renderTarget = (target: any, keyPrefix: string): React.ReactNode => {
      if (!target || typeof target !== 'object') return null;
      const kind = (target.kind || '').toString().trim();
      const id = (target.id || '').toString().trim();
      if (!kind || !id) return null;

      if (kind === 'question') {
        const q = definition.questions.find(q2 => q2.id === id);
        if (!q) return null;
        return <React.Fragment key={`${keyPrefix}:q:${q.id}`}>{renderQuestion(q)}</React.Fragment>;
      }

      if (kind !== 'lineGroup') return null;
      const groupQ = definition.questions.find(q2 => q2.id === id && q2.type === 'LINE_ITEM_GROUP');
      if (!groupQ) return null;

      const presentationRaw = (target.presentation || 'groupEditor').toString().trim().toLowerCase();
      const presentation: 'groupEditor' | 'liftedRowFields' =
        presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';

      const targetModeRaw = (target.displayMode || 'inherit').toString().trim().toLowerCase();
      const stepModeRaw = stepLineGroupsDefaultMode ? stepLineGroupsDefaultMode.toString().trim().toLowerCase() : '';
      const inheritedOverlay = !!(groupQ.lineItemConfig as any)?.ui?.openInOverlay;
      const resolvedLineMode =
        targetModeRaw === 'inline' || targetModeRaw === 'overlay'
          ? (targetModeRaw as 'inline' | 'overlay')
          : stepModeRaw === 'inline' || stepModeRaw === 'overlay'
            ? (stepModeRaw as 'inline' | 'overlay')
            : inheritedOverlay
              ? 'overlay'
              : 'inline';
      const effectiveLineMode: 'inline' | 'overlay' = presentation === 'liftedRowFields' ? 'inline' : resolvedLineMode;

      const subTargetModeRaw = ((target.subGroups as any)?.displayMode || 'inherit').toString().trim().toLowerCase();
      const subStepModeRaw = stepSubGroupsDefaultMode ? stepSubGroupsDefaultMode.toString().trim().toLowerCase() : '';
      const resolvedSubMode =
        subTargetModeRaw === 'inline' || subTargetModeRaw === 'overlay'
          ? (subTargetModeRaw as 'inline' | 'overlay')
          : subStepModeRaw === 'inline' || subStepModeRaw === 'overlay'
            ? (subStepModeRaw as 'inline' | 'overlay')
            : 'inline';
      const hideInlineSubgroups = resolvedSubMode === 'overlay';

      // Filter parent fields and (optionally) subgroup definitions/fields based on the step target allowlists.
      const lineCfg = (groupQ as any).lineItemConfig || {};
      const rowFilter = target.rows || null;
      const normalizeLineFieldId = (groupId: string, rawId: any): string => {
        const s = rawId !== undefined && rawId !== null ? rawId.toString().trim() : '';
        if (!s) return '';
        const underscorePrefix = `${groupId}__`;
        if (s.startsWith(underscorePrefix)) return s.slice(underscorePrefix.length);
        const dotPrefix = `${groupId}.`;
        if (s.startsWith(dotPrefix)) return s.slice(dotPrefix.length);
        if (s.includes('.')) return s.split('.').pop() || s;
        return s;
      };
      const parseStepFieldEntries = (
        groupId: string,
        raw: any
      ): { allowed: Set<string> | null; renderAsLabel: Set<string>; order: string[] } => {
        if (!raw) return { allowed: null, renderAsLabel: new Set(), order: [] };
        const entries: Array<{ id: string; renderAsLabel: boolean }> = [];
        const pushEntry = (v: any) => {
          if (v === undefined || v === null) return;
          if (typeof v === 'object') {
            const id = normalizeLineFieldId(groupId, (v as any).id ?? (v as any).fieldId ?? (v as any).field);
            if (!id) return;
            entries.push({ id, renderAsLabel: Boolean((v as any).renderAsLabel) });
            return;
          }
          const id = normalizeLineFieldId(groupId, v);
          if (!id) return;
          entries.push({ id, renderAsLabel: false });
        };
        if (Array.isArray(raw)) {
          raw.forEach(pushEntry);
        } else {
          raw
              .toString()
              .split(',')
              .map((s: string) => s.trim())
            .filter(Boolean)
            .forEach(pushEntry);
        }
        const ids = entries.map(e => e.id).filter(Boolean);
        const roIds = entries.filter(e => e.renderAsLabel).map(e => e.id).filter(Boolean);
        const order = Array.from(new Set(ids));
        return { allowed: ids.length ? new Set(ids) : null, renderAsLabel: new Set(roIds), order };
      };

      const { allowed: allowedFieldIds, renderAsLabel: renderAsLabelFieldIdsFromFields, order: fieldOrder } = parseStepFieldEntries(
        groupQ.id,
        target.fields
      );
      const readOnlyFieldIds = (() => {
        const raw = (target as any).readOnlyFields;
        const parsed = parseStepFieldEntries(groupQ.id, raw);
        const ids = parsed.allowed ? Array.from(parsed.allowed) : [];
        const merged = new Set<string>([...ids, ...Array.from(renderAsLabelFieldIdsFromFields)]);
        return merged.size ? merged : null;
      })();

      const filteredFieldsBase = allowedFieldIds
        ? (lineCfg.fields || []).filter((f: any) => {
            const fid = normalizeLineFieldId(groupQ.id, (f as any)?.id);
            return fid && allowedFieldIds.has(fid);
          })
        : lineCfg.fields || [];
      const filteredFields = (filteredFieldsBase as any[]).map((f: any) => {
        const fid = normalizeLineFieldId(groupQ.id, (f as any)?.id);
        if (readOnlyFieldIds && fid && readOnlyFieldIds.has(fid)) {
          return { ...(f as any), readOnly: true, ui: { ...((f as any).ui || {}), renderAsLabel: true } };
        }
        return f;
      });
      const orderedFields = fieldOrder.length
        ? fieldOrder
            .map(fid => filteredFields.find(f => normalizeLineFieldId(groupQ.id, (f as any)?.id) === fid))
            .filter(Boolean)
            .concat(
              filteredFields.filter(f => !fieldOrder.includes(normalizeLineFieldId(groupQ.id, (f as any)?.id)))
            )
        : filteredFields;

      const subGroupsCfgPresent = !!target.subGroups && typeof target.subGroups === 'object';
      const subIncludeRaw = subGroupsCfgPresent ? (target.subGroups as any)?.include : undefined;
      const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
      const allowedSubIds = subIncludeList
        .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
        .filter(Boolean);
      const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;

      const filteredSubGroups = (() => {
        const subs = (lineCfg.subGroups || []) as any[];
        if (!subs.length) return subs;
        // In guided steps, `liftedRowFields` should not show subgroups unless explicitly configured.
        if (!subGroupsCfgPresent && presentation === 'liftedRowFields') return [];
        const kept = allowedSubSet
          ? subs.filter(sub => {
              const subId = resolveSubgroupKey(sub as any);
              return subId && allowedSubSet.has(subId);
            })
          : subs;
        return kept.map(sub => {
          const subId = resolveSubgroupKey(sub as any);
          const subTarget = subIncludeList.find(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : '') === subId);
          const allowedSubFieldsRaw = subTarget?.fields;
          const {
            allowed: allowedSubFields,
            renderAsLabel: renderAsLabelSubFieldIdsFromFields,
            order: subFieldOrder
          } = parseStepFieldEntries(subId, allowedSubFieldsRaw);
          const readOnlySubFieldsRaw = subTarget?.readOnlyFields;
          const readOnlySubFields = (() => {
            const parsed = parseStepFieldEntries(subId, readOnlySubFieldsRaw);
            const ids = parsed.allowed ? Array.from(parsed.allowed) : [];
            const merged = new Set<string>([...ids, ...Array.from(renderAsLabelSubFieldIdsFromFields)]);
            return merged.size ? merged : null;
          })();

          const baseFields: any[] = (sub as any).fields || [];
          const nextFields = allowedSubFields && allowedSubFields.size
            ? baseFields.filter((f: any) => {
                const fid = normalizeLineFieldId(subId, (f as any)?.id);
                return fid && allowedSubFields.has(fid);
              })
            : baseFields;
          const finalFields =
            readOnlySubFields && readOnlySubFields.size
              ? nextFields.map((f: any) => {
                  const fid = normalizeLineFieldId(subId, (f as any)?.id);
                  if (fid && readOnlySubFields.has(fid)) {
                    return { ...(f as any), readOnly: true, ui: { ...((f as any).ui || {}), renderAsLabel: true } };
                  }
                  return f;
                })
              : nextFields;
          const orderedSubFields = subFieldOrder.length
            ? subFieldOrder
                .map(fid => finalFields.find(f => normalizeLineFieldId(subId, (f as any)?.id) === fid))
                .filter(Boolean)
                .concat(finalFields.filter(f => !subFieldOrder.includes(normalizeLineFieldId(subId, (f as any)?.id))))
            : finalFields;
          return { ...(sub as any), fields: orderedSubFields };
        });
      })();

      const stepLineCfg: any = { ...(lineCfg as any), fields: orderedFields, subGroups: filteredSubGroups };
      // Safety: when a row filter is applied for this step, hide "Add line" controls to avoid creating invisible rows.
      if (rowFilter) {
        stepLineCfg.ui = { ...(stepLineCfg.ui || {}), addButtonPlacement: 'hidden' };
      }
      if (presentation === 'liftedRowFields') {
        stepLineCfg.ui = { ...(stepLineCfg.ui || {}), showItemPill: false };
      }
      if (target?.collapsedFieldsInHeader === true) {
        // Guided steps UX: render progressive collapsed fields in the row header and hide the toggle/pill UI.
        stepLineCfg.ui = { ...(stepLineCfg.ui || {}), guidedCollapsedFieldsInHeader: true };
      }

      const stepGroup: WebQuestionDefinition = {
        ...(groupQ as any),
        ...(presentation === 'liftedRowFields' ? { ui: { ...((groupQ as any).ui || {}), hideLabel: true } } : {}),
        lineItemConfig: stepLineCfg
      };

      if (effectiveLineMode === 'overlay') {
        const label = resolveLabel(stepGroup, language);
        const openLabel = tSystem('common.open', language, 'Open');
        const pillText = label;
        return (
          <div
            key={`${keyPrefix}:lg:${stepGroup.id}`}
            className="field inline-field ck-full-width"
            data-field-path={stepGroup.id}
            data-has-error={errors[stepGroup.id] ? 'true' : undefined}
            data-has-warning={hasWarning(stepGroup.id) ? 'true' : undefined}
          >
            <label style={stepGroup.ui?.hideLabel === true ? srOnly : undefined}>
              {label}
              {(stepGroup as any).required && <RequiredStar />}
            </label>
            <button
              type="button"
              className="ck-progress-pill ck-upload-pill-btn ck-open-overlay-pill"
              aria-disabled={submitting ? 'true' : undefined}
              onClick={() => {
                if (submitting) return;
                openLineItemGroupOverlay(stepGroup, { rowFilter, hideInlineSubgroups });
              }}
            >
              <span>{pillText}</span>
              <span className="ck-progress-label">{openLabel}</span>
              <span className="ck-progress-caret">▸</span>
            </button>
            {renderWarnings(stepGroup.id)}
            {errors[stepGroup.id] ? <div className="error">{errors[stepGroup.id]}</div> : null}
          </div>
        );
      }

      const locked = submitting || isFieldLockedByDedup(stepGroup.id);
      return (
        <LineItemGroupQuestion
          key={`${keyPrefix}:lg:${stepGroup.id}:${activeGuidedStepId}`}
          q={stepGroup as any}
          rowFlow={target.rowFlow}
          rowFilter={rowFilter}
          hideInlineSubgroups={hideInlineSubgroups}
          ctx={{
            definition,
            language,
            values,
            resolveVisibilityValue,
            getTopValue: getTopValueNoScan,
            setValues,
            lineItems,
            setLineItems,
            submitting: locked,
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
            resetDrag,
            uploadAnnouncements,
            handleLineFileInputChange,
            handleLineFileDrop,
            removeLineFile,
            clearLineFiles,
            errorIndex,
            setOverlay,
            onDiagnostic,
            openConfirmDialog: openConfirmDialogResolved,
            isOverlayOpenActionSuppressed,
            suppressOverlayOpenAction,
            runSelectionEffectsForAncestors: runSelectionEffectsForAncestorRows
          }}
        />
      );
    };

    const renderTargetsWithPairing = (targets: any[], keyPrefix: string): React.ReactNode[] => {
      type TargetItem =
        | { type: 'question'; q: WebQuestionDefinition; key: string }
        | { type: 'node'; node: React.ReactNode; key: string };

      const items = targets
        .map((target, idx): TargetItem | null => {
          if (!target || typeof target !== 'object') return null;
          const kind = (target.kind || '').toString().trim();
          const id = (target.id || '').toString().trim();
          if (!kind || !id) return null;
          if (kind === 'question') {
            const q = definition.questions.find(q2 => q2.id === id);
            if (!q) return null;
            if (shouldHideField(q.visibility, topVisibilityCtx)) return null;
            return { type: 'question', q, key: `${keyPrefix}:q:${q.id}:${idx}` };
          }
          const node = renderTarget(target, `${keyPrefix}:${idx}`);
          if (!node) return null;
          return { type: 'node', node, key: `${keyPrefix}:node:${id}:${idx}` };
        })
        .filter(Boolean) as TargetItem[];

      const isPairable = (q: WebQuestionDefinition): boolean => {
        if (!q.pair) return false;
        if (q.type === 'LINE_ITEM_GROUP') return false;
        if (q.type === 'PARAGRAPH') return false;
        return true;
      };

      const used = new Set<string>();
      const rows: React.ReactNode[] = [];

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.type === 'node') {
          rows.push(<React.Fragment key={item.key}>{item.node}</React.Fragment>);
          continue;
        }
        if (used.has(item.key)) continue;
        const pairKey = item.q.pair ? item.q.pair.toString() : '';
        if (!pairKey || !isPairable(item.q)) {
          used.add(item.key);
          rows.push(<React.Fragment key={item.key}>{renderQuestion(item.q)}</React.Fragment>);
          continue;
        }
        const group: Array<TargetItem & { type: 'question' }> = [item];
        for (let j = i + 1; j < items.length; j += 1) {
          const cand = items[j];
          if (cand.type !== 'question') continue;
          if (used.has(cand.key)) continue;
          if ((cand.q.pair ? cand.q.pair.toString() : '') === pairKey && isPairable(cand.q)) {
            group.push(cand);
          }
        }
        group.forEach(entry => used.add(entry.key));
        const maxPerRow = 3;
        for (let k = 0; k < group.length; k += maxPerRow) {
          const slice = group.slice(k, k + maxPerRow);
          if (slice.length === 1) {
            rows.push(<React.Fragment key={`${item.key}:${k}`}>{renderQuestion(slice[0].q)}</React.Fragment>);
            continue;
          }
          const hasDate = slice.some(entry => entry.q.type === 'DATE');
          const colsClass = slice.length === 3 ? ' ck-pair-grid--3' : '';
          rows.push(
            <PairedRowGrid key={`${item.key}:${k}`} className={`ck-pair-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}>
              {slice.map(entry => (
                <React.Fragment key={entry.key}>{renderQuestion(entry.q, { inGrid: true })}</React.Fragment>
              ))}
            </PairedRowGrid>
          );
        }
      }

      return rows;
    };

    const stepsBarNode = (
      <StepsBar
        language={language}
        steps={steps.map(s => ({ id: (s?.id || '').toString(), label: (s as any).label }))}
        status={guidedStatus.steps}
        activeStepId={activeGuidedStepId}
        maxReachableIndex={maxReachableGuidedIndex}
        onSelectStep={id => selectGuidedStep(id, 'user')}
      />
    );
    const stepsBarPortalEl =
      typeof document !== 'undefined' ? (document.getElementById('ck-guided-stepsbar-slot') as HTMLElement | null) : null;
    const stepsBarPortal = stepsBarPortalEl ? createPortal(stepsBarNode, stepsBarPortalEl) : null;
    const stepsBarInline = stepsBarPortalEl ? null : stepsBarNode;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stepsBarPortal}
        {stepsBarInline}
        <div ref={guidedStepBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stepHelpText ? (
            <div role="note" className="ck-step-help-text">
              {stepHelpText}
            </div>
          ) : null}
          {renderTargetsWithPairing(headerTargets, 'header')}
          {renderTargetsWithPairing(stepTargets, `step:${activeGuidedStepId}`)}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ck-form-sections">
        {recordStatusText ? (
          <div className="ck-record-status-row">
            <span className="ck-record-status-label">{tSystem('list.meta.status', language, 'Status')}</span>
            <span
              className="ck-status-pill"
              title={recordStatusText}
              aria-label={`Status: ${recordStatusText}`}
              data-status-key={recordStatusKey || undefined}
            >
              {recordStatusText}
            </span>
          </div>
        ) : null}
        {showWarningsBanner && warningTop && warningTop.length ? (
          <div
            role="status"
            style={{
              scrollMarginTop: 'calc(var(--safe-top) + 140px)',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div>{tSystem('validation.warningsTitle', language, 'Warnings')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 500 }}>
              {warningTop.map((w, idx) => (
                <button
                  key={`${idx}-${w.fieldPath}-${w.message}`}
                  type="button"
                  onClick={() => navigateToFieldKey(w.fieldPath)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  {w.message}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {status ? (
          <div
            ref={statusRef}
            role={statusTone === 'error' ? 'alert' : 'status'}
            tabIndex={-1}
            onClick={() => {
              if (statusTone !== 'error') return;
              const keys = Object.keys(errors || {});
              if (!keys.length) return;
              navigateToFieldKey(keys[0]);
            }}
            style={{
              scrollMarginTop: 'calc(var(--safe-top) + 140px)',
              padding: '14px 16px',
              borderRadius: 14,
              border:
                statusTone === 'error'
                  ? '1px solid var(--danger)'
                  : '1px solid var(--border)',
              background: 'transparent',
              color: statusTone === 'error' ? 'var(--danger)' : 'var(--text)',
              fontWeight: 600,
              cursor: statusTone === 'error' && Object.keys(errors || {}).length ? 'pointer' : undefined
            }}
          >
            {status}
          </div>
        ) : null}

        <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
          <div className="ck-group-stack">
            {guidedEnabled ? renderGuidedContent() : (() => {
              type GroupSection = (typeof groupSections)[number];

              const renderGroupSection = (section: GroupSection): React.ReactNode => {
                const visible = (section.questions || []).filter(q => !shouldHideField(q.visibility, topVisibilityCtx));
                if (!visible.length) return null;

                const isCollapsed = section.collapsible ? !!collapsedGroups[section.key] : false;

                const sectionHasError = (() => {
                  const keys = Object.keys(errors || {});
                  if (!keys.length) return false;
                  for (const q of section.questions) {
                    if (keys.includes(q.id)) return true;
                    const prefix1 = `${q.id}__`;
                    const prefix2 = `${q.id}::`;
                    if (keys.some(k => k.startsWith(prefix1) || k.startsWith(prefix2))) return true;
                  }
                  return false;
                })();

                // Use the same "deep" completion logic as autoCollapseOnComplete (incl. line item groups + subgroups).
                const groupProgress = topLevelGroupProgress.find(g => g.key === section.key);
                const totalRequired = groupProgress?.totalRequired ?? 0;
                const requiredComplete = groupProgress?.requiredComplete ?? 0;
                let requiredProgressClass =
                  totalRequired > 0
                    ? requiredComplete >= totalRequired
                      ? 'ck-progress-good'
                      : 'ck-progress-bad'
                    : 'ck-progress-neutral';
                if (sectionHasError) requiredProgressClass = 'ck-progress-bad';
                const tapExpandLabel = tSystem('common.tapToExpand', language, 'Tap to expand');
                const tapCollapseLabel = tSystem('common.tapToCollapse', language, 'Tap to collapse');
                const pillActionLabel = isCollapsed ? tapExpandLabel : tapCollapseLabel;

                const isPairable = (q: WebQuestionDefinition): boolean => {
                  if (!q.pair) return false;
                  if (q.type === 'LINE_ITEM_GROUP') return false;
                  if (q.type === 'PARAGRAPH') return false;
                  if (q.type === 'BUTTON') return false;
                  return true;
                };

                const used = new Set<string>();
                const rows: WebQuestionDefinition[][] = [];
                for (let i = 0; i < visible.length; i++) {
                  const q = visible[i];
                  if (used.has(q.id)) continue;
                  const pairKey = q.pair ? q.pair.toString() : '';
                  if (!pairKey || !isPairable(q)) {
                    used.add(q.id);
                    rows.push([q]);
                    continue;
                  }

                  const group: WebQuestionDefinition[] = [q];
                  for (let j = i + 1; j < visible.length; j++) {
                    const cand = visible[j];
                    if (used.has(cand.id)) continue;
                    if ((cand.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
                      group.push(cand);
                    }
                  }

                  group.forEach(it => used.add(it.id));
                  const maxPerRow = 3;
                  for (let k = 0; k < group.length; k += maxPerRow) {
                    rows.push(group.slice(k, k + maxPerRow));
                  }
                }

                return (
                  <div
                    key={section.key}
                    className="card form-card ck-group-card"
                    data-group-key={section.key}
                    data-has-error={sectionHasError ? 'true' : undefined}
                  >
                    {section.title ? (
                      section.collapsible ? (
                        <button
                          type="button"
                          className="ck-group-header ck-group-header--clickable"
                          onClick={() => toggleGroupCollapsed(section.key)}
                          aria-expanded={!isCollapsed}
                          aria-label={`${pillActionLabel} section ${section.title}`}
                        >
                          <div className="ck-group-title">{section.title}</div>
                          <span
                            className={`ck-progress-pill ${requiredProgressClass}`}
                            title={pillActionLabel}
                            aria-hidden="true"
                          >
                            {requiredProgressClass === 'ck-progress-good' ? (
                              <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
                            ) : null}
                            <span className="ck-progress-label">{pillActionLabel}</span>
                            <span className="ck-progress-caret">{isCollapsed ? '▸' : '▾'}</span>
                          </span>
                        </button>
                      ) : (
                        <div className="ck-group-header">
                          <div className="ck-group-title">{section.title}</div>
                        </div>
                      )
                    ) : null}

                    {!isCollapsed && (
                      <div className="ck-group-body">
                        <div className="ck-form-grid">
                          {rows.map(row => {
                            if (row.length > 1) {
                              const hasDate = row.some(q => q.type === 'DATE');
                              const colsClass = row.length === 3 ? ' ck-pair-grid--3' : '';
                              return (
                                <PairedRowGrid
                                  key={row.map(q => q.id).join('__')}
                                  className={`ck-pair-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}
                                >
                                  {row.map(q => renderQuestion(q, { inGrid: true }))}
                                </PairedRowGrid>
                              );
                            }
                            return renderQuestion(row[0], { inGrid: false });
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              return groupSectionBlocks.map((block, idx) => {
                if (block.kind === 'group') return renderGroupSection(block.group as any);

                const rendered = (block.groups || []).map(g => renderGroupSection(g as any)).filter(Boolean) as React.ReactNode[];
                if (!rendered.length) return null;

                return (
                  <PageSection key={`page-section-${block.key}-${idx}`} title={block.title} infoText={block.infoText}>
                    <div className="ck-group-stack">{rendered}</div>
                  </PageSection>
                );
              });
            })()}
          </div>
        </fieldset>
      </div>
      <LineSelectOverlay
        overlay={overlay}
        setOverlay={setOverlay}
        language={language}
        submitting={submitting}
        onDiagnostic={onDiagnostic}
        addLineItemRowManual={addLineItemRowManual}
      />
      {showFallbackConfirmOverlay ? (
        <ConfirmDialogOverlay
          open={fallbackConfirm.state.open}
          title={fallbackConfirm.state.title}
          message={fallbackConfirm.state.message}
          confirmLabel={fallbackConfirm.state.confirmLabel}
          cancelLabel={fallbackConfirm.state.cancelLabel}
          showCancel={fallbackConfirm.state.showCancel}
          showConfirm={fallbackConfirm.state.showConfirm}
          onCancel={fallbackConfirm.cancel}
          onConfirm={fallbackConfirm.confirm}
        />
      ) : null}
      {lineItemGroupOverlayPortal}
      {subgroupOverlayPortal}
      {fileOverlayPortal}
      {infoOverlayPortal}
    </>
  );
};

export default FormView;
