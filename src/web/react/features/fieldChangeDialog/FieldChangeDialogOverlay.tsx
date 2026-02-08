import React from 'react';
import { FieldValue } from '../../../types';
import { FieldChangeDialogInputState } from './useFieldChangeDialog';

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  minHeight: 'var(--control-height)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--ck-font-control)',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  boxSizing: 'border-box'
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--ck-font-label)',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: 6,
  lineHeight: 1.2
};

const helperStyle: React.CSSProperties = {
  fontSize: 'var(--ck-font-helper)',
  fontWeight: 400,
  marginTop: 4,
  color: 'var(--text)',
  opacity: 'var(--ck-helper-opacity)',
  lineHeight: 1.35
};

const normalizeArrayValue = (value: FieldValue): string[] => {
  if (Array.isArray(value)) return value.map(v => (v === undefined || v === null ? '' : v.toString()));
  if (value === undefined || value === null) return [];
  const text = value.toString();
  return text ? [text] : [];
};

const renderInput = (args: {
  input: FieldChangeDialogInputState;
  value: FieldValue;
  disabled?: boolean;
  onChange: (id: string, value: FieldValue) => void;
}) => {
  const { input, value, disabled = false, onChange } = args;
  const id = input.id;
  const type = input.type;
  if (type === 'paragraph') {
    return (
      <textarea
        id={id}
        value={(value ?? '').toString()}
        placeholder={input.placeholder}
        onChange={e => onChange(id, e.target.value)}
        disabled={disabled}
        style={{ ...inputBaseStyle, minHeight: 110, resize: 'vertical' }}
      />
    );
  }
  if (type === 'choice') {
    const options = input.options || [];
    return (
      <select
        id={id}
        value={(value ?? '').toString()}
        onChange={e => onChange(id, e.target.value)}
        disabled={disabled}
        style={inputBaseStyle}
      >
        <option value="">{''}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'checkbox') {
    const options = input.options || [];
    if (!options.length) {
      const checked = Boolean(value);
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={e => onChange(id, e.target.checked)}
            disabled={disabled}
          />
          <span>{input.placeholder || ''}</span>
        </label>
      );
    }
    const selected = new Set(normalizeArrayValue(value));
    return (
      <select
        id={id}
        multiple
        value={Array.from(selected)}
        onChange={e => {
          const values = Array.from(e.target.selectedOptions).map(opt => opt.value);
          onChange(id, values);
        }}
        disabled={disabled}
        style={{ ...inputBaseStyle, minHeight: 110 }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'number') {
    return (
      <input
        id={id}
        type="number"
        value={value === undefined || value === null ? '' : (value as any)}
        placeholder={input.placeholder}
        onChange={e => onChange(id, e.target.value)}
        disabled={disabled}
        style={inputBaseStyle}
      />
    );
  }
  if (type === 'date') {
    return (
      <input
        id={id}
        type="date"
        value={(value ?? '').toString()}
        placeholder={input.placeholder}
        onChange={e => onChange(id, e.target.value)}
        disabled={disabled}
        style={inputBaseStyle}
      />
    );
  }
  return (
    <input
      id={id}
      type="text"
      value={(value ?? '').toString()}
      placeholder={input.placeholder}
      onChange={e => onChange(id, e.target.value)}
      disabled={disabled}
      style={inputBaseStyle}
    />
  );
};

export const FieldChangeDialogOverlay: React.FC<{
  open: boolean;
  busy?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  primaryAction?: 'confirm' | 'cancel';
  inputs: FieldChangeDialogInputState[];
  values: Record<string, FieldValue>;
  onValueChange: (id: string, value: FieldValue) => void;
  onCancel: () => void;
  onConfirm: () => void;
  zIndex?: number;
}> = ({
  open,
  busy = false,
  title,
  message,
  confirmLabel,
  cancelLabel,
  primaryAction: primaryActionProp,
  inputs,
  values,
  onValueChange,
  onCancel,
  onConfirm,
  zIndex = 12025
}) => {
  if (!open) return null;
  const primaryAction = primaryActionProp === 'cancel' ? 'cancel' : 'confirm';
  const actionButtonTextStyle: React.CSSProperties = {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textOverflow: 'clip',
    textAlign: 'center',
    maxWidth: '100%',
    minWidth: 0,
    flex: '1 1 220px'
  };

  const primaryButtonStyle: React.CSSProperties = {
    padding: '16px 22px',
    minHeight: 'var(--control-height)',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    color: 'var(--accentText)',
    fontWeight: 500,
    fontSize: 'var(--ck-font-control)',
    lineHeight: 1.1,
    minWidth: 140,
    ...actionButtonTextStyle
  };

  const secondaryButtonStyle: React.CSSProperties = {
    padding: '16px 22px',
    minHeight: 'var(--control-height)',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text)',
    fontWeight: 500,
    fontSize: 'var(--ck-font-control)',
    lineHeight: 1.1,
    minWidth: 140,
    ...actionButtonTextStyle
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box'
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        title="Close"
        onClick={busy ? undefined : onCancel}
        disabled={busy}
        aria-disabled={busy}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          cursor: busy ? 'default' : 'pointer'
        }}
      />
      <dialog
        open
        aria-label={title}
        aria-modal="true"
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(92vh, 980px)',
          margin: 0,
          background: 'var(--card)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          padding: 22,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          fontFamily: 'var(--ck-font-family)',
          fontSize: 'var(--ck-font-base)',
          color: 'var(--text)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 'var(--ck-font-group-title)', fontWeight: 600, lineHeight: 1.15 }}>{title}</div>
          {message ? <div style={{ fontSize: 'var(--ck-font-control)', lineHeight: 1.4 }}>{message}</div> : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            overflowY: 'auto',
            paddingRight: 4
          }}
        >
          {inputs.map(input => (
            <div key={input.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor={input.id} style={labelStyle}>
                {input.label}
              </label>
              {renderInput({ input, value: values[input.id], disabled: busy, onChange: onValueChange })}
              {input.required ? <div style={helperStyle}>Required</div> : null}
            </div>
          ))}
        </div>

        <div className="ck-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="ck-dialog-action-button"
            style={{
              ...(primaryAction === 'cancel' ? primaryButtonStyle : secondaryButtonStyle),
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1
            }}
            autoFocus={primaryAction === 'cancel'}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="ck-dialog-action-button"
            style={{
              ...(primaryAction === 'confirm' ? primaryButtonStyle : secondaryButtonStyle),
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1
            }}
            autoFocus={primaryAction === 'confirm'}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </div>
  );
};
