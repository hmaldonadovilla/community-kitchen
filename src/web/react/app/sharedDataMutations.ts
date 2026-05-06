import type { StepMilestoneActionConfig, WebFormDefinition } from '../../types';

export type PendingSharedDataMutationSummary = {
  recordId?: string | null;
  stepId?: string | null;
  reason?: string | null;
  targetFormKeys?: string[] | null;
  startedAt?: number;
};

/**
 * Owner: app-wide shared datasource mutation coordination.
 * Resolves the shared form keys that a foreground datasource read must wait on,
 * without depending on React state, browser APIs, or transport adapters.
 */
export const normalizeSharedDataFormKey = (value: unknown): string => `${value ?? ''}`.trim();

const addFormKey = (target: Map<string, string>, value: unknown): void => {
  const normalized = normalizeSharedDataFormKey(value);
  if (!normalized) return;
  const comparisonKey = normalized.toLowerCase();
  if (!target.has(comparisonKey)) target.set(comparisonKey, normalized);
};

const uniqueFormKeys = (values: unknown[]): string[] => {
  const out = new Map<string, string>();
  values.forEach(value => addFormKey(out, value));
  return Array.from(out.values());
};

export const resolveStepDataSourceTargetFormKeys = (configs?: unknown[] | null): string[] => {
  const entries = Array.isArray(configs) ? configs : [];
  return uniqueFormKeys(
    entries.map(config => {
      if (!config || typeof config !== 'object') return config;
      const candidate = config as any;
      const dataSource =
        candidate.dataSource && typeof candidate.dataSource === 'object' ? candidate.dataSource : candidate;
      return dataSource?.formKey;
    })
  );
};

export const resolveSubmitEffectTargetFormKeys = (definition?: WebFormDefinition | null): string[] => {
  const raw = definition as any;
  const effects = [
    ...(Array.isArray(raw?.followup?.submitEffects) ? raw.followup.submitEffects : []),
    ...(Array.isArray(raw?.followupConfig?.submitEffects) ? raw.followupConfig.submitEffects : [])
  ];
  return uniqueFormKeys(effects.map(effect => (effect && typeof effect === 'object' ? (effect as any).targetFormKey : '')));
};

export const resolveReservationSharedDataTargetFormKeys = (
  definition?: WebFormDefinition | null
): string[] => {
  const steps = (definition as any)?.steps;
  const items = steps && Array.isArray(steps.items) ? steps.items : [];
  const keys: unknown[] = [];
  items.forEach((step: any) => {
    const targets = Array.isArray(step?.include) ? step.include : [];
    targets.forEach((target: any) => {
      if (!target || target.kind !== 'lineGroup') return;
      const rows = Array.isArray(target.dataSourceRows) ? target.dataSourceRows : [];
      rows.forEach((row: any) => {
        const reservation = row?.reservation && typeof row.reservation === 'object' ? row.reservation : null;
        if (!reservation || reservation.enabled === false) return;
        keys.push(reservation.resourceFormKey, row?.dataSource?.formKey);
      });
    });
  });
  return uniqueFormKeys(keys);
};

const normalizeActionIds = (actions?: Array<string | StepMilestoneActionConfig> | null): Set<string> => {
  const normalized = new Set<string>();
  (Array.isArray(actions) ? actions : []).forEach(action => {
    const raw = typeof action === 'string' ? action : (action as any)?.type;
    const value = `${raw ?? ''}`.trim().toUpperCase();
    if (value) normalized.add(value);
  });
  return normalized;
};

export const resolveFollowupSharedDataMutationTargetFormKeys = (args: {
  definition?: WebFormDefinition | null;
  actions?: Array<string | StepMilestoneActionConfig> | null;
}): string[] => {
  const actions = normalizeActionIds(args.actions);
  const keys: string[] = [];
  if (actions.has('CLOSE_RECORD')) {
    keys.push(...resolveSubmitEffectTargetFormKeys(args.definition));
    keys.push(...resolveReservationSharedDataTargetFormKeys(args.definition));
  }
  if (actions.has('RECONCILE_RESERVATIONS')) {
    keys.push(...resolveReservationSharedDataTargetFormKeys(args.definition));
  }
  return uniqueFormKeys(keys);
};

export const resolvePendingSharedDataMutationMatches = (args: {
  pending?: PendingSharedDataMutationSummary[] | null;
  targetFormKeys?: string[] | null;
}): PendingSharedDataMutationSummary[] => {
  const targetKeys = new Set((args.targetFormKeys || []).map(value => normalizeSharedDataFormKey(value).toLowerCase()).filter(Boolean));
  if (!targetKeys.size) return [];
  return (Array.isArray(args.pending) ? args.pending : []).filter(entry =>
    (entry.targetFormKeys || []).some(value => targetKeys.has(normalizeSharedDataFormKey(value).toLowerCase()))
  );
};
