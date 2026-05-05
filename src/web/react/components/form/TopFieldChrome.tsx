import React from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode, WebQuestionDefinition } from '../../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { buttonStyles, RequiredStar, TrashIcon, withDisabled } from './ui';

type WarningRenderer = (fieldPath: string) => React.ReactNode;

type FieldChromeCommonProps = {
  q: WebQuestionDefinition;
  language: LangCode;
  labelStyle?: React.CSSProperties;
  errors: Record<string, string>;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: WarningRenderer;
};

/**
 * Owner: form renderer.
 * Provides reusable top-level field chrome for read-only fields and overlay-open
 * controls while FormView keeps ownership of data mutation and overlay actions.
 */
export const TopReadOnlyField = (props: FieldChromeCommonProps & {
  display: React.ReactNode;
  stacked?: boolean;
  inline?: boolean;
}) => {
  const { q, language, labelStyle, errors, hasWarning, renderWarnings, display, stacked, inline } = props;
  const cls = `${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
    stacked ? ' ck-label-stacked' : inline ? ' ck-label-inline' : ''
  } ck-readonly-field`;
  const label = resolveFieldLabel(q, language, q.id);
  return (
    <div
      key={q.id}
      className={cls}
      data-field-path={q.id}
      data-has-error={errors[q.id] ? 'true' : undefined}
      data-has-warning={hasWarning(q.id) ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {label}
        {q.required && <RequiredStar />}
      </label>
      <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
      {errors[q.id] && <div className="error">{errors[q.id]}</div>}
      {renderWarnings(q.id)}
    </div>
  );
};

export const TopOverlayOpenReplaceButton = (props: FieldChromeCommonProps & {
  labelLayoutClass: string;
  showResetButton: boolean;
  tone: 'primary' | 'secondary';
  displayValue?: string | null;
  disabled: boolean;
  resetDisabled: boolean;
  buttonText: (displayValue?: string | null) => string;
  onOpen: () => void;
  onReset: (event?: React.MouseEvent | React.KeyboardEvent) => void;
}) => {
  const {
    q,
    language,
    labelStyle,
    errors,
    hasWarning,
    renderWarnings,
    labelLayoutClass,
    showResetButton,
    tone,
    displayValue,
    disabled,
    resetDisabled,
    buttonText,
    onOpen,
    onReset
  } = props;
  const baseStyle = tone === 'secondary' ? buttonStyles.secondary : buttonStyles.primary;
  const actionButtonStyle = showResetButton
    ? { ...baseStyle, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: '0' }
    : baseStyle;
  return (
    <div
      key={q.id}
      className={`field inline-field ck-full-width${labelLayoutClass}`}
      data-field-path={q.id}
      data-has-error={errors[q.id] ? 'true' : undefined}
      data-has-warning={hasWarning(q.id) ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {resolveLabel(q, language)}
        {q.required && <RequiredStar />}
      </label>
      <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          style={withDisabled(actionButtonStyle, disabled)}
        >
          {buttonText(displayValue)}
        </button>
        {showResetButton ? (
          <button
            type="button"
            onClick={onReset}
            disabled={resetDisabled}
            aria-label={tSystem('lineItems.remove', language, 'Remove')}
            style={withDisabled(
              {
                ...baseStyle,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0 14px',
                minWidth: 44
              },
              resetDisabled
            )}
          >
            <TrashIcon size={40} />
          </button>
        ) : null}
      </div>
      {errors[q.id] && <div className="error">{errors[q.id]}</div>}
      {renderWarnings(q.id)}
    </div>
  );
};

export const TopOverlayOpenInlineButton = (props: {
  tone: 'primary' | 'secondary';
  displayValue?: string | null;
  disabled: boolean;
  buttonText: (displayValue?: string | null) => string;
  onOpen: () => void;
}) => {
  const { tone, displayValue, disabled, buttonText, onOpen } = props;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        style={withDisabled(tone === 'primary' ? buttonStyles.primary : buttonStyles.secondary, disabled)}
      >
        {buttonText(displayValue)}
      </button>
    </div>
  );
};
