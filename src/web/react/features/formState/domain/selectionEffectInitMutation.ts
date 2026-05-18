import type { FieldValue } from '../../../../types';
import { areFieldValuesEqual } from '../../lineItems/domain/formViewHelpers';

export const shouldSkipSelectionEffectInitValueWrite = (args: {
  source: 'user' | 'selectionEffectInit';
  currentValue: FieldValue;
  nextValue: FieldValue;
}): boolean => args.source === 'selectionEffectInit' && areFieldValuesEqual(args.currentValue, args.nextValue);
