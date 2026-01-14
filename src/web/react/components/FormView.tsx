import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
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
  LineItemRowState,
  LocalizedString,
  OptionSet,
  QuestionGroupConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { FormErrors, LineItemState, OptionState } from '../types';
import { isEmptyValue } from '../utils/values';
import {
  applyUploadConstraints,
  describeUploadItem,
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
  PaperclipIcon,
  PlusIcon,
  RequiredStar,
  srOnly,
  withDisabled
} from './form/ui';
import { FileOverlay } from './form/overlays/FileOverlay';
import { InfoOverlay } from './form/overlays/InfoOverlay';
import { LineOverlayState, LineSelectOverlay } from './form/overlays/LineSelectOverlay';
import { InfoTooltip } from './form/InfoTooltip';
import { DateInput } from './form/DateInput';
import { SearchableSelect } from './form/SearchableSelect';
import { LineItemGroupQuestion } from './form/LineItemGroupQuestion';
import { GroupedPairedFields } from './form/GroupedPairedFields';
import { PairedRowGrid } from './form/PairedRowGrid';
import { PageSection } from './form/PageSection';
import { buildPageSectionBlocks, resolveGroupSectionKey, resolvePageSectionKey } from './form/grouping';
import { computeChoiceControlVariant, resolveNoneLabel, type OptionLike } from './form/choiceControls';
import { buildSelectorOptionSet, resolveSelectorLabel } from './form/lineItemSelectors';
import { NumberStepper } from './form/NumberStepper';
import { applyValueMapsToForm, resolveValueMapValue } from './form/valueMaps';
import { isLineItemGroupQuestionComplete } from './form/completeness';
import {
  buildLineContextId,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  parseSubgroupKey,
  ROW_SOURCE_KEY,
  resolveSubgroupKey,
  seedSubgroupDefaults
} from '../app/lineItems';
import { reconcileOverlayAutoAddModeGroups, reconcileOverlayAutoAddModeSubgroups } from '../app/autoAddModeOverlay';
import { getSystemFieldValue, type SystemRecordMeta } from '../../rules/systemFields';
import { validateRules } from '../../rules/validation';
import { matchesWhenClause } from '../../rules/visibility';
import { validateForm } from '../app/submission';
import { StepsBar } from '../features/steps/components/StepsBar';
import { computeGuidedStepsStatus } from '../features/steps/domain/computeStepStatus';
import { resolveVirtualStepField } from '../features/steps/domain/resolveVirtualStepField';

interface SubgroupOverlayState {
  open: boolean;
  subKey?: string;
}

interface LineItemGroupOverlayState {
  open: boolean;
  groupId?: string;
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

// keep context ids consistent with App.tsx so auto-generated rows from selection effects
// can be reconciled when loading existing records

type StatusTone = 'info' | 'success' | 'error';

const hasSelectionEffects = (field: any): boolean =>
  Array.isArray(field?.selectionEffects) && field.selectionEffects.length > 0;

const getSelectionEffects = (field: any): any[] =>
  Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];

const selectionEffectDependsOnField = (field: any, targetFieldId: string): boolean => {
  return getSelectionEffects(field).some(effect => {
    if (!effect) return false;
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

const isLineRowComplete = (group: WebQuestionDefinition, rowValues: Record<string, FieldValue>): boolean => {
  const fields = group.lineItemConfig?.fields || [];
  return fields.every(field => {
    if (!field.required) return true;
    const val = rowValues[field.id];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim() !== '';
    return val !== undefined && val !== null;
  });
};

interface FormViewProps {
  definition: WebFormDefinition;
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
  /**
   * When true, the form is in a dedup-conflict lock state: only dedup key fields should remain editable.
   */
  dedupLockActive?: boolean;
  /**
   * Field ids that are allowed to be edited while `dedupLockActive` is true.
   * (Typically the dedup rule composite keys, e.g. DATE + CHECK_FREQ.)
   */
  dedupKeyFieldIds?: string[];
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
  }) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onGuidedUiChange?: (state: {
    activeStepId: string | null;
    activeStepIndex: number;
    stepCount: number;
    isFirst: boolean;
    isFinal: boolean;
    backAllowed: boolean;
    backVisible: boolean;
    backLabel: string;
    stepSubmitLabel?: string | LocalizedString;
  } | null) => void;
}

const FormView: React.FC<FormViewProps> = ({
  definition,
  language,
  values,
  setValues,
  lineItems,
  setLineItems,
  onSubmit,
  submitActionRef,
  guidedBackActionRef,
  navigateToFieldRef,
  submitting,
  dedupLockActive,
  dedupKeyFieldIds,
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
  onGuidedUiChange
}) => {
  const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
    const raw = (field as any)?.optionSort;
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'source' ? 'source' : 'alphabetical';
  };
  const dedupAllowSet = useMemo(() => {
    const set = new Set<string>();
    (dedupKeyFieldIds || []).forEach(id => {
      const k = (id || '').toString().trim();
      if (k) set.add(k);
    });
    return set;
  }, [dedupKeyFieldIds]);
  const isFieldLockedByDedup = (fieldId: string): boolean => {
    if (!dedupLockActive) return false;
    const k = (fieldId || '').toString().trim();
    if (!k) return true;
    return !dedupAllowSet.has(k);
  };
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
  const [overlay, setOverlay] = useState<LineOverlayState>({ open: false, options: [], selected: [] });
  const [lineItemGroupOverlay, setLineItemGroupOverlay] = useState<LineItemGroupOverlayState>({ open: false });
  const [subgroupOverlay, setSubgroupOverlay] = useState<SubgroupOverlayState>({ open: false });
  const [infoOverlay, setInfoOverlay] = useState<InfoOverlayState>({ open: false });
  const [fileOverlay, setFileOverlay] = useState<FileOverlayState>({ open: false });
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<string | null>(null);
  const [subgroupSelectors, setSubgroupSelectors] = useState<Record<string, string>>({});
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
  const choiceVariantLogRef = useRef<Record<string, string>>({});
  const choiceSearchLoggedRef = useRef<Set<string>>(new Set());
  const hideLabelLoggedRef = useRef<Set<string>>(new Set());
  const groupScrollAnimRafRef = useRef(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const valuesRef = useRef(values);
  const lineItemsRef = useRef(lineItems);

  useEffect(() => {
    valuesRef.current = values;
    lineItemsRef.current = lineItems;
  }, [values, lineItems]);

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
  const maxReachableGuidedIndex = (() => {
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

  // Emit a one-time diagnostic when guided steps are enabled for this form.
  useEffect(() => {
    if (!guidedEnabled) return;
    onDiagnostic?.('steps.enabled', { mode: 'guided', stepCount: guidedStepIds.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedEnabled]);

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

  const guidedStepBodyRef = useRef<HTMLDivElement | null>(null);
  const guidedAutoAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const guidedAutoAdvanceStateRef = useRef<{ stepId: string; lastSatisfied: boolean; armed: boolean } | null>(null);
  const guidedAutoAdvanceAttemptRef = useRef<(() => void) | null>(null);
  const guidedLastUserEditAtRef = useRef<number>(0);
  const [guidedStepAttempted, setGuidedStepAttempted] = useState<Record<string, boolean>>({});
  const [guidedStepGateNotice, setGuidedStepGateNotice] = useState<{ stepId: string; tone: 'error' | 'warning'; message: string } | null>(
    null
  );

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

      // Forward navigation: use computed reachability (contiguous gating).
      if (nextIdx > maxReachableGuidedIndex) {
        // Mark the current step as "attempted" so we can surface step-level guidance.
        setGuidedStepAttempted(prev => ({ ...(prev || {}), [activeGuidedStepId]: true }));
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
      onDiagnostic
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
      const isGuidedFinalStep = guidedEnabled && guidedStepIds.length && activeGuidedStepIndex >= guidedStepIds.length - 1;

      // In guided steps, the bottom "Submit" action behaves like "Next" until the final step.
      // It should validate only the current step's visible targets (not the full form).
      if (guidedEnabled && guidedStepsCfg && guidedStepIds.length && !isGuidedFinalStep) {
        // Mark this step as attempted (used to show step-level gate guidance).
        setGuidedStepAttempted(prev => ({ ...(prev || {}), [activeGuidedStepId]: true }));

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

        // For `whenComplete` steps: advancing is blocked ONLY by step completion (all step-visible fields set),
        // even if the step is already valid or still has validation errors.
        if (forwardGate === 'whenComplete' && !stepStatus?.complete) {
          setGuidedStepGateNotice({
            stepId: activeGuidedStepId,
            tone: 'error',
            message: tSystem('steps.completeToContinue', language, 'Complete all fields in this step to continue.')
          });
          // Try to focus a likely missing field to reduce friction.
          const firstTarget = (Array.isArray(guidedStepsCfg.header?.include) ? guidedStepsCfg.header!.include : [])
            .concat(Array.isArray(stepCfg?.include) ? stepCfg.include : [])
            .find((t: any) => t && typeof t === 'object' && (t.kind || '').toString() === 'question' && (t.id || '').toString().trim());
          if (firstTarget?.id) {
            try {
              navigateToFieldKey(firstTarget.id.toString());
            } catch (_) {
              // ignore
            }
          }
          return;
        }

        const buildStepScopedDefinition = (): WebFormDefinition => {
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

          const scopedQuestions: WebQuestionDefinition[] = [];
          (definition.questions || []).forEach(q => {
            if (!q) return;
            if (q.type !== 'LINE_ITEM_GROUP') {
              if (topQuestionIds.has(q.id)) {
                const asLabel = renderQuestionAsLabel.has(q.id);
                scopedQuestions.push(
                  asLabel ? ({ ...(q as any), ui: { ...((q as any).ui || {}), renderAsLabel: true } } as WebQuestionDefinition) : q
                );
              }
              return;
            }

            const t = lineTargetsById.get(q.id);
            if (!t) return;
            const groupId = q.id;
            const lineCfg = (q as any).lineItemConfig || {};

            const allowedFieldIds = (() => {
              const raw = (t as any).fields;
              if (!raw) return null;
              const ids: string[] = Array.isArray(raw)
                ? raw.map((v: any) => normalizeLineFieldId(groupId, v)).filter(Boolean)
                : raw
                    .toString()
                    .split(',')
                    .map((s: string) => normalizeLineFieldId(groupId, s))
                    .filter(Boolean);
              return ids.length ? new Set(ids) : null;
            })();
            const readOnlyFieldIds = (() => {
              const raw = (t as any).readOnlyFields;
              if (!raw) return null;
              const ids: string[] = Array.isArray(raw)
                ? raw.map((v: any) => normalizeLineFieldId(groupId, v)).filter(Boolean)
                : raw
                    .toString()
                    .split(',')
                    .map((s: string) => normalizeLineFieldId(groupId, s))
                    .filter(Boolean);
              return ids.length ? new Set(ids) : null;
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
                const allowedSubFields = Array.isArray(allowedSubFieldsRaw)
                  ? new Set(allowedSubFieldsRaw.map((v: any) => normalizeLineFieldId(subId, v)).filter(Boolean))
                  : null;
                const readOnlySubFieldsRaw = subTarget?.readOnlyFields;
                const readOnlySubFields = Array.isArray(readOnlySubFieldsRaw)
                  ? new Set(readOnlySubFieldsRaw.map((v: any) => normalizeLineFieldId(subId, v)).filter(Boolean))
                  : null;

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
            scopedQuestions.push({ ...(q as any), lineItemConfig: stepLineCfg } as WebQuestionDefinition);
          });

          return { ...(definition as any), questions: scopedQuestions } as WebFormDefinition;
        };

        const stepDefinition = buildStepScopedDefinition();
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
          setGuidedStepGateNotice({
            stepId: activeGuidedStepId,
            tone: 'error',
            message: tSystem('steps.fixErrorsToContinue', language, 'Fix the highlighted errors in this step to continue.')
          });
          errorNavRequestRef.current += 1;
          onDiagnostic?.('validation.navigate.request', { attempt: errorNavRequestRef.current, scope: 'guidedStep' });
          return;
        }

        const nextId = guidedStepIds[activeGuidedStepIndex + 1];
        if (nextId) {
          setErrors({});
          setGuidedStepGateNotice(null);
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
      onDiagnostic?.('validation.navigate.request', { attempt: errorNavRequestRef.current });
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
    collapsedRows,
    collapsedSubgroups,
    definition,
    guidedEnabled,
    guidedStepIds,
    guidedStepsCfg,
    language,
    lineItems,
    onDiagnostic,
    onSubmit,
    selectGuidedStep,
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
    language,
    onGuidedUiChange
  ]);

  const hasCopyDerived = useMemo(() => {
    const hasInFields = (fields: any[]): boolean =>
      Array.isArray(fields) && fields.some(f => f && f.derivedValue && (f.derivedValue.op || '').toString() === 'copy');
    return (definition.questions || []).some(q => {
      if ((q as any).derivedValue && ((q as any).derivedValue.op || '').toString() === 'copy') return true;
      if (q.type !== 'LINE_ITEM_GROUP') return false;
      if (hasInFields(q.lineItemConfig?.fields || [])) return true;
      const subs = q.lineItemConfig?.subGroups || [];
      return subs.some(sub => hasInFields(((sub as any).fields || []) as any[]));
    });
  }, [definition.questions]);

  const hideLabelQuestionIds = useMemo(() => {
    return (definition.questions || []).filter(q => q.ui?.hideLabel === true).map(q => q.id);
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

  const blurRecomputeTimerRef = useRef<number | null>(null);

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
      if (!hasCopyDerived) return;
      const currentValues = valuesRef.current;
      const currentLineItems = lineItemsRef.current;
      const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, currentValues, currentLineItems, {
        mode: 'blur'
      });

      const changedFields = diffValues(currentValues, nextValues);
      const lineChanged = !lineItemsEqual(currentLineItems, nextLineItems);
      if (!changedFields.length && !lineChanged) return;

      if (changedFields.length) setValues(nextValues);
      if (lineChanged) setLineItems(nextLineItems);
      onDiagnostic?.('derived.blur.apply', {
        fieldPath: meta?.fieldPath,
        tag: meta?.tag,
        changedCount: changedFields.length,
        changedFields: changedFields.slice(0, 12),
        lineItemsChanged: lineChanged
      });
    },
    [definition, hasCopyDerived, onDiagnostic, setLineItems, setValues]
  );

  useEffect(() => {
    const handler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
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

      if (!hasCopyDerived) return;
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
      }
      blurRecomputeTimerRef.current = window.setTimeout(() => {
        blurRecomputeTimerRef.current = null;
        recomputeDerivedOnBlur({ fieldPath, tag });
      }, 0);
    };
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusout', handler, true);
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
        blurRecomputeTimerRef.current = null;
      }
    };
  }, [hasCopyDerived, onUserEdit, recomputeDerivedOnBlur]);

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

      (q.lineItemConfig?.subGroups || []).forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const subFields = (sub as any).fields || [];
        subFields.forEach((field: any) => {
          const sectionKey = resolveGroupSectionKey((field as any)?.group);
          subgroupFieldToGroupKey[`${q.id}::${subId}__${field.id}`] = `sub:${q.id}:${subId}:${sectionKey}`;
        });
        pushSectionDefaults(`sub:${q.id}:${subId}`, subFields);
      });
    });

    return { collapsibleDefaults, lineFieldToGroupKey, subgroupFieldToGroupKey };
  }, [definition.questions]);

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
          return (
            <SearchableSelect
              value={value || ''}
              options={options.map(o => ({ value: o.value, label: o.label, tooltip: (o as any).tooltip }))}
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
    setSubgroupOverlay({ open: false });
    onDiagnostic?.('subgroup.overlay.close');
  }, [onDiagnostic]);

  const closeLineItemGroupOverlay = useCallback(() => {
    setLineItemGroupOverlay({ open: false });
    onDiagnostic?.('lineItemGroup.overlay.close');
  }, [onDiagnostic]);

  const openSubgroupOverlay = useCallback(
    (subKey: string) => {
      if (!subKey) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setSubgroupOverlay({ open: true, subKey });
      onDiagnostic?.('subgroup.overlay.open', { subKey });
    },
    [onDiagnostic, overlay.open]
  );

  const openLineItemGroupOverlay = useCallback(
    (
      groupOrId: string | WebQuestionDefinition,
      options?: { rowFilter?: { includeWhen?: any; excludeWhen?: any } | null; hideInlineSubgroups?: boolean }
    ) => {
      const id = (typeof groupOrId === 'string' ? groupOrId : groupOrId?.id || '').toString();
      if (!id) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      // Avoid stacking full-page overlays.
      if (subgroupOverlay.open) {
        setSubgroupOverlay({ open: false });
      }
      const group = typeof groupOrId === 'string' ? undefined : (groupOrId as WebQuestionDefinition);
      const rowFilter = options?.rowFilter || null;
      const hideInlineSubgroups = options?.hideInlineSubgroups === true;
      setLineItemGroupOverlay({ open: true, groupId: id, group, rowFilter, hideInlineSubgroups });
      onDiagnostic?.('lineItemGroup.overlay.open', { groupId: id, mode: group ? 'override' : 'default', hasRowFilter: !!rowFilter });
    },
    [onDiagnostic, overlay.open, subgroupOverlay.open]
  );

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
          expandGroupForQuestionId(subgroupInfo.parentGroupId);
          const collapseKey = `${subgroupInfo.parentGroupId}::${subgroupInfo.parentRowId}`;
          setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
          const nestedKey =
            nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.parentGroupId}::${subgroupInfo.subGroupId}__${fieldId}`];
          if (nestedKey) {
            setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
          }
          if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
            openSubgroupOverlay(prefix);
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
            openLineItemGroupOverlay(prefix);
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
    const targetSubgroupInfo = parseSubgroupKey(targetGroupKey);

    // Ensure the target row is actually rendered before attempting to scroll to it.
    // This makes selectionEffect-created rows discoverable even when their parent group is collapsed,
    // or when the target is a subgroup that requires the full-page overlay to be opened.
    try {
      if (targetSubgroupInfo) {
        const groupCardKey = (questionIdToGroupKey as any)[targetSubgroupInfo.parentGroupId] || targetSubgroupInfo.parentGroupId;
        if (groupCardKey) {
          setCollapsedGroups(prev => (prev[groupCardKey] === false ? prev : { ...prev, [groupCardKey]: false }));
        }
        const rowCollapseKey = `${targetSubgroupInfo.parentGroupId}::${targetSubgroupInfo.parentRowId}`;
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
      const overlayScroller = overlayRoot
        ? (overlayRoot.querySelector('[data-overlay-scroll-container="true"]') as HTMLElement | null)
        : null;
      if (overlayScroller) {
        const containerRect = overlayScroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const delta = elRect.top - containerRect.top;
        const target =
          overlayScroller.scrollTop + delta - overlayScroller.clientHeight / 2 + elRect.height / 2;
        overlayScroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      } else {
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
      const focusable = el.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ) as HTMLElement | null;
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
        openSubgroupOverlay(targetGroupKey);
        onDiagnostic?.('ui.autoscroll.openSubgroupOverlay', { anchor, subKey: targetGroupKey });
      }
      // If we're trying to scroll to a line-item group row that is rendered only in an overlay,
      // open the full-page group overlay after a short delay so the row can mount.
      if (!targetSubgroupInfo && tries === 4) {
        const groupCfg = definition.questions.find(q => q.id === targetGroupKey && q.type === 'LINE_ITEM_GROUP');
        const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
        if (groupOverlayEnabled && (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== targetGroupKey)) {
          openLineItemGroupOverlay(targetGroupKey);
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
          closeSubgroupOverlay();
          return;
        }
        closeLineItemGroupOverlay();
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
    closeLineItemGroupOverlay,
    closeSubgroupOverlay,
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
    setErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[question.id] = errorMessage;
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

  const addLineItemRow = (groupId: string, preset?: Record<string, any>, rowIdOverride?: string) => {
    setLineItems(prev => {
      const subgroupInfo = parseSubgroupKey(groupId);
      const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
      const current = prev[groupId] || [];

      // resolve selector for top-level or subgroup
      let selectorId: string | undefined;
      let selectorValue: FieldValue | undefined;
      if (subgroupInfo) {
        const parentDef = definition.questions.find(q => q.id === subgroupInfo.parentGroupId);
        const subDef = parentDef?.lineItemConfig?.subGroups?.find(
          s => resolveSubgroupKey(s) === subgroupInfo.subGroupId
        );
        selectorId = subDef?.sectionSelector?.id;
        selectorValue = subgroupSelectors[groupId];
      } else {
        selectorId = groupDef?.lineItemConfig?.sectionSelector?.id;
        selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      }

      const rowValues: Record<string, FieldValue> = sanitizePreset(preset);
      if (selectorId && selectorValue !== undefined && selectorValue !== null && rowValues[selectorId] === undefined) {
        rowValues[selectorId] = selectorValue;
      }
      const rowId = rowIdOverride || `${groupId}_${Math.random().toString(16).slice(2)}`;
      const row: LineItemRowState = {
        id: rowId,
        values: rowValues,
        parentId: subgroupInfo?.parentRowId,
        parentGroupId: subgroupInfo?.parentGroupId
      };
      const nextWithRow = { ...prev, [groupId]: [...current, row] };
      const nextLineItems = groupDef ? seedSubgroupDefaults(nextWithRow, groupDef, row.id) : nextWithRow;
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
        mode: 'init'
      });
      setValues(nextValues);
      return recomputed;
    });
  };

  const addLineItemRowManual = (groupId: string, preset?: Record<string, any>) => {
    const isEmptySelectorValue = (value: FieldValue | undefined): boolean => {
      if (value === undefined || value === null) return true;
      if (Array.isArray(value)) return value.length === 0;
      return value.toString().trim() === '';
    };

    const subgroupInfo = parseSubgroupKey(groupId);

    // Enforce required section selector before allowing manual inline adds.
    // (The selector control is not a formal question, so we guard here in addition to disabling the UI button.)
    let addMode: any;
    let selectorCfg: any;
    let selectorId: string | undefined;
    let selectorValue: FieldValue | undefined;
    let anchorFieldId: string | undefined;
    if (subgroupInfo) {
      const parentDef = definition.questions.find(q => q.id === subgroupInfo.parentGroupId);
      const subDef = parentDef?.lineItemConfig?.subGroups?.find(s => resolveSubgroupKey(s) === subgroupInfo.subGroupId);
      addMode = (subDef as any)?.addMode;
      selectorCfg = (subDef as any)?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId ? ((subgroupSelectors[groupId] as any) as FieldValue) : undefined;
      anchorFieldId =
        (subDef as any)?.anchorFieldId !== undefined && (subDef as any)?.anchorFieldId !== null
          ? (subDef as any).anchorFieldId.toString()
          : undefined;
    } else {
      const groupDef = definition.questions.find(q => q.id === groupId);
      addMode = groupDef?.lineItemConfig?.addMode;
      selectorCfg = groupDef?.lineItemConfig?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      anchorFieldId =
        groupDef?.lineItemConfig?.anchorFieldId !== undefined && groupDef?.lineItemConfig?.anchorFieldId !== null
          ? groupDef.lineItemConfig.anchorFieldId.toString()
          : undefined;
    }
    const inlineMode = addMode === undefined || addMode === null || addMode === 'inline';
    if (inlineMode && selectorCfg?.required && selectorId) {
      const presetSelector =
        preset && Object.prototype.hasOwnProperty.call(preset, selectorId) ? ((preset as any)[selectorId] as FieldValue) : undefined;
      const effectiveSelector = presetSelector !== undefined ? presetSelector : selectorValue;
      if (isEmptySelectorValue(effectiveSelector)) {
        onDiagnostic?.('ui.addRow.blocked', { groupId, reason: 'sectionSelector.required', selectorId });
        return;
      }
    }

    // When the inline Add button provides a preset (e.g. set ING from ITEM_FILTER), reuse the first empty
    // seeded row instead of creating a new blank row. This avoids ending up with an extra empty row
    // when minRows seeds 1+ rows by default.
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
          return;
        }
      }
    }

    const rowId = `${groupId}_${Math.random().toString(16).slice(2)}`;

    if (subgroupInfo) {
      setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
    }
    const anchor = `${groupId}__${rowId}`;
    onDiagnostic?.('ui.addRow.manual', { groupId, rowId, anchor, presetKeys: preset ? Object.keys(preset).slice(0, 10) : [] });
    setPendingScrollAnchor(anchor);
    addLineItemRow(groupId, { ...(preset || {}), [ROW_SOURCE_KEY]: 'manual' }, rowId);
  };

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
    setLineItems(prev => {
      const cascade = cascadeRemoveLineItemRows({ lineItems: prev, roots: [{ groupId, rowId }] });
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
      return recomputed;
    });
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

  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (submitting) return;
    if ((q as any)?.valueMap) return;
    if (q.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'readOnly' });
      return;
    }
    if (dedupLockActive && isFieldLockedByDedup(q.id)) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'dedupConflict' });
      return;
    }
    guidedLastUserEditAtRef.current = Date.now();
    onUserEdit?.({ scope: 'top', fieldPath: q.id, fieldId: q.id });
    if (onStatusClear) onStatusClear();
    const baseValues = { ...values, [q.id]: value };
    const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, baseValues, lineItems, {
      mode: 'change'
    });
    setValues(nextValues);
    if (nextLineItems !== lineItems) {
      setLineItems(nextLineItems);
    }
    setErrors(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    if (onSelectionEffect) {
      onSelectionEffect(q, value);
    }
  };

  const handleLineFieldChange = (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => {
    if (submitting) return;
    if (field?.valueMap) return;
    if (field?.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'line', fieldPath: `${group.id}__${field?.id || ''}__${rowId}`, reason: 'readOnly' });
      return;
    }
    if (dedupLockActive && isFieldLockedByDedup((field?.id || '').toString())) {
      onDiagnostic?.('field.change.blocked', {
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        reason: 'dedupConflict'
      });
      return;
    }
    guidedLastUserEditAtRef.current = Date.now();
    onUserEdit?.({
      scope: 'line',
      fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
      fieldId: (field?.id || '').toString(),
      groupId: group.id,
      rowId
    });
    if (onStatusClear) onStatusClear();
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const nextRowValues: Record<string, FieldValue> = { ...(currentRow?.values || {}), [field.id]: value };
    const nextRows = existingRows.map(row =>
      row.id === rowId ? { ...row, values: nextRowValues } : row
    );
    let updatedLineItems: LineItemState = { ...lineItems, [group.id]: nextRows };
    const { values: nextValues, lineItems: finalLineItems } = applyValueMapsToForm(definition, values, updatedLineItems, {
      mode: 'change'
    });
    setLineItems(finalLineItems);
    setValues(nextValues);
    setErrors(prev => {
      const next = { ...prev };
      delete next[group.id];
      delete next[`${group.id}__${field.id}__${rowId}`];
      return next;
    });
    if (onSelectionEffect) {
      const effectFields = (group.lineItemConfig?.fields || []).filter(hasSelectionEffects);
      if (effectFields.length) {
        const rowComplete = isLineRowComplete(group, nextRowValues);
        effectFields.forEach(effectField => {
          const isSourceField = effectField.id === field.id;
          const dependsOnChangedField = !isSourceField && selectionEffectDependsOnField(effectField, field.id);
          if (!isSourceField && !dependsOnChangedField) {
            return;
          }
          const contextId = buildLineContextId(group.id, rowId, effectField.id);
          const currentValue = nextRowValues[effectField.id] as FieldValue;
          const effectQuestion = effectField as unknown as WebQuestionDefinition;
          if (!isSourceField && dependsOnChangedField) {
            // Re-run effect with current value and force context reset so dependent fields (e.g., multipliers) refresh aggregates,
            // even if other fields in the row are still empty.
            onSelectionEffect(effectQuestion, currentValue ?? null, {
              contextId,
              lineItem: { groupId: group.id, rowId, rowValues: nextRowValues },
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
            lineItem: { groupId: group.id, rowId, rowValues: nextRowValues },
            forceContextReset: true
          });
        });
      }
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

  const topLevelGroupProgress = useMemo(() => {
    // Mirror the progress logic used in the group header UI.
    const isQuestionComplete = (q: WebQuestionDefinition): boolean => {
      if (q.type === 'LINE_ITEM_GROUP') {
        if (!q.lineItemConfig) return false;
        const getTopValueNoScan = (fieldId: string): FieldValue | undefined => {
          const direct = (values as any)[fieldId];
          if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
          const sys = getSystemFieldValue(fieldId, recordMeta);
          if (sys !== undefined) return sys as FieldValue;
          return undefined;
        };
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
      return !isEmptyValue(raw as any);
    };

    const groups = (groupSections || []).filter(s => s && !s.isHeader && s.collapsible);
    return groups
      .map(section => {
        const visible = (section.questions || []).filter(
          q =>
            !shouldHideField(q.visibility, {
              getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
            })
        );
        if (!visible.length) return null;

        const requiredQs = visible.filter(q => !!q.required);
        const totalRequired = requiredQs.length;
        const requiredComplete = requiredQs.reduce((acc, q) => (isQuestionComplete(q) ? acc + 1 : acc), 0);
        const complete = totalRequired > 0 && requiredComplete >= totalRequired;
        return { key: section.key, complete, totalRequired, requiredComplete };
      })
      .filter(Boolean) as Array<{ key: string; complete: boolean; totalRequired: number; requiredComplete: number }>;
  }, [collapsedRows, groupSections, language, lineItems, recordMeta, resolveVisibilityValue, values]);

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
    const hidden = shouldHideField(q.visibility, {
      getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
    });
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
        return (
          <div
            key={q.id}
            className="field inline-field ck-full-width"
            data-field-path={q.id}
          >
            <label style={srOnly}>{label}</label>
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
      case 'DATE':
        const mappedValue = q.valueMap
          ? resolveValueMapValue(q.valueMap, fieldId => values[fieldId], { language, targetOptions: toOptionSet(q) })
          : undefined;
        const inputValueRaw = q.valueMap ? (mappedValue || '') : ((values[q.id] as any) ?? '');
        const inputValue = q.type === 'DATE' ? toDateInputValue(inputValueRaw) : inputValueRaw;
        const numberText = q.type === 'NUMBER' ? (inputValue === undefined || inputValue === null ? '' : (inputValue as any).toString()) : null;
        if (renderAsLabel) {
          const displayValue = q.type === 'NUMBER' ? numberText : inputValue;
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
                readOnly={!!q.valueMap || q.readOnly === true}
                ariaLabel={resolveFieldLabel(q, language, q.id)}
                onChange={next => handleFieldChange(q, next)}
              />
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
              <textarea
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                rows={((q as any)?.ui as any)?.paragraphRows || 4}
              />
            ) : q.type === 'DATE' ? (
              <DateInput
                value={inputValue}
                language={language}
                readOnly={!!q.valueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
                ariaLabel={resolveLabel(q, language)}
                onChange={next => handleFieldChange(q, next)}
              />
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap || q.readOnly === true}
                disabled={submitting || isFieldLockedByDedup(q.id)}
              />
            )}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      case 'CHOICE': {
        const rawVal = values[q.id];
        const choiceValue = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        if (renderAsLabel) {
          const selected = opts.find(opt => opt.value === choiceValue);
          const display = selected?.label || choiceValue || null;
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
            {(() => {
              const selected = opts.find(opt => opt.value === choiceValue);
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
        if (renderAsLabel) {
          if (isConsentCheckbox) {
            const display = values[q.id]
              ? tSystem('common.yes', language, 'Yes')
              : tSystem('common.no', language, 'No');
            return renderReadOnly(display, { stacked: forceStackedLabel });
          }
          const labels = selected
            .map(val => opts.find(opt => opt.value === val)?.label || val)
            .filter(Boolean);
          const display = labels.length ? labels.join(', ') : null;
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
        const viewMode = readOnly || maxed || locked;
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
          const hideGroupLabel = q.ui?.hideLabel === true;
          const tapToOpenLabel = tSystem('common.tapToOpen', language, 'Tap to open');
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
                const val = (row?.values || {})[field.id];
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
                if (isEmptyValue(raw as any)) return false;
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
                    if (isEmptyValue(raw as any)) return false;
                  }
                }
              }
            }
            return hasAnyEnabledRow;
          })();
          const pillText = tSystem(
            groupCount === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
            language,
            groupCount === 1 ? '{count} item' : '{count} items',
            { count: groupCount }
          );
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
                {resolveLabel(q, language)}
                {q.required && <RequiredStar />}
              </label>
              <button
                type="button"
                className={`ck-progress-pill ck-upload-pill-btn ck-open-overlay-pill ${pillClass}`}
                aria-disabled={locked ? 'true' : undefined}
                aria-label={`${tapToOpenLabel} ${resolveLabel(q, language)} ${pillText}`}
                onClick={() => {
                  if (locked) return;
                  openLineItemGroupOverlay(q.id);
                }}
              >
                {pillClass === 'ck-progress-good' ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
                <span>{pillText}</span>
                <span className="ck-progress-label">{tapToOpenLabel}</span>
                <span className="ck-progress-caret">▸</span>
              </button>
              {renderWarnings(q.id)}
              {errors[q.id] ? (
                <div className="error">{errors[q.id]}</div>
              ) : groupHasAnyError ? (
                <div className="error">{tSystem('validation.needsAttention', language, 'Needs attention')}</div>
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
              onDiagnostic
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
        rowErrors.add(`${info.parentGroupId}::${info.parentRowId}`);
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
              if (subgroupInfo.parentGroupId !== groupId) continue;

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
              const parentRows = (lineItems as any)[groupId] || [];
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
              const ids: string[] = Array.isArray(rawFields)
                ? rawFields.map((v: any) => normalizeLineFieldId(groupId, v)).filter(Boolean)
                : rawFields
                    .toString()
                    .split(',')
                    .map((s: string) => normalizeLineFieldId(groupId, s))
                    .filter(Boolean);
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
        expandGroupForQuestionId(subgroupInfo.parentGroupId);
        const collapseKey = `${subgroupInfo.parentGroupId}::${subgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey = nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.parentGroupId}::${subgroupInfo.subGroupId}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
          openSubgroupOverlay(prefix);
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
          openLineItemGroupOverlay(prefix);
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
    const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
    try {
      focusable?.focus({ preventScroll: true } as any);
    } catch (_) {
      // ignore focus issues
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
    const parsed = parseSubgroupKey(subKey);
    const parentGroup = parsed ? definition.questions.find(q => q.id === parsed.parentGroupId) : undefined;
    const parentRows = parsed ? lineItems[parsed.parentGroupId] || [] : [];
    const parentRow = parsed ? parentRows.find(r => r.id === parsed.parentRowId) : undefined;
    const parentRowIdx = parsed ? parentRows.findIndex(r => r.id === parsed.parentRowId) : -1;
    const parentRowValues: Record<string, FieldValue> = parentRow?.values || {};

    const subConfig = parsed
      ? parentGroup?.lineItemConfig?.subGroups?.find(sub => resolveSubgroupKey(sub) === parsed.subGroupId)
      : undefined;
    const subLabel = parsed
      ? resolveLocalizedString(subConfig?.label, language, parsed.subGroupId)
      : resolveLocalizedString({ en: 'Subgroup', fr: 'Sous-groupe', nl: 'Subgroep' }, language, 'Subgroup');
    const parentLabel = parentGroup ? resolveLabel(parentGroup, language) : (parsed?.parentGroupId || 'Group');

    const rows = lineItems[subKey] || [];
    const orderedRows = [...rows].sort((a, b) => {
                      const aAuto = !!a.autoGenerated;
                      const bAuto = !!b.autoGenerated;
                      if (aAuto === bAuto) return 0;
                      return aAuto ? -1 : 1;
                    });

    const totalsCfg = subConfig ? { ...subConfig, fields: subConfig.fields || [] } : undefined;
    const totals = totalsCfg ? computeTotals({ config: totalsCfg as any, rows: orderedRows }, language) : [];

    const subSelectorCfg = subConfig?.sectionSelector;
                    const subSelectorValue = subgroupSelectors[subKey] || '';
                    const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
                    const subSelectorDepIds = Array.isArray(subSelectorCfg?.optionFilter?.dependsOn)
                      ? subSelectorCfg?.optionFilter?.dependsOn
                      : subSelectorCfg?.optionFilter?.dependsOn
                        ? [subSelectorCfg.optionFilter.dependsOn]
                        : [];
                    const subSelectorDepVals = subSelectorCfg?.optionFilter
                      ? subSelectorDepIds.map(depId =>
                          toDependencyValue(depId === subSelectorCfg.id ? subSelectorValue : (parentRowValues as any)[depId] ?? (values as any)[depId])
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
                    const subSelectorIsMissing = !!subSelectorCfg?.required && !(subSelectorValue || '').toString().trim();

    const renderAddButton = () => {
      if (!subConfig) {
        return (
          <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.secondary}>
            <PlusIcon />
            Add line
          </button>
        );
      }
      if (subConfig.addMode === 'overlay' && subConfig.anchorFieldId) {
                        return (
                          <button
                            type="button"
            style={buttonStyles.secondary}
                            onClick={async () => {
              const anchorField = (subConfig.fields || []).find(f => f.id === subConfig.anchorFieldId);
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
                                  nl: (anchorField as any).optionsNl || []
                                };
                              }
                              const dependencyIds = (
                                Array.isArray(anchorField.optionFilter?.dependsOn)
                                  ? anchorField.optionFilter?.dependsOn
                                  : [anchorField.optionFilter?.dependsOn || '']
                              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
              const depVals = dependencyIds.map(dep => toDependencyValue(parentRowValues[dep] ?? values[dep] ?? subSelectorValue));
                              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                              const localized = buildLocalizedOptions(opts, allowed, language, { sort: optionSortFor(anchorField) });
                              const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                              setOverlay({
                                open: true,
                                options: localized
                                  .filter(opt => deduped.includes(opt.value))
                                  .map(opt => ({ value: opt.value, label: opt.label })),
                                groupId: subKey,
                                anchorFieldId: anchorField.id,
                                selected: []
                              });
                            }}
                          >
            <PlusIcon />
            {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines')}
                          </button>
                        );
                      }
                      return (
        <button type="button" disabled={subSelectorIsMissing} onClick={() => addLineItemRowManual(subKey)} style={withDisabled(buttonStyles.secondary, subSelectorIsMissing)}>
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
            lineItemConfig: { ...(subConfig as any), fields: subConfig.fields || [], subGroups: [] }
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
      background: '#ffffff',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #e5e7eb',
            background: '#ffffff',
            boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              gap: 12
            }}
          >
            <div />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 40, color: '#0f172a', letterSpacing: -0.4 }}>{subLabel}</div>
              <div className="muted" style={{ fontWeight: 700, marginTop: 8, fontSize: 24 }}>
                {parentLabel}
                {parentRowIdx >= 0
                  ? ` · ${tSystem('overlay.row', language, 'Row')} ${parentRowIdx + 1}`
                  : parsed?.parentRowId
                  ? ` · ${parsed.parentRowId}`
                  : ''}
                {` · ${tSystem(
                  orderedRows.length === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                  language,
                  orderedRows.length === 1 ? '{count} item' : '{count} items',
                  { count: orderedRows.length }
                )}`}
                          </div>
            </div>
            <div style={{ justifySelf: 'end' }}>
              <button type="button" onClick={closeSubgroupOverlay} style={buttonStyles.secondary}>
                {tSystem('common.close', language, 'Close')}
              </button>
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
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {subSelectorCfg && subSelectorOptions.length ? (
                                <div
                                  className="section-selector"
                                  data-field-path={subSelectorCfg.id}
                    style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}
                                >
                    <label style={{ fontWeight: 700 }}>{resolveSelectorLabel(subSelectorCfg, language)}</label>
                                  {subSelectorOptions.length >= 20 ? (
                                    <SearchableSelect
                                      value={subSelectorValue || ''}
                                      disabled={submitting}
                                      placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
                                      emptyText={tSystem('common.noMatches', language, 'No matches.')}
                                      options={subSelectorOptions.map(opt => ({ value: opt.value, label: opt.label }))}
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
                {renderAddButton()}
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
          <div data-overlay-scroll-container="true" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {!subGroupDef ? (
            <div className="error">
              Unable to load subgroup editor (missing group/subgroup configuration for <code>{subKey}</code>).
            </div>
          ) : orderedRows.length ? (
            orderedRows.map((subRow, subIdx) => {
              const isAutoRow =
                !!subRow.autoGenerated || (subRow.values && (subRow.values as any)[ROW_SOURCE_KEY] === 'auto');
              const anchorFieldId =
                subConfig?.anchorFieldId !== undefined && subConfig?.anchorFieldId !== null ? subConfig.anchorFieldId.toString() : '';
              const anchorField = anchorFieldId ? (subConfig?.fields || []).find(f => f.id === anchorFieldId) : undefined;
              const showAnchorTitle = !!anchorField && isAutoRow;
              const rowDisclaimerText = resolveRowDisclaimerText({
                ui: subConfig?.ui as any,
                language,
                rowValues: (subRow.values || {}) as any,
                autoGenerated: isAutoRow,
                getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
              });

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
                      return toDependencyValue(subRow.values?.[dep] ?? values[dep] ?? parentRowValues[dep] ?? selectorFallback);
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
                              style={{
                    background: subIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid #e5e7eb',
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
                                  <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
                        {resolveLocalizedString({ en: 'Manual', fr: 'Manuel', nl: 'Handmatig' }, language, 'Manual')}
                                  </span>
                                </div>
                              )}
                  {(() => {
                    const renderSubField = (field: any) => {
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
                          return toDependencyValue(subRow.values[dep] ?? values[dep] ?? parentRowValues[dep] ?? selectorFallback);
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
                          const viewMode = readOnly || maxed;
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
                                  if (parentRowValues.hasOwnProperty(fid)) return parentRowValues[fid];
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
                      .filter(field => {
                      const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                      return !hideField;
                      })
                      .filter(field => !(showAnchorTitle && anchorFieldId && field.id === anchorFieldId));

                    const contextPrefix = parsed ? `sub:${parsed.parentGroupId}:${parsed.subGroupId}` : `sub:${subKey}`;

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
                                  if (Object.prototype.hasOwnProperty.call(parentRowValues || {}, fid)) return parentRowValues[fid];
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
                          return !isEmptyValue(raw as any);
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
            background: '#ffffff',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22 }}>{tSystem('common.error', language, 'Error')}</div>
              <button type="button" onClick={closeLineItemGroupOverlay} style={buttonStyles.secondary}>
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

    const rowsAll = lineItems[groupId] || [];
    const rows =
      overlayRowFilter && Array.isArray(rowsAll) ? rowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any)) : rowsAll;
    const count = rows.length;
    const title = resolveLabel(group, language);

    const groupCfg = (group as any).lineItemConfig as any;
    const locked = submitting || isFieldLockedByDedup(groupId);

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
    const selectorIsMissing = !!selectorCfg?.required && !(selectorValue || '').toString().trim();

    const totals = groupCfg ? computeTotals({ config: groupCfg as any, rows }, language) : [];

    const renderAddButton = () => {
      if (!groupCfg) {
        return (
          <button type="button" onClick={() => addLineItemRowManual(groupId)} style={buttonStyles.secondary} disabled={locked}>
            <PlusIcon />
            {tSystem('lineItems.addLine', language, 'Add line')}
          </button>
        );
      }
      if (groupCfg.addMode === 'overlay' && groupCfg.anchorFieldId) {
        return (
          <button
            type="button"
            disabled={locked || selectorIsMissing}
            style={withDisabled(buttonStyles.secondary, locked || selectorIsMissing)}
            onClick={async () => {
              if (locked || selectorIsMissing) return;
              const anchorField = (groupCfg.fields || []).find((f: any) => f.id === groupCfg.anchorFieldId);
              if (!anchorField || anchorField.type !== 'CHOICE') {
                addLineItemRowManual(groupId);
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
              setOverlay({
                open: true,
                options: localized
                  .filter(opt => deduped.includes(opt.value))
                  .map(opt => ({ value: opt.value, label: opt.label })),
                groupId,
                anchorFieldId: anchorField.id,
                selected: []
              });
            }}
          >
            <PlusIcon />
            {resolveLocalizedString(groupCfg.addButtonLabel, language, tSystem('lineItems.addLines', language, 'Add lines'))}
          </button>
        );
      }
      return (
        <button
          type="button"
          disabled={locked || selectorIsMissing}
          onClick={() => {
            const anchorFieldId =
              groupCfg?.anchorFieldId !== undefined && groupCfg?.anchorFieldId !== null ? groupCfg.anchorFieldId.toString() : '';
            const selectorPreset =
              anchorFieldId && (selectorValue || '').toString().trim()
                ? { [anchorFieldId]: (selectorValue || '').toString().trim() }
                : undefined;
            addLineItemRowManual(groupId, selectorPreset);
          }}
          style={withDisabled(buttonStyles.secondary, locked || selectorIsMissing)}
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
          background: '#ffffff',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #e5e7eb',
            background: '#ffffff',
            boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              gap: 12
            }}
          >
            <div />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 40, color: '#0f172a', letterSpacing: -0.4 }}>{title}</div>
              <div className="muted" style={{ fontWeight: 700, marginTop: 8, fontSize: 24 }}>
                {tSystem(
                  count === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                  language,
                  count === 1 ? '{count} item' : '{count} items',
                  { count }
                )}
              </div>
            </div>
            <div style={{ justifySelf: 'end' }}>
              <button type="button" onClick={closeLineItemGroupOverlay} style={buttonStyles.secondary}>
                {tSystem('common.close', language, 'Close')}
              </button>
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
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {selectorCfg && selectorOptions.length ? (
                  <div className="section-selector" data-field-path={selectorCfg.id} style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontWeight: 700 }}>
                      {resolveSelectorLabel(selectorCfg, language)}
                      {selectorCfg.required && <RequiredStar />}
                    </label>
                    {selectorOptions.length >= 20 ? (
                      <SearchableSelect
                        value={selectorValue || ''}
                        disabled={locked}
                        placeholder={tSystem('common.selectPlaceholder', language, 'Select…')}
                        emptyText={tSystem('common.noMatches', language, 'No matches.')}
                        options={selectorOptions.map(opt => ({ value: opt.value, label: opt.label }))}
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
                {!overlayRowFilter ? renderAddButton() : null}
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
          <div data-overlay-scroll-container="true" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <LineItemGroupQuestion
              key={overlayGroup.id}
              q={overlayGroup as any}
              rowFilter={overlayRowFilter}
              hideInlineSubgroups={overlayHideInlineSubgroups}
              ctx={{
                definition,
                language,
                values,
                resolveVisibilityValue,
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
                onDiagnostic
              }}
            />
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
    const stepStatus = guidedStatus.steps.find(s => s.id === activeGuidedStepId);
    const stepForwardGate = normalizeForwardGate(
      stepCfg?.navigation?.forwardGate ?? stepCfg?.forwardGate,
      guidedDefaultForwardGate
    );
    const attempted = Boolean((guidedStepAttempted || {})[activeGuidedStepId]);

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
      const allowedFieldIds = (() => {
        const raw = target.fields;
        if (!raw) return null;
        const ids: string[] = Array.isArray(raw)
          ? raw.map((v: any) => normalizeLineFieldId(groupQ.id, v)).filter(Boolean)
          : raw
              .toString()
              .split(',')
              .map((s: string) => normalizeLineFieldId(groupQ.id, s))
              .filter(Boolean);
        return ids.length ? new Set(ids) : null;
      })();
      const readOnlyFieldIds = (() => {
        const raw = (target as any).readOnlyFields;
        if (!raw) return null;
        const ids: string[] = Array.isArray(raw)
          ? raw.map((v: any) => normalizeLineFieldId(groupQ.id, v)).filter(Boolean)
          : raw
              .toString()
              .split(',')
              .map((s: string) => normalizeLineFieldId(groupQ.id, s))
              .filter(Boolean);
        return ids.length ? new Set(ids) : null;
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
          const allowedSubFields = Array.isArray(allowedSubFieldsRaw)
            ? new Set(allowedSubFieldsRaw.map((v: any) => normalizeLineFieldId(subId, v)).filter(Boolean))
            : null;
          const readOnlySubFieldsRaw = subTarget?.readOnlyFields;
          const readOnlySubFields = Array.isArray(readOnlySubFieldsRaw)
            ? new Set(readOnlySubFieldsRaw.map((v: any) => normalizeLineFieldId(subId, v)).filter(Boolean))
            : null;

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
          return { ...(sub as any), fields: finalFields };
        });
      })();

      const stepLineCfg: any = { ...(lineCfg as any), fields: filteredFields, subGroups: filteredSubGroups };
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

      const groupCountAll = (lineItems[stepGroup.id] || []).length;
      const filteredCount =
        rowFilter && Array.isArray(lineItems[stepGroup.id])
          ? (lineItems[stepGroup.id] || []).filter(r => {
              const rowValues = (r as any)?.values || {};
              const includeWhen = (rowFilter as any)?.includeWhen;
              const excludeWhen = (rowFilter as any)?.excludeWhen;
              const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
              const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
              const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
              return includeOk && !excludeMatch;
            }).length
          : groupCountAll;

      if (effectiveLineMode === 'overlay') {
        const label = resolveLabel(stepGroup, language);
        const openLabel = tSystem('common.open', language, 'Open');
        const pillText = tSystem(
          filteredCount === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
          language,
          filteredCount === 1 ? '{count} item' : '{count} items',
          { count: filteredCount }
        );
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
          rowFilter={rowFilter}
          hideInlineSubgroups={hideInlineSubgroups}
          ctx={{
            definition,
            language,
            values,
            resolveVisibilityValue,
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
            onDiagnostic
          }}
        />
      );
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

    const stepGateNotice = (() => {
      const explicit = guidedStepGateNotice && guidedStepGateNotice.stepId === activeGuidedStepId ? guidedStepGateNotice : null;
      if (explicit) return explicit;
      if (!attempted) return null;
      const missingComplete = stepStatus?.missingRequiredCount || 0;
      const missingValid = stepStatus?.missingValidCount || 0;
      const ruleErrors = stepStatus?.errorCount || 0;
      const hasValidationIssues = missingValid > 0 || ruleErrors > 0;

      if (stepForwardGate === 'whenComplete' && !stepStatus?.complete) {
        return {
          stepId: activeGuidedStepId,
          tone: 'error' as const,
          message: tSystem(
            'steps.completeToContinue',
            language,
            'Complete all fields in this step to continue. Missing: {count}',
            { count: missingComplete }
          )
        };
      }

      if (stepForwardGate === 'whenValid' && !stepStatus?.valid) {
        return {
          stepId: activeGuidedStepId,
          tone: 'error' as const,
          message: tSystem(
            'steps.fixErrorsToContinue',
            language,
            'Fix the highlighted errors in this step to continue. Issues: {count}',
            { count: missingValid + ruleErrors }
          )
        };
      }

      // For non-blocking validation (e.g., forwardGate=whenComplete), still surface issues at the step level once attempted.
      if (hasValidationIssues) {
        return {
          stepId: activeGuidedStepId,
          tone: 'warning' as const,
          message: tSystem(
            'steps.validationIssues',
            language,
            'This step has validation issues. Issues: {count}',
            { count: missingValid + ruleErrors }
          )
        };
      }
      return null;
    })();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stepsBarPortal}
        {stepsBarInline}
        <div ref={guidedStepBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stepGateNotice ? (
            <div
              role={stepGateNotice.tone === 'error' ? 'alert' : 'status'}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border:
                  stepGateNotice.tone === 'error' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(245,158,11,0.45)',
                background: stepGateNotice.tone === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.12)',
                color: '#0f172a',
                fontWeight: 800
              }}
            >
              {stepGateNotice.message}
            </div>
          ) : null}
          {stepHelpText ? (
            <div
              role="note"
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(59,130,246,0.22)',
                background: 'rgba(59,130,246,0.08)',
                color: '#0f172a',
                fontWeight: 700
              }}
            >
              {stepHelpText}
            </div>
          ) : null}
          {headerTargets.map(t => renderTarget(t, 'header'))}
          {stepTargets.map(t => renderTarget(t, `step:${activeGuidedStepId}`))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ck-form-sections">
        {showWarningsBanner && warningTop && warningTop.length ? (
          <div
            role="status"
            style={{
              scrollMarginTop: 'calc(var(--safe-top) + 140px)',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid #fdba74',
              background: '#ffedd5',
              color: '#0f172a',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div>{tSystem('validation.warningsTitle', language, 'Warnings')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 700 }}>
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
                  ? '1px solid #fca5a5'
                  : statusTone === 'success'
                  ? '1px solid #86efac'
                  : '1px solid #bae6fd',
              background:
                statusTone === 'error'
                  ? '#fee2e2'
                  : statusTone === 'success'
                  ? '#dcfce7'
                  : '#e0f2fe',
              color: '#0f172a',
              fontWeight: 800,
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
                const visible = (section.questions || []).filter(
                  q =>
                    !shouldHideField(q.visibility, {
                      getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
                    })
                );
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
        addLineItemRowManual={addLineItemRowManual}
      />
      {lineItemGroupOverlayPortal}
      {subgroupOverlayPortal}
      {fileOverlayPortal}
      {infoOverlayPortal}
    </>
  );
};

export default FormView;
