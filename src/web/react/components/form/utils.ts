import { resolveLocalizedString } from '../../../i18n';
import { FieldValue, LangCode, LineItemGroupUiConfig, WebQuestionDefinition } from '../../../types';
import { ROW_SOURCE_KEY, parseRowSource } from '../../app/lineItems';

export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeExtensions = (extensions?: string[]) =>
  (extensions || []).map(ext => {
    const trimmed = ext.trim();
    return (trimmed.startsWith('.') ? trimmed.slice(1) : trimmed).toLowerCase();
  });

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

export const isFileInstance = (value: unknown): value is File => hasFileCtor() && value instanceof File;

const isFileListInstance = (value: unknown): value is FileList => hasFileListCtor() && value instanceof FileList;

const splitUrlList = (raw: string): string[] => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
  return [trimmed];
};

export const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test((url || '').trim());

export const fileNameFromUrl = (url: string): string => {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'File';
  const noQuery = trimmed.split('?')[0] || trimmed;
  const last = noQuery.split('/').pop() || noQuery;
  try {
    return decodeURIComponent(last) || 'File';
  } catch (_) {
    return last || 'File';
  }
};

export const describeUploadItem = (item: string | File): string => {
  if (typeof item === 'string') return fileNameFromUrl(item);
  return item?.name || 'File';
};

export const toUploadItems = (value: FieldValue): Array<string | File> => {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return splitUrlList(value);
  if (isFileListInstance(value)) return Array.from(value);
  if (!Array.isArray(value)) return [];
  const out: Array<string | File> = [];
  value.forEach(item => {
    if (item === undefined || item === null) return;
    if (isFileInstance(item)) {
      out.push(item);
      return;
    }
    if (typeof item === 'string') {
      splitUrlList(item).forEach(u => out.push(u));
      return;
    }
    if (typeof item === 'object') {
      const url = ((item as any).url || '').toString().trim();
      if (url) out.push(url);
    }
  });
  return out;
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

export const toDateInputValue = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  if (raw instanceof Date) {
    const t = raw.getTime();
    return isNaN(t) ? '' : raw.toISOString().slice(0, 10);
  }
  const s = raw.toString().trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoPrefix) return isoPrefix[1];

  const dm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dm) {
    const a = Number(dm[1]);
    const b = Number(dm[2]);
    const y = Number(dm[3]);
    if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(y)) {
      // Default to DD/MM/YYYY (matches placeholder in UI), but handle obvious MM/DD cases.
      let day = a;
      let month = b;
      if (a <= 12 && b > 12) {
        month = a;
        day = b;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${y}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

export const applyUploadConstraints = (
  question: WebQuestionDefinition,
  existing: Array<string | File>,
  incoming: File[]
): { items: Array<string | File>; errorMessage?: string } => {
  if (!incoming.length) {
    return { items: existing };
  }
  const maxFiles = question.uploadConfig?.maxFiles;
  const allowedExtensions = normalizeExtensions(question.uploadConfig?.allowedExtensions);
  const maxBytes = question.uploadConfig?.maxFileSizeMb ? question.uploadConfig.maxFileSizeMb * 1024 * 1024 : undefined;
  const next = [...existing];
  const errors: string[] = [];
  incoming.forEach(file => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (allowedExtensions.length && !allowedExtensions.includes(ext)) {
      errors.push(`${file.name} is not an allowed file type.`);
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      errors.push(`${file.name} exceeds ${question.uploadConfig?.maxFileSizeMb} MB.`);
      return;
    }
    if (maxFiles && next.length >= maxFiles) {
      errors.push(`Maximum of ${maxFiles} file${maxFiles > 1 ? 's' : ''} reached.`);
      return;
    }
    next.push(file);
  });
  return { items: next, errorMessage: errors.join(' ') || undefined };
};

const asScalarString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first === undefined || first === null ? '' : first.toString().trim();
  }
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  return raw.toString().trim();
};

const asListString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    return raw.map(v => (v === undefined || v === null ? '' : v.toString().trim())).filter(Boolean).join(', ');
  }
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  return raw.toString().trim();
};

const matchesRowCondition = (when: any, rowValues: Record<string, FieldValue>, rowSource: 'auto' | 'manual'): boolean => {
  if (!when || typeof when !== 'object') return true;
  const fieldId = when.fieldId !== undefined && when.fieldId !== null ? when.fieldId.toString().trim() : '';
  if (!fieldId) return true;

  const raw = fieldId === ROW_SOURCE_KEY ? rowSource : (rowValues as any)[fieldId];
  const current = asScalarString(raw);

  if (when.equals !== undefined) {
    const eq = when.equals;
    if (Array.isArray(eq)) return eq.map(v => asScalarString(v)).includes(current);
    return current === asScalarString(eq);
  }

  if (when.greaterThan !== undefined) {
    const a = Number(current);
    const b = Number(asScalarString(when.greaterThan));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a > b;
  }

  if (when.lessThan !== undefined) {
    const a = Number(current);
    const b = Number(asScalarString(when.lessThan));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a < b;
  }

  return true;
};

const interpolateTemplate = (template: string, vars: Record<string, string>): string => {
  if (!template) return '';
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, keyRaw: string) => {
    const key = (keyRaw || '').toString().trim();
    if (!key) return '';
    return vars[key] !== undefined ? vars[key] : '';
  });
};

export const resolveRowDisclaimerText = (args: {
  ui?: LineItemGroupUiConfig;
  language: LangCode;
  rowValues: Record<string, FieldValue>;
  autoGenerated?: boolean;
}): string => {
  const { ui, language, rowValues, autoGenerated } = args;
  const cfgRaw: any = (ui as any)?.rowDisclaimer;
  if (!cfgRaw) return '';

  const rowSource =
    parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]) || (autoGenerated ? 'auto' : 'manual');

  let textSpec: any = cfgRaw;
  const isConfigObject =
    typeof cfgRaw === 'object' &&
    cfgRaw !== null &&
    (Object.prototype.hasOwnProperty.call(cfgRaw, 'template') ||
      Object.prototype.hasOwnProperty.call(cfgRaw, 'cases') ||
      Object.prototype.hasOwnProperty.call(cfgRaw, 'fallback'));
  if (isConfigObject) {
    const cases = Array.isArray((cfgRaw as any).cases) ? (cfgRaw as any).cases : [];
    const match = cases.find((c: any) => c && c.text && matchesRowCondition(c.when, rowValues, rowSource));
    textSpec = match?.text ?? (cfgRaw as any).template ?? (cfgRaw as any).fallback;
  }

  const template = resolveLocalizedString(textSpec, language, '').toString();
  if (!template.trim()) return '';

  const rowSourceLabel =
    rowSource === 'auto'
      ? resolveLocalizedString({ en: 'Auto', fr: 'Auto', nl: 'Auto' }, language, 'Auto')
      : resolveLocalizedString({ en: 'Manual', fr: 'Manuel', nl: 'Handmatig' }, language, 'Manual');

  const vars: Record<string, string> = {
    [ROW_SOURCE_KEY]: rowSource,
    __ckRowSourceLabel: rowSourceLabel
  };

  Object.keys(rowValues || {}).forEach(k => {
    vars[k] = asListString((rowValues as any)[k]);
  });

  return interpolateTemplate(template, vars).trim();
};



