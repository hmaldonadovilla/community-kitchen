import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemFieldConfig, WebQuestionDefinition } from '../../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { resolveLineItemTableReadOnlyDisplay, toUploadItems } from '../../../components/form/utils';
import { buttonStyles } from '../../../components/form/ui';
import type { OpenFileOverlayArgs } from '../../../components/form/lineItemGroupQuestionTypes';

/**
 * Owner: upload feature renderer.
 * Renders table-cell FILE_UPLOAD controls that open the shared file overlay
 * without owning upload persistence or field mutation.
 */
export const LineFileUploadTableOpenControl: React.FC<{
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  value: FieldValue | undefined;
  rowValues: Record<string, FieldValue>;
  language: LangCode;
  submitting: boolean;
  renderAsLabel: boolean;
  hasError: boolean;
  hasWarning: boolean;
  errorNode: React.ReactNode;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
}> = ({
  group,
  rowId,
  field,
  fieldPath,
  value,
  rowValues,
  language,
  submitting,
  renderAsLabel,
  hasError,
  hasWarning,
  errorNode,
  openFileOverlay
}) => {
  const items = toUploadItems(value);
  const count = items.length;
  const label = resolveFieldLabel(field, language, field.id);

  if (renderAsLabel) {
    return (
      <div className="ck-line-item-table__value">
        {resolveLineItemTableReadOnlyDisplay({
          baseValue: count ? `${count}` : '',
          field,
          rowValues,
          language
        })}
      </div>
    );
  }

  return (
    <div
      className="ck-line-item-table__control"
      data-field-path={fieldPath}
      data-has-error={hasError ? 'true' : undefined}
      data-has-warning={hasWarning ? 'true' : undefined}
    >
      <button
        type="button"
        onClick={() => {
          if (submitting) return;
          openFileOverlay({
            scope: 'line',
            title: label,
            group,
            rowId,
            field,
            fieldPath
          });
        }}
        style={buttonStyles.secondary}
        disabled={submitting}
      >
        {count ? tSystem('files.view', language, 'View photos') : tSystem('files.add', language, 'Add photo')}
      </button>
      {errorNode}
    </div>
  );
};
