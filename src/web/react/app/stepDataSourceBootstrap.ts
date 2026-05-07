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

export const shouldForceRefreshStepDataSourceOnBootstrap = (
  config: any,
  recordChanged = false
): boolean => {
  if (!config || typeof config !== 'object') return false;
  return (
    recordChanged ||
    config.forceRefreshOnMount === true ||
    Boolean(config.availability) ||
    Boolean(config.reservationBehavior)
  );
};

export const shouldGateStepDataSourceUntilFresh = (config: any): boolean =>
  shouldForceRefreshStepDataSourceOnBootstrap(config, false);

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

type StepDataSourceBootstrapCoordinatorState = 'running';

export type StepDataSourceBootstrapRun<T> = {
  started: boolean;
  promise: Promise<T>;
};

export type StepDataSourceBootstrapCoordinator = {
  run: <T>(signature: string | null | undefined, task: () => Promise<T>) => StepDataSourceBootstrapRun<T> | null;
  getState: (signature?: string | null) => StepDataSourceBootstrapCoordinatorState | null;
  clear: () => void;
};

const normalizeBootstrapCoordinatorSignature = (signature?: string | null): string =>
  `${signature || ''}`.trim();

/**
 * Coordinates guided datasource bootstrap across transient component remounts
 * while a request is running. Completed runs are intentionally not retained:
 * source-first inventory steps must force-refresh on every step entry.
 */
export const createStepDataSourceBootstrapCoordinator = (): StepDataSourceBootstrapCoordinator => {
  const running = new Map<string, Promise<unknown>>();
  return {
    run: <T>(signature: string | null | undefined, task: () => Promise<T>): StepDataSourceBootstrapRun<T> | null => {
      const key = normalizeBootstrapCoordinatorSignature(signature);
      if (!key) return null;
      const existing = running.get(key) as Promise<T> | undefined;
      if (existing) {
        return { started: false, promise: existing };
      }
      const promise = task().finally(() => {
        if (running.get(key) === promise) {
          running.delete(key);
        }
      });
      running.set(key, promise);
      return { started: true, promise };
    },
    getState: signature => {
      const key = normalizeBootstrapCoordinatorSignature(signature);
      if (!key) return null;
      return running.has(key) ? 'running' : null;
    },
    clear: () => {
      running.clear();
    }
  };
};

export const stepDataSourceBootstrapCoordinator = createStepDataSourceBootstrapCoordinator();
