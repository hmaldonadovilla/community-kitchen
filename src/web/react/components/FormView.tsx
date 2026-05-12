import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  mergeOptionStateValue,
  shouldHideField,
  matchesWhen,
  computeTotals,
  loadOptionsFromDataSource,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../core';
import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  LocalizedString,
  OptionSet,
  QuestionGroupConfig,
  RowFlowConfig,
  StepMilestoneActionConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import type {
  InventoryReservationPlanScope,
  LineItemFieldConfig,
  LineItemGroupConfigOverride,
  LineItemOverlaySessionConfig,
  LineItemOverlayOpenActionConfig,
  OverlayCloseConfirmLike,
  RowFlowActionEffect
} from '../../../types';
import { ConfirmDialogOverlay } from '../features/overlays/ConfirmDialogOverlay';
import { useConfirmDialog } from '../features/overlays/useConfirmDialog';
import type { ConfirmDialogOpenArgs } from '../features/overlays/useConfirmDialog';
import {
  useOverlayEditingAutoSaveHold,
  useOverlaySessionSnapshots,
  useScopedAutoSaveHold
} from '../features/overlays/useOverlaySessionController';
import {
  getOverlayCloseAllowCloseFromEdit,
  resolveOverlayCloseConfirm,
  resolveOverlayCloseVisibilityScope
} from '../features/overlays/domain/overlayCloseConfirm';
import { shouldAutoOpenSubgroupForPendingAnchor } from '../features/overlays/domain/overlayDetailNavigation';
import { resolveOverlayDetailErrors } from '../features/overlays/domain/overlayDetailValidation';
import { applyOverlayCloseDeletePlan, resolveOverlayCloseDeletePlan, resolveOverlayCloseDeleteScope } from '../features/overlays/domain/overlayCloseEffects';
import { shouldQueueBackgroundReservationSyncOnAdvance } from '../features/steps/domain/backgroundReservationSync';
import { isGuidedStepBarAccessAllowed } from '../features/steps/domain/stepAccess';
import { resolveGuidedStepIdOnStructureChange } from '../features/steps/domain/resolveGuidedStepOnStructureChange';
import { buildGuidedStepDefinitionAction } from '../features/steps/domain/guidedStepDefinition';
import type { GuidedReservationSyncWaitResult } from '../features/reservations/domain/reservationSyncFreshness';
import {
  resolveGuidedClearOnChangeOrderedFieldIdsAction,
  resolveGuidedOrderedQuestionsAction
} from '../features/steps/domain/guidedStepQuestionOrder';
import {
  collectDefinitionBlurDerivedDependencyIds,
  hasDefinitionBlurDerivedValues
} from '../features/derivedValues/domain/blurDependencies';
import { areLineItemsShallowEqual, diffFormValues } from './form/formValueComparison';
import {
  buildLineItemGroupOverlayValidationDefinitionAction,
  buildSubgroupOverlayValidationDefinitionAction
} from './form/overlayValidationDefinition';
import { buildValidationErrorIndex } from '../features/validation/domain/errorIndex';
import { useImperativeFieldNavigation } from '../features/validation/useImperativeFieldNavigation';
import { useValidationErrorNavigation } from '../features/validation/useValidationErrorNavigation';
import { useValidationNavigationRequest } from '../features/validation/useValidationNavigationRequest';
import { resolveFieldLabel } from '../utils/labels';
import { resolveStatusPillKey } from '../utils/statusPill';
import { peekInlineHtmlTemplateCache, renderInlineHtmlTemplateApi } from '../api';
import { FormErrors, LineItemState, OptionState } from '../types';
import { clearLineItemGroupErrors, mergeLineItemGroupErrors } from './form/utils';
import { InfoOverlay } from './form/overlays/InfoOverlay';
import { LineOverlayState, LineSelectOverlay } from './form/overlays/LineSelectOverlay';
import { buildTopQuestionRenderer } from './form/topQuestionRenderer';
import { useOrderedEntryValidationController } from './form/useOrderedEntryValidationController';
import { useSingleChoiceDefaults } from './form/useSingleChoiceDefaults';
import { useChoiceControlRenderer } from './form/useChoiceControlRenderer';
import { useFormConfigDiagnostics } from './form/useFormConfigDiagnostics';
import { isGuidedStepAutoAdvanceAllowed } from '../app/stepAutoAdvance';
import { buildFormGroupSections, buildPageSectionBlocks, resolveGroupSectionKey } from './form/grouping';
import { GroupedFormSections } from './form/GroupedFormSections';
import { FormStatusNotices } from './form/FormStatusNotices';
import { scrollFormGroupToTop } from './form/scrollFormGroupToTop';
import { useFormViewStateRefs } from './form/useFormViewStateRefs';
import { useFormBlurCoordinator } from './form/useFormBlurCoordinator';
import { useTopLevelGroupAutoCollapse } from './form/useTopLevelGroupAutoCollapse';
import { useFieldDisableRuleState } from './form/useFieldDisableRuleState';
import { useFormVisibilityResolvers } from './form/useFormVisibilityResolvers';
import { LineItemGroupOverlayPortal } from '../features/lineItems/components/LineItemGroupOverlayPortal';
import { SubgroupOverlayPortal } from '../features/lineItems/components/SubgroupOverlayPortal';
import { FormFileOverlay } from '../features/uploads/components/FormFileOverlay';
import {
  useFormUploadController,
  type FileUploadOrderedEntryCheckArgs
} from '../features/uploads/useFormUploadController';
import { useFormFileUploadHandlers } from '../features/uploads/hooks/useFormFileUploadHandlers';
import { applyValueMapsToForm, coerceDefaultValue } from './form/valueMaps';
import type { OrderedEntryTarget } from './form/orderedEntry';
import {
  buildLineContextId,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  computeRowNonMatchOptions,
  parseSubgroupKey,
  recomputeLineItemNonMatchOptions,
  resolveSubgroupKey
} from '../app/lineItems';

import { markRecipeIngredientsDirtyForGroupKey } from '../app/recipeIngredientsDirty';
import { applyLineItemGroupOverride, serializeLineItemTree } from '../app/lineItemTree';
import { isIngredientsManagementForm } from '../app/ingredientsCreateRules';
import { runSelectionEffectsForAncestors } from '../app/runSelectionEffectsForAncestors';
import { resolveTemplateIdForRecord } from '../app/templateId';
import {
  computeParagraphDisclaimerUpdates as computeParagraphDisclaimerUpdatesAction,
} from '../app/paragraphDisclaimer';
import type { SystemRecordMeta } from '../../rules/systemFields';
import { containsLineItemsClause, containsParentLineItemsClause, matchesWhenClause } from '../../rules/visibility';
import { buildDraftPayload, resolveDraftPayloadFormKey, validateForm } from '../app/submission';
import { GuidedContentRenderer } from '../features/steps/components/GuidedContentRenderer';
import { computeGuidedStepsStatus } from '../features/steps/domain/computeStepStatus';
import {
  shouldApplyGuidedExternalSyncSignal,
  type GuidedExternalSyncSignal
} from '../features/steps/domain/guidedExternalSyncSignal';
import { resolveGuidedStepIdAfterExternalSync } from '../features/steps/domain/resolveGuidedStepAfterExternalSync';
import type { GuidedStepsVirtualState } from '../features/steps/domain/resolveVirtualStepField';
import { resolveGuidedUiStateAction } from '../features/steps/domain/guidedUiState';
import { useGuidedStepVisibility } from '../features/steps/hooks/useGuidedStepVisibility';
import {
  normalizeGuidedAutoAdvance,
  normalizeGuidedForwardGate,
  resolveGuidedAutoAdvanceFocusDeferralAction,
  resolveGuidedAutoAdvanceTransitionAction,
  resolveGuidedBackAction,
  resolveGuidedStepAutoAdvance,
  resolveGuidedStepForwardGate,
  resolveGuidedStepSelectionAction,
  resolveGuidedStepsVirtualState,
  resolveMaxReachableGuidedStepIndex
} from '../features/steps/domain/guidedNavigation';
import {
  areOverlayHeaderFieldsComplete,
  resolveOverlayHeaderFields,
  resolveRequiredValue
} from '../features/lineItems/domain/formViewHelpers';
import { shouldPreserveLineItemDedupError } from '../features/lineItems/domain/lineItemDedupErrors';
import { useFormLineItemRows } from '../features/lineItems/hooks/useFormLineItemRows';
import { useFormFieldChangeHandlers } from '../features/formState/hooks/useFormFieldChangeHandlers';
import { useOverlayOpenActions } from '../features/lineItems/hooks/useOverlayOpenActions';
import {
  buildGuidedReservationManagedRowRemovalFingerprint,
  buildGuidedReservationManagedRowRemovalScopes,
  cloneLineItemStateSnapshot,
  detectGuidedReservationManagedRowRemovals,
  resolveGuidedReservationManagedRowRemovalDetectionScope,
  type GuidedReservationManagedRowRemovalImpact
} from '../features/reservations/stepReservationPlan';

const OVERLAY_DETAIL_INLINE_RENDER_DEBOUNCE_MS = 350;

interface SubgroupOverlayState {
  open: boolean;
  subKey?: string;
  rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
  groupOverride?: LineItemGroupConfigOverride;
  hideInlineSubgroups?: boolean;
  hideCloseButton?: boolean;
  closeButtonLabel?: string;
  closeConfirm?: OverlayCloseConfirmLike;
  label?: string;
  contextHeader?: string;
  helperText?: string;
  overlaySession?: LineItemOverlaySessionConfig;
  rowFlow?: RowFlowConfig;
  source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
}

interface LineItemGroupOverlayState {
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

type UserEditResult = { deferMutation?: boolean; skipSelectionEffects?: boolean };

type OverlayStackEntry =
  | { kind: 'subgroup'; state: SubgroupOverlayState }
  | { kind: 'lineItem'; state: LineItemGroupOverlayState };

// keep context ids consistent with App.tsx so auto-generated rows from selection effects
// can be reconciled when loading existing records

type StatusTone = 'info' | 'success' | 'error';

interface FormViewProps {
  formKey?: string;
  definition: WebFormDefinition;
  /**
   * Optional map of dedup key field ids (used to keep dedup keys editable even if valueMap is present).
   */
  dedupKeyFieldIdMap?: Record<string, true>;
  /**
   * When true, block guided steps forward navigation (Next + steps bar) even if step gates are satisfied.
   * Used to keep step navigation consistent with system action gates that disable the primary submit/next action.
   */
  guidedForwardNavigationBlocked?: boolean;
  language: LangCode;
  values: Record<string, FieldValue>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  onSubmit: (ctx: {
    collapsedRows: Record<string, boolean>;
    collapsedSubgroups: Record<string, boolean>;
    validationDefinition?: WebFormDefinition;
    validationVirtualState?: GuidedStepsVirtualState | null;
  }) => Promise<void>;
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
      preferLookupSourceValue?: boolean;
      snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState };
    }
  ) => void;
  selectionEffectAsyncPendingCount?: number;
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
    busyTitle?: string;
    busyMessage?: string;
  }) => Promise<{ success: boolean; message?: string; items?: string[]; value?: string }>;
  /**
   * Optional handler for BUTTON fields (Doc template preview / report rendering).
   */
  onReportButton?: (buttonId: string) => void;
  onReportButtonPointerDown?: (buttonId: string) => void;
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
  }) => UserEditResult | void;
  onAutomatedMutation?: (args: {
    scope: 'line';
    fieldPath: string;
    fieldId?: string;
    groupId?: string;
    rowId?: string;
    source: 'selectionEffectInit';
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
  onGuidedStepMilestone?: (args: {
    stepId: string;
    action: StepMilestoneActionConfig;
    nextStepId?: string;
  }) => Promise<{ success: boolean; advanceToNext?: boolean; message?: string }>;
  onBeforeGuidedStepAdvance?: (args: {
    stepId: string;
    nextStepId?: string;
    stepIndex?: number;
    nextStepIndex?: number;
    trigger: 'next' | 'auto';
    waitDialog?: ConfirmDialogOpenArgs;
    queueBackgroundReservationSync?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  requestedGuidedStepId?: string | null;
  guidedExternalSyncSignal?: GuidedExternalSyncSignal | null;
  recordSessionId?: number;
  onRequestedGuidedStepHandled?: () => void;
  dedupNavigationBlocked?: boolean;
  openConfirmDialog?: (args: ConfirmDialogOpenArgs) => void;
  /**
   * Optional hook to temporarily hold autosave (e.g., while the user completes a multi-step overlay flow).
   */
  setAutoSaveHold?: (hold: boolean, meta?: { reason?: string }) => void;
  /**
   * Optional generic hook for interactions that require a persisted record id
   * before calling the server.
   */
  ensureRecordId?: (args?: { reason?: string; fieldPath?: string }) => Promise<{ success: boolean; recordId?: string; message?: string }>;
  /**
   * Optional guided-step hook that applies step-managed inventory reservations and persists
   * the latest draft immediately after a valid datasource-row change.
   */
  queueGuidedStepReservationDraftSync?: (args: {
    stepId: string;
    reason: string;
    persistSnapshot?: boolean;
    snapshotLineItems?: LineItemState;
    releaseScopes?: InventoryReservationPlanScope[];
  }) => void;
  onGuidedStepReservationDraftStateChange?: (args: {
    stepId: string;
    groupId: string;
    parentRowId: string;
    sourceKey: string;
    pendingInvalid: boolean;
    reason: string;
    patchFields?: string[];
  }) => void;
  /**
   * Optional guided-step hook used by datasource-backed steps that must wait for an in-flight
   * guided reservation sync before bootstrapping shared inventory rows.
   */
  waitForGuidedStepReservationDraftSync?: (args: {
    recordId: string;
    stepId?: string;
    reason: string;
  }) => Promise<GuidedReservationSyncWaitResult>;
  waitForPendingSharedDataMutations?: (args: {
    targetFormKeys: string[];
    recordId?: string;
    stepId?: string;
    reason: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean; message?: string }>;
}

const FormView: React.FC<FormViewProps> = ({
  formKey,
  definition,
  dedupKeyFieldIdMap,
  guidedForwardNavigationBlocked,
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
  selectionEffectAsyncPendingCount = 0,
  onUploadFiles,
  onReportButton,
  onReportButtonPointerDown,
  reportBusy,
  reportBusyId,
  onUserEdit,
  onAutomatedMutation,
  onDiagnostic,
  onFormValidityChange,
  onGuidedUiChange,
  onGuidedStepMilestone,
  onBeforeGuidedStepAdvance,
  requestedGuidedStepId,
  guidedExternalSyncSignal,
  recordSessionId,
  onRequestedGuidedStepHandled,
  dedupNavigationBlocked,
  openConfirmDialog,
  setAutoSaveHold,
  ensureRecordId,
  queueGuidedStepReservationDraftSync,
  onGuidedStepReservationDraftStateChange,
  waitForGuidedStepReservationDraftSync,
  waitForPendingSharedDataMutations
}) => {
  const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
    const raw = (field as any)?.optionSort;
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'source' ? 'source' : 'alphabetical';
  };
  const orderedEntryEnabled = definition.submitValidation?.enforceFieldOrder === true;
  const ingredientNameTransformEnabled = isIngredientsManagementForm(formKey);
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
  const recordStatusText = (recordMeta?.status || '').toString().trim();
  const recordStatusKey = useMemo(
    () => resolveStatusPillKey(recordStatusText, definition.followup?.statusTransitions),
    [definition.followup?.statusTransitions, recordStatusText]
  );
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
  const overlayDetailRenderSignatureRef = useRef<string>('');
  const overlayDetailRenderSeqRef = useRef(0);
  const overlayDetailRenderTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [overlayDetailHtml, setOverlayDetailHtml] = useState('');
  const [overlayDetailHtmlError, setOverlayDetailHtmlError] = useState('');
  const [overlayDetailHtmlLoading, setOverlayDetailHtmlLoading] = useState(false);
  const orderedEntryGateRef = useRef<(args: { targetQuestionId: string; source: string }) => boolean>(() => false);
  const fileUploadOrderedEntryGateRef = useRef<(args: FileUploadOrderedEntryCheckArgs) => boolean>(() => false);
  const [subgroupOverlay, setSubgroupOverlay] = useState<SubgroupOverlayState>({ open: false });
  const overlayStackRef = useRef<OverlayStackEntry[]>([]);
  const [infoOverlay, setInfoOverlay] = useState<InfoOverlayState>({ open: false });
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
  const {
    firstErrorRef,
    requestRef: errorNavRequestRef,
    consumedRef: errorNavConsumedRef,
    modeRef: errorNavModeRef,
    allowOverlayOpenRef: errorNavAllowOverlayOpenRef,
    requestValidationNavigation,
    consumeValidationNavigation
  } = useValidationNavigationRequest({ onDiagnostic });
  const guidedBackErrorNavSuppressionRef = useRef<{ stepId: string; suppressUntil: number } | null>(null);
  const orderedEntryGuideFieldPathRef = useRef<string | null>(null);
  const overlayCloseValidateOnOpenRef = useRef<Record<string, boolean>>({});
  const hideLabelLoggedRef = useRef<Set<string>>(new Set());
  const overlayOpenActionLoggedRef = useRef<Set<string>>(new Set());
  const guidedLineGroupOverrideLoggedRef = useRef<Set<string>>(new Set());
  const [overlayOpenActionSuppressed, setOverlayOpenActionSuppressed] = useState<Record<string, boolean>>({});
  const fallbackConfirm = useConfirmDialog({ eventPrefix: 'ui.formConfirm', onDiagnostic });
  const openConfirmDialogResolved = openConfirmDialog || fallbackConfirm.openConfirm;
  const showFallbackConfirmOverlay = !openConfirmDialog;
  const groupScrollAnimRafRef = useRef(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const {
    valuesRef,
    lineItemsRef,
    collapsedRowsRef,
    collapsedSubgroupsRef,
    setValuesSynced,
    setLineItemsSynced
  } = useFormViewStateRefs({
    values,
    lineItems,
    collapsedRows,
    collapsedSubgroups,
    setValues,
    setLineItems
  });
  const closeUploadMultiAddOverlay = useCallback(() => {
    if (overlay.open) {
      setOverlay({ open: false, options: [], selected: [] });
    }
  }, [overlay.open]);
  const {
    fileOverlay,
    setFileOverlay,
    fileInputsRef,
    dragState,
    uploadAnnouncements,
    uploadFailures,
    fileItemsSignature,
    resolveFileOverlayItems,
    dismissFileOverlay,
    closeFileOverlay,
    openFileOverlay,
    incrementDrag,
    decrementDrag,
    resetDrag,
    announceUpload,
    clearUploadFailureForField,
    recordUploadFailure,
    retryUploadFailure,
    renderUploadFailure,
    resetNativeFileInput,
    stageFilesInOverlay,
    updateFileOverlayAfterImmediateAction
  } = useFormUploadController({
    valuesRef,
    lineItemsRef,
    language,
    submitting,
    overlayOpen: overlay.open,
    closeMultiAddOverlay: closeUploadMultiAddOverlay,
    fileUploadOrderedEntryGateRef,
    onUploadFiles,
    onDiagnostic
  });
  const optionStateRef = useRef(optionState);
  const paragraphDisclaimerPendingRef = useRef(false);
  const paragraphDisclaimerSyncRef = useRef<((source?: string) => void) | null>(null);
  const paragraphDisclaimerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (overlayDetailRenderTimerRef.current) {
        globalThis.clearTimeout(overlayDetailRenderTimerRef.current);
        overlayDetailRenderTimerRef.current = null;
      }
    };
  }, []);

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
  }, [lineItemsRef, overlayDetailSelection, valuesRef]);

  useEffect(() => {
    optionStateRef.current = optionState;
  }, [optionState]);

  const {
    ensureOverlaySessionSnapshot,
    clearOverlaySessionSnapshot,
    restoreOverlaySessionSnapshot
  } = useOverlaySessionSnapshots({
    valuesRef,
    lineItemsRef,
    setValues,
    setLineItems,
    setErrors,
    onDiagnostic
  });
  const setScopedAutoSaveHold = useScopedAutoSaveHold({ setAutoSaveHold, onDiagnostic });
  useOverlayEditingAutoSaveHold({
    lineSelectOpen: overlay.open,
    lineItemOverlayOpen: lineItemGroupOverlay.open,
    subgroupOverlayOpen: subgroupOverlay.open,
    setScopedAutoSaveHold,
    onDiagnostic
  });

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
  const {
    guidedStepVisibilityCtx,
    guidedVisibleSteps,
    resolveDataSourceCountValue
  } = useGuidedStepVisibility({
    definition,
    guidedEnabled,
    guidedStepsCfg,
    language,
    values,
    lineItems,
    recordMeta
  });

  const guidedStatus = useMemo(() => {
    if (!guidedEnabled) return { steps: [], maxCompleteIndex: -1, maxValidIndex: -1 };
    return computeGuidedStepsStatus({ definition, language, values, lineItems });
  }, [definition, guidedEnabled, language, lineItems, values]);

  const guidedStepIds = useMemo(() => {
    if (!guidedEnabled) return [] as string[];
    return guidedVisibleSteps
      .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
      .filter(Boolean);
  }, [guidedEnabled, guidedVisibleSteps]);
  const guidedStepBarBlockedIds = useMemo(() => {
    if (!guidedEnabled) return [] as string[];
    return guidedVisibleSteps
      .filter(step => !isGuidedStepBarAccessAllowed(step as any, guidedStepVisibilityCtx))
      .map(step => (step?.id || '').toString().trim())
      .filter(Boolean);
  }, [guidedEnabled, guidedVisibleSteps, guidedStepVisibilityCtx]);

  const [activeGuidedStepId, setActiveGuidedStepId] = useState<string>(() => {
    const first = guidedStepIds[0];
    return first ? first : '';
  });
  const lastGuidedExternalSyncTokenRef = useRef<number>(0);
  const guidedStepBodyRef = useRef<HTMLDivElement | null>(null);
  const guidedAutoAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const guidedAutoAdvanceStateRef = useRef<{ stepId: string; lastSatisfied: boolean; armed: boolean } | null>(null);
  const guidedAutoAdvanceAttemptRef = useRef<(() => void) | null>(null);
  const guidedLastUserEditAtRef = useRef<number>(0);

  const activeGuidedStepIndex = Math.max(0, guidedStepIds.indexOf(activeGuidedStepId));
  const guidedReservationRemovalSyncSnapshotRef = useRef<{
    recordId: string;
    lineItems: LineItemState | null;
  }>({ recordId: '', lineItems: null });
  const guidedReservationRemovalSyncFingerprintRef = useRef<string>('');

  useLayoutEffect(() => {
    const recordId = `${recordMeta?.id || ''}`.trim();
    const previousSnapshot = guidedReservationRemovalSyncSnapshotRef.current;
    const recordChanged = previousSnapshot.recordId !== recordId;
    const nextSnapshot = cloneLineItemStateSnapshot(lineItems);
    if (!guidedEnabled || !queueGuidedStepReservationDraftSync || !recordId) {
      guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
      guidedReservationRemovalSyncFingerprintRef.current = '';
      return;
    }
    if (!previousSnapshot.lineItems || recordChanged) {
      guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
      guidedReservationRemovalSyncFingerprintRef.current = '';
      return;
    }

    const detectionScope = resolveGuidedReservationManagedRowRemovalDetectionScope(activeGuidedStepId);
    const activeStepImpacts = detectionScope
      ? detectGuidedReservationManagedRowRemovals({
          definition,
          stepId: detectionScope.stepId,
          previousLineItems: previousSnapshot.lineItems,
          nextLineItems: nextSnapshot,
          mode: detectionScope.mode
        })
      : [];
    const impacts = activeStepImpacts.length
      ? activeStepImpacts
      : detectGuidedReservationManagedRowRemovals({
          definition,
          stepId: activeGuidedStepId,
          previousLineItems: previousSnapshot.lineItems,
          nextLineItems: nextSnapshot,
          mode: 'all'
        });

    guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
    if (!impacts.length) return;

    const removalFingerprint = buildGuidedReservationManagedRowRemovalFingerprint({
      recordId,
      activeStepId: activeGuidedStepId,
      impacts
    });
    if (
      removalFingerprint &&
      guidedReservationRemovalSyncFingerprintRef.current === removalFingerprint
    ) {
      return;
    }
    guidedReservationRemovalSyncFingerprintRef.current = removalFingerprint;

    const stepImpacts = new Map<string, GuidedReservationManagedRowRemovalImpact[]>();
    impacts.forEach(impact => {
      const list = stepImpacts.get(impact.stepId) || [];
      list.push(impact);
      stepImpacts.set(impact.stepId, list);
    });

    stepImpacts.forEach((stepImpactList, stepId) => {
      const removedRowIds = Array.from(
        new Set(
          stepImpactList.flatMap(impact => Array.isArray(impact.removedRowIds) ? impact.removedRowIds : [])
        )
      );
      const releaseScopes = buildGuidedReservationManagedRowRemovalScopes(stepImpactList);
      onDiagnostic?.('guidedStep.reservationSync.queuedOnManagedRowRemoval', {
        recordId,
        activeStepId: activeGuidedStepId || null,
        stepId,
        impactCount: stepImpactList.length,
        removedRowIds,
        releaseScopes: releaseScopes.length,
        outputGroups: Array.from(new Set(stepImpactList.map(impact => impact.outputGroupId).filter(Boolean)))
      });
      queueGuidedStepReservationDraftSync({
        stepId,
        reason: `managedRowRemoval:${removedRowIds.join(',') || 'unknown'}`,
        persistSnapshot: true,
        snapshotLineItems: nextSnapshot,
        releaseScopes
      });
    });
  }, [
    activeGuidedStepId,
    definition,
    guidedEnabled,
    lineItems,
    onDiagnostic,
    queueGuidedStepReservationDraftSync,
    recordMeta?.id
  ]);

  const runSelectionEffectsForAncestorRows = useCallback(
    (
      sourceGroupKey: string,
      prevLineItems: LineItemState,
      nextLineItems: LineItemState,
      options?: { mode?: 'init' | 'change' | 'blur'; topValues?: Record<string, FieldValue> }
    ) => {
      if (!onSelectionEffect) return;
      runSelectionEffectsForAncestors({
        definition,
        values: options?.topValues || valuesRef.current,
        onSelectionEffect,
        sourceGroupKey,
        prevLineItems,
        nextLineItems,
        options
      });
    },
    [definition, onSelectionEffect, valuesRef]
  );

  const guidedDefaultForwardGate = normalizeGuidedForwardGate((guidedStepsCfg as any)?.defaultForwardGate, 'whenValid');
  const guidedDefaultAutoAdvance = normalizeGuidedAutoAdvance((guidedStepsCfg as any)?.defaultAutoAdvance, 'onValid');
  const maxReachableGuidedIndexBase = resolveMaxReachableGuidedStepIndex({
    enabled: guidedEnabled,
    hasStepsConfig: Boolean(guidedStepsCfg),
    stepIds: guidedStepIds,
    visibleSteps: guidedVisibleSteps as any[],
    statuses: guidedStatus.steps,
    defaultForwardGate: guidedDefaultForwardGate
  });
  const maxReachableGuidedIndex =
    dedupNavigationBlocked && activeGuidedStepIndex >= 0
      ? Math.min(activeGuidedStepIndex, maxReachableGuidedIndexBase)
      : maxReachableGuidedIndexBase;

  useFormConfigDiagnostics({
    definition,
    language,
    guidedEnabled,
    guidedStepIds,
    guidedStepsCfg,
    guidedVisibleSteps,
    orderedEntryEnabled,
    onDiagnostic
  });

  // Initialize/repair the active step when the visible step structure changes.
  // Do not clamp a still-visible step back to the current forward gate; users must be able
  // to navigate backward through earlier steps even when upstream required fields are now empty.
  useEffect(() => {
    if (!guidedEnabled) return;
    const nextId = resolveGuidedStepIdOnStructureChange({
      guidedStepIds,
      activeGuidedStepId,
      maxReachableIndex: maxReachableGuidedIndex
    });
    if (!nextId) return;
    setActiveGuidedStepId(nextId);
    onDiagnostic?.('steps.step.change', { from: activeGuidedStepId || null, to: nextId, reason: 'load' });
  }, [activeGuidedStepId, guidedEnabled, guidedStepIds, maxReachableGuidedIndex, onDiagnostic]);

  useEffect(() => {
    if (!guidedEnabled) return;
    const requestedId = (requestedGuidedStepId || '').toString().trim();
    if (!requestedId) return;
    if (!guidedStepIds.includes(requestedId)) {
      onRequestedGuidedStepHandled?.();
      return;
    }
    if (requestedId === activeGuidedStepId) {
      onRequestedGuidedStepHandled?.();
      return;
    }
    setActiveGuidedStepId(requestedId);
    onDiagnostic?.('steps.step.change', { from: activeGuidedStepId, to: requestedId, reason: 'externalRequest' });
    onRequestedGuidedStepHandled?.();
  }, [activeGuidedStepId, guidedEnabled, guidedStepIds, onDiagnostic, onRequestedGuidedStepHandled, requestedGuidedStepId]);

  useLayoutEffect(() => {
    if (!guidedEnabled) return;
    const nextToken = Number(guidedExternalSyncSignal?.token);
    const currentRecordId = recordMeta?.id === undefined || recordMeta?.id === null ? '' : recordMeta.id.toString().trim();
    if (
      !shouldApplyGuidedExternalSyncSignal({
        signal: guidedExternalSyncSignal,
        handledToken: lastGuidedExternalSyncTokenRef.current,
        currentRecordId,
        currentRecordSessionId: recordSessionId ?? null
      })
    ) {
      return;
    }
    lastGuidedExternalSyncTokenRef.current = nextToken;
    guidedAutoAdvanceAttemptRef.current = null;
    if (guidedAutoAdvanceTimerRef.current) {
      globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
      guidedAutoAdvanceTimerRef.current = null;
    }
    guidedAutoAdvanceStateRef.current = null;
    const desiredStepId = resolveGuidedStepIdAfterExternalSync({
      guidedStepIds,
      steps: guidedStatus.steps,
      maxReachableIndex: maxReachableGuidedIndex,
      currentStepId: activeGuidedStepId
    });
    onDiagnostic?.('steps.step.externalSync.realign', {
      from: activeGuidedStepId || null,
      to: desiredStepId || activeGuidedStepId || null,
      changed: Boolean(desiredStepId),
      token: nextToken,
      recordId: currentRecordId || null,
      recordSessionId: recordSessionId ?? null,
      reason: guidedExternalSyncSignal?.reason || null
    });
    if (!desiredStepId) return;
    setActiveGuidedStepId(desiredStepId);
    onDiagnostic?.('steps.step.change', { from: activeGuidedStepId, to: desiredStepId, reason: 'externalSync' });
  }, [
    activeGuidedStepId,
    guidedEnabled,
    guidedExternalSyncSignal,
    guidedStatus.steps,
    guidedStepIds,
    maxReachableGuidedIndex,
    onDiagnostic,
    recordMeta?.id,
    recordSessionId
  ]);

  const guidedVirtualState = useMemo(() => {
    return resolveGuidedStepsVirtualState({
      enabled: guidedEnabled,
      prefix: guidedPrefix,
      activeStepId: activeGuidedStepId,
      stepIds: guidedStepIds,
      status: guidedStatus
    });
  }, [activeGuidedStepId, guidedEnabled, guidedPrefix, guidedStatus, guidedStepIds]);

  const guidedInlineLineGroupIds = useMemo(() => {
    const out = new Set<string>();
    if (!guidedEnabled || !guidedStepsCfg) return out;
    const steps = guidedVisibleSteps;
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
      const groupOverride = (target as any).groupOverride as LineItemGroupConfigOverride | undefined;
      const baseLineCfg = (groupQ as any).lineItemConfig || {};
      const lineCfg = groupOverride ? applyLineItemGroupOverride(baseLineCfg, groupOverride) : baseLineCfg;
      const inheritedOverlay = !!(lineCfg as any)?.ui?.openInOverlay;
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
  }, [activeGuidedStepId, definition.questions, guidedEnabled, guidedStepsCfg, guidedVisibleSteps]);

  const buildGuidedStepDefinition = useCallback(
    (stepId?: string): WebFormDefinition | null =>
      buildGuidedStepDefinitionAction({
        guidedEnabled,
        guidedStepsCfg,
        guidedStepIds,
        guidedVisibleSteps,
        activeGuidedStepId,
        stepId,
        definition,
        onLineGroupOverrideApplied: ({ stepId: resolvedStepId, groupId, groupOverride }) => {
          if (!onDiagnostic) return;
          const logKey = `${resolvedStepId}::${groupId}::groupOverride`;
          if (guidedLineGroupOverrideLoggedRef.current.has(logKey)) return;
          guidedLineGroupOverrideLoggedRef.current.add(logKey);
          onDiagnostic('steps.lineGroup.groupOverride.applied', {
            stepId: resolvedStepId,
            groupId,
            keys: Object.keys(groupOverride || {})
          });
        }
      }),
    [activeGuidedStepId, definition, guidedEnabled, guidedStepIds, guidedVisibleSteps, guidedStepsCfg, onDiagnostic]
  );

  const validateGuidedStepScope = useCallback(
    (args: {
      scope: 'currentStep' | 'throughCurrentStep' | 'fullForm';
      stepId: string;
      stepIndex: number;
    }): { errors: FormErrors; firstInvalidStepId: string | null } => {
      const currentValues = valuesRef.current;
      const currentLineItems = lineItemsRef.current;

      if (args.scope === 'fullForm') {
        const nextErrors = validateForm({
          definition,
          language,
          values: currentValues,
          lineItems: currentLineItems,
          collapsedRows,
          collapsedSubgroups,
          virtualState: guidedVirtualState
        });
        return {
          errors: nextErrors,
          firstInvalidStepId: Object.keys(nextErrors).length ? guidedStepIds[0] || args.stepId || null : null
        };
      }

      const stepIds =
        args.scope === 'throughCurrentStep'
          ? guidedStepIds.slice(0, Math.max(0, args.stepIndex) + 1)
          : [args.stepId];
      const mergedErrors: FormErrors = {};
      let firstInvalidStepId: string | null = null;

      stepIds.forEach(stepId => {
        const stepDefinition = buildGuidedStepDefinition(stepId) || definition;
        const stepCfg = guidedVisibleSteps.find(step => (step?.id || '').toString().trim() === stepId) as any;
        const stepStatus = guidedStatus.steps.find(step => step.id === stepId);
        const forwardGate = resolveGuidedStepForwardGate(stepCfg, guidedDefaultForwardGate);
        const requiredMode =
          forwardGate === 'whenComplete' && !stepStatus?.complete ? ('stepComplete' as const) : ('configured' as const);
        const nextErrors = validateForm({
          definition: stepDefinition,
          language,
          values: currentValues,
          lineItems: currentLineItems,
          collapsedRows,
          collapsedSubgroups,
          requiredMode,
          virtualState: guidedVirtualState
        });
        if (Object.keys(nextErrors).length && !firstInvalidStepId) {
          firstInvalidStepId = stepId;
        }
        Object.assign(mergedErrors, nextErrors);
      });

      return { errors: mergedErrors, firstInvalidStepId };
    },
    [
      buildGuidedStepDefinition,
      collapsedRows,
      collapsedSubgroups,
      definition,
      guidedDefaultForwardGate,
      guidedStatus.steps,
      guidedStepIds,
      guidedVirtualState,
      guidedVisibleSteps,
      language,
      valuesRef,
      lineItemsRef
    ]
  );

  const orderedEntryQuestions = useMemo(() => {
    return resolveGuidedOrderedQuestionsAction({
      orderedEntryEnabled,
      guidedEnabled,
      guidedStepsCfg,
      guidedStepIds,
      guidedVisibleSteps,
      activeGuidedStepId,
      definition,
      scopedDefinition: buildGuidedStepDefinition(activeGuidedStepId)
    });
  }, [
    activeGuidedStepId,
    buildGuidedStepDefinition,
    definition,
    guidedEnabled,
    guidedStepIds,
    guidedVisibleSteps,
    guidedStepsCfg,
    orderedEntryEnabled
  ]);

  const clearOnChangeOrderedFieldIds = useMemo(() => {
    return resolveGuidedClearOnChangeOrderedFieldIdsAction({
      guidedEnabled,
      guidedStepsCfg,
      guidedStepIds,
      guidedVisibleSteps,
      definition
    });
  }, [definition, guidedEnabled, guidedStepIds, guidedVisibleSteps, guidedStepsCfg]);

  const selectGuidedStep = useCallback(
    (nextStepId: string, reason: 'user' | 'auto' = 'user') => {
      const selection = resolveGuidedStepSelectionAction({
        enabled: guidedEnabled,
        nextStepId,
        activeStepId: activeGuidedStepId,
        stepIds: guidedStepIds,
        stepsConfig: guidedStepsCfg,
        reason,
        forwardNavigationBlocked: Boolean(guidedForwardNavigationBlocked),
        defaultForwardGate: guidedDefaultForwardGate,
        maxReachableIndex: maxReachableGuidedIndex,
        dedupNavigationBlocked: Boolean(dedupNavigationBlocked)
      });
      if (selection.action === 'none') return;
      if (selection.clearBackErrorSuppression) {
        guidedBackErrorNavSuppressionRef.current = null;
      }
      if (selection.action === 'blocked') {
        onDiagnostic?.('steps.step.blocked', selection.diagnostic);
        return;
      }
      if (selection.resetAutoAdvance) {
        guidedAutoAdvanceAttemptRef.current = null;
        if (guidedAutoAdvanceTimerRef.current) {
          globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
          guidedAutoAdvanceTimerRef.current = null;
        }
        guidedAutoAdvanceStateRef.current = null;
      }
      if (Object.prototype.hasOwnProperty.call(selection, 'backErrorSuppressionStepId')) {
        if (selection.backErrorSuppressionStepId) {
          guidedBackErrorNavSuppressionRef.current = {
            stepId: selection.backErrorSuppressionStepId,
            suppressUntil: Date.now() + 800
          };
        } else {
          guidedBackErrorNavSuppressionRef.current = null;
        }
      }
      setActiveGuidedStepId(selection.nextStepId);
      onDiagnostic?.('steps.step.change', selection.diagnostic);
    },
    [
      activeGuidedStepId,
      guidedForwardNavigationBlocked,
      guidedDefaultForwardGate,
      guidedEnabled,
      guidedStepIds,
      guidedStepsCfg,
      maxReachableGuidedIndex,
      dedupNavigationBlocked,
      onDiagnostic
    ]
  );

  const advanceGuidedStepFromCurrentStep = useCallback(
    async (args: { trigger: 'submitNext' | 'stepBar'; targetStepId?: string }): Promise<boolean> => {
      if (!guidedEnabled || !guidedStepsCfg || !guidedStepIds.length) return false;

      const steps = guidedVisibleSteps;
      const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
      const forwardGate = resolveGuidedStepForwardGate(stepCfg, guidedDefaultForwardGate);
      const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
      const waitDialog = (stepCfg?.navigation?.waitForUploadsDialog || guidedStepsCfg?.waitForUploadsDialog || null) as any;
      const nextId = guidedStepIds[activeGuidedStepIndex + 1];
      if (!nextId) return false;

      if (guidedAutoAdvanceTimerRef.current) {
        globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
        guidedAutoAdvanceTimerRef.current = null;
      }
      guidedAutoAdvanceStateRef.current = { stepId: activeGuidedStepId, lastSatisfied: true, armed: false };

      const stepDefinition = buildGuidedStepDefinition(activeGuidedStepId) || definition;
      const validationValues = valuesRef.current;
      const validationLineItems = lineItemsRef.current;

      if (forwardGate === 'whenComplete' && !stepStatus?.complete) {
        const nextErrors = validateForm({
          definition: stepDefinition,
          language,
          values: validationValues,
          lineItems: validationLineItems,
          collapsedRows,
          collapsedSubgroups,
          requiredMode: 'stepComplete',
          virtualState: guidedVirtualState
        });
        setErrors(nextErrors);
        const errorCount = Object.keys(nextErrors).length;
        onDiagnostic?.('steps.gate.blocked', {
          stepId: activeGuidedStepId,
          gate: forwardGate,
          errorCount,
          requiredMode: 'stepComplete',
          trigger: args.trigger
        });
        if (errorCount) {
          requestValidationNavigation({ scope: 'guidedStep' });
          return false;
        }
        const firstTarget = (Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [])
          .concat(Array.isArray(stepCfg?.include) ? stepCfg.include : [])
          .find(
            (t: any) =>
              t && typeof t === 'object' && (t.kind || '').toString() === 'question' && (t.id || '').toString().trim()
          );
        if (firstTarget?.id) {
          setPendingScrollAnchor(firstTarget.id.toString());
        }
        return false;
      }

      const nextErrors = validateForm({
        definition: stepDefinition,
        language,
        values: validationValues,
        lineItems: validationLineItems,
        collapsedRows,
        collapsedSubgroups,
        virtualState: guidedVirtualState
      });
      setErrors(nextErrors);
      if (forwardGate !== 'whenComplete' && Object.keys(nextErrors).length) {
        onDiagnostic?.('steps.gate.blocked', {
          stepId: activeGuidedStepId,
          gate: forwardGate,
          errorCount: Object.keys(nextErrors).length,
          requiredMode: 'configured',
          trigger: args.trigger
        });
        requestValidationNavigation({ scope: 'guidedStep' });
        return false;
      }

      const milestoneAction = stepCfg?.navigation?.milestoneAction;
      if (milestoneAction && onGuidedStepMilestone) {
        const validationScope = (milestoneAction?.validationScope || 'currentStep') as
          | 'currentStep'
          | 'throughCurrentStep'
          | 'fullForm';
        if (validationScope !== 'currentStep') {
          const scopeResult = validateGuidedStepScope({
            scope: validationScope,
            stepId: activeGuidedStepId,
            stepIndex: activeGuidedStepIndex
          });
          setErrors(scopeResult.errors);
          if (Object.keys(scopeResult.errors).length) {
            const targetStepId = scopeResult.firstInvalidStepId || activeGuidedStepId;
            onDiagnostic?.('steps.gate.blocked', {
              stepId: targetStepId,
              gate: validationScope,
              errorCount: Object.keys(scopeResult.errors).length,
              requiredMode: 'configured',
              trigger: args.trigger
            });
            if (targetStepId && targetStepId !== activeGuidedStepId) {
              selectGuidedStep(targetStepId, 'user');
            }
            requestValidationNavigation({ scope: validationScope });
            return false;
          }
        }
        onDiagnostic?.('steps.step.milestone.begin', {
          stepId: activeGuidedStepId,
          type: milestoneAction?.type || null,
          actionCount: Array.isArray(milestoneAction?.actions) ? milestoneAction.actions.length : 0,
          nextStepId: nextId || null,
          validationScope,
          trigger: args.trigger,
          requestedStepId: args.targetStepId || null
        });
        const result = await onGuidedStepMilestone({
          stepId: activeGuidedStepId || '',
          action: milestoneAction,
          nextStepId: nextId || undefined
        });
        if (!result?.success) {
          onDiagnostic?.('steps.step.milestone.failed', {
            stepId: activeGuidedStepId,
            message: result?.message || null,
            trigger: args.trigger
          });
          return false;
        }
        const shouldAdvance = result?.advanceToNext !== false && (milestoneAction?.advanceAfterStart ?? true) !== false;
        if (nextId && shouldAdvance) {
          setErrors({});
          onDiagnostic?.('steps.step.change', {
            from: activeGuidedStepId,
            to: nextId,
            reason: args.trigger === 'stepBar' ? 'milestoneAction.stepBar' : 'milestoneAction'
          });
          selectGuidedStep(nextId, 'user');
          return true;
        }
        return false;
      }

      if (onBeforeGuidedStepAdvance) {
        const outcome = await onBeforeGuidedStepAdvance({
          stepId: activeGuidedStepId || '',
          nextStepId: nextId || undefined,
          stepIndex: activeGuidedStepIndex,
          nextStepIndex: activeGuidedStepIndex + 1,
          trigger: 'next',
          waitDialog,
          queueBackgroundReservationSync: shouldQueueBackgroundReservationSyncOnAdvance(stepCfg?.navigation || null)
        });
        if (!outcome?.success) {
          onDiagnostic?.('steps.step.advance.blocked', {
            from: activeGuidedStepId,
            to: nextId,
            reason: args.trigger,
            message: outcome?.message || null
          });
          return false;
        }
      }

      setErrors({});
      onDiagnostic?.('steps.step.change', {
        from: activeGuidedStepId,
        to: nextId,
        reason: args.trigger === 'stepBar' ? 'stepBarNext' : 'submitNext'
      });
      selectGuidedStep(nextId, 'user');
      return true;
    },
    [
      activeGuidedStepId,
      activeGuidedStepIndex,
      buildGuidedStepDefinition,
      collapsedRows,
      collapsedSubgroups,
      definition,
      guidedDefaultForwardGate,
      guidedEnabled,
      guidedStepIds,
      guidedStatus.steps,
      guidedStepsCfg,
      guidedVirtualState,
      guidedVisibleSteps,
      language,
      lineItemsRef,
      onBeforeGuidedStepAdvance,
      onDiagnostic,
      onGuidedStepMilestone,
      requestValidationNavigation,
      setPendingScrollAnchor,
      setErrors,
      selectGuidedStep,
      validateGuidedStepScope,
      valuesRef
    ]
  );

  const handleGuidedStepSelect = useCallback(
    async (targetStepId: string) => {
      if (!guidedEnabled) return;
      const targetId = (targetStepId || '').toString().trim();
      if (!targetId) return;
      const currentIdx = guidedStepIds.indexOf(activeGuidedStepId);
      const targetIdx = guidedStepIds.indexOf(targetId);
      const targetStepCfg = guidedVisibleSteps.find(step => (step?.id || '').toString().trim() === targetId) as any;
      if (currentIdx < 0 || targetIdx < 0 || targetIdx <= currentIdx) {
        selectGuidedStep(targetId, 'user');
        return;
      }
      if (!isGuidedStepBarAccessAllowed(targetStepCfg, guidedStepVisibilityCtx)) {
        onDiagnostic?.('steps.step.blocked', {
          from: activeGuidedStepId,
          to: targetId,
          gate: 'stepBarAccessWhen',
          reason: 'stepBarAccessWhen=false'
        });
        return;
      }

      const stepCfg = (guidedVisibleSteps[activeGuidedStepIndex] || null) as any;
      if (!stepCfg?.navigation?.milestoneAction) {
        if (onBeforeGuidedStepAdvance) {
          const waitDialog = (stepCfg?.navigation?.waitForUploadsDialog || guidedStepsCfg?.waitForUploadsDialog || null) as any;
          const outcome = await onBeforeGuidedStepAdvance({
            stepId: activeGuidedStepId || '',
            nextStepId: targetId,
            stepIndex: currentIdx,
            nextStepIndex: targetIdx,
            trigger: 'next',
            waitDialog,
            queueBackgroundReservationSync: false
          });
          if (!outcome?.success) {
            onDiagnostic?.('steps.step.advance.blocked', {
              from: activeGuidedStepId,
              to: targetId,
              reason: 'stepBar',
              message: outcome?.message || null
            });
            return;
          }
        }
        selectGuidedStep(targetId, 'user');
        return;
      }

      void advanceGuidedStepFromCurrentStep({
        trigger: 'stepBar',
        targetStepId: targetId
      });
    },
    [
      activeGuidedStepId,
      activeGuidedStepIndex,
      advanceGuidedStepFromCurrentStep,
      guidedEnabled,
      guidedStepIds,
      guidedStepsCfg,
      guidedStepVisibilityCtx,
      guidedVisibleSteps,
      onBeforeGuidedStepAdvance,
      onDiagnostic,
      selectGuidedStep
    ]
  );

  // Auto-advance (default: onValid) while avoiding jumps mid-typing.
  useEffect(() => {
    if (!guidedEnabled) return;
    if (!guidedStepIds.length) return;
    if (!guidedStepsCfg) return;
    if (activeGuidedStepIndex >= guidedStepIds.length - 1) return;

    const stepCfg = guidedVisibleSteps.find(s => (s?.id || '').toString() === activeGuidedStepId) as any;
    const forwardGate = resolveGuidedStepForwardGate(stepCfg, guidedDefaultForwardGate);
    const waitDialog = (stepCfg?.navigation?.waitForUploadsDialog || guidedStepsCfg?.waitForUploadsDialog || null) as any;
    const autoAdvance = resolveGuidedStepAutoAdvance(
      stepCfg,
      (guidedStepsCfg as any)?.defaultAutoAdvance,
      guidedDefaultAutoAdvance
    );
    const autoAdvanceWhen = (stepCfg?.navigation?.autoAdvanceWhen || null) as any;
    const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
    const satisfiedBase = autoAdvance === 'onValid' ? !!stepStatus?.valid : !!stepStatus?.complete;
    const autoAdvanceConditionMatched = isGuidedStepAutoAdvanceAllowed({
      when: autoAdvanceWhen,
      values,
      lineItems,
      recordMeta,
      guidedVirtualState
    });
    const satisfied = satisfiedBase && autoAdvanceConditionMatched;
    const nextId = guidedStepIds[activeGuidedStepIndex + 1];
    const transition = resolveGuidedAutoAdvanceTransitionAction({
      activeStepId: activeGuidedStepId,
      nextStepId: nextId || null,
      currentState: guidedAutoAdvanceStateRef.current,
      autoAdvance,
      satisfied,
      nextReachable: maxReachableGuidedIndex >= activeGuidedStepIndex + 1,
      forwardGate,
      conditionConfigured: Boolean(autoAdvanceWhen),
      conditionMatched: autoAdvanceConditionMatched
    });

    guidedAutoAdvanceStateRef.current = transition.nextState;
    if (transition.clearAttempt) {
      guidedAutoAdvanceAttemptRef.current = null;
    }
    if (transition.clearTimer && guidedAutoAdvanceTimerRef.current) {
      globalThis.clearTimeout(guidedAutoAdvanceTimerRef.current);
      guidedAutoAdvanceTimerRef.current = null;
    }
    if (transition.diagnostic) {
      const eventName =
        transition.diagnostic.reason === 'stepChangeAlreadySatisfied'
          ? 'steps.step.autoAdvance.skipImmediate'
          : 'steps.step.autoAdvance.armed';
      onDiagnostic?.(eventName, transition.diagnostic);
    }
    if (transition.action !== 'schedule') return;

    let deferLogged = false;
    const attemptAdvance = async () => {
      guidedAutoAdvanceTimerRef.current = null;
      const nextId = guidedStepIds[activeGuidedStepIndex + 1];
      if (!nextId) return;

      // If the user is actively editing inside the step, keep waiting (do not steal focus).
      try {
        const focusDeferral = resolveGuidedAutoAdvanceFocusDeferralAction({
          activeElement: typeof document !== 'undefined' ? document.activeElement : null,
          stepBodyElement: guidedStepBodyRef.current
        });
        if (focusDeferral.shouldDefer) {
          if (!deferLogged) {
            onDiagnostic?.('steps.step.autoAdvance.defer', {
              from: activeGuidedStepId,
              to: nextId,
              mode: autoAdvance,
              tag: focusDeferral.tag,
              inputType: focusDeferral.inputType
            });
            deferLogged = true;
          }
          guidedAutoAdvanceTimerRef.current = globalThis.setTimeout(attemptAdvance, 220);
          return;
        }
      } catch {
        // ignore focus detection failures
      }

      if (onBeforeGuidedStepAdvance) {
        const outcome = await onBeforeGuidedStepAdvance({
          stepId: activeGuidedStepId || '',
          nextStepId: nextId || undefined,
          stepIndex: activeGuidedStepIndex,
          nextStepIndex: activeGuidedStepIndex + 1,
          trigger: 'auto',
          waitDialog,
          queueBackgroundReservationSync: shouldQueueBackgroundReservationSyncOnAdvance(stepCfg?.navigation || null)
        });
        if (!outcome?.success) {
          onDiagnostic?.('steps.step.autoAdvance.blocked', {
            from: activeGuidedStepId,
            to: nextId,
            gate: forwardGate,
            mode: autoAdvance,
            message: outcome?.message || null,
            conditionConfigured: Boolean(autoAdvanceWhen),
            conditionMatched: autoAdvanceConditionMatched
          });
          return;
        }
      }

      // Disarm for this satisfaction cycle and advance.
      const st = guidedAutoAdvanceStateRef.current;
      if (st && st.stepId === activeGuidedStepId) {
        guidedAutoAdvanceStateRef.current = { ...st, armed: false };
      }

      onDiagnostic?.('steps.step.autoAdvance', {
        from: activeGuidedStepId,
        to: nextId,
        gate: forwardGate,
        mode: autoAdvance,
        conditionConfigured: Boolean(autoAdvanceWhen),
        conditionMatched: autoAdvanceConditionMatched
      });
      selectGuidedStep(nextId, 'auto');
    };

    guidedAutoAdvanceAttemptRef.current = () => {
      void attemptAdvance();
    };
    guidedAutoAdvanceTimerRef.current = globalThis.setTimeout(() => {
      void attemptAdvance();
    }, 220);

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
    guidedVirtualState,
    guidedStepIds,
    guidedStatus.steps,
    guidedVisibleSteps,
    guidedStepsCfg,
    lineItems,
    maxReachableGuidedIndex,
    onDiagnostic,
    onBeforeGuidedStepAdvance,
    recordMeta,
    selectGuidedStep,
    values
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
      } catch {
        // ignore
      }
    };
    try {
      if (typeof document === 'undefined') return;
      document.addEventListener('focusout', handler, true);
      return () => {
        document.removeEventListener('focusout', handler, true);
      };
    } catch {
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
      const isGuidedFinalStep = guidedEnabled && guidedStepIds.length && activeGuidedStepIndex >= guidedStepIds.length - 1;

      // In guided steps, the bottom "Submit" action behaves like "Next" until the final step.
      // It should validate only the current step's visible targets (not the full form).
      if (guidedEnabled && guidedStepsCfg && guidedStepIds.length && !isGuidedFinalStep && !forceFinalSubmit) {
        void advanceGuidedStepFromCurrentStep({ trigger: 'submitNext' });
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
      } catch {
        // ignore
      }
      requestValidationNavigation();
      const submitCtx: {
        collapsedRows: Record<string, boolean>;
        collapsedSubgroups: Record<string, boolean>;
        validationDefinition?: WebFormDefinition;
        validationVirtualState?: GuidedStepsVirtualState | null;
      } = { collapsedRows, collapsedSubgroups };
      if (guidedEnabled && guidedStepIds.length) {
        const stepDefinition = buildGuidedStepDefinition(activeGuidedStepId);
        if (stepDefinition) {
          submitCtx.validationDefinition = stepDefinition;
          submitCtx.validationVirtualState = guidedVirtualState;
        }
      }
      void onSubmit(submitCtx).catch((err: any) => {
        onDiagnostic?.('submit.exception', { message: err?.message || err || 'unknown' });
      });
    };
    return () => {
      submitActionRef.current = null;
    };
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    advanceGuidedStepFromCurrentStep,
    buildGuidedStepDefinition,
    collapsedRows,
    collapsedSubgroups,
    definition,
    guidedDefaultForwardGate,
    guidedEnabled,
    guidedStepIds,
    guidedVirtualState,
    guidedVisibleSteps,
    guidedStepsCfg,
    language,
    lineItems,
    onDiagnostic,
    onSubmit,
    onGuidedStepMilestone,
    requestValidationNavigation,
    selectGuidedStep,
    summarySubmitIntentRef,
    submitActionRef,
    submitting,
    validateGuidedStepScope,
    values
  ]);

  useEffect(() => {
    if (!guidedBackActionRef) return;
    guidedBackActionRef.current = () => {
      const backAction = resolveGuidedBackAction({
        enabled: guidedEnabled,
        stepsConfig: guidedStepsCfg,
        stepIds: guidedStepIds,
        visibleSteps: guidedVisibleSteps,
        activeStepId: activeGuidedStepId,
        activeStepIndex: activeGuidedStepIndex
      });
      if (backAction.action === 'none') return;
      if (backAction.action === 'blocked') {
        onDiagnostic?.('steps.step.blocked', backAction.diagnostic);
        return;
      }
      selectGuidedStep(backAction.previousStepId, 'user');
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
    guidedVisibleSteps,
    guidedStepsCfg,
    onDiagnostic,
    selectGuidedStep
  ]);

  useEffect(() => {
    if (!onGuidedUiChange) return;
    onGuidedUiChange(
      resolveGuidedUiStateAction({
        enabled: guidedEnabled,
        stepsConfig: guidedStepsCfg,
        stepIds: guidedStepIds,
        visibleSteps: guidedVisibleSteps,
        activeStepId: activeGuidedStepId,
        activeStepIndex: activeGuidedStepIndex,
        statuses: guidedStatus.steps,
        defaultForwardGate: guidedDefaultForwardGate,
        dedupNavigationBlocked,
        language
      })
    );
  }, [
    activeGuidedStepId,
    activeGuidedStepIndex,
    dedupNavigationBlocked,
    guidedDefaultForwardGate,
    guidedEnabled,
    guidedStatus.steps,
    guidedStepIds,
    guidedVisibleSteps,
    guidedStepsCfg,
    language,
    onGuidedUiChange
  ]);

  const hasBlurDerived = useMemo(() => hasDefinitionBlurDerivedValues(definition), [definition]);

  const blurDerivedDependencyIds = useMemo(
    () => collectDefinitionBlurDerivedDependencyIds(definition),
    [definition]
  );

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

  const recomputeDerivedOnBlur = useCallback(
    (meta?: { fieldPath?: string; tag?: string }) => {
      if (!hasBlurDerived) return;
      const currentValues = valuesRef.current;
      const currentLineItems = lineItemsRef.current;
      const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, currentValues, currentLineItems, {
        mode: 'blur'
      });

      const changedFields = diffFormValues(currentValues, nextValues);
      const lineChanged = !areLineItemsShallowEqual(currentLineItems, nextLineItems);
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
    [
      definition,
      hasBlurDerived,
      lineItemsRef,
      onDiagnostic,
      runSelectionEffectsForAncestorRows,
      setLineItems,
      setValues,
      valuesRef
    ]
  );

  const buildLineItemGroupOverlayValidationDefinition = useCallback((): WebFormDefinition | null => {
    return buildLineItemGroupOverlayValidationDefinitionAction({
      definition,
      overlay: lineItemGroupOverlay
    });
  }, [definition, lineItemGroupOverlay]);

  const buildSubgroupOverlayValidationDefinition = useCallback((): WebFormDefinition | null => {
    return buildSubgroupOverlayValidationDefinitionAction({
      definition,
      overlay: subgroupOverlay
    });
  }, [definition, subgroupOverlay]);

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
          const steps = guidedVisibleSteps;
          const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
          const gate = resolveGuidedStepForwardGate(stepCfg, guidedDefaultForwardGate);
          return gate === 'whenComplete' ? 'stepComplete' : 'configured';
        })();
        const nextErrors = validateForm({
          definition: validationDefinition,
          language,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          collapsedRows: collapsedRowsRef.current,
          collapsedSubgroups: collapsedSubgroupsRef.current,
          requiredMode,
          virtualState: guidedVirtualState
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
            const validationGroup = validationDefinition.questions.find(
              q => q.id === groupId && q.type === 'LINE_ITEM_GROUP'
            ) as WebQuestionDefinition | undefined;
            Object.keys(prev).forEach(key => {
              if (key.startsWith(rowPrefix) && key.endsWith(rowSuffix) && !nextRowKeySet.has(key)) {
                if (
                  shouldPreserveLineItemDedupError({
                    groupConfig: validationGroup?.lineItemConfig,
                    language,
                    message: prev[key]
                  })
                ) {
                  return;
                }
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
      collapsedRowsRef,
      collapsedSubgroupsRef,
      definition,
      guidedDefaultForwardGate,
      guidedEnabled,
      guidedStepsCfg,
      guidedVirtualState,
      guidedVisibleSteps,
      language,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      lineItemsRef,
      onDiagnostic,
      setErrors,
      subgroupOverlay.open,
      subgroupOverlay.subKey,
      valuesRef
    ]
  );

  const groupSections = useMemo(() => buildFormGroupSections(definition.questions, language), [definition.questions, language]);

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

  const matchesOverlayRowFilter = useCallback((rowValues: Record<string, FieldValue>, filter?: any): boolean => {
    if (!filter) return true;
    const includeWhen = (filter as any)?.includeWhen;
    const excludeWhen = (filter as any)?.excludeWhen;
    const rowCtx: VisibilityContext = { getValue: fid => (rowValues as any)[fid] };
    const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
    const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
    return includeOk && !excludeMatch;
  }, []);

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
    [lineItemGroupOverlay, matchesOverlayRowFilter, onDiagnostic, subgroupOverlay]
  );

  useFormBlurCoordinator({
    hasBlurDerived,
    blurDerivedDependencyIds,
    onDiagnostic,
    onUserEdit,
    recomputeDerivedOnBlur,
    validateErrorsOnBlur,
    blurRecomputeTimerRef,
    overlayDetailBlurTimerRef,
    paragraphDisclaimerTimerRef,
    paragraphDisclaimerPendingRef,
    paragraphDisclaimerSyncRef,
    resolveLineItemGroupForKey,
    lineItemsRef,
    valuesRef,
    attemptOverlayDetailAutoOpen
  });

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
      scrollFormGroupToTop({
        groupKey,
        args,
        animationRafRef: groupScrollAnimRafRef,
        onDiagnostic
      });
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

  const renderChoiceControl = useChoiceControlRenderer({ language, onDiagnostic });

  const closeSubgroupOverlay = useCallback(() => {
    if (overlay.open) {
      setOverlay({ open: false, options: [], selected: [] });
    }
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
  }, [onDiagnostic, overlay.open, setOverlay]);

	  const attemptCloseSubgroupOverlay = useCallback(
    (source: 'button' | 'escape') => {
      if (!subgroupOverlay.open) return;
      const subgroupSessionEnabled = subgroupOverlay.overlaySession?.enabled === true;
      if (subgroupSessionEnabled) {
        const subgroupKey = (subgroupOverlay.subKey || '').toString();
        const restored = restoreOverlaySessionSnapshot({
          kind: 'subgroup',
          targetKey: subgroupKey,
          errorGroupKey: subgroupKey
        });
        closeSubgroupOverlay();
        onDiagnostic?.('subgroup.overlay.session.cancel', {
          source,
          subgroupKey,
          restored
        });
        return;
      }
      const subgroupKey = (subgroupOverlay.subKey || '').toString();
      const subgroupInfo = subgroupKey ? parseSubgroupKey(subgroupKey) : null;
      const subgroupParentGroupKey = (subgroupInfo?.parentGroupKey || '').toString();
      const subgroupParentGroupId = (() => {
        if (!subgroupParentGroupKey) return '';
        const tokens = subgroupParentGroupKey.split('::').filter(Boolean);
        return (tokens[tokens.length - 1] || '').toString();
      })();
      const subgroupParentRowId = (subgroupInfo?.parentRowId || '').toString();
      const isPartDishIngredientsOverlay =
        subgroupParentGroupId === 'MP_TYPE_LI' && (subgroupInfo?.subGroupId || '').toString() === 'MP_INGREDIENTS_LI';
      const rowsInOverlay = (() => {
        if (!subgroupKey) return [];
        const rowsAll = lineItemsRef.current[subgroupKey] || [];
        if (!rowsAll.length) return [];
        const overlayRowFilter = (subgroupOverlay as any)?.rowFilter;
        const filtered = overlayRowFilter
          ? rowsAll.filter((row: any) => {
              const rowValues = (row?.values || {}) as any;
              const includeWhen = (overlayRowFilter as any)?.includeWhen;
              const excludeWhen = (overlayRowFilter as any)?.excludeWhen;
              const rowCtx: VisibilityContext = { getValue: fid => (rowValues as any)[fid] };
              const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
              const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
              return includeOk && !excludeMatch;
            })
          : rowsAll;
        return filtered;
      })();
      const removeLineRowByCascade = (groupId: string, rowId: string) => {
        if (!groupId || !rowId) return;
        const prevLineItems = lineItemsRef.current || {};
        const groupQuestion = definition.questions.find(q => (q?.id || '').toString() === groupId);
        const targetRow = (prevLineItems[groupId] || []).find((r: any) => (r?.id || '').toString() === rowId);
        if (onSelectionEffect && groupQuestion && targetRow) {
          const effectFields = ((groupQuestion as any).lineItemConfig?.fields || []).filter(
            (field: any) => Array.isArray(field?.selectionEffects) && field.selectionEffects.length
          );
          effectFields.forEach((field: any) => {
            const contextId = buildLineContextId(groupId, rowId, (field?.id || '').toString());
            onSelectionEffect(field as WebQuestionDefinition, null, {
              contextId,
              lineItem: { groupId, rowId, rowValues: (targetRow as any)?.values || {} },
              forceContextReset: true
            });
          });
        }
        const cascade = cascadeRemoveLineItemRows({ lineItems: prevLineItems, roots: [{ groupId, rowId }] });
        const marked = markRecipeIngredientsDirtyForGroupKey(cascade.lineItems, groupId);
        const nextLineItemsSeeded = marked.lineItems;
        if (cascade.removedSubgroupKeys.length) {
          setSubgroupSelectors(prevSel => {
            const nextSel = { ...prevSel };
            cascade.removedSubgroupKeys.forEach(key => {
              delete (nextSel as any)[key];
            });
            return nextSel;
          });
        }
        const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(
          definition,
          (valuesRef.current || {}) as Record<string, FieldValue>,
          nextLineItemsSeeded,
          { mode: 'init' }
        );
        setValues(nextValues);
        setLineItems(recomputed);
        runSelectionEffectsForAncestorRows(groupId, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
      };
      if (source === 'button' && isPartDishIngredientsOverlay && rowsInOverlay.length === 0) {
        const parentGroupKey = subgroupParentGroupKey || (subgroupInfo?.parentGroupId || '').toString();
        const parentRowId = (subgroupInfo?.parentRowId || '').toString();
        removeLineRowByCascade(parentGroupKey, parentRowId);
        const hadOverlayStack = overlayStackRef.current.length > 0;
        closeSubgroupOverlay();
        onDiagnostic?.('subgroup.overlay.close.partDish.discardEmpty', {
          source,
          subgroupKey,
          parentGroupKey,
          parentRowId,
          restoredOverlay: hadOverlayStack
        });
        return;
      }
      if (overlayStackRef.current.length) {
        closeSubgroupOverlay();
        return;
      }
      const validationDefinition = buildSubgroupOverlayValidationDefinition();
      const nextErrors = validationDefinition
        ? validateForm({
            definition: validationDefinition,
            language,
            values,
            lineItems,
            collapsedRows,
            collapsedSubgroups,
            virtualState: guidedVirtualState
          })
        : {};
      const errorKeys = Object.keys(nextErrors);
      const hasErrors = errorKeys.length > 0;

      if (subgroupKey && hasErrors) {
        setErrors(prev => mergeLineItemGroupErrors(prev, subgroupKey, nextErrors));
      }
      const overlayCloseCtx: VisibilityContext = {
        getValue: fid => (valuesRef.current as any)[fid],
        getLineValue: (_rowId: string, fid: string) => (valuesRef.current as any)[fid],
        getLineItems: groupId => lineItemsRef.current[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItemsRef.current || {})
      };
      const scope = resolveOverlayCloseVisibilityScope({
        overlayGroupId: subgroupKey,
        detailSelectionGroupId: overlayDetailSelection?.groupId,
        detailSelectionRowId: overlayDetailSelection?.rowId
      });
      const firstErrorLabel = (() => {
        if (!hasErrors) return '';
        const firstKey = errorKeys[0] || '';
        const parts = firstKey.split('__');
        if (parts.length !== 3) return '';
        const groupKey = parts[0] || '';
        const fieldId = parts[1] || '';
        if (!groupKey || !fieldId) return '';
        const group = resolveLineItemGroupForKey(groupKey);
        const fields = (group?.lineItemConfig as any)?.fields || [];
        const field = Array.isArray(fields) ? fields.find((entry: any) => (entry?.id || '').toString() === fieldId) : null;
        return resolveFieldLabel(field, language, fieldId);
      })();
      const confirmResolved = resolveOverlayCloseConfirm({
        closeConfirm: subgroupOverlay.closeConfirm,
        ctx: overlayCloseCtx,
        scope
      });
      const shouldBypassPendingIngredientsClose = (() => {
        if (!confirmResolved || hasErrors || !scope?.rowId || !scope?.linePrefix) return false;
        if (overlayDetailSelection?.mode !== 'view') return false;
        const title = resolveLocalizedString(confirmResolved.confirm.title, language, '');
        if (!title.toString().trim().toLowerCase().includes('missing ingredients')) return false;
        const subgroupDefs = resolveSubgroupDefs(scope.linePrefix);
        const overlayDetailSubId = ((subgroupDefs.sub as any)?.ui?.overlayDetail?.body?.subGroupId || '').toString().trim();
        if (!overlayDetailSubId) return false;
        const activeRows = lineItemsRef.current[scope.linePrefix] || [];
        const activeRow = activeRows.find((row: any) => (row?.id || '').toString() === scope.rowId);
        const activeValues = ((activeRow as any)?.values || {}) as Record<string, FieldValue>;
        const hasSourceSelection = Boolean(
          (activeValues.RECIPE_SOURCE_ID || '').toString().trim() ||
            (activeValues.RECIPE || '').toString().trim()
        );
        if (!hasSourceSelection) return false;
        const childKey = buildSubgroupKey(scope.linePrefix, scope.rowId, overlayDetailSubId);
        const childRows = lineItemsRef.current[childKey] || [];
        return childRows.length === 0;
      })();
      if (shouldBypassPendingIngredientsClose) {
        closeSubgroupOverlay();
        setErrors(prev => clearLineItemGroupErrors(prev, subgroupKey));
        onDiagnostic?.('subgroup.overlay.close.allowed', {
          source,
          subgroupKey,
          hadErrors: false,
          confirmShown: false,
          reason: 'pendingRecipeIngredients'
        });
        return;
      }
      const allowCloseFromEdit = getOverlayCloseAllowCloseFromEdit(subgroupOverlay.closeConfirm);
      if (source === 'button' && !allowCloseFromEdit && !hasErrors) {
        closeSubgroupOverlay();
        setErrors(prev => clearLineItemGroupErrors(prev, subgroupKey));
        onDiagnostic?.('subgroup.overlay.close.allowed', {
          source,
          subgroupKey,
          hadErrors: false,
          confirmShown: false
        });
        return;
      }
      if (confirmResolved && openConfirmDialogResolved) {
        const confirm = confirmResolved.confirm;
        const title = resolveOptionalLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const baseMessage = resolveLocalizedString(confirm.body, language, '');
        const hint = confirmResolved.highlightFirstError && firstErrorLabel ? ` First issue: ${firstErrorLabel}.` : '';
        const message = `${baseMessage || ''}${hint}`.trim();
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
          onConfirm: () => {
            if (subgroupParentGroupKey && subgroupParentRowId && confirmResolved.onConfirmEffects.length) {
              const currentLineItems = lineItemsRef.current || {};
              const currentValues = ((valuesRef.current || {}) as Record<string, FieldValue>) || {};
              const deleteScope = resolveOverlayCloseDeleteScope({
                overlayGroupId: subgroupParentGroupKey,
                overlayRowId: subgroupParentRowId,
                detailSelectionGroupId: overlayDetailSelection?.groupId,
                detailSelectionRowId: overlayDetailSelection?.rowId
              });
              const deletePlan = resolveOverlayCloseDeletePlan({
                effects: confirmResolved.onConfirmEffects,
                overlayGroupId: deleteScope.overlayGroupId,
                overlayRowId: deleteScope.overlayRowId,
                topValues: currentValues,
                lineItems: currentLineItems
              });
              if (deletePlan.length) {
                const removedRoots = deletePlan.flatMap(entry =>
                  (entry.rowIds || []).map(rowId => ({
                    groupId: (entry.groupKey || '').toString(),
                    rowId: (rowId || '').toString()
                  }))
                );
                if (onSelectionEffect) {
                  removedRoots.forEach(root => {
                    if (!root.groupId || !root.rowId) return;
                    const groupQuestion = resolveLineItemGroupForKey(root.groupId);
                    const rows = currentLineItems[root.groupId] || [];
                    const targetRow = rows.find(r => r.id === root.rowId);
                    if (!groupQuestion || !targetRow) return;
                    const effectFields = ((groupQuestion.lineItemConfig?.fields || []) as any[]).filter(
                      field => Array.isArray((field as any)?.selectionEffects) && (field as any).selectionEffects.length
                    );
                    effectFields.forEach(field => {
                      const contextId = buildLineContextId(groupQuestion.id, targetRow.id, field.id);
                      onSelectionEffect(field as unknown as WebQuestionDefinition, null, {
                        contextId,
                        lineItem: { groupId: groupQuestion.id, rowId: targetRow.id, rowValues: targetRow.values },
                        forceContextReset: true
                      });
                    });
                  });
                }
                const nextState = applyOverlayCloseDeletePlan({
                  definition,
                  deletePlan,
                  topValues: currentValues,
                  lineItems: currentLineItems
                });
                if (nextState.removedSubgroupKeys.length) {
                  setSubgroupSelectors(prevSel => {
                    const nextSel = { ...prevSel };
                    nextState.removedSubgroupKeys.forEach(key => {
                      delete (nextSel as any)[key];
                    });
                    return nextSel;
                  });
                }
                setValues(nextState.values);
                setLineItems(nextState.lineItems);
                valuesRef.current = nextState.values;
                lineItemsRef.current = nextState.lineItems;
                const deletedByGroup = new Map<string, Set<string>>();
                nextState.removed.forEach(entry => {
                  const groupId = (entry.groupId || '').toString();
                  const rowId = (entry.rowId || '').toString();
                  if (!groupId || !rowId) return;
                  const existing = deletedByGroup.get(groupId) || new Set<string>();
                  existing.add(rowId);
                  deletedByGroup.set(groupId, existing);
                });
                setErrors(prev => {
                  let changed = false;
                  const next: FormErrors = {};
                  Object.entries(prev || {}).forEach(([key, val]) => {
                    const parts = key.split('__');
                    if (parts.length === 3) {
                      const groupId = parts[0];
                      const rowId = parts[2];
                      const deleted = deletedByGroup.get(groupId);
                      if (deleted && deleted.has(rowId)) {
                        changed = true;
                        return;
                      }
                    }
                    next[key] = val;
                  });
                  return changed ? next : prev;
                });
                nextState.dirtyGroups.forEach(entry => {
                  onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
                    groupId: entry.groupId,
                    parentGroupKey: entry.parentGroupKey || null,
                    parentRowId: entry.parentRowId || null,
                    reason: 'overlayCloseDelete'
                  });
                });
                Array.from(new Set(removedRoots.map(root => root.groupId).filter(Boolean))).forEach(groupId => {
                  runSelectionEffectsForAncestorRows(groupId, currentLineItems, nextState.lineItems, {
                    mode: 'init',
                    topValues: nextState.values
                  });
                });
                onDiagnostic?.('subgroup.overlay.close.effects.deleteLineItems', {
                  subgroupKey,
                  deleteGroups: deletePlan.map(entry => ({ groupKey: entry.groupKey, count: entry.rowIds.length }))
                });
              }
            }
            if (subgroupKey && (confirmResolved.validateOnReopen || hasErrors)) {
              overlayCloseValidateOnOpenRef.current[subgroupKey] = true;
            }
            closeSubgroupOverlay();
            if (!hasErrors) {
              setErrors(prev => clearLineItemGroupErrors(prev, subgroupKey));
            }
            onDiagnostic?.('subgroup.overlay.close.confirmed', {
              source,
              subgroupKey,
              hadErrors: hasErrors,
              validateOnReopen: confirmResolved.validateOnReopen
            });
          }
        });
        onDiagnostic?.('subgroup.overlay.close.confirm.open', {
          source,
          subgroupKey,
          hadErrors: hasErrors,
          configSource: confirmResolved.source
        });
        return;
      }
      if (subgroupKey && hasErrors) {
        overlayCloseValidateOnOpenRef.current[subgroupKey] = true;
      }
      closeSubgroupOverlay();
      if (!hasErrors) {
        setErrors(prev => clearLineItemGroupErrors(prev, subgroupKey));
      }
      onDiagnostic?.('subgroup.overlay.close.allowed', {
        source,
        subgroupKey,
        hadErrors: hasErrors,
        confirmShown: false
      });
    },
	    [
	      buildSubgroupOverlayValidationDefinition,
	      closeSubgroupOverlay,
	      collapsedRows,
	      collapsedSubgroups,
	      definition,
	      guidedVirtualState,
	      language,
	      lineItems,
	      lineItemsRef,
	      onDiagnostic,
	      onSelectionEffect,
	      openConfirmDialogResolved,
	      overlayDetailSelection?.groupId,
	      overlayDetailSelection?.mode,
	      overlayDetailSelection?.rowId,
	      resolveLineItemGroupForKey,
	      resolveSubgroupDefs,
	      runSelectionEffectsForAncestorRows,
	      setErrors,
	      setLineItems,
	      setSubgroupSelectors,
	      setValues,
	      subgroupOverlay,
	      restoreOverlaySessionSnapshot,
	      values,
	      valuesRef
	    ]
	  );

  const handleLineSelectOverlayBack = useCallback(() => {
    const groupKey = (overlay.groupId || '').toString();
    const subgroupInfo = groupKey ? parseSubgroupKey(groupKey) : null;
    const subgroupParentGroupKey = (subgroupInfo?.parentGroupKey || '').toString();
    const subgroupParentGroupId = (() => {
      if (!subgroupParentGroupKey) return '';
      const tokens = subgroupParentGroupKey.split('::').filter(Boolean);
      return (tokens[tokens.length - 1] || '').toString();
    })();
    const isPartDishIngredientsOverlay =
      subgroupParentGroupId === 'MP_TYPE_LI' && (subgroupInfo?.subGroupId || '').toString() === 'MP_INGREDIENTS_LI';

    setOverlay({ open: false, options: [], selected: [] });
    if (!isPartDishIngredientsOverlay || !groupKey) return;

    const rowsAll = lineItemsRef.current[groupKey] || [];
    const rowFilter =
      subgroupOverlay.open && subgroupOverlay.subKey === groupKey ? subgroupOverlay.rowFilter : null;
    const rowsFiltered = rowFilter
      ? rowsAll.filter((row: any) => {
          const rowValues = (row?.values || {}) as any;
          const includeWhen = (rowFilter as any)?.includeWhen;
          const excludeWhen = (rowFilter as any)?.excludeWhen;
          const rowCtx: VisibilityContext = { getValue: fid => (rowValues as any)[fid] };
          const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
          const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
          return includeOk && !excludeMatch;
        })
      : rowsAll;

    if (rowsFiltered.length > 0) return;

    onDiagnostic?.('lineItems.overlay.back.partDish.discardEmpty', {
      groupKey,
      subgroupParentGroupKey,
      subgroupParentGroupId
    });
    attemptCloseSubgroupOverlay('button');
  }, [
    attemptCloseSubgroupOverlay,
    lineItemsRef,
    onDiagnostic,
    overlay.groupId,
    setOverlay,
    subgroupOverlay.open,
    subgroupOverlay.rowFilter,
    subgroupOverlay.subKey
  ]);

  const closeLineItemGroupOverlay = useCallback(() => {
    if (overlay.open) {
      setOverlay({ open: false, options: [], selected: [] });
    }
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
  }, [onDiagnostic, overlay.open, setOverlay]);

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
        collapsedSubgroups,
        virtualState: guidedVirtualState
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
    guidedVirtualState,
    language,
    lineItemGroupOverlay.groupId,
    lineItems,
    onDiagnostic,
    values
  ]);

  const validateSubgroupOverlay = useCallback((): FormErrors | null => {
    const validationDefinition = buildSubgroupOverlayValidationDefinition();
    if (!validationDefinition) return null;
    try {
      return validateForm({
        definition: validationDefinition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups,
        virtualState: guidedVirtualState
      });
    } catch (err: any) {
      onDiagnostic?.('validation.subgroupOverlay.error', {
        message: err?.message || err || 'unknown',
        groupId: subgroupOverlay.subKey
      });
      return null;
    }
  }, [
    buildSubgroupOverlayValidationDefinition,
    collapsedRows,
    collapsedSubgroups,
    guidedVirtualState,
    language,
    lineItems,
    onDiagnostic,
    subgroupOverlay.subKey,
    values
  ]);

  const validateOverlayDetailGroup = useCallback(
    (detailGroupDef: WebQuestionDefinition): FormErrors => {
      const validationDefinition: WebFormDefinition = {
        ...(definition as any),
        questions: [detailGroupDef]
      } as WebFormDefinition;
      return validateForm({
        definition: validationDefinition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups,
        virtualState: guidedVirtualState
      });
    },
    [collapsedRows, collapsedSubgroups, definition, guidedVirtualState, language, lineItems, values]
  );

  const attemptSaveOverlayDetailEdit = useCallback(
    (args: {
      detailGroupDef: WebQuestionDefinition;
      errorGroupKey: string;
      groupId: string;
      rowId: string;
      detailKey: string;
      canView: boolean;
    }) => {
      const nextErrors = resolveOverlayDetailErrors({
        errorGroupKey: args.errorGroupKey,
        lineOverlayOpen: lineItemGroupOverlay.open,
        lineOverlayGroupId: (lineItemGroupOverlay.groupId || '').toString(),
        subgroupOverlayOpen: subgroupOverlay.open,
        subgroupOverlaySubKey: (subgroupOverlay.subKey || '').toString(),
        lineOverlayErrors: validateLineItemGroupOverlay(),
        subgroupOverlayErrors: validateSubgroupOverlay(),
        fallbackErrors: validateOverlayDetailGroup(args.detailGroupDef)
      });
      const hasErrors = Object.keys(nextErrors).length > 0;

      setErrors(prev =>
        hasErrors ? mergeLineItemGroupErrors(prev, args.errorGroupKey, nextErrors) : clearLineItemGroupErrors(prev, args.errorGroupKey)
      );

      if (hasErrors) {
        onDiagnostic?.('lineItems.overlayDetail.edit.invalid', {
          groupId: args.groupId,
          rowId: args.rowId,
          errorGroupKey: args.errorGroupKey,
          errorCount: Object.keys(nextErrors).length
        });
        return false;
      }

      if (args.canView) {
        setOverlayDetailSelection({ groupId: args.groupId, rowId: args.rowId, mode: 'view' });
        overlayDetailEditSnapshotRef.current = null;
      } else if (overlayDetailEditSnapshotRef.current?.key === args.detailKey) {
        overlayDetailEditSnapshotRef.current = {
          key: args.detailKey,
          values: valuesRef.current,
          lineItems: lineItemsRef.current
        };
      }

      onDiagnostic?.('lineItems.overlayDetail.edit.save', {
        groupId: args.groupId,
        rowId: args.rowId,
        mode: args.canView ? 'view' : 'edit'
      });
      return true;
    },
    [
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      lineItemsRef,
      onDiagnostic,
      setErrors,
      setOverlayDetailSelection,
      subgroupOverlay.open,
      subgroupOverlay.subKey,
      validateLineItemGroupOverlay,
      validateSubgroupOverlay,
      validateOverlayDetailGroup,
      valuesRef
    ]
  );

  const clearSelectionEffectsForRow = useCallback((groupQuestion: WebQuestionDefinition, row: LineItemRowState) => {
    if (!onSelectionEffect) return;
    const effectFields = (groupQuestion.lineItemConfig?.fields || []).filter(
      field => Array.isArray((field as any).selectionEffects) && (field as any).selectionEffects.length
    );
    if (!effectFields.length) return;
    effectFields.forEach(field => {
      const contextId = buildLineContextId(groupQuestion.id, row.id, field.id);
      onSelectionEffect(field as unknown as WebQuestionDefinition, null, {
        contextId,
        lineItem: { groupId: groupQuestion.id, rowId: row.id, rowValues: row.values },
        forceContextReset: true
      });
    });
  }, [onSelectionEffect]);

  const applyOverlaySessionSaveEffects = useCallback(
    (args: { overlayGroupId: string; effects?: RowFlowActionEffect[]; errorGroupKey: string }) => {
      const overlayGroupId = (args.overlayGroupId || '').toString().trim();
      const effects = Array.isArray(args.effects) ? args.effects : [];
      if (!overlayGroupId || !effects.length) return;

      const currentLineItems = lineItemsRef.current || {};
      const currentValues = ((valuesRef.current || {}) as Record<string, FieldValue>) || {};
      const setEffects = effects.filter(
        (effect): effect is Extract<RowFlowActionEffect, { type: 'setValue' }> => effect.type === 'setValue'
      );
      const deletePlan = resolveOverlayCloseDeletePlan({
        effects,
        overlayGroupId,
        topValues: currentValues,
        lineItems: currentLineItems
      });
      if (!deletePlan.length && !setEffects.length) return;

      const overlaySubgroupInfo = parseSubgroupKey(overlayGroupId);
      let nextValues = currentValues;
      let nextLineItems = currentLineItems;
      const dirtyRootGroups = new Set<string>();

      const setTopFieldValue = (fieldId: string, rawValue: any) => {
        const question = definition.questions.find(candidate => candidate.id === fieldId && candidate.type !== 'LINE_ITEM_GROUP') as
          | WebQuestionDefinition
          | undefined;
        const nextValue =
          question
            ? coerceDefaultValue({
                type: (question as any)?.type || 'TEXT',
                raw: rawValue,
                hasAnyOption: Array.isArray((question as any)?.options) && !!(question as any)?.options?.length,
                hasDataSource: !!(question as any)?.dataSource
              })
            : (rawValue as FieldValue);
        if (nextValues[fieldId] === nextValue) return false;
        nextValues = { ...nextValues, [fieldId]: nextValue };
        return true;
      };

      const setParentLineFieldValue = (groupKey: string, rowId: string, fieldId: string, rawValue: any) => {
        if (!groupKey || !rowId || !fieldId) return false;
        const groupQuestion = resolveLineItemGroupForKey(groupKey);
        const field =
          ((groupQuestion?.lineItemConfig?.fields || []) as any[]).find(candidate => candidate?.id === fieldId) ||
          null;
        const nextValue =
          field
            ? coerceDefaultValue({
                type: (field as any)?.type || 'TEXT',
                raw: rawValue,
                hasAnyOption: Array.isArray((field as any)?.options) && !!(field as any)?.options?.length,
                hasDataSource: !!(field as any)?.dataSource
              })
            : (rawValue as FieldValue);
        const rows = (nextLineItems[groupKey] || []) as LineItemRowState[];
        const rowIndex = rows.findIndex(candidate => candidate?.id === rowId);
        if (rowIndex < 0) return false;
        const row = rows[rowIndex];
        if ((row?.values || {})[fieldId] === nextValue) return false;
        const nextRows = rows.slice();
        nextRows[rowIndex] = {
          ...row,
          values: {
            ...(row?.values || {}),
            [fieldId]: nextValue
          }
        };
        nextLineItems = { ...nextLineItems, [groupKey]: nextRows };
        dirtyRootGroups.add((parseSubgroupKey(groupKey)?.rootGroupId || groupKey).toString());
        return true;
      };

      setEffects.forEach(effect => {
        const rawFieldRef = (effect.fieldRef || '').toString().trim();
        if (!rawFieldRef) return;
        const rawValue = Object.prototype.hasOwnProperty.call(effect, 'value') ? effect.value : '';
        const explicitTop = rawFieldRef.startsWith('top.');
        const explicitParent = rawFieldRef.startsWith('parent.');
        const fieldId = rawFieldRef.replace(/^(top|parent)\./, '').trim();
        if (!fieldId) return;
        if (explicitTop) {
          setTopFieldValue(fieldId, rawValue);
          return;
        }
        if (
          (explicitParent || !definition.questions.some(candidate => candidate.id === fieldId && candidate.type !== 'LINE_ITEM_GROUP')) &&
          overlaySubgroupInfo?.parentGroupKey &&
          overlaySubgroupInfo?.parentRowId
        ) {
          const applied = setParentLineFieldValue(
            overlaySubgroupInfo.parentGroupKey,
            overlaySubgroupInfo.parentRowId,
            fieldId,
            rawValue
          );
          if (applied) return;
        }
        if (definition.questions.some(candidate => candidate.id === fieldId && candidate.type !== 'LINE_ITEM_GROUP')) {
          setTopFieldValue(fieldId, rawValue);
        }
      });

      const removedRoots = deletePlan.flatMap(entry =>
        (entry.rowIds || []).map(rowId => ({
          groupId: (entry.groupKey || '').toString(),
          rowId: (rowId || '').toString()
        }))
      );

      if (onSelectionEffect) {
        removedRoots.forEach(root => {
          if (!root.groupId || !root.rowId) return;
          const groupQuestion = resolveLineItemGroupForKey(root.groupId);
          const rows = currentLineItems[root.groupId] || [];
          const targetRow = rows.find(r => r.id === root.rowId);
          if (!groupQuestion || !targetRow) return;
          clearSelectionEffectsForRow(groupQuestion, targetRow);
        });
      }

      let nextState = {
        values: nextValues,
        lineItems: nextLineItems,
        removed: [] as Array<{ groupId: string; rowId: string }>,
        removedSubgroupKeys: [] as string[],
        dirtyGroups: [] as Array<{ groupId: string; parentGroupKey?: string; parentRowId?: string }>
      };
      if (deletePlan.length) {
        nextState = applyOverlayCloseDeletePlan({
          definition,
          deletePlan,
          topValues: nextValues,
          lineItems: nextLineItems
        });
      }

      if (dirtyRootGroups.size) {
        nextState = {
          ...nextState,
          dirtyGroups: [
            ...nextState.dirtyGroups,
            ...Array.from(dirtyRootGroups).map(groupId => ({ groupId }))
          ]
        };
      }

      const remapped = applyValueMapsToForm(definition, nextState.values, nextState.lineItems, { mode: 'change' });
      nextState = {
        ...nextState,
        values: remapped.values,
        lineItems: remapped.lineItems
      };

      if (nextState.removedSubgroupKeys.length) {
        setSubgroupSelectors(prevSel => {
          const nextSel = { ...prevSel };
          nextState.removedSubgroupKeys.forEach(key => {
            delete (nextSel as any)[key];
          });
          return nextSel;
        });
      }

      setValues(nextState.values);
      setLineItems(nextState.lineItems);
      valuesRef.current = nextState.values;
      lineItemsRef.current = nextState.lineItems;

      const deletedByGroup = new Map<string, Set<string>>();
      nextState.removed.forEach(entry => {
        const groupKey = (entry.groupId || '').toString();
        const rowId = (entry.rowId || '').toString();
        if (!groupKey || !rowId) return;
        const existing = deletedByGroup.get(groupKey) || new Set<string>();
        existing.add(rowId);
        deletedByGroup.set(groupKey, existing);
      });
      setErrors(prev => {
        let changed = false;
        const next: FormErrors = {};
        Object.entries(prev || {}).forEach(([key, val]) => {
          const parts = key.split('__');
          if (parts.length === 3) {
            const groupKey = parts[0];
            const rowId = parts[2];
            const deleted = deletedByGroup.get(groupKey);
            if (deleted && deleted.has(rowId)) {
              changed = true;
              return;
            }
          }
          next[key] = val;
        });
        return changed ? clearLineItemGroupErrors(next, args.errorGroupKey) : clearLineItemGroupErrors(prev, args.errorGroupKey);
      });

      nextState.dirtyGroups.forEach(entry => {
        onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
          groupId: entry.groupId,
          parentGroupKey: entry.parentGroupKey || null,
          parentRowId: entry.parentRowId || null,
          reason: 'overlaySessionSave'
        });
      });

      Array.from(new Set(removedRoots.map(root => root.groupId).filter(Boolean))).forEach(groupId => {
        runSelectionEffectsForAncestorRows(groupId, currentLineItems, nextState.lineItems, {
          mode: 'init',
          topValues: nextState.values
        });
      });

      onDiagnostic?.('overlay.session.save.effects.applied', {
        overlayGroupId,
        deleteGroups: deletePlan.map(entry => ({ groupKey: entry.groupKey, count: entry.rowIds.length }))
      });
    },
    [
      clearSelectionEffectsForRow,
      definition,
      lineItemsRef,
      onDiagnostic,
      onSelectionEffect,
      resolveLineItemGroupForKey,
      runSelectionEffectsForAncestorRows,
      setErrors,
      setLineItems,
      setSubgroupSelectors,
      setValues,
      valuesRef
    ]
  );

  const handleSubgroupOverlaySessionSave = useCallback(() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return;
    const subgroupKey = (subgroupOverlay.subKey || '').toString();
    const nextErrors = validateSubgroupOverlay() || {};
    const hasErrors = Object.keys(nextErrors).length > 0;
    setErrors(prev =>
      hasErrors ? mergeLineItemGroupErrors(prev, subgroupKey, nextErrors) : clearLineItemGroupErrors(prev, subgroupKey)
    );
    if (hasErrors) {
      onDiagnostic?.('subgroup.overlay.session.save.invalid', {
        subgroupKey,
        errorCount: Object.keys(nextErrors).length
      });
      return;
    }
    applyOverlaySessionSaveEffects({
      overlayGroupId: subgroupKey,
      effects: subgroupOverlay.overlaySession?.onSaveEffects,
      errorGroupKey: subgroupKey
    });
    clearOverlaySessionSnapshot('subgroup', subgroupKey);
    closeSubgroupOverlay();
    onDiagnostic?.('subgroup.overlay.session.save', {
      subgroupKey,
      effectCount: Array.isArray(subgroupOverlay.overlaySession?.onSaveEffects)
        ? subgroupOverlay.overlaySession?.onSaveEffects.length
        : 0
    });
  }, [
    applyOverlaySessionSaveEffects,
    clearOverlaySessionSnapshot,
    closeSubgroupOverlay,
    onDiagnostic,
    setErrors,
    subgroupOverlay.open,
    subgroupOverlay.overlaySession,
    subgroupOverlay.subKey,
    validateSubgroupOverlay
  ]);

  const handleSubgroupOverlaySessionCancel = useCallback(() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return;
    const subgroupKey = (subgroupOverlay.subKey || '').toString();
    const restored = restoreOverlaySessionSnapshot({
      kind: 'subgroup',
      targetKey: subgroupKey,
      errorGroupKey: subgroupKey
    });
    closeSubgroupOverlay();
    onDiagnostic?.('subgroup.overlay.session.cancel', {
      subgroupKey,
      restored
    });
  }, [closeSubgroupOverlay, onDiagnostic, restoreOverlaySessionSnapshot, subgroupOverlay.open, subgroupOverlay.subKey]);

  const handleLineItemGroupOverlaySessionSave = useCallback(() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return;
    const groupId = (lineItemGroupOverlay.groupId || '').toString();
    const nextErrors = validateLineItemGroupOverlay() || {};
    const hasErrors = Object.keys(nextErrors).length > 0;
    setErrors(prev =>
      hasErrors ? mergeLineItemGroupErrors(prev, groupId, nextErrors) : clearLineItemGroupErrors(prev, groupId)
    );
    if (hasErrors) {
      onDiagnostic?.('lineItemGroup.overlay.session.save.invalid', {
        groupId,
        errorCount: Object.keys(nextErrors).length
      });
      return;
    }
    applyOverlaySessionSaveEffects({
      overlayGroupId: groupId,
      effects: lineItemGroupOverlay.overlaySession?.onSaveEffects,
      errorGroupKey: groupId
    });
    clearOverlaySessionSnapshot('lineItem', groupId);
    closeLineItemGroupOverlay();
    onDiagnostic?.('lineItemGroup.overlay.session.save', {
      groupId,
      effectCount: Array.isArray(lineItemGroupOverlay.overlaySession?.onSaveEffects)
        ? lineItemGroupOverlay.overlaySession?.onSaveEffects.length
        : 0
    });
  }, [
    applyOverlaySessionSaveEffects,
    clearOverlaySessionSnapshot,
    closeLineItemGroupOverlay,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.overlaySession,
    onDiagnostic,
    setErrors,
    validateLineItemGroupOverlay
  ]);

  const handleLineItemGroupOverlaySessionCancel = useCallback(() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return;
    const groupId = (lineItemGroupOverlay.groupId || '').toString();
    const restored = restoreOverlaySessionSnapshot({
      kind: 'lineItem',
      targetKey: groupId,
      errorGroupKey: groupId
    });
    closeLineItemGroupOverlay();
    onDiagnostic?.('lineItemGroup.overlay.session.cancel', {
      groupId,
      restored
    });
  }, [closeLineItemGroupOverlay, lineItemGroupOverlay.groupId, lineItemGroupOverlay.open, onDiagnostic, restoreOverlaySessionSnapshot]);

  const attemptCloseLineItemGroupOverlay = useCallback(
    (source: 'button' | 'escape') => {
      if (!lineItemGroupOverlay.open) return;
      const overlayGroupId = (lineItemGroupOverlay.groupId || '').toString().trim();
      const overlaySessionEnabled = lineItemGroupOverlay.overlaySession?.enabled === true;
      if (overlaySessionEnabled) {
        const restored = restoreOverlaySessionSnapshot({
          kind: 'lineItem',
          targetKey: overlayGroupId,
          errorGroupKey: overlayGroupId
        });
        closeLineItemGroupOverlay();
        onDiagnostic?.('lineItemGroup.overlay.session.cancel', {
          groupId: overlayGroupId,
          source,
          restored
        });
        return;
      }
      if (overlayStackRef.current.length) {
        closeLineItemGroupOverlay();
        setErrors(prev => clearLineItemGroupErrors(prev, lineItemGroupOverlay.groupId || ''));
        return;
      }

      const nextErrors = validateLineItemGroupOverlay() || {};
      const errorKeys = Object.keys(nextErrors);
      const hasErrors = errorKeys.length > 0;

      if (overlayGroupId && hasErrors) {
        setErrors(prev => mergeLineItemGroupErrors(prev, overlayGroupId, nextErrors));
      }

      const overlayCloseCtx: VisibilityContext = {
        getValue: fid => (valuesRef.current as any)[fid],
        getLineValue: (_rowId: string, fid: string) => (valuesRef.current as any)[fid],
        getLineItems: groupId => lineItemsRef.current[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItemsRef.current || {})
      };
      const scope = resolveOverlayCloseVisibilityScope({
        overlayGroupId,
        detailSelectionGroupId: overlayDetailSelection?.groupId,
        detailSelectionRowId: overlayDetailSelection?.rowId
      });
      const closeConfirmResolved = resolveOverlayCloseConfirm({
        closeConfirm: lineItemGroupOverlay.closeConfirm,
        ctx: overlayCloseCtx,
        scope
      });
      const allowCloseFromEdit = getOverlayCloseAllowCloseFromEdit(lineItemGroupOverlay.closeConfirm);

      if (
        source === 'button' &&
        !allowCloseFromEdit &&
        !hasErrors &&
        overlayDetailSelection?.mode === 'edit' &&
        overlayGroupId &&
        overlayDetailSelection.groupId === overlayGroupId
      ) {
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

      const firstErrorLabel = (() => {
        if (!hasErrors) return '';
        const firstKey = errorKeys[0] || '';
        const parts = firstKey.split('__');
        if (parts.length !== 3) return '';
        const groupKey = parts[0] || '';
        const fieldId = parts[1] || '';
        if (!groupKey || !fieldId) return '';
        const group = resolveLineItemGroupForKey(groupKey);
        const fields = (group?.lineItemConfig as any)?.fields || [];
        const field = Array.isArray(fields) ? fields.find((f: any) => (f?.id || '').toString() === fieldId) : null;
        return resolveFieldLabel(field, language, fieldId);
      })();

      const openCloseConfirm = (args: {
        confirm: any;
        onConfirmEffects: RowFlowActionEffect[];
        validateOnReopen: boolean;
        highlightFirstError: boolean;
      }) => {
        if (!openConfirmDialogResolved) return false;
        const confirm = args.confirm;
        const title = resolveOptionalLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const baseMessage = resolveLocalizedString(confirm.body, language, '');
        const hint = args.highlightFirstError && firstErrorLabel ? ` First issue: ${firstErrorLabel}.` : '';
        const message = `${baseMessage || ''}${hint}`.trim();
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));

        openConfirmDialogResolved({
          title,
          message,
          confirmLabel,
          cancelLabel,
          showCancel: confirm.showCancel !== false,
          kind: confirm.kind || 'overlayClose',
          refId: `${overlayGroupId || ''}::close`,
          onConfirm: () => {
            if (overlayGroupId && args.onConfirmEffects.length) {
              const currentLineItems = lineItemsRef.current || {};
              const currentValues = ((valuesRef.current || {}) as Record<string, FieldValue>) || {};
              const deleteScope = resolveOverlayCloseDeleteScope({
                overlayGroupId,
                overlayRowId: scope?.rowId,
                detailSelectionGroupId: overlayDetailSelection?.groupId,
                detailSelectionRowId: overlayDetailSelection?.rowId
              });
              const deletePlan = resolveOverlayCloseDeletePlan({
                effects: args.onConfirmEffects,
                overlayGroupId: deleteScope.overlayGroupId,
                overlayRowId: deleteScope.overlayRowId,
                topValues: currentValues,
                lineItems: currentLineItems
              });
              if (deletePlan.length) {
                const removedRoots = deletePlan.flatMap(entry =>
                  (entry.rowIds || []).map(rowId => ({
                    groupId: (entry.groupKey || '').toString(),
                    rowId: (rowId || '').toString()
                  }))
                );
                if (onSelectionEffect) {
                  removedRoots.forEach(root => {
                    if (!root.groupId || !root.rowId) return;
                    const groupQuestion = definition.questions.find(q => q.id === root.groupId);
                    const rows = currentLineItems[root.groupId] || [];
                    const targetRow = rows.find(r => r.id === root.rowId);
                    if (groupQuestion && targetRow) {
                      clearSelectionEffectsForRow(groupQuestion, targetRow);
                    }
                  });
                }
                const nextState = applyOverlayCloseDeletePlan({
                  definition,
                  deletePlan,
                  topValues: currentValues,
                  lineItems: currentLineItems
                });
                if (nextState.removedSubgroupKeys.length) {
                  setSubgroupSelectors(prevSel => {
                    const nextSel = { ...prevSel };
                    nextState.removedSubgroupKeys.forEach(key => {
                      delete (nextSel as any)[key];
                    });
                    return nextSel;
                  });
                }
                setValues(nextState.values);
                setLineItems(nextState.lineItems);
                valuesRef.current = nextState.values;
                lineItemsRef.current = nextState.lineItems;
                const deletedByGroup = new Map<string, Set<string>>();
                nextState.removed.forEach(entry => {
                  const groupKey = (entry.groupId || '').toString();
                  const rowId = (entry.rowId || '').toString();
                  if (!groupKey || !rowId) return;
                  const existing = deletedByGroup.get(groupKey) || new Set<string>();
                  existing.add(rowId);
                  deletedByGroup.set(groupKey, existing);
                });
                setErrors(prev => {
                  let changed = false;
                  const next: FormErrors = {};
                  Object.entries(prev || {}).forEach(([key, val]) => {
                    const parts = key.split('__');
                    if (parts.length === 3) {
                      const groupKey = parts[0];
                      const rowId = parts[2];
                      const deleted = deletedByGroup.get(groupKey);
                      if (deleted && deleted.has(rowId)) {
                        changed = true;
                        return;
                      }
                    }
                    next[key] = val;
                  });
                  return changed ? next : prev;
                });
                nextState.dirtyGroups.forEach(entry => {
                  onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
                    groupId: entry.groupId,
                    parentGroupKey: entry.parentGroupKey || null,
                    parentRowId: entry.parentRowId || null,
                    reason: 'overlayCloseDelete'
                  });
                });
                Array.from(new Set(removedRoots.map(root => root.groupId).filter(Boolean))).forEach(groupId => {
                  runSelectionEffectsForAncestorRows(groupId, currentLineItems, nextState.lineItems, {
                    mode: 'init',
                    topValues: nextState.values
                  });
                });
                onDiagnostic?.('lineItemGroup.overlay.close.effects.deleteLineItems', {
                  groupId: overlayGroupId,
                  deleteGroups: deletePlan.map(p => ({ groupKey: p.groupKey, count: p.rowIds.length }))
                });
              }
            }

            if (overlayGroupId && (args.validateOnReopen || hasErrors)) {
              overlayCloseValidateOnOpenRef.current[overlayGroupId] = true;
            }
            closeLineItemGroupOverlay();
            if (!hasErrors && overlayGroupId) {
              setErrors(prev => clearLineItemGroupErrors(prev, overlayGroupId));
            }
            onDiagnostic?.('lineItemGroup.overlay.close.confirmed', {
              groupId: overlayGroupId,
              source,
              hadErrors: hasErrors,
              validateOnReopen: args.validateOnReopen
            });
          }
        });
        return true;
      };

      if (closeConfirmResolved && openCloseConfirm(closeConfirmResolved)) {
        onDiagnostic?.('lineItemGroup.overlay.close.confirm.open', {
          source,
          groupId: overlayGroupId,
          hadErrors: hasErrors,
          configSource: closeConfirmResolved.source
        });
        return;
      }

      if (overlayGroupId && hasErrors) {
        overlayCloseValidateOnOpenRef.current[overlayGroupId] = true;
      }
      closeLineItemGroupOverlay();
      if (!hasErrors && overlayGroupId) {
        setErrors(prev => clearLineItemGroupErrors(prev, overlayGroupId));
      }
      onDiagnostic?.('lineItemGroup.overlay.close.allowed', {
        groupId: overlayGroupId,
        source,
        hadErrors: hasErrors,
        confirmShown: !!closeConfirmResolved
      });
    },
    [
      closeLineItemGroupOverlay,
      clearSelectionEffectsForRow,
      definition,
      language,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      lineItemGroupOverlay.closeConfirm,
      lineItemGroupOverlay.overlaySession?.enabled,
      lineItemsRef,
      openConfirmDialogResolved,
      onDiagnostic,
      onSelectionEffect,
      overlayDetailSelection,
      runSelectionEffectsForAncestorRows,
      resolveLineItemGroupForKey,
      restoreOverlaySessionSnapshot,
      setErrors,
      setLineItems,
      setSubgroupSelectors,
      setOverlayDetailSelection,
      setValues,
      validateLineItemGroupOverlay,
      valuesRef
    ]
  );

  useEffect(() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return;
    const groupId = (lineItemGroupOverlay.groupId || '').toString().trim();
    if (!groupId) return;
    if (!overlayCloseValidateOnOpenRef.current[groupId]) return;
    delete overlayCloseValidateOnOpenRef.current[groupId];

    const nextErrors = validateLineItemGroupOverlay() || {};
    const keys = Object.keys(nextErrors);
    if (!keys.length) {
      setErrors(prev => clearLineItemGroupErrors(prev, groupId));
      onDiagnostic?.('lineItemGroup.overlay.reopen.validate', { groupId, errorCount: 0 });
      return;
    }

    setErrors(prev => mergeLineItemGroupErrors(prev, groupId, nextErrors));
    requestValidationNavigation({ scope: 'lineItemOverlayReopen' });
    onDiagnostic?.('lineItemGroup.overlay.reopen.validate', { groupId, errorCount: keys.length });
  }, [
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    onDiagnostic,
    requestValidationNavigation,
    setErrors,
    validateLineItemGroupOverlay
  ]);

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
        closeConfirm?: OverlayCloseConfirmLike;
        label?: string;
        contextHeader?: string;
        helperText?: string;
        overlaySession?: LineItemOverlaySessionConfig;
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
      const subgroupDefaults = resolveSubgroupDefs(subKey);
      const subgroupParsed = parseSubgroupKey(subKey);
      const subgroupParentGroupId = (() => {
        const parentGroupKey = (subgroupParsed?.parentGroupKey || '').toString();
        if (!parentGroupKey) return '';
        const tokens = parentGroupKey.split('::').filter(Boolean);
        return (tokens[tokens.length - 1] || '').toString();
      })();
      const isPartDishIngredientsOverlay =
        (subgroupParsed?.subGroupId || '').toString() === 'MP_INGREDIENTS_LI' && subgroupParentGroupId === 'MP_TYPE_LI';
      const closeButtonLabelRaw =
        options?.closeButtonLabel ??
        (groupOverride as any)?.ui?.closeButtonLabel ??
        (subgroupDefaults?.sub as any)?.ui?.closeButtonLabel;
      const closeButtonLabelDefault = isPartDishIngredientsOverlay ? tSystem('actions.back', language, 'Back') : '';
      const closeButtonLabel = resolveLocalizedString(closeButtonLabelRaw, language, '').trim() || closeButtonLabelDefault;
      const closeConfirm = options?.closeConfirm;
      const label = options?.label;
      const contextHeader = options?.contextHeader;
      const helperText = options?.helperText;
      const overlaySession =
        options?.overlaySession ??
        (groupOverride as any)?.ui?.overlaySession ??
        (subgroupDefaults?.sub as any)?.ui?.overlaySession;
      const rowFlow = options?.rowFlow;
      ensureOverlaySessionSnapshot('subgroup', subKey, overlaySession);
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
        overlaySession,
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
        hasHelperText: !!helperText,
        hasOverlaySession: !!overlaySession?.enabled
      });
      if (hideCloseButton) {
        onDiagnostic?.('form.overlay.closeButton.hidden', { scope: 'subgroup', source });
      }
    },
    [ensureOverlaySessionSnapshot, language, lineItemGroupOverlay, onDiagnostic, overlay.open, resolveSubgroupDefs, subgroupOverlay]
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
        closeConfirm?: OverlayCloseConfirmLike;
        label?: string;
        contextHeader?: string;
        helperText?: string;
        overlaySession?: LineItemOverlaySessionConfig;
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
      const baseGroup =
        group ||
        ((definition.questions || []).find(q => q && q.type === 'LINE_ITEM_GROUP' && q.id === id) as WebQuestionDefinition | undefined);
      const rowFilter = options?.rowFilter || null;
      const hideInlineSubgroups = options?.hideInlineSubgroups === true;
      const hideCloseButton = options?.hideCloseButton === true;
      const groupUi = (baseGroup?.lineItemConfig as any)?.ui;
      const closeButtonLabelRaw = options?.closeButtonLabel ?? groupUi?.closeButtonLabel;
      const closeButtonLabel = resolveLocalizedString(closeButtonLabelRaw, language, '').trim();
      const closeConfirm = options?.closeConfirm ?? groupUi?.closeConfirm;
      const label = options?.label;
      const contextHeader = options?.contextHeader;
      const helperText = options?.helperText;
      const overlaySession = options?.overlaySession ?? groupUi?.overlaySession;
      const rowFlow = options?.rowFlow;
      ensureOverlaySessionSnapshot('lineItem', id, overlaySession);
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
        overlaySession,
        rowFlow
      });
      onDiagnostic?.('lineItemGroup.overlay.open', {
        groupId: id,
        mode: group ? 'override' : 'default',
        hasRowFilter: !!rowFilter,
        hideCloseButton,
        hasCloseConfirm: !!closeConfirm,
        hasCloseLabel: !!closeButtonLabel,
        hasHelperText: !!helperText,
        hasOverlaySession: !!overlaySession?.enabled
      });
      if (hideCloseButton) {
        onDiagnostic?.('form.overlay.closeButton.hidden', { scope: 'lineItemGroup', source });
      }
    },
    [definition.questions, ensureOverlaySessionSnapshot, language, lineItemGroupOverlay, onDiagnostic, overlay.open, subgroupOverlay]
  );

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
    const clearPendingOverlayDetailRender = () => {
      if (!overlayDetailRenderTimerRef.current) return;
      globalThis.clearTimeout(overlayDetailRenderTimerRef.current);
      overlayDetailRenderTimerRef.current = null;
    };
    const resetOverlayDetailRender = () => {
      clearPendingOverlayDetailRender();
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtml('');
      setOverlayDetailHtmlError('');
      setOverlayDetailHtmlLoading(false);
    };
    const activeGroupKey =
      lineItemGroupOverlay.open && lineItemGroupOverlay.groupId
        ? lineItemGroupOverlay.groupId
        : subgroupOverlay.open && subgroupOverlay.subKey
          ? subgroupOverlay.subKey
          : '';
    if (!activeGroupKey) {
      resetOverlayDetailRender();
      return;
    }
    if (!overlayDetailSelection || overlayDetailSelection.mode !== 'view' || overlayDetailSelection.groupId !== activeGroupKey) {
      resetOverlayDetailRender();
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
      resetOverlayDetailRender();
      return;
    }

    const templateIdMap = context.overlayDetail?.body?.view?.templateId;
    if (!templateIdMap) {
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.templateMissing', language, 'Template not configured.'));
      return;
    }
    if (context.type === 'sub' && Array.isArray(context.path) && context.path.length > 1) {
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.pathUnsupported', language, 'Nested paths beyond one level are not supported yet.'));
      return;
    }

    const payload = buildDraftPayload({
      definition,
      formKey: resolveDraftPayloadFormKey({ formKey, definition }),
      language,
      values,
      lineItems,
      existingRecordId: recordMeta?.id
    });
    const rootGroup = definition.questions.find(q => q.id === context.groupId && q.type === 'LINE_ITEM_GROUP');
    const rootGroupCfg = (rootGroup as any)?.lineItemConfig;
    if (!rootGroupCfg) {
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.templateFailed', language, 'Unable to render template.'));
      return;
    }
    const rowFilters: Record<string, string> = {};
    if (context.type === 'line') {
      rowFilters[context.groupId] = overlayDetailSelection.rowId;
    } else {
      if (context.parentRowId) rowFilters[context.groupId] = context.parentRowId;
      rowFilters[activeGroupKey] = overlayDetailSelection.rowId;
    }
    const groupOverridesByKey =
      context.type === 'sub' && subgroupOverlay.subKey && subgroupOverlay.groupOverride
        ? { [subgroupOverlay.subKey]: subgroupOverlay.groupOverride }
        : undefined;
    const serializedRootRows = serializeLineItemTree({
      lineItems,
      groupCfg: rootGroupCfg,
      groupKey: context.groupId,
      rowFilters,
      groupOverridesByKey
    });
    (payload.values as any)[context.groupId] = serializedRootRows;
    (payload.values as any)[`${context.groupId}_json`] = JSON.stringify(serializedRootRows);
    (payload as any)[context.groupId] = serializedRootRows;
    (payload as any)[`${context.groupId}_json`] = (payload.values as any)[`${context.groupId}_json`];

    if (context.type === 'sub') {
      const subPath = Array.isArray((context as any).path) ? ((context as any).path as string[]) : [];
      const selectedParent = serializedRootRows[0] || null;
      const selectedChildren =
        selectedParent && subPath.length === 1 && Array.isArray((selectedParent as any)[subPath[0]])
          ? ((selectedParent as any)[subPath[0]] as any[])
          : [];
      const selectedChild = selectedChildren[0] || null;
      const nestedSubGroupId = (context.overlayDetail?.body?.subGroupId || '').toString().trim();
      const nestedCount =
        selectedChild && nestedSubGroupId && Array.isArray((selectedChild as any)[nestedSubGroupId])
          ? ((selectedChild as any)[nestedSubGroupId] as any[]).length
          : 0;
      onDiagnostic?.('lineItems.overlayDetail.payload', {
        groupId: context.groupId,
        activeGroupKey,
        rowId: overlayDetailSelection.rowId,
        rootRows: serializedRootRows.length,
        selectedChildren: selectedChildren.length,
        nestedSubGroupId: nestedSubGroupId || null,
        nestedRows: nestedCount
      });
    }

    const resolvedTemplateId = resolveTemplateIdForRecord(templateIdMap, payload.values as any, language);
    if (!resolvedTemplateId) {
      clearPendingOverlayDetailRender();
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtml('');
      setOverlayDetailHtmlLoading(false);
      setOverlayDetailHtmlError(tSystem('overlay.detail.templateMissing', language, 'Template not configured.'));
      return;
    }

    if (selectionEffectAsyncPendingCount > 0) {
      clearPendingOverlayDetailRender();
      overlayDetailRenderSeqRef.current += 1;
      overlayDetailRenderSignatureRef.current = '';
      setOverlayDetailHtmlLoading(true);
      setOverlayDetailHtmlError('');
      onDiagnostic?.('lineItems.overlayDetail.view.waitSelectionEffects', {
        pendingCount: selectionEffectAsyncPendingCount,
        groupId: context.groupId,
        rowId: overlayDetailSelection.rowId,
        templateId: resolvedTemplateId
      });
      return;
    }

    let renderSignature = '';
    try {
      renderSignature = JSON.stringify({
        groupId: context.groupId,
        rowId: overlayDetailSelection.rowId,
        templateId: resolvedTemplateId,
        payload: (payload.values as any)[context.groupId]
      });
    } catch {
      renderSignature = `${context.groupId}::${overlayDetailSelection.rowId}::${resolvedTemplateId}`;
    }
    if (overlayDetailRenderSignatureRef.current === renderSignature) {
      return;
    }
    clearPendingOverlayDetailRender();
    overlayDetailRenderSignatureRef.current = renderSignature;

    const renderKey = (() => {
      try {
        return JSON.stringify({
          scope: 'overlayDetail',
          activeGroupKey,
          groupId: context.groupId,
          rowId: overlayDetailSelection.rowId,
          templateId: resolvedTemplateId,
          renderSignature
        });
      } catch {
        return `overlay:${activeGroupKey}:${context.groupId}:${overlayDetailSelection.rowId}:${resolvedTemplateId}:${renderSignature}`;
      }
    })();
    const renderSeq = ++overlayDetailRenderSeqRef.current;
    const cachedRender = peekInlineHtmlTemplateCache(payload, templateIdMap as any, renderKey);
    if (cachedRender?.success && cachedRender?.html) {
      setOverlayDetailHtml(cachedRender.html);
      setOverlayDetailHtmlError('');
      setOverlayDetailHtmlLoading(false);
      return;
    }
    setOverlayDetailHtmlLoading(true);
    setOverlayDetailHtmlError('');
    overlayDetailRenderTimerRef.current = globalThis.setTimeout(() => {
      overlayDetailRenderTimerRef.current = null;
      renderInlineHtmlTemplateApi(payload, templateIdMap as any, renderKey)
      .then(res => {
        if (renderSeq !== overlayDetailRenderSeqRef.current) return;
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
        if (renderSeq !== overlayDetailRenderSeqRef.current) return;
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
        if (renderSeq !== overlayDetailRenderSeqRef.current) return;
        setOverlayDetailHtmlLoading(false);
      });
    }, OVERLAY_DETAIL_INLINE_RENDER_DEBOUNCE_MS);
  }, [
    definition,
    formKey,
    language,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItems,
    onDiagnostic,
    overlayDetailSelection,
    recordMeta,
    resolveSubgroupDefs,
    selectionEffectAsyncPendingCount,
    subgroupOverlay.open,
    subgroupOverlay.groupOverride,
    subgroupOverlay.subKey,
    values
  ]);

  // NOTE: Must be declared AFTER `questionIdToGroupKey`, `nestedGroupMeta`, and overlay open callbacks are initialized.
  // Otherwise production bundles can hit a TDZ "Cannot access X before initialization" when evaluating hook deps.
  const navigateToFieldKey = useImperativeFieldNavigation({
    navigateToFieldRef,
    nestedGroupMeta,
    questions: definition.questions,
    guidedEnabled,
    guidedInlineLineGroupIds,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    lineItemGroupOverlay,
    subgroupOverlay,
    setCollapsedGroups,
    setCollapsedRows
  });

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
    } catch {
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
      } catch {
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
        shouldAutoOpenSubgroupForPendingAnchor({
          targetParentGroupKey: targetSubgroupInfo.parentGroupKey,
          lineItemOverlayOpen: lineItemGroupOverlay.open,
          lineItemOverlayGroupId: lineItemGroupOverlay.groupId,
          subgroupOverlayOpen: subgroupOverlay.open,
          subgroupOverlaySubKey: subgroupOverlay.subKey
        }) &&
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
    questionIdToGroupKey,
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
    } catch {
      // ignore
    }
    // Respect sticky header by using scroll-margin-top on the element.
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [status]);

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
        ? (lineItemsSnapshot[subgroupInfo.parentGroupKey] || []).find(row => row.id === subgroupInfo.parentRowId)?.values
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

  const {
    addLineItemRowManual,
    removeLineRow
  } = useFormLineItemRows({
    definition,
    values,
    lineItems,
    optionState,
    language,
    submitting,
    subgroupSelectors,
    lineItemGroupOverlay,
    subgroupOverlay,
    setValues,
    setLineItems,
    setCollapsedSubgroups,
    setPendingScrollAnchor,
    setSubgroupSelectors,
    ensureLineOptions,
    openConfirmDialog: openConfirmDialogResolved,
    onSelectionEffect,
    onDiagnostic,
    computeRowNonMatchKeys,
    matchesOverlayRowFilter,
    resolveSubgroupDefs,
    clearSelectionEffectsForRow,
    runSelectionEffectsForAncestorRows
  });

  const {
    resolveVisibilityValue,
    topVisibilityCtx,
    resolveTopValueNoScan,
    getTopValueNoScan
  } = useFormVisibilityResolvers({
    values,
    lineItems,
    guidedVirtualState,
    resolveDataSourceCountValue,
    recordMeta
  });
  const { isFieldLockedByDedup } = useFieldDisableRuleState({
    fieldDisableRules: definition.fieldDisableRules,
    topVisibilityCtx,
    recordMeta,
    onDiagnostic
  });

  const {
    overlayOpenActionTargetGroups,
    resolveOverlayOpenActionForQuestion
  } = useOverlayOpenActions({
    definition,
    values,
    lineItems,
    language,
    topVisibilityCtx,
    overlayOpenActionLoggedRef,
    isOverlayOpenActionSuppressed,
    onDiagnostic
  });

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

  const {
    resolveOrderedEntryBlock,
    triggerOrderedEntryValidation
  } = useOrderedEntryValidationController({
    orderedEntryEnabled,
    definition,
    guidedEnabled,
    activeGuidedStepId,
    buildGuidedStepDefinition,
    language,
    values,
    lineItems,
    collapsedRows,
    collapsedSubgroups,
    guidedVirtualState,
    orderedEntryQuestions,
    errors,
    submitting,
    resolveVisibilityValue,
    getTopValue: getTopValueNoScan,
    setErrors,
    requestValidationNavigation,
    orderedEntryGuideFieldPathRef,
    orderedEntryGateRef,
    onFormValidityChange,
    onDiagnostic
  });

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
    ) =>
      computeParagraphDisclaimerUpdatesAction({
        definition,
        language,
        values: currentValues,
        lineItems: currentLineItems,
        optionState: currentOptionState
      }),
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
    [computeParagraphDisclaimerUpdates, lineItemsRef, onDiagnostic, setValues, submitting, valuesRef]
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
  }, [
    definition,
    lineItems,
    lineItemsRef,
    optionState,
    language,
    submitting,
    valuesRef,
    computeParagraphDisclaimerUpdates,
    syncParagraphDisclaimers
  ]);

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
      } catch {
        // ignore blur failures
      }
    },
    [onDiagnostic]
  );

  const checkFileUploadOrderedEntry = useCallback(
    (args: FileUploadOrderedEntryCheckArgs): boolean => {
      if (!orderedEntryEnabled) return false;
      const source = args.source || 'upload';
      const target: OrderedEntryTarget =
        args.scope === 'top'
          ? { scope: 'top', questionId: args.question.id }
          : {
              scope: 'line',
              groupId: args.group.id,
              rowId: args.rowId,
              fieldId: (args.field?.id || '').toString()
            };
      const targetGroup = args.scope === 'line' ? args.group : undefined;
      const orderedBlock = resolveOrderedEntryBlock(target, targetGroup);
      if (!orderedBlock) return false;

      const fieldPath =
        args.scope === 'top'
          ? args.fieldPath || args.question.id
          : args.fieldPath || `${args.group.id}__${(args.field?.id || '').toString()}__${args.rowId}`;
      const shouldValidate = args.validate !== false;
      if (shouldValidate) {
        blurActiveElement('orderedEntry.uploadBlocked', {
          scope: args.scope,
          fieldPath
        });
        triggerOrderedEntryValidation(target, orderedBlock.missingFieldPath, {
          source,
          allowOverlayOpen: false
        });
      }
      if (shouldValidate) {
        onDiagnostic?.('upload.orderedEntry.blocked', {
          scope: args.scope,
          fieldPath,
          missingFieldPath: orderedBlock.missingFieldPath,
          source
        });
      }
      return true;
    },
    [
      blurActiveElement,
      onDiagnostic,
      orderedEntryEnabled,
      resolveOrderedEntryBlock,
      triggerOrderedEntryValidation
    ]
  );

  useEffect(() => {
    fileUploadOrderedEntryGateRef.current = checkFileUploadOrderedEntry;
  }, [checkFileUploadOrderedEntry]);

  const checkLineFileUploadOrderedEntry = useCallback(
    (args: {
      group: WebQuestionDefinition;
      rowId: string;
      field: any;
      fieldPath: string;
      source?: string;
      validate?: boolean;
    }) =>
      checkFileUploadOrderedEntry({
        scope: 'line',
        group: args.group,
        rowId: args.rowId,
        field: args.field,
        fieldPath: args.fieldPath,
        source: args.source,
        validate: args.validate
      }),
    [checkFileUploadOrderedEntry]
  );

  const {
    handleFieldChange,
    handleLineFieldChange
  } = useFormFieldChangeHandlers({
    definition,
    language,
    submitting,
    ingredientNameTransformEnabled,
    valuesRef,
    lineItemsRef,
    guidedLastUserEditAtRef,
    clearOnChangeOrderedFieldIds,
    optionState,
    subgroupSelectors,
    setValues,
    setLineItems,
    setErrors,
    isFieldLockedByDedup,
    resolveOrderedEntryBlock,
    blurActiveElement,
    triggerOrderedEntryValidation,
    clearOverlayOpenActionSuppression,
    ensureLineOptions,
    attemptOverlayDetailAutoOpen,
    computeRowNonMatchKeys,
    runSelectionEffectsForAncestorRows,
    onStatusClear,
    onUserEdit,
    onAutomatedMutation,
    onSelectionEffect,
    onDiagnostic
  });

  const {
    handleFileFieldChange,
    handleFileInputChange,
    handleLineFileInputChange,
    handleLineFileDrop,
    removeLineFile,
    clearLineFiles
  } = useFormFileUploadHandlers({
    language,
    submitting,
    valuesRef,
    lineItemsRef,
    setValuesSynced,
    setErrors,
    onStatusClear,
    onUploadFiles,
    onDiagnostic,
    fileUploadOrderedEntryGateRef,
    stageFilesInOverlay,
    updateFileOverlayAfterImmediateAction,
    resetNativeFileInput,
    resetDrag,
    announceUpload,
    clearUploadFailureForField,
    recordUploadFailure,
    handleLineFieldChange
  });

  const renderOptions = (q: WebQuestionDefinition): OptionSet => {
    ensureOptions(q);
    return optionState[optionKey(q.id)] || toOptionSet(q);
  };

  const topLevelGroupProgress = useTopLevelGroupAutoCollapse({
    groupSections,
    values,
    lineItems,
    collapsedRows,
    language,
    topVisibilityCtx,
    getTopValue: getTopValueNoScan,
    autoCollapseGroups,
    autoOpenNextIncomplete,
    setCollapsedGroups,
    scheduleScrollGroupToTop,
    onDiagnostic
  });

  const buildLineItemGroupQuestionContext = (overrides?: Record<string, any>) => ({
    formKey,
    recordId: recordMeta?.id || null,
    recordMeta,
    definition,
    language,
    values,
    resolveVisibilityValue,
    getTopValue: getTopValueNoScan,
    setValues: setValuesSynced,
    lineItems,
    setLineItems: setLineItemsSynced,
    isSubmitting: submitting,
    submitting,
    isFieldLockedByDedup,
    errors,
    setErrors,
    warningByField,
    optionState,
    setOptionState,
    ensureLineOptions,
    renderChoiceControl,
    openInfoOverlay,
    openFileOverlay,
    checkFileUploadOrderedEntry: checkLineFileUploadOrderedEntry,
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
    uploadFailures,
    onRetryUploadFailure: retryUploadFailure,
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
    setAutoSaveHold: setScopedAutoSaveHold,
    ensureRecordId,
    queueGuidedStepReservationDraftSync,
    onGuidedStepReservationDraftStateChange,
    waitForGuidedStepReservationDraftSync,
    waitForPendingSharedDataMutations,
    ...(overrides || {})
  });

  const renderQuestion = buildTopQuestionRenderer({
    renderOptions,
    values,
    language,
    optionSortFor,
    topVisibilityCtx,
    errors,
    hasWarning,
    renderWarnings,
    resolveOverlayOpenActionForQuestion,
    submitting,
    isFieldLockedByDedup,
    lineItems,
    matchesOverlayRowFilter,
    openSubgroupOverlay,
    openLineItemGroupOverlay,
    onDiagnostic,
    definition,
    clearSelectionEffectsForRow,
    setSubgroupSelectors,
    setValues,
    setLineItems,
    runSelectionEffectsForAncestorRows,
    suppressOverlayOpenAction,
    openConfirmDialogResolved,
    reportBusy,
    reportBusyId,
    onReportButton,
    onReportButtonPointerDown,
    isDedupKeyField,
    optionState,
    setErrors,
    handleFieldChange,
    renderChoiceControl,
    openInfoOverlay,
    checkFileUploadOrderedEntry,
    openFileOverlay,
    handleFileInputChange,
    fileInputsRef,
    uploadAnnouncements,
    renderUploadFailure,
    collapsedRows,
    getTopValueNoScan,
    buildLineItemGroupQuestionContext,
    overlayOpenActionTargetGroups
  });

  useSingleChoiceDefaults({
    definitionQuestions: definition.questions,
    language,
    optionState,
    values,
    lineItems,
    setValues,
    setLineItems,
    setErrors,
    optionSortFor,
    onSelectionEffect
  });

  const errorIndex = useMemo(() => buildValidationErrorIndex(errors), [errors]);

  useValidationErrorNavigation({
    errors,
    consumeValidationNavigation,
    errorNavAllowOverlayOpenRef,
    errorNavConsumedRef,
    errorNavModeRef,
    errorNavRequestRef,
    firstErrorRef,
    guidedBackErrorNavSuppressionRef,
    nestedGroupMeta,
    questions: definition.questions,
    activeGuidedStepId,
    guidedEnabled,
    guidedInlineLineGroupIds,
    guidedStepIds,
    guidedStepsCfg,
    guidedVisibleSteps,
    lineItems,
    maxReachableGuidedIndex,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    selectGuidedStep,
    lineItemGroupOverlay,
    subgroupOverlay,
    setCollapsedGroups,
    setCollapsedRows
  });

  const subgroupOverlayPortal = (
    <SubgroupOverlayPortal
      subgroupOverlay={subgroupOverlay}
      resolveSubgroupDefs={resolveSubgroupDefs}
      definition={definition}
      language={language}
      values={values}
      setValues={setValues}
      valuesRef={valuesRef}
      lineItems={lineItems}
      setLineItems={setLineItems}
      lineItemsRef={lineItemsRef}
      optionState={optionState}
      setOptionState={setOptionState}
      submitting={submitting}
      errors={errors}
      setErrors={setErrors}
      subgroupSelectors={subgroupSelectors}
      setSubgroupSelectors={setSubgroupSelectors}
      latestSubgroupSelectorValueRef={latestSubgroupSelectorValueRef}
      overlayDetailSelection={overlayDetailSelection}
      setOverlayDetailSelection={setOverlayDetailSelection}
      overlayDetailEditSnapshotRef={overlayDetailEditSnapshotRef}
      overlayDetailHtml={overlayDetailHtml}
      overlayDetailHtmlError={overlayDetailHtmlError}
      overlayDetailHtmlLoading={overlayDetailHtmlLoading}
      attemptCloseSubgroupOverlay={attemptCloseSubgroupOverlay}
      closeSubgroupOverlay={closeSubgroupOverlay}
      attemptSaveOverlayDetailEdit={attemptSaveOverlayDetailEdit}
      handleSubgroupOverlaySessionCancel={handleSubgroupOverlaySessionCancel}
      handleSubgroupOverlaySessionSave={handleSubgroupOverlaySessionSave}
      isFieldLockedByDedup={isFieldLockedByDedup}
      addLineItemRowManual={addLineItemRowManual}
      removeLineRow={removeLineRow}
      onDiagnostic={onDiagnostic}
      onStatusClear={onStatusClear}
      onUserEdit={onUserEdit}
      guidedLastUserEditAtRef={guidedLastUserEditAtRef}
      ensureLineOptions={ensureLineOptions}
      optionSortFor={optionSortFor}
      setOverlay={setOverlay}
      buildLineItemGroupQuestionContext={buildLineItemGroupQuestionContext}
      getTopValueNoScan={getTopValueNoScan}
      resolveTopValueNoScan={resolveTopValueNoScan}
      collapsedGroups={collapsedGroups}
      toggleGroupCollapsed={toggleGroupCollapsed}
      renderChoiceControl={renderChoiceControl}
      openFileOverlay={openFileOverlay}
      openInfoOverlay={openInfoOverlay}
      handleLineFieldChange={handleLineFieldChange}
      handleLineFileInputChange={handleLineFileInputChange}
      checkLineFileUploadOrderedEntry={checkLineFileUploadOrderedEntry}
      fileInputsRef={fileInputsRef}
      uploadAnnouncements={uploadAnnouncements}
      renderUploadFailure={renderUploadFailure}
      hasWarning={hasWarning}
      renderWarnings={renderWarnings}
      resolveRequiredValue={resolveRequiredValue}
      resolveVisibilityValue={resolveVisibilityValue}
    />
  );

  const lineItemGroupOverlayPortal = (
    <LineItemGroupOverlayPortal
      lineItemGroupOverlay={lineItemGroupOverlay}
      definition={definition}
      language={language}
      values={values}
      setValues={setValues}
      valuesRef={valuesRef}
      lineItems={lineItems}
      setLineItems={setLineItems}
      lineItemsRef={lineItemsRef}
      optionState={optionState}
      setOptionState={setOptionState}
      submitting={submitting}
      setErrors={setErrors}
      overlayDetailSelection={overlayDetailSelection}
      setOverlayDetailSelection={setOverlayDetailSelection}
      overlayDetailEditSnapshotRef={overlayDetailEditSnapshotRef}
      overlayDetailHtml={overlayDetailHtml}
      overlayDetailHtmlError={overlayDetailHtmlError}
      overlayDetailHtmlLoading={overlayDetailHtmlLoading}
      attemptCloseLineItemGroupOverlay={attemptCloseLineItemGroupOverlay}
      attemptSaveOverlayDetailEdit={attemptSaveOverlayDetailEdit}
      handleLineItemGroupOverlaySessionCancel={handleLineItemGroupOverlaySessionCancel}
      handleLineItemGroupOverlaySessionSave={handleLineItemGroupOverlaySessionSave}
      isFieldLockedByDedup={isFieldLockedByDedup}
      addLineItemRowManual={addLineItemRowManual}
      removeLineRow={removeLineRow}
      onDiagnostic={onDiagnostic}
      onStatusClear={onStatusClear}
      onUserEdit={onUserEdit}
      guidedLastUserEditAtRef={guidedLastUserEditAtRef}
      ensureLineOptions={ensureLineOptions}
      optionSortFor={optionSortFor}
      setOverlay={setOverlay}
      buildLineItemGroupQuestionContext={buildLineItemGroupQuestionContext}
      resolveTopValueNoScan={resolveTopValueNoScan}
    />
  );

  const fileOverlayPortal = (
    <FormFileOverlay
      fileOverlay={fileOverlay}
      setFileOverlay={setFileOverlay}
      language={language}
      submitting={submitting}
      uploadFailures={uploadFailures}
      fileInputsRef={fileInputsRef}
      fileItemsSignature={fileItemsSignature}
      resolveFileOverlayItems={resolveFileOverlayItems}
      checkFileUploadOrderedEntry={checkFileUploadOrderedEntry}
      checkLineFileUploadOrderedEntry={checkLineFileUploadOrderedEntry}
      handleFileFieldChange={handleFileFieldChange}
      handleLineFieldChange={handleLineFieldChange}
      clearUploadFailureForField={clearUploadFailureForField}
      announceUpload={announceUpload}
      recordUploadFailure={recordUploadFailure}
      updateFileOverlayAfterImmediateAction={updateFileOverlayAfterImmediateAction}
      dismissFileOverlay={dismissFileOverlay}
      closeFileOverlay={closeFileOverlay}
      retryUploadFailure={retryUploadFailure}
      onUploadFiles={onUploadFiles}
      onDiagnostic={onDiagnostic}
    />
  );

  const infoOverlayPortal = (
    <InfoOverlay
      open={infoOverlay.open}
      language={language}
      title={infoOverlay.title || ''}
      text={infoOverlay.text || ''}
      onClose={closeInfoOverlay}
    />
  );

  const guidedContent = (
    <GuidedContentRenderer
      guidedEnabled={guidedEnabled}
      guidedStepsCfg={guidedStepsCfg}
      guidedVisibleSteps={guidedVisibleSteps}
      activeGuidedStepId={activeGuidedStepId}
      activeGuidedStepIndex={activeGuidedStepIndex}
      guidedStatusSteps={guidedStatus.steps}
      guidedStepBarBlockedIds={guidedStepBarBlockedIds}
      guidedForwardNavigationBlocked={guidedForwardNavigationBlocked}
      maxReachableGuidedIndex={maxReachableGuidedIndex}
      guidedStepBodyRef={guidedStepBodyRef}
      guidedLineGroupOverrideLoggedRef={guidedLineGroupOverrideLoggedRef}
      language={language}
      definitionQuestions={definition.questions}
      values={values}
      submitting={submitting}
      errors={errors}
      renderOptions={renderOptions}
      renderQuestion={renderQuestion}
      isQuestionVisible={question => !shouldHideField(question.visibility, topVisibilityCtx)}
      hasWarning={hasWarning}
      renderWarnings={renderWarnings}
      isFieldLockedByDedup={isFieldLockedByDedup}
      openLineItemGroupOverlay={openLineItemGroupOverlay}
      buildLineItemGroupQuestionContext={buildLineItemGroupQuestionContext}
      handleGuidedStepSelect={handleGuidedStepSelect}
      onDiagnostic={onDiagnostic}
    />
  );

  return (
    <>
      <div className="ck-form-sections">
        <FormStatusNotices
          language={language}
          recordStatusText={recordStatusText}
          recordStatusKey={recordStatusKey}
          hideRecordStatus={ingredientNameTransformEnabled}
          showWarningsBanner={showWarningsBanner}
          warningTop={warningTop}
          status={status}
          statusTone={statusTone}
          statusRef={statusRef}
          errors={errors}
          onNavigateToField={navigateToFieldKey}
        />

        <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
          <div className="ck-group-stack">
            {guidedEnabled ? (
              guidedContent
            ) : (
              <GroupedFormSections
                blocks={groupSectionBlocks}
                topVisibilityCtx={topVisibilityCtx}
                collapsedGroups={collapsedGroups}
                errors={errors}
                topLevelGroupProgress={topLevelGroupProgress}
                language={language}
                onToggleGroupCollapsed={toggleGroupCollapsed}
                renderQuestion={renderQuestion}
              />
            )}
          </div>
        </fieldset>
      </div>
      <LineSelectOverlay
        overlay={overlay}
        setOverlay={setOverlay}
        language={language}
        submitting={submitting}
        onDiagnostic={onDiagnostic}
        onBack={handleLineSelectOverlayBack}
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
