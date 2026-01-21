import { FieldValue, VisibilityContext } from '../../types';
import { LineItemState } from '../types';

export const buildValidationContext = (values: Record<string, FieldValue>, lineItems: LineItemState): VisibilityContext => ({
  getValue: (fieldId: string) => values[fieldId],
  getLineValue: (rowId: string, fieldId: string) => {
    const [groupId] = fieldId.split('__');
    const rows = lineItems[groupId] || [];
    const match = rows.find(r => r.id === rowId);
    return match?.values[fieldId.replace(`${groupId}__`, '')];
  },
  getLineItems: (groupId: string) => lineItems[groupId] || []
});



