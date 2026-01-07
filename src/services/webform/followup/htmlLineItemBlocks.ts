import { QuestionConfig } from '../../../types';
import { replaceLineItemPlaceholders } from './lineItemPlaceholders';
import { applyOrderBy, consolidateConsolidatedTableRows } from './tableConsolidation';
import { extractLineItemPlaceholders, parseExcludeWhenClauses, parseOrderByKeys } from './tableDirectives';
import { normalizeText, resolveSubgroupKey, slugifyPlaceholder } from './utils';

type SubGroupConfig = any;

const ORDER_BY_RE = /{{\s*ORDER_BY\s*\(([^)]*)\)\s*}}/gi;
const EXCLUDE_WHEN_RE = /{{\s*EXCLUDE_WHEN\s*\(([^)]*)\)\s*}}/gi;
// Support both:
// - CONSOLIDATED_TABLE(GROUP.SUBGROUP)   (Doc directive)
// - CONSOLIDATED_TABLE(GROUP.SUBGROUP.FIELD) (common user mistake; we ignore FIELD)
const CONSOLIDATED_TABLE_RE =
  /{{\s*CONSOLIDATED_TABLE\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+)(?:\s*\.\s*([A-Z0-9_]+))?\s*\)\s*}}/gi;

const stripDirectiveTokens = (text: string): string => {
  let out = (text || '').toString();
  out = out.replace(ORDER_BY_RE, '');
  out = out.replace(EXCLUDE_WHEN_RE, '');
  out = out.replace(CONSOLIDATED_TABLE_RE, '');
  return out;
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

const extractConsolidatedTableFromText = (text: string): { groupId: string; subGroupId: string } | null => {
  const m = (text || '').match(
    /{{\s*CONSOLIDATED_TABLE\s*\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+)(?:\s*\.\s*[A-Z0-9_]+)?\s*\)\s*}}/i
  );
  if (!m) return null;
  return { groupId: (m[1] || '').toString().toUpperCase(), subGroupId: (m[2] || '').toString().toUpperCase() };
};

const expandBlock = (args: {
  blockText: string;
  groupLookup: Record<string, QuestionConfig>;
  lineItemRows: Record<string, any[]>;
}): string => {
  const { blockText, groupLookup, lineItemRows } = args;
  const allPlaceholders = extractLineItemPlaceholders(blockText).filter(p => Boolean(groupLookup[p.groupId]));
  if (!allPlaceholders.length) return stripDirectiveTokens(blockText);

  const distinctGroups = Array.from(new Set(allPlaceholders.map(p => p.groupId)));
  if (distinctGroups.length !== 1) return stripDirectiveTokens(blockText);
  const groupId = distinctGroups[0];
  const group = groupLookup[groupId];
  if (!group) return stripDirectiveTokens(blockText);

  const subTokens = Array.from(new Set(allPlaceholders.map(p => p.subGroupId).filter(Boolean))) as string[];
  const targetSubToken = subTokens.length === 1 ? (subTokens[0] || '').toString().toUpperCase() : '';
  if (subTokens.length > 1) return stripDirectiveTokens(blockText);

  // Only expand blocks that look like they intend row expansion:
  // - subgroup placeholders (GROUP.SUBGROUP.FIELD), or
  // - explicit directives (ORDER_BY / EXCLUDE_WHEN / CONSOLIDATED_TABLE)
  const hasDirective = /{{\s*(ORDER_BY|EXCLUDE_WHEN|CONSOLIDATED_TABLE)\s*\(/i.test(blockText);
  const hasSubPlaceholder = allPlaceholders.some(p => Boolean(p.subGroupId));
  if (!hasDirective && !hasSubPlaceholder) {
    // Treat GROUP.FIELD placeholders as "aggregated" (handled by applyPlaceholders later).
    return stripDirectiveTokens(blockText);
  }

  const sourceRows = (lineItemRows || {})[group.id] || [];
  let rows: any[] = Array.isArray(sourceRows) ? sourceRows.slice() : [];
  let subConfig: SubGroupConfig | undefined;

  if (targetSubToken && (group as any)?.lineItemConfig?.subGroups?.length) {
    subConfig = (group as any).lineItemConfig.subGroups.find((sub: any) => {
      const key = resolveSubgroupKey(sub as any);
      const normalizedKey = (key || '').toString().toUpperCase();
      const slugKey = slugifyPlaceholder(key || '');
      return normalizedKey === targetSubToken || slugKey === targetSubToken;
    });
    if (subConfig) {
      const subKey = resolveSubgroupKey(subConfig as any);
      const flattened: any[] = [];
      (rows || []).forEach(parentRow => {
        const children = Array.isArray((parentRow || {})[subKey]) ? (parentRow as any)[subKey] : [];
        children.forEach((child: any) => {
          flattened.push({ __parent: parentRow, ...(parentRow || {}), ...(child || {}) });
        });
      });
      rows = flattened;
    } else {
      rows = [];
    }
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
        const rendered = replaceLineItemPlaceholders(`{{${fullKey}}}`, group, dataRow, {
          subGroup: subConfig as any,
          subGroupToken: targetSubToken
        });
        const current = normalizeText(rendered).toLowerCase();
        if (!current) return false;
        return (clause.values || []).some(v => normalizeText(v).toLowerCase() === current);
      });
      return !shouldExclude;
    });
  }

  const consolidatedDirective = extractConsolidatedTableFromText(blockText);
  if (consolidatedDirective && targetSubToken && rows.length) {
    const normalizedGroupId = (group.id || '').toString().toUpperCase();
    const matchesGroup = consolidatedDirective.groupId === normalizedGroupId;
    const wantsSub = consolidatedDirective.subGroupId;
    const matchesSub =
      wantsSub === targetSubToken ||
      (subConfig
        ? (() => {
            const key = resolveSubgroupKey(subConfig as any);
            const normalizedKey = (key || '').toString().toUpperCase();
            const slugKey = slugifyPlaceholder(key || '');
            return wantsSub === normalizedKey || wantsSub === slugKey;
          })()
        : false);
    if (matchesGroup && matchesSub) {
      const placeholdersForKey = extractLineItemPlaceholders(blockText).filter(p => p.groupId === normalizedGroupId);
      rows = consolidateConsolidatedTableRows({
        rows,
        placeholders: placeholdersForKey,
        group,
        subConfig: subConfig as any,
        targetSubGroupId: targetSubToken
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
    out.push(
      replaceLineItemPlaceholders(template, group, dataRow, {
        subGroup: subConfig as any,
        subGroupToken: targetSubToken
      })
    );
  });
  return out.join('\n');
};

/**
 * Apply line-item row expansion directives to HTML templates.
 *
 * Strategy:
 * - Expand repeating blocks inside <tr>...</tr> and <li>...</li> segments (common HTML template structures).
 * - Use the same placeholder + directive semantics as Markdown/Doc templates.
 */
export const applyHtmlLineItemBlocks = (args: {
  html: string;
  questions: QuestionConfig[];
  lineItemRows: Record<string, any[]>;
}): string => {
  const { html, questions, lineItemRows } = args;
  const raw = (html || '').toString();
  if (!raw.trim()) return raw;

  const groupLookup: Record<string, QuestionConfig> = {};
  (questions || []).forEach(q => {
    if (q && q.type === 'LINE_ITEM_GROUP' && q.id) {
      groupLookup[(q.id || '').toString().toUpperCase()] = q as any;
    }
  });
  if (!Object.keys(groupLookup).length) return raw;

  // Fast path:
  // Most HTML templates don't use line-item row expansion. Avoid scanning/replacing every <tr>/<li>
  // unless we detect subgroup placeholders or explicit directives.
  const hasDirective = /{{\s*(ORDER_BY|EXCLUDE_WHEN|CONSOLIDATED_TABLE)\s*\(/i.test(raw);
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const groupUnion = Object.keys(groupLookup)
    .map(id => escapeRegExp((id || '').toString()))
    .filter(Boolean)
    .join('|');
  const hasSubgroupPlaceholders = groupUnion
    ? new RegExp(`{{\\s*(?:${groupUnion})\\s*\\.\\s*[A-Z0-9_]+\\s*\\.`, 'i').test(raw)
    : false;
  if (!hasDirective && !hasSubgroupPlaceholders) return raw;

  // Expand <tr> blocks first (most common for line items).
  let out = raw.replace(/<tr\b[\s\S]*?<\/tr>/gi, match =>
    expandBlock({ blockText: match, groupLookup, lineItemRows })
  );
  // Expand <li> blocks as a secondary option (lists used as "tables").
  out = out.replace(/<li\b[\s\S]*?<\/li>/gi, match =>
    expandBlock({ blockText: match, groupLookup, lineItemRows })
  );

  // Final safety: strip any remaining directives so they don't leak into output.
  return out.replace(ORDER_BY_RE, '').replace(EXCLUDE_WHEN_RE, '').replace(CONSOLIDATED_TABLE_RE, '');
};


