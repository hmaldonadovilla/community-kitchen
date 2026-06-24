import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../../types';
import type { FormErrors } from '../../../types';
import { resolveLabel } from '../../../utils/labels';
import {
  describeUploadItem,
  getUploadMinRequired,
  resolveFieldHelperText,
  toUploadItems
} from '../../../components/form/utils';
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
import { resolveUploadLinkCaptureConfig } from '../domain/linkCapture';

type TopFileUploadOrderedEntryCheckArgs = {
  scope: 'top';
  question: WebQuestionDefinition;
  fieldPath?: string;
  source?: string;
  validate?: boolean;
};

type TopFileOverlayOpenArgs = {
  scope: 'top';
  title: string;
  question: WebQuestionDefinition;
  fieldPath: string;
};

/**
 * Owner: upload feature renderer.
 * Keeps top-level FILE_UPLOAD presentation and interaction wiring out of the
 * main FormView renderer. Domain rules and persistence stay injected by props.
 */
export const TopFileUploadQuestion: React.FC<{
  q: WebQuestionDefinition;
  language: LangCode;
  value: FieldValue | undefined;
  submitting: boolean;
  renderAsLabel: boolean;
  forceStackedLabel: boolean;
  forceInlineLabel: boolean;
  labelLayoutClass: string;
  labelStyle?: React.CSSProperties;
  errors: FormErrors;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  isFieldLockedByDedup: (fieldId: string) => boolean;
  checkFileUploadOrderedEntry: (args: TopFileUploadOrderedEntryCheckArgs) => boolean;
  openFileOverlay: (args: TopFileOverlayOpenArgs) => void;
  handleFileInputChange: (question: WebQuestionDefinition, list: FileList | null) => void;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadAnnouncements: Record<string, string>;
  renderUploadFailure: (fieldPath: string, disabled: boolean) => React.ReactNode;
  renderReadOnly: (display: React.ReactNode, opts?: { stacked?: boolean; inline?: boolean }) => React.ReactNode;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  q,
  language,
  value,
  submitting,
  renderAsLabel,
  forceStackedLabel,
  forceInlineLabel,
  labelLayoutClass,
  labelStyle,
  errors,
  hasWarning,
  renderWarnings,
  isFieldLockedByDedup,
  checkFileUploadOrderedEntry,
  openFileOverlay,
  handleFileInputChange,
  fileInputsRef,
  uploadAnnouncements,
  renderUploadFailure,
  renderReadOnly,
  onDiagnostic
}) => {
  const items = toUploadItems(value);
  const uploadConfig = q.uploadConfig || {};
  const linkCaptureConfig = resolveUploadLinkCaptureConfig(uploadConfig);
  const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
  const helperText = helperCfg.belowLabelText;
  const readOnly = q.readOnly === true;
  const locked = isFieldLockedByDedup(q.id);
  const isEditableField = !submitting && !readOnly && !locked;
  const helperId = helperText && isEditableField ? `ck-field-helper-${q.id}` : undefined;
  const helperNode = helperText && isEditableField ? (
    <div id={helperId} className="ck-field-helper">
      {helperText}
    </div>
  ) : null;
  const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
  const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{
    size?: number;
    style?: React.CSSProperties;
    className?: string;
  }>;
  const minRequired = getUploadMinRequired({ uploadConfig, required: !!q.required });
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
  const allowedDisplay = (uploadConfig.allowedExtensions || []).map(ext =>
    ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
  );
  const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
    .map(v => (v !== undefined && v !== null ? v.toString().trim() : ''))
    .filter(Boolean);
  const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
  const hasFiles = items.length > 0;
  const viewMode = readOnly || locked || maxed || hasFiles;
  const LeftIcon = viewMode ? EyeIcon : SlotIcon;
  const leftLabel = viewMode
    ? tSystem('files.view', language, 'View photos')
    : tSystem('files.add', language, 'Add photo');
  const cameraStyleBase = buttonStyles.primary;
  const orderedUploadBlocked = checkFileUploadOrderedEntry({
    scope: 'top',
    question: q,
    fieldPath: q.id,
    source: 'render',
    validate: false
  });
  const uploadInteractionBlocked = submitting || orderedUploadBlocked;

  if (renderAsLabel) {
    const displayContent =
      items.length === 0
        ? null
        : items.map((item: any, idx: number) => (
            <div key={`${q.id}-file-${idx}`} className="ck-readonly-file">
              {describeUploadItem(item as any)}
            </div>
          ));
    const displayNode = displayContent ? <div className="ck-readonly-file-list">{displayContent}</div> : null;
    return renderReadOnly(displayNode, { stacked: forceStackedLabel, inline: forceInlineLabel });
  }

  return (
    <div
      className={`field inline-field${labelLayoutClass}`}
      data-field-path={q.id}
      data-has-error={errors[q.id] ? 'true' : undefined}
      data-has-warning={hasWarning(q.id) ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {resolveLabel(q, language)}
        {q.required && <RequiredStar />}
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
              onDiagnostic?.('upload.view.click', { scope: 'top', fieldPath: q.id, currentCount: items.length });
              openFileOverlay({
                scope: 'top',
                title: resolveLabel(q, language),
                question: q,
                fieldPath: q.id
              });
              return;
            }
            if (readOnly) return;
            if (
              checkFileUploadOrderedEntry({
                scope: 'top',
                question: q,
                fieldPath: q.id,
                source: 'add'
              })
            ) {
              return;
            }
            if (linkCaptureConfig) {
              onDiagnostic?.('upload.linkCapture.overlayOpen', { scope: 'top', fieldPath: q.id, currentCount: items.length });
              openFileOverlay({
                scope: 'top',
                title: resolveLabel(q, language),
                question: q,
                fieldPath: q.id
              });
              return;
            }
            onDiagnostic?.('upload.add.click', { scope: 'top', fieldPath: q.id, currentCount: items.length });
            fileInputsRef.current[q.id]?.click();
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
              scope: 'top',
              title: resolveLabel(q, language),
              question: q,
              fieldPath: q.id
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
      {helperNode}
      <div style={srOnly} aria-live="polite">
        {uploadAnnouncements[q.id] || ''}
      </div>
      {renderUploadFailure(q.id, submitting || readOnly || locked)}
      <input
        ref={el => {
          fileInputsRef.current[q.id] = el;
        }}
        type="file"
        multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
        accept={acceptAttr}
        disabled={submitting || locked || readOnly || orderedUploadBlocked}
        style={{ display: 'none' }}
        onChange={e => handleFileInputChange(q, e.target.files)}
      />
      {errors[q.id] && <div className="error">{errors[q.id]}</div>}
      {renderWarnings(q.id)}
    </div>
  );
};
