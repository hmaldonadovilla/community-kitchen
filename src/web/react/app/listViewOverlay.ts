import type { ListItem } from '../api';
import type { ListViewColumnConfig } from '../../types';
import { EMPTY_DISPLAY } from '../utils/valueDisplay';
import { groupListItemsByField } from './listViewGrouping';

export type GroupedOverlayTableSection = {
  key: string;
  label: string;
  title: string;
  items: ListItem[];
  columns: ListViewColumnConfig[];
};

/**
 * Builds the grouped overlay table sections used by predefined search overlays.
 * The grouped presentation reuses the same list-table columns as the main list
 * while removing the dedicated group-by column from each group body.
 */
export const buildGroupedOverlayTableSections = (args: {
  items: ListItem[];
  groupByFieldId: string;
  columns: ListViewColumnConfig[];
  groupTitleSuffixText?: string;
}): GroupedOverlayTableSection[] => {
  const groupByFieldId = (args.groupByFieldId || '').toString().trim();
  if (!groupByFieldId) return [];
  const groups = groupListItemsByField(args.items || [], groupByFieldId, { sort: 'asc' });
  const filteredColumns = (args.columns || []).filter(col => (col.fieldId || '').toString().trim() !== groupByFieldId);
  const columns = filteredColumns.length ? filteredColumns : args.columns || [];
  const suffix = (args.groupTitleSuffixText || '').toString().trim();
  return groups.map(group => ({
    key: group.key,
    label: group.label,
    title: [group.label, suffix].filter(Boolean).join(' ').trim() || EMPTY_DISPLAY,
    items: group.items,
    columns
  }));
};
