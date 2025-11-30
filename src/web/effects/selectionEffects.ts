import { SelectionEffect, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';
import { fetchDataSource } from '../data/dataSources';

interface EffectContext {
  addLineItemRow: (groupId: string, preset?: Record<string, string | number>) => void;
  clearLineItems?: (groupId: string) => void;
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
  ctx: EffectContext
): void {
  if (!question?.selectionEffects || !question.selectionEffects.length) return;
  const debug = isDebug();
  const normalizedSelections = normalizeSelectionValues(value);
  const diffPreview = previewSelectionDiff(question, normalizedSelections);
  if (debug && typeof console !== 'undefined') {
    console.info('[SelectionEffects] evaluating', {
      questionId: question.id,
      value,
      effectCount: question.selectionEffects.length,
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
        value,
        language,
        ctx,
        debug
      });
    }
  });
}

interface DataDrivenEffectParams {
  effect: SelectionEffect;
  definition: WebFormDefinition;
  question: WebQuestionDefinition;
  value: string | string[] | null | undefined;
  language: LangCode;
  ctx: EffectContext;
  debug: boolean;
}

interface SelectionEffectCache {
  selectionEntries: Map<string, any[]>;
  token: number;
}

interface SelectionDiffPreview {
  newlySelected: string[];
  removedSelections: string[];
  currentSelections: string[];
}

const selectionEffectState = new Map<string, SelectionEffectCache>();

function getStateKey(question: WebQuestionDefinition): string {
  return question.id;
}

function getOrCreateCache(question: WebQuestionDefinition): SelectionEffectCache {
  const key = getStateKey(question);
  if (!selectionEffectState.has(key)) {
    selectionEffectState.set(key, { selectionEntries: new Map(), token: 0 });
  }
  return selectionEffectState.get(key)!;
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

function previewSelectionDiff(question: WebQuestionDefinition, normalizedSelections: string[]): SelectionDiffPreview {
  const cache = getOrCreateCache(question);
  const removedSelections = Array.from(cache.selectionEntries.keys()).filter(sel => !normalizedSelections.includes(sel));
  const newlySelected = normalizedSelections.filter(sel => !cache.selectionEntries.has(sel));
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
    const rawValue = getValueFromPath(entry, sourcePath);
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    preset[fieldId] = typeof rawValue === 'number' ? rawValue : rawValue.toString();
  });
  return preset;
}

function populateLineItemsFromDataSource({
  effect,
  definition,
  question,
  value,
  language,
  ctx,
  debug
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
  const rawSelections = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  const normalizedSelections = Array.from(new Set(rawSelections.map(normalizeString))).filter(Boolean);
  const cache = getOrCreateCache(question);
  const removedSelections = Array.from(cache.selectionEntries.keys()).filter(sel => !normalizedSelections.includes(sel));
  removedSelections.forEach(sel => cache.selectionEntries.delete(sel));
  if (!normalizedSelections.length) {
    cache.selectionEntries.clear();
    if (typeof ctx.clearLineItems === 'function') {
      ctx.clearLineItems(effect.groupId);
    }
    if (debug && typeof console !== 'undefined') {
      console.info('[SelectionEffects] no selected values for data-driven effect', {
        questionId: question.id
      });
    }
    return;
  }
  const missingSelections = normalizedSelections.filter(sel => !cache.selectionEntries.has(sel));
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
      const group = definition.questions.find(q => q.id === effect.groupId);
      if (!group || group.type !== 'LINE_ITEM_GROUP' || !group.lineItemConfig) {
        if (debug && typeof console !== 'undefined') {
          console.warn('[SelectionEffects] target group missing or misconfigured', {
            effect,
            questionId: question.id
          });
        }
        return;
      }
      const lineFieldIds = (group?.lineItemConfig?.fields || []).map(field => field.id);
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
          cache.selectionEntries.delete(selectedValue);
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
          cache.selectionEntries.delete(selectedValue);
          return;
        }
        cache.selectionEntries.set(selectedValue, entries.map(entry => ({ ...entry })));
      });
      renderAggregatedRows({
        definition,
        group,
        effect,
        normalizedSelections,
        cache,
        ctx,
        debug
      });
    })
    .catch(err => {
      if (debug && typeof console !== 'undefined') {
        console.error('[SelectionEffects] data-driven effect failed', err);
      }
    });
}

interface RenderParams {
  definition: WebFormDefinition;
  group: WebQuestionDefinition;
  effect: SelectionEffect;
  normalizedSelections: string[];
  cache: SelectionEffectCache;
  ctx: EffectContext;
  debug: boolean;
}

function renderAggregatedRows({
  effect,
  group,
  normalizedSelections,
  cache,
  ctx,
  debug
}: RenderParams): void {
  const entriesForAllSelections: any[] = [];
  normalizedSelections.forEach(selectionValue => {
    const entries = cache.selectionEntries.get(selectionValue);
    if (entries && entries.length) {
      entriesForAllSelections.push(...entries);
    }
  });
  if (!entriesForAllSelections.length) {
    if (effect.clearGroupBeforeAdd !== false && typeof ctx.clearLineItems === 'function') {
      ctx.clearLineItems(effect.groupId);
    }
    if (debug && typeof console !== 'undefined') {
      console.warn('[SelectionEffects] data-driven effect produced no entries after filtering', {
        questionId: group.id
      });
    }
    return;
  }
  if (effect.clearGroupBeforeAdd !== false && typeof ctx.clearLineItems === 'function') {
    ctx.clearLineItems(effect.groupId);
  }
  const aggregatedPresets = aggregateEntries(entriesForAllSelections, effect, group);
  aggregatedPresets.forEach(preset => {
    ctx.addLineItemRow(effect.groupId, preset);
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
  group: WebQuestionDefinition
): Array<Record<string, string | number>> {
  const fields = group.lineItemConfig?.fields || [];
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
        if (!isNaN(asNumber)) {
          preset[id] = asNumber.toString();
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
