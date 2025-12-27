import { resolveSubgroupKey, normalizeText, escapeRegExp } from './utils';
import { LineItemGroupConfig } from '../../../types';

type SubGroupConfig = LineItemGroupConfig;

export const extractTableRepeatDirective = (
  table: GoogleAppsScript.Document.Table
): { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string } | null => {
  const text = table.getText && table.getText();
  if (!text) return null;
  const match = text.match(/{{(GROUP_TABLE|ROW_TABLE)\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
  if (!match) return null;
  return {
    kind: (match[1] || '').toUpperCase() as 'GROUP_TABLE' | 'ROW_TABLE',
    groupId: match[2].toUpperCase(),
    fieldId: match[3].toUpperCase()
  };
};

export const replaceTableRepeatDirectivePlaceholders = (
  table: GoogleAppsScript.Document.Table,
  directive: { groupId: string; fieldId: string },
  replacementValue: string,
  directiveType: 'GROUP_TABLE' | 'ROW_TABLE'
): void => {
  // IMPORTANT: replaceText() uses regex. We must escape literal "(" / ")" / "." in the directive token.
  const pattern = `(?i){{${directiveType}\\(${directive.groupId}\\.${directive.fieldId}\\)}}`;
  for (let r = 0; r < table.getNumRows(); r++) {
    const tableRow = table.getRow(r);
    for (let c = 0; c < tableRow.getNumCells(); c++) {
      tableRow.getCell(c).replaceText(pattern, replacementValue || '');
    }
  }
};

export const extractConsolidatedTableDirective = (
  table: GoogleAppsScript.Document.Table
): { groupId: string; subGroupId: string } | null => {
  const text = table.getText && table.getText();
  if (!text) return null;
  const match = text.match(/{{CONSOLIDATED_TABLE\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
  if (!match) return null;
  return {
    groupId: match[1].toUpperCase(),
    subGroupId: match[2].toUpperCase()
  };
};

export const stripConsolidatedTableDirectivePlaceholders = (
  table: GoogleAppsScript.Document.Table,
  directive: { groupId: string; subGroupId: string }
): void => {
  if (!table) return;
  const pattern = `(?i){{CONSOLIDATED_TABLE\\(${directive.groupId}\\.${directive.subGroupId}\\)}}`;
  for (let r = 0; r < table.getNumRows(); r++) {
    const tableRow = table.getRow(r);
    for (let c = 0; c < tableRow.getNumCells(); c++) {
      tableRow.getCell(c).replaceText(pattern, '');
    }
  }
};

export const extractOrderByDirective = (
  table: GoogleAppsScript.Document.Table
): { keys: Array<{ key: string; direction: 'asc' | 'desc' }> } | null => {
  const text = table.getText && table.getText();
  if (!text) return null;
  const match = text.match(/{{ORDER_BY\(([^)]*)\)}}/i);
  if (!match) return null;
  const raw = (match[1] || '').toString();
  const keys = parseOrderByKeys(raw);
  return keys.length ? { keys } : null;
};

export const parseOrderByKeys = (raw: string): Array<{ key: string; direction: 'asc' | 'desc' }> => {
  const clause = (raw || '').toString().trim();
  if (!clause) return [];
  const out: Array<{ key: string; direction: 'asc' | 'desc' }> = [];
  clause
    .split(',')
    .map(part => (part || '').toString().trim())
    .filter(Boolean)
    .forEach(part => {
      let token = part.trim();
      let direction: 'asc' | 'desc' = 'asc';

      // Prefix "-" means DESC
      if (token.startsWith('-')) {
        direction = 'desc';
        token = token.slice(1).trim();
      }

      // Suffix "ASC"/"DESC"
      const suffix = token.match(/\s+(ASC|DESC)$/i);
      if (suffix) {
        direction = suffix[1].toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
        token = token.slice(0, token.length - suffix[0].length).trim();
      }

      // Inline delimiter "FIELD:ASC" / "FIELD:DESC"
      const colon = token.match(/^(.*):\s*(ASC|DESC)$/i);
      if (colon) {
        direction = colon[2].toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
        token = (colon[1] || '').toString().trim();
      }

      const normalized = token.toUpperCase().replace(/\s+/g, '');
      // Allow FIELD, GROUP.FIELD, or GROUP.SUBGROUP.FIELD
      if (!/^[A-Z0-9_]+(\.[A-Z0-9_]+){0,2}$/.test(normalized)) return;
      out.push({ key: normalized, direction });
    });
  return out;
};

export const stripOrderByDirectivePlaceholders = (table: GoogleAppsScript.Document.Table): void => {
  if (!table) return;
  // IMPORTANT: replaceText() uses regex.
  const pattern = `(?i){{ORDER_BY\\([^)]*\\)}}`;
  for (let r = 0; r < table.getNumRows(); r++) {
    const tableRow = table.getRow(r);
    for (let c = 0; c < tableRow.getNumCells(); c++) {
      tableRow.getCell(c).replaceText(pattern, '');
    }
  }
};

export const extractExcludeWhenDirective = (
  table: GoogleAppsScript.Document.Table
): { clauses: Array<{ key: string; values: string[] }> } | null => {
  const text = table.getText && table.getText();
  if (!text) return null;
  const match = text.match(/{{EXCLUDE_WHEN\(([^)]*)\)}}/i);
  if (!match) return null;
  const raw = (match[1] || '').toString();
  const clauses = parseExcludeWhenClauses(raw);
  return clauses.length ? { clauses } : null;
};

export const parseExcludeWhenClauses = (raw: string): Array<{ key: string; values: string[] }> => {
  const clause = (raw || '').toString().trim();
  if (!clause) return [];
  const out: Array<{ key: string; values: string[] }> = [];
  clause
    .split(',')
    .map(part => (part || '').toString().trim())
    .filter(Boolean)
    .forEach(part => {
      const eq = part.indexOf('=');
      if (eq <= 0) return;
      const keyRaw = part.slice(0, eq).trim();
      const valueRaw = part.slice(eq + 1).trim();
      if (!keyRaw || !valueRaw) return;
      const key = keyRaw.toUpperCase().replace(/\s+/g, '');
      // Allow FIELD, GROUP.FIELD, or GROUP.SUBGROUP.FIELD
      if (!/^[A-Z0-9_]+(\.[A-Z0-9_]+){0,2}$/.test(key)) return;
      const values = valueRaw
        .split('|')
        .map(v => (v || '').toString().trim())
        .filter(Boolean);
      if (!values.length) return;
      out.push({ key, values });
    });
  return out;
};

export const stripExcludeWhenDirectivePlaceholders = (table: GoogleAppsScript.Document.Table): void => {
  if (!table) return;
  // IMPORTANT: replaceText() uses regex.
  const pattern = `(?i){{EXCLUDE_WHEN\\([^)]*\\)}}`;
  for (let r = 0; r < table.getNumRows(); r++) {
    const tableRow = table.getRow(r);
    for (let c = 0; c < tableRow.getNumCells(); c++) {
      tableRow.getCell(c).replaceText(pattern, '');
    }
  }
};

export const extractSubGroupDirective = (
  table: GoogleAppsScript.Document.Table
): { groupId: string; subGroupId: string } | null => {
  const text = table.getText && table.getText();
  if (!text) return null;
  const match = text.match(/{{([A-Z0-9_]+)\.([A-Z0-9_]+)\.[A-Z0-9_]+}}/i);
  if (!match) return null;
  return {
    groupId: match[1].toUpperCase(),
    subGroupId: match[2].toUpperCase()
  };
};

export const extractLineItemPlaceholders = (
  text: string
): Array<{ groupId: string; subGroupId?: string; fieldId: string }> => {
  const matches: Array<{ groupId: string; subGroupId?: string; fieldId: string }> = [];
  if (!text) return matches;
  const pattern = /{{([A-Z0-9_]+)(?:\.([A-Z0-9_]+))?\.([A-Z0-9_]+)}}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      groupId: match[1].toUpperCase(),
      subGroupId: match[2] ? match[2].toUpperCase() : undefined,
      fieldId: (match[3] || match[2] || '').toUpperCase()
    });
  }

  // ALWAYS_SHOW wrapper: treat inner token as a placeholder so table rendering
  // (and disabled-row pruning) can reason about it.
  //
  // Supported:
  // - {{ALWAYS_SHOW(GROUP.FIELD)}}
  // - {{ALWAYS_SHOW(GROUP.SUBGROUP.FIELD)}}
  // - {{ALWAYS_SHOW(CONSOLIDATED_ROW(GROUP.SUBGROUP.FIELD))}}
  const alwaysShowPattern = /{{ALWAYS_SHOW\(\s*([\s\S]*?)\s*\)}}/gi;
  let am: RegExpExecArray | null;
  while ((am = alwaysShowPattern.exec(text)) !== null) {
    const inner = (am[1] || '').toString().trim();
    if (!inner) continue;

    const consolidatedMatch = inner.match(/^CONSOLIDATED_ROW\(\s*([A-Z0-9_]+\.[A-Z0-9_]+\.[A-Z0-9_]+)\s*\)$/i);
    if (consolidatedMatch) {
      const parts = (consolidatedMatch[1] || '').toString().split('.').map(p => p.trim()).filter(Boolean);
      if (parts.length === 3) {
        // Treat as group-only placeholder so it does NOT trigger subgroup (child-row) rendering.
        matches.push({
          groupId: (parts[0] || '').toString().toUpperCase(),
          subGroupId: undefined,
          fieldId: (parts[2] || '').toString().toUpperCase()
        });
      }
      continue;
    }

    const parts = inner.split('.').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      matches.push({
        groupId: (parts[0] || '').toString().toUpperCase(),
        subGroupId: undefined,
        fieldId: (parts[1] || '').toString().toUpperCase()
      });
      continue;
    }
    if (parts.length === 3) {
      matches.push({
        groupId: (parts[0] || '').toString().toUpperCase(),
        subGroupId: (parts[1] || '').toString().toUpperCase(),
        fieldId: (parts[2] || '').toString().toUpperCase()
      });
      continue;
    }
  }

  // Row-scoped consolidated placeholders should still cause the row to be processed by the table renderer,
  // even when they are the only tokens present in the row.
  // We treat them as "group-only" placeholders so they do NOT trigger subgroup (child-row) rendering.
  const consolidatedRowPattern = /{{CONSOLIDATED_ROW\(([A-Z0-9_]+)\.([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/gi;
  let cm: RegExpExecArray | null;
  while ((cm = consolidatedRowPattern.exec(text)) !== null) {
    matches.push({
      groupId: (cm[1] || '').toString().toUpperCase(),
      subGroupId: undefined,
      fieldId: (cm[3] || '').toString().toUpperCase()
    });
  }

  return matches;
};

export const clearTableRow = (row: GoogleAppsScript.Document.TableRow): void => {
  if (!row) return;
  for (let c = 0; c < row.getNumCells(); c++) {
    const cell = row.getCell(c);
    cell.clear();
  }
};
