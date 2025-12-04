import { DataSourceConfig } from '../../types';
import { FieldValue, LangCode, OptionSet } from '../types';
import { fetchDataSource } from '../data/dataSources';

export const toOptionSet = (question: any): OptionSet => {
  if (question?.options?.en || question?.options?.fr || question?.options?.nl) {
    return question.options as OptionSet;
  }
  if (question.options) {
    const opts = question.options as any;
    if (Array.isArray(opts)) {
      return { en: opts, fr: (question as any).optionsFr, nl: (question as any).optionsNl };
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
    const candidateKeys = Object.keys(firstItem);
    const valueKey =
      (mapping as any).value ||
      (mapping as any).id ||
      candidateKeys.find(key => {
        const sampleValue = (firstItem as any)?.[key];
        return sampleValue !== null && sampleValue !== undefined && typeof sampleValue !== 'object';
      }) ||
      candidateKeys[0];
    if (!valueKey) return null;
    const mappedValues = items
      .map((row: any) => (row?.[valueKey] ?? '').toString())
      .filter(Boolean);
    return buildOptionSet(mappedValues);
  } catch (_) {
    return null;
  }
};


