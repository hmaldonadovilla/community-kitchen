import type { LangCode, ListViewColumnConfig, ListViewLegendItem, ListViewRuleColumnConfig, ListViewRuleIcon } from '../../types';
import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';

export type ResolvedListViewLegendItem = { icon?: ListViewRuleIcon; text: string };

const isRuleColumn = (col: ListViewColumnConfig): col is ListViewRuleColumnConfig => (col as any)?.type === 'rule';

export const collectListViewRuleIconsUsed = (columns: ListViewColumnConfig[]): ListViewRuleIcon[] => {
  const icons = new Set<ListViewRuleIcon>();
  (columns || []).forEach(col => {
    if (!isRuleColumn(col)) return;
    (col.cases || []).forEach(c => {
      if (c?.icon) icons.add(c.icon);
    });
    if (col.default?.icon) icons.add(col.default.icon);
  });
  return Array.from(icons);
};

const defaultLegendText = (icon: ListViewRuleIcon, language: LangCode): string => {
  switch (icon) {
    case 'warning':
      return tSystem('list.legend.warning', language, 'Warning');
    case 'check':
      return tSystem('list.legend.check', language, 'OK');
    case 'error':
      return tSystem('list.legend.error', language, 'Error');
    case 'info':
      return tSystem('list.legend.info', language, 'Info');
    case 'external':
      return tSystem('list.legend.external', language, 'External link');
    case 'lock':
      return tSystem('list.legend.lock', language, 'Locked');
    case 'edit':
      return tSystem('list.legend.edit', language, 'Edit');
    case 'view':
      return tSystem('list.legend.view', language, 'View');
    default:
      return '';
  }
};

const ICON_ORDER: ListViewRuleIcon[] = ['warning', 'error', 'check', 'info', 'external', 'lock', 'edit', 'view'];

export const buildListViewLegendItems = (
  columns: ListViewColumnConfig[],
  configured: ListViewLegendItem[] | undefined,
  language: LangCode
): ResolvedListViewLegendItem[] => {
  // Explicit-only: if the dashboard does not define a legend, do not show anything.
  // (Even if rule columns use icons.)
  if (!Array.isArray(configured) || !configured.length) return [];

  const out: ResolvedListViewLegendItem[] = [];
  const seen = new Set<ListViewRuleIcon>();

  configured.forEach(item => {
    if (!item) return;
    const resolved = resolveLocalizedString(item.text, language, '').trim();
    if (!resolved) return;
    const icon = item.icon;
    if (icon) {
      if (seen.has(icon)) return;
      seen.add(icon);
      out.push({ icon, text: resolved });
      return;
    }
    out.push({ text: resolved });
  });

  return out;
};


