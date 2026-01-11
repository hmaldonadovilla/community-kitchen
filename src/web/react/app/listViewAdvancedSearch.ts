/**
 * List view advanced search helpers (pure functions).
 *
 * Keep this logic outside React components so it is easy to unit test.
 */
import { normalizeToIsoDateLocal } from './listViewSearch';

export interface ListViewAdvancedSearchQuery {
  /**
   * Keyword search applied across `keywordFieldIds`.
   */
  keyword?: string;
  /**
   * Per-field filter values (AND-ed together).
   *
   * Notes:
   * - Most fields use a simple string filter.
   * - CHECKBOX fields may use a string[] (multi-select dropdown UI).
   */
  fieldFilters?: Record<string, string | string[]>;
}

const toSearchText = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    return raw
      .map(v => toSearchText(v))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return '';
    }
  }
  return `${raw}`;
};

export const hasActiveAdvancedSearch = (query: ListViewAdvancedSearchQuery | null | undefined): boolean => {
  if (!query) return false;
  if ((query.keyword || '').trim()) return true;
  const filters = query.fieldFilters || {};
  return Object.values(filters).some(v => {
    if (Array.isArray(v)) return v.some(item => (item || '').trim().length > 0);
    return (v || '').trim().length > 0;
  });
};

export const filterItemsByAdvancedSearch = <T extends Record<string, any>>(
  items: T[],
  query: ListViewAdvancedSearchQuery,
  opts: {
    keywordFieldIds: string[];
    fieldTypeById?: Record<string, string>;
  }
): T[] => {
  const keyword = (query.keyword || '').trim().toLowerCase();
  const fieldFilters = query.fieldFilters || {};
  const filterEntries = Object.entries(fieldFilters).filter(([, value]) => {
    if (Array.isArray(value)) return value.some(v => (v || '').trim().length > 0);
    return (value || '').trim().length > 0;
  }) as Array<[string, string | string[]]>;

  const typeById = opts.fieldTypeById || {};

  if (!keyword && !filterEntries.length) return items;

  const matchesKeyword = (row: any): boolean => {
    if (!keyword) return true;
    return opts.keywordFieldIds.some(fieldId => {
      const txt = toSearchText(row?.[fieldId]).toLowerCase();
      return txt.includes(keyword);
    });
  };

  const matchesFieldFilters = (row: any): boolean => {
    const normalizeTokens = (value: string | string[]): string[] => {
      if (Array.isArray(value)) return value.map(v => (v || '').trim()).filter(Boolean);
      const trimmed = (value || '').trim();
      return trimmed ? [trimmed] : [];
    };

    const normalizeRowTokens = (raw: any, fieldType: string): string[] => {
      if (raw === undefined || raw === null) return [];
      if (Array.isArray(raw)) {
        return raw
          .map(v => (v === undefined || v === null ? '' : `${v}`.trim()))
          .filter(Boolean);
      }
      const s = `${raw}`.trim();
      if (!s) return [];

      // Sheets store CHECKBOX multi-select values as comma-separated strings (e.g., "A, B, C").
      if (fieldType === 'CHECKBOX') {
        const parts = s
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
        return parts.length ? parts : [s];
      }

      return [s];
    };

    for (const [fieldId, valueRaw] of filterEntries) {
      const tokens = normalizeTokens(valueRaw);
      if (!tokens.length) continue;
      const fieldType = (typeById[fieldId] || '').toString().toUpperCase();
      const raw = row?.[fieldId];

      // Date-ish filters: if the user entered YYYY-MM-DD and the field is a date/datetime, compare by local date.
      const isYmd = tokens.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(tokens[0]);
      if (isYmd && (fieldType === 'DATE' || fieldType === 'DATETIME' || fieldId === 'createdAt' || fieldId === 'updatedAt')) {
        const normalized = normalizeToIsoDateLocal(raw);
        if (normalized !== tokens[0]) return false;
        continue;
      }

      const isStatus = (fieldId || '').toString().trim().toLowerCase() === 'status';
      const isExactMatchField = isStatus || fieldType === 'CHOICE' || fieldType === 'CHECKBOX';

      if (isExactMatchField) {
        const haystack = normalizeRowTokens(raw, fieldType).map(v => v.toLowerCase());
        const needles = tokens.map(t => t.toLowerCase());
        const matches = needles.some(n => haystack.includes(n));
        if (!matches) return false;
        continue;
      }

      const txt = toSearchText(raw).toLowerCase();
      // Fallback: substring match (AND across multiple tokens, though the UI typically produces a single token here).
      const ok = tokens.every(t => txt.includes(t.toLowerCase()));
      if (!ok) return false;
    }
    return true;
  };

  return items.filter(row => matchesKeyword(row) && matchesFieldFilters(row));
};

