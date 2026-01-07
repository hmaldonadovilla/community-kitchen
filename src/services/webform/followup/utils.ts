import { LineItemGroupConfig, LocalizedString } from '../../../types';

/**
 * Shared helpers for Follow-up template rendering (PDF/email/html) and table directives.
 *
 * Responsibility:
 * - Pure-ish value formatting and placeholder key helpers
 * - Small, reusable utilities (no Drive/Docs side effects)
 */

export const resolveLocalizedValue = (value?: LocalizedString, fallback: string = ''): string => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.en || value.fr || value.nl || fallback;
};

export const resolveSubgroupKey = (sub?: LineItemGroupConfig): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  // Phase 3 (Option A): subgroup IDs are required; label fallback is intentionally removed.
  return '';
};

export const normalizeText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

export const toFiniteNumber = (value: any): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = value.toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const slugifyPlaceholder = (label: string): string => {
  return (label || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
};

export const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const normalizeToIsoDate = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const pad2 = (n: number): string => n.toString().padStart(2, '0');
  // Google Sheets numeric serial dates (roughly 1900 epoch)
  if (typeof value === 'number') {
    const days = Number(value);
    if (days > 30000 && days < 90000) {
      const millis = (days - 25569) * 86400 * 1000; // Excel/Sheets serial to epoch
      return new Date(millis).toISOString().slice(0, 10);
    }
    return undefined;
  }
  if (value instanceof Date) {
    // IMPORTANT:
    // - Date objects coming from Sheets/Docs are often "midnight" in the sheet/script timezone.
    // - Using toISOString() converts to UTC, which can shift the calendar day (e.g. CET -> previous day).
    // Prefer formatting in the script timezone when available, and fall back to local calendar fields.
    try {
      const tz =
        typeof Session !== 'undefined' && (Session as any)?.getScriptTimeZone
          ? (Session as any).getScriptTimeZone()
          : undefined;
      if (tz && typeof Utilities !== 'undefined' && (Utilities as any)?.formatDate) {
        return (Utilities as any).formatDate(value, tz, 'yyyy-MM-dd');
      }
    } catch (_) {
      // ignore, fall back
    }
    const year = value.getFullYear();
    const month = pad2(value.getMonth() + 1);
    const day = pad2(value.getDate());
    return `${year}-${month}-${day}`;
  }
  // Handle date-like strings from Sheets without coercing plain numbers
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // ISO date only: keep as-is to avoid TZ shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // ISO with time
    const isoWithTime = /^\d{4}-\d{2}-\d{2}[T\s].*/.test(trimmed);
    // Common d/m/y or m/d/y with separators
    const dmMatch = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed);
    // Pure numeric serial stored as string
    const numericSerial = /^\d{4,}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (isoWithTime) {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
    if (dmMatch) {
      const [a, b, c] = trimmed.split(/[\/-]/);
      const dayFirst = a.length <= 2 && b.length <= 2;
      const day = dayFirst ? Number(a) : Number(b);
      const month = dayFirst ? Number(b) : Number(a);
      const year = c.length === 2 ? Number(`20${c}`) : Number(c);
      if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
        const utc = Date.UTC(year, month - 1, day);
        return new Date(utc).toISOString().slice(0, 10);
      }
    }
    if (!Number.isNaN(numericSerial) && numericSerial > 30000 && numericSerial < 90000) {
      const millis = (numericSerial - 25569) * 86400 * 1000;
      return new Date(millis).toISOString().slice(0, 10);
    }
  }
  return undefined;
};

export const formatIsoDateLabel = (iso: string): string => {
  const trimmed = (iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed || '';
  const [y, m, d] = trimmed.split('-').map(Number);
  if (!y || !m || !d) return trimmed;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return trimmed;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const dow = days[date.getUTCDay()] || '';
  const mon = months[m - 1] || '';
  return `${dow}, ${pad2(d)}-${mon}-${y}`;
};

export const formatTemplateValue = (value: any, fieldType?: string): string => {
  if (value === undefined || value === null) return '';
  if (fieldType === 'DATE') {
    const iso = normalizeToIsoDate(value);
    if (!iso) return '';
    return formatIsoDateLabel(iso);
  }

  // Boolean readability: show status glyphs instead of "Yes/No" or "true/false".
  // Note: keep numeric 0/1 as numbers unless the field type is explicitly boolean-like.
  const t = (fieldType || '').toString().trim().toUpperCase();
  const isBoolType = new Set(['CHECKBOX', 'BOOLEAN', 'YES_NO', 'YESNO', 'TOGGLE', 'SWITCH']).has(t);
  const bool = (() => {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'number' && isBoolType) {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === 'string') {
      const s = value.trim().toLowerCase();
      if (!s) return null;
      if (isBoolType) {
        if (s === '1') return true;
        if (s === '0') return false;
      }
      const truthy = new Set(['true', 'yes', 'y', 'oui', 'o', 'ja', 'j']);
      const falsy = new Set(['false', 'no', 'n', 'non', 'nee']);
      if (truthy.has(s)) return true;
      if (falsy.has(s)) return false;
    }
    return null;
  })();
  if (bool !== null) return bool ? '✔' : '❌';

  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === 'object') {
      return value
        .map(entry =>
          Object.entries(entry)
            .map(([key, val]) => `${key}: ${val ?? ''}`)
            .join(', ')
        )
        .join('\n');
    }
    return value.map(v => (v ?? '').toString()).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${key}: ${val ?? ''}`)
      .join(', ');
  }
  // Only auto-detect date-like strings when the field type is unknown.
  // For explicit non-date fields (e.g. PARAGRAPH), we must not coerce values and accidentally drop text.
  if (!fieldType) {
    const asIsoDate = normalizeToIsoDate(value);
    if (asIsoDate) return asIsoDate;
  }
  return value.toString();
};

export const buildPlaceholderKeys = (raw: string): string[] => {
  const sanitized = raw || '';
  const segments = sanitized.split('.').map(seg => seg.trim());
  const upper = segments.map(seg => seg.toUpperCase()).join('.');
  const lower = segments.map(seg => seg.toLowerCase()).join('.');
  const title = segments
    .map(seg =>
      seg
        .toLowerCase()
        .split('_')
        .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
        .join('_')
    )
    .join('.');
  return Array.from(new Set([upper, lower, title]));
};

export const addPlaceholderVariants = (
  map: Record<string, string>,
  key: string,
  value: any,
  fieldType?: string,
  formatValue?: (value: any, fieldType?: string) => string
): void => {
  if (!key) return;
  const keys = buildPlaceholderKeys(key);
  const text = formatValue ? formatValue(value, fieldType) : formatTemplateValue(value, fieldType);
  keys.forEach(token => {
    map[`{{${token}}}`] = text;
  });
};

const escapeHtmlText = (value: string): string => {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * HTML template value formatter:
 * - Keep default formatting for most fields.
 * - For PARAGRAPH fields, preserve user-entered line breaks by emitting <br/>.
 *   (Also escapes HTML so user input can't break templates.)
 */
export const formatTemplateValueForHtml = (value: any, fieldType?: string): string => {
  const text = formatTemplateValue(value, fieldType);
  const t = (fieldType || '').toString().trim().toUpperCase();
  if (t !== 'PARAGRAPH') return text;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = escapeHtmlText(normalized);
  return escaped.replace(/\n/g, '<br/>');
};

/**
 * Markdown template value formatter:
 * - Keep default formatting for most fields.
 * - For PARAGRAPH fields, preserve user-entered line breaks using Markdown hard breaks.
 *   Also escapes <, >, & so values can't be interpreted as raw HTML in markdown.
 */
export const formatTemplateValueForMarkdown = (value: any, fieldType?: string): string => {
  const text = formatTemplateValue(value, fieldType);
  const t = (fieldType || '').toString().trim().toUpperCase();
  if (t !== 'PARAGRAPH') return text;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Markdown hard break: two spaces at end of line, then newline.
  return escaped.replace(/\n/g, '  \n');
};

const stripOuterQuotes = (value: string): string => {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
};

const splitFunctionArgs = (raw: string): string[] => {
  const input = (raw || '').toString();
  const args: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
};

const normalizePlaceholderKey = (raw: string): string => {
  let key = (raw || '').toString().trim();
  if (!key) return '';
  // Allow DEFAULT({{FIELD_ID}}, "x") by stripping the outer token braces.
  if (key.startsWith('{{') && key.endsWith('}}')) {
    key = key.slice(2, -2).trim();
  }
  // Tolerate whitespace around dotted paths: "A . B . C" -> "A.B.C"
  key = key
    .split('.')
    .map(seg => seg.trim())
    .filter(Boolean)
    .join('.');
  return key;
};

const resolvePlaceholderValueFromMap = (placeholders: Record<string, string>, keyRaw: string): string => {
  const key = normalizePlaceholderKey(keyRaw);
  if (!key) return '';
  const variants = buildPlaceholderKeys(key);
  for (const v of variants) {
    const token = `{{${v}}}`;
    if (Object.prototype.hasOwnProperty.call(placeholders, token)) {
      return (placeholders[token] ?? '').toString();
    }
  }
  // As a last resort, try raw key without variant transforms.
  const rawToken = `{{${key}}}`;
  if (Object.prototype.hasOwnProperty.call(placeholders, rawToken)) {
    return (placeholders[rawToken] ?? '').toString();
  }
  return '';
};

/**
 * DEFAULT() placeholder function:
 * - Syntax: {{DEFAULT(KEY, "fallback")}}
 * - If KEY resolves to an empty string, renders the fallback value instead.
 *
 * Works in Doc templates (PDF/email), Markdown templates, and HTML templates.
 */
const applyDefaultPlaceholders = (template: string, placeholders: Record<string, string>): string => {
  const DEFAULT_RE = /{{\s*DEFAULT\s*\(\s*([\s\S]*?)\s*\)\s*}}/gi;
  const input = (template || '').toString();
  if (!input.includes('DEFAULT')) return input;
  return input.replace(DEFAULT_RE, (fullMatch: string, innerRaw: string) => {
    const inner = (innerRaw || '').toString().trim();
    if (!inner) return fullMatch;
    const args = splitFunctionArgs(inner);
    if (args.length < 2) return fullMatch;
    const keyArg = stripOuterQuotes(args[0] || '');
    const fallbackArg = stripOuterQuotes(args.slice(1).join(',') || '');
    const current = resolvePlaceholderValueFromMap(placeholders, keyArg);
    if (current && current.toString().trim()) return current;
    return fallbackArg || '';
  });
};

export const applyPlaceholders = (template: string, placeholders: Record<string, string>): string => {
  if (!template) return '';
  let output = applyDefaultPlaceholders(template, placeholders);
  Object.entries(placeholders).forEach(([token, value]) => {
    output = output.replace(new RegExp(escapeRegExp(token), 'g'), value ?? '');
    // Relaxed matcher to tolerate incidental spaces around tokens in the Doc
    if (token.startsWith('{{') && token.endsWith('}}')) {
      const inner = token.slice(2, -2);
      const relaxed = new RegExp(`{{\\s*${escapeRegExp(inner)}\\s*}}`, 'g');
      output = output.replace(relaxed, value ?? '');
    }
  });
  return output;
};


