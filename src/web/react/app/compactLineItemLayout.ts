export interface CompactLineItemLayout {
  leadingFieldIds: string[];
  primaryFieldId: string | null;
  metaFieldIds: string[];
  inlineFieldIds: string[];
  attachedDisplayFieldIdsByControl: Record<string, string[]>;
}

export const shouldRenderCompactLineItemRow = (args: {
  rowValues: Record<string, any> | undefined;
  anchorFieldId?: string;
  hideRowsWithoutAnchor?: boolean;
}): boolean => {
  const { rowValues, anchorFieldId, hideRowsWithoutAnchor } = args;
  if (!hideRowsWithoutAnchor) return true;
  const anchorId = `${anchorFieldId || ''}`.trim();
  if (!anchorId) return true;
  const rawValue = rowValues ? (rowValues as any)[anchorId] : undefined;
  if (Array.isArray(rawValue)) {
    return rawValue.some(value => `${value ?? ''}`.trim() !== '');
  }
  return `${rawValue ?? ''}`.trim() !== '';
};

const isReadOnlyCompactDisplayField = (field: any): boolean => {
  if (!field || field.type === 'CHECKBOX') return false;
  return (
    field.readOnly === true ||
    field?.ui?.renderAsLabel === true ||
    field?.renderAsLabel === true
  );
};

const isConsentCheckboxField = (field: any): boolean => {
  if (!field || field.type !== 'CHECKBOX') return false;
  const opts = field.options || field?.ui?.options;
  return !Array.isArray(opts) || opts.length === 0;
};

export const deriveCompactLineItemLayout = (fields: any[]): CompactLineItemLayout => {
  const orderedFields = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const fieldById = new Map<string, any>();
  orderedFields.forEach(field => {
    const id = field?.id ? field.id.toString() : '';
    if (id) fieldById.set(id, field);
  });

  const leadingFieldIds = orderedFields
    .filter(field => isConsentCheckboxField(field))
    .map(field => field.id.toString());

  const readOnlyDisplayFields = orderedFields.filter(field => isReadOnlyCompactDisplayField(field));
  const attachedDisplayFieldIdsByControl: Record<string, string[]> = {};
  const attachedDisplayFieldIds = new Set<string>();

  readOnlyDisplayFields.forEach(field => {
    const pairKey = field?.pair ? field.pair.toString() : '';
    if (!pairKey) return;
    const matchingControl = orderedFields.find(candidate => {
      if (!candidate || candidate.id === field.id) return false;
      if ((candidate?.pair ? candidate.pair.toString() : '') !== pairKey) return false;
      if (isReadOnlyCompactDisplayField(candidate)) return false;
      if (candidate.type === 'CHECKBOX') return false;
      return true;
    });
    if (!matchingControl?.id) return;
    const controlId = matchingControl.id.toString();
    attachedDisplayFieldIds.add(field.id.toString());
    if (!attachedDisplayFieldIdsByControl[controlId]) attachedDisplayFieldIdsByControl[controlId] = [];
    attachedDisplayFieldIdsByControl[controlId].push(field.id.toString());
  });

  const standaloneDisplayFieldIds = readOnlyDisplayFields
    .map(field => field.id.toString())
    .filter(id => !attachedDisplayFieldIds.has(id));

  const primaryFieldId = standaloneDisplayFieldIds.length ? standaloneDisplayFieldIds[0] : null;
  const metaFieldIds = standaloneDisplayFieldIds.filter(id => id !== primaryFieldId);

  const consumedFieldIds = new Set<string>([
    ...leadingFieldIds,
    ...standaloneDisplayFieldIds,
    ...Array.from(attachedDisplayFieldIds)
  ]);

  const inlineFieldIds = orderedFields
    .map(field => field.id.toString())
    .filter(id => !consumedFieldIds.has(id))
    .filter(id => fieldById.has(id));

  return {
    leadingFieldIds,
    primaryFieldId,
    metaFieldIds,
    inlineFieldIds,
    attachedDisplayFieldIdsByControl
  };
};
