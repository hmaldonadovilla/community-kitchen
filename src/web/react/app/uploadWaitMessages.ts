import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';
import type { LangCode, LocalizedString } from '../../types';

export type UploadWaitMessageKind = 'save' | 'removeSelected';

export const resolveUploadWaitMessage = (
  uploadConfig: any,
  language: LangCode,
  kind: UploadWaitMessageKind
): string => {
  const waitMessages =
    uploadConfig?.waitMessages ??
    uploadConfig?.wait_messages ??
    uploadConfig?.busyMessages ??
    uploadConfig?.busy_messages ??
    uploadConfig?.blockingMessages ??
    uploadConfig?.blocking_messages ??
    {};
  const custom =
    kind === 'save'
      ? waitMessages?.save ??
        waitMessages?.upload ??
        uploadConfig?.waitSave ??
        uploadConfig?.wait_save ??
        uploadConfig?.uploadWaitMessage ??
        uploadConfig?.upload_wait_message
      : waitMessages?.removeSelected ??
        waitMessages?.remove ??
        waitMessages?.removeAll ??
        uploadConfig?.waitRemoveSelected ??
        uploadConfig?.wait_remove_selected ??
        uploadConfig?.removeWaitMessage ??
        uploadConfig?.remove_wait_message;
  const fallback =
    kind === 'save'
      ? tSystem('files.waitSave', language, 'Please wait while we save your file(s)')
      : tSystem('files.waitRemoveSelected', language, 'Please wait while we remove selected file(s)');
  const resolved = custom ? resolveLocalizedString(custom as LocalizedString, language, '').trim() : '';
  return resolved || fallback;
};
