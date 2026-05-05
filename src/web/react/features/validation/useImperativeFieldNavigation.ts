import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect } from 'react';

import type { WebQuestionDefinition } from '../../../types';
import { parseSubgroupKey } from '../../app/lineItems';

type BooleanMap = Record<string, boolean>;
type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;

type LineItemGroupOverlayState = {
  open?: boolean;
  groupId?: string | null;
};

type SubgroupOverlayState = {
  open?: boolean;
  subKey?: string | null;
};

export const useImperativeFieldNavigation = (args: {
  navigateToFieldRef?: MutableRefObject<((fieldKey: string) => void) | null>;
  nestedGroupMeta: {
    lineFieldToGroupKey: Record<string, string>;
    subgroupFieldToGroupKey: Record<string, string>;
  };
  questions: WebQuestionDefinition[];
  guidedEnabled: boolean;
  guidedInlineLineGroupIds: ReadonlySet<string>;
  onDiagnostic?: DiagnosticHandler;
  openLineItemGroupOverlay: (groupId: string, options?: { source?: 'navigate' }) => void;
  openSubgroupOverlay: (subKey: string, options?: { source?: 'navigate' }) => void;
  questionIdToGroupKey: Record<string, string>;
  lineItemGroupOverlay: LineItemGroupOverlayState;
  subgroupOverlay: SubgroupOverlayState;
  setCollapsedGroups: Dispatch<SetStateAction<BooleanMap>>;
  setCollapsedRows: Dispatch<SetStateAction<BooleanMap>>;
}) => {
  const {
    navigateToFieldRef,
    nestedGroupMeta,
    questions,
    guidedEnabled,
    guidedInlineLineGroupIds,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    lineItemGroupOverlay,
    subgroupOverlay,
    setCollapsedGroups,
    setCollapsedRows
  } = args;

  const navigateToFieldKey = useCallback(
    (fieldKey: string) => {
      const key = (fieldKey || '').toString();
      if (!key) return;
      if (typeof document === 'undefined') return;

      const expandGroupForQuestionId = (questionId: string): boolean => {
        const groupKey = questionIdToGroupKey[questionId];
        if (!groupKey) return false;
        setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
        return true;
      };

      const ensureMountedForKey = (): boolean => {
        const parts = key.split('__');
        if (parts.length !== 3) {
          return expandGroupForQuestionId(key);
        }
        const prefix = parts[0];
        const fieldId = parts[1];
        const rowId = parts[2];
        const subgroupInfo = parseSubgroupKey(prefix);
        if (subgroupInfo) {
          expandGroupForQuestionId(subgroupInfo.rootGroupId);
          const collapseKey = `${subgroupInfo.parentGroupKey}::${subgroupInfo.parentRowId}`;
          setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
          const nestedKey =
            nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.rootGroupId}::${subgroupInfo.path.join('.') || subgroupInfo.subGroupId}__${fieldId}`];
          if (nestedKey) {
            setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
          }
          if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
            openSubgroupOverlay(prefix, { source: 'navigate' });
            onDiagnostic?.('validation.navigate.openSubgroup', { key, subKey: prefix, source: 'click' });
          }
          return true;
        }

        const groupCfg = questions.find(question => question.id === prefix && question.type === 'LINE_ITEM_GROUP');
        const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
        const suppressOverlayForGuidedInline = guidedEnabled && guidedInlineLineGroupIds.has(prefix);
        if (groupOverlayEnabled && !suppressOverlayForGuidedInline) {
          if (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== prefix) {
            openLineItemGroupOverlay(prefix, { source: 'navigate' });
            onDiagnostic?.('validation.navigate.openLineItemGroupOverlay', { key, groupId: prefix, source: 'click' });
          }
        }

        expandGroupForQuestionId(prefix);
        const collapseKey = `${prefix}::${rowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        return true;
      };

      const scrollToKey = (): boolean => {
        const target = document.querySelector<HTMLElement>(`[data-field-path="${key}"]`);
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
        try {
          focusable?.focus({ preventScroll: true });
        } catch {
          // ignore focus issues
        }
        return true;
      };

      const requestedMount = ensureMountedForKey();
      requestAnimationFrame(() => {
        const found = scrollToKey();
        if (!found && requestedMount) {
          requestAnimationFrame(() => scrollToKey());
          setTimeout(() => scrollToKey(), 80);
        }
      });
    },
    [
      nestedGroupMeta.lineFieldToGroupKey,
      nestedGroupMeta.subgroupFieldToGroupKey,
      questions,
      guidedEnabled,
      guidedInlineLineGroupIds,
      onDiagnostic,
      openLineItemGroupOverlay,
      openSubgroupOverlay,
      questionIdToGroupKey,
      lineItemGroupOverlay.groupId,
      lineItemGroupOverlay.open,
      setCollapsedGroups,
      setCollapsedRows,
      subgroupOverlay.open,
      subgroupOverlay.subKey
    ]
  );

  useEffect(() => {
    if (!navigateToFieldRef) return;
    navigateToFieldRef.current = navigateToFieldKey;
    return () => {
      navigateToFieldRef.current = null;
    };
  }, [navigateToFieldKey, navigateToFieldRef]);

  return navigateToFieldKey;
};
