import { FieldDisableRule, WhenClause } from '../../types';

const normalizeFieldId = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

export type ActiveFieldDisableRule = {
  id?: string;
  when: WhenClause;
  bypassFields: string[];
  bypassFieldIdSet: Set<string>;
};

export const resolveActiveFieldDisableRule = (args: {
  rules?: FieldDisableRule[];
  matchesWhen: (when: WhenClause) => boolean;
}): ActiveFieldDisableRule | undefined => {
  const rules = Array.isArray(args.rules) ? args.rules : [];
  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== 'object') continue;
    const when = (rawRule as any).when as WhenClause | undefined;
    if (!when || typeof when !== 'object') continue;
    if (!args.matchesWhen(when)) continue;
    const bypassRaw = Array.isArray(rawRule.bypassFields) ? rawRule.bypassFields : [];
    const bypassFields = bypassRaw
      .map((entry: unknown) => normalizeFieldId(entry))
      .filter(Boolean);
    const bypassFieldIdSet = new Set<string>(bypassFields.flatMap((id: string) => [id, id.toLowerCase()]));
    const id = normalizeFieldId(rawRule.id) || undefined;
    return { id, when, bypassFields, bypassFieldIdSet };
  }
  return undefined;
};

export const isFieldDisabledByRule = (fieldId: string, activeRule?: ActiveFieldDisableRule): boolean => {
  if (!activeRule) return false;
  const id = normalizeFieldId(fieldId);
  if (!id) return false;
  if (activeRule.bypassFieldIdSet.has(id) || activeRule.bypassFieldIdSet.has(id.toLowerCase())) return false;
  return true;
};
