const normalizeIdValue = (raw: any): string => (raw === undefined || raw === null ? '' : String(raw).trim());

const inferUtilisationFieldId = (outputKeyFieldId: string, suffix: 'RECORD_ID' | 'KIND' | 'UNIT'): string => {
  const base = outputKeyFieldId.endsWith('_ID') ? outputKeyFieldId.slice(0, -3) : outputKeyFieldId;
  return base ? `${base}_${suffix}` : '';
};

export const hasStructuredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

export const resolveUtilisationSourceKeyFieldId = (config: any): string =>
  normalizeIdValue(
    config?.availability?.sourceKeyFieldId ||
      config?.dataSource?.rowKeyFieldId ||
      config?.dataSource?.mapping?.value ||
      config?.mapping?.value ||
      config?.outputKeyFieldId ||
      config?.rowKeyFieldId
  );

export const resolveUtilisationResourceFieldIds = (config: any): {
  keyFieldId: string;
  kindFieldId: string;
  unitFieldId: string;
} => {
  const outputKeyFieldId = normalizeIdValue(config?.outputKeyFieldId || config?.rowKeyFieldId);
  const utilisationConfig =
    config?.utilisation && typeof config.utilisation === 'object'
      ? config.utilisation
      : null;
  return {
    keyFieldId: resolveUtilisationSourceKeyFieldId(config),
    kindFieldId: normalizeIdValue(
      utilisationConfig?.resourceKindFieldId || inferUtilisationFieldId(outputKeyFieldId, 'KIND')
    ),
    unitFieldId: normalizeIdValue(
      utilisationConfig?.resourceUnitFieldId || inferUtilisationFieldId(outputKeyFieldId, 'UNIT')
    )
  };
};

export const resolveUtilisationSourceItemKey = (
  config: any,
  item: Record<string, any> | null | undefined
): string => {
  if (!item || typeof item !== 'object') return '';
  const keyFieldId = resolveUtilisationSourceKeyFieldId(config);
  if (keyFieldId && hasStructuredValue(item[keyFieldId])) {
    return normalizeIdValue(item[keyFieldId]);
  }
  return normalizeIdValue(item.id);
};
