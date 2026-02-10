import type { FieldValue, LangCode, LocalizedString, WebQuestionDefinition } from '../../types';
import type { LineItemState } from '../types';
import { resolveLocalizedString } from '../../i18n';
import { isEmptyValue } from '../utils/values';

const normalizeStringId = (raw: any): string => (raw === undefined || raw === null ? '' : raw.toString().trim());

export const normalizeFieldIdList = (raw: any): string[] => {
  if (raw === undefined || raw === null || raw === '') return [];
  const list = Array.isArray(raw)
    ? raw
    : raw
        .toString()
        .split(',')
        .map((entry: string) => entry.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  list.forEach((entry: any) => {
    const id = normalizeStringId(entry);
    const key = id.toLowerCase();
    if (!id || seen.has(key)) return;
    seen.add(key);
    out.push(id);
  });
  return out;
};

export const buildFieldIdMap = (fieldIds: string[]): Record<string, true> => {
  const out: Record<string, true> = {};
  (fieldIds || []).forEach(raw => {
    const id = normalizeStringId(raw);
    if (!id) return;
    out[id] = true;
    out[id.toLowerCase()] = true;
  });
  return out;
};

export const getValueByFieldId = (valuesRaw: Record<string, any>, fieldIdRaw: string): any => {
  const values = valuesRaw || {};
  const fieldId = normalizeStringId(fieldIdRaw);
  if (!fieldId) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, fieldId)) return (values as any)[fieldId];
  const lower = fieldId.toLowerCase();
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i += 1) {
    const key = normalizeStringId(keys[i]);
    if (!key || key.toLowerCase() !== lower) continue;
    return (values as any)[keys[i]];
  }
  return undefined;
};

export const hasIncompleteConfiguredFields = (fieldIds: string[], valuesRaw: Record<string, any>): boolean => {
  if (!Array.isArray(fieldIds) || !fieldIds.length) return false;
  return fieldIds.some(fieldId => isEmptyValue(getValueByFieldId(valuesRaw || {}, fieldId) as FieldValue));
};

export const filterDedupRulesForPrecheck = (rulesRaw: any, triggerFieldIds: string[]): any[] => {
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];
  const triggers = normalizeFieldIdList(triggerFieldIds);
  if (!triggers.length) return rules;
  const triggerSet = new Set<string>(triggers.map(v => v.toLowerCase()));
  return rules.filter(rule => {
    if (!rule) return false;
    const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
    if (onConflict !== 'reject') return false;
    const keys = Array.isArray(rule.keys) ? rule.keys : [];
    if (!keys.length) return false;
    return keys.every((k: any) => triggerSet.has(normalizeStringId(k).toLowerCase()));
  });
};

const shouldIgnoreTopLevelForEnteredCheck = (q: WebQuestionDefinition | undefined): boolean => {
  if (!q) return true;
  if (q.readOnly) return true;
  if (q.type === 'BUTTON') return true;
  if (q.type === 'LINE_ITEM_GROUP') return true;
  return false;
};

export const hasEnteredTopLevelValues = (
  questions: WebQuestionDefinition[] | undefined,
  valuesRaw: Record<string, FieldValue>
): boolean => {
  const list = Array.isArray(questions) ? questions : [];
  const values = valuesRaw || {};
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i];
    if (shouldIgnoreTopLevelForEnteredCheck(q)) continue;
    const value = getValueByFieldId(values as any, q.id);
    if (!isEmptyValue(value as FieldValue)) return true;
  }
  return false;
};

export const hasEnteredLineItemValues = (lineItems: LineItemState): boolean => {
  const groups = Object.values(lineItems || {});
  for (let g = 0; g < groups.length; g += 1) {
    const rows = Array.isArray(groups[g]) ? groups[g] : [];
    for (let r = 0; r < rows.length; r += 1) {
      const rowValues = (rows[r]?.values || {}) as Record<string, FieldValue>;
      const keys = Object.keys(rowValues);
      for (let k = 0; k < keys.length; k += 1) {
        const key = normalizeStringId(keys[k]);
        if (!key || key.startsWith('__ck')) continue;
        if (!isEmptyValue(rowValues[key])) return true;
      }
    }
  }
  return false;
};

export type DedupCheckDialogCopy = {
  enabled: boolean;
  checkingTitle: string;
  checkingMessage: string;
  availableTitle: string;
  availableMessage: string;
  duplicateTitle: string;
  duplicateMessage: string;
  availableAutoCloseMs: number;
  duplicateAutoCloseMs: number;
};

export const resolveDedupCheckDialogCopy = (
  cfg: any,
  language: LangCode,
  defaults?: Partial<DedupCheckDialogCopy>
): DedupCheckDialogCopy => {
  const resolveText = (value: LocalizedString | string | undefined, fallback: string): string =>
    resolveLocalizedString(value as any, language, fallback).toString();

  const availableAutoCloseMsRaw = Number(cfg?.availableAutoCloseMs);
  const duplicateAutoCloseMsRaw = Number(cfg?.duplicateAutoCloseMs);
  const availableAutoCloseMs = Number.isFinite(availableAutoCloseMsRaw)
    ? Math.max(0, Math.min(15000, Math.floor(availableAutoCloseMsRaw)))
    : Number.isFinite(Number(defaults?.availableAutoCloseMs))
      ? Math.max(0, Math.min(15000, Math.floor(Number(defaults?.availableAutoCloseMs))))
      : 1200;
  const duplicateAutoCloseMs = Number.isFinite(duplicateAutoCloseMsRaw)
    ? Math.max(0, Math.min(15000, Math.floor(duplicateAutoCloseMsRaw)))
    : Number.isFinite(Number(defaults?.duplicateAutoCloseMs))
      ? Math.max(0, Math.min(15000, Math.floor(Number(defaults?.duplicateAutoCloseMs))))
      : 900;

  return {
    enabled: cfg?.enabled !== false,
    checkingTitle: resolveText(cfg?.checkingTitle as any, defaults?.checkingTitle || 'Checking duplicates'),
    checkingMessage: resolveText(
      cfg?.checkingMessage as any,
      defaults?.checkingMessage || 'Please wait while we validate your input.'
    ),
    availableTitle: resolveText(cfg?.availableTitle as any, defaults?.availableTitle || 'Value available'),
    availableMessage: resolveText(
      cfg?.availableMessage as any,
      defaults?.availableMessage || 'You can continue entering details.'
    ),
    duplicateTitle: resolveText(cfg?.duplicateTitle as any, defaults?.duplicateTitle || 'Duplicate found'),
    duplicateMessage: resolveText(
      cfg?.duplicateMessage as any,
      defaults?.duplicateMessage || 'A matching record already exists.'
    ),
    availableAutoCloseMs,
    duplicateAutoCloseMs
  };
};
