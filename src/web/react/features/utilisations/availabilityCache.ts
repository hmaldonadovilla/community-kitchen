import type { DataSourceConfig, BankAvailabilitySnapshot } from '../../../../types';
import type { LangCode } from '../../../types';
import { mutateCachedDataSource } from '../../../data/dataSources';
import {
  applyBankAvailabilitySnapshotToRow,
  normalizeBankAvailabilitySnapshotForDisplay
} from './availabilitySnapshots';
import { resolveUtilisationSourceItemKey } from './sourceFields';

export interface BankAvailabilityCacheSyncResult {
  updatedDataSourceIds: string[];
  updatedRows: number;
}

const normalizeFormKey = (value: any): string => `${value || ''}`.trim();

export const applyBankAvailabilitySnapshotsToCachedDataSources = (args: {
  dataSourceConfigs: DataSourceConfig[];
  language: LangCode;
  availability: BankAvailabilitySnapshot[] | null | undefined;
}): BankAvailabilityCacheSyncResult => {
  const configs = Array.isArray(args.dataSourceConfigs) ? args.dataSourceConfigs.filter(Boolean) : [];
  const availability = Array.isArray(args.availability)
    ? args.availability
        .filter(Boolean)
        .map(snapshot => normalizeBankAvailabilitySnapshotForDisplay(snapshot))
    : [];
  if (!configs.length || !availability.length) {
    return { updatedDataSourceIds: [], updatedRows: 0 };
  }

  const availabilityByFormKey = new Map<string, BankAvailabilitySnapshot[]>();
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
            return resolveUtilisationSourceItemKey(config, item) === `${candidate.resourceItemId}`.trim();
          }) || null;
        if (!snapshot) return item;
        const nextItem = applyBankAvailabilitySnapshotToRow(item, snapshot);
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
