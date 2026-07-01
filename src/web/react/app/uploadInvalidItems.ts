import { extractDriveFileIdFromLink } from '../features/uploads/domain/linkCapture';

export type UploadInvalidItemErrors = Record<string, string>;

const normalizeString = (raw: unknown): string => {
  try {
    return String(raw || '').trim();
  } catch {
    return '';
  }
};

export const getUploadInvalidItemKey = (item: string | File): string => {
  if (typeof item !== 'string') {
    return `file:${item.name || ''}:${item.size || 0}:${item.lastModified || 0}`;
  }
  const raw = normalizeString(item);
  if (!raw) return '';
  const driveFileId = extractDriveFileIdFromLink(raw);
  return driveFileId ? `drive:${driveFileId}` : `url:${raw}`;
};

export const getUploadInvalidDriveItemKey = (fileId: string): string => {
  const normalized = normalizeString(fileId);
  return normalized ? `drive:${normalized}` : '';
};

export const findUploadItemByDriveFileId = (
  items: Array<string | File>,
  fileId: string
): string | File | null => {
  const key = getUploadInvalidDriveItemKey(fileId);
  if (!key) return null;
  return items.find(item => getUploadInvalidItemKey(item) === key) || null;
};

export const getUploadInvalidItemError = (
  errors: UploadInvalidItemErrors | undefined,
  item: string | File
): string => {
  const key = getUploadInvalidItemKey(item);
  return key && errors ? errors[key] || '' : '';
};

export const markUploadInvalidItem = (args: {
  errors?: UploadInvalidItemErrors;
  item: string | File;
  message: string;
}): UploadInvalidItemErrors => {
  const key = getUploadInvalidItemKey(args.item);
  if (!key) return args.errors || {};
  return {
    ...(args.errors || {}),
    [key]: args.message
  };
};

export const markUploadInvalidDriveFileId = (args: {
  errors?: UploadInvalidItemErrors;
  fileId: string;
  message: string;
}): UploadInvalidItemErrors => {
  const key = getUploadInvalidDriveItemKey(args.fileId);
  if (!key) return args.errors || {};
  return {
    ...(args.errors || {}),
    [key]: args.message
  };
};

export const filterInvalidUploadItems = (
  items: Array<string | File>,
  errors?: UploadInvalidItemErrors
): Array<string | File> => {
  if (!errors || !Object.keys(errors).length) return items;
  return items.filter(item => !getUploadInvalidItemError(errors, item));
};
