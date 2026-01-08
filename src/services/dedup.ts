import { DedupRule, LocalizedString } from '../types';

export interface ExistingRecord {
  id?: string;
  rowNumber?: number;
  values: Record<string, any>;
}

export interface DedupConflict {
  ruleId: string;
  message: string;
  existingRecordId?: string;
  existingRowNumber?: number;
}

/**
 * Load dedup rules from the config sheet.
 */
export function loadDedupRules(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  configSheetName: string
): DedupRule[] {
  const sheetName = `${configSheetName} Dedup`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, Math.max(6, sheet.getLastColumn())).getValues();
  const parseLocalizedString = (raw: any): LocalizedString | undefined => {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'object') return raw as any;
    const s = raw.toString().trim();
    if (!s) return undefined;
    // Support entering LocalizedString JSON directly in the sheet cell, e.g. {"en":"...","fr":"..."}.
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') return parsed as any;
      } catch (_) {
        // fall through to treat as plain string
      }
    }
    return s;
  };

  return data
    .map(row => {
      const id = (row[0] || '').toString().trim();
      if (!id) return null;
      const scope = (row[1] || 'form').toString().trim() || 'form';
      const keysRaw = (row[2] || '').toString();
      const keys = keysRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
      const matchMode = ((row[3] || 'exact').toString().toLowerCase() === 'caseinsensitive') ? 'caseInsensitive' : 'exact';
      const onConflictRaw = (row[4] || 'reject').toString().toLowerCase();
      const onConflict = onConflictRaw === 'ignore' || onConflictRaw === 'merge' ? onConflictRaw : 'reject';
      const message = parseLocalizedString(row[5]);
      return {
        id,
        scope,
        keys,
        matchMode: matchMode as DedupRule['matchMode'],
        onConflict: onConflict as DedupRule['onConflict'],
        message
      };
    })
    .filter(Boolean) as DedupRule[];
}

function normalize(val: any, mode: 'exact' | 'caseInsensitive'): string {
  if (val === null || val === undefined) return '';
  const normalizeDate = (d: Date): string => {
    // Use script timezone when available to avoid UTC day-shift for DATE cells.
    try {
      if (typeof Utilities !== 'undefined' && Utilities?.formatDate && typeof Session !== 'undefined' && Session?.getScriptTimeZone) {
        return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    } catch (_) {
      // fall back below
    }
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const base = (() => {
    if (val instanceof Date) return normalizeDate(val);
    if (Array.isArray(val)) {
      return val
        .map(v => {
          if (v instanceof Date) return normalizeDate(v);
          if (v === null || v === undefined) return '';
          return v.toString().trim();
        })
        .join('|');
    }
    return val.toString().trim();
  })();

  return mode === 'caseInsensitive' ? base.toLowerCase() : base;
}

function resolveMessage(message: LocalizedString | undefined, language?: string): string {
  if (!message) return 'Duplicate record.';
  const normalized: LocalizedString | undefined = (() => {
    if (typeof message !== 'string') return message;
    const s = message.toString().trim();
    if (!s) return undefined;
    // Handle the common case where LocalizedString is stored as JSON text in the sheet.
    if (s.startsWith('{') && s.endsWith('}')) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') return parsed as any;
      } catch (_) {
        // keep as plain string
      }
    }
    return s;
  })();
  if (!normalized) return 'Duplicate record.';
  if (typeof normalized === 'string') return normalized;
  const key = (language || 'en').toString().toLowerCase();
  return (normalized as any)[key] || (normalized as any).en || 'Duplicate record.';
}

/**
 * Evaluate dedup rules against existing records. Returns an error message when a conflict is found.
 */
export function evaluateDedupConflict(
  rules: DedupRule[] | undefined,
  candidate: ExistingRecord,
  existing: ExistingRecord[],
  language?: string
): string | undefined {
  const found = findDedupConflict(rules, candidate, existing, language);
  return found?.message;
}

/**
 * Like `evaluateDedupConflict`, but returns additional metadata useful for UI prechecks (rule id + existing record id).
 */
export function findDedupConflict(
  rules: DedupRule[] | undefined,
  candidate: ExistingRecord,
  existing: ExistingRecord[],
  language?: string
): DedupConflict | undefined {
  if (!rules || !rules.length) return undefined;
  for (const rule of rules) {
    const mode = rule.matchMode || 'exact';
    const keys = rule.keys || [];
    if (!keys.length) continue;
    const incomingParts = keys.map(k => normalize(candidate.values[k], mode));
    // Only enforce dedup once ALL keys are present (avoid blocking "blank" records where some keys are empty).
    if (incomingParts.some(p => !p || !p.toString().trim())) continue;
    const incomingKey = incomingParts.join('||');
    for (const record of existing) {
      if (candidate.id && record.id && candidate.id === record.id) continue;
      const existingParts = keys.map(k => normalize(record.values[k], mode));
      if (existingParts.some(p => !p || !p.toString().trim())) continue;
      const existingKey = existingParts.join('||');
      if (incomingKey === existingKey) {
        const onConflict = rule.onConflict || 'reject';
        if (onConflict === 'ignore') {
          return undefined;
        }
        // merge not implemented; treat as reject
        return {
          ruleId: rule.id,
          message: resolveMessage(rule.message, language),
          existingRecordId: record.id,
          existingRowNumber: record.rowNumber
        };
      }
    }
  }
  return undefined;
}

/**
 * Compute the normalized dedup signature string for a given rule + values.
 *
 * This is used by indexed dedup implementations so they match the same semantics as `findDedupConflict`:
 * - caseInsensitive uses lowercased tokens
 * - DATE cells normalize to yyyy-MM-dd in script timezone when possible
 * - arrays join with '|'
 * - returns null when any required key is empty (dedup not enforced yet)
 */
export function computeDedupSignature(rule: DedupRule, values: Record<string, any>): string | null {
  if (!rule) return null;
  const mode = rule.matchMode || 'exact';
  const keys = rule.keys || [];
  if (!keys.length) return null;
  const parts = keys.map(k => normalize((values || {})[k], mode as any));
  if (parts.some(p => !p || !p.toString().trim())) return null;
  return parts.join('||');
}
