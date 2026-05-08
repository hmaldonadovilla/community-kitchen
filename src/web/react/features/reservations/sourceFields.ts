const normalizeIdValue = (raw: any): string => (raw === undefined || raw === null ? '' : String(raw).trim());

const inferReservationFieldId = (outputKeyFieldId: string, suffix: 'RECORD_ID' | 'KIND' | 'UNIT'): string => {
  const base = outputKeyFieldId.endsWith('_ID') ? outputKeyFieldId.slice(0, -3) : outputKeyFieldId;
  return base ? `${base}_${suffix}` : '';
};

export const hasStructuredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

export const resolveReservationSourceKeyFieldId = (config: any): string =>
  normalizeIdValue(
    config?.availability?.sourceKeyFieldId ||
      config?.dataSource?.rowKeyFieldId ||
      config?.dataSource?.mapping?.value ||
      config?.mapping?.value ||
      config?.outputKeyFieldId ||
      config?.rowKeyFieldId
  );

export const resolveReservationResourceFieldIds = (config: any): {
  keyFieldId: string;
  kindFieldId: string;
  unitFieldId: string;
} => {
  const outputKeyFieldId = normalizeIdValue(config?.outputKeyFieldId || config?.rowKeyFieldId);
  const reservationConfig =
    config?.reservation && typeof config.reservation === 'object'
      ? config.reservation
      : null;
  return {
    keyFieldId: resolveReservationSourceKeyFieldId(config),
    kindFieldId: normalizeIdValue(
      reservationConfig?.resourceKindFieldId || inferReservationFieldId(outputKeyFieldId, 'KIND')
    ),
    unitFieldId: normalizeIdValue(
      reservationConfig?.resourceUnitFieldId || inferReservationFieldId(outputKeyFieldId, 'UNIT')
    )
  };
};

export const resolveReservationSourceItemKey = (
  config: any,
  item: Record<string, any> | null | undefined
): string => {
  if (!item || typeof item !== 'object') return '';
  const keyFieldId = resolveReservationSourceKeyFieldId(config);
  if (keyFieldId && hasStructuredValue(item[keyFieldId])) {
    return normalizeIdValue(item[keyFieldId]);
  }
  return normalizeIdValue(item.id);
};
