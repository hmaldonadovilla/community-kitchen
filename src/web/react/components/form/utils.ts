import { resolveLocalizedString } from '../../../i18n';
import { FieldValue, LangCode, LineItemGroupUiConfig, WebQuestionDefinition } from '../../../types';
import type { FormErrors } from '../../types';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  ROW_SOURCE_KEY,
  parseRowSource
} from '../../app/lineItems';
import { tSystem } from '../../../systemStrings';
import { matchesWhenClause } from '../../../rules/visibility';

type TemplateVars = Record<string, string | number | boolean | null | undefined>;

export const formatTemplate = (value: string, vars?: TemplateVars): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

export const formatOptionFilterNonMatchWarning = (args: { language: LangCode; keys: string[] }): string => {
  const keys = (args.keys || []).map(k => (k ?? '').toString().trim()).filter(Boolean);
  if (!keys.length) return '';
  return tSystem('validation.optionFilterMismatch', args.language, 'Does not satisfy: {keys}', {
    keys: keys.join(', ')
  });
};

export type FieldHelperPlacement = 'belowLabel' | 'placeholder';

export const resolveFieldHelperText = (args: {
  ui?: any;
  language: LangCode;
}): { text: string; placement: FieldHelperPlacement } => {
  const ui = args.ui || {};
  const raw = ui.helperText ?? ui.helpText ?? ui.supportingText ?? ui.helper ?? ui.hint;
  const text = raw ? resolveLocalizedString(raw as any, args.language, '').toString().trim() : '';
  const placementRaw = (ui.helperPlacement ?? ui.helperPlacementMode ?? ui.helperPlacementLocation ?? '').toString().trim().toLowerCase();
  const placement: FieldHelperPlacement =
    placementRaw === 'placeholder' || placementRaw === 'control' || placementRaw === 'inside' || placementRaw === 'insidecontrol'
      ? 'placeholder'
      : 'belowLabel';
  return { text, placement };
};

const toInlineDisplayText = (value: unknown, language: LangCode): string => {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return toDateInputValue(value);
  if (Array.isArray(value)) {
    const parts = value
      .map(item => toInlineDisplayText(item, language))
      .map(part => part.trim())
      .filter(Boolean);
    return parts.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? tSystem('common.yes', language, 'Yes') : tSystem('common.no', language, 'No');
  }
  const raw = value.toString().trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(raw)) return toDateInputValue(raw) || raw;
  return raw;
};

export const resolveLineItemTableReadOnlyDisplay = (args: {
  baseValue: unknown;
  field?: { ui?: any } | null;
  rowValues?: Record<string, FieldValue> | null;
  language: LangCode;
}): string => {
  const baseText = toInlineDisplayText(args.baseValue, args.language);
  if (!baseText) return '—';

  const appendFieldId = (args.field?.ui?.readOnlyAppendFieldId || '').toString().trim();
  if (!appendFieldId || !args.rowValues) return baseText;
  const appendRaw = (args.rowValues || {})[appendFieldId];
  const appendText = toInlineDisplayText(appendRaw, args.language);
  if (!appendText) return baseText;

  const hiddenValues = Array.isArray(args.field?.ui?.readOnlyAppendHideValues)
    ? (args.field?.ui?.readOnlyAppendHideValues as any[])
        .map(v => (v !== undefined && v !== null ? v.toString().trim().toLowerCase() : ''))
        .filter(Boolean)
    : [];
  if (hiddenValues.includes(appendText.toLowerCase())) return baseText;

  return `${baseText} (${appendText})`;
};

export const resolveUploadRemainingHelperText = (args: {
  uploadConfig?: any;
  language: LangCode;
  remaining: number;
}): string => {
  const count = Number(args.remaining);
  if (!Number.isFinite(count) || count <= 0) return '';

  const key = count === 1 ? 'remainingOne' : 'remainingMany';
  const helperTextCfg = args.uploadConfig?.helperText;

  const isObject = helperTextCfg && typeof helperTextCfg === 'object' && !Array.isArray(helperTextCfg);
  const hasPerCountKeys = !!isObject && (Object.prototype.hasOwnProperty.call(helperTextCfg, 'remainingOne') || Object.prototype.hasOwnProperty.call(helperTextCfg, 'remainingMany'));

  const customRaw = hasPerCountKeys ? (helperTextCfg as any)[key] : helperTextCfg;
  const customResolved = customRaw ? resolveLocalizedString(customRaw as any, args.language, '') : '';
  const custom = customResolved ? formatTemplate(customResolved, { count }) : '';
  if (custom) return custom;

  return tSystem(
    count === 1 ? 'files.remainingOne' : 'files.remainingMany',
    args.language,
    count === 1 ? 'You can add 1 more photo.' : 'You can add {count} more photos.',
    { count }
  );
};

export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const clearLineItemGroupErrors = (errors: FormErrors, groupId: string): FormErrors => {
  if (!groupId) return errors;
  const prefix = `${groupId}__`;
  const subPrefix = `${groupId}::`;
  const next: FormErrors = {};
  Object.entries(errors || {}).forEach(([key, value]) => {
    if (key === groupId) return;
    if (key.startsWith(prefix) || key.startsWith(subPrefix)) return;
    next[key] = value;
  });
  return next;
};

export const mergeLineItemGroupErrors = (errors: FormErrors, groupId: string, nextErrors: FormErrors): FormErrors => {
  const cleared = clearLineItemGroupErrors(errors || {}, groupId);
  const overlay = nextErrors || {};
  return { ...cleared, ...overlay };
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
  if (!trimmed) return 'Photo';
  const noQuery = trimmed.split('?')[0] || trimmed;
  const last = noQuery.split('/').pop() || noQuery;
  try {
    return decodeURIComponent(last) || 'Photo';
  } catch (_) {
    return last || 'Photo';
  }
};

export const describeUploadItem = (item: string | File): string => {
  if (typeof item === 'string') return fileNameFromUrl(item);
  return item?.name || 'Photo';
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

export const getUploadMinRequired = (args: { uploadConfig?: any; required?: boolean }): number => {
  const raw = args.uploadConfig?.minFiles;
  const n = raw !== undefined && raw !== null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return args.required ? 1 : 0;
};

export const isUploadValueComplete = (args: { value: FieldValue; uploadConfig?: any; required?: boolean }): boolean => {
  const items = toUploadItems(args.value);
  const min = getUploadMinRequired({ uploadConfig: args.uploadConfig, required: args.required });
  if (min > 0) return items.length >= min;
  return items.length > 0;
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

const formatLocalYmd = (d: Date): string => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const toDateInputValue = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? '' : formatLocalYmd(raw);
  }
  const s = raw.toString().trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoPrefix) {
    // Apps Script often serializes DATE cells as ISO timestamps (e.g. "2026-01-02T23:00:00.000Z")
    // depending on spreadsheet/script timezone. Parse as an instant then format to local YYYY-MM-DD.
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? isoPrefix[1] : formatLocalYmd(parsed);
  }

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
  return Number.isNaN(parsed.getTime()) ? '' : formatLocalYmd(parsed);
};

export const applyUploadConstraints = (
  question: WebQuestionDefinition,
  existing: Array<string | File>,
  incoming: File[],
  language: LangCode
): { items: Array<string | File>; errorMessage?: string } => {
  if (!incoming.length) {
    return { items: existing };
  }
  const uploadConfig = question.uploadConfig || ({} as any);
  const maxFiles = uploadConfig?.maxFiles;
  const allowedExtensions = normalizeExtensions(uploadConfig?.allowedExtensions);
  const allowedMimeTypes: string[] = Array.isArray(uploadConfig?.allowedMimeTypes)
    ? (uploadConfig.allowedMimeTypes || [])
        .map((v: any) => (v !== undefined && v !== null ? v.toString().trim().toLowerCase() : ''))
        .filter(Boolean)
    : [];
  const maxBytes = uploadConfig?.maxFileSizeMb ? uploadConfig.maxFileSizeMb * 1024 * 1024 : undefined;
  const next = [...existing];
  const errors: string[] = [];

  const resolveUploadError = (args: {
    custom?: any;
    systemKey: string;
    fallback: string;
    vars?: TemplateVars;
  }): string => {
    const customText = args.custom ? resolveLocalizedString(args.custom, language, '') : '';
    if (customText) return formatTemplate(customText, args.vars);
    return tSystem(args.systemKey, language, args.fallback, args.vars);
  };

  const matchesAllowedMime = (mime: string): boolean => {
    const m = (mime || '').toString().trim().toLowerCase();
    if (!m) return false;
    return allowedMimeTypes.some((allowed: string) => {
      const a = (allowed || '').toString().trim().toLowerCase();
      if (!a) return false;
      if (a.endsWith('/*')) {
        const prefix = a.slice(0, -1); // keep trailing slash
        return m.startsWith(prefix);
      }
      return m === a;
    });
  };

  const isAllowedType = (file: File): boolean => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const byExt = allowedExtensions.length ? allowedExtensions.includes(ext) : false;
    const byMime = allowedMimeTypes.length ? matchesAllowedMime(file.type || '') : false;
    if (!allowedExtensions.length && !allowedMimeTypes.length) return true;
    // Treat extension and MIME lists as OR to be resilient across platforms.
    return byExt || byMime;
  };

  incoming.forEach(file => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!isAllowedType(file)) {
      const allowedDisplay = allowedExtensions.map(e => (e.startsWith('.') ? e : `.${e}`));
      errors.push(
        resolveUploadError({
          custom: uploadConfig?.errorMessages?.fileType,
          systemKey: 'files.error.fileType',
          fallback: '{name} is not an allowed photo type.',
          vars: {
            name: file.name,
            ext: ext || '',
            exts: allowedDisplay.join(', '),
            type: (file.type || '').toString(),
            types: allowedMimeTypes.join(', ')
          }
        })
      );
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      errors.push(
        resolveUploadError({
          custom: uploadConfig?.errorMessages?.maxFileSizeMb,
          systemKey: 'files.error.maxFileSizeMb',
          fallback: '{name} exceeds {mb} MB.',
          vars: { name: file.name, mb: uploadConfig?.maxFileSizeMb ?? '' }
        })
      );
      return;
    }
    if (maxFiles && next.length >= maxFiles) {
      errors.push(
        resolveUploadError({
          custom: uploadConfig?.errorMessages?.maxFiles,
          systemKey: 'files.error.maxFiles',
          fallback: 'Maximum of {max} photo{plural} reached.',
          vars: { max: maxFiles, plural: maxFiles > 1 ? 's' : '' }
        })
      );
      return;
    }
    next.push(file);
  });
  return { items: next, errorMessage: errors.join(' · ') || undefined };
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

const matchesRowCondition = (
  when: any,
  rowValues: Record<string, FieldValue>,
  rowSource: 'auto' | 'manual',
  getValue?: (fieldId: string) => FieldValue
): boolean => {
  if (!when) return true;
  try {
    const ctx: any = {
      getValue: (fieldIdRaw: string) => {
        const fid = fieldIdRaw !== undefined && fieldIdRaw !== null ? fieldIdRaw.toString().trim() : '';
        if (!fid) return undefined;
        if (fid === ROW_SOURCE_KEY) return rowSource as any;
        // Row metadata should always be evaluated against the current row only (never via global fallback),
        // otherwise values from other rows (or cross-row scans) can incorrectly match.
        if (
          fid === ROW_SELECTION_EFFECT_ID_KEY ||
          fid === ROW_PARENT_ROW_ID_KEY ||
          fid === ROW_PARENT_GROUP_ID_KEY ||
          fid === ROW_HIDE_REMOVE_KEY
        ) {
          return Object.prototype.hasOwnProperty.call(rowValues || {}, fid) ? (rowValues as any)[fid] : undefined;
        }
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
        return typeof getValue === 'function' ? getValue(fid) : undefined;
      }
    };
    return matchesWhenClause(when as any, ctx);
  } catch (_) {
    // Fail open for safety (disclaimer conditions should never break rendering)
    return true;
  }
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
  getValue?: (fieldId: string) => FieldValue;
}): string => {
  const { ui, language, rowValues, autoGenerated, getValue } = args;
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
    const match = cases.find((c: any) => c && c.text && matchesRowCondition(c.when, rowValues, rowSource, getValue));
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
