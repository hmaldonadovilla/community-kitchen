import { QuestionConfig, LineItemGroupConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { normalizeText, slugifyPlaceholder } from './utils';
import { replaceLineItemPlaceholders } from './lineItemPlaceholders';
import { resolveSubgroupKey } from './utils';

type SubGroupConfig = LineItemGroupConfig;

export const consolidateConsolidatedTableRows = (args: {
  rows: any[];
  placeholders: Array<{ groupId: string; subGroupId?: string; fieldId: string }>;
  group: QuestionConfig;
  subConfig: SubGroupConfig | undefined;
  targetSubGroupId: string;
  dataSources?: DataSourceService;
  language?: string;
}): any[] => {
  const { rows, placeholders, group, subConfig, targetSubGroupId, dataSources, language } = args;
  const source = rows || [];
  if (!source.length) return [];
  const normalizedGroupId = (group?.id || '').toString().toUpperCase();

  const groupFields = (group?.lineItemConfig?.fields || []) as any[];
  const subFields = ((subConfig as any)?.fields || []) as any[];

  const resolveFieldCfg = (fieldToken: string, scope: 'group' | 'sub'): any | undefined => {
    const list = scope === 'sub' ? subFields : groupFields;
    const tokenUpper = (fieldToken || '').toString().toUpperCase();
    return (list || []).find((f: any) => {
      const id = (f?.id || '').toString().toUpperCase();
      const slug = slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
      return id === tokenUpper || slug === tokenUpper;
    });
  };

  const describe = (p: { subGroupId?: string; fieldId: string }) => {
    const isSub = !!p.subGroupId;
    const fieldToken = (p.fieldId || '').toString().toUpperCase();
    const cfg = isSub ? resolveFieldCfg(fieldToken, 'sub') : resolveFieldCfg(fieldToken, 'group');
    const type = (cfg as any)?.type ? (cfg as any).type.toString().toUpperCase() : '';
    const id = (cfg as any)?.id ? (cfg as any).id.toString() : fieldToken;
    return { isSub, fieldToken, cfg, type, id };
  };

  const resolved = placeholders.map(p => ({ p, meta: describe(p) }));
  const numeric = resolved.filter(x => x.meta.type === 'NUMBER' && x.meta.id);
  const nonNumeric = resolved.filter(x => x.meta.type !== 'NUMBER');

  // Default: no numeric fields -> preserve existing behavior (dedupe by full placeholder combination).
  if (!numeric.length) {
    const keyTemplate = placeholders
      .map(p => {
        const token = p.subGroupId
          ? `${normalizedGroupId}.${(p.subGroupId || '').toUpperCase()}.${(p.fieldId || '').toUpperCase()}`
          : `${normalizedGroupId}.${(p.fieldId || '').toUpperCase()}`;
        return `{{${token}}}`;
      })
      .join('||');
    const byKey = new Map<string, any>();
    const ordered: any[] = [];
    source.forEach(dataRow => {
      const key = normalizeText(
        replaceLineItemPlaceholders(keyTemplate, group, dataRow, {
          subGroup: subConfig,
          subGroupToken: targetSubGroupId,
          dataSources,
          language
        })
      );
      if (!key) return;
      const existing = byKey.get(key);
      if (existing) {
        (existing as any).__COUNT = ((existing as any).__COUNT || 1) + 1;
        return;
      }
      const base = { ...(dataRow || {}) };
      (base as any).__COUNT = 1;
      byKey.set(key, base);
      ordered.push(base);
    });
    return ordered;
  }

  // With numeric fields present, consolidate by *non-numeric* placeholder values and sum the numeric fields.
  const keyTemplate = nonNumeric.length
    ? nonNumeric
        .map(x => {
          const p = x.p;
          const token = p.subGroupId
            ? `${normalizedGroupId}.${(p.subGroupId || '').toUpperCase()}.${(p.fieldId || '').toUpperCase()}`
            : `${normalizedGroupId}.${(p.fieldId || '').toUpperCase()}`;
          return `{{${token}}}`;
        })
        .join('||')
    : '';

  const groups = new Map<string, any>();
  const sums = new Map<string, Record<string, number>>();
  const counts = new Map<string, number>();

  const toNumber = (raw: any): number | null => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = raw.toString().trim();
    if (!s) return null;
    // Support commas as decimal separators in inputs like "1,25"
    const normalized = s.replace(',', '.');
    const n = Number.parseFloat(normalized);
    return Number.isNaN(n) ? null : n;
  };
  const round2 = (n: number): number => {
    if (!Number.isFinite(n)) return n;
    // Round to 2 decimals (avoid long floating tails like 0.30000000000000004).
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
  };

  source.forEach(dataRow => {
    const keyRaw = keyTemplate
      ? normalizeText(
          replaceLineItemPlaceholders(keyTemplate, group, dataRow, {
            subGroup: subConfig,
            subGroupToken: targetSubGroupId,
            dataSources,
            language
          })
        )
      : 'ALL';
    if (!keyRaw) return;

    if (!groups.has(keyRaw)) {
      groups.set(keyRaw, { ...(dataRow || {}) });
      sums.set(keyRaw, {});
      counts.set(keyRaw, 0);
    }
    const sumRec = sums.get(keyRaw) || {};
    counts.set(keyRaw, (counts.get(keyRaw) || 0) + 1);

    numeric.forEach(x => {
      const fid = x.meta.id;
      if (!fid) return;
      const n = toNumber((dataRow || {})[fid]);
      if (n === null) return;
      sumRec[fid] = (sumRec[fid] || 0) + n;
    });
    sums.set(keyRaw, sumRec);
  });

  const aggregated: any[] = [];
  groups.forEach((baseRow, key) => {
    const sumRec = sums.get(key) || {};
    Object.entries(sumRec).forEach(([fid, sum]) => {
      (baseRow as any)[fid] = round2(sum);
    });
    (baseRow as any).__COUNT = counts.get(key) || 0;
    aggregated.push(baseRow);
  });
  return aggregated;
};

export const applyOrderBy = (args: {
  rows: any[];
  orderBy: { keys: Array<{ key: string; direction: 'asc' | 'desc' }> };
  group: QuestionConfig;
  opts?: { subConfig?: SubGroupConfig; subToken?: string };
}): any[] => {
  const { rows, orderBy, group, opts } = args;
  const keys = orderBy?.keys || [];
  if (!rows || rows.length <= 1 || !keys.length) return rows || [];

  const enriched = rows.map((row, idx) => ({ row, idx }));
  const normalizedGroupId = (group?.id || '').toString().toUpperCase();
  const subToken = (opts?.subToken || '').toString().toUpperCase();
  const subConfig = opts?.subConfig;

  const resolveFieldCfg = (fieldToken: string, scope: 'group' | 'sub'): any | undefined => {
    const list = scope === 'sub' ? (subConfig as any)?.fields || [] : (group as any)?.lineItemConfig?.fields || [];
    const tokenUpper = (fieldToken || '').toString().toUpperCase();
    return (list || []).find((f: any) => {
      const id = (f?.id || '').toString().toUpperCase();
      const slug = slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
      return id === tokenUpper || slug === tokenUpper;
    });
  };

  const getComparable = (rowData: any, key: string): { empty: boolean; num?: number; str?: string } => {
    const rawKey = (key || '').toString().toUpperCase();
    const segs = rawKey.split('.').filter(Boolean);

    let fieldToken = '';
    let fieldCfg: any | undefined;

    if (segs.length === 1) {
      fieldToken = segs[0];
      if (subConfig) {
        fieldCfg = resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group');
      } else {
        fieldCfg = resolveFieldCfg(fieldToken, 'group');
      }
    } else if (segs.length === 2) {
      const g = segs[0];
      const f = segs[1];
      if (g !== normalizedGroupId) {
        fieldToken = f;
        fieldCfg = subConfig ? resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group') : resolveFieldCfg(fieldToken, 'group');
      } else {
        fieldToken = f;
        fieldCfg = resolveFieldCfg(fieldToken, 'group');
      }
    } else if (segs.length >= 3) {
      const g = segs[0];
      const f = segs[segs.length - 1];
      const s = segs.slice(1, -1).join('.');
      const slugPath = slugifyPlaceholder(s);
      const slugSub = slugifyPlaceholder(subToken || '');
      if (g === normalizedGroupId && subConfig && (s === subToken || s === slugSub || slugPath === subToken)) {
        fieldToken = f;
        fieldCfg = resolveFieldCfg(fieldToken, 'sub');
      } else if (g === normalizedGroupId) {
        fieldToken = f;
        fieldCfg = resolveFieldCfg(fieldToken, 'group');
      } else {
        fieldToken = f;
        fieldCfg = subConfig ? resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group') : resolveFieldCfg(fieldToken, 'group');
      }
    }

    const rawVal = rowData ? rowData[fieldCfg?.id || fieldToken] : undefined;
    if (rawVal === undefined || rawVal === null || rawVal === '') return { empty: true };
    const fieldType = (fieldCfg as any)?.type || undefined;

    // Dates: compare using ISO date when possible.
    if (fieldType === 'DATE') {
      const iso = (rawVal || '').toString().trim();
      if (!iso) return { empty: true };
      return { empty: false, str: iso };
    }

    // Numbers: numeric compare if possible
    if (fieldType === 'NUMBER') {
      const n = typeof rawVal === 'number' ? rawVal : Number.parseFloat(rawVal.toString());
      if (Number.isNaN(n)) return { empty: true };
      return { empty: false, num: n };
    }

    // Fallback: string compare
    const text = Array.isArray(rawVal) ? rawVal.map(v => (v ?? '').toString()).join(', ') : rawVal.toString();
    const trimmed = (text || '').toString().trim();
    if (!trimmed) return { empty: true };
    return { empty: false, str: trimmed.toLowerCase() };
  };

  const cmp = (a: { row: any; idx: number }, b: { row: any; idx: number }): number => {
    for (const k of keys) {
      const dir = k.direction === 'desc' ? -1 : 1;
      const av = getComparable(a.row, k.key);
      const bv = getComparable(b.row, k.key);
      if (av.empty && bv.empty) continue;
      if (av.empty && !bv.empty) return 1;
      if (!av.empty && bv.empty) return -1;
      if (av.num !== undefined && bv.num !== undefined) {
        if (av.num < bv.num) return -1 * dir;
        if (av.num > bv.num) return 1 * dir;
        continue;
      }
      const as = (av.str || '').toString();
      const bs = (bv.str || '').toString();
      const sCmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
      if (sCmp !== 0) return sCmp * dir;
    }
    return a.idx - b.idx;
  };

  enriched.sort(cmp);
  return enriched.map(e => e.row);
};


