import React from 'react';

import { useAutoWidth } from './useAutoWidth';

export const AutoWidthInput: React.FC<{
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  minWidth?: number;
  maxWidth?: number;
  extraWidth?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  pattern?: string;
  sanitize?: (raw: string) => string;
  selectAllOnFocus?: boolean;
  visible?: boolean;
}> = ({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
  ariaLabel,
  className,
  style,
  inputStyle,
  minWidth,
  maxWidth,
  extraWidth,
  inputMode,
  pattern,
  sanitize,
  selectAllOnFocus,
  visible
}) => {
  const display = `${value || placeholder || ''}` || '0';
  const { width, rootRef, mirrorRef } = useAutoWidth(display, {
    min: minWidth,
    max: maxWidth,
    extra: extraWidth,
    visible
  });

  return (
    <span
      ref={rootRef as React.RefObject<HTMLSpanElement>}
      className={className ? `ck-auto-width-control ${className}` : 'ck-auto-width-control'}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        flex: '0 0 auto',
        minWidth: 0,
        width,
        inlineSize: width
      }}
    >
      <span ref={mirrorRef} className="ck-auto-width-measure">
        {display}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode={inputMode}
        pattern={pattern}
        className="ck-auto-width-input"
        style={{
          ...inputStyle,
          boxSizing: 'border-box',
          flex: '0 0 auto',
          minWidth: 0,
          maxWidth: 'none',
          width,
          inlineSize: width
        }}
        onFocus={e => {
          if (!selectAllOnFocus) return;
          globalThis.setTimeout(() => {
            try {
              e.currentTarget.select();
            } catch (_) {}
          }, 0);
        }}
        onChange={e => {
          const raw = e.target.value;
          onChange(sanitize ? sanitize(raw) : raw);
        }}
      />
    </span>
  );
};
