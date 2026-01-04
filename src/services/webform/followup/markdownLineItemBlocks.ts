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

const stripDirectiveTokens = (line: string): string => {
  let out = (line || '').toString();
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

/**
 * Apply line-item row expansion directives to Markdown templates.
 *
 * This is the Markdown analogue of Doc/PDF table row rendering:
 * - Detect blocks containing LINE_ITEM_GROUP placeholders
 * - Repeat the block for each matching row (group rows or subgroup rows)
 * - Apply ORDER_BY and EXCLUDE_WHEN directives (same syntax as Doc templates)
 * - Optionally apply CONSOLIDATED_TABLE(...) for subgroup blocks
 *
 * Safety:
 * - Only expands placeholders when the first segment matches a real LINE_ITEM_GROUP question id
 *   (so datasource placeholders like {{COUNTRY.code}} are not treated as line items).
 */
export const applyMarkdownLineItemBlocks = (args: {
  markdown: string;
  questions: QuestionConfig[];
  lineItemRows: Record<string, any[]>;
}): string => {
  const { markdown, questions, lineItemRows } = args;
  const raw = (markdown || '').toString();
  if (!raw.trim()) return raw;

  const groupLookup: Record<string, QuestionConfig> = {};
  (questions || []).forEach(q => {
    if (q && q.type === 'LINE_ITEM_GROUP' && q.id) {
      groupLookup[(q.id || '').toString().toUpperCase()] = q as any;
    }
  });
  if (!Object.keys(groupLookup).length) return raw;

  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inCodeFence = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] || '';
    const trimmed = line.trim();

    if (/^\s*```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      out.push(line);
      i += 1;
      continue;
    }
    if (inCodeFence) {
      out.push(line);
      i += 1;
      continue;
    }

    // Start a candidate block when we see a line-item placeholder that matches a real LINE_ITEM_GROUP id.
    const ph = extractLineItemPlaceholders(line).filter(p => Boolean(groupLookup[p.groupId]));
    if (!ph.length) {
      // Strip any orphaned directives so they don't leak into output.
      out.push(stripDirectiveTokens(line));
      i += 1;
      continue;
    }

    // Collect a block up to the next blank line. (Simple + predictable in Markdown.)
    const blockLines: string[] = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j] || '';
      if (!l.trim()) break;
      blockLines.push(l);
      j += 1;
    }
    const blockText = blockLines.join('\n');

    const allPlaceholders = extractLineItemPlaceholders(blockText).filter(p => Boolean(groupLookup[p.groupId]));
    const distinctGroups = Array.from(new Set(allPlaceholders.map(p => p.groupId)));
    if (distinctGroups.length !== 1) {
      // Ambiguous: keep content but strip directives.
      blockLines.forEach(bl => out.push(stripDirectiveTokens(bl)));
      i = j;
      continue;
    }

    const groupId = distinctGroups[0];
    const group = groupLookup[groupId];
    if (!group) {
      blockLines.forEach(bl => out.push(stripDirectiveTokens(bl)));
      i = j;
      continue;
    }

    const subTokens = Array.from(new Set(allPlaceholders.map(p => p.subGroupId).filter(Boolean))) as string[];
    const targetSubToken = subTokens.length === 1 ? (subTokens[0] || '').toString().toUpperCase() : '';
    if (subTokens.length > 1) {
      blockLines.forEach(bl => out.push(stripDirectiveTokens(bl)));
      i = j;
      continue;
    }

    // Only expand blocks that look like they intend row expansion:
    // - subgroup placeholders (GROUP.SUBGROUP.FIELD), or
    // - explicit directives (ORDER_BY / EXCLUDE_WHEN / CONSOLIDATED_TABLE)
    const hasDirective = /{{\s*(ORDER_BY|EXCLUDE_WHEN|CONSOLIDATED_TABLE)\s*\(/i.test(blockText);
    const hasSubPlaceholder = allPlaceholders.some(p => Boolean(p.subGroupId));
    if (!hasDirective && !hasSubPlaceholder) {
      // Treat GROUP.FIELD placeholders as "aggregated" (handled by applyPlaceholders later).
      blockLines.forEach(bl => out.push(stripDirectiveTokens(bl)));
      i = j;
      continue;
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
      i = j;
      continue;
    }

    const templates = blockLines.map(stripDirectiveTokens).filter(l => (l || '').trim().length > 0);
    rows.forEach(dataRow => {
      templates.forEach(tpl => {
        out.push(
          replaceLineItemPlaceholders(tpl, group, dataRow, {
            subGroup: subConfig as any,
            subGroupToken: targetSubToken
          })
        );
      });
    });

    i = j;
  }

  // Final safety: strip any remaining directives.
  return out.join('\n').replace(ORDER_BY_RE, '').replace(EXCLUDE_WHEN_RE, '').replace(CONSOLIDATED_TABLE_RE, '');
};


