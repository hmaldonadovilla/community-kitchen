import { matchesWhenClause } from '../../core';
import type { ListViewSearchPresetButtonConfig, WhenClause } from '../../../types';
import type { ListItem } from '../api';
import { filterItemsByAdvancedSearch } from './listViewAdvancedSearch';
import { normalizeToIsoDateLocal } from './listViewSearch';

const buildRowWhenContext = (row: ListItem) =>
  ({
    getValue: (fieldId: string) => (row as any)?.[fieldId],
    getLineItems: () => [],
    getLineItemKeys: () => []
  }) as any;

const normalizeMode = (raw: any): 'text' | 'date' | 'advanced' => {
  const value = (raw || '').toString().trim().toLowerCase();
  if (value === 'date') return 'date';
  if (value === 'advanced') return 'advanced';
  return 'text';
};

const subtractLocalDays = (isoDate: string, days: number): string | null => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - Math.max(0, Math.floor(days)));
  return normalizeToIsoDateLocal(d);
};

const addLocalDays = (isoDate: string, days: number): string | null => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Math.max(0, Math.floor(days)));
  return normalizeToIsoDateLocal(d);
};

const filterItemsByKeyword = (items: ListItem[], keyword: string, searchableFieldIds: string[]): ListItem[] => {
  const normalizedKeyword = (keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return items;
  return items.filter(row =>
    searchableFieldIds.some(fieldId => {
      const raw = (row as any)?.[fieldId];
      if (raw === undefined || raw === null) return false;
      const value = Array.isArray(raw) ? raw.join(' ') : `${raw}`;
      return value.toLowerCase().includes(normalizedKeyword);
    })
  );
};

export const filterItemsByWhenClause = (items: ListItem[], when: WhenClause | undefined, now?: Date): ListItem[] => {
  if (!when) return items;
  return items.filter(row => matchesWhenClause(when as any, buildRowWhenContext(row), { now }));
};

export const whenClauseContainsTodayFilter = (when: WhenClause | undefined, fieldId: string): boolean => {
  if (!when || !fieldId) return false;
  if (Array.isArray(when)) {
    return when.some(entry => whenClauseContainsTodayFilter(entry as any, fieldId));
  }
  if (typeof when !== 'object') return false;
  const all = (when as any).all ?? (when as any).and;
  if (Array.isArray(all)) return all.some((entry: any) => whenClauseContainsTodayFilter(entry, fieldId));
  const any = (when as any).any ?? (when as any).or;
  if (Array.isArray(any)) return any.some((entry: any) => whenClauseContainsTodayFilter(entry, fieldId));
  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
    return whenClauseContainsTodayFilter((when as any).not, fieldId);
  }
  const currentFieldId = ((when as any).fieldId || '').toString().trim();
  return currentFieldId === fieldId && (when as any).isToday === true;
};

export const shouldShowSearchPresetInMode = (
  preset: Pick<ListViewSearchPresetButtonConfig, 'showIn'> | null | undefined,
  mode: 'table' | 'cards'
): boolean => {
  const raw = Array.isArray(preset?.showIn) ? preset?.showIn : [];
  if (!raw.length) {
    return mode === 'cards';
  }
  return raw.includes(mode);
};

export const filterItemsForSearchPreset = (args: {
  items: ListItem[];
  preset: ListViewSearchPresetButtonConfig;
  defaultMode?: 'text' | 'date' | 'advanced';
  searchDateFieldId?: string;
  searchableFieldIds: string[];
  keywordFieldIds: string[];
  fieldTypeById: Record<string, string>;
  now?: Date;
}): ListItem[] => {
  const {
    items,
    preset,
    defaultMode = 'text',
    searchDateFieldId,
    searchableFieldIds,
    keywordFieldIds,
    fieldTypeById,
    now = new Date()
  } = args;

  let next = [...items];
  const mode = normalizeMode(preset.mode || defaultMode);
  const keyword = (preset.keyword || '').toString();
  const dateValue = normalizeToIsoDateLocal((preset as any).dateValue);
  const presetWhen = (preset as any).when as WhenClause | undefined;
  const presetDateFieldId = ((preset as any).dateFieldId || '').toString().trim() || (searchDateFieldId || '').toString().trim();
  const lookbackDaysRaw = Number((preset as any).lookbackDays);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw >= 0 ? Math.max(0, Math.floor(lookbackDaysRaw)) : null;
  const lookaheadDaysRaw = Number((preset as any).lookaheadDays);
  const lookaheadDays =
    Number.isFinite(lookaheadDaysRaw) && lookaheadDaysRaw >= 0 ? Math.max(0, Math.floor(lookaheadDaysRaw)) : null;
  const includeToday = (preset as any).includeToday !== false;

  if (mode === 'advanced') {
    next = filterItemsByAdvancedSearch(
      next,
      { keyword, fieldFilters: preset.fieldFilters || {} },
      { keywordFieldIds, fieldTypeById }
    ) as ListItem[];
  } else if (mode === 'date') {
    if (dateValue && presetDateFieldId) {
      next = next.filter(row => normalizeToIsoDateLocal((row as any)?.[presetDateFieldId]) === dateValue);
    }
  } else {
    next = filterItemsByKeyword(next, keyword, searchableFieldIds);
  }

  if (presetWhen) {
    next = filterItemsByWhenClause(next, presetWhen, now);
  }

  if (lookbackDays !== null && presetDateFieldId) {
    const today = normalizeToIsoDateLocal(now);
    const earliest = today ? subtractLocalDays(today, lookbackDays) : null;
    if (today && earliest) {
      next = next.filter(row => {
        const rowDate = normalizeToIsoDateLocal((row as any)?.[presetDateFieldId]);
        if (!rowDate) return false;
        if (rowDate < earliest) return false;
        if (includeToday) return rowDate <= today;
        return rowDate < today;
      });
    }
  }

  if (lookaheadDays !== null && presetDateFieldId) {
    const today = normalizeToIsoDateLocal(now);
    const latest = today ? addLocalDays(today, lookaheadDays) : null;
    if (today && latest) {
      next = next.filter(row => {
        const rowDate = normalizeToIsoDateLocal((row as any)?.[presetDateFieldId]);
        if (!rowDate) return false;
        if (rowDate > latest) return false;
        if (includeToday) return rowDate >= today;
        return rowDate > today;
      });
    }
  }

  return next;
};
