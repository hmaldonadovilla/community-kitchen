import type { BankAvailabilitySnapshot, LocalizedString } from '../../../../types';
import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../../i18n';
import type { LangCode } from '../../../types';

export interface UtilisationConflictDialogConfig {
  title?: LocalizedString | string;
  message?: LocalizedString | string;
  confirmLabel?: LocalizedString | string;
  cancelLabel?: LocalizedString | string;
  showCancel?: boolean;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
  primaryAction?: 'confirm' | 'cancel';
}

export interface UtilisationConflictDialogCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  showCloseButton: boolean;
  dismissOnBackdrop: boolean;
  primaryAction: 'confirm' | 'cancel';
}

export const computeUtilisationConflictUsableQuantity = (
  availability?: BankAvailabilitySnapshot | null
): number => {
  const freeQuantity = Number(availability?.freeQuantity);
  const currentUtilisationQuantity = Number(availability?.currentUtilisationQuantity);
  const safeFreeQuantity = Number.isFinite(freeQuantity) ? Math.max(0, freeQuantity) : 0;
  const safeCurrentUtilisationQuantity = Number.isFinite(currentUtilisationQuantity)
    ? Math.max(0, currentUtilisationQuantity)
    : 0;
  return safeFreeQuantity + safeCurrentUtilisationQuantity;
};

const formatTemplate = (value: string, vars: Record<string, string>): string =>
  value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => vars[key] ?? '');

const formatQuantity = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const normalized = Math.max(0, value);
  if (Math.abs(normalized - Math.round(normalized)) < 1e-9) return `${Math.round(normalized)}`;
  return normalized.toFixed(2).replace(/\.?0+$/, '');
};

const resolveUnitLabel = (args: {
  availability?: BankAvailabilitySnapshot | null;
  unit?: string | null;
}): string => {
  const explicitUnit = `${args.availability?.unit || args.unit || ''}`.trim();
  if (explicitUnit) return explicitUnit;
  return '';
};

export const buildUtilisationConflictDialogCopy = (args: {
  language: LangCode;
  dialog?: UtilisationConflictDialogConfig | null;
  availability?: BankAvailabilitySnapshot | null;
  requestedQuantity: number;
  itemId?: string | null;
  itemLabel?: string | null;
  unit?: string | null;
  fallbackTitle: string;
  fallbackMessage: string;
  fallbackConfirmLabel: string;
  fallbackCancelLabel: string;
}): UtilisationConflictDialogCopy => {
  const availableQuantity = computeUtilisationConflictUsableQuantity(args.availability);
  const currentUtilisationQuantity = Math.max(0, Number(args.availability?.currentUtilisationQuantity) || 0);
  const requestedQuantity = Math.max(0, Number(args.requestedQuantity) || 0);
  const itemId = `${args.itemId || args.availability?.resourceItemId || ''}`.trim();
  const itemLabel = `${args.itemLabel || itemId || ''}`.trim();
  const unit = resolveUnitLabel(args);
  const available = formatQuantity(availableQuantity);
  const requested = formatQuantity(requestedQuantity);
  const current = formatQuantity(currentUtilisationQuantity);
  const availableWithUnit = [available, unit].filter(Boolean).join(' ').trim();

  const messageTemplate = resolveLocalizedString(args.dialog?.message, args.language, args.fallbackMessage).trim();
  const title = resolveOptionalLocalizedString(args.dialog?.title, args.language, args.fallbackTitle).trim();
  const confirmLabel =
    resolveLocalizedString(args.dialog?.confirmLabel, args.language, args.fallbackConfirmLabel).trim() ||
    args.fallbackConfirmLabel;
  const cancelLabel =
    resolveLocalizedString(args.dialog?.cancelLabel, args.language, args.fallbackCancelLabel).trim() ||
    args.fallbackCancelLabel;

  const message = formatTemplate(messageTemplate || args.fallbackMessage, {
    available,
    availableWithUnit,
    current,
    itemId,
    itemLabel,
    requested,
    unit
  });

  return {
    title,
    message,
    confirmLabel,
    cancelLabel,
    showCancel: args.dialog?.showCancel !== false,
    showCloseButton: args.dialog?.showCloseButton === true,
    dismissOnBackdrop: args.dialog?.dismissOnBackdrop === true,
    primaryAction: args.dialog?.primaryAction === 'cancel' ? 'cancel' : 'confirm'
  };
};
