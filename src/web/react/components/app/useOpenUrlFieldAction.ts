import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode, WebFormSubmission } from '../../../types';
import { openUrlInNewContext } from '../../app/openUrlField';
import { resolveExistingRecordId } from '../../app/submission';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

/**
 * Owner: App shell.
 * Executes open-url-field custom buttons while App.tsx retains button routing.
 */
export const useOpenUrlFieldAction = (args: {
  languageRef: MutableRefObject<LangCode>;
  selectedRecordIdRef: MutableRefObject<string>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
  resolveOpenUrlFieldHref: (fieldIdRaw: string) => string;
  setStatus: Dispatch<SetStateAction<string | null>>;
  setStatusLevel: Dispatch<SetStateAction<'info' | 'success' | 'error' | null>>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    languageRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    resolveOpenUrlFieldHref,
    setStatus,
    setStatusLevel,
    logEvent
  } = args;

  return useCallback(
    (actionArgs: { baseId: string; qIdx?: number; fieldId: string }) => {
      const { baseId, qIdx, fieldId } = actionArgs;
      const normalizedFieldId = (fieldId || '').toString().trim();
      if (!normalizedFieldId) return;

      const recordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      const href = resolveOpenUrlFieldHref(normalizedFieldId);
      if (!href) {
        setStatus(tSystem('actions.missingLink', languageRef.current, 'No link found.'));
        setStatusLevel('error');
        logEvent('button.openUrl.missing', {
          buttonId: baseId,
          qIdx: qIdx ?? null,
          fieldId: normalizedFieldId,
          recordId: recordId || null
        });
        return;
      }

      const result = openUrlInNewContext({
        href,
        openWindow: globalThis.window?.open?.bind(globalThis.window) as any,
        assignLocation: globalThis.location?.assign?.bind(globalThis.location),
        allowCurrentWindowNavigation: false
      });
      if (!result.opened) {
        setStatus(tSystem('actions.openLinkBlocked', languageRef.current, 'Open the link from the action menu again if it did not open.'));
        setStatusLevel('info');
      }
      logEvent('button.openUrl.open', {
        buttonId: baseId,
        qIdx: qIdx ?? null,
        fieldId: normalizedFieldId,
        opened: result.opened,
        method: result.method
      });
    },
    [
      languageRef,
      lastSubmissionMetaRef,
      logEvent,
      resolveOpenUrlFieldHref,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      setStatus,
      setStatusLevel
    ]
  );
};
