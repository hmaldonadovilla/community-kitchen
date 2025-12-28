import { QuestionConfig } from '../../types';

/**
 * Canonical record schema helpers.
 *
 * Key idea:
 * - Display labels are presentation only.
 * - Stable IDs are canonical keys (for storage, lookups, templates).
 *
 * Spreadsheet convention (Option 1b / DS-A):
 * - Header cells should be formatted as: `Label [ID]`
 * - We parse the bracket token as the canonical key, while keeping the label for readability.
 */

export interface ParsedHeaderKey {
  raw: string;
  label: string;
  /** Canonical key extracted from `[KEY]` (if present). */
  key?: string;
}

const BRACKET_KEY_RE = /^(.*?)\s*\[([^[\]]+)\]\s*$/;

export function normalizeHeaderToken(raw: string): string {
  return (raw || '').toString().trim().toLowerCase();
}

/**
 * Repair accidental nesting produced by older/broken header formatting.
 *
 * Example:
 *   "Meal Production ID [MP_ID] [Meal Production ID [MP_ID]]"
 * becomes:
 *   "Meal Production ID [MP_ID]"
 */
export function sanitizeHeaderCellText(rawHeader: string): string {
  const raw = (rawHeader || '').toString().trim();
  if (!raw) return '';

  // Detect pattern: "<prefix> [<prefix>]" (case-insensitive).
  // This happens when the already-formatted header was accidentally used as the bracket key.
  if (raw.endsWith(']')) {
    const lastOpen = raw.lastIndexOf('[');
    if (lastOpen > 0) {
      const outerPrefix = raw.slice(0, lastOpen).trim();
      const innerToken = raw.slice(lastOpen + 1, -1).trim();
      if (outerPrefix && innerToken && normalizeHeaderToken(outerPrefix) === normalizeHeaderToken(innerToken)) {
        return outerPrefix;
      }
    }
  }

  return raw;
}

export function parseHeaderKey(rawHeader: string): ParsedHeaderKey {
  const raw = sanitizeHeaderCellText(rawHeader);
  if (!raw) return { raw: '', label: '' };
  const match = BRACKET_KEY_RE.exec(raw);
  if (!match) return { raw, label: raw };
  const label = (match[1] || '').toString().trim();
  const key = (match[2] || '').toString().trim();
  return { raw, label, key: key || undefined };
}

export function formatHeaderLabelWithId(label: string, id: string): string {
  const rawLabel = sanitizeHeaderCellText(label);
  const rawId = sanitizeHeaderCellText(id);

  // If callers mistakenly pass an already-formatted "Label [ID]" as the id,
  // extract the bracket key so we don't nest headers.
  const parsedId = parseHeaderKey(rawId);
  const idKey = (parsedId.key || rawId || '').toString().trim();
  if (!idKey) return rawLabel || '';

  // If the label already ends with the same bracket key, keep it stable and avoid double-wrapping.
  const parsedLabel = parseHeaderKey(rawLabel);
  if (parsedLabel.key && normalizeHeaderToken(parsedLabel.key) === normalizeHeaderToken(idKey)) {
    const base = (parsedLabel.label || '').toString().trim() || (rawLabel || idKey);
    return `${base} [${idKey}]`;
  }

  const prefix = (rawLabel || idKey).toString().trim();
  return `${prefix} [${idKey}]`;
}

export interface RecordFieldSchema {
  id: string;
  label: string;
  header: string;
}

/**
 * Canonical definition of how a form record is represented in the destination “Responses” sheet.
 * (Used by writers/readers to ensure stable column keys.)
 */
export function buildResponsesRecordSchema(questions: QuestionConfig[]): RecordFieldSchema[] {
  return questions
    .filter(q => q && q.type !== 'BUTTON')
    .map(q => {
      const label = (q.qEn || q.id || '').toString();
      return {
        id: (q.id || '').toString(),
        label,
        header: formatHeaderLabelWithId(label, q.id)
      };
    })
    .filter(f => !!f.id);
}


