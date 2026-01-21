import { LineItemGroupConfig, QuestionConfig, WhenClause } from '../../../types';
import { FieldValue, VisibilityContext } from '../../../web/types';
import { matchesWhenClause } from '../../../web/rules/visibility';
import { resolveLineItemTokenValue } from './lineItemPlaceholders';
import { debugLog } from '../debug';

/**
 * Template `when` helpers for line-item row filtering.
 * Responsibility: parse and evaluate WhenClause objects against row/subgroup data.
 */
export const parseTemplateWhenClause = (raw: string): WhenClause | null => {
  const text = (raw || '').toString().trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WhenClause;
  } catch (err: any) {
    debugLog('followup.excludeWhenWhen.parseFailed', {
      message: (err?.message || 'Invalid JSON').toString(),
      raw: text.slice(0, 200)
    });
    return null;
  }
};

export const matchesTemplateWhenClause = (args: {
  when: WhenClause;
  group: QuestionConfig;
  rowData: Record<string, any>;
  subGroup?: LineItemGroupConfig;
  subGroupToken?: string;
  lineItemRows: Record<string, any[]>;
}): boolean => {
  const { when, group, rowData, subGroup, subGroupToken, lineItemRows } = args;
  if (!when) return false;

  const resolveRowValue = (fieldIdRaw: string): FieldValue | undefined => {
    const fieldId = (fieldIdRaw || '').toString().trim();
    if (!fieldId) return undefined;
    if (fieldId.includes('.')) {
      return resolveLineItemTokenValue({
        token: fieldId,
        group,
        rowData,
        subGroup,
        subGroupToken
      }) as FieldValue;
    }
    if (Object.prototype.hasOwnProperty.call(rowData || {}, fieldId)) return (rowData as any)[fieldId] as FieldValue;
    const parent = (rowData as any)?.__parent;
    if (parent && Object.prototype.hasOwnProperty.call(parent || {}, fieldId)) return (parent as any)[fieldId] as FieldValue;
    return undefined;
  };

  const ctx: VisibilityContext = {
    getValue: resolveRowValue,
    getLineValue: (_rowId: string, fieldId: string) => resolveRowValue(fieldId),
    getLineItems: (groupId: string) => (lineItemRows || {})[groupId] || []
  };

  return matchesWhenClause(when, ctx);
};
