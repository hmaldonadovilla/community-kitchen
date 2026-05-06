import type React from 'react';

import type {
  FieldValue,
  LangCode,
  LineItemGroupConfigOverride,
  RowFlowConfig,
  StepDataSourceBootstrapConfig,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../types';
import type { LineItemOverlaySessionConfig, OverlayCloseConfirmLike } from '../../../../types';
import type { ConfirmDialogOpenArgs } from '../../features/overlays/useConfirmDialog';
import type { FormErrors, LineItemAddResult, LineItemState, OptionState } from '../../types';
import type { LineOverlayState } from './overlays/LineSelectOverlay';

/**
 * Owner: line item form renderer.
 * Defines the public contract for LineItemGroupQuestion without importing the
 * large renderer module. Keep this file limited to types shared by FormView and
 * line-item subcomponents.
 */

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

export interface LineFileUploadOrderedEntryCheckArgs {
  group: WebQuestionDefinition;
  rowId: string;
  field: any;
  fieldPath: string;
  source?: string;
  validate?: boolean;
}

export interface ChoiceControlArgs {
  fieldPath: string;
  value: string;
  options: Array<{ value: string; label: string; tooltip?: string; searchText?: string }>;
  required: boolean;
  placeholder?: string;
  searchEnabled?: boolean;
  override?: string | null;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  onChange: (next: string) => void;
}

export interface LineItemGroupQuestionCtx {
  formKey?: string;
  recordId?: string | null;
  recordMeta?: { id?: any; createdAt?: any; updatedAt?: any; status?: any; pdfUrl?: any };
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

  /**
   * True only while a save/submit operation is in flight.
   * Keep separate from lock-state so bypass fields remain editable under a field disable rule.
   */
  isSubmitting?: boolean;
  submitting: boolean;
  isFieldLockedByDedup?: (fieldId: string) => boolean;

  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  warningByField?: Record<string, string[]>;

  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;

  ensureLineOptions: (groupId: string, field: any) => void;

  renderChoiceControl: (args: ChoiceControlArgs) => React.ReactNode;

  openInfoOverlay: (title: string, text: string) => void;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  checkFileUploadOrderedEntry?: (args: LineFileUploadOrderedEntryCheckArgs) => boolean;
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
      overlaySession?: LineItemOverlaySessionConfig;
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
      overlaySession?: LineItemOverlaySessionConfig;
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
    nextLineItems: LineItemState,
    options?: { mode?: 'init' | 'change' | 'blur'; topValues?: Record<string, FieldValue> }
  ) => void;
  setAutoSaveHold?: (hold: boolean, meta?: { reason?: string }) => void;
  ensureRecordId?: (args?: { reason?: string; fieldPath?: string }) => Promise<{ success: boolean; recordId?: string; message?: string }>;
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
  waitForGuidedStepReservationDraftSync?: (args: {
    recordId: string;
    stepId?: string;
    reason: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  waitForPendingSharedDataMutations?: (args: {
    targetFormKeys: string[];
    recordId?: string;
    stepId?: string;
    reason: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean; message?: string }>;
  handleLineFieldChange: (
    group: WebQuestionDefinition,
    rowId: string,
    field: any,
    value: FieldValue,
    options?: { source?: 'user' | 'selectionEffectInit' }
  ) => void;

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
  uploadFailures?: Record<string, { message: string; retrying?: boolean }>;
  onRetryUploadFailure?: (fieldPath: string) => void;

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

export interface LineItemGroupQuestionProps {
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
   * Optional step-scoped datasource-backed row renderers.
   * These rows are virtual UI rows: they render from datasource entries and synchronize into a
   * real output subgroup (for example MP_TYPE_LI), but they are not themselves persisted as form data.
   */
  dataSourceRows?: any[];
  /**
   * Optional guided-step datasource bootstrap controls.
   */
  dataSourceBootstrap?: StepDataSourceBootstrapConfig;
  /**
   * When true, hide the inline subgroup editor sections and rely on subgroup "open" pills/overlays instead.
   */
  hideInlineSubgroups?: boolean;
  /**
   * When true, suppress the top/bottom add/selector toolbars (used by overlay headers).
   */
  hideToolbars?: boolean;
  /**
   * Optional step-scoped helper text rendered above the group body.
   * Useful for guided steps that need contextual instructions without mutating the base question config.
   */
  supplementalHelperText?: string;
  /**
   * When true, hide the supplemental helper when every active datasource-backed source-first config has zero source rows.
   */
  hideSupplementalHelperWhenNoSourceRows?: boolean;
}
