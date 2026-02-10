import { buildLocalizedOptions, computeAllowedOptions, optionKey, toDependencyValue } from '../../core';
import { FieldValue, LangCode, OptionSet, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LineItemState, OptionState } from '../types';
import { applyValueMapsToForm } from './valueMaps';
import {
  buildSubgroupKey,
  parseRowSource,
  resolveSubgroupKey,
  ROW_SOURCE_AUTO,
  ROW_SOURCE_KEY,
  ROW_SELECTION_EFFECT_ID_KEY
} from './lineItems';

const AUTO_CONTEXT_PREFIX = '__autoAddMode__';

const optionSortFor = (field: { optionSort?: any } | undefined): 'alphabetical' | 'source' => {
  const raw = (field as any)?.optionSort;
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return s === 'source' ? 'source' : 'alphabetical';
};

const normalizeAnchorKey = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first === undefined || first === null ? '' : first.toString().trim();
  }
  return raw.toString().trim();
};

const buildOptionSetForLineField = (field: any, groupKey: string, optionState: OptionState): OptionSet => {
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
  optionState: OptionState;
  language: LangCode;
}): { valid: boolean; desired: string[]; depVals: (string | number | null | undefined)[] } => {
  const { groupKey, anchorField, dependencyIds, getDependencyRaw, optionState, language } = args;
  const depRawVals = dependencyIds.map(depId => getDependencyRaw(depId));
  const depVals = depRawVals.map(v => toDependencyValue(v as any));
  const valid = dependencyIds.length > 0 && depRawVals.every(isValidDependencyValue);
  if (!valid) return { valid: false, desired: [], depVals };
  const opts = buildOptionSetForLineField(anchorField, groupKey, optionState);
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
  currentRows.forEach(row => {
    const rowSource = parseRowSource((row.values as any)?.[ROW_SOURCE_KEY]);
    const rowEffectContextId =
      row.effectContextId !== undefined && row.effectContextId !== null ? row.effectContextId.toString() : '';
    const selectionEffectId =
      (row.values as any)?.[ROW_SELECTION_EFFECT_ID_KEY] !== undefined &&
      (row.values as any)?.[ROW_SELECTION_EFFECT_ID_KEY] !== null
        ? (row.values as any)[ROW_SELECTION_EFFECT_ID_KEY].toString().trim()
        : '';
    const isOverlayAutoContext = rowEffectContextId.startsWith(autoPrefix);
    const isLegacyOverlayAuto = !rowEffectContextId && rowSource === 'auto' && !selectionEffectId;
    const isAutoContext = isOverlayAutoContext || isLegacyOverlayAuto;
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
    if (selectorId && selectorValue !== undefined && selectorValue !== null && (nextValues as any)[selectorId] === undefined) {
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

export type OverlayAutoAddGroupsResult = {
  changed: boolean;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  specCount: number;
  changedCount: number;
};

export const reconcileOverlayAutoAddModeGroups = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
  ensureLineOptions: (groupId: string, field: any) => void;
  skipGroupId?: string;
}): OverlayAutoAddGroupsResult => {
  const { definition, values, lineItems, optionState, language, ensureLineOptions, skipGroupId } = args;

  let next: any = lineItems;
  let changedCount = 0;
  let specCount = 0;

  (definition.questions || []).forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const cfg = q.lineItemConfig;
    if (!cfg) return;
    if (!((cfg as any)?.ui?.openInOverlay)) return;
    if ((cfg as any)?.addMode !== 'auto') return;
    if (!cfg.anchorFieldId) return;
    if (skipGroupId && q.id === skipGroupId) return;

    const anchorFieldId = cfg.anchorFieldId !== undefined && cfg.anchorFieldId !== null ? cfg.anchorFieldId.toString() : '';
    const anchorField = anchorFieldId ? (cfg.fields || []).find((f: any) => f && f.id === anchorFieldId) : undefined;
    if (!anchorField || anchorField.type !== 'CHOICE') return;

    const dependencyIds = resolveDependsOnIds(anchorField);
    if (!dependencyIds.length) return;

    ensureLineOptions(q.id, anchorField);

    const { valid, desired, depVals } = computeAutoDesired({
      groupKey: q.id,
      anchorField,
      dependencyIds,
      getDependencyRaw: depId => (values as any)[depId],
      optionState,
      language
    });

    const selectorId = cfg.sectionSelector?.id;
    const selectorValue = selectorId ? ((values as any)[selectorId] as FieldValue) : undefined;
    specCount += 1;

    const currentRows = ((next as any)[q.id] || lineItems[q.id] || []) as any[];
    const res = reconcileAutoRows({
      currentRows,
      targetKey: q.id,
      anchorFieldId: anchorField.id,
      desired: valid ? desired : [],
      depVals,
      selectorId,
      selectorValue
    });
    if (!res.changed) return;
    if (next === lineItems) next = { ...lineItems };
    (next as any)[q.id] = res.rows;
    changedCount += 1;
  });

  if (next === lineItems) return { changed: false, values, lineItems, specCount, changedCount: 0 };
  const recomputed = applyValueMapsToForm(definition, values, next, { mode: 'change' });
  return { changed: true, values: recomputed.values, lineItems: recomputed.lineItems, specCount, changedCount };
};

export type OverlayAutoAddSubgroupsResult = {
  changed: boolean;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  specCount: number;
  changedCount: number;
};

export const reconcileOverlayAutoAddModeSubgroups = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
  subgroupSelectors: Record<string, string>;
  ensureLineOptions: (groupId: string, field: any) => void;
  skipParentGroupId?: string;
}): OverlayAutoAddSubgroupsResult => {
  const { definition, values, lineItems, optionState, language, subgroupSelectors, ensureLineOptions, skipParentGroupId } = args;

  let next: any = lineItems;
  let changedCount = 0;
  let specCount = 0;

  const parentGroups = (definition.questions || []).filter(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return false;
    const cfg = q.lineItemConfig;
    if (!cfg?.subGroups?.length) return false;
    if (!((cfg as any)?.ui?.openInOverlay)) return false;
    return cfg.subGroups.some(sub => (sub as any)?.addMode === 'auto' && (sub as any)?.anchorFieldId);
  }) as WebQuestionDefinition[];

  parentGroups.forEach(parent => {
    if (skipParentGroupId && parent.id === skipParentGroupId) return;

    const parentCfg = parent.lineItemConfig!;
    const parentRows = ((next as any)[parent.id] || lineItems[parent.id] || []) as any[];
    if (!parentRows.length) return;

    const autoSubs = (parentCfg.subGroups || []).filter(
      sub => (sub as any).addMode === 'auto' && (sub as any).anchorFieldId
    );
    if (!autoSubs.length) return;

    autoSubs.forEach(sub => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      const anchorField = ((sub as any).fields || []).find((f: any) => f && f.id === (sub as any).anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const dependencyIds = resolveDependsOnIds(anchorField);
      if (!dependencyIds.length) return;

      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(parent.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);

        const selectorId = (sub as any).sectionSelector?.id;
        const selectorValue = selectorId ? ((subgroupSelectors as any)[subKey] as FieldValue) : undefined;

        const { valid, desired, depVals } = computeAutoDesired({
          groupKey: subKey,
          anchorField,
          dependencyIds,
          getDependencyRaw: depId => {
            if (selectorId && depId === selectorId) return selectorValue;
            const fromRow = row.values ? (row.values as any)[depId] : undefined;
            if (fromRow !== undefined && fromRow !== null && fromRow !== '') return fromRow;
            return (values as any)[depId];
          },
          optionState,
          language
        });

        specCount += 1;
        const currentRows = ((next as any)[subKey] || lineItems[subKey] || []) as any[];
        const res = reconcileAutoRows({
          currentRows,
          targetKey: subKey,
          anchorFieldId: anchorField.id,
          desired: valid ? desired : [],
          depVals,
          selectorId,
          selectorValue
        });
        if (!res.changed) return;
        if (next === lineItems) next = { ...lineItems };
        (next as any)[subKey] = res.rows;
        changedCount += 1;
      });
    });
  });

  if (next === lineItems) return { changed: false, values, lineItems, specCount, changedCount: 0 };
  const recomputed = applyValueMapsToForm(definition, values, next, { mode: 'change' });
  return { changed: true, values: recomputed.values, lineItems: recomputed.lineItems, specCount, changedCount };
};
