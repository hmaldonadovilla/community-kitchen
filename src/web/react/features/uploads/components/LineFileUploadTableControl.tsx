import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemFieldConfig, WebQuestionDefinition } from '../../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { getUploadMinRequired, resolveLineItemTableReadOnlyDisplay, toUploadItems } from '../../../components/form/utils';
import {
  buttonStyles,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  PaperclipIcon,
  srOnly,
  withDisabled
} from '../../../components/form/ui';
import type {
  LineFileUploadOrderedEntryCheckArgs,
  OpenFileOverlayArgs
} from '../../../components/form/lineItemGroupQuestionTypes';

type LineFileInputChangeArgs = {
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  list: FileList | null;
};

/**
 * Owner: upload feature renderer.
 * Encapsulates FILE_UPLOAD controls rendered inside line-item table cells; it
 * does not own row mutation or ordered-entry policy.
 */
export const LineFileUploadTableControl: React.FC<{
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  value: FieldValue | undefined;
  rowValues: Record<string, FieldValue>;
  language: LangCode;
  fieldInteractionBlocked: boolean;
  renderAsLabel: boolean;
  showWarningHighlight: boolean;
  hasFieldError: boolean;
  errorNode: React.ReactNode;
  checkFileUploadOrderedEntry: (args: LineFileUploadOrderedEntryCheckArgs) => boolean;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  handleFileInputChange: (args: LineFileInputChangeArgs) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  renderUploadFailure: (fieldPath: string, disabled: boolean) => React.ReactNode;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  group,
  rowId,
  field,
  fieldPath,
  value,
  rowValues,
  language,
  fieldInteractionBlocked,
  renderAsLabel,
  showWarningHighlight,
  hasFieldError,
  errorNode,
  checkFileUploadOrderedEntry,
  openFileOverlay,
  handleFileInputChange,
  fileInputsRef,
  uploadAnnouncements,
  renderUploadFailure,
  onDiagnostic
}) => {
  const items = toUploadItems(value);
  const count = items.length;
  const uploadConfig = field.uploadConfig || {};

  if (renderAsLabel) {
    return (
      <div
        className="ck-line-item-table__value"
        data-field-path={fieldPath}
        data-has-warning={showWarningHighlight ? 'true' : undefined}
        data-has-error={hasFieldError ? 'true' : undefined}
      >
        <span className="ck-line-item-table__value-text">
          {resolveLineItemTableReadOnlyDisplay({
            baseValue: count ? `${count}` : '',
            field,
            rowValues,
            language
          })}
        </span>
        {errorNode}
      </div>
    );
  }

  const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
  const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
    size?: number;
    style?: React.CSSProperties;
    className?: string;
  }>;
  const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
  const maxFiles = uploadConfig.maxFiles && uploadConfig.maxFiles > 0 ? uploadConfig.maxFiles : undefined;
  const denom = maxFiles ?? (minRequired > 0 ? minRequired : undefined);
  const displayCount = denom ? Math.min(items.length, denom) : items.length;
  const maxed = maxFiles ? items.length >= maxFiles : false;
  const isComplete = minRequired > 0 ? items.length >= minRequired : items.length > 0;
  const isEmpty = items.length === 0;
  const pillClass = isComplete ? 'ck-progress-good' : isEmpty ? 'ck-progress-neutral' : 'ck-progress-info';
  const pillText = denom ? `${displayCount}/${denom}` : `${items.length}`;
  const readOnly = field.readOnly === true;
  const hasFiles = items.length > 0;
  const viewMode = readOnly || maxed || hasFiles;
  const LeftIcon = viewMode ? EyeIcon : SlotIcon;
  const leftLabel = viewMode
    ? tSystem('files.view', language, 'View photos')
    : tSystem('files.add', language, 'Add photo');
  const orderedUploadBlocked = checkFileUploadOrderedEntry({
    group,
    rowId,
    field,
    fieldPath,
    source: 'render',
    validate: false
  });
  const uploadInteractionBlocked = fieldInteractionBlocked || orderedUploadBlocked;
  const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
    ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
  );
  const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
    .map((v: any) => (v !== undefined && v !== null ? v.toString().trim() : ''))
    .filter(Boolean);
  const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
  const label = resolveFieldLabel(field, language, field.id);

  return (
    <div
      className="ck-line-item-table__control"
      data-field-path={fieldPath}
      data-has-warning={showWarningHighlight ? 'true' : undefined}
      data-has-error={hasFieldError ? 'true' : undefined}
    >
      <div className="ck-upload-row ck-upload-row--table">
        <button
          type="button"
          className="ck-upload-camera-btn"
          disabled={uploadInteractionBlocked}
          style={withDisabled(buttonStyles.primary, uploadInteractionBlocked)}
          aria-label={leftLabel}
          title={leftLabel}
          onClick={() => {
            if (uploadInteractionBlocked) return;
            if (viewMode) {
              onDiagnostic?.('upload.view.click', { scope: 'line', fieldPath, currentCount: items.length });
              openFileOverlay({
                scope: 'line',
                title: label,
                group,
                rowId,
                field,
                fieldPath
              });
              return;
            }
            if (readOnly) return;
            if (checkFileUploadOrderedEntry({ group, rowId, field, fieldPath, source: 'add' })) return;
            onDiagnostic?.('upload.add.click', { scope: 'line', fieldPath, currentCount: items.length });
            fileInputsRef.current[fieldPath]?.click();
          }}
        >
          <LeftIcon style={{ width: '62%', height: '62%' }} />
        </button>
        <button
          type="button"
          className={`ck-progress-pill ck-upload-pill-btn ck-upload-pill-btn--table ${pillClass}`}
          disabled={uploadInteractionBlocked}
          style={withDisabled({}, uploadInteractionBlocked)}
          aria-disabled={uploadInteractionBlocked ? 'true' : undefined}
          aria-label={`${tSystem('files.open', language, tSystem('common.open', language, 'Open'))} ${tSystem(
            'files.title',
            language,
            'Photos'
          )} ${pillText}`}
          onClick={() => {
            if (uploadInteractionBlocked) return;
            onDiagnostic?.('upload.view.click', { scope: 'line', fieldPath, currentCount: items.length });
            openFileOverlay({
              scope: 'line',
              title: label,
              group,
              rowId,
              field,
              fieldPath
            });
          }}
        >
          {isComplete ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
          <span>{pillText}</span>
          <span className="ck-progress-label">{tSystem('files.open', language, tSystem('common.open', language, 'Open'))}</span>
          <span className="ck-progress-caret">▸</span>
        </button>
      </div>
      <div style={srOnly} aria-live="polite">
        {uploadAnnouncements[fieldPath] || ''}
      </div>
      {renderUploadFailure(fieldPath, uploadInteractionBlocked || readOnly)}
      <input
        ref={el => {
          if (!el) return;
          fileInputsRef.current[fieldPath] = el;
        }}
        type="file"
        multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
        accept={acceptAttr}
        disabled={uploadInteractionBlocked}
        style={{ display: 'none' }}
        onChange={e => handleFileInputChange({ group, rowId, field, fieldPath, list: e.target.files })}
      />
      {errorNode}
    </div>
  );
};
