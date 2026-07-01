import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';
import type { LangCode } from '../../types';

export type UploadFailureTargetBase = {
  scope: 'top' | 'line';
  fieldPath: string;
};

export type UploadFailureState<TTarget extends UploadFailureTargetBase = UploadFailureTargetBase> = {
  message: string;
  retrying: boolean;
  target: TTarget;
  rawMessage?: string;
};

export type UploadFailureMap<TTarget extends UploadFailureTargetBase = UploadFailureTargetBase> = Record<
  string,
  UploadFailureState<TTarget>
>;

export type DriveLinkValidationCode =
  | 'notDriveFile'
  | 'scopeMissing'
  | 'notAccessible'
  | 'trashed'
  | 'outOfScope'
  | 'repositoryRequired';

const DRIVE_LINK_VALIDATION_ERROR_PREFIX = 'CK_UPLOAD_LINK_VALIDATION:';

const DRIVE_LINK_VALIDATION_SYSTEM_KEYS: Record<DriveLinkValidationCode, { key: string; fallback: string }> = {
  notDriveFile: {
    key: 'files.linkCapture.validation.notDriveFile',
    fallback: 'Receipt evidence links must be Google Drive file links.'
  },
  scopeMissing: {
    key: 'files.linkCapture.validation.scopeMissing',
    fallback: 'Receipt link validation is not configured correctly.'
  },
  notAccessible: {
    key: 'files.linkCapture.validation.notAccessible',
    fallback: 'Receipt evidence link is not accessible from the configured customer Drive.'
  },
  trashed: {
    key: 'files.linkCapture.validation.trashed',
    fallback: 'Receipt evidence link points to a trashed Drive file.'
  },
  outOfScope: {
    key: 'files.linkCapture.validation.outOfScope',
    fallback: 'Receipt evidence link must point to a file in the configured customer Drive.'
  },
  repositoryRequired: {
    key: 'files.linkCapture.validation.repositoryRequired',
    fallback: 'Receipt link validation is not available. Try again later.'
  }
};

const LEGACY_DRIVE_LINK_VALIDATION_MESSAGES: Array<{ pattern: RegExp; code: DriveLinkValidationCode }> = [
  { pattern: /^Receipt evidence links must be Google Drive file links\./i, code: 'notDriveFile' },
  { pattern: /^Receipt link validation is enabled but no allowed customer Drive scope is configured\./i, code: 'scopeMissing' },
  { pattern: /^Receipt evidence link is not accessible from the configured customer Drive\./i, code: 'notAccessible' },
  { pattern: /^Receipt evidence link points to a trashed Drive file\./i, code: 'trashed' },
  { pattern: /^Receipt evidence link must point to a file in the configured customer Drive\./i, code: 'outOfScope' },
  { pattern: /^Receipt link validation requires a configured Drive file repository\./i, code: 'repositoryRequired' }
];

export type DriveLinkValidationFailure = {
  code: DriveLinkValidationCode;
  fileId?: string;
};

export const parseDriveLinkValidationFailure = (rawMessage?: string | null): DriveLinkValidationFailure | null => {
  const raw = (rawMessage || '').toString().trim();
  if (!raw) return null;
  if (raw.startsWith(DRIVE_LINK_VALIDATION_ERROR_PREFIX)) {
    const body = raw.slice(DRIVE_LINK_VALIDATION_ERROR_PREFIX.length);
    const parts = body.split(':').map(part => part.trim());
    const code = parts[0] as DriveLinkValidationCode;
    if (!Object.prototype.hasOwnProperty.call(DRIVE_LINK_VALIDATION_SYSTEM_KEYS, code)) return null;
    const fileIdPart = parts.find(part => /^fileId=/i.test(part));
    const fileId = fileIdPart ? fileIdPart.replace(/^fileId=/i, '').trim() : '';
    return fileId ? { code, fileId } : { code };
  }
  const legacy = LEGACY_DRIVE_LINK_VALIDATION_MESSAGES.find(entry => entry.pattern.test(raw));
  return legacy?.code ? { code: legacy.code } : null;
};

export const parseDriveLinkValidationFailureCode = (rawMessage?: string | null): DriveLinkValidationCode | null =>
  parseDriveLinkValidationFailure(rawMessage)?.code || null;

export const isUploadFailureRetryable = (rawMessage?: string | null): boolean =>
  !parseDriveLinkValidationFailureCode(rawMessage);

const resolveConfiguredDriveLinkValidationMessage = (args: {
  code: DriveLinkValidationCode;
  uploadConfig?: any;
  language: LangCode;
}): string => {
  const rawMessages = args.uploadConfig?.linkCapture?.validation?.messages;
  const configured = rawMessages?.[args.code]
    ? resolveLocalizedString(rawMessages[args.code], args.language, '').trim()
    : '';
  if (configured) return configured;
  const fallback = DRIVE_LINK_VALIDATION_SYSTEM_KEYS[args.code];
  return tSystem(fallback.key, args.language, fallback.fallback);
};

export const resolveUploadFailureUserMessage = (args: {
  fallback: string;
  rawMessage?: string | null;
  uploadConfig?: any;
  language?: LangCode;
}): string => {
  const fallback = (args.fallback || '').toString().trim();
  const raw = (args.rawMessage || '').toString().trim();
  const validationCode = parseDriveLinkValidationFailureCode(raw);
  if (validationCode) {
    return resolveConfiguredDriveLinkValidationMessage({
      code: validationCode,
      uploadConfig: args.uploadConfig,
      language: args.language || 'EN'
    });
  }
  return fallback || raw || 'The photos were not saved. Check the connection and try again.';
};

export const createUploadFailureState = <TTarget extends UploadFailureTargetBase>(args: {
  target: TTarget;
  message: string;
  rawMessage?: string | null;
}): UploadFailureState<TTarget> => ({
  message: args.message,
  retrying: false,
  target: args.target,
  rawMessage: args.rawMessage ? args.rawMessage.toString() : undefined
});

export const setUploadFailureRetrying = <TTarget extends UploadFailureTargetBase>(
  failures: UploadFailureMap<TTarget>,
  fieldPath: string,
  retrying: boolean
): UploadFailureMap<TTarget> => {
  const existing = failures[fieldPath];
  if (!existing || existing.retrying === retrying) return failures;
  return {
    ...failures,
    [fieldPath]: {
      ...existing,
      retrying
    }
  };
};

export const clearUploadFailure = <TTarget extends UploadFailureTargetBase>(
  failures: UploadFailureMap<TTarget>,
  fieldPath: string
): UploadFailureMap<TTarget> => {
  if (!failures[fieldPath]) return failures;
  const next = { ...failures };
  delete next[fieldPath];
  return next;
};
