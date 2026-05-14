import { FieldValue, LineItemRowState, WebQuestionDefinition } from '../../types';
import { getSystemFieldValue, SystemRecordMeta } from '../../rules/systemFields';
import { shouldHideField } from '../../rules/visibility';

export type HtmlTemplateActionGateInput = {
  button?: WebQuestionDefinition | null;
  action?: string | null;
  source?: string | null;
  values?: Record<string, FieldValue>;
  lineItems?: Record<string, LineItemRowState[]>;
  recordMeta?: SystemRecordMeta | null;
};

export const isHiddenHtmlTemplateUpdateRecordAction = (input: HtmlTemplateActionGateInput): boolean => {
  if (input.source !== 'htmlTemplate') return false;
  if ((input.action || '').toString().trim() !== 'updateRecord') return false;
  if (!input.button) return false;

  return shouldHideField(input.button.visibility, {
    getValue: (fieldId: string) => {
      const direct = input.values?.[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct;
      const systemValue = getSystemFieldValue(fieldId, input.recordMeta);
      return systemValue !== undefined ? (systemValue as FieldValue) : undefined;
    },
    getLineItems: (groupId: string) => input.lineItems?.[groupId] || [],
    getLineItemKeys: () => Object.keys(input.lineItems || {})
  });
};
