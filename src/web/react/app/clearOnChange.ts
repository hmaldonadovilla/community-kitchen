import type { FieldValue, WebFormDefinition } from '../../types';
import type { LineItemState } from '../types';
import { normalizeRecordValues } from './records';
import { buildInitialLineItems } from './lineItems';
import { applyValueMapsToForm } from './valueMaps';

type ResolvedClearOnChange = {
  enabled: boolean;
  mode: 'full' | 'ordered';
  bypassFields: string[];
};

const normalizeClearOnChangeConfig = (raw: any): ResolvedClearOnChange => {
  if (raw === true) return { enabled: true, mode: 'full', bypassFields: [] };
  if (!raw || typeof raw !== 'object') return { enabled: false, mode: 'full', bypassFields: [] };
  const enabled = raw.enabled !== undefined ? Boolean(raw.enabled) : true;
  const modeRaw = (raw.mode ?? raw.strategy ?? '').toString().trim().toLowerCase();
  const mode: 'full' | 'ordered' = modeRaw === 'ordered' || modeRaw === 'after' ? 'ordered' : 'full';
  const bypassRaw = raw.bypassFields ?? raw.bypass ?? raw.keepFields ?? raw.keep ?? raw.exclude;
  const bypassFields: string[] =
    Array.isArray(bypassRaw)
      ? bypassRaw
          .map(v => (v === undefined || v === null ? '' : v.toString().trim()))
          .filter(Boolean)
      : typeof bypassRaw === 'string'
        ? bypassRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];
  return { enabled, mode, bypassFields: Array.from(new Set(bypassFields)) };
};

export const isClearOnChangeEnabled = (raw: any): boolean => normalizeClearOnChangeConfig(raw).enabled;

export const applyClearOnChange = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  fieldId: string;
  nextValue: FieldValue;
  orderedFieldIds?: string[];
}): { values: Record<string, FieldValue>; lineItems: LineItemState; clearedFieldIds: string[]; clearedGroupKeys: string[] } => {
  const { definition, lineItems, fieldId, nextValue } = args;
  const normalizedFieldId = (fieldId || '').toString().trim();
  if (!normalizedFieldId) {
    return { values: args.values, lineItems: args.lineItems, clearedFieldIds: [], clearedGroupKeys: [] };
  }

  const sourceQuestion = (definition.questions || []).find(q => (q?.id || '').toString().trim() === normalizedFieldId);
  const clearCfg = normalizeClearOnChangeConfig((sourceQuestion as any)?.clearOnChange);
  if (!clearCfg.enabled) {
    return { values: args.values, lineItems: args.lineItems, clearedFieldIds: [], clearedGroupKeys: [] };
  }

  const questions = definition.questions || [];
  const sourceConfigIndex = questions.findIndex(q => (q?.id || '').toString().trim() === normalizedFieldId);
  const normalizedMode: 'full' | 'ordered' = clearCfg.mode === 'ordered' && sourceConfigIndex >= 0 ? 'ordered' : 'full';

  const orderedFieldIds = Array.isArray(args.orderedFieldIds)
    ? args.orderedFieldIds
        .map(raw => (raw === undefined || raw === null ? '' : raw.toString().trim()))
        .filter(Boolean)
    : [];
  const orderedIndexById = new Map<string, number>();
  orderedFieldIds.forEach((id, idx) => {
    if (!orderedIndexById.has(id)) orderedIndexById.set(id, idx);
  });
  const hasOrderedOverrideForSource = normalizedMode === 'ordered' && orderedIndexById.has(normalizedFieldId);
  const maxOrderedIndex = hasOrderedOverrideForSource ? orderedFieldIds.length : 0;
  const sourceIndex = hasOrderedOverrideForSource
    ? (orderedIndexById.get(normalizedFieldId) as number)
    : sourceConfigIndex;
  const bypassSet = new Set<string>([normalizedFieldId, ...clearCfg.bypassFields.map(id => id.toString().trim()).filter(Boolean)]);

  const resolveOrderedIndex = (qid: string, fallbackIdx: number): number => {
    if (hasOrderedOverrideForSource && orderedIndexById.has(qid)) return orderedIndexById.get(qid) as number;
    if (hasOrderedOverrideForSource) return maxOrderedIndex + fallbackIdx + 1;
    return fallbackIdx;
  };

  const shouldClearByIndex = (idx: number, qid: string): boolean => {
    if (normalizedMode === 'full') return true;
    return resolveOrderedIndex(qid, idx) > sourceIndex;
  };

  const clearTopFieldIds = new Set<string>();
  const clearGroupKeys = new Set<string>();
  questions.forEach((q, idx) => {
    const qid = (q?.id || '').toString().trim();
    if (!qid || bypassSet.has(qid)) return;
    if (!shouldClearByIndex(idx, qid)) return;
    if (q.type === 'LINE_ITEM_GROUP') {
      clearGroupKeys.add(qid);
      return;
    }
    clearTopFieldIds.add(qid);
  });

  if (normalizedMode === 'full') {
    Object.keys(lineItems || {}).forEach(groupId => {
      const gid = (groupId || '').toString().trim();
      if (!gid || bypassSet.has(gid)) return;
      clearGroupKeys.add(gid);
    });
  }

  const clearGroupPayloadKeys = new Set<string>();
  clearGroupKeys.forEach(groupId => {
    clearGroupPayloadKeys.add(groupId);
    clearGroupPayloadKeys.add(`${groupId}_json`);
  });
  const clearLineItemStateKeys = new Set<string>();
  clearGroupKeys.forEach(groupId => {
    clearLineItemStateKeys.add(groupId);
  });
  Object.keys(lineItems || {}).forEach(groupKey => {
    const normalizedKey = (groupKey || '').toString().trim();
    if (!normalizedKey) return;
    const rootGroupId = normalizedKey.split('.')[0] || normalizedKey;
    if (!clearGroupKeys.has(rootGroupId)) return;
    clearLineItemStateKeys.add(normalizedKey);
  });

  const resetValues = normalizeRecordValues(definition);
  const baseValues: Record<string, FieldValue> = normalizedMode === 'full' ? { ...resetValues } : { ...args.values };
  if (normalizedMode === 'full') {
    bypassSet.forEach(id => {
      if (id in args.values) baseValues[id] = args.values[id];
    });
  }
  clearTopFieldIds.forEach(id => {
    baseValues[id] = resetValues[id];
  });
  clearGroupPayloadKeys.forEach(key => {
    delete (baseValues as any)[key];
  });
  baseValues[normalizedFieldId] = nextValue;

  const initialLineItems = buildInitialLineItems(definition, baseValues);
  const nextLineItems: LineItemState = normalizedMode === 'full' ? { ...(initialLineItems || {}) } : { ...(lineItems || {}) };
  if (normalizedMode === 'full') {
    bypassSet.forEach(id => {
      if (!lineItems || !(id in lineItems)) return;
      nextLineItems[id] = lineItems[id] || [];
    });
  }
  clearLineItemStateKeys.forEach(groupKey => {
    if (Object.prototype.hasOwnProperty.call(initialLineItems, groupKey)) {
      nextLineItems[groupKey] = initialLineItems[groupKey] || [];
      return;
    }
    delete (nextLineItems as any)[groupKey];
  });

  const lineGroupIds = new Set<string>(questions.filter(q => q.type === 'LINE_ITEM_GROUP').map(q => (q.id || '').toString().trim()));
  const lockedTopFields = Array.from(bypassSet).filter(id => id && !lineGroupIds.has(id));
  const mapped = applyValueMapsToForm(definition, baseValues, nextLineItems, {
    mode: 'change',
    lockedTopFields
  });

  return {
    values: mapped.values,
    lineItems: mapped.lineItems,
    clearedFieldIds: Array.from(clearTopFieldIds),
    clearedGroupKeys: Array.from(clearGroupKeys)
  };
};
