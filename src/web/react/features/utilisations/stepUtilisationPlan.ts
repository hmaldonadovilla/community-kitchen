import type {
  BankUtilisationPlanRequest,
  BankUtilisationPlanScope,
  WebFormDefinition
} from '../../../../types';
import type { LineItemState } from '../../types';
import { buildSubgroupKey } from '../../app/lineItems';
import { getUtilisationCommitMode } from '../../components/form/utilisationSyncPolicy';

const toFiniteNumber = (raw: unknown): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveOutputGroupKey = (parentGroupId: string, parentRowId: string, outputGroupId: string): string =>
  buildSubgroupKey(parentGroupId, parentRowId, outputGroupId);

const normalizeStepId = (raw: any): string => (raw === undefined || raw === null ? '' : raw.toString().trim());

const stableStringify = (value: any): string => JSON.stringify(value);

const cloneLineItemRow = (row: any): any => ({
  ...(row || {}),
  values: { ...(((row || {}).values || {}) as Record<string, any>) }
});

const cloneLineItemRows = (rows: any[] | undefined | null): any[] =>
  (Array.isArray(rows) ? rows : []).map(cloneLineItemRow);

const buildManagedScopeKey = (scope: BankUtilisationPlanScope): string =>
  [
    normalizeStepId(scope?.sourceParentGroupId),
    normalizeStepId(scope?.sourceParentRowId),
    normalizeStepId(scope?.sourceOutputGroupId)
  ].join('::');

const dedupeManagedScopes = (
  scopes: BankUtilisationPlanScope[] | undefined | null
): BankUtilisationPlanScope[] => {
  const seen = new Set<string>();
  const next: BankUtilisationPlanScope[] = [];
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

const inferUtilisationFieldId = (outputKeyFieldId: string, suffix: 'RECORD_ID' | 'KIND' | 'UNIT'): string => {
  const base = outputKeyFieldId.endsWith('_ID') ? outputKeyFieldId.slice(0, -3) : outputKeyFieldId;
  return base ? `${base}_${suffix}` : '';
};

type StepManagedUtilisationConfig = {
  stepId: string;
  parentGroupId: string;
  resourceFormKey: string;
  outputGroupId: string;
  outputKeyFieldId: string;
  quantityFieldId: string;
  resourceRecordIdFieldId: string;
  resourceKindFieldId: string;
  resourceUnitFieldId: string;
  allowedStatuses?: string[];
};

export type GuidedUtilisationManagedRowRemovalImpact = {
  stepId: string;
  parentGroupId: string;
  parentRowId: string;
  outputGroupId: string;
  removedRowIds: string[];
};

export type GuidedUtilisationManagedRowRemovalDetectionScope = {
  stepId: string;
  mode: 'step';
};

export const resolveGuidedUtilisationManagedRowRemovalDetectionScope = (
  activeStepId: unknown
): GuidedUtilisationManagedRowRemovalDetectionScope | null => {
  const stepId = normalizeStepId(activeStepId);
  return stepId ? { stepId, mode: 'step' } : null;
};

export const buildGuidedUtilisationManagedRowRemovalFingerprint = (args: {
  recordId?: unknown;
  activeStepId?: unknown;
  impacts: GuidedUtilisationManagedRowRemovalImpact[];
}): string => {
  const impactSignature = (Array.isArray(args.impacts) ? args.impacts : [])
    .map(impact =>
      [
        normalizeStepId(impact?.stepId),
        normalizeStepId(impact?.parentGroupId),
        normalizeStepId(impact?.parentRowId),
        normalizeStepId(impact?.outputGroupId),
        (Array.isArray(impact?.removedRowIds) ? impact.removedRowIds : [])
          .map(normalizeStepId)
          .filter(Boolean)
          .sort()
          .join(',')
      ].join(':')
    )
    .filter(Boolean)
    .sort()
    .join('|');
  if (!impactSignature) return '';
  return [
    normalizeStepId(args.recordId),
    normalizeStepId(args.activeStepId),
    impactSignature
  ].join('::');
};

export const buildGuidedUtilisationManagedRowRemovalScopes = (
  impacts: GuidedUtilisationManagedRowRemovalImpact[] | undefined | null
): BankUtilisationPlanScope[] =>
  dedupeManagedScopes(
    (Array.isArray(impacts) ? impacts : []).map(impact => ({
      sourceParentGroupId: impact.parentGroupId,
      sourceParentRowId: impact.parentRowId,
      sourceOutputGroupId: impact.outputGroupId
    }))
  );

export const cloneLineItemStateSnapshot = (lineItems: LineItemState | null | undefined): LineItemState => {
  const source = lineItems || {};
  const snapshot: LineItemState = {};
  Object.entries(source).forEach(([groupKey, rows]) => {
    snapshot[groupKey] = Array.isArray(rows)
      ? rows.map((row: any) => ({
          ...row,
          values: { ...((row?.values || {}) as Record<string, any>) }
        }))
      : [];
  });
  return snapshot;
};

const collectStepManagedUtilisationConfigs = (args: {
  definition: WebFormDefinition;
  stepId: string;
  mode?: 'step' | 'all';
}): StepManagedUtilisationConfig[] => {
  const stepsCfg = (args.definition as any)?.steps;
  const stepId = normalizeStepId(args.stepId);
  if (stepsCfg?.mode !== 'guided') return [];
  if (!stepId && args.mode !== 'all') return [];
  const stepItems = Array.isArray(stepsCfg.items) ? stepsCfg.items : [];
  const steps =
    args.mode === 'all'
      ? stepItems
      : stepItems.filter((candidate: any) => normalizeStepId(candidate?.id) === stepId);
  if (!steps.length) return [];

  const configs: StepManagedUtilisationConfig[] = [];
  steps.forEach((step: any) => {
    const normalizedStepId = normalizeStepId(step?.id);
    if (!normalizedStepId) return;
    (Array.isArray(step.include) ? step.include : []).forEach((target: any) => {
      if (!target || target.kind !== 'lineGroup') return;
      const parentGroupId = normalizeStepId(target.id);
      if (!parentGroupId) return;
      const dataSourceRows = Array.isArray(target.dataSourceRows) ? target.dataSourceRows : [];
      dataSourceRows.forEach((config: any) => {
        const utilisationConfig =
          config?.utilisation && typeof config.utilisation === 'object' ? config.utilisation : null;
        if (!utilisationConfig || utilisationConfig.enabled === false) return;
        if (getUtilisationCommitMode(utilisationConfig) !== 'step') return;
        const resourceFormKey = `${config?.dataSource?.formKey || utilisationConfig.resourceFormKey || ''}`.trim();
        const outputGroupId = `${config?.outputGroupId || ''}`.trim();
        const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
        const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
        const resourceRecordIdFieldId = `${
          utilisationConfig.resourceRecordIdFieldId || inferUtilisationFieldId(outputKeyFieldId, 'RECORD_ID') || ''
        }`.trim();
        const resourceKindFieldId = `${
          utilisationConfig.resourceKindFieldId || inferUtilisationFieldId(outputKeyFieldId, 'KIND') || ''
        }`.trim();
        const resourceUnitFieldId = `${
          utilisationConfig.resourceUnitFieldId || inferUtilisationFieldId(outputKeyFieldId, 'UNIT') || ''
        }`.trim();
        if (!resourceFormKey || !outputGroupId || !outputKeyFieldId || !quantityFieldId) return;
        configs.push({
          stepId: normalizedStepId,
          parentGroupId,
          resourceFormKey,
          outputGroupId,
          outputKeyFieldId,
          quantityFieldId,
          resourceRecordIdFieldId,
          resourceKindFieldId,
          resourceUnitFieldId,
          allowedStatuses: Array.isArray(utilisationConfig.allowedStatuses) ? utilisationConfig.allowedStatuses : undefined
        });
      });
    });
  });
  return configs;
};

const rowHasManagedUtilisationSelection = (row: any, config: StepManagedUtilisationConfig): boolean => {
  const values = (row?.values || {}) as Record<string, any>;
  const resourceRecordId = `${values[config.resourceRecordIdFieldId] ?? ''}`.trim();
  const resourceItemId = `${values[config.outputKeyFieldId] ?? ''}`.trim();
  const quantity = toFiniteNumber(values[config.quantityFieldId]);
  return Boolean(resourceRecordId && resourceItemId && quantity > 0);
};

export const detectGuidedUtilisationManagedRowRemovals = (args: {
  definition: WebFormDefinition;
  stepId: string;
  previousLineItems: LineItemState;
  nextLineItems: LineItemState;
  mode?: 'step' | 'all';
}): GuidedUtilisationManagedRowRemovalImpact[] => {
  const configs = collectStepManagedUtilisationConfigs({
    definition: args.definition,
    stepId: args.stepId,
    mode: args.mode
  });
  if (!configs.length) return [];

  const previousLineItems = args.previousLineItems || {};
  const nextLineItems = args.nextLineItems || {};
  const impacts: GuidedUtilisationManagedRowRemovalImpact[] = [];

  configs.forEach(config => {
    const previousParentRows = Array.isArray(previousLineItems[config.parentGroupId])
      ? previousLineItems[config.parentGroupId]
      : [];
    if (!previousParentRows.length) return;
    const nextParentRowIds = new Set(
      (Array.isArray(nextLineItems[config.parentGroupId]) ? nextLineItems[config.parentGroupId] : [])
        .map((row: any) => normalizeStepId(row?.id))
        .filter(Boolean)
    );

    previousParentRows.forEach((parentRow: any) => {
      const parentRowId = normalizeStepId(parentRow?.id);
      if (!parentRowId) return;
      const outputGroupKey = resolveOutputGroupKey(config.parentGroupId, parentRowId, config.outputGroupId);
      const previousOutputRows = Array.isArray(previousLineItems[outputGroupKey]) ? previousLineItems[outputGroupKey] : [];
      if (!previousOutputRows.length) return;
      const nextOutputRows =
        nextParentRowIds.has(parentRowId) && Array.isArray(nextLineItems[outputGroupKey]) ? nextLineItems[outputGroupKey] : [];
      const nextOutputRowIds = new Set(
        nextOutputRows
          .map((row: any) => normalizeStepId(row?.id))
          .filter(Boolean)
      );
      const removedRelevantRows = previousOutputRows.filter((row: any) => {
        const rowId = normalizeStepId(row?.id);
        if (rowId && nextOutputRowIds.has(rowId)) return false;
        return rowHasManagedUtilisationSelection(row, config);
      });
      if (!removedRelevantRows.length) return;
      impacts.push({
        stepId: config.stepId,
        parentGroupId: config.parentGroupId,
        parentRowId,
        outputGroupId: config.outputGroupId,
        removedRowIds: removedRelevantRows
          .map((row: any) => normalizeStepId(row?.id))
          .filter(Boolean)
      });
    });
  });

  return impacts;
};

export const mergeGuidedUtilisationLineItemsFromSnapshot = (args: {
  definition: WebFormDefinition;
  stepId: string;
  sourceLineItems: LineItemState;
  targetLineItems: LineItemState;
  mode?: 'step' | 'all';
}): { lineItems: LineItemState; mergedRows: number; mergedChildGroups: number } => {
  const configs = collectStepManagedUtilisationConfigs({
    definition: args.definition,
    stepId: args.stepId,
    mode: args.mode
  });
  if (!configs.length) {
    return {
      lineItems: args.targetLineItems || {},
      mergedRows: 0,
      mergedChildGroups: 0
    };
  }

  const sourceLineItems = args.sourceLineItems || {};
  const targetLineItems = args.targetLineItems || {};
  let nextLineItems: LineItemState = targetLineItems;
  let mergedRows = 0;
  let mergedChildGroups = 0;

  const setGroupRows = (groupKey: string, rows: any[]): void => {
    if (nextLineItems === targetLineItems) nextLineItems = { ...targetLineItems };
    nextLineItems[groupKey] = rows as any;
  };

  configs.forEach(config => {
    const sourceParentRows = Array.isArray(sourceLineItems[config.parentGroupId])
      ? sourceLineItems[config.parentGroupId]
      : [];
    if (!sourceParentRows.length) return;

    const targetParentRowIds = new Set(
      (Array.isArray(nextLineItems[config.parentGroupId]) ? nextLineItems[config.parentGroupId] : [])
        .map((row: any) => normalizeStepId(row?.id))
        .filter(Boolean)
    );
    if (!targetParentRowIds.size) return;

    sourceParentRows.forEach((sourceParentRow: any) => {
      const parentRowId = normalizeStepId(sourceParentRow?.id);
      if (!parentRowId || !targetParentRowIds.has(parentRowId)) return;

      const outputGroupKey = resolveOutputGroupKey(config.parentGroupId, parentRowId, config.outputGroupId);
      const selectedSourceRows = (Array.isArray(sourceLineItems[outputGroupKey])
        ? sourceLineItems[outputGroupKey]
        : []
      ).filter((row: any) => rowHasManagedUtilisationSelection(row, config));
      if (!selectedSourceRows.length) return;

      const currentTargetRows = Array.isArray(nextLineItems[outputGroupKey]) ? nextLineItems[outputGroupKey] : [];
      let nextOutputRows = currentTargetRows;
      let outputRowsChanged = false;

      selectedSourceRows.forEach((sourceRow: any) => {
        const sourceRowId = normalizeStepId(sourceRow?.id);
        const sourceOutputKey = normalizeStepId(sourceRow?.values?.[config.outputKeyFieldId]);
        if (!sourceRowId && !sourceOutputKey) return;

        const existingIndex = nextOutputRows.findIndex((targetRow: any) => {
          const targetRowId = normalizeStepId(targetRow?.id);
          if (sourceRowId && targetRowId === sourceRowId) return true;
          return sourceOutputKey && normalizeStepId(targetRow?.values?.[config.outputKeyFieldId]) === sourceOutputKey;
        });
        const clonedSourceRow = cloneLineItemRow(sourceRow);

        if (existingIndex >= 0) {
          const existingRow = nextOutputRows[existingIndex];
          const existingRowId = normalizeStepId(existingRow?.id);
          if (stableStringify(existingRow) !== stableStringify(sourceRow)) {
            if (!outputRowsChanged) {
              nextOutputRows = nextOutputRows.slice();
              outputRowsChanged = true;
            }
            nextOutputRows[existingIndex] = clonedSourceRow;
            mergedRows += 1;
          }
          if (existingRowId && sourceRowId && existingRowId !== sourceRowId) {
            if (nextLineItems === targetLineItems) nextLineItems = { ...targetLineItems };
            Object.keys(nextLineItems).forEach(groupKey => {
              if (groupKey.startsWith(`${outputGroupKey}::${existingRowId}::`)) {
                delete (nextLineItems as any)[groupKey];
              }
            });
          }
        } else {
          if (!outputRowsChanged) {
            nextOutputRows = nextOutputRows.slice();
            outputRowsChanged = true;
          }
          nextOutputRows.push(clonedSourceRow);
          mergedRows += 1;
        }

        if (!sourceRowId) return;
        const childGroupPrefix = `${outputGroupKey}::${sourceRowId}::`;
        Object.entries(sourceLineItems).forEach(([sourceGroupKey, sourceRows]) => {
          if (!sourceGroupKey.startsWith(childGroupPrefix)) return;
          const clonedChildRows = cloneLineItemRows(sourceRows as any[]);
          if (stableStringify(nextLineItems[sourceGroupKey] || []) === stableStringify(clonedChildRows)) return;
          setGroupRows(sourceGroupKey, clonedChildRows);
          mergedChildGroups += 1;
        });
      });

      if (outputRowsChanged) {
        setGroupRows(outputGroupKey, nextOutputRows);
      }
    });
  });

  return {
    lineItems: nextLineItems,
    mergedRows,
    mergedChildGroups
  };
};

export const buildStepBankUtilisationPlan = (args: {
  definition: WebFormDefinition;
  stepId: string;
  formKey: string;
  recordId: string;
  lineItems: LineItemState;
  mode?: 'step' | 'all';
  previousManagedScopes?: BankUtilisationPlanScope[];
}): BankUtilisationPlanRequest | null => {
  const formKey = (args.formKey || '').toString().trim();
  const recordId = (args.recordId || '').toString().trim();
  if (!formKey || !recordId) return null;

  const configs = collectStepManagedUtilisationConfigs({
    definition: args.definition,
    stepId: args.stepId,
    mode: args.mode
  });
  if (!configs.length) return null;

  const utilisations: NonNullable<BankUtilisationPlanRequest['utilisations']> = [];
  const managedScopes: NonNullable<BankUtilisationPlanRequest['managedScopes']> = [];
  configs.forEach(config => {
    const parentRows = Array.isArray(args.lineItems[config.parentGroupId]) ? args.lineItems[config.parentGroupId] : [];
    parentRows.forEach((parentRow: any) => {
      const parentRowId = normalizeStepId(parentRow?.id);
      if (!parentRowId) return;
      managedScopes.push({
        sourceParentGroupId: config.parentGroupId,
        sourceParentRowId: parentRowId,
        sourceOutputGroupId: config.outputGroupId
      });
      const outputGroupKey = resolveOutputGroupKey(config.parentGroupId, parentRowId, config.outputGroupId);
      const outputRows = Array.isArray(args.lineItems[outputGroupKey]) ? args.lineItems[outputGroupKey] : [];
      outputRows.forEach((row: any) => {
        const values = (row?.values || {}) as Record<string, any>;
        const resourceRecordId = `${values[config.resourceRecordIdFieldId] ?? ''}`.trim();
        const resourceItemId = `${values[config.outputKeyFieldId] ?? ''}`.trim();
        const quantity = toFiniteNumber(values[config.quantityFieldId]);
        if (!resourceRecordId || !resourceItemId || quantity <= 0) return;
        utilisations.push({
          resourceFormKey: config.resourceFormKey,
          resourceRecordId,
          resourceItemId,
          resourceKind: config.resourceKindFieldId ? `${values[config.resourceKindFieldId] ?? ''}`.trim() || undefined : undefined,
          quantity,
          unit: config.resourceUnitFieldId ? `${values[config.resourceUnitFieldId] ?? ''}`.trim() || undefined : undefined,
          sourceParentGroupId: config.parentGroupId,
          sourceParentRowId: parentRowId,
          sourceOutputGroupId: config.outputGroupId,
          sourceOutputRowId: normalizeStepId(row?.id) || undefined,
          sourceOutputKeyFieldId: config.outputKeyFieldId,
          allowedStatuses: config.allowedStatuses
        });
      });
    });
  });

  const mergedManagedScopes = dedupeManagedScopes([
    ...(Array.isArray(args.previousManagedScopes) ? args.previousManagedScopes : []),
    ...managedScopes
  ]);

  return {
    sourceFormKey: formKey,
    sourceRecordId: recordId,
    managedScopes: mergedManagedScopes,
    utilisations,
    refreshMode: 'revisionOnly'
  };
};

export const buildBankUtilisationPlanFingerprint = (plan: BankUtilisationPlanRequest | null): string => {
  if (!plan) return '';
  return stableStringify({
    sourceFormKey: normalizeStepId(plan.sourceFormKey),
    sourceRecordId: normalizeStepId(plan.sourceRecordId),
    utilisationFormKey: normalizeStepId(plan.utilisationFormKey),
    refreshMode: normalizeStepId(plan.refreshMode),
    managedScopes: dedupeManagedScopes(plan.managedScopes).sort((left, right) =>
      buildManagedScopeKey(left).localeCompare(buildManagedScopeKey(right))
    ),
    utilisations: (Array.isArray(plan.utilisations) ? plan.utilisations : [])
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
