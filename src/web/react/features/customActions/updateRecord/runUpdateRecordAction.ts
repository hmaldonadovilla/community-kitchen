import type { FieldValue, LangCode, WebFormSubmission, WebFormDefinition } from '../../../../types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { View } from '../../../types';
import { buildDraftPayload, resolveExistingRecordId } from '../../../app/submission';
import type { LineItemState } from '../../../types';

type DraftSaveState = { phase: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused'; updatedAt?: string; message?: string };
type StatusTone = 'info' | 'success' | 'error' | null;
type SubmissionMeta = { id?: string; createdAt?: string; updatedAt?: string; dataVersion?: number; status?: string | null };

export type UpdateRecordActionSet = {
  status?: string | null;
  values?: Record<string, any> | null;
};

export type UpdateRecordActionNavigateTo = 'auto' | 'form' | 'summary' | 'list';

export type UpdateRecordActionRequest = {
  buttonId: string;
  buttonRef: string;
  qIdx?: number;
  navigateTo: UpdateRecordActionNavigateTo;
  set: UpdateRecordActionSet;
  busyTitle?: string;
};

export type UpdateRecordActionDeps = {
  definition: WebFormDefinition;
  formKey: string;
  submit: (payload: any) => Promise<any>;
  tSystem: (key: string, language: LangCode, fallback?: string) => string;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;

  // Current UI state (refs)
  refs: {
    languageRef: MutableRefObject<LangCode>;
    valuesRef: MutableRefObject<Record<string, FieldValue>>;
    lineItemsRef: MutableRefObject<LineItemState>;
    selectedRecordIdRef: MutableRefObject<string>;
    selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
    lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
    recordDataVersionRef: MutableRefObject<number | null>;
    recordRowNumberRef: MutableRefObject<number | null>;
    recordSessionRef: MutableRefObject<number>;
    uploadQueueRef: MutableRefObject<Map<string, Promise<{ success: boolean; message?: string }>>>;
    autoSaveInFlightRef: MutableRefObject<boolean>;
    recordStaleRef: MutableRefObject<{ recordId: string; message: string } | null>;
  };

  // UI setters
  setDraftSave: (next: DraftSaveState) => void;
  setStatus: (msg: string | null) => void;
  setStatusLevel: (tone: StatusTone) => void;
  setLastSubmissionMeta: Dispatch<SetStateAction<SubmissionMeta | null>>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setView: (v: View) => void;
  upsertListCacheRow: (args: {
    recordId: string;
    values?: Record<string, any>;
    updatedAt?: string;
    status?: string | null;
    pdfUrl?: string;
    dataVersion?: number;
    rowNumber?: number;
  }) => void;

  // Busy overlay
  busy: {
    lock: (args: { title: string; message: string; kind?: string; diagnosticMeta?: Record<string, unknown> }) => number;
    setMessage: (seq: number, message: string) => void;
    unlock: (seq: number, diagnosticMeta?: Record<string, unknown>) => void;
  };
};

/**
 * runUpdateRecordAction
 * --------------------
 * Implements the `updateRecord` custom button action:
 * - waits for uploads/autosave to settle
 * - performs a server-side draft save with selected field updates
 * - updates local cache + navigates
 *
 * Owner: Feature `updateRecord` (WebForm UI)
 */
export async function runUpdateRecordAction(deps: UpdateRecordActionDeps, req: UpdateRecordActionRequest): Promise<void> {
  const language = deps.refs.languageRef.current;
  const busyTitle = (req.busyTitle || '').toString() || deps.tSystem('common.loading', language, 'Loading…');
  const busySeq = deps.busy.lock({
    title: busyTitle,
    message: deps.tSystem('draft.savingShort', language, 'Saving…'),
    kind: 'updateRecord',
    diagnosticMeta: { buttonId: req.buttonId, qIdx: req.qIdx ?? null }
  });

  try {
    const recordId =
      resolveExistingRecordId({
        selectedRecordId: deps.refs.selectedRecordIdRef.current,
        selectedRecordSnapshot: deps.refs.selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: deps.refs.lastSubmissionMetaRef.current?.id || null
      }) || '';
    if (!recordId) {
      deps.setStatus(deps.tSystem('actions.noRecordSelected', language, 'No record selected.'));
      deps.setStatusLevel('error');
      deps.logEvent('button.updateRecord.blocked.noRecord', { buttonId: req.buttonId, qIdx: req.qIdx ?? null });
      return;
    }

    const waitForBackgroundSaves = async (reason: string): Promise<{ ok: boolean; message?: string }> => {
      const sessionAtStart = deps.refs.recordSessionRef.current;
      // 1) Wait for uploads (which persist URL updates via draft saves).
      if (deps.refs.uploadQueueRef.current.size > 0) {
        deps.busy.setMessage(busySeq, deps.tSystem('common.loading', language, 'Loading…'));
        const snapshots = Array.from(deps.refs.uploadQueueRef.current.values());
        const settled = await Promise.allSettled(snapshots);
        const failures: string[] = [];
        settled.forEach(s => {
          if (s.status !== 'fulfilled') {
            failures.push('Upload failed.');
            return;
          }
          const ok = !!(s.value as any)?.success;
          const msg = ((s.value as any)?.message || '').toString();
          if (!ok) failures.push(msg || 'Upload failed.');
        });
        if (failures.length) {
          const msg = failures[0] || deps.tSystem('files.error.uploadFailed', language, 'Could not add photos.');
          deps.logEvent('button.updateRecord.queue.wait.uploads.failed', { reason, message: msg });
          return { ok: false, message: msg };
        }
      }
      // 2) Wait for in-flight autosave.
      if (deps.refs.autoSaveInFlightRef.current) {
        deps.busy.setMessage(busySeq, deps.tSystem('common.loading', language, 'Loading…'));
        const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));
        while (deps.refs.autoSaveInFlightRef.current) {
          if (deps.refs.recordSessionRef.current !== sessionAtStart) {
            deps.logEvent('button.updateRecord.queue.wait.detached.sessionChanged', {
              reason,
              sessionAtStart,
              sessionNow: deps.refs.recordSessionRef.current
            });
            return { ok: false, message: 'Record session changed.' };
          }
          await sleep(60);
        }
      }
      if (deps.refs.recordStaleRef.current) {
        return { ok: false, message: deps.refs.recordStaleRef.current.message || 'Record is stale. Please refresh.' };
      }
      return { ok: true };
    };

    const waitRes = await waitForBackgroundSaves('updateRecord');
    if (!waitRes.ok) {
      const msg = (waitRes.message || 'Update failed').toString();
      deps.setStatus(msg);
      deps.setStatusLevel('error');
      deps.logEvent('button.updateRecord.blocked.backgroundQueue', { message: msg, recordId });
      return;
    }

    deps.setDraftSave({ phase: 'saving' });
    deps.setStatus(deps.tSystem('actions.saving', language, 'Saving…'));
    deps.setStatusLevel('info');
    deps.busy.setMessage(busySeq, deps.tSystem('draft.savingShort', language, 'Saving…'));

    try {
      const draft = buildDraftPayload({
        definition: deps.definition,
        formKey: deps.formKey,
        language,
        values: deps.refs.valuesRef.current,
        lineItems: deps.refs.lineItemsRef.current,
        existingRecordId: recordId
      }) as any;
      draft.__ckSaveMode = 'draft';
      draft.__ckAllowClosedUpdate = '1';
      const baseVersion = deps.refs.recordDataVersionRef.current;
      if (recordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
        draft.__ckClientDataVersion = Number(baseVersion);
      }

      // Apply requested updates (status + selected top-level scalar fields).
      const setObj = req.set || {};
      if (Object.prototype.hasOwnProperty.call(setObj, 'status')) {
        const nextStatusRaw = (setObj as any).status;
        const nextStatus = nextStatusRaw === null || nextStatusRaw === undefined ? '' : nextStatusRaw.toString();
        draft.__ckStatus = nextStatus;
      }
      const requestedValues =
        setObj.values && typeof setObj.values === 'object' ? ((setObj.values as any) as Record<string, any>) : null;
      const appliedValueFields: string[] = [];
      const skippedValueFields: string[] = [];
      if (requestedValues) {
        Object.keys(requestedValues).forEach(fidRaw => {
          const fid = (fidRaw || '').toString().trim();
          if (!fid) return;
          const qDef = deps.definition.questions.find(q => q && q.id === fid) as any;
          if (!qDef || qDef.type === 'LINE_ITEM_GROUP' || qDef.type === 'FILE_UPLOAD' || qDef.type === 'BUTTON') {
            skippedValueFields.push(fid);
            return;
          }
          const next = (requestedValues as any)[fidRaw];
          // Draft payload expects raw stored values; allow null to clear.
          (draft as any).values[fid] = next as any;
          (draft as any)[fid] = next as any;
          appliedValueFields.push(fid);
        });
      }

      const res = await deps.submit(draft);
      if (!res?.success) {
        const msg = (res?.message || 'Update failed.').toString();
        deps.setDraftSave({ phase: 'error', message: msg });
        deps.setStatus(msg);
        deps.setStatusLevel('error');
        deps.logEvent('button.updateRecord.error', {
          buttonId: req.buttonId,
          qIdx: req.qIdx ?? null,
          recordId,
          message: msg,
          appliedValueCount: appliedValueFields.length,
          skippedValueCount: skippedValueFields.length
        });
        // If the server says Closed, keep UI locked.
        if (msg.toLowerCase().includes('closed')) {
          deps.setLastSubmissionMeta(prev => ({ ...(prev || {}), status: 'Closed' }));
        }
        return;
      }

      const updatedAt = (res?.meta?.updatedAt || '').toString() || undefined;
      const dv = Number((res as any)?.meta?.dataVersion);
      const nextDataVersion = Number.isFinite(dv) && dv > 0 ? dv : undefined;
      const rn = Number((res as any)?.meta?.rowNumber);
      const nextRowNumber = Number.isFinite(rn) && rn >= 2 ? rn : undefined;
      if (nextDataVersion) deps.refs.recordDataVersionRef.current = nextDataVersion;
      if (nextRowNumber) deps.refs.recordRowNumberRef.current = nextRowNumber;

      const nextStatus =
        Object.prototype.hasOwnProperty.call(setObj, 'status') && (setObj as any).status !== undefined && (setObj as any).status !== null
          ? (setObj as any).status.toString()
          : deps.refs.lastSubmissionMetaRef.current?.status || deps.refs.selectedRecordSnapshotRef.current?.status || null;

      deps.setLastSubmissionMeta(prev => ({
        ...(prev || {}),
        id: recordId,
        updatedAt: updatedAt || prev?.updatedAt,
        dataVersion: nextDataVersion ?? prev?.dataVersion,
        status: (nextStatus || null) as any
      }));

      if (appliedValueFields.length) {
        const patch: Record<string, FieldValue> = {};
        appliedValueFields.forEach(fid => {
          (patch as any)[fid] = (draft as any).values?.[fid] as any;
        });
        deps.refs.valuesRef.current = { ...(deps.refs.valuesRef.current || {}), ...(patch as any) };
        deps.setValues(prev => {
          let changed = false;
          const next = { ...(prev || {}) } as any;
          Object.keys(patch).forEach(fid => {
            if ((next as any)[fid] !== (patch as any)[fid]) {
              (next as any)[fid] = (patch as any)[fid];
              changed = true;
            }
          });
          return changed ? (next as any) : prev;
        });
        deps.logEvent('button.updateRecord.localValues.patch', {
          buttonId: req.buttonId,
          qIdx: req.qIdx ?? null,
          recordId,
          fields: appliedValueFields.slice(0, 25),
          fieldCount: appliedValueFields.length
        });
      }

      // Keep record snapshot + list cache consistent (avoid refetch on navigation).
      deps.setSelectedRecordSnapshot(prev => {
        if (!prev) return prev;
        const nextValues = appliedValueFields.length ? { ...(prev.values || {}), ...(draft as any).values } : prev.values || {};
        return { ...prev, status: (nextStatus || prev.status) as any, values: nextValues };
      });
      deps.upsertListCacheRow({
        recordId,
        values: (draft as any).values as any,
        updatedAt,
        status: (nextStatus || undefined) as any,
        dataVersion: nextDataVersion,
        rowNumber: nextRowNumber
      });

      deps.setDraftSave({ phase: 'saved', updatedAt });
      deps.setStatus(deps.tSystem('actions.saved', language, 'Saved.'));
      deps.setStatusLevel('success');

      deps.logEvent('button.updateRecord.success', {
        buttonId: req.buttonId,
        qIdx: req.qIdx ?? null,
        recordId,
        updatedAt: updatedAt || null,
        dataVersion: nextDataVersion || null,
        navigateTo: req.navigateTo,
        appliedValueCount: appliedValueFields.length,
        skippedValueCount: skippedValueFields.length
      });

      if (req.navigateTo === 'form' || req.navigateTo === 'summary' || req.navigateTo === 'list') {
        deps.setView(req.navigateTo as View);
      }
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Update failed.').toString();
      deps.setDraftSave({ phase: 'error', message: msg });
      deps.setStatus(msg);
      deps.setStatusLevel('error');
      deps.logEvent('button.updateRecord.exception', { buttonId: req.buttonId, qIdx: req.qIdx ?? null, recordId, message: msg });
    }
  } finally {
    deps.busy.unlock(busySeq, { buttonId: req.buttonId, qIdx: req.qIdx ?? null });
  }
}

