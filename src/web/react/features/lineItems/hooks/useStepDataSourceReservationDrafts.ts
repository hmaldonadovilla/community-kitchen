import React from 'react';

import type { FieldValue, LineItemRowState } from '../../../../types';
import {
  isStepReservationCommitEnabled,
  shouldDeferReservationSync
} from '../../../components/form/reservationSyncPolicy';

const GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON = 'guidedStepReservationDeferred';

type StepDataSourceDraftMap = Record<string, Record<string, FieldValue>>;

type UseStepDataSourceReservationDraftsArgs = {
  groupId: string;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  reservationCommittedValuesRef: React.MutableRefObject<StepDataSourceDraftMap>;
  reservationDebounceTimersRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  deferredReservationAutoSaveHoldReleaseTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setAutoSaveHold?: (hold: boolean, options?: { reason?: string }) => void;
  setStepDataSourceDrafts: React.Dispatch<React.SetStateAction<StepDataSourceDraftMap>>;
  stepDataSourceDraftsRef: React.MutableRefObject<StepDataSourceDraftMap>;
};

/**
 * Owner: guided step data-source reservation drafts.
 * Keeps deferred reservation autosave holds, staged draft patches, and
 * committed-value comparisons out of the line-item group renderer shell.
 */
export const useStepDataSourceReservationDrafts = ({
  groupId,
  buildStepDataSourceDraftKey,
  reservationCommittedValuesRef,
  reservationDebounceTimersRef,
  deferredReservationAutoSaveHoldReleaseTimerRef,
  setAutoSaveHold,
  setStepDataSourceDrafts,
  stepDataSourceDraftsRef
}: UseStepDataSourceReservationDraftsArgs) => {
  const buildDeferredStepReservationTimerKey = React.useCallback(
    (parentRowId: string, sourceKey: string): string =>
      `${groupId}::stepReservationDeferred::${parentRowId || ''}::${sourceKey || ''}`,
    [groupId]
  );

  const requestDeferredStepReservationAutoSaveHold = React.useCallback(() => {
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(true, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const releaseDeferredStepReservationAutoSaveHold = React.useCallback(() => {
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const scheduleDeferredStepReservationAutoSaveHoldRelease = React.useCallback(() => {
    if (!setAutoSaveHold) return;
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
    }
    deferredReservationAutoSaveHoldReleaseTimerRef.current = setTimeout(() => {
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
      setAutoSaveHold(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
    }, 500);
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  React.useEffect(
    () => () => {
      releaseDeferredStepReservationAutoSaveHold();
    },
    [releaseDeferredStepReservationAutoSaveHold]
  );

  const cancelDeferredStepReservationSync = React.useCallback(
    (args: { parentRowId: string; sourceKey: string }) => {
      const timerKey = buildDeferredStepReservationTimerKey(args.parentRowId, args.sourceKey);
      const timer = reservationDebounceTimersRef.current[timerKey];
      if (!timer) return;
      clearTimeout(timer);
      delete reservationDebounceTimersRef.current[timerKey];
    },
    [buildDeferredStepReservationTimerKey, reservationDebounceTimersRef]
  );

  const queueDeferredStepReservationSync = React.useCallback(
    (args: {
      config: any;
      parentRow: LineItemRowState;
      sourceRow: Record<string, any>;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }) => {
      const reservationConfig = args.config?.reservation && typeof args.config.reservation === 'object'
        ? args.config.reservation
        : null;
      if (!isStepReservationCommitEnabled(reservationConfig)) return;
      if (!args.sourceKey) return;
      requestDeferredStepReservationAutoSaveHold();
      const timerKey = buildDeferredStepReservationTimerKey(args.parentRow.id, args.sourceKey);
      const previousTimer = reservationDebounceTimersRef.current[timerKey];
      if (previousTimer) {
        clearTimeout(previousTimer);
        delete reservationDebounceTimersRef.current[timerKey];
      }
    },
    [buildDeferredStepReservationTimerKey, requestDeferredStepReservationAutoSaveHold, reservationDebounceTimersRef]
  );

  const seedReservationCommittedValues = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      virtualValues: Record<string, FieldValue>;
    }) => {
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (!quantityFieldId || !args.sourceKey) return;
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      if (reservationCommittedValuesRef.current[draftKey]) return;
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const committedValues: Record<string, FieldValue> = {};
      if (selectedFieldId) committedValues[selectedFieldId] = args.virtualValues[selectedFieldId];
      committedValues[quantityFieldId] = args.virtualValues[quantityFieldId];
      if (modeFieldId) committedValues[modeFieldId] = args.virtualValues[modeFieldId];
      reservationCommittedValuesRef.current[draftKey] = committedValues;
    },
    [buildStepDataSourceDraftKey, reservationCommittedValuesRef]
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

  const hasPendingDeferredReservationChange = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }): boolean => {
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (
        !shouldDeferReservationSync({
          patch: args.patch,
          selectedFieldId,
          quantityFieldId
        })
      ) {
        return false;
      }
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      const committedValues = reservationCommittedValuesRef.current[draftKey];
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
    [buildStepDataSourceDraftKey, reservationCommittedValuesRef]
  );

  return {
    seedReservationCommittedValues,
    stageStepDataSourceDraftPatch,
    queueDeferredStepReservationSync,
    hasPendingDeferredReservationChange,
    cancelDeferredStepReservationSync,
    scheduleDeferredStepReservationAutoSaveHoldRelease
  };
};
