import { QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { formatTemplateValue, normalizeText, resolveSubgroupKey, slugifyPlaceholder } from './utils';
import { extractOrderByDirective, replaceTableRepeatDirectivePlaceholders } from './tableDirectives';
import { applyOrderBy } from './tableConsolidation';
import { renderTableRows } from './tableRendering.rows';

type SubGroupConfig = any;

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
    const match = subs.find((sub: any) => {
      const key = resolveSubgroupKey(sub as any);
      const normalizedKey = (key || '').toString().toUpperCase();
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

export const renderGroupedLineItemTables = (
  body: GoogleAppsScript.Document.Body,
  childIndex: number,
  templateTable: GoogleAppsScript.Document.Table,
  directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string; subGroupId?: string },
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>,
  opts?: { dataSources?: DataSourceService; language?: string }
): number => {
  const dataSources = opts?.dataSources;
  const language = opts?.language;
  const group = groupLookup[directive.groupId];
  if (!group) {
    body.removeChild(templateTable);
    return 0;
  }
  const parentRows = lineItemRows[group.id] || [];
  let rows = parentRows;
  let subConfig: SubGroupConfig | undefined;
  let subToken = '';
  if (directive.subGroupId) {
    const resolved = resolveSubPath(group, directive.subGroupId);
    if (!resolved) {
      body.removeChild(templateTable);
      return 0;
    }
    subConfig = resolved.config;
    subToken = resolved.token;
    rows = flattenSubRows(parentRows, resolved.keyPath);
  }
  const groupedValues = collectGroupFieldValues(rows, directive.fieldId);
  const preservedTemplate = templateTable.copy();
  body.removeChild(templateTable);
  if (!groupedValues.length) {
    return 0;
  }
  const orderBy = extractOrderByDirective(preservedTemplate);
  const orderedGroupValues = (() => {
    if (!orderBy || !orderBy.keys.length) return groupedValues;
    const groupFieldToken = (directive.fieldId || '').toString().toUpperCase();
    const groupId = (group?.id || '').toString().toUpperCase();
    const subPathToken = (directive.subGroupId || '').toString().toUpperCase();
    const slugSubPath = subPathToken ? slugifyPlaceholder(subPathToken) : '';
    const groupOrderKey = orderBy.keys.find(key => {
      const raw = (key?.key || '').toString().toUpperCase();
      if (!raw) return false;
      const segs = raw.split('.').filter(Boolean);
      if (!segs.length) return false;
      const last = segs[segs.length - 1];
      if (last !== groupFieldToken) return false;
      if (segs.length === 1) return true;
      if (segs.length === 2) {
        const [maybeGroup, field] = segs;
        return field === groupFieldToken && maybeGroup === groupId;
      }
      if (segs[0] !== groupId) return false;
      const sub = segs.slice(1, -1).join('.');
      if (!subPathToken) return true;
      return sub === subPathToken || (slugSubPath && sub === slugSubPath);
    });
    if (!groupOrderKey) return groupedValues;
    const direction = groupOrderKey.direction === 'desc' ? 'desc' : 'asc';
    return groupedValues
      .slice()
      .sort((a, b) => {
        const as = normalizeText(a);
        const bs = normalizeText(b);
        const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
        return direction === 'desc' ? -cmp : cmp;
      });
  })();
  orderedGroupValues.forEach((groupValue, idx) => {
    const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
    replaceTableRepeatDirectivePlaceholders(newTable, directive, groupValue, 'GROUP_TABLE');
    const filteredRows = rows.filter(row => {
      const raw = row?.[directive.fieldId] ?? '';
      return normalizeText(raw) === normalizeText(groupValue);
    });
    // Zebra striping improves readability for grouped line-item tables.
    renderTableRows(
      newTable,
      groupLookup,
      lineItemRows,
      { groupId: group.id, rows: filteredRows, subGroupId: subToken || undefined, subConfig },
      { zebra: true, dataSources, language }
    );
  });
  return orderedGroupValues.length;
};

export const renderRowLineItemTables = (
  body: GoogleAppsScript.Document.Body,
  childIndex: number,
  templateTable: GoogleAppsScript.Document.Table,
  directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string; subGroupId?: string },
  groupLookup: Record<string, QuestionConfig>,
  lineItemRows: Record<string, any[]>,
  opts?: { dataSources?: DataSourceService; language?: string }
): number => {
  const dataSources = opts?.dataSources;
  const language = opts?.language;
  const group = groupLookup[directive.groupId];
  if (!group) {
    body.removeChild(templateTable);
    return 0;
  }
  const parentRows = lineItemRows[group.id] || [];
  let rows = parentRows;
  let subConfig: SubGroupConfig | undefined;
  let subToken = '';
  if (directive.subGroupId) {
    const resolved = resolveSubPath(group, directive.subGroupId);
    if (!resolved) {
      body.removeChild(templateTable);
      return 0;
    }
    subConfig = resolved.config;
    subToken = resolved.token;
    rows = flattenSubRows(parentRows, resolved.keyPath);
  }
  const orderBy = extractOrderByDirective(templateTable);
  const preservedTemplate = templateTable.copy();
  body.removeChild(templateTable);
  if (!rows.length) {
    return 0;
  }
  const orderedRows =
    orderBy && orderBy.keys.length
      ? applyOrderBy({ rows, orderBy, group, opts: { subConfig: subConfig as any, subToken } })
      : rows;
  orderedRows.forEach((rowData, idx) => {
    const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
    const titleFieldCfg = subConfig
      ? (subConfig.fields || []).find(
          (f: any) => (f?.id || '').toString().toUpperCase() === (directive.fieldId || '').toString().toUpperCase()
        )
      : (group.lineItemConfig?.fields || []).find(
          f => ((f as any)?.id || '').toString().toUpperCase() === (directive.fieldId || '').toString().toUpperCase()
        );
    const title = formatTemplateValue(rowData?.[directive.fieldId] ?? '', (titleFieldCfg as any)?.type);
    replaceTableRepeatDirectivePlaceholders(newTable, directive, title, 'ROW_TABLE');
    // Render this table for exactly one parent row (so the key/value rows don't duplicate when titles repeat).
    renderTableRows(
      newTable,
      groupLookup,
      lineItemRows,
      { groupId: group.id, rows: [rowData], subGroupId: subToken || undefined, subConfig },
      { dataSources, language }
    );
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


