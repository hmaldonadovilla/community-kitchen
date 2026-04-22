import { resolveLocalizedString } from '../../i18n';
import type { AnalyticsSnapshot, AnalyticsSnapshotItem, LangCode, LocalizedString } from '../../types';

type AnalyticsWidgetMetricConfig = {
  id?: string;
  label?: LocalizedString | string;
  placements?: string[];
  maximumFractionDigits?: number;
};

const resolveAnalyticsPlacements = (
  entry: Pick<AnalyticsSnapshotItem, 'placements'> | null | undefined,
  widget?: AnalyticsWidgetMetricConfig | null
): string[] => {
  const configured = Array.isArray(widget?.placements) && widget.placements.length ? widget.placements : null;
  const fallback = Array.isArray(entry?.placements) && entry.placements.length ? entry.placements : ['analyticsPage'];
  return (configured || fallback)
    .map(token => (token || '').toString().trim())
    .filter(Boolean);
};

const hasAnalyticsPlacement = (
  entry: Pick<AnalyticsSnapshotItem, 'placements'> | null | undefined,
  placement: 'analyticsPage' | 'listView',
  widget?: AnalyticsWidgetMetricConfig | null
): boolean => {
  const placements = resolveAnalyticsPlacements(entry, widget);
  return placements.some(token => token === placement);
};

export const filterAnalyticsPageWidgets = (items: AnalyticsSnapshotItem[] | null | undefined): AnalyticsSnapshotItem[] => {
  const entries = Array.isArray(items) ? items : [];
  return entries.filter(entry => hasAnalyticsPlacement(entry, 'analyticsPage'));
};

export const formatAnalyticsValue = (
  item: Pick<AnalyticsSnapshotItem, 'value' | 'valueNumber' | 'valueText'>,
  language: LangCode,
  maximumFractionDigits: number = 2
): string => {
  const existing = (item.valueText || '').toString().trim();
  if (existing) return existing;

  const locale = language === 'FR' ? 'fr-BE' : language === 'NL' ? 'nl-BE' : 'en-US';
  const resolvedMaximumFractionDigits = Number.isFinite(maximumFractionDigits)
    ? Math.max(0, Math.min(6, Math.round(maximumFractionDigits)))
    : 2;

  if (typeof item.valueNumber === 'number' && Number.isFinite(item.valueNumber)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: resolvedMaximumFractionDigits }).format(item.valueNumber);
  }
  if (typeof item.value === 'number' && Number.isFinite(item.value)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: resolvedMaximumFractionDigits }).format(item.value);
  }
  if (typeof item.value === 'string') return item.value;
  if (item.value === undefined || item.value === null) return '';
  try {
    return JSON.stringify(item.value);
  } catch (_) {
    return `${item.value}`;
  }
};

export const buildListViewAnalyticsMetrics = (
  snapshot: AnalyticsSnapshot | null | undefined,
  widgets: AnalyticsWidgetMetricConfig[] | null | undefined,
  language: LangCode
): Array<{ id: string; text: string }> => {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (!items.length) return [];

  const widgetById = new Map<string, AnalyticsWidgetMetricConfig>();
  (Array.isArray(widgets) ? widgets : []).forEach(widget => {
    const id = (widget?.id || '').toString().trim();
    if (!id) return;
    widgetById.set(id, widget);
  });

  return items
    .filter(entry => {
      const id = (entry?.id || '').toString().trim();
      return hasAnalyticsPlacement(entry, 'listView', id ? widgetById.get(id) : undefined);
    })
    .map(entry => {
      const id = (entry?.id || '').toString().trim();
      const cfg = id ? widgetById.get(id) : undefined;
      const maxFractionDigitsRaw =
        cfg?.maximumFractionDigits !== undefined ? Number(cfg.maximumFractionDigits) : Number((entry as any)?.maximumFractionDigits);
      const valueText = formatAnalyticsValue(entry, language, maxFractionDigitsRaw);
      const labelText = resolveLocalizedString(cfg?.label ?? entry?.label, language, id).trim();
      const text = labelText ? `${valueText} ${labelText}`.trim() : valueText;
      return {
        id: id || `analytics-${text}`,
        text
      };
    })
    .filter(entry => !!entry.text);
};
