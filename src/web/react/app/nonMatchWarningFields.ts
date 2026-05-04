import { ROW_NON_MATCH_OPTIONS_KEY } from './lineItems';

/**
 * Finds fields whose warning validation depends on row non-match metadata.
 *
 * Boundary: this module reads field configuration only. It does not evaluate
 * visibility, mutate line items, or render validation feedback.
 */
export const whenContainsFieldId = (when: any, targetFieldId: string): boolean => {
  if (!when || !targetFieldId) return false;
  if (Array.isArray(when)) return when.some(entry => whenContainsFieldId(entry, targetFieldId));
  if (typeof when !== 'object') return false;
  const allList = (when as any).all ?? (when as any).and;
  if (Array.isArray(allList)) return allList.some(entry => whenContainsFieldId(entry, targetFieldId));
  const anyList = (when as any).any ?? (when as any).or;
  if (Array.isArray(anyList)) return anyList.some(entry => whenContainsFieldId(entry, targetFieldId));
  if ((when as any).not) return whenContainsFieldId((when as any).not, targetFieldId);
  const fid = (when as any).fieldId;
  if (fid === undefined || fid === null) return false;
  return fid.toString().trim() === targetFieldId.toString().trim();
};

export const resolveNonMatchWarningFieldIds = (fields: any[]): string[] => {
  const ids: string[] = [];
  (fields || []).forEach(field => {
    const fid = (field?.id ?? '').toString();
    if (!fid) return;
    const rules = Array.isArray(field?.validationRules) ? field.validationRules : [];
    const hasRule = rules.some((rule: any) => {
      const level = (rule?.level ?? '').toString().trim().toLowerCase();
      if (level && level !== 'warning' && level !== 'warn') return false;
      const when = (rule as any)?.when;
      return whenContainsFieldId(when, ROW_NON_MATCH_OPTIONS_KEY);
    });
    if (hasRule) ids.push(fid);
  });
  return ids;
};
