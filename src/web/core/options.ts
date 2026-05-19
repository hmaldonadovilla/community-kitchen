import { DataSourceConfig, OptionMapRefConfig, SheetColumnRef } from '../../types';
import { FieldValue, LangCode, OptionSet } from '../types';
import { fetchDataSource, peekCachedDataSource, peekCachedDataSourcesById } from '../data/dataSources';

const DEFAULT_SPLIT_REGEX = /[,;\n]/;
const SUPPORTED_LANGUAGES: LangCode[] = ['EN', 'FR', 'NL'];

const splitOptionMapCell = (raw: any, delimiter?: string): string[] => {
  if (raw === undefined || raw === null) return [];
  const str = String(raw).trim();
  if (!str) return [];
  const delim = delimiter !== undefined && delimiter !== null ? delimiter.toString() : '';
  if (delim && delim.toLowerCase() !== 'none') {
    return str
      .split(delim)
      .map(part => part.trim())
      .filter(Boolean);
  }
  return str
    .split(DEFAULT_SPLIT_REGEX)
    .map(part => part.trim())
    .filter(Boolean);
};

const resolveRefDataSourceId = (ref: string): string => {
  const raw = (ref || '').toString().trim();
  if (!raw) return '';
  return raw.startsWith('REF:') ? raw.substring(4).trim() : raw;
};

const extractRowsFromCachedDataSource = (candidate: any): any[] => {
  if (Array.isArray(candidate)) return candidate;
  if (candidate && typeof candidate === 'object' && Array.isArray((candidate as any).items)) {
    return (candidate as any).items;
  }
  return [];
};

const columnLettersToIndex = (letters: string): number => {
  let result = 0;
  for (let i = 0; i < letters.length; i += 1) {
    const code = letters.charCodeAt(i);
    if (code < 65 || code > 90) return 0;
    result = result * 26 + (code - 64);
  }
  return result;
};

const resolveRowColumnKey = (row: Record<string, any>, column: SheetColumnRef): string | null => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const keys = Object.keys(row);
  if (!keys.length) return null;

  if (typeof column === 'number' && Number.isFinite(column)) {
    const idx = Math.max(1, Math.trunc(column)) - 1;
    return keys[idx] || null;
  }

  const raw = `${column ?? ''}`.trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && raw === `${numeric}`) {
    const idx = Math.max(1, Math.trunc(numeric)) - 1;
    return keys[idx] || null;
  }

  const upper = raw.toUpperCase();
  if (/^[A-Z]+$/.test(upper) && upper.length <= 3) {
    const idx = columnLettersToIndex(upper);
    return idx > 0 ? keys[idx - 1] || null : null;
  }

  const exact = keys.find(key => key === raw);
  if (exact) return exact;

  const normalized = raw.toLowerCase();
  return keys.find(key => key.toLowerCase() === normalized) || null;
};

const getRowColumnValue = (row: Record<string, any>, column: SheetColumnRef): any => {
  const key = resolveRowColumnKey(row, column);
  if (!key) return undefined;
  return row[key];
};

const buildOptionMapFromRows = (
  rows: any[],
  refCfg: OptionMapRefConfig
): Record<string, string[]> | null => {
  if (!Array.isArray(rows) || !rows.length) return null;
  const keyColumns = Array.isArray(refCfg.keyColumn) ? refCfg.keyColumn : [refCfg.keyColumn];
  if (!keyColumns.length) return null;
  const map: Record<string, string[]> = {};

  rows.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const keyParts = keyColumns.map(column => {
      const value = getRowColumnValue(row, column);
      return value === undefined || value === null ? '' : value.toString().trim();
    });
    if (!keyParts.some(Boolean)) return;

    const lookupValue = getRowColumnValue(row, refCfg.lookupColumn);
    const values = splitOptionMapCell(lookupValue, refCfg.delimiter);
    if (!values.length) return;

    if (refCfg.splitKey === true && keyParts.length === 1) {
      const keys = splitOptionMapCell(keyParts[0], refCfg.keyDelimiter);
      keys.forEach(key => {
        if (!map[key]) map[key] = [];
        map[key].push(...values);
      });
      return;
    }

    const firstEmptyIndex = keyParts.findIndex(part => !part);
    if (firstEmptyIndex >= 0 && keyParts.slice(firstEmptyIndex).some(Boolean)) return;
    const usableParts = firstEmptyIndex >= 0 ? keyParts.slice(0, firstEmptyIndex) : keyParts;
    if (!usableParts.length) return;
    let key = usableParts.length > 1 ? usableParts.join('||') : usableParts[0];
    if (usableParts.length > 1 && usableParts.every(part => part === '*')) key = '*';
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(...values);
  });

  Object.keys(map).forEach(key => {
    const seen = new Set<string>();
    map[key] = map[key]
      .map(value => `${value ?? ''}`.trim())
      .filter(value => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    if (!map[key].length) delete map[key];
  });

  return Object.keys(map).length ? map : null;
};

export const resolveOptionMapFromRef = (
  refCfg?: OptionMapRefConfig,
  language?: LangCode
): Record<string, string[]> | null => {
  if (!refCfg || typeof refCfg !== 'object') return null;
  const refId = resolveRefDataSourceId(refCfg.ref);
  if (!refId) return null;

  const candidateLanguages = Array.from(
    new Set<LangCode>([
      ...(language ? [normalizeLanguage(language)] : []),
      ...SUPPORTED_LANGUAGES
    ])
  );

  for (const lang of candidateLanguages) {
    const candidates = peekCachedDataSourcesById(refId, lang);
    for (const candidate of candidates) {
      const rows = extractRowsFromCachedDataSource(candidate);
      const optionMap = buildOptionMapFromRows(rows, refCfg);
      if (optionMap) return optionMap;
    }
  }
  return null;
};

export const toOptionSet = (question: any): OptionSet => {
  const deriveOptionSetFromFilterMap = (): OptionSet | null => {
    const optionMap =
      question?.optionFilter?.optionMap ||
      resolveOptionMapFromRef(question?.optionFilter?.optionMapRef);
    if (!optionMap || typeof optionMap !== 'object') return null;
    const values = Object.values(optionMap).flatMap(entry => (Array.isArray(entry) ? entry : []));
    return buildOptionSet(values.map(value => (value === null || value === undefined ? '' : value.toString())));
  };

  if (question?.options?.en || question?.options?.fr || question?.options?.nl) {
    const optionSet = question.options as OptionSet;
    if (!optionSet.raw && Array.isArray(question?.optionsRaw)) {
      return { ...optionSet, raw: question.optionsRaw as any[] };
    }
    return optionSet;
  }
  if (question.options) {
    const opts = question.options as any;
    if (Array.isArray(opts)) {
      const tooltips: Record<string, string> = {};
      const normalized = opts.map((entry: any) => {
        if (entry && typeof entry === 'object') {
          const val = entry.value ?? entry.id ?? entry.label ?? '';
          if (entry.tooltip) {
            tooltips[val] = entry.tooltip.toString();
          }
          return val?.toString?.() || '';
        }
        return entry;
      });
      const optionSet: OptionSet = {
        en: normalized,
        fr: (question as any).optionsFr,
        nl: (question as any).optionsNl,
        raw: Array.isArray(question?.optionsRaw) ? (question.optionsRaw as any[]) : undefined
      };
      if (!optionSet.en?.length && !optionSet.fr?.length && !optionSet.nl?.length) {
        return deriveOptionSetFromFilterMap() || optionSet;
      }
      if (Object.keys(tooltips).length) optionSet.tooltips = tooltips;
      return optionSet;
    }
    return opts as OptionSet;
  }
  return deriveOptionSetFromFilterMap() || {};
};

export const optionKey = (id: string, parentId?: string): string => (parentId ? `${parentId}.${id}` : id);

export const optionParentAliases = (parentId?: string): string[] => {
  const raw = (parentId || '').toString().trim();
  if (!raw) return [];
  const aliases: string[] = [raw];
  const dynamicParts = raw.split('::').map(part => part.trim()).filter(Boolean);
  if (dynamicParts.length > 2) {
    const collapsed = [dynamicParts[0], ...dynamicParts.slice(2)].filter(Boolean).join('::');
    if (collapsed && !aliases.includes(collapsed)) aliases.push(collapsed);
    const rootAndLeaf = [dynamicParts[0], dynamicParts[dynamicParts.length - 1]].filter(Boolean).join('::');
    if (rootAndLeaf && !aliases.includes(rootAndLeaf)) aliases.push(rootAndLeaf);
  }
  if (dynamicParts.length > 1) {
    const base = dynamicParts[dynamicParts.length - 1];
    if (base && !aliases.includes(base)) aliases.push(base);
  }
  return aliases;
};

export const optionKeysWithAliases = (id: string, parentId?: string): string[] => {
  const aliases = optionParentAliases(parentId);
  if (!aliases.length) return [optionKey(id)];
  return aliases.map(alias => optionKey(id, alias));
};

export const getOptionStateValue = <T,>(state: Record<string, T>, id: string, parentId?: string): T | undefined => {
  const keys = optionKeysWithAliases(id, parentId);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(state, key)) return state[key];
  }
  return undefined;
};

export const mergeOptionStateValue = <T,>(
  prev: Record<string, T>,
  id: string,
  parentId: string | undefined,
  value: T
): Record<string, T> => {
  const keys = optionKeysWithAliases(id, parentId);
  let changed = false;
  const next = { ...prev };
  for (const key of keys) {
    if (next[key] === value) continue;
    next[key] = value;
    changed = true;
  }
  return changed ? next : prev;
};

export const normalizeLanguage = (lang?: string): LangCode => {
  const normalized = (lang || 'EN').toString().toUpperCase();
  return (['EN', 'FR', 'NL'].includes(normalized) ? normalized : 'EN') as LangCode;
};

export const toDependencyValue = (value: FieldValue): string | number | null | undefined => {
  if (Array.isArray(value)) {
    return value.join('|');
  }
  try {
    if (typeof FileList !== 'undefined' && value instanceof FileList) {
      const names = Array.from(value)
        .map(file => (file?.name || '').toString().trim())
        .filter(Boolean);
      return names.length ? names.join('|') : undefined;
    }
  } catch (_) {
    // Ignore environments without FileList (e.g., server-side tests)
  }
  return value as string | number | null | undefined;
};

export const buildOptionSet = (values: string[]): OptionSet | null => {
  const seen = new Set<string>();
  const unique = values
    .map(value => (value ?? '').toString().trim())
    .filter(value => {
      if (!value) return false;
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  if (!unique.length) return null;
  return { en: unique, fr: unique, nl: unique };
};

export const optionSetFromDataSourceResponse = (
  dataSource: DataSourceConfig | undefined,
  response: unknown
): OptionSet | null => {
  if (!dataSource) return null;
  const items = Array.isArray((response as any)?.items) ? (response as any).items : Array.isArray(response) ? response : [];
  if (!items.length) return null;
  const firstItem = items[0];
  if (firstItem === null || typeof firstItem !== 'object') {
    const primitiveValues = items
      .map((value: any) => (value === null || value === undefined ? '' : value.toString()))
      .filter(Boolean);
    return buildOptionSet(primitiveValues);
  }
  const mapping = dataSource?.mapping || {};
  const projection = Array.isArray(dataSource?.projection) ? dataSource?.projection : [];
  const candidateKeys = Object.keys(firstItem);

  const findMappingKey = (target: string): string | undefined =>
    Object.entries(mapping).find(([, mapped]) => mapped === target)?.[0] ||
    (mapping as any)[target];

  const pickValueKey = (): string | undefined => {
    const mappedValueKey = findMappingKey('value');
    const mappedIdKey = findMappingKey('id');
    if (mappedValueKey) return mappedValueKey;
    if (mappedIdKey) return mappedIdKey;

    // Prefer projection order when it contains a likely label column.
    const preferredOrder = [
      ...projection,
      'Dish Name',
      'Name',
      'Label',
      'Description',
      'Title',
      'value',
      'id'
    ].map(k => k.toString());

    const firstStringKey = preferredOrder.find(key => {
      if (!candidateKeys.includes(key)) return false;
      const sample = (firstItem as any)?.[key];
      return sample !== null && sample !== undefined && typeof sample === 'string';
    });
    if (firstStringKey) return firstStringKey;

    const anyStringKey = candidateKeys.find(key => typeof (firstItem as any)?.[key] === 'string');
    if (anyStringKey) return anyStringKey;

    const firstPrimitive = candidateKeys.find(key => {
      const sampleValue = (firstItem as any)?.[key];
      return sampleValue !== null && sampleValue !== undefined && typeof sampleValue !== 'object';
    });
    return firstPrimitive || candidateKeys[0];
  };

  const valueKey = pickValueKey();
  if (!valueKey) return null;
  const labelKey = (() => {
    const mappedLabelKey = findMappingKey('label');
    if (!mappedLabelKey) return '';
    return candidateKeys.includes(mappedLabelKey) ? mappedLabelKey : '';
  })();
  const tooltips: Record<string, string> = {};
  const rawWithValue = items.map((row: any) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const rawVal = row?.[valueKey];
    const val = rawVal === null || rawVal === undefined ? '' : rawVal.toString().trim();
    if (!val) return row;
    const rawLabel = labelKey ? row?.[labelKey] : undefined;
    const label = rawLabel === null || rawLabel === undefined ? '' : rawLabel.toString().trim();
    return {
      ...row,
      __ckOptionValue: val,
      ...(label ? { __ckOptionLabel: label } : {})
    };
  });
  const mappedValues = items
    .map((row: any) => {
      const rawVal = row?.[valueKey];
      const val = rawVal === null || rawVal === undefined ? '' : rawVal.toString().trim();
      if (val && dataSource.tooltipField && row?.[dataSource.tooltipField] !== undefined) {
        const tooltip = row[dataSource.tooltipField];
        if (tooltip !== null && tooltip !== undefined && tooltip !== '') {
          tooltips[val] = tooltip.toString();
        }
      }
      return val;
    })
    .filter(Boolean);
  const optionSet = buildOptionSet(mappedValues);
  if (optionSet) {
    optionSet.tooltips = tooltips;
    optionSet.raw = rawWithValue;
  }
  return optionSet;
};

export const peekOptionsFromDataSource = (
  dataSource: DataSourceConfig | undefined,
  language: LangCode
): OptionSet | null => {
  if (!dataSource) return null;
  const exact = peekCachedDataSource(dataSource, language);
  const exactOptions = optionSetFromDataSourceResponse(dataSource, exact);
  if (exactOptions) return exactOptions;

  const sourceId = (dataSource.id || 'default').toString();
  for (const candidate of peekCachedDataSourcesById(sourceId, language)) {
    const optionSet = optionSetFromDataSourceResponse(dataSource, candidate);
    if (optionSet) return optionSet;
  }
  return null;
};

export const loadOptionsFromDataSource = async (
  dataSource: DataSourceConfig | undefined,
  language: LangCode
): Promise<OptionSet | null> => {
  if (!dataSource) return null;
  try {
    const res = await fetchDataSource(dataSource, language);
    return optionSetFromDataSourceResponse(dataSource, res);
  } catch (_) {
    return null;
  }
};
