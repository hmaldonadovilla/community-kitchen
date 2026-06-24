import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemFieldConfig, WebQuestionDefinition } from '../../../../types';
import type { FormErrors } from '../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { describeUploadItem, getUploadMinRequired, toUploadItems } from '../../../components/form/utils';
import { RequiredStar, srOnly, withDisabled } from '../../../components/form/ui';
import type {
  LineFileUploadOrderedEntryCheckArgs,
  OpenFileOverlayArgs
} from '../../../components/form/lineItemGroupQuestionTypes';
import { resolveUploadLinkCaptureConfig } from '../domain/linkCapture';

type LineFileInputChangeArgs = {
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  list: FileList | null;
};

/**
 * Owner: upload feature renderer.
 * Renders the list-style line FILE_UPLOAD field variant used inside expanded
 * line rows, while mutations and ordered-entry policy stay injected.
 */
export const LineFileUploadListQuestion: React.FC<{
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  value: FieldValue | undefined;
  language: LangCode;
  submitting: boolean;
  renderAsLabel: boolean;
  forceStackedLabel: boolean;
  labelStyle?: React.CSSProperties;
  errors: FormErrors;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  renderReadOnlyLine: (display: React.ReactNode) => React.ReactNode;
  checkFileUploadOrderedEntry: (args: LineFileUploadOrderedEntryCheckArgs) => boolean;
  openFileOverlay: (args: OpenFileOverlayArgs) => void;
  handleFileInputChange: (args: LineFileInputChangeArgs) => void;
  removeFile: (args: { group: WebQuestionDefinition; rowId: string; field: LineItemFieldConfig; fieldPath: string; index: number }) => void;
  clearFiles: (args: { group: WebQuestionDefinition; rowId: string; field: LineItemFieldConfig; fieldPath: string }) => void;
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
  language,
  submitting,
  renderAsLabel,
  forceStackedLabel,
  labelStyle,
  errors,
  hasWarning,
  renderWarnings,
  renderReadOnlyLine,
  checkFileUploadOrderedEntry,
  openFileOverlay,
  handleFileInputChange,
  removeFile,
  clearFiles,
  fileInputsRef,
  uploadAnnouncements,
  renderUploadFailure,
  onDiagnostic
}) => {
  const readOnly = field.readOnly === true;
  const uploadConfig = field.uploadConfig || {};
  const linkCaptureConfig = resolveUploadLinkCaptureConfig(uploadConfig);
  const items = toUploadItems(value);
  const label = resolveFieldLabel(field, language, field.id);

  if (renderAsLabel) {
    const displayContent = items.length
      ? items.map((item: any, idx: number) => (
          <div key={`${field.id}-file-${idx}`} className="ck-readonly-file">
            {describeUploadItem(item as any)}
          </div>
        ))
      : null;
    const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
    return renderReadOnlyLine(displayNode);
  }

  const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;
  const orderedUploadBlocked = checkFileUploadOrderedEntry({
    group,
    rowId,
    field,
    fieldPath,
    source: 'render',
    validate: false
  });
  const onAdd = () => {
    if (submitting || readOnly) return;
    if (checkFileUploadOrderedEntry({ group, rowId, field, fieldPath, source: 'add' })) return;
    if (maxed) return;
    if (linkCaptureConfig) {
      onDiagnostic?.('upload.linkCapture.overlayOpen', { scope: 'line', fieldPath, currentCount: items.length });
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
    fileInputsRef.current[fieldPath]?.click();
  };
  const onClearAll = () => {
    if (submitting || readOnly) return;
    if (checkFileUploadOrderedEntry({ group, rowId, field, fieldPath, source: 'clearAll' })) return;
    clearFiles({ group, rowId, field, fieldPath });
  };
  const onRemoveAt = (idx: number) => {
    if (submitting || readOnly) return;
    removeFile({ group, rowId, field, fieldPath, index: idx });
  };
  const acceptAttr = Array.isArray((uploadConfig as any)?.accept)
    ? (uploadConfig as any).accept.join(',')
    : (uploadConfig as any)?.accept || undefined;
  const minRequired = getUploadMinRequired({ uploadConfig, required: !!field.required });
  const helperText = minRequired
    ? tSystem(
        minRequired === 1 ? 'files.helper.min1' : 'files.helper.minMany',
        language,
        minRequired === 1 ? 'Required' : 'Required ({min})',
        { min: minRequired }
      )
    : uploadConfig?.maxFiles
      ? tSystem('files.helper.max', language, 'Max ({max})', { max: uploadConfig.maxFiles })
      : '';

  return (
    <div
      className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
      data-field-path={fieldPath}
      data-has-error={errors[fieldPath] ? 'true' : undefined}
      data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {label}
        {field.required && <RequiredStar />}
      </label>
      <div className="ck-upload-row">
        <div className="ck-upload-row__actions">
          <button
            type="button"
            className="ck-progress-pill ck-upload-pill-btn ck-list-row-action-btn"
            disabled={submitting || readOnly || orderedUploadBlocked}
            style={withDisabled({}, submitting || readOnly || orderedUploadBlocked)}
            aria-disabled={submitting || readOnly || orderedUploadBlocked ? 'true' : undefined}
            onClick={onAdd}
          >
            <span>{tSystem('files.add', language, 'Add')}</span>
            <span className="ck-progress-caret">▸</span>
          </button>
          {items.length ? (
            <button
              type="button"
              className="ck-progress-pill ck-upload-pill-btn ck-list-row-action-btn"
              disabled={submitting || readOnly || orderedUploadBlocked}
              style={withDisabled({}, submitting || readOnly || orderedUploadBlocked)}
              aria-disabled={submitting || readOnly || orderedUploadBlocked ? 'true' : undefined}
              onClick={onClearAll}
            >
              <span>{tSystem('files.clearAll', language, 'Clear all')}</span>
              <span className="ck-progress-caret">▸</span>
            </button>
          ) : null}
        </div>
        {!readOnly && helperText ? <div className="ck-upload-helper">{helperText}</div> : null}
        <div className="ck-upload-items">
          {items.map((item: any, idx: number) => (
            <div key={`${field.id}-file-${idx}`} className="ck-upload-item">
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.label || item.url}
              </a>
              {!readOnly ? (
                <button type="button" className="ck-upload-remove" onClick={() => onRemoveAt(idx)}>
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div style={srOnly} aria-live="polite">
          {uploadAnnouncements[fieldPath] || ''}
        </div>
        {renderUploadFailure(fieldPath, submitting || readOnly || orderedUploadBlocked)}
        <input
          ref={el => {
            fileInputsRef.current[fieldPath] = el;
          }}
          type="file"
          multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
          accept={acceptAttr}
          disabled={submitting || readOnly || orderedUploadBlocked}
          style={{ display: 'none' }}
          onChange={e => handleFileInputChange({ group, rowId, field, fieldPath, list: e.target.files })}
        />
        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
        {renderWarnings(fieldPath)}
      </div>
    </div>
  );
};
