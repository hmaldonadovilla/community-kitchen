import { QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { replaceLineItemPlaceholders, resolveLineItemTokenValue } from './lineItemPlaceholders';
import { applyOrderBy, consolidateConsolidatedTableRows } from './tableConsolidation';
import { extractLineItemPlaceholders, parseExcludeWhenClauses, parseOrderByKeys } from './tableDirectives';
import { escapeRegExp, formatTemplateValue, normalizeText, resolveSubgroupKey, slugifyPlaceholder } from './utils';
import { matchesTemplateWhenClause, parseTemplateWhenClause } from './templateWhen';

type SubGroupConfig = any;

const ORDER_BY_RE = /{{\s*ORDER_BY\s*\(([^)]*)\)\s*}}/gi;
const EXCLUDE_WHEN_RE = /{{\s*EXCLUDE_WHEN\s*\(([^)]*)\)\s*}}/gi;
const EXCLUDE_WHEN_WHEN_RE = /{{\s*EXCLUDE_WHEN_WHEN\s*\(([\s\S]*?)\)\s*}}/gi;
const REPEAT_TABLE_RE =
  /{{\s*(GROUP_TABLE|ROW_TABLE)\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+(?:\s*\.\s*[A-Z0-9_]+)*)\s*\)\s*}}/gi;
// Support both:
// - CONSOLIDATED_TABLE(GROUP.SUBGROUP)   (Doc directive)
// - CONSOLIDATED_TABLE(GROUP.SUBGROUP.FIELD) (common user mistake; we ignore FIELD)
const CONSOLIDATED_TABLE_RE =
  /{{\s*CONSOLIDATED_TABLE\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+)(?:\s*\.\s*([A-Z0-9_]+))?\s*\)\s*}}/gi;

const stripDirectiveTokens = (text: string): string => {
  let out = (text || '').toString();
  out = out.replace(ORDER_BY_RE, '');
  out = out.replace(EXCLUDE_WHEN_RE, '');
  out = out.replace(EXCLUDE_WHEN_WHEN_RE, '');
  out = out.replace(CONSOLIDATED_TABLE_RE, '');
  out = out.replace(REPEAT_TABLE_RE, '');
  return out;
};

const extractRepeatDirective = (
  text: string
): { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string; subGroupId?: string } | null => {
  const m = (text || '').match(
    /{{\s*(GROUP_TABLE|ROW_TABLE)\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+(?:\s*\.\s*[A-Z0-9_]+)*)\s*\)\s*}}/i
  );
  if (!m) return null;
  const pathParts = (m[3] || '')
    .toString()
    .split('.')
    .map(p => p.trim())
    .filter(Boolean);
  if (!pathParts.length) return null;
  const fieldId = (pathParts[pathParts.length - 1] || '').toString().toUpperCase();
  const subGroupId = pathParts.length > 1 ? pathParts.slice(0, -1).join('.').toUpperCase() : undefined;
  return {
    kind: (m[1] || '').toString().toUpperCase() as 'GROUP_TABLE' | 'ROW_TABLE',
    groupId: (m[2] || '').toString().toUpperCase(),
    fieldId,
    subGroupId
  };
};

const replaceRepeatDirectiveToken = (
  text: string,
  directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string; subGroupId?: string },
  replacement: string
): string => {
  const path = directive.subGroupId ? `${directive.subGroupId}.${directive.fieldId}` : directive.fieldId;
  const pattern = new RegExp(
    `{{\\s*${directive.kind}\\s*\\(\\s*${escapeRegExp(directive.groupId)}\\s*\\.\\s*${escapeRegExp(path)}\\s*\\)\\s*}}`,
    'gi'
  );
  return text.replace(pattern, replacement);
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

const extractOrderByFromText = (text: string): { keys: Array<{ key: string; direction: 'asc' | 'desc' }> } | null => {
  const m = (text || '').match(/{{\s*ORDER_BY\s*\(([^)]*)\)\s*}}/i);
  if (!m) return null;
  const keys = parseOrderByKeys((m[1] || '').toString());
  return keys.length ? { keys } : null;
};

const extractExcludeWhenFromText = (text: string): { clauses: Array<{ key: string; values: string[] }> } | null => {
  const m = (text || '').match(/{{\s*EXCLUDE_WHEN\s*\(([^)]*)\)\s*}}/i);
  if (!m) return null;
  const clauses = parseExcludeWhenClauses((m[1] || '').toString());
  return clauses.length ? { clauses } : null;
};

const extractExcludeWhenWhenFromText = (text: string): { when: any } | null => {
  const m = (text || '').match(/{{\s*EXCLUDE_WHEN_WHEN\s*\(([\s\S]*?)\)\s*}}/i);
  if (!m) return null;
  const when = parseTemplateWhenClause((m[1] || '').toString());
  return when ? { when } : null;
};

const extractConsolidatedTableFromText = (text: string): { groupId: string; subGroupId: string } | null => {
  const m = (text || '').match(
    /{{\s*CONSOLIDATED_TABLE\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+(?:\s*\.\s*[A-Z0-9_]+)*)\s*\)\s*}}/i
  );
  if (!m) return null;
  return { groupId: (m[1] || '').toString().toUpperCase(), subGroupId: (m[2] || '').toString().toUpperCase() };
};

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
  let current: any = (group as any).lineItemConfig;
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

const replaceGroupFieldTokens = (
  html: string,
  directive: { groupId: string; fieldId: string; subGroupId?: string },
  value: any
): string => {
  const text = formatTemplateValue(value);
  const path = directive.subGroupId ? `${directive.subGroupId}.${directive.fieldId}` : directive.fieldId;
  const pattern = new RegExp(`{{\\s*${escapeRegExp(directive.groupId)}\\s*\\.\\s*${escapeRegExp(path)}\\s*}}`, 'gi');
  return html.replace(pattern, text);
};

const expandBlock = (args: {
  blockText: string;
  groupLookup: Record<string, QuestionConfig>;
  lineItemRows: Record<string, any[]>;
  forceExpandRows?: boolean;
  dataSources?: DataSourceService;
  language?: string;
  forcedSubToken?: string;
  forcedSubConfig?: SubGroupConfig;
  rowsAreSubRows?: boolean;
}): string => {
  const {
    blockText,
    groupLookup,
    lineItemRows,
    forceExpandRows,
    dataSources,
    language,
    forcedSubToken,
    forcedSubConfig,
    rowsAreSubRows
  } = args;
  const allPlaceholders = extractLineItemPlaceholders(blockText).filter(p => Boolean(groupLookup[p.groupId]));
  if (!allPlaceholders.length) return stripDirectiveTokens(blockText);

  const distinctGroups = Array.from(new Set(allPlaceholders.map(p => p.groupId)));
  if (distinctGroups.length !== 1) return stripDirectiveTokens(blockText);
  const groupId = distinctGroups[0];
  const group = groupLookup[groupId];
  if (!group) return stripDirectiveTokens(blockText);

  const subTokens = Array.from(new Set(allPlaceholders.map(p => p.subGroupId).filter(Boolean))) as string[];
  const resolvedSubTokens = subTokens
    .map(token => resolveSubPath(group, token))
    .filter(Boolean) as Array<{ config: SubGroupConfig; keyPath: string[]; token: string }>;
  if (resolvedSubTokens.length > 1) return stripDirectiveTokens(blockText);

  const sourceRows = (lineItemRows || {})[group.id] || [];
  let rows: any[] = Array.isArray(sourceRows) ? sourceRows.slice() : [];
  const repeatDirective = extractRepeatDirective(blockText);
  const directiveSub = repeatDirective?.subGroupId ? resolveSubPath(group, repeatDirective.subGroupId) : null;
  const resolvedSub = resolvedSubTokens.length ? resolvedSubTokens[0] : directiveSub;
  const forcedResolved = forcedSubToken ? resolveSubPath(group, forcedSubToken) : null;
  const activeSub = forcedResolved || resolvedSub;
  const targetSubToken = (activeSub?.token || forcedSubToken || '').toString().toUpperCase();
  const subConfig: SubGroupConfig | undefined = forcedSubConfig || activeSub?.config;
  const keyPath = activeSub?.keyPath || [];

  if (!rowsAreSubRows && targetSubToken && keyPath.length) {
    rows = flattenSubRows(rows, keyPath);
  }

  if (repeatDirective) {
    // GROUP_TABLE/ROW_TABLE in HTML: duplicate the entire block per group value and scope rows accordingly.
    if (!rows.length) return '';
    if (repeatDirective.kind === 'GROUP_TABLE') {
      const groupedValues = collectGroupFieldValues(rows, repeatDirective.fieldId);
      if (!groupedValues.length) return '';
      const orderBy = extractOrderByFromText(blockText);
      const orderedGroupValues = (() => {
        if (!orderBy || !orderBy.keys.length) return groupedValues;
        const groupFieldToken = (repeatDirective.fieldId || '').toString().toUpperCase();
        const groupIdToken = (repeatDirective.groupId || '').toString().toUpperCase();
        const subPathToken = (repeatDirective.subGroupId || '').toString().toUpperCase();
        const slugSubPath = subPathToken ? slugifyPlaceholder(subPathToken) : '';
        const groupOrderKey = orderBy.keys.find(key => {
          const raw = (key?.key || '').toString().toUpperCase();
          if (!raw) return false;
          const segs = raw.split('.').filter(Boolean);
          if (!segs.length) return false;
          const last = segs[segs.length - 1];
          if (last !== groupFieldToken) return false;
          if (segs.length === 1) return true;
          if (segs.length === 2) return segs[0] === groupIdToken;
          if (segs[0] !== groupIdToken) return false;
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
      const out: string[] = [];
      orderedGroupValues.forEach((groupValue, idx) => {
        const scopedRows = rows.filter(r => normalizeText(r?.[repeatDirective.fieldId]) === normalizeText(groupValue));
        if (!scopedRows.length) return;
        const template = stripDirectiveTokens(
          replaceRepeatDirectiveToken(blockText, repeatDirective, formatTemplateValue(groupValue))
        );
        const orderedRows =
          orderBy && orderBy.keys.length
            ? applyOrderBy({ rows: scopedRows, orderBy, group, opts: { subConfig: subConfig as any, subToken: targetSubToken } })
            : scopedRows;
        orderedRows.forEach((row, rowIdx) => {
          const rendered = replaceLineItemPlaceholders(template, group, row, {
            subGroup: subConfig as any,
            subGroupToken: targetSubToken,
            dataSources,
            language
          });
          out.push(rendered);
        });
        // Preserve table separation when multiple groups render.
        if (idx < groupedValues.length - 1) {
          out.push('');
        }
      });
      return out.join('\n');
    }

    // ROW_TABLE: duplicate per row, replacing the directive with the row's field value.
    const orderedRows = rows.slice();
    const template = stripDirectiveTokens(blockText);
    const out: string[] = [];
    orderedRows.forEach((row, rowIdx) => {
      const title = formatTemplateValue(row?.[repeatDirective.fieldId] ?? '');
      const withTitle = replaceRepeatDirectiveToken(template, repeatDirective, title);
      const rendered = replaceLineItemPlaceholders(withTitle, group, row, {
        subGroup: subConfig as any,
        subGroupToken: targetSubToken,
        dataSources,
        language
      });
      out.push(rendered);
    });
    return out.join('\n');
  }

  // Only expand blocks that look like they intend row expansion:
  // - subgroup placeholders (GROUP.SUBGROUP.FIELD), or
  // - explicit directives (ORDER_BY / EXCLUDE_WHEN / CONSOLIDATED_TABLE)
  const hasDirective = /{{\s*(ORDER_BY|EXCLUDE_WHEN|CONSOLIDATED_TABLE)\s*\(/i.test(blockText);
  const hasSubPlaceholder = resolvedSubTokens.length > 0;
  if (!forceExpandRows && !hasDirective && !hasSubPlaceholder) {
    // Treat GROUP.FIELD placeholders as "aggregated" (handled by applyPlaceholders later).
    return stripDirectiveTokens(blockText);
  }

  const excludeWhen = extractExcludeWhenFromText(blockText);
  if (excludeWhen && excludeWhen.clauses.length && rows.length) {
    const normalizedGroupId = (group.id || '').toString().toUpperCase();
    const defaultPrefix = targetSubToken ? `${normalizedGroupId}.${targetSubToken}` : normalizedGroupId;
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
          subGroupToken: targetSubToken,
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

  const excludeWhenWhen = extractExcludeWhenWhenFromText(blockText);
  if (excludeWhenWhen && rows.length) {
    rows = rows.filter(dataRow => {
        const shouldExclude = matchesTemplateWhenClause({
          when: excludeWhenWhen.when,
          group,
          rowData: dataRow,
          subGroup: subConfig as any,
          subGroupToken: targetSubToken,
          lineItemRows,
          dataSources,
          language
        });
      return !shouldExclude;
    });
  }

  const consolidatedDirective = extractConsolidatedTableFromText(blockText);
  if (consolidatedDirective && targetSubToken && rows.length) {
    const normalizedGroupId = (group.id || '').toString().toUpperCase();
    const matchesGroup = consolidatedDirective.groupId === normalizedGroupId;
    const wantsSub = consolidatedDirective.subGroupId;
    const normalizedTarget = targetSubToken.toUpperCase();
    const slugTarget = slugifyPlaceholder(targetSubToken);
    const matchesSub = wantsSub === normalizedTarget || (slugTarget && wantsSub === slugTarget);
    if (matchesGroup && matchesSub) {
      const placeholdersForKey = extractLineItemPlaceholders(blockText).filter(p => p.groupId === normalizedGroupId);
      rows = consolidateConsolidatedTableRows({
        rows,
        placeholders: placeholdersForKey,
        group,
        subConfig: subConfig as any,
        targetSubGroupId: targetSubToken,
        dataSources,
        language
      });
    }
  }

  const orderBy = extractOrderByFromText(blockText);
  if (orderBy && orderBy.keys.length && rows.length > 1) {
    rows = applyOrderBy({ rows, orderBy, group, opts: { subConfig: subConfig as any, subToken: targetSubToken } });
  }

  if (!rows.length) {
    // Remove the whole block when there are no matching rows (same as clearing the row in Doc tables).
    return '';
  }

  const template = stripDirectiveTokens(blockText);
  const out: string[] = [];
  rows.forEach(dataRow => {
    const applyRowDefault = (text: string): string => {
      return (text || '').toString().replace(
        /{{\s*DEFAULT\s*\(\s*([^)]+?)\s*,\s*"([^"]*)"\s*\)\s*}}/gi,
        (_m: string, keyRaw: string, fallback: string) => {
          const key = (keyRaw || '').toString().replace(/^{{|}}$/g, '').trim();
          if (!key) return fallback;
          const value = replaceLineItemPlaceholders(`{{${key}}}`, group, dataRow, {
            subGroup: subConfig as any,
            subGroupToken: targetSubToken,
            dataSources,
            language
          });
          return normalizeText(value) ? value : fallback;
        }
      );
    };

    out.push(
      replaceLineItemPlaceholders(applyRowDefault(template), group, dataRow, {
        subGroup: subConfig as any,
        subGroupToken: targetSubToken,
        dataSources,
        language
      })
    );
  });
  return out.join('\n');
};

/**
 * Apply line-item row expansion directives to HTML templates.
 *
 * Strategy:
 * - Expand repeating blocks inside <table>...</table>, <tr>...</tr>, and <li>...</li> segments (common HTML template structures).
 * - Use the same placeholder + directive semantics as Markdown/Doc templates.
 */
export const applyHtmlLineItemBlocks = (args: {
  html: string;
  questions: QuestionConfig[];
  lineItemRows: Record<string, any[]>;
  dataSources?: DataSourceService;
  language?: string;
}): string => {
  const { html, questions, lineItemRows, dataSources, language } = args;
  const raw = (html || '').toString();
  if (!raw.trim()) return raw;

  const groupLookup: Record<string, QuestionConfig> = {};
  (questions || []).forEach(q => {
    if (q && q.type === 'LINE_ITEM_GROUP' && q.id) {
      groupLookup[(q.id || '').toString().toUpperCase()] = q as any;
    }
  });
  if (!Object.keys(groupLookup).length) return raw;

  const expandTable = (tableHtml: string): string => {
    const repeatDirective = extractRepeatDirective(tableHtml);
    const renderRows = (
      htmlText: string,
      scopedRows: Record<string, any[]>,
      forcedSub?: { token?: string; config?: SubGroupConfig; rowsAreSubRows?: boolean }
    ): string => {
      let out = htmlText.replace(/<tr\b[\s\S]*?<\/tr>/gi, match =>
        expandBlock({
          blockText: match,
          groupLookup,
          lineItemRows: scopedRows,
          forceExpandRows: !!repeatDirective,
          dataSources,
          language,
          forcedSubToken: forcedSub?.token,
          forcedSubConfig: forcedSub?.config,
          rowsAreSubRows: forcedSub?.rowsAreSubRows
        })
      );
      // Expand <li> inside the table (less common, but supported).
      out = out.replace(/<li\b[\s\S]*?<\/li>/gi, match =>
        expandBlock({
          blockText: match,
          groupLookup,
          lineItemRows: scopedRows,
          forceExpandRows: !!repeatDirective,
          dataSources,
          language,
          forcedSubToken: forcedSub?.token,
          forcedSubConfig: forcedSub?.config,
          rowsAreSubRows: forcedSub?.rowsAreSubRows
        })
      );
      return out;
    };

    if (!repeatDirective) {
      return renderRows(tableHtml, lineItemRows);
    }

    const group = groupLookup[repeatDirective.groupId];
    if (!group) {
      return stripDirectiveTokens(tableHtml);
    }
    let rows = lineItemRows[group.id] || [];
    let subConfig: SubGroupConfig | undefined;
    let subToken = '';
    if (repeatDirective.subGroupId) {
      const resolved = resolveSubPath(group, repeatDirective.subGroupId);
      if (!resolved) {
        return renderRows(stripDirectiveTokens(tableHtml), lineItemRows);
      }
      subConfig = resolved.config;
      subToken = resolved.token;
      rows = flattenSubRows(rows, resolved.keyPath);
    }
    if (!rows.length) return '';
    const forcedSub = subConfig ? { token: subToken, config: subConfig, rowsAreSubRows: true } : undefined;

    if (repeatDirective.kind === 'GROUP_TABLE') {
      const groupedValues = collectGroupFieldValues(rows, repeatDirective.fieldId);
      if (!groupedValues.length) return '';
      const orderBy = extractOrderByFromText(tableHtml);
      const orderedGroupValues = (() => {
        if (!orderBy || !orderBy.keys.length) return groupedValues;
        const groupFieldToken = (repeatDirective.fieldId || '').toString().toUpperCase();
        const groupId = (group?.id || '').toString().toUpperCase();
        const subPathToken = (repeatDirective.subGroupId || '').toString().toUpperCase();
        const slugSubPath = subPathToken ? slugifyPlaceholder(subPathToken) : '';
        const groupOrderKey = orderBy.keys.find(key => {
          const raw = (key?.key || '').toString().toUpperCase();
          if (!raw) return false;
          const segs = raw.split('.').filter(Boolean);
          if (segs.length === 1) return segs[0] === groupFieldToken;
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
      const out: string[] = [];
      orderedGroupValues.forEach((groupValue, idx) => {
        const scopedRows = rows.filter(r => normalizeText(r?.[repeatDirective.fieldId]) === normalizeText(groupValue));
        if (!scopedRows.length) return;
        const orderedRows =
          orderBy && orderBy.keys.length
            ? applyOrderBy({ rows: scopedRows, orderBy, group, opts: { subConfig: subConfig as any, subToken } })
            : scopedRows;
        const scopedMap = { ...lineItemRows, [group.id]: orderedRows };
        let clone = replaceRepeatDirectiveToken(tableHtml, repeatDirective, formatTemplateValue(groupValue));
        clone = replaceGroupFieldTokens(clone, repeatDirective, groupValue);
        out.push(renderRows(clone, scopedMap, forcedSub));
        if (idx < groupedValues.length - 1) out.push('');
      });
      return out.join('\n');
    }

    // ROW_TABLE: duplicate the table per row (order preserved).
    const out: string[] = [];
    const orderBy = extractOrderByFromText(tableHtml);
    const orderedRows =
      orderBy && orderBy.keys.length
        ? applyOrderBy({ rows, orderBy, group, opts: { subConfig: subConfig as any, subToken } })
        : rows;
    orderedRows.forEach(row => {
      const scopedMap = { ...lineItemRows, [group.id]: [row] };
      const titleFieldCfg = subConfig
        ? (subConfig.fields || []).find(
            (f: any) => (f?.id || '').toString().toUpperCase() === (repeatDirective.fieldId || '').toString().toUpperCase()
          )
        : (group.lineItemConfig?.fields || []).find(
            f => ((f as any)?.id || '').toString().toUpperCase() === (repeatDirective.fieldId || '').toString().toUpperCase()
          );
      const title = formatTemplateValue(row?.[repeatDirective.fieldId] ?? '', (titleFieldCfg as any)?.type);
      let clone = replaceRepeatDirectiveToken(
        tableHtml,
        repeatDirective,
        title
      );
      clone = replaceGroupFieldTokens(clone, repeatDirective, row?.[repeatDirective.fieldId] ?? '');
      out.push(renderRows(clone, scopedMap, forcedSub));
    });
    return out.join('\n');
  };

  // Expand tables (handles repeat directives + nested rows), then run a final <li> pass for non-table lists.
  let out = raw.replace(/<table\b[\s\S]*?<\/table>/gi, match => expandTable(match));
  out = out.replace(/<li\b[\s\S]*?<\/li>/gi, match =>
    expandBlock({ blockText: match, groupLookup, lineItemRows, dataSources, language })
  );

  // Final safety: strip any remaining directives so they don't leak into output.
  return out.replace(ORDER_BY_RE, '').replace(EXCLUDE_WHEN_RE, '').replace(CONSOLIDATED_TABLE_RE, '').replace(REPEAT_TABLE_RE, '');
};
