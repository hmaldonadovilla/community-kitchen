import type { ActionBarsConfig } from '../../../types';
import { resolveLocalizedString } from '../../i18n';
import type { LangCode, LocalizedString } from '../../types';

export type DedupIncompleteHomeDialogConfig = {
  criteria?: 'dedupKeys' | 'fieldIds' | 'either';
  fieldIds?: string[];
  enabled?: boolean;
  title?: LocalizedString | string;
  message?: LocalizedString | string;
  confirmLabel?: LocalizedString | string;
  cancelLabel?: LocalizedString | string;
  primaryAction?: 'confirm' | 'cancel';
  showCancel?: boolean;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
  deleteRecordOnConfirm?: boolean;
  deleteFailedMessage?: LocalizedString | string;
};

export type DedupIncompleteHomeDialogCopy = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  primaryAction: 'confirm' | 'cancel';
  showCancel: boolean;
  showCloseButton: boolean;
  dismissOnBackdrop: boolean;
  deleteFailedMessage: string;
};

const normalizeFieldIdList = (raw: any): string[] => {
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
    const id = entry === undefined || entry === null ? '' : entry.toString().trim();
    if (!id) return;
    const key = id.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  });
  return out;
};

const resolveCriteriaValue = (
  rawCriteria: any,
  fallback: 'dedupKeys' | 'fieldIds'
): 'dedupKeys' | 'fieldIds' | 'either' => {
  const normalized = (rawCriteria === undefined || rawCriteria === null ? '' : rawCriteria.toString().trim().toLowerCase());
  if (!normalized) return fallback;
  if (normalized === 'dedupkeys' || normalized === 'dedup') return 'dedupKeys';
  if (normalized === 'fieldids' || normalized === 'fields') return 'fieldIds';
  if (normalized === 'either' || normalized === 'any') return 'either';
  return fallback;
};

const resolveRequiredText = (value: LocalizedString | string | undefined, language: LangCode, fallback: string): string => {
  const resolved = resolveLocalizedString(value as any, language, fallback).toString();
  return resolved.trim() ? resolved : fallback;
};

const resolveOptionalText = (value: LocalizedString | string | undefined, language: LangCode, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  return resolveLocalizedString(value as any, language, fallback).toString();
};

const resolveTitleText = (value: LocalizedString | string | undefined, language: LangCode, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return fallback;
  const languageKey = (language || 'EN').toString().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(value, languageKey)) return (value as any)[languageKey]?.toString?.() ?? '';
  if (Object.prototype.hasOwnProperty.call(value, 'en')) return (value as any).en?.toString?.() ?? '';
  return fallback;
};

/**
 * Resolve optional Home-navigation guard dialog config.
 *
 * Config path:
 * - actionBars.system.home.incompleteFieldsDialog
 * - actionBars.system.home.dedupIncompleteDialog
 * Aliases accepted for backwards compatibility:
 * - homeIncompleteDialog
 * - missingFieldsDialog
 * - incompleteDedupDialog
 * - missingDedupDialog
 */
export const resolveDedupIncompleteHomeDialogConfig = (
  actionBars?: ActionBarsConfig
): DedupIncompleteHomeDialogConfig | undefined => {
  const rawHome = (actionBars as any)?.system?.home;
  if (!rawHome || typeof rawHome !== 'object') return undefined;
  const rawFields =
    (rawHome as any).incompleteFieldsDialog ??
    (rawHome as any).missingFieldsDialog ??
    (rawHome as any).homeIncompleteDialog;
  const rawDedup =
    (rawHome as any).dedupIncompleteDialog ??
    (rawHome as any).incompleteDedupDialog ??
    (rawHome as any).missingDedupDialog;
  const raw = rawFields ?? rawDedup;
  if (!raw || typeof raw !== 'object') return undefined;
  const fallbackCriteria = rawFields ? 'fieldIds' : 'dedupKeys';
  const config = { ...(raw as DedupIncompleteHomeDialogConfig) } as DedupIncompleteHomeDialogConfig & Record<string, any>;
  delete config.fields;
  delete config.trigger;
  const fieldIds = normalizeFieldIdList((raw as any).fieldIds ?? (raw as any).fields);
  if (fieldIds.length) config.fieldIds = fieldIds;
  if ((raw as any).criteria !== undefined || (raw as any).trigger !== undefined || rawFields) {
    config.criteria = resolveCriteriaValue((raw as any).criteria ?? (raw as any).trigger, fallbackCriteria);
  }
  return config;
};

export const resolveDedupIncompleteHomeDialogCopy = (
  config: DedupIncompleteHomeDialogConfig | undefined,
  language: LangCode
): DedupIncompleteHomeDialogCopy => {
  return {
    title: resolveTitleText(config?.title, language, 'Incomplete record'),
    message: resolveOptionalText(
      config?.message,
      language,
      'Some required dedup fields are missing. Continue to leave this page and discard the current record.'
    ),
    confirmLabel: resolveRequiredText(config?.confirmLabel, language, 'Continue and delete the record'),
    cancelLabel: resolveRequiredText(config?.cancelLabel, language, 'Cancel and continue editing'),
    primaryAction: config?.primaryAction === 'cancel' ? 'cancel' : 'confirm',
    showCancel: config?.showCancel !== false,
    showCloseButton: config?.showCloseButton === true,
    dismissOnBackdrop: config?.dismissOnBackdrop === true,
    deleteFailedMessage: resolveRequiredText(
      config?.deleteFailedMessage,
      language,
      'Could not delete the current record. Please try again.'
    )
  };
};
