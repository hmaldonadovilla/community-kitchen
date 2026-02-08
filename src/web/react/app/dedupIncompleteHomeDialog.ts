import type { ActionBarsConfig } from '../../../types';
import { resolveLocalizedString } from '../../i18n';
import type { LangCode, LocalizedString } from '../../types';

export type DedupIncompleteHomeDialogConfig = {
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
 * Resolve optional Home-navigation guard dialog config for incomplete dedup keys.
 *
 * Config path:
 * - actionBars.system.home.dedupIncompleteDialog
 * Aliases accepted for backwards compatibility:
 * - incompleteDedupDialog
 * - missingDedupDialog
 */
export const resolveDedupIncompleteHomeDialogConfig = (
  actionBars?: ActionBarsConfig
): DedupIncompleteHomeDialogConfig | undefined => {
  const rawHome = (actionBars as any)?.system?.home;
  if (!rawHome || typeof rawHome !== 'object') return undefined;
  const raw =
    (rawHome as any).dedupIncompleteDialog ??
    (rawHome as any).incompleteDedupDialog ??
    (rawHome as any).missingDedupDialog;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as DedupIncompleteHomeDialogConfig;
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
    showCloseButton: config?.showCloseButton !== false,
    dismissOnBackdrop: config?.dismissOnBackdrop !== false,
    deleteFailedMessage: resolveRequiredText(
      config?.deleteFailedMessage,
      language,
      'Could not delete the current record. Please try again.'
    )
  };
};
