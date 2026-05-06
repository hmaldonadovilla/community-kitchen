import type React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FieldValue, LangCode, VisibilityContext } from '../../../types';
import type { LineItemState } from '../../types';
import {
  computeTopLevelGroupProgress,
  resolveCollapsedGroupsAfterAutoCollapse,
  resolveCompletedGroupAutoCollapse,
  resolvePendingAutoCollapse,
  type TopLevelGroupProgress
} from './groupProgress';
import type { FormGroupSection } from './grouping';

type UseTopLevelGroupAutoCollapseArgs = {
  groupSections: FormGroupSection[];
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  language: LangCode;
  topVisibilityCtx: VisibilityContext;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  autoCollapseGroups: boolean;
  autoOpenNextIncomplete: boolean;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  scheduleScrollGroupToTop: (key: string, options?: { reason?: string }) => void;
  onDiagnostic?: (event: string, payload?: any) => void;
};

/**
 * Owner: top-level group progress and auto-collapse coordination.
 * Keeps DOM focus deferral and scroll side effects out of FormView while
 * returning the computed progress needed by grouped-section rendering.
 */
export const useTopLevelGroupAutoCollapse = ({
  groupSections,
  values,
  lineItems,
  collapsedRows,
  language,
  topVisibilityCtx,
  getTopValue,
  autoCollapseGroups,
  autoOpenNextIncomplete,
  setCollapsedGroups,
  scheduleScrollGroupToTop,
  onDiagnostic
}: UseTopLevelGroupAutoCollapseArgs): TopLevelGroupProgress[] => {
  const topLevelGroupProgress = useMemo(
    () =>
      computeTopLevelGroupProgress({
        groupSections,
        values,
        lineItems,
        collapsedRows,
        language,
        topVisibilityCtx,
        getTopValue
      }),
    [collapsedRows, getTopValue, groupSections, language, lineItems, topVisibilityCtx, values]
  );

  const prevGroupCompleteRef = useRef<Record<string, boolean>>({});
  const pendingAutoCollapseRef = useRef<string[]>([]);
  const autoCollapseFlushTimerRef = useRef<number | null>(null);

  const flushPendingAutoCollapse = useCallback(
    (reason?: string) => {
      if (!autoCollapseGroups) return;
      const { stillComplete, nextOpenKey } = resolvePendingAutoCollapse({
        pendingKeys: pendingAutoCollapseRef.current,
        progress: topLevelGroupProgress,
        autoOpenNextIncomplete
      });
      pendingAutoCollapseRef.current = [];
      if (!stillComplete.length) return;

      setCollapsedGroups(prev => {
        const { next, changed } = resolveCollapsedGroupsAfterAutoCollapse({
          collapsedGroups: prev,
          completedKeys: stillComplete,
          nextOpenKey
        });
        if (changed) {
          onDiagnostic?.('ui.group.autoCollapse', {
            completed: stillComplete,
            opened: nextOpenKey || null,
            deferred: true,
            reason: reason || 'flush'
          });
        }
        return changed ? next : prev;
      });

      if (nextOpenKey) {
        scheduleScrollGroupToTop(nextOpenKey, { reason: 'autoOpenNext' });
      }
    },
    [autoCollapseGroups, autoOpenNextIncomplete, onDiagnostic, scheduleScrollGroupToTop, setCollapsedGroups, topLevelGroupProgress]
  );

  useEffect(() => {
    if (!autoCollapseGroups) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handler = () => {
      if (!pendingAutoCollapseRef.current.length) return;
      if (autoCollapseFlushTimerRef.current !== null) {
        window.clearTimeout(autoCollapseFlushTimerRef.current);
      }
      autoCollapseFlushTimerRef.current = window.setTimeout(() => {
        autoCollapseFlushTimerRef.current = null;
        const active = document.activeElement as HTMLElement | null;
        const activeGroupKey = (active?.closest('[data-group-key]') as HTMLElement | null)?.dataset?.groupKey || '';
        if (activeGroupKey && pendingAutoCollapseRef.current.includes(activeGroupKey)) {
          return;
        }
        flushPendingAutoCollapse('focus');
      }, 0);
    };

    document.addEventListener('focusin', handler, true);
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusin', handler, true);
      document.removeEventListener('focusout', handler, true);
      if (autoCollapseFlushTimerRef.current !== null) {
        window.clearTimeout(autoCollapseFlushTimerRef.current);
        autoCollapseFlushTimerRef.current = null;
      }
    };
  }, [autoCollapseGroups, flushPendingAutoCollapse]);

  useEffect(() => {
    if (!autoCollapseGroups) return;
    if (!topLevelGroupProgress.length) return;

    const { nextComplete, completedNow, nextOpenKey } = resolveCompletedGroupAutoCollapse({
      previousComplete: prevGroupCompleteRef.current || {},
      progress: topLevelGroupProgress,
      autoOpenNextIncomplete
    });
    prevGroupCompleteRef.current = nextComplete;
    if (!completedNow.length) return;

    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const tag = active?.tagName ? active.tagName.toLowerCase() : '';
    const isEditable =
      tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean((active as any)?.isContentEditable);
    const activeGroupKey = (active?.closest('[data-group-key]') as HTMLElement | null)?.dataset?.groupKey || '';
    if (isEditable && activeGroupKey && completedNow.includes(activeGroupKey)) {
      pendingAutoCollapseRef.current = Array.from(new Set([...(pendingAutoCollapseRef.current || []), ...completedNow]));
      onDiagnostic?.('ui.group.autoCollapse.defer', { activeGroupKey, completed: completedNow });
      return;
    }

    setCollapsedGroups(prev => {
      const { next, changed } = resolveCollapsedGroupsAfterAutoCollapse({
        collapsedGroups: prev,
        completedKeys: completedNow,
        nextOpenKey
      });
      if (changed) {
        onDiagnostic?.('ui.group.autoCollapse', {
          completed: completedNow,
          opened: nextOpenKey || null
        });
      }
      return changed ? next : prev;
    });

    if (nextOpenKey) {
      scheduleScrollGroupToTop(nextOpenKey, { reason: 'autoOpenNext' });
    }
  }, [
    autoCollapseGroups,
    autoOpenNextIncomplete,
    onDiagnostic,
    scheduleScrollGroupToTop,
    setCollapsedGroups,
    topLevelGroupProgress
  ]);

  return topLevelGroupProgress;
};
