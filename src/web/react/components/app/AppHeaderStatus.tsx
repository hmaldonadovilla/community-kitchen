import React, { useMemo } from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export type HeaderDraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

export const shouldRenderAppHeaderSaveNotice = (args: {
  view: string;
  autoSaveEnabled: boolean;
  draftSavePhase: HeaderDraftSavePhase;
  isClosedRecord: boolean;
}): boolean => {
  if (args.isClosedRecord) return false;
  if (!args.autoSaveEnabled) return false;
  if (args.draftSavePhase === 'idle') return false;
  return args.view === 'form' || args.draftSavePhase === 'saving';
};

/**
 * Owner: app header UI.
 * Renders environment and autosave/read-only status next to the form title.
 * Navigation and draft persistence remain owned by App.
 */
export const AppHeaderStatus: React.FC<{
  envTag?: string;
  language: LangCode;
  view: string;
  autoSaveEnabled: boolean;
  draftSavePhase: HeaderDraftSavePhase;
  draftSaveMessage?: string | null;
  isClosedRecord: boolean;
}> = ({ envTag, language, view, autoSaveEnabled, draftSavePhase, draftSaveMessage, isClosedRecord }) => {
  const saveIndicator = useMemo(() => {
    const showForView = view === 'form' || (autoSaveEnabled && draftSavePhase === 'saving');
    if (!showForView) return null;

    if (isClosedRecord) {
      return (
        <output className="ck-app-record-status" aria-live="polite" data-tone="paused">
          {tSystem('app.closedReadOnly', language, 'Closed (read-only)')}
        </output>
      );
    }

    if (!shouldRenderAppHeaderSaveNotice({ view, autoSaveEnabled, draftSavePhase, isClosedRecord })) return null;

    const byPhase: Partial<Record<HeaderDraftSavePhase, { key: string; fallback: string; tone: string }>> = {
      saving: { key: 'draft.savingShort', fallback: 'Saving…', tone: 'saving' },
      saved: { key: 'draft.savedShort', fallback: 'Saved', tone: 'saved' },
      dirty: { key: 'draft.dirtyShort', fallback: 'Unsaved changes', tone: 'muted' },
      paused: { key: 'draft.pausedShort', fallback: 'Autosave paused', tone: 'paused' },
      error: { key: 'draft.saveFailedShort', fallback: 'Save failed', tone: 'error' }
    };
    const def = byPhase[draftSavePhase];
    if (!def) return null;

    const text =
      draftSavePhase === 'paused' ? (draftSaveMessage || tSystem(def.key, language, def.fallback)) : tSystem(def.key, language, def.fallback);
    return (
      <output className="ck-app-save-status" aria-live="polite" data-tone={def.tone}>
        {text}
      </output>
    );
  }, [autoSaveEnabled, draftSaveMessage, draftSavePhase, isClosedRecord, language, view]);

  const envStatus = useMemo(() => {
    const trimmed = (envTag || '').toString().trim();
    if (!trimmed) return null;
    return (
      <span className="ck-env-tag" role="status" aria-label={`Environment: ${trimmed}`}>
        {trimmed}
      </span>
    );
  }, [envTag]);

  if (!envStatus && !saveIndicator) return null;

  return (
    <>
      {envStatus}
      {saveIndicator}
    </>
  );
};
