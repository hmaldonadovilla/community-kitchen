import { QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { extractConsolidatedTableDirective, extractSubGroupDirective, extractTableRepeatDirective } from './tableDirectives';
import { renderGroupedLineItemTables, renderRowLineItemTables } from './tableRendering.repeatTables';
import { renderSubGroupTables } from './tableRendering.subGroupTables';
import { renderTableRows } from './tableRendering.rows';
import { resolveSubgroupKey, slugifyPlaceholder } from './utils';

const hasSubgroupPath = (group: QuestionConfig | undefined, rawPath: string): boolean => {
  if (!group || !rawPath) return false;
  if (!(group as any)?.lineItemConfig?.subGroups?.length) return false;
  const tokens = rawPath
    .toString()
    .split('.')
    .map(seg => seg.trim().toUpperCase())
    .filter(Boolean);
  if (!tokens.length) return false;
  let current: any = (group as any).lineItemConfig;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const subs = (current?.subGroups || []) as any[];
    const match = subs.find((sub: any) => {
      const key = resolveSubgroupKey(sub as any);
      const normalizedKey = (key || '').toString().toUpperCase();
      const slugKey = slugifyPlaceholder(key || '');
      return normalizedKey === token || slugKey === token;
    });
    if (!match) return false;
    if (i === tokens.length - 1) return true;
    current = match;
  }
  return false;
};

/**
 * Render Doc table directives (ROW_TABLE/GROUP_TABLE/subgroup tables and line-item placeholders)
 * into the given Document copy.
 */
export const renderLineItemTables = (
  doc: GoogleAppsScript.Document.Document,
  questions: QuestionConfig[],
  lineItemRows: Record<string, any[]>,
  opts?: { dataSources?: DataSourceService; language?: string }
): void => {
  const dataSources = opts?.dataSources;
  const language = opts?.language;
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
          ? renderRowLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows, { dataSources, language })
          : renderGroupedLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows, {
              dataSources,
              language
            });
      childIndex += inserted;
      continue;
    }

    // By default, tables containing subgroup placeholders are rendered per parent row.
    // However, if a CONSOLIDATED_TABLE directive is present, we treat it as a single consolidated table
    // (handled by renderTableRows) rather than inserting a table per parent row.
    const consolidatedDirective = extractConsolidatedTableDirective(table);
    const subDirectiveRaw = consolidatedDirective ? null : extractSubGroupDirective(table);
    const subDirective =
      subDirectiveRaw && hasSubgroupPath(groupLookup[subDirectiveRaw.groupId], subDirectiveRaw.subGroupId)
        ? subDirectiveRaw
        : null;
    if (subDirective) {
      const inserted = renderSubGroupTables(body, childIndex, table, subDirective, groupLookup, lineItemRows, {
        dataSources,
        language
      });
      childIndex += inserted;
      continue;
    }
    renderTableRows(table, groupLookup, lineItemRows, undefined, { dataSources, language });
    childIndex++;
  }
};
export { renderTableRows };
