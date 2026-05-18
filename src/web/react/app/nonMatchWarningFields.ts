import type { FieldValue, WebFormDefinition } from '../../types';
import type { LineItemState } from '../types';
import {
  buildSubgroupKey,
  parseRowNonMatchOptions,
  recomputeLineItemNonMatchOptions,
  resolveSubgroupKey,
  ROW_NON_MATCH_OPTIONS_KEY
} from './lineItems';

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

export const buildCanonicalNonMatchWarningLineItems = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  subgroupSelectors?: Record<string, string>;
}): LineItemState =>
  recomputeLineItemNonMatchOptions({
    definition: args.definition,
    values: args.values,
    lineItems: args.lineItems,
    subgroupSelectors: args.subgroupSelectors
  }).lineItems;

export const collectNonMatchWarningPaths = (args: {
  definition: WebFormDefinition;
  lineItems: LineItemState;
}): Set<string> => {
  const nextPaths = new Set<string>();
  (args.definition.questions || []).forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const targetFieldIds = resolveNonMatchWarningFieldIds(q.lineItemConfig?.fields || []);
    const rows = args.lineItems[q.id] || [];
    if (targetFieldIds.length) {
      rows.forEach(row => {
        const nonMatch = parseRowNonMatchOptions((row as any)?.values?.[ROW_NON_MATCH_OPTIONS_KEY]);
        if (!nonMatch.length) return;
        targetFieldIds.forEach(fid => nextPaths.add(`${q.id}__${fid}__${row.id}`));
      });
    }
    const subGroups = q.lineItemConfig?.subGroups || [];
    if (!subGroups.length) return;
    rows.forEach(row => {
      subGroups.forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const subTargetFieldIds = resolveNonMatchWarningFieldIds((sub as any)?.fields || []);
        if (!subTargetFieldIds.length) return;
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        const subRows = args.lineItems[subKey] || [];
        subRows.forEach(subRow => {
          const nonMatch = parseRowNonMatchOptions((subRow as any)?.values?.[ROW_NON_MATCH_OPTIONS_KEY]);
          if (!nonMatch.length) return;
          subTargetFieldIds.forEach(fid => nextPaths.add(`${subKey}__${fid}__${subRow.id}`));
        });
      });
    });
  });
  return nextPaths;
};
