import React from 'react';

import type { FieldValue, LineItemRowState, RowFlowConfig, WebQuestionDefinition } from '../../../../types';
import { resolveSubgroupKey } from '../../../app/lineItems';
import type { LineItemState } from '../../../types';
import {
  resolveRowFlowActiveFieldMetaAction,
  resolveRowFlowGroupConfigAction
} from '../domain/rowFlowGroupConfig';
import {
  resolveRowFlowState,
  type RowFlowResolvedState
} from '../../steps/domain/rowFlow';

type UseRowFlowRuntimeStateArgs = {
  q: WebQuestionDefinition;
  definitionQuestions: WebQuestionDefinition[];
  rowFlow?: RowFlowConfig;
  parentRows: LineItemRowState[];
  lineItems: LineItemState;
  values: Record<string, FieldValue>;
};

/**
 * Owner: row-flow runtime workflow.
 * Resolves row-flow enablement, target group lookup, active field metadata,
 * and per-parent-row flow state outside the line-item renderer shell.
 */
export const useRowFlowRuntimeState = ({
  q,
  definitionQuestions,
  rowFlow,
  parentRows,
  lineItems,
  values
}: UseRowFlowRuntimeStateArgs) => {
  const rowFlowEnabled = Boolean(
    rowFlow &&
      ((rowFlow.mode || '').toString().trim().toLowerCase() === '' ||
        (rowFlow.mode || '').toString().trim().toLowerCase() === 'progressive')
  );
  const rowFlowSubGroupIds = (q.lineItemConfig?.subGroups || [])
    .map(sub => resolveSubgroupKey(sub as any))
    .filter(Boolean);
  const rowFlowActionById = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!rowFlow?.actions) return map;
    rowFlow.actions.forEach(action => {
      const id = (action?.id || '').toString().trim();
      if (!id) return;
      map.set(id, action);
    });
    return map;
  }, [rowFlow]);
  const parentRowById = React.useMemo(() => {
    const map = new Map<string, LineItemRowState>();
    parentRows.forEach(row => {
      map.set(row.id, row);
    });
    return map;
  }, [parentRows]);

  const resolveRowFlowGroupConfig = React.useCallback(
    (groupKey: string): { groupId: string; config: any } | null => {
      return resolveRowFlowGroupConfigAction({
        groupKey,
        currentGroupId: q.id,
        currentLineItemConfig: q.lineItemConfig,
        definitionQuestions
      });
    },
    [definitionQuestions, q.id, q.lineItemConfig]
  );

  const resolveRowFlowFieldConfig = React.useCallback(
    (groupKey: string, fieldId: string): any | null => {
      if (!groupKey || !fieldId) return null;
      const info = resolveRowFlowGroupConfig(groupKey);
      if (!info?.config) return null;
      return (info.config.fields || []).find((field: any) => field?.id === fieldId) || null;
    },
    [resolveRowFlowGroupConfig]
  );

  const activeFieldMeta = (() => {
    return resolveRowFlowActiveFieldMetaAction({
      activeElement: typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
      resolveGroupConfig: resolveRowFlowGroupConfig,
      resolveFieldConfig: resolveRowFlowFieldConfig
    });
  })();
  const rowFlowStateByRowId = React.useMemo(() => {
    const map = new Map<string, RowFlowResolvedState>();
    if (!rowFlowEnabled) return map;
    parentRows.forEach(row => {
      const state = resolveRowFlowState({
        config: rowFlow as RowFlowConfig,
        groupId: q.id,
        rowId: row.id,
        rowValues: (row.values || {}) as Record<string, FieldValue>,
        lineItems,
        topValues: values,
        subGroupIds: rowFlowSubGroupIds,
        activeFieldPath: activeFieldMeta.path,
        activeFieldType: activeFieldMeta.type
      });
      if (state) map.set(row.id, state);
    });
    return map;
  }, [activeFieldMeta.path, activeFieldMeta.type, lineItems, parentRows, q.id, rowFlow, rowFlowEnabled, rowFlowSubGroupIds, values]);

  return {
    rowFlowEnabled,
    rowFlowSubGroupIds,
    rowFlowActionById,
    parentRowById,
    resolveRowFlowGroupConfig,
    resolveRowFlowFieldConfig,
    activeFieldMeta,
    rowFlowStateByRowId
  };
};
