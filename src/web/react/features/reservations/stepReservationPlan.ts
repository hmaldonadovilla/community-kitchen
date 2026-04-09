import type {
  InventoryReservationPlanRequest,
  InventoryReservationPlanScope,
  WebFormDefinition
} from '../../../../types';
import type { LineItemState } from '../../types';
import { buildSubgroupKey } from '../../app/lineItems';
import { getReservationCommitMode } from '../../components/form/reservationSyncPolicy';

const toFiniteNumber = (raw: unknown): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveOutputGroupKey = (parentGroupId: string, parentRowId: string, outputGroupId: string): string =>
  buildSubgroupKey(parentGroupId, parentRowId, outputGroupId);

const normalizeStepId = (raw: any): string => (raw === undefined || raw === null ? '' : raw.toString().trim());

const stableStringify = (value: any): string => JSON.stringify(value);

const buildManagedScopeKey = (scope: InventoryReservationPlanScope): string =>
  [
    normalizeStepId(scope?.sourceParentGroupId),
    normalizeStepId(scope?.sourceParentRowId),
    normalizeStepId(scope?.sourceOutputGroupId)
  ].join('::');

const dedupeManagedScopes = (
  scopes: InventoryReservationPlanScope[] | undefined | null
): InventoryReservationPlanScope[] => {
  const seen = new Set<string>();
  const next: InventoryReservationPlanScope[] = [];
  (Array.isArray(scopes) ? scopes : []).forEach(scope => {
    const key = buildManagedScopeKey(scope || {});
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push({
      sourceParentGroupId: normalizeStepId(scope?.sourceParentGroupId),
      sourceParentRowId: normalizeStepId(scope?.sourceParentRowId),
      sourceOutputGroupId: normalizeStepId(scope?.sourceOutputGroupId)
    });
  });
  return next;
};

const inferReservationFieldId = (outputKeyFieldId: string, suffix: 'RECORD_ID' | 'KIND' | 'UNIT'): string => {
  const base = outputKeyFieldId.endsWith('_ID') ? outputKeyFieldId.slice(0, -3) : outputKeyFieldId;
  return base ? `${base}_${suffix}` : '';
};

export const buildStepInventoryReservationPlan = (args: {
  definition: WebFormDefinition;
  stepId: string;
  formKey: string;
  recordId: string;
  lineItems: LineItemState;
  mode?: 'step' | 'all';
  previousManagedScopes?: InventoryReservationPlanScope[];
}): InventoryReservationPlanRequest | null => {
  const formKey = (args.formKey || '').toString().trim();
  const recordId = (args.recordId || '').toString().trim();
  if (!formKey || !recordId) return null;

  const stepsCfg = (args.definition as any)?.steps;
  const stepId = normalizeStepId(args.stepId);
  if (stepsCfg?.mode !== 'guided' || !stepId) return null;
  const stepItems = Array.isArray(stepsCfg.items) ? stepsCfg.items : [];
  const steps =
    args.mode === 'all'
      ? stepItems
      : stepItems.filter((candidate: any) => normalizeStepId(candidate?.id) === stepId);
  if (!steps.length) return null;

  const reservations: NonNullable<InventoryReservationPlanRequest['reservations']> = [];
  const managedScopes: NonNullable<InventoryReservationPlanRequest['managedScopes']> = [];
  let hasStepManagedReservation = false;

  steps.forEach((step: any) => {
    (Array.isArray(step.include) ? step.include : []).forEach((target: any) => {
      if (!target || target.kind !== 'lineGroup') return;
      const parentGroupId = normalizeStepId(target.id);
      if (!parentGroupId) return;
      const parentRows = Array.isArray(args.lineItems[parentGroupId]) ? args.lineItems[parentGroupId] : [];
      const dataSourceRows = Array.isArray(target.dataSourceRows) ? target.dataSourceRows : [];
      dataSourceRows.forEach((config: any) => {
        const reservationConfig =
          config?.reservation && typeof config.reservation === 'object' ? config.reservation : null;
        if (!reservationConfig || reservationConfig.enabled === false) return;
        if (getReservationCommitMode(reservationConfig) !== 'step') return;
        const resourceFormKey = `${config?.dataSource?.formKey || reservationConfig.resourceFormKey || ''}`.trim();
        const outputGroupId = `${config?.outputGroupId || ''}`.trim();
        const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
        const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
        const resourceRecordIdFieldId = `${
          reservationConfig.resourceRecordIdFieldId || inferReservationFieldId(outputKeyFieldId, 'RECORD_ID') || ''
        }`.trim();
        const resourceKindFieldId = `${
          reservationConfig.resourceKindFieldId || inferReservationFieldId(outputKeyFieldId, 'KIND') || ''
        }`.trim();
        const resourceUnitFieldId = `${
          reservationConfig.resourceUnitFieldId || inferReservationFieldId(outputKeyFieldId, 'UNIT') || ''
        }`.trim();
        if (!resourceFormKey || !outputGroupId || !outputKeyFieldId || !quantityFieldId) return;
        hasStepManagedReservation = true;

        parentRows.forEach((parentRow: any) => {
          const parentRowId = normalizeStepId(parentRow?.id);
          if (!parentRowId) return;
          managedScopes.push({
            sourceParentGroupId: parentGroupId,
            sourceParentRowId: parentRowId,
            sourceOutputGroupId: outputGroupId
          });
          const outputGroupKey = resolveOutputGroupKey(parentGroupId, parentRowId, outputGroupId);
          const outputRows = Array.isArray(args.lineItems[outputGroupKey]) ? args.lineItems[outputGroupKey] : [];
          outputRows.forEach((row: any) => {
            const values = (row?.values || {}) as Record<string, any>;
            const resourceRecordId = `${values[resourceRecordIdFieldId] ?? ''}`.trim();
            const resourceItemId = `${values[outputKeyFieldId] ?? ''}`.trim();
            const quantity = toFiniteNumber(values[quantityFieldId]);
            if (!resourceRecordId || !resourceItemId || quantity <= 0) return;
            reservations.push({
              resourceFormKey,
              resourceRecordId,
              resourceItemId,
              resourceKind: resourceKindFieldId ? `${values[resourceKindFieldId] ?? ''}`.trim() || undefined : undefined,
              quantity,
              unit: resourceUnitFieldId ? `${values[resourceUnitFieldId] ?? ''}`.trim() || undefined : undefined,
              sourceParentGroupId: parentGroupId,
              sourceParentRowId: parentRowId,
              sourceOutputGroupId: outputGroupId,
              sourceOutputRowId: normalizeStepId(row?.id) || undefined,
              sourceOutputKeyFieldId: outputKeyFieldId,
              allowedStatuses: Array.isArray(reservationConfig.allowedStatuses) ? reservationConfig.allowedStatuses : undefined
            });
          });
        });
      });
    });
  });

  if (!hasStepManagedReservation) return null;

  const mergedManagedScopes = dedupeManagedScopes([
    ...(Array.isArray(args.previousManagedScopes) ? args.previousManagedScopes : []),
    ...managedScopes
  ]);

  return {
    sourceFormKey: formKey,
    sourceRecordId: recordId,
    managedScopes: mergedManagedScopes,
    reservations,
    refreshMode: 'revisionOnly'
  };
};

export const buildInventoryReservationPlanFingerprint = (plan: InventoryReservationPlanRequest | null): string => {
  if (!plan) return '';
  return stableStringify({
    sourceFormKey: normalizeStepId(plan.sourceFormKey),
    sourceRecordId: normalizeStepId(plan.sourceRecordId),
    ledgerFormKey: normalizeStepId(plan.ledgerFormKey),
    refreshMode: normalizeStepId(plan.refreshMode),
    managedScopes: dedupeManagedScopes(plan.managedScopes).sort((left, right) =>
      buildManagedScopeKey(left).localeCompare(buildManagedScopeKey(right))
    ),
    reservations: (Array.isArray(plan.reservations) ? plan.reservations : [])
      .map(entry => ({
        resourceFormKey: normalizeStepId(entry.resourceFormKey),
        resourceRecordId: normalizeStepId(entry.resourceRecordId),
        resourceItemId: normalizeStepId(entry.resourceItemId),
        resourceKind: normalizeStepId(entry.resourceKind),
        quantity: toFiniteNumber(entry.quantity),
        unit: normalizeStepId(entry.unit),
        sourceParentGroupId: normalizeStepId(entry.sourceParentGroupId),
        sourceParentRowId: normalizeStepId(entry.sourceParentRowId),
        sourceOutputGroupId: normalizeStepId(entry.sourceOutputGroupId),
        sourceOutputRowId: normalizeStepId(entry.sourceOutputRowId),
        sourceOutputKeyFieldId: normalizeStepId(entry.sourceOutputKeyFieldId),
        allowedStatuses: Array.isArray(entry.allowedStatuses) ? entry.allowedStatuses.map(normalizeStepId).sort() : []
      }))
      .sort((left, right) =>
        stableStringify(left).localeCompare(stableStringify(right))
      )
  });
};
