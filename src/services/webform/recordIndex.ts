import { DedupRule } from '../../types';
import { CacheEtagManager } from './cache';

/**
 * Record index sheet (per destination tab).
 *
 * Responsibility:
 * - Provide a fast, scan-free (no getValues over 100k rows) way to:
 *   - resolve record id -> rowNumber
 *   - read/write record dataVersion
 *   - store per-rule dedup signatures for indexed duplicate checks
 *
 * Design:
 * - Index sheet rows align with destination sheet row numbers:
 *   - Index row N corresponds to destination row N
 * - This makes updates O(1): we can write index row by rowNumber directly.
 */

export type RecordIndexColumns = {
  recordId: number;
  rowNumber: number;
  dataVersion: number;
  updatedAtIso: number;
  createdAtIso: number;
  dedupByRuleId: Record<string, number>;
  headerWidth: number;
};

const INDEX_PREFIX = '__CK_INDEX__';

const normalizeSheetNamePart = (raw: string): string => {
  // Google Sheets sheet name restrictions are close to Excel's:
  // cannot contain: : \ / ? * [ ]
  return (raw || '')
    .toString()
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const digestShort = (raw: string): string => {
  try {
    if (
      typeof Utilities !== 'undefined' &&
      (Utilities as any).computeDigest &&
      (Utilities as any).base64Encode &&
      (Utilities as any).DigestAlgorithm
    ) {
      const bytes = (Utilities as any).computeDigest((Utilities as any).DigestAlgorithm.MD5, raw);
      return (Utilities as any).base64Encode(bytes).replace(/=+$/, '').slice(0, 10);
    }
  } catch (_) {
    // ignore
  }
  // Fallback: use CacheEtagManager's safe truncation behavior.
  try {
    return new CacheEtagManager(null, null).digestKey(raw).slice(0, 10);
  } catch (_) {
    return Math.random().toString(16).slice(2, 10);
  }
};

export const getRecordIndexSheetName = (destinationTab: string): string => {
  const base = normalizeSheetNamePart(destinationTab || 'Responses') || 'Responses';
  const suffix = digestShort(destinationTab || base);
  // Keep name short and stable.
  const head = base.length > 40 ? base.slice(0, 40).trim() : base;
  return `${INDEX_PREFIX}${head}__${suffix}`;
};

const ensureHeader = (sheet: GoogleAppsScript.Spreadsheet.Sheet, headers: string[]): RecordIndexColumns => {
  const baseHeaders = ['Record ID', 'Row', 'Data Version', 'Updated At (ISO)', 'Created At (ISO)'];
  const desired = [...baseHeaders, ...headers];
  const currentLastCol = Math.max(sheet.getLastColumn(), 1);
  const currentRow = sheet.getRange(1, 1, 1, currentLastCol).getValues()[0] || [];
  const current = currentRow.map(v => (v || '').toString().trim());
  const needs = desired.length !== current.length || desired.some((h, idx) => h !== (current[idx] || ''));
  if (needs) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]).setFontWeight('bold');
  }
  const dedupByRuleId: Record<string, number> = {};
  headers.forEach((h, idx) => {
    // baseHeaders length is 5
    const colIdx = 6 + idx;
    const match = /^DEDUP:([^\s]+)\s*$/.exec(h);
    if (match && match[1]) {
      dedupByRuleId[match[1]] = colIdx;
    }
  });
  return {
    recordId: 1,
    rowNumber: 2,
    dataVersion: 3,
    updatedAtIso: 4,
    createdAtIso: 5,
    dedupByRuleId,
    headerWidth: desired.length
  };
};

const normalizeRuleId = (raw: any): string => {
  const id = (raw || '').toString().trim();
  // Keep index header stable: avoid spaces.
  return id.replace(/\s+/g, '_');
};

export const ensureRecordIndexSheet = (ss: GoogleAppsScript.Spreadsheet.Spreadsheet, destinationTab: string, rules?: DedupRule[]) => {
  const name = getRecordIndexSheetName(destinationTab);
  let sheet = ss.getSheetByName(name);
  let created = false;
  if (!sheet) {
    sheet = ss.insertSheet(name);
    created = true;
  }

  // Dedup signature columns (one per reject rule).
  const dedupHeaders: string[] = [];
  (rules || [])
    .filter(r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form')
    .forEach(r => {
      const ruleId = normalizeRuleId(r.id);
      if (!ruleId) return;
      dedupHeaders.push(`DEDUP:${ruleId}`);
    });
  const uniqueDedup = Array.from(new Set(dedupHeaders));
  const cols = ensureHeader(sheet, uniqueDedup);

  // Keep index sheets hidden from casual users.
  try {
    if (created && typeof (sheet as any).hideSheet === 'function') {
      (sheet as any).hideSheet();
    }
  } catch (_) {
    // ignore
  }

  return { sheet, columns: cols, sheetName: name };
};

export const findRowNumberInRecordIndex = (
  indexSheet: GoogleAppsScript.Spreadsheet.Sheet,
  recordId: string
): number => {
  const id = (recordId || '').toString().trim();
  if (!id) return -1;
  const lastRow = indexSheet.getLastRow();
  const dataRows = Math.max(0, lastRow - 1);
  if (dataRows <= 0) return -1;
  try {
    const range = indexSheet.getRange(2, 1, dataRows, 1);
    const finder = (range as any).createTextFinder ? (range as any).createTextFinder(id) : null;
    if (finder && typeof finder.matchEntireCell === 'function') {
      const match = finder.matchEntireCell(true).findNext();
      if (match && typeof match.getRow === 'function') {
        return match.getRow();
      }
    }
  } catch (_) {
    // ignore
  }
  // Fallback: small scan (tests)
  try {
    const values = indexSheet.getRange(2, 1, dataRows, 1).getValues();
    const idx = values.findIndex(r => (r[0] || '').toString() === id);
    return idx >= 0 ? 2 + idx : -1;
  } catch (_) {
    return -1;
  }
};

export const readDataVersionFromRecordIndex = (
  indexSheet: GoogleAppsScript.Spreadsheet.Sheet,
  rowNumber: number,
  columns: RecordIndexColumns
): number | null => {
  const row = Number(rowNumber);
  if (!Number.isFinite(row) || row < 2) return null;
  try {
    const raw = indexSheet.getRange(row, columns.dataVersion, 1, 1).getValues()[0][0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
};

export const writeRecordIndexRow = (args: {
  indexSheet: GoogleAppsScript.Spreadsheet.Sheet;
  columns: RecordIndexColumns;
  rowNumber: number;
  recordId: string;
  dataVersion: number;
  updatedAtIso?: string;
  createdAtIso?: string;
  dedupSignatures?: Record<string, string>;
}): void => {
  const { indexSheet, columns, rowNumber, recordId, dataVersion, updatedAtIso, createdAtIso, dedupSignatures } = args;
  const row = Number(rowNumber);
  if (!Number.isFinite(row) || row < 2) return;

  const width = columns.headerWidth;
  const rowValues = new Array(width).fill('');
  rowValues[columns.recordId - 1] = (recordId || '').toString();
  rowValues[columns.rowNumber - 1] = row;
  rowValues[columns.dataVersion - 1] = Number.isFinite(Number(dataVersion)) ? Number(dataVersion) : '';
  rowValues[columns.updatedAtIso - 1] = (updatedAtIso || '').toString();
  rowValues[columns.createdAtIso - 1] = (createdAtIso || '').toString();
  if (dedupSignatures) {
    Object.entries(dedupSignatures).forEach(([ruleIdRaw, sig]) => {
      const ruleId = normalizeRuleId(ruleIdRaw);
      const col = columns.dedupByRuleId[ruleId];
      if (!col) return;
      rowValues[col - 1] = (sig || '').toString();
    });
  }

  try {
    indexSheet.getRange(row, 1, 1, width).setValues([rowValues]);
  } catch (_) {
    // ignore
  }
};

