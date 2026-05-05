import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  getOptionStateValue,
  mergeOptionStateValue,
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
import { selectionEffectDependsOnField } from '../app/selectionEffectDependencies';
import { clearSelectionEffectSourceMetadata } from '../app/selectionEffectSourceMetadata';
import { resolveUploadBlockUntilSaved } from '../app/uploadTransaction';
import { resolveUploadWaitMessage } from '../app/uploadWaitMessages';
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  LocalizedString,
  OptionSet,
  QuestionGroupConfig,
  RowFlowConfig,
  RowFlowOutputSegmentConfig,
  StepMilestoneActionConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import type {
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
import { collectGuidedContextHeaderConfig } from '../features/steps/domain/guidedContextHeader';
import { buildGuidedLineGroupConfig } from '../features/steps/domain/guidedLineGroupConfig';
import { buildGuidedStepDefinitionAction } from '../features/steps/domain/guidedStepDefinition';
import {
  resolveGuidedClearOnChangeOrderedFieldIdsAction,
  resolveGuidedOrderedQuestionsAction
} from '../features/steps/domain/guidedStepQuestionOrder';
import {
  collectDerivedBlurDependencies,
  isBlurDerivedValue
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
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { resolveStatusPillKey } from '../utils/statusPill';
import { peekInlineHtmlTemplateCache, renderInlineHtmlTemplateApi } from '../api';
import { FormErrors, LineItemAddResult, LineItemState, OptionState } from '../types';
import { isEmptyValue } from '../utils/values';
import {
  applyUploadConstraints,
  clearLineItemGroupErrors,
  mergeLineItemGroupErrors,
  describeUploadItem,
  resolveFieldHelperText,
  formatOptionFilterNonMatchWarning,
  getUploadMinRequired,
  isUploadValueComplete,
  resolveRowDisclaimerText,
  resolveLineItemTableReadOnlyDisplay,
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
import { InfoOverlay } from './form/overlays/InfoOverlay';
import { LineOverlayState, LineSelectOverlay } from './form/overlays/LineSelectOverlay';
import { InfoTooltip } from './form/InfoTooltip';
import { DateInput } from './form/DateInput';
import { SearchableSelect } from './form/SearchableSelect';
import { SearchableMultiSelect } from './form/SearchableMultiSelect';
import { LineItemMultiAddSelect } from './form/LineItemMultiAddSelect';
import {
  TopOverlayOpenInlineButton,
  TopOverlayOpenReplaceButton,
  TopReadOnlyField
} from './form/TopFieldChrome';
import { useChoiceControlRenderer } from './form/useChoiceControlRenderer';
import { LineItemGroupQuestion } from './form/LineItemGroupQuestion';
import { LineItemTable } from './form/LineItemTable';
import { SectionInstruction } from './form/SectionInstruction';
import { HtmlPreview } from './app/HtmlPreview';
import { isGuidedStepAutoAdvanceAllowed } from '../app/stepAutoAdvance';
import { GroupedPairedFields } from './form/GroupedPairedFields';
import { buildFormGroupSections, buildPageSectionBlocks, resolveGroupSectionKey } from './form/grouping';
import { GroupedFormSections } from './form/GroupedFormSections';
import { FormStatusNotices } from './form/FormStatusNotices';
import { scrollFormGroupToTop } from './form/scrollFormGroupToTop';
import { useFormViewStateRefs } from './form/useFormViewStateRefs';
import { useFormBlurCoordinator } from './form/useFormBlurCoordinator';
import { LineItemGroupOverlayPill } from '../features/lineItems/components/LineItemGroupOverlayPill';
import { withListRowActionButtonStyle } from '../features/lineItems/components/lineItemActionButtonStyle';
import { TopFileUploadQuestion } from '../features/uploads/components/TopFileUploadQuestion';
import { LineFileUploadQuestion } from '../features/uploads/components/LineFileUploadQuestion';
import { LineFileUploadTableOpenControl } from '../features/uploads/components/LineFileUploadTableOpenControl';
import { FormFileOverlay } from '../features/uploads/components/FormFileOverlay';
import {
  useFormUploadController,
  type FileUploadOrderedEntryCheckArgs,
  type UploadRetryTarget
} from '../features/uploads/useFormUploadController';
import { buildSelectorOptionSet, resolveSelectorHelperText, resolveSelectorLabel, resolveSelectorPlaceholder } from './form/lineItemSelectors';
import { NumberStepper } from './form/NumberStepper';
import { applyValueMapsToForm, coerceDefaultValue, resolveValueMapValue } from './form/valueMaps';
import { isLineItemGroupQuestionComplete } from './form/completeness';
import { resolveAddOverlayCopy } from '../features/lineItems/domain/addOverlayCopy';
import {
  findFirstOrderedEntryIssue,
  findOrderedEntryBlock,
  isOrderedEntryValid,
  shouldDeferOrderedEntryGuidance,
  type OrderedEntryTarget
} from './form/orderedEntry';
import { resolveRowFlowSegmentActionIds } from '../features/steps/domain/rowFlow';
import {
  buildLineContextId,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  computeRowNonMatchOptions,
  findLineItemDedupConflict,
  normalizeLineItemDedupRules,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  parseSubgroupKey,
  recomputeLineItemNonMatchOptions,
  resolveLineItemRowLimits,
  isLineItemMaxRowsReached,
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY,
  resolveSubgroupKey,
  seedSubgroupDefaults
} from '../app/lineItems';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);
import { markRecipeIngredientsDirtyForGroupKey } from '../app/recipeIngredientsDirty';
import { applyLineItemGroupOverride, serializeLineItemTree } from '../app/lineItemTree';
import { applyLineItemRowSort } from '../app/lineItemRowSort';
import {
  isIngredientNameFieldId,
  isIngredientsManagementForm,
  normalizeIngredientNameIfAllCaps
} from '../app/ingredientsCreateRules';
import { runSelectionEffectsForAncestors } from '../app/runSelectionEffectsForAncestors';
import { applyExclusiveLineSelection } from '../app/exclusiveLineSelection';
import { resolveTemplateIdForRecord } from '../app/templateId';
import {
  reconcileAutoAddModeGroups,
  reconcileAutoAddModeSubgroups,
  reconcileOverlayAutoAddModeGroups,
  reconcileOverlayAutoAddModeSubgroups
} from '../app/autoAddModeOverlay';
import { applyClearOnChange, isClearOnChangeEnabled } from '../app/clearOnChange';
import { isPrimaryActionLabel, resolveButtonTonePrimary } from '../app/buttonTone';
import { isFieldDisabledByRule, resolveActiveFieldDisableRule } from '../app/fieldDisableRules';
import { removeUnlockParamFromHref, resolveUnlockRecordId, shouldBypassReadyForProductionLock } from '../app/readyForProductionLock';
import {
  buildParagraphDisclaimerSection,
  buildParagraphDisclaimerValue,
  resolveParagraphUserText,
  splitParagraphDisclaimerValue
} from '../app/paragraphDisclaimer';
import { getSystemFieldValue, type SystemRecordMeta } from '../../rules/systemFields';
import { containsLineItemsClause, containsParentLineItemsClause, matchesWhenClause } from '../../rules/visibility';
import { buildDraftPayload, resolveDraftPayloadFormKey, validateForm, validateUploadCounts } from '../app/submission';
import { GuidedContextHeader } from '../features/steps/components/GuidedContextHeader';
import { GuidedFormContent } from '../features/steps/components/GuidedFormContent';
import { renderGuidedTargetsWithPairing } from '../features/steps/components/renderGuidedTargetsWithPairing';
import { computeGuidedStepsStatus } from '../features/steps/domain/computeStepStatus';
import {
  shouldApplyGuidedExternalSyncSignal,
  type GuidedExternalSyncSignal
} from '../features/steps/domain/guidedExternalSyncSignal';
import { resolveGuidedStepIdAfterExternalSync } from '../features/steps/domain/resolveGuidedStepAfterExternalSync';
import { resolveVirtualStepField, type GuidedStepsVirtualState } from '../features/steps/domain/resolveVirtualStepField';
import { useGuidedStepVisibility } from '../features/steps/hooks/useGuidedStepVisibility';
import {
  isGuidedStepForwardGateSatisfied,
  normalizeGuidedAutoAdvance,
  normalizeGuidedForwardGate,
  resolveGuidedAutoAdvanceTransitionAction,
  resolveGuidedStepAutoAdvance,
  resolveGuidedStepForwardGate,
  resolveGuidedStepSelectionAction,
  resolveGuidedStepsVirtualState,
  resolveMaxReachableGuidedStepIndex
} from '../features/steps/domain/guidedNavigation';
import { resolveTableColumnWidthStyle } from '../features/lineItems/domain/tableColumnWidths';
import {
  areFieldValuesEqual,
  areOverlayHeaderFieldsComplete,
  collectLineItemConfigEntries,
  hasSelectionEffects,
  resolveLineItemDedupMessage,
  resolveLineItemDedupValueToken,
  resolveOverlayHeaderFields,
  resolveRequiredValue
} from '../features/lineItems/domain/formViewHelpers';
import {
  cloneLineItemStateSnapshot,
  detectGuidedReservationManagedRowRemovals,
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
  waitForGuidedStepReservationDraftSync
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
  const foodSafetyDiagnosticLoggedRef = useRef(false);
  const guidedVisibilityDiagnosticSignatureRef = useRef('');
  const rowFlowDiagnosticSignatureRef = useRef('');
  const rowFlowSegmentActionsDiagnosticSignatureRef = useRef('');
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

  useLayoutEffect(() => {
    const recordId = `${recordMeta?.id || ''}`.trim();
    const previousSnapshot = guidedReservationRemovalSyncSnapshotRef.current;
    const recordChanged = previousSnapshot.recordId !== recordId;
    const nextSnapshot = cloneLineItemStateSnapshot(lineItems);
    if (!guidedEnabled || !queueGuidedStepReservationDraftSync || !recordId) {
      guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
      return;
    }
    if (!previousSnapshot.lineItems || recordChanged) {
      guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
      return;
    }

    const impacts = detectGuidedReservationManagedRowRemovals({
      definition,
      stepId: activeGuidedStepId || '__all__',
      previousLineItems: previousSnapshot.lineItems,
      nextLineItems: nextSnapshot,
      mode: 'all'
    });

    guidedReservationRemovalSyncSnapshotRef.current = { recordId, lineItems: nextSnapshot };
    if (!impacts.length) return;

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
      onDiagnostic?.('guidedStep.reservationSync.queuedOnManagedRowRemoval', {
        recordId,
        activeStepId: activeGuidedStepId || null,
        stepId,
        impactCount: stepImpactList.length,
        removedRowIds,
        outputGroups: Array.from(new Set(stepImpactList.map(impact => impact.outputGroupId).filter(Boolean)))
      });
      queueGuidedStepReservationDraftSync({
        stepId,
        reason: `managedRowRemoval:${removedRowIds.join(',') || 'unknown'}`,
        persistSnapshot: false,
        snapshotLineItems: nextSnapshot
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

  // Emit a one-time diagnostic when guided steps are enabled for this form.
  useEffect(() => {
    if (!guidedEnabled) return;
    onDiagnostic?.('steps.enabled', { mode: 'guided', stepCount: guidedStepIds.length });
    onDiagnostic?.('steps.validation.noticeMode', { mode: 'fieldOnly' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedEnabled]);

  useEffect(() => {
    if (!guidedEnabled) return;
    const payload = {
      visibleStepIds: guidedStepIds,
      visibleStepCount: guidedStepIds.length,
      hiddenStepCount: Math.max(0, ((guidedStepsCfg?.items || []) as any[]).length - guidedStepIds.length)
    };
    const signature = JSON.stringify(payload);
    if (guidedVisibilityDiagnosticSignatureRef.current === signature) return;
    guidedVisibilityDiagnosticSignatureRef.current = signature;
    onDiagnostic?.('steps.visibility.resolved', payload);
  }, [guidedEnabled, guidedStepIds, guidedStepsCfg, onDiagnostic]);

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
    guidedVisibleSteps.forEach(step => {
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
  }, [guidedStepsCfg, guidedVisibleSteps]);

  const rowFlowSegmentActionTargets = useMemo(() => {
    if (!guidedStepsCfg) return [];
    const targets: Array<{ stepId: string; groupId: string; segmentsWithActions: number; multiActionSegments: number }> = [];
    guidedVisibleSteps.forEach(step => {
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
  }, [guidedStepsCfg, guidedVisibleSteps]);

  useEffect(() => {
    if (!rowFlowTargets.length) return;
    const payload = { targets: rowFlowTargets };
    const signature = JSON.stringify(payload);
    if (rowFlowDiagnosticSignatureRef.current === signature) return;
    rowFlowDiagnosticSignatureRef.current = signature;
    onDiagnostic?.('form.rowFlow.enabled', payload);
  }, [onDiagnostic, rowFlowTargets]);

  useEffect(() => {
    if (!rowFlowSegmentActionTargets.length) return;
    const payload = { targets: rowFlowSegmentActionTargets };
    const signature = JSON.stringify(payload);
    if (rowFlowSegmentActionsDiagnosticSignatureRef.current === signature) return;
    rowFlowSegmentActionsDiagnosticSignatureRef.current = signature;
    onDiagnostic?.('form.rowFlow.output.segmentActions.enabled', payload);
  }, [onDiagnostic, rowFlowSegmentActionTargets]);

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
      if (!guidedEnabled) return;
      if (!guidedStepsCfg || !guidedStepIds.length) return;
      if (activeGuidedStepIndex <= 0) return;
      const stepCfg = guidedVisibleSteps[activeGuidedStepIndex] as any;
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
    guidedVisibleSteps,
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
    const stepCfg = guidedVisibleSteps[activeGuidedStepIndex] as any;
    const isFinal = activeGuidedStepIndex >= guidedStepIds.length - 1;
    const forwardGate = resolveGuidedStepForwardGate(stepCfg, guidedDefaultForwardGate);
    const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
    const forwardGateSatisfied = isGuidedStepForwardGateSatisfied({
      gate: forwardGate,
      status: stepStatus,
      navigationBlocked: dedupNavigationBlocked
    });
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
    [definition, hasBlurDerived, onDiagnostic, setLineItems, setValues]
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
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
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
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
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
      tone: ((match as any).tone || 'primary').toString().trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary',
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

  const handleFileFieldChange = (
    question: WebQuestionDefinition,
    items: Array<string | File>,
    errorMessage?: string
  ) => {
    if (onStatusClear) onStatusClear();
    setValuesSynced(prev => ({ ...prev, [question.id]: items as unknown as FieldValue }));
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
    const existing = toUploadItems(valuesRef.current[question.id]);
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
      const uploadTarget: UploadRetryTarget = {
        scope: 'top',
        fieldPath: question.id,
        question,
        uploadConfig: (question as any)?.uploadConfig
      };
      clearUploadFailureForField(question.id);
      announceUpload(question.id, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: uploadTarget.scope,
        fieldPath: uploadTarget.fieldPath,
        questionId: question.id,
        items,
        uploadConfig: uploadTarget.uploadConfig,
        busyMessage: resolveUploadBlockUntilSaved(uploadTarget.uploadConfig)
          ? resolveUploadWaitMessage(uploadTarget.uploadConfig, language, 'save')
          : undefined
      })
        .then(res => {
          if (!res?.success) {
            const message = recordUploadFailure(uploadTarget, res?.message);
            announceUpload(question.id, message);
            return;
          }
          clearUploadFailureForField(question.id);
          announceUpload(question.id, tSystem('files.uploaded', language, 'Added'));
        })
        .catch((err: any) => {
          const message = recordUploadFailure(uploadTarget, err?.message);
          announceUpload(question.id, message);
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
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'top',
        question,
        fieldPath: question.id,
        source: 'input'
      })
    ) {
      resetNativeFileInput(question.id);
      return;
    }
    if (
      stageFilesInOverlay({
        scope: 'top',
        fieldPath: question.id,
        question,
        incoming: Array.from(list),
        onCommitBlockUntilSaved: items => {
          const uploadConfig = (question as any)?.uploadConfig || {};
          const uploadTarget: UploadRetryTarget = {
            scope: 'top',
            fieldPath: question.id,
            question,
            uploadConfig
          };
          handleFileFieldChange(question, items);
          clearUploadFailureForField(question.id);
          const waitMessage = resolveUploadWaitMessage(uploadConfig, language, 'save');
          announceUpload(question.id, waitMessage);
          onDiagnostic?.('upload.overlay.immediateSave.start', { fieldPath: question.id, scope: 'top', total: items.length });
          const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
            ? onUploadFiles({
                scope: 'top',
                fieldPath: question.id,
                questionId: question.id,
                items,
                uploadConfig,
                busyMessage: waitMessage
              })
            : Promise.resolve({ success: true, items: items.filter((item): item is string => typeof item === 'string') });
          void uploadPromise
            .then(res => {
              if (!res?.success) {
                const message = recordUploadFailure(uploadTarget, res?.message);
                announceUpload(question.id, message);
                updateFileOverlayAfterImmediateAction({ scope: 'top', fieldPath: question.id, items, saving: false });
                return;
              }
              const savedItems = Array.isArray(res.items) ? res.items : items.filter((item): item is string => typeof item === 'string');
              clearUploadFailureForField(question.id);
              announceUpload(question.id, tSystem('files.uploaded', language, 'Added'));
              updateFileOverlayAfterImmediateAction({ scope: 'top', fieldPath: question.id, items: savedItems, saving: false, saved: true });
              onDiagnostic?.('upload.overlay.immediateSave.success', { fieldPath: question.id, scope: 'top', total: savedItems.length });
            })
            .catch((err: any) => {
              const message = recordUploadFailure(uploadTarget, err?.message);
              announceUpload(question.id, message);
              updateFileOverlayAfterImmediateAction({ scope: 'top', fieldPath: question.id, items, saving: false });
            });
        }
      })
    ) {
      resetNativeFileInput(question.id);
      return;
    }
    processIncomingFiles(question, Array.from(list));
    resetNativeFileInput(question.id);
  };

  const sanitizePreset = useCallback((input?: Record<string, any>): Record<string, any> => {
    if (!input) return {};
    const next: Record<string, any> = { ...input };
    Object.keys(next).forEach(key => {
      const v = next[key];
      if (Array.isArray(v)) {
        next[key] = v[0];
      }
    });
    return next;
  }, []);

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

  const addLineItemRow = useCallback(
    (
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
      let nextWithRow: LineItemState = { ...prev, [groupId]: [row, ...current] };
      if (subgroupInfo?.subGroupId === 'MP_INGREDIENTS_LI') {
        const source = parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]);
        if (source === 'manual') {
          const marked = markRecipeIngredientsDirtyForGroupKey(nextWithRow, groupId);
          if (marked.changed) {
            nextWithRow = marked.lineItems;
            onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
              groupId,
              parentGroupKey: marked.parentGroupKey || null,
              parentRowId: marked.parentRowId || null,
              reason: 'rowAdded'
            });
          }
        }
      }
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
    },
    [
      computeRowNonMatchKeys,
      definition,
      onDiagnostic,
      resolveSubgroupDefs,
      sanitizePreset,
      setLineItems,
      setValues,
      subgroupSelectors,
      values
    ]
  );

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
        const message = resolveLineItemDedupMessage(dedupConflict.rule, language, valueToken ? { value: valueToken } : undefined);
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
    resolveSubgroupDefs,
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
    definition,
    values,
    optionState,
    language,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    onDiagnostic,
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
    definition,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    onDiagnostic,
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
    const marked = markRecipeIngredientsDirtyForGroupKey(cascade.lineItems, groupId);
    if (marked.changed) {
      onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
        groupId,
        parentGroupKey: marked.parentGroupKey || null,
        parentRowId: marked.parentRowId || null,
        reason: 'rowRemoved'
      });
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
    onDiagnostic?.('ui.lineItems.remove.cascade', { groupId, rowId, removedCount: cascade.removed.length });
    const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, marked.lineItems, {
      mode: 'init'
    });
    setValues(nextValues);
    setLineItems(recomputed);
    runSelectionEffectsForAncestorRows(groupId, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
  };

  const resolveVisibilityValue = useCallback(
    (fieldId: string): FieldValue | undefined => {
      if (guidedVirtualState) {
        const virtual = resolveVirtualStepField(fieldId, guidedVirtualState as any);
        if (virtual !== undefined) return virtual as FieldValue;
      }
      const dataSourceCount = resolveDataSourceCountValue(fieldId);
      if (dataSourceCount !== undefined) return dataSourceCount;
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
    [guidedVirtualState, lineItems, recordMeta, resolveDataSourceCountValue, values]
  );

  const topVisibilityCtx = useMemo(
    () => ({
      getValue: (fieldId: string) => resolveVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveVisibilityValue]
  );
  const unlockResolution = useMemo(() => {
    const globalAny = globalThis as any;
    const locationSearch = (() => {
      try {
        return globalAny?.location?.search || '';
      } catch {
        return '';
      }
    })();
    const locationHash = (() => {
      try {
        return globalAny?.location?.hash || '';
      } catch {
        return '';
      }
    })();
    const locationHref = (() => {
      try {
        return globalAny?.location?.href || '';
      } catch {
        return '';
      }
    })();
    return resolveUnlockRecordId({
      requestParams: globalAny?.__WEB_FORM_REQUEST_PARAMS__,
      bootstrap: globalAny?.__WEB_FORM_BOOTSTRAP__,
      search: locationSearch,
      hash: locationHash,
      href: locationHref
    });
  }, []);
  useEffect(() => {
    if (!onDiagnostic || !unlockResolution.unlockRecordId) return;
    onDiagnostic('readyForProduction.unlock.query', {
      unlockRecordId: unlockResolution.unlockRecordId,
      source: unlockResolution.source
    });
  }, [onDiagnostic, unlockResolution]);
  useEffect(() => {
    if (!unlockResolution.unlockRecordId) return;
    try {
      const globalAny = globalThis as any;
      const tryScrubWindowHref = (target: any, scope: 'self' | 'top'): boolean => {
        if (!target) return false;
        const hrefRaw = (target?.location?.href || '').toString();
        if (!hrefRaw) return false;
        const cleaned = removeUnlockParamFromHref(hrefRaw);
        if (!cleaned.changed || !cleaned.href || cleaned.href === hrefRaw) return false;
        const historyApi = target?.history;
        if (!historyApi || typeof historyApi.replaceState !== 'function') return false;
        historyApi.replaceState(historyApi.state || null, '', cleaned.href);
        onDiagnostic?.('readyForProduction.unlock.urlScrubbed', {
          source: unlockResolution.source,
          scope,
          changed: true
        });
        return true;
      };
      tryScrubWindowHref(globalAny, 'self');
      if (globalAny?.top && globalAny.top !== globalAny) {
        try {
          tryScrubWindowHref(globalAny.top, 'top');
        } catch (_) {
          // ignore cross-origin access failures
        }
      }
    } catch (_) {
      onDiagnostic?.('readyForProduction.unlock.urlScrubbed.error', {
        source: unlockResolution.source
      });
    }
  }, [onDiagnostic, unlockResolution.unlockRecordId, unlockResolution.source]);
  const activeFieldDisableRule = useMemo(
    () =>
      resolveActiveFieldDisableRule({
        rules: definition.fieldDisableRules,
        matchesWhen: when => matchesWhenClause(when, topVisibilityCtx)
      }),
    [definition.fieldDisableRules, topVisibilityCtx]
  );
  const bypassReadyForProductionLock = useMemo(
    () =>
      shouldBypassReadyForProductionLock({
        activeRuleId: activeFieldDisableRule?.id,
        unlockRecordId: unlockResolution.unlockRecordId,
        recordId: recordMeta?.id !== undefined && recordMeta?.id !== null ? recordMeta.id.toString() : undefined
      }),
    [activeFieldDisableRule?.id, recordMeta?.id, unlockResolution.unlockRecordId]
  );
  const effectiveFieldDisableRule = bypassReadyForProductionLock ? undefined : activeFieldDisableRule;
  const activeFieldDisableRuleKeyRef = useRef<string>('');
  useEffect(() => {
    if (!onDiagnostic) return;
    const nextKey = effectiveFieldDisableRule
      ? `${effectiveFieldDisableRule.id || '__anonymous__'}::${(effectiveFieldDisableRule.bypassFields || []).join(',')}`
      : bypassReadyForProductionLock
        ? `unlock::${unlockResolution.unlockRecordId || ''}::${(recordMeta?.id || '').toString()}`
        : '';
    if (activeFieldDisableRuleKeyRef.current === nextKey) return;
    activeFieldDisableRuleKeyRef.current = nextKey;
    onDiagnostic('fieldDisableRules.state', {
      active: Boolean(effectiveFieldDisableRule),
      ruleId: effectiveFieldDisableRule?.id || null,
      matchedRuleId: activeFieldDisableRule?.id || null,
      bypassFields: effectiveFieldDisableRule?.bypassFields || [],
      unlockOverrideActive: bypassReadyForProductionLock,
      unlockRecordId: unlockResolution.unlockRecordId || null,
      unlockSource: unlockResolution.source,
      recordId: recordMeta?.id || null,
              recordMeta,
      reason: bypassReadyForProductionLock ? 'unlockOverride' : effectiveFieldDisableRule ? 'matched' : 'noMatch'
    });
  }, [
    activeFieldDisableRule?.id,
    bypassReadyForProductionLock,
    effectiveFieldDisableRule,
    onDiagnostic,
    recordMeta,
    recordMeta?.id,
    unlockResolution
  ]);
  const isFieldLockedByDedup = useCallback(
    (fieldId: string): boolean => isFieldDisabledByRule(fieldId, effectiveFieldDisableRule),
    [effectiveFieldDisableRule]
  );

  const resolveTopValueNoScan = useCallback(
    (sourceValues: Record<string, FieldValue>, fieldId: string): FieldValue | undefined => {
      if (guidedVirtualState) {
        const virtual = resolveVirtualStepField(fieldId, guidedVirtualState as any);
        if (virtual !== undefined) return virtual as FieldValue;
      }
      const dataSourceCount = resolveDataSourceCountValue(fieldId);
      if (dataSourceCount !== undefined) return dataSourceCount;
      const direct = sourceValues[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      const sys = getSystemFieldValue(fieldId, recordMeta);
      if (sys !== undefined) return sys as FieldValue;
      return undefined;
    },
    [guidedVirtualState, recordMeta, resolveDataSourceCountValue]
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

  const orderedEntryValidationDefinition = useMemo(() => {
    if (!orderedEntryEnabled) return definition;
    if (!guidedEnabled) return definition;
    return buildGuidedStepDefinition(activeGuidedStepId) || definition;
  }, [activeGuidedStepId, buildGuidedStepDefinition, definition, guidedEnabled, orderedEntryEnabled]);

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
    if (!orderedEntryValidationDefinition?.questions?.length) return null;
    try {
      return validateForm({
        definition: orderedEntryValidationDefinition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups,
        virtualState: guidedVirtualState
      });
    } catch (err: any) {
      onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      return null;
    }
  }, [
    collapsedRows,
    collapsedSubgroups,
    language,
    lineItems,
    onDiagnostic,
    orderedEntryEnabled,
    orderedEntryValidationDefinition,
    guidedVirtualState,
    values
  ]);

  const firstOrderedEntryIssue = useMemo(() => {
    if (!orderedEntryEnabled) return null;
    return findFirstOrderedEntryIssue({
      definition: orderedEntryValidationDefinition,
      language,
      values,
      lineItems,
      errors: orderedEntryErrors,
      collapsedRows,
      resolveVisibilityValue,
      getTopValue: getTopValueNoScan,
      orderedQuestions: orderedEntryQuestions
    });
  }, [
    collapsedRows,
    getTopValueNoScan,
    language,
    lineItems,
    orderedEntryEnabled,
    orderedEntryErrors,
    orderedEntryValidationDefinition,
    orderedEntryQuestions,
    resolveVisibilityValue,
    values
  ]);

  const orderedEntryValid = useMemo(() => {
    return isOrderedEntryValid({
      enabled: orderedEntryEnabled,
      errors: orderedEntryErrors,
      firstIssue: firstOrderedEntryIssue
    });
  }, [firstOrderedEntryIssue, orderedEntryEnabled, orderedEntryErrors]);

  const buildOrderedEntryErrors = useCallback(
    (missingFieldPath: string, allErrors: FormErrors): FormErrors => {
      if (!missingFieldPath) return allErrors || {};
      const fromAll = allErrors?.[missingFieldPath];
      if (fromAll) return { [missingFieldPath]: fromAll };
      const parts = missingFieldPath.split('__').filter(Boolean);
      let label = '';
      let configuredFieldMessage = '';
      const resolveRuleMessage = (source: any): string => {
        const fieldSpecific = resolveLocalizedString(source?.orderedEntryErrorMessage, language, '')
          .toString()
          .trim();
        if (fieldSpecific) return fieldSpecific;
        const rules = Array.isArray(source?.validationRules) ? source.validationRules : [];
        const requiredRule = rules.find((rule: any) => {
          const then = rule?.then;
          return then && typeof then === 'object' && then.required === true;
        });
        return resolveLocalizedString(requiredRule?.message, language, '')
          .toString()
          .trim();
      };
      if (parts.length >= 2) {
        const [groupId, fieldId] = parts;
        const group = (definition.questions || []).find(q => q.id === groupId);
        const field = group?.lineItemConfig?.fields?.find((f: any) => (f?.id ?? '').toString() === fieldId);
        if (field) {
          label = resolveFieldLabel(field, language, fieldId);
          configuredFieldMessage = resolveRuleMessage(field);
        }
      } else {
        const q = (definition.questions || []).find(q => q.id === missingFieldPath);
        if (q) {
          label = resolveFieldLabel(q, language, q.id);
          configuredFieldMessage = resolveRuleMessage(q);
        }
      }
      const fallbackLabel = label || missingFieldPath;
      const configuredMessage = resolveLocalizedString(
        definition.submitValidation?.orderedEntryFieldErrorMessage,
        language,
        ''
      )
        .toString()
        .trim();
      const message = configuredFieldMessage
        ? configuredFieldMessage.replace(/\{field\}/g, fallbackLabel)
        : configuredMessage
        ? configuredMessage.replace(/\{field\}/g, fallbackLabel)
        : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fallbackLabel });
      return {
        [missingFieldPath]: message
      };
    },
    [definition.questions, definition.submitValidation?.orderedEntryFieldErrorMessage, language]
  );

  useEffect(() => {
    if (!onFormValidityChange) return;
    onFormValidityChange(orderedEntryValid);
  }, [onFormValidityChange, orderedEntryValid]);

  const resolveOrderedEntryBlock = useCallback(
    (target: OrderedEntryTarget, targetGroup?: WebQuestionDefinition) => {
      if (!orderedEntryEnabled) return null;
      return findOrderedEntryBlock({
        definition: orderedEntryValidationDefinition,
        language,
        values,
        lineItems,
        errors: orderedEntryErrors,
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
      getTopValueNoScan,
      language,
      lineItems,
      orderedEntryErrors,
      orderedEntryEnabled,
      orderedEntryValidationDefinition,
      orderedEntryQuestions,
      resolveVisibilityValue,
      values
    ]
  );

  const triggerOrderedEntryValidation = useCallback(
    (
      target: OrderedEntryTarget,
      missingFieldPath: string,
      options?: { navigate?: boolean; source?: string; scrollOnly?: boolean; allowOverlayOpen?: boolean }
    ) => {
      let nextErrors: FormErrors = {};
      try {
        nextErrors = validateForm({
          definition: orderedEntryValidationDefinition,
          language,
          values,
          lineItems,
          collapsedRows,
          collapsedSubgroups,
          virtualState: guidedVirtualState
        });
      } catch (err: any) {
        onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      }
      orderedEntryGuideFieldPathRef.current = missingFieldPath;
      setErrors(buildOrderedEntryErrors(missingFieldPath, nextErrors));
      const shouldNavigate = options?.navigate !== false || options?.scrollOnly === true;
      if (shouldNavigate) {
        requestValidationNavigation({
          scope: 'orderedEntry',
          scrollOnly: options?.scrollOnly,
          allowOverlayOpen: options?.allowOverlayOpen
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
    [
      buildOrderedEntryErrors,
      collapsedRows,
      collapsedSubgroups,
      guidedVirtualState,
      language,
      lineItems,
      onDiagnostic,
      orderedEntryValidationDefinition,
      requestValidationNavigation,
      setErrors,
      values
    ]
  );

  useEffect(() => {
    if (!orderedEntryEnabled || submitting) return;
    const missingFieldPath = firstOrderedEntryIssue?.missingFieldPath || '';
    if (!missingFieldPath) {
      orderedEntryGuideFieldPathRef.current = null;
      return;
    }

    const currentGuidePath = orderedEntryGuideFieldPathRef.current;
    const currentKeys = Object.keys(errors || {});
    const hasNonGuidanceErrors = currentKeys.some(key => key !== currentGuidePath);
    if (hasNonGuidanceErrors) return;

    const nextErrors = buildOrderedEntryErrors(missingFieldPath, (orderedEntryErrors || {}) as FormErrors);
    const nextKeys = Object.keys(nextErrors);
    const sameErrors =
      nextKeys.length === currentKeys.length &&
      nextKeys.every(key => errors[key] === nextErrors[key]);

    orderedEntryGuideFieldPathRef.current = missingFieldPath;
    if (!sameErrors) {
      setErrors(nextErrors);
    }

    if (currentGuidePath === missingFieldPath) return;
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const activeTag = (activeEl?.tagName || '').toLowerCase();
    if (shouldDeferOrderedEntryGuidance({ issue: firstOrderedEntryIssue, activeTag })) return;
    requestValidationNavigation({
      scope: 'orderedEntryAuto',
      mode: 'scroll',
      allowOverlayOpen: false
    });
  }, [
    buildOrderedEntryErrors,
    errors,
    firstOrderedEntryIssue,
    onDiagnostic,
    orderedEntryEnabled,
    orderedEntryErrors,
    requestValidationNavigation,
    setErrors,
    submitting
  ]);

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
        const { userText, sectionText: _storedSection, hasDisclaimer, marker } = splitParagraphDisclaimerValue({
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

  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (submitting) return;
    // Allow edits to proceed; readOnly/valueMap are enforced at the input level.
    if (q.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup(q.id)) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'fieldDisableRule' });
      return;
    }
    const orderedBlock = resolveOrderedEntryBlock({ scope: 'top', questionId: q.id });
    if (orderedBlock) {
      blurActiveElement('orderedEntry.blocked', { scope: 'top', fieldId: q.id });
      triggerOrderedEntryValidation({ scope: 'top', questionId: q.id }, orderedBlock.missingFieldPath, {
        source: 'change'
      });
      return;
    }
    const nextValue =
      ingredientNameTransformEnabled && isIngredientNameFieldId(q.id) && typeof value === 'string'
        ? normalizeIngredientNameIfAllCaps(value)
        : value;
    guidedLastUserEditAtRef.current = Date.now();
    const userEditResult = onUserEdit?.({ scope: 'top', fieldPath: q.id, fieldId: q.id, event: 'change', nextValue });
    clearOverlayOpenActionSuppression(q.id);
    if (onStatusClear) onStatusClear();
    if (userEditResult?.deferMutation) return;
    const currentValues = valuesRef.current;
    const currentLineItems = lineItemsRef.current;
    if (
      isClearOnChangeEnabled((q as any).clearOnChange) &&
      !isEmptyValue(currentValues[q.id]) &&
      !isEmptyValue(nextValue) &&
      !areFieldValuesEqual(currentValues[q.id], nextValue)
    ) {
      const cleared = applyClearOnChange({
        definition,
        values: currentValues,
        lineItems: currentLineItems,
        fieldId: q.id,
        nextValue,
        orderedFieldIds: clearOnChangeOrderedFieldIds
      });
      let nextValuesAfterClear = cleared.values;
      let nextLineItemsAfterClear = cleared.lineItems;
      const reconciledGroups = reconcileAutoAddModeGroups({
        definition,
        values: nextValuesAfterClear,
        lineItems: nextLineItemsAfterClear,
        optionState,
        language,
        ensureLineOptions
      });
      if (reconciledGroups.changed) {
        nextValuesAfterClear = reconciledGroups.values;
        nextLineItemsAfterClear = reconciledGroups.lineItems;
      }
      const reconciledSubgroups = reconcileAutoAddModeSubgroups({
        definition,
        values: nextValuesAfterClear,
        lineItems: nextLineItemsAfterClear,
        optionState,
        language,
        subgroupSelectors,
        ensureLineOptions
      });
      if (reconciledSubgroups.changed) {
        nextValuesAfterClear = reconciledSubgroups.values;
        nextLineItemsAfterClear = reconciledSubgroups.lineItems;
      }
      onDiagnostic?.('field.clearOnChange', {
        fieldId: q.id,
        clearedFieldCount: cleared.clearedFieldIds.length,
        clearedGroupCount: cleared.clearedGroupKeys.length,
        autoAddGroupRebuilds: reconciledGroups.changedCount,
        autoAddSubgroupRebuilds: reconciledSubgroups.changedCount
      });
      setValues(nextValuesAfterClear);
      setLineItems(nextLineItemsAfterClear);
      valuesRef.current = nextValuesAfterClear;
      lineItemsRef.current = nextLineItemsAfterClear;
      setErrors({});
      if (onSelectionEffect) {
        onSelectionEffect(q, nextValue, {
          snapshots: {
            values: nextValuesAfterClear,
            lineItems: nextLineItemsAfterClear
          }
        });
      }
      return;
    }
    const baseValues = { ...currentValues, [q.id]: nextValue };
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
      onSelectionEffect(q, nextValue, {
        snapshots: {
          values: nextValues,
          lineItems: nextLineItems
        }
      });
    }
  };

  const handleLineFieldChange = (
    group: WebQuestionDefinition,
    rowId: string,
    field: any,
    value: FieldValue,
    options?: { source?: 'user' | 'selectionEffectInit' }
  ) => {
    if (submitting) return;
    const changeSource = options?.source === 'selectionEffectInit' ? 'selectionEffectInit' : 'user';
    // Allow edits to proceed; readOnly/valueMap are enforced at the input level.
    if (field?.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'line', fieldPath: `${group.id}__${field?.id || ''}__${rowId}`, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup((field?.id || '').toString())) {
      onDiagnostic?.('field.change.blocked', {
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        reason: 'fieldDisableRule'
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
    if (orderedBlock && changeSource !== 'selectionEffectInit') {
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
        { source: 'change' }
      );
      return;
    }
    let userEditResult: UserEditResult | void = undefined;
    if (changeSource === 'selectionEffectInit') {
      onAutomatedMutation?.({
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        fieldId: (field?.id || '').toString(),
        groupId: group.id,
        rowId,
        source: 'selectionEffectInit',
        nextValue: value
      });
    } else {
      guidedLastUserEditAtRef.current = Date.now();
      userEditResult = onUserEdit?.({
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        fieldId: (field?.id || '').toString(),
        groupId: group.id,
        rowId,
        event: 'change',
        nextValue: value
      });
    }
    clearOverlayOpenActionSuppression(`${group.id}__${field?.id || ''}__${rowId}`);
    if (onStatusClear) onStatusClear();
    if (userEditResult?.deferMutation) return;
    const skipSelectionEffects = userEditResult?.skipSelectionEffects === true;
    const currentLineItems = lineItemsRef.current;
    const currentValues = valuesRef.current;
    const existingRows = currentLineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    let nextRowValues: Record<string, FieldValue> = { ...(currentRow?.values || {}), [field.id]: value };
    if (changeSource !== 'selectionEffectInit') {
      nextRowValues = clearSelectionEffectSourceMetadata(nextRowValues, field, (field?.id || '').toString());
    }
    const dedupRules = normalizeLineItemDedupRules((group.lineItemConfig as any)?.dedupRules);
    const dedupRuleMessages = dedupRules
      .map(rule => {
        const fieldId = (rule.fields || []).map(fid => (fid ?? '').toString().trim()).filter(Boolean)[0];
        if (!fieldId) return null;
        const valueToken = resolveLineItemDedupValueToken(nextRowValues, fieldId);
        return {
          fieldId,
          message: resolveLineItemDedupMessage(rule, language, valueToken ? { value: valueToken } : undefined),
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
        language,
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
    updatedLineItems = applyExclusiveLineSelection({
      lineItems: updatedLineItems,
      groupKey: group.id,
      rowId,
      fieldId: (field?.id || '').toString(),
      value,
      rowValues: nextRowValues,
      config: (field as any)?.ui?.exclusiveLineSelection
    });
    if (changeSource !== 'selectionEffectInit') {
      const marked = markRecipeIngredientsDirtyForGroupKey(updatedLineItems, group.id);
      if (marked.changed) {
        updatedLineItems = marked.lineItems;
        onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
          groupId: group.id,
          parentGroupKey: marked.parentGroupKey || null,
          parentRowId: marked.parentRowId || null,
          reason: 'fieldChange',
          fieldId: (field?.id || '').toString()
        });
      }
    }
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
    if (onSelectionEffect && !skipSelectionEffects) {
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
              forceContextReset: true,
              ...(changeSource === 'selectionEffectInit' ? { preferLookupSourceValue: true } : {}),
              snapshots: {
                values: nextValues,
                lineItems: syncedLineItems
              }
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
            forceContextReset: true,
            ...(changeSource === 'selectionEffectInit' ? { preferLookupSourceValue: true } : {}),
            snapshots: {
              values: nextValues,
              lineItems: syncedLineItems
            }
          });
        });
      }

      runSelectionEffectsForAncestorRows(group.id, currentLineItems, syncedLineItems, { mode: 'change', topValues: nextValues });
    } else if (skipSelectionEffects) {
      onDiagnostic?.('field.change.selectionEffects.held', {
        scope: 'line',
        groupId: group.id,
        rowId,
        fieldId: (field?.id || '').toString(),
        reason: 'fieldChangeDialog.number.pending'
      });
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
    const existingRows = lineItemsRef.current[group.id] || [];
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
      const uploadTarget: UploadRetryTarget = {
        scope: 'line',
        fieldPath,
        group,
        rowId,
        field,
        uploadConfig: field.uploadConfig
      };
      clearUploadFailureForField(fieldPath);
      announceUpload(fieldPath, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: uploadTarget.scope,
        fieldPath: uploadTarget.fieldPath,
        groupId: group.id,
        rowId,
        fieldId: field.id,
        items: files,
        uploadConfig: uploadTarget.uploadConfig,
        busyMessage: resolveUploadBlockUntilSaved(uploadTarget.uploadConfig)
          ? resolveUploadWaitMessage(uploadTarget.uploadConfig, language, 'save')
          : undefined
      })
        .then(res => {
          if (!res?.success) {
            const message = recordUploadFailure(uploadTarget, res?.message);
            announceUpload(fieldPath, message);
            return;
          }
          clearUploadFailureForField(fieldPath);
          announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
        })
        .catch((err: any) => {
          const message = recordUploadFailure(uploadTarget, err?.message);
          announceUpload(fieldPath, message);
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
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'line',
        group,
        rowId,
        field,
        fieldPath,
        source: 'input'
      })
    ) {
      resetNativeFileInput(fieldPath);
      return;
    }
    if (
      stageFilesInOverlay({
        scope: 'line',
        fieldPath,
        field,
        incoming: Array.from(list),
        onCommitBlockUntilSaved: items => {
          const uploadConfig = field.uploadConfig || {};
          const uploadTarget: UploadRetryTarget = {
            scope: 'line',
            fieldPath,
            group,
            rowId,
            field,
            uploadConfig
          };
          handleLineFieldChange(group, rowId, field, items as unknown as FieldValue);
          clearUploadFailureForField(fieldPath);
          const waitMessage = resolveUploadWaitMessage(uploadConfig, language, 'save');
          announceUpload(fieldPath, waitMessage);
          onDiagnostic?.('upload.overlay.immediateSave.start', { fieldPath, scope: 'line', total: items.length });
          const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
            ? onUploadFiles({
                scope: 'line',
                fieldPath,
                groupId: group.id,
                rowId,
                fieldId: field.id,
                items,
                uploadConfig,
                busyMessage: waitMessage
              })
            : Promise.resolve({ success: true, items: items.filter((item): item is string => typeof item === 'string') });
          void uploadPromise
            .then(res => {
              if (!res?.success) {
                const message = recordUploadFailure(uploadTarget, res?.message);
                announceUpload(fieldPath, message);
                updateFileOverlayAfterImmediateAction({ scope: 'line', fieldPath, items, saving: false });
                return;
              }
              const savedItems = Array.isArray(res.items) ? res.items : items.filter((item): item is string => typeof item === 'string');
              clearUploadFailureForField(fieldPath);
              announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
              updateFileOverlayAfterImmediateAction({ scope: 'line', fieldPath, items: savedItems, saving: false, saved: true });
              onDiagnostic?.('upload.overlay.immediateSave.success', { fieldPath, scope: 'line', total: savedItems.length });
            })
            .catch((err: any) => {
              const message = recordUploadFailure(uploadTarget, err?.message);
              announceUpload(fieldPath, message);
              updateFileOverlayAfterImmediateAction({ scope: 'line', fieldPath, items, saving: false });
            });
        }
      })
    ) {
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
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'line',
        group,
        rowId,
        field,
        fieldPath,
        source: 'drop'
      })
    ) {
      resetDrag(fieldPath);
      return;
    }
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
    const existingRows = lineItemsRef.current[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    if (!existingFiles.length) return;
    const removed = existingFiles[index];
    const next = existingFiles.filter((_, idx) => idx !== index);
    handleLineFieldChange(group, rowId, field, next as unknown as FieldValue);
    clearUploadFailureForField(fieldPath);
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
    clearUploadFailureForField(fieldPath);
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
  }, [collapsedRows, getTopValueNoScan, groupSections, language, lineItems, topVisibilityCtx, values]);

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
    const allowed = computeAllowedOptions(q.optionFilter, optionSet, dependencyValues(q.optionFilter?.dependsOn || []));
    const currentVal = values[q.id];
    const allowedWithCurrent =
      currentVal && typeof currentVal === 'string' && !allowed.includes(currentVal) ? [...allowed, currentVal] : allowed;
    const opts = buildLocalizedOptions(optionSet, allowedWithCurrent, language, { sort: optionSortFor(q) });
    const hidden = shouldHideField(q.visibility, topVisibilityCtx);
    if (hidden) return null;
    const hideFieldLabel = q.ui?.hideLabel === true;
    const inGrid = renderOpts?.inGrid === true;
    const labelLayoutRaw = (((q.ui as any)?.labelLayout || '') as string).toString().trim().toLowerCase();
    const forceStackedLabel = labelLayoutRaw === 'stacked';
    const forceInlineLabel = labelLayoutRaw === 'inline';
    const labelLayoutClass = forceStackedLabel ? ' ck-label-stacked' : forceInlineLabel ? ' ck-label-inline' : '';
    // In paired grids, keep the label in layout so control rows align even when a label is hidden/missing.
    const labelStyle = hideFieldLabel ? (inGrid ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : srOnly) : undefined;
    const renderAsLabel = q.ui?.renderAsLabel === true || q.readOnly === true;
    const renderReadOnly = (display: React.ReactNode, opts?: { stacked?: boolean; inline?: boolean }) => (
      <TopReadOnlyField
        q={q}
        language={language}
        labelStyle={labelStyle}
        errors={errors}
        hasWarning={hasWarning}
        renderWarnings={renderWarnings}
        display={display}
        stacked={opts?.stacked}
        inline={opts?.inline}
      />
    );

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
    const renderOverlayOpenReplaceButton = (displayValue?: string | null) => (
      <TopOverlayOpenReplaceButton
        q={q}
        language={language}
        labelStyle={labelStyle}
        errors={errors}
        hasWarning={hasWarning}
        renderWarnings={renderWarnings}
        labelLayoutClass={labelLayoutClass}
        showResetButton={overlayOpenAction?.hideTrashIcon !== true}
        tone={overlayOpenAction?.tone === 'secondary' ? 'secondary' : 'primary'}
        displayValue={displayValue}
        disabled={overlayOpenDisabled}
        resetDisabled={overlayOpenActionResetDisabled}
        buttonText={overlayOpenButtonText}
        onOpen={handleOverlayOpenAction}
        onReset={handleOverlayOpenActionReset}
      />
    );
    const renderOverlayOpenInlineButton = (displayValue?: string | null) => {
      if (!overlayOpenAction || overlayOpenRenderMode !== 'inline') return null;
      return (
        <TopOverlayOpenInlineButton
          tone={overlayOpenAction.tone === 'secondary' ? 'secondary' : 'primary'}
          displayValue={displayValue}
          disabled={overlayOpenDisabled}
          buttonText={overlayOpenButtonText}
          onOpen={handleOverlayOpenAction}
        />
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
        const primary = resolveButtonTonePrimary(label, (q as any)?.button?.tone);
        const busyThis = !!reportBusy && reportBusyId === q.id;
        const disabled = submitting || isFieldLockedByDedup(q.id) || !onReportButton || !!reportBusy;
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const helperNode = helperText ? <div className="ck-field-helper">{helperText}</div> : null;
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
              onPointerDown={() => onReportButtonPointerDown?.(q.id)}
              onClick={() => onReportButton?.(q.id)}
              disabled={disabled}
              style={withDisabled(primary ? buttonStyles.primary : buttonStyles.secondary, disabled)}
            >
              {busyThis ? tSystem('common.loading', language, 'Loading…') : label}
            </button>
            {helperNode}
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
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperTextBelowLabel = helperCfg.belowLabelText;
        const helperTextPlaceholder = helperCfg.placeholderText;
        const supportsPlaceholder = q.type === 'TEXT' || q.type === 'PARAGRAPH' || q.type === 'NUMBER';
        const isEditableField =
          !renderAsLabel && !useValueMap && !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const helperId = helperTextBelowLabel && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode =
          helperTextBelowLabel && isEditableField ? (
            <div id={helperId} className="ck-field-helper">
              {helperTextBelowLabel}
            </div>
          ) : null;
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(displayText || null);
        }
        if (renderAsLabel) {
          return renderReadOnly(displayValue || null, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        if (q.type === 'NUMBER') {
          const placeholder = supportsPlaceholder && helperTextPlaceholder && isEditableField ? helperTextPlaceholder : undefined;
          const numericOnlyMessage = tSystem('validation.numberOnly', language, 'Only numbers are allowed in this field.');
          return (
            <div
              key={q.id}
              className={`field inline-field${labelLayoutClass}`}
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
                ariaDescribedBy={helperId}
                placeholder={placeholder}
                onInvalidInput={
                  isEditableField
                    ? ({ reason, value }) => {
                  setErrors(prev => {
                    const next = { ...prev };
                    const existing = next[q.id];
                    if (existing && existing !== numericOnlyMessage) return prev;
                    if (existing === numericOnlyMessage) return prev;
                    next[q.id] = numericOnlyMessage;
                    return next;
                  });
                  onDiagnostic?.('field.number.invalidInput', { scope: 'top', fieldId: q.id, reason, value });
                }
                    : undefined
                }
                onChange={next => handleFieldChange(q, next)}
              />
              {helperNode}
              {renderOverlayOpenInlineButton(displayText || null)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        const placeholder = supportsPlaceholder && helperTextPlaceholder && isEditableField ? helperTextPlaceholder : undefined;
        return (
          <div
            key={q.id}
            className={`${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
              labelLayoutClass
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
                    placeholder={placeholder}
                    aria-describedby={helperId}
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
                  placeholder={placeholder}
                  aria-describedby={helperId}
                />
              )
            ) : q.type === 'DATE' ? (
              <DateInput
                value={inputValue}
                language={language}
                min={(q as any)?.ui?.minDate}
                max={(q as any)?.ui?.maxDate}
                correctionMessages={(q as any)?.ui?.dateCorrectionMessages}
                iosNativeCommitMode="deferWhileFocused"
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                ariaLabel={resolveLabel(q, language)}
                ariaDescribedBy={helperId}
                onChange={next => handleFieldChange(q, next)}
              />
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={useValueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                placeholder={placeholder}
                aria-describedby={helperId}
              />
            )}
            {helperNode}
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
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const isEditableField = !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const placeholder = helperCfg.placeholderText && isEditableField ? helperCfg.placeholderText : undefined;
        const helperId = helperText && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode = helperText && isEditableField ? (
          <div id={helperId} className="ck-field-helper">
            {helperText}
          </div>
        ) : null;
        if (overlayOpenAction && overlayOpenRenderMode === 'replace') {
          return renderOverlayOpenReplaceButton(display);
        }
        if (renderAsLabel) {
          return renderReadOnly(display, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        return (
          <div
            key={q.id}
            className={`field inline-field ck-full-width${labelLayoutClass}`}
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
              placeholder,
              searchEnabled: q.ui?.choiceSearchEnabled,
              override: q.ui?.control,
              disabled: submitting || q.readOnly === true || isFieldLockedByDedup(q.id),
              onChange: next => handleFieldChange(q, next)
            })}
            {helperNode}
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
        const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
        const helperText = helperCfg.belowLabelText;
        const isEditableField = !submitting && q.readOnly !== true && !isFieldLockedByDedup(q.id);
        const placeholder =
          helperCfg.placeholderText || tSystem('common.selectPlaceholder', language, 'Select…');
        const helperId = helperText && isEditableField ? `ck-field-helper-${q.id}` : undefined;
        const helperNode = helperText && isEditableField ? (
          <div id={helperId} className="ck-field-helper">
            {helperText}
          </div>
        ) : null;
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
          return renderReadOnly(display, { stacked: forceStackedLabel, inline: forceInlineLabel });
        }
        if (isConsentCheckbox) {
          const consentLabel = resolveLabel(q, language);
          return (
            <div
              key={q.id}
              className={`field inline-field ck-consent-field${labelLayoutClass}`}
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
              {helperNode}
              {renderOverlayOpenInlineButton(display)}
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        const controlOverride = (q.ui?.control || '').toString().trim().toLowerCase();
        const renderAsMultiSelect = controlOverride === 'select';
        const multiSelectCheckboxSizePx = (() => {
          const raw = q.ui?.multiSelectCheckboxSizePx;
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return undefined;
          return Math.max(16, Math.min(40, Math.round(parsed)));
        })();
        return (
          <div
            key={q.id}
            className={`field inline-field${labelLayoutClass}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderAsMultiSelect ? (
              <SearchableMultiSelect
                value={selected}
                options={opts.map(opt => ({
                  value: opt.value,
                  label: opt.label,
                  searchText: opt.searchText
                }))}
                disabled={submitting || q.readOnly === true || isFieldLockedByDedup(q.id)}
                placeholder={placeholder}
                aria-label={resolveLabel(q, language)}
                checkboxSizePx={multiSelectCheckboxSizePx}
                onChange={next => {
                  if (submitting || q.readOnly === true || isFieldLockedByDedup(q.id)) return;
                  onDiagnostic?.('ui.checkbox.select.change', { fieldPath: q.id, selectedCount: next.length });
                  handleFieldChange(q, next);
                }}
              />
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
            {helperNode}
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
      case 'FILE_UPLOAD':
        return (
          <TopFileUploadQuestion
            key={q.id}
            q={q}
            language={language}
            value={values[q.id]}
            submitting={submitting}
            renderAsLabel={renderAsLabel}
            forceStackedLabel={forceStackedLabel}
            forceInlineLabel={forceInlineLabel}
            labelLayoutClass={labelLayoutClass}
            labelStyle={labelStyle}
            errors={errors}
            hasWarning={hasWarning}
            renderWarnings={renderWarnings}
            isFieldLockedByDedup={isFieldLockedByDedup}
            checkFileUploadOrderedEntry={checkFileUploadOrderedEntry}
            openFileOverlay={openFileOverlay}
            handleFileInputChange={handleFileInputChange}
            fileInputsRef={fileInputsRef}
            uploadAnnouncements={uploadAnnouncements}
            renderUploadFailure={renderUploadFailure}
            renderReadOnly={renderReadOnly}
            onDiagnostic={onDiagnostic}
          />
        );
      case 'LINE_ITEM_GROUP': {
        const groupOverlayEnabled = !!q.lineItemConfig?.ui?.openInOverlay;
        const locked = submitting || isFieldLockedByDedup(q.id);

        if (groupOverlayEnabled) {
          return (
            <LineItemGroupOverlayPill
              key={q.id}
              q={q}
              language={language}
              values={values}
              lineItems={lineItems}
              collapsedRows={collapsedRows}
              errors={errors}
              locked={locked}
              labelLayoutClass={labelLayoutClass}
              labelStyle={labelStyle}
              suppressOverlayPill={overlayOpenActionTargetGroups.has(q.id)}
              hasWarning={hasWarning}
              renderWarnings={renderWarnings}
              getTopValue={getTopValueNoScan}
              openLineItemGroupOverlay={openLineItemGroupOverlay}
            />
          );
        }

        return (
          <LineItemGroupQuestion
            key={q.id}
            q={q}
            ctx={{
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
              submitting: locked,
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
              waitForGuidedStepReservationDraftSync
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
      const optionSet = getOptionStateValue(optionState, q.id) || toOptionSet(q);
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
              const optionSetField: OptionSet = resolveOptionSetForField(optionState, field, group.id);
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
    const subHideLabel = subUi?.hideLabel === true;
    const subAddButtonPlacement = (
      (subgroupOverlay.groupOverride as any)?.ui?.addButtonPlacement ||
      subUi?.addButtonPlacement ||
      'both'
    )
      .toString()
      .trim()
      .toLowerCase();
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
    const overlaySessionEnabled = subgroupOverlay.overlaySession?.enabled === true;
    const overlaySessionSaveLabel = resolveLocalizedString(
      subgroupOverlay.overlaySession?.saveLabel,
      language,
      tSystem('common.saveChanges', language, 'Save changes')
    );
    const overlaySessionCancelLabel = resolveLocalizedString(
      subgroupOverlay.overlaySession?.cancelLabel,
      language,
      tSystem('common.cancel', language, 'Cancel')
    );
    const overlaySessionFillAvailableHeight = subgroupOverlay.overlaySession?.fillAvailableHeight === true;
    const overlaySessionBulkSelectionFieldId = (
      subgroupOverlay.overlaySession?.bulkSelection?.fieldId || ''
    )
      .toString()
      .trim();
    const parentLabel = parentGroup ? resolveLabel(parentGroup, language) : (parsed?.rootGroupId || 'Group');
    const _breadcrumbText = [parentLabel, subLabel].filter(Boolean).join(' / ');

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
    const overlaySessionBulkSelectionField = overlaySessionBulkSelectionFieldId
      ? ((subConfig?.fields || []) as LineItemFieldConfig[]).find(field => field.id === overlaySessionBulkSelectionFieldId)
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
    const orderedRows = applyLineItemRowSort({
      rows,
      fields: subConfig?.fields || [],
      config: subUi?.rowSort
    });
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
      const optionSetField = resolveOptionSetForField(optionState, subSelectorOverlayAnchorField, subKey);
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
      if (subAddButtonPlacement === 'hidden') return null;
      if (!subConfig) {
        return (
          <button
            type="button"
            className="ck-list-row-action-btn"
            onClick={() => {
              if (subMaxRowsReached) return;
              addLineItemRowManual(subKey, undefined, subAddRowOptions);
            }}
            style={withListRowActionButtonStyle(subMaxRowsReached, undefined, buttonStyles.secondary)}
            disabled={subMaxRowsReached}
          >
            <PlusIcon />
            Add line
          </button>
        );
      }
      if (isSubOverlayAddMode && subConfig.anchorFieldId) {
        const addLinesLabel = resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines');
        const addLinesPrimary = isPrimaryActionLabel(addLinesLabel);
                        return (
	                          <button
	                            type="button"
	                            className="ck-list-row-action-btn"
	            style={withListRowActionButtonStyle(
                submitting || subSelectorIsMissing || subMaxRowsReached,
                undefined,
                addLinesPrimary ? buttonStyles.primary : buttonStyles.secondary
              )}
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
                                  setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, subKey, loaded));
                                }
                              }
                              if (!opts) opts = resolveOptionSetForField(optionState, anchorField, subKey);
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
                              if (addOverlayCopy.title || addOverlayCopy.helperText || addOverlayCopy.searchHelperText || addOverlayCopy.placeholder) {
                                onDiagnostic?.('ui.lineItems.overlay.copy.override', {
                                  groupId: subKey,
                                  scope: 'subgroup',
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
                                groupId: subKey,
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
      if (canUseSubSelectorOverlay) {
        return null;
      }
      const addLineLabel = resolveLocalizedString(subConfig.addButtonLabel, language, 'Add line');
      const addLinePrimary = isPrimaryActionLabel(addLineLabel);
                      return (
	        <button
	          type="button"
          className="ck-list-row-action-btn"
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
	          style={withListRowActionButtonStyle(
              subSelectorIsMissing || subMaxRowsReached,
              undefined,
              addLinePrimary ? buttonStyles.primary : buttonStyles.secondary
            )}
	        >
          <PlusIcon />
          {addLineLabel}
                        </button>
                      );
                    };

    const handleSubgroupOverlaySessionBulkSelectionToggle = () => {
      if (!overlaySessionBulkSelectionEnabled || !overlaySessionBulkSelectionField) return;
      if (submitting || overlaySessionBulkSelectionField.readOnly === true) return;
      const nextValue = !overlaySessionAllRowsSelected;
      const currentLineItems = lineItemsRef.current || {};
      const currentValues = valuesRef.current;
      const visibleRowIds = new Set(rows.map(row => row.id));
      const existingRows = currentLineItems[subKey] || [];
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
      const nextLineItems = { ...currentLineItems, [subKey]: nextRows };
      const synced = applyValueMapsToForm(definition, currentValues, nextLineItems, { mode: 'change' });
      guidedLastUserEditAtRef.current = Date.now();
      onUserEdit?.({
        scope: 'line',
        fieldPath: `${subKey}__${overlaySessionBulkSelectionField.id}__*`,
        fieldId: overlaySessionBulkSelectionField.id,
        groupId: subKey,
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
          delete next[`${subKey}__${overlaySessionBulkSelectionField.id}__${row.id}`];
        });
        return next;
      });
      onDiagnostic?.('subgroup.overlay.session.bulkSelection.toggle', {
        groupId: subKey,
        fieldId: overlaySessionBulkSelectionField.id,
        rowCount: rows.length,
        nextValue
      });
    };

    const subGroupDef: WebQuestionDefinition | null =
      parentGroup && subConfig
        ? ({
            ...(parentGroup as any),
            id: subKey,
            ui: { ...(((parentGroup as any)?.ui || {}) as any), hideLabel: true },
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
	                <button type="button" onClick={() => attemptCloseSubgroupOverlay('button')} style={buttonStyles.primary}>
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
                {!subHideLabel && overlayHeaderLabel ? (
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
                <div style={srOnly}>{subLabel}</div>
              </div>
              {overlaySessionBulkSelectionEnabled ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '0 8px' }}>
                  <button
                    type="button"
                    style={buttonStyles.secondary}
                    disabled={submitting || overlaySessionBulkSelectionField?.readOnly === true}
                    onClick={handleSubgroupOverlaySessionBulkSelectionToggle}
                  >
                    {overlaySessionBulkSelectionLabel}
                  </button>
                </div>
              ) : null}
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
          className={overlaySessionFillAvailableHeight ? 'ck-line-item-overlay-fill-height' : undefined}
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
              q={
                {
                  ...(subGroupDef as any),
                  ui: {
                    ...(((subGroupDef as any)?.ui || {}) as any),
                    hideLabel: true
                  }
                } as any
              }
              rowFilter={overlayRowFilter}
              hideInlineSubgroups={overlayHideInlineSubgroups}
              hideToolbars
              rowFlow={overlayRowFlow}
              ctx={{
                formKey,
                recordId: recordMeta?.id || null,
              recordMeta,
                definition,
                language,
                values: { ...values, ...ancestorValues },
                resolveVisibilityValue,
                getTopValue: (fieldId: string) =>
                  (ancestorValues as any)[fieldId] !== undefined ? (ancestorValues as any)[fieldId] : getTopValueNoScan(fieldId),
                setValues: setValuesSynced,
                lineItems,
                setLineItems: setLineItemsSynced,
                isSubmitting: submitting,
                submitting: submitting || isFieldLockedByDedup(subKey),
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
                              const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined =>
                                resolveTableColumnWidthStyle(subColumnWidths, columnId);

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
                                    return (
                                      <div className="ck-line-item-table__value">
                                        {resolveLineItemTableReadOnlyDisplay({
                                          baseValue: selected?.label || choiceVal,
                                          field,
                                          rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                          language
                                        })}
                                      </div>
                                    );
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
                                  const hasAnyOption =
                                    !!((optionSetField.en && optionSetField.en.length) ||
                                      ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                                      ((optionSetField as any).nl && (optionSetField as any).nl.length));
                                  const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                                  const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                  const allowedWithSelected = selected.reduce((acc, val) => {
                                    if (val && !acc.includes(val)) acc.push(val);
                                    return acc;
                                  }, [...allowedField]);
                                  const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                                  if (renderAsLabel) {
                                    const labels = isConsentCheckbox
                                      ? [
                                          subRow.values[field.id]
                                            ? tSystem('common.yes', language, 'Yes')
                                            : tSystem('common.no', language, 'No')
                                        ]
                                      : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
                                    return (
                                      <div className="ck-line-item-table__value">
                                        {resolveLineItemTableReadOnlyDisplay({
                                          baseValue: labels.length ? labels.join(', ') : '',
                                          field,
                                          rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                          language
                                        })}
                                      </div>
                                    );
                                  }
                                  if (isConsentCheckbox) {
                                    return (
                                      <div className="ck-line-item-table__control ck-line-item-table__control--consent" {...controlAttrs}>
                                        <label className="inline">
                                          <input
                                            type="checkbox"
                                            className="ck-line-item-table__consent-checkbox"
                                            checked={!!subRow.values[field.id]}
                                            aria-label={resolveFieldLabel(field, language, field.id)}
                                            disabled={submitting || (field as any)?.readOnly === true}
                                            onChange={e => {
                                              if (submitting || (field as any)?.readOnly === true) return;
                                              handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked);
                                            }}
                                          />
                                          <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
                                        </label>
                                        {renderErrors()}
                                      </div>
                                    );
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
                                  return (
                                    <LineFileUploadTableOpenControl
                                      group={subGroupDef}
                                      rowId={subRow.id}
                                      field={field}
                                      fieldPath={fieldPath}
                                      value={subRow.values[field.id] as FieldValue | undefined}
                                      rowValues={(subRow.values || {}) as Record<string, FieldValue>}
                                      language={language}
                                      submitting={submitting}
                                      renderAsLabel={renderAsLabel}
                                      hasError={!!errors[fieldPath]}
                                      hasWarning={hasWarning(fieldPath)}
                                      errorNode={renderErrors()}
                                      openFileOverlay={openFileOverlay}
                                    />
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
                                  return (
                                    <div className="ck-line-item-table__value">
                                      {resolveLineItemTableReadOnlyDisplay({
                                        baseValue: display,
                                        field,
                                        rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                        language
                                      })}
                                    </div>
                                  );
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
                                        min={(field as any)?.ui?.minDate}
                                        max={(field as any)?.ui?.maxDate}
                                        correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                                        iosNativeCommitMode="deferWhileFocused"
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
	                                style={isPrimaryActionLabel(overlayDetailEditLabel) ? buttonStyles.primary : buttonStyles.secondary}
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
                          tableColumnWidths: editCfg?.tableColumnWidths || (overlayDetailSubConfig as any)?.ui?.tableColumnWidths,
                          ...(overlayDetailCanView ? { addButtonPlacement: 'hidden' } : {})
                        }
                      }
                    } as any;
                    const detailRowId = overlayDetailSelectionForGroup?.rowId || '';
                    const detailKey = detailRowId ? `${subKey}::${detailRowId}` : '';
                    const handleDetailSave = () => {
                      if (!detailRowId) return;
                      attemptSaveOverlayDetailEdit({
                        detailGroupDef,
                        errorGroupKey: detailSubKey,
                        groupId: subKey,
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
                    const detailGroupCfg = (detailGroupDef as any)?.lineItemConfig;
                    const detailAddModeRaw = detailGroupCfg?.addMode !== undefined && detailGroupCfg?.addMode !== null ? detailGroupCfg.addMode.toString() : '';
                    const detailAddMode = detailAddModeRaw.trim().toLowerCase();
                    const detailAnchorFieldId =
                      detailGroupCfg?.anchorFieldId !== undefined && detailGroupCfg?.anchorFieldId !== null
                        ? detailGroupCfg.anchorFieldId.toString()
                        : '';
                    const detailLocked = submitting || isFieldLockedByDedup(parsed?.rootGroupId || subKey);
                    const { maxRows: detailMaxRows } = resolveLineItemRowLimits(detailGroupCfg as any);
                    const detailCurrentCount = (lineItems[detailSubKey] || []).length;
                    const detailMaxRowsReached = isLineItemMaxRowsReached(detailCurrentCount, detailMaxRows);
                    const canShowDetailAddButton = overlayDetailCanView;
                    const openDetailAddOverlay = async () => {
                      if (detailLocked || detailMaxRowsReached) {
                        if (detailMaxRowsReached) {
                          onDiagnostic?.('lineItemGroup.overlay.add.blocked', {
                            groupId: detailSubKey,
                            reason: 'maxRows',
                            maxRows: detailMaxRows ?? null,
                            currentCount: detailCurrentCount
                          });
                        }
                        return;
                      }

                      if (detailAddMode === 'overlay' && detailAnchorFieldId) {
                        const anchorField = (detailGroupCfg?.fields || []).find((f: any) => f.id === detailAnchorFieldId);
                        if (!anchorField || anchorField.type !== 'CHOICE') {
                          addLineItemRowManual(detailSubKey, undefined, { configOverride: detailGroupCfg });
                          return;
                        }

                        ensureLineOptions(detailSubKey, anchorField);
                        const key = optionKey(anchorField.id, detailSubKey);
                        let opts = optionState[key];
                        if (!opts && anchorField.dataSource) {
                          const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                          if (loaded) {
                            opts = loaded;
                            setOptionState(prev => mergeOptionStateValue(prev, anchorField.id, detailSubKey, loaded));
                          }
                        }
                        if (!opts) opts = resolveOptionSetForField(optionState, anchorField, detailSubKey);

                        const dependencyIds = (
                          Array.isArray(anchorField.optionFilter?.dependsOn)
                            ? anchorField.optionFilter?.dependsOn
                            : [anchorField.optionFilter?.dependsOn || '']
                        ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                        const depVals = dependencyIds.map((dep: string) =>
                          toDependencyValue((detailContextValues as any)[dep])
                        );
                        const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                        const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                        const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                        const addOverlayCopy = resolveAddOverlayCopy(detailGroupCfg, language);

                        setOverlay({
                          open: true,
                          options: localized
                            .filter(opt => deduped.includes(opt.value))
                            .map(opt => ({ value: opt.value, label: opt.label })),
                          groupId: detailSubKey,
                          anchorFieldId: anchorField.id,
                          selected: [],
                          title: addOverlayCopy.title,
                          helperText: addOverlayCopy.helperText,
                          searchHelperText: addOverlayCopy.searchHelperText,
                          placeholder: addOverlayCopy.placeholder
                        });
                        return;
                      }

                      addLineItemRowManual(detailSubKey, undefined, { configOverride: detailGroupCfg });
                    };
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {canShowDetailAddButton ? (
                            <button
                              type="button"
                              style={withDisabled(buttonStyles.primary, detailLocked || detailMaxRowsReached)}
                              disabled={detailLocked || detailMaxRowsReached}
                              onClick={openDetailAddOverlay}
                            >
                              <PlusIcon />
                              {resolveLocalizedString(
                                detailGroupCfg?.addButtonLabel,
                                language,
                                tSystem('lineItems.addLines', language, 'Add lines')
                              )}
                            </button>
                          ) : null}
                          <button type="button" style={buttonStyles.primary} onClick={handleDetailSave}>
                            {tSystem('common.saveChanges', language, 'Save changes')}
                          </button>
                          {!overlayDetailCanView ? (
                            <button type="button" style={buttonStyles.secondary} onClick={handleDetailCancel}>
                              {tSystem('common.cancel', language, 'Cancel')}
                            </button>
                          ) : null}
                        </div>
                        <LineItemGroupQuestion
                          key={detailGroupDef.id}
                          q={detailGroupDef as any}
                          ctx={{
                              formKey,
                              recordId: recordMeta?.id || null,
              recordMeta,
                              definition,
                              language,
                              values: detailContextValues,
                              resolveVisibilityValue,
                              getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                            setValues: setValuesSynced,
                            lineItems,
                            setLineItems: setLineItemsSynced,
                            isSubmitting: submitting,
                            submitting: submitting || isFieldLockedByDedup(parsed?.rootGroupId || subKey),
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
                            waitForGuidedStepReservationDraftSync
                          }}
                        />
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          ) : isSubTableMode ? (
            <div
              className="ck-line-item-table__scroll"
              style={(() => {
                const maxVisibleRowsRaw = Number((subUi as any)?.maxVisibleRows);
                if (!Number.isFinite(maxVisibleRowsRaw) || maxVisibleRowsRaw <= 0) return undefined;
                return { maxHeight: `${Math.max(1, Math.floor(maxVisibleRowsRaw)) * 56}px`, overflowY: 'auto' as const };
              })()}
            >
              <LineItemTable
                columns={[
                  ...((() => {
                    const hideRemoveColumn = (subUi as any)?.hideRemoveColumn === true;
                    const subColumnWidths = overlayDetailEnabled ? overlayDetailHeaderWidths : subUi?.tableColumnWidths;
                    const resolveSubColumnStyle = (columnId: string): React.CSSProperties | undefined =>
                      resolveTableColumnWidthStyle(subColumnWidths, columnId);

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
                          return (
                            <div className="ck-line-item-table__value">
                              {resolveLineItemTableReadOnlyDisplay({
                                baseValue: selected?.label || choiceVal,
                                field,
                                rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                language
                              })}
                            </div>
                          );
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
                        const hasAnyOption =
                          !!((optionSetField.en && optionSetField.en.length) ||
                            ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                            ((optionSetField as any).nl && (optionSetField as any).nl.length));
                        const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                        const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                        const allowedWithSelected = selected.reduce((acc, val) => {
                          if (val && !acc.includes(val)) acc.push(val);
                          return acc;
                        }, [...allowedField]);
                        const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language, { sort: optionSortFor(field) });
                        if (renderAsLabel) {
                          const labels = isConsentCheckbox
                            ? [
                                subRow.values[field.id]
                                  ? tSystem('common.yes', language, 'Yes')
                                  : tSystem('common.no', language, 'No')
                              ]
                            : selected.map(val => optsField.find(opt => opt.value === val)?.label || val).filter(Boolean);
                          return (
                            <div className="ck-line-item-table__value">
                              {resolveLineItemTableReadOnlyDisplay({
                                baseValue: labels.length ? labels.join(', ') : '',
                                field,
                                rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                                language
                              })}
                            </div>
                          );
                        }
                        if (isConsentCheckbox) {
                          return (
                            <div className="ck-line-item-table__control ck-line-item-table__control--consent" {...controlAttrs}>
                              <label className="inline">
                                <input
                                  type="checkbox"
                                  className="ck-line-item-table__consent-checkbox"
                                  checked={!!subRow.values[field.id]}
                                  aria-label={resolveFieldLabel(field, language, field.id)}
                                  disabled={submitting || (field as any)?.readOnly === true}
                                  onChange={e => {
                                    if (submitting || (field as any)?.readOnly === true) return;
                                    handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked);
                                  }}
                                />
                                <span style={srOnly}>{resolveFieldLabel(field, language, field.id)}</span>
                              </label>
                              {renderErrors()}
                            </div>
                          );
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
                        return (
                          <LineFileUploadTableOpenControl
                            group={subGroupDef}
                            rowId={subRow.id}
                            field={field}
                            fieldPath={fieldPath}
                            value={subRow.values[field.id] as FieldValue | undefined}
                            rowValues={(subRow.values || {}) as Record<string, FieldValue>}
                            language={language}
                            submitting={submitting}
                            renderAsLabel={renderAsLabel}
                            hasError={!!errors[fieldPath]}
                            hasWarning={hasWarning(fieldPath)}
                            errorNode={renderErrors()}
                            openFileOverlay={openFileOverlay}
                          />
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
                        return (
                          <div className="ck-line-item-table__value">
                            {resolveLineItemTableReadOnlyDisplay({
                              baseValue: display,
                              field,
                              rowValues: (subRow.values || {}) as Record<string, FieldValue>,
                              language
                            })}
                          </div>
                        );
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
                              min={(field as any)?.ui?.minDate}
                              max={(field as any)?.ui?.maxDate}
                              correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                              iosNativeCommitMode="deferWhileFocused"
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
                        label: (() => {
                          const labelText = resolveFieldLabel(field, language, field.id);
                          const hideHeaderLabel = Boolean((field as any)?.hideLabel || (field as any)?.ui?.hideLabel);
                          return hideHeaderLabel ? <span style={srOnly}>{labelText}</span> : labelText;
                        })(),
                        style: resolveSubColumnStyle(field.id),
                        renderCell: (subRow: any) => renderSubTableField(field, subRow)
                      })),
                      ...(overlayDetailEnabled
	                        ? (() => {
	                            const actionButtonStyle: React.CSSProperties = {
	                              ...buttonStyles.primary,
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
                            if (!hideRemoveColumn) {
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
                            }
                            return actionColumns;
                          })()
                        : []),
                      ...(overlayDetailEnabled || hideRemoveColumn
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
            orderedRows.map(subRow => {
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
                  const optionSetField: OptionSet = resolveOptionSetForField(optionState, anchorField, subKey);
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
                        case 'FILE_UPLOAD':
                          return (
                            <LineFileUploadQuestion
                              key={field.id}
                              group={subGroupDef}
                              rowId={subRow.id}
                              field={field}
                              fieldPath={fieldPath}
                              value={subRow.values[field.id] as FieldValue | undefined}
                              language={language}
                              submitting={submitting}
                              forceStackedLabel={forceStackedSubFieldLabel}
                              labelStyle={labelStyle}
                              errors={errors}
                              hasWarning={hasWarning}
                              renderWarnings={renderWarnings}
                              checkFileUploadOrderedEntry={checkLineFileUploadOrderedEntry}
                              openFileOverlay={openFileOverlay}
                              handleFileInputChange={handleLineFileInputChange}
                              fileInputsRef={fileInputsRef}
                              uploadAnnouncements={uploadAnnouncements}
                              renderUploadFailure={renderUploadFailure}
                              onDiagnostic={onDiagnostic}
                            />
                          );
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
                                  min={(field as any)?.ui?.minDate}
                                  max={(field as any)?.ui?.maxDate}
                                  correctionMessages={(field as any)?.ui?.dateCorrectionMessages}
                                  iosNativeCommitMode="deferWhileFocused"
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
            <button type="button" style={buttonStyles.secondary} onClick={handleSubgroupOverlaySessionCancel}>
              {overlaySessionCancelLabel}
            </button>
            <button type="button" style={buttonStyles.primary} onClick={handleSubgroupOverlaySessionSave}>
              {overlaySessionSaveLabel}
            </button>
          </div>
        ) : null}
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
      tSystem('common.saveChanges', language, 'Save changes')
    );
    const overlaySessionCancelLabel = resolveLocalizedString(
      lineItemGroupOverlay.overlaySession?.cancelLabel,
      language,
      tSystem('common.cancel', language, 'Cancel')
    );
    const overlaySessionFillAvailableHeight = lineItemGroupOverlay.overlaySession?.fillAvailableHeight === true;
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
	                <button type="button" onClick={() => attemptCloseLineItemGroupOverlay('button')} style={buttonStyles.primary}>
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
                              formKey,
                              recordId: recordMeta?.id || null,
              recordMeta,
                              definition,
                              language,
                              values: detailContextValues,
                              resolveVisibilityValue,
                              getTopValue: (fieldId: string) => resolveTopValueNoScan(detailContextValues, fieldId),
                              setValues: setValuesSynced,
                              lineItems,
                              setLineItems: setLineItemsSynced,
                              isSubmitting: submitting,
                              submitting: submitting || isFieldLockedByDedup(groupId),
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
                              ensureRecordId,
                              queueGuidedStepReservationDraftSync,
                              onGuidedStepReservationDraftStateChange,
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
              <div className={overlaySessionFillAvailableHeight ? 'ck-line-item-overlay-fill-height' : undefined}>
                <LineItemGroupQuestion
                  key={overlayGroup.id}
                  q={overlayGroup as any}
                  rowFilter={overlayRowFilter}
                  hideInlineSubgroups={overlayHideInlineSubgroups}
                  hideToolbars
                  rowFlow={lineItemGroupOverlay.rowFlow}
                  ctx={{
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
                    submitting: submitting || isFieldLockedByDedup(groupId),
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
                    closeOverlay: () => attemptCloseLineItemGroupOverlay('button')
                  }}
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
            <button type="button" style={buttonStyles.primary} onClick={handleLineItemGroupOverlaySessionSave}>
              {overlaySessionSaveLabel}
            </button>
          </div>
        ) : null}
      </div>,
      document.body
    );
  })();

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

  const renderGuidedContent = (): React.ReactNode => {
    if (!guidedEnabled || !guidedStepsCfg) return null;
    const steps = guidedVisibleSteps;
    if (!steps.length) return null;

    const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
    const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? (guidedStepsCfg.header!.include as any[]) : [];
    const stepTargets: any[] = Array.isArray(stepCfg?.include) ? (stepCfg.include as any[]) : [];

    const stepHelpText = stepCfg?.helpText ? resolveLocalizedString(stepCfg.helpText, language, '') : '';
    const stepLineGroupsDefaultMode = (stepCfg?.render?.lineGroups?.mode || '') as 'inline' | 'overlay' | '';
    const stepSubGroupsDefaultMode = (stepCfg?.render?.subGroups?.mode || '') as 'inline' | 'overlay' | '';
    const {
      parts: stepContextHeaderParts,
      partIds: stepContextHeaderPartIds,
      separator: guidedContextHeaderSeparator
    } = collectGuidedContextHeaderConfig(stepCfg?.contextHeader);
    const guidedContextHeaderIds = new Set<string>(stepContextHeaderPartIds);

    const questionById = new Map<string, WebQuestionDefinition>();
    (definition.questions || []).forEach(q => questionById.set(q.id, q));

    const resolveTargetQuestion = (target: any): WebQuestionDefinition | null => {
      if (!target || typeof target !== 'object') return null;
      const id = (target.id || '').toString().trim();
      if (!id) return null;
      const q = questionById.get(id) || null;
      if (!q) return null;
      const renderAsLabel = (target as any)?.renderAsLabel === true;
      if (!renderAsLabel) return q;
      return { ...(q as any), readOnly: true, ui: { ...((q as any).ui || {}), renderAsLabel: true } } as WebQuestionDefinition;
    };

    const guidedContextHeaderNode = stepContextHeaderParts.length ? (
      <GuidedContextHeader
        language={language}
        parts={stepContextHeaderParts}
        separator={guidedContextHeaderSeparator}
        values={values}
        questionById={questionById}
        resolveOptionSet={renderOptions}
      />
    ) : null;

    const stepTargetsFiltered = guidedContextHeaderIds.size
      ? stepTargets.filter(t => {
          if (!t || typeof t !== 'object') return true;
          const kind = (t.kind || '').toString().trim();
          const id = (t.id || '').toString().trim();
          return !(kind === 'question' && guidedContextHeaderIds.has(id));
        })
      : stepTargets;

    const renderTarget = (target: any, keyPrefix: string): React.ReactNode => {
      if (!target || typeof target !== 'object') return null;
      const kind = (target.kind || '').toString().trim();
      const id = (target.id || '').toString().trim();
      if (!kind || !id) return null;

      if (kind === 'question') {
        const q = resolveTargetQuestion(target);
        if (!q) return null;
        return <React.Fragment key={`${keyPrefix}:q:${q.id}`}>{renderQuestion(q)}</React.Fragment>;
      }

      if (kind !== 'lineGroup') return null;
      const groupQ = definition.questions.find(q2 => q2.id === id && q2.type === 'LINE_ITEM_GROUP');
      if (!groupQ) return null;

      const targetLabel =
        (target as any).label !== undefined && (target as any).label !== null
          ? resolveLocalizedString((target as any).label, language, '').trim()
          : '';
      const targetHelperText =
        (target as any).helperText !== undefined && (target as any).helperText !== null
          ? resolveLocalizedString((target as any).helperText, language, '').trim()
          : '';
      const {
        presentation,
        groupOverride,
        rowFilter,
        effectiveLineMode,
        hideInlineSubgroups,
        delegateTargetHelperText,
        stepLineCfg
      } = buildGuidedLineGroupConfig({
        target,
        groupQ,
        targetHelperText,
        stepLineGroupsDefaultMode,
        stepSubGroupsDefaultMode
      });
      const wrapLineGroupContent = (content: React.ReactNode): React.ReactNode => {
        const wrapperHelperText = delegateTargetHelperText ? '' : targetHelperText;
        if (!targetLabel && !wrapperHelperText) return content;
        return (
          <div
            key={`${keyPrefix}:lg:${id}:section`}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}
          >
            {targetLabel ? (
              <div style={{ fontWeight: 600, fontSize: 'var(--ck-font-group-title)', lineHeight: 1.3 }}>{targetLabel}</div>
            ) : null}
            {wrapperHelperText ? (
              <SectionInstruction
                id={`ck-linegroup-instruction-${activeGuidedStepId}-${id}`}
                language={language}
                text={wrapperHelperText}
              />
            ) : null}
            {content}
          </div>
        );
      };

      if (groupOverride && onDiagnostic) {
        const logKey = `${activeGuidedStepId}::${id}::groupOverride`;
        if (!guidedLineGroupOverrideLoggedRef.current.has(logKey)) {
          guidedLineGroupOverrideLoggedRef.current.add(logKey);
          onDiagnostic('steps.lineGroup.groupOverride.applied', {
            stepId: activeGuidedStepId,
            groupId: id,
            keys: Object.keys(groupOverride || {})
          });
        }
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
        return wrapLineGroupContent(
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
      return wrapLineGroupContent(
        <LineItemGroupQuestion
          key={`${keyPrefix}:lg:${stepGroup.id}:${activeGuidedStepId}`}
          q={stepGroup as any}
          rowFlow={target.rowFlow}
          rowFilter={rowFilter}
          dataSourceRows={Array.isArray((target as any).dataSourceRows) ? ((target as any).dataSourceRows as any[]) : undefined}
          dataSourceBootstrap={(target as any).dataSourceBootstrap || undefined}
          hideInlineSubgroups={hideInlineSubgroups}
          supplementalHelperText={delegateTargetHelperText ? targetHelperText : undefined}
          hideSupplementalHelperWhenNoSourceRows={delegateTargetHelperText}
          ctx={{
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
            submitting: locked,
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
            waitForGuidedStepReservationDraftSync
          }}
        />
      );
    };

    const renderTargetsWithPairing = (targets: any[], keyPrefix: string): React.ReactNode[] =>
      renderGuidedTargetsWithPairing({
        targets,
        keyPrefix,
        resolveTargetQuestion,
        renderTarget,
        renderQuestion,
        isQuestionVisible: q => !shouldHideField(q.visibility, topVisibilityCtx)
      });

    return (
      <GuidedFormContent
        language={language}
        steps={steps}
        status={guidedStatus.steps}
        activeStepId={activeGuidedStepId}
        disabledStepIds={guidedStepBarBlockedIds}
        maxReachableIndex={
          guidedForwardNavigationBlocked ? Math.min(maxReachableGuidedIndex, activeGuidedStepIndex) : maxReachableGuidedIndex
        }
        bodyRef={guidedStepBodyRef}
        contextHeader={guidedContextHeaderNode}
        stepHelpText={stepHelpText}
        headerContent={renderTargetsWithPairing(headerTargets, 'header')}
        stepContent={renderTargetsWithPairing(stepTargetsFiltered, `step:${activeGuidedStepId}`)}
        onSelectStep={handleGuidedStepSelect}
      />
    );
  };

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
              renderGuidedContent()
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
