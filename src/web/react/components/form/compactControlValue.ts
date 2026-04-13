import type { FieldValue } from '../../../types';

export const resolveCompactTextControlDisplayValue = (args: {
  explicitValue: FieldValue;
  fallbackValue?: string;
  preserveEmptyWhileEditing?: boolean;
}): string => {
  const explicitText =
    args.explicitValue === undefined || args.explicitValue === null ? '' : String(args.explicitValue);
  if (args.preserveEmptyWhileEditing) return explicitText;
  const fallbackText = (args.fallbackValue || '').toString();
  return explicitText || fallbackText || '';
};
