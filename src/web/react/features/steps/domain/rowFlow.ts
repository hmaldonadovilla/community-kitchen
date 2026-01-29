import { matchesWhenClause } from '../../../../rules/visibility';
import { isEmptyValue } from '../../../utils/values';
import type { FieldValue, LineItemRowState, VisibilityContext } from '../../../../types';
import type { LineItemState } from '../../../types';
import type {
  LineItemGroupConfigOverride,
  RowFlowActionConfig,
  RowFlowActionConfirmConfig,
  RowFlowActionEffect,
  RowFlowActionRef,
  RowFlowConfig,
  RowFlowOverlayContextHeaderConfig,
  RowFlowOutputSegmentConfig,
  RowFlowPromptConfig,
  StepRowFilterConfig,
  WhenClause
} from '../../../../../types';
import { buildSubgroupKey } from '../../../app/lineItems';

type MatchMode = 'first' | 'any' | 'all';

export type RowFlowResolvedRow = {
  groupKey: string;
  row: LineItemRowState;
};

export type RowFlowResolvedReference = {
  id: string;
  groupId: string;
  match: MatchMode;
  rowFilter?: StepRowFilterConfig;
  rows: RowFlowResolvedRow[];
};

export type RowFlowResolvedFieldTarget = {
  refId?: string;
  fieldId: string;
  groupId: string;
  groupKey: string;
  rows: RowFlowResolvedRow[];
  primaryRow?: RowFlowResolvedRow;
  parentValues?: Record<string, FieldValue>;
};

export type RowFlowResolvedSegment = {
  id: string;
  config: RowFlowOutputSegmentConfig;
  target: RowFlowResolvedFieldTarget | null;
  values: FieldValue[];
};

export type RowFlowResolvedPrompt = {
  id: string;
  config: RowFlowPromptConfig;
  target: RowFlowResolvedFieldTarget | null;
  // Raw completion state (used for auto-actions and effects).
  complete: boolean;
  // Completion state used for prompting/visibility while a field is focused.
  completeForPrompting: boolean;
  visible: boolean;
  showWhenOk: boolean;
};

export type RowFlowResolvedEffect =
  | {
      type: 'setValue';
      groupKey: string;
      rowId: string;
      fieldId: string;
      value?: FieldValue;
    }
  | {
      type: 'deleteLineItems';
      groupKey: string;
      rowIds: string[];
    }
  | {
      type: 'deleteRow';
      groupKey: string;
      rowId: string;
    }
  | {
      type: 'addLineItems';
      groupKey: string;
      preset?: Record<string, FieldValue>;
      count: number;
    }
  | {
      type: 'closeOverlay';
    }
  | {
      type: 'openOverlay';
      targetKind: 'line' | 'sub';
      key: string;
      rowFilter?: StepRowFilterConfig;
      label?: unknown;
      hideInlineSubgroups?: boolean;
      hideCloseButton?: boolean;
      closeButtonLabel?: unknown;
      closeConfirm?: RowFlowActionConfirmConfig;
      groupOverride?: LineItemGroupConfigOverride;
      rowFlow?: RowFlowConfig;
      overlayContextHeader?: RowFlowOverlayContextHeaderConfig;
      overlayHelperText?: RowFlowOverlayContextHeaderConfig;
    };

export type RowFlowResolvedActionPlan = {
  action: RowFlowActionConfig;
  effects: RowFlowResolvedEffect[];
};

export type RowFlowResolvedState = {
  references: Record<string, RowFlowResolvedReference>;
  segments: RowFlowResolvedSegment[];
  prompts: RowFlowResolvedPrompt[];
  activePromptId?: string;
  outputActions: RowFlowActionRef[];
};

const normalizeMatchMode = (raw?: string): MatchMode => {
  const value = raw ? raw.toString().trim().toLowerCase() : '';
  if (value === 'any') return 'any';
  if (value === 'all') return 'all';
  return 'first';
};

const parseFieldRef = (fieldRef: string, refs: Record<string, unknown>): { refId?: string; fieldId: string } => {
  const raw = fieldRef ? fieldRef.toString() : '';
  if (!raw) return { fieldId: '' };
  if (!raw.includes('.')) return { fieldId: raw };
  const [prefix, ...rest] = raw.split('.').map(seg => seg.trim()).filter(Boolean);
  if (prefix && refs[prefix]) {
    return { refId: prefix, fieldId: rest.join('.') || '' };
  }
  return { fieldId: raw };
};

const buildRowFilterCtx = (rowValues: Record<string, FieldValue>): VisibilityContext => ({
  getValue: (fid: string) => (rowValues as any)[fid],
  getLineItems: () => [],
  getLineItemKeys: () => []
});

const filterRows = (rows: LineItemRowState[], rowFilter?: StepRowFilterConfig): LineItemRowState[] => {
  if (!rowFilter) return rows;
  const includeWhen = rowFilter?.includeWhen;
  const excludeWhen = rowFilter?.excludeWhen;
  return rows.filter(row => {
    const rowCtx = buildRowFilterCtx((row?.values || {}) as Record<string, FieldValue>);
    const includeOk = includeWhen ? matchesWhenClause(includeWhen as WhenClause, rowCtx) : true;
    const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as WhenClause, rowCtx) : false;
    return includeOk && !excludeMatch;
  });
};

const buildVisibilityCtx = (args: {
  rowValues?: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  topValues?: Record<string, FieldValue>;
  lineItems: LineItemState;
}): VisibilityContext => {
  const { rowValues, parentValues, topValues, lineItems } = args;
  return {
    getValue: (fieldId: string) => {
      if (rowValues && Object.prototype.hasOwnProperty.call(rowValues, fieldId)) return (rowValues as any)[fieldId];
      if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return (parentValues as any)[fieldId];
      if (topValues && Object.prototype.hasOwnProperty.call(topValues, fieldId)) return (topValues as any)[fieldId];
      return undefined;
    },
    getLineValue: (_rowId: string, fieldId: string) => {
      if (rowValues && Object.prototype.hasOwnProperty.call(rowValues, fieldId)) return (rowValues as any)[fieldId];
      if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return (parentValues as any)[fieldId];
      if (topValues && Object.prototype.hasOwnProperty.call(topValues, fieldId)) return (topValues as any)[fieldId];
      return undefined;
    },
    getLineItems: (groupId: string) => (lineItems as any)[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  };
};

export const normalizeValueList = (value: FieldValue): FieldValue[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter(v => v !== undefined && v !== null && v !== '') as FieldValue[];
  }
  if (typeof value === 'string' && value.trim() === '') return [];
  return [value];
};

const collectFieldValues = (rows: RowFlowResolvedRow[], fieldId: string): FieldValue[] => {
  return rows.flatMap(entry => normalizeValueList((entry.row?.values || {})[fieldId]));
};

export const resolveRowFlowReferences = (args: {
  config?: RowFlowConfig;
  groupId: string;
  rowId: string;
  lineItems: LineItemState;
  subGroupIds?: string[];
}): Record<string, RowFlowResolvedReference> => {
  const { config, groupId, rowId, lineItems, subGroupIds } = args;
  const refs = config?.references || {};
  const resolved: Record<string, RowFlowResolvedReference> = {};
  const resolving = new Set<string>();
  const subgroupSet = new Set((subGroupIds || []).map(id => id.toString().trim()).filter(Boolean));

  const resolveRef = (id: string): RowFlowResolvedReference | null => {
    const key = id ? id.toString().trim() : '';
    if (!key || !refs[key]) return null;
    if (resolved[key]) return resolved[key];
    if (resolving.has(key)) return null;
    resolving.add(key);
    const cfg = refs[key] as any;
    const refGroupId = cfg?.groupId !== undefined && cfg?.groupId !== null ? cfg.groupId.toString().trim() : '';
    if (!refGroupId) {
      resolving.delete(key);
      return null;
    }
    const match = normalizeMatchMode(cfg?.match);
    const rowFilter: StepRowFilterConfig | undefined = cfg?.rowFilter;
    const parentRefId = cfg?.parentRef !== undefined && cfg?.parentRef !== null ? cfg.parentRef.toString().trim() : '';
    const parent = parentRefId ? resolveRef(parentRefId) : null;
    const rows: RowFlowResolvedRow[] = [];

    if (parent && parent.rows.length) {
      parent.rows.forEach(parentRow => {
        const groupKey = buildSubgroupKey(parentRow.groupKey, parentRow.row.id, refGroupId);
        const childRows = (lineItems[groupKey] || []) as LineItemRowState[];
        filterRows(childRows, rowFilter).forEach(row => rows.push({ groupKey, row }));
      });
    } else {
      const isSubgroup = subgroupSet.has(refGroupId);
      const groupKey = isSubgroup ? buildSubgroupKey(groupId, rowId, refGroupId) : refGroupId;
      const baseRows = (lineItems[groupKey] || []) as LineItemRowState[];
      filterRows(baseRows, rowFilter).forEach(row => rows.push({ groupKey, row }));
    }

    const resolvedRef: RowFlowResolvedReference = {
      id: key,
      groupId: refGroupId,
      match,
      rowFilter,
      rows
    };
    resolved[key] = resolvedRef;
    resolving.delete(key);
    return resolvedRef;
  };

  Object.keys(refs).forEach(resolveRef);
  return resolved;
};

export const resolveRowFlowFieldTarget = (args: {
  fieldRef: string;
  groupId: string;
  rowId: string;
  rowValues: Record<string, FieldValue>;
  references: Record<string, RowFlowResolvedReference>;
}): RowFlowResolvedFieldTarget | null => {
  const { fieldRef, groupId, rowId, rowValues, references } = args;
  if (!fieldRef) return null;
  const parsed = parseFieldRef(fieldRef, references);
  if (parsed.refId) {
    const ref = references[parsed.refId];
    if (!ref) return null;
    const rows = ref.rows || [];
    const primaryRow = rows.length ? rows[0] : undefined;
    const groupKey = primaryRow?.groupKey || ref.groupId;
    return {
      refId: parsed.refId,
      fieldId: parsed.fieldId,
      groupId: ref.groupId,
      groupKey,
      rows,
      primaryRow,
      parentValues: rowValues
    };
  }
  const parentRow: LineItemRowState = { id: rowId, values: rowValues };
  return {
    fieldId: parsed.fieldId,
    groupId,
    groupKey: groupId,
    rows: [{ groupKey: groupId, row: parentRow }],
    primaryRow: { groupKey: groupId, row: parentRow }
  };
};

const resolveSegmentValues = (segment: RowFlowOutputSegmentConfig, target: RowFlowResolvedFieldTarget | null): FieldValue[] => {
  if (!target || !segment?.fieldRef) return [];
  const fieldId = target.fieldId;
  if (!fieldId) return [];
  return collectFieldValues(target.rows, fieldId);
};

export const resolveRowFlowSegmentActionIds = (segment?: RowFlowOutputSegmentConfig | null): string[] => {
  if (!segment) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  const pushAction = (value?: unknown) => {
    if (value === undefined || value === null) return;
    const actionId = value.toString().trim();
    if (!actionId || seen.has(actionId)) return;
    seen.add(actionId);
    results.push(actionId);
  };
  pushAction(segment.editAction);
  const editActions = segment.editActions;
  if (Array.isArray(editActions)) {
    editActions.forEach(pushAction);
  } else if (editActions !== undefined && editActions !== null) {
    pushAction(editActions);
  }
  return results;
};

const resolveWhenMatch = (args: {
  when?: WhenClause;
  target: RowFlowResolvedFieldTarget | null;
  lineItems: LineItemState;
  topValues?: Record<string, FieldValue>;
  fallbackRow?: { groupKey: string; rowValues: Record<string, FieldValue>; rowId: string };
}): boolean => {
  const { when, target, lineItems, topValues, fallbackRow } = args;
  if (!when) return true;
  const targetRow = target?.primaryRow;
  const rowValues = targetRow?.row?.values || fallbackRow?.rowValues;
  const parentValues = target?.parentValues || fallbackRow?.rowValues;
  const ctx = buildVisibilityCtx({ rowValues, parentValues, topValues, lineItems });
  const rowId = targetRow?.row?.id || fallbackRow?.rowId;
  const linePrefix = targetRow?.groupKey || fallbackRow?.groupKey;
  return matchesWhenClause(when, ctx, { rowId, linePrefix });
};

const resolvePromptComplete = (args: {
  prompt: RowFlowPromptConfig;
  target: RowFlowResolvedFieldTarget | null;
  lineItems: LineItemState;
  topValues?: Record<string, FieldValue>;
}): boolean => {
  const { prompt, target, lineItems, topValues } = args;
  if (!prompt) return false;
  if (prompt.completedWhen) {
    return resolveWhenMatch({ when: prompt.completedWhen, target, lineItems, topValues });
  }
  const inputKind = (prompt.input?.kind || 'field').toString().trim().toLowerCase();
  if (inputKind === 'selectoroverlay') {
    if (!target?.refId) return false;
    return (target.rows || []).length > 0;
  }
  if (!target?.primaryRow || !target.fieldId) return false;
  const value = (target.primaryRow.row?.values || {})[target.fieldId];
  return !isEmptyValue(value as any);
};

const buildTargetFieldPath = (target: RowFlowResolvedFieldTarget | null): string => {
  if (!target?.primaryRow || !target.fieldId) return '';
  const rowId = target.primaryRow.row?.id;
  if (!rowId) return '';
  return `${target.primaryRow.groupKey}__${target.fieldId}__${rowId}`;
};

export const resolveRowFlowState = (args: {
  config?: RowFlowConfig;
  groupId: string;
  rowId: string;
  rowValues: Record<string, FieldValue>;
  lineItems: LineItemState;
  topValues?: Record<string, FieldValue>;
  subGroupIds?: string[];
  activeFieldPath?: string;
  activeFieldType?: string;
}): RowFlowResolvedState | null => {
  const { config, groupId, rowId, rowValues, lineItems, topValues, subGroupIds, activeFieldPath, activeFieldType } = args;
  if (!config) return null;
  const references = resolveRowFlowReferences({ config, groupId, rowId, lineItems, subGroupIds });
  const segments = (config.output?.segments || [])
    .map(segment => {
      const target = resolveRowFlowFieldTarget({
        fieldRef: segment.fieldRef,
        groupId,
        rowId,
        rowValues,
        references
      });
      const values = resolveSegmentValues(segment, target);
      const showWhenOk = resolveWhenMatch({
        when: segment.showWhen,
        target,
        lineItems,
        topValues,
        fallbackRow: { groupKey: groupId, rowValues, rowId }
      });
      if (!showWhenOk) return null;
      if (config.output?.hideEmpty && values.length === 0) return null;
      return { id: segment.fieldRef, config: segment, target, values } as RowFlowResolvedSegment;
    })
    .filter(Boolean) as RowFlowResolvedSegment[];

  const prompts = (config.prompts || []).map(prompt => {
    const inputKind = (prompt.input?.kind || 'field').toString().trim().toLowerCase();
    const fieldRef = prompt.fieldRef || '';
    const target =
      inputKind === 'selectoroverlay' && prompt.input?.targetRef
        ? resolveRowFlowFieldTarget({
            fieldRef: `${prompt.input.targetRef}.`,
            groupId,
            rowId,
            rowValues,
            references
          })
          : fieldRef
            ? resolveRowFlowFieldTarget({ fieldRef, groupId, rowId, rowValues, references })
            : null;
    const showWhenOk = resolveWhenMatch({
      when: prompt.showWhen,
      target,
      lineItems,
      topValues,
      fallbackRow: { groupKey: groupId, rowValues, rowId }
    });
    const activePath = (activeFieldPath || '').toString().trim();
    const promptFieldPath = buildTargetFieldPath(target);
    const isActivePromptField = !!activePath && !!promptFieldPath && activePath === promptFieldPath;
    const activeType = (activeFieldType || '').toString().trim().toUpperCase();
    const holdWhileActive = activeType === 'TEXT' || activeType === 'PARAGRAPH' || activeType === 'NUMBER';
    const completeRaw = resolvePromptComplete({ prompt, target, lineItems, topValues });
    // Do not treat the prompt as complete for prompting/visibility while its own field is focused;
    // otherwise hideWhenFilled can remove the input after the first keystroke.
    const completeForPrompting = isActivePromptField && holdWhileActive ? false : completeRaw;
    const hideWhenFilled = prompt.hideWhenFilled === true;
    const keepVisible = prompt.keepVisibleWhenFilled === true;
    const visible =
      showWhenOk && !(completeForPrompting && hideWhenFilled) && (!completeForPrompting || keepVisible);
    return {
      id: prompt.id,
      config: prompt,
      target,
      complete: completeRaw,
      completeForPrompting,
      visible,
      showWhenOk
    } as RowFlowResolvedPrompt;
  });

  const activePrompt = prompts.find(p => p.visible && !p.completeForPrompting);
  const outputActions = (config.output?.actions || []).filter(action =>
    resolveWhenMatch({ when: action.showWhen, target: null, lineItems, topValues, fallbackRow: { groupKey: groupId, rowValues, rowId } })
  );

  return {
    references,
    segments,
    prompts,
    activePromptId: activePrompt?.id,
    outputActions
  };
};

export const resolveRowFlowActionPlan = (args: {
  actionId: string;
  config?: RowFlowConfig;
  state: RowFlowResolvedState | null;
  groupId: string;
  rowId: string;
  rowValues: Record<string, FieldValue>;
  lineItems: LineItemState;
  topValues?: Record<string, FieldValue>;
  subGroupIds?: string[];
}): RowFlowResolvedActionPlan | null => {
  const { actionId, config, state, groupId, rowId, rowValues, lineItems, topValues, subGroupIds } = args;
  if (!config || !actionId) return null;
  const actions = config.actions || [];
  const action = actions.find(a => a?.id === actionId);
  if (!action) return null;

  const fallbackRow = { groupKey: groupId, rowValues, rowId };
  const showWhenOk = resolveWhenMatch({ when: action.showWhen, target: null, lineItems, topValues, fallbackRow });
  if (!showWhenOk) return null;

  const references =
    state?.references ||
    resolveRowFlowReferences({ config, groupId, rowId, lineItems, subGroupIds });
  const effects: RowFlowResolvedEffect[] = [];

  (action.effects || []).forEach((effect: RowFlowActionEffect) => {
    if (!effect || typeof effect !== 'object') return;
    if (effect.type === 'setValue') {
      const target = resolveRowFlowFieldTarget({
        fieldRef: effect.fieldRef,
        groupId,
        rowId,
        rowValues,
        references
      });
      if (!target?.primaryRow || !target.fieldId) return;
      effects.push({
        type: 'setValue',
        groupKey: target.primaryRow.groupKey,
        rowId: target.primaryRow.row.id,
        fieldId: target.fieldId,
        value: effect.value as FieldValue
      });
    }
    if (effect.type === 'deleteLineItems') {
      const targetRefId = effect.targetRef ? effect.targetRef.toString().trim() : '';
      const groupIdRaw = effect.groupId ? effect.groupId.toString().trim() : '';
      if (targetRefId && references[targetRefId]) {
        const rows = references[targetRefId].rows || [];
        const grouped = rows.reduce<Record<string, string[]>>((acc, entry) => {
          const ids = acc[entry.groupKey] || [];
          ids.push(entry.row.id);
          acc[entry.groupKey] = ids;
          return acc;
        }, {});
        Object.entries(grouped).forEach(([groupKey, rowIds]) => {
          if (rowIds.length) effects.push({ type: 'deleteLineItems', groupKey, rowIds });
        });
        return;
      }
      const subgroupSet = new Set((subGroupIds || []).map(id => id.toString().trim()).filter(Boolean));
      const isSubgroup = groupIdRaw && subgroupSet.has(groupIdRaw);
      const groupKey = groupIdRaw
        ? isSubgroup
          ? buildSubgroupKey(groupId, rowId, groupIdRaw)
          : groupIdRaw
        : '';
      if (!groupKey) return;
      const rows = filterRows((lineItems[groupKey] || []) as LineItemRowState[], effect.rowFilter);
      if (!rows.length) return;
      effects.push({ type: 'deleteLineItems', groupKey, rowIds: rows.map(r => r.id) });
    }
    if (effect.type === 'deleteRow') {
      if (!groupId || !rowId) return;
      effects.push({ type: 'deleteRow', groupKey: groupId, rowId });
    }
    if (effect.type === 'addLineItems') {
      const targetRefId = effect.targetRef ? effect.targetRef.toString().trim() : '';
      const groupIdRaw = effect.groupId ? effect.groupId.toString().trim() : '';
      const subgroupSet = new Set((subGroupIds || []).map(id => id.toString().trim()).filter(Boolean));
      let groupKey = '';
      if (targetRefId && references[targetRefId]) {
        const ref = references[targetRefId];
        groupKey = ref.rows[0]?.groupKey || '';
        if (!groupKey) {
          const refGroupId = ref.groupId ? ref.groupId.toString().trim() : '';
          if (refGroupId) {
            const isSubgroup = subgroupSet.has(refGroupId);
            groupKey = isSubgroup ? buildSubgroupKey(groupId, rowId, refGroupId) : refGroupId;
          }
        }
      } else if (groupIdRaw) {
        const isSubgroup = subgroupSet.has(groupIdRaw);
        groupKey = isSubgroup ? buildSubgroupKey(groupId, rowId, groupIdRaw) : groupIdRaw;
      } else {
        groupKey = groupId;
      }
      if (!groupKey) return;
      const rawCount = typeof effect.count === 'number' && Number.isFinite(effect.count) ? Math.floor(effect.count) : 1;
      const count = rawCount > 0 ? rawCount : 1;
      const preset =
        effect.preset && typeof effect.preset === 'object' && !Array.isArray(effect.preset)
          ? (effect.preset as Record<string, FieldValue>)
          : undefined;
      effects.push({ type: 'addLineItems', groupKey, preset, count });
    }
    if (effect.type === 'closeOverlay') {
      effects.push({ type: 'closeOverlay' });
    }
    if (effect.type === 'openOverlay') {
      const whenOk = resolveWhenMatch({ when: effect.when, target: null, lineItems, topValues, fallbackRow });
      if (!whenOk) return;
      const targetRefId = effect.targetRef ? effect.targetRef.toString().trim() : '';
      const groupIdRaw = effect.groupId ? effect.groupId.toString().trim() : '';
      let key = '';
      if (targetRefId && references[targetRefId]) {
        const ref = references[targetRefId];
        key = ref.rows[0]?.groupKey || ref.groupId;
      } else if (groupIdRaw) {
        const subgroupSet = new Set((subGroupIds || []).map(id => id.toString().trim()).filter(Boolean));
        const isSubgroup = subgroupSet.has(groupIdRaw);
        key = isSubgroup ? buildSubgroupKey(groupId, rowId, groupIdRaw) : groupIdRaw;
      }
      if (!key) return;
      effects.push({
        type: 'openOverlay',
        targetKind: key.includes('::') ? 'sub' : 'line',
        key,
        rowFilter: effect.rowFilter as StepRowFilterConfig | undefined,
        label: effect.label,
        hideInlineSubgroups: effect.hideInlineSubgroups,
        hideCloseButton: (effect as any).hideCloseButton === true,
        closeButtonLabel: (effect as any).closeButtonLabel,
        closeConfirm: (effect as any).closeConfirm as RowFlowActionConfirmConfig | undefined,
        groupOverride: (effect as any).groupOverride as LineItemGroupConfigOverride | undefined,
        rowFlow: (effect as any).rowFlow as RowFlowConfig | undefined,
        overlayContextHeader: (effect as any).overlayContextHeader as RowFlowOverlayContextHeaderConfig | undefined,
        overlayHelperText: (effect as any).overlayHelperText as RowFlowOverlayContextHeaderConfig | undefined
      });
    }
  });

  return effects.length ? { action, effects } : { action, effects: [] };
};
