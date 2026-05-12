import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../i18n';
import { tSystem, tSystemOptional } from '../../systemStrings';
import type { LangCode, LocalizedString } from '../../types';

export type UploadWaitMessageKind = 'save' | 'removeSelected';

const resolveWaitMessagesConfig = (uploadConfig: any): any =>
  uploadConfig?.waitMessages ??
  uploadConfig?.wait_messages ??
  uploadConfig?.busyMessages ??
  uploadConfig?.busy_messages ??
  uploadConfig?.blockingMessages ??
  uploadConfig?.blocking_messages ??
  {};

export const resolveUploadWaitMessage = (
  uploadConfig: any,
  language: LangCode,
  kind: UploadWaitMessageKind
): string => {
  const waitMessages = resolveWaitMessagesConfig(uploadConfig);
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

export const resolveUploadWaitTitle = (
  uploadConfig: any,
  language: LangCode,
  kind: UploadWaitMessageKind
): string => {
  const waitMessages = resolveWaitMessagesConfig(uploadConfig);
  const custom =
    kind === 'save'
      ? waitMessages?.saveTitle ??
        waitMessages?.uploadTitle ??
        waitMessages?.title ??
        uploadConfig?.waitSaveTitle ??
        uploadConfig?.wait_save_title ??
        uploadConfig?.uploadWaitTitle ??
        uploadConfig?.upload_wait_title
      : waitMessages?.removeSelectedTitle ??
        waitMessages?.removeTitle ??
        waitMessages?.removeAllTitle ??
        waitMessages?.title ??
        uploadConfig?.waitRemoveSelectedTitle ??
        uploadConfig?.wait_remove_selected_title ??
        uploadConfig?.removeWaitTitle ??
        uploadConfig?.remove_wait_title;
  const fallback = tSystemOptional('navigation.waitTitle', language, '');
  return resolveOptionalLocalizedString(custom as LocalizedString | undefined, language, fallback).trim();
};
