import type {
  ListViewOpenViewTarget,
  ListViewRuleCase,
  ListViewRuleColumnConfig,
  ListViewRuleWhen,
  LocalizedString
} from '../../types';
import { matchesWhenClause } from '../../rules/visibility';

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

let sharedWhenEngineLogged = false;
const logSharedWhenEngineOnce = (): void => {
  if (sharedWhenEngineLogged) return;
  if (!debugEnabled()) return;
  sharedWhenEngineLogged = true;
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][ListViewRuleColumn]', 'whenEngine.shared', { engine: 'matchesWhenClause' });
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

export const matchesListViewRuleWhen = (
  when: ListViewRuleWhen | undefined,
  row: Record<string, any>,
  now: Date = new Date()
): boolean => {
  if (!when) return true;
  logSharedWhenEngineOnce();
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return matchesWhenClause(
    when as any,
    {
      getValue: (fieldId: string) => (row as any)?.[fieldId],
      getLineItems: undefined,
      getLineValue: undefined
    } as any,
    { now: safeNow }
  );
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
    if ((when as any).not !== undefined) {
      visitWhen((when as any).not);
      return;
    }
    const lineItems = (when as any).lineItems ?? (when as any).lineItem;
    if (lineItems && typeof lineItems === 'object') {
      const groupId =
        (lineItems as any).groupId !== undefined && (lineItems as any).groupId !== null
          ? (lineItems as any).groupId.toString().trim()
          : (lineItems as any).group !== undefined && (lineItems as any).group !== null
            ? (lineItems as any).group.toString().trim()
            : '';
      if (groupId) ids.add(groupId);
      visitWhen((lineItems as any).when);
      visitWhen((lineItems as any).parentWhen);
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
    const ok = matchesListViewRuleWhen(c.when as any, row, now);
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
