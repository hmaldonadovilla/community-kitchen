import React from 'react';

import {
  shouldHideField,
  toOptionSet
} from '../../../../core';
import type { LangCode, VisibilityContext } from '../../../../types';
import { GroupedPairedFields } from '../../../components/form/GroupedPairedFields';
import { isUploadValueComplete } from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { FormErrors } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import {
  renderLineItemBodyField,
  type LineItemBodyFieldRendererDeps
} from './LineItemBodyFieldRenderer';

type LineItemBodyFieldsSectionProps = LineItemBodyFieldRendererDeps & {
  bodyFieldsToRender: any[];
  guidedCollapsedFieldsInHeader: boolean;
  guidedCompactHeaderSummaryFieldIdSet: Set<string>;
  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (key: string) => void;
  language: LangCode;
  groupCtx: VisibilityContext;
  errors: FormErrors;
};

/**
 * Owner: line-items feature renderer.
 * Renders the non-header body fields for a parent row while the shell owns row
 * orchestration and data mutation callbacks.
 */
export const LineItemBodyFieldsSection: React.FC<LineItemBodyFieldsSectionProps> = ({
  bodyFieldsToRender,
  guidedCollapsedFieldsInHeader,
  guidedCompactHeaderSummaryFieldIdSet,
  collapsedGroups,
  toggleGroupCollapsed,
  ...fieldDeps
}) => {
  const {
    q,
    row,
    values,
    language,
    groupCtx,
    errors,
    isProgressive,
    rowCollapsed
  } = fieldDeps;
  const renderLineItemField = (
    field: any,
    opts?: { showLabel?: boolean; forceStackedLabel?: boolean; inGrid?: boolean }
  ) => renderLineItemBodyField({ ...fieldDeps, field, opts });

  if (isProgressive && rowCollapsed) {
    return (
      <div
        className={`collapsed-fields-grid${bodyFieldsToRender.length > 1 ? ' ck-collapsed-stack' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns:
            bodyFieldsToRender.length === 2
              ? 'repeat(2, minmax(0, 1fr))'
              : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12
        }}
      >
        {bodyFieldsToRender.map(field => renderLineItemField(field, { inGrid: bodyFieldsToRender.length > 1 }))}
      </div>
    );
  }

  const visibleExpandedFields = bodyFieldsToRender.filter(field => {
    if (guidedCollapsedFieldsInHeader && guidedCompactHeaderSummaryFieldIdSet.has((field?.id || '').toString())) {
      return false;
    }
    const hide = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
    return !hide;
  });
  if (guidedCollapsedFieldsInHeader && isProgressive && !visibleExpandedFields.length) {
    return null;
  }

  return (
    <GroupedPairedFields
      contextPrefix={`li:${q.id}`}
      fields={visibleExpandedFields}
      language={language}
      collapsedGroups={collapsedGroups}
      toggleGroupCollapsed={toggleGroupCollapsed}
      renderField={renderLineItemField}
      hasError={(field: any) => !!errors[`${q.id}__${field.id}__${row.id}`]}
      isComplete={(field: any) => {
        const mapped = field.valueMap
          ? resolveValueMapValue(
              field.valueMap,
              (fieldId: string) => {
                if ((row.values || {}).hasOwnProperty(fieldId)) return (row.values || {})[fieldId];
                return values[fieldId];
              },
              { language, targetOptions: toOptionSet(field) }
            )
          : undefined;
        const raw = field.valueMap ? mapped : (row.values || {})[field.id];
        if (field.type === 'FILE_UPLOAD') {
          return isUploadValueComplete({
            value: raw as any,
            uploadConfig: (field as any).uploadConfig,
            required: !!field.required
          });
        }
        return !isEmptyValue(raw as any);
      }}
    />
  );
};
