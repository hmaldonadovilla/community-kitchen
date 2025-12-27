import { QuestionConfig } from '../../../types';
import { formatTemplateValue, normalizeText } from './utils';
import { extractOrderByDirective, replaceTableRepeatDirectivePlaceholders } from './tableDirectives';
import { applyOrderBy } from './tableConsolidation';
import { renderTableRows } from './tableRendering.rows';

export const renderGroupedLineItemTables = (
  body: GoogleAppsScript.Document.Body,
  childIndex: number,
  templateTable: GoogleAppsScript.Document.Table,
  directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string },
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>
): number => {
  const group = groupLookup[directive.groupId];
  if (!group) {
    body.removeChild(templateTable);
    return 0;
  }
  const rows = lineItemRows[group.id] || [];
  const groupedValues = collectGroupFieldValues(rows, directive.fieldId);
  const preservedTemplate = templateTable.copy();
  body.removeChild(templateTable);
  if (!groupedValues.length) {
    return 0;
  }
  groupedValues.forEach((groupValue, idx) => {
    const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
    replaceTableRepeatDirectivePlaceholders(newTable, directive, groupValue, 'GROUP_TABLE');
    const filteredRows = rows.filter(row => {
      const raw = row?.[directive.fieldId] ?? '';
      return normalizeText(raw) === normalizeText(groupValue);
    });
    renderTableRows(newTable, groupLookup, lineItemRows, { groupId: group.id, rows: filteredRows });
  });
  return groupedValues.length;
};

export const renderRowLineItemTables = (
  body: GoogleAppsScript.Document.Body,
  childIndex: number,
  templateTable: GoogleAppsScript.Document.Table,
  directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string },
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>
): number => {
  const group = groupLookup[directive.groupId];
  if (!group) {
    body.removeChild(templateTable);
    return 0;
  }
  const rows = lineItemRows[group.id] || [];
  const orderBy = extractOrderByDirective(templateTable);
  const preservedTemplate = templateTable.copy();
  body.removeChild(templateTable);
  if (!rows.length) {
    return 0;
  }
  const orderedRows =
    orderBy && orderBy.keys.length
      ? applyOrderBy({ rows, orderBy, group, opts: { subConfig: undefined, subToken: undefined } })
      : rows;
  orderedRows.forEach((rowData, idx) => {
    const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
    const titleFieldCfg = (group.lineItemConfig?.fields || []).find(
      f => ((f as any)?.id || '').toString().toUpperCase() === (directive.fieldId || '').toString().toUpperCase()
    ) as any;
    const title = formatTemplateValue(rowData?.[directive.fieldId] ?? '', titleFieldCfg?.type);
    replaceTableRepeatDirectivePlaceholders(newTable, directive, title, 'ROW_TABLE');
    // Render this table for exactly one parent row (so the key/value rows don't duplicate when titles repeat).
    renderTableRows(newTable, groupLookup, lineItemRows, { groupId: group.id, rows: [rowData] });
  });
  return orderedRows.length;
};

const collectGroupFieldValues = (rows: any[], fieldId: string): string[] => {
  if (!rows || !rows.length) return [];
  const seen = new Set<string>();
  const order: string[] = [];
  rows.forEach(row => {
    const raw = row?.[fieldId];
    const normalized = normalizeText(raw);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    order.push(raw ?? '');
  });
  return order;
};


