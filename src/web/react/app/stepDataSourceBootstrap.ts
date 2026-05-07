import type { StepDataSourceBootstrapConfig } from '../../types';

/**
 * Builds a stable signature for step-level datasource bootstrap requests so harmless rerenders
 * do not trigger duplicate forced refreshes.
 */
export const buildStepDataSourceBootstrapSignature = (args: {
  recordId?: string | null;
  language?: string | null;
  stepId?: string | null;
  configs?: any[];
  bootstrap?: StepDataSourceBootstrapConfig | null;
}): string => {
  const configs = Array.isArray(args.configs) ? args.configs.filter(Boolean) : [];
  const language = `${args.language || 'EN'}`.trim().toUpperCase();
  const recordId = `${args.recordId || ''}`.trim();
  const stepId = `${args.stepId || ''}`.trim();
  const normalizedConfigs = configs.map(config => {
    const dataSource = config?.dataSource && typeof config.dataSource === 'object' ? config.dataSource : {};
    return {
      id: `${config?.id || ''}`.trim(),
      sourceId: `${dataSource?.id || ''}`.trim(),
      sourceFormKey: `${dataSource?.formKey || ''}`.trim(),
      projection: Array.isArray(dataSource?.projection)
        ? dataSource.projection.map((entry: any) => `${entry ?? ''}`.trim()).filter(Boolean)
        : [],
      forceRefreshOnMount: config?.forceRefreshOnMount === true,
      hasAvailability: Boolean(config?.availability),
      hasReservationBehavior: Boolean(config?.reservationBehavior)
    };
  });
  return JSON.stringify({
    recordId,
    language,
    stepId,
    waitForGuidedReservationSync: args.bootstrap?.waitForGuidedReservationSync === true,
    waitForSharedDataMutations: args.bootstrap?.waitForSharedDataMutations === true,
    configs: normalizedConfigs
  });
};

export const shouldWaitForGuidedReservationSyncOnBootstrap = (
  config?: StepDataSourceBootstrapConfig | null
): boolean => config?.waitForGuidedReservationSync === true;

export const shouldWaitForSharedDataMutationsOnBootstrap = (
  config?: StepDataSourceBootstrapConfig | null
): boolean => config?.waitForSharedDataMutations === true;

export const shouldStartStepDataSourceBootstrap = (args: {
  signature?: string | null;
  completedSignature?: string | null;
  inFlightSignature?: string | null;
}): boolean => {
  const signature = `${args.signature || ''}`.trim();
  if (!signature) return false;
  if (`${args.completedSignature || ''}`.trim() === signature) return false;
  if (`${args.inFlightSignature || ''}`.trim() === signature) return false;
  return true;
};

type StepDataSourceBootstrapRegistryState = 'running' | 'completed';

export type StepDataSourceBootstrapRegistry = {
  markRunning: (signature?: string | null) => boolean;
  markCompleted: (signature?: string | null) => void;
  markFailed: (signature?: string | null) => void;
  getState: (signature?: string | null) => StepDataSourceBootstrapRegistryState | null;
  clear: () => void;
};

const normalizeBootstrapRegistrySignature = (signature?: string | null): string =>
  `${signature || ''}`.trim();

/**
 * Coordinates guided datasource bootstrap across transient component remounts.
 * The hook still owns local loading state; this registry only suppresses
 * duplicate work for the same logical record/step/config bootstrap.
 */
export const createStepDataSourceBootstrapRegistry = (): StepDataSourceBootstrapRegistry => {
  const states = new Map<string, StepDataSourceBootstrapRegistryState>();
  return {
    markRunning: signature => {
      const key = normalizeBootstrapRegistrySignature(signature);
      if (!key) return false;
      if (states.has(key)) return false;
      states.set(key, 'running');
      return true;
    },
    markCompleted: signature => {
      const key = normalizeBootstrapRegistrySignature(signature);
      if (!key) return;
      states.set(key, 'completed');
    },
    markFailed: signature => {
      const key = normalizeBootstrapRegistrySignature(signature);
      if (!key) return;
      states.delete(key);
    },
    getState: signature => {
      const key = normalizeBootstrapRegistrySignature(signature);
      if (!key) return null;
      return states.get(key) || null;
    },
    clear: () => {
      states.clear();
    }
  };
};

export const stepDataSourceBootstrapRegistry = createStepDataSourceBootstrapRegistry();
