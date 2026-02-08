import type {
  ListViewOpenViewTarget,
  ListViewRuleCase,
  ListViewRuleColumnConfig,
  ListViewRulePredicate,
  ListViewRuleWhen,
  LocalizedString
} from '../../types';

export type EvaluatedListViewRuleCell = {
  text?: LocalizedString;
  hideText?: boolean;
  style?: ListViewRuleCase['style'];
  icon?: ListViewRuleCase['icon'];
  actions?: EvaluatedListViewRuleAction[];
  hrefFieldId?: string;
  /**
   * Resolved open target for this matched case (includes column-level fallbacks).
   */
  openView?: ListViewOpenViewTarget;
  /**
   * Resolved button id when `openView = "button"`.
   */
  openButtonId?: string;
  /**
   * When true, clicking anywhere on the row should use the same `openView` target.
   */
  rowClick?: boolean;
};

export type EvaluatedListViewRuleAction = {
  text: LocalizedString;
  hideText?: boolean;
  style?: ListViewRuleCase['style'];
  icon?: ListViewRuleCase['icon'];
  hrefFieldId?: string;
  openView?: ListViewOpenViewTarget;
  openButtonId?: string;
  rowClick?: boolean;
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

const allowedOpenViews = new Set(['auto', 'form', 'summary', 'button', 'copy', 'submit']);

type ParsedOpenView = {
  target: ListViewOpenViewTarget;
  rowClick?: boolean;
};

const normalizeOpenViewTarget = (raw: any): ListViewOpenViewTarget | null => {
  const s = raw !== undefined && raw !== null ? raw.toString().trim().toLowerCase() : '';
  if (!s || !allowedOpenViews.has(s)) return null;
  return s as ListViewOpenViewTarget;
};

const parseOpenViewConfig = (raw: any): ParsedOpenView | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const target = normalizeOpenViewTarget(raw);
    return target ? { target } : null;
  }
  if (typeof raw !== 'object') return null;
  const target = normalizeOpenViewTarget((raw as any).target ?? (raw as any).view ?? (raw as any).open ?? (raw as any).openView);
  if (!target) return null;
  const rowClickRaw = (raw as any).rowClick ?? (raw as any).row ?? (raw as any).applyToRow ?? (raw as any).applyToRowClick;
  const rowClick = rowClickRaw !== undefined ? Boolean(rowClickRaw) : undefined;
  return { target, rowClick };
};

const normalizeOpenButtonId = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  return raw.toString().trim();
};

type ResolvedOpenTarget = {
  openView: ListViewOpenViewTarget;
  openButtonId?: string;
  rowClick?: boolean;
};

const resolveOpenTarget = (
  col: ListViewRuleColumnConfig,
  c?: Partial<ListViewRuleCase> | null,
  parent?: Partial<ListViewRuleCase> | null
): ResolvedOpenTarget => {
  const colOpen = parseOpenViewConfig((col as any).openView);
  const parentOpen = parseOpenViewConfig((parent as any)?.openView);
  const caseOpen = parseOpenViewConfig((c as any)?.openView);

  const target = (caseOpen?.target ?? parentOpen?.target ?? colOpen?.target ?? 'auto') as ListViewOpenViewTarget;
  const rowClick = caseOpen?.rowClick ?? parentOpen?.rowClick ?? colOpen?.rowClick ?? undefined;

  const openButtonId =
    normalizeOpenButtonId((c as any)?.openButtonId) ||
    normalizeOpenButtonId((parent as any)?.openButtonId) ||
    normalizeOpenButtonId((col as any).openButtonId);
  const openView = target === 'button' && !openButtonId ? ('auto' as const) : target;
  return {
    openView,
    openButtonId: openView === 'button' ? openButtonId : undefined,
    rowClick: Boolean(rowClick)
  };
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
    if (Array.isArray((c as any)?.actions)) {
      ((c as any).actions as any[]).forEach(action => {
        if (!action || typeof action !== 'object') return;
        addHref((action as any).hrefFieldId);
      });
    }
  });
  addHref((col as any)?.default?.hrefFieldId);
  if (Array.isArray((col as any)?.default?.actions)) {
    ((col as any).default.actions as any[]).forEach(action => {
      if (!action || typeof action !== 'object') return;
      addHref((action as any).hrefFieldId);
    });
  }
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
    const open = resolveOpenTarget(col, c);
    const actionsRaw = Array.isArray((c as any).actions) ? ((c as any).actions as any[]) : [];
    const actions: EvaluatedListViewRuleAction[] = actionsRaw
      .map(action => {
        if (!action || typeof action !== 'object') return null;
        const actionText = (action as any).text;
        if (actionText === undefined || actionText === null || actionText === '') return null;
        const actionHrefFieldId =
          ((action as any).hrefFieldId || (c as any).hrefFieldId || (col as any).hrefFieldId || '').toString().trim() || undefined;
        const resolved = resolveOpenTarget(col, action as any, c as any);
        return {
          text: actionText,
          hideText: Boolean((action as any).hideText),
          style: (action as any).style,
          icon: (action as any).icon,
          hrefFieldId: actionHrefFieldId,
          ...resolved
        } as EvaluatedListViewRuleAction;
      })
      .filter(Boolean) as EvaluatedListViewRuleAction[];
    const cell: EvaluatedListViewRuleCell = {
      text: c.text,
      hideText: Boolean((c as any).hideText),
      style: c.style,
      icon: c.icon,
      actions: actions.length ? actions : undefined,
      hrefFieldId,
      ...open
    };
    debugLog('match', {
      columnId: col.fieldId,
      style: c.style || null,
      icon: c.icon || null,
      actionCount: actions.length,
      openView: open.openView,
      rowClick: !!open.rowClick
    });
    return cell;
  }
  if (col.default && (col.default.text || Array.isArray((col.default as any).actions))) {
    const hrefFieldId = ((col.default as any).hrefFieldId || (col as any).hrefFieldId || '').toString().trim() || undefined;
    const open = resolveOpenTarget(col, col.default as any);
    const actionsRaw = Array.isArray((col.default as any).actions) ? (((col.default as any).actions as any[]) || []) : [];
    const actions: EvaluatedListViewRuleAction[] = actionsRaw
      .map(action => {
        if (!action || typeof action !== 'object') return null;
        const actionText = (action as any).text;
        if (actionText === undefined || actionText === null || actionText === '') return null;
        const actionHrefFieldId =
          ((action as any).hrefFieldId || (col.default as any).hrefFieldId || (col as any).hrefFieldId || '')
            .toString()
            .trim() || undefined;
        const resolved = resolveOpenTarget(col, action as any, col.default as any);
        return {
          text: actionText,
          hideText: Boolean((action as any).hideText),
          style: (action as any).style,
          icon: (action as any).icon,
          hrefFieldId: actionHrefFieldId,
          ...resolved
        } as EvaluatedListViewRuleAction;
      })
      .filter(Boolean) as EvaluatedListViewRuleAction[];
    return {
      text: col.default.text,
      hideText: Boolean((col.default as any).hideText),
      style: col.default.style,
      icon: col.default.icon,
      actions: actions.length ? actions : undefined,
      hrefFieldId,
      ...open
    };
  }
  return null;
};
