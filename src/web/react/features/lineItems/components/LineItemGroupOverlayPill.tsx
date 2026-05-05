import React from 'react';

import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../../types';
import { resolveFieldHelperText } from '../../../components/form/utils';
import { CheckIcon, RequiredStar, srOnly } from '../../../components/form/ui';
import { isLineItemGroupQuestionComplete } from '../../../components/form/completeness';
import type { FormErrors, LineItemState } from '../../../types';
import { resolveLabel } from '../../../utils/labels';

export const LineItemGroupOverlayPill: React.FC<{
  q: WebQuestionDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  errors: FormErrors;
  locked: boolean;
  labelLayoutClass: string;
  labelStyle?: React.CSSProperties;
  suppressOverlayPill: boolean;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  openLineItemGroupOverlay: (groupId: string) => void;
}> = ({
  q,
  language,
  values,
  lineItems,
  collapsedRows,
  errors,
  locked,
  labelLayoutClass,
  labelStyle,
  suppressOverlayPill,
  hasWarning,
  renderWarnings,
  getTopValue,
  openLineItemGroupOverlay
}) => {
  const groupCount = (lineItems[q.id] || []).length;
  const hideGroupLabel = q.ui?.hideLabel === true;
  const tapToOpenLabel = tSystem('common.tapToOpen', language, 'Tap to open');
  const needsAttentionMessage = resolveLocalizedString(
    q.lineItemConfig?.ui?.needsAttentionMessage,
    language,
    ''
  )
    .toString()
    .trim();
  const groupHasAnyError = (() => {
    if (errors[q.id]) return true;
    const prefix = `${q.id}__`;
    const subPrefix = `${q.id}::`;
    return Object.keys(errors || {}).some(k => k === q.id || k.startsWith(prefix) || k.startsWith(subPrefix));
  })();
  const groupIsComplete = isLineItemGroupQuestionComplete({
    groupId: q.id,
    lineItemConfig: q.lineItemConfig,
    values,
    lineItems,
    collapsedRows,
    language,
    getTopValue
  });
  const groupLabel = resolveLabel(q, language);
  const helperCfg = resolveFieldHelperText({ ui: q.ui, language });
  const helperText = helperCfg.belowLabelText;
  const isEditableField = !locked && q.readOnly !== true && q.ui?.renderAsLabel !== true;
  const helperNode = helperText && isEditableField ? <div className="ck-field-helper">{helperText}</div> : null;
  const pillText = groupLabel;
  const pillAriaLabel = pillText ? `${tapToOpenLabel} ${pillText}` : tapToOpenLabel;
  const pillClass = groupHasAnyError
    ? 'ck-progress-bad'
    : groupIsComplete
      ? 'ck-progress-good'
      : groupCount > 0
        ? 'ck-progress-info'
        : 'ck-progress-neutral';

  return (
    <div
      className={`field inline-field ck-full-width${labelLayoutClass}`}
      data-field-path={q.id}
      data-has-error={groupHasAnyError ? 'true' : undefined}
      data-has-warning={hasWarning(q.id) ? 'true' : undefined}
    >
      <label style={hideGroupLabel ? srOnly : labelStyle}>
        {groupLabel}
        {q.required && <RequiredStar />}
      </label>
      {!suppressOverlayPill ? (
        <button
          type="button"
          className={`ck-progress-pill ck-upload-pill-btn ck-open-overlay-pill ${pillClass}`}
          aria-disabled={locked ? 'true' : undefined}
          aria-label={pillAriaLabel}
          onClick={() => {
            if (locked) return;
            openLineItemGroupOverlay(q.id);
          }}
        >
          {pillClass === 'ck-progress-good' ? <CheckIcon style={{ width: '1.05em', height: '1.05em' }} /> : null}
          {pillText ? <span>{pillText}</span> : null}
          <span className="ck-progress-label">{tapToOpenLabel}</span>
          <span className="ck-progress-caret">▸</span>
        </button>
      ) : null}
      {helperNode}
      {renderWarnings(q.id)}
      {errors[q.id] ? (
        <div className="error">{errors[q.id]}</div>
      ) : groupHasAnyError ? (
        <div className="error">
          {needsAttentionMessage || tSystem('validation.needsAttention', language, 'Needs attention')}
        </div>
      ) : null}
    </div>
  );
};
