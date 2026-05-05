import React from 'react';
import type {
  LineItemRowState,
  RowFlowActionRef
} from '../../../../types';
import type { RowFlowResolvedState } from '../../steps/domain/rowFlow';

export type RowFlowGroupOutputActionsProps = {
  groupActionRow: LineItemRowState | null;
  groupActionState: RowFlowResolvedState | null;
  outputActionsLayout: 'inline' | 'below';
  resolveOutputActionScope: (action: RowFlowActionRef) => 'row' | 'group';
  renderRowFlowActionControlWithContext: (args: {
    actionId: string;
    row: LineItemRowState;
    rowFlowState: RowFlowResolvedState;
  }) => React.ReactNode;
};

export const RowFlowGroupOutputActions: React.FC<RowFlowGroupOutputActionsProps> = ({
  groupActionRow,
  groupActionState,
  outputActionsLayout,
  resolveOutputActionScope,
  renderRowFlowActionControlWithContext
}) => {
  if (!groupActionRow || !groupActionState) return null;
  const groupOutputActions = groupActionState.outputActions.filter(action => resolveOutputActionScope(action) === 'group');
  const outputActionsStart = groupOutputActions.filter(action => (action.position || 'start') !== 'end');
  const outputActionsEnd = groupOutputActions.filter(action => (action.position || 'start') === 'end');
  if (!outputActionsStart.length && !outputActionsEnd.length) return null;

  const renderAction = (action: RowFlowActionRef) =>
    renderRowFlowActionControlWithContext({
      actionId: action.id,
      row: groupActionRow,
      rowFlowState: groupActionState
    });

  if (outputActionsLayout === 'inline') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {outputActionsStart.map(renderAction)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {outputActionsEnd.map(renderAction)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {outputActionsStart.map(renderAction)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {outputActionsEnd.map(renderAction)}
      </div>
    </div>
  );
};
