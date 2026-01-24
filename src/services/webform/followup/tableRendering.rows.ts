import { LineItemGroupConfig, QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { normalizeText, resolveSubgroupKey, slugifyPlaceholder } from './utils';
import {
  clearTableRow,
  extractConsolidatedTableDirective,
  extractExcludeWhenDirective,
  extractExcludeWhenWhenDirective,
  extractLineItemPlaceholders,
  extractOrderByDirective,
  stripConsolidatedTableDirectivePlaceholders,
  stripExcludeWhenDirectivePlaceholders,
  stripExcludeWhenWhenDirectivePlaceholders,
  stripOrderByDirectivePlaceholders
} from './tableDirectives';
import { applyOrderBy, consolidateConsolidatedTableRows } from './tableConsolidation';
import { replaceLineItemPlaceholders, resolveLineItemTokenValue } from './lineItemPlaceholders';
import { shouldRenderCollapsedOnlyForProgressiveRow } from './progressiveRows';
import { applyZebraStripeToRow } from './tableZebra';
import { matchesTemplateWhenClause, parseTemplateWhenClause } from './templateWhen';

type SubGroupConfig = LineItemGroupConfig;

const resolveSubPath = (
  group: QuestionConfig,
  token: string
): { config: SubGroupConfig; keyPath: string[]; token: string } | null => {
  if (!group || !token) return null;
  const pathTokens = token
    .toString()
    .split('.')
    .map(seg => seg.trim().toUpperCase())
    .filter(Boolean);
  if (!pathTokens.length) return null;
  let current: any = group.lineItemConfig;
  const keyPath: string[] = [];
  let lastMatch: SubGroupConfig | null = null;
  for (let i = 0; i < pathTokens.length; i += 1) {
    const target = pathTokens[i];
    const subs = (current?.subGroups || []) as any[];
    const match = subs.find(sub => {
      const key = resolveSubgroupKey(sub as any);
      const normalizedKey = (key || '').toUpperCase();
      const slugKey = slugifyPlaceholder(key || '');
      return normalizedKey === target || slugKey === target;
    });
    if (!match) return null;
    const resolvedKey = resolveSubgroupKey(match as any);
    if (!resolvedKey) return null;
    keyPath.push(resolvedKey);
    lastMatch = match as SubGroupConfig;
    if (i === pathTokens.length - 1) {
      return { config: lastMatch, keyPath, token: keyPath.join('.') };
    }
    current = match;
  }
  return null;
};

const flattenSubRows = (rows: any[], keyPath: string[]): any[] => {
  if (!rows || !rows.length || !keyPath.length) return [];
  const flattened: any[] = [];
  rows.forEach(parentRow => {
    let currentRows: any[] = [parentRow];
    keyPath.forEach(key => {
      const next: any[] = [];
      currentRows.forEach(row => {
        const children = Array.isArray((row || {})[key]) ? (row as any)[key] : [];
        children.forEach((child: any) => next.push(child || {}));
      });
      currentRows = next;
    });
    currentRows.forEach((child: any) => {
      flattened.push({ __parent: parentRow, ...(parentRow || {}), ...(child || {}) });
    });
  });
  return flattened;
};

export const renderTableRows = (
  table: GoogleAppsScript.Document.Table,
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>,
  override?: { groupId: string; rows: any[]; subGroupId?: string; subConfig?: SubGroupConfig },
  opts?: { zebra?: boolean; dataSources?: DataSourceService; language?: string }
): void => {
  const consolidatedDirective = extractConsolidatedTableDirective(table);
  const zebraEnabled = !!(opts && opts.zebra) || !!consolidatedDirective;
  const dataSources = opts?.dataSources;
  const language = opts?.language;
  if (consolidatedDirective) {
    stripConsolidatedTableDirectivePlaceholders(table, consolidatedDirective);
  }
  const orderBy = extractOrderByDirective(table);
  if (orderBy && orderBy.keys.length) {
    stripOrderByDirectivePlaceholders(table);
  }
  const excludeWhen = extractExcludeWhenDirective(table);
  if (excludeWhen && excludeWhen.clauses.length) {
    stripExcludeWhenDirectivePlaceholders(table);
  }
  const excludeWhenWhenRaw = extractExcludeWhenWhenDirective(table);
  if (excludeWhenWhenRaw) {
    stripExcludeWhenWhenDirectivePlaceholders(table);
  }
  const excludeWhenWhen = excludeWhenWhenRaw ? parseTemplateWhenClause(excludeWhenWhenRaw.raw) : null;

  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    const placeholders = extractLineItemPlaceholders(row.getText());
    if (!placeholders.length) continue;
    const distinctGroups = Array.from(new Set(placeholders.map(p => p.groupId)));
    if (distinctGroups.length !== 1) continue;
    const groupId = distinctGroups[0];
    const group = groupLookup[groupId];
    if (!group) continue;
    const subGroups = Array.from(new Set(placeholders.map(p => p.subGroupId).filter(Boolean))) as string[];
    const resolvedSubGroups = subGroups
      .map(token => resolveSubPath(group, token))
      .filter(Boolean) as Array<{ config: SubGroupConfig; keyPath: string[]; token: string }>;
    if (resolvedSubGroups.length > 1) continue;
    const resolvedSub = resolvedSubGroups.length ? resolvedSubGroups[0] : null;
    const overrideSub = override?.subGroupId ? resolveSubPath(group, override.subGroupId) : null;
    const activeSub = resolvedSub || overrideSub;
    const targetSubGroupId = activeSub?.token;

    const sourceRows = override && override.groupId === group.id ? override.rows : lineItemRows[group.id];
    let rows: any[] = sourceRows || [];
    const subConfig: SubGroupConfig | undefined = (override?.subConfig as any) || activeSub?.config;
    const keyPath = activeSub?.keyPath || [];
    const rowsAreSubRows = Boolean(override?.subGroupId);

    if (targetSubGroupId && group.lineItemConfig?.subGroups?.length && !rowsAreSubRows && keyPath.length) {
      rows = flattenSubRows(sourceRows || [], keyPath);
    }

    // Optional row exclusion directive: {{EXCLUDE_WHEN(KEY=VALUE[, KEY2=VALUE2 ...])}}
    // Applied before CONSOLIDATED_TABLE and ORDER_BY so excluded rows do not contribute to sums/counts.
    if (excludeWhen && excludeWhen.clauses.length && rows && rows.length) {
      const normalizedGroupId = (group.id || '').toString().toUpperCase();
      const defaultPrefix = targetSubGroupId ? `${normalizedGroupId}.${targetSubGroupId.toUpperCase()}` : normalizedGroupId;
      rows = rows.filter(dataRow => {
        const shouldExclude = excludeWhen.clauses.some(clause => {
          const key = (clause.key || '').toString().trim();
          if (!key) return false;
          const fullKey = key.includes('.') ? key : `${defaultPrefix}.${key}`;
          const rendered = resolveLineItemTokenValue({
            token: fullKey,
            group,
            rowData: dataRow,
            subGroup: subConfig as any,
            subGroupToken: targetSubGroupId,
            dataSources,
            language
          });
          const current = normalizeText(rendered).toLowerCase();
          if (!current) return false;
          return (clause.values || []).some(v => normalizeText(v).toLowerCase() === current);
        });
        return !shouldExclude;
      });
    }

    if (excludeWhenWhen && rows && rows.length) {
      rows = rows.filter(dataRow => {
        const shouldExclude = matchesTemplateWhenClause({
          when: excludeWhenWhen,
          group,
          rowData: dataRow,
          subGroup: subConfig as any,
          subGroupToken: targetSubGroupId,
          lineItemRows,
          dataSources,
          language
        });
        return !shouldExclude;
      });
    }

    const collapseContextRow = rows && rows.length === 1 ? ((rows[0] as any)?.__parent || rows[0]) : null;
    const rowDisabled =
      !!collapseContextRow &&
      shouldRenderCollapsedOnlyForProgressiveRow({
        group,
        row: collapseContextRow as any,
        ui: (group as any)?.lineItemConfig?.ui,
        fields: (group?.lineItemConfig?.fields || []) as any[]
      });

    // Disabled progressive rows in PDF:
    // When a row is disabled (collapsed fields not yet valid), hide all field rows by default.
    // You can force a specific row to remain visible by using {{ALWAYS_SHOW(GROUP.FIELD)}} (or subgroup token)
    // in that row's template. The system ROW_TABLE header is not affected by this logic.
    if (rowDisabled && rows && rows.length === 1) {
      const keep = hasAlwaysShowTokenForGroup(row.getText(), groupId);
      if (!keep) {
        table.removeRow(r);
        r -= 1;
        continue;
      }
    }

    // Consolidated subgroup tables: dedupe rows by the placeholder combination in the template row.
    if (consolidatedDirective && targetSubGroupId && groupId === consolidatedDirective.groupId) {
      const wantsSub = consolidatedDirective.subGroupId;
      const normalizedTarget = targetSubGroupId.toUpperCase();
      const slugTarget = slugifyPlaceholder(targetSubGroupId);
      const matchesSub = wantsSub === normalizedTarget || (slugTarget && wantsSub === slugTarget);
      if (matchesSub && rows && rows.length) {
        rows = consolidateConsolidatedTableRows({
          rows,
          placeholders,
          group,
          subConfig: subConfig as any,
          targetSubGroupId,
          dataSources,
          language
        });
      }
    }

    if (orderBy && orderBy.keys.length && rows && rows.length > 1) {
      rows = applyOrderBy({ rows, orderBy, group, opts: { subConfig: subConfig as any, subToken: targetSubGroupId } });
    }

    if (!rows || !rows.length) {
      clearTableRow(row);
      continue;
    }
    const templateCells: string[] = [];
    for (let c = 0; c < row.getNumCells(); c++) {
      templateCells.push(row.getCell(c).getText());
    }
    rows.forEach((dataRow, idx) => {
      let targetRow = row;
      if (idx > 0) {
        targetRow = table.insertTableRow(r + idx);
        while (targetRow.getNumCells() < templateCells.length) {
          targetRow.appendTableCell('');
        }
      }
      // Zebra striping: only shade alternating rows within repeated data sections.
      // We keep idx=0 unshaded to preserve template header/row styling.
      if (zebraEnabled && rows.length > 1) {
        applyZebraStripeToRow(targetRow, { stripe: idx % 2 === 1 });
      }
      for (let c = 0; c < templateCells.length; c++) {
        const template = templateCells[c];
        const text = replaceLineItemPlaceholders(template, group, dataRow, {
          subGroup: subConfig as any,
          subGroupToken: targetSubGroupId,
          dataSources,
          language
        });
        const cell = targetRow.getCell(c);
        cell.clear();
        cell.appendParagraph(text || '');
      }
    });
    r += rows.length - 1;
  }
};

const hasAlwaysShowTokenForGroup = (rowText: string, groupId: string): boolean => {
  const gid = (groupId || '').toString().toUpperCase();
  if (!gid) return false;
  const text = (rowText || '').toString();
  if (!text) return false;
  const pattern = /{{ALWAYS_SHOW\(\s*([\s\S]*?)\s*\)}}/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const inner = (m[1] || '').toString().trim();
    if (!inner) continue;

    // ALWAYS_SHOW(CONSOLIDATED_ROW(GROUP.SUBGROUP.FIELD))
    const consolidatedMatch = inner.match(/^CONSOLIDATED_ROW\(\s*([A-Z0-9_]+(?:\.[A-Z0-9_]+)+)\s*\)$/i);
    const token = consolidatedMatch ? consolidatedMatch[1] : inner;

    const parts = token.toString().split('.').map(p => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    if ((parts[0] || '').toString().toUpperCase() === gid) return true;
  }
  return false;
};


