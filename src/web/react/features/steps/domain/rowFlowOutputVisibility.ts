import { shouldHideField } from '../../../../rules/visibility';
import type { FieldValue, VisibilityContext } from '../../../../types';
import type { RowFlowResolvedSegment } from './rowFlow';

export const shouldRenderRowFlowOutputField = (args: {
  segment: RowFlowResolvedSegment;
  field: { visibility?: unknown } | null;
  ctx: VisibilityContext;
  rowId?: string;
  linePrefix?: string;
}): boolean => {
  const { segment, field, ctx, rowId, linePrefix } = args;
  if (!field) return false;
  const renderAs = ((segment.config?.renderAs || '').toString() || '').trim().toLowerCase();
  if (renderAs !== 'control') {
    // Output summaries may intentionally reference hidden helper / derived fields.
    return true;
  }
  return !shouldHideField(field.visibility as any, ctx, { rowId, linePrefix });
};

export const resolveVisibleRowFlowOutputSegments = (args: {
  segments: RowFlowResolvedSegment[];
  currentRowId: string;
  resolveFieldConfig: (groupKey: string, fieldId: string) => { visibility?: unknown } | null;
  buildFieldContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
}): RowFlowResolvedSegment[] =>
  args.segments.filter(segment => {
    const segmentType = ((segment.config?.type || 'field').toString() || 'field').trim().toLowerCase();
    if (segmentType === 'text' || segmentType === 'spacer') return true;
    const target = segment.target?.fieldId ? segment.target : segment.fallbackTarget;
    const field = target?.fieldId ? args.resolveFieldConfig(target.groupKey, target.fieldId) : null;
    if (!target?.fieldId || !field) return false;
    const ctxForVisibility = args.buildFieldContext({
      rowValues: target.primaryRow?.row?.values || {},
      parentValues: target.parentValues
    });
    return shouldRenderRowFlowOutputField({
      segment,
      field,
      ctx: ctxForVisibility,
      rowId: target.primaryRow?.row?.id || args.currentRowId,
      linePrefix: target.groupKey
    });
  });
