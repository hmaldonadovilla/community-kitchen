import type { InventoryAvailabilitySnapshot, InventoryReservationPlanRequest } from '../../../../types';
import type { GuidedStepRejectedReservationDetail } from './liveSyncEvents';

const normalizeIdValue = (value: unknown): string =>
  value === undefined || value === null ? '' : `${value}`.trim();

const buildAvailabilityKey = (resourceRecordId: string, resourceItemId: string): string =>
  `${resourceRecordId}::${resourceItemId}`;

export const buildRejectedStepReservationEntries = (args: {
  plan: InventoryReservationPlanRequest | null | undefined;
  availability: InventoryAvailabilitySnapshot[] | null | undefined;
}): GuidedStepRejectedReservationDetail[] => {
  const reservations = Array.isArray(args.plan?.reservations) ? args.plan?.reservations.filter(Boolean) : [];
  const availability = Array.isArray(args.availability) ? args.availability.filter(Boolean) : [];
  if (!reservations.length || !availability.length) return [];

  const availabilityKeys = new Set<string>();
  const recordOnlyAvailability = new Set<string>();
  availability.forEach(snapshot => {
    const resourceRecordId = normalizeIdValue(snapshot.resourceRecordId);
    if (!resourceRecordId) return;
    const resourceItemId = normalizeIdValue(snapshot.resourceItemId);
    if (resourceItemId) {
      availabilityKeys.add(buildAvailabilityKey(resourceRecordId, resourceItemId));
      return;
    }
    recordOnlyAvailability.add(resourceRecordId);
  });

  const results: GuidedStepRejectedReservationDetail[] = [];
  const seen = new Set<string>();
  reservations.forEach(entry => {
    const resourceRecordId = normalizeIdValue(entry.resourceRecordId);
    if (!resourceRecordId) return;
    const resourceItemId = normalizeIdValue(entry.resourceItemId);
    const matchesAvailability =
      availabilityKeys.has(buildAvailabilityKey(resourceRecordId, resourceItemId)) ||
      recordOnlyAvailability.has(resourceRecordId);
    if (!matchesAvailability) return;
    const next: GuidedStepRejectedReservationDetail = {
      sourceParentGroupId: normalizeIdValue(entry.sourceParentGroupId) || undefined,
      sourceParentRowId: normalizeIdValue(entry.sourceParentRowId) || undefined,
      sourceOutputGroupId: normalizeIdValue(entry.sourceOutputGroupId) || undefined,
      sourceOutputRowId: normalizeIdValue(entry.sourceOutputRowId) || undefined,
      sourceOutputKeyFieldId: normalizeIdValue(entry.sourceOutputKeyFieldId) || undefined,
      resourceRecordId,
      resourceItemId: resourceItemId || undefined
    };
    const key = [
      next.sourceParentGroupId || '',
      next.sourceParentRowId || '',
      next.sourceOutputGroupId || '',
      next.sourceOutputRowId || '',
      next.sourceOutputKeyFieldId || '',
      next.resourceRecordId,
      next.resourceItemId || ''
    ].join('::');
    if (seen.has(key)) return;
    seen.add(key);
    results.push(next);
  });

  return results;
};
