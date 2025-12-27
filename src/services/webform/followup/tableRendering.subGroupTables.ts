import { LineItemGroupConfig, QuestionConfig } from '../../../types';
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
  lineItemRows: Record<string, any[]>
): number => {
  const group = groupLookup[directive.groupId];
  if (!group || !group.lineItemConfig?.subGroups?.length) {
    body.removeChild(templateTable);
    return 0;
  }
  const subConfig = group.lineItemConfig.subGroups.find(sub => {
    const key = resolveSubgroupKey(sub as any);
    const normalizedKey = (key || '').toUpperCase();
    const slugKey = slugifyPlaceholder(key || '');
    return normalizedKey === directive.subGroupId || slugKey === directive.subGroupId;
  });
  if (!subConfig) {
    body.removeChild(templateTable);
    return 0;
  }
  const subKey = resolveSubgroupKey(subConfig as any);
  const parentRows = lineItemRows[group.id] || [];
  const orderBy = extractOrderByDirective(templateTable);
  const preserved = templateTable.copy();
  body.removeChild(templateTable);
  let inserted = 0;

  parentRows.forEach(parentRow => {
    const children = Array.isArray((parentRow || {})[subKey]) ? (parentRow as any)[subKey] : [];
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
      const hasSubPlaceholders = placeholders.some(p => p.subGroupId && p.subGroupId.toUpperCase() === directive.subGroupId);

      if (!hasSubPlaceholders) {
        // Parent-level row: replace placeholders once with parent data, keep formatting
        for (let c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          const text = cell.getText();
          const filled = replaceLineItemPlaceholders(text, group, parentRow || {}, {
            subGroup: undefined,
            subGroupToken: undefined
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
            subGroupToken: directive.subGroupId
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


