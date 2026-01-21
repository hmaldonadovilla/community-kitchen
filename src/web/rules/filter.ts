import { OptionFilter } from '../../types';
import { LangCode, OptionSet } from '../types';

export interface OptionItem {
  value: string;
  label: string;
  labels: Record<string, string>;
  tooltip?: string;
  searchText?: string;
}

const normalize = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  return val.toString();
};

const normalizeMatchMode = (raw: any): 'and' | 'or' => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return s === 'or' ? 'or' : 'and';
};

const splitMultiValue = (raw: string): string[] =>
  raw
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

const DEFAULT_SPLIT_REGEX = /[,;\n]/;
const loggedDataSourceFilters = new Set<string>();

const splitDelimitedValues = (raw: string, delimiter?: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (delimiter && delimiter.toString().trim().toLowerCase() === 'none') return [trimmed];
  if (delimiter && delimiter.toString().trim()) {
    return raw
      .split(delimiter)
      .map(part => part.trim())
      .filter(Boolean);
  }
  return raw
    .split(DEFAULT_SPLIT_REGEX)
    .map(part => part.trim())
    .filter(Boolean);
};

const buildOrAllowed = (filter: OptionFilter, keys: string[]): string[] => {
  const optionMap = filter.optionMap;
  if (!optionMap) return [];
  if (!keys.length) return optionMap['*'] || [];
  const allowed = new Set<string>();
  let matched = false;
  keys.forEach(key => {
    const list = optionMap[key];
    if (!list) return;
    matched = true;
    list.forEach(v => allowed.add(v));
  });
  if (!matched) {
    const fallback = optionMap['*'] || [];
    fallback.forEach(v => allowed.add(v));
  }
  return Array.from(allowed);
};

const resolveOptionValue = (row: any): string => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
  const candidate =
    row.__ckOptionValue ??
    row.value ??
    row.id ??
    row.label ??
    row.optionEn ??
    row.option ??
    '';
  return normalizeValue(candidate);
};

const normalizeDependencyTokens = (dependencyValues: (string | number | null | undefined)[]): string[] => {
  const tokens: string[] = [];
  dependencyValues.forEach(dep => {
    const normalized = normalize(dep);
    if (!normalized) return;
    if (normalized.includes('|')) {
      tokens.push(...splitMultiValue(normalized));
    } else {
      tokens.push(normalized);
    }
  });
  return tokens;
};

const computeAllowedFromDataSource = (
  filter: OptionFilter,
  options: OptionSet,
  dependencyValues: (string | number | null | undefined)[]
): string[] | null => {
  const dataSourceField = filter.dataSourceField?.toString().trim();
  const raw = options.raw;
  if (!dataSourceField || !Array.isArray(raw) || !raw.length) return null;

  const tokens = normalizeDependencyTokens(dependencyValues);
  if (!tokens.length) return options.en || [];
  const logKey = `${dataSourceField}::${tokens.join('|')}`;
  if (!loggedDataSourceFilters.has(logKey)) {
    loggedDataSourceFilters.add(logKey);
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[ReactForm]', 'optionFilter.dataSource.apply', {
        dataSourceField,
        tokens,
        optionCount: options.en?.length ?? 0
      });
    }
  }
  const matchMode = normalizeMatchMode((filter as any).matchMode);
  const allowed = new Set<string>();

  raw.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const optionValue = resolveOptionValue(row);
    if (!optionValue) return;
    const rawValue = (row as any)[dataSourceField];
    const rowTokens = Array.isArray(rawValue)
      ? rawValue.map(val => normalizeValue(val)).filter(Boolean)
      : rawValue === null || rawValue === undefined
        ? []
        : splitDelimitedValues(rawValue.toString(), filter.dataSourceDelimiter);
    if (!rowTokens.length) return;
    const matches =
      matchMode === 'or'
        ? tokens.some(token => rowTokens.includes(token))
        : tokens.every(token => rowTokens.includes(token));
    if (matches) allowed.add(optionValue);
  });

  if (!allowed.size) return [];
  if (options.en && options.en.length) {
    return options.en.filter(value => allowed.has(value));
  }
  return Array.from(allowed);
};

export function computeAllowedOptions(
  filter: OptionFilter | undefined,
  options: OptionSet,
  dependencyValues: (string | number | null | undefined)[]
): string[] {
  if (!filter) return options.en || [];

  const dataSourceAllowed = computeAllowedFromDataSource(filter, options, dependencyValues);
  if (dataSourceAllowed) return dataSourceAllowed;

  if (!filter.optionMap) return options.en || [];
  const depValues = dependencyValues.map(v => normalize(v));
  const matchMode = normalizeMatchMode((filter as any).matchMode);

  // Multi-select CHECKBOX values are normalized by `toDependencyValue` as a single string joined by '|'.
  // When used as a dependency, treat selections as cumulative constraints by intersecting allowed sets (and)
  // or combining them (or). Explicit full-key mappings (e.g. "A|B") take precedence when present.
  if (depValues.length === 1) {
    const raw = depValues[0] || '';
    if (raw.includes('|')) {
      if (filter.optionMap[raw] !== undefined) {
        return filter.optionMap[raw] || [];
      }
      const parts = splitMultiValue(raw);
      if (parts.length > 1) {
        if (matchMode === 'or') {
          return buildOrAllowed(filter, parts);
        }
        const fallback = filter.optionMap['*'] || [];
        let acc: string[] | null = null;
        for (const part of parts) {
          const next = filter.optionMap[part] || fallback;
          if (acc === null) {
            acc = next;
          } else {
            const set = new Set(next);
            acc = acc.filter(v => set.has(v));
          }
        }
        return acc || [];
      }
    }
  }

  if (matchMode === 'or') {
    const keys =
      depValues.length === 1 && depValues[0]?.includes('|')
        ? splitMultiValue(depValues[0])
        : depValues.filter(Boolean);
    return buildOrAllowed(filter, keys);
  }

  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v));
  candidateKeys.push('*');

  const match = candidateKeys.reduce<string[] | undefined>((acc, key) => acc || filter.optionMap?.[key], undefined);
  if (match) return match;
  return [];
}

export function computeNonMatchOptionKeys(args: {
  filter: OptionFilter | undefined;
  dependencyValues: (string | number | null | undefined)[];
  selectedValue: string | number | null | undefined;
}): string[] {
  const { filter, dependencyValues, selectedValue } = args;
  const optionMap = filter?.optionMap;
  if (!filter || !optionMap || filter.dataSourceField) return [];
  const matchMode = normalizeMatchMode((filter as any).matchMode);
  if (matchMode !== 'or') return [];

  const selected = normalize(selectedValue);
  if (!selected) return [];

  const depValues = dependencyValues.map(v => normalize(v));
  const keys =
    depValues.length === 1 && depValues[0]?.includes('|') ? splitMultiValue(depValues[0]) : depValues.filter(Boolean);
  if (!keys.length) return [];

  const fallback = optionMap['*'] || [];
  return keys.filter(key => {
    const allowed = optionMap[key] || fallback;
    return !allowed.includes(selected);
  });
}

const normalizeValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toString();
};

const SEARCH_INTERNAL_KEYS = new Set(['__ckOptionValue']);

const normalizeSearchValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(v => normalizeSearchValue(v)).filter(Boolean).join(' ');
  if (typeof value === 'object') return '';
  return String(value).trim();
};

const buildRawOptionIndex = (raw?: any[]): Map<string, any> => {
  const index = new Map<string, any>();
  if (!Array.isArray(raw)) return index;
  raw.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const candidate =
      row.__ckOptionValue ??
      row.value ??
      row.id ??
      row.label ??
      row.optionEn ??
      row.option ??
      '';
    const key = normalizeValue(candidate);
    if (!key || index.has(key)) return;
    index.set(key, row);
  });
  return index;
};

const buildSearchText = (args: {
  value: string;
  label: string;
  labels: Record<string, string>;
  raw?: any;
}): string => {
  const { value, label, labels, raw } = args;
  const parts = new Set<string>();
  [value, label, labels.en, labels.fr, labels.nl].forEach(entry => {
    const normalized = normalizeSearchValue(entry);
    if (normalized) parts.add(normalized);
  });
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.entries(raw).forEach(([key, val]) => {
      if (SEARCH_INTERNAL_KEYS.has(key)) return;
      const normalized = normalizeSearchValue(val);
      if (normalized) parts.add(normalized);
    });
  }
  return Array.from(parts).join(' ').toLowerCase();
};

export function buildLocalizedOptions(
  options: OptionSet,
  allowed: string[],
  language: LangCode,
  opts?: { sort?: 'alphabetical' | 'source' }
): OptionItem[] {
  const langKey = (language || 'en').toString().toLowerCase();
  const labels = (options as any)[langKey] || options.en || [];
  const baseOpts = options.en || labels;
  const rawIndex = buildRawOptionIndex(options.raw as any[] | undefined);
  const allowedSet = allowed ? new Set(allowed) : null;
  const values = allowed ? allowed : baseOpts;
  const seen = new Set<string>();
  const items: OptionItem[] = [];

  const buildItem = (value: string, originalIndex: number): OptionItem => {
    const labelIdx = baseOpts.findIndex((opt: string) => opt === value);
    const label =
      labelIdx >= 0
        ? labels[labelIdx] || value
        : (() => {
            const fallbackIdx = baseOpts.findIndex((opt: string) => normalizeValue(opt) === value);
            if (fallbackIdx >= 0) {
              return labels[fallbackIdx] || baseOpts[fallbackIdx];
            }
            return value;
          })();
    const resolvedIndex = labelIdx >= 0 ? labelIdx : baseOpts.findIndex((opt: string) => opt === value);
    const rawRow = rawIndex.get(value);
    return {
      value,
      label,
      labels: {
        en: options.en?.[resolvedIndex] || value,
        fr: options.fr?.[resolvedIndex] || value,
        nl: options.nl?.[resolvedIndex] || value
      },
      tooltip: (options as any)?.tooltips?.[value],
      searchText: buildSearchText({
        value,
        label,
        labels: {
          en: options.en?.[resolvedIndex] || value,
          fr: options.fr?.[resolvedIndex] || value,
          nl: options.nl?.[resolvedIndex] || value
        },
        raw: rawRow
      }),
      // carry original index to keep a stable secondary sort
      originalIndex
    } as OptionItem & { originalIndex: number };
  };

  values.forEach((entry: string, idx: number) => {
    const normalized = normalizeValue(entry);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(buildItem(normalized, idx));
  });

  const normalizedSort: 'alphabetical' | 'source' = opts?.sort === 'source' ? 'source' : 'alphabetical';
  if (normalizedSort === 'alphabetical') {
    const collator =
      typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
        ? new Intl.Collator(langKey, { sensitivity: 'base' })
        : undefined;
    items.sort((a, b) => {
      const cmp = collator ? collator.compare(a.label, b.label) : a.label.localeCompare(b.label);
      if (cmp !== 0) return cmp;
      // stable tie-breaker by original order
      return (a as any).originalIndex - (b as any).originalIndex;
    });
  }

  // strip helper property
  return items.map(item => ({
    value: item.value,
    label: item.label,
    labels: item.labels,
    tooltip: (item as any).tooltip,
    searchText: (item as any).searchText
  }));
}
