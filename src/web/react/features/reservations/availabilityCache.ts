import type { DataSourceConfig, InventoryAvailabilitySnapshot } from '../../../../types';
import type { LangCode } from '../../../types';
import { mutateCachedDataSource } from '../../../data/dataSources';
import {
  applyInventoryAvailabilitySnapshotToRow,
  normalizeInventoryAvailabilitySnapshotForDisplay
} from './availabilitySnapshots';
import { resolveReservationSourceItemKey } from './sourceFields';

export interface InventoryAvailabilityCacheSyncResult {
  updatedDataSourceIds: string[];
  updatedRows: number;
}

const normalizeFormKey = (value: any): string => `${value || ''}`.trim();

export const applyInventoryAvailabilitySnapshotsToCachedDataSources = (args: {
  dataSourceConfigs: DataSourceConfig[];
  language: LangCode;
  availability: InventoryAvailabilitySnapshot[] | null | undefined;
}): InventoryAvailabilityCacheSyncResult => {
  const configs = Array.isArray(args.dataSourceConfigs) ? args.dataSourceConfigs.filter(Boolean) : [];
  const availability = Array.isArray(args.availability)
    ? args.availability
        .filter(Boolean)
        .map(snapshot => normalizeInventoryAvailabilitySnapshotForDisplay(snapshot))
    : [];
  if (!configs.length || !availability.length) {
    return { updatedDataSourceIds: [], updatedRows: 0 };
  }

  const availabilityByFormKey = new Map<string, InventoryAvailabilitySnapshot[]>();
  availability.forEach(snapshot => {
    const formKey = normalizeFormKey(snapshot.resourceFormKey);
    if (!formKey) return;
    const existing = availabilityByFormKey.get(formKey);
    if (existing) {
      existing.push(snapshot);
      return;
    }
    availabilityByFormKey.set(formKey, [snapshot]);
  });

  let updatedRows = 0;
  const updatedDataSourceIds = new Set<string>();

  configs.forEach(config => {
    const matches = availabilityByFormKey.get(normalizeFormKey(config?.formKey));
    if (!matches?.length) return;
    let configRowUpdates = 0;
    const next = mutateCachedDataSource(config, args.language, items =>
      items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const snapshot =
          matches.find(candidate => {
            const resourceRecordId = `${candidate.resourceRecordId || ''}`.trim();
            if (!resourceRecordId || `${item.id ?? ''}`.trim() !== resourceRecordId) return false;
            if (!candidate.resourceItemId) return true;
            return resolveReservationSourceItemKey(config, item) === `${candidate.resourceItemId}`.trim();
          }) || null;
        if (!snapshot) return item;
        const nextItem = applyInventoryAvailabilitySnapshotToRow(item, snapshot);
        if (nextItem !== item) {
          configRowUpdates += 1;
        }
        return nextItem;
      })
    );
    if (!next || configRowUpdates <= 0) return;
    updatedRows += configRowUpdates;
    updatedDataSourceIds.add(`${config?.id || ''}`.trim() || 'default');
  });

  return {
    updatedDataSourceIds: Array.from(updatedDataSourceIds).filter(Boolean),
    updatedRows
  };
};
