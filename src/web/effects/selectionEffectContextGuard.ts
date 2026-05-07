import type { SelectionEffect, WebQuestionDefinition } from '../../types';

const normalizeFieldId = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

const collectWhenFieldIds = (when: unknown, sink: Set<string>): void => {
  if (!when || typeof when !== 'object') return;
  const record = when as Record<string, unknown>;
  const fieldId = normalizeFieldId(record.fieldId);
  if (fieldId) sink.add(fieldId);
  ['all', 'any', 'none'].forEach(key => {
    const entries = record[key];
    if (!Array.isArray(entries)) return;
    entries.forEach(entry => collectWhenFieldIds(entry, sink));
  });
};

const resolveSourceSyncConfig = (effect: SelectionEffect): Record<string, unknown> => {
  const nested =
    effect?.sourceSync && typeof effect.sourceSync === 'object'
      ? effect.sourceSync
      : (effect as any)?.sync && typeof (effect as any).sync === 'object'
        ? (effect as any).sync
        : {};
  return {
    ...nested,
    ...(effect?.stopWhen ? { stopWhen: effect.stopWhen } : {})
  };
};

/**
 * Fields that make an async selection-effect response valid for the row that
 * requested it. If any of these have changed before the response returns, the
 * response is stale and must not mutate the current form state.
 */
export const resolveSelectionEffectContextGuardFieldIds = (
  effect: SelectionEffect,
  question: WebQuestionDefinition
): string[] => {
  const fieldIds = new Set<string>();
  const sourceFieldId = normalizeFieldId(question?.id);
  if (sourceFieldId) fieldIds.add(sourceFieldId);
  [
    (effect as any)?.lookupSourceFieldId,
    (effect as any)?.rowMultiplierFieldId,
    (effect as any)?.matchField
  ].forEach(raw => {
    const fieldId = normalizeFieldId(raw);
    if (fieldId) fieldIds.add(fieldId);
  });
  collectWhenFieldIds((effect as any)?.when, fieldIds);
  collectWhenFieldIds(resolveSourceSyncConfig(effect).stopWhen, fieldIds);
  return Array.from(fieldIds).filter(fieldId => !fieldId.startsWith('__ck'));
};
