import { DataSourceConfig } from '../../types';
import { FieldValue, LangCode, OptionSet } from '../types';
import { fetchDataSource } from '../data/dataSources';

export const toOptionSet = (question: any): OptionSet => {
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
      if (Object.keys(tooltips).length) optionSet.tooltips = tooltips;
      return optionSet;
    }
    return opts as OptionSet;
  }
  return {};
};

export const optionKey = (id: string, parentId?: string): string => (parentId ? `${parentId}.${id}` : id);

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

export const loadOptionsFromDataSource = async (
  dataSource: DataSourceConfig | undefined,
  language: LangCode
): Promise<OptionSet | null> => {
  if (!dataSource) return null;
  try {
    const res = await fetchDataSource(dataSource, language);
    const items = Array.isArray((res as any)?.items) ? (res as any).items : Array.isArray(res) ? res : [];
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

      // Prefer projection order when it contains a likely label column
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
    const tooltips: Record<string, string> = {};
    const rawWithValue = items.map((row: any) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const rawVal = row?.[valueKey];
      const val = rawVal === null || rawVal === undefined ? '' : rawVal.toString();
      if (!val) return row;
      return { ...row, __ckOptionValue: val };
    });
    const mappedValues = items
      .map((row: any) => {
        const rawVal = row?.[valueKey];
        const val = rawVal === null || rawVal === undefined ? '' : rawVal.toString();
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
  } catch (_) {
    return null;
  }
};
