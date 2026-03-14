import type { ListItem } from '../api';

export interface ListViewItemGroup {
  key: string;
  label: string;
  items: ListItem[];
}

export const groupListItemsByField = (
  items: ListItem[],
  fieldId: string,
  options?: { sort?: 'asc' | 'desc' | 'preserve' }
): ListViewItemGroup[] => {
  const normalizedFieldId = (fieldId || '').toString().trim();
  if (!normalizedFieldId) return [];

  const groups = new Map<string, ListViewItemGroup>();
  items.forEach(item => {
    const raw = (item as any)?.[normalizedFieldId];
    const label = raw === undefined || raw === null || raw === '' ? '' : raw.toString();
    const key = label || '__empty__';
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groups.set(key, { key, label, items: [item] });
  });

  const out = Array.from(groups.values());
  const sortMode = options?.sort || 'preserve';
  if (sortMode === 'preserve') return out;
  out.sort((a, b) => a.label.localeCompare(b.label));
  return sortMode === 'desc' ? out.reverse() : out;
};
