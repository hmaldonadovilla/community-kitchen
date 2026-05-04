import { buildLocalizedOptions, computeAllowedOptions, toDependencyValue } from '../../../../core';
import type { FieldValue, LangCode, OptionSet, WebQuestionDefinition } from '../../../../types';
import { optionSortFor } from '../../lineItems/domain/lineItemPresentation';
import { formatDateEeeDdMmmYyyy } from '../../../utils/valueDisplay';

export type GuidedContextHeaderPart = { id: string; displayField?: string };

const normalizePart = (part: any): GuidedContextHeaderPart | null => {
  if (part === undefined || part === null) return null;
  if (typeof part === 'object') {
    const id = ((part as any).id ?? (part as any).fieldId ?? '').toString().trim();
    if (!id) return null;
    const displayField = ((part as any).displayField ?? '').toString().trim();
    return displayField ? { id, displayField } : { id };
  }
  const id = part.toString().trim();
  return id ? { id } : null;
};

export const collectGuidedContextHeaderConfig = (
  rawConfig: any
): { parts: GuidedContextHeaderPart[]; partIds: string[]; separator: string } => {
  const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : null;
  const keyedParts: any[] = cfg
    ? Object.keys(cfg as any)
        .filter(key => /^part\d+$/i.test(key))
        .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')))
        .map(key => (cfg as any)[key])
    : [];
  const rawParts: any[] = Array.isArray(cfg?.parts)
    ? (cfg.parts as any[])
    : Array.isArray((cfg as any)?.fields)
      ? ((cfg as any).fields as any[])
      : keyedParts.length
        ? keyedParts
        : [];
  const parts = rawParts
    .map(part => normalizePart(part))
    .filter(Boolean)
    .filter((part, idx, arr) => {
      const key = `${part!.id}::${part!.displayField || ''}`;
      return arr.findIndex(entry => `${entry!.id}::${entry!.displayField || ''}` === key) === idx;
    }) as GuidedContextHeaderPart[];
  const partIds = parts.map(part => part.id).filter((id, idx, arr) => arr.indexOf(id) === idx);
  const separatorRaw = cfg?.separator;
  const separator = separatorRaw === undefined || separatorRaw === null ? '' : separatorRaw.toString();
  return { parts, partIds, separator: separator || ' | ' };
};

const buildRawValueMap = (rows: any[], valueField: string, displayField: string): Map<string, string> => {
  const map = new Map<string, string>();
  rows.forEach((row: any) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const value = row[valueField] === null || row[valueField] === undefined ? '' : String(row[valueField]).trim();
    const display = row[displayField] === null || row[displayField] === undefined ? '' : String(row[displayField]).trim();
    if (!value || !display || map.has(value)) return;
    map.set(value, display);
  });
  return map;
};

export const resolveGuidedContextHeaderValue = (args: {
  part: GuidedContextHeaderPart;
  question?: WebQuestionDefinition | null;
  raw: FieldValue | undefined;
  values: Record<string, FieldValue>;
  language: LangCode;
  optionSet?: OptionSet;
}): string => {
  const { part, question, raw, values, language, optionSet } = args;
  if (raw === undefined || raw === null || raw === '') return '';
  if (!question) return raw.toString();

  if (question.type === 'DATE') return formatDateEeeDdMmmYyyy(raw, language);

  if ((question.type === 'CHOICE' || question.type === 'CHECKBOX') && optionSet) {
    const dependencyValues = (dependsOn: string | string[]) => {
      const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
      return ids.map(id => toDependencyValue(values[id]));
    };
    const allowed = computeAllowedOptions(question.optionFilter, optionSet, dependencyValues(question.optionFilter?.dependsOn || []));
    const rawList = Array.isArray(raw) ? raw : [raw];
    const ensuredAllowed = Array.from(new Set([...allowed, ...rawList.map(v => (v ?? '').toString()).filter(Boolean)]));
    const opts = buildLocalizedOptions(optionSet, ensuredAllowed, language, { sort: optionSortFor(question) });
    const rows = Array.isArray(optionSet.raw) ? optionSet.raw : [];
    const rawDisplayByValue = part.displayField ? buildRawValueMap(rows, '__ckOptionValue', part.displayField) : new Map<string, string>();
    const rawLabelByValue = buildRawValueMap(rows, '__ckOptionValue', '__ckOptionLabel');
    const labels = rawList
      .map(v => (v ?? '').toString())
      .filter(Boolean)
      .map(v => rawDisplayByValue.get(v) || rawLabelByValue.get(v) || opts.find(o => o.value === v)?.label || v);
    return labels.filter(Boolean).join(', ');
  }

  return raw.toString();
};
