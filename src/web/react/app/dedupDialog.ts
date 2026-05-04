import { resolveLocalizedString } from '../../i18n';
import { optionKey, toOptionSet } from '../../core';
import type { DedupDialogConfig, FieldValue, LangCode, LocalizedString, WebFormDefinition } from '../../types';
import type { OptionState } from '../types';
import { resolveLabel } from '../utils/labels';
import { formatDisplayText } from '../utils/valueDisplay';

/**
 * Resolve dedup dialog copy from config with defaults.
 *
 * Owner: WebForm UI (React)
 */
export type DedupDialogCopy = {
  title: string;
  intro: string;
  outro: string;
  openLabel: string;
  changeLabel: string;
  cancelLabel: string;
};

export type DedupDialogItem = { fieldId: string; label: string; value: string; fieldType?: string };

const resolveRequiredText = (value: LocalizedString | undefined, language: LangCode, fallback: string): string => {
  const resolved = resolveLocalizedString(value, language, fallback).toString();
  return resolved.trim() ? resolved : fallback;
};

const resolveOptionalText = (value: LocalizedString | undefined, language: LangCode, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  return resolveLocalizedString(value, language, fallback).toString();
};

export const resolveDedupDialogCopy = (config: DedupDialogConfig | undefined, language: LangCode): DedupDialogCopy => {
  return {
    title: resolveRequiredText(
      config?.title,
      language,
      'Creating duplicate record for the same customer, service and date is not allowed.'
    ),
    intro: resolveOptionalText(config?.intro, language, 'A meal production record already exists for:'),
    outro: resolveOptionalText(config?.outro, language, 'What do you want to do?'),
    openLabel: resolveRequiredText(config?.openLabel, language, 'Open existing record'),
    changeLabel: resolveRequiredText(config?.changeLabel, language, 'Change customer, service or date'),
    cancelLabel: resolveRequiredText(config?.cancelLabel, language, 'Cancel')
  };
};

export const buildDedupDialogDetails = (args: {
  definition: WebFormDefinition;
  dedupIdentityFieldIdMap: Record<string, unknown>;
  optionState: OptionState;
  language: LangCode;
  ruleId?: string;
  values: Record<string, FieldValue>;
}): { keys: string[]; items: DedupDialogItem[] } => {
  const rules = Array.isArray((args.definition as any)?.dedupRules) ? ((args.definition as any).dedupRules as any[]) : [];
  const ruleId = (args.ruleId || '').toString().trim();
  const rule = rules.find(entry => (entry?.id || '').toString().trim() === ruleId);
  const ruleKeys = Array.isArray(rule?.keys)
    ? rule.keys.map((key: any) => (key ?? '').toString().trim()).filter(Boolean)
    : [];
  const fallbackKeys = (() => {
    const keys = Object.keys(args.dedupIdentityFieldIdMap || {});
    const list: string[] = [];
    const seen = new Set<string>();
    keys.forEach(key => {
      const trimmed = (key || '').toString().trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      list.push(trimmed);
    });
    return list;
  })();
  const keys = ruleKeys.length ? ruleKeys : fallbackKeys;
  const questions = Array.isArray(args.definition?.questions) ? args.definition.questions : [];
  const rawItems: DedupDialogItem[] = keys.map((key: string) => {
    const keyLower = key.toLowerCase();
    const question = questions.find(entry => {
      const id = (entry?.id || '').toString();
      return id === key || id.toLowerCase() === keyLower;
    });
    const fieldId = (question?.id || key).toString();
    const label = question ? resolveLabel(question, args.language) : key;
    const optionSet = question ? args.optionState[optionKey(question.id)] || toOptionSet(question as any) : undefined;
    const fieldType = question?.type;
    const rawValue = (args.values as any)[fieldId];
    const value = formatDisplayText(rawValue, { language: args.language, optionSet, fieldType });
    return { fieldId, label: label.toString(), value, fieldType };
  });
  const seen = new Set<string>();
  const items = rawItems.filter((item: DedupDialogItem) => {
    const lower = item.fieldId.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
  const priority = (item: DedupDialogItem) => {
    if ((item.fieldType || '').toString().toUpperCase() === 'DATE') return 2;
    const labelLower = item.label.toLowerCase();
    if (labelLower.includes('customer')) return 0;
    if (labelLower.includes('service')) return 1;
    if (labelLower.includes('date')) return 2;
    return 3;
  };
  const ordered = [...items].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return 0;
  });
  return { keys: ordered.map(item => item.fieldId), items: ordered };
};
