import React from 'react';

import type { FieldValue, LineItemRowState } from '../../../../types';
import {
  isStepUtilisationCommitEnabled,
  shouldDeferUtilisationSync
} from '../../../components/form/utilisationSyncPolicy';

const GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON = 'guidedStepUtilisationDeferred';

type StepDataSourceDraftMap = Record<string, Record<string, FieldValue>>;

type UseStepDataSourceUtilisationDraftsArgs = {
  groupId: string;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  utilisationCommittedValuesRef: React.MutableRefObject<StepDataSourceDraftMap>;
  utilisationDebounceTimersRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  deferredUtilisationAutoSaveHoldReleaseTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setAutoSaveHold?: (hold: boolean, options?: { reason?: string }) => void;
  setStepDataSourceDrafts: React.Dispatch<React.SetStateAction<StepDataSourceDraftMap>>;
  stepDataSourceDraftsRef: React.MutableRefObject<StepDataSourceDraftMap>;
};

/**
 * Owner: guided step data-source utilisation drafts.
 * Keeps deferred utilisation autosave holds, staged draft patches, and
 * committed-value comparisons out of the line-item group renderer shell.
 */
export const useStepDataSourceUtilisationDrafts = ({
  groupId,
  buildStepDataSourceDraftKey,
  utilisationCommittedValuesRef,
  utilisationDebounceTimersRef,
  deferredUtilisationAutoSaveHoldReleaseTimerRef,
  setAutoSaveHold,
  setStepDataSourceDrafts,
  stepDataSourceDraftsRef
}: UseStepDataSourceUtilisationDraftsArgs) => {
  const buildDeferredStepUtilisationTimerKey = React.useCallback(
    (parentRowId: string, sourceKey: string): string =>
      `${groupId}::stepUtilisationDeferred::${parentRowId || ''}::${sourceKey || ''}`,
    [groupId]
  );

  const requestDeferredStepUtilisationAutoSaveHold = React.useCallback(() => {
    if (deferredUtilisationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredUtilisationAutoSaveHoldReleaseTimerRef.current);
      deferredUtilisationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(true, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredUtilisationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const releaseDeferredStepUtilisationAutoSaveHold = React.useCallback(() => {
    if (deferredUtilisationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredUtilisationAutoSaveHoldReleaseTimerRef.current);
      deferredUtilisationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredUtilisationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const scheduleDeferredStepUtilisationAutoSaveHoldRelease = React.useCallback(() => {
    if (!setAutoSaveHold) return;
    if (deferredUtilisationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredUtilisationAutoSaveHoldReleaseTimerRef.current);
    }
    deferredUtilisationAutoSaveHoldReleaseTimerRef.current = setTimeout(() => {
      deferredUtilisationAutoSaveHoldReleaseTimerRef.current = null;
      setAutoSaveHold(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
    }, 500);
  }, [deferredUtilisationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  React.useEffect(
    () => () => {
      releaseDeferredStepUtilisationAutoSaveHold();
    },
    [releaseDeferredStepUtilisationAutoSaveHold]
  );

  const cancelDeferredStepUtilisationSync = React.useCallback(
    (args: { parentRowId: string; sourceKey: string }) => {
      const timerKey = buildDeferredStepUtilisationTimerKey(args.parentRowId, args.sourceKey);
      const timer = utilisationDebounceTimersRef.current[timerKey];
      if (!timer) return;
      clearTimeout(timer);
      delete utilisationDebounceTimersRef.current[timerKey];
    },
    [buildDeferredStepUtilisationTimerKey, utilisationDebounceTimersRef]
  );

  const queueDeferredStepUtilisationSync = React.useCallback(
    (args: {
      config: any;
      parentRow: LineItemRowState;
      sourceRow: Record<string, any>;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }) => {
      const utilisationConfig = args.config?.utilisation && typeof args.config.utilisation === 'object'
        ? args.config.utilisation
        : null;
      if (!isStepUtilisationCommitEnabled(utilisationConfig)) return;
      if (!args.sourceKey) return;
      requestDeferredStepUtilisationAutoSaveHold();
      const timerKey = buildDeferredStepUtilisationTimerKey(args.parentRow.id, args.sourceKey);
      const previousTimer = utilisationDebounceTimersRef.current[timerKey];
      if (previousTimer) {
        clearTimeout(previousTimer);
        delete utilisationDebounceTimersRef.current[timerKey];
      }
    },
    [buildDeferredStepUtilisationTimerKey, requestDeferredStepUtilisationAutoSaveHold, utilisationDebounceTimersRef]
  );

  const seedUtilisationCommittedValues = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      virtualValues: Record<string, FieldValue>;
    }) => {
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (!quantityFieldId || !args.sourceKey) return;
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      if (utilisationCommittedValuesRef.current[draftKey]) return;
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const committedValues: Record<string, FieldValue> = {};
      if (selectedFieldId) committedValues[selectedFieldId] = args.virtualValues[selectedFieldId];
      committedValues[quantityFieldId] = args.virtualValues[quantityFieldId];
      if (modeFieldId) committedValues[modeFieldId] = args.virtualValues[modeFieldId];
      utilisationCommittedValuesRef.current[draftKey] = committedValues;
    },
    [buildStepDataSourceDraftKey, utilisationCommittedValuesRef]
  );

  const stageStepDataSourceDraftPatch = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      virtualValues: Record<string, FieldValue>;
      patch: Record<string, FieldValue>;
    }) => {
      if (!args.sourceKey) return;
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const nextValues: Record<string, FieldValue> = {
        ...(args.virtualValues || {}),
        ...(args.patch || {})
      };

      setStepDataSourceDrafts(prevDrafts => {
        const nextDraft: Record<string, FieldValue> = {};
        if (selectedFieldId) nextDraft[selectedFieldId] = nextValues[selectedFieldId] === true;
        if (quantityFieldId && Object.prototype.hasOwnProperty.call(nextValues, quantityFieldId)) {
          nextDraft[quantityFieldId] =
            nextValues[quantityFieldId] === undefined ? null : nextValues[quantityFieldId];
        }
        if (
          modeFieldId &&
          Object.prototype.hasOwnProperty.call(nextValues, modeFieldId) &&
          nextValues[modeFieldId] !== undefined &&
          nextValues[modeFieldId] !== null &&
          `${nextValues[modeFieldId]}` !== ''
        ) {
          nextDraft[modeFieldId] = nextValues[modeFieldId];
        }

        const previousDraft = prevDrafts[draftKey] || {};
        const nextDraftKeys = Object.keys(nextDraft);
        const previousDraftKeys = Object.keys(previousDraft);
        if (
          nextDraftKeys.length === previousDraftKeys.length &&
          nextDraftKeys.every(key => previousDraft[key] === nextDraft[key])
        ) {
          return prevDrafts;
        }

        const nextDrafts = { ...prevDrafts };
        nextDrafts[draftKey] = nextDraft;
        stepDataSourceDraftsRef.current = nextDrafts;
        return nextDrafts;
      });
    },
    [buildStepDataSourceDraftKey, setStepDataSourceDrafts, stepDataSourceDraftsRef]
  );

  const hasPendingDeferredUtilisationChange = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }): boolean => {
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (
        !shouldDeferUtilisationSync({
          patch: args.patch,
          selectedFieldId,
          quantityFieldId
        })
      ) {
        return false;
      }
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      const committedValues = utilisationCommittedValuesRef.current[draftKey];
      if (!committedValues) return true;
      const normalizeValue = (value: FieldValue): string | null => {
        if (value === undefined || value === null) return null;
        const text = `${value}`.trim();
        return text ? text : null;
      };
      const nextSelected = selectedFieldId
        ? (Object.prototype.hasOwnProperty.call(args.patch, selectedFieldId)
            ? args.patch[selectedFieldId]
            : committedValues[selectedFieldId]) === true
        : true;
      const committedSelected = selectedFieldId ? committedValues[selectedFieldId] === true : true;
      const nextQuantity = normalizeValue(
        Object.prototype.hasOwnProperty.call(args.patch, quantityFieldId)
          ? args.patch[quantityFieldId]
          : committedValues[quantityFieldId]
      );
      const committedQuantity = normalizeValue(committedValues[quantityFieldId]);
      return nextSelected !== committedSelected || nextQuantity !== committedQuantity;
    },
    [buildStepDataSourceDraftKey, utilisationCommittedValuesRef]
  );

  return {
    seedUtilisationCommittedValues,
    stageStepDataSourceDraftPatch,
    queueDeferredStepUtilisationSync,
    hasPendingDeferredUtilisationChange,
    cancelDeferredStepUtilisationSync,
    scheduleDeferredStepUtilisationAutoSaveHoldRelease
  };
};
