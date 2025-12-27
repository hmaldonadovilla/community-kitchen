import { QuestionConfig } from '../../../types';
import { extractConsolidatedTableDirective, extractSubGroupDirective, extractTableRepeatDirective } from './tableDirectives';
import { renderGroupedLineItemTables, renderRowLineItemTables } from './tableRendering.repeatTables';
import { renderSubGroupTables } from './tableRendering.subGroupTables';
import { renderTableRows } from './tableRendering.rows';

/**
 * Render Doc table directives (ROW_TABLE/GROUP_TABLE/subgroup tables and line-item placeholders)
 * into the given Document copy.
 */
export const renderLineItemTables = (
  doc: GoogleAppsScript.Document.Document,
  questions: QuestionConfig[],
  lineItemRows: Record<string, any[]>
): void => {
  const body = doc.getBody();
  if (!body) return;
  const groupLookup: Record<string, QuestionConfig> = {};
  questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      groupLookup[q.id.toUpperCase()] = q;
    });

  let childIndex = 0;
  while (childIndex < body.getNumChildren()) {
    const element = body.getChild(childIndex);
    if (!element || element.getType() !== DocumentApp.ElementType.TABLE) {
      childIndex++;
      continue;
    }
    const table = element.asTable();
    const directive = extractTableRepeatDirective(table);
    if (directive) {
      const inserted =
        directive.kind === 'ROW_TABLE'
          ? renderRowLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows)
          : renderGroupedLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows);
      childIndex += inserted;
      continue;
    }

    // By default, tables containing subgroup placeholders are rendered per parent row.
    // However, if a CONSOLIDATED_TABLE directive is present, we treat it as a single consolidated table
    // (handled by renderTableRows) rather than inserting a table per parent row.
    const consolidatedDirective = extractConsolidatedTableDirective(table);
    const subDirective = consolidatedDirective ? null : extractSubGroupDirective(table);
    if (subDirective) {
      const inserted = renderSubGroupTables(body, childIndex, table, subDirective, groupLookup, lineItemRows);
      childIndex += inserted;
      continue;
    }
    renderTableRows(table, groupLookup, lineItemRows);
    childIndex++;
  }
};
export { renderTableRows };
