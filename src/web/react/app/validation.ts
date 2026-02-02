import { FieldValue, VisibilityContext } from '../../types';
import { LineItemState } from '../types';
import { GuidedStepsVirtualState, resolveVirtualStepField } from '../features/steps/domain/resolveVirtualStepField';

export const buildValidationContext = (
  values: Record<string, FieldValue>,
  lineItems: LineItemState,
  virtualState?: GuidedStepsVirtualState | null
): VisibilityContext => ({
  getValue: (fieldId: string) => {
    if (virtualState) {
      const virtual = resolveVirtualStepField(fieldId, virtualState);
      if (virtual !== undefined) return virtual;
    }
    return values[fieldId];
  },
  getLineValue: (rowId: string, fieldId: string) => {
    const [groupId] = fieldId.split('__');
    const rows = lineItems[groupId] || [];
    const match = rows.find(r => r.id === rowId);
    return match?.values[fieldId.replace(`${groupId}__`, '')];
  },
  getLineItems: (groupId: string) => lineItems[groupId] || [],
  getLineItemKeys: () => Object.keys(lineItems)
});


