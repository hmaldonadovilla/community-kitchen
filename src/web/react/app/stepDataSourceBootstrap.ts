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
    configs: normalizedConfigs
  });
};

export const shouldWaitForGuidedReservationSyncOnBootstrap = (
  config?: StepDataSourceBootstrapConfig | null
): boolean => config?.waitForGuidedReservationSync === true;
