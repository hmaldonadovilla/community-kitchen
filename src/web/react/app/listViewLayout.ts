import type { ListViewLayoutConfig, ListViewSectionType } from '../../types';

const ALLOWED_SECTIONS = new Set<ListViewSectionType>([
  'title',
  'metric',
  'dateHeading',
  'search',
  'results',
  'presets',
  'pagination'
]);

export interface ResolvedListViewLayout {
  sections: ListViewSectionType[];
  metricAlign: 'start' | 'center' | 'end';
}

export const resolveListViewLayout = (
  layout: ListViewLayoutConfig | undefined | null
): ResolvedListViewLayout | null => {
  if (!layout || typeof layout !== 'object') return null;

  const sections = Array.isArray(layout.sections)
    ? layout.sections.filter((value): value is ListViewSectionType => ALLOWED_SECTIONS.has(value))
    : [];
  if (!sections.length) return null;

  const metricAlignRaw = (layout.metricAlign || '').toString().trim().toLowerCase();
  const metricAlign =
    metricAlignRaw === 'start' || metricAlignRaw === 'center' || metricAlignRaw === 'end'
      ? (metricAlignRaw as 'start' | 'center' | 'end')
      : 'end';

  return { sections, metricAlign };
};
