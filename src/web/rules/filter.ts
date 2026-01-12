import { OptionFilter } from '../../types';
import { LangCode, OptionSet } from '../types';

export interface OptionItem {
  value: string;
  label: string;
  labels: Record<string, string>;
  tooltip?: string;
}

const normalize = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  return val.toString();
};

export function computeAllowedOptions(
  filter: OptionFilter | undefined,
  options: OptionSet,
  dependencyValues: (string | number | null | undefined)[]
): string[] {
  if (!filter) return options.en || [];

  const depValues = dependencyValues.map(v => normalize(v));

  // Multi-select CHECKBOX values are normalized by `toDependencyValue` as a single string joined by '|'.
  // When used as a dependency, treat selections as cumulative constraints by intersecting allowed sets.
  // Explicit full-key mappings (e.g. "A|B") still take precedence when present.
  if (depValues.length === 1) {
    const raw = depValues[0] || '';
    if (raw.includes('|') && filter.optionMap[raw] === undefined) {
      const parts = raw
        .split('|')
        .map(s => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
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
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v));
  candidateKeys.push('*');

  const match = candidateKeys.reduce<string[] | undefined>((acc, key) => acc || filter.optionMap[key], undefined);
  if (match) return match;
  return [];
}

const normalizeValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toString();
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
    return {
      value,
      label,
      labels: {
        en: options.en?.[resolvedIndex] || value,
        fr: options.fr?.[resolvedIndex] || value,
        nl: options.nl?.[resolvedIndex] || value
      },
      tooltip: (options as any)?.tooltips?.[value],
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
    tooltip: (item as any).tooltip
  }));
}
