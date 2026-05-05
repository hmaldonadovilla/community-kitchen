import React from 'react';
import type {
  FieldValue,
  LangCode,
  LineItemRowState,
  OptionSet,
  RowFlowActionRef,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import type {
  RowFlowResolvedPrompt,
  RowFlowResolvedRow,
  RowFlowResolvedState
} from '../../steps/domain/rowFlow';
import { resolveVisibleRowFlowOutputSegments } from '../../steps/domain/rowFlowOutputVisibility';
import { resolveFieldLabel } from '../../../utils/labels';
import { RowFlowFieldRenderer } from './RowFlowFieldRenderer';
import { RowFlowOutputSegmentsRenderer } from './RowFlowOutputSegmentsRenderer';
import { RowFlowPromptRenderer } from './RowFlowPromptRenderer';

export type RowFlowRowRendererProps = {
  groupId: string;
  row: LineItemRowState;
  rowIdx: number;
  rowCount: number;
  useEdgeToEdgeRowChrome: boolean;
  rowFlowState: RowFlowResolvedState;
  rowFlowSubGroupIds: string[];
  definition: { questions: WebQuestionDefinition[] };
  language: LangCode;
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  submitting: boolean;
  groupChoiceSearchDefault?: boolean;
  activeFieldPath: string;
  outputSeparator: string;
  outputActionsLayout: 'inline' | 'below';
  rowFlowLoggedRef: React.MutableRefObject<Set<string>>;
  rowFlowPromptRef: React.MutableRefObject<Record<string, string>>;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  renderRowFlowActionControlWithContext: (args: {
    actionId: string;
    row: LineItemRowState;
    rowFlowState: RowFlowResolvedState;
  }) => React.ReactNode;
  resolveOutputActionScope: (action: RowFlowActionRef) => 'row' | 'group';
  resolveRowFlowGroupConfig: (groupKey: string) => { groupId: string; config: any } | null;
  resolveRowFlowFieldConfig: (groupKey: string, fieldId: string) => any;
  buildRowFlowGroupDefinition: (groupKey: string, groupConfig: any) => WebQuestionDefinition;
  buildRowFlowFieldContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  resolveRowFlowDisplayValue: (...args: any[]) => { text: string; hasValue: boolean };
  resolveOptionSetForField: (field: any, groupKey: string) => OptionSet;
  ensureLineOptions: (groupKey: string, field: any) => void;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  renderChoiceControl: (args: any) => React.ReactNode;
  handleLineFieldChange: (groupDef: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isLineFieldInputDisabled: (field: any) => boolean;
  isLineFieldInteractionBlocked: (field: any) => boolean;
  openFileOverlay: (args: any) => void;
  handleLineFileInputChange: (args: any) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  addLineItemRowManual: (groupId: string, initialValues?: Record<string, FieldValue>, options?: any) => unknown;
  buildOverlayGroupOverride: (group: WebQuestionDefinition, override?: any) => WebQuestionDefinition | undefined;
  openSubgroupOverlay?: (key: string, options?: any) => void;
  openLineItemGroupOverlay?: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
};

export const RowFlowRowRenderer: React.FC<RowFlowRowRendererProps> = ({
  groupId,
  row,
  rowIdx,
  rowCount,
  useEdgeToEdgeRowChrome,
  rowFlowState,
  rowFlowSubGroupIds,
  definition,
  language,
  values,
  errors,
  submitting,
  groupChoiceSearchDefault,
  activeFieldPath,
  outputSeparator,
  outputActionsLayout,
  rowFlowLoggedRef,
  rowFlowPromptRef,
  onDiagnostic,
  renderRowFlowActionControlWithContext,
  resolveOutputActionScope,
  resolveRowFlowGroupConfig,
  resolveRowFlowFieldConfig,
  buildRowFlowGroupDefinition,
  buildRowFlowFieldContext,
  resolveRowFlowDisplayValue,
  resolveOptionSetForField,
  ensureLineOptions,
  renderWarnings,
  renderChoiceControl,
  handleLineFieldChange,
  setErrors,
  isLineFieldInputDisabled,
  isLineFieldInteractionBlocked,
  openFileOverlay,
  handleLineFileInputChange,
  fileInputsRef,
  addLineItemRowManual,
  buildOverlayGroupOverride,
  openSubgroupOverlay,
  openLineItemGroupOverlay
}) => {
  const flowLogKey = `${groupId}::rowFlow`;
  if (!rowFlowLoggedRef.current.has(flowLogKey)) {
    rowFlowLoggedRef.current.add(flowLogKey);
    onDiagnostic?.('lineItems.rowFlow.enabled', {
      groupId,
      promptCount: rowFlowState.prompts.length,
      segmentCount: rowFlowState.segments.length
    });
  }

  const activePromptId = rowFlowState.activePromptId || '';
  if (activePromptId && rowFlowPromptRef.current[row.id] !== activePromptId) {
    rowFlowPromptRef.current[row.id] = activePromptId;
    onDiagnostic?.('lineItems.rowFlow.prompt.active', {
      groupId,
      rowId: row.id,
      promptId: activePromptId
    });
  }

  const renderRowFlowActionControl = (actionId: string) =>
    renderRowFlowActionControlWithContext({ actionId, row, rowFlowState });

  const resolvePromptTargets = (prompt: RowFlowResolvedPrompt) => {
    const target = prompt.target;
    if (!target || !target.primaryRow || !target.fieldId) return null;
    const rowEntry = target.primaryRow;
    const groupInfo = resolveRowFlowGroupConfig(rowEntry.groupKey);
    if (!groupInfo?.config) return null;
    const field = resolveRowFlowFieldConfig(rowEntry.groupKey, target.fieldId);
    if (!field) return null;
    const groupDef = buildRowFlowGroupDefinition(rowEntry.groupKey, groupInfo.config);
    return { field, groupDef, rowEntry, parentValues: target.parentValues };
  };

  const renderRowFlowField = (args: {
    field: any;
    groupDef: WebQuestionDefinition;
    rowEntry: RowFlowResolvedRow | null | undefined;
    parentValues?: Record<string, FieldValue>;
    showLabel?: boolean;
    labelOverride?: string;
  }): React.ReactNode => (
    <RowFlowFieldRenderer
      field={args.field}
      groupDef={args.groupDef}
      rowEntry={args.rowEntry}
      parentValues={args.parentValues}
      showLabel={args.showLabel}
      labelOverride={args.labelOverride}
      language={language}
      values={values}
      errors={errors}
      submitting={submitting}
      groupChoiceSearchDefault={groupChoiceSearchDefault}
      buildVisibilityContext={buildRowFlowFieldContext}
      resolveFieldLabel={resolveFieldLabel}
      resolveOptionSetForField={resolveOptionSetForField}
      ensureLineOptions={ensureLineOptions}
      renderWarnings={renderWarnings}
      renderChoiceControl={renderChoiceControl}
      handleLineFieldChange={handleLineFieldChange}
      setErrors={setErrors}
      onDiagnostic={onDiagnostic}
      isLineFieldInputDisabled={isLineFieldInputDisabled}
      isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
      openFileOverlay={openFileOverlay}
      handleLineFileInputChange={handleLineFileInputChange}
      fileInputsRef={fileInputsRef}
    />
  );

  const renderRowFlowPrompt = (prompt: RowFlowResolvedPrompt) => (
    <RowFlowPromptRenderer
      prompt={prompt}
      groupId={groupId}
      row={row}
      rowFlowState={rowFlowState}
      rowFlowSubGroupIds={rowFlowSubGroupIds}
      definition={definition}
      language={language}
      values={values}
      submitting={submitting}
      resolvePromptTargets={resolvePromptTargets}
      renderRowFlowField={renderRowFlowField}
      renderRowFlowActionControl={renderRowFlowActionControl}
      resolveRowFlowGroupConfig={resolveRowFlowGroupConfig}
      ensureLineOptions={ensureLineOptions}
      resolveOptionSetForPromptField={resolveOptionSetForField}
      addLineItemRowManual={addLineItemRowManual}
      buildOverlayGroupOverride={buildOverlayGroupOverride}
      openSubgroupOverlay={openSubgroupOverlay}
      openLineItemGroupOverlay={openLineItemGroupOverlay}
      onDiagnostic={onDiagnostic}
    />
  );

  const outputSegments = resolveVisibleRowFlowOutputSegments({
    segments: rowFlowState.segments,
    currentRowId: row.id,
    resolveFieldConfig: resolveRowFlowFieldConfig,
    buildFieldContext: buildRowFlowFieldContext
  });
  const rowOutputActions = rowFlowState.outputActions.filter(action => resolveOutputActionScope(action) === 'row');
  const promptsToRender = rowFlowState.prompts.filter(
    prompt =>
      prompt.visible &&
      (prompt.id === activePromptId || (prompt.complete && prompt.config.keepVisibleWhenFilled === true))
  );
  const isLastEdgeToEdgeRow = useEdgeToEdgeRowChrome && rowIdx === rowCount - 1;

  return (
    <div
      className={`line-item-row ck-row-flow${useEdgeToEdgeRowChrome ? ' ck-row-flow--edge' : ''}`}
      data-row-anchor={`${groupId}__${row.id}`}
      style={{
        background: 'transparent',
        border: 'none',
        width: '100%',
        padding: useEdgeToEdgeRowChrome ? '12px 0' : 0,
        marginBottom: useEdgeToEdgeRowChrome ? 0 : 14
      }}
    >
      <RowFlowOutputSegmentsRenderer
        segments={outputSegments}
        separator={outputSeparator}
        rowOutputActions={rowOutputActions}
        outputActionsLayout={outputActionsLayout}
        language={language}
        activeFieldPath={activeFieldPath}
        errors={errors}
        renderRowFlowActionControl={renderRowFlowActionControl}
        resolveRowFlowFieldConfig={resolveRowFlowFieldConfig}
        resolveRowFlowGroupConfig={resolveRowFlowGroupConfig}
        buildRowFlowGroupDefinition={buildRowFlowGroupDefinition}
        renderRowFlowField={renderRowFlowField}
        resolveRowFlowDisplayValue={resolveRowFlowDisplayValue}
        handleLineFieldChange={handleLineFieldChange}
        isLineFieldInputDisabled={isLineFieldInputDisabled}
        isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
      />
      {promptsToRender.length ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {promptsToRender.map(prompt => (
            <div key={prompt.id}>{renderRowFlowPrompt(prompt)}</div>
          ))}
        </div>
      ) : null}
      {useEdgeToEdgeRowChrome && !isLastEdgeToEdgeRow ? (
        <div
          className="ck-line-item-row-separator"
          aria-hidden="true"
          style={{
            width: '100%',
            marginTop: 12,
            height: 1,
            background: 'var(--border)',
            borderBottom: '1px solid var(--border)'
          }}
        />
      ) : null}
    </div>
  );
};
