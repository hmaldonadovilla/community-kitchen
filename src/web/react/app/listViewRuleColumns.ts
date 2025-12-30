import type {
  ListViewRuleCase,
  ListViewRuleColumnConfig,
  ListViewRulePredicate,
  ListViewRuleWhen,
  LocalizedString
} from '../../types';

export type EvaluatedListViewRuleCell = {
  text: LocalizedString;
  style?: ListViewRuleCase['style'];
  icon?: ListViewRuleCase['icon'];
  hrefFieldId?: string;
};

const debugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);

const debugLog = (event: string, payload?: Record<string, unknown>) => {
  if (!debugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][ListViewRuleColumn]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const pad2 = (n: number): string => n.toString().padStart(2, '0');

const formatLocalYmd = (d: Date): string => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseDateValue = (raw: any): Date | null => {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = raw?.toString?.().trim?.() || '';
  if (!s) return null;
  // Treat YYYY-MM-DD as a local date to avoid UTC parsing surprises.
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const local = new Date(y, m - 1, d, 0, 0, 0, 0);
      return Number.isNaN(local.getTime()) ? null : local;
    }
  }
  // Common display/storage fallback: DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    const local = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isEmpty = (value: any): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const normalizeScalar = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    // For checkbox values, treat equality as "any element matches"; callers handle arrays specially.
    return value.map(v => `${v ?? ''}`).join(',');
  }
  return `${value}`.trim();
};

const normalizeEqualsList = (raw: any): string[] => {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(v => normalizeScalar(v)).filter(Boolean);
};

const isStatusField = (fieldId: string): boolean => (fieldId || '').toString().trim().toLowerCase() === 'status';

const matchesPredicate = (pred: ListViewRulePredicate, row: Record<string, any>, now: Date): boolean => {
  const fieldId = (pred.fieldId || '').toString().trim();
  if (!fieldId) return true;
  const raw = (row as any)[fieldId];

  const comparisons: boolean[] = [];

  if (pred.notEmpty !== undefined) {
    comparisons.push(pred.notEmpty ? !isEmpty(raw) : isEmpty(raw));
  }

  if (pred.isToday || pred.isNotToday) {
    const parsed = parseDateValue(raw);
    const today = formatLocalYmd(now);
    const candidate = parsed ? formatLocalYmd(parsed) : '';
    const same = Boolean(candidate) && candidate === today;
    if (pred.isToday) comparisons.push(same);
    if (pred.isNotToday) {
      // Treat empty/invalid as "not today".
      comparisons.push(!same);
    }
  }

  if (pred.equals !== undefined) {
    const expected = normalizeEqualsList(pred.equals);
    if (!expected.length) {
      comparisons.push(false);
    } else if (Array.isArray(raw)) {
      const current = raw.map(v => normalizeScalar(v)).filter(Boolean);
      comparisons.push(current.some(v => expected.includes(v)));
    } else {
      const current = normalizeScalar(raw);
      if (isStatusField(fieldId)) {
        const cur = current.toLowerCase();
        comparisons.push(expected.map(v => v.toLowerCase()).includes(cur));
      } else {
        comparisons.push(expected.includes(current));
      }
    }
  }

  if (pred.notEquals !== undefined) {
    const disallowed = normalizeEqualsList(pred.notEquals);
    if (!disallowed.length) {
      comparisons.push(true);
    } else if (Array.isArray(raw)) {
      const current = raw.map(v => normalizeScalar(v)).filter(Boolean);
      comparisons.push(!current.some(v => disallowed.includes(v)));
    } else {
      const current = normalizeScalar(raw);
      if (isStatusField(fieldId)) {
        const cur = current.toLowerCase();
        comparisons.push(!disallowed.map(v => v.toLowerCase()).includes(cur));
      } else {
        comparisons.push(!disallowed.includes(current));
      }
    }
  }

  return comparisons.every(Boolean);
};

const matchesWhen = (when: ListViewRuleWhen | undefined, row: Record<string, any>, now: Date): boolean => {
  if (!when) return true;
  if (Array.isArray(when)) {
    // Backward-compat: treat a plain array as "all".
    const list = (when as any[]).filter(Boolean) as any[];
    if (!list.length) return true;
    return list.every(entry => matchesWhen(entry as any, row, now));
  }
  if (typeof when === 'object' && (when as any)) {
    if (Array.isArray((when as any).all)) {
      const list = ((when as any).all as any[]).filter(Boolean);
      if (!list.length) return true;
      return list.every(entry => matchesWhen(entry as any, row, now));
    }
    if (Array.isArray((when as any).any)) {
      const list = ((when as any).any as any[]).filter(Boolean);
      if (!list.length) return true;
      return list.some(entry => matchesWhen(entry as any, row, now));
    }
    return matchesPredicate(when as ListViewRulePredicate, row, now);
  }
  return true;
};

export const collectListViewRuleColumnDependencies = (col: ListViewRuleColumnConfig): string[] => {
  const ids = new Set<string>();

  const visitWhen = (when: any) => {
    if (!when) return;
    if (Array.isArray(when)) {
      when.forEach(visitWhen);
      return;
    }
    if (typeof when !== 'object') return;
    if (Array.isArray((when as any).all)) {
      ((when as any).all as any[]).forEach(visitWhen);
      return;
    }
    if (Array.isArray((when as any).any)) {
      ((when as any).any as any[]).forEach(visitWhen);
      return;
    }
    const fieldId = (when as any).fieldId !== undefined && (when as any).fieldId !== null ? (when as any).fieldId.toString().trim() : '';
    if (fieldId) ids.add(fieldId);
  };

  const addHref = (hrefFieldId: any) => {
    const id = hrefFieldId !== undefined && hrefFieldId !== null ? hrefFieldId.toString().trim() : '';
    if (id) ids.add(id);
  };

  addHref((col as any).hrefFieldId);
  (col.cases || []).forEach(c => {
    visitWhen((c as any)?.when);
    addHref((c as any)?.hrefFieldId);
  });
  addHref((col as any)?.default?.hrefFieldId);
  return Array.from(ids);
};

export const evaluateListViewRuleColumnCell = (
  col: ListViewRuleColumnConfig,
  row: Record<string, any>,
  opts?: { now?: Date }
): EvaluatedListViewRuleCell | null => {
  const now = opts?.now || new Date();
  const cases = Array.isArray(col?.cases) ? col.cases : [];
  for (const c of cases) {
    if (!c) continue;
    const ok = matchesWhen(c.when as any, row, now);
    if (!ok) continue;
    const hrefFieldId = (c.hrefFieldId || (col as any).hrefFieldId || '').toString().trim() || undefined;
    const cell: EvaluatedListViewRuleCell = { text: c.text, style: c.style, icon: c.icon, hrefFieldId };
    debugLog('match', { columnId: col.fieldId, style: c.style || null, icon: c.icon || null });
    return cell;
  }
  if (col.default && col.default.text) {
    const hrefFieldId = ((col.default as any).hrefFieldId || (col as any).hrefFieldId || '').toString().trim() || undefined;
    return { text: col.default.text, style: col.default.style, icon: col.default.icon, hrefFieldId };
  }
  return null;
};


