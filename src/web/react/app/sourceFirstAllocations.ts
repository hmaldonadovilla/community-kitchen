export type SourceFirstAllocationLabelVisibility = 'multiple' | 'always';

export const resolveSourceFirstAllocationLabelVisibility = (
  raw: any
): SourceFirstAllocationLabelVisibility => {
  const normalized = (raw ?? '').toString().trim().toLowerCase();
  return normalized === 'always' ? 'always' : 'multiple';
};

export const shouldShowSourceFirstAllocationLabel = (args: {
  allocationLabelFieldId?: string | null;
  allocationLabelVisibility?: any;
  parentRows: Array<{ values?: Record<string, any> }>;
}): boolean => {
  const allocationLabelFieldId = (args.allocationLabelFieldId ?? '').toString().trim();
  if (!allocationLabelFieldId) return false;

  const distinctAllocationLabels = Array.from(
    new Set(
      (Array.isArray(args.parentRows) ? args.parentRows : [])
        .map(parentRow => `${parentRow?.values?.[allocationLabelFieldId] ?? ''}`.trim())
        .filter(Boolean)
    )
  );
  if (!distinctAllocationLabels.length) return false;

  const visibility = resolveSourceFirstAllocationLabelVisibility(args.allocationLabelVisibility);
  if (visibility === 'always') return true;
  return distinctAllocationLabels.length > 1;
};
