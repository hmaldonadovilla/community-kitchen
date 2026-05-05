import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemFieldConfig, WebQuestionDefinition } from '../../../../types';
import type { FormErrors } from '../../../types';
import { toUploadItems } from '../../../components/form/utils';
import { buttonStyles, RequiredStar } from '../../../components/form/ui';
import type { OpenFileOverlayArgs } from '../../../components/form/lineItemGroupQuestionTypes';

type LineFileInputChangeArgs = {
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  list: FileList | null;
};

/**
 * Owner: upload feature renderer.
 * Renders the compact full-width FILE_UPLOAD field variant that opens the
 * shared file overlay while field mutation remains injected by the parent.
 */
export const LineFileUploadOverlayButtonField: React.FC<{
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  value: FieldValue | undefined;
  label: string;
  language: LangCode;
  submitting: boolean;
  labelStyle?: React.CSSProperties;
  helperNode?: React.ReactNode;
  errors: FormErrors;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  handleFileInputChange: (args: LineFileInputChangeArgs) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}> = ({
  group,
  rowId,
  field,
  fieldPath,
  value,
  label,
  language,
  submitting,
  labelStyle,
  helperNode,
  errors,
  renderWarnings,
  openFileOverlay,
  handleFileInputChange,
  fileInputsRef
}) => {
  const uploadConfig = field.uploadConfig || {};
  const count = toUploadItems(value).length;
  const buttonLabel = count
    ? tSystem('files.view', language, 'View photos')
    : tSystem('files.add', language, 'Add photo');

  return (
    <div className="field inline-field ck-full-width" data-field-path={fieldPath}>
      <label style={labelStyle}>
        {label}
        {field.required && <RequiredStar />}
      </label>
      <button
        type="button"
        style={buttonStyles.secondary}
        onClick={() => {
          if (submitting) return;
          openFileOverlay({
            open: true,
            scope: 'line',
            group,
            rowId,
            field,
            fieldPath
          });
        }}
      >
        {buttonLabel}
      </button>
      {helperNode}
      <input
        ref={el => {
          if (!el) return;
          fileInputsRef.current[fieldPath] = el;
        }}
        type="file"
        multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
        accept={(uploadConfig as any).accept || undefined}
        style={{ display: 'none' }}
        onChange={e => handleFileInputChange({ group, rowId, field, fieldPath, list: e.target.files })}
      />
      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
      {renderWarnings(fieldPath)}
    </div>
  );
};
