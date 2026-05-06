import React from 'react';

import type { FieldValue, LineItemRowState, RowFlowActionRef, RowFlowConfig } from '../../../../types';
import type { LineItemState } from '../../../types';
import {
  resolveRowFlowSegmentActionIds,
  resolveRowFlowState,
  type RowFlowResolvedState
} from '../../steps/domain/rowFlow';

type UseRowFlowGroupOutputStateArgs = {
  groupId: string;
  rowFlow?: RowFlowConfig;
  rowFlowEnabled: boolean;
  parentRows: LineItemRowState[];
  lineItems: LineItemState;
  values: Record<string, FieldValue>;
  rowFlowSubGroupIds: string[];
  activeFieldMeta: { path: string; type: string };
  rowFlowStateByRowId: Map<string, RowFlowResolvedState>;
  rowFlowLoggedRef: React.MutableRefObject<Set<string>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: row-flow output workflow.
 * Resolves group-scoped output actions and related diagnostics separately from
 * the line-item group renderer.
 */
export const useRowFlowGroupOutputState = ({
  groupId,
  rowFlow,
  rowFlowEnabled,
  parentRows,
  lineItems,
  values,
  rowFlowSubGroupIds,
  activeFieldMeta,
  rowFlowStateByRowId,
  rowFlowLoggedRef,
  onDiagnostic
}: UseRowFlowGroupOutputStateArgs) => {
  const outputActionsLayout: 'below' | 'inline' = rowFlow?.output?.actionsLayout === 'below' ? 'below' : 'inline';
  const defaultActionScope: 'group' | 'row' = rowFlow?.output?.actionsScope === 'group' ? 'group' : 'row';
  const resolveOutputActionScope = React.useCallback(
    (action: RowFlowActionRef): 'row' | 'group' =>
      action.scope === 'group' || action.scope === 'row' ? action.scope : defaultActionScope,
    [defaultActionScope]
  );
  const hasGroupActions = (rowFlow?.output?.actions || []).some(action => resolveOutputActionScope(action) === 'group');
  const syntheticGroupRow =
    rowFlowEnabled && hasGroupActions && parentRows.length === 0
      ? ({ id: '__rowFlowGroup__', values: {} as Record<string, FieldValue> } as LineItemRowState)
      : null;
  const syntheticGroupState =
    syntheticGroupRow && rowFlow
      ? resolveRowFlowState({
          config: rowFlow,
          groupId,
          rowId: syntheticGroupRow.id,
          rowValues: syntheticGroupRow.values,
          lineItems,
          topValues: values,
          subGroupIds: rowFlowSubGroupIds,
          activeFieldPath: activeFieldMeta.path,
          activeFieldType: activeFieldMeta.type
        })
      : null;
  const groupActionRow = hasGroupActions ? parentRows[0] || syntheticGroupRow : null;
  const groupActionState =
    groupActionRow && rowFlowEnabled
      ? parentRows.length
        ? rowFlowStateByRowId.get(groupActionRow.id) || null
        : syntheticGroupState
      : null;

  if (rowFlowEnabled && hasGroupActions) {
    const scopeLogKey = `${groupId}::rowFlow::actionsScope`;
    if (!rowFlowLoggedRef.current.has(scopeLogKey)) {
      rowFlowLoggedRef.current.add(scopeLogKey);
      onDiagnostic?.('lineItems.rowFlow.output.actionsScope', { groupId, scope: 'group' });
    }
  }
  if (rowFlowEnabled && (rowFlow?.output?.segments || []).length) {
    const segmentLayouts = (rowFlow?.output?.segments || []).map(segment => ({
      fieldRef: segment?.fieldRef || '',
      type: (segment?.type || 'field').toString(),
      layout: (segment?.layout || 'inline').toString()
    }));
    const blockSegments = segmentLayouts.filter(segment => segment.layout.toLowerCase() === 'block');
    if (blockSegments.length) {
      const layoutLogKey = `${groupId}::rowFlow::segmentLayouts`;
      if (!rowFlowLoggedRef.current.has(layoutLogKey)) {
        rowFlowLoggedRef.current.add(layoutLogKey);
        onDiagnostic?.('lineItems.rowFlow.output.segmentLayouts', {
          groupId,
          blockSegments: blockSegments.length,
          segmentLayouts
        });
      }
    }
    const segmentLogKey = `${groupId}::rowFlow::segmentActions`;
    if (!rowFlowLoggedRef.current.has(segmentLogKey)) {
      const segmentActions = (rowFlow?.output?.segments || []).map(segment =>
        resolveRowFlowSegmentActionIds(segment)
      );
      const segmentsWithActions = segmentActions.filter(ids => ids.length > 0);
      if (segmentsWithActions.length) {
        rowFlowLoggedRef.current.add(segmentLogKey);
        const multiActionSegments = segmentActions.filter(ids => ids.length > 1).length;
        onDiagnostic?.('lineItems.rowFlow.output.segmentActions', {
          groupId,
          segmentsWithActions: segmentsWithActions.length,
          multiActionSegments,
          segmentLayouts
        });
      }
    }
  }

  return {
    outputActionsLayout,
    defaultActionScope,
    resolveOutputActionScope,
    groupActionRow,
    groupActionState
  };
};
