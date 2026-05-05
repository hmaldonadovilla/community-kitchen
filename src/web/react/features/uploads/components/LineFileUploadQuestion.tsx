import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemFieldConfig, WebQuestionDefinition } from '../../../../types';
import type { FormErrors } from '../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { getUploadMinRequired, toUploadItems } from '../../../components/form/utils';
import {
  buttonStyles,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  PaperclipIcon,
  RequiredStar,
  srOnly,
  withDisabled
} from '../../../components/form/ui';

type LineFileUploadOrderedEntryCheckArgs = {
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  source?: string;
  validate?: boolean;
};

type LineFileOverlayOpenArgs = {
  scope: 'line';
  title: string;
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
};

type LineFileInputChangeArgs = {
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  list: FileList | null;
};

/**
 * Owner: upload feature renderer.
 * Renders line/subgroup FILE_UPLOAD fields while keeping row mutation,
 * ordered-entry gating, and persistence injected by FormView.
 */
export const LineFileUploadQuestion: React.FC<{
  group: WebQuestionDefinition;
  rowId: string;
  field: LineItemFieldConfig;
  fieldPath: string;
  value: FieldValue | undefined;
  language: LangCode;
  submitting: boolean;
  forceStackedLabel: boolean;
  labelStyle?: React.CSSProperties;
  errors: FormErrors;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  checkFileUploadOrderedEntry: (args: LineFileUploadOrderedEntryCheckArgs) => boolean;
  openFileOverlay: (args: LineFileOverlayOpenArgs) => void;
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
  language,
  submitting,
  forceStackedLabel,
  labelStyle,
  errors,
  hasWarning,
  renderWarnings,
  checkFileUploadOrderedEntry,
  openFileOverlay,
  handleFileInputChange,
  fileInputsRef,
  uploadAnnouncements,
  renderUploadFailure,
  onDiagnostic
}) => {
  const items = toUploadItems(value as any);
  const uploadConfig = field.uploadConfig || {};
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
  const missing = minRequired > 0 ? Math.max(0, minRequired - items.length) : 0;
  const pillClass = isComplete ? 'ck-progress-good' : isEmpty ? 'ck-progress-neutral' : 'ck-progress-info';
  const pillText = denom ? `${displayCount}/${denom}` : `${items.length}`;
  const showMissingHelper = items.length > 0 && missing > 0 && !maxed;
  const readOnly = field.readOnly === true;
  const hasFiles = items.length > 0;
  const viewMode = readOnly || maxed || hasFiles;
  const LeftIcon = viewMode ? EyeIcon : SlotIcon;
  const leftLabel = viewMode
    ? tSystem('files.view', language, 'View photos')
    : tSystem('files.add', language, 'Add photo');
  const cameraStyleBase = viewMode ? buttonStyles.secondary : isEmpty ? buttonStyles.primary : buttonStyles.secondary;
  const orderedUploadBlocked = checkFileUploadOrderedEntry({
    group,
    rowId,
    field,
    fieldPath,
    source: 'render',
    validate: false
  });
  const uploadInteractionBlocked = submitting || orderedUploadBlocked;
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
      className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
      data-field-path={fieldPath}
      data-has-error={errors[fieldPath] ? 'true' : undefined}
      data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {label}
        {field.required && <RequiredStar />}
      </label>
      <div className="ck-upload-row">
        <button
          type="button"
          className="ck-upload-camera-btn"
          disabled={uploadInteractionBlocked}
          style={withDisabled(cameraStyleBase, uploadInteractionBlocked)}
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
            if (
              checkFileUploadOrderedEntry({
                group,
                rowId,
                field,
                fieldPath,
                source: 'add'
              })
            ) {
              return;
            }
            onDiagnostic?.('upload.add.click', { scope: 'line', fieldPath, currentCount: items.length });
            fileInputsRef.current[fieldPath]?.click();
          }}
        >
          <LeftIcon style={{ width: '62%', height: '62%' }} />
        </button>
        <button
          type="button"
          className={`ck-progress-pill ck-upload-pill-btn ${pillClass}`}
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
        {maxed ? (
          <div className="ck-upload-helper muted">{tSystem('files.maxReached', language, 'Required photos added.')}</div>
        ) : showMissingHelper ? (
          <div className="ck-upload-helper muted" aria-live="polite">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <SlotIcon style={{ width: '1.05em', height: '1.05em' }} />
              {tSystem('common.more', language, '+{count} more', { count: missing })}
            </span>
          </div>
        ) : null}
      </div>
      <div style={srOnly} aria-live="polite">
        {uploadAnnouncements[fieldPath] || ''}
      </div>
      {renderUploadFailure(fieldPath, uploadInteractionBlocked || readOnly)}
      <input
        ref={el => {
          fileInputsRef.current[fieldPath] = el;
        }}
        type="file"
        multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
        accept={acceptAttr}
        disabled={uploadInteractionBlocked || readOnly}
        style={{ display: 'none' }}
        onChange={e =>
          handleFileInputChange({
            group,
            rowId,
            field,
            fieldPath,
            list: e.target.files
          })
        }
      />
      {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
      {renderWarnings(fieldPath)}
    </div>
  );
};
