import { LineItemGroupConfig, QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { resolveSubgroupKey, slugifyPlaceholder } from './utils';
import {
  clearTableRow,
  extractLineItemPlaceholders,
  extractOrderByDirective,
  stripOrderByDirectivePlaceholders
} from './tableDirectives';
import { applyOrderBy } from './tableConsolidation';
import { replaceLineItemPlaceholders } from './lineItemPlaceholders';

type SubGroupConfig = LineItemGroupConfig;

export const renderSubGroupTables = (
  body: GoogleAppsScript.Document.Body,
  childIndex: number,
  templateTable: GoogleAppsScript.Document.Table,
  directive: { groupId: string; subGroupId: string },
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>,
  opts?: { dataSources?: DataSourceService; language?: string }
): number => {
  const dataSources = opts?.dataSources;
  const language = opts?.language;
  const group = groupLookup[directive.groupId];
  if (!group || !group.lineItemConfig?.subGroups?.length) {
    body.removeChild(templateTable);
    return 0;
  }
  const resolveSubPath = (pathTokens: string[]): { config: SubGroupConfig; keyPath: string[] } | null => {
    let current: any = group.lineItemConfig;
    const keyPath: string[] = [];
    for (let i = 0; i < pathTokens.length; i += 1) {
      const token = pathTokens[i];
      const subs = (current?.subGroups || []) as any[];
      const match = subs.find(sub => {
        const key = resolveSubgroupKey(sub as any);
        const normalizedKey = (key || '').toUpperCase();
        const slugKey = slugifyPlaceholder(key || '');
        return normalizedKey === token || slugKey === token;
      });
      if (!match) return null;
      const resolvedKey = resolveSubgroupKey(match as any);
      if (!resolvedKey) return null;
      keyPath.push(resolvedKey);
      if (i === pathTokens.length - 1) {
        return { config: match as SubGroupConfig, keyPath };
      }
      current = match;
    }
    return null;
  };

  const pathTokens = directive.subGroupId.split('.').map(seg => seg.trim().toUpperCase()).filter(Boolean);
  const resolved = resolveSubPath(pathTokens);
  const subConfig = resolved?.config;
  if (!subConfig) {
    body.removeChild(templateTable);
    return 0;
  }
  const parentRows = lineItemRows[group.id] || [];
  const orderBy = extractOrderByDirective(templateTable);
  const preserved = templateTable.copy();
  body.removeChild(templateTable);
  let inserted = 0;

  const collectChildren = (parentRow: any): any[] => {
    if (!resolved?.keyPath.length) return [];
    let current: any[] = [parentRow];
    resolved.keyPath.forEach(key => {
      const next: any[] = [];
      current.forEach(row => {
        const children = Array.isArray((row || {})[key]) ? (row as any)[key] : [];
        children.forEach((child: any) => next.push(child || {}));
      });
      current = next;
    });
    return current;
  };

  parentRows.forEach(parentRow => {
    const children = collectChildren(parentRow);
    if (!children.length) return;
    const newTable = body.insertTable(childIndex + inserted, preserved.copy());
    if (orderBy && orderBy.keys.length) {
      stripOrderByDirectivePlaceholders(newTable);
    }

    let r = 0;
    while (r < newTable.getNumRows()) {
      const row = newTable.getRow(r);
      const rowTextParts: string[] = [];
      for (let c = 0; c < row.getNumCells(); c++) {
        rowTextParts.push(row.getCell(c).getText() || '');
      }
      const placeholders = extractLineItemPlaceholders(rowTextParts.join(' '));
      const hasSubPlaceholders = placeholders.some(
        p => p.subGroupId && p.subGroupId.toUpperCase() === directive.subGroupId
      );

      if (!hasSubPlaceholders) {
        // Parent-level row: replace placeholders once with parent data, keep formatting
        for (let c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          const text = cell.getText();
          const filled = replaceLineItemPlaceholders(text, group, parentRow || {}, {
            subGroup: undefined,
            subGroupToken: undefined,
            dataSources,
            language
          });
          cell.clear();
          cell.appendParagraph(filled || '');
        }
        r += 1;
        continue;
      }

      if (!children.length) {
        clearTableRow(row);
        r += 1;
        continue;
      }

      // Duplicate this row for each child using a pristine template copy
      const templateRow = row.copy().asTableRow();
      const insertAt = r;
      newTable.removeRow(r);
      const orderedChildren =
        orderBy && orderBy.keys.length
          ? applyOrderBy({ rows: children, orderBy, group, opts: { subConfig: subConfig as any, subToken: directive.subGroupId } })
          : children;
      orderedChildren.forEach((child: any, childIdx: number) => {
        const dataRow = { __parent: parentRow, ...(parentRow || {}), ...(child || {}) };
        const targetRow = newTable.insertTableRow(insertAt + childIdx, templateRow.copy().asTableRow());
        for (let c = 0; c < targetRow.getNumCells(); c++) {
          const cell = targetRow.getCell(c);
          const text = cell.getText();
          const filled = replaceLineItemPlaceholders(text, group, dataRow, {
            subGroup: subConfig as any,
          subGroupToken: directive.subGroupId,
          dataSources,
          language
          });
          while (cell.getNumChildren() > 0) {
            cell.removeChild(cell.getChild(0));
          }
          cell.appendParagraph(filled || '');
        }
      });
      // Skip past inserted rows
      r = insertAt + orderedChildren.length;
    }
    inserted += 1;
  });

  return inserted;
};


