import React from 'react';

import { optionKey, toDependencyValue } from '../../../../core';
import type { FieldValue, LangCode, OptionSet, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import { buildSubgroupKey, resolveSubgroupKey } from '../../../app/lineItems';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import type { LineItemState, OptionState } from '../../../types';
import {
  applyAutoAddSubgroupSingleOptionAnchorFillAction,
  collectAutoAddSubgroupAnchorTargetsAction,
  reconcileAutoAddRowsAction,
  resolveAutoAddDependsOnIds,
  resolveAutoAddDesiredRowsAction
} from '../domain/autoAddModeRows';

type UseLineItemAutoAddEffectsArgs = {
  q: WebQuestionDefinition;
  definition: WebFormDefinition;
  language: LangCode;
  submitting: boolean;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  subgroupSelectors: Record<string, string>;
  latestValuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  buildOptionSetForLineField: (field: any, groupKey: string) => OptionSet;
  ensureLineOptions: (groupId: string, field: any) => void;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: line-items feature workflow.
 * Coordinates automatic line-item row creation and subgroup anchor autofill
 * outside the large renderer shell.
 */
export const useLineItemAutoAddEffects = ({
  q,
  definition,
  language,
  submitting,
  values,
  lineItems,
  optionState,
  subgroupSelectors,
  latestValuesRef,
  buildOptionSetForLineField,
  ensureLineOptions,
  setLineItems,
  setValues,
  onDiagnostic
}: UseLineItemAutoAddEffectsArgs): void => {
  // Auto-add should only reconcile when the controlling dependency values change (or when anchor options arrive),
  // not when the user removes a row or edits unrelated fields.
  const autoCfg = q.lineItemConfig;
  const autoAnchorField =
    autoCfg?.addMode === 'auto' && autoCfg.anchorFieldId
      ? (autoCfg.fields || []).find((field: any) => field && field.id === autoCfg.anchorFieldId)
      : undefined;
  const autoAnchorIsChoice = !!autoAnchorField && (autoAnchorField as any).type === 'CHOICE';
  const autoDependencyIds = autoAnchorIsChoice ? resolveAutoAddDependsOnIds(autoAnchorField) : [];
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

  // Auto addMode: when dependency fields are valid, or when there is no dependency filter,
  // auto-create one row per allowed anchor option.
  React.useEffect(() => {
    if (submitting) return;
    const cfg = q.lineItemConfig;
    if (!cfg || cfg.addMode !== 'auto' || !cfg.anchorFieldId) return;
    const anchorField = (cfg.fields || []).find(field => field.id === cfg.anchorFieldId);
    if (!anchorField || anchorField.type !== 'CHOICE') return;
    const dependencyIds = resolveAutoAddDependsOnIds(anchorField);

    // Ensure anchor options are loaded so allowed values can be computed.
    ensureLineOptions(q.id, anchorField);

    const { valid, desired, depVals } = resolveAutoAddDesiredRowsAction({
      groupKey: q.id,
      anchorField,
      dependencyIds,
      getDependencyRaw: depId => values[depId],
      buildOptionSetForLineField,
      language
    });

    const selectorId = cfg.sectionSelector?.id;
    const selectorValue = selectorId ? (values as any)[selectorId] : undefined;
    if (!valid) return;

    const spec = {
      targetKey: q.id,
      anchorFieldId: anchorField.id,
      desired,
      depVals,
      selectorId,
      selectorValue
    };

    setLineItems(prev => {
      const currentRows = prev[q.id] || [];
      const res = reconcileAutoAddRowsAction({ currentRows, ...spec });
      if (!res.changed) return prev;
      const nextState = { ...prev, [q.id]: res.rows };
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, nextState, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
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
    buildOptionSetForLineField,
    definition,
    language,
    submitting,
    q.id,
    q.lineItemConfig,
    q.lineItemConfig?.addMode,
    q.lineItemConfig?.anchorFieldId,
    // Only re-run when controlling dependency values change (or when the anchor options set changes)
    autoDepSignature,
    autoAnchorOptionSet,
    ensureLineOptions,
    latestValuesRef,
    onDiagnostic,
    setLineItems,
    setValues,
    values
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
      const anchorField = ((sub as any).fields || []).find((field: any) => field.id === (sub as any).anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const dependencyIds = resolveAutoAddDependsOnIds(anchorField);

      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);

        const selectorId = (sub as any).sectionSelector?.id;
        const selectorValue = selectorId ? (subgroupSelectors as any)[subKey] : undefined;

        const { valid, desired, depVals } = resolveAutoAddDesiredRowsAction({
          groupKey: subKey,
          anchorField,
          dependencyIds,
          getDependencyRaw: depId => {
            if (selectorId && depId === selectorId) return selectorValue;
            const fromRow = row.values ? (row.values as any)[depId] : undefined;
            if (fromRow !== undefined && fromRow !== null && fromRow !== '') return fromRow;
            return (values as any)[depId];
          },
          buildOptionSetForLineField,
          language
        });
        if (!valid) return;

        specs.push({
          targetKey: subKey,
          anchorFieldId: anchorField.id,
          desired,
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
        const res = reconcileAutoAddRowsAction({ currentRows, ...spec });
        if (!res.changed) return;
        if (next === prev) next = { ...prev };
        (next as any)[spec.targetKey] = res.rows;
        changedCount += 1;
      });
      if (next === prev) return prev;
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, next as any, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
      setValues(nextValues);
      onDiagnostic?.('ui.lineItems.autoAdd.applyBatch', {
        parentGroupId: q.id,
        specCount: specs.length,
        changedCount
      });
      return recomputed;
    });
  }, [
    buildOptionSetForLineField,
    definition,
    onDiagnostic,
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    latestValuesRef,
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

    const subgroupTargets = collectAutoAddSubgroupAnchorTargetsAction(parentCfg);
    if (!subgroupTargets.length) return;

    // Prime option loads for subgroup anchor fields.
    subgroupTargets.forEach(({ sub, subId, anchorFieldId }) => {
      const anchorField = (sub.fields || []).find((field: any) => field?.id === anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);
      });
    });

    setLineItems(prev => {
      const fillResult = applyAutoAddSubgroupSingleOptionAnchorFillAction({
        previousLineItems: prev,
        parentGroupId: q.id,
        subgroupTargets,
        values: values as Record<string, FieldValue>,
        subgroupSelectors,
        buildOptionSetForLineField,
        language
      });
      if (!fillResult.changed) return prev;
      fillResult.diagnostics.forEach(entry => {
        onDiagnostic?.('ui.subgroup.anchor.autofillSingleOption', entry);
      });
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, fillResult.lineItems, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
      setValues(nextValues);
      return recomputed;
    });
  }, [
    buildOptionSetForLineField,
    definition,
    onDiagnostic,
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    latestValuesRef,
    setLineItems,
    setValues
  ]);
};
