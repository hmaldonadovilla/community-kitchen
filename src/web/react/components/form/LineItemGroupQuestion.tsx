import React from 'react';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
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
  OptionSet,
  ValidationRule,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { FormErrors, LineItemState, OptionState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import {
  describeUploadItem,
  formatOptionFilterNonMatchWarning,
  getUploadMinRequired,
  isUploadValueComplete,
  resolveRowDisclaimerText,
  toDateInputValue,
  toUploadItems
} from './utils';
import {
  buttonStyles,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  XIcon,
  PaperclipIcon,
  PlusIcon,
  RequiredStar,
  srOnly,
  withDisabled
} from './ui';
import { DateInput } from './DateInput';
import { GroupedPairedFields } from './GroupedPairedFields';
import { InfoTooltip } from './InfoTooltip';
import { LineItemTable } from './LineItemTable';
import { LineOverlayState } from './overlays/LineSelectOverlay';
import { SearchableSelect } from './SearchableSelect';
import { LineItemMultiAddSelect } from './LineItemMultiAddSelect';
import { NumberStepper } from './NumberStepper';
import { PairedRowGrid } from './PairedRowGrid';
import { resolveValueMapValue } from './valueMaps';
import { buildSelectorOptionSet, resolveSelectorLabel, resolveSelectorPlaceholder } from './lineItemSelectors';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_AUTO,
  ROW_SOURCE_KEY,
  buildSubgroupKey,
  parseRowHideRemove,
  parseRowNonMatchOptions,
  parseRowSource,
  resolveSubgroupKey
} from '../../app/lineItems';
import { applyValueMapsToForm } from '../../app/valueMaps';

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
  openSubgroupOverlay: (subKey: string) => void;

  addLineItemRowManual: (groupId: string, preset?: Record<string, any>) => void;
  removeLineRow: (groupId: string, rowId: string) => void;
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
}> = ({ q, ctx, rowFilter, hideInlineSubgroups, hideToolbars }) => {
  const {
    definition,
    language,
    values,
    resolveVisibilityValue,
    setValues,
    lineItems,
    setLineItems,
    submitting,
    errors,
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
    uploadAnnouncements,
    handleLineFileInputChange,
    handleLineFileDrop,
    removeLineFile,
    clearLineFiles,
    errorIndex,
    setOverlay,
    onDiagnostic
  } = ctx;

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

  const groupChoiceSearchDefault = (q.lineItemConfig?.ui as any)?.choiceSearchEnabled;

  const AUTO_CONTEXT_PREFIX = '__autoAddMode__';
  // IMPORTANT: section selectors can commit their value on blur (e.g., SearchableSelect).
  // When the user clicks "Add" while the selector still has focus, the click handler can run
  // before React state has re-rendered with the committed value. These refs ensure we can
  // read the latest committed selector values synchronously in the Add handlers.
  const latestSectionSelectorValueRef = React.useRef<string>('');
  const latestSubgroupSelectorValueRef = React.useRef<Record<string, string>>({});
  const selectorSearchLoggedRef = React.useRef<Set<string>>(new Set());
  const selectorOverlayLoggedRef = React.useRef<Set<string>>(new Set());
  const warningModeLoggedRef = React.useRef<Set<string>>(new Set());
  const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
    const raw = (field as any)?.optionSort;
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'source' ? 'source' : 'alphabetical';
  };

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
                  setOverlay({
                    open: true,
                    options: overlayOptions,
                    groupId: q.id,
                    anchorFieldId: anchorField.id,
                    selected: []
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

        const renderRowsAll = lineItems[q.id] || [];
        const parentRows = rowFilter ? renderRowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any)) : renderRowsAll;
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
        const selectorControl =
          selectorCfg && (canUseSelectorOverlay ? selectorOverlayOptions.length : selectorOptions.length) ? (
            <div
              className="section-selector"
              data-field-path={selectorCfg.id}
              style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <label style={{ fontWeight: 600 }}>
                {resolveSelectorLabel(selectorCfg, language)}
                {selectorCfg.required && <RequiredStar />}
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
        const showItemPill = liUi?.showItemPill !== undefined ? !!liUi.showItemPill : true;
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
          if (liUi?.showItemPill === false) onDiagnostic('ui.lineItems.itemPill.disabled', { groupId: q.id });
          if (liUi?.addButtonPlacement && liUi.addButtonPlacement !== 'both') {
            onDiagnostic('ui.lineItems.addButtonPlacement', { groupId: q.id, value: liUi.addButtonPlacement });
          }
        }, [onDiagnostic, liUi?.addButtonPlacement, liUi?.showItemPill, q.id]);

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
          !hideToolbars &&
          (parentRows.length > 0 || showAddBottom) &&
          (showAddBottom || showSelectorBottom || groupTotals.length > 0);

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

          const getTopValue = (fid: string): FieldValue | undefined =>
            resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid];

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
              getLineValue: (_rowId, fid) => (row?.values || {})[fid]
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
              getLineValue: (_rowId, fid) => rowValues[fid]
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
                  getLineValue: (_rowId, fid) => subRowValues[fid]
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

        if (isTableMode) {
          const tableFieldsAll = messageFieldsAll;
          const tableColumnIdsRaw = Array.isArray(liUi?.tableColumns) ? liUi?.tableColumns : [];
          const tableColumnIds = tableColumnIdsRaw
            .map(id => (id !== undefined && id !== null ? id.toString().trim() : ''))
            .filter(Boolean);
          const tableFields = (tableColumnIds.length ? tableColumnIds : tableFieldsAll.map(f => f.id))
            .map(fid => tableFieldsAll.find(f => f.id === fid))
            .filter(Boolean) as any[];
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

          const renderTableField = (field: any, row: any, rowIdx: number) => {
            const groupCtx: VisibilityContext = {
              getValue: fid => (resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid]),
              getLineValue: (_rowId, fid) => row.values[fid]
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
            const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;
            const rowNonMatchWarning = useDescriptiveNonMatchWarnings ? getRowNonMatchWarning(row) : '';
            const showNonMatchWarning =
              useDescriptiveNonMatchWarnings &&
              !!rowNonMatchWarning &&
              typeof (field as any)?.optionFilter?.matchMode === 'string' &&
              (field as any).optionFilter.matchMode === 'or';
            const fieldWarning = warningsFor(fieldPath);
            const hasFieldWarning = fieldWarning.length > 0 || showNonMatchWarning;
            const hasFieldError = !!errors[fieldPath];

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
                    data-has-warning={hasFieldWarning ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    {selected?.label || choiceVal || '—'}
                  </div>
                );
              }
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
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
                </div>
              );
            }

            if (field.type === 'CHECKBOX') {
              const selected = Array.isArray(row.values[field.id]) ? (row.values[field.id] as string[]) : [];
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
                  <div
                    className="ck-line-item-table__value"
                    data-has-warning={hasFieldWarning ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    {labels.length ? labels.join(', ') : '—'}
                  </div>
                );
              }
              const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
              const renderAsMultiSelect = controlOverride === 'select';
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
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
                </div>
              );
            }

            if (field.type === 'FILE_UPLOAD') {
              const items = toUploadItems(row.values[field.id]);
              const count = items.length;
              if (renderAsLabel) {
                return (
                  <div
                    className="ck-line-item-table__value"
                    data-has-warning={hasFieldWarning ? 'true' : undefined}
                    data-has-error={hasFieldError ? 'true' : undefined}
                  >
                    {count ? `${count}` : '—'}
                  </div>
                );
              }
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <button
                    type="button"
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
                    style={buttonStyles.secondary}
                    disabled={submitting}
                  >
                    {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
                  </button>
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
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  {display || '—'}
                </div>
              );
            }
            if (field.type === 'NUMBER') {
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <NumberStepper
                    value={numberText}
                    disabled={submitting}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    ariaLabel={resolveFieldLabel(field, language, field.id)}
                    onChange={next => handleLineFieldChange(q, row.id, field, next)}
                  />
                </div>
              );
            }
            if (field.type === 'PARAGRAPH') {
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <textarea
                    className="ck-paragraph-input"
                    value={fieldValue}
                    onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    rows={(field as any)?.ui?.paragraphRows || 3}
                  />
                </div>
              );
            }
            if (field.type === 'DATE') {
              return (
                <div
                  className="ck-line-item-table__control"
                  data-has-warning={hasFieldWarning ? 'true' : undefined}
                  data-has-error={hasFieldError ? 'true' : undefined}
                >
                  <DateInput
                    value={fieldValue}
                    language={language}
                    readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                    ariaLabel={resolveFieldLabel(field, language, field.id)}
                    onChange={next => handleLineFieldChange(q, row.id, field, next)}
                  />
                </div>
              );
            }
            return (
              <div
                className="ck-line-item-table__control"
                data-has-warning={hasFieldWarning ? 'true' : undefined}
                data-has-error={hasFieldError ? 'true' : undefined}
              >
                <input
                  type="text"
                  value={fieldValue}
                  onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                  readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                />
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
                  <XIcon size={18} />
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

          const tableColumns = [
            ...tableFields.map(field => ({
              id: field.id,
              label: resolveFieldLabel(field, language, field.id),
              style: resolveTableColumnStyle(field.id),
              renderCell: (row: any, rowIdx: number) => renderTableField(field, row, rowIdx)
            })),
            { ...removeColumn, style: resolveTableColumnStyle(removeColumn.id) }
          ];

          const warningsLegend: Array<{ rowId: string; label: string; message: string }> = [];
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
                warningsLegend.push({ rowId: row.id, label: '', message });
                return;
              }
              const dedupeKey = `${rowLabel || ''}::${message}`;
              if (seenRowMessage.has(dedupeKey)) return;
              seenRowMessage.add(dedupeKey);
              warningsLegend.push({ rowId: row.id, label: rowLabel, message });
            });
          });
          const warningsLegendVisible = warningsLegend.length > 0;

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
                {showItemPill ? (
                  <span className="pill" style={{ background: '#e2e8f0', color: '#334155' }}>
                    {tSystem(
                      parentCount === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                      language,
                      parentCount === 1 ? '{count} item' : '{count} items',
                      { count: parentCount }
                    )}
                  </span>
                ) : null}
              </div>
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
                />
              </div>
              {warningsLegendVisible ? (
                <div className="ck-line-item-table__legend">
                  <div className="ck-line-item-table__legend-title">
                    {tSystem('validation.warningsTitle', language, 'Warnings')}
                  </div>
                  <div className="ck-line-item-table__legend-items">
                    {warningsLegend.map((entry, idx) => (
                      <div key={`${entry.rowId}-legend-${idx}`} className="ck-line-item-table__legend-item">
                        <span className="ck-line-item-table__legend-icon" aria-hidden="true">
                          !
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
                    {groupTotals.length > 0 ? (
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
        }

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
              {showItemPill ? (
                <span className="pill" style={{ background: '#e2e8f0', color: '#334155' }}>
                  {tSystem(
                    parentCount === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                    language,
                    parentCount === 1 ? '{count} item' : '{count} items',
                    { count: parentCount }
                  )}
                </span>
              ) : null}
            </div>
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
              const groupCtx: VisibilityContext = {
                getValue: fid => (resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid]),
                getLineValue: (_rowId, fid) => row.values[fid]
              };
              const ui = q.lineItemConfig?.ui;
              const guidedCollapsedFieldsInHeader = Boolean((ui as any)?.guidedCollapsedFieldsInHeader);
              const isProgressive =
                ui?.mode === 'progressive' && Array.isArray(ui.collapsedFields) && ui.collapsedFields.length > 0;
              const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsedBase = isProgressive ? (collapsedRows[collapseKey] ?? defaultCollapsed) : false;
              const rowCollapsed = guidedCollapsedFieldsInHeader ? false : rowCollapsedBase;

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
              const subGroups = q.lineItemConfig?.subGroups || [];
              const subIdToLabel: Record<string, string> = {};
              subGroups.forEach(sub => {
                const id = resolveSubgroupKey(sub);
                if (!id) return;
                const label = resolveLocalizedString(sub.label, language, id);
                subIdToLabel[id] = label || id;
              });
              const subIds = Object.keys(subIdToLabel);
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
                          getValue: fid => (resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid]),
                          getLineValue: (_rowId, fid) => (subRow?.values || {})[fid]
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
                            getValue: fid => (resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid]),
                            getLineValue: (_rowId, fid) => (subRow?.values || {})[fid]
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
                                    return resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid];
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
                          return resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid];
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
                      getValue: fid => (resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid]),
                      getLineValue: (_rowId, fid) => (subRow?.values || {})[fid]
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
                              return resolveVisibilityValue ? resolveVisibilityValue(fid) : values[fid];
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
              const buildHeaderRows = (fields: any[]): any[][] => {
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

              const headerCollapsedFieldIdSet = new Set<string>(
                guidedCollapsedFieldsInHeader && isProgressive
                  ? (collapsedFieldsOrdered || [])
                      .map((f: any) => (f?.id !== undefined && f?.id !== null ? f.id.toString() : ''))
                      .filter(Boolean)
                  : []
              );
              const headerCollapsedFieldsToRender =
                guidedCollapsedFieldsInHeader && isProgressive
                  ? (collapsedFieldsOrdered || []).filter((f: any) => {
                      const fid = f?.id !== undefined && f?.id !== null ? f.id.toString() : '';
                      if (!fid) return false;
                      // In guided-header mode we may show the anchor as a standalone row title. Don't also render it in the grid.
                      if (showAnchorTitleAsHeaderTitle && fid === anchorFieldId) return false;
                      if (showTitleControlInHeader && fid === titleFieldId) return false;
                      return true;
                    })
                  : [];
              const bodyFieldsToRenderBase =
                guidedCollapsedFieldsInHeader && isProgressive
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
                const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;
                const showNonMatchWarning =
                  useDescriptiveNonMatchWarnings &&
                  !!rowNonMatchWarning &&
                  typeof (field as any)?.optionFilter?.matchMode === 'string' &&
                  (field as any).optionFilter.matchMode === 'or';
                const nonMatchWarningNode = showNonMatchWarning ? <div className="warning">{rowNonMatchWarning}</div> : null;

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
                  return Array.from(new Set(filtered));
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
                    if (renderAsLabel) {
                      const selected = optsField.find(opt => opt.value === choiceVal);
                      const display = selected?.label || choiceVal || null;
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
                          {(() => {
                            const selected = optsField.find(opt => opt.value === choiceVal);
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
                    if (renderAsLabel) {
                      if (isConsentCheckbox) {
                        const display = row.values[field.id]
                          ? tSystem('common.yes', language, 'Yes')
                          : tSystem('common.no', language, 'No');
                        return renderReadOnlyLine(display);
                      }
                      const labels = selected
                        .map(val => optsField.find(opt => opt.value === val)?.label || val)
                        .filter(Boolean);
                      const display = labels.length ? labels.join(', ') : null;
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
                          {helperText ? <div className="ck-upload-helper">{helperText}</div> : null}
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
                    if (renderAsLabel) {
                      const display =
                        field.type === 'NUMBER'
                          ? numberText
                          : field.type === 'DATE'
                            ? fieldValue
                            : fieldValue;
                      return renderReadOnlyLine(display || null);
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
                            onChange={next => handleLineFieldChange(q, row.id, field, next)}
                          />
                        ) : field.type === 'PARAGRAPH' ? (
                          <textarea
                            className="ck-paragraph-input"
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                            rows={(field as any)?.ui?.paragraphRows || 4}
                          />
                        ) : field.type === 'DATE' ? (
                          <DateInput
                            value={fieldValue}
                            language={language}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                            onChange={next => handleLineFieldChange(q, row.id, field, next)}
                          />
                        ) : (
                          <input
                            type={field.type === 'DATE' ? 'date' : 'text'}
                            value={fieldValue}
                            onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                          />
                        )}
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
                  className={`line-item-row${rowLocked ? ' ck-row-disabled' : ''}`}
                  data-row-anchor={`${q.id}__${row.id}`}
                  data-anchor-field-id={anchorFieldId || undefined}
                  data-anchor-has-value={anchorHasValue ? 'true' : undefined}
                  data-row-disabled={rowLocked ? 'true' : undefined}
                  style={{
                    background:
                      rowLocked
                        ? '#f1f5f9'
                        : rowIdx % 2 === 0
                        ? '#ffffff'
                        : '#f8fafc',
                    padding: 12,
                    borderRadius: 10,
                    border: rowLocked ? '2px dashed rgba(100, 116, 139, 0.45)' : '1px solid #e5e7eb',
                    opacity: rowLocked ? 0.86 : 1,
                    outline: rowHasError ? '3px solid rgba(239, 68, 68, 0.55)' : undefined,
                    outlineOffset: 2,
                    marginBottom: 10
                  }}
                >
                  {isProgressive ? (
                    <div className="ck-row-header">
                      <div style={{ minWidth: 0 }}>
                        {/* Row numbering intentionally hidden in all UI modes (requested by product). */}
                        {showTitleControlInHeader && titleField ? (
                          <div style={{ maxWidth: 420 }}>
                            {(() => {
                              ensureLineOptions(q.id, titleField);
                              const errorKey = `${q.id}__${titleField.id}__${row.id}`;
                              const hideLabel = true;
                              const labelStyle = hideLabel ? srOnly : undefined;
                              // The title field (rendered in the row header) historically showed disabled controls.
                              // For consistency with edit rendering elsewhere, treat readOnly/renderAsLabel as "show plain text".
                              const titleAsLabel =
                                titleLocked || (titleField as any)?.ui?.renderAsLabel === true || (titleField as any)?.readOnly === true;
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
                                return Array.from(new Set(filtered));
                              })();
                              const subgroupOpenStack = triggeredSubgroupIds.length
                                ? renderSubgroupOpenStack(triggeredSubgroupIds, { sourceFieldId: titleField.id })
                                : null;

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
                            style={{ fontSize: 22, fontWeight: 700, color: rowHasError ? '#b42318' : undefined }}
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
                      {!guidedCollapsedFieldsInHeader ? (
                      <button
                        type="button"
                        className="ck-row-toggle"
                        aria-label={pillActionLabel}
                        aria-expanded={!rowCollapsed}
                        aria-disabled={rowCollapsed && !canExpand}
                        title={
                          rowCollapsed && !canExpand
                            ? gateResult.reason
                            : pillActionLabel
                        }
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
                          style={{ fontSize: 22, fontWeight: 700, color: rowHasError ? '#b42318' : undefined }}
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
                      const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;

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
                        return Array.from(new Set(filtered));
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
                        if (renderAsLabel) {
                          const selected = optsField.find(opt => opt.value === choiceVal);
                          const display = selected?.label || choiceVal || null;
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
                                {(() => {
                                  const selected = optsField.find(opt => opt.value === choiceVal);
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
                        if (renderAsLabel) {
                          if (isConsentCheckbox) {
                            const display = row.values[field.id]
                              ? tSystem('common.yes', language, 'Yes')
                              : tSystem('common.no', language, 'No');
                            return renderReadOnlyLine(display);
                          }
                          const labels = selected
                            .map(val => optsField.find(opt => opt.value === val)?.label || val)
                            .filter(Boolean);
                          const display = labels.length ? labels.join(', ') : null;
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
                          ? resolveValueMapValue(field.valueMap, fid => {
                              if (row.values.hasOwnProperty(fid)) return row.values[fid];
                              return values[fid];
                            }, { language, targetOptions: toOptionSet(field) })
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
                          return renderReadOnlyLine(display || null);
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
                                onChange={next => handleLineFieldChange(q, row.id, field, next)}
                              />
                            ) : field.type === 'PARAGRAPH' ? (
                              <textarea
                                className="ck-paragraph-input"
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                rows={(field as any)?.ui?.paragraphRows || 4}
                              />
                            ) : field.type === 'DATE' ? (
                              <DateInput
                                value={fieldValue}
                                language={language}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                ariaLabel={resolveFieldLabel(field, language, field.id)}
                                onChange={next => handleLineFieldChange(q, row.id, field, next)}
                              />
                            ) : (
                              <input
                                type={field.type === 'DATE' ? 'date' : 'text'}
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                              />
                            )}
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
                    {hideRemoveButton ? null : ((q.lineItemConfig as any)?.ui?.allowRemoveAutoRows === false && rowSource === 'auto') ? null : (
                      <button type="button" onClick={() => removeLineRow(q.id, row.id)} style={buttonStyles.negative}>
                        {tSystem('lineItems.remove', language, 'Remove')}
                      </button>
                    )}
                  </div>
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
                              setOverlay({
                                open: true,
                                options: optionsForOverlay,
                                groupId: subKey,
                                anchorFieldId: anchorField.id,
                                selected: []
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
                      <div key={subKey} className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
                        <div
                          className="subgroup-header"
                          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                        >
                          <div style={{ textAlign: 'center', fontWeight: 700 }}>
                            {subLabelResolved || subId}
                            {(() => {
                              const subShowItemPill = subUi?.showItemPill !== undefined ? !!subUi.showItemPill : true;
                              if (!subShowItemPill) return null;
                              return (
                                <span className="pill" style={{ marginLeft: 8, background: '#e2e8f0', color: '#334155' }}>
                                  {tSystem(
                                    subCount === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                                    language,
                                    subCount === 1 ? '{count} item' : '{count} items',
                                    { count: subCount }
                                  )}
                                </span>
                              );
                            })()}
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
                                      dependencyIds.map((dep: string) => toDependencyValue(subRow.values[dep] ?? row.values[dep] ?? values[dep]))
                                    );

                                    const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                                    const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;
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
                                        return <div className="ck-line-item-table__value">{selected?.label || choiceVal || '—'}</div>;
                                      }
                                      return (
                                        <div className="ck-line-item-table__control">
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
                                        return <div className="ck-line-item-table__value">{labels.length ? labels.join(', ') : '—'}</div>;
                                      }
                                      const controlOverride = ((field as any)?.ui?.control || '').toString().trim().toLowerCase();
                                      const renderAsMultiSelect = controlOverride === 'select';
                                      return (
                                        <div className="ck-line-item-table__control">
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
                                      if (renderAsLabel) {
                                        return <div className="ck-line-item-table__value">{count ? `${count}` : '—'}</div>;
                                      }
                                      return (
                                        <div className="ck-line-item-table__control">
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
                                      return <div className="ck-line-item-table__value">{display || '—'}</div>;
                                    }
                                    if (field.type === 'NUMBER') {
                                      return (
                                        <div className="ck-line-item-table__control">
                                          <NumberStepper
                                            value={numberText}
                                            disabled={submitting}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                          {renderErrors()}
                                        </div>
                                      );
                                    }
                                    if (field.type === 'PARAGRAPH') {
                                      return (
                                        <div className="ck-line-item-table__control">
                                          <textarea
                                            className="ck-paragraph-input"
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            rows={(field as any)?.ui?.paragraphRows || 3}
                                          />
                                          {renderErrors()}
                                        </div>
                                      );
                                    }
                                    if (field.type === 'DATE') {
                                      return (
                                        <div className="ck-line-item-table__control">
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
                                    return (
                                      <div className="ck-line-item-table__control">
                                        <input
                                          type="text"
                                          value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                          readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                        />
                                        {renderErrors()}
                                      </div>
                                    );
                                  };

                                  return [
                                    ...visibleFields.map(field => ({
                                      id: field.id,
                                      label: resolveFieldLabel(field, language, field.id),
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
                                            <XIcon size={18} />
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
                            getLineValue: (_rowId, fid) => subRow.values[fid]
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
                                background: subIdx % 2 === 0 ? '#ffffff' : '#f1f5f9',
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid #e5e7eb',
                                marginBottom: 10
                              }}
                            >
                              {!subRow.autoGenerated && (
                                <div style={{ marginBottom: 8 }}>
                                  <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
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
                                  const renderAsLabel = (field as any)?.ui?.renderAsLabel === true || (field as any)?.readOnly === true;

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
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                        ) : field.type === 'PARAGRAPH' ? (
                                          <textarea
                                            className="ck-paragraph-input"
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            rows={(field as any)?.ui?.paragraphRows || 4}
                                          />
                                        ) : field.type === 'DATE' ? (
                                          <DateInput
                                            value={fieldValue}
                                            language={language}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                        ) : (
                                          <input
                                            type={field.type === 'DATE' ? 'date' : 'text'}
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap || (field as any)?.readOnly === true}
                                          />
                                        )}
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
                                    onClick={() => removeLineRow(subKey, subRow.id)}
                                    style={buttonStyles.negative}
                                  >
                                    {tSystem('lineItems.remove', language, 'Remove')}
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
