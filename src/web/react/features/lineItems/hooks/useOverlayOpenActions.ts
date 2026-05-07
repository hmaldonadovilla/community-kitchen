import { useMemo, type MutableRefObject } from 'react';

import { matchesWhen } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { LineItemOverlayOpenActionConfig, LineItemGroupConfigOverride } from '../../../../../types';
import type { LineItemState } from '../../../types';
import { buildSubgroupKey, resolveSubgroupKey } from '../../../app/lineItems';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import { resolveFieldLabel } from '../../../utils/labels';
import { matchesWhenClause } from '../../../../rules/visibility';

interface UseOverlayOpenActionsArgs {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  language: LangCode;
  topVisibilityCtx: VisibilityContext;
  overlayOpenActionLoggedRef: MutableRefObject<Set<string>>;
  isOverlayOpenActionSuppressed: (key: string) => boolean;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}

const buildOverlayGroupOverride = (
  group: WebQuestionDefinition,
  override?: LineItemGroupConfigOverride
): WebQuestionDefinition | undefined => {
  if (!override || typeof override !== 'object') return undefined;
  const baseConfig = group.lineItemConfig as any;
  if (!baseConfig) return undefined;
  const mergedConfig = applyLineItemGroupOverride(baseConfig, override);
  return {
    ...group,
    id: group.id,
    lineItemConfig: mergedConfig
  };
};

const normalizeOverlayFlattenPlacement = (raw: any): 'left' | 'right' | 'below' => {
  const placement = (raw || '').toString().trim().toLowerCase();
  if (placement === 'left' || placement === 'right') return placement;
  return 'below';
};

const extractSelfWhen = (when: any, fieldId: string): any | null => {
  if (!when || typeof when !== 'object') return null;
  if (Array.isArray(when)) return null;
  const list = (when as any).all ?? (when as any).and ?? (when as any).any ?? (when as any).or;
  if (Array.isArray(list)) {
    if (list.length !== 1) return null;
    return extractSelfWhen(list[0], fieldId);
  }
  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) return null;
  if ((when as any).lineItems || (when as any).lineItem) return null;
  const whenFieldId = (when as any).fieldId;
  if (whenFieldId === undefined || whenFieldId === null) return null;
  return whenFieldId.toString().trim() === fieldId ? when : null;
};

export function useOverlayOpenActions({
  definition,
  values,
  lineItems,
  language,
  topVisibilityCtx,
  overlayOpenActionLoggedRef,
  isOverlayOpenActionSuppressed,
  onDiagnostic
}: UseOverlayOpenActionsArgs) {
  const subgroupPathIndex = useMemo(() => {
    const map = new Map<string, Array<{ rootId: string; path: string[] }>>();
    const walk = (rootId: string, subGroups: any[], path: string[]) => {
      (subGroups || []).forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const nextPath = [...path, subId];
        const existing = map.get(subId) || [];
        existing.push({ rootId, path: nextPath });
        map.set(subId, existing);
        if (Array.isArray(sub?.subGroups) && sub.subGroups.length) {
          walk(rootId, sub.subGroups, nextPath);
        }
      });
    };
    (definition.questions || []).forEach(q => {
      if (q?.type !== 'LINE_ITEM_GROUP') return;
      walk(q.id, (q.lineItemConfig?.subGroups || []) as any[], []);
    });
    return map;
  }, [definition.questions]);

  const resolveOverlayOpenActionForQuestion = (question: WebQuestionDefinition) => {
    if (isOverlayOpenActionSuppressed(question.id)) return null;
    const rawActions =
      (question.ui as any)?.overlayOpenActions ??
      (question as any)?.overlayOpenActions ??
      (question.ui as any)?.overlayOpenAction ??
      (question as any)?.overlayOpenAction;
    const actions: LineItemOverlayOpenActionConfig[] = Array.isArray(rawActions)
      ? rawActions
      : rawActions
        ? [rawActions]
        : [];
    if (!actions.length) return null;
    const match = actions.find((action: LineItemOverlayOpenActionConfig) => {
      if (!action || typeof action !== 'object') return false;
      if (!action.groupId) return false;
      if (!action.when) return true;
      const selfWhen = extractSelfWhen(action.when as any, question.id);
      if (selfWhen) {
        return matchesWhen(values[question.id], selfWhen);
      }
      return matchesWhenClause(action.when as any, topVisibilityCtx);
    });
    if (!match) return null;
    const groupId = (match.groupId || '').toString();
    if (!groupId) return null;
    const group = definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP') as
      | WebQuestionDefinition
      | undefined;
    let targetKind: 'line' | 'sub' = 'line';
    let targetKey = groupId;
    let rootGroupId = groupId;
    let parentRowId: string | null = null;
    if (!group) {
      const subgroupMatches = subgroupPathIndex.get(groupId) || [];
      if (!subgroupMatches.length) {
        const missKey = `${question.id}::overlayOpenAction::missing::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(missKey)) {
          overlayOpenActionLoggedRef.current.add(missKey);
          onDiagnostic('ui.overlayOpenAction.missingGroup', { questionId: question.id, groupId });
        }
        return null;
      }
      if (subgroupMatches.length > 1) {
        const ambiguousKey = `${question.id}::overlayOpenAction::ambiguous::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(ambiguousKey)) {
          overlayOpenActionLoggedRef.current.add(ambiguousKey);
          onDiagnostic('ui.overlayOpenAction.ambiguousGroup', {
            questionId: question.id,
            groupId,
            rootIds: subgroupMatches.map(entry => entry.rootId)
          });
        }
      }
      const [matchEntry] = subgroupMatches;
      const path = Array.isArray(matchEntry?.path) ? matchEntry.path : [];
      if (!path.length) {
        const pathKey = `${question.id}::overlayOpenAction::pathMissing::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(pathKey)) {
          overlayOpenActionLoggedRef.current.add(pathKey);
          onDiagnostic('ui.overlayOpenAction.pathMissing', { questionId: question.id, groupId });
        }
        return null;
      }
      if (path.length > 1) {
        const pathKey = `${question.id}::overlayOpenAction::pathUnsupported::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(pathKey)) {
          overlayOpenActionLoggedRef.current.add(pathKey);
          onDiagnostic('ui.overlayOpenAction.pathUnsupported', { questionId: question.id, groupId, path });
        }
        return null;
      }
      const parentRows = (lineItems as any)[matchEntry.rootId] || [];
      if (!parentRows.length) {
        const rowKey = `${question.id}::overlayOpenAction::missingParent::${groupId}`;
        if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(rowKey)) {
          overlayOpenActionLoggedRef.current.add(rowKey);
          onDiagnostic('ui.overlayOpenAction.missingParentRow', {
            questionId: question.id,
            groupId,
            rootGroupId: matchEntry.rootId
          });
        }
        return null;
      }
      const parentRow = parentRows[0];
      rootGroupId = matchEntry.rootId;
      parentRowId = parentRow?.id || null;
      targetKey = parentRowId ? buildSubgroupKey(rootGroupId, parentRowId, path[0]) : '';
      targetKind = 'sub';
    }
    const rowFilterRaw = (match as any).rowFilter ?? (match as any).rows ?? null;
    const rowFilter = rowFilterRaw && typeof rowFilterRaw === 'object' ? rowFilterRaw : null;
    const overrideGroup = group ? buildOverlayGroupOverride(group, match.groupOverride) : undefined;
    const renderMode = (match.renderMode || 'replace').toString().trim().toLowerCase();
    const label = resolveLocalizedString(match.label, language, resolveFieldLabel(question, language, question.id));
    const flattenPlacement = normalizeOverlayFlattenPlacement((match as any).flattenPlacement);
    const logKey = `${question.id}::overlayOpenAction::${groupId}::${renderMode}`;
    if (onDiagnostic && !overlayOpenActionLoggedRef.current.has(logKey)) {
      overlayOpenActionLoggedRef.current.add(logKey);
      onDiagnostic('ui.overlayOpenAction.available', {
        questionId: question.id,
        groupId,
        renderMode,
        hasRowFilter: !!rowFilter,
        hasOverride: !!overrideGroup,
        flattenPlacement,
        hideTrashIcon: (match as any).hideTrashIcon === true
      });
    }
    return {
      action: match,
      groupId,
      group,
      overrideGroup,
      groupOverride: match.groupOverride,
      rowFilter,
      hideInlineSubgroups: match.hideInlineSubgroups === true,
      renderMode,
      label,
      tone: ((match as any).tone || 'primary').toString().trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary',
      flattenPlacement,
      hideTrashIcon: (match as any).hideTrashIcon === true,
      targetKind,
      targetKey,
      rootGroupId,
      parentRowId
    };
  };

  const overlayOpenActionTargetGroups = useMemo(() => {
    const targets = new Set<string>();
    const topLevelGroupIds = new Set(
      (definition.questions || [])
        .filter(q => q?.type === 'LINE_ITEM_GROUP')
        .map(q => (q?.id !== undefined && q?.id !== null ? q.id.toString().trim() : ''))
        .filter(Boolean)
    );
    (definition.questions || []).forEach(question => {
      const rawActions =
        (question.ui as any)?.overlayOpenActions ??
        (question as any)?.overlayOpenActions ??
        (question.ui as any)?.overlayOpenAction ??
        (question as any)?.overlayOpenAction;
      const actions: LineItemOverlayOpenActionConfig[] = Array.isArray(rawActions)
        ? rawActions
        : rawActions
          ? [rawActions]
          : [];
      actions.forEach(action => {
        const groupId =
          action?.groupId !== undefined && action?.groupId !== null ? action.groupId.toString().trim() : '';
        if (!groupId) return;
        if (topLevelGroupIds.has(groupId)) {
          targets.add(groupId);
          return;
        }
        const subgroupMatches = subgroupPathIndex.get(groupId) || [];
        subgroupMatches.forEach(entry => {
          if (entry?.rootId) targets.add(entry.rootId);
        });
      });
    });
    return targets;
  }, [definition.questions, subgroupPathIndex]);

  return {
    overlayOpenActionTargetGroups,
    resolveOverlayOpenActionForQuestion
  };
}
