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
const loggedBypassFilters = new Set<string>();
const loggedWeekdayCompositeFilters = new Set<string>();
const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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

const normalizeToken = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toString().trim().replace(/\s+/g, ' ').toLowerCase();
};

const parseDateToken = (raw: string): Date | null => {
  const s = raw.toString().trim();
  if (!s) return null;
  const ymd = s.match(ISO_DATE_PREFIX_REGEX);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const local = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) return null;
    return local;
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildWeekdayAliases = (raw: string): string[] => {
  const date = parseDateToken(raw);
  if (!date) return [];
  const day = date.getDay();
  const full = WEEKDAY_NAMES[day];
  const short = WEEKDAY_SHORT_NAMES[day];
  return Array.from(new Set([full, short, full.toLowerCase(), short.toLowerCase(), `${day}`]));
};

const expandDateAwareKeys = (keys: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (key: string) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  keys.forEach(key => {
    push(key);
    buildWeekdayAliases(key).forEach(push);
  });
  return out;
};

const buildCompositeOptionMapKeys = (depValues: string[]): { keys: string[]; weekdayAliasKeys: Set<string> } => {
  const keys: string[] = [];
  const seen = new Set<string>();
  const weekdayAliasKeys = new Set<string>();
  const push = (parts: string[], opts?: { weekdayAlias?: boolean }) => {
    const key = parts.join('||');
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
    if (opts?.weekdayAlias) weekdayAliasKeys.add(key);
  };

  if (depValues.length > 1) push(depValues);

  const dateInfos = depValues
    .map((value, index) => ({ index, aliases: buildWeekdayAliases(value) }))
    .filter(entry => entry.aliases.length > 0);
  if (!dateInfos.length) return { keys, weekdayAliasKeys };

  let replacements: string[][] = [depValues.slice()];
  dateInfos.forEach(info => {
    const next: string[][] = [];
    replacements.forEach(parts => {
      info.aliases.forEach(alias => {
        const updated = parts.slice();
        updated[info.index] = alias;
        next.push(updated);
      });
    });
    replacements = next;
  });
  replacements.forEach(parts => {
    if (parts.some((part, idx) => part !== depValues[idx])) push(parts, { weekdayAlias: true });
  });

  const dateIdxSet = new Set<number>(dateInfos.map(info => info.index));
  const withoutDates = depValues.filter((_, idx) => !dateIdxSet.has(idx));
  if (withoutDates.length > 1) push(withoutDates);

  return { keys, weekdayAliasKeys };
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsTokenAsWord = (text: string, token: string): boolean => {
  const t = normalizeToken(text);
  const q = normalizeToken(token);
  if (!t || !q) return false;
  if (t === q) return true;
  // Match token as a standalone "word-ish" segment (avoid partial matches like "nonvegan").
  // Tokens may contain spaces/hyphens, so we use a boundary defined as non-alphanumeric.
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(q)}([^a-z0-9]|$)`, 'i');
  return re.test(t);
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

const normalizeBypassValues = (raw: any): string[] => {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map(entry => normalize(entry).trim())
    .filter(Boolean);
};

const resolveBypassTokens = (dependencyValues: (string | number | null | undefined)[]): string[] => {
  const tokens = normalizeDependencyTokens(dependencyValues);
  const normalized = dependencyValues.map(dep => normalize(dep)).filter(Boolean);
  normalized.forEach(value => tokens.push(value));
  if (normalized.length > 1) tokens.push(normalized.join('||'));
  return Array.from(new Set(tokens));
};

const computeAllowedFromDataSource = (
  filter: OptionFilter,
  options: OptionSet,
  dependencyValues: (string | number | null | undefined)[]
): string[] | null => {
  const dataSourceField = filter.dataSourceField?.toString().trim();
  const raw = options.raw;
  if (!dataSourceField || !Array.isArray(raw) || !raw.length) return null;

  const tokensRaw = normalizeDependencyTokens(dependencyValues);
  const tokens = Array.from(new Set(tokensRaw.map(t => normalizeToken(t)).filter(Boolean)));
  if (!tokens.length) return options.en || [];
  const logKey = `${dataSourceField}::${tokens.join('|')}`;
  const shouldLog = !loggedDataSourceFilters.has(logKey);
  if (shouldLog) loggedDataSourceFilters.add(logKey);
  const matchMode = normalizeMatchMode((filter as any).matchMode);
  const allowed = new Set<string>();

  raw.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const optionValue = resolveOptionValue(row);
    if (!optionValue) return;
    const rawValue = (row as any)[dataSourceField];
    const rowTokensRaw = Array.isArray(rawValue)
      ? rawValue.map(val => normalizeValue(val)).filter(Boolean)
      : rawValue === null || rawValue === undefined
        ? []
        : splitDelimitedValues(rawValue.toString(), filter.dataSourceDelimiter);
    if (!rowTokensRaw.length) return;

    const rowTokens = rowTokensRaw.map(t => normalizeToken(t)).filter(Boolean);
    if (!rowTokens.length) return;
    const rowTokenSet = new Set(rowTokens);
    const rowText = normalizeValue(rawValue === null || rawValue === undefined ? '' : rawValue);

    const tokenMatchesRow = (token: string): boolean => {
      if (!token) return false;
      if (rowTokenSet.has(token)) return true;
      // Fallback for inconsistent delimiter usage (e.g., "Standard / Vegetarian").
      return containsTokenAsWord(rowText, token);
    };

    const matches =
      matchMode === 'or'
        ? tokens.some(token => tokenMatchesRow(token))
        : tokens.every(token => tokenMatchesRow(token));
    if (matches) allowed.add(optionValue);
  });

  if (!allowed.size) return [];
  if (shouldLog && typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[ReactForm]', 'optionFilter.dataSource.apply', {
      dataSourceField,
      tokens,
      matchMode,
      delimiter: (filter.dataSourceDelimiter ?? '').toString() || null,
      optionCount: options.en?.length ?? 0,
      matchedCount: allowed.size
    });
  }
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

  const bypassValues = normalizeBypassValues((filter as any).bypassValues);
  if (bypassValues.length) {
    const bypassSet = new Set(bypassValues);
    const tokens = resolveBypassTokens(dependencyValues);
    const matched = tokens.find(token => bypassSet.has(token));
    if (matched) {
      const logKey = `${Array.isArray(filter.dependsOn) ? filter.dependsOn.join('||') : filter.dependsOn}::${tokens.join('|')}`;
      if (!loggedBypassFilters.has(logKey)) {
        loggedBypassFilters.add(logKey);
        if (typeof console !== 'undefined' && typeof console.info === 'function') {
          console.info('[ReactForm]', 'optionFilter.bypass', {
            dependsOn: filter.dependsOn,
            tokens,
            bypassValues
          });
        }
      }
      return options.en || [];
    }
  }

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
    return buildOrAllowed(filter, expandDateAwareKeys(keys));
  }

  const candidateKeys: string[] = [];
  const compositeKeyMeta = buildCompositeOptionMapKeys(depValues);
  candidateKeys.push(...compositeKeyMeta.keys);
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v));
  candidateKeys.push('*');

  const matchedKey = candidateKeys.find(key => filter.optionMap?.[key] !== undefined);
  if (matchedKey !== undefined) {
    if (compositeKeyMeta.weekdayAliasKeys.has(matchedKey)) {
      const logKey = `${Array.isArray(filter.dependsOn) ? filter.dependsOn.join('||') : filter.dependsOn}::${matchedKey}`;
      if (!loggedWeekdayCompositeFilters.has(logKey) && typeof console !== 'undefined' && typeof console.info === 'function') {
        loggedWeekdayCompositeFilters.add(logKey);
        console.info('[ReactForm]', 'optionFilter.weekdayComposite.match', {
          dependsOn: filter.dependsOn,
          depValues,
          matchedKey
        });
      }
    }
    return filter.optionMap?.[matchedKey] || [];
  }
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
  const bypassValues = normalizeBypassValues((filter as any).bypassValues);
  if (bypassValues.length) {
    const tokens = resolveBypassTokens(dependencyValues);
    const bypassSet = new Set(bypassValues);
    if (tokens.some(token => bypassSet.has(token))) return [];
  }
  const matchMode = normalizeMatchMode((filter as any).matchMode);
  if (matchMode !== 'or') return [];

  const selected = normalize(selectedValue);
  if (!selected) return [];

  const depValues = dependencyValues.map(v => normalize(v));
  const keys =
    depValues.length === 1 && depValues[0]?.includes('|') ? splitMultiValue(depValues[0]) : depValues.filter(Boolean);
  const resolvedKeys = expandDateAwareKeys(keys);
  if (!resolvedKeys.length) return [];

  const fallback = optionMap['*'] || [];
  return resolvedKeys.filter(key => {
    const allowed = optionMap[key] || fallback;
    return !allowed.includes(selected);
  });
}

const normalizeValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toString().trim();
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
