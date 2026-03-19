import type { AnalyticsSnapshotItem, LangCode } from '../../types';

export const filterAnalyticsPageWidgets = (items: AnalyticsSnapshotItem[] | null | undefined): AnalyticsSnapshotItem[] => {
  const entries = Array.isArray(items) ? items : [];
  return entries.filter(entry => {
    const placements = Array.isArray(entry?.placements) && entry.placements.length ? entry.placements : ['analyticsPage'];
    return placements.some(token => (token || '').toString().trim() === 'analyticsPage');
  });
};

export const formatAnalyticsValue = (
  item: Pick<AnalyticsSnapshotItem, 'value' | 'valueNumber' | 'valueText'>,
  language: LangCode
): string => {
  const existing = (item.valueText || '').toString().trim();
  if (existing) return existing;

  const locale = language === 'FR' ? 'fr-BE' : language === 'NL' ? 'nl-BE' : 'en-US';

  if (typeof item.valueNumber === 'number' && Number.isFinite(item.valueNumber)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.valueNumber);
  }
  if (typeof item.value === 'number' && Number.isFinite(item.value)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.value);
  }
  if (typeof item.value === 'string') return item.value;
  if (item.value === undefined || item.value === null) return '';
  try {
    return JSON.stringify(item.value);
  } catch (_) {
    return `${item.value}`;
  }
};
