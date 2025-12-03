import { DedupRule, LocalizedString } from '../types';

export interface ExistingRecord {
  id?: string;
  values: Record<string, any>;
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
      const message = row[5] || undefined;
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
  const base = Array.isArray(val) ? val.join('|') : val.toString();
  return mode === 'caseInsensitive' ? base.toLowerCase() : base;
}

function resolveMessage(message: LocalizedString | undefined, language?: string): string {
  if (!message) return 'Duplicate record.';
  if (typeof message === 'string') return message;
  const key = (language || 'en').toString().toLowerCase();
  return (message as any)[key] || (message as any).en || 'Duplicate record.';
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
  if (!rules || !rules.length) return undefined;
  for (const rule of rules) {
    const mode = rule.matchMode || 'exact';
    const keys = rule.keys || [];
    if (!keys.length) continue;
    const incomingKey = keys.map(k => normalize(candidate.values[k], mode)).join('||');
    if (!incomingKey) continue;
    for (const record of existing) {
      if (candidate.id && record.id && candidate.id === record.id) continue;
      const existingKey = keys.map(k => normalize(record.values[k], mode)).join('||');
      if (!existingKey) continue;
      if (incomingKey === existingKey) {
        const onConflict = rule.onConflict || 'reject';
        if (onConflict === 'reject') {
          return resolveMessage(rule.message, language);
        }
        if (onConflict === 'ignore') {
          return undefined;
        }
        // merge not implemented; treat as reject
        return resolveMessage(rule.message, language);
      }
    }
  }
  return undefined;
}
