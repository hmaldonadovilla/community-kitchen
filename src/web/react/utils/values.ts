import { FieldValue } from '../../types';

const hasFileCtor = (): boolean => {
  try {
    return typeof File !== 'undefined';
  } catch (_) {
    return false;
  }
};

const hasFileListCtor = (): boolean => {
  try {
    return typeof FileList !== 'undefined';
  } catch (_) {
    return false;
  }
};

export const isEmptyValue = (value: FieldValue): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return false;
  if (Array.isArray(value)) return value.length === 0;
  if (hasFileListCtor() && value instanceof FileList) {
    return value.length === 0;
  }
  return false;
};

export const toFileArray = (value: FieldValue): File[] => {
  if (!Array.isArray(value) || !hasFileCtor()) return [];
  return value.filter((item): item is File => item instanceof File);
};

