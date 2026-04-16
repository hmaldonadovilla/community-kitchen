import type { DataSourceConfig, InventoryAvailabilitySnapshot } from '../../../../types';
import { peekCachedDataSource } from '../../../data/dataSources';
import type { LangCode } from '../../../types';
import { resolveReservationSourceItemKey, resolveReservationSourceKeyFieldId } from './sourceFields';

const normalizeIdValue = (raw: any): string => (raw === undefined || raw === null ? '' : String(raw).trim());

export const resolveReservationDisplayLabel = (
  config: any,
  sourceRow: Record<string, any> | null | undefined,
  fallbackItemId: string
): string => {
  const reservationConfig =
    config?.reservation && typeof config.reservation === 'object'
      ? config.reservation
      : null;
  const dialogConfig =
    reservationConfig?.conflictDialog && typeof reservationConfig.conflictDialog === 'object'
      ? reservationConfig.conflictDialog
      : null;
  const configuredFieldIds = Array.isArray(dialogConfig?.itemLabelFieldIds)
    ? dialogConfig.itemLabelFieldIds.map((entry: any) => normalizeIdValue(entry)).filter(Boolean)
    : [];
  const candidateFieldIds = [
    ...configuredFieldIds,
    normalizeIdValue(config?.dataSource?.tooltipField),
    normalizeIdValue(config?.dataSource?.labelField),
    resolveReservationSourceKeyFieldId(config)
  ].filter(Boolean);
  for (const fieldId of candidateFieldIds) {
    const value = normalizeIdValue(sourceRow?.[fieldId]);
    if (value) return value;
  }
  return fallbackItemId;
};

export const resolveReservationDisplayLabelFromCachedDataSources = (args: {
  dataSourceConfigs: DataSourceConfig[];
  language: LangCode;
  availability?: InventoryAvailabilitySnapshot | null;
  fallbackItemId?: string | null;
}): string => {
  const availability = args.availability || null;
  const fallbackItemId = normalizeIdValue(args.fallbackItemId || availability?.resourceItemId || availability?.resourceRecordId);
  if (!availability) return fallbackItemId;

  const configs = Array.isArray(args.dataSourceConfigs) ? args.dataSourceConfigs.filter(Boolean) : [];
  const resourceFormKey = normalizeIdValue(availability.resourceFormKey);
  const resourceRecordId = normalizeIdValue(availability.resourceRecordId);
  const resourceItemId = normalizeIdValue(availability.resourceItemId || fallbackItemId);

  for (const config of configs) {
    if (resourceFormKey && normalizeIdValue((config as any)?.formKey) !== resourceFormKey) continue;
    const cached = peekCachedDataSource(config, args.language);
    const items = Array.isArray(cached?.items) ? cached.items : [];
    const match =
      items.find((item: Record<string, any>) => {
        const itemRecordId = normalizeIdValue(item?.id);
        if (resourceRecordId && itemRecordId !== resourceRecordId) return false;
        if (resourceItemId && resolveReservationSourceItemKey(config, item) !== resourceItemId) return false;
        return true;
      }) || null;
    if (!match) continue;
    return resolveReservationDisplayLabel(config, match, resourceItemId || fallbackItemId);
  }

  return resourceItemId || fallbackItemId;
};
