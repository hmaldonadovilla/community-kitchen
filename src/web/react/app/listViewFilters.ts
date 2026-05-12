import { matchesWhenClause } from '../../core';
import type { ListViewSearchPresetButtonConfig, WhenClause } from '../../../types';
import type { ListItem } from '../api';
import { filterItemsByAdvancedSearch } from './listViewAdvancedSearch';
import { normalizeToIsoDateLocal } from './listViewSearch';

export type SearchPresetDateFilter = {
  fieldId: string;
  equals?: string;
  from?: string;
  to?: string;
};

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

export const resolveSearchPresetDateFilter = (args: {
  preset: ListViewSearchPresetButtonConfig;
  defaultMode?: 'text' | 'date' | 'advanced';
  searchDateFieldId?: string;
  now?: Date;
}): SearchPresetDateFilter | null => {
  const { preset, defaultMode = 'text', searchDateFieldId, now = new Date() } = args;
  const mode = normalizeMode(preset.mode || defaultMode);
  const dateValue = normalizeToIsoDateLocal((preset as any).dateValue);
  const presetDateFieldId = ((preset as any).dateFieldId || '').toString().trim() || (searchDateFieldId || '').toString().trim();
  const lookbackDaysRaw = Number((preset as any).lookbackDays);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw >= 0 ? Math.max(0, Math.floor(lookbackDaysRaw)) : null;
  const lookaheadDaysRaw = Number((preset as any).lookaheadDays);
  const lookaheadDays =
    Number.isFinite(lookaheadDaysRaw) && lookaheadDaysRaw >= 0 ? Math.max(0, Math.floor(lookaheadDaysRaw)) : null;
  const includeToday = (preset as any).includeToday !== false;
  if (!presetDateFieldId) return null;

  if (mode === 'date' && dateValue) {
    return { fieldId: presetDateFieldId, equals: dateValue };
  }

  const today = normalizeToIsoDateLocal(now);
  if (!today) return null;

  if (lookbackDays !== null) {
    const from = subtractLocalDays(today, lookbackDays);
    const to = includeToday ? today : subtractLocalDays(today, 1);
    if (from && to) {
      return { fieldId: presetDateFieldId, from, to };
    }
  }

  if (lookaheadDays !== null) {
    const from = includeToday ? today : addLocalDays(today, 1);
    const to = addLocalDays(today, lookaheadDays);
    if (from && to) {
      return { fieldId: presetDateFieldId, from, to };
    }
  }

  return null;
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

export const shouldClearSearchOnOverlayPresetClose = (
  preset: Pick<ListViewSearchPresetButtonConfig, 'overlay'> | null | undefined
): boolean => (preset?.overlay as any)?.clearSearchOnClose === true;

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
  const presetWhen = (preset as any).when as WhenClause | undefined;
  const presetDateFilter = resolveSearchPresetDateFilter({
    preset,
    defaultMode,
    searchDateFieldId,
    now
  });

  if (mode === 'advanced') {
    next = filterItemsByAdvancedSearch(
      next,
      { keyword, fieldFilters: preset.fieldFilters || {} },
      { keywordFieldIds, fieldTypeById }
    ) as ListItem[];
  } else if (presetDateFilter?.equals && presetDateFilter.fieldId) {
    next = next.filter(row => normalizeToIsoDateLocal((row as any)?.[presetDateFilter.fieldId]) === presetDateFilter.equals);
  } else if ((mode === 'date' && presetDateFilter?.fieldId) || (presetDateFilter?.from && presetDateFilter?.to && presetDateFilter.fieldId)) {
    next = next.filter(row => {
      const rowDate = normalizeToIsoDateLocal((row as any)?.[presetDateFilter.fieldId]);
      if (!rowDate) return false;
      if (presetDateFilter.from && rowDate < presetDateFilter.from) return false;
      if (presetDateFilter.to && rowDate > presetDateFilter.to) return false;
      return true;
    });
  } else if (mode === 'date') {
    next = [];
  } else {
    next = filterItemsByKeyword(next, keyword, searchableFieldIds);
  }

  if (presetWhen) {
    next = filterItemsByWhenClause(next, presetWhen, now);
  }

  return next;
};

export const presetRequiresServerDateFetch = (args: {
  preset: ListViewSearchPresetButtonConfig;
  defaultMode?: 'text' | 'date' | 'advanced';
  searchDateFieldId?: string;
  now?: Date;
}): boolean => {
  const dateFilter = resolveSearchPresetDateFilter(args);
  return Boolean(dateFilter?.fieldId && (dateFilter.equals || (dateFilter.from && dateFilter.to)));
};
