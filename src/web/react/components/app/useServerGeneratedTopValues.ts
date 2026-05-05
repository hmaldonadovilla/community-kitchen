import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FieldValue, WebFormSubmission } from '../../../types';
import {
  extractServerGeneratedTopValues,
  mergeServerGeneratedTopValues
} from '../../app/serverGeneratedValues';

/**
 * Owner: App shell.
 * Applies server-generated top-level field values to live form state and the
 * selected-record snapshot after save/submit responses.
 */
export const useServerGeneratedTopValues = (args: {
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    valuesRef,
    selectedRecordSnapshotRef,
    setValues,
    setSelectedRecordSnapshot,
    logEvent
  } = args;

  return useCallback(
    (response: any, source: string): Record<string, FieldValue> => {
      const generatedValues = extractServerGeneratedTopValues(response);
      const generatedFieldIds = Object.keys(generatedValues);
      if (!generatedFieldIds.length) return {};
      const nextValues = mergeServerGeneratedTopValues(valuesRef.current, generatedValues);
      valuesRef.current = nextValues;
      setValues(prev => mergeServerGeneratedTopValues(prev, generatedValues));
      setSelectedRecordSnapshot(prev =>
        prev
          ? {
              ...prev,
              values: mergeServerGeneratedTopValues((prev.values || {}) as Record<string, FieldValue>, generatedValues)
            }
          : prev
      );
      selectedRecordSnapshotRef.current = selectedRecordSnapshotRef.current
        ? ({
            ...selectedRecordSnapshotRef.current,
            values: mergeServerGeneratedTopValues(
              (selectedRecordSnapshotRef.current.values || {}) as Record<string, FieldValue>,
              generatedValues
            )
          } as WebFormSubmission)
        : selectedRecordSnapshotRef.current;
      logEvent('serverGeneratedValues.applied', {
        source,
        fieldIds: generatedFieldIds
      });
      return generatedValues;
    },
    [logEvent, selectedRecordSnapshotRef, setSelectedRecordSnapshot, setValues, valuesRef]
  );
};
