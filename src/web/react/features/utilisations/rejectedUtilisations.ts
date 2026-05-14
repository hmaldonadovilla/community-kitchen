import type { BankAvailabilitySnapshot, BankUtilisationPlanRequest } from '../../../../types';
import type { GuidedStepRejectedUtilisationDetail } from './liveSyncEvents';
import { resolveUtilisationSourceItemKey } from './sourceFields';

const normalizeIdValue = (value: unknown): string =>
  value === undefined || value === null ? '' : `${value}`.trim();

const buildAvailabilityKey = (resourceRecordId: string, resourceItemId: string): string =>
  `${resourceRecordId}::${resourceItemId}`;

export const buildRejectedStepUtilisationEntries = (args: {
  plan: BankUtilisationPlanRequest | null | undefined;
  availability: BankAvailabilitySnapshot[] | null | undefined;
}): GuidedStepRejectedUtilisationDetail[] => {
  const utilisations = Array.isArray(args.plan?.utilisations) ? args.plan?.utilisations.filter(Boolean) : [];
  const availability = Array.isArray(args.availability) ? args.availability.filter(Boolean) : [];
  if (!utilisations.length || !availability.length) return [];

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

  const results: GuidedStepRejectedUtilisationDetail[] = [];
  const seen = new Set<string>();
  utilisations.forEach(entry => {
    const resourceRecordId = normalizeIdValue(entry.resourceRecordId);
    if (!resourceRecordId) return;
    const resourceItemId = normalizeIdValue(entry.resourceItemId);
    const matchesAvailability =
      availabilityKeys.has(buildAvailabilityKey(resourceRecordId, resourceItemId)) ||
      recordOnlyAvailability.has(resourceRecordId);
    if (!matchesAvailability) return;
    const next: GuidedStepRejectedUtilisationDetail = {
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

/**
 * Owner: rejected guided utilisation rollback.
 * Resolves the source row used to remove a rejected source-first selection.
 * Falls back to the conflict payload so rollback does not depend on stale or
 * filtered data-source cache contents.
 */
export const resolveRejectedStepUtilisationSourceRow = (args: {
  config: any;
  entry: GuidedStepRejectedUtilisationDetail;
  cachedItems?: Record<string, any>[] | null;
}): Record<string, any> | null => {
  const resourceRecordId = normalizeIdValue(args.entry?.resourceRecordId);
  const resourceItemId = normalizeIdValue(args.entry?.resourceItemId);
  if (!resourceRecordId || !resourceItemId) return null;

  const cachedItems = Array.isArray(args.cachedItems) ? args.cachedItems : [];
  const cachedMatch =
    cachedItems.find(item => {
      if (!item || typeof item !== 'object') return false;
      if (normalizeIdValue(item.id) !== resourceRecordId) return false;
      return resolveUtilisationSourceItemKey(args.config, item) === resourceItemId;
    }) || null;
  if (cachedMatch) return cachedMatch;

  const keyFieldId = normalizeIdValue(args.config?.rowKeyFieldId);
  if (!keyFieldId) return null;
  return {
    id: resourceRecordId,
    [keyFieldId]: resourceItemId
  };
};
