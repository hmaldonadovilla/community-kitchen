import type { SystemActionGateDialogConfig, WebFormDefinition } from '../../../types';
import type { LangCode } from '../../types';
import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';

export type ResolvedCopyCurrentRecordDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  showCloseButton: boolean;
  dismissOnBackdrop: boolean;
};

export const resolveCopyCurrentRecordDialog = (
  definition: WebFormDefinition,
  language: LangCode
): ResolvedCopyCurrentRecordDialog | null => {
  const cfg = (definition as any)?.copyCurrentRecordDialog as SystemActionGateDialogConfig | undefined;
  if (!cfg || typeof cfg !== 'object') return null;

  const message = resolveLocalizedString(cfg.message, language, '').toString().trim();
  if (!message) return null;

  const title = resolveLocalizedString(cfg.title, language, tSystem('common.notice', language, 'Notice')).toString();
  const confirmLabel = resolveLocalizedString(cfg.confirmLabel, language, tSystem('common.ok', language, 'OK')).toString();
  const cancelLabel = resolveLocalizedString(cfg.cancelLabel, language, tSystem('common.cancel', language, 'Cancel')).toString();

  const showCancel = cfg.showCancel === true;
  const showCloseButton = cfg.showCloseButton === true;
  const dismissOnBackdrop = cfg.dismissOnBackdrop === true;

  return { title, message, confirmLabel, cancelLabel, showCancel, showCloseButton, dismissOnBackdrop };
};
