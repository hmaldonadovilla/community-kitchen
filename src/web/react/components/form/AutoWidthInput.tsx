import React from 'react';

import { useAutoWidth } from './useAutoWidth';

export const AutoWidthInput: React.FC<{
  value: string;
  onChange: (nextValue: string) => void;
  onBlur?: (nextValue: string) => void;
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
  constrainToContainer?: boolean;
}> = ({
  value,
  onChange,
  onBlur,
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
  visible,
  constrainToContainer
}) => {
  const display = `${value || placeholder || ''}` || '0';
  const { width, rootRef, mirrorRef } = useAutoWidth(display, {
    min: minWidth,
    max: maxWidth,
    extra: extraWidth,
    visible
  });
  const widthStyle = constrainToContainer ? (`min(100%, ${width}px)` as const) : width;

  return (
    <span
      ref={rootRef as React.RefObject<HTMLSpanElement>}
      className={className ? `ck-auto-width-control ${className}` : 'ck-auto-width-control'}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        flex: constrainToContainer ? '0 1 auto' : '0 0 auto',
        minWidth: 0,
        maxWidth: constrainToContainer ? '100%' : 'none',
        width: widthStyle,
        inlineSize: widthStyle
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
          flex: constrainToContainer ? '1 1 auto' : '0 0 auto',
          minWidth: 0,
          maxWidth: constrainToContainer ? '100%' : 'none',
          width: widthStyle,
          inlineSize: widthStyle,
          overflow: constrainToContainer ? 'hidden' : undefined,
          textOverflow: constrainToContainer ? 'ellipsis' : undefined,
          whiteSpace: constrainToContainer ? 'nowrap' : undefined
        }}
        onFocus={e => {
          if (!selectAllOnFocus) return;
          globalThis.setTimeout(() => {
            try {
              e.currentTarget.select();
            } catch {}
          }, 0);
        }}
        onChange={e => {
          const raw = e.target.value;
          onChange(sanitize ? sanitize(raw) : raw);
        }}
        onBlur={e => {
          if (!onBlur) return;
          const raw = e.target.value;
          onBlur(sanitize ? sanitize(raw) : raw);
        }}
      />
    </span>
  );
};
