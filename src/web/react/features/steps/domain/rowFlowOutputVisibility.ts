import { shouldHideField } from '../../../../rules/visibility';
import type { VisibilityContext } from '../../../../types';
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
