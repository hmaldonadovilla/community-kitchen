import { LineItemGroupConfig, QuestionConfig } from '../../../types';
import { normalizeText, resolveSubgroupKey, slugifyPlaceholder } from './utils';
import {
  clearTableRow,
  extractConsolidatedTableDirective,
  extractExcludeWhenDirective,
  extractLineItemPlaceholders,
  extractOrderByDirective,
  stripConsolidatedTableDirectivePlaceholders,
  stripExcludeWhenDirectivePlaceholders,
  stripOrderByDirectivePlaceholders
} from './tableDirectives';
import { applyOrderBy, consolidateConsolidatedTableRows } from './tableConsolidation';
import { replaceLineItemPlaceholders } from './lineItemPlaceholders';
import { shouldRenderCollapsedOnlyForProgressiveRow } from './progressiveRows';
import { applyZebraStripeToRow } from './tableZebra';

type SubGroupConfig = LineItemGroupConfig;

export const renderTableRows = (
  table: GoogleAppsScript.Document.Table,
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>,
  override?: { groupId: string; rows: any[] },
  opts?: { zebra?: boolean }
): void => {
  const consolidatedDirective = extractConsolidatedTableDirective(table);
  const zebraEnabled = !!(opts && opts.zebra) || !!consolidatedDirective;
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
    if (subGroups.length > 1) continue;
    const targetSubGroupId = subGroups[0];

    const sourceRows = override && override.groupId === group.id ? override.rows : lineItemRows[group.id];
    let rows: any[] = sourceRows || [];
    let subConfig: SubGroupConfig | undefined;

    if (targetSubGroupId && group.lineItemConfig?.subGroups?.length) {
      subConfig = group.lineItemConfig.subGroups.find(sub => {
        const key = resolveSubgroupKey(sub as any);
        const normalizedKey = (key || '').toUpperCase();
        const slugKey = slugifyPlaceholder(key || '');
        return normalizedKey === targetSubGroupId || slugKey === targetSubGroupId;
      });
      if (subConfig) {
        const subKey = resolveSubgroupKey(subConfig as any);
        rows = [];
        (sourceRows || []).forEach(parentRow => {
          const children = Array.isArray((parentRow || {})[subKey]) ? (parentRow as any)[subKey] : [];
          children.forEach((child: any) => {
            rows.push({ __parent: parentRow, ...(parentRow || {}), ...(child || {}) });
          });
        });
      }
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
          const rendered = replaceLineItemPlaceholders(`{{${fullKey}}}`, group, dataRow, {
            subGroup: subConfig as any,
            subGroupToken: targetSubGroupId
          });
          const current = normalizeText(rendered).toLowerCase();
          if (!current) return false;
          return (clause.values || []).some(v => normalizeText(v).toLowerCase() === current);
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
      const matchesSub =
        wantsSub === targetSubGroupId ||
        (subConfig
          ? (() => {
              const key = resolveSubgroupKey(subConfig as any);
              const normalizedKey = (key || '').toUpperCase();
              const slugKey = slugifyPlaceholder(key || '');
              return wantsSub === normalizedKey || wantsSub === slugKey;
            })()
          : false);
      if (matchesSub && rows && rows.length) {
        rows = consolidateConsolidatedTableRows({ rows, placeholders, group, subConfig: subConfig as any, targetSubGroupId });
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
          subGroupToken: targetSubGroupId
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
    const consolidatedMatch = inner.match(/^CONSOLIDATED_ROW\(\s*([A-Z0-9_]+\.[A-Z0-9_]+\.[A-Z0-9_]+)\s*\)$/i);
    const token = consolidatedMatch ? consolidatedMatch[1] : inner;

    const parts = token.toString().split('.').map(p => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    if ((parts[0] || '').toString().toUpperCase() === gid) return true;
  }
  return false;
};


