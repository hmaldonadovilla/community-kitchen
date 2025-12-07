import { SelectionEffect, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';
import { fetchDataSource } from '../data/dataSources';

interface EffectContext {
  addLineItemRow: (
    groupId: string,
    preset?: Record<string, string | number>,
    meta?: { effectContextId?: string; auto?: boolean }
  ) => void;
  clearLineItems?: (groupId: string, contextId?: string) => void;
  updateAutoLineItems?: (
    groupId: string,
    presets: Array<Record<string, string | number>>,
    meta: { effectContextId: string; numericTargets: string[] }
  ) => void;
}

export interface SelectionEffectOptions {
  contextId?: string;
  lineItem?: {
    groupId: string;
    rowId?: string;
    rowValues?: Record<string, any>;
  };
  forceContextReset?: boolean;
}

function applies(effect: SelectionEffect, value: string | string[] | null | undefined): boolean {
  if (!effect.triggerValues || effect.triggerValues.length === 0) return true;
  const vals = Array.isArray(value) ? value : value ? [value] : [];
  return vals.some(v => effect.triggerValues!.includes(v));
}

function isDebug(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).__WEB_FORM_DEBUG__);
  } catch (_) {
    return false;
  }
}

export function handleSelectionEffects(
  definition: WebFormDefinition,
  question: WebQuestionDefinition | undefined,
  value: string | string[] | null | undefined,
  language: LangCode,
  ctx: EffectContext,
  options?: SelectionEffectOptions
): void {
  if (!question?.selectionEffects || !question.selectionEffects.length) return;
  const debug = isDebug();
  const contextId = options?.contextId || '__global__';
  const normalizedSelections = normalizeSelectionValues(value);
  const diffPreview = previewSelectionDiff(question, contextId, normalizedSelections, options?.forceContextReset);
  if (debug && typeof console !== 'undefined') {
    console.info('[SelectionEffects] evaluating', {
      questionId: question.id,
      value,
      effectCount: question.selectionEffects.length,
      contextId,
      rowId: options?.lineItem?.rowId,
      currentSelections: diffPreview.currentSelections,
      newlySelected: diffPreview.newlySelected,
      removedSelections: diffPreview.removedSelections
    });
  }
  question.selectionEffects.forEach(effect => {
    const match = applies(effect, value);
    if (debug && typeof console !== 'undefined') {
      console.info('[SelectionEffects] effect check', {
        questionId: question.id,
        effectType: effect.type,
        groupId: effect.groupId,
        match,
        triggerValues: effect.triggerValues
      });
    }
    if (!match) return;
    if (effect.type === 'addLineItems') {
      ctx.addLineItemRow(effect.groupId, effect.preset);
      if (debug && typeof console !== 'undefined') {
        console.info('[SelectionEffects] addLineItems dispatched', {
          groupId: effect.groupId,
          preset: effect.preset
        });
      }
      return;
    }
    if (effect.type === 'addLineItemsFromDataSource') {
      populateLineItemsFromDataSource({
        effect,
        definition,
        question,
        language,
        ctx,
        debug,
        contextId,
        normalizedSelections,
        diff: diffPreview,
        lineItem: options?.lineItem
      });
    }
  });
}

interface DataDrivenEffectParams {
  effect: SelectionEffect;
  definition: WebFormDefinition;
  question: WebQuestionDefinition;
  language: LangCode;
  ctx: EffectContext;
  debug: boolean;
  contextId: string;
  normalizedSelections: string[];
  diff: SelectionDiffPreview;
  lineItem?: SelectionEffectOptions['lineItem'];
}

interface SelectionCacheEntry {
  value: string;
  entries: any[];
}

interface SelectionEffectCache {
  contexts: Map<string, Map<string, SelectionCacheEntry>>;
  token: number;
}

const resolveSubgroupKey = (sub?: { id?: string; label?: any }): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  if (typeof sub.label === 'string') return sub.label;
  return sub.label?.en || sub.label?.fr || sub.label?.nl || '';
};

interface SelectionDiffPreview {
  newlySelected: string[];
  removedSelections: string[];
  currentSelections: string[];
}

const selectionEffectState = new Map<string, SelectionEffectCache>();
const ROW_CONTEXT_PREFIX = '$row.';
const ROW_CONTEXT_KEY = '__ckRowContext';

function getStateKey(question: WebQuestionDefinition): string {
  return question.id;
}

function getOrCreateCache(question: WebQuestionDefinition): SelectionEffectCache {
  const key = getStateKey(question);
  if (!selectionEffectState.has(key)) {
    selectionEffectState.set(key, { contexts: new Map(), token: 0 });
  }
  return selectionEffectState.get(key)!;
}

function getContextMap(
  cache: SelectionEffectCache,
  contextId: string,
  create = false
): Map<string, SelectionCacheEntry> | undefined {
  const key = contextId || '__global__';
  if (!cache.contexts.has(key)) {
    if (!create) return undefined;
    cache.contexts.set(key, new Map());
  }
  return cache.contexts.get(key);
}

function normalizeString(val: any): string {
  if (val === undefined || val === null) return '';
  return val.toString().trim();
}

function normalizeSelectionValues(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : [value];
  const normalized = entries
    .map(normalizeString)
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function previewSelectionDiff(
  question: WebQuestionDefinition,
  contextId: string,
  normalizedSelections: string[],
  forceContextReset?: boolean
): SelectionDiffPreview {
  const cache = getOrCreateCache(question);
  const contextMap = getContextMap(cache, contextId, true)!;
  const previousSelections = Array.from(contextMap.keys());
  if (forceContextReset) {
    contextMap.clear();
  }
  const removedSelections = forceContextReset
    ? previousSelections
    : previousSelections.filter(sel => !normalizedSelections.includes(sel));
  const newlySelected = normalizedSelections.filter(sel => !contextMap.has(sel));
  return {
    newlySelected,
    removedSelections,
    currentSelections: normalizedSelections
  };
}

function resolveLookupField(effect: SelectionEffect, question: WebQuestionDefinition, sampleRow: any): string | undefined {
  if (effect.lookupField) return effect.lookupField;
  const mapping = question.dataSource?.mapping;
  if (mapping?.value) return mapping.value;
  if (mapping?.id) return mapping.id;
  if (sampleRow && typeof sampleRow === 'object') {
    const keys = Object.keys(sampleRow);
    if (keys.length) return keys[0];
  }
  return undefined;
}

function coerceItemsCollection(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch (_) {
      const parts = trimmed.split(/\r?\n/).map(part => part.trim()).filter(Boolean);
      if (parts.length) {
        return parts.map(value => ({ value }));
      }
    }
    return [];
  }
  if (typeof payload === 'object') return [payload];
  return [];
}

function getValueFromPath(source: any, path: string | undefined): any {
  if (!source || !path) return undefined;
  const segments = path.split('.').map(seg => seg.trim()).filter(Boolean);
  if (!segments.length) return undefined;
  let current = source;
  for (const segment of segments) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

function getValueFromSourceRow(source: any, path: string | undefined): any {
  if (!source || !path) return undefined;
  const direct = getValueFromPath(source, path);
  if (direct !== undefined) return direct;
  if (typeof source !== 'object' || !source) return undefined;
  const normalized = path.toLowerCase();
  const fallbackKey = Object.keys(source).find(key => key.toLowerCase() === normalized);
  if (fallbackKey) return source[fallbackKey];
  return undefined;
}

function getRowContext(entry: any): Record<string, any> | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  return entry[ROW_CONTEXT_KEY];
}

function resolveRowContextValue(entry: any, sourcePath: string): any {
  if (!sourcePath || !sourcePath.startsWith(ROW_CONTEXT_PREFIX)) return undefined;
  const rowField = sourcePath.slice(ROW_CONTEXT_PREFIX.length).trim();
  if (!rowField) return undefined;
  const ctx = getRowContext(entry);
  if (!ctx) return undefined;
  return ctx[rowField];
}

function resolveMappingValue(entry: any, sourcePath: string): any {
  if (!sourcePath) return undefined;
  if (sourcePath.startsWith(ROW_CONTEXT_PREFIX)) {
    return resolveRowContextValue(entry, sourcePath);
  }
  return getValueFromPath(entry, sourcePath);
}

function attachRowContext(entries: any[], rowValues?: Record<string, any>): any[] {
  if (!rowValues) return entries;
  const snapshot = { ...rowValues };
  return entries.map(entry => ({
    ...entry,
    [ROW_CONTEXT_KEY]: snapshot
  }));
}

function buildPreset(
  entry: any,
  effect: SelectionEffect,
  lineFieldIds: string[]
): Record<string, string | number> {
  const mapping = effect.lineItemMapping || {};
  const targetFields = Object.keys(mapping).length ? Object.keys(mapping) : lineFieldIds;
  const preset: Record<string, string | number> = {};
  targetFields.forEach(fieldId => {
    const sourcePath = mapping[fieldId] || fieldId;
    const rawValue = resolveMappingValue(entry, sourcePath);
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    preset[fieldId] = typeof rawValue === 'number' ? rawValue : rawValue.toString();
  });
  return preset;
}

function setValueAtPath(target: any, path: string | undefined, value: any): void {
  if (!target || !path) return;
  const segments = path.split('.').map(seg => seg.trim()).filter(Boolean);
  if (!segments.length) return;
  let current = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

function parseNumericValue(value: any): number {
  if (Array.isArray(value)) {
    return Number(value[0]);
  }
  return Number(value);
}

function determineScaleFactor(
  effect: SelectionEffect,
  lineItemContext: SelectionEffectOptions['lineItem'],
  sourceRow: any
): number {
  if (!effect.rowMultiplierFieldId) return 1;
  const rowValues = lineItemContext?.rowValues || {};
  const desiredRaw = rowValues[effect.rowMultiplierFieldId];
  const desiredValue = parseNumericValue(desiredRaw);
  if (!Number.isFinite(desiredValue)) return 1;
  if (!effect.dataSourceMultiplierField) return desiredValue;
  const baselineRaw = getValueFromSourceRow(sourceRow, effect.dataSourceMultiplierField);
  const baseline = Number(baselineRaw);
  if (!Number.isFinite(baseline) || baseline === 0) {
    if (isDebug() && typeof console !== 'undefined') {
      console.info('[SelectionEffects] scale baseline missing', {
        groupId: effect.groupId,
        rowId: lineItemContext?.rowId,
        fieldId: effect.dataSourceMultiplierField,
        baseline: baselineRaw
      });
    }
    return desiredValue;
  }
  const factor = desiredValue / baseline;
  if (isDebug() && typeof console !== 'undefined') {
    console.info('[SelectionEffects] scale factor computed', {
      groupId: effect.groupId,
      rowId: lineItemContext?.rowId,
      multiplierField: effect.rowMultiplierFieldId,
      sourceField: effect.dataSourceMultiplierField,
      desired: desiredValue,
      baseline,
      factor
    });
  }
  return factor;
}

function resolveNumericTargets(effect: SelectionEffect, fields: any[]): string[] {
  if (effect.scaleNumericFields && effect.scaleNumericFields.length) {
    return effect.scaleNumericFields;
  }
  if (effect.aggregateNumericFields && effect.aggregateNumericFields.length) {
    return effect.aggregateNumericFields;
  }
  const numericFields = fields.filter((field: any) => field.type === 'NUMBER').map((field: any) => field.id) || [];
  return numericFields;
}

function applyScale(
  entries: any[],
  effect: SelectionEffect,
  lineItemContext: SelectionEffectOptions['lineItem'],
  sourceRow: any,
  fields: any[]
): any[] {
  const scaleFactor = determineScaleFactor(effect, lineItemContext, sourceRow);
  const targets = resolveNumericTargets(effect, fields);
  const mapping = effect.lineItemMapping || {};
  return entries.map(entry => {
    const clone = { ...entry };
    if (isFinite(scaleFactor) && scaleFactor !== 1 && targets.length) {
      targets.forEach(fieldId => {
        const sourcePath = mapping[fieldId] || fieldId;
        const currentValue = Number(getValueFromPath(clone, sourcePath));
        if (!Number.isFinite(currentValue)) return;
        const scaledRaw = currentValue * scaleFactor;
        if (!Number.isFinite(scaledRaw)) return;
        const scaledValue = Number(scaledRaw.toFixed(2));
        setValueAtPath(clone, sourcePath, scaledValue);
      });
    }
    return clone;
  });
}

function populateLineItemsFromDataSource({
  effect,
  definition,
  question,
  language,
  ctx,
  debug,
  contextId,
  normalizedSelections,
  diff,
  lineItem
}: DataDrivenEffectParams): void {
  const sourceConfig = effect.dataSource || question.dataSource;
  if (!sourceConfig) {
    if (debug && typeof console !== 'undefined') {
      console.warn('[SelectionEffects] data-driven effect missing dataSource config', {
        questionId: question.id,
        effect
      });
    }
    return;
  }
  const resolveTargetLineConfig = (): { id: string; fields: any[] } | null => {
    const direct = definition.questions.find(q => q.id === effect.groupId);
    if (direct?.lineItemConfig?.fields) {
      return { id: direct.id, fields: direct.lineItemConfig.fields };
    }
    const parents = lineItem?.groupId
      ? definition.questions.filter(q => q.id === lineItem.groupId)
      : definition.questions;
    for (const parent of parents) {
      const match = parent.lineItemConfig?.subGroups?.find(sub => resolveSubgroupKey(sub) === effect.groupId);
      if (match) return { id: effect.groupId, fields: match.fields || [] };
    }
    return null;
  };

  const targetConfig = resolveTargetLineConfig();
  if (!targetConfig || !targetConfig.fields.length) {
    if (debug && typeof console !== 'undefined') {
      console.warn('[SelectionEffects] target group missing or misconfigured', {
        effect,
        questionId: question.id
      });
    }
    return;
  }
  const cache = getOrCreateCache(question);
  const contextMap = getContextMap(cache, contextId, true)!;
  diff.removedSelections.forEach(sel => contextMap.delete(sel));
  if (!normalizedSelections.length) {
    contextMap.clear();
    if (debug && typeof console !== 'undefined') {
      console.info('[SelectionEffects] context cleared (no selections)', { questionId: question.id, contextId });
    }
    renderAggregatedRows({
      effect,
      targetConfig,
      cache,
      ctx,
      debug,
      contextId
    });
    return;
  }
  const missingSelections = normalizedSelections.filter(sel => !contextMap.has(sel));
  if (!missingSelections.length) {
    renderAggregatedRows({
      effect,
      targetConfig,
      cache,
      ctx,
      debug,
      contextId
    });
    return;
  }
  const stateToken = ++cache.token;

  fetchDataSource(sourceConfig, language)
    .then(res => {
      if (stateToken !== cache.token) {
        return;
      }
      const rows = Array.isArray((res as any)?.items)
        ? (res as any).items
        : Array.isArray(res)
          ? res
          : [];
      if (!rows.length) {
        if (debug && typeof console !== 'undefined') {
          console.warn('[SelectionEffects] data-driven effect: no rows returned', {
            questionId: question.id,
            sourceId: sourceConfig.id
          });
        }
        contextMap.clear();
        renderAggregatedRows({
          effect,
          targetConfig,
          cache,
          ctx,
          debug,
          contextId
        });
        return;
      }
      const sampleRow = rows[0];
      const lookupField = resolveLookupField(effect, question, sampleRow);
      if (!lookupField) {
        if (debug && typeof console !== 'undefined') {
          console.warn('[SelectionEffects] unable to resolve lookupField', {
            questionId: question.id,
            effect
          });
        }
        return;
      }
      missingSelections.forEach(selectedValue => {
        const normalizedTarget = selectedValue.toLowerCase();
        const row = rows.find((candidate: any) => {
          const candidateValue = normalizeString(candidate?.[lookupField]).toLowerCase();
          return candidateValue === normalizedTarget;
        });
        if (!row) {
          if (debug && typeof console !== 'undefined') {
            console.warn('[SelectionEffects] no matching row for selection', {
              questionId: question.id,
              selectedValue,
              lookupField
            });
          }
          contextMap.delete(selectedValue);
          return;
        }
        const payload = effect.dataField ? row[effect.dataField] : row;
        const entries = coerceItemsCollection(payload);
        if (!entries.length) {
          if (debug && typeof console !== 'undefined') {
            console.warn('[SelectionEffects] data-driven effect produced no entries', {
              questionId: question.id,
              selectedValue,
              dataField: effect.dataField
            });
          }
          contextMap.delete(selectedValue);
          return;
        }
        const scaledEntries = applyScale(entries, effect, lineItem, row, targetConfig.fields);
        const enrichedEntries = attachRowContext(scaledEntries, lineItem?.rowValues);
        contextMap.set(selectedValue, {
          value: selectedValue,
          entries: enrichedEntries
        });
      });
      renderAggregatedRows({
        effect,
        targetConfig,
        cache,
        ctx,
        debug,
        contextId
      });
    })
    .catch(err => {
      if (debug && typeof console !== 'undefined') {
        console.error('[SelectionEffects] data-driven effect failed', err);
      }
    });
}

interface RenderParams {
  targetConfig: { id: string; fields: any[] };
  effect: SelectionEffect;
  cache: SelectionEffectCache;
  ctx: EffectContext;
  debug: boolean;
  contextId: string;
}

function renderAggregatedRows({ effect, targetConfig, cache, ctx, debug, contextId }: RenderParams): void {
  const entriesForAllSelections: any[] = [];
  const contextMap = getContextMap(cache, contextId);
  if (contextMap) {
    contextMap.forEach(entry => {
      if (entry.entries && entry.entries.length) {
        entriesForAllSelections.push(...entry.entries);
      }
    });
  }
  const numericTargets = resolveNumericTargets(effect, targetConfig.fields);

  if (!entriesForAllSelections.length) {
    if (effect.clearGroupBeforeAdd !== false && typeof ctx.clearLineItems === 'function') {
      ctx.clearLineItems(effect.groupId, contextId);
    }
    if (debug && typeof console !== 'undefined') {
      console.warn('[SelectionEffects] data-driven effect produced no entries after filtering', {
        questionId: effect.groupId
      });
    }
    return;
  }
  const aggregatedPresets = aggregateEntries(entriesForAllSelections, effect, targetConfig.fields);

  if (ctx.updateAutoLineItems) {
    ctx.updateAutoLineItems(effect.groupId, aggregatedPresets, {
      effectContextId: contextId,
      numericTargets
    });
    return;
  }

  if (effect.clearGroupBeforeAdd !== false && typeof ctx.clearLineItems === 'function') {
    ctx.clearLineItems(effect.groupId, contextId);
  }
  aggregatedPresets.forEach(preset => {
    ctx.addLineItemRow(effect.groupId, preset, { effectContextId: contextId, auto: true });
    if (debug && typeof console !== 'undefined') {
      console.info('[SelectionEffects] addLineItemsFromDataSource dispatched', {
        groupId: effect.groupId,
        preset
      });
    }
  });
}

function aggregateEntries(
  entries: any[],
  effect: SelectionEffect,
  fields: any[]
): Array<Record<string, string | number>> {
  const numericFieldIds = (effect.aggregateNumericFields && effect.aggregateNumericFields.length
    ? effect.aggregateNumericFields
    : fields.filter(field => field.type === 'NUMBER').map(field => field.id)
  ).map(id => id.toString());
  const implicitNonNumeric = fields
    .map(field => field.id)
    .filter(fieldId => !numericFieldIds.includes(fieldId));
  const nonNumericFieldIds = (effect.aggregateBy && effect.aggregateBy.length ? effect.aggregateBy : implicitNonNumeric)
    .map(id => id.toString());
  const lineFieldIds = fields.map(field => field.id);
  const buckets = new Map<string, Record<string, string | number>>();

  entries.forEach(entry => {
    const preset = buildPreset(entry, effect, lineFieldIds);
    const key = buildAggregationKey(preset, nonNumericFieldIds);
    if (!buckets.has(key)) {
      buckets.set(key, { ...preset });
      return;
    }
    const target = buckets.get(key)!;
    numericFieldIds.forEach(fieldId => {
      const current = Number(target[fieldId] ?? 0);
      const incoming = Number(preset[fieldId] ?? 0);
      const nextValue = (isNaN(current) ? 0 : current) + (isNaN(incoming) ? 0 : incoming);
      target[fieldId] = nextValue;
    });
  });

  return Array.from(buckets.values()).map(preset => {
    numericFieldIds.forEach(id => {
      if (preset[id] !== undefined && preset[id] !== null) {
        const asNumber = Number(preset[id]);
        if (Number.isFinite(asNumber)) {
          const rounded = Number(asNumber.toFixed(2));
          preset[id] = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
        }
      }
    });
    return preset;
  });
}

function buildAggregationKey(
  preset: Record<string, string | number>,
  nonNumericFieldIds: string[]
): string {
  if (!nonNumericFieldIds.length) {
    return '__all_numeric__';
  }
  return nonNumericFieldIds
    .map(id => `${id}::${preset[id] ?? ''}`)
    .join('||');
}
