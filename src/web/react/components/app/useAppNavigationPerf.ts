import { useEffect, useRef } from 'react';

import type { View } from '../../types';

export type AppNavigationPerfRef = {
  recordId: string;
  startedAt: number;
  startMark: string;
} | null;

export type AppBackToHomePerfRef = {
  trigger: string;
  startedAt: number;
  startMark: string;
} | null;

export const useAppNavigationPerf = (args: {
  selectedRecordId: string;
  view: View;
  firstListItemCount: number;
  perfMark: (name: string) => void;
  perfMeasure: (name: string, startMark: string, endMark: string, payload?: Record<string, unknown>) => void;
}) => {
  const { selectedRecordId, view, firstListItemCount, perfMark, perfMeasure } = args;
  const openRecordPerfRef = useRef<AppNavigationPerfRef>(null);
  const backToHomePerfRef = useRef<AppBackToHomePerfRef>(null);

  useEffect(() => {
    const pending = openRecordPerfRef.current;
    if (!pending) return;
    if (selectedRecordId !== pending.recordId) return;
    if (view !== 'form' && view !== 'summary') return;
    const endMark = `ck.nav.openRecord.end.${pending.startedAt}`;
    perfMark(endMark);
    perfMeasure('ck.nav.openRecord', pending.startMark, endMark, {
      recordId: pending.recordId,
      view
    });
    openRecordPerfRef.current = null;
  }, [perfMark, perfMeasure, selectedRecordId, view]);

  useEffect(() => {
    const pending = backToHomePerfRef.current;
    if (!pending) return;
    if (view !== 'list') return;
    if (firstListItemCount <= 0) return;
    const endMark = `ck.nav.back.end.${pending.startedAt}`;
    perfMark(endMark);
    perfMeasure('ck.nav.backToHome', pending.startMark, endMark, {
      trigger: pending.trigger,
      firstItemCount: firstListItemCount
    });
    backToHomePerfRef.current = null;
  }, [firstListItemCount, perfMark, perfMeasure, view]);

  return { openRecordPerfRef, backToHomePerfRef };
};
