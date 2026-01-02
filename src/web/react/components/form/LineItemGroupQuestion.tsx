import React from 'react';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
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
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { FormErrors, LineItemState, OptionState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import { resolveRowDisclaimerText, toDateInputValue, toUploadItems } from './utils';
import { buttonStyles, PlusIcon, RequiredStar, srOnly, UploadIcon, withDisabled } from './ui';
import { GroupedPairedFields } from './GroupedPairedFields';
import { InfoTooltip } from './InfoTooltip';
import { LineOverlayState } from './overlays/LineSelectOverlay';
import { NumberStepper } from './NumberStepper';
import { resolveValueMapValue } from './valueMaps';
import { buildSelectorOptionSet, resolveSelectorLabel } from './lineItemSelectors';
import {
  ROW_SOURCE_AUTO,
  ROW_SOURCE_KEY,
  buildSubgroupKey,
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
  options: Array<{ value: string; label: string; tooltip?: string }>;
  required: boolean;
  override?: string | null;
  onChange: (next: string) => void;
}

export interface LineItemGroupQuestionCtx {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
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

export const LineItemGroupQuestion: React.FC<{ q: WebQuestionDefinition; ctx: LineItemGroupQuestionCtx }> = ({ q, ctx }) => {
  const {
    definition,
    language,
    values,
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
    errorIndex,
    setOverlay,
    onDiagnostic
  } = ctx;

  const AUTO_CONTEXT_PREFIX = '__autoAddMode__';

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
      nl: (field as any).optionsNl || []
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
    const localized = buildLocalizedOptions(opts, allowed, language);
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

    // Append missing desired keys in desired order.
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
      nextRows.push({
        id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
        values: nextValues,
        autoGenerated: true,
        effectContextId: contextId
      });
    });

    const changed = nextRows.length !== currentRows.length || nextRows.some((row, idx) => row !== currentRows[idx]);
    return { rows: nextRows, changed, contextId, desiredCount: desired.length };
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

        const selectorCfg = q.lineItemConfig?.sectionSelector;
        const selectorOptionSet = buildSelectorOptionSet(selectorCfg);
        const selectorOptions = selectorOptionSet
          ? buildLocalizedOptions(selectorOptionSet, selectorOptionSet.en || [], language)
          : [];
        const selectorValue = selectorCfg ? ((values[selectorCfg.id] as string) || '') : '';

        const renderAddButton = () => {
          if (q.lineItemConfig?.addMode === 'overlay' && q.lineItemConfig.anchorFieldId) {
            return (
              <button
                type="button"
                disabled={submitting}
                style={withDisabled(buttonStyles.secondary, submitting)}
                onClick={async () => {
                  if (submitting) return;
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
                      nl: (anchorField as any).optionsNl || []
                    };
                  }
                  const dependencyIds = (
                    Array.isArray(anchorField.optionFilter?.dependsOn)
                      ? anchorField.optionFilter?.dependsOn
                      : [anchorField.optionFilter?.dependsOn || '']
                  ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                  const depVals = dependencyIds.map(dep => toDependencyValue(values[dep]));
                  const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                  const localized = buildLocalizedOptions(opts, allowed, language);
                  const deduped = Array.from(
                    new Set(localized.map(opt => opt.value).filter(Boolean))
                  );
                  setOverlay({
                    open: true,
                    options: localized
                      .filter(opt => deduped.includes(opt.value))
                      .map(opt => ({ value: opt.value, label: opt.label })),
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
              disabled={submitting}
              onClick={() => addLineItemRowManual(q.id)}
              style={withDisabled(buttonStyles.secondary, submitting)}
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

        const groupTotals = computeTotals({ config: q.lineItemConfig!, rows: lineItems[q.id] || [] }, language);
        const parentRows = lineItems[q.id] || [];
        const parentCount = parentRows.length;
        const selectorControl =
          selectorCfg && selectorOptions.length ? (
            <div
              className="section-selector"
              data-field-path={selectorCfg.id}
              style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <label style={{ fontWeight: 600 }}>
                {resolveSelectorLabel(selectorCfg, language)}
                {selectorCfg.required && <RequiredStar />}
              </label>
              <select
                value={selectorValue}
                onChange={e => {
                  const nextVal = e.target.value;
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
            </div>
          ) : null;
        const liUi = q.lineItemConfig?.ui;
        const showItemPill = liUi?.showItemPill !== undefined ? !!liUi.showItemPill : true;
        const addButtonPlacement = (liUi?.addButtonPlacement || 'both').toString().toLowerCase();
        const showAddTop =
          addButtonPlacement !== 'hidden' && (addButtonPlacement === 'both' || addButtonPlacement === 'top');
        const showAddBottom =
          addButtonPlacement !== 'hidden' && (addButtonPlacement === 'both' || addButtonPlacement === 'bottom');
        const hideGroupLabel = q.ui?.hideLabel === true;

        React.useEffect(() => {
          if (!onDiagnostic) return;
          if (liUi?.showItemPill === false) onDiagnostic('ui.lineItems.itemPill.disabled', { groupId: q.id });
          if (liUi?.addButtonPlacement && liUi.addButtonPlacement !== 'both') {
            onDiagnostic('ui.lineItems.addButtonPlacement', { groupId: q.id, value: liUi.addButtonPlacement });
          }
        }, [onDiagnostic, liUi?.addButtonPlacement, liUi?.showItemPill, q.id]);

        const shouldRenderTopToolbar = !!selectorControl || showAddTop;
        const shouldRenderBottomToolbar = (parentRows.length > 0 || showAddBottom) && (showAddBottom || !!selectorCfg || groupTotals.length > 0);
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
                  {selectorControl}
                  {showAddTop ? renderAddButton() : null}
                </div>
              </div>
            ) : null}
            {parentRows.map((row, rowIdx) => {
              const groupCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => row.values[fid]
              };
              const ui = q.lineItemConfig?.ui;
              const isProgressive =
                ui?.mode === 'progressive' && Array.isArray(ui.collapsedFields) && ui.collapsedFields.length > 0;
              const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsed = isProgressive ? (collapsedRows[collapseKey] ?? defaultCollapsed) : false;

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
              const rowSource = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
              const expandGateCandidate = ((ui?.expandGate || 'collapsedFieldsValid') as any) || 'collapsedFieldsValid';
              // For addMode:auto we show the anchor as the row title when expandGate is collapsedFieldsValid
              // (manual rows can still edit it). For selectionEffect-generated auto rows
              // (e.g., addLineItemsFromDataSource), we apply the same title+lock behavior regardless of expandGate,
              // as long as the group declares anchorFieldId and the row is marked auto.
              const wantsAnchorTitle =
                !!anchorField &&
                isProgressive &&
                ((addMode === 'auto' && expandGateCandidate === 'collapsedFieldsValid') || rowSource === 'auto');
              const lockAnchor = wantsAnchorTitle && rowSource === 'auto';
              const rowDisclaimerText = resolveRowDisclaimerText({
                ui,
                language,
                rowValues: (row.values || {}) as any,
                autoGenerated: !!row.autoGenerated
              });

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
              const isAnchorTitle = wantsAnchorTitle && !!titleField && titleField.id === anchorFieldId;
              const titleLocked = isAnchorTitle && lockAnchor;

              const fieldsToRender = showTitleControl
                ? fieldsToRenderBase.filter((f: any) => f?.id !== titleFieldId)
                : fieldsToRenderBase;

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
                  if (field.required && isEmptyValue(val as any)) {
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
                let totalRequired = 0;
                let requiredComplete = 0;
                let optionalComplete = 0;

                (allFields || []).forEach((field: any) => {
                  const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                  if (hideField) return;

                  const mapped = field.valueMap
                    ? resolveValueMapValue(field.valueMap, (fid: string) => {
                        if ((row.values || {}).hasOwnProperty(fid)) return (row.values || {})[fid];
                        return values[fid];
                      }, { language, targetOptions: toOptionSet(field) })
                    : undefined;
                  const raw = field.valueMap ? mapped : (row.values || {})[field.id];
                  const filled = !isEmptyValue(raw as any);

                  if (!!field.required) {
                    totalRequired += 1;
                    if (filled) requiredComplete += 1;
                  } else {
                    if (filled) optionalComplete += 1;
                  }
                });

                const includeOptional = totalRequired > 0 && requiredComplete >= totalRequired;
                const numerator = requiredComplete + (includeOptional ? optionalComplete : 0);
                return { numerator, requiredComplete, totalRequired };
              })();
              const requiredRowProgressClass =
                requiredRowProgress.totalRequired > 0
                  ? requiredRowProgress.requiredComplete >= requiredRowProgress.totalRequired
                    ? 'ck-progress-good'
                    : 'ck-progress-bad'
                  : 'ck-progress-neutral';

              const expandLabel = tSystem('lineItems.expand', language, 'Expand');
              const collapseLabel = tSystem('lineItems.collapse', language, 'Collapse');
              const lockedLabel = tSystem('lineItems.locked', language, 'Locked');
              const pillActionLabel = rowLocked ? lockedLabel : rowCollapsed ? expandLabel : collapseLabel;
              return (
                <div
                  key={row.id}
                  className={`line-item-row${rowLocked ? ' ck-row-disabled' : ''}`}
                  data-row-anchor={`${q.id}__${row.id}`}
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
                        {showTitleControl && titleField ? (
                          <div style={{ maxWidth: 420 }}>
                            {(() => {
                              ensureLineOptions(q.id, titleField);
                              const errorKey = `${q.id}__${titleField.id}__${row.id}`;
                              const hideLabel = true;
                              const labelStyle = hideLabel ? srOnly : undefined;
                              const triggeredSubgroupIds = (() => {
                                if (rowCollapsed) return [] as string[];
                                if (!subIds.length) return [] as string[];
                                const effects = Array.isArray((titleField as any).selectionEffects)
                                  ? ((titleField as any).selectionEffects as any[])
                                  : [];
                                const hits = effects
                                  .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                                  .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                                return Array.from(new Set(hits));
                              })();
                              const subgroupTriggerNodes =
                                triggeredSubgroupIds.length && !rowCollapsed
                                  ? triggeredSubgroupIds.map(subId => {
                                      const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                                      const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                                      return (
                                        <button
                                          key={subId}
                                          type="button"
                                          style={{
                                            ...buttonStyles.secondary,
                                            borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                                            background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                                          }}
                                          onClick={() => openSubgroupOverlay(fullSubKey)}
                                        >
                                          {subIdToLabel[subId] || subId}
                                        </button>
                                      );
                                    })
                                  : [];

                              if (titleField.type === 'CHOICE') {
                                const optionSetField: OptionSet =
                                  optionState[optionKey(titleField.id, q.id)] || {
                                    en: titleField.options || [],
                                    fr: (titleField as any).optionsFr || [],
                                    nl: (titleField as any).optionsNl || []
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
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language);
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
                                      {titleLocked ? (
                                        <div className="ck-row-title">{displayLabel || '—'}</div>
                                      ) : (
                                        <select
                                          value={choiceVal || ''}
                                          onChange={e => handleLineFieldChange(q, row.id, titleField, e.target.value)}
                                        >
                                          <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
                                          {optsField.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
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
                                        const actionNodes = tooltipNode ? [...subgroupTriggerNodes, tooltipNode] : subgroupTriggerNodes;
                                        if (!actionNodes.length) return null;
                                        return <div className="ck-field-actions">{actionNodes}</div>;
                                      })()}
                                    </div>
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
                                    nl: (titleField as any).optionsNl || []
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
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language);
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
                                    <div className="inline-options">
                                      {optsField.map(opt => (
                                        <label key={opt.value} className="inline">
                                          <input
                                            type="checkbox"
                                            checked={selected.includes(opt.value)}
                                            disabled={titleLocked}
                                            onChange={e => {
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
                                    {subgroupTriggerNodes.length ? (
                                      <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                                    ) : null}
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
                                  {subgroupTriggerNodes.length ? (
                                    <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                                  ) : null}
                                  {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                  {renderWarnings(errorKey)}
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                        {rowDisclaimerText ? <div className="ck-row-disclaimer">{rowDisclaimerText}</div> : null}
                        {rowCollapsed && !canExpand ? (
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
                      <button
                        type="button"
                        className="ck-row-toggle"
                        aria-label={`${rowCollapsed ? expandLabel : collapseLabel} ${tSystem('lineItems.row', language, 'Row')} ${rowIdx + 1} (${requiredRowProgress.numerator}/${requiredRowProgress.totalRequired})`}
                        aria-expanded={!rowCollapsed}
                        aria-disabled={rowCollapsed && !canExpand}
                        title={
                          rowCollapsed && !canExpand
                            ? gateResult.reason
                            : `${requiredRowProgress.numerator}/${requiredRowProgress.totalRequired}`
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
                        <span
                          className="muted"
                          style={{ fontSize: 22, fontWeight: 700, color: rowHasError ? '#b42318' : undefined }}
                        >
                          {tSystem('lineItems.row', language, 'Row')} {rowIdx + 1}
                          {rowHasError ? ` · ${tSystem('lineItems.needsAttention', language, 'Needs attention')}` : ''}
                          {rowLocked ? ` · ${tSystem('lineItems.locked', language, 'Locked')}` : ''}
                        </span>
                        <span
                          className={`ck-progress-pill ${requiredRowProgressClass}`}
                          data-has-error={rowHasError ? 'true' : undefined}
                          aria-disabled={rowCollapsed && !canExpand ? 'true' : undefined}
                        >
                          <span>
                            {requiredRowProgress.numerator}/{requiredRowProgress.totalRequired}
                          </span>
                          <span className="ck-progress-label">{pillActionLabel}</span>
                          <span className="ck-progress-caret">{rowCollapsed ? '▸' : '▾'}</span>
                        </span>
                      </button>
                    </div>
                  ) : null}
                  {!isProgressive && rowDisclaimerText ? (
                    <div className="ck-row-disclaimer" style={{ marginBottom: 10 }}>
                      {rowDisclaimerText}
                    </div>
                  ) : null}
                  {(() => {
                    const renderLineItemField = (field: any) => {
                    ensureLineOptions(q.id, field);
                    const optionSetField: OptionSet =
                      optionState[optionKey(field.id, q.id)] || {
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
                        dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                    );
                    const currentVal = row.values[field.id];
                    const allowedWithCurrent =
                      currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                        ? [...allowedField, currentVal]
                        : allowedField;
                    const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language);
                    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                    if (hideField) return null;

                      const fieldPath = `${q.id}__${field.id}__${row.id}`;
                      const hideLabel =
                        Boolean((field as any)?.ui?.hideLabel) ||
                        (isProgressive && rowCollapsed && collapsedLabelMap[field.id] === false);
                      const labelStyle = hideLabel ? srOnly : undefined;

                      const triggeredSubgroupIds = (() => {
                        if (rowCollapsed) return [] as string[];
                        if (!subIds.length) return [] as string[];
                        const effects = Array.isArray((field as any).selectionEffects)
                          ? ((field as any).selectionEffects as any[])
                          : [];
                        const hits = effects
                          .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                          .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                        return Array.from(new Set(hits));
                      })();
                      const subgroupTriggerNodes =
                        triggeredSubgroupIds.length && !rowCollapsed
                          ? triggeredSubgroupIds.map(subId => {
                              const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                              const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                              return (
                                <button
                                  key={subId}
                                  type="button"
                                  style={{
                                    ...buttonStyles.secondary,
                                    borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                                    background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                                  }}
                                  onClick={() => openSubgroupOverlay(fullSubKey)}
                                >
                                  {subIdToLabel[subId] || subId}
                                </button>
                              );
                            })
                          : [];

                    switch (field.type) {
                      case 'CHOICE': {
                        const rawVal = row.values[field.id];
                        const choiceVal =
                          Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
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
                              <div className="ck-control-row">
                                {renderChoiceControl({
                                  fieldPath,
                                  value: choiceVal || '',
                                  options: optsField,
                                  required: !!field.required,
                                  override: (field as any)?.ui?.control,
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
                                  const actionNodes = tooltipNode ? [...subgroupTriggerNodes, tooltipNode] : subgroupTriggerNodes;
                                  if (!actionNodes.length) return null;
                                  return <div className="ck-field-actions">{actionNodes}</div>;
                                })()}
                              </div>
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
                        const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language);
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
                                  onChange={e => handleLineFieldChange(q, row.id, field, e.target.checked)}
                                />
                                <span className="ck-consent-text" style={labelStyle}>
                                  {resolveFieldLabel(field, language, field.id)}
                                  {field.required && <RequiredStar />}
                                </span>
                              </label>
                              {subgroupTriggerNodes.length ? (
                                <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                              ) : null}
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                            </div>
                          );
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
                            <div className="inline-options">
                              {optsField.map(opt => (
                                <label key={opt.value} className="inline">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={e => {
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
                              {subgroupTriggerNodes.length ? (
                                <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                              ) : null}
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
                          const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                            ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
                          );
                          const acceptAttr = allowedDisplay.length ? allowedDisplay.join(',') : undefined;
                          const maxed = uploadConfig.maxFiles ? items.length >= uploadConfig.maxFiles : false;
                          const helperParts: string[] = [];
                          if (uploadConfig.maxFiles) {
                            helperParts.push(`${uploadConfig.maxFiles} file${uploadConfig.maxFiles > 1 ? 's' : ''} max`);
                          }
                          if (uploadConfig.maxFileSizeMb) {
                            helperParts.push(`<= ${uploadConfig.maxFileSizeMb} MB each`);
                          }
                          if (allowedDisplay.length) {
                            helperParts.push(`Allowed: ${allowedDisplay.join(', ')}`);
                          }
                          const remainingSlots =
                            uploadConfig.maxFiles && uploadConfig.maxFiles > items.length
                              ? `${uploadConfig.maxFiles - items.length} slot${uploadConfig.maxFiles - items.length > 1 ? 's' : ''} remaining`
                              : null;
                          const dragActive = !!dragState[fieldPath];
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
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-disabled={maxed || submitting}
                                  className="ck-upload-dropzone"
                                  onClick={() => {
                                    if (maxed || submitting) return;
                                    fileInputsRef.current[fieldPath]?.click();
                                  }}
                                  onKeyDown={e => {
                                    if (maxed || submitting) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      fileInputsRef.current[fieldPath]?.click();
                                    }
                                  }}
                                  onDragEnter={e => {
                                    e.preventDefault();
                                    if (submitting) return;
                                    incrementDrag(fieldPath);
                                  }}
                                  onDragOver={e => e.preventDefault()}
                                  onDragLeave={e => {
                                    e.preventDefault();
                                    if (submitting) return;
                                    decrementDrag(fieldPath);
                                  }}
                                  onDrop={e =>
                                    handleLineFileDrop({ group: q, rowId: row.id, field, fieldPath, event: e })
                                  }
                                  style={{
                                    border: dragActive ? '2px solid #0ea5e9' : '1px dashed #94a3b8',
                                    borderRadius: 12,
                                    padding: '10px 12px',
                                    background: dragActive ? '#e0f2fe' : maxed || submitting ? '#f1f5f9' : '#f8fafc',
                                    color: '#0f172a',
                                    cursor: maxed || submitting ? 'not-allowed' : 'pointer',
                                    transition: 'border-color 120ms ease, background 120ms ease',
                                    boxShadow: dragActive ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
                                    flex: 1,
                                    minWidth: 0,
                                    minHeight: 'var(--control-height)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10
                                  }}
                                >
                                  <UploadIcon />
                                  {items.length ? <span className="pill">{items.length}</span> : null}
                                  <span style={srOnly}>
                                    {dragActive
                                      ? 'Release to upload files'
                                      : maxed
                                        ? 'Maximum files selected'
                                        : 'Click to browse'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="ck-upload-files-btn"
                                  onClick={() =>
                                    openFileOverlay({
                                      scope: 'line',
                                      title: resolveFieldLabel(field, language, field.id),
                                      group: q,
                                      rowId: row.id,
                                      field,
                                      fieldPath
                                    })
                                  }
                                  disabled={submitting}
                                  style={withDisabled(buttonStyles.secondary, submitting)}
                                  title={helperParts.length ? helperParts.join(' | ') : undefined}
                                >
                                  {tSystem('files.title', language, 'Files')}
                                  {items.length ? ` (${items.length})` : ''}
                                </button>
                                {subgroupTriggerNodes.length ? (
                                  <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                                ) : null}
                              </div>
                              {remainingSlots ? <div className="muted">{remainingSlots}</div> : null}
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
                                readOnly={!!field.valueMap}
                                ariaLabel={resolveFieldLabel(field, language, field.id)}
                                onChange={next => handleLineFieldChange(q, row.id, field, next)}
                              />
                            ) : field.type === 'PARAGRAPH' ? (
                              <textarea
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                readOnly={!!field.valueMap}
                                rows={(field as any)?.ui?.paragraphRows || 4}
                              />
                            ) : (
                              <input
                                type={field.type === 'DATE' ? 'date' : 'text'}
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                                readOnly={!!field.valueMap}
                              />
                            )}
                              {subgroupTriggerNodes.length ? (
                                <div className="ck-field-actions">{subgroupTriggerNodes}</div>
                              ) : null}
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
                          className={`collapsed-fields-grid${fieldsToRender.length > 1 ? ' ck-collapsed-stack' : ''}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              fieldsToRender.length === 2
                                ? 'repeat(2, minmax(0, 1fr))'
                                : 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 12
                          }}
                        >
                          {fieldsToRender.map(field => renderLineItemField(field))}
                        </div>
                      );
                    }

                    const visibleExpandedFields = fieldsToRender.filter(field => {
                      const hide = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                      return !hide;
                    });

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
                          return !isEmptyValue(raw as any);
                        }}
                      />
                    );
                  })()}
                  {!rowCollapsed && fallbackSubIds.length ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fallbackSubIds.map(subId => {
                        const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                        const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                        return (
                          <button
                            key={subId}
                            type="button"
                            style={{
                              ...buttonStyles.secondary,
                              borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                              background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                            }}
                            onClick={() => openSubgroupOverlay(fullSubKey)}
                          >
                            {subIdToLabel[subId] || subId}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div
                    className="line-actions"
                    style={
                      isProgressive
                        ? { justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
                        : undefined
                    }
                  >
                    <button type="button" onClick={() => removeLineRow(q.id, row.id)} style={buttonStyles.negative}>
                      {tSystem('lineItems.remove', language, 'Remove')}
                    </button>
                  </div>
                  {!isProgressive && (q.lineItemConfig?.subGroups || []).map(sub => {
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
                    const orderedSubRows = [...subRows].sort((a, b) => {
                      // keep auto-generated rows first, manual rows (no flag) at the bottom
                      const aAuto = !!a.autoGenerated;
                      const bAuto = !!b.autoGenerated;
                      if (aAuto === bAuto) return 0;
                      return aAuto ? -1 : 1;
                    });
                    const subTotals = computeTotals({ config: { ...sub, fields: sub.fields || [] }, rows: orderedSubRows }, language);
                    const subSelectorCfg = sub.sectionSelector;
                    const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
                    const subSelectorOptions = subSelectorOptionSet
                      ? buildLocalizedOptions(subSelectorOptionSet, subSelectorOptionSet.en || [], language)
                      : [];
                    const subSelectorValue = subgroupSelectors[subKey] || '';

                    const renderSubAddButton = () => {
                      if (sub.addMode === 'overlay' && sub.anchorFieldId) {
                        return (
                          <button
                            type="button"
                            style={buttonStyles.secondary}
                            onClick={async () => {
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
                                  nl: (anchorField as any).optionsNl || []
                                };
                              }
                              const dependencyIds = (
                                Array.isArray(anchorField.optionFilter?.dependsOn)
                                  ? anchorField.optionFilter?.dependsOn
                                  : [anchorField.optionFilter?.dependsOn || '']
                              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                              const depVals = dependencyIds.map(dep =>
                                toDependencyValue(row.values[dep] ?? values[dep] ?? subSelectorValue)
                              );
                              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                              const localized = buildLocalizedOptions(opts, allowed, language);
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
                            {resolveLocalizedString(
                              sub.addButtonLabel,
                              language,
                              tSystem('lineItems.addLines', language, 'Add lines')
                            )}
                          </button>
                        );
                      }
                      return (
                        <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.secondary}>
                          <PlusIcon />
                          {resolveLocalizedString(sub.addButtonLabel, language, 'Add line')}
                        </button>
                      );
                    };
                    const subCount = orderedSubRows.length;
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
                              const subUi = (sub as any).ui as any;
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
                              {subSelectorCfg && (
                                <div
                                  className="section-selector"
                                  data-field-path={subSelectorCfg.id}
                                  style={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}
                                >
                                  <label style={{ fontWeight: 600 }}>
                                    {resolveSelectorLabel(subSelectorCfg, language)}
                                    {subSelectorCfg.required && <RequiredStar />}
                                  </label>
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
                                </div>
                              )}
                              {(() => {
                                const subUi = (sub as any).ui as any;
                                const placement = (subUi?.addButtonPlacement || 'both').toString().toLowerCase();
                                const showTop = placement !== 'hidden' && (placement === 'both' || placement === 'top');
                                return showTop ? renderSubAddButton() : null;
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
                        {orderedSubRows.map((subRow, subIdx) => {
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
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelection, language);
                                const hideField = shouldHideField(field.visibility, subCtx, {
                                  rowId: subRow.id,
                                  linePrefix: subKey
                                });
                                if (hideField) return null;
                                  const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                                  const hideLabel = Boolean((field as any)?.ui?.hideLabel);
                                  const labelStyle = hideLabel ? srOnly : undefined;

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
                                            override: (field as any)?.ui?.control,
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
                                                  onChange={e =>
                                                    handleLineFieldChange(targetGroup, subRow.id, field, e.target.checked)
                                                  }
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
                                                onChange={e => {
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
                                      const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                                        ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
                                      );
                                      const acceptAttr = allowedDisplay.length ? allowedDisplay.join(',') : undefined;
                                      const maxed = uploadConfig.maxFiles ? items.length >= uploadConfig.maxFiles : false;
                                      const dragActive = !!dragState[fieldPath];
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
                                            <div
                                              role="button"
                                              tabIndex={0}
                                              aria-disabled={maxed || submitting}
                                              className="ck-upload-dropzone"
                                              onClick={() => {
                                                if (maxed || submitting) return;
                                                fileInputsRef.current[fieldPath]?.click();
                                              }}
                                              onKeyDown={e => {
                                                if (maxed || submitting) return;
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault();
                                                  fileInputsRef.current[fieldPath]?.click();
                                                }
                                              }}
                                              onDragEnter={e => {
                                                e.preventDefault();
                                                if (submitting) return;
                                                incrementDrag(fieldPath);
                                              }}
                                              onDragOver={e => e.preventDefault()}
                                              onDragLeave={e => {
                                                e.preventDefault();
                                                if (submitting) return;
                                                decrementDrag(fieldPath);
                                              }}
                                              onDrop={e =>
                                                handleLineFileDrop({
                                                  group: targetGroup,
                                                  rowId: subRow.id,
                                                  field,
                                                  fieldPath,
                                                  event: e
                                                })
                                              }
                                              style={{
                                                border: dragActive ? '2px solid #0ea5e9' : '1px dashed #94a3b8',
                                                borderRadius: 12,
                                                padding: '10px 12px',
                                                background: dragActive
                                                  ? '#e0f2fe'
                                                  : maxed || submitting
                                                    ? '#f1f5f9'
                                                    : '#f8fafc',
                                                color: '#0f172a',
                                                cursor: maxed || submitting ? 'not-allowed' : 'pointer',
                                                transition: 'border-color 120ms ease, background 120ms ease',
                                                boxShadow: dragActive ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
                                                flex: 1,
                                                minWidth: 0,
                                                minHeight: 'var(--control-height)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 10
                                              }}
                                            >
                                              <UploadIcon />
                                              {items.length ? <span className="pill">{items.length}</span> : null}
                                              <span style={srOnly}>
                                                {dragActive
                                                  ? 'Release to upload files'
                                                  : maxed
                                                    ? 'Maximum files selected'
                                                    : 'Click to browse'}
                                              </span>
                                            </div>
                                            <button
                                              type="button"
                                              className="ck-upload-files-btn"
                                              onClick={() =>
                                                openFileOverlay({
                                                  scope: 'line',
                                                  title: resolveFieldLabel(field, language, field.id),
                                                  group: targetGroup,
                                                  rowId: subRow.id,
                                                  field,
                                                  fieldPath
                                                })
                                              }
                                              disabled={submitting}
                                              style={withDisabled(buttonStyles.secondary, submitting)}
                                            >
                                              {tSystem('files.title', language, 'Files')}
                                              {items.length ? ` (${items.length})` : ''}
                                            </button>
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
                                            readOnly={!!field.valueMap}
                                            ariaLabel={resolveFieldLabel(field, language, field.id)}
                                            onChange={next => handleLineFieldChange(targetGroup, subRow.id, field, next)}
                                          />
                                        ) : field.type === 'PARAGRAPH' ? (
                                          <textarea
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap}
                                            rows={(field as any)?.ui?.paragraphRows || 4}
                                          />
                                        ) : (
                                          <input
                                            type={field.type === 'DATE' ? 'date' : 'text'}
                                            value={fieldValue}
                                            onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                            readOnly={!!field.valueMap}
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
                                      return !isEmptyValue(raw as any);
                                    }}
                                  />
                                );
                              })()}
                              <div className="line-actions">
                                <button
                                  type="button"
                                  onClick={() => removeLineRow(subKey, subRow.id)}
                                  style={buttonStyles.negative}
                                >
                                  {tSystem('lineItems.remove', language, 'Remove')}
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                {subSelectorCfg && (
                                  <div className="section-selector" data-field-path={subSelectorCfg.id}>
                                    <label>
                                      {resolveSelectorLabel(subSelectorCfg, language)}
                                      {subSelectorCfg.required && <RequiredStar />}
                                    </label>
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
                                  </div>
                                )}
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
                {selectorCfg && (
                  <div
                    className="section-selector"
                    data-field-path={selectorCfg.id}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}
                  >
                    <label style={{ fontWeight: 600 }}>
                      {resolveSelectorLabel(selectorCfg, language)}
                      {selectorCfg.required && <RequiredStar />}
                    </label>
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
                  </div>
                )}
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
