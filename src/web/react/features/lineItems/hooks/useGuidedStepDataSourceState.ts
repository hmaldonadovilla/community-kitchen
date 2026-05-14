import React from 'react';

import { matchesWhenClause } from '../../../../core';
import {
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT,
  fetchDataSource,
  mutateCachedDataSource,
  peekCachedDataSource
} from '../../../../data/dataSources';
import type { FieldValue, LangCode, VisibilityContext } from '../../../../types';
import type { BankAvailabilitySnapshot, BankUtilisationPlanScope } from '../../../../../types';
import {
  resolveSourceFirstAllocationLabelVisibility,
  resolveSourceFirstRowSortMode
} from '../../../app/sourceFirstAllocations';
import {
  buildStepDataSourceBootstrapSignature,
  shouldForceRefreshStepDataSourceOnBootstrap,
  shouldGateStepDataSourceUntilFresh,
  shouldStartStepDataSourceBootstrap,
  shouldWaitForGuidedUtilisationSyncOnBootstrap,
  shouldWaitForSharedDataMutationsOnBootstrap,
  stepDataSourceBootstrapCoordinator
} from '../../../app/stepDataSourceBootstrap';
import { resolveStepDataSourceTargetFormKeys } from '../../../app/sharedDataMutations';
import type { LineItemState } from '../../../types';
import {
  applyBankAvailabilitySnapshotToRow,
  normalizeBankAvailabilitySnapshotForDisplay
} from '../../utilisations/availabilitySnapshots';
import {
  shouldUseUtilisationSyncFreshnessForDataSource,
  type GuidedUtilisationSyncWaitResult
} from '../../utilisations/domain/utilisationSyncFreshness';
import { resolveUtilisationSourceItemKey } from '../../utilisations/sourceFields';

type GuidedStepUtilisationDraftSyncQueue = (args: {
  stepId: string;
  reason: string;
  persistSnapshot?: boolean;
  snapshotLineItems?: LineItemState;
  releaseScopes?: BankUtilisationPlanScope[];
}) => void;

type GuidedStepUtilisationDraftSyncWaiter = (args: {
  recordId: string;
  stepId?: string;
  reason: string;
}) => Promise<GuidedUtilisationSyncWaitResult>;

type PendingSharedDataMutationsWaiter = (args: {
  targetFormKeys: string[];
  recordId?: string;
  stepId?: string;
  reason: string;
  timeoutMs?: number;
}) => Promise<{ ok: boolean; message?: string }>;

type UseGuidedStepDataSourceStateArgs = {
  groupId: string;
  definition: any;
  recordId?: string | null;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  dataSourceRows?: any[] | null;
  dataSourceBootstrap?: any;
  parentRowCount: number;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
  queueGuidedStepUtilisationDraftSync?: GuidedStepUtilisationDraftSyncQueue;
  waitForGuidedStepUtilisationDraftSync?: GuidedStepUtilisationDraftSyncWaiter;
  waitForPendingSharedDataMutations?: PendingSharedDataMutationsWaiter;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

type QueueImmediateStepUtilisationDraftSyncArgs = {
  config: any;
  parentRowId: string;
  sourceKey: string;
  patch: Record<string, FieldValue>;
  snapshotLineItems?: LineItemState | null;
};

type UseGuidedStepDataSourceStateResult = {
  currentGuidedStepId: string;
  activeStepDataSourceRows: any[];
  sourceFirstDataSourceRows: any[];
  stepDataSourceRefreshTick: number;
  queueStepDataSourceRefreshTick: () => void;
  stepDataSourceDrafts: Record<string, Record<string, FieldValue>>;
  setStepDataSourceDrafts: React.Dispatch<React.SetStateAction<Record<string, Record<string, FieldValue>>>>;
  stepDataSourceDraftsRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  utilisationDebounceTimersRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  utilisationRequestVersionRef: React.MutableRefObject<Record<string, number>>;
  utilisationCommittedValuesRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  utilisationSyncCounterRef: React.MutableRefObject<number>;
  latestStepDataSourceSyncedLineItemsRef: React.MutableRefObject<LineItemState | null>;
  deferredUtilisationAutoSaveHoldReleaseTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isStepDataSourceLoading: (config: any) => boolean;
  queueStepUtilisationDraftSnapshotSync: (reason: string, snapshotLineItems?: LineItemState | null) => void;
  queueImmediateStepUtilisationDraftSync: (args: QueueImmediateStepUtilisationDraftSyncArgs) => void;
  updateStepDataSourceAvailability: (
    config: any,
    availability: BankAvailabilitySnapshot | null | undefined
  ) => void;
  applyStepDataSourceAvailabilitySnapshots: (
    snapshots: BankAvailabilitySnapshot[] | null | undefined
  ) => void;
};

/**
 * Owner: guided line-item data-source workflow.
 * Keeps data-source bootstrap/cache coordination and utilisation draft refs out
 * of the line-item renderer while preserving the existing utilisation adapter API.
 */
export const useGuidedStepDataSourceState = ({
  groupId,
  definition,
  recordId,
  language,
  values,
  lineItems,
  dataSourceRows,
  dataSourceBootstrap,
  parentRowCount,
  resolveTopValue,
  queueGuidedStepUtilisationDraftSync,
  waitForGuidedStepUtilisationDraftSync,
  waitForPendingSharedDataMutations,
  onDiagnostic
}: UseGuidedStepDataSourceStateArgs): UseGuidedStepDataSourceStateResult => {
  const guidedStepFieldId = `${definition?.steps?.stateFields?.prefix || '__ckStep'}`.trim() || '__ckStep';
  const currentGuidedStepId = `${resolveTopValue(guidedStepFieldId) ?? ''}`.trim();
  const stepDataSourceRows = React.useMemo(
    () => (Array.isArray(dataSourceRows) ? dataSourceRows.filter(Boolean) : []),
    [dataSourceRows]
  );
  const topLevelVisibilityContext = React.useMemo<VisibilityContext>(
    () => ({
      getValue: (fieldId: string) => resolveTopValue(fieldId),
      getLineItems: (candidateGroupId: string) => lineItems[candidateGroupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveTopValue]
  );
  const activeStepDataSourceRows = React.useMemo(
    () =>
      stepDataSourceRows.filter(config => {
        const when = (config as any)?.presentationWhen;
        return !when || matchesWhenClause(when as any, topLevelVisibilityContext);
      }),
    [stepDataSourceRows, topLevelVisibilityContext]
  );
  const sourceFirstDataSourceRows = React.useMemo(
    () =>
      activeStepDataSourceRows.filter(config => {
        if (`${(config as any)?.presentation || ''}`.trim() !== 'sourceFirstAllocations') return false;
        return true;
      }),
    [activeStepDataSourceRows]
  );
  const [stepDataSourceRefreshTick, setStepDataSourceRefreshTick] = React.useState(0);
  const stepDataSourceRefreshHandleRef = React.useRef<{
    kind: 'raf' | 'timeout';
    handle: number | ReturnType<typeof setTimeout>;
  } | null>(null);
  const queueStepDataSourceRefreshTick = React.useCallback(() => {
    if (stepDataSourceRefreshHandleRef.current) return;
    const flush = () => {
      stepDataSourceRefreshHandleRef.current = null;
      setStepDataSourceRefreshTick(prev => prev + 1);
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      stepDataSourceRefreshHandleRef.current = {
        kind: 'raf',
        handle: window.requestAnimationFrame(flush)
      };
      return;
    }
    stepDataSourceRefreshHandleRef.current = {
      kind: 'timeout',
      handle: setTimeout(flush, 0)
    };
  }, []);
  React.useEffect(
    () => () => {
      const pending = stepDataSourceRefreshHandleRef.current;
      stepDataSourceRefreshHandleRef.current = null;
      if (!pending) return;
      if (
        pending.kind === 'raf' &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(pending.handle as number);
        return;
      }
      clearTimeout(pending.handle as ReturnType<typeof setTimeout>);
    },
    []
  );
  const [stepDataSourceLoadingCounts, setStepDataSourceLoadingCounts] = React.useState<Record<string, number>>({});
  const [stepDataSourceDrafts, setStepDataSourceDrafts] = React.useState<Record<string, Record<string, FieldValue>>>({});
  const stepDataSourceDraftsRef = React.useRef<Record<string, Record<string, FieldValue>>>({});
  const stepDataSourceRecordIdRef = React.useRef<string>('');
  const stepDataSourceBootstrapSignatureRef = React.useRef<string>('');
  const stepDataSourceBootstrapInFlightSignatureRef = React.useRef<string>('');
  const currentStepDataSourceBootstrapSignatureRef = React.useRef<string>('');
  const mountedRef = React.useRef(true);
  const utilisationDebounceTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const utilisationRequestVersionRef = React.useRef<Record<string, number>>({});
  const utilisationCommittedValuesRef = React.useRef<Record<string, Record<string, FieldValue>>>({});
  const utilisationSyncCounterRef = React.useRef(0);
  const latestStepDataSourceSyncedLineItemsRef = React.useRef<LineItemState | null>(null);
  const deferredUtilisationAutoSaveHoldReleaseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceFirstPresentationLoggedRef = React.useRef<string>('');
  const pendingStepUtilisationDraftSyncRef = React.useRef<{
    stepId: string;
    reason: string;
  } | null>(null);
  const shouldWaitForUtilisationSyncBeforeBootstrap = React.useMemo(
    () => shouldWaitForGuidedUtilisationSyncOnBootstrap(dataSourceBootstrap),
    [dataSourceBootstrap]
  );
  const shouldWaitForSharedDataBeforeBootstrap = React.useMemo(
    () => shouldWaitForSharedDataMutationsOnBootstrap(dataSourceBootstrap),
    [dataSourceBootstrap]
  );
  const [pendingStepUtilisationDraftSyncTick, setPendingStepUtilisationDraftSyncTick] = React.useState(0);
  const [stepDataSourceBootstrapRetryTick, setStepDataSourceBootstrapRetryTick] = React.useState(0);
  const stepDataSourceBootstrapSignature = React.useMemo(
    () =>
      buildStepDataSourceBootstrapSignature({
        recordId,
        language,
        stepId: currentGuidedStepId,
        configs: activeStepDataSourceRows,
        bootstrap: dataSourceBootstrap
      }),
    [activeStepDataSourceRows, currentGuidedStepId, dataSourceBootstrap, language, recordId]
  );

  React.useEffect(() => {
    currentStepDataSourceBootstrapSignatureRef.current = stepDataSourceBootstrapSignature;
  }, [stepDataSourceBootstrapSignature]);

  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  React.useEffect(() => {
    stepDataSourceDraftsRef.current = stepDataSourceDrafts;
  }, [stepDataSourceDrafts]);

  React.useEffect(() => {
    return () => {
      Object.values(utilisationDebounceTimersRef.current).forEach(timer => {
        clearTimeout(timer);
      });
      utilisationDebounceTimersRef.current = {};
      utilisationCommittedValuesRef.current = {};
    };
  }, []);

  const buildStepDataSourceLoadKey = React.useCallback(
    (config: any): string => {
      const dataSource = config?.dataSource && typeof config.dataSource === 'object' ? config.dataSource : config;
      return JSON.stringify({
        sourceId: `${dataSource?.id || ''}`.trim(),
        sourceFormKey: `${dataSource?.formKey || ''}`.trim(),
        projection: Array.isArray(dataSource?.projection)
          ? dataSource.projection.map((entry: any) => `${entry ?? ''}`.trim()).filter(Boolean)
          : [],
        language: `${language || 'EN'}`.trim().toUpperCase()
      });
    },
    [language]
  );

  const mutateStepDataSourceLoading = React.useCallback(
    (configs: any[], delta: 1 | -1) => {
      const candidates = Array.isArray(configs) ? configs.filter(Boolean) : [];
      if (!candidates.length) return;
      setStepDataSourceLoadingCounts(prev => {
        let changed = false;
        const next = { ...prev };
        candidates.forEach(config => {
          const key = buildStepDataSourceLoadKey(config);
          const current = Number(next[key] || 0);
          const nextValue = Math.max(0, current + delta);
          if (nextValue === current) return;
          changed = true;
          if (nextValue > 0) next[key] = nextValue;
          else delete next[key];
        });
        return changed ? next : prev;
      });
    },
    [buildStepDataSourceLoadKey]
  );

  const beginStepDataSourceLoading = React.useCallback(
    (configs: any[]) => mutateStepDataSourceLoading(configs, 1),
    [mutateStepDataSourceLoading]
  );

  const endStepDataSourceLoading = React.useCallback(
    (configs: any[]) => mutateStepDataSourceLoading(configs, -1),
    [mutateStepDataSourceLoading]
  );

  const isStepDataSourceLoading = React.useCallback(
    (config: any): boolean => {
      const key = buildStepDataSourceLoadKey(config);
      if (Number(stepDataSourceLoadingCounts[key] || 0) > 0) return true;
      if (!shouldGateStepDataSourceUntilFresh(config)) return false;
      if (stepDataSourceBootstrapInFlightSignatureRef.current === stepDataSourceBootstrapSignature) return true;
      return stepDataSourceBootstrapSignatureRef.current !== stepDataSourceBootstrapSignature;
    },
    [buildStepDataSourceLoadKey, stepDataSourceBootstrapSignature, stepDataSourceLoadingCounts]
  );

  const queueStepUtilisationDraftSnapshotSync = React.useCallback(
    (reason: string, snapshotLineItems?: LineItemState | null) => {
      if (!queueGuidedStepUtilisationDraftSync) return;
      if (!currentGuidedStepId) return;
      const resolvedSnapshotLineItems = snapshotLineItems || latestStepDataSourceSyncedLineItemsRef.current || null;
      if (resolvedSnapshotLineItems) {
        latestStepDataSourceSyncedLineItemsRef.current = null;
        queueGuidedStepUtilisationDraftSync({
          stepId: currentGuidedStepId,
          reason,
          snapshotLineItems: resolvedSnapshotLineItems
        });
        return;
      }
      pendingStepUtilisationDraftSyncRef.current = {
        stepId: currentGuidedStepId,
        reason
      };
      setPendingStepUtilisationDraftSyncTick(prev => prev + 1);
    },
    [currentGuidedStepId, queueGuidedStepUtilisationDraftSync]
  );

  const queueImmediateStepUtilisationDraftSync = React.useCallback(
    (args: QueueImmediateStepUtilisationDraftSyncArgs) => {
      if (!queueGuidedStepUtilisationDraftSync) return;
      if (!currentGuidedStepId) return;
      const reason = `lineItem:${groupId}:${args.parentRowId}:${args.sourceKey}:${Object.keys(args.patch).sort().join(',') || 'change'}`;
      onDiagnostic?.('guidedStep.utilisationSync.queued', {
        groupId,
        stepId: currentGuidedStepId,
        parentRowId: args.parentRowId,
        sourceKey: args.sourceKey,
        patchFields: Object.keys(args.patch).sort()
      });
      const snapshotLineItems = args.snapshotLineItems || latestStepDataSourceSyncedLineItemsRef.current || null;
      if (snapshotLineItems) {
        latestStepDataSourceSyncedLineItemsRef.current = null;
        queueGuidedStepUtilisationDraftSync({
          stepId: currentGuidedStepId,
          reason,
          snapshotLineItems
        });
        return;
      }
      pendingStepUtilisationDraftSyncRef.current = {
        stepId: currentGuidedStepId,
        reason
      };
      setPendingStepUtilisationDraftSyncTick(prev => prev + 1);
    },
    [currentGuidedStepId, groupId, onDiagnostic, queueGuidedStepUtilisationDraftSync]
  );

  const updateStepDataSourceAvailability = React.useCallback(
    (config: any, availability: BankAvailabilitySnapshot | null | undefined): void => {
      if (!config?.dataSource || !availability) return;
      mutateCachedDataSource(config.dataSource, language, items =>
        items.map(item => {
          if (!item || typeof item !== 'object') return item;
          const matchesRecord = `${item.id ?? ''}`.trim() === `${availability.resourceRecordId || ''}`.trim();
          const matchesItem =
            !availability.resourceItemId ||
            resolveUtilisationSourceItemKey(config, item) === `${availability.resourceItemId}`.trim();
          if (!matchesRecord || !matchesItem) return item;
          return applyBankAvailabilitySnapshotToRow(item, availability);
        })
      );
      queueStepDataSourceRefreshTick();
    },
    [language, queueStepDataSourceRefreshTick]
  );

  const applyStepDataSourceAvailabilitySnapshots = React.useCallback(
    (snapshots: BankAvailabilitySnapshot[] | null | undefined): void => {
      const entries = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length) return;
      activeStepDataSourceRows.forEach(config => {
        const dataSourceFormKey = `${config?.dataSource?.formKey || ''}`.trim();
        entries.forEach(snapshot => {
          if (!snapshot) return;
          if (dataSourceFormKey && dataSourceFormKey !== `${snapshot.resourceFormKey || ''}`.trim()) return;
          updateStepDataSourceAvailability(config, normalizeBankAvailabilitySnapshotForDisplay(snapshot));
        });
      });
    },
    [activeStepDataSourceRows, updateStepDataSourceAvailability]
  );

  React.useEffect(() => {
    if (!stepDataSourceRows.length) {
      stepDataSourceBootstrapSignatureRef.current = '';
      stepDataSourceBootstrapInFlightSignatureRef.current = '';
      return;
    }
    const normalizedRecordId = `${recordId || ''}`.trim();
    const recordChanged = stepDataSourceRecordIdRef.current !== normalizedRecordId;
    stepDataSourceRecordIdRef.current = normalizedRecordId;
    if (recordChanged) {
      const timerKeys = Object.keys(utilisationDebounceTimersRef.current);
      if (timerKeys.length) {
        timerKeys.forEach(key => {
          const timer = utilisationDebounceTimersRef.current[key];
          if (timer) clearTimeout(timer);
          delete utilisationDebounceTimersRef.current[key];
        });
      }
      utilisationRequestVersionRef.current = {};
      utilisationCommittedValuesRef.current = {};
      if (Object.keys(stepDataSourceDraftsRef.current).length) {
        stepDataSourceDraftsRef.current = {};
        setStepDataSourceDrafts({});
      }
    }
    if (!activeStepDataSourceRows.length) {
      stepDataSourceBootstrapSignatureRef.current = '';
      stepDataSourceBootstrapInFlightSignatureRef.current = '';
      return;
    }
    if (!shouldStartStepDataSourceBootstrap({
      signature: stepDataSourceBootstrapSignature,
      completedSignature: stepDataSourceBootstrapSignatureRef.current,
      inFlightSignature: stepDataSourceBootstrapInFlightSignatureRef.current
    })) {
      return;
    }
    const configEntries = activeStepDataSourceRows
      .map(candidate => {
        if (!candidate || typeof candidate !== 'object') return null;
        const dataSource = (candidate as any).dataSource;
        if (!dataSource || typeof dataSource !== 'object') return null;
        const shouldForceRefresh = shouldForceRefreshStepDataSourceOnBootstrap(candidate, recordChanged);
        return { dataSource, shouldForceRefresh };
      })
      .filter((candidate): candidate is { dataSource: any; shouldForceRefresh: boolean } => Boolean(candidate));
    if (!configEntries.length) return;
    stepDataSourceBootstrapInFlightSignatureRef.current = stepDataSourceBootstrapSignature;

    const runBootstrap = async (): Promise<boolean> => {
      const loadingEntries = configEntries.map(({ dataSource }) => ({ dataSource, id: dataSource?.id }));
      beginStepDataSourceLoading(loadingEntries);
      try {
        let utilisationSyncFreshness: GuidedUtilisationSyncWaitResult['freshness'] = null;
        if (
          shouldWaitForUtilisationSyncBeforeBootstrap &&
          normalizedRecordId &&
          waitForGuidedStepUtilisationDraftSync
        ) {
          onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.start', {
            groupId,
            stepId: currentGuidedStepId || null,
            recordId: normalizedRecordId
          });
          const waitResult = await waitForGuidedStepUtilisationDraftSync({
            recordId: normalizedRecordId,
            stepId: currentGuidedStepId || undefined,
            reason: `stepDataSourceBootstrap:${groupId}`
          });
          if (!waitResult.ok) {
            onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.blocked', {
              groupId,
              stepId: currentGuidedStepId || null,
              recordId: normalizedRecordId,
              message: waitResult.message || null
            });
            return false;
          }
          utilisationSyncFreshness = waitResult.freshness || null;
          onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.done', {
            groupId,
            stepId: currentGuidedStepId || null,
            recordId: normalizedRecordId,
            freshnessDataSourceIds: utilisationSyncFreshness?.dataSourceIds || [],
            freshnessUpdatedRows: utilisationSyncFreshness?.updatedRows || 0
          });
        }

        if (shouldWaitForSharedDataBeforeBootstrap && waitForPendingSharedDataMutations) {
          const targetFormKeys = resolveStepDataSourceTargetFormKeys(configEntries.map(({ dataSource }) => dataSource));
          if (targetFormKeys.length) {
            onDiagnostic?.('guidedStep.dataSourceBootstrap.sharedDataWait.start', {
              groupId,
              stepId: currentGuidedStepId || null,
              recordId: normalizedRecordId || null,
              targetFormKeys
            });
            const waitResult = await waitForPendingSharedDataMutations({
              targetFormKeys,
              recordId: normalizedRecordId || undefined,
              stepId: currentGuidedStepId || undefined,
              reason: `stepDataSourceBootstrap:${groupId}`
            });
            if (!waitResult.ok) {
              onDiagnostic?.('guidedStep.dataSourceBootstrap.sharedDataWait.blocked', {
                groupId,
                stepId: currentGuidedStepId || null,
                recordId: normalizedRecordId || null,
                targetFormKeys,
                message: waitResult.message || null
              });
              return false;
            }
            onDiagnostic?.('guidedStep.dataSourceBootstrap.sharedDataWait.done', {
              groupId,
              stepId: currentGuidedStepId || null,
              recordId: normalizedRecordId || null,
              targetFormKeys
            });
          }
        }

        const pendingFetches = configEntries
          .map(({ dataSource, shouldForceRefresh }) => {
            const cachedDataSource = peekCachedDataSource(dataSource, language);
            const canUseUtilisationSyncFreshness =
              shouldForceRefresh &&
              shouldUseUtilisationSyncFreshnessForDataSource({
                freshness: utilisationSyncFreshness,
                recordId: normalizedRecordId,
                stepId: currentGuidedStepId,
                dataSource,
                cachedDataSource
              });
            if (canUseUtilisationSyncFreshness) {
              onDiagnostic?.('guidedStep.dataSourceBootstrap.fetch.skippedFreshUtilisationSync', {
                groupId,
                stepId: currentGuidedStepId || null,
                recordId: normalizedRecordId || null,
                dataSourceId: `${dataSource?.id || ''}`.trim() || 'default',
                updatedRows: utilisationSyncFreshness?.updatedRows || 0
              });
              return null;
            }
            if (!shouldForceRefresh && cachedDataSource) return null;
            return {
              config: dataSource,
              promise: fetchDataSource(
                dataSource,
                language,
                shouldForceRefresh ? { forceRefresh: true } : undefined
              ).catch(() => null)
            };
          })
          .filter((entry): entry is { config: any; promise: Promise<any> } => Boolean(entry));
        if (!pendingFetches.length) {
          return true;
        }
        const fetchResults = await Promise.all(pendingFetches.map(entry => entry.promise));
        const failedFetches = pendingFetches.filter((_, index) => !fetchResults[index]);
        if (failedFetches.length) {
          onDiagnostic?.('guidedStep.dataSourceBootstrap.fetch.partialFailure', {
            groupId,
            stepId: currentGuidedStepId || null,
            recordId: normalizedRecordId || null,
            dataSourceIds: failedFetches.map(entry => `${entry.config?.id || ''}`.trim()).filter(Boolean)
          });
          return false;
        }
        return true;
      } finally {
        endStepDataSourceLoading(loadingEntries);
      }
    };

    const bootstrapRun = stepDataSourceBootstrapCoordinator.run(stepDataSourceBootstrapSignature, runBootstrap);
    if (!bootstrapRun) {
      stepDataSourceBootstrapInFlightSignatureRef.current = '';
      return;
    }
    if (!bootstrapRun.started) {
      onDiagnostic?.('guidedStep.dataSourceBootstrap.coalesced', {
        groupId,
        stepId: currentGuidedStepId || null,
        recordId: normalizedRecordId || null
      });
    }
    void bootstrapRun.promise
      .then(bootstrapSucceeded => {
        if (!bootstrapSucceeded || !mountedRef.current) return;
        if (currentStepDataSourceBootstrapSignatureRef.current !== stepDataSourceBootstrapSignature) return;
        queueStepDataSourceRefreshTick();
        stepDataSourceBootstrapSignatureRef.current = stepDataSourceBootstrapSignature;
      })
      .finally(() => {
        if (mountedRef.current && currentStepDataSourceBootstrapSignatureRef.current === stepDataSourceBootstrapSignature) {
          queueStepDataSourceRefreshTick();
        }
        if (stepDataSourceBootstrapInFlightSignatureRef.current === stepDataSourceBootstrapSignature) {
          stepDataSourceBootstrapInFlightSignatureRef.current = '';
        }
      });
  }, [
    activeStepDataSourceRows,
    beginStepDataSourceLoading,
    currentGuidedStepId,
    endStepDataSourceLoading,
    groupId,
    language,
    onDiagnostic,
    queueStepDataSourceRefreshTick,
    recordId,
    shouldWaitForUtilisationSyncBeforeBootstrap,
    shouldWaitForSharedDataBeforeBootstrap,
    stepDataSourceBootstrapSignature,
    stepDataSourceBootstrapRetryTick,
    stepDataSourceRows,
    waitForGuidedStepUtilisationDraftSync,
    waitForPendingSharedDataMutations
  ]);

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const watchedDataSourceIds = new Set(
      activeStepDataSourceRows
        .map(candidate =>
          candidate && typeof candidate === 'object' ? `${(candidate as any)?.dataSource?.id || ''}`.trim() : ''
        )
        .filter(Boolean)
    );

    const handleCacheCleared = () => {
      stepDataSourceBootstrapSignatureRef.current = '';
      stepDataSourceBootstrapInFlightSignatureRef.current = '';
      queueStepDataSourceRefreshTick();
      setStepDataSourceBootstrapRetryTick(prev => prev + 1);
    };

    const handleCacheUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const dataSourceId = `${detail?.id || ''}`.trim();
      if (dataSourceId && !watchedDataSourceIds.has(dataSourceId)) return;
      queueStepDataSourceRefreshTick();
    };

    window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheCleared as EventListener);
    window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheUpdated as EventListener);
    return () => {
      window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheCleared as EventListener);
      window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheUpdated as EventListener);
    };
  }, [
    activeStepDataSourceRows,
    queueStepDataSourceRefreshTick,
    stepDataSourceBootstrapSignature
  ]);

  React.useEffect(() => {
    const pending = pendingStepUtilisationDraftSyncRef.current;
    if (!pending || !queueGuidedStepUtilisationDraftSync) return;
    pendingStepUtilisationDraftSyncRef.current = null;
    const snapshotLineItems = latestStepDataSourceSyncedLineItemsRef.current || lineItems;
    latestStepDataSourceSyncedLineItemsRef.current = null;
    queueGuidedStepUtilisationDraftSync({
      stepId: pending.stepId,
      reason: pending.reason,
      snapshotLineItems
    });
  }, [
    lineItems,
    pendingStepUtilisationDraftSyncTick,
    queueGuidedStepUtilisationDraftSync,
    stepDataSourceDrafts,
    values
  ]);

  React.useEffect(() => {
    if (!sourceFirstDataSourceRows.length) {
      sourceFirstPresentationLoggedRef.current = '';
      return;
    }
    const countRows = (config: any): number => {
      if (!config?.dataSource || typeof config.dataSource !== 'object') return 0;
      const cached = peekCachedDataSource(config.dataSource, language);
      const items = Array.isArray((cached as any)?.items) ? (cached as any).items : Array.isArray(cached) ? cached : [];
      return items.length;
    };
    const signature = sourceFirstDataSourceRows
      .map(config => `${(config as any)?.id || 'datasource'}:${countRows(config)}`)
      .join('|');
    if (!signature || sourceFirstPresentationLoggedRef.current === signature) return;
    sourceFirstPresentationLoggedRef.current = signature;
    onDiagnostic?.('dataSourceRows.sourceFirst.enabled', {
      groupId,
      configIds: sourceFirstDataSourceRows.map(config => `${(config as any)?.id || ''}`.trim()).filter(Boolean),
      allocationLabelVisibilityByConfig: sourceFirstDataSourceRows.map(config => ({
        id: `${(config as any)?.id || ''}`.trim() || 'datasource',
        visibility: resolveSourceFirstAllocationLabelVisibility(
          (config as any)?.allocationLabelVisibility ?? (config as any)?.ui?.allocationLabelVisibility
        )
      })),
      rowSortByConfig: sourceFirstDataSourceRows.map(config => ({
        id: `${(config as any)?.id || ''}`.trim() || 'datasource',
        sort: resolveSourceFirstRowSortMode((config as any)?.sourceFirstRowSort ?? (config as any)?.ui?.sourceFirstRowSort)
      })),
      sourceRowCount: sourceFirstDataSourceRows.reduce((count, config) => count + countRows(config), 0),
      parentRowCount
    });
  }, [groupId, language, onDiagnostic, parentRowCount, sourceFirstDataSourceRows]);

  return {
    currentGuidedStepId,
    activeStepDataSourceRows,
    sourceFirstDataSourceRows,
    stepDataSourceRefreshTick,
    queueStepDataSourceRefreshTick,
    stepDataSourceDrafts,
    setStepDataSourceDrafts,
    stepDataSourceDraftsRef,
    utilisationDebounceTimersRef,
    utilisationRequestVersionRef,
    utilisationCommittedValuesRef,
    utilisationSyncCounterRef,
    latestStepDataSourceSyncedLineItemsRef,
    deferredUtilisationAutoSaveHoldReleaseTimerRef,
    isStepDataSourceLoading,
    queueStepUtilisationDraftSnapshotSync,
    queueImmediateStepUtilisationDraftSync,
    updateStepDataSourceAvailability,
    applyStepDataSourceAvailabilitySnapshots
  };
};
